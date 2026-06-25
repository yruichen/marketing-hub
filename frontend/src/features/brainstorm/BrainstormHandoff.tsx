import { Check, FileText, Image, PenLine, ShieldCheck, Sparkles } from 'lucide-react';

interface BrainstormHandoffProps {
  idea: string;
}

const HANDOFF_NODES = [
  { label: 'Brief', icon: Sparkles },
  { label: 'Copy', icon: PenLine },
  { label: 'Image', icon: Image },
  { label: 'Storyboard', icon: FileText },
  { label: 'Review', icon: ShieldCheck },
];

export function BrainstormHandoff({ idea }: BrainstormHandoffProps) {
  const clippedIdea = idea.length > 72 ? `${idea.slice(0, 72)}...` : idea;

  return (
    <div className="brainstorm-handoff text-center">
      <p className="font-mono text-[10px] uppercase tracking-[0.24em] text-[var(--editorial-accent-blue)] mb-3 font-black">
        Assembling workflow
      </p>
      <h2 className="serif-header text-2xl md:text-3xl italic text-[var(--editorial-text)]">
        "{clippedIdea}"
      </h2>

      <div className="brainstorm-handoff__graph" aria-label="Workflow assembly preview">
        {HANDOFF_NODES.map((node, index) => {
          const Icon = node.icon;
          return (
            <div key={node.label} className="brainstorm-handoff__step">
              <div
                className="brainstorm-handoff__node"
                style={{ animationDelay: `${index * 120}ms` }}
              >
                <Icon className="h-4 w-4" />
                <span>{node.label}</span>
              </div>
              {index < HANDOFF_NODES.length - 1 && (
                <div
                  className="brainstorm-handoff__edge"
                  style={{ animationDelay: `${index * 120 + 80}ms` }}
                />
              )}
            </div>
          );
        })}
      </div>

      <div className="brainstorm-handoff__ready">
        <Check className="h-4 w-4" />
        <span>Workflow assembled</span>
      </div>
    </div>
  );
}
