import json

from django.conf import settings
from django.db.models import Q
from django.utils import timezone
from rest_framework import status
from rest_framework.permissions import IsAuthenticated, IsAuthenticatedOrReadOnly
from rest_framework.response import Response
from rest_framework.views import APIView

from api.models import CommunityCreation
from api.scope import get_scope
from api.access import require_role
from api.serializers import CommunityCreationSerializer


def visible_community_creations(request):
    query = CommunityCreation.objects.select_related('organization', 'project', 'campaign')
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
        visibility = request.data.get('visibility', 'private')
        if visibility not in dict(CommunityCreation.VISIBILITY_CHOICES):
            visibility = 'private'

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

        creations = visible_community_creations(request).select_related('organization', 'project')[:100]
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
