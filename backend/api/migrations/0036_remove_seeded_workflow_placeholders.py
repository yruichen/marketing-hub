from django.db import migrations


SEEDED_NODE_IDS = {'brand-brief', 'copy-agent', 'image-agent'}
SEEDED_EDGE_IDS = {'edge-brand-copy', 'edge-copy-image'}


def clear_untouched_seeded_workflows(apps, schema_editor):
    WorkspaceDraft = apps.get_model('api', 'WorkspaceDraft')
    for draft in WorkspaceDraft.objects.filter(name='Default Workflow').iterator():
        nodes = draft.nodes if isinstance(draft.nodes, list) else []
        edges = draft.edges if isinstance(draft.edges, list) else []
        node_ids = {str(node.get('id')) for node in nodes if isinstance(node, dict)}
        edge_ids = {str(edge.get('id')) for edge in edges if isinstance(edge, dict)}
        has_runtime_data = any(
            isinstance(node, dict) and (node.get('output') or node.get('task_id') or node.get('error'))
            for node in nodes
        )
        if node_ids == SEEDED_NODE_IDS and edge_ids == SEEDED_EDGE_IDS and not has_runtime_data:
            draft.name = 'Untitled Workflow'
            draft.nodes = []
            draft.edges = []
            draft.save(update_fields=['name', 'nodes', 'edges', 'updated_at'])


class Migration(migrations.Migration):
    dependencies = [
        ('api', '0035_remove_beta_policy_placeholders'),
    ]

    operations = [
        migrations.RunPython(clear_untouched_seeded_workflows, migrations.RunPython.noop),
    ]
