from rest_framework import status
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.throttling import UserRateThrottle
from rest_framework.views import APIView

from api.idempotency import claim_idempotency_key, finish_idempotency_key
from api.image_style_skills import DEFAULT_IMAGE_STYLE_SKILL_ID, resolve_style_skill
from api.models import GenerationTask, WorkflowRun
from api.permissions import organization_for_user
from api.access import get_task_for_member, require_role
from api.throttles import GenerationBurstThrottle, OrgRateThrottle
from api.scope import as_bool, get_scope
from ai_gateway.content_package import generate_content_package
from api.services import (
    brainstorm_workflow,
    create_workflow_run,
    create_generation_task,
    membership_role,
    run_workflow_run_by_id,
    schedule_generation_task,
    retry_workspace_node,
    run_generation_task,
    run_workspace_workflow,
    serialize_task,
    serialize_workflow_run,
    serialize_workspace_draft,
)


class GenerationRateThrottle(UserRateThrottle):
    scope = 'generation'


def _image_generation_payload(data) -> dict:
    style_skill = str(data.get('style_skill') or DEFAULT_IMAGE_STYLE_SKILL_ID).strip()
    legacy_style = data.get('style')
    return {
        'prompt': data.get('prompt', 'A creative workspace'),
        'style_skill': style_skill,
        'style': resolve_style_skill(style_skill, legacy_style),
        'aspect_ratio': data.get('aspect_ratio', '1:1'),
        'negative_prompt': data.get('negative_prompt', ''),
        'platform': data.get('platform', ''),
    }


def idempotency_response(request, org):
    try:
        result = claim_idempotency_key(request=request, organization=org, user=getattr(request, 'user', None))
    except ValueError as exc:
        return Response({'error': str(exc)}, status=status.HTTP_409_CONFLICT), None
    if result.replayed and result.record:
        return Response(result.record.response_body, status=result.record.response_status), result.record
    return None, result.record


def finalize_idempotency(record, response, resource_type='', resource_id=''):
    finish_idempotency_key(
        record,
        response_status=response.status_code,
        response_body=response.data if isinstance(response.data, dict) else {'data': response.data},
        resource_type=resource_type,
        resource_id=str(resource_id) if resource_id else '',
    )
    return response


class ContentPackageView(APIView):
    permission_classes = [IsAuthenticated]
    throttle_classes = [GenerationBurstThrottle, GenerationRateThrottle, OrgRateThrottle]

    def post(self, request):
        user, org, project, campaign = get_scope(request)
        require_role(user, org, 'creator')
        replay, idempotency = idempotency_response(request, org)
        if replay:
            return replay

        role = membership_role(user, org)
        package, logs, _, _ = generate_content_package(
            organization=org,
            role=role,
            payload=dict(request.data),
        )
        response = Response({'content_package': package, 'logs': logs}, status=status.HTTP_200_OK)
        return finalize_idempotency(idempotency, response, 'content_package', package.get('title', ''))


class MarketingCopyView(APIView):
    permission_classes = [IsAuthenticated]
    throttle_classes = [GenerationBurstThrottle, GenerationRateThrottle, OrgRateThrottle]

    def post(self, request):
        user, org, project, campaign = get_scope(request)
        require_role(user, org, 'creator')
        replay, idempotency = idempotency_response(request, org)
        if replay:
            return replay
        request_username = user.username
        if as_bool(request.data.get('async', False), default=False):
            task = create_generation_task(
                task_type='copy',
                payload={
                    'brand_name': request.data.get('brand_name', 'Marketing-Hub'),
                    'product_description': request.data.get('product_description', 'AI 营销场景全能助手'),
                    'tone': request.data.get('tone', '爆款活泼'),
                    'platform': request.data.get('platform', 'Xiaohongshu'),
                },
                username=request_username,
                organization=org,
                project=project,
                campaign=campaign,
                run_now=False,
            )
            schedule_generation_task(task)
            return finalize_idempotency(
                idempotency,
                Response({'task': serialize_task(task)}, status=status.HTTP_202_ACCEPTED),
                'generation_task',
                task.id,
            )
        task = create_generation_task(
            task_type='copy',
            payload={
                'brand_name': request.data.get('brand_name', 'Marketing-Hub'),
                'product_description': request.data.get('product_description', 'AI 营销场景全能助手'),
                'tone': request.data.get('tone', '爆款活泼'),
                'platform': request.data.get('platform', 'Xiaohongshu'),
            },
            username=request_username,
            organization=org,
            project=project,
            campaign=campaign,
        )
        return finalize_idempotency(
            idempotency,
            Response({'task': serialize_task(task), 'result': task.result.get('data', {}), 'logs': task.result.get('logs', [])}),
            'generation_task',
            task.id,
        )


