import type { ReactNode } from 'react';
import { JournalSpine } from './JournalSpine';

interface JournalBookProps {
  open: boolean;
  cover: ReactNode;
  page: ReactNode;
}

/**
 * 3D 翻页编排：
 *   父容器加 perspective 让 rotateY 真的"翻"起来。
 *   封面沿左侧书脊 transform-origin: left center，从 0° 翻到 -180°。
 *   翻完后通过 open 状态彻底隐藏封面（避免 z 闪烁 + 镜像字）。
 *   内页始终可点击，不参与翻页。
 *   书脊是单独一层绝对定位，不随封面 rotate。
 */
export function JournalBook({ open, cover, page }: JournalBookProps) {
  return (
    <div className="journal-stage w-full max-w-md">
      <div className="journal-book">
        <JournalSpine side="left" />
        <JournalSpine side="right" />

        <div
          className={`journal-flip ${open ? 'journal-flip--open' : ''}`}
          aria-hidden={open}
        >
          {cover}
        </div>

        <div className="journal-page-slot">{page}</div>
      </div>
    </div>
  );
}
