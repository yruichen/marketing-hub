import { ArrowRight, Mic, Video, Wand2 } from 'lucide-react';
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
        <img
          src={item.image_url || 'https://images.unsplash.com/photo-1513519245088-0e12902e5a38?auto=format&fit=crop&w=800&q=80'}
          alt={item.title}
          loading="lazy"
        />
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
