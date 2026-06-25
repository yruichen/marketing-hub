from __future__ import annotations

import asyncio
import json
import logging
import time
from dataclasses import dataclass, field
from typing import Any, AsyncIterator, Protocol

from asgiref.sync import sync_to_async
from django.db import OperationalError, close_old_connections

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
    status: int = 0  # upstream HTTP status when type == 'error'
    usage: dict[str, int] = field(default_factory=dict)


class LlmClient(Protocol):
    """
    Abstract LLM client. Implementations call an OpenAI-compatible
    /chat/completions endpoint with `tools` support and return the raw
    provider payload. The agent interprets payload shape (tool_calls,
    choices[0].message.content, usage).

    Streaming is optional. Implement `chat_stream` for token-level
    delivery; the agent picks it up automatically when present and
    falls back to the non-streaming `chat` otherwise.
    """

    async def chat(
        self,
        *,
        messages: list[dict[str, Any]],
        tools: list[dict[str, Any]] | None = None,
        tool_choice: str = 'auto',
    ) -> dict[str, Any]: ...


@dataclass(slots=True)
class StreamDelta:
    """One streaming chunk from an LLM. `final` marks the last chunk and
    carries the accumulated tool_calls + usage."""

    text: str = ''
    final: bool = False
    tool_calls: list[dict[str, Any]] = field(default_factory=list)
    usage: dict[str, int] = field(default_factory=dict)
    finish_reason: str = ''


