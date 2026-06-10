import { useState, useEffect, useRef } from 'react';
import { Sparkles } from 'lucide-react';
import { apiPost } from '../../hooks/useApi';
import type {
  OrganizationRecord,
  ProjectRecord,
  CampaignRecord,
  BrandContext,
  WorkspaceDraftRecord,
} from '../../types/workspace';

interface BrainstormPageProps {
  organization: OrganizationRecord | null;
  project: Pick<ProjectRecord, 'id' | 'name' | 'slug'> | null;
  campaign: Pick<CampaignRecord, 'id' | 'name'> | null;
  username: string;
  triggerToast: (text: string, type?: 'success' | 'info' | 'error') => void;
  onComplete: (draftId: number) => void;
}

const TAGLINES = [
  'Blow up your single idea!',
  'One spark. Full campaign.',
  'Type it. We build it.',
  'From thought to workflow in seconds.',
  'Drop your idea. Watch it grow.',
  'Your idea deserves a whole campaign.',
  'One sentence. Endless possibilities.',
  'Brain dump. We handle the rest.',
  'Turn "what if" into "what\'s next."',
  'Just type. The AI handles the DAG.',
  'Seed an idea. Harvest a workflow.',
  'Start small. Launch big.',
  'Your napkin sketch, amplified.',
  'Raw idea in. Polished workflow out.',
];

const PROGRESS_STEPS = [
  'Analyzing your idea...',
  'Designing workflow structure...',
  'Configuring AI nodes...',
  'Ready to launch!',
];

export function BrainstormPage({ triggerToast, onComplete }: BrainstormPageProps) {
  const [tagline] = useState(() => TAGLINES[Math.floor(Math.random() * TAGLINES.length)]);
  const [idea, setIdea] = useState('');
  const [phase, setPhase] = useState<'idle' | 'brainstorming'>('idle');
  const [progressStep, setProgressStep] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const apiDoneRef = useRef(false);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  useEffect(() => {
    if (phase !== 'brainstorming') return;
    if (apiDoneRef.current) return;
    const timer = setInterval(() => {
      setProgressStep((prev) => {
        if (prev >= 3 || apiDoneRef.current) {
          clearInterval(timer);
          return prev;
        }
        return prev + 1;
      });
    }, 1200);
    return () => clearInterval(timer);
  }, [phase]);

  const handleSubmit = async () => {
    const trimmed = idea.trim();
    if (!trimmed || phase === 'brainstorming') return;
    setPhase('brainstorming');
    setProgressStep(0);
    apiDoneRef.current = false;

    try {
      const response = await apiPost<{
        draft: WorkspaceDraftRecord;
        summary: string;
        workflow_name: string;
        brand_context: BrandContext;
      }>('/brainstorm/', { idea: trimmed });

      apiDoneRef.current = true;
      setProgressStep(3);
      await new Promise((resolve) => setTimeout(resolve, 800));
      onComplete(response.draft.id);
    } catch {
      triggerToast('Brainstorm failed. Please try again.', 'error');
      setPhase('idle');
      apiDoneRef.current = false;
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
  };

  return (
    <div className="flex flex-col items-center justify-center min-h-[calc(100vh-4rem)] px-6 py-12">
      <div className="w-full max-w-2xl">
        {phase === 'idle' ? (
          <div className="animate-in fade-in duration-500">
            <h1 className="serif-header text-4xl md:text-5xl text-center mb-3 leading-tight">
              {tagline}
            </h1>
            <p className="text-center font-mono text-[10px] uppercase tracking-[0.2em] text-[var(--editorial-text-gray)] mb-12">
              Describe your creative idea in one sentence
            </p>

            <div className="relative">
              <input
                ref={inputRef}
                type="text"
                value={idea}
                onChange={(e) => setIdea(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="e.g., Launch a minimalist coffee brand targeting Gen Z on Xiaohongshu..."
                className="w-full bg-transparent border-b-2 border-[var(--editorial-stroke)] py-4 px-1 text-lg md:text-xl font-sans text-[var(--editorial-text)] placeholder:text-[var(--editorial-text-gray)]/50 focus:outline-none focus:border-neoYellow transition-colors"
              />
              <div className="absolute bottom-0 left-0 h-[2px] bg-neoYellow transition-all duration-300" style={{ width: idea ? '100%' : '0%' }} />
            </div>

            <div className="flex items-center justify-between mt-8">
              <span className="font-mono text-[9px] text-[var(--editorial-text-gray)] uppercase tracking-wider">
                Press Enter to brainstorm
              </span>
              <button
                onClick={handleSubmit}
                disabled={!idea.trim()}
                className="btn-editorial-primary flex items-center gap-2 px-6 py-3 rounded-none font-bold text-[11px] uppercase tracking-[0.15em] disabled:opacity-40 disabled:cursor-not-allowed hover:translate-y-[-1px] transition-transform"
              >
                <Sparkles size={14} />
                Ignite
              </button>
            </div>
          </div>
        ) : (
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
        )}
      </div>
    </div>
  );
}
