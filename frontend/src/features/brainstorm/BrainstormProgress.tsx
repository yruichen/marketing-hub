import { Check, CircleDashed } from 'lucide-react';

interface BrainstormProgressProps {
  idea: string;
  progressStep: number;
}

const PROGRESS_STEPS = [
  'Distilling the core idea',
  'Mapping campaign moves',
  'Wiring AI workflow nodes',
  'Ready for launch',
];

/**
 * Ignite 后的进度条：4 个步骤 + 3 个跳动小点。
 * progressStep 0-3，由父组件的 interval 推进。
 */
export function BrainstormProgress({ idea, progressStep }: BrainstormProgressProps) {
  return (
    <div className="brainstorm-progress animate-in fade-in duration-300">
      <div className="text-center mb-10">
        <p className="font-mono text-[10px] uppercase tracking-[0.24em] text-[var(--editorial-accent-blue)] mb-3 font-black">
          Blowing up the idea
        </p>
        <p className="serif-header text-2xl md:text-3xl italic text-[var(--editorial-text)] opacity-70">
          "{idea.length > 60 ? idea.slice(0, 60) + '...' : idea}"
        </p>
      </div>

      <div className="brainstorm-flow" aria-hidden>
        <div className="brainstorm-flow__fill" style={{ width: `${Math.max(16, ((progressStep + 1) / PROGRESS_STEPS.length) * 100)}%` }} />
      </div>

      <div className="space-y-3 max-w-lg mx-auto">
        {PROGRESS_STEPS.map((step, i) => (
          <div
            key={i}
            className={`brainstorm-progress__step ${
              i <= progressStep ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-2'
            }`}
          >
            <span className={`brainstorm-progress__mark ${i <= progressStep ? 'is-active' : ''}`}>
              {i < progressStep || (i === 3 && i <= progressStep) ? <Check className="h-3.5 w-3.5" /> : <CircleDashed className="h-3.5 w-3.5" />}
            </span>
            <span
              className={`font-mono text-xs tracking-wide uppercase ${
                i === 3 && i <= progressStep
                  ? 'text-emerald-700 font-bold'
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
    </div>
  );
}
