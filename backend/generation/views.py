from rest_framework import status
from rest_framework.response import Response
from rest_framework.views import APIView

from api.models import GenerationTask
from api.scope import as_bool, get_scope
from api.services import (
    create_generation_task,
    queue_generation_task,
    retry_workspace_node,
    run_generation_task,
    run_workspace_workflow,
    serialize_task,
    serialize_workspace_draft,
)


class MarketingCopyView(APIView):
    def post(self, request):
        user, org, project, campaign = get_scope(request)
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
            return Response({'task': serialize_task(task)}, status=status.HTTP_202_ACCEPTED)
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
        return Response({'task': serialize_task(task), 'result': task.result.get('data', {}), 'logs': task.result.get('logs', [])})


class ImageGenerateView(APIView):
    def post(self, request):
        user, org, project, campaign = get_scope(request)
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
            return Response({'task': serialize_task(task)}, status=status.HTTP_202_ACCEPTED)
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
        return Response({'task': serialize_task(task), 'result': task.result.get('data', {}), 'logs': task.result.get('logs', [])})


class StoryboardView(APIView):
    def post(self, request):
        user, org, project, campaign = get_scope(request)
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
            return Response({'task': serialize_task(task)}, status=status.HTTP_202_ACCEPTED)
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
        return Response({'task': serialize_task(task), 'result': task.result.get('data', {}), 'logs': task.result.get('logs', [])})


class AudioVoiceoverView(APIView):
    def post(self, request):
        user, org, project, campaign = get_scope(request)
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
            return Response({'task': serialize_task(task)}, status=status.HTTP_202_ACCEPTED)
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
        return Response({'task': serialize_task(task), 'result': task.result.get('data', {}), 'logs': task.result.get('logs', [])})


class TaskQueueView(APIView):
    def get(self, request):
        tasks = GenerationTask.objects.all().order_by('-created_at')[:50]
        return Response([serialize_task(task) for task in tasks])

    def post(self, request):
        user, org, project, campaign = get_scope(request)
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
            return Response({'task': serialize_task(task), 'result': task.result.get('data', {}), 'logs': task.result.get('logs', [])})
        queue_generation_task(task)
        return Response({'task': serialize_task(task)}, status=status.HTTP_201_CREATED)


class TaskDetailView(APIView):
    def get(self, request, pk: int):
        task = GenerationTask.objects.filter(pk=pk).first()
        if not task:
            return Response({'error': 'Task not found'}, status=status.HTTP_404_NOT_FOUND)
        return Response(serialize_task(task))

    def post(self, request, pk: int):
        task = GenerationTask.objects.filter(pk=pk).first()
        if not task:
            return Response({'error': 'Task not found'}, status=status.HTTP_404_NOT_FOUND)
        run_generation_task(task)
        return Response(serialize_task(task))


class WorkflowRunView(APIView):
    def post(self, request, pk: int):
        from api.models import WorkspaceDraft

        draft = WorkspaceDraft.objects.select_related('organization', 'project', 'campaign').filter(pk=pk).first()
        if not draft:
            return Response({'error': 'Draft not found'}, status=status.HTTP_404_NOT_FOUND)
        draft, tasks = run_workspace_workflow(draft, username=request.data.get('username'))
        return Response({
            'draft': serialize_workspace_draft(draft),
            'tasks': [serialize_task(task) for task in tasks],
        })


class WorkflowNodeRetryView(APIView):
    def post(self, request, pk: int, node_id: str):
        from api.models import WorkspaceDraft

        draft = WorkspaceDraft.objects.select_related('organization', 'project', 'campaign').filter(pk=pk).first()
        if not draft:
            return Response({'error': 'Draft not found'}, status=status.HTTP_404_NOT_FOUND)
        draft, task = retry_workspace_node(
            draft,
            node_id=node_id,
            feedback=request.data.get('feedback', ''),
            username=request.data.get('username'),
        )
        return Response({
            'draft': serialize_workspace_draft(draft),
            'task': serialize_task(task) if task else None,
        })

