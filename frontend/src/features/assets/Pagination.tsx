import { ChevronLeft, ChevronRight } from 'lucide-react';

interface PaginationProps {
  page: number;
  total: number;
  pageSize: number;
  onChange: (next: number) => void;
}

/**
 * 紧凑页码：首页 / 上一页 / 数字（带省略号）/ 下一页 / 末页。
 * 大数据量时不会撑爆布局（最多渲染 ~7 个按钮）。
 */
export function Pagination({ page, total, pageSize, onChange }: PaginationProps) {
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  if (totalPages <= 1) return null;

  const pages = buildPageList(page, totalPages);

  return (
    <nav className="pagination" aria-label="分页">
      <button
        type="button"
        onClick={() => onChange(1)}
        disabled={page <= 1}
        className="pagination__btn"
        aria-label="第一页"
      >
        «
      </button>
      <button
        type="button"
        onClick={() => onChange(page - 1)}
        disabled={page <= 1}
        className="pagination__btn"
        aria-label="上一页"
      >
        <ChevronLeft className="h-3 w-3" />
      </button>

      {pages.map((p, i) =>
        p === '…' ? (
          <span key={`d-${i}`} className="pagination__ellipsis">…</span>
        ) : (
          <button
            key={p}
            type="button"
            onClick={() => onChange(p)}
            className={`pagination__btn ${p === page ? 'is-active' : ''}`}
            aria-current={p === page ? 'page' : undefined}
          >
            {p}
          </button>
        ),
      )}

      <button
        type="button"
        onClick={() => onChange(page + 1)}
        disabled={page >= totalPages}
        className="pagination__btn"
        aria-label="下一页"
      >
        <ChevronRight className="h-3 w-3" />
      </button>
      <button
        type="button"
        onClick={() => onChange(totalPages)}
        disabled={page >= totalPages}
        className="pagination__btn"
        aria-label="最后一页"
      >
        »
      </button>

      <span className="pagination__summary">
        第 {page} / {totalPages} 页 · 共 {total} 个
      </span>
    </nav>
  );
}

/**
 * 构造要渲染的页码数组。当前页前后各展示 2 个，其余省略号。
 * 总是包含首页和末页。
 */
function buildPageList(current: number, total: number): (number | '…')[] {
  const out: (number | '…')[] = [];
  const around = (n: number) => Math.abs(n - current) <= 1;

  for (let p = 1; p <= total; p++) {
    if (p === 1 || p === total || around(p)) {
      out.push(p);
    } else if (out[out.length - 1] !== '…') {
      out.push('…');
    }
  }
  return out;
}
