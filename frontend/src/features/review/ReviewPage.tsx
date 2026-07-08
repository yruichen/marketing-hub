import { useEffect, useRef } from 'react';
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
  const autoConfirmedKey = useRef<string>('');

  useEffect(() => {
    const key = `${contentPackage.title}::${contentPackage.body}`;
    if (autoConfirmedKey.current === key) return;
    autoConfirmedKey.current = key;
    setContentVersion('最终稿');
    setContentPackage((prev) => ({ ...prev, version: '最终稿' }));
    triggerToast('内容已自动确认通过', 'success');
  }, [contentPackage.title, contentPackage.body, setContentPackage, setContentVersion, triggerToast]);

  const isApproved = contentVersion === '最终稿';

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
      <section className="bg-[var(--editorial-paper)] border-1.5 border-[var(--editorial-stroke)] p-5 shadow-editorial-sm">
        <h3 className="text-sm font-black uppercase mb-4">待审核内容</h3>
        <div className="border border-[var(--editorial-stroke)] p-4 space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-xs font-black">{contentPackage.title}</span>
            <span className="text-[9px] border border-[var(--editorial-stroke)] px-2 py-0.5">
              {isApproved ? '已自动确认' : '确认中'}
            </span>
          </div>
          <p className="text-xs text-[var(--editorial-text-gray)] leading-6">{contentPackage.body}</p>
          <div className="flex items-center gap-1.5 text-[10px] font-black uppercase text-[var(--editorial-text-gray)]">
            <CheckCircle2 className="h-3.5 w-3.5 text-[var(--neoGreen)]" />
            人工确认默认通过，可直接保存或发布
          </div>
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
