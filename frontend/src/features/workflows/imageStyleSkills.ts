/** 图片提示词节点：预设风格 Skill（注入绘图 prompt 的视觉指导） */
export type ImageStyleSkill = {
  id: string;
  label: string;
  /** 给模型 / 下游配图用的风格描述 */
  skill: string;
};

export const IMAGE_STYLE_SKILLS: ImageStyleSkill[] = [
  {
    id: 'editorial_magazine',
    label: '杂志编辑风',
    skill: '高端编辑类摄影，自然侧光，留白克制，纸质质感，低饱和大地色系，适合品牌故事与生活方式内容',
  },
  {
    id: 'xiaohongshu_lifestyle',
    label: '小红书种草',
    skill: '明亮通透的桌面场景，俯拍或 45 度角，精致道具点缀，柔和自然光，清爽配色，突出产品使用情境与种草氛围',
  },
  {
    id: 'product_studio',
    label: '产品棚拍',
    skill: '纯色或渐变背景的产品棚拍，主体清晰锐利，受控柔光，轻微反射与阴影，突出材质细节与包装',
  },
  {
    id: 'minimal_flat',
    label: '极简扁平',
    skill: '极简构图，大面积留白，几何块面与干净线条，低对比配色，无杂乱元素，适合 SaaS 与科技品牌',
  },
  {
    id: 'cinematic_film',
    label: '电影质感',
    skill: '宽画幅电影感构图，层次化景深，冷暖对比光影，轻微颗粒质感，情绪氛围强，适合短视频封面与品牌短片',
  },
  {
    id: 'illustration_hand',
    label: '手绘插画',
    skill: '手绘插画或水彩质感，柔和笔触，温暖配色，适度夸张造型，适合年轻化传播与创意 campaign',
  },
  {
    id: 'corporate_b2b',
    label: '企业商务',
    skill: '专业商务场景，会议室或办公环境，真实人物协作画面，稳重蓝灰色调，传达可信与效率',
  },
  {
    id: 'cyber_neon',
    label: '赛博霓虹',
    skill: '霓虹灯与深色背景，高对比紫蓝品红点缀，未来科技感，适合游戏、AI、潮流数码主题',
  },
];

export const DEFAULT_IMAGE_STYLE_SKILL_ID = IMAGE_STYLE_SKILLS[0].id;

export function getImageStyleSkill(id: string | undefined): ImageStyleSkill {
  return IMAGE_STYLE_SKILLS.find((item) => item.id === id) || IMAGE_STYLE_SKILLS[0];
}