class HttpLlmClient:
    """
    Calls any OpenAI-compatible /chat/completions endpoint over HTTP
    (urllib — same as the rest of ai_gateway to avoid extra deps).

    Construct via `build_assistant_agent(organization)` so the lane
    selection and key resolution stays in one place.
    """

    def __init__(
        self,
        *,
        base_url: str,
        api_key: str,
        model: str,
        timeout: int = 60,
    ) -> None:
        if not base_url:
            raise ValueError('HttpLlmClient: base_url is required')
        if not api_key:
            raise ValueError('HttpLlmClient: api_key is required')
        if not model:
            raise ValueError('HttpLlmClient: model is required')
        self.base_url = base_url.rstrip('/')
        self.api_key = api_key
        self.model = model
        self.timeout = timeout

    def _chat_completions_url(self) -> str:
        if self.base_url.endswith('/chat/completions'):
            return self.base_url
        return f'{self.base_url}/chat/completions'

    async def chat(
        self,
        *,
        messages: list[dict[str, Any]],
        tools: list[dict[str, Any]] | None = None,
        tool_choice: str = 'auto',
    ) -> dict[str, Any]:
        from urllib import request as urlrequest
        from urllib.error import HTTPError, URLError

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
            self._chat_completions_url(),
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
        except HTTPError as exc:
            # Surface upstream body so the SSE 'error' event carries
            # actionable info (e.g. 429 quota messages) instead of a
            # generic "HTTP Error 429".
            try:
                detail = exc.read().decode('utf-8', errors='replace')[:400]
            except Exception:
                detail = ''
            raise LlmUpstreamError(
                status=exc.code,
                message=f'LLM upstream {exc.code}: {detail or exc.reason}',
            ) from exc
        except URLError as exc:
            raise LlmUpstreamError(
                status=0, message=f'LLM endpoint unreachable: {exc}'
            ) from exc

    async def chat_stream(
        self,
        *,
        messages: list[dict[str, Any]],
        tools: list[dict[str, Any]] | None = None,
        tool_choice: str = 'auto',
    ) -> AsyncIterator[StreamDelta]:
        """
        OpenAI-compatible streaming. Yields one StreamDelta per `data:`
        chunk on the upstream SSE; the last delta has `final=True` and
        carries the aggregated tool_calls + usage so the agent loop can
        decide whether to recurse.
        """
        # We drive a sync urllib.urlopen on a worker thread and bridge
        # each line back into the asyncio loop through a queue. Avoids
        # pulling in `httpx` / `aiohttp` as a dependency.
        import ssl as _ssl
        from urllib import request as urlrequest
        from urllib.error import HTTPError, URLError

        payload: dict[str, Any] = {
            'model': self.model,
            'messages': messages,
            'temperature': 0.5,
            'max_tokens': 1024,
            'stream': True,
            'stream_options': {'include_usage': True},
        }
        if tools:
            payload['tools'] = tools
            payload['tool_choice'] = tool_choice

        req = urlrequest.Request(
            self._chat_completions_url(),
            data=json.dumps(payload).encode('utf-8'),
            headers={
                'Content-Type': 'application/json',
                'Authorization': f'Bearer {self.api_key}',
                'Accept': 'text/event-stream',
            },
            method='POST',
        )

        queue: asyncio.Queue[bytes | None | Exception] = asyncio.Queue()
        # MUST use get_running_loop, not get_event_loop. Under Django's
        # dev runserver the request lives on a worker thread that has
        # no implicit loop; the legacy get_event_loop() would create a
        # fresh one and call_soon_threadsafe would push events into a
        # loop nobody's draining, eventually raising as a confusing
        # "SSL: UNEXPECTED_EOF" when the request socket times out.
        loop = asyncio.get_running_loop()
        # Set by the producer once the stream has emitted [DONE]. Any
        # SSL/EOF that lands after this is treated as the server's
        # normal close (some providers don't send a proper close_notify,
        # which Python 3.10+ surfaces as UNEXPECTED_EOF_WHILE_READING).
        done_seen = {'flag': False}

        def _produce() -> None:
            try:
                with urlrequest.urlopen(req, timeout=self.timeout) as resp:
                    for raw in resp:
                        loop.call_soon_threadsafe(queue.put_nowait, raw)
            except HTTPError as exc:
                try:
                    detail = exc.read().decode('utf-8', errors='replace')[:400]
                except Exception:
                    detail = ''
                loop.call_soon_threadsafe(
                    queue.put_nowait,
                    LlmUpstreamError(
                        status=exc.code,
                        message=f'LLM upstream {exc.code}: {detail or exc.reason}',
                    ),
                )
            except (_ssl.SSLError, URLError) as exc:
                # Distinguish: a graceful end-of-stream (we already saw
                # [DONE]) vs a real network blip. Many providers — agnes
                # in particular — drop the TLS connection without a
                # close_notify, which Python 3.10+ raises as
                # SSL: UNEXPECTED_EOF_WHILE_READING. That's not an error.
                msg = str(exc)
                if done_seen['flag'] and (
                    'UNEXPECTED_EOF_WHILE_READING' in msg
                    or 'EOF occurred in violation of protocol' in msg
                ):
                    pass  # benign tail-end close
                else:
                    loop.call_soon_threadsafe(
                        queue.put_nowait,
                        LlmUpstreamError(
                            status=0,
                            message=f'LLM endpoint unreachable: {exc}',
                        ),
                    )
            except Exception as exc:
                loop.call_soon_threadsafe(queue.put_nowait, exc)
            finally:
                loop.call_soon_threadsafe(queue.put_nowait, None)

        task = asyncio.create_task(asyncio.to_thread(_produce))

        # OpenAI streams tool_calls in pieces — each chunk may carry
        # `tool_calls[i].function.{name,arguments}` as a partial string
        # that we must accumulate by index.
        agg_tool_calls: dict[int, dict[str, Any]] = {}
        last_usage: dict[str, int] = {}
        finish_reason = ''

        try:
            while True:
                item = await queue.get()
                if isinstance(item, Exception):
                    raise item
                if item is None:
                    break
                line = item.decode('utf-8', errors='replace').strip()
                if not line or not line.startswith('data:'):
                    continue
                data = line[5:].strip()
                if data == '[DONE]':
                    done_seen['flag'] = True
                    continue
                try:
                    chunk = json.loads(data)
                except json.JSONDecodeError:
                    continue

                usage = chunk.get('usage') or {}
                if usage:
                    last_usage = {
                        'prompt_tokens': int(usage.get('prompt_tokens') or 0),
                        'completion_tokens': int(usage.get('completion_tokens') or 0),
                    }

                choices = chunk.get('choices') or []
                if not choices:
                    continue
                choice = choices[0]
                delta = choice.get('delta') or {}
                if choice.get('finish_reason'):
                    finish_reason = choice['finish_reason']
                    # Treat finish_reason as a soft DONE marker too —
                    # some providers terminate the stream without ever
                    # sending the `data: [DONE]` sentinel.
                    done_seen['flag'] = True

                text_piece = delta.get('content') or ''
                for tc_piece in delta.get('tool_calls') or []:
                    idx = int(tc_piece.get('index') or 0)
                    bucket = agg_tool_calls.setdefault(
                        idx,
                        {
                            'id': '', 'type': 'function',
                            'function': {'name': '', 'arguments': ''},
                        },
                    )
                    if tc_piece.get('id'):
                        bucket['id'] = tc_piece['id']
                    fn = tc_piece.get('function') or {}
                    if fn.get('name'):
                        bucket['function']['name'] = fn['name']
                    if fn.get('arguments'):
                        bucket['function']['arguments'] += fn['arguments']

                if text_piece:
                    yield StreamDelta(text=text_piece)

            final_tool_calls = [
                agg_tool_calls[k] for k in sorted(agg_tool_calls.keys())
            ]
            yield StreamDelta(
                final=True,
                tool_calls=final_tool_calls,
                usage=last_usage,
                finish_reason=finish_reason,
            )
        finally:
            if not task.done():
                task.cancel()


