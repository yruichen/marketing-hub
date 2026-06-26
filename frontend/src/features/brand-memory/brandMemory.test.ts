import { describe, expect, it } from 'vitest';
import {
  buildBrandMemoryHighlights,
  calculateBrandMemoryScore,
  describeBrandMemoryReadiness,
} from './brandMemory';

describe('brand memory helpers', () => {
  it('calculates completeness and missing required fields', () => {
    const score = calculateBrandMemoryScore({
      brand_name: 'Launchbook',
      audience: '内容运营团队',
      tone: '专业克制',
    });

    expect(score.score).toBeGreaterThan(0);
    expect(score.completed).toBe(3);
    expect(score.missingRequired).toContain('产品/服务');
    expect(score.missingRequired).toContain('主要卖点');
  });

  it('builds readable highlights from filled fields only', () => {
    const highlights = buildBrandMemoryHighlights({
      brand_name: 'Launchbook',
      platform: ['小红书', '公众号'],
      tone: '',
    });

    expect(highlights).toEqual([
      { key: 'brand_name', label: '品牌名', value: 'Launchbook' },
      { key: 'platform', label: '主渠道', value: '小红书, 公众号' },
    ]);
  });

  it('describes readiness by score bands', () => {
    expect(describeBrandMemoryReadiness(0)).toBe('尚未配置品牌记忆');
    expect(describeBrandMemoryReadiness(30)).toBe('信息不足，结果会偏通用');
    expect(describeBrandMemoryReadiness(60)).toBe('可生成，但品牌约束偏弱');
    expect(describeBrandMemoryReadiness(90)).toBe('可用于稳定生成');
  });
});
