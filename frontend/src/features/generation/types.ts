export interface ContentPackage {
  platform: string;
  title: string;
  body: string;
  tags: string[];
  imagePrompt: string;
  storyboard: string[];
  voiceover: string;
  reviewAdvice: string[];
  exportFormats: string[];
  version: 'AI 初稿' | '用户修改稿' | '最终稿';
}
