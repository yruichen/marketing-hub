from harness.policies import ToolDecision, ToolPolicy, ToolRule


def build_workspace_tool_policy() -> ToolPolicy:
    """Explicit policy for the currently shipped tenant-scoped workspace tools."""
    return ToolPolicy([
        ToolRule('list_projects', ToolDecision.ALLOW, 'Read-only tenant-scoped query.'),
        ToolRule('get_project', ToolDecision.ALLOW, 'Read-only tenant-scoped query.'),
        ToolRule('get_dashboard', ToolDecision.ALLOW, 'Read-only tenant-scoped aggregate.'),
        ToolRule('navigate', ToolDecision.ALLOW, 'Client-side navigation without backend mutation.'),
        ToolRule('create_copy', ToolDecision.ALLOW, 'Creates only the generation task explicitly requested by the user.'),
    ])
