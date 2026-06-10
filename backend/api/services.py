import json
from decimal import Decimal
from typing import Any

from django.contrib.auth.models import User
from django.db import transaction
from django.utils import timezone

from api.contracts import NODE_IO_SCHEMAS, NODE_TYPE_ALIASES, PLAN_LIMITS, normalize_schema, validate_workflow_graph
from ai_gateway.services import AIModelGateway
from api.audit import record_audit_log
from api.serializers import (
    AssetSerializer,
    CampaignSerializer,
    CommunityCreationSerializer,
    FolderSerializer,
    OrganizationSerializer,
    ProjectSerializer,
    TaskSerializer,
    WorkflowTemplateSerializer,
    WorkspaceDraftSerializer,
)
from api.models import (
    AIConfiguration,
    Asset,
    Campaign,
    CommunityCreation,
    Folder,
    GenerationTask,
    Membership,
    Organization,
    Project,
    UsageEvent,
    WorkflowTemplate,
    WorkspaceDraft,
)


def membership_role(user: User | None, organization: Organization | None) -> str | None:
    if not user or not getattr(user, 'is_authenticated', False) or organization is None:
        return None
    membership = Membership.objects.filter(user=user, organization=organization).only('role').first()
    return membership.role if membership else None


def node_io_schema(node: dict[str, Any]) -> dict[str, dict[str, str]]:
    config = node.get('config') if isinstance(node.get('config'), dict) else {}
    base = NODE_IO_SCHEMAS.get(str(node.get('type')), NODE_IO_SCHEMAS['custom_agent'])
    return {
        'input': normalize_schema(node.get('input_schema') or config.get('input_schema'), base['input']),
        'output': normalize_schema(node.get('output_schema') or config.get('output_schema'), base['output']),
    }


def validate_workflow_contract(nodes: list[dict[str, Any]], edges: list[dict[str, Any]]) -> list[str]:
    warnings: list[str] = []
    node_by_id = {str(node.get('id')): node for node in nodes if node.get('id')}
    for edge in edges:
        source = str(edge.get('source', ''))
        target = str(edge.get('target', ''))
        if source not in node_by_id or target not in node_by_id:
            warnings.append(f'连接 {source}->{target} 指向不存在的节点。')
            continue
        source_schema = node_io_schema(node_by_id[source])['output']
        target_schema = node_io_schema(node_by_id[target])['input']
        if not source_schema or not target_schema:
            continue
        source_types = set(source_schema.values())
        target_types = set(target_schema.values())
        compatible = bool(source_types.intersection(target_types)) or 'Any' in source_types or 'Any' in target_types
        if not compatible:
            warnings.append(
                f'{node_by_id[source].get("label", source)} 的输出类型 {sorted(source_types)} '
                f'与 {node_by_id[target].get("label", target)} 的输入类型 {sorted(target_types)} 不匹配。'
            )
    return warnings


def ensure_demo_workspace(username: str | None = None) -> dict[str, Any]:
    org, _ = Organization.objects.get_or_create(
        slug='marketing-hub',
        defaults={'name': 'Marketing Hub'},
    )
    project, _ = Project.objects.get_or_create(
        organization=org,
        slug='core-launch',
        defaults={
            'name': 'Core Launch',
            'brief': 'Default workspace for the local upgrade scaffold.',
        },
    )
    campaign, _ = Campaign.objects.get_or_create(
        project=project,
        name='Product Launch',
        defaults={'objective': 'Keep the default demo workflow live'},
    )

    user_obj = None
    if username:
        user_obj = User.objects.filter(username=username).first()
        if user_obj:
            Membership.objects.get_or_create(user=user_obj, organization=org, defaults={'role': 'admin'})

    return {
        'organization': org,
        'project': project,
        'campaign': campaign,
        'user': user_obj,
    }


def serialize_organization(org: Organization) -> dict[str, Any]:
    return OrganizationSerializer(org).data


def serialize_project(project: Project) -> dict[str, Any]:
    return ProjectSerializer(project).data


def serialize_folder(folder: Folder) -> dict[str, Any]:
    return FolderSerializer(folder).data


def serialize_campaign(campaign: Campaign) -> dict[str, Any]:
    return CampaignSerializer(campaign).data