class ImageGenerateView(APIView):
    permission_classes = [IsAuthenticated]
    throttle_classes = [GenerationBurstThrottle, GenerationRateThrottle, OrgRateThrottle]

    def post(self, request):
        user, org, project, campaign = get_scope(request)
        require_role(user, org, 'creator')
        replay, idempotency = idempotency_response(request, org)
        if replay:
            return replay
        request_username = user.username
        if as_bool(request.data.get('async', False), default=False):
            task = create_generation_task(
                task_type='image',
                payload=_image_generation_payload(request.data),
                username=request_username,
                organization=org,
                project=project,
                campaign=campaign,
                run_now=False,
            )
            schedule_generation_task(task)
            return finalize_idempotency(idempotency, Response({'task': serialize_task(task)}, status=status.HTTP_202_ACCEPTED), 'generation_task', task.id)
        task = create_generation_task(
            task_type='image',
            payload=_image_generation_payload(request.data),
            username=request_username,
            organization=org,
            project=project,
            campaign=campaign,
        )
        return finalize_idempotency(idempotency, Response({'task': serialize_task(task), 'result': task.result.get('data', {}), 'logs': task.result.get('logs', [])}), 'generation_task', task.id)


class StoryboardView(APIView):
    permission_classes = [IsAuthenticated]
    throttle_classes = [GenerationBurstThrottle, GenerationRateThrottle, OrgRateThrottle]

    def post(self, request):
        user, org, project, campaign = get_scope(request)
        require_role(user, org, 'creator')
        replay, idempotency = idempotency_response(request, org)
        if replay:
            return replay
        request_username = user.username
        if as_bool(request.data.get('async', False), default=False):
            task = create_generation_task(
                task_type='storyboard',
                payload={
                    'video_topic': request.data.get('video_topic', 'Coffee Shop Morning'),
                    'duration': int(request.data.get('duration', 30)),
                    'target_audience': request.data.get('target_audience', 'Young creators'),
                },
                username=request_username,
                organization=org,
                project=project,
                campaign=campaign,
                run_now=False,
            )
            schedule_generation_task(task)
            return finalize_idempotency(idempotency, Response({'task': serialize_task(task)}, status=status.HTTP_202_ACCEPTED), 'generation_task', task.id)
        task = create_generation_task(
            task_type='storyboard',
            payload={
                'video_topic': request.data.get('video_topic', 'Coffee Shop Morning'),
                'duration': int(request.data.get('duration', 30)),
                'target_audience': request.data.get('target_audience', 'Young creators'),
            },
            username=request_username,
            organization=org,
            project=project,
            campaign=campaign,
        )
        return finalize_idempotency(idempotency, Response({'task': serialize_task(task), 'result': task.result.get('data', {}), 'logs': task.result.get('logs', [])}), 'generation_task', task.id)


class AudioVoiceoverView(APIView):
    permission_classes = [IsAuthenticated]
    throttle_classes = [GenerationBurstThrottle, GenerationRateThrottle, OrgRateThrottle]

    def post(self, request):
        user, org, project, campaign = get_scope(request)
        require_role(user, org, 'creator')
        replay, idempotency = idempotency_response(request, org)
        if replay:
            return replay
        request_username = user.username
        if as_bool(request.data.get('async', False), default=False):
            task = create_generation_task(
                task_type='audio',
                payload={
                    'text': request.data.get('text', '欢迎使用 Marketing Hub AI 一站式营销场景配音助手'),
                    'voice_id': request.data.get('voice_id', 'female_warm'),
                    'speed': float(request.data.get('speed', 1.0)),
                },
                username=request_username,
                organization=org,
                project=project,
                campaign=campaign,
                run_now=False,
            )
            schedule_generation_task(task)
            return finalize_idempotency(idempotency, Response({'task': serialize_task(task)}, status=status.HTTP_202_ACCEPTED), 'generation_task', task.id)
        task = create_generation_task(
            task_type='audio',
            payload={
                'text': request.data.get('text', '欢迎使用 Marketing Hub AI 一站式营销场景配音助手'),
                'voice_id': request.data.get('voice_id', 'female_warm'),
                'speed': float(request.data.get('speed', 1.0)),
            },
            username=request_username,
            organization=org,
            project=project,
            campaign=campaign,
        )
        return finalize_idempotency(idempotency, Response({'task': serialize_task(task), 'result': task.result.get('data', {}), 'logs': task.result.get('logs', [])}), 'generation_task', task.id)


