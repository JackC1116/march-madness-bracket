import { useRef, useMemo, useCallback, useState } from 'react';
import html2canvas from 'html2canvas';
import type { BracketState, Team, SimulationResults, PoolConfig, Matchup } from '../types';

interface BracketReportCardProps {
  bracket: BracketState;
  teams: Record<string, Team>;
  simulationResults: SimulationResults | null;
  poolConfig: PoolConfig;
  onClose: () => void;
}

interface StatCardProps {
  label: string;
  value: string;
  sub?: string;
  color?: string;
}

function StatCard({ label, value, sub, color = '#00274C' }: StatCardProps) {
  return (
    <div className="bg-gray-50 dark:bg-gray-700/60 rounded-xl p-4 flex flex-col items-center justify-center text-center">
      <span className="text-[10px] uppercase tracking-wider font-semibold text-gray-400 dark:text-gray-500 mb-1">
        {label}
      </span>
      <span
        className="text-2xl font-extrabold leading-tight"
        style={{ color }}
      >
        {value}
      </span>
      {sub && (
        <span className="text-[11px] text-gray-500 dark:text-gray-400 mt-0.5">{sub}</span>
      )}
    </div>
  );
}

function getRiskLevel(upsets: number): { label: string; color: string } {
  if (upsets <= 3) return { label: 'LOW', color: '#22c55e' };
  if (upsets <= 7) return { label: 'MEDIUM', color: '#eab308' };
  if (upsets <= 11) return { label: 'HIGH', color: '#FF6B00' };
  return { label: 'EXTREME', color: '#ef4444' };
}

