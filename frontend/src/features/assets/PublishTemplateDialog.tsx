import { useState } from 'react';
import { MessageCircle, Share2, X } from 'lucide-react';

interface PublishTemplateDialogProps {
  open: boolean;
  assetTitle: string;
  loading?: boolean;
  onClose: () => void;
  onConfirm: (creatorNote: string) => void;
}

function PublishTemplateDialogForm({
  assetTitle,
  loading = false,
  onClose,
  onConfirm,
}: Omit<PublishTemplateDialogProps, 'open'>) {
  const [creatorNote, setCreatorNote] = useState('');

  return (
    <div className="publish-template-dialog__backdrop" onClick={onClose}>
      <div className="publish-template-dialog" onClick={(e) => e.stopPropagation()}>
        <header>
          <div>
            <span className="publish-template-dialog__eyebrow">发布到模板库</span>
            <h3>{assetTitle}</h3>
          </div>
          <button type="button" onClick={onClose} aria-label="关闭">
            <X className="h-4 w-4" />
          </button>
        </header>
        <p className="publish-template-dialog__hint">
          发布后团队成员可在模板库浏览复用。可附上作者留言，帮助他人理解使用场景。
        </p>
        <label className="publish-template-dialog__field">
          <span>
            <MessageCircle className="h-3.5 w-3.5 inline mr-1" />
            作者留言（可选）
          </span>
          <textarea
            value={creatorNote}
            onChange={(e) => setCreatorNote(e.target.value)}
            placeholder="例如：适合小红书新品种草，建议搭配产品实拍图使用…"
            rows={4}
            maxLength={500}
          />
        </label>
        <footer>
          <button type="button" onClick={onClose} disabled={loading}>取消</button>
          <button
            type="button"
            className="is-primary"
            disabled={loading}
            onClick={() => onConfirm(creatorNote.trim())}
          >
            <Share2 className="h-3.5 w-3.5" />
            {loading ? '发布中…' : '确认发布'}
          </button>
        </footer>
      </div>
    </div>
  );
}

export function PublishTemplateDialog({ open, ...props }: PublishTemplateDialogProps) {
  if (!open) return null;
  return <PublishTemplateDialogForm key={props.assetTitle} {...props} />;
}
