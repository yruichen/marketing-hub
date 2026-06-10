interface BackgroundSparklesProps {
  active: boolean;
}

/**
 * brainstorming 阶段：12 个微弱光点从中心向外脉动，提示「正在加工」。
 * active=false 时 opacity:0，不占交互。
 * 位置/延迟用确定性伪随机（基于 i），不引入 random 库。
 */
export function BackgroundSparkles({ active }: BackgroundSparklesProps) {
  const dots = Array.from({ length: 12 }, (_, i) => {
    const angle = (i / 12) * Math.PI * 2;
    const radius = 140 + (i % 3) * 30;
    const x = 50 + Math.cos(angle) * (radius / 4);
    const y = 50 + Math.sin(angle) * (radius / 4);
    return { i, x, y, delay: (i * 137) % 2000 };
  });

  return (
    <div
      aria-hidden
      className={`brainstorm-sparkles pointer-events-none ${active ? 'is-active' : ''}`}
    >
      {dots.map((d) => (
        <span
          key={d.i}
          className="brainstorm-sparkles__dot"
          style={{
            left: `${d.x}%`,
            top: `${d.y}%`,
            animationDelay: `${d.delay}ms`,
          }}
        />
      ))}
    </div>
  );
}
