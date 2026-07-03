export function nodeStatusClass(status?: string) {
  if (status === 'running') return 'border-blue-500 bg-blue-50 dark:bg-blue-950/20';
  if (status === 'succeeded') return 'border-emerald-500 bg-emerald-50 dark:bg-emerald-950/20';
  if (status === 'failed') return 'border-rose-500 bg-rose-50 dark:bg-rose-950/20';
  if (status === 'queued') return 'border-yellow-500 bg-yellow-50 dark:bg-yellow-950/20';
  if (status === 'skipped') return 'border-zinc-400 bg-zinc-100 dark:bg-zinc-900/40';
  return 'border-[var(--editorial-stroke)] bg-[var(--editorial-paper)]';
}

export function nodeStatusDotClass(status?: string) {
  if (status === 'running') return 'bg-blue-500';
  if (status === 'succeeded') return 'bg-emerald-500';
  if (status === 'failed') return 'bg-rose-500';
  if (status === 'queued') return 'bg-yellow-500';
  if (status === 'skipped') return 'bg-zinc-500';
  return 'bg-[var(--editorial-text-gray)]';
}

export type NodeOutputDisplay =
  | { kind: 'empty'; text: string }
  | { kind: 'text'; text: string }
  | { kind: 'copy'; title?: string; body: string; tags?: string[] }
  | { kind: 'image'; text: string; imageUrl: string }
  | { kind: 'video'; text: string; videoUrl: string; thumbnailUrl?: string }
  | { kind: 'audio'; text: string; audioUrl: string }
  | { kind: 'review'; text: string; issueCount: number; score?: string };

export type WorkflowPreviewItem = {
  id: string;
  kind: 'image' | 'video' | 'audio' | 'text' | 'asset';
  label: string;
  url?: string;
  text?: string;
};

function unwrapOutput(output?: Record<string, unknown>): Record<string, unknown> | undefined {
  if (!output) return output;
  const data = output.data;
  if (data && typeof data === 'object' && !Array.isArray(data)) return data as Record<string, unknown>;
  const result = output.result;
  if (result && typeof result === 'object' && !Array.isArray(result)) return result as Record<string, unknown>;
  return output;
}

function findString(output: Record<string, unknown>, keys: string[]): string {
  for (const key of keys) {
    const value = output[key];
    if (typeof value === 'string' && value.trim()) return value.trim();
    if (value && typeof value === 'object' && !Array.isArray(value)) {
      const nested = findString(value as Record<string, unknown>, keys);
      if (nested) return nested;
    }
  }
  return '';
}

function findStrings(output: Record<string, unknown> | undefined, keys: string[], limit = 8): string[] {
  if (!output) return [];
  const found: string[] = [];
  const visit = (value: unknown) => {
    if (found.length >= limit) return;
    if (typeof value === 'string' && value.trim()) {
      found.push(value.trim());
      return;
    }
    if (Array.isArray(value)) {
      for (const item of value) visit(item);
      return;
    }
    if (value && typeof value === 'object') {
      const record = value as Record<string, unknown>;
      for (const key of keys) {
        if (record[key] != null) visit(record[key]);
      }
      for (const nested of Object.values(record)) {
        if (found.length >= limit) break;
        if (nested && typeof nested === 'object') visit(nested);
      }
    }
  };
  for (const key of keys) visit(output[key]);
  return [...new Set(found)].slice(0, limit);
}

function pickOutputText(output: Record<string, unknown>): string | null {
  const textKeys = ['body', 'prompt', 'response', 'title', 'summary', 'revised_prompt', 'voiceover', 'text'];
  for (const key of textKeys) {
    const value = output[key];
    if (typeof value === 'string' && value.trim()) return value.trim();
  }
  if (Array.isArray(output.paragraphs) && output.paragraphs.length > 0) {
    return (output.paragraphs as string[]).filter(Boolean).join('\n');
  }
  if (Array.isArray(output.scenes) && output.scenes.length > 0) {
    return `已生成 ${output.scenes.length} 个分镜场景`;
  }
  if (Array.isArray(output.shots) && output.shots.length > 0) {
    return `已生成 ${output.shots.length} 个分镜镜头`;
  }
  if (typeof output.video_url === 'string' && output.video_url) {
    const seconds = output.duration_seconds;
    return seconds ? `已生成 ${seconds} 秒视频` : '已生成视频';
  }
  if (Array.isArray(output.insights) && output.insights.length > 0) {
    return (output.insights as string[]).slice(0, 3).join(' · ');
  }
  if (typeof output.audio_url === 'string' && output.audio_url) return '已生成音频，可在属性面板查看';
  if (output.brand_consistency != null) return `品牌一致性评分：${output.brand_consistency}`;
  return null;
}

