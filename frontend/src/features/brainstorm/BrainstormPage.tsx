import { useState, useEffect, useRef } from 'react';
import { PanelLeft } from 'lucide-react';
import { apiPost, buildErrorToast } from '../../hooks/useApi';
import type { TriggerToastFn } from '../../shared/types/toast';
import type {
  OrganizationRecord,
  ProjectRecord,
  CampaignRecord,
  BrandContext,
  WorkspaceDraftRecord,
} from '../../types/workspace';
import { HeroBlock } from './HeroBlock';
import { IdeaInput } from './IdeaInput';
import { BrainstormProgress } from './BrainstormProgress';
import { BackgroundSparkles } from './BackgroundSparkles';
import { BrainstormHandoff } from './BrainstormHandoff';
import './brainstorm.css';

interface BrainstormPageProps {
  organization: OrganizationRecord | null;
  project: Pick<ProjectRecord, 'id' | 'name' | 'slug'> | null;
  campaign: Pick<CampaignRecord, 'id' | 'name'> | null;
  username: string;
  triggerToast: TriggerToastFn;
  onComplete: (draftId: number) => void;
  onToggleSidebar: () => void;
}

const IDEA_STARTERS = [
  '为一个极简咖啡品牌做小红书新品首发',
  '把 AI 工作流产品包装成 B2B 增长活动',
  '为夏季护肤套装生成种草内容链路',
  '做一条 30 秒新品短视频，从分镜到配音',
];

const TAGLINES = [
  'One spark. Full campaign.',
  'Type it. We build it.',
  'From thought to workflow in seconds.',
  'Drop your idea. Watch it grow.',
  'Your idea deserves a whole campaign.',
  'One sentence. Endless possibilities.',
  'Brain dump. We handle the rest.',
  'Turn "what if" into "what\'s next."',
  'Seed an idea. Harvest a workflow.',
  'Start small. Launch big.',
  'Your napkin sketch, amplified.',
  'Raw idea in. Polished workflow out.',
];

export function BrainstormPage({
  organization,
  project,
  campaign,
  username,
  triggerToast,
  onComplete,
  onToggleSidebar,
}: BrainstormPageProps) {
  const [tagline] = useState(() => TAGLINES[Math.floor(Math.random() * TAGLINES.length)]);
  const [idea, setIdea] = useState('');
  const [phase, setPhase] = useState<'idle' | 'brainstorming' | 'handoff'>('idle');
  const [progressStep, setProgressStep] = useState(0);
  const apiDoneRef = useRef(false);

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
      await new Promise((resolve) => setTimeout(resolve, 520));
      setPhase('handoff');
      await new Promise((resolve) => setTimeout(resolve, 1180));
      onComplete(response.draft.id);
    } catch (err) {
      triggerToast(buildErrorToast(err, '创意脑暴失败', '请稍后重试'));
      setPhase('idle');
      apiDoneRef.current = false;
    }
  };

  return (
    <div className="brainstorm-stage flex flex-col items-center justify-center min-h-[calc(100vh-4rem)] px-5 py-10 md:px-8 md:py-12 relative overflow-hidden">
      <BackgroundSparkles active={phase === 'brainstorming'} />

      <button
        onClick={onToggleSidebar}
        className="absolute top-6 left-6 p-2 border border-[var(--editorial-stroke)]/30 hover:border-[var(--editorial-stroke)] hover:bg-[var(--editorial-paper)] transition-all cursor-pointer z-10"
        title="Toggle sidebar"
        aria-label="Toggle sidebar"
      >
        <PanelLeft size={16} className="text-[var(--editorial-text-gray)]" />
      </button>

      <div className="w-full max-w-3xl relative z-10">
        {phase === 'idle' ? (
          <div className="animate-in fade-in duration-500">
            <HeroBlock
              tagline={tagline}
              username={username}
              organizationName={organization?.name}
              projectName={project?.name}
              campaignName={campaign?.name}
            />
            <IdeaInput value={idea} onChange={setIdea} onSubmit={handleSubmit} />
            <div className="brainstorm-starters" aria-label="Idea starters">
              {IDEA_STARTERS.map((starter, index) => (
                <button
                  key={starter}
                  type="button"
                  onClick={() => setIdea(starter)}
                  className="brainstorm-starters__chip"
                  style={{ animationDelay: `${260 + index * 70}ms` }}
                >
                  {starter}
                </button>
              ))}
            </div>
          </div>
        ) : phase === 'brainstorming' ? (
          <BrainstormProgress idea={idea} progressStep={progressStep} />
        ) : (
          <BrainstormHandoff idea={idea} />
        )}
      </div>
    </div>
  );
}
