import type { BrandContext } from '../../types/workspace';

export interface BrandMemoryField {
  key: keyof BrandContext;
  label: string;
  placeholder: string;
  multiline?: boolean;
  required?: boolean;
}

export interface BrandMemorySection {
  id: string;
  title: string;
  description: string;
  fields: BrandMemoryField[];
}

export interface BrandMemoryScore {
  score: number;
  completed: number;
  total: number;
  missingRequired: string[];
}

export interface BrandMemoryHighlight {
  key: string;
  label: string;
  value: string;
}

export const BRAND_MEMORY_SECTIONS: BrandMemorySection[] = [
  {
    id: 'basis',
    title: '基础',
    description: '品牌、产品和业务边界',
    fields: [
      { key: 'brand_name', label: '品牌名', placeholder: '例如：Marketing Hub', required: true },
      { key: 'product_name', label: '产品/服务', placeholder: '例如：AI 营销内容工作台', required: true },
      { key: 'industry', label: '行业', placeholder: '例如：SaaS / 消费品 / 教育' },
      { key: 'website', label: '官网/主页', placeholder: 'https://...' },
    ],
  },
  {
    id: 'audience',
    title: '受众',
    description: '让生成结果知道写给谁',
    fields: [
      { key: 'audience', label: '目标人群', placeholder: '例如：3-20 人营销团队、内容运营负责人', multiline: true, required: true },
      { key: 'pain_points', label: '核心痛点', placeholder: '例如：选题分散、审批慢、产物难复用', multiline: true },
      { key: 'buying_motivations', label: '购买动机', placeholder: '例如：提升产能、统一品牌口径、降低外包成本', multiline: true },
    ],
  },
  {
    id: 'style',
    title: '风格',
    description: '控制文字和视觉输出的口径',
    fields: [
      { key: 'tone', label: '语调', placeholder: '例如：专业克制、直接、有行动感', required: true },
      { key: 'selling_points', label: '主要卖点', placeholder: '最多 5 条，用逗号或换行分隔', multiline: true, required: true },
      { key: 'visual_style', label: '视觉风格', placeholder: '例如： editorial paper, clean SaaS, warm desk scene', multiline: true },
      { key: 'headline_preference', label: '标题偏好', placeholder: '例如：少用震惊体，多用结果导向' },
      { key: 'punctuation_preference', label: '标点/Emoji 偏好', placeholder: '例如：不用 emoji，避免连续感叹号' },
    ],
  },
  {
    id: 'guardrails',
    title: '禁区',
    description: '上线测试期必须明确的合规边界',
    fields: [
      { key: 'forbidden_words', label: '禁用词', placeholder: '例如：绝对、第一、包治、稳赚', multiline: true, required: true },
      { key: 'compliance_rules', label: '合规红线', placeholder: '例如：不得承诺收益，不得使用医疗疗效表达', multiline: true },
      { key: 'competitor_restrictions', label: '竞品限制', placeholder: '例如：不点名比较竞品，不贬低同行', multiline: true },
    ],
  },
  {
    id: 'channels',
    title: '渠道',
    description: '适配不同投放位置的格式',
    fields: [
      { key: 'platform', label: '主渠道', placeholder: '例如：小红书、抖音、微信公众号', required: true },
      { key: 'channel_rules', label: '渠道规则', placeholder: '例如：小红书前 80 字给结论；公众号标题不超过 24 字', multiline: true },
      { key: 'content_formats', label: '常用格式', placeholder: '例如：种草笔记、短视频脚本、产品更新、案例复盘' },
    ],
  },
  {
    id: 'references',
    title: '参考',
    description: '给模型可追溯的证据和案例',
    fields: [
      { key: 'reference_links', label: '参考链接', placeholder: '每行一个链接或素材说明', multiline: true },
      { key: 'case_studies', label: '案例素材', placeholder: '历史爆款、竞品观察、客户案例', multiline: true },
      { key: 'historical_assets', label: '历史资产', placeholder: '可复用的标题、金句、图片风格、脚本结构', multiline: true },
    ],
  },
];

const SCORE_FIELDS = BRAND_MEMORY_SECTIONS.flatMap((section) => section.fields);

export function stringifyBrandMemoryValue(value: BrandContext[keyof BrandContext]): string {
  if (Array.isArray(value)) return value.filter(Boolean).join(', ');
  if (typeof value === 'string') return value;
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  return '';
}

export function isBrandMemoryValueFilled(value: BrandContext[keyof BrandContext]): boolean {
  return stringifyBrandMemoryValue(value).trim().length > 0;
}

export function calculateBrandMemoryScore(context: BrandContext = {}): BrandMemoryScore {
  const completed = SCORE_FIELDS.filter((field) => isBrandMemoryValueFilled(context[field.key])).length;
  const missingRequired = SCORE_FIELDS
    .filter((field) => field.required && !isBrandMemoryValueFilled(context[field.key]))
    .map((field) => field.label);

  return {
    score: SCORE_FIELDS.length ? Math.round((completed / SCORE_FIELDS.length) * 100) : 0,
    completed,
    total: SCORE_FIELDS.length,
    missingRequired,
  };
}

export function buildBrandMemoryHighlights(context: BrandContext = {}, maxItems = 6): BrandMemoryHighlight[] {
  return SCORE_FIELDS
    .map((field) => ({
      key: String(field.key),
      label: field.label,
      value: stringifyBrandMemoryValue(context[field.key]).trim(),
    }))
    .filter((item) => item.value.length > 0)
    .slice(0, maxItems);
}

export function describeBrandMemoryReadiness(score: number): string {
  if (score >= 80) return '可用于稳定生成';
  if (score >= 50) return '可生成，但品牌约束偏弱';
  if (score > 0) return '信息不足，结果会偏通用';
  return '尚未配置品牌记忆';
}
