import { ArrowRight, Image as ImageIcon, Mic, Video, Wand2 } from 'lucide-react';
import type { CommunityItem } from './types';

export function TemplateVisual({
  item,
  tone = 'medium',
}: {
  item: CommunityItem;
  tone?: 'short' | 'medium' | 'tall';
}) {
  const toneClass = `template-xhs-card__visual--${tone}`;

  if (item.creation_type === 'image') {
    return (
      <div className={`template-xhs-card__visual template-xhs-card__visual--image ${toneClass}`}>
        {item.image_url ? (
          <img src={item.image_url} alt={item.title} loading="lazy" />
        ) : (
          <div className="flex h-full min-h-32 items-center justify-center" aria-label="该模板没有预览图">
            <ImageIcon className="h-8 w-8" />
          </div>
        )}
      </div>
    );
  }

  if (item.creation_type === 'audio') {
    return (
      <div className={`template-xhs-card__visual template-xhs-card__visual--audio ${toneClass}`}>
        <Mic className="h-8 w-8" />
        <div className="template-xhs-wave" aria-hidden="true">
          {Array.from({ length: 16 }).map((_, index) => (
            <span key={index} style={{ height: `${22 + ((index * 13) % 58)}%` }} />
          ))}
        </div>
      </div>
    );
  }

  if (item.creation_type === 'storyboard' || item.creation_type === 'video') {
    return (
      <div className={`template-xhs-card__visual template-xhs-card__visual--storyboard ${toneClass}`}>
        <Video className="h-8 w-8" />
        <div className="template-xhs-scenes">
          {item.creation_type === 'video'
            ? <span>VIDEO</span>
            : (item.content.scenes || []).slice(0, 4).map((scene, index) => (
              <span key={index}>S{scene.scene_number || index + 1}</span>
            ))}
        </div>
      </div>
    );
  }

  return (
    <div className={`template-xhs-card__visual template-xhs-card__visual--copy ${toneClass}`}>
      <Wand2 className="h-7 w-7" />
      <p>{item.content.title || item.title}</p>
      <ArrowRight className="h-4 w-4" />
    </div>
  );
}
