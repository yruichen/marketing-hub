/**
 * 全站统一的 API / 运行时错误解析与用户可读文案。
 * 技术细节（HTTP 路径、状态码、原始 JSON）不直接展示给用户。
 */

export type ApiErrorDebug = {
  detail?: string;
  exception?: string;
  status?: number;
  request_id?: string;
  legacy?: unknown;
};

export type UserFacingError = {
  title: string;
  message: string;
  action?: string;
  detail?: string;
  code?: string;
  retryable?: boolean;
  recoveryActions?: string[];
};

/** Backend stable codes mirrored from `api/errors.py`. */
const BACKEND_CODE_COPY: Record<string, Partial<UserFacingError>> = {
  VALIDATION_ERROR: {
    title: '请求无效',
    message: '提交的信息有误或缺少必填项。',
    action: '请检查标红字段后重试。',
  },
  AUTH_REQUIRED: {
    title: '登录已过期',
    message: '需要先登录才能继续。',
    action: '请重新登录后再试。',
  },
  PERMISSION_DENIED: {
    title: '权限不足',
    message: '你没有权限执行此操作。',
    action: '请联系管理员调整权限。',
  },
  NOT_FOUND: {
    title: '内容不存在',
    message: '请求的内容不存在或已被删除。',
    action: '请刷新页面后重试。',
  },
  RATE_LIMITED: {
    title: '操作过于频繁',
    message: '短时间内请求太多。',
    action: '请稍后再试。',
    retryable: true,
  },
  GENERATION_BUDGET_EXCEEDED: {
    title: '今日额度已用完',
    message: '今日生成额度已用完。',
    action: '请升级订阅、联系管理员发放额度，或明天再试。',
    recoveryActions: ['查看计费页余额', '联系管理员发放测试额度', '切换到自有 API Key'],
  },
  GENERATION_CREDITS_INSUFFICIENT: {
    title: '额度不足',
    message: '组织可用额度不足。',
    action: '请查看计费页或联系管理员充值。',
    recoveryActions: ['查看计费页余额', '联系管理员发放测试额度'],
  },
  GENERATION_SUSPENDED: {
    title: '生成已暂停',
    message: '当前组织的生成功能已被临时暂停。',
    action: '请联系管理员了解原因。',
  },
  GENERATION_QUEUE_FULL: {
    title: '队列繁忙',
    message: '生成队列繁忙，暂时无法接收新任务。',
    action: '请等待现有任务完成后再试。',
    retryable: true,
  },
  GENERATION_RUNNING_LIMIT: {
    title: '运行任务过多',
    message: '同时运行的生成任务过多。',
    action: '请等待当前任务完成后再提交。',
    retryable: true,
  },
  GENERATION_QUEUED_LIMIT: {
    title: '排队任务过多',
    message: '排队中的生成任务过多。',
    action: '请等待队列消化后再提交。',
    retryable: true,
  },
  PROJECT_LIMIT_REACHED: {
    title: '项目数已达上限',
    message: '当前方案可创建的项目数已达上限。',
    action: '请升级订阅，或归档不再使用的项目。',
  },
  POLICY_CONSENT_REQUIRED: {
    title: '需要先同意条款',
    message: '需要先同意最新服务条款和隐私政策。',
    action: '点击页面顶部的「同意并继续」后重试。',
    recoveryActions: ['点击页面顶部的「同意并继续」', '确认后重新提交生成任务'],
  },
  PAYMENT_REQUIRED: {
    title: '额度不足',
    message: '当前额度或订阅不足以继续。',
    action: '请查看计费页或联系管理员。',
  },
  SERVER_ERROR: {
    title: '服务异常',
    message: '服务器处理请求时出错。',
    action: '请稍后重试；若持续失败请联系管理员。',
    retryable: true,
  },
};

type ApiErrorBody = Record<string, unknown>;