export function resolveNodeOutputDisplay(
  output?: Record<string, unknown>,
  status?: string,
): NodeOutputDisplay {
  const resolved = unwrapOutput(output);
  const videoUrl = resolved ? findString(resolved, ['video_url']) : '';
  if (videoUrl) {
    const thumbnailUrl = resolved ? findString(resolved, ['thumbnail_url', 'poster_url']) || undefined : undefined;
    const seconds = resolved?.duration_seconds;
    return {
      kind: 'video',
      text: seconds ? `已生成 ${seconds} 秒视频` : '已生成视频',
      videoUrl,
      thumbnailUrl,
    };
  }

  const imageUrl = resolved ? findString(resolved, ['image_url', 'source_url', 'url']) : '';
  if (imageUrl) {
    const revisedPrompt = resolved ? findString(resolved, ['revised_prompt', 'prompt', 'prompt_zh']) : '';
    return { kind: 'image', text: revisedPrompt || '已生成图片', imageUrl };
  }

  const audioUrl = resolved ? findString(resolved, ['audio_url']) : '';
  if (audioUrl) {
    const text = resolved ? findString(resolved, ['text', 'voiceover', 'summary']) : '';
    return { kind: 'audio', text: text || '已生成音频', audioUrl };
  }

  if (resolved?.brand_consistency != null || resolved?.sensitive_word_issues || resolved?.channel_rules) {
    const issues = [
      ...(Array.isArray(resolved.sensitive_word_issues) ? resolved.sensitive_word_issues : []),
      ...(Array.isArray(resolved.channel_rules) ? resolved.channel_rules : []),
    ];
    return {
      kind: 'review',
      text: issues.length ? `发现 ${issues.length} 个风险项` : '未发现明显风险',
      issueCount: issues.length,
      score: resolved.brand_consistency != null ? String(resolved.brand_consistency) : undefined,
    };
  }

  if (resolved && (typeof resolved.title === 'string' || Array.isArray(resolved.paragraphs) || typeof resolved.body === 'string')) {
    const title = typeof resolved.title === 'string' ? resolved.title : undefined;
    const body = typeof resolved.body === 'string'
      ? resolved.body
      : Array.isArray(resolved.paragraphs)
      ? (resolved.paragraphs as string[]).filter(Boolean).join('\n')
      : findString(resolved, ['text', 'summary']);
    const tags = Array.isArray(resolved.tags) ? (resolved.tags as string[]).filter(Boolean).slice(0, 5) : undefined;
    if (body || title) return { kind: 'copy', title, body: body || title || '', tags };
  }

  const text = resolved ? pickOutputText(resolved) : null;
  if (text) return { kind: 'text', text };

  if (status === 'running') return { kind: 'empty', text: '生成中…' };
  if (status === 'queued') return { kind: 'empty', text: '排队等待…' };
  if (status === 'failed') {
    const err = resolved?.error ?? resolved?.error_message;
    return { kind: 'text', text: err ? String(err) : '生成失败，请检查配置后重试' };
  }
  if (resolved && Object.keys(resolved).length > 0) {
    const compact = JSON.stringify(resolved);
    if (compact.length > 2) return { kind: 'text', text: compact.slice(0, 240) };
  }
  return { kind: 'empty', text: '运行后在此显示结果' };
}

