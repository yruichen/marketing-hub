from django.db import migrations


FAILURE_STRATEGIES = {
    '重试一次后跳过': 'retry_once_then_skip',
    '失败后保留提示词并重试一次': 'retry_once',
    '失败后重试一次': 'retry_once',
    '直接跳过': 'skip',
    '中断工作流': 'abort',
}

RETRIEVAL_SCOPES = {
    '品牌记忆和资产库': 'brand_memory_and_assets',
    '社区作品库': 'community',
    '全部': 'all',
}


def normalize_workflow_config_identifiers(apps, schema_editor):
    WorkspaceDraft = apps.get_model('api', 'WorkspaceDraft')
    for draft in WorkspaceDraft.objects.iterator():
        changed = False
        nodes = list(draft.nodes or [])
        for node in nodes:
            if not isinstance(node, dict):
                continue
            config = node.get('config')
            if not isinstance(config, dict):
                continue
            failure_strategy = config.get('failure_strategy')
            if failure_strategy in FAILURE_STRATEGIES:
                config['failure_strategy'] = FAILURE_STRATEGIES[failure_strategy]
                changed = True
            retrieval_scope = config.get('retrieval_scope')
            if retrieval_scope in RETRIEVAL_SCOPES:
                config['retrieval_scope'] = RETRIEVAL_SCOPES[retrieval_scope]
                changed = True
            if config.get('model') == 'image-default':
                config['model'] = ''
                changed = True
            if node.get('type') == 'review':
                if config.get('forbidden_words') == '绝对、第一、包治':
                    config['forbidden_words'] = ''
                    changed = True
                if config.get('channel_rules') == '平台基础合规规则':
                    config['channel_rules'] = ''
                    changed = True
        if changed:
            draft.nodes = nodes
            draft.save(update_fields=['nodes', 'updated_at'])


class Migration(migrations.Migration):
    dependencies = [
        ('api', '0037_alter_workspacedraft_name_default'),
    ]

    operations = [
        migrations.RunPython(normalize_workflow_config_identifiers, migrations.RunPython.noop),
    ]
