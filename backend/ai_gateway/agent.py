from __future__ import annotations

import asyncio
import json
import logging
import time
from dataclasses import dataclass, field
from typing import Any, AsyncIterator, Protocol

from django.db import close_old_connections

from api.audit import record_audit_log

from .tools import ToolContext, ToolRegistry, build_default_registry

logger = logging.getLogger(__name__)


SYSTEM_PROMPT = """你是 Marketing-Hub 的全局 AI 助手。

能力：
- 帮用户查询项目、资产、任务、仪表盘数据
- 触发营销文案生成
- 引导用户跳到平台的指定 tab 或项目

风格：
- 简洁、中文优先、动作明确
- 工具调用前简短说明意图（不超过 15 个字）
- 工具调用后用 1-3 句总结关键信息
- 不编造数据，不确定时直接说"我查一下"
"""


@dataclass(slots=True)
class AssistantStep:
    """One streaming event. Emitted by the agent and serialized to SSE."""

    type: str  # 'text' | 'tool_call' | 'tool_result' | 'done' | 'error'
    delta: str = ''
    name: str = ''
    args: dict[str, Any] = field(default_factory=dict)
    result: Any = None
    error: str = ''
    usage: dict[str, int] = field(default_factory=dict)


class LlmClient(Protocol):
    """
    Abstract LLM client. Implementations call an OpenAI-compatible
    /chat/completions endpoint with `tools` support and return the raw
    provider payload. The agent interprets payload shape (tool_calls,
    choices[0].message.content, usage).
    """

    async def chat(
        self,
        *,
        messages: list[dict[str, Any]],
        tools: list[dict[str, Any]] | None = None,
        tool_choice: str = 'auto',
    ) -> dict[str, Any]: ...


class HttpLlmClient:
    """
    Calls any OpenAI-compatible /chat/completions endpoint over HTTP
    (urllib — same as the rest of ai_gateway to avoid extra deps).

    Resolution order: pick the first AIConfiguration whose lane serves
    'text'. Falls back to mock when none configured.
    """

    def __init__(
        self,
        *,
        base_url: str = 'https://apihub.agnes-ai.com/v1',
        api_key: str = 'mock',
        model: str = 'agnes-2.0-flash',
        timeout: int = 60,
    ) -> None:
        self.base_url = base_url.rstrip('/')
        self.api_key = api_key
        self.model = model
        self.timeout = timeout

    async def chat(
        self,
        *,
        messages: list[dict[str, Any]],
        tools: list[dict[str, Any]] | None = None,
        tool_choice: str = 'auto',
    ) -> dict[str, Any]:
        from urllib import request as urlrequest
        from urllib.error import URLError

        url = f'{self.base_url}/chat/completions'
        payload: dict[str, Any] = {
            'model': self.model,
            'messages': messages,
            'temperature': 0.5,
            'max_tokens': 1024,
            'stream': False,
        }
        if tools:
            payload['tools'] = tools
            payload['tool_choice'] = tool_choice

        body = json.dumps(payload).encode('utf-8')
        req = urlrequest.Request(
            url,
            data=body,
            headers={
                'Content-Type': 'application/json',
                'Authorization': f'Bearer {self.api_key}',
            },
            method='POST',
        )

        def _do() -> dict[str, Any]:
            with urlrequest.urlopen(req, timeout=self.timeout) as resp:
                return json.loads(resp.read().decode('utf-8'))

        try:
            return await asyncio.to_thread(_do)
        except URLError as exc:
            raise RuntimeError(f'LLM endpoint unreachable: {exc}') from exc


class MockLlmClient:
    """
    No-network client for dev / tests. Inspects messages for tool
    names mentioned and emits matching tool_calls. Useful for end-to-end
    smoke tests and the demo workspace where no API key is set.
    """

    async def chat(
        self,
        *,
        messages: list[dict[str, Any]],
        tools: list[dict[str, Any]] | None = None,
        tool_choice: str = 'auto',
    ) -> dict[str, Any]:
        # Find the latest user message
        user_msg = next(
            (m['content'] for m in reversed(messages) if m.get('role') == 'user'),
            '',
        )
        text = user_msg.lower()

        chosen: str | None = None
        for tool in tools or []:
            name = tool['function']['name']
            # Heuristic: pick the first tool whose name (or a hint word) is in the message
            hint = TOOL_HINTS.get(name, name)
            if any(token in text for token in hint.split('|')):
                chosen = name
                break

        if chosen:
            return {
                'choices': [
                    {
                        'message': {
                            'role': 'assistant',
                            'content': None,
                            'tool_calls': [
                                {
                                    'id': f'call_{int(time.time() * 1000)}',
                                    'type': 'function',
                                    'function': {
                                        'name': chosen,
                                        'arguments': '{}',
                                    },
                                }
                            ],
                        }
                    }
                ],
                'usage': {'prompt_tokens': 100, 'completion_tokens': 30},
            }
        # Plain text reply
        return {
            'choices': [
                {
                    'message': {
                        'role': 'assistant',
                        'content': f'（mock）我收到了你的消息：{user_msg[:80]}',
                    }
                }
            ],
            'usage': {'prompt_tokens': 80, 'completion_tokens': 40},
        }


