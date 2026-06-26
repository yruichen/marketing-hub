import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Boxes, Clock3, FolderKanban, Loader2, Search, Sparkles } from 'lucide-react';
import { apiGet } from '../../hooks/useApi';
import type { AssetRecord, GenerationTaskRecord, ProjectRecord } from '../../types/workspace';
import { buildGlobalSearchResults } from './globalSearch';
import type { GlobalSearchPayload, GlobalSearchResult } from './types';

interface AssetsSearchResponse {
  items: AssetRecord[];
}

interface GlobalSearchBoxProps {
  organizationSlug?: string;
  recentTasks: GenerationTaskRecord[];
  value: string;
  onChange: (value: string) => void;
  onSelect: (result: GlobalSearchResult) => void;
}

const iconByKind = {
  project: FolderKanban,
  asset: Boxes,
  task: Clock3,
  action: Sparkles,
};

const labelByKind = {
  project: '项目',
  asset: '资产',
  task: '任务',
  action: '动作',
};

const PANEL_MAX_WIDTH = 420;
const PANEL_VIEWPORT_PADDING = 12;

interface PanelPosition {
  left: number;
  top: number;
  width: number;
}

export function GlobalSearchBox({
  organizationSlug,
  recentTasks,
  value,
  onChange,
  onSelect,
}: GlobalSearchBoxProps) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [projects, setProjects] = useState<ProjectRecord[]>([]);
  const [assets, setAssets] = useState<AssetRecord[]>([]);
  const [activeIndex, setActiveIndex] = useState(0);
  const [panelPosition, setPanelPosition] = useState<PanelPosition>({
    left: PANEL_VIEWPORT_PADDING,
    top: 0,
    width: PANEL_MAX_WIDTH,
  });
  const rootRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const query = value.trim();

  const updatePanelPosition = useCallback(() => {
    const rect = inputRef.current?.getBoundingClientRect();
    if (!rect) return;

    const width = Math.min(Math.max(rect.width, PANEL_MAX_WIDTH), window.innerWidth - PANEL_VIEWPORT_PADDING * 2);
    const maxLeft = window.innerWidth - width - PANEL_VIEWPORT_PADDING;
    const left = Math.min(Math.max(PANEL_VIEWPORT_PADDING, rect.left), maxLeft);
    setPanelPosition({
      left,
      top: rect.bottom + 8,
      width,
    });
  }, []);

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: PointerEvent) => {
      const target = event.target as Node;
      const insideInput = rootRef.current?.contains(target);
      const insidePanel = panelRef.current?.contains(target);
      if (!insideInput && !insidePanel) {
        setOpen(false);
      }
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false);
    };
    window.addEventListener('pointerdown', onPointerDown);
    window.addEventListener('keydown', onKeyDown);
    return () => {
      window.removeEventListener('pointerdown', onPointerDown);
      window.removeEventListener('keydown', onKeyDown);
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;

    const onReposition = () => updatePanelPosition();
    window.addEventListener('resize', onReposition);
    window.addEventListener('scroll', onReposition, true);
    return () => {
      window.removeEventListener('resize', onReposition);
      window.removeEventListener('scroll', onReposition, true);
    };
  }, [open, updatePanelPosition]);

  useEffect(() => {
    if (!organizationSlug || query.length < 2) {
      return;
    }

    const timer = window.setTimeout(() => {
      setLoading(true);
      const params = new URLSearchParams({ organization: organizationSlug, q: query });
      const assetParams = new URLSearchParams({
        organization: organizationSlug,
        search: query,
        page: '1',
        page_size: '8',
      });
      Promise.all([
        apiGet<ProjectRecord[]>(`/projects/?${params.toString()}`).catch(() => []),
        apiGet<AssetsSearchResponse>(`/workspace/assets/?${assetParams.toString()}`).catch(() => ({ items: [] })),
      ])
        .then(([projectData, assetData]) => {
          setProjects(projectData);
          setAssets(assetData.items || []);
        })
        .finally(() => setLoading(false));
    }, 220);

    return () => window.clearTimeout(timer);
  }, [organizationSlug, query]);

  const results = useMemo(() => {
    if (query.length < 2) return [];
    const payload: GlobalSearchPayload = { projects, assets, tasks: recentTasks };
    return buildGlobalSearchResults(query, payload);
  }, [assets, projects, query, recentTasks]);
  const safeActiveIndex = results.length ? Math.min(activeIndex, results.length - 1) : 0;

  const choose = (result: GlobalSearchResult) => {
    onSelect(result);
    onChange('');
    setOpen(false);
  };

  const shouldShowPanel = open && query.length > 0;
  const searchPanel = shouldShowPanel && typeof document !== 'undefined'
    ? createPortal(
      <div
        ref={panelRef}
        className="fixed z-[7000] overflow-hidden rounded-2xl border border-[var(--border-default)] bg-[var(--surface-panel)] shadow-[var(--shadow-panel)]"
        style={{ left: panelPosition.left, top: panelPosition.top, width: panelPosition.width }}
      >
        <div className="border-b border-[var(--border-subtle)] px-3 py-2">
          <p className="text-[9px] font-black uppercase tracking-[0.16em] text-[var(--editorial-text-gray)]">Global Search</p>
          <p className="mt-0.5 truncate text-[11px] font-bold text-[var(--editorial-text)]">"{query}"</p>
        </div>
        <div className="max-h-[min(360px,calc(100vh-140px))] overflow-y-auto p-2">
          {results.length ? results.map((result, index) => {
            const Icon = iconByKind[result.kind];
            return (
              <button
                key={result.id}
                type="button"
                onMouseEnter={() => setActiveIndex(index)}
                onClick={() => choose(result)}
                className={`flex w-full items-start gap-2 rounded-xl border px-2 py-2 text-left transition ${
                  safeActiveIndex === index
                    ? 'border-[var(--brand-accent-strong)] bg-[var(--brand-accent-soft)]'
                    : 'border-transparent hover:border-[var(--border-subtle)] hover:bg-[var(--surface-hover)]'
                }`}
              >
                <span className="mt-0.5 inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-lg border border-[var(--border-subtle)] bg-[var(--surface-elevated)]">
                  <Icon className="h-3.5 w-3.5" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="flex min-w-0 items-center gap-2">
                    <span className="truncate text-[11px] font-black text-[var(--editorial-text)]">{result.label}</span>
                    <span className="shrink-0 rounded-full border border-[var(--border-subtle)] px-1.5 py-0.5 text-[8px] font-black text-[var(--editorial-text-gray)]">{labelByKind[result.kind]}</span>
                  </span>
                  <span className="mt-0.5 line-clamp-2 block text-[10px] font-semibold leading-4 text-[var(--editorial-text-gray)]">{result.description}</span>
                </span>
              </button>
            );
          }) : (
            <div className="rounded-xl border border-dashed border-[var(--border-subtle)] bg-[var(--surface-elevated)] px-3 py-5 text-center">
              <Search className="mx-auto h-5 w-5 text-[var(--editorial-text-gray)]" />
              <p className="mt-2 text-xs font-black text-[var(--editorial-text)]">没有匹配结果</p>
              <p className="mt-1 text-[10px] leading-4 text-[var(--editorial-text-gray)]">试试项目名、资产标题、任务编号或功能名称。</p>
            </div>
          )}
        </div>
      </div>,
      document.body,
    )
    : null;

  return (
    <div ref={rootRef} className="relative hidden lg:block w-[220px] xl:w-[280px]">
      <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-[var(--editorial-text-gray)]" aria-hidden="true" />
      <input
        ref={inputRef}
        value={value}
        onChange={(event) => {
          onChange(event.target.value);
          setActiveIndex(0);
          updatePanelPosition();
          setOpen(true);
        }}
        onFocus={() => {
          updatePanelPosition();
          setOpen(true);
        }}
        onKeyDown={(event) => {
          if (!open) return;
          if (event.key === 'ArrowDown') {
            event.preventDefault();
            setActiveIndex((index) => Math.min(results.length - 1, index + 1));
          }
          if (event.key === 'ArrowUp') {
            event.preventDefault();
            setActiveIndex((index) => Math.max(0, index - 1));
          }
          if (event.key === 'Enter' && results[safeActiveIndex]) {
            event.preventDefault();
            choose(results[safeActiveIndex]);
          }
        }}
        className="h-8 w-full rounded-lg bg-[var(--surface-elevated)] border border-[var(--border-default)] pl-8 pr-8 text-[10px] focus:outline-none focus:border-[var(--brand-accent-strong)]"
        placeholder="搜索项目、资产、任务..."
        aria-label="全局搜索"
      />
      {loading ? <Loader2 className="absolute right-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 animate-spin text-[var(--info-accent)]" /> : null}
      {searchPanel}
    </div>
  );
}
