import { Bot, X } from 'lucide-react';
import { useAssistant } from './useAssistant';
import './assistant.css';

/**
 * Floating bubble (bottom-right). Click to toggle the assistant drawer.
 * Icon flips to X when the drawer is open.
 */
export function AssistantBubble() {
  const { open, setOpen } = useAssistant();
  return (
    <button
      type="button"
      className={`assistant-bubble ${open ? 'assistant-bubble--open' : ''}`}
      onClick={() => setOpen(!open)}
      aria-label={open ? '关闭 AI 助手' : '打开 AI 助手'}
      title={open ? '关闭 AI 助手' : 'Marketing-Hub 助手'}
    >
      {open ? <X className="h-5 w-5" /> : <Bot className="h-6 w-6" />}
    </button>
  );
}
