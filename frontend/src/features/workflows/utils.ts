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

export function summarizeOutput(output?: Record<string, unknown>) {
  if (!output || Object.keys(output).length === 0) return '暂无输出内容';
  if (output.title) return String(output.title).slice(0, 80);
  if (output.response) return String(output.response).slice(0, 80);
  if (Array.isArray(output.paragraphs)) return `${output.paragraphs.length} 段文案`;
  if (output.image_url) return '已生成图片';
  if (Array.isArray(output.scenes)) return `${output.scenes.length} 个场景`;
  if (output.audio_url) return '已生成音频';
  if (output.summary) return String(output.summary).slice(0, 80);
  return JSON.stringify(output).slice(0, 80) + '…';
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