const HTTP_STATUS_COPY: Record<number, Omit<UserFacingError, 'code'>> = {
  400: {
    title: '请求无效',
    message: '提交的信息有误或缺少必填项。',
    action: '请检查填写内容后重试。',
  },
  401: {
    title: '登录已过期',
    message: '当前登录状态无效或已过期。',
    action: '请重新登录后再试。',
    retryable: false,
  },
  403: {
    title: '权限不足',
    message: '你没有权限执行此操作。',
    action: '请联系管理员调整权限。',
  },
  404: {
    title: '内容不存在',
    message: '请求的内容不存在或已被删除。',
    action: '请刷新页面后重试。',
  },
  409: {
    title: '操作冲突',
    message: '当前操作与系统状态冲突。',
    action: '请刷新页面后重试。',
  },
  402: {
    title: '额度不足',
    message: '当前额度或订阅不足以继续。',
    action: '请查看计费页或联系管理员。',
    recoveryActions: ['查看计费页余额', '联系管理员发放测试额度', '切换到自有 API Key'],
  },
  429: {
    title: '操作过于频繁',
    message: '短时间内请求太多，系统正在保护任务队列。',
    action: '请稍后再试。',
    retryable: true,
    recoveryActions: ['稍后重试', '等待当前任务完成', '减少连续点击提交'],
  },
  500: {
    title: '服务异常',
    message: '服务器处理请求时出错。',
    action: '请稍后重试；若持续失败请联系管理员。',
    retryable: true,
  },
  502: {
    title: '服务暂时不可用',
    message: '上游服务或模型网关暂时不可用。',
    action: '请稍后重试。',
    retryable: true,
    recoveryActions: ['稍后重试', '在 AI 设置里切换模型', '联系管理员查看后台错误'],
  },
  503: {
    title: '服务繁忙',
    message: '系统正在处理大量请求。',
    action: '请稍后重试。',
    retryable: true,
  },
};

const ERROR_PATTERNS: Array<{ patterns: RegExp[]; copy: Partial<UserFacingError> }> = [
  {
    patterns: [/legal policies require consent|requires consent|policy consent|条款|隐私政策|consent/i],
    copy: {
      title: '需要先同意最新条款',
      message: '当前账号还没有完成服务条款、隐私政策或 AI 使用规则确认。',
      action: '点击页面顶部的「同意并继续」，确认后重新提交。',
      recoveryActions: ['点击页面顶部的「同意并继续」', '确认后重新提交生成任务', '如果没有看到提示，请刷新页面后再试'],
    },
  },
  {
    patterns: [/missing\b|\brequired\s+(field|input|tone|param)|\bblank\b|\bempty\b|缺少|必填|为空/i],
    copy: {
      title: '缺少必要信息',
      message: '有必填项未填写或上游步骤没有产出所需内容。',
      action: '请补齐配置或输入后重试。',
      recoveryActions: ['打开配置并补齐字段', '检查上游步骤是否已成功完成'],
    },
  },
  {
    patterns: [/schema|contract|compatible|mismatch|不能被当前步骤使用|输出不匹配|类型/i],
    copy: {
      title: '数据格式不匹配',
      message: '上一步产物和当前步骤需要的输入不一致。',
      action: '请检查连线或输出字段后重试。',
      recoveryActions: ['查看上游输出并调整连线', '从修正后的节点向后重跑'],
    },
  },
  {
    patterns: [/timeout|timed out|abort|超时|deadline/i],
    copy: {
      title: '响应超时',
      message: '处理时间过长，可能是输入过长或服务拥堵。',
      action: '请缩短输入内容后重试。',
      retryable: true,
      recoveryActions: ['缩短输入内容', '稍后重试', '在 AI 设置里切换模型'],
    },
  },
  {
    patterns: [/quota|credit|billing|limit|余额|额度|扣费|payment\s+required/i],
    copy: {
      title: '额度或限制不足',
      message: '本次操作可能触发额度、频率或计费限制。',
      action: '请查看计费页或联系管理员。',
      recoveryActions: ['查看计费页余额', '联系管理员发放测试额度', '切换到自有 API Key'],
    },
  },
  {
    patterns: [/permission|forbidden|unauthorized|403|权限|csrf/i],
    copy: {
      title: '权限不足',
      message: '当前账号没有执行此操作或访问相关资源的权限。',
      action: '请重新登录，或联系管理员调整权限。',
      recoveryActions: ['重新登录后再试', '确认当前项目属于你的工作区', '让管理员检查你的成员角色'],
    },
  },
  {
    patterns: [/provider|openai|anthropic|gemini|agnes|gateway|api key|service unavailable|502|503|模型|供应商/i],
    copy: {
      title: '模型服务异常',
      message: '外部模型或网关返回异常，通常是配置问题或服务暂时不可用。',
      action: '请检查 AI 设置中的密钥和模型，或稍后重试。',
      retryable: true,
      recoveryActions: ['前往 AI 设置检查密钥', '换一个模型后重试', '联系管理员查看后台错误'],
    },
  },
  {
    patterns: [/rate|too many|频繁/i],
    copy: {
      title: '操作过于频繁',
      message: '短时间内提交了太多请求。',
      action: '请稍后再试。',
      retryable: true,
      recoveryActions: ['稍后重试', '等待当前任务完成'],
    },
  },
  {
    patterns: [/network|fetch|failed to fetch|connection|连接|无法连接/i],
    copy: {
      title: '网络连接异常',
      message: '无法连接到服务器，可能是网络中断或后端未启动。',
      action: '请检查网络后刷新页面重试。',
      retryable: true,
    },
  },
  {
    patterns: [/task polling failed|polling failed/i],
    copy: {
      title: '任务状态查询失败',
      message: '暂时无法获取任务进度。',
      action: '请刷新页面后在任务中心查看。',
      retryable: true,
    },
  },
];

