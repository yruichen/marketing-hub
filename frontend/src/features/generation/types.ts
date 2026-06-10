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

export interface CopyInput {
  brandName: string;
  description: string;
  tone: string;
  platform: string;
}

export interface CopyOutput {
  platform: string;
  tone: string;
  title: string;
  paragraphs: string[];
  tags: string[];
  call_to_action: string;
}

export interface ImageInput {
  prompt: string;
  aspectRatio: string;
  style: string;
}

export interface ImageOutput {
  prompt: string;
  style: string;
  aspectRatio: string;
  image_url: string;
  revised_prompt: string;
}

export interface StoryboardInput {
  topic: string;
  duration: number;
  audience: string;
}

export interface StoryboardOutput {
  video_topic: string;
  total_duration_seconds: number;
  target_audience: string;
  scenes: Array<{ scene_number: number; visual_description: string; audio_narration: string; duration_seconds: number }>;
}

export interface AudioInput {
  text: string;
  voiceId: string;
  speed: number;
}

export interface AudioOutput {
  text: string;
  voice_id: string;
  speed: number;
  audio_url: string;
}

export type ToastType = 'success' | 'info' | 'error';
