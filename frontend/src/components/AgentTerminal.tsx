import { useState } from 'react';

interface AgentTerminalProps {
  logs: string[];
}

export default function AgentTerminal({ logs }: AgentTerminalProps) {
  const [open, setOpen] = useState(true);
  
  return (
    <div className="bg-[var(--editorial-paper)] border-1.5 border-[var(--editorial-stroke)] overflow-hidden shadow-editorial transform rotate-[0.1deg]">
      <button 
        onClick={() => setOpen(!open)}
        className="w-full bg-[var(--editorial-unselected)] px-5 py-3 border-b-1.5 border-[var(--editorial-stroke)] flex items-center justify-between text-[10px] font-black text-[var(--editorial-text)] font-mono tracking-wider cursor-pointer transition-all"
      >
        <span className="flex items-center gap-2">
          <span>AI AGENT DRAFT PIPELINE STACK TRACE CONSOLE</span>
        </span>
        <span className="text-[9px] bg-[var(--editorial-paper)] border border-[var(--editorial-stroke)] px-2 py-0.5 font-bold">
          {open ? 'COLLAPSE' : 'EXPAND'}
        </span>
      </button>

      {open && (
        <div className="bg-[var(--editorial-bg)]/60 p-4 font-mono text-[9px] leading-relaxed text-[var(--editorial-text)] max-h-[140px] overflow-y-auto pr-1 border-t border-[var(--editorial-stroke)]">
          {logs.length === 0 ? (
            <div className="text-[var(--editorial-text-gray)] font-bold">// Waiting for AIGC Agent workflow triggers to print pipeline stack trace...</div>
          ) : (
            <div className="space-y-1.5">
              {logs.map((log, idx) => {
                let colorClass = 'text-[var(--editorial-text)]';
                if (log.includes('[WARN]')) colorClass = 'text-yellow-600 dark:text-yellow-400 font-bold';
                if (log.includes('[ERROR]')) colorClass = 'text-red-500 font-black';
                if (log.includes('[SUCCESS]')) colorClass = 'text-emerald-600 dark:text-emerald-400 font-bold';
                if (log.includes('---')) colorClass = 'text-[var(--editorial-accent-blue)] font-black border-b border-dashed border-[var(--editorial-stroke)]/40 pb-1 mb-1 block';
                
                return (
                  <div key={idx} className={`${colorClass} font-semibold`}>
                    {log}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
