import { useState, useCallback } from 'react';
import type { BracketState, Team, Round } from '../types';

interface ExportPanelProps {
  bracket: BracketState;
  teams: Record<string, Team>;
}

const ROUND_ORDER: Round[] = ['R64', 'R32', 'Sweet 16', 'Elite 8', 'Final Four', 'Championship'];

function generateTextSummary(bracket: BracketState, teams: Record<string, Team>): string {
  const lines: string[] = [];
  lines.push('==========================================');
  lines.push('  BRACKET ASSIST - March Madness 2026');
  lines.push('==========================================');
  lines.push('');

  for (const round of ROUND_ORDER) {
    const matchups = Object.values(bracket.matchups)
      .filter((m) => m.round === round)
      .sort((a, b) => {
        if (a.region < b.region) return -1;
        if (a.region > b.region) return 1;
        return a.position - b.position;
      });

    if (matchups.length === 0) continue;

    lines.push(`--- ${round} ---`);
    for (const m of matchups) {
      const teamA = m.teamAId ? teams[m.teamAId] : null;
      const teamB = m.teamBId ? teams[m.teamBId] : null;
      const winner = m.winnerId ? teams[m.winnerId] : null;

      const aLabel = teamA ? `(${teamA.seed}) ${teamA.name}` : 'TBD';
      const bLabel = teamB ? `(${teamB.seed}) ${teamB.name}` : 'TBD';
      const winLabel = winner ? `=> ${winner.name}` : '=> ???';
      const upset = m.isUpset ? ' [UPSET]' : '';
      const locked = m.locked ? ' [LOCKED]' : '';

      lines.push(`  ${m.region}: ${aLabel} vs ${bLabel} ${winLabel}${upset}${locked}`);
    }
    lines.push('');
  }

  // Champion
  const champ = Object.values(bracket.matchups).find((m) => m.round === 'Championship');
  if (champ?.winnerId) {
    const champTeam = teams[champ.winnerId];
    if (champTeam) {
      lines.push(`CHAMPION: (${champTeam.seed}) ${champTeam.name}`);
    }
  }

  return lines.join('\n');
}

function compressBracketToHash(bracket: BracketState): string {
  // Encode bracket picks as a compact JSON, then base64 encode
  const picks: Record<string, string | null> = {};
  for (const [id, m] of Object.entries(bracket.matchups)) {
    if (m.winnerId) {
      picks[id] = m.winnerId;
    }
  }
  const json = JSON.stringify(picks);
  try {
    return btoa(json);
  } catch {
    return btoa(encodeURIComponent(json));
  }
}