TOOL_HINTS: dict[str, str] = {
    'list_projects': '项目|projects',
    'get_project': '详情|detail|那个项目',
    'get_dashboard': '仪表盘|dashboard|统计|状态',
    'create_copy': '文案|写|copy|小红书|抖音',
    'navigate': '跳转|打开|去|跳到|navigate',
}


class AssistantAgent:
    """
    Multi-turn tool-calling agent. Streams AssistantStep events.

    Loop invariant:
        step N → LLM call with full messages
        if LLM returns tool_calls → execute each, append results, loop
        else → emit 'done' and return
    Cap: max_steps (default 5) prevents infinite loops.
    """

    def __init__(
        self,
        *,
        registry: ToolRegistry | None = None,
        llm: LlmClient | None = None,
        max_steps: int = 5,
    ) -> None:
        self.registry = registry or build_default_registry()
        self.llm = llm or MockLlmClient()
        self.max_steps = max_steps

    def build_messages(
        self,
        *,
        history: list[dict[str, Any]],
        page_context: dict[str, Any] | None,
        user_message: str,
    ) -> list[dict[str, Any]]:
        msgs: list[dict[str, Any]] = [{'role': 'system', 'content': SYSTEM_PROMPT}]
        if page_context:
            msgs.append({
                'role': 'system',
                'content': (
                    '用户当前页面上下文（仅参考，不要复述）：\n'
                    + json.dumps(page_context, ensure_ascii=False)
                ),
            })
        msgs.extend(history)
        msgs.append({'role': 'user', 'content': user_message})
        return msgs

    async def run_streaming(
        self,
        *,
        messages: list[dict[str, Any]],
        ctx: ToolContext,
    ) -> AsyncIterator[AssistantStep]:
        running = list(messages)
        tools_schema = self.registry.schemas()
        last_usage: dict[str, int] = {}

        for step_idx in range(self.max_steps):
            started = time.monotonic()
            try:
                response = await self.llm.chat(
                    messages=running, tools=tools_schema, tool_choice='auto'
                )
            except Exception as exc:
                logger.exception('LLM call failed')
                yield AssistantStep(type='error', error=str(exc))
                return

            last_usage = response.get('usage') or {}
            self._audit_step(ctx, response, step_idx, last_usage)

            text, tool_calls = self._parse_response(response)
            if text:
                yield AssistantStep(type='text', delta=text)
            if not tool_calls:
                yield AssistantStep(type='done', usage=last_usage)
                return

            running.append({
                'role': 'assistant',
                'content': text,
                'tool_calls': tool_calls,
            })

            for tc in tool_calls:
                fn = tc.get('function', {})
                fn_name = fn.get('name', '')
                raw_args = fn.get('arguments', '{}')
                try:
                    parsed_args = json.loads(raw_args) if isinstance(raw_args, str) else (raw_args or {})
                except json.JSONDecodeError:
                    parsed_args = {}

                yield AssistantStep(type='tool_call', name=fn_name, args=parsed_args)
                try:
                    spec = self.registry.get(fn_name)
                    # ToolSpec.invoke is async; the inner Django ORM calls
                    # run inside sync_to_async (see _base.py). The agent
                    # loop itself stays awaitable.
                    result = await spec.invoke(ctx, parsed_args)
                except KeyError:
                    result = {'error': f'unknown tool: {fn_name}'}
                except Exception as exc:
                    logger.exception('Tool %s failed', fn_name)
                    result = {'error': str(exc)}
                finally:
                    # Make sure long-lived connections don't leak across
                    # long streaming sessions.
                    close_old_connections()
                yield AssistantStep(type='tool_result', name=fn_name, result=result)
                running.append({
                    'role': 'tool',
                    'tool_call_id': tc.get('id', ''),
                    'name': fn_name,
                    'content': json.dumps(result, ensure_ascii=False),
                })

            logger.info(
                'Assistant step %d done in %.2fs (usage=%s)',
                step_idx, time.monotonic() - started, last_usage,
            )

        # Step cap hit without final answer
        yield AssistantStep(type='text', delta='（已到达本轮步数上限，未能完整回答）')
        yield AssistantStep(type='done', usage=last_usage)

    def _parse_response(self, response: dict[str, Any]) -> tuple[str, list[dict[str, Any]]]:
        try:
            msg = response['choices'][0]['message']
        except (KeyError, IndexError, TypeError):
            return '', []
        text = msg.get('content') or ''
        return text, list(msg.get('tool_calls') or [])

    def _audit_step(
        self,
        ctx: ToolContext,
        response: dict[str, Any],
        step_index: int,
        usage: dict[str, int],
    ) -> None:
        try:
            record_audit_log(
                action='assistant_step',
                actor=ctx.user,
                organization=ctx.organization,
                target_type='assistant_session',
                target_id=str(ctx.session_id or 0),
                metadata={
                    'step_index': step_index,
                    'usage': usage,
                },
            )
        except Exception:
            logger.exception('Failed to audit assistant step')


__all__ = [
    'AssistantAgent',
    'AssistantStep',
    'HttpLlmClient',
    'LlmClient',
    'MockLlmClient',
    'SYSTEM_PROMPT',
]