const TECHNICAL_MESSAGE_RE = /^(GET|POST|PATCH|PUT|DELETE)\s+\/|failed \(\d{3}\)|HTTP \d{3}|no details/i;

export class ApiError extends Error {
  status: number;

  userFacing: UserFacingError;

  path?: string;

  debug?: ApiErrorDebug;

  rawBody?: unknown;

  constructor(
    userFacing: UserFacingError,
    status: number,
    path?: string,
    debug?: ApiErrorDebug,
    rawBody?: unknown,
  ) {
    super(userFacing.message);
    this.name = 'ApiError';
    this.status = status;
    this.userFacing = userFacing;
    this.path = path;
    this.debug = debug;
    this.rawBody = rawBody;
  }
}

export function isApiError(value: unknown): value is ApiError {
  return value instanceof ApiError;
}

function isAbortError(value: unknown): boolean {
  return value instanceof DOMException && value.name === 'AbortError';
}

function isReadableMessage(text: string): boolean {
  const trimmed = text.trim();
  if (!trimmed) return false;
  if (TECHNICAL_MESSAGE_RE.test(trimmed)) return false;
  return true;
}

function classifyByPatterns(text: string): Partial<UserFacingError> | null {
  const match = ERROR_PATTERNS.find((item) => item.patterns.some((pattern) => pattern.test(text)));
  return match?.copy ?? null;
}

function extractMessageFromBody(body: unknown): string | null {
  if (typeof body === 'string' && body.trim()) {
    return body.trim();
  }
  if (!body || typeof body !== 'object') {
    return null;
  }

  const record = body as ApiErrorBody;
  if (typeof record.message === 'string' && record.message.trim()) {
    return record.message.trim();
  }
  if (typeof record.error === 'string' && record.error.trim()) {
    return record.error.trim();
  }
  if (typeof record.detail === 'string' && record.detail.trim()) {
    return record.detail.trim();
  }
  if (Array.isArray(record.detail) && record.detail.length > 0) {
    return record.detail.map(String).join('；');
  }
  if (record.errors && typeof record.errors === 'object') {
    const parts = Object.entries(record.errors as Record<string, unknown>).flatMap(([field, value]) => {
      const msg = Array.isArray(value) ? value.join('，') : String(value);
      return msg && msg !== 'undefined' ? [`${field}: ${msg}`] : [];
    });
    if (parts.length > 0) {
      return parts.join('；');
    }
  }
  return null;
}

