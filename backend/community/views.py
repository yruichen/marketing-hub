import json

from django.conf import settings
from django.db.models import Q
from django.utils import timezone
from rest_framework import status
from rest_framework.permissions import IsAuthenticated, IsAuthenticatedOrReadOnly
from rest_framework.response import Response
from rest_framework.views import APIView

from api.audit import record_audit_log
from api.legal import require_current_policy_consent
from api.models import Asset, CommunityCreation, ContentReport, GenerationTask
from api.scope import get_scope
from api.access import require_role
from api.serializers import CommunityCreationSerializer, ContentReportSerializer


def visible_community_creations(request):
    query = CommunityCreation.objects.select_related('organization', 'project', 'campaign').filter(moderation_status='visible')
    user = getattr(request, 'user', None)
    if not user or not getattr(user, 'is_authenticated', False):
        return query.filter(visibility='public')
    return query.filter(
        Q(visibility='public')
        | Q(organization__memberships__user=user, visibility__in=['organization', 'private'])
    ).distinct()


class CommunityCreationView(APIView):
    permission_classes = [IsAuthenticatedOrReadOnly]

    def get(self, request):
        creation_type = request.query_params.get('creation_type')
        organization_slug = request.query_params.get('organization')
        project_slug = request.query_params.get('project')
        query = visible_community_creations(request)

        if creation_type:
            query = query.filter(creation_type=creation_type)
        if organization_slug:
            query = query.filter(organization__slug=organization_slug)
        if project_slug:
            query = query.filter(project__slug=project_slug)

        try:
            page_size = min(100, max(1, int(request.query_params.get('page_size', '30'))))
        except (TypeError, ValueError):
            page_size = 30

        return Response(CommunityCreationSerializer(query.order_by('-created_at')[:page_size], many=True).data)

    def post(self, request):
        user, org, project, campaign = get_scope(request)
        require_role(user, org, 'creator')
        creation_type = request.data.get('creation_type')
        title = request.data.get('title')
        content_dict = request.data.get('content', {})
        image_url = request.data.get('image_url', '')
        audio_url = request.data.get('audio_url', '')
        tags = request.data.get('tags', [])

        if not creation_type or not title or not content_dict:
            return Response({'error': 'Missing required fields'}, status=status.HTTP_400_BAD_REQUEST)
        policy_block = require_current_policy_consent(user)
        if policy_block:
            return policy_block
        visibility = request.data.get('visibility', 'private')
        if visibility not in dict(CommunityCreation.VISIBILITY_CHOICES):
            visibility = 'private'
        if visibility == 'public' and not request.data.get('responsibility_confirmed'):
            return Response({'error': 'Public publishing requires responsibility_confirmed=true.'}, status=status.HTTP_400_BAD_REQUEST)

        metadata = request.data.get('metadata') or {}
        if not isinstance(metadata, dict):
            metadata = {}
        source_asset = None
        source_task = None
        source_asset_id = request.data.get('source_asset_id') or metadata.get('source_asset_id')
        source_task_id = request.data.get('source_task_id') or metadata.get('generation_task_id') or metadata.get('source_task_id')
        if source_asset_id:
            source_asset = Asset.objects.filter(pk=source_asset_id, organization=org).first()
        if source_task_id:
            source_task = GenerationTask.objects.filter(pk=source_task_id, organization=org).first()
        ai_generated = bool(request.data.get('ai_generated') or metadata.get('ai_generated') or source_task_id)
        metadata.setdefault('ai_generated', ai_generated)
        if source_task:
            metadata.setdefault('source_task_id', source_task.id)
            metadata.setdefault('provider', source_task.result.get('data', {}).get('provider') if isinstance(source_task.result, dict) else '')

        item = CommunityCreation.objects.create(
            organization=org,
            project=project,
            campaign=campaign,
            username=user.username,
            creation_type=creation_type,
            title=title,
            content=json.dumps(content_dict, ensure_ascii=False),
            image_url=image_url,
            audio_url=audio_url,
            tags=tags if isinstance(tags, list) else [],
            rag_indexed=False,
            visibility=visibility,
            published_at=timezone.now() if visibility == 'public' else None,
            published_by=user if visibility == 'public' else None,
            metadata=metadata,
            ai_generated=ai_generated,
            source_asset=source_asset,
            source_task=source_task,
            review_status='pending' if visibility == 'public' and ai_generated else 'not_reviewed',
        )
        record_audit_log(
            action='community_publish',
            actor=user,
            organization=org,
            target_type='community_creation',
            target_id=str(item.id),
            metadata={
                'visibility': visibility,
                'ai_generated': ai_generated,
                'responsibility_confirmed': bool(request.data.get('responsibility_confirmed')),
            },
        )

        return Response({'message': 'Creation shared to the community workspace!', 'id': item.id}, status=status.HTTP_201_CREATED)