export default function ExportPanel({ bracket, teams }: ExportPanelProps) {
  const [copyState, setCopyState] = useState<'idle' | 'copied'>('idle');
  const [linkState, setLinkState] = useState<'idle' | 'copied'>('idle');

  const totalPicks = Object.values(bracket.matchups).filter((m) => m.winnerId).length;
  const totalGames = Object.values(bracket.matchups).length;
  const upsets = Object.values(bracket.matchups).filter((m) => m.isUpset).length;

  const handlePrintPDF = useCallback(() => {
    // Add print-specific styles
    const style = document.createElement('style');
    style.id = 'bracket-print-styles';
    style.textContent = `
      @media print {
        body * { visibility: hidden; }
        #bracket-print-area, #bracket-print-area * { visibility: visible; }
        #bracket-print-area {
          position: absolute;
          left: 0;
          top: 0;
          width: 100%;
        }
        @page { size: landscape; margin: 0.5in; }
      }
    `;
    document.head.appendChild(style);
    window.print();
    // Clean up
    setTimeout(() => {
      const el = document.getElementById('bracket-print-styles');
      if (el) el.remove();
    }, 1000);
  }, []);

  const handleJSONExport = useCallback(() => {
    const data = {
      exportDate: new Date().toISOString(),
      version: '1.0',
      bracket: bracket,
      teams: teams,
    };
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `bracket-assist-${new Date().toISOString().split('T')[0]}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }, [bracket, teams]);

  const handleCopySummary = useCallback(() => {
    const summary = generateTextSummary(bracket, teams);
    navigator.clipboard.writeText(summary).then(() => {
      setCopyState('copied');
      setTimeout(() => setCopyState('idle'), 2000);
    });
  }, [bracket, teams]);

  const handleShareLink = useCallback(() => {
    const hash = compressBracketToHash(bracket);
    const url = `${window.location.origin}${window.location.pathname}#bracket=${hash}`;
    navigator.clipboard.writeText(url).then(() => {
      setLinkState('copied');
      setTimeout(() => setLinkState('idle'), 2000);
    });
  }, [bracket]);

  return (
    <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
      {/* Header */}
      <div className="px-5 py-3 border-b border-gray-100">
        <h3 className="text-sm font-bold text-gray-900">Export Bracket</h3>
        <p className="text-xs text-gray-400 mt-0.5">Save and share your picks</p>
      </div>

      {/* Bracket stats */}
      <div className="px-5 py-3 bg-gray-50 border-b border-gray-100">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <div>
              <span className="text-[10px] text-gray-400 block">Picks Made</span>
              <span className="text-sm font-bold tabular-nums" style={{ color: '#00274C' }}>
                {totalPicks}/{totalGames}
              </span>
            </div>
            <div>
              <span className="text-[10px] text-gray-400 block">Upsets</span>
              <span className="text-sm font-bold tabular-nums" style={{ color: '#FF6B00' }}>
                {upsets}
              </span>
            </div>
            <div>
              <span className="text-[10px] text-gray-400 block">Completion</span>
              <span className="text-sm font-bold tabular-nums text-gray-700">
                {totalGames > 0 ? Math.round((totalPicks / totalGames) * 100) : 0}%
              </span>
            </div>
          </div>
          {totalPicks < totalGames && (
            <span className="text-[10px] px-2 py-1 bg-yellow-50 border border-yellow-200 text-yellow-700 rounded-full font-medium">
              Bracket incomplete
            </span>
          )}
        </div>
      </div>

      {/* Export options */}
      <div className="p-5 grid grid-cols-2 gap-3">
        {/* Print PDF */}
        <button
          onClick={handlePrintPDF}
          className="flex flex-col items-center gap-2 px-4 py-5 rounded-xl border border-gray-200 hover:border-gray-300 hover:bg-gray-50 transition-all group"
        >
          <div className="w-10 h-10 rounded-lg bg-gray-100 group-hover:bg-gray-200 flex items-center justify-center transition-colors">
            <svg className="w-5 h-5 text-gray-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z" />
            </svg>
          </div>
          <span className="text-xs font-bold text-gray-700">Print PDF</span>
          <span className="text-[10px] text-gray-400">Uses browser print dialog</span>
        </button>

        {/* JSON export */}
        <button
          onClick={handleJSONExport}
          className="flex flex-col items-center gap-2 px-4 py-5 rounded-xl border border-gray-200 hover:border-gray-300 hover:bg-gray-50 transition-all group"
        >
          <div className="w-10 h-10 rounded-lg bg-gray-100 group-hover:bg-gray-200 flex items-center justify-center transition-colors">
            <svg className="w-5 h-5 text-gray-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
            </svg>
          </div>
          <span className="text-xs font-bold text-gray-700">Export JSON</span>
          <span className="text-[10px] text-gray-400">Full bracket data file</span>
        </button>

        {/* Shareable link */}
        <button
          onClick={handleShareLink}
          className="flex flex-col items-center gap-2 px-4 py-5 rounded-xl border border-gray-200 hover:border-gray-300 hover:bg-gray-50 transition-all group"
        >
          <div className="w-10 h-10 rounded-lg bg-gray-100 group-hover:bg-gray-200 flex items-center justify-center transition-colors">
            <svg className="w-5 h-5 text-gray-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" />
            </svg>
          </div>
          <span className="text-xs font-bold text-gray-700">
            {linkState === 'copied' ? 'Link Copied!' : 'Share Link'}
          </span>
          <span className="text-[10px] text-gray-400">Encodes picks in URL</span>
        </button>

        {/* Copy summary */}
        <button
          onClick={handleCopySummary}
          className="flex flex-col items-center gap-2 px-4 py-5 rounded-xl border border-gray-200 hover:border-gray-300 hover:bg-gray-50 transition-all group"
        >
          <div className="w-10 h-10 rounded-lg bg-gray-100 group-hover:bg-gray-200 flex items-center justify-center transition-colors">
            <svg className="w-5 h-5 text-gray-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M8 5H6a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2v-1M8 5a2 2 0 002 2h2a2 2 0 002-2M8 5a2 2 0 012-2h2a2 2 0 012 2m0 0h2a2 2 0 012 2v3m2 4H10m0 0l3-3m-3 3l3 3" />
            </svg>
          </div>
          <span className="text-xs font-bold text-gray-700">
            {copyState === 'copied' ? 'Copied!' : 'Copy Summary'}
          </span>
          <span className="text-[10px] text-gray-400">Plain text summary</span>
        </button>
      </div>

      {/* Preview of text summary */}
      <div className="px-5 pb-5">
        <details className="group">
          <summary className="cursor-pointer text-xs font-medium text-gray-400 hover:text-gray-600 transition-colors">
            Preview text summary
          </summary>
          <pre className="mt-2 p-3 bg-gray-50 rounded-lg border border-gray-100 text-[10px] text-gray-500 font-mono overflow-x-auto max-h-64 overflow-y-auto leading-relaxed">
            {generateTextSummary(bracket, teams)}
          </pre>
        </details>
      </div>
    </div>
  );
}
