from __future__ import annotations

import asyncio
import unittest
from decimal import Decimal

from harness.contracts import EventType, GatewayResponse, RunNotResumableError, RunRequest, RunStatus
from harness.policies import ToolDecision, ToolPolicy, ToolRule
from harness.runtime import AgentLoop, Runner
from harness.graph import GraphValidationError, build_graph_plan, ordered_nodes


class _CheckpointStore:
    def __init__(self) -> None:
        self.states = []

    def save(self, state) -> None:
        self.states.append(state.model_copy(deep=True))

    def create(self, state) -> bool:
        if self.load(state.run_id) is not None:
            return False
        self.save(state)
        return True

    def load(self, run_id):
        return next((state for state in reversed(self.states) if state.run_id == run_id), None)


class _EventSink:
    def __init__(self) -> None:
        self.events = []

    def emit(self, event) -> None:
        self.events.append(event)


class _Executor:
    def __init__(self):
        self.calls = 0

    def execute(self, request):
        self.calls += 1
        return GatewayResponse(
            payload={'title': 'Result'},
            logs=['provider:test-double'],
            provider='test-double',
            model_name='deterministic',
            cost_usd=Decimal('0.01'),
            prompt_tokens=10,
            completion_tokens=5,
            prompt_key='marketing.copy.system',
            prompt_version='2026-08-10.v3',
            prompt_locale='en-US',
            prompt_checksum='abc',
            evaluation_profile='copy-quality-v3',
        )


class RunnerTests(unittest.TestCase):
    def test_run_is_checkpointed_and_emits_stable_lifecycle(self):
        checkpoints = _CheckpointStore()
        events = _EventSink()
        request = RunRequest(capability='copy', input={'brand_name': 'Acme'})

        executor = _Executor()
        runner = Runner(executor=executor, checkpoints=checkpoints, events=events)
        result = runner.run(request)

        self.assertEqual(result.status, RunStatus.SUCCEEDED)
        self.assertEqual(result.prompt.version, '2026-08-10.v3')
        self.assertEqual(
            [event.type for event in events.events],
            [EventType.RUN_QUEUED, EventType.RUN_STARTED, EventType.RUN_SUCCEEDED],
        )
        self.assertEqual(checkpoints.states[-1].status, RunStatus.SUCCEEDED)
        self.assertEqual(checkpoints.states[-1].model_dump(mode='json')['schema_version'], 2)
        self.assertEqual(checkpoints.states[-1].result, result)

        replayed = runner.run(request)
        self.assertEqual(replayed, result)
        self.assertEqual(executor.calls, 1)
        self.assertEqual(len(events.events), 3)

    def test_run_id_cannot_be_reused_for_different_input(self):
        checkpoints = _CheckpointStore()
        runner = Runner(executor=_Executor(), checkpoints=checkpoints)
        request = RunRequest(capability='copy', input={'brand_name': 'Acme'})
        runner.run(request)

        with self.assertRaises(RunNotResumableError):
            runner.run(request.model_copy(update={'input': {'brand_name': 'Other'}}))


class GraphPlannerTests(unittest.TestCase):
    def test_plan_orders_dependencies_and_limits_retry_to_descendants(self):
        nodes = [{'id': node_id} for node_id in ('root', 'left', 'right', 'leaf')]
        edges = [
            {'source': 'root', 'target': 'left'},
            {'source': 'root', 'target': 'right'},
            {'source': 'left', 'target': 'leaf'},
        ]

        plan = build_graph_plan(nodes, edges)

        self.assertLess(plan.ordered_ids.index('root'), plan.ordered_ids.index('left'))
        self.assertEqual(plan.descendants('left'), ('leaf',))
        self.assertNotIn('right', plan.descendants('left'))
        self.assertEqual([node['id'] for node in ordered_nodes(nodes, edges)], list(plan.ordered_ids))

    def test_plan_rejects_cycles_and_unknown_edges(self):
        with self.assertRaises(GraphValidationError):
            build_graph_plan([{'id': 'a'}, {'id': 'b'}], [
                {'source': 'a', 'target': 'b'}, {'source': 'b', 'target': 'a'},
            ])
        with self.assertRaises(GraphValidationError):
            build_graph_plan([{'id': 'a'}], [{'source': 'missing', 'target': 'a'}])


class _ToolCallingModel:
    async def chat(self, **kwargs):
        return {
            'choices': [{
                'message': {
                    'content': '',
                    'tool_calls': [{
                        'id': 'call-1',
                        'function': {'name': 'publish', 'arguments': '{"asset_id": 1}'},
                    }],
                },
            }],
            'usage': {},
        }


class _Tools:
    def schemas(self):
        return []

    async def execute(self, name, context, arguments):
        raise AssertionError('approval-gated tool must not execute')


class AgentLoopPolicyTests(unittest.TestCase):
    def test_ask_policy_interrupts_before_side_effect(self):
        policy = ToolPolicy([
            ToolRule('publish', ToolDecision.ASK, 'Publishing requires confirmation.'),
        ])
        loop = AgentLoop(model=_ToolCallingModel(), tools=_Tools(), policy=policy)

        async def collect():
            return [event async for event in loop.run(messages=[], context=None)]

        events = asyncio.run(collect())
        self.assertEqual(events[-1].type, 'approval_required')
        self.assertEqual(events[-1].finish_reason, 'interrupted')

    def test_unknown_tool_is_denied_by_default(self):
        rule = ToolPolicy().evaluate('unknown')
        self.assertEqual(rule.decision, ToolDecision.DENY)