def serialize_workspace_draft(draft: WorkspaceDraft) -> dict[str, Any]:
    return WorkspaceDraftSerializer(draft).data


def serialize_workflow_template(template: WorkflowTemplate) -> dict[str, Any]:
    return WorkflowTemplateSerializer(template).data


def serialize_asset(asset: Asset) -> dict[str, Any]:
    return AssetSerializer(asset).data


def serialize_task(task: GenerationTask) -> dict[str, Any]:
    return TaskSerializer(task).data


def estimate_tokens(payload: dict[str, Any], result: dict[str, Any]) -> int:
    payload_size = len(json.dumps(payload, ensure_ascii=False))
    result_size = len(json.dumps(result, ensure_ascii=False))
    return max(120, int((payload_size + result_size) / 3))


def estimate_cost(tokens: int) -> Decimal:
    return Decimal(tokens) * Decimal('0.00002')


def persist_usage(task: GenerationTask, result: dict[str, Any], provider: str = 'mock', model_name: str = '') -> UsageEvent:
    total_tokens = estimate_tokens(task.payload, result)
    cost = estimate_cost(total_tokens)
    event = UsageEvent.objects.create(
        organization=task.organization,
        project=task.project,
        campaign=task.campaign,
        generation_task=task,
        provider=provider,
        model_name=model_name,
        prompt_tokens=max(40, total_tokens // 2),
        completion_tokens=max(40, total_tokens // 2),
        total_tokens=total_tokens,
        cost_usd=cost,
    )
    task.token_count = total_tokens
    task.cost_usd = cost
    task.save(update_fields=['token_count', 'cost_usd', 'updated_at'])
    return event


def run_generation_task(task: GenerationTask) -> GenerationTask:
    task.status = 'running'
    task.save(update_fields=['status', 'updated_at'])

    try:
        payload = task.payload or {}
        provider = 'mock'
        model_name = ''
        prompt_tokens = 0
        completion_tokens = 0
        cost_usd = Decimal('0')
        if task.task_type == 'copy':
            gateway = AIModelGateway.execute(
                organization=task.organization,
                role=membership_role(task.requested_by, task.organization),
                task_type='copy',
                payload=payload,
                prompt_key='marketing.copy.system',
            )
            result, logs = gateway.payload, gateway.logs
            provider, model_name = gateway.provider, gateway.model_name
            prompt_tokens, completion_tokens, cost_usd = gateway.prompt_tokens, gateway.completion_tokens, gateway.cost_usd
        elif task.task_type == 'image':
            gateway = AIModelGateway.execute(
                organization=task.organization,
                role=membership_role(task.requested_by, task.organization),
                task_type='image',
                payload=payload,
                prompt_key='marketing.image.system',
            )
            result, logs = gateway.payload, gateway.logs
            provider, model_name = gateway.provider, gateway.model_name
            prompt_tokens, completion_tokens, cost_usd = gateway.prompt_tokens, gateway.completion_tokens, gateway.cost_usd
        elif task.task_type == 'storyboard':
            gateway = AIModelGateway.execute(
                organization=task.organization,
                role=membership_role(task.requested_by, task.organization),
                task_type='storyboard',
                payload=payload,
                prompt_key='marketing.storyboard.system',
            )
            result, logs = gateway.payload, gateway.logs
            provider, model_name = gateway.provider, gateway.model_name
            prompt_tokens, completion_tokens, cost_usd = gateway.prompt_tokens, gateway.completion_tokens, gateway.cost_usd
        elif task.task_type == 'audio':
            gateway = AIModelGateway.execute(
                organization=task.organization,
                role=membership_role(task.requested_by, task.organization),
                task_type='audio',
                payload=payload,
                prompt_key='marketing.audio.system',
            )
            result, logs = gateway.payload, gateway.logs
            provider, model_name = gateway.provider, gateway.model_name
            prompt_tokens, completion_tokens, cost_usd = gateway.prompt_tokens, gateway.completion_tokens, gateway.cost_usd
        elif task.task_type == 'rag_search':
            query = payload.get('query', '').strip()
            results = []
            if query:
                creations = CommunityCreation.objects.all()
                for item in creations:
                    score = 0
                    haystack = f"{item.title} {item.content} {' '.join(item.tags)}"
                    for term in query.split():
                        if term.lower() in haystack.lower():
                            score += 1
                    if score:
                        results.append({
                            'id': item.id,
                            'title': item.title,
                            'creation_type': item.creation_type,
                            'creation_type_display': item.get_creation_type_display(),
                            'similarity_score': round(min(0.99, 0.45 + score * 0.12), 3),
                            'content': item.get_content_dict(),
                        })
                results.sort(key=lambda item: item['similarity_score'], reverse=True)
            result = {'query': query, 'results': results, 'rag_logs': ['Semantic retrieval used local keyword fallback because no vector backend is configured.']}
            logs = result['rag_logs']
        elif task.task_type == 'custom_agent':
            gateway = AIModelGateway.execute(
                organization=task.organization,
                role=membership_role(task.requested_by, task.organization),
                task_type='custom_agent',
                payload=payload,
                prompt_key='marketing.custom_agent.system',
            )
            result, logs = gateway.payload, gateway.logs
            provider, model_name = gateway.provider, gateway.model_name
            prompt_tokens, completion_tokens, cost_usd = gateway.prompt_tokens, gateway.completion_tokens, gateway.cost_usd
        else:
            raise ValueError(f'Unsupported task type: {task.task_type}')

        task.result = {'data': result, 'logs': logs}
        task.status = 'succeeded'
        task.completed_at = timezone.now()
        task.error_message = ''
        task.token_count = max(prompt_tokens + completion_tokens, estimate_tokens(task.payload, result))
        task.cost_usd = cost_usd if cost_usd else estimate_cost(task.token_count)
        task.save(update_fields=['result', 'status', 'completed_at', 'error_message', 'token_count', 'cost_usd', 'updated_at'])
        UsageEvent.objects.create(
            organization=task.organization,
            project=task.project,
            campaign=task.campaign,
            generation_task=task,
            provider=provider,
            model_name=model_name,
            prompt_tokens=prompt_tokens or max(40, task.token_count // 2),
            completion_tokens=completion_tokens or max(40, task.token_count // 2),
            total_tokens=task.token_count,
            cost_usd=task.cost_usd,
        )
        create_asset_from_task_result(task, result)
        return task
    except Exception as exc:
        task.status = 'failed'
        task.error_message = str(exc)
        task.completed_at = timezone.now()
        task.save(update_fields=['status', 'error_message', 'completed_at', 'updated_at'])
        raise


@transaction.atomic
def create_generation_task(
    *,
    task_type: str,
    payload: dict[str, Any],
    username: str | None = None,
    organization: Organization | None = None,
    project: Project | None = None,
    campaign: Campaign | None = None,
    run_now: bool = True,
) -> GenerationTask:
    workspace = None
    if organization is None or project is None or campaign is None:
        workspace = ensure_demo_workspace(username)
    organization = organization or workspace['organization']
    project = project or workspace['project']
    campaign = campaign or workspace['campaign']
    user = workspace['user'] if workspace else (User.objects.filter(username=username).first() if username else None)

    task = GenerationTask.objects.create(
        organization=organization,
        project=project,
        campaign=campaign,
        requested_by=user,
        task_type=task_type,
        payload=payload,
    )

    if run_now:
        run_generation_task(task)
    record_audit_log(
        action='generation_create',
        actor=user,
        organization=organization,
        target_type='generation_task',
        target_id=str(task.id),
        metadata={'task_type': task_type, 'run_now': run_now},
    )

    return task


def create_asset_from_task_result(task: GenerationTask, result: dict[str, Any]) -> Asset:
    asset_type = 'document'
    source_url = ''
    title = f'{task.get_task_type_display()} #{task.id}'
    tags = []

    if task.task_type == 'copy':
        title = result.get('title') or title
        tags = result.get('tags', [])
    elif task.task_type == 'image':
        asset_type = 'image'
        title = result.get('revised_prompt') or result.get('prompt') or title
        source_url = result.get('image_url', '')
    elif task.task_type == 'storyboard':
        title = result.get('video_topic') or title
    elif task.task_type == 'audio':
        asset_type = 'audio'
        title = result.get('text', title)[:120]
        source_url = result.get('audio_url', '')

    if not isinstance(tags, list):
        tags = []

    return Asset.objects.create(
        organization=task.organization,
        project=task.project,
        campaign=task.campaign,
        asset_type=asset_type,
        title=title[:255],
        source_url=source_url,
        tags=tags,
        metadata={
            'generation_task_id': task.id,
            'task_type': task.task_type,
            'result': result,
        },
    )


def queue_generation_task(task: GenerationTask):
    from api.tasks import process_generation_task

    async_result = process_generation_task.delay(task.id)
    task.celery_task_id = async_result.id
    task.save(update_fields=['celery_task_id', 'updated_at'])
    return async_result


def create_asset_from_payload(
    organization: Organization,
    payload: dict[str, Any],
    *,
    project: Project | None = None,
    campaign: Campaign | None = None,
) -> Asset:
    title = payload.get('title') or payload.get('name') or 'Untitled Asset'
    return Asset.objects.create(
        organization=organization,
        project=project,
        campaign=campaign,
        asset_type=payload.get('asset_type', 'document'),
        title=title,
        source_url=payload.get('source_url', ''),
        tags=payload.get('tags', []),
        metadata=payload.get('metadata', {}),
    )


def get_or_create_default_draft(project: Project, campaign: Campaign | None = None) -> WorkspaceDraft:
    default_nodes = [
        {
            'id': 'brand-brief',
            'type': 'context',
            'label': '品牌卖点提炼',
            'x': 80,
            'y': 120,
            'width': 240,
            'height': 132,
            'status': 'idle',
            'config': {
                'summary': project.brief or '整理品牌定位、卖点和受众特征。',
            },
            'input_schema': NODE_IO_SCHEMAS['context']['input'],
            'output_schema': NODE_IO_SCHEMAS['context']['output'],
            'output': {},
        },
        {
            'id': 'copy-agent',
            'type': 'copy',
            'label': '小红书文案专家',
            'x': 360,
            'y': 90,
            'width': 240,
            'height': 132,
            'status': 'idle',
            'config': {
                'tone': '爆款活泼',
                'platform': 'Xiaohongshu',
            },
            'input_schema': NODE_IO_SCHEMAS['copy']['input'],
            'output_schema': NODE_IO_SCHEMAS['copy']['output'],
            'output': {},
        },
        {
            'id': 'image-agent',
            'type': 'image',
            'label': '配图生成器',
            'x': 650,
            'y': 190,
            'width': 240,
            'height': 132,
            'status': 'idle',
            'config': {
                'style': 'minimalist',
                'aspect_ratio': '1:1',
            },
            'input_schema': NODE_IO_SCHEMAS['image']['input'],
            'output_schema': NODE_IO_SCHEMAS['image']['output'],
            'output': {},
        },
    ]
    default_edges = [
        {'id': 'edge-brand-copy', 'source': 'brand-brief', 'target': 'copy-agent'},
        {'id': 'edge-copy-image', 'source': 'copy-agent', 'target': 'image-agent'},
    ]
    draft, created = WorkspaceDraft.objects.get_or_create(
        project=project,
        campaign=campaign,
        name='Default Workflow',
        defaults={
            'organization': project.organization,
            'brand_context': project.brand_context,
            'nodes': default_nodes,
            'edges': default_edges,
            'viewport': {'x': 0, 'y': 0, 'zoom': 1},
        },
    )
    if not created and not draft.brand_context and project.brand_context:
        draft.brand_context = project.brand_context
        draft.save(update_fields=['brand_context', 'updated_at'])
    return draft


def workflow_execution_order(nodes: list[dict[str, Any]], edges: list[dict[str, Any]]) -> list[dict[str, Any]]:
    node_by_id = {str(node.get('id')): node for node in nodes if node.get('id')}
    indegree = {node_id: 0 for node_id in node_by_id}
    outgoing: dict[str, list[str]] = {node_id: [] for node_id in node_by_id}

    for edge in edges:
        source = str(edge.get('source', ''))
        target = str(edge.get('target', ''))
        if source in node_by_id and target in node_by_id:
            outgoing[source].append(target)
            indegree[target] += 1

    queue = [node_id for node_id, degree in indegree.items() if degree == 0]
    ordered_ids: list[str] = []
    while queue:
        current = queue.pop(0)
        ordered_ids.append(current)
        for target in outgoing[current]:
            indegree[target] -= 1
            if indegree[target] == 0:
                queue.append(target)

    if len(ordered_ids) != len(node_by_id):
        raise ValueError('Workflow contains a cycle or invalid edge definition.')
    return [node_by_id[node_id] for node_id in ordered_ids]


def upstream_outputs(node_id: str, nodes: list[dict[str, Any]], edges: list[dict[str, Any]]) -> list[dict[str, Any]]:
    source_ids = [str(edge.get('source')) for edge in edges if str(edge.get('target')) == node_id]
    by_id = {str(node.get('id')): node for node in nodes}
    return [by_id[source_id].get('output', {}) for source_id in source_ids if source_id in by_id]


def extract_upstream_text(upstream: list[dict[str, Any]], max_chars: int = 2000) -> str:
    """Extract meaningful text from upstream node outputs instead of dumping raw JSON."""
    parts: list[str] = []
    for output in upstream:
        if not isinstance(output, dict):
            continue
        for key in ('summary', 'title', 'response', 'paragraphs', 'text', 'query'):
            val = output.get(key)
            if not val:
                continue
            if isinstance(val, list):
                parts.append('\n'.join(str(item) for item in val))
            else:
                parts.append(str(val))
    text = '\n'.join(parts)
    return text[:max_chars] if text else ''


def build_payload_for_node(
    node: dict[str, Any],
    *,
    brand_context: dict[str, Any],
    upstream: list[dict[str, Any]],
    feedback: str = '',
) -> dict[str, Any]:
    config = node.get('config') if isinstance(node.get('config'), dict) else {}
    context_text = json.dumps(brand_context, ensure_ascii=False)
    upstream_text = extract_upstream_text(upstream)
    feedback_text = f'\n修改意见：{feedback}' if feedback else ''
    node_type = node.get('type')

    if node_type == 'copy':
        return {
            'brand_name': config.get('brand_name') or brand_context.get('brand_name') or 'Marketing-Hub',
            'product_description': config.get('product_description') or upstream_text or brand_context.get('selling_points') or 'AI 营销场景全能助手',
            'tone': config.get('tone') or brand_context.get('tone') or '爆款活泼',
            'platform': config.get('platform') or 'Xiaohongshu',
            'workflow_context': context_text,
            'feedback': feedback,
        }
    if node_type == 'image':
        prompt = config.get('prompt') or upstream_text or brand_context.get('visual_style') or 'A creative marketing campaign visual'
        return {
            'prompt': f'{prompt}{feedback_text}',
            'style': config.get('style') or brand_context.get('visual_style') or 'minimalist',
            'aspect_ratio': config.get('aspect_ratio') or '1:1',
            'workflow_context': context_text,
        }
    if node_type == 'storyboard':
        try:
            duration = int(str(config.get('duration', 30)).strip())
        except (ValueError, TypeError):
            duration = 30
        return {
            'video_topic': config.get('video_topic') or upstream_text or brand_context.get('campaign_goal') or 'Product launch story',
            'duration': duration,
            'target_audience': config.get('target_audience') or brand_context.get('audience') or 'Young creators',
            'workflow_context': context_text,
            'feedback': feedback,
        }
    if node_type == 'audio':
        text = config.get('text') or ''
        if not text and upstream:
            text = upstream_text[:2000] or '欢迎使用 Marketing Hub'
        return {
            'text': f'{text}{feedback_text}',
            'voice_id': config.get('voice_id') or 'female_warm',
            'speed': float(config.get('speed') or 1.0),
            'workflow_context': context_text,
        }
    if node_type == 'rag_search':
        return {
            'query': config.get('query') or upstream_text or '',
        }
    if node_type == 'retrieval':
        return {
            'query': config.get('query') or upstream_text or '',
        }
    if node_type == 'image_prompt':
        return {
            'brand_name': brand_context.get('brand_name') or 'Marketing-Hub',
            'product_description': upstream_text or brand_context.get('selling_points') or '',
            'tone': f"视觉风格: {config.get('style', 'editorial')}, 比例: {config.get('aspect_ratio', '1:1')}",
            'platform': 'image_prompt',
            'workflow_context': context_text,
            'feedback': feedback,
        }
    if node_type == 'image_generation':
        prompt = upstream_text or config.get('prompt') or brand_context.get('visual_style') or 'A creative marketing campaign visual'
        return {
            'prompt': f'{prompt}{feedback_text}',
            'style': config.get('style') or brand_context.get('visual_style') or 'minimalist',
            'aspect_ratio': config.get('aspect_ratio') or '1:1',
            'workflow_context': context_text,
        }
    if node_type == 'review':
        return {
            'brand_name': brand_context.get('brand_name') or 'Marketing-Hub',
            'product_description': upstream_text or '',
            'tone': f"审核模式: 检查违禁词({config.get('forbidden_words', '')}), 频道规则({config.get('channel_rules', '')})",
            'platform': 'review',
            'workflow_context': context_text,
            'feedback': feedback,
        }
    if node_type == 'custom_agent':
        return {
            'name': config.get('name') or node.get('label') or '自定义智能体',
            'icon': config.get('icon') or 'Sparkles',
            'prompt': config.get('prompt') or '',
            'temperature': float(config.get('temperature') or 0.7),
            'workflow_context': context_text,
            'upstream': upstream,
            'upstream_text': upstream_text,
            'brand_context': context_text,
            'feedback': feedback,
        }
    return {
        'context': context_text,
        'upstream': upstream,
        'config': config,
        'feedback': feedback,
    }


def run_workflow_node(
    *,
    node: dict[str, Any],
    nodes: list[dict[str, Any]],
    edges: list[dict[str, Any]],
    brand_context: dict[str, Any],
    organization: Organization,
    project: Project,
    campaign: Campaign | None,
    username: str | None = None,
    feedback: str = '',
) -> tuple[dict[str, Any], GenerationTask | None]:
    node_type = node.get('type')
    task_type = NODE_TYPE_ALIASES.get(node_type, node_type)
    node_id = str(node.get('id'))
    if node_type == 'context':
        output = {
            'summary': node.get('config', {}).get('summary') or project.brief,
            'brand_context': brand_context,
        }
        node['output'] = output
        node['status'] = 'succeeded'
        node['input_schema'] = node_io_schema(node)['input']
        node['output_schema'] = node_io_schema(node)['output']
        return node, None

    if task_type not in dict(GenerationTask.TASK_TYPES):
        output = {
            'message': f'Node type {node_type} is a configuration/pass-through node.',
            'upstream': upstream_outputs(node_id, nodes, edges),
        }
        node['output'] = output
        node['status'] = 'succeeded'
        node['input_schema'] = node_io_schema(node)['input']
        node['output_schema'] = node_io_schema(node)['output']
        return node, None

    payload = build_payload_for_node(
        node,
        brand_context=brand_context,
        upstream=upstream_outputs(node_id, nodes, edges),
        feedback=feedback,
    )
    task = create_generation_task(
        task_type=task_type,
        payload=payload,
        username=username,
        organization=organization,
        project=project,
        campaign=campaign,
        run_now=True,
    )
    node['output'] = task.result.get('data', {})
    node['task_id'] = task.id
    node['status'] = task.status
    node['error_message'] = task.error_message
    node['input_schema'] = node_io_schema(node)['input']
    node['output_schema'] = node_io_schema(node)['output']
    return node, task


def run_workspace_workflow(draft: WorkspaceDraft, username: str | None = None) -> tuple[WorkspaceDraft, list[GenerationTask]]:
    nodes = [dict(node, status='queued') for node in draft.nodes]
    edges = draft.edges
    brand_context = draft.brand_context or draft.project.brand_context or {}
    tasks: list[GenerationTask] = []

    draft.status = 'running'
    draft.nodes = nodes
    draft.save(update_fields=['status', 'nodes', 'updated_at'])

    try:
        order = workflow_execution_order(nodes, edges)
        schema_warnings = validate_workflow_contract(nodes, edges)
        by_id = {str(node.get('id')): node for node in nodes}
        failed_node_ids: list[str] = []

        for ordered_node in order:
            node = by_id[str(ordered_node.get('id'))]
            node['status'] = 'running'
            try:
                with transaction.atomic():
                    updated_node, task = run_workflow_node(
                        node=node,
                        nodes=nodes,
                        edges=edges,
                        brand_context=brand_context,
                        organization=draft.organization,
                        project=draft.project,
                        campaign=draft.campaign,
                        username=username,
                    )
                    by_id[str(updated_node.get('id'))] = updated_node
                    if task:
                        tasks.append(task)
            except Exception as node_exc:
                node['status'] = 'failed'
                node['error_message'] = str(node_exc)
                failed_node_ids.append(str(node.get('id')))

        draft.nodes = nodes
        all_failed = len(failed_node_ids) == len(order)
        draft.status = 'failed' if all_failed else 'completed'
        draft.last_run_summary = {
            'task_ids': [task.id for task in tasks],
            'failed_node_ids': failed_node_ids,
            'node_count': len(nodes),
            'schema_warnings': schema_warnings,
            'completed_at': timezone.now().isoformat(),
        }
        draft.save(update_fields=['nodes', 'status', 'last_run_summary', 'updated_at'])
        record_audit_log(
            action='workflow_run',
            organization=draft.organization,
            actor=User.objects.filter(username=username).first() if username else None,
            target_type='workspace_draft',
            target_id=str(draft.id),
            metadata={'task_ids': [task.id for task in tasks], 'node_count': len(nodes)},
        )
        return draft, tasks
    except Exception as exc:
        draft.nodes = nodes
        draft.status = 'failed'
        draft.last_run_summary = {'error': str(exc), 'failed_at': timezone.now().isoformat()}
        draft.save(update_fields=['nodes', 'status', 'last_run_summary', 'updated_at'])
        raise


def retry_workspace_node(draft: WorkspaceDraft, node_id: str, feedback: str, username: str | None = None) -> tuple[WorkspaceDraft, GenerationTask | None]:
    nodes = [dict(node) for node in draft.nodes]
    edges = draft.edges
    target = next((node for node in nodes if str(node.get('id')) == str(node_id)), None)
    if not target:
        raise ValueError('Node not found in workflow draft.')

    brand_context = draft.brand_context or draft.project.brand_context or {}
    by_id = {str(node.get('id')): node for node in nodes}

    # Retry the target node
    target['status'] = 'running'
    target['feedback'] = feedback
    try:
        with transaction.atomic():
            updated_node, task = run_workflow_node(
                node=target,
                nodes=nodes,
                edges=edges,
                brand_context=brand_context,
                organization=draft.organization,
                project=draft.project,
                campaign=draft.campaign,
                username=username,
                feedback=feedback,
            )
            target.update(updated_node)
    except Exception as exc:
        target['status'] = 'failed'
        target['error_message'] = str(exc)
        draft.nodes = nodes
        draft.status = 'failed'
        draft.last_run_summary = {
            **(draft.last_run_summary or {}),
            'last_retry_node_id': node_id,
            'last_retry_at': timezone.now().isoformat(),
            'last_retry_error': str(exc),
        }
        draft.save(update_fields=['nodes', 'status', 'last_run_summary', 'updated_at'])
        raise

    # Cascade: re-execute downstream nodes in topological order
    order = workflow_execution_order(nodes, edges)
    target_idx = next((i for i, n in enumerate(order) if str(n.get('id')) == str(node_id)), -1)
    downstream_nodes = order[target_idx + 1:] if target_idx >= 0 else []
    tasks: list[GenerationTask] = [task] if task else []
    failed_downstream: list[str] = []

    for ds_node in downstream_nodes:
        node = by_id[str(ds_node.get('id'))]
        node['status'] = 'running'
        try:
            with transaction.atomic():
                updated, ds_task = run_workflow_node(
                    node=node,
                    nodes=nodes,
                    edges=edges,
                    brand_context=brand_context,
                    organization=draft.organization,
                    project=draft.project,
                    campaign=draft.campaign,
                    username=username,
                )
                node.update(updated)
                if ds_task:
                    tasks.append(ds_task)
        except Exception:
            node['status'] = 'failed'
            failed_downstream.append(str(node.get('id')))

    draft.nodes = nodes
    draft.status = 'completed' if not failed_downstream else 'failed'
    draft.last_run_summary = {
        **(draft.last_run_summary or {}),
        'last_retry_node_id': node_id,
        'last_retry_task_id': task.id if task else None,
        'last_retry_at': timezone.now().isoformat(),
        'cascade_task_ids': [t.id for t in tasks],
        'cascade_failed_node_ids': failed_downstream,
    }
    draft.save(update_fields=['nodes', 'status', 'last_run_summary', 'updated_at'])
    record_audit_log(
        action='workflow_retry',
        organization=draft.organization,
        actor=User.objects.filter(username=username).first() if username else None,
        target_type='workspace_draft',
        target_id=str(draft.id),
        metadata={'last_retry_node_id': node_id, 'task_id': task.id if task else None},
    )
    return draft, task


def brainstorm_workflow(
    idea: str,
    *,
    organization: Organization,
    project: Project,
    campaign: Campaign | None = None,
    username: str | None = None,
) -> tuple[WorkspaceDraft, dict[str, Any]]:
    role = membership_role(
        User.objects.filter(username=username).first() if username else None,
        organization,
    )
    gateway = AIModelGateway.execute(
        organization=organization,
        role=role,
        task_type='brainstorm',
        payload={'idea': idea, 'brand_context_hint': project.brand_context or {}},
        prompt_key='marketing.brainstorm.system',
    )
    brainstorm_result = gateway.payload

    nodes = brainstorm_result.get('nodes', [])
    edges = brainstorm_result.get('edges', [])
    errors = validate_workflow_graph(nodes, edges)
    if errors:
        brainstorm_result = _fallback_brainstorm(idea)
        nodes = brainstorm_result['nodes']
        edges = brainstorm_result['edges']

    for node in nodes:
        node.setdefault('status', 'idle')
        node_type = node.get('type', 'context')
        io = NODE_IO_SCHEMAS.get(node_type, {'input': {}, 'output': {}})
        node.setdefault('input_schema', io.get('input', {}))
        node.setdefault('output_schema', io.get('output', {}))

    workflow_name = brainstorm_result.get('workflow_name', idea[:40])
    base_name = workflow_name[:120]
    existing = WorkspaceDraft.objects.filter(
        project=project, campaign=campaign, name=base_name,
    ).exists()
    if existing:
        workflow_name = f'{base_name} - {timezone.now().strftime("%H%M%S")}'

    draft = WorkspaceDraft.objects.create(
        organization=organization,
        project=project,
        campaign=campaign,
        name=workflow_name,
        brand_context=brainstorm_result.get('brand_context', {}),
        nodes=nodes,
        edges=edges,
        viewport={'x': 0, 'y': 0, 'zoom': 1},
        status='draft',
    )
    record_audit_log(
        action='brainstorm',
        actor=User.objects.filter(username=username).first() if username else None,
        organization=organization,
        target_type='workspace_draft',
        target_id=str(draft.id),
        metadata={'idea': idea[:200], 'node_count': len(nodes)},
    )
    return draft, brainstorm_result


def _fallback_brainstorm(idea: str) -> dict[str, Any]:
    return {
        'workflow_name': f'Campaign: {idea[:40]}',
        'brand_context': {
            'brand_name': idea.split()[0] if idea.split() else 'Brand',
            'audience': 'General audience',
            'tone': 'Professional',
            'selling_points': idea[:100],
            'visual_style': 'modern',
            'campaign_goal': idea[:80],
        },
        'nodes': [
            {
                'id': 'context-1', 'type': 'context', 'label': 'Brand Context',
                'x': 80, 'y': 120, 'width': 260, 'height': 166,
                'config': {'summary': idea[:200]},
            },
            {
                'id': 'copy-1', 'type': 'copy', 'label': 'Marketing Copy',
                'x': 380, 'y': 120, 'width': 260, 'height': 166,
                'config': {'tone': 'Professional', 'platform': 'Xiaohongshu'},
            },
        ],
        'edges': [{'id': 'edge-ctx-copy', 'source': 'context-1', 'target': 'copy-1'}],
        'summary': f'Fallback workflow for: {idea[:80]}',
    }
