import { describe, expect, it } from 'vitest';
import { resolveNodeOutputDisplay } from './utils';

describe('workflow output display', () => {
  it('renders image result urls as image previews instead of video previews', () => {
    const display = resolveNodeOutputDisplay({
      result: {
        url: 'https://cdn.example.com/generated-image.png',
        revised_prompt: 'A clean product hero image',
      },
    });

    expect(display.kind).toBe('image');
    if (display.kind === 'image') {
      expect(display.imageUrl).toBe('https://cdn.example.com/generated-image.png');
      expect(display.text).toBe('A clean product hero image');
    }
  });

  it('keeps video-specific urls as video previews', () => {
    const display = resolveNodeOutputDisplay({
      data: {
        video_url: 'https://cdn.example.com/generated-video.mp4',
        thumbnail_url: 'https://cdn.example.com/generated-video.jpg',
      },
    });

    expect(display.kind).toBe('video');
  });
});
