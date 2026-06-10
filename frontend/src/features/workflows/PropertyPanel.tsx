import { RotateCcw } from 'lucide-react';
import type { WorkflowNode, WorkflowEdge, BrandContext } from '../../types/workspace';
import { ioSchema } from './constants';

interface PropertyPanelProps {
  nodes: WorkflowNode[];
  edges: WorkflowEdge[];
  selectedNode: WorkflowNode | null;
  brandContext: BrandContext;
  feedback: string;
  loadingState: string;
  connectionSource: string;
  readOnly: boolean;
  runPreview: { stepCount: number; estimatedCost: string; estimatedMinutes: number };
  onUpdateNode: (id: string, patch: Partial<WorkflowNode>) => void;
  onUpdateConfig: (key: string, value: string | number) => void;
  onSetBrandContext: React.Dispatch<React.SetStateAction<BrandContext>>;
  onSetFeedback: (value: string) => void;
  onRemoveNode: () => void;
  onRetryNode: () => void;
  onDeleteEdge: (edgeId: string) => void;
  onCancelConnection: () => void;
  markHistory: (label: string) => void;
}

export function PropertyPanel({
  nodes, edges, selectedNode, brandContext, feedback, loadingState, connectionSource,
  readOnly, runPreview,
  onUpdateNode, onUpdateConfig, onSetBrandContext, onSetFeedback,
  onRemoveNode, onRetryNode, onDeleteEdge, onCancelConnection, markHistory,
}: PropertyPanelProps) {
  const schemaWarnings = (() => {
    const nodeById = new Map(nodes.map((n) => [n.id, n]));
    return edges.flatMap((edge) => {
      const source = nodeById.get(edge.source);
      const target = nodeById.get(edge.target);
      if (!source || !target) return [`连接 ${edge.source} -> ${edge.target} 指向不存在的节点。`];
      const srcSchema = source.output_schema || ioSchema[source.type as keyof typeof ioSchema]?.output || {};
      const tgtSchema = target.input_schema || ioSchema[target.type as keyof typeof ioSchema]?.input || {};
      const srcTypes = new Set(Object.values(srcSchema));
      const tgtTypes = new Set(Object.values(tgtSchema));
      if (srcTypes.has('Any') || tgtTypes.has('Any')) return [];
      const compatible = [...srcTypes].some((t) => tgtTypes.has(t));
      return compatible ? [] : [`${source.label} 输出与 ${target.label} 输入类型不匹配。`];
    });
  })();

  return (
    <aside className="border-l border-[var(--editorial-stroke)] p-4 space-y-4 bg-[var(--editorial-paper)] min-w-0 max-h-[calc(100vh-260px)] min-h-[400px] overflow-y-auto">
      {/* Run Status */}
      {loadingState !== 'idle' && (
        <div className="flex items-center gap-2 text-[9px] text-blue-600 font-bold mt-1">
          <span className="h-2 w-2 rounded-full bg-blue-600 animate-pulse" />
          {loadingState === 'running' ? '工作流执行中…' : loadingState === 'retrying' ? '节点重试中…' : '加载中…'}
        </div>
      )}

      {/* Run Preview */}
      <div className="border border-[var(--editorial-stroke)] p-3">
        <h4 className="text-[9px] text-[var(--editorial-text-gray)] font-black uppercase mb-2">运行预览</h4>
        <div className="grid grid-cols-3 gap-2 text-[10px]">
          <div className="border border-[var(--editorial-stroke)]/40 p-2"><span className="block text-[var(--editorial-text-gray)]">节点</span><b>{runPreview.stepCount}</b></div>
          <div className="border border-[var(--editorial-stroke)]/40 p-2"><span className="block text-[var(--editorial-text-gray)]">预计耗时</span><b>{runPreview.estimatedMinutes} 分钟</b></div>
          <div className="border border-[var(--editorial-stroke)]/40 p-2"><span className="block text-[var(--editorial-text-gray)]">预计成本</span><b>{runPreview.estimatedCost}</b></div>
        </div>
      </div>

      {/* Brand Context */}
      <div className="border border-[var(--editorial-stroke)] p-3">
        <h4 className="text-[9px] text-[var(--editorial-text-gray)] font-black uppercase mb-3">品牌记忆</h4>
        <div className="space-y-2">
          {(['brand_name', 'audience', 'tone', 'selling_points', 'visual_style', 'campaign_goal'] as const).map((key) => (
            <input
              key={key}
              value={String(brandContext[key] || '')}
              onChange={(e) => onSetBrandContext((prev) => ({ ...prev, [key]: e.target.value }))}
              placeholder={key}
              className="w-full bg-transparent border-b border-[var(--editorial-stroke)] text-[10px] py-1.5 focus:outline-none"
            />
          ))}
        </div>
      </div>

      {/* Node Config */}
      <div className="border border-[var(--editorial-stroke)] p-3">
        <div className="flex items-center justify-between mb-3">
          <h4 className="text-[9px] text-[var(--editorial-text-gray)] font-black uppercase">节点配置</h4>
          <button type="button" onClick={onRemoveNode} disabled={readOnly} className="text-[9px] font-black hover:text-rose-500 disabled:opacity-40">删除</button>
        </div>
        {selectedNode ? (
          <div className="space-y-3">
            <input
              value={selectedNode.label}
              onChange={(e) => onUpdateNode(selectedNode.id, { label: e.target.value })}
              className="w-full bg-transparent border-b border-[var(--editorial-stroke)] text-xs py-2 focus:outline-none font-black"
            />
            <ConfigFields node={selectedNode} onUpdateConfig={onUpdateConfig} />
            <textarea
              rows={3}
              value={feedback}
              onChange={(e) => onSetFeedback(e.target.value)}
              className="w-full bg-[var(--editorial-paper)] border border-[var(--editorial-stroke)] p-2 text-[10px] resize-none focus:outline-none"
              placeholder="填写修改意见后可重试节点"
            />
            <button type="button" onClick={onRetryNode} disabled={readOnly || !feedback.trim()} className="w-full border border-[var(--editorial-stroke)] py-2 text-[9px] font-black uppercase hover:bg-[var(--editorial-unselected)] flex items-center justify-center gap-1.5 disabled:opacity-40">
              <RotateCcw className="h-3.5 w-3.5" /> 节点重试
            </button>
          </div>
        ) : (
          <p className="text-[10px] text-[var(--editorial-text-gray)]">未选择节点</p>
        )}
      </div>

      {/* Node Output */}
      {selectedNode && selectedNode.output && Object.keys(selectedNode.output).length > 0 && (
        <div className="border border-[var(--editorial-stroke)] p-3">
          <div className="flex items-center justify-between mb-2">
            <h4 className="text-[9px] text-[var(--editorial-text-gray)] font-black uppercase">节点输出</h4>
            <button
              type="button"
              onClick={() => {
                const allOutput = Object.fromEntries(nodes.filter((n) => n.output && Object.keys(n.output).length > 0).map((n) => [n.id, { label: n.label, type: n.type, output: n.output }]));
                navigator.clipboard?.writeText(JSON.stringify(allOutput, null, 2)).catch(() => {});
              }}
              className="text-[9px] font-black hover:text-emerald-600"
            >导出全部</button>
          </div>
          <div className="text-[10px] space-y-1">
            {selectedNode.status && (
              <div className="flex items-center gap-2 mb-2">
                <span className={`h-2 w-2 rounded-full ${selectedNode.status === 'succeeded' ? 'bg-emerald-500' : selectedNode.status === 'failed' ? 'bg-rose-500' : 'bg-yellow-500'}`} />
                <span className="font-black">{selectedNode.status}</span>
                {selectedNode.task_id && <span className="text-[var(--editorial-text-gray)]">#{selectedNode.task_id}</span>}
              </div>
            )}
            <pre className="bg-[var(--editorial-bg)] border border-[var(--editorial-stroke)]/30 p-2 text-[9px] leading-relaxed overflow-auto max-h-[200px] whitespace-pre-wrap">
              {JSON.stringify(selectedNode.output, null, 2)}
            </pre>
          </div>
        </div>
      )}

      {/* Schema Warnings */}
      <div className="border border-[var(--editorial-stroke)] p-3">
        <h4 className="text-[9px] text-[var(--editorial-text-gray)] font-black uppercase mb-2">输入要求与输出内容</h4>
        {schemaWarnings.length === 0 ? (
          <p className="text-[10px] text-[var(--editorial-text-gray)]">当前连线类型一致。</p>
        ) : (
          <div className="space-y-2">
            {schemaWarnings.map((w) => <p key={w} className="text-[10px] text-rose-600 leading-relaxed">{w}</p>)}
          </div>
        )}
      </div>

      {/* Edge Management */}
      <div className="border border-[var(--editorial-stroke)] p-3">
        <div className="flex items-center justify-between mb-3">
          <h4 className="text-[9px] text-[var(--editorial-text-gray)] font-black uppercase">连线管理</h4>
          {connectionSource && (
            <button type="button" onClick={onCancelConnection} className="text-[9px] font-black hover:text-rose-500">取消起点</button>
          )}
        </div>
        <div className="space-y-2 max-h-[160px] overflow-y-auto pr-1">
          {edges.length === 0 ? (
            <p className="text-[10px] text-[var(--editorial-text-gray)]">暂无连线</p>
          ) : (
            edges.map((edge) => {
              const source = nodes.find((n) => n.id === edge.source);
              const target = nodes.find((n) => n.id === edge.target);
              return (
                <div key={edge.id} className="flex items-center justify-between gap-2 border border-[var(--editorial-stroke)]/30 px-2 py-1.5 text-[10px]">
                  <span className="truncate">{source?.label || edge.source} → {target?.label || edge.target}</span>
                  <button type="button" onClick={() => { if (!readOnly) { markHistory('删除连线'); onDeleteEdge(edge.id); } }} disabled={readOnly} className="text-[9px] font-black hover:text-rose-500 disabled:opacity-40">删除</button>
                </div>
              );
            })
          )}
        </div>
      </div>
    </aside>
  );
}

// Helper: labeled field with description
function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="block text-[9px] font-black uppercase text-[var(--editorial-text-gray)] mb-1">{label}</label>
      {children}
      {hint && <p className="mt-0.5 text-[8px] text-[var(--editorial-text-gray)]/70 leading-tight">{hint}</p>}
    </div>
  );
}

