import { CheckCircle2 } from 'lucide-react';
import type { ContentPackage, ContentVersion } from '../generation/types';
import { useI18n } from '../../shared/i18n';

interface ReviewPageProps {
  contentPackage: ContentPackage | null;
  contentVersion: ContentVersion;
  setContentVersion: (version: ContentVersion) => void;
  setContentPackage: React.Dispatch<React.SetStateAction<ContentPackage | null>>;
  triggerToast: (text: string, type?: 'success' | 'info' | 'error') => void;
}

export function ReviewPage({
  contentPackage,
  contentVersion,
  setContentVersion,
  setContentPackage,
  triggerToast,
}: ReviewPageProps) {
  const { t } = useI18n();
  if (!contentPackage) {
    return (
      <div className="flex min-h-[360px] items-center justify-center border border-[var(--editorial-stroke)] bg-[var(--editorial-paper)] p-8 text-center">
        <div>
          <h3 className="text-sm font-black uppercase">{t('review.empty.title')}</h3>
          <p className="mt-2 text-xs text-[var(--editorial-text-gray)]">{t('review.empty.description')}</p>
        </div>
      </div>
    );
  }

  const isApproved = contentVersion === 'final';
  const versions: Array<{ id: ContentVersion; label: string }> = [
    { id: 'ai_draft', label: t('content.version.aiDraft') },
    { id: 'user_revision', label: t('content.version.userRevision') },
    { id: 'final', label: t('content.version.final') },
  ];

  const approve = () => {
    setContentVersion('final');
    setContentPackage((previous) => previous ? { ...previous, version: 'final' } : previous);
    triggerToast('内容已确认通过', 'success');
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
      <section className="bg-[var(--editorial-paper)] border-1.5 border-[var(--editorial-stroke)] p-5 shadow-editorial-sm">
        <h3 className="text-sm font-black uppercase mb-4">待审核内容</h3>
        <div className="border border-[var(--editorial-stroke)] p-4 space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-xs font-black">{contentPackage.title}</span>
            <span className="text-[9px] border border-[var(--editorial-stroke)] px-2 py-0.5">
              {isApproved ? t('review.status.approved') : t('review.status.pending')}
            </span>
          </div>
          <p className="text-xs text-[var(--editorial-text-gray)] leading-6">{contentPackage.body}</p>
          <div className="flex items-center gap-1.5 text-[10px] font-black uppercase text-[var(--editorial-text-gray)]">
            <CheckCircle2 className="h-3.5 w-3.5 text-[var(--neoGreen)]" />
            {isApproved ? '已完成人工确认，可继续保存或发布' : '请检查内容后手动确认最终稿'}
          </div>
          {!isApproved ? (
            <button type="button" onClick={approve} className="btn-editorial-primary px-3 py-2 text-[10px] font-black uppercase">
              {t('review.approve')}
            </button>
          ) : null}
        </div>
      </section>
      <section className="bg-[var(--editorial-paper)] border-1.5 border-[var(--editorial-stroke)] p-5 shadow-editorial-sm">
        <h3 className="text-sm font-black uppercase mb-4">版本对比</h3>
        <div className="grid grid-cols-1 gap-3 text-xs">
          {versions.map((version) => (
            <div
              key={version.id}
              className={`border p-3 ${
                contentVersion === version.id
                  ? 'border-[var(--editorial-stroke)] bg-[var(--editorial-bg)]/40'
                  : 'border-[var(--editorial-stroke)]/40'
              }`}
            >
              <div className="font-black mb-1">{version.label}</div>
              <p className="text-[var(--editorial-text-gray)] line-clamp-2">{contentPackage.body}</p>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
