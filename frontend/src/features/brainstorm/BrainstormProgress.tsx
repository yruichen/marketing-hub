interface BrainstormProgressProps {
  idea: string;
  progressStep: number;
}

const PROGRESS_STEPS = [
  'Analyzing your idea...',
  'Designing workflow structure...',
  'Configuring AI nodes...',
  'Ready to launch!',
];

/**
 * Ignite 后的进度条：4 个步骤 + 3 个跳动小点。
 * progressStep 0-3，由父组件的 interval 推进。
 */
export function BrainstormProgress({ idea, progressStep }: BrainstormProgressProps) {
  return (
    <div className="animate-in fade-in duration-300">
      <div className="text-center mb-10">
        <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-[var(--editorial-text-gray)] mb-2">
          Brainstorming
        </p>
        <p className="serif-header text-2xl md:text-3xl italic opacity-60">
          "{idea.length > 60 ? idea.slice(0, 60) + '...' : idea}"
        </p>
      </div>

      <div className="space-y-4 max-w-md mx-auto">
        {PROGRESS_STEPS.map((step, i) => (
          <div
            key={i}
            className={`flex items-center gap-3 transition-all duration-500 ${
              i <= progressStep ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-2'
            }`}
          >
            <div
              className={`w-2 h-2 rounded-full flex-shrink-0 transition-colors duration-300 ${
                i < progressStep
                  ? 'bg-neoGreen'
                  : i === progressStep
                  ? i === 3
                    ? 'bg-neoGreen'
                    : 'bg-neoYellow animate-pulse'
                  : 'bg-[var(--editorial-unselected)]'
              }`}
            />
            <span
              className={`font-mono text-xs tracking-wide ${
                i === 3 && i <= progressStep
                  ? 'text-neoGreen font-bold'
                  : i <= progressStep
                  ? 'text-[var(--editorial-text)]'
                  : 'text-[var(--editorial-text-gray)]'
              }`}
            >
              {step}
            </span>
          </div>
        ))}
      </div>

      <div className="mt-10 flex justify-center">
        <div className="flex gap-1">
          {[0, 1, 2].map((i) => (
            <div
              key={i}
              className="w-1.5 h-1.5 rounded-full bg-neoYellow/60 animate-pulse"
              style={{ animationDelay: `${i * 200}ms` }}
            />
          ))}
        </div>
      </div>
    </div>
  );
}
