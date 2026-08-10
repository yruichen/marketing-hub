import type { WorkflowNode } from '../../types/workspace';
import { getImageStyleSkill, IMAGE_STYLE_SKILLS } from './imageStyleSkills';

type NodeConfigFieldsProps = {
  node: WorkflowNode;
  onUpdateConfig: (key: string, value: string | number) => void;
  variant?: 'panel' | 'popover';
};

function Field({ label, hint, children, variant }: { label: string; hint?: string; children: React.ReactNode; variant: 'panel' | 'popover' }) {
  const labelCls = variant === 'popover'
    ? 'block text-[11px] font-black text-[var(--editorial-text-gray)] mb-1.5'
    : 'block text-[9px] font-black uppercase text-[var(--editorial-text-gray)] mb-1';
  const hintCls = variant === 'popover'
    ? 'mt-1 text-[10px] text-[var(--editorial-text-gray)]/80 leading-relaxed'
    : 'mt-0.5 text-[8px] text-[var(--editorial-text-gray)]/70 leading-tight';
  return (
    <div>
      <label className={labelCls}>{label}</label>
      {children}
      {hint && <p className={hintCls}>{hint}</p>}
    </div>
  );
}

function Section({ title, children, variant }: { title: string; children: React.ReactNode; variant: 'panel' | 'popover' }) {
  const titleCls = variant === 'popover'
    ? 'text-[10px] font-black uppercase text-[var(--editorial-text-gray)] tracking-wider'
    : 'text-[8px] font-black uppercase text-[var(--editorial-text-gray)] tracking-wider';
  return (
    <div className="border border-[var(--editorial-stroke)]/30 rounded p-2.5 space-y-2.5">
      <h5 className={titleCls}>{title}</h5>
      {children}
    </div>
  );
}

const inputClsPanel = 'w-full bg-transparent border-b border-[var(--editorial-stroke)] text-xs py-1.5 focus:outline-none focus:border-[var(--editorial-accent-blue)] transition-colors';
const textareaClsPanel = 'w-full bg-[var(--editorial-bg)] border border-[var(--editorial-stroke)]/50 rounded p-2 text-[11px] resize-none focus:outline-none focus:border-[var(--editorial-accent-blue)] transition-colors leading-relaxed';
const inputClsPopover = 'nodrag nopan w-full bg-[var(--editorial-paper)] border border-[var(--editorial-stroke)] rounded px-2.5 py-2 text-sm focus:outline-none focus:border-[var(--editorial-accent-blue)] transition-colors';
const textareaClsPopover = 'nodrag nopan w-full bg-[var(--editorial-paper)] border border-[var(--editorial-stroke)] rounded p-2.5 text-sm resize-none focus:outline-none focus:border-[var(--editorial-accent-blue)] transition-colors leading-relaxed';