class LlmUpstreamError(RuntimeError):
    """Raised when the configured LLM returns a non-2xx response."""

    def __init__(self, *, status: int, message: str) -> None:
        super().__init__(message)
        self.status = status


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

    async def chat_stream(
        self,
        *,
        messages: list[dict[str, Any]],
        tools: list[dict[str, Any]] | None = None,
        tool_choice: str = 'auto',
    ) -> AsyncIterator[StreamDelta]:
        """Slice the non-streaming reply into 4-char chunks so the UI can
        validate the streaming pipeline without a real provider."""
        result = await self.chat(messages=messages, tools=tools, tool_choice=tool_choice)
        msg = result['choices'][0]['message']
        content = msg.get('content') or ''
        for i in range(0, len(content), 4):
            await asyncio.sleep(0.02)
            yield StreamDelta(text=content[i : i + 4])
        yield StreamDelta(
            final=True,
            tool_calls=list(msg.get('tool_calls') or []),
            usage=result.get('usage') or {},
            finish_reason='stop',
        )


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
        streaming = hasattr(self.llm, 'chat_stream')

        for step_idx in range(self.max_steps):
            started = time.monotonic()
            try:
                if streaming:
                    text, tool_calls, last_usage = '', [], {}
                    async for delta in self.llm.chat_stream(
                        messages=running, tools=tools_schema, tool_choice='auto',
                    ):
                        if delta.final:
                            tool_calls = delta.tool_calls
                            last_usage = delta.usage or last_usage
                            break
                        if delta.text:
                            text += delta.text
                            # Forward each chunk as its own SSE event so
                            # the UI can render token-by-token.
                            yield AssistantStep(type='text', delta=delta.text)
                else:
                    response = await self.llm.chat(
                        messages=running, tools=tools_schema, tool_choice='auto'
                    )
                    last_usage = response.get('usage') or {}
                    text, tool_calls = self._parse_response(response)
                    if text:
                        yield AssistantStep(type='text', delta=text)
            except LlmUpstreamError as exc:
                logger.warning('LLM upstream error: status=%s', exc.status)
                yield AssistantStep(type='error', error=str(exc), status=exc.status)
                return
            except Exception as exc:
                logger.exception('LLM call failed')
                yield AssistantStep(type='error', error=str(exc))
                return

            await self._audit_step(ctx, {'usage': last_usage}, step_idx, last_usage)

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
                except OperationalError as exc:
                    if 'database table is locked' in str(exc) or 'database is locked' in str(exc):
                        logger.warning('Tool %s skipped because the database is locked.', fn_name)
                    else:
                        logger.exception('Tool %s failed', fn_name)
                    result = {'error': str(exc)}
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

    async def _audit_step(
        self,
        ctx: ToolContext,
        response: dict[str, Any],
        step_index: int,
        usage: dict[str, int],
    ) -> None:
        # Anonymous requests (e.g. unit tests with RequestFactory) must
        # not pass an AnonymousUser as the actor — the FK rejects it.
        actor = ctx.user if (ctx.user is not None and getattr(ctx.user, 'is_authenticated', False)) else None
        try:
            await sync_to_async(record_audit_log, thread_sensitive=True)(
                action='assistant_step',
                actor=actor,
                organization=ctx.organization,
                target_type='assistant_session',
                target_id=str(ctx.session_id or 0),
                metadata={
                    'step_index': step_index,
                    'usage': usage,
                },
            )
        except OperationalError as exc:
            if 'database table is locked' in str(exc) or 'database is locked' in str(exc):
                logger.warning('Skipped assistant audit step because the database is locked.')
                return
            logger.exception('Failed to audit assistant step')
        except Exception:
            logger.exception('Failed to audit assistant step')