// Helper: section divider with title
function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="border border-[var(--editorial-stroke)]/30 rounded p-2.5 space-y-2.5">
      <h5 className="text-[8px] font-black uppercase text-[var(--editorial-text-gray)] tracking-wider">{title}</h5>
      {children}
    </div>
  );
}

const inputCls = "w-full bg-transparent border-b border-[var(--editorial-stroke)] text-xs py-1.5 focus:outline-none focus:border-[var(--editorial-accent-blue)] transition-colors";
const textareaCls = "w-full bg-[var(--editorial-bg)] border border-[var(--editorial-stroke)]/50 rounded p-2 text-[11px] resize-none focus:outline-none focus:border-[var(--editorial-accent-blue)] transition-colors leading-relaxed";

function ConfigFields({ node, onUpdateConfig }: { node: WorkflowNode; onUpdateConfig: (key: string, value: string | number) => void }) {
  const cfg = node.config || {};

  if (node.type === 'custom_agent') {
    return (
      <div className="space-y-3">
        <Section title="基本信息">
          <Field label="智能体名称" hint="显示在画布上的名称">
            <input value={cfg.name || ''} onChange={(e) => onUpdateConfig('name', e.target.value)} className={inputCls} placeholder="如：品牌审核官" />
          </Field>
          <Field label="系统 Prompt" hint="定义智能体的角色、行为和约束。支持 {变量名} 引用上游输入">
            <textarea value={cfg.prompt || ''} onChange={(e) => onUpdateConfig('prompt', e.target.value)} rows={4} className={textareaCls} placeholder="你是一个专业的品牌内容审核员。请检查以下内容是否符合品牌调性…" />
          </Field>
        </Section>
        <Section title="数据流定义">
          <Field label="输入字段" hint="逗号分隔，对应上游节点的输出字段名。如：brief, brand_context">
            <input value={cfg.input_fields || ''} onChange={(e) => onUpdateConfig('input_fields', e.target.value)} className={inputCls} placeholder="brief, brand_context" />
          </Field>
          <Field label="输出 Schema" hint="JSON 格式，定义本节点产出的数据结构">
            <textarea value={cfg.output_schema_text || ''} onChange={(e) => onUpdateConfig('output_schema_text', e.target.value)} rows={2} className={`${textareaCls} font-mono text-[10px]`} placeholder='{ "response": "string", "score": "number" }' />
          </Field>
        </Section>
        <Section title="模型参数">
          <Field label="模型" hint="留空使用组织默认模型。可填 openai/gpt-4o、anthropic/claude-sonnet 等">
            <input value={cfg.model || ''} onChange={(e) => onUpdateConfig('model', e.target.value)} className={inputCls} placeholder="留空 = 使用默认" />
          </Field>
          <Field label="温度 (Temperature)" hint="0 = 确定性输出，1 = 创意发散，2 = 高随机性">
            <input type="number" min="0" max="2" step="0.1" value={cfg.temperature ?? 0.7} onChange={(e) => onUpdateConfig('temperature', Number(e.target.value))} className={inputCls} />
          </Field>
          <Field label="失败策略">
            <select value={cfg.failure_strategy || '重试一次后跳过'} onChange={(e) => onUpdateConfig('failure_strategy', e.target.value)} className={inputCls}>
              <option value="重试一次后跳过">重试一次后跳过</option>
              <option value="直接跳过">直接跳过并标记</option>
              <option value="中断工作流">中断整个工作流</option>
            </select>
          </Field>
        </Section>
      </div>
    );
  }
  if (node.type === 'context') {
    return (
      <div className="space-y-3">
        <Section title="品牌上下文">
          <Field label="品牌摘要" hint="本节点输出给下游所有节点的品牌背景信息，是整个工作流的记忆基础">
            <textarea rows={4} value={cfg.summary || ''} onChange={(e) => onUpdateConfig('summary', e.target.value)} className={textareaCls} placeholder="我们是一个面向年轻创作者的AI营销工具品牌，主打高效、专业、有趣的内容生产…" />
          </Field>
          <Field label="品牌语调" hint="影响下游文案和审核节点的风格判断">
            <input value={cfg.tone || ''} onChange={(e) => onUpdateConfig('tone', e.target.value)} className={inputCls} placeholder="如：专业但不失活泼、年轻化" />
          </Field>
          <Field label="目标受众" hint="下游节点会据此调整内容策略">
            <input value={cfg.target_audience || ''} onChange={(e) => onUpdateConfig('target_audience', e.target.value)} className={inputCls} placeholder="如：18-30岁内容创作者、品牌运营" />
          </Field>
          <Field label="禁用词" hint="下游审核节点会检查这些词是否出现">
            <input value={cfg.forbidden_words || ''} onChange={(e) => onUpdateConfig('forbidden_words', e.target.value)} className={inputCls} placeholder="如：绝对、第一、包治百病（逗号分隔）" />
          </Field>
        </Section>
      </div>
    );
  }
  if (node.type === 'copy') {
    return (
      <div className="space-y-3">
        <Section title="文案生成参数">
          <Field label="平台" hint="决定文案风格和长度。不同平台有不同的内容规范">
            <select value={cfg.platform || 'Xiaohongshu'} onChange={(e) => onUpdateConfig('platform', e.target.value)} className={inputCls}>
              <option value="Xiaohongshu">小红书</option>
              <option value="Douyin">抖音</option>
              <option value="WeChat">微信公众号</option>
              <option value="Weibo">微博</option>
              <option value="Bilibili">B站</option>
              <option value="General">通用</option>
            </select>
          </Field>
          <Field label="语调风格" hint="留空则使用上游品牌上下文节点的语调">
            <input value={cfg.tone || ''} onChange={(e) => onUpdateConfig('tone', e.target.value)} className={inputCls} placeholder="如：爆款活泼、专业深度、轻松幽默" />
          </Field>
          <Field label="产品描述" hint="留空则自动从上游节点提取。描述产品核心卖点和使用场景">
            <textarea value={cfg.product_description || ''} onChange={(e) => onUpdateConfig('product_description', e.target.value)} rows={3} className={textareaCls} placeholder="一款AI驱动的营销内容生成工具，帮助品牌团队10倍速产出高质量内容…" />
          </Field>
        </Section>
      </div>
    );
  }
  if (node.type === 'image_prompt') {
    return (
      <div className="space-y-3">
        <Section title="图片提示词参数">
          <Field label="画面描述" hint="越具体越好。包含主体、场景、构图、光影、情绪。可引用上游文案节点的标题或段落">
            <textarea value={cfg.prompt || ''} onChange={(e) => onUpdateConfig('prompt', e.target.value)} rows={3} className={textareaCls} placeholder="一张俯拍视角的产品桌搭图，白色大理石桌面，产品居中，周围散落干燥花和杂志…" />
          </Field>
          <Field label="负面提示词" hint="告诉模型不要生成什么。通用负面词可提高画质">
            <textarea value={cfg.negative_prompt || ''} onChange={(e) => onUpdateConfig('negative_prompt', e.target.value)} rows={2} className={textareaCls} placeholder="低清晰度、夸张承诺、品牌不一致、文字错误、多余手指" />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="画面风格" hint="影响整体视觉调性">
              <input value={cfg.style || ''} onChange={(e) => onUpdateConfig('style', e.target.value)} className={inputCls} placeholder="如：editorial、极简、赛博朋克" />
            </Field>
            <Field label="画幅比例" hint="根据投放平台选择">
              <select value={cfg.aspect_ratio || '1:1'} onChange={(e) => onUpdateConfig('aspect_ratio', e.target.value)} className={inputCls}>
                <option value="1:1">1:1 (方图/小红书)</option>
                <option value="4:3">4:3 (横图)</option>
                <option value="3:4">3:4 (竖图)</option>
                <option value="16:9">16:9 (横幅/视频封面)</option>
                <option value="9:16">9:16 (竖屏/抖音)</option>
              </select>
            </Field>
          </div>
        </Section>
      </div>
    );
  }
  if (node.type === 'image_generation') {
    return (
      <div className="space-y-3">
        <Section title="图片生成参数">
          <Field label="图像模型" hint="不同模型擅长不同风格。留空使用组织默认">
            <select value={cfg.model || ''} onChange={(e) => onUpdateConfig('model', e.target.value)} className={inputCls}>
              <option value="">使用默认模型</option>
              <option value="dall-e-3">DALL·E 3</option>
              <option value="stable-diffusion">Stable Diffusion</option>
              <option value="midjourney">Midjourney</option>
            </select>
          </Field>
          <Field label="画幅比例">
            <select value={cfg.aspect_ratio || '1:1'} onChange={(e) => onUpdateConfig('aspect_ratio', e.target.value)} className={inputCls}>
              <option value="1:1">1:1</option>
              <option value="4:3">4:3</option>
              <option value="3:4">3:4</option>
              <option value="16:9">16:9</option>
              <option value="9:16">9:16</option>
            </select>
          </Field>
          <Field label="失败策略" hint="图片生成可能因内容审核等原因失败">
            <select value={cfg.failure_strategy || '失败后保留提示词并重试一次'} onChange={(e) => onUpdateConfig('failure_strategy', e.target.value)} className={inputCls}>
              <option value="失败后保留提示词并重试一次">重试一次</option>
              <option value="直接跳过">跳过并标记</option>
              <option value="中断工作流">中断工作流</option>
            </select>
          </Field>
        </Section>
      </div>
    );
  }
  if (node.type === 'storyboard') {
    return (
      <div className="space-y-3">
        <Section title="分镜脚本参数">
          <Field label="视频主题" hint="留空则从上游文案节点自动提取">
            <input value={cfg.video_topic || ''} onChange={(e) => onUpdateConfig('video_topic', e.target.value)} className={inputCls} placeholder="如：新品发布、用户故事、教程演示" />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="时长 (秒)" hint="建议 15/30/60/90 秒">
              <input type="number" min="5" max="300" value={cfg.duration || 30} onChange={(e) => onUpdateConfig('duration', Number(e.target.value))} className={inputCls} />
            </Field>
            <Field label="目标受众" hint="留空使用品牌上下文">
              <input value={cfg.target_audience || ''} onChange={(e) => onUpdateConfig('target_audience', e.target.value)} className={inputCls} placeholder="如：年轻创作者" />
            </Field>
          </div>
          <Field label="镜头要求" hint="描述每个镜头的画面、口播、字幕和转场要求">
            <textarea value={cfg.text || ''} onChange={(e) => onUpdateConfig('text', e.target.value)} rows={3} className={textareaCls} placeholder="开头3秒产品特写→中段用户使用场景→结尾品牌logo+slogan" />
          </Field>
        </Section>
      </div>
    );
  }
  if (node.type === 'retrieval') {
    return (
      <div className="space-y-3">
        <Section title="检索参数">
          <Field label="检索范围" hint="限定搜索的数据源。品牌记忆包含历史品牌资产和上下文">
            <select value={cfg.retrieval_scope || '品牌记忆和资产库'} onChange={(e) => onUpdateConfig('retrieval_scope', e.target.value)} className={inputCls}>
              <option value="品牌记忆和资产库">品牌记忆和资产库</option>
              <option value="社区作品库">社区作品库</option>
              <option value="全部">全部数据源</option>
            </select>
          </Field>
          <Field label="检索关键词" hint="用自然语言描述你想找的内容。支持引用上游节点输出">
            <textarea value={cfg.prompt || ''} onChange={(e) => onUpdateConfig('prompt', e.target.value)} rows={3} className={textareaCls} placeholder="找到与新品发布相关的品牌历史素材和成功案例…" />
          </Field>
        </Section>
      </div>
    );
  }
  if (node.type === 'review') {
    return (
      <div className="space-y-3">
        <Section title="审核规则">
          <Field label="敏感词 / 禁用词" hint="逗号分隔。内容中出现这些词会被标记为风险">
            <textarea value={cfg.forbidden_words || ''} onChange={(e) => onUpdateConfig('forbidden_words', e.target.value)} rows={2} className={textareaCls} placeholder="绝对、第一、包治百病、100%有效" />
          </Field>
          <Field label="渠道合规规则" hint="针对投放平台的内容规范。审核节点会检查是否违反">
            <textarea value={cfg.channel_rules || ''} onChange={(e) => onUpdateConfig('channel_rules', e.target.value)} rows={3} className={textareaCls} placeholder="小红书：不得使用绝对化用语；抖音：不得出现联系方式…" />
          </Field>
        </Section>
      </div>
    );
  }
  // audio (default)
  return (
    <div className="space-y-3">
      <Section title="配音参数">
        <Field label="音色" hint="选择配音的声线风格">
          <select value={cfg.voice_id || 'female_warm'} onChange={(e) => onUpdateConfig('voice_id', e.target.value)} className={inputCls}>
            <option value="female_warm">温暖女声</option>
            <option value="female_bright">明亮女声</option>
            <option value="male_calm">沉稳男声</option>
            <option value="male_energetic">活力男声</option>
            <option value="neutral">中性</option>
          </select>
        </Field>
        <Field label="语速" hint="1.0 = 正常语速，0.5 = 慢速，2.0 = 快速">
          <input type="number" min="0.5" max="3" step="0.1" value={cfg.speed || 1} onChange={(e) => onUpdateConfig('speed', Number(e.target.value))} className={inputCls} />
        </Field>
        <Field label="配音文本" hint="留空则自动从上游文案节点提取正文内容">
          <textarea value={cfg.text || ''} onChange={(e) => onUpdateConfig('text', e.target.value)} rows={3} className={textareaCls} placeholder="将要朗读的文本内容…" />
        </Field>
      </Section>
    </div>
  );
}
