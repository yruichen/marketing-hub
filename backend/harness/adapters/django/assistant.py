from __future__ import annotations

import asyncio
import json
import logging
from dataclasses import dataclass, field
from typing import Any, AsyncIterator, Protocol

from asgiref.sync import sync_to_async
from django.db import OperationalError

from api.audit import record_audit_log
from api.redaction import redact_text
from harness.prompts import get_prompt_asset
from harness.capabilities._shared import output_locale_instruction
from harness.runtime import AgentLoop
from harness.policies import ToolPolicy

from harness.adapters.tools import (
    RegistryToolRuntime,
    ToolContext,
    ToolRegistry,
    build_default_registry,
    build_workspace_tool_policy,
)

logger = logging.getLogger(__name__)


SYSTEM_PROMPT = get_prompt_asset('assistant.global.system').system_prompt


@dataclass(slots=True)
class AssistantStep:
    """One streaming event. Emitted by the agent and serialized to SSE."""

    type: str  # 'status' | 'text' | 'tool_call' | 'tool_result' | 'done' | 'error'
    delta: str = ''
    name: str = ''
    args: dict[str, Any] = field(default_factory=dict)
    result: Any = None
    error: str = ''
    status: int = 0  # upstream HTTP status when type == 'error'
    status_text: str = ''
    status_code: str = ''
    usage: dict[str, int] = field(default_factory=dict)
    finish_reason: str = ''


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
    (urllib is used to avoid adding another HTTP dependency).

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
        headers = {'Content-Type': 'application/json'}
        if self.api_key:
            headers['Authorization'] = f'Bearer {self.api_key}'
        req = urlrequest.Request(
            self._chat_completions_url(),
            data=body,
            headers=headers,
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

        headers = {
            'Content-Type': 'application/json',
            'Accept': 'text/event-stream',
        }
        if self.api_key:
            headers['Authorization'] = f'Bearer {self.api_key}'
        req = urlrequest.Request(
            self._chat_completions_url(),
            data=json.dumps(payload).encode('utf-8'),
            headers=headers,
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
        tool_policy: ToolPolicy | None = None,
    ) -> None:
        if llm is None:
            raise ValueError('AssistantAgent requires an explicit LLM client.')
        self.registry = registry or build_default_registry()
        self.llm = llm
        self.max_steps = max_steps
        self.tool_policy = tool_policy or build_workspace_tool_policy()
        self._loop = AgentLoop(
            model=self.llm,
            tools=RegistryToolRuntime(self.registry),
            policy=self.tool_policy,
            max_turns=max_steps,
        )

    def build_messages(
        self,
        *,
        history: list[dict[str, Any]],
        page_context: dict[str, Any] | None,
        user_message: str,
        output_locale: str = 'zh-CN',
    ) -> list[dict[str, Any]]:
        msgs: list[dict[str, Any]] = [{'role': 'system', 'content': SYSTEM_PROMPT}]
        msgs.extend(history)
        asset = get_prompt_asset('assistant.global.system')
        if asset is None:
            raise KeyError('Missing assistant prompt asset.')
        rendered = asset.render_user({
            'output_locale_instruction': output_locale_instruction({'output_locale': output_locale}),
            'user_message': user_message,
            'page_context': (
                '<page_context untrusted="true">\n'
                + json.dumps(page_context, ensure_ascii=False)
                + '\n</page_context>'
                if page_context else ''
            ),
        })
        msgs.append({'role': 'user', 'content': rendered})
        return msgs

    async def run_streaming(
        self,
        *,
        messages: list[dict[str, Any]],
        ctx: ToolContext,
    ) -> AsyncIterator[AssistantStep]:
        try:
            async for event in self._loop.run(messages=messages, context=ctx):
                step = AssistantStep(
                    type=event.type,
                    delta=event.delta,
                    name=event.name,
                    args=event.args,
                    result=event.result,
                    error=redact_text(event.error),
                    status=event.status,
                    status_code=event.status_code,
                    status_text=event.status_text,
                    usage=event.usage,
                    finish_reason=event.finish_reason,
                )
                if event.type == 'done':
                    await self._audit_step(ctx, {'usage': event.usage}, 0, event.usage)
                yield step
        except LlmUpstreamError as exc:
            logger.warning('LLM upstream error: status=%s', exc.status)
            yield AssistantStep(type='error', error=redact_text(str(exc)), status=exc.status)
        except Exception as exc:
            logger.exception('Assistant loop failed')
            yield AssistantStep(type='error', error=redact_text(str(exc)))

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

    Reuses the text-lane AIConfiguration used by generation. Missing or
    unsupported configuration is reported explicitly so the UI can guide the
    user to AI Settings instead of presenting fabricated assistant output.
    """
    # Late imports: keep this module importable without DB / settings
    # in unit tests that only touch the agent loop.
    from harness.adapters.django.routing import ModelPolicy
    from harness.adapters.providers.constants import AGNES_DEFAULT_BASE_URL, AGNES_DEFAULT_MODEL

    try:
        config = ModelPolicy.select_configuration(
            organization=organization, task_type='copy'
        )
    except Exception as exc:
        logger.exception('Assistant: failed to resolve AIConfiguration')
        raise RuntimeError(
            'AI_PROVIDER_CONFIGURATION_UNAVAILABLE: Unable to resolve the assistant provider configuration.'
        ) from exc

    api_key = config.get_api_key() if config is not None else ''
    if config is None:
        raise RuntimeError(
            'AI_PROVIDER_NOT_CONFIGURED: Configure a text provider in AI Settings before using the assistant.'
        )
    if config.provider != 'local_proxy' and not api_key:
        raise RuntimeError(
            f'AI_PROVIDER_CREDENTIALS_MISSING: Add credentials for {config.provider} in AI Settings.'
        )

    provider = config.provider
    # The streaming agent currently requires an OpenAI-compatible endpoint.
    if provider not in {'openai', 'agnes', 'local_proxy'}:
        logger.info(
            'Assistant: provider=%s is not supported by the streaming agent loop',
            provider,
        )
        raise RuntimeError(
            f'AI_PROVIDER_UNSUPPORTED_FOR_ASSISTANT: {provider} is not supported by the streaming assistant yet.'
        )

    base_url = (config.base_url or '').strip() or (
        AGNES_DEFAULT_BASE_URL if provider == 'agnes' else ''
    )
    model = (config.model_name or '').strip() or (
        AGNES_DEFAULT_MODEL if provider == 'agnes' else ''
    )
    if not base_url or not model:
        logger.warning(
            'Assistant: config %s is missing base_url/model', config.pk
        )
        raise RuntimeError(
            'AI_PROVIDER_INCOMPLETE: Configure both base URL and model name for the assistant.'
        )

    return HttpLlmClient(base_url=base_url, api_key=api_key, model=model)


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
    'StreamDelta',
    'SYSTEM_PROMPT',
    'build_assistant_agent',
    'build_assistant_llm',
]