function extractActionFromBody(body: unknown): string | undefined {
  if (!body || typeof body !== 'object') return undefined;
  const action = (body as ApiErrorBody).action;
  return typeof action === 'string' && action.trim() ? action.trim() : undefined;
}

function extractCodeFromBody(body: unknown): string | undefined {
  if (!body || typeof body !== 'object') return undefined;
  const code = (body as ApiErrorBody).code;
  return typeof code === 'string' && code.trim() ? code.trim() : undefined;
}

function extractDebugFromBody(body: unknown): ApiErrorDebug | undefined {
  if (!body || typeof body !== 'object') return undefined;
  const debug = (body as ApiErrorBody).debug;
  if (!debug || typeof debug !== 'object') return undefined;
  return debug as ApiErrorDebug;
}

function extractRetryableFromBody(body: unknown): boolean | undefined {
  if (!body || typeof body !== 'object') return undefined;
  const retryable = (body as ApiErrorBody).retryable;
  return typeof retryable === 'boolean' ? retryable : undefined;
}

function catalogForCode(code?: string): Partial<UserFacingError> | null {
  if (!code) return null;
  return BACKEND_CODE_COPY[code] || null;
}

export function buildUserFacingError(options: {
  status?: number;
  body?: unknown;
  fallbackTitle?: string;
  fallbackMessage?: string;
}): UserFacingError {
  const backendMessage = extractMessageFromBody(options.body);
  const backendAction = extractActionFromBody(options.body);
  const code = extractCodeFromBody(options.body);
  const retryable = extractRetryableFromBody(options.body);
  const statusCopy = options.status ? HTTP_STATUS_COPY[options.status] : undefined;
  const codeCopy = catalogForCode(code);
  const patternSource = [
    backendMessage,
    code,
    options.status === 402 ? 'quota payment' : '',
    options.status === 429 ? 'rate limit' : '',
  ].filter(Boolean).join(' ');
  const patternCopy = patternSource ? classifyByPatterns(patternSource) : null;

  const preferBackendMessage = Boolean(
    backendMessage
    && isReadableMessage(backendMessage)
    && (/[\u4e00-\u9fff]/.test(backendMessage) || (!statusCopy && !codeCopy)),
  );

  const title = codeCopy?.title || patternCopy?.title || statusCopy?.title || options.fallbackTitle || '操作失败';

  let message = options.fallbackMessage || '操作失败，请稍后重试。';
  if (preferBackendMessage) {
    message = backendMessage!;
  } else if (codeCopy?.message) {
    message = codeCopy.message;
  } else if (patternCopy?.message) {
    message = patternCopy.message;
  } else if (statusCopy?.message) {
    message = statusCopy.message;
  } else if (backendMessage && isReadableMessage(backendMessage)) {
    message = backendMessage;
  }

  const action = backendAction || codeCopy?.action || patternCopy?.action || statusCopy?.action;
  const recoveryActions = codeCopy?.recoveryActions || patternCopy?.recoveryActions || statusCopy?.recoveryActions;

  return {
    title,
    message,
    action,
    detail: preferBackendMessage ? backendMessage! : undefined,
    code,
    retryable: retryable ?? codeCopy?.retryable ?? patternCopy?.retryable ?? statusCopy?.retryable,
    recoveryActions,
  };
}