export function buildWorkflowPreviewItems(
  output?: Record<string, unknown>,
  config?: Record<string, unknown>,
): WorkflowPreviewItem[] {
  const resolved = unwrapOutput(output);
  const items: WorkflowPreviewItem[] = [];
  const add = (item: WorkflowPreviewItem) => {
    if (items.some((existing) => existing.kind === item.kind && existing.url === item.url && existing.text === item.text)) return;
    items.push(item);
  };

  findStrings(resolved, ['image_url', 'source_url', 'thumbnail_url', 'poster_url', 'url'], 6).forEach((url, index) => {
    const lower = url.toLowerCase();
    if (lower.match(/\.(mp4|mov|webm)(\?|$)/)) return;
    if (lower.match(/\.(mp3|wav|m4a|ogg)(\?|$)/)) return;
    add({ id: `image-${index}-${url}`, kind: 'image', label: `图片 ${index + 1}`, url });
  });

  findStrings(resolved, ['video_url'], 4).forEach((url, index) => {
    add({ id: `video-${index}-${url}`, kind: 'video', label: `视频 ${index + 1}`, url });
  });

  findStrings(resolved, ['audio_url'], 4).forEach((url, index) => {
    add({ id: `audio-${index}-${url}`, kind: 'audio', label: `音频 ${index + 1}`, url });
  });

  const referenceUrls = Array.isArray(config?.reference_urls)
    ? config.reference_urls.filter((url): url is string => typeof url === 'string' && !!url.trim())
    : [];
  referenceUrls.slice(0, 8).forEach((url, index) => {
    add({ id: `reference-${index}-${url}`, kind: 'image', label: `参考 ${index + 1}`, url: url.trim() });
  });

  const assetIds = Array.isArray(config?.asset_ids)
    ? config.asset_ids.filter((id): id is number => typeof id === 'number')
    : [];
  assetIds.slice(0, 8).forEach((id) => {
    add({ id: `asset-${id}`, kind: 'asset', label: `Asset #${id}` });
  });

  const display = resolveNodeOutputDisplay(output);
  if (items.length === 0 && display.kind === 'copy') {
    add({ id: 'copy-output', kind: 'text', label: display.title || '文案', text: display.body });
  } else if (items.length === 0 && display.kind === 'text') {
    add({ id: 'text-output', kind: 'text', label: '文本', text: display.text });
  } else if (items.length === 0 && display.kind === 'review') {
    add({ id: 'review-output', kind: 'text', label: '审阅', text: display.text });
  }

  return items.slice(0, 8);
}

export function workflowNodeRunStepLabel(status?: string) {
  if (status === 'running') return '正在生成';
  if (status === 'queued') return '等待上游';
  if (status === 'succeeded') return '已完成';
  if (status === 'failed') return '需要处理';
  if (status === 'skipped') return '已跳过';
  return '待配置';
}

export function summarizeOutput(output?: Record<string, unknown>) {
  const display = resolveNodeOutputDisplay(output);
  if (display.kind === 'copy') return display.title ? `${display.title} · ${display.body}` : display.body;
  return display.text;
}

export function compactOutput(output?: Record<string, unknown>) {
  return summarizeOutput(output);
}

export function schemaText(schema?: Record<string, string>) {
  if (!schema || Object.keys(schema).length === 0) return '无';
  return Object.entries(schema)
    .map(([key, value]) => `${key}: ${value}`)
    .join(' / ');
}

export function schemasCompatible(source?: Record<string, string>, target?: Record<string, string>) {
  const sourceTypes = new Set(Object.values(source || {}));
  const targetTypes = new Set(Object.values(target || {}));
  if (sourceTypes.size === 0 || targetTypes.size === 0) return true;
  if (sourceTypes.has('Any') || targetTypes.has('Any')) return true;
  if (sourceTypes.has('String') && targetTypes.has('String')) return true;
  if (sourceTypes.has('String[]') && targetTypes.has('String[]')) return true;
  if (sourceTypes.has('Object') && targetTypes.has('Object')) return true;
  return [...sourceTypes].some((item) => targetTypes.has(item));
}

export function workflowExecutionOrder<T extends { id: string }>(
  nodes: T[],
  edges: Array<{ source: string; target: string }>,
): T[] {
  const nodeById = new Map(nodes.map((node) => [node.id, node]));
  const inDegree = new Map(nodes.map((node) => [node.id, 0]));
  const adj = new Map(nodes.map((node) => [node.id, [] as string[]]));
  for (const edge of edges) {
    if (!nodeById.has(edge.source) || !nodeById.has(edge.target)) continue;
    adj.get(edge.source)?.push(edge.target);
    inDegree.set(edge.target, (inDegree.get(edge.target) || 0) + 1);
  }
  const queue = nodes.filter((node) => (inDegree.get(node.id) || 0) === 0).map((node) => node.id);
  const order: T[] = [];
  while (queue.length > 0) {
    const id = queue.shift()!;
    const node = nodeById.get(id);
    if (node) order.push(node);
    for (const next of adj.get(id) || []) {
      const degree = (inDegree.get(next) || 0) - 1;
      inDegree.set(next, degree);
      if (degree === 0) queue.push(next);
    }
  }
  for (const node of nodes) {
    if (!order.some((item) => item.id === node.id)) order.push(node);
  }
  return order;
}