export function NodeConfigFields({ node, onUpdateConfig, variant = 'panel' }: NodeConfigFieldsProps) {
  const cfg = node.config || {};
  const inputCls = variant === 'popover' ? inputClsPopover : inputClsPanel;
  const textareaCls = variant === 'popover' ? textareaClsPopover : textareaClsPanel;
  const v = variant;

  if (node.type === 'custom_agent') {
    return (
      <div className="space-y-3">
        <Section title="基本信息" variant={v}>
          <Field label="智能体名称" variant={v}>
            <input value={cfg.name || ''} onChange={(e) => onUpdateConfig('name', e.target.value)} className={inputCls} placeholder="如：品牌审核官" />
          </Field>
          <Field label="系统 Prompt" hint="支持 {变量名} 引用上游输入" variant={v}>
            <textarea value={cfg.prompt || ''} onChange={(e) => onUpdateConfig('prompt', e.target.value)} rows={4} className={textareaCls} placeholder="定义智能体角色与约束…" />
          </Field>
        </Section>
        <Section title="数据流" variant={v}>
          <Field label="输入字段" hint="逗号分隔，如 brief, brand_context" variant={v}>
            <input value={cfg.input_fields || ''} onChange={(e) => onUpdateConfig('input_fields', e.target.value)} className={inputCls} />
          </Field>
          <Field label="输出 Schema" variant={v}>
            <textarea value={cfg.output_schema_text || ''} onChange={(e) => onUpdateConfig('output_schema_text', e.target.value)} rows={2} className={`${textareaCls} font-mono text-[10px]`} placeholder='{ "response": "string" }' />
          </Field>
        </Section>
        <Section title="模型参数" variant={v}>
          <Field label="模型" hint="留空使用默认" variant={v}>
            <input value={cfg.model || ''} onChange={(e) => onUpdateConfig('model', e.target.value)} className={inputCls} />
          </Field>
          <Field label="温度" variant={v}>
            <input type="number" min="0" max="2" step="0.1" value={cfg.temperature ?? 0.7} onChange={(e) => onUpdateConfig('temperature', Number(e.target.value))} className={inputCls} />
          </Field>
          <Field label="失败策略" variant={v}>
            <select value={cfg.failure_strategy || 'retry_once_then_skip'} onChange={(e) => onUpdateConfig('failure_strategy', e.target.value)} className={inputCls}>
              <option value="retry_once_then_skip">重试一次后跳过</option>
              <option value="skip">直接跳过并标记</option>
              <option value="abort">中断整个工作流</option>
            </select>
          </Field>
        </Section>
      </div>
    );
  }
  if (node.type === 'context') {
    return (
      <div className="space-y-3">
        <Section title="品牌上下文" variant={v}>
          <Field label="品牌摘要" variant={v}>
            <textarea rows={3} value={cfg.summary || ''} onChange={(e) => onUpdateConfig('summary', e.target.value)} className={textareaCls} placeholder="品牌与活动背景…" />
          </Field>
          <Field label="品牌语调" variant={v}>
            <input value={cfg.tone || ''} onChange={(e) => onUpdateConfig('tone', e.target.value)} className={inputCls} placeholder="专业、活泼…" />
          </Field>
          <Field label="目标受众" variant={v}>
            <input value={cfg.target_audience || ''} onChange={(e) => onUpdateConfig('target_audience', e.target.value)} className={inputCls} />
          </Field>
          <Field label="禁用词" hint="逗号分隔" variant={v}>
            <input value={cfg.forbidden_words || ''} onChange={(e) => onUpdateConfig('forbidden_words', e.target.value)} className={inputCls} />
          </Field>
        </Section>
      </div>
    );
  }
  if (node.type === 'copy') {
    return (
      <div className="space-y-3">
        <Section title="文案参数" variant={v}>
          <Field label="平台" variant={v}>
            <select value={cfg.platform || ''} onChange={(e) => onUpdateConfig('platform', e.target.value)} className={inputCls}>
              <option value="" disabled>选择平台</option>
              <option value="Xiaohongshu">小红书</option>
              <option value="Douyin">抖音</option>
              <option value="WeChat">微信公众号</option>
              <option value="Weibo">微博</option>
              <option value="Bilibili">B站</option>
              <option value="General">通用</option>
            </select>
          </Field>
          <Field label="语调" hint="留空则使用品牌上下文" variant={v}>
            <input value={cfg.tone || ''} onChange={(e) => onUpdateConfig('tone', e.target.value)} className={inputCls} placeholder="爆款活泼…" />
          </Field>
          <Field label="产品描述" hint="留空则从上游提取" variant={v}>
            <textarea value={cfg.product_description || ''} onChange={(e) => onUpdateConfig('product_description', e.target.value)} rows={3} className={textareaCls} />
          </Field>
        </Section>
      </div>
    );
  }
  if (node.type === 'image_prompt') {
    const styleSkill = getImageStyleSkill(String(cfg.style_skill || ''));
    return (
      <div className="space-y-3">
        <Section title="图片提示词" variant={v}>
          <Field label="风格 Skill" variant={v}>
            <select value={String(cfg.style_skill || styleSkill.id)} onChange={(e) => onUpdateConfig('style_skill', e.target.value)} className={inputCls}>
              {IMAGE_STYLE_SKILLS.map((item) => (
                <option key={item.id} value={item.id}>{item.label}</option>
              ))}
            </select>
          </Field>
          <p className="text-[10px] text-[var(--editorial-text-gray)] leading-relaxed border border-[var(--editorial-stroke)]/30 bg-[var(--editorial-bg)]/40 p-2 rounded">
            {styleSkill.skill}
          </p>
          <Field label="画面描述" variant={v}>
            <textarea value={cfg.prompt || ''} onChange={(e) => onUpdateConfig('prompt', e.target.value)} rows={3} className={textareaCls} placeholder="画面描述…" />
          </Field>
          <Field label="负面提示词" variant={v}>
            <textarea value={cfg.negative_prompt || ''} onChange={(e) => onUpdateConfig('negative_prompt', e.target.value)} rows={2} className={textareaCls} />
          </Field>
          <Field label="画幅比例" variant={v}>
            <select value={cfg.aspect_ratio || '1:1'} onChange={(e) => onUpdateConfig('aspect_ratio', e.target.value)} className={inputCls}>
              <option value="1:1">1:1 方图</option>
              <option value="4:3">4:3 横图</option>
              <option value="3:4">3:4 竖图</option>
              <option value="16:9">16:9 横幅</option>
              <option value="9:16">9:16 竖屏</option>
            </select>
          </Field>
        </Section>
      </div>
    );
  }
  if (node.type === 'image_generation') {
    return (
      <div className="space-y-3">
        <Section title="图片生成" variant={v}>
          <p className="text-[10px] text-[var(--editorial-text-gray)] leading-relaxed">画面与比例由上游「图片提示词」提供</p>
          <Field label="图像模型" variant={v}>
            <select value={cfg.model || ''} onChange={(e) => onUpdateConfig('model', e.target.value)} className={inputCls}>
              <option value="">默认模型</option>
              <option value="agnes-image-2.0-flash">Agnes Image 2.0</option>
              <option value="dall-e-3">DALL·E 3</option>
            </select>
          </Field>
          <Field label="失败策略" variant={v}>
            <select value={cfg.failure_strategy || 'retry_once'} onChange={(e) => onUpdateConfig('failure_strategy', e.target.value)} className={inputCls}>
              <option value="retry_once">重试一次</option>
              <option value="skip">跳过并标记</option>
              <option value="abort">中断工作流</option>
            </select>
          </Field>
        </Section>
      </div>
    );
  }
  if (node.type === 'video_generation') {
    return (
      <div className="space-y-3">
        <Section title="视频生成" variant={v}>
          <p className="text-[10px] text-[var(--editorial-text-gray)] leading-relaxed">
            分镜场景与配音由上游「分镜」「配音」节点提供；此处配置成片参数。
          </p>
          <Field label="画幅比例" variant={v}>
            <select value={cfg.aspect_ratio || '9:16'} onChange={(e) => onUpdateConfig('aspect_ratio', e.target.value)} className={inputCls}>
              <option value="9:16">9:16 竖屏/抖音</option>
              <option value="16:9">16:9 横屏</option>
              <option value="1:1">1:1 方视频</option>
              <option value="4:5">4:5 小红书</option>
            </select>
          </Field>
          <Field label="时长上限 (秒)" variant={v}>
            <input type="number" min="5" max="180" value={cfg.duration_cap || 30} onChange={(e) => onUpdateConfig('duration_cap', Number(e.target.value))} className={inputCls} />
          </Field>
          <Field label="视频模型" variant={v}>
            <select value={cfg.model || ''} onChange={(e) => onUpdateConfig('model', e.target.value)} className={inputCls}>
              <option value="">跟随 AI 设置</option>
              <option value="agnes-video-v2.0">Agnes Video v2.0</option>
            </select>
          </Field>
          <Field label="失败策略" variant={v}>
            <select value={cfg.failure_strategy || 'retry_once'} onChange={(e) => onUpdateConfig('failure_strategy', e.target.value)} className={inputCls}>
              <option value="retry_once">重试一次</option>
              <option value="skip">跳过并标记</option>
              <option value="abort">中断工作流</option>
            </select>
          </Field>
        </Section>
      </div>
    );
  }
  if (node.type === 'storyboard') {
    return (
      <div className="space-y-3">
        <Section title="分镜" variant={v}>
          <Field label="视频主题" variant={v}>
            <input value={cfg.video_topic || ''} onChange={(e) => onUpdateConfig('video_topic', e.target.value)} className={inputCls} />
          </Field>
          <Field label="时长 (秒)" variant={v}>
            <input type="number" min="5" max="300" value={cfg.duration || 30} onChange={(e) => onUpdateConfig('duration', Number(e.target.value))} className={inputCls} />
          </Field>
          <Field label="目标受众" variant={v}>
            <input value={cfg.target_audience || ''} onChange={(e) => onUpdateConfig('target_audience', e.target.value)} className={inputCls} />
          </Field>
          <Field label="镜头要求" variant={v}>
            <textarea value={cfg.text || ''} onChange={(e) => onUpdateConfig('text', e.target.value)} rows={3} className={textareaCls} />
          </Field>
        </Section>
      </div>
    );
  }
  if (node.type === 'retrieval') {
    return (
      <div className="space-y-3">
        <Section title="检索" variant={v}>
          <Field label="检索范围" variant={v}>
            <select value={cfg.retrieval_scope || 'brand_memory_and_assets'} onChange={(e) => onUpdateConfig('retrieval_scope', e.target.value)} className={inputCls}>
              <option value="brand_memory_and_assets">品牌记忆和资产库</option>
              <option value="community">社区作品库</option>
              <option value="all">全部数据源</option>
            </select>
          </Field>
          <Field label="检索关键词" variant={v}>
            <textarea value={cfg.query || cfg.prompt || ''} onChange={(e) => onUpdateConfig('query', e.target.value)} rows={2} className={textareaCls} />
          </Field>
        </Section>
      </div>
    );
  }
  if (node.type === 'review') {
    return (
      <div className="space-y-3">
        <Section title="审核" variant={v}>
          <Field label="禁用词" variant={v}>
            <textarea value={cfg.forbidden_words || ''} onChange={(e) => onUpdateConfig('forbidden_words', e.target.value)} rows={2} className={textareaCls} />
          </Field>
          <Field label="渠道合规规则" variant={v}>
            <textarea value={cfg.channel_rules || ''} onChange={(e) => onUpdateConfig('channel_rules', e.target.value)} rows={3} className={textareaCls} />
          </Field>
        </Section>
      </div>
    );
  }
  return (
    <div className="space-y-3">
      <Section title="配音" variant={v}>
        <Field label="音色" variant={v}>
          <select value={cfg.voice_id || 'female_warm'} onChange={(e) => onUpdateConfig('voice_id', e.target.value)} className={inputCls}>
            <option value="female_warm">温暖女声</option>
            <option value="female_bright">明亮女声</option>
            <option value="male_calm">沉稳男声</option>
            <option value="male_energetic">活力男声</option>
            <option value="neutral">中性</option>
          </select>
        </Field>
        <Field label="语速" variant={v}>
          <input type="number" min="0.5" max="3" step="0.1" value={cfg.speed || 1} onChange={(e) => onUpdateConfig('speed', Number(e.target.value))} className={inputCls} />
        </Field>
        <Field label="配音文本" hint="留空则从上游文案提取" variant={v}>
          <textarea value={cfg.text || ''} onChange={(e) => onUpdateConfig('text', e.target.value)} rows={3} className={textareaCls} />
        </Field>
      </Section>
    </div>
  );
}