class LikeCreationView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request, pk):
        item = visible_community_creations(request).filter(pk=pk).first()
        if not item:
            return Response({'error': 'Creation not found'}, status=status.HTTP_404_NOT_FOUND)
        item.likes += 1
        item.save(update_fields=['likes'])
        return Response({'likes': item.likes})


class RAGSearchView(APIView):
    def get(self, request):
        query = request.query_params.get('q', '').strip()[:512]
        if not query:
            return Response({'results': [], 'rag_logs': ['请输入品牌关键词后再检索。']})

        creations = visible_community_creations(request).exclude(visibility='private').select_related('organization', 'project')[:100]
        results = []
        for item in creations:
            haystack = f"{item.title} {item.content} {' '.join(item.tags)}"
            matches = sum(1 for term in query.split() if term.lower() in haystack.lower())
            if matches:
                results.append({
                    'id': item.id,
                    'username': item.username,
                    'creation_type': item.creation_type,
                    'creation_type_display': item.get_creation_type_display(),
                    'title': item.title,
                    'content': item.get_content_dict(),
                    'image_url': item.image_url,
                    'audio_url': item.audio_url,
                    'created_at': item.created_at.strftime('%Y-%m-%d %H:%M'),
                    'likes': item.likes,
                    'similarity_score': round(min(0.99, 0.45 + matches * 0.12), 3),
                    'organization': item.organization.slug if item.organization else None,
                    'project': item.project.slug if item.project else None,
                })

        results.sort(key=lambda entry: entry['similarity_score'], reverse=True)
        return Response({
            'query': query,
            'results': results,
            'rag_logs': [
                f'已在 {len(creations)} 条社区素材中完成灵感对齐。',
                '当前使用本地关键词相似度作为检索策略。',
            ],
        })


class CommunityReportView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request, pk: int):
        item = visible_community_creations(request).filter(pk=pk).first()
        if not item:
            return Response({'error': 'Creation not found'}, status=status.HTTP_404_NOT_FOUND)

        reason = str(request.data.get('reason') or 'other').strip()
        if reason not in dict(ContentReport.REASON_CHOICES):
            reason = 'other'
        description = str(request.data.get('description') or '').strip()[:4000]
        report = ContentReport.objects.create(
            organization=item.organization,
            target_type='community_creation',
            target_id=str(item.id),
            reporter=request.user,
            reason=reason,
            description=description,
        )
        item.reported_count += 1
        item.save(update_fields=['reported_count'])
        record_audit_log(
            action='content_report',
            actor=request.user,
            organization=item.organization,
            target_type='community_creation',
            target_id=str(item.id),
            metadata={'report_id': report.id, 'reason': reason},
        )
        return Response(ContentReportSerializer(report).data, status=status.HTTP_201_CREATED)


class CommunityModerationView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request, pk: int):
        user, org, _, _ = get_scope(request)
        require_role(user, org, 'ops')
        item = CommunityCreation.objects.filter(pk=pk, organization=org).first()
        if not item:
            return Response({'error': 'Creation not found'}, status=status.HTTP_404_NOT_FOUND)

        moderation_status = str(request.data.get('moderation_status') or item.moderation_status).strip()
        if moderation_status not in dict(CommunityCreation.MODERATION_STATUS_CHOICES):
            return Response({'error': 'Unsupported moderation_status'}, status=status.HTTP_400_BAD_REQUEST)
        review_status = str(request.data.get('review_status') or item.review_status).strip()
        if review_status not in dict(CommunityCreation.REVIEW_STATUS_CHOICES):
            return Response({'error': 'Unsupported review_status'}, status=status.HTTP_400_BAD_REQUEST)
        reason = str(request.data.get('reason') or '').strip()

        item.moderation_status = moderation_status
        item.review_status = review_status
        item.takedown_reason = reason
        item.takedown_at = timezone.now() if moderation_status in {'hidden', 'removed'} else None
        item.save(update_fields=['moderation_status', 'review_status', 'takedown_reason', 'takedown_at'])

        report_id = request.data.get('report_id')
        if report_id:
            report = ContentReport.objects.filter(pk=report_id, organization=org).first()
            if report:
                report.status = 'resolved' if moderation_status in {'hidden', 'removed'} else 'rejected'
                report.handled_by = user
                report.handled_at = timezone.now()
                report.resolution_note = reason
                report.save(update_fields=['status', 'handled_by', 'handled_at', 'resolution_note'])

        record_audit_log(
            action='content_moderation',
            actor=user,
            organization=org,
            target_type='community_creation',
            target_id=str(item.id),
            metadata={'moderation_status': moderation_status, 'review_status': review_status, 'reason': reason, 'report_id': report_id},
        )
        return Response(CommunityCreationSerializer(item).data)
