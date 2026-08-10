from rest_framework import status
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.throttling import UserRateThrottle
from rest_framework.views import APIView
from pydantic import ValidationError as PydanticValidationError

from api.idempotency import claim_idempotency_key, finish_idempotency_key
from api.image_style_skills import DEFAULT_IMAGE_STYLE_SKILL_ID, resolve_style_skill
from api.models import GenerationTask, WorkflowRun
from api.permissions import organization_for_user
from api.access import get_task_for_member, require_role
from api.entitlements import can_use_feature, feature_denied_payload
from api.legal import require_current_policy_consent
from api.throttles import GenerationBurstThrottle, OrgRateThrottle
from api.scope import as_bool, get_scope
from generation.content_package import ContentPackageInput, generate_content_package
from api.services import (
    ai_edit_workflow,
    brainstorm_workflow,
    create_workflow_run,
    create_generation_task,
    membership_role,
    run_workflow_run_by_id,
    schedule_generation_task,
    retry_workspace_node,
    run_generation_task,
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
        'prompt': str(data.get('prompt') or '').strip(),
        'style_skill': style_skill,
        'style': resolve_style_skill(style_skill, legacy_style),
        'aspect_ratio': data.get('aspect_ratio', '1:1'),
        'negative_prompt': data.get('negative_prompt', ''),
        'platform': data.get('platform', ''),
    }


def _as_string_list(value, *, max_items: int = 12) -> list[str]:
    if isinstance(value, str):
        return [line.strip() for line in value.splitlines() if line.strip()][:max_items]
    if not isinstance(value, list):
        return []
    items = []
    for item in value:
        text = str(item or '').strip()
        if text:
            items.append(text)
        if len(items) >= max_items:
            break
    return items


def _video_scenes_payload(value) -> list[dict]:
    if not isinstance(value, list):
        return []
    scenes = []
    for index, item in enumerate(value[:12], start=1):
        if not isinstance(item, dict):
            continue
        visual = str(item.get('visual_description') or item.get('visual') or item.get('description') or '').strip()
        narration = str(item.get('audio_narration') or item.get('voiceover') or item.get('narration') or '').strip()
        camera = str(item.get('camera_motion') or item.get('camera') or '').strip()
        reference = str(item.get('reference_image_url') or item.get('image_url') or '').strip()
        if not (visual or narration or camera or reference):
            continue
        scene = {
            'scene_number': len(scenes) + 1,
            'visual_description': visual,
            'audio_narration': narration,
        }
        if camera:
            scene['camera_motion'] = camera
        try:
            scene['duration_seconds'] = max(1, int(item.get('duration_seconds') or item.get('duration') or 0))
        except (TypeError, ValueError):
            pass
        if reference:
            scene['reference_image_url'] = reference
        scenes.append(scene)
    return scenes


