import { useWelcomeLine } from './useWelcomeLine';

interface HeroBlockProps {
  tagline: string;
  username: string;
}

/**
 * 顶部品牌区：tagline（随机英文广告语）+ 欢迎语（user_name）+ 副标。
 * 欢迎语基于时间动态生成，详见 useWelcomeLine。
 */
export function HeroBlock({ tagline, username }: HeroBlockProps) {
  const welcome = useWelcomeLine(username);

  return (
    <div className="text-center mb-12">
      <p
        className="brainstorm-welcome font-mono text-[10px] uppercase tracking-[0.25em] text-[var(--editorial-accent-blue)] mb-3 font-bold"
        title={welcome.english}
      >
        {welcome.chinese}
        <span className="mx-2 text-[var(--editorial-text-gray)]">·</span>
        <span className="text-[var(--editorial-text-gray)] font-semibold normal-case tracking-wider">
          {welcome.flavor}
        </span>
      </p>
      <h1 className="serif-header text-4xl md:text-5xl mb-3 leading-tight">
        {tagline}
      </h1>
      <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-[var(--editorial-text-gray)]">
        Describe your creative idea in one sentence
      </p>
    </div>
  );
}
