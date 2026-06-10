import { FolderPlus } from 'lucide-react';
import { useState } from 'react';

interface CreateFolderFormProps {
  onCreate: (name: string) => Promise<void> | void;
  loading: boolean;
  defaultName?: string;
}

/**
 * 简化的文件夹创建表单：单输入 + 按钮。
 * 不持有错误状态——错误由 toast 通道统一提示（避免表单内部状态机）。
 */
export function CreateFolderForm({ onCreate, loading, defaultName = '默认文件夹' }: CreateFolderFormProps) {
  const [name, setName] = useState(defaultName);

  return (
    <div className="flex items-center gap-2">
      <input
        value={name}
        onChange={(e) => setName(e.target.value)}
        placeholder="新文件夹名称"
        className="desktop-inspector__input flex-1"
        disabled={loading}
      />
      <button
        type="button"
        onClick={() => onCreate(name)}
        disabled={loading || !name.trim()}
        className="desktop-toolbar__btn desktop-toolbar__btn--primary"
        title="创建文件夹"
        aria-label="创建文件夹"
      >
        <FolderPlus className="h-3.5 w-3.5" />
        创建
      </button>
    </div>
  );
}
