import { useMemo } from 'react';
import type { SimulationResults, Team, BracketState, Round } from '../types';

interface AnalysisDashboardProps {
  simulationResults: SimulationResults;
  teams: Record<string, Team>;
  bracket: BracketState;
}

const ROUNDS_FOR_UPSET: Round[] = ['R64', 'R32', 'Sweet 16', 'Elite 8', 'Final Four', 'Championship'];

function HorizontalBar({
  label,
  value,
  maxValue,
  color,
  subLabel,
}: {
  label: string;
  value: number;
  maxValue: number;
  color: string;
  subLabel?: string;
}) {
  const pct = maxValue > 0 ? (value / maxValue) * 100 : 0;

  return (
    <div className="flex items-center gap-2 py-1">
      <div className="w-32 text-right shrink-0">
        <span className="text-xs font-medium text-gray-700 dark:text-gray-200 truncate block">{label}</span>
        {subLabel && <span className="text-[9px] text-gray-400">{subLabel}</span>}
      </div>
      <div className="flex-1 h-5 bg-gray-100 dark:bg-gray-700 rounded-sm overflow-hidden relative">
        <div
          className="h-full rounded-sm transition-all duration-500"
          style={{ width: `${Math.max(pct, 1)}%`, backgroundColor: color }}
        />
        <span className="absolute right-1.5 top-0 h-full flex items-center text-[10px] font-bold tabular-nums text-gray-600">
          {(value * 100).toFixed(1)}%
        </span>
      </div>
    </div>
  );
}

function UpsetHeatmapCell({
  value,
  seedHigh,
  seedLow,
}: {
  value: number;
  seedHigh: number;
  seedLow: number;
}) {
  // Intensity based on upset probability
  const alpha = Math.min(value * 2, 1);
  const bgColor =
    value > 0.4
      ? `rgba(255, 107, 0, ${alpha})`
      : value > 0.2
      ? `rgba(255, 165, 0, ${alpha})`
      : `rgba(200, 200, 200, ${alpha * 0.5})`;

  return (
    <div
      className="w-10 h-10 flex items-center justify-center rounded-sm text-[9px] font-bold"
      style={{ backgroundColor: bgColor, color: value > 0.3 ? '#fff' : '#666' }}
      title={`${seedLow} over ${seedHigh}: ${(value * 100).toFixed(1)}%`}
    >
      {value > 0.05 ? `${(value * 100).toFixed(0)}%` : ''}
    </div>
  );
}