export async function parseApiErrorResponse(response: Response, path?: string): Promise<ApiError> {
  const text = await response.text().catch(() => '');
  let body: unknown = null;
  if (text) {
    try {
      body = JSON.parse(text) as unknown;
    } catch {
      body = { detail: text };
    }
  }

  const userFacing = buildUserFacingError({
    status: response.status,
    body,
  });
  const debug = extractDebugFromBody(body);
  const err = new ApiError(userFacing, response.status, path, debug, body);
  logApiError(err, path);
  return err;
}

export function getUserFacingError(raw: unknown, fallback?: Partial<UserFacingError>): UserFacingError {
  if (isApiError(raw)) {
    return {
      ...raw.userFacing,
      title: fallback?.title || raw.userFacing.title,
      message: fallback?.message && raw.userFacing.message === '操作失败，请稍后重试。'
        ? fallback.message
        : raw.userFacing.message,
    };
  }

  if (isAbortError(raw)) {
    return {
      title: '响应超时',
      message: '请求等待时间过长，已自动取消。',
      action: '请缩短输入内容后重试。',
      retryable: true,
      recoveryActions: ['缩短输入内容', '稍后重试'],
      ...fallback,
    };
  }

  if (raw instanceof TypeError && /fetch/i.test(raw.message)) {
    return {
      title: '网络连接异常',
      message: '无法连接到服务器。',
      action: '请检查网络或确认后端服务已启动后重试。',
      retryable: true,
      ...fallback,
    };
  }

  if (raw instanceof Error) {
    const userFacing = buildUserFacingError({
      body: { message: raw.message },
      fallbackTitle: fallback?.title,
      fallbackMessage: fallback?.message,
    });
    return {
      ...userFacing,
      title: fallback?.title || userFacing.title,
      message: isReadableMessage(raw.message) ? raw.message : userFacing.message,
    };
  }

  if (typeof raw === 'string') {
    const userFacing = buildUserFacingError({
      body: { message: raw },
      fallbackTitle: fallback?.title,
      fallbackMessage: fallback?.message,
    });
    return userFacing;
  }

  return buildUserFacingError({
    fallbackTitle: fallback?.title,
    fallbackMessage: fallback?.message || '操作失败，请稍后重试。',
  });
}

/** Toast 用的一句话：主文案 + 建议操作（若有）。 */
export function formatErrorForToast(raw: unknown, fallbackMessage = '操作失败，请稍后重试'): string {
  const facing = getUserFacingError(raw, { message: fallbackMessage });
  if (facing.action && !facing.message.includes(facing.action)) {
    return `${facing.message} ${facing.action}`;
  }
  return facing.message;
}

/** 带上下文的 Toast，例如「项目创建失败：额度不足…」 */
export function formatContextualErrorForToast(
  raw: unknown,
  context: string,
  fallbackMessage = '请稍后重试',
): string {
  const facing = getUserFacingError(raw, { message: fallbackMessage });
  const detail = facing.action && !facing.message.includes(facing.action)
    ? `${facing.message} ${facing.action}`
    : facing.message;
  if (detail === fallbackMessage || detail === '操作失败，请稍后重试。' || detail === '操作失败，请稍后重试') {
    return `${context}，${fallbackMessage}`;
  }
  return `${context}：${detail}`;
}

/** 开发者模式：在控制台输出完整技术信息（路径、状态码、debug、原始 body）。 */
export function logApiError(err: unknown, context?: string): void {
  if (!import.meta.env.DEV) return;

  const facing = getUserFacingError(err);
  const label = context ? `[API Error] ${context}` : '[API Error]';
  console.groupCollapsed(`${label} · ${facing.title || facing.message}`);

  if (isApiError(err)) {
    console.info('userFacing', err.userFacing);
    console.info('status', err.status);
    if (err.path) console.info('path', err.path);
    if (err.debug) console.info('debug', err.debug);
    if (err.rawBody) console.info('rawBody', err.rawBody);
  } else {
    console.info('userFacing', facing);
    console.error('rawError', err);
  }

  console.groupEnd();
}
