import type { AppSection } from '../stores/uiStore';
import {
  formatContextualErrorForToast,
  formatErrorForToast,
  getUserFacingError,
  isApiError,
  type UserFacingError,
} from './errors';
import type { ToastMessage } from '../types/toast';

/** Stable action ids used by toast buttons and recovery links. */
export type ErrorActionId =
  | 'open_billing'
  | 'open_ai_config'
  | 'open_projects'
  | 'open_dashboard'
  | 'accept_policies'
  | 'refresh_page';

export interface ErrorAction {
  id: ErrorActionId;
  label: string;
  /** Primary CTA — shown as filled button in toast. */
  primary?: boolean;
  /** Target tab when id maps to in-app navigation. */
  section?: AppSection;
}

const CODE_ACTIONS: Record<string, ErrorAction[]> = {
  GENERATION_BUDGET_EXCEEDED: [
    { id: 'open_billing', label: '查看订阅方案', primary: true, section: 'billing' },
    { id: 'open_ai_config', label: '配置自有 API Key', section: 'config' },
  ],
  GENERATION_CREDITS_INSUFFICIENT: [
    { id: 'open_billing', label: '查看额度与计费', primary: true, section: 'billing' },
    { id: 'open_ai_config', label: '配置自有 API Key', section: 'config' },
  ],
  PAYMENT_REQUIRED: [
    { id: 'open_billing', label: '查看订阅方案', primary: true, section: 'billing' },
  ],
  PROJECT_LIMIT_REACHED: [
    { id: 'open_projects', label: '管理项目', primary: true, section: 'projects' },
    { id: 'open_billing', label: '升级订阅', section: 'billing' },
  ],
  POLICY_CONSENT_REQUIRED: [
    { id: 'accept_policies', label: '同意并继续', primary: true },
  ],
  AUTH_REQUIRED: [
    { id: 'refresh_page', label: '刷新并重新登录', primary: true },
  ],
  PERMISSION_DENIED: [
    { id: 'open_dashboard', label: '返回首页', primary: true, section: 'dashboard' },
  ],
};

const RECOVERY_TEXT_ACTIONS: Array<{ patterns: RegExp[]; action: ErrorAction }> = [
  { patterns: [/计费|订阅|额度|余额|升级/i], action: { id: 'open_billing', label: '查看订阅方案', primary: true, section: 'billing' } },
  { patterns: [/AI 设置|api key|密钥|模型配置|切换模型/i], action: { id: 'open_ai_config', label: '打开 AI 设置', primary: true, section: 'config' } },
  { patterns: [/同意并继续|条款|隐私政策/i], action: { id: 'accept_policies', label: '同意并继续', primary: true } },
  { patterns: [/归档|项目数|创建项目/i], action: { id: 'open_projects', label: '管理项目', primary: true, section: 'projects' } },
  { patterns: [/重新登录|登录状态/i], action: { id: 'refresh_page', label: '刷新页面', primary: true } },
  { patterns: [/任务中心|查看队列/i], action: { id: 'open_dashboard', label: '打开任务中心', section: 'dashboard' } },
];

const HTTP_STATUS_ACTIONS: Record<number, ErrorAction[]> = {
  401: [{ id: 'refresh_page', label: '刷新并重新登录', primary: true }],
  402: [{ id: 'open_billing', label: '查看订阅方案', primary: true, section: 'billing' }],
  403: [{ id: 'open_dashboard', label: '返回首页', section: 'dashboard' }],
};

function dedupeActions(actions: ErrorAction[]): ErrorAction[] {
  const seen = new Set<ErrorActionId>();
  return actions.filter((action) => {
    if (seen.has(action.id)) return false;
    seen.add(action.id);
    return true;
  });
}

function actionsFromRecoveryText(recoveryActions?: string[]): ErrorAction[] {
  if (!recoveryActions?.length) return [];
  const result: ErrorAction[] = [];
  for (const text of recoveryActions) {
    for (const item of RECOVERY_TEXT_ACTIONS) {
      if (item.patterns.some((pattern) => pattern.test(text))) {
        result.push(item.action);
      }
    }
  }
  return result;
}

function requiresConsentFromError(raw: unknown): boolean {
  if (!isApiError(raw)) return false;
  const body = raw.rawBody;
  if (!body || typeof body !== 'object') return false;
  return Boolean((body as Record<string, unknown>).requires_consent);
}

export function resolveErrorActions(
  facing: UserFacingError,
  raw?: unknown,
): ErrorAction[] {
  const actions: ErrorAction[] = [];

  if (facing.code && CODE_ACTIONS[facing.code]) {
    actions.push(...CODE_ACTIONS[facing.code]);
  }

  if (requiresConsentFromError(raw) && !actions.some((a) => a.id === 'accept_policies')) {
    actions.push({ id: 'accept_policies', label: '同意并继续', primary: true });
  }

  actions.push(...actionsFromRecoveryText(facing.recoveryActions));

  if (isApiError(raw) && HTTP_STATUS_ACTIONS[raw.status]) {
    actions.push(...HTTP_STATUS_ACTIONS[raw.status]);
  }

  return dedupeActions(actions).slice(0, 3);
}

export function resolveErrorActionsFromRaw(raw: unknown, context?: string): ErrorAction[] {
  const facing = getUserFacingError(raw, context ? { message: context } : undefined);
  return resolveErrorActions(facing, raw);
}

export function primaryErrorAction(actions: ErrorAction[]): ErrorAction | undefined {
  return actions.find((action) => action.primary) || actions[0];
}

export function buildErrorToast(
  raw: unknown,
  context?: string,
  fallbackMessage = '请稍后重试',
): ToastMessage {
  const facing = getUserFacingError(raw, { message: fallbackMessage });
  const text = context
    ? formatContextualErrorForToast(raw, context, fallbackMessage)
    : formatErrorForToast(raw, fallbackMessage);
  const actions = resolveErrorActions(facing, raw);
  return {
    text,
    type: 'error',
    actions: actions.length ? actions : undefined,
  };
}