export default function BracketReportCard({
  bracket,
  teams,
  simulationResults,
  poolConfig,
  onClose,
}: BracketReportCardProps) {
  const cardRef = useRef<HTMLDivElement>(null);
  const [imageState, setImageState] = useState<'idle' | 'generating' | 'done'>('idle');

  const matchups = useMemo(() => Object.values(bracket.matchups), [bracket.matchups]);
  const pickedMatchups = useMemo(() => matchups.filter((m) => m.winnerId !== null), [matchups]);

  // --- Champion ---
  const champion = useMemo(() => {
    const champMatchup = matchups.find((m) => m.round === 'Championship');
    if (!champMatchup?.winnerId) return null;
    return teams[champMatchup.winnerId] ?? null;
  }, [matchups, teams]);

  const championProb = useMemo(() => {
    if (!champion || !simulationResults) return 0;
    return (simulationResults.teamResults[champion.id]?.championshipProb ?? 0) * 100;
  }, [champion, simulationResults]);

  // --- Upsets ---
  const upsetCount = useMemo(() => pickedMatchups.filter((m) => m.isUpset).length, [pickedMatchups]);
  const totalGames = pickedMatchups.length;

  // --- Risk Level ---
  const risk = useMemo(() => getRiskLevel(upsetCount), [upsetCount]);

  // --- Expected Score ---
  const expectedScore = useMemo(() => {
    const pointsByRound: Record<string, number> = {
      R64: poolConfig.scoringSystem.pointsByRound[0] ?? 1,
      R32: poolConfig.scoringSystem.pointsByRound[1] ?? 2,
      'Sweet 16': poolConfig.scoringSystem.pointsByRound[2] ?? 4,
      'Elite 8': poolConfig.scoringSystem.pointsByRound[3] ?? 8,
      'Final Four': poolConfig.scoringSystem.pointsByRound[4] ?? 16,
      Championship: poolConfig.scoringSystem.pointsByRound[5] ?? 32,
    };
    let score = 0;
    for (const m of pickedMatchups) {
      if (!m.winnerId) continue;
      const roundPts = pointsByRound[m.round] ?? 0;
      const prob = m.winProbA !== null
        ? (m.winnerId === m.teamAId ? m.winProbA : 1 - m.winProbA)
        : m.confidence;
      score += roundPts * prob;
    }
    return Math.round(score * 10) / 10;
  }, [pickedMatchups, poolConfig.scoringSystem.pointsByRound]);

  // --- AI Confidence ---
  const avgConfidence = useMemo(() => {
    if (pickedMatchups.length === 0) return 0;
    const sum = pickedMatchups.reduce((acc, m) => acc + m.confidence, 0);
    return Math.round((sum / pickedMatchups.length) * 100);
  }, [pickedMatchups]);

  // --- Pool Win Chance ---
  const poolWinChance = useMemo(() => {
    const { poolSize } = poolConfig;
    if (poolSize <= 0) return 0;
    // Uniqueness approximation based on upset ratio
    const uniqueness = totalGames > 0 ? upsetCount / totalGames : 0;
    const chance = (1 / poolSize) * (1 + uniqueness * 0.5) * 100;
    return Math.min(chance, 99);
  }, [poolConfig, upsetCount, totalGames]);

  // --- Riskiest Picks ---
  const riskiestPicks = useMemo(() => {
    const withProb: Array<{ matchup: Matchup; winProb: number; winner: Team; loser: Team }> = [];
    for (const m of pickedMatchups) {
      if (!m.winnerId || !m.teamAId || !m.teamBId) continue;
      const winner = teams[m.winnerId];
      const loserId = m.winnerId === m.teamAId ? m.teamBId : m.teamAId;
      const loser = teams[loserId];
      if (!winner || !loser) continue;
      const winProb = m.winProbA !== null
        ? (m.winnerId === m.teamAId ? m.winProbA : 1 - m.winProbA)
        : m.confidence;
      withProb.push({ matchup: m, winProb, winner, loser });
    }
    return withProb
      .sort((a, b) => a.winProb - b.winProb)
      .slice(0, 3);
  }, [pickedMatchups, teams]);

  // --- Final Four ---
  const finalFour = useMemo(() => {
    const ffMatchups = matchups.filter((m) => m.round === 'Final Four');
    const ffTeams: Array<{ team: Team; prob: number }> = [];
    for (const m of ffMatchups) {
      if (!m.winnerId) continue;
      const team = teams[m.winnerId];
      if (!team) continue;
      const prob = simulationResults?.teamResults[team.id]?.finalFourProb ?? 0;
      ffTeams.push({ team, prob });
    }
    return ffTeams;
  }, [matchups, teams, simulationResults]);

  const combinedFFProb = useMemo(() => {
    if (finalFour.length === 0) return 0;
    return finalFour.reduce((acc, ff) => acc * ff.prob, 1) * 100;
  }, [finalFour]);

  // --- One-liner Summary ---
  const summary = useMemo(() => {
    if (!champion) return 'Fill out your bracket to see a summary.';
    const riskWord = risk.label === 'LOW' ? 'conservative' :
      risk.label === 'MEDIUM' ? 'balanced' :
        risk.label === 'HIGH' ? 'bold' : 'chaotic';
    const variancePhrase = upsetCount >= 8
      ? 'boom or bust'
      : upsetCount >= 4
        ? 'some variance built in'
        : 'a safe floor but limited upside';
    return `A ${riskWord} bracket anchored by ${champion.name}. Your ${upsetCount} upset${upsetCount !== 1 ? 's' : ''} give${upsetCount === 1 ? 's' : ''} you ${variancePhrase} in a ${poolConfig.poolSize}-person pool.`;
  }, [champion, risk.label, upsetCount, poolConfig.poolSize]);

  // --- Share / Download ---
  const handleDownload = useCallback(async () => {
    if (!cardRef.current) return;
    setImageState('generating');
    try {
      const canvas = await html2canvas(cardRef.current, {
        backgroundColor: null,
        scale: 2,
        useCORS: true,
        width: 600,
        height: 800,
        windowWidth: 600,
        windowHeight: 800,
      });
      const link = document.createElement('a');
      link.download = 'bracket-report-2026.png';
      link.href = canvas.toDataURL('image/png');
      link.click();
      setImageState('done');
      setTimeout(() => setImageState('idle'), 2500);
    } catch {
      setImageState('idle');
    }
  }, []);

  const hasPicks = pickedMatchups.length > 0;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="relative w-full max-w-[620px] max-h-[90vh] overflow-y-auto rounded-2xl shadow-2xl">
        {/* Close button */}
        <button
          onClick={onClose}
          className="absolute top-3 right-3 z-10 w-8 h-8 flex items-center justify-center rounded-full bg-white/80 dark:bg-gray-700/80 hover:bg-white dark:hover:bg-gray-600 text-gray-500 dark:text-gray-300 shadow transition"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>

        {/* Card content — captured for image export */}
        <div
          ref={cardRef}
          className="bg-white dark:bg-gray-800 rounded-2xl overflow-hidden"
          style={{ minHeight: 600 }}
        >
          {/* Header */}
          <div
            className="px-6 py-5 text-center"
            style={{
              background: 'linear-gradient(135deg, #00274C 0%, #003366 60%, #FF6B00 100%)',
            }}
          >
            <div className="text-white/70 text-[11px] uppercase tracking-widest font-semibold mb-1">
              Bracket Assist 2026
            </div>
            <h2 className="text-white text-xl font-extrabold tracking-tight">
              Your Bracket Report Card
            </h2>
          </div>

          {!hasPicks ? (
            <div className="px-6 py-16 text-center text-gray-400 dark:text-gray-500">
              <p className="text-lg font-medium">No picks yet</p>
              <p className="text-sm mt-1">Make some picks or generate a bracket to see your report card.</p>
            </div>
          ) : (
            <div className="px-5 py-5 space-y-5">
              {/* Key Stats Grid */}
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                <StatCard
                  label="Champion"
                  value={champion ? `(${champion.seed}) ${champion.name}` : 'TBD'}
                  sub={champion ? `${championProb.toFixed(1)}% title prob` : undefined}
                  color="#00274C"
                />
                <StatCard
                  label="Pool Win Chance"
                  value={`~${poolWinChance.toFixed(1)}%`}
                  sub={`in a ${poolConfig.poolSize}-person pool`}
                  color="#00274C"
                />
                <StatCard
                  label="Upsets"
                  value={`${upsetCount} / ${totalGames}`}
                  sub="upset picks"
                  color="#FF6B00"
                />
                <StatCard
                  label="Risk Level"
                  value={risk.label}
                  color={risk.color}
                />
                <StatCard
                  label="Expected Score"
                  value={`${expectedScore}`}
                  sub={`${poolConfig.scoringSystem.name} scoring`}
                  color="#00274C"
                />
                <StatCard
                  label="AI Confidence"
                  value={`${avgConfidence}%`}
                  sub="avg across picks"
                  color={avgConfidence >= 70 ? '#22c55e' : avgConfidence >= 50 ? '#eab308' : '#ef4444'}
                />
              </div>

              {/* Riskiest Picks */}
              {riskiestPicks.length > 0 && (
                <div>
                  <h3 className="text-xs uppercase tracking-wider font-bold text-gray-400 dark:text-gray-500 mb-2">
                    Riskiest Picks
                  </h3>
                  <div className="space-y-1.5">
                    {riskiestPicks.map(({ matchup, winProb, winner, loser }) => (
                      <div
                        key={matchup.id}
                        className="flex items-center justify-between px-3 py-2 bg-red-50 dark:bg-red-900/20 rounded-lg border border-red-100 dark:border-red-800/40"
                      >
                        <span className="text-sm font-medium text-gray-800 dark:text-gray-200">
                          ({winner.seed}) {winner.name}{' '}
                          <span className="text-gray-400 dark:text-gray-500">over</span>{' '}
                          ({loser.seed}) {loser.name}
                        </span>
                        <span className="text-xs font-bold text-red-600 dark:text-red-400 whitespace-nowrap ml-2">
                          {Math.round(winProb * 100)}%
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Safest Path — Final Four */}
              {finalFour.length > 0 && (
                <div>
                  <h3 className="text-xs uppercase tracking-wider font-bold text-gray-400 dark:text-gray-500 mb-2">
                    Final Four Path
                  </h3>
                  <div className="flex flex-wrap gap-2">
                    {finalFour.map(({ team, prob }) => (
                      <div
                        key={team.id}
                        className="flex items-center gap-2 px-3 py-2 bg-blue-50 dark:bg-blue-900/20 rounded-lg border border-blue-100 dark:border-blue-800/40"
                      >
                        <span className="text-sm font-semibold text-gray-800 dark:text-gray-200">
                          ({team.seed}) {team.name}
                        </span>
                        <span className="text-[11px] font-bold text-blue-600 dark:text-blue-400">
                          {(prob * 100).toFixed(0)}%
                        </span>
                      </div>
                    ))}
                  </div>
                  <p className="text-[11px] text-gray-400 dark:text-gray-500 mt-1.5">
                    Combined probability: {combinedFFProb < 0.01 ? '<0.01' : combinedFFProb.toFixed(2)}%
                  </p>
                </div>
              )}

              {/* One-liner Summary */}
              <div className="px-4 py-3 bg-gradient-to-r from-gray-50 to-gray-100 dark:from-gray-700/40 dark:to-gray-700/60 rounded-xl">
                <p className="text-sm text-gray-700 dark:text-gray-300 italic leading-relaxed">
                  "{summary}"
                </p>
              </div>

              {/* Branding footer inside the card */}
              <div className="text-center pt-1 pb-1">
                <span className="text-[10px] text-gray-300 dark:text-gray-600 font-medium tracking-wider uppercase">
                  bracketassist.com
                </span>
              </div>
            </div>
          )}
        </div>

        {/* Actions — outside captured area */}
        {hasPicks && (
          <div className="flex items-center justify-center gap-3 mt-4">
            <button
              onClick={handleDownload}
              disabled={imageState === 'generating'}
              className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-[#FF6B00] hover:bg-[#e06000] text-white text-sm font-bold shadow-lg shadow-orange-500/20 transition disabled:opacity-60 disabled:cursor-wait"
            >
              {imageState === 'generating' ? (
                <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                </svg>
              ) : (
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                </svg>
              )}
              {imageState === 'done' ? 'Downloaded!' : imageState === 'generating' ? 'Generating...' : 'Share Report Card'}
            </button>
            <button
              onClick={onClose}
              className="px-5 py-2.5 rounded-xl border border-white/30 text-white/80 hover:text-white hover:border-white/50 text-sm font-medium transition"
            >
              Close
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
