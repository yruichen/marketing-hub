import { describe, expect, it } from 'vitest';
import {
  ApiError,
  buildUserFacingError,
  formatErrorForToast,
  formatContextualErrorForToast,
  getUserFacingError,
  parseApiErrorResponse,
} from './errors';

describe('shared api errors', () => {
  it('maps HTTP status to user-friendly copy', () => {
    const facing = buildUserFacingError({ status: 401 });
    expect(facing.title).toBe('登录已过期');
    expect(facing.action).toContain('重新登录');
  });

  it('prefers backend message over technical wrapper', () => {
    const facing = buildUserFacingError({
      status: 400,
      body: { error: '该邮箱已注册。' },
    });
    expect(facing.message).toBe('该邮箱已注册。');
  });

  it('classifies quota errors', () => {
    const facing = getUserFacingError('quota exceeded', { message: '生成失败' });
    expect(facing.title).toContain('额度');
    expect(facing.recoveryActions).toContain('查看计费页余额');
  });

  it('maps backend error codes to user-facing copy', () => {
    const facing = buildUserFacingError({
      status: 402,
      body: {
        code: 'GENERATION_BUDGET_EXCEEDED',
        message: '今日生成额度已用完。',
        action: '请明天再试。',
      },
    });
    expect(facing.code).toBe('GENERATION_BUDGET_EXCEEDED');
    expect(facing.message).toContain('额度');
  });

  it('formats toast without HTTP path noise', () => {
    const err = new ApiError(
      buildUserFacingError({ status: 402, body: { error: 'Payment Required' } }),
      402,
      '/tasks/',
    );
    const text = formatErrorForToast(err);
    expect(text).not.toContain('POST');
    expect(text).not.toContain('402');
    expect(text).toContain('额度');
  });

  it('parses JSON error responses', async () => {
    const response = new Response(JSON.stringify({ error: '用户名或密码错误。' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json' },
    });
    const err = await parseApiErrorResponse(response, '/auth/login/');
    expect(err.userFacing.message).toBe('用户名或密码错误。');
    expect(err.message).not.toContain('/auth/login/');
  });

  it('adds contextual prefix for feature-level failures', () => {
    const text = formatContextualErrorForToast(
      new ApiError(buildUserFacingError({ status: 403 }), 403),
      '项目创建失败',
      '请稍后重试',
    );
    expect(text).toContain('项目创建失败');
    expect(text).not.toContain('403');
  });
});