class VideoGenerateView(APIView):
    permission_classes = [IsAuthenticated]
    throttle_classes = [GenerationBurstThrottle, GenerationRateThrottle, OrgRateThrottle]

    def post(self, request):
        user, org, project, campaign = get_scope(request)
        require_role(user, org, 'creator')
        replay, idempotency = idempotency_response(request, org)
        if replay:
            return replay
        request_username = user.username
        payload = {
            'video_topic': request.data.get('video_topic', 'Product launch video'),
            'scenes': request.data.get('scenes') or [],
            'audio_url': request.data.get('audio_url', ''),
            'aspect_ratio': request.data.get('aspect_ratio', '9:16'),
            'duration': int(request.data.get('duration', 30)),
            'model': request.data.get('model', ''),
        }
        if as_bool(request.data.get('async', False), default=False):
            task = create_generation_task(
                task_type='video',
                payload=payload,
                username=request_username,
                organization=org,
                project=project,
                campaign=campaign,
                run_now=False,
            )
            schedule_generation_task(task)
            return finalize_idempotency(idempotency, Response({'task': serialize_task(task)}, status=status.HTTP_202_ACCEPTED), 'generation_task', task.id)
        task = create_generation_task(
            task_type='video',
            payload=payload,
            username=request_username,
            organization=org,
            project=project,
            campaign=campaign,
        )
        return finalize_idempotency(idempotency, Response({'task': serialize_task(task), 'result': task.result.get('data', {}), 'logs': task.result.get('logs', [])}), 'generation_task', task.id)


class TaskQueueView(APIView):
    permission_classes = [IsAuthenticated]
    throttle_classes = [GenerationBurstThrottle, GenerationRateThrottle, OrgRateThrottle]

    def get(self, request):
        _, org, _, _ = get_scope(request)
        tasks = GenerationTask.objects.filter(organization=org).order_by('-created_at')[:50]
        return Response([serialize_task(task) for task in tasks])

    def post(self, request):
        user, org, project, campaign = get_scope(request)
        require_role(user, org, 'creator')
        replay, idempotency = idempotency_response(request, org)
        if replay:
            return replay
        request_username = user.username
        task_type = request.data.get('task_type')
        if task_type not in dict(GenerationTask.TASK_TYPES):
            return Response({'error': 'Unsupported task type'}, status=status.HTTP_400_BAD_REQUEST)
        run_now = as_bool(request.data.get('run_now', True))
        task = create_generation_task(
            task_type=task_type,
            payload=request.data.get('payload', {}),
            username=request_username,
            organization=org,
            project=project,
            campaign=campaign,
            run_now=run_now,
        )
        if run_now:
            return finalize_idempotency(idempotency, Response({'task': serialize_task(task), 'result': task.result.get('data', {}), 'logs': task.result.get('logs', [])}), 'generation_task', task.id)
        schedule_generation_task(task)
        return finalize_idempotency(idempotency, Response({'task': serialize_task(task)}, status=status.HTTP_202_ACCEPTED), 'generation_task', task.id)


class TaskDetailView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request, pk: int):
        task = get_task_for_member(request.user, pk)
        return Response(serialize_task(task))

    def post(self, request, pk: int):
        task = get_task_for_member(request.user, pk)
        require_role(request.user, task.organization, 'creator')
        org = task.organization
        replay, idempotency = idempotency_response(request, org)
        if replay:
            return replay
        run_generation_task(task)
        return finalize_idempotency(idempotency, Response(serialize_task(task)), 'generation_task', task.id)


