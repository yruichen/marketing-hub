from rest_framework import status
from rest_framework.response import Response
from rest_framework.throttling import UserRateThrottle
from rest_framework.views import APIView

from api.idempotency import claim_idempotency_key, finish_idempotency_key
from api.models import GenerationTask
from api.scope import as_bool, get_scope
from ai_gateway.content_package import generate_content_package
from api.services import (
    create_generation_task,
    membership_role,
    queue_generation_task,
    retry_workspace_node,
    run_generation_task,
    run_workspace_workflow,
    serialize_task,
    serialize_workspace_draft,
)


class GenerationRateThrottle(UserRateThrottle):
    scope = 'generation'


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
    throttle_classes = [GenerationRateThrottle]

    def post(self, request):
        user, org, project, campaign = get_scope(request)
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
    throttle_classes = [GenerationRateThrottle]

    def post(self, request):
        user, org, project, campaign = get_scope(request)
        replay, idempotency = idempotency_response(request, org)
        if replay:
            return replay
        request_username = request.data.get('username') or (user.username if user else None)
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
            queue_generation_task(task)
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
    throttle_classes = [GenerationRateThrottle]

    def post(self, request):
        user, org, project, campaign = get_scope(request)
        replay, idempotency = idempotency_response(request, org)
        if replay:
            return replay
        request_username = request.data.get('username') or (user.username if user else None)
        if as_bool(request.data.get('async', False), default=False):
            task = create_generation_task(
                task_type='image',
                payload={
                    'prompt': request.data.get('prompt', 'A creative workspace'),
                    'style': request.data.get('style', 'neo-brutalism'),
                    'aspect_ratio': request.data.get('aspect_ratio', '1:1'),
                },
                username=request_username,
                organization=org,
                project=project,
                campaign=campaign,
                run_now=False,
            )
            queue_generation_task(task)
            return finalize_idempotency(idempotency, Response({'task': serialize_task(task)}, status=status.HTTP_202_ACCEPTED), 'generation_task', task.id)
        task = create_generation_task(
            task_type='image',
            payload={
                'prompt': request.data.get('prompt', 'A creative workspace'),
                'style': request.data.get('style', 'neo-brutalism'),
                'aspect_ratio': request.data.get('aspect_ratio', '1:1'),
            },
            username=request_username,
            organization=org,
            project=project,
            campaign=campaign,
        )
        return finalize_idempotency(idempotency, Response({'task': serialize_task(task), 'result': task.result.get('data', {}), 'logs': task.result.get('logs', [])}), 'generation_task', task.id)


class StoryboardView(APIView):
    throttle_classes = [GenerationRateThrottle]

    def post(self, request):
        user, org, project, campaign = get_scope(request)
        replay, idempotency = idempotency_response(request, org)
        if replay:
            return replay
        request_username = request.data.get('username') or (user.username if user else None)
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
            queue_generation_task(task)
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
    throttle_classes = [GenerationRateThrottle]

    def post(self, request):
        user, org, project, campaign = get_scope(request)
        replay, idempotency = idempotency_response(request, org)
        if replay:
            return replay
        request_username = request.data.get('username') or (user.username if user else None)
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
            queue_generation_task(task)
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


class TaskQueueView(APIView):
    def get(self, request):
        _, org, _, _ = get_scope(request)
        tasks = GenerationTask.objects.filter(organization=org).order_by('-created_at')[:50]
        return Response([serialize_task(task) for task in tasks])

    def post(self, request):
        user, org, project, campaign = get_scope(request)
        replay, idempotency = idempotency_response(request, org)
        if replay:
            return replay
        request_username = request.data.get('username') or (user.username if user else None)
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
        queue_generation_task(task)
        return finalize_idempotency(idempotency, Response({'task': serialize_task(task)}, status=status.HTTP_201_CREATED), 'generation_task', task.id)


class TaskDetailView(APIView):
    def get(self, request, pk: int):
        _, org, _, _ = get_scope(request)
        task = GenerationTask.objects.filter(pk=pk, organization=org).first()
        if not task:
            return Response({'error': 'Task not found'}, status=status.HTTP_404_NOT_FOUND)
        return Response(serialize_task(task))

    def post(self, request, pk: int):
        _, org, _, _ = get_scope(request)
        replay, idempotency = idempotency_response(request, org)
        if replay:
            return replay
        task = GenerationTask.objects.filter(pk=pk, organization=org).first()
        if not task:
            return Response({'error': 'Task not found'}, status=status.HTTP_404_NOT_FOUND)
        run_generation_task(task)
        return finalize_idempotency(idempotency, Response(serialize_task(task)), 'generation_task', task.id)


class WorkflowRunView(APIView):
    def post(self, request, pk: int):
        from api.models import WorkspaceDraft

        draft = WorkspaceDraft.objects.select_related('organization', 'project', 'campaign').filter(pk=pk).first()
        if not draft:
            return Response({'error': 'Draft not found'}, status=status.HTTP_404_NOT_FOUND)
        replay, idempotency = idempotency_response(request, draft.organization)
        if replay:
            return replay
        draft, tasks = run_workspace_workflow(draft, username=request.data.get('username'))
        return finalize_idempotency(idempotency, Response({
            'draft': serialize_workspace_draft(draft),
            'tasks': [serialize_task(task) for task in tasks],
        }), 'workspace_draft', draft.id)


class WorkflowNodeRetryView(APIView):
    def post(self, request, pk: int, node_id: str):
        from api.models import WorkspaceDraft

        draft = WorkspaceDraft.objects.select_related('organization', 'project', 'campaign').filter(pk=pk).first()
        if not draft:
            return Response({'error': 'Draft not found'}, status=status.HTTP_404_NOT_FOUND)
        replay, idempotency = idempotency_response(request, draft.organization)
        if replay:
            return replay
        draft, task = retry_workspace_node(
            draft,
            node_id=node_id,
            feedback=request.data.get('feedback', ''),
            username=request.data.get('username'),
        )
        return finalize_idempotency(idempotency, Response({
            'draft': serialize_workspace_draft(draft),
            'task': serialize_task(task) if task else None,
        }), 'workspace_draft', draft.id)
