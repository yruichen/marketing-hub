"""Compatibility facade for workflow services.

The implementation is split under ``workflow_parts`` by contract/default draft,
payload shaping, execution, and brainstorm generation.
"""

from api.service_modules.workflow_parts.brainstorm import brainstorm_workflow
from api.service_modules.workflow_parts.contracts import (
    get_or_create_default_draft,
    node_io_schema,
    validate_workflow_contract,
)
from api.service_modules.workflow_parts.payloads import (
    build_payload_for_node,
    extract_upstream_text,
    upstream_outputs,
    workflow_execution_order,
)
from api.service_modules.workflow_parts.runner import (
    retry_workspace_node,
    run_workflow_node,
    run_workspace_workflow,
)

__all__ = [
    'brainstorm_workflow',
    'build_payload_for_node',
    'extract_upstream_text',
    'get_or_create_default_draft',
    'node_io_schema',
    'retry_workspace_node',
    'run_workflow_node',
    'run_workspace_workflow',
    'upstream_outputs',
    'validate_workflow_contract',
    'workflow_execution_order',
]
