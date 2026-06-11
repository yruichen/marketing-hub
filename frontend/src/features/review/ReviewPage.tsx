import { CheckCircle2 } from 'lucide-react';
import type { ContentPackage } from '../generation/types';

interface ReviewPageProps {
  contentPackage: ContentPackage;
  contentVersion: 'AI 初稿' | '用户修改稿' | '最终稿';
  setContentVersion: (version: 'AI 初稿' | '用户修改稿' | '最终稿') => void;
  setContentPackage: React.Dispatch<React.SetStateAction<ContentPackage>>;
  triggerToast: (text: string, type?: 'success' | 'info' | 'error') => void;
}

export function ReviewPage({
  contentPackage,
  contentVersion,
  setContentVersion,
  setContentPackage,
  triggerToast,
}: ReviewPageProps) {
  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
      <section className="bg-[var(--editorial-paper)] border-1.5 border-[var(--editorial-stroke)] p-5 shadow-editorial-sm">
        <h3 className="text-sm font-black uppercase mb-4">待审核内容</h3>
        <div className="border border-[var(--editorial-stroke)] p-4 space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-xs font-black">{contentPackage.title}</span>
            <span className="text-[9px] border border-[var(--editorial-stroke)] px-2 py-0.5">待确认</span>
          </div>
          <p className="text-xs text-[var(--editorial-text-gray)] leading-6">{contentPackage.body}</p>
          <button
            type="button"
            onClick={() => {
              setContentVersion('最终稿');
              setContentPackage((prev) => ({ ...prev, version: '最终稿' }));
              triggerToast('已标记为最终稿', 'success');
            }}
            className="btn-editorial-primary px-3 py-2 text-[10px] font-black uppercase flex items-center gap-1.5"
          >
            <CheckCircle2 className="h-3.5 w-3.5" />
            通过审阅
          </button>
        </div>
      </section>
      <section className="bg-[var(--editorial-paper)] border-1.5 border-[var(--editorial-stroke)] p-5 shadow-editorial-sm">
        <h3 className="text-sm font-black uppercase mb-4">版本对比</h3>
        <div className="grid grid-cols-1 gap-3 text-xs">
          {['AI 初稿', '用户修改稿', '最终稿'].map((version) => (
            <div
              key={version}
              className={`border p-3 ${
                contentVersion === version
                  ? 'border-[var(--editorial-stroke)] bg-[var(--editorial-bg)]/40'
                  : 'border-[var(--editorial-stroke)]/40'
              }`}
            >
              <div className="font-black mb-1">{version}</div>
              <p className="text-[var(--editorial-text-gray)] line-clamp-2">{contentPackage.body}</p>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}