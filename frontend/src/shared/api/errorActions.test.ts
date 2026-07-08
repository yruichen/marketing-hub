import { describe, expect, it } from 'vitest';
import { ApiError } from './errors';
import { resolveErrorActions, resolveErrorActionsFromRaw } from './errorActions';

describe('error action resolver', () => {
  it('maps quota codes to billing and ai config navigation', () => {
    const actions = resolveErrorActions({
      title: '额度不足',
      message: '今日生成额度已用完。',
      code: 'GENERATION_BUDGET_EXCEEDED',
    });
    expect(actions.map((a) => a.id)).toEqual(['open_billing', 'open_ai_config']);
    expect(actions[0]?.section).toBe('billing');
  });

  it('maps project limit to projects and billing', () => {
    const actions = resolveErrorActions({
      title: '项目上限',
      message: '项目数已达上限。',
      code: 'PROJECT_LIMIT_REACHED',
    });
    expect(actions.map((a) => a.id)).toEqual(['open_projects', 'open_billing']);
  });

  it('adds consent action when response requires_consent', () => {
    const err = new ApiError(
      {
        title: '需要先同意条款',
        message: '请先同意最新政策。',
        code: 'POLICY_CONSENT_REQUIRED',
      },
      403,
      '/community/creations/',
      undefined,
      { requires_consent: true },
    );
    const actions = resolveErrorActionsFromRaw(err);
    expect(actions.some((a) => a.id === 'accept_policies')).toBe(true);
  });
});