class WorkflowRunView(APIView):
    permission_classes = [IsAuthenticated]
    throttle_classes = [GenerationBurstThrottle, GenerationRateThrottle, OrgRateThrottle]

    def post(self, request, pk: int):
        from api.models import WorkspaceDraft

        draft = WorkspaceDraft.objects.select_related('organization', 'project', 'campaign').filter(pk=pk).first()
        if not draft:
            return Response({'error': 'Draft not found'}, status=status.HTTP_404_NOT_FOUND)
        if not organization_for_user(request.user, draft.organization):
            return Response({'error': 'Permission denied'}, status=status.HTTP_403_FORBIDDEN)
        require_role(request.user, draft.organization, 'creator')
        replay, idempotency = idempotency_response(request, draft.organization)
        if replay:
            return replay
        username = request.user.username
        workflow_run = create_workflow_run(
            draft,
            username=username,
            idempotency_key=idempotency.key if idempotency else '',
        )
        if as_bool(request.data.get('async', False)):
            from django.conf import settings
            from api.tasks import process_workflow_run

            if getattr(settings, 'CELERY_TASK_ALWAYS_EAGER', True):
                import threading

                threading.Thread(target=run_workflow_run_by_id, args=(workflow_run.id, username), daemon=True).start()
            else:
                async_result = process_workflow_run.delay(workflow_run.id, username)
                workflow_run.celery_task_id = async_result.id
                workflow_run.save(update_fields=['celery_task_id', 'updated_at'])
            response = Response({
                'workflow_run': serialize_workflow_run(workflow_run),
                'draft': serialize_workspace_draft(draft),
                'tasks': [],
            }, status=status.HTTP_202_ACCEPTED)
            return finalize_idempotency(idempotency, response, 'workflow_run', workflow_run.id)

        draft, tasks = run_workspace_workflow(draft, username=username, workflow_run=workflow_run)
        workflow_run = WorkflowRun.objects.prefetch_related('node_runs', 'events').get(pk=workflow_run.id)
        return finalize_idempotency(idempotency, Response({
            'workflow_run': serialize_workflow_run(workflow_run),
            'draft': serialize_workspace_draft(draft),
            'tasks': [serialize_task(task) for task in tasks],
        }), 'workflow_run', workflow_run.id)


class WorkflowRunDetailView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request, pk: int):
        workflow_run = WorkflowRun.objects.select_related(
            'organization',
            'draft',
            'project',
            'campaign',
        ).prefetch_related('node_runs', 'events').filter(pk=pk).first()
        if not workflow_run:
            return Response({'error': 'Workflow run not found'}, status=status.HTTP_404_NOT_FOUND)
        if not organization_for_user(request.user, workflow_run.organization):
            return Response({'error': 'Permission denied'}, status=status.HTTP_403_FORBIDDEN)
        return Response(serialize_workflow_run(workflow_run))


class WorkflowNodeRetryView(APIView):
    permission_classes = [IsAuthenticated]
    throttle_classes = [GenerationBurstThrottle, GenerationRateThrottle, OrgRateThrottle]

    def post(self, request, pk: int, node_id: str):
        from api.models import WorkspaceDraft

        draft = WorkspaceDraft.objects.select_related('organization', 'project', 'campaign').filter(pk=pk).first()
        if not draft:
            return Response({'error': 'Draft not found'}, status=status.HTTP_404_NOT_FOUND)
        if not organization_for_user(request.user, draft.organization):
            return Response({'error': 'Permission denied'}, status=status.HTTP_403_FORBIDDEN)
        require_role(request.user, draft.organization, 'creator')
        replay, idempotency = idempotency_response(request, draft.organization)
        if replay:
            return replay
        draft, task, workflow_run = retry_workspace_node(
            draft,
            node_id=node_id,
            feedback=request.data.get('feedback', ''),
            username=request.user.username,
            idempotency_key=idempotency.key if idempotency else '',
        )
        return finalize_idempotency(idempotency, Response({
            'draft': serialize_workspace_draft(draft),
            'task': serialize_task(task) if task else None,
            'workflow_run': serialize_workflow_run(workflow_run),
        }), 'workspace_draft', draft.id)


class BrainstormView(APIView):
    permission_classes = [IsAuthenticated]
    throttle_classes = [GenerationBurstThrottle, GenerationRateThrottle, OrgRateThrottle]

    def post(self, request):
        idea = str(request.data.get('idea', '')).strip()
        if not idea:
            return Response({'error': 'idea is required'}, status=status.HTTP_400_BAD_REQUEST)
        if len(idea) > 2000:
            return Response({'error': 'idea must be 2000 characters or fewer'}, status=status.HTTP_400_BAD_REQUEST)

        user, org, project, campaign = get_scope(request)
        require_role(user, org, 'creator')
        request_username = user.username
        replay, idempotency = idempotency_response(request, org)
        if replay:
            return replay

        try:
            draft, brainstorm_result = brainstorm_workflow(
                idea,
                organization=org,
                project=project,
                campaign=campaign,
                username=request_username,
            )
        except Exception as exc:
            return Response(
                {'error': f'Brainstorm failed: {str(exc)[:300]}'},
                status=status.HTTP_500_INTERNAL_SERVER_ERROR,
            )

        response = Response({
            'draft': serialize_workspace_draft(draft),
            'summary': brainstorm_result.get('summary', ''),
            'workflow_name': brainstorm_result.get('workflow_name', draft.name),
            'brand_context': brainstorm_result.get('brand_context', draft.brand_context),
        }, status=status.HTTP_201_CREATED)
        return finalize_idempotency(idempotency, response, 'workspace_draft', draft.id)