def _video_generation_payload(data) -> dict:
    try:
        duration = int(data.get('duration') or data.get('duration_seconds') or 30)
    except (TypeError, ValueError):
        duration = 30
    reference_images = _as_string_list(data.get('reference_images'), max_items=8)
    image_url = str(data.get('image_url') or data.get('image') or data.get('reference_image') or '').strip()
    if image_url and image_url not in reference_images:
        reference_images.insert(0, image_url)
    return {
        'video_topic': str(data.get('video_topic') or data.get('topic') or '').strip(),
        'prompt': data.get('prompt', ''),
        'script': data.get('script', ''),
        'creative_mode': data.get('creative_mode', 'single_shot'),
        'target_audience': data.get('target_audience', ''),
        'platform': data.get('platform', ''),
        'visual_style': data.get('visual_style', ''),
        'camera_style': data.get('camera_style', ''),
        'negative_prompt': data.get('negative_prompt', ''),
        'characters': _as_string_list(data.get('characters'), max_items=8),
        'keyframes': _as_string_list(data.get('keyframes'), max_items=8),
        'reference_images': reference_images,
        'image_url': image_url,
        'scenes': _video_scenes_payload(data.get('scenes')),
        'audio_url': data.get('audio_url', ''),
        'aspect_ratio': data.get('aspect_ratio', '9:16'),
        'duration': duration,
        'model': data.get('model', ''),
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
        policy_block = require_current_policy_consent(user)
        if policy_block:
            return policy_block
        try:
            payload = ContentPackageInput.model_validate(dict(request.data)).model_dump()
        except PydanticValidationError as exc:
            return Response({
                'error': 'Content package input is invalid.',
                'code': 'CONTENT_PACKAGE_INPUT_INVALID',
                'details': exc.errors(include_url=False, include_context=False, include_input=False),
            }, status=status.HTTP_400_BAD_REQUEST)
        replay, idempotency = idempotency_response(request, org)
        if replay:
            return replay

        role = membership_role(user, org)
        package, logs, _, _ = generate_content_package(
            organization=org,
            role=role,
            payload=payload,
        )
        response = Response({'content_package': package, 'logs': logs}, status=status.HTTP_200_OK)
        return finalize_idempotency(idempotency, response, 'content_package', package.get('title', ''))


class MarketingCopyView(APIView):
    permission_classes = [IsAuthenticated]
    throttle_classes = [GenerationBurstThrottle, GenerationRateThrottle, OrgRateThrottle]

    def post(self, request):
        user, org, project, campaign = get_scope(request)
        require_role(user, org, 'creator')
        policy_block = require_current_policy_consent(user)
        if policy_block:
            return policy_block
        replay, idempotency = idempotency_response(request, org)
        if replay:
            return replay
        request_username = user.username
        if as_bool(request.data.get('async', False), default=False):
            task = create_generation_task(auto_save=False, 
                task_type='copy',
                payload={
                    'brand_name': str(request.data.get('brand_name') or '').strip(),
                    'product_description': str(request.data.get('product_description') or '').strip(),
                    'tone': str(request.data.get('tone') or 'clear and specific').strip(),
                    'platform': str(request.data.get('platform') or 'general').strip(),
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
                'brand_name': str(request.data.get('brand_name') or '').strip(),
                'product_description': str(request.data.get('product_description') or '').strip(),
                'tone': str(request.data.get('tone') or 'clear and specific').strip(),
                'platform': str(request.data.get('platform') or 'general').strip(),
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
        policy_block = require_current_policy_consent(user)
        if policy_block:
            return policy_block
        replay, idempotency = idempotency_response(request, org)
        if replay:
            return replay
        request_username = user.username
        if as_bool(request.data.get('async', False), default=False):
            task = create_generation_task(auto_save=False, 
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
        policy_block = require_current_policy_consent(user)
        if policy_block:
            return policy_block
        replay, idempotency = idempotency_response(request, org)
        if replay:
            return replay
        request_username = user.username
        if as_bool(request.data.get('async', False), default=False):
            task = create_generation_task(auto_save=False, 
                task_type='storyboard',
                payload={
                    'video_topic': str(request.data.get('video_topic') or '').strip(),
                    'duration': int(request.data.get('duration', 30)),
                    'target_audience': str(request.data.get('target_audience') or 'general audience').strip(),
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
                'video_topic': str(request.data.get('video_topic') or '').strip(),
                'duration': int(request.data.get('duration', 30)),
                'target_audience': str(request.data.get('target_audience') or 'general audience').strip(),
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
        policy_block = require_current_policy_consent(user)
        if policy_block:
            return policy_block
        replay, idempotency = idempotency_response(request, org)
        if replay:
            return replay
        request_username = user.username
        if as_bool(request.data.get('async', False), default=False):
            task = create_generation_task(auto_save=False, 
                task_type='audio',
                payload={
                    'text': str(request.data.get('text') or '').strip(),
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
                'text': str(request.data.get('text') or '').strip(),
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
        if not can_use_feature(user, org, 'video_render'):
            return Response(
                feature_denied_payload('video_render', '做视频 Render 需要 Pro。请在计费页兑换 Pro 邀请码。'),
                status=status.HTTP_403_FORBIDDEN,
            )
        policy_block = require_current_policy_consent(user)
        if policy_block:
            return policy_block
        replay, idempotency = idempotency_response(request, org)
        if replay:
            return replay
        request_username = user.username
        payload = _video_generation_payload(request.data)
        if as_bool(request.data.get('async', False), default=False):
            task = create_generation_task(auto_save=False, 
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
        policy_block = require_current_policy_consent(user)
        if policy_block:
            return policy_block
        replay, idempotency = idempotency_response(request, org)
        if replay:
            return replay
        request_username = user.username
        task_type = request.data.get('task_type')
        if task_type not in dict(GenerationTask.TASK_TYPES):
            return Response({'error': 'Unsupported task type'}, status=status.HTTP_400_BAD_REQUEST)
        advanced_task_feature = {
            'video': 'video_render',
            'custom_agent': 'custom_agent',
            'rag_search': 'advanced_nodes',
            'review': 'advanced_nodes',
        }.get(task_type)
        if advanced_task_feature and not can_use_feature(user, org, advanced_task_feature):
            return Response(
                feature_denied_payload(advanced_task_feature, '该高级生成能力需要 Pro。请在计费页兑换 Pro 邀请码。'),
                status=status.HTTP_403_FORBIDDEN,
            )
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
        policy_block = require_current_policy_consent(request.user)
        if policy_block:
            return policy_block
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
        if not can_use_feature(request.user, draft.organization, 'workflow_run'):
            return Response(
                feature_denied_payload('workflow_run', '运行工作流需要 Pro。免费用户可以编辑和保存工作流草稿。'),
                status=status.HTTP_403_FORBIDDEN,
            )
        policy_block = require_current_policy_consent(request.user)
        if policy_block:
            return policy_block
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
            from api.tasks import process_workflow_run

            async_result = process_workflow_run.delay(workflow_run.id, username)
            workflow_run.celery_task_id = async_result.id
            workflow_run.save(update_fields=['celery_task_id', 'updated_at'])
            response = Response({
                'workflow_run': serialize_workflow_run(workflow_run),
                'draft': serialize_workspace_draft(draft),
                'tasks': [],
            }, status=status.HTTP_202_ACCEPTED)
            return finalize_idempotency(idempotency, response, 'workflow_run', workflow_run.id)

        completed_draft, tasks = run_workflow_run_by_id(workflow_run.id, username=username)
        draft = completed_draft or draft
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
        if not can_use_feature(request.user, draft.organization, 'workflow_run'):
            return Response(
                feature_denied_payload('workflow_run', '重试工作流节点需要 Pro。'),
                status=status.HTTP_403_FORBIDDEN,
            )
        policy_block = require_current_policy_consent(request.user)
        if policy_block:
            return policy_block
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


class WorkflowAiEditView(APIView):
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
        if not can_use_feature(request.user, draft.organization, 'advanced_nodes'):
            return Response(
                feature_denied_payload('advanced_nodes', '工作流 AI 微调需要 Pro。免费用户可以编辑和保存工作流草稿。'),
                status=status.HTTP_403_FORBIDDEN,
            )
        policy_block = require_current_policy_consent(request.user)
        if policy_block:
            return policy_block

        instruction = str(request.data.get('instruction') or '').strip()
        if not instruction:
            return Response({'error': 'instruction is required'}, status=status.HTTP_400_BAD_REQUEST)
        if len(instruction) > 2000:
            return Response({'error': 'instruction must be 2000 characters or fewer'}, status=status.HTTP_400_BAD_REQUEST)

        replay, idempotency = idempotency_response(request, draft.organization)
        if replay:
            return replay

        result = ai_edit_workflow(
            draft,
            mode=str(request.data.get('mode') or 'node'),
            instruction=instruction,
            node_id=str(request.data.get('node_id') or ''),
            nodes=request.data.get('nodes') if isinstance(request.data.get('nodes'), list) else None,
            edges=request.data.get('edges') if isinstance(request.data.get('edges'), list) else None,
            brand_context=request.data.get('brand_context') if isinstance(request.data.get('brand_context'), dict) else None,
            username=request.user.username,
        )
        return finalize_idempotency(idempotency, Response(result), 'workspace_draft', draft.id)


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
        policy_block = require_current_policy_consent(user)
        if policy_block:
            return policy_block
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