def build_assistant_llm(organization: Any | None) -> LlmClient:
    """
    Resolve the LLM client for the assistant.

    Reuses the same text-lane AIConfiguration that copy/storyboard use
    (via `ModelPolicy.select_configuration`). Falls back to
    `MockLlmClient` when no usable key is configured — keeps local dev
    and tests usable without any config.
    """
    # Late imports: keep this module importable without DB / settings
    # in unit tests that only touch the agent loop.
    from ai_gateway.services import (
        AGNES_DEFAULT_BASE_URL,
        AGNES_DEFAULT_MODEL,
        ModelPolicy,
    )

    try:
        config = ModelPolicy.select_configuration(
            organization=organization, task_type='copy'
        )
    except Exception:
        logger.exception('Assistant: failed to resolve AIConfiguration; using mock')
        return MockLlmClient()

    if config is None or not getattr(config, 'api_key', '') or config.provider == 'mock':
        return MockLlmClient()

    provider = config.provider
    # The agent loop uses OpenAI-compatible chat/completions. anthropic
    # and gemini speak different protocols — until we add adapters for
    # them at the agent layer, fall back to mock so we don't 500.
    if provider not in {'openai', 'agnes', 'local_proxy'}:
        logger.info(
            'Assistant: provider=%s not yet supported by agent loop, using mock',
            provider,
        )
        return MockLlmClient()

    base_url = (config.base_url or '').strip() or (
        AGNES_DEFAULT_BASE_URL if provider == 'agnes' else ''
    )
    model = (config.model_name or '').strip() or (
        AGNES_DEFAULT_MODEL if provider == 'agnes' else ''
    )
    if not base_url or not model:
        logger.warning(
            'Assistant: config %s missing base_url/model, using mock', config.pk
        )
        return MockLlmClient()

    return HttpLlmClient(base_url=base_url, api_key=config.api_key, model=model)


def build_assistant_agent(organization: Any | None) -> 'AssistantAgent':
    """
    Construct a fully-wired AssistantAgent for the given org.

    Centralizing this keeps `views.py` free of provider logic and gives
    tests a single seam to patch (see `AssistantChatStreamingTests`,
    which monkey-patches `AssistantAgent` itself).
    """
    return AssistantAgent(llm=build_assistant_llm(organization))


__all__ = [
    'AssistantAgent',
    'AssistantStep',
    'HttpLlmClient',
    'LlmClient',
    'LlmUpstreamError',
    'MockLlmClient',
    'StreamDelta',
    'SYSTEM_PROMPT',
    'build_assistant_agent',
    'build_assistant_llm',
]
