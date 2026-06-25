import { useWelcomeLine } from './useWelcomeLine';

interface HeroBlockProps {
  tagline: string;
  username: string;
  organizationName?: string;
  projectName?: string;
  campaignName?: string;
}

/**
 * 顶部品牌区：固定品牌主张 + 欢迎语（user_name）+ 当前工作区。
 * 欢迎语基于时间动态生成，详见 useWelcomeLine。
 */
export function HeroBlock({ tagline, username, organizationName, projectName, campaignName }: HeroBlockProps) {
  const welcome = useWelcomeLine(username);
  const scopeText = [organizationName, projectName, campaignName].filter(Boolean).join(' / ');

  return (
    <div className="text-center mb-10 md:mb-12">
      <p
        className="brainstorm-welcome font-mono text-[10px] uppercase tracking-[0.24em] text-[var(--editorial-accent-blue)] mb-4 font-black"
        title={welcome.english}
      >
        <span>{welcome.chinese}</span>
        <span className="mx-2 text-[var(--editorial-text-gray)]">/</span>
        <span className="text-[var(--editorial-text-gray)] font-semibold tracking-wider">{welcome.flavor}</span>
      </p>
      <h1 className="brainstorm-brandline serif-header text-4xl md:text-6xl leading-[0.95] text-[var(--editorial-text)]">
        <span className="brainstorm-brandline__word" style={{ animationDelay: '80ms' }}>BLOW</span>
        <span className="brainstorm-brandline__up" style={{ animationDelay: '170ms' }}>UP</span>
        <span className="brainstorm-brandline__word" style={{ animationDelay: '260ms' }}>YOUR</span>
        <span className="brainstorm-brandline__simple" style={{ animationDelay: '350ms' }}>SIMPLE IDEA</span>
      </h1>
      <p className="brainstorm-handline" aria-label={tagline}>
        {tagline}
      </p>
      <div className="brainstorm-scope mx-auto mt-5 max-w-2xl">
        <span>{scopeText || 'Marketing Hub / Idea Lab'}</span>
      </div>
    </div>
  );
}