export default function AnalysisDashboard({
  simulationResults,
  teams,
  bracket,
}: AnalysisDashboardProps) {
  // Championship top 10
  const championshipTop10 = useMemo(() => {
    return Object.values(simulationResults.teamResults)
      .sort((a, b) => b.championshipProb - a.championshipProb)
      .slice(0, 10);
  }, [simulationResults]);

  const maxChampProb = championshipTop10[0]?.championshipProb || 0.1;

  // Final Four top 10
  const finalFourTop10 = useMemo(() => {
    return Object.values(simulationResults.teamResults)
      .sort((a, b) => b.finalFourProb - a.finalFourProb)
      .slice(0, 10);
  }, [simulationResults]);

  const maxFFProb = finalFourTop10[0]?.finalFourProb || 0.1;

  // Upset probability by seed matchup per round
  const upsetGrid = useMemo(() => {
    const matchups = Object.values(bracket.matchups);
    const grid: Record<string, Record<string, number>> = {};

    for (const round of ROUNDS_FOR_UPSET) {
      grid[round] = {};
      const roundMatchups = matchups.filter((m) => m.round === round);

      for (const m of roundMatchups) {
        if (!m.teamAId || !m.teamBId || m.winProbA === null) continue;
        const tA = teams[m.teamAId];
        const tB = teams[m.teamBId];
        if (!tA || !tB) continue;

        const higher = tA.seed < tB.seed ? tA : tB;
        const lower = tA.seed < tB.seed ? tB : tA;
        const upsetProb = tA.seed < tB.seed ? 1 - m.winProbA : m.winProbA;

        if (higher.seed !== lower.seed) {
          const key = `${higher.seed}-${lower.seed}`;
          grid[round][key] = upsetProb;
        }
      }
    }
    return grid;
  }, [bracket, teams]);

  // Expected bracket score
  const expectedScore = useMemo(() => {
    const pointsByRound: Record<string, number> = {
      R64: 1,
      R32: 2,
      'Sweet 16': 4,
      'Elite 8': 8,
      'Final Four': 16,
      Championship: 32,
    };
    let total = 0;
    for (const m of Object.values(bracket.matchups)) {
      if (!m.winnerId || m.winProbA === null) continue;
      const prob = m.winnerId === m.teamAId ? m.winProbA : 1 - m.winProbA;
      const pts = pointsByRound[m.round] || 0;
      total += prob * pts;
    }
    return total;
  }, [bracket]);

  // Common upset seed matchups
  const seedMatchupKeys = useMemo(() => {
    const allKeys = new Set<string>();
    for (const round of ROUNDS_FOR_UPSET) {
      if (upsetGrid[round]) {
        Object.keys(upsetGrid[round]).forEach((k) => allKeys.add(k));
      }
    }
    return [...allKeys].sort((a, b) => {
      const [aH] = a.split('-').map(Number);
      const [bH] = b.split('-').map(Number);
      return aH - bH;
    });
  }, [upsetGrid]);

  return (
    <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 shadow-sm overflow-hidden">
      {/* Header */}
      <div className="px-5 py-3 border-b border-gray-100 dark:border-gray-700 flex items-center justify-between">
        <div>
          <h3 className="text-sm font-bold text-gray-900 dark:text-gray-100">Analysis Dashboard</h3>
          <p className="text-xs text-gray-400 dark:text-gray-500 mt-0.5">
            Based on {simulationResults.iterations.toLocaleString()} simulations
          </p>
        </div>
        <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-gray-50 dark:bg-gray-700">
          <span className="text-xs text-gray-400">Expected Score</span>
          <span className="text-lg font-bold tabular-nums" style={{ color: '#00274C' }}>
            {expectedScore.toFixed(1)}
          </span>
          <span className="text-[10px] text-gray-400">pts</span>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-0 divide-y lg:divide-y-0 lg:divide-x divide-gray-100 dark:divide-gray-700">
        {/* Championship probability */}
        <div className="px-5 py-4">
          <h4 className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-3">
            Championship Probability — Top 10
          </h4>
          <div className="space-y-0.5">
            {championshipTop10.map((tr, i) => {
              const team = teams[tr.teamId];
              return (
                <HorizontalBar
                  key={tr.teamId}
                  label={team ? `(${team.seed}) ${team.name}` : tr.teamId}
                  subLabel={team?.conference}
                  value={tr.championshipProb}
                  maxValue={maxChampProb}
                  color={i === 0 ? '#00274C' : i < 4 ? '#2980b9' : '#94a3b8'}
                />
              );
            })}
          </div>
        </div>

        {/* Final Four probability */}
        <div className="px-5 py-4">
          <h4 className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-3">
            Final Four Probability — Top 10
          </h4>
          <div className="space-y-0.5">
            {finalFourTop10.map((tr, i) => {
              const team = teams[tr.teamId];
              return (
                <HorizontalBar
                  key={tr.teamId}
                  label={team ? `(${team.seed}) ${team.name}` : tr.teamId}
                  subLabel={team?.conference}
                  value={tr.finalFourProb}
                  maxValue={maxFFProb}
                  color={i === 0 ? '#FF6B00' : i < 4 ? '#e67e22' : '#94a3b8'}
                />
              );
            })}
          </div>
        </div>
      </div>

      {/* Upset heatmap */}
      <div className="px-5 py-4 border-t border-gray-100 dark:border-gray-700">
        <h4 className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-3">
          Upset Probability Heatmap
        </h4>
        {seedMatchupKeys.length === 0 ? (
          <p className="text-xs text-gray-400 italic py-4 text-center">
            No seed matchup data available yet. Fill in bracket picks to see upset probabilities.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="text-center">
              <thead>
                <tr>
                  <th className="text-[10px] text-gray-400 font-medium pr-2 text-right w-16">
                    Matchup
                  </th>
                  {ROUNDS_FOR_UPSET.map((r) => (
                    <th
                      key={r}
                      className="text-[10px] text-gray-400 font-medium px-1 w-10"
                    >
                      {r === 'Sweet 16' ? 'S16' : r === 'Elite 8' ? 'E8' : r === 'Final Four' ? 'FF' : r === 'Championship' ? 'NC' : r}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {seedMatchupKeys.slice(0, 12).map((key) => {
                  const [high, low] = key.split('-').map(Number);
                  return (
                    <tr key={key}>
                      <td className="text-[10px] text-gray-500 font-medium pr-2 text-right">
                        #{low} over #{high}
                      </td>
                      {ROUNDS_FOR_UPSET.map((round) => (
                        <td key={round} className="px-0.5 py-0.5">
                          {upsetGrid[round]?.[key] !== undefined ? (
                            <UpsetHeatmapCell
                              value={upsetGrid[round][key]}
                              seedHigh={high}
                              seedLow={low}
                            />
                          ) : (
                            <div className="w-10 h-10 flex items-center justify-center text-[9px] text-gray-200">
                              —
                            </div>
                          )}
                        </td>
                      ))}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {/* Legend */}
        <div className="flex items-center gap-3 mt-3 pt-2 border-t border-gray-50">
          <span className="text-[9px] text-gray-400">Upset likelihood:</span>
          <div className="flex items-center gap-1">
            <div className="w-4 h-3 rounded-sm" style={{ backgroundColor: 'rgba(200,200,200,0.2)' }} />
            <span className="text-[9px] text-gray-400">Low</span>
          </div>
          <div className="flex items-center gap-1">
            <div className="w-4 h-3 rounded-sm" style={{ backgroundColor: 'rgba(255,165,0,0.5)' }} />
            <span className="text-[9px] text-gray-400">Medium</span>
          </div>
          <div className="flex items-center gap-1">
            <div className="w-4 h-3 rounded-sm" style={{ backgroundColor: 'rgba(255,107,0,0.9)' }} />
            <span className="text-[9px] text-gray-400">High</span>
          </div>
        </div>
      </div>
    </div>
  );
}
