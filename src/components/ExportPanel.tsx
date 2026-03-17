import { useState, useCallback } from 'react';
import html2canvas from 'html2canvas';
import type { BracketState, Team, Round } from '../types';
import { decodeBracketFromURL } from '../utils/share';

interface ExportPanelProps {
  bracket: BracketState;
  teams: Record<string, Team>;
  onCompare?: (comparisonBracket: BracketState) => void;
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

export default function ExportPanel({ bracket, teams, onCompare }: ExportPanelProps) {
  const [copyState, setCopyState] = useState<'idle' | 'copied'>('idle');
  const [linkState, setLinkState] = useState<'idle' | 'copied'>('idle');
  const [imageState, setImageState] = useState<'idle' | 'generating' | 'done'>('idle');
  const [compareInput, setCompareInput] = useState('');
  const [compareError, setCompareError] = useState<string | null>(null);

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

  const captureBracket = useCallback(async () => {
    const bracketEl = document.querySelector('main > div:last-child') as HTMLElement;
    if (!bracketEl) return null;
    const canvas = await html2canvas(bracketEl, {
      backgroundColor: '#ffffff',
      scale: 2,
      useCORS: true,
    });
    return canvas;
  }, []);

  const handleDownloadImage = useCallback(async () => {
    setImageState('generating');
    try {
      const canvas = await captureBracket();
      if (!canvas) return;
      const link = document.createElement('a');
      link.download = 'bracket-2026.png';
      link.href = canvas.toDataURL('image/png');
      link.click();
      setImageState('done');
      setTimeout(() => setImageState('idle'), 2000);
    } catch {
      setImageState('idle');
    }
  }, [captureBracket]);

  const handleShareImage = useCallback(async () => {
    if (!navigator.share) return;
    setImageState('generating');
    try {
      const canvas = await captureBracket();
      if (!canvas) return;
      const blob = await new Promise<Blob | null>((resolve) =>
        canvas.toBlob(resolve, 'image/png')
      );
      if (!blob) return;
      const file = new File([blob], 'bracket-2026.png', { type: 'image/png' });
      await navigator.share({
        title: 'My 2026 NCAA Tournament Bracket',
        files: [file],
      });
      setImageState('done');
      setTimeout(() => setImageState('idle'), 2000);
    } catch {
      setImageState('idle');
    }
  }, [captureBracket]);

  const handleShareLink = useCallback(() => {
    const hash = compressBracketToHash(bracket);
    const url = `${window.location.origin}${window.location.pathname}#bracket=${hash}`;
    navigator.clipboard.writeText(url).then(() => {
      setLinkState('copied');
      setTimeout(() => setLinkState('idle'), 2000);
    });
  }, [bracket]);

  return (
    <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 shadow-sm overflow-hidden">
      {/* Header */}
      <div className="px-5 py-3 border-b border-gray-100 dark:border-gray-700">
        <h3 className="text-sm font-bold text-gray-900 dark:text-gray-100">Export Bracket</h3>
        <p className="text-xs text-gray-400 dark:text-gray-500 mt-0.5">Save and share your picks</p>
      </div>

      {/* Bracket stats */}
      <div className="px-5 py-3 bg-gray-50 dark:bg-gray-700 border-b border-gray-100 dark:border-gray-700">
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
        {/* Download as Image */}
        <button
          onClick={handleDownloadImage}
          disabled={imageState === 'generating'}
          className="flex flex-col items-center gap-2 px-4 py-5 rounded-xl border border-gray-200 dark:border-gray-600 hover:border-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 transition-all group disabled:opacity-60 disabled:cursor-wait"
        >
          <div className="w-10 h-10 rounded-lg bg-gray-100 dark:bg-gray-700 group-hover:bg-gray-200 dark:group-hover:bg-gray-600 flex items-center justify-center transition-colors">
            {imageState === 'generating' ? (
              <svg className="w-5 h-5 text-gray-500 animate-spin" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
              </svg>
            ) : (
              <svg className="w-5 h-5 text-gray-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" />
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 13a3 3 0 11-6 0 3 3 0 016 0z" />
              </svg>
            )}
          </div>
          <span className="text-xs font-bold text-gray-700 dark:text-gray-200">
            {imageState === 'generating' ? 'Generating...' : imageState === 'done' ? 'Downloaded!' : 'Download Image'}
          </span>
          <span className="text-[10px] text-gray-400">Save as PNG</span>
        </button>

        {/* Share Image (Web Share API) */}
        {typeof navigator !== 'undefined' && typeof navigator.share === 'function' && (
          <button
            onClick={handleShareImage}
            disabled={imageState === 'generating'}
            className="flex flex-col items-center gap-2 px-4 py-5 rounded-xl border border-gray-200 dark:border-gray-600 hover:border-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 transition-all group disabled:opacity-60 disabled:cursor-wait"
          >
            <div className="w-10 h-10 rounded-lg bg-gray-100 dark:bg-gray-700 group-hover:bg-gray-200 dark:group-hover:bg-gray-600 flex items-center justify-center transition-colors">
              {imageState === 'generating' ? (
                <svg className="w-5 h-5 text-gray-500 animate-spin" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                </svg>
              ) : (
                <svg className="w-5 h-5 text-gray-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M8.684 13.342C8.886 12.938 9 12.482 9 12c0-.482-.114-.938-.316-1.342m0 2.684a3 3 0 110-2.684m0 2.684l6.632 3.316m-6.632-6l6.632-3.316m0 0a3 3 0 105.367-2.684 3 3 0 00-5.367 2.684zm0 9.316a3 3 0 105.368 2.684 3 3 0 00-5.368-2.684z" />
                </svg>
              )}
            </div>
            <span className="text-xs font-bold text-gray-700 dark:text-gray-200">Share Image</span>
            <span className="text-[10px] text-gray-400">Share via device</span>
          </button>
        )}

        {/* Print PDF */}
        <button
          onClick={handlePrintPDF}
          className="flex flex-col items-center gap-2 px-4 py-5 rounded-xl border border-gray-200 dark:border-gray-600 hover:border-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 transition-all group"
        >
          <div className="w-10 h-10 rounded-lg bg-gray-100 dark:bg-gray-700 group-hover:bg-gray-200 dark:group-hover:bg-gray-600 flex items-center justify-center transition-colors">
            <svg className="w-5 h-5 text-gray-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z" />
            </svg>
          </div>
          <span className="text-xs font-bold text-gray-700 dark:text-gray-200">Print PDF</span>
          <span className="text-[10px] text-gray-400">Uses browser print dialog</span>
        </button>

        {/* JSON export */}
        <button
          onClick={handleJSONExport}
          className="flex flex-col items-center gap-2 px-4 py-5 rounded-xl border border-gray-200 dark:border-gray-600 hover:border-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 transition-all group"
        >
          <div className="w-10 h-10 rounded-lg bg-gray-100 dark:bg-gray-700 group-hover:bg-gray-200 dark:group-hover:bg-gray-600 flex items-center justify-center transition-colors">
            <svg className="w-5 h-5 text-gray-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
            </svg>
          </div>
          <span className="text-xs font-bold text-gray-700 dark:text-gray-200">Export JSON</span>
          <span className="text-[10px] text-gray-400">Full bracket data file</span>
        </button>

        {/* Shareable link */}
        <button
          onClick={handleShareLink}
          className="flex flex-col items-center gap-2 px-4 py-5 rounded-xl border border-gray-200 dark:border-gray-600 hover:border-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 transition-all group"
        >
          <div className="w-10 h-10 rounded-lg bg-gray-100 dark:bg-gray-700 group-hover:bg-gray-200 dark:group-hover:bg-gray-600 flex items-center justify-center transition-colors">
            <svg className="w-5 h-5 text-gray-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" />
            </svg>
          </div>
          <span className="text-xs font-bold text-gray-700 dark:text-gray-200">
            {linkState === 'copied' ? 'Link Copied!' : 'Share Link'}
          </span>
          <span className="text-[10px] text-gray-400">Encodes picks in URL</span>
        </button>

        {/* Copy summary */}
        <button
          onClick={handleCopySummary}
          className="flex flex-col items-center gap-2 px-4 py-5 rounded-xl border border-gray-200 dark:border-gray-600 hover:border-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 transition-all group"
        >
          <div className="w-10 h-10 rounded-lg bg-gray-100 dark:bg-gray-700 group-hover:bg-gray-200 dark:group-hover:bg-gray-600 flex items-center justify-center transition-colors">
            <svg className="w-5 h-5 text-gray-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M8 5H6a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2v-1M8 5a2 2 0 002 2h2a2 2 0 002-2M8 5a2 2 0 012-2h2a2 2 0 012 2m0 0h2a2 2 0 012 2v3m2 4H10m0 0l3-3m-3 3l3 3" />
            </svg>
          </div>
          <span className="text-xs font-bold text-gray-700 dark:text-gray-200">
            {copyState === 'copied' ? 'Copied!' : 'Copy Summary'}
          </span>
          <span className="text-[10px] text-gray-400">Plain text summary</span>
        </button>
      </div>

      {/* Preview of text summary */}
      <div className="px-5 pb-5">
        <details className="group">
          <summary className="cursor-pointer text-xs font-medium text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:hover:text-gray-300 transition-colors">
            Preview text summary
          </summary>
          <pre className="mt-2 p-3 bg-gray-50 dark:bg-gray-700 rounded-lg border border-gray-100 dark:border-gray-600 text-[10px] text-gray-500 font-mono overflow-x-auto max-h-64 overflow-y-auto leading-relaxed">
            {generateTextSummary(bracket, teams)}
          </pre>
        </details>
      </div>

      {/* Compare Brackets */}
      {onCompare && (
        <div className="px-5 pb-5 border-t border-gray-100 dark:border-gray-700 pt-4">
          <h4 className="text-sm font-bold text-gray-900 dark:text-gray-100 mb-2">Compare Brackets</h4>
          <p className="text-xs text-gray-400 dark:text-gray-500 mb-3">
            Paste a friend's shared bracket URL or hash to compare picks side by side.
          </p>
          <div className="flex gap-2">
            <input
              type="text"
              value={compareInput}
              onChange={(e) => {
                setCompareInput(e.target.value);
                setCompareError(null);
              }}
              placeholder="Paste bracket URL or hash..."
              className="flex-1 px-3 py-2 text-xs border border-gray-200 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 placeholder-gray-400 dark:placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500 dark:focus:ring-blue-400 focus:border-transparent"
            />
            <button
              onClick={() => {
                if (!compareInput.trim()) {
                  setCompareError('Please paste a bracket URL or hash.');
                  return;
                }
                // Extract the hash portion from a full URL or use raw input
                let hashStr = compareInput.trim();
                const hashIdx = hashStr.indexOf('#bracket=');
                if (hashIdx !== -1) {
                  hashStr = hashStr.slice(hashIdx);
                } else if (!hashStr.startsWith('#bracket=')) {
                  // Assume it's a raw encoded string
                  hashStr = hashStr;
                }
                const decoded = decodeBracketFromURL(hashStr);
                if (!decoded || Object.keys(decoded).length === 0) {
                  setCompareError('Invalid bracket data. Check the URL or hash and try again.');
                  return;
                }
                // Build a BracketState from the decoded picks by cloning current bracket structure
                const compMatchups = { ...bracket.matchups };
                for (const [matchupId, matchup] of Object.entries(compMatchups)) {
                  compMatchups[matchupId] = {
                    ...matchup,
                    winnerId: decoded[matchupId] ?? null,
                    isUpset: false,
                    locked: false,
                  };
                }
                const comparisonBracket = {
                  matchups: compMatchups,
                  teams: bracket.teams,
                };
                setCompareError(null);
                setCompareInput('');
                onCompare(comparisonBracket);
              }}
              className="px-4 py-2 text-xs font-medium bg-[#00274C] dark:bg-blue-600 text-white rounded-lg hover:bg-[#003366] dark:hover:bg-blue-500 transition"
            >
              Compare
            </button>
          </div>
          {compareError && (
            <p className="mt-2 text-xs text-red-600 dark:text-red-400">{compareError}</p>
          )}
        </div>
      )}
    </div>
  );
}
