import { useMemo, useState } from 'react';
import type { SimulationResults, Team, BracketState, Round, ScoringSystem } from '../types';

interface AnalysisDashboardProps {
  simulationResults: SimulationResults;
  teams: Record<string, Team>;
  bracket: BracketState;
  scoringSystem: ScoringSystem;
}

const ROUND_KEYS: { key: string; label: string; short: string }[] = [
  { key: 'R64', label: 'Round of 64', short: 'R64' },
  { key: 'R32', label: 'Round of 32', short: 'R32' },
  { key: 'Sweet 16', label: 'Sweet 16', short: 'S16' },
  { key: 'Elite 8', label: 'Elite 8', short: 'E8' },
  { key: 'Final Four', label: 'Final Four', short: 'FF' },
  { key: 'Championship', label: 'Championship', short: 'NC' },
];

const ROUNDS_ORDER: Round[] = ['R64', 'R32', 'Sweet 16', 'Elite 8', 'Final Four', 'Championship'];

function probColor(p: number): string {
  if (p >= 0.75) return '#22c55e';
  if (p >= 0.50) return '#eab308';
  if (p >= 0.25) return '#f97316';
  return '#ef4444';
}

function probBgClass(p: number): string {
  if (p >= 0.75) return 'bg-green-500';
  if (p >= 0.50) return 'bg-yellow-500';
  if (p >= 0.25) return 'bg-orange-500';
  return 'bg-red-500';
}

function probTextClass(p: number): string {
  if (p >= 0.75) return 'text-green-400';
  if (p >= 0.50) return 'text-yellow-400';
  if (p >= 0.25) return 'text-orange-400';
  return 'text-red-400';
}

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
        <span className="absolute right-1.5 top-0 h-full flex items-center text-[10px] font-bold tabular-nums text-gray-600 dark:text-gray-300">
          {(value * 100).toFixed(1)}%
        </span>
      </div>
    </div>
  );
}

// ─── Tier 3: Bracket Score Card ──────────────────────────────────────────

function BracketScoreCard({
  bracket,
  teams,
  simulationResults,
  scoringSystem,
}: {
  bracket: BracketState;
  teams: Record<string, Team>;
  simulationResults: SimulationResults;
  scoringSystem: ScoringSystem;
}) {
  const stats = useMemo(() => {
    const matchups = Object.values(bracket.matchups);
    const pointsByRound: Record<string, number> = {};
    ROUNDS_ORDER.forEach((r, i) => {
      pointsByRound[r] = scoringSystem.pointsByRound[i] ?? 0;
    });

    let totalExpected = 0;
    let upsetCount = 0;
    let chalkDeviations = 0;
    let totalPicks = 0;
    let highConfidence = 0;
    let medConfidence = 0;
    let lowConfidence = 0;

    for (const m of matchups) {
      if (!m.winnerId || m.winProbA === null) continue;
      totalPicks++;
      const prob = m.winnerId === m.teamAId ? m.winProbA : 1 - m.winProbA;
      const pts = pointsByRound[m.round] || 0;
      totalExpected += prob * pts;

      if (m.isUpset) upsetCount++;

      // Check chalk deviation: winner is not the higher seed
      const tA = m.teamAId ? teams[m.teamAId] : null;
      const tB = m.teamBId ? teams[m.teamBId] : null;
      if (tA && tB) {
        const chalkWinner = tA.seed <= tB.seed ? tA.id : tB.id;
        if (m.winnerId !== chalkWinner && tA.seed !== tB.seed) {
          chalkDeviations++;
        }
      }

      // Confidence buckets
      if (prob >= 0.7) highConfidence++;
      else if (prob >= 0.45) medConfidence++;
      else lowConfidence++;
    }

    // Championship pick probability
    const champMatchup = matchups.find((m) => m.round === 'Championship');
    const champPickId = champMatchup?.winnerId ?? null;
    const champProb = champPickId
      ? simulationResults.teamResults[champPickId]?.championshipProb ?? 0
      : 0;
    const champTeam = champPickId ? teams[champPickId] : null;

    // Total possible picks for uniqueness calculation
    const totalMatchupsWithTeams = matchups.filter(
      (m) => m.teamAId && m.teamBId
    ).length;
    const uniqueness = totalMatchupsWithTeams > 0
      ? Math.round((chalkDeviations / totalMatchupsWithTeams) * 100)
      : 0;

    return {
      totalExpected,
      upsetCount,
      uniqueness,
      champProb,
      champTeam,
      highConfidence,
      medConfidence,
      lowConfidence,
      totalPicks,
    };
  }, [bracket, teams, simulationResults, scoringSystem]);

  return (
    <div className="space-y-3">
      {/* Big expected score */}
      <div className="flex items-center justify-between">
        <div>
          <h4 className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">
            Bracket Score
          </h4>
          <p className="text-[10px] text-gray-400 dark:text-gray-500 mt-0.5">
            Total expected points across all picks
          </p>
        </div>
        <div className="flex items-baseline gap-1.5">
          <span className="text-3xl font-black tabular-nums text-[#00274C] dark:text-blue-300">
            {stats.totalExpected.toFixed(1)}
          </span>
          <span className="text-xs text-gray-400">pts</span>
        </div>
      </div>

      {/* Stats grid */}
      <div className="grid grid-cols-2 gap-2">
        {/* Upset count */}
        <div className="px-3 py-2 rounded-lg bg-gray-50 dark:bg-gray-700/50">
          <div className="text-[10px] text-gray-400 dark:text-gray-500 uppercase font-semibold">Upsets</div>
          <div className="flex items-baseline gap-1 mt-0.5">
            <span className="text-lg font-bold tabular-nums text-gray-800 dark:text-gray-100">
              {stats.upsetCount}
            </span>
            <span className={`text-[10px] font-medium ${
              stats.upsetCount >= 7 && stats.upsetCount <= 10
                ? 'text-green-500'
                : stats.upsetCount < 5 || stats.upsetCount > 13
                ? 'text-red-400'
                : 'text-yellow-500'
            }`}>
              {stats.upsetCount >= 7 && stats.upsetCount <= 10
                ? 'optimal'
                : stats.upsetCount < 7
                ? 'too few'
                : 'high'}
            </span>
          </div>
          <div className="text-[9px] text-gray-400">Target: 7-10</div>
        </div>

        {/* Uniqueness */}
        <div className="px-3 py-2 rounded-lg bg-gray-50 dark:bg-gray-700/50">
          <div className="text-[10px] text-gray-400 dark:text-gray-500 uppercase font-semibold">Uniqueness</div>
          <div className="flex items-baseline gap-1 mt-0.5">
            <span className="text-lg font-bold tabular-nums text-gray-800 dark:text-gray-100">
              {stats.uniqueness}%
            </span>
          </div>
          <div className="text-[9px] text-gray-400">0% = chalk, 100% = all upsets</div>
        </div>

        {/* Championship pick */}
        <div className="px-3 py-2 rounded-lg bg-gray-50 dark:bg-gray-700/50 col-span-2">
          <div className="text-[10px] text-gray-400 dark:text-gray-500 uppercase font-semibold">Champion Pick</div>
          {stats.champTeam ? (
            <div className="flex items-center justify-between mt-0.5">
              <span className="text-sm font-bold text-gray-800 dark:text-gray-100">
                ({stats.champTeam.seed}) {stats.champTeam.name}
              </span>
              <span className={`text-sm font-bold tabular-nums ${
                stats.champProb >= 0.1 ? 'text-green-500' : stats.champProb >= 0.05 ? 'text-yellow-500' : 'text-red-400'
              }`}>
                {(stats.champProb * 100).toFixed(1)}% win probability
              </span>
            </div>
          ) : (
            <span className="text-xs text-gray-400 italic">No champion selected yet</span>
          )}
        </div>
      </div>

      {/* Confidence distribution */}
      {stats.totalPicks > 0 && (
        <div>
          <div className="text-[10px] text-gray-400 dark:text-gray-500 uppercase font-semibold mb-1.5">
            Pick Confidence Distribution
          </div>
          <div className="flex h-4 rounded-full overflow-hidden">
            {stats.highConfidence > 0 && (
              <div
                className="bg-green-500 transition-all duration-300"
                style={{ width: `${(stats.highConfidence / stats.totalPicks) * 100}%` }}
                title={`High confidence: ${stats.highConfidence}`}
              />
            )}
            {stats.medConfidence > 0 && (
              <div
                className="bg-yellow-500 transition-all duration-300"
                style={{ width: `${(stats.medConfidence / stats.totalPicks) * 100}%` }}
                title={`Medium confidence: ${stats.medConfidence}`}
              />
            )}
            {stats.lowConfidence > 0 && (
              <div
                className="bg-red-400 transition-all duration-300"
                style={{ width: `${(stats.lowConfidence / stats.totalPicks) * 100}%` }}
                title={`Low confidence: ${stats.lowConfidence}`}
              />
            )}
          </div>
          <div className="flex justify-between mt-1">
            <span className="text-[9px] text-green-500 font-medium">{stats.highConfidence} high</span>
            <span className="text-[9px] text-yellow-500 font-medium">{stats.medConfidence} medium</span>
            <span className="text-[9px] text-red-400 font-medium">{stats.lowConfidence} low</span>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Tier 2: Team Probability Waterfall ──────────────────────────────────

function TeamWaterfallRow({
  teamResult,
  team,
  isExpanded,
  onToggle,
}: {
  teamResult: { teamId: string; roundProbabilities: Record<string, number>; championshipProb: number };
  team: Team;
  isExpanded: boolean;
  onToggle: () => void;
}) {
  return (
    <div className="border border-gray-100 dark:border-gray-700 rounded-lg overflow-hidden">
      <button
        onClick={onToggle}
        className="w-full px-3 py-2 flex items-center gap-2 hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors text-left"
      >
        <svg
          className={`w-3 h-3 text-gray-400 transition-transform ${isExpanded ? 'rotate-90' : ''}`}
          fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}
        >
          <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
        </svg>
        <span className="text-xs font-bold text-gray-800 dark:text-gray-100 w-8 text-center shrink-0">
          {team.seed}
        </span>
        <span className="text-xs font-semibold text-gray-800 dark:text-gray-100 truncate flex-1">
          {team.name}
        </span>
        <span className="text-[10px] text-gray-400 dark:text-gray-500 shrink-0">{team.region}</span>
        <span className="text-xs font-bold tabular-nums text-[#00274C] dark:text-blue-300 shrink-0 w-14 text-right">
          {(teamResult.championshipProb * 100).toFixed(1)}%
        </span>
      </button>

      {/* Compact inline bar always visible */}
      <div className="px-3 pb-2">
        <div className="flex gap-0.5 h-2.5 rounded-sm overflow-hidden">
          {ROUND_KEYS.map((rk) => {
            const p = teamResult.roundProbabilities[rk.key] ?? 0;
            return (
              <div
                key={rk.key}
                className="flex-1 rounded-sm transition-all duration-300"
                style={{ backgroundColor: probColor(p), opacity: Math.max(p, 0.08) }}
                title={`${rk.label}: ${(p * 100).toFixed(1)}%`}
              />
            );
          })}
        </div>
        <div className="flex gap-0.5 mt-0.5">
          {ROUND_KEYS.map((rk) => (
            <span key={rk.key} className="flex-1 text-center text-[8px] text-gray-400">{rk.short}</span>
          ))}
        </div>
      </div>

      {/* Expanded detail */}
      {isExpanded && (
        <div className="px-3 pb-3 border-t border-gray-100 dark:border-gray-700 pt-2 space-y-1.5">
          {ROUND_KEYS.map((rk) => {
            const p = teamResult.roundProbabilities[rk.key] ?? 0;
            return (
              <div key={rk.key} className="flex items-center gap-2">
                <span className="text-[10px] w-8 text-right text-gray-500 dark:text-gray-400 font-medium shrink-0">
                  {rk.short}
                </span>
                <div className="flex-1 h-3.5 bg-gray-100 dark:bg-gray-700 rounded-sm overflow-hidden relative">
                  <div
                    className={`h-full rounded-sm transition-all duration-500 ${probBgClass(p)}`}
                    style={{ width: `${Math.max(p * 100, 0.5)}%` }}
                  />
                </div>
                <span className={`text-[10px] font-bold tabular-nums w-10 text-right shrink-0 ${probTextClass(p)}`}>
                  {(p * 100).toFixed(1)}%
                </span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function TeamWaterfalls({
  simulationResults,
  teams,
}: {
  simulationResults: SimulationResults;
  teams: Record<string, Team>;
}) {
  const [search, setSearch] = useState('');
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [showCount, setShowCount] = useState(16);

  const sorted = useMemo(() => {
    return Object.values(simulationResults.teamResults)
      .sort((a, b) => b.championshipProb - a.championshipProb);
  }, [simulationResults]);

  const filtered = useMemo(() => {
    if (!search.trim()) return sorted.slice(0, showCount);
    const q = search.toLowerCase();
    return sorted.filter((tr) => {
      const team = teams[tr.teamId];
      if (!team) return false;
      return (
        team.name.toLowerCase().includes(q) ||
        team.conference.toLowerCase().includes(q) ||
        team.region.toLowerCase().includes(q) ||
        String(team.seed).includes(q)
      );
    });
  }, [sorted, search, showCount, teams]);

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2">
        <h4 className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider flex-1">
          Round-by-Round Survival
        </h4>
        <div className="relative">
          <input
            type="text"
            placeholder="Search teams..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-40 pl-7 pr-2 py-1 text-xs rounded-lg border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-800 dark:text-gray-100 placeholder-gray-400 focus:ring-1 focus:ring-blue-400 focus:outline-none"
          />
          <svg className="w-3.5 h-3.5 absolute left-2 top-1/2 -translate-y-1/2 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
        </div>
      </div>

      {/* Color legend */}
      <div className="flex items-center gap-3">
        <span className="text-[9px] text-gray-400">Probability:</span>
        <div className="flex items-center gap-1">
          <div className="w-3 h-2 rounded-sm bg-green-500" />
          <span className="text-[9px] text-gray-400">&gt;75%</span>
        </div>
        <div className="flex items-center gap-1">
          <div className="w-3 h-2 rounded-sm bg-yellow-500" />
          <span className="text-[9px] text-gray-400">50-75%</span>
        </div>
        <div className="flex items-center gap-1">
          <div className="w-3 h-2 rounded-sm bg-orange-500" />
          <span className="text-[9px] text-gray-400">25-50%</span>
        </div>
        <div className="flex items-center gap-1">
          <div className="w-3 h-2 rounded-sm bg-red-500" />
          <span className="text-[9px] text-gray-400">&lt;25%</span>
        </div>
      </div>

      <div className="space-y-1 max-h-[500px] overflow-y-auto pr-1">
        {filtered.map((tr) => {
          const team = teams[tr.teamId];
          if (!team) return null;
          return (
            <TeamWaterfallRow
              key={tr.teamId}
              teamResult={tr}
              team={team}
              isExpanded={expandedId === tr.teamId}
              onToggle={() => setExpandedId(expandedId === tr.teamId ? null : tr.teamId)}
            />
          );
        })}
        {filtered.length === 0 && (
          <p className="text-xs text-gray-400 italic text-center py-4">No teams match your search.</p>
        )}
      </div>

      {!search.trim() && showCount < sorted.length && (
        <button
          onClick={() => setShowCount((c) => Math.min(c + 16, sorted.length))}
          className="w-full py-1.5 text-[10px] font-medium text-blue-500 hover:text-blue-700 dark:text-blue-400 dark:hover:text-blue-300"
        >
          Show more ({sorted.length - showCount} remaining)
        </button>
      )}
    </div>
  );
}

// ─── Tier 2: Value Picks Table ───────────────────────────────────────────

function hashCode(str: string): number {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = ((hash << 5) - hash) + str.charCodeAt(i);
    hash |= 0;
  }
  return hash;
}

function estimatePublicPick(seedA: number, seedB: number, idA: string, idB: string): number {
  const noise = (Math.abs(hashCode(idA + idB)) % 100) / 1000 - 0.05;
  const diff = seedB - seedA;
  if (diff === 0) return 0.5 + noise;
  const base = 0.5 + diff * 0.035;
  return Math.min(0.97, Math.max(0.03, base + noise));
}

interface ValuePick {
  teamId: string;
  teamName: string;
  seed: number;
  region: string;
  modelWinPct: number;
  publicPickPct: number;
  valueRatio: number;
  round: string;
}

function ValuePicksTable({
  bracket,
  teams,
  simulationResults: _simulationResults,
}: {
  bracket: BracketState;
  teams: Record<string, Team>;
  simulationResults: SimulationResults;
}) {
  const valuePicks = useMemo(() => {
    const picks: ValuePick[] = [];
    for (const m of Object.values(bracket.matchups)) {
      if (!m.teamAId || !m.teamBId || m.winProbA === null) continue;
      const tA = teams[m.teamAId];
      const tB = teams[m.teamBId];
      if (!tA || !tB) continue;

      const publicA = estimatePublicPick(tA.seed, tB.seed, tA.id, tB.id);

      // Check team A as value pick
      if (m.winProbA > publicA + 0.05) {
        picks.push({
          teamId: tA.id,
          teamName: tA.name,
          seed: tA.seed,
          region: tA.region,
          modelWinPct: m.winProbA,
          publicPickPct: publicA,
          valueRatio: m.winProbA / Math.max(publicA, 0.01),
          round: m.round,
        });
      }

      // Check team B as value pick
      const probB = 1 - m.winProbA;
      const publicB = 1 - publicA;
      if (probB > publicB + 0.05) {
        picks.push({
          teamId: tB.id,
          teamName: tB.name,
          seed: tB.seed,
          region: tB.region,
          modelWinPct: probB,
          publicPickPct: publicB,
          valueRatio: probB / Math.max(publicB, 0.01),
          round: m.round,
        });
      }
    }
    return picks.sort((a, b) => b.valueRatio - a.valueRatio).slice(0, 10);
  }, [bracket, teams]);

  if (valuePicks.length === 0) {
    return (
      <div className="text-xs text-gray-400 italic text-center py-4">
        No significant value picks identified. Fill more of the bracket to see contrarian opportunities.
      </div>
    );
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-left">
        <thead>
          <tr className="border-b border-gray-100 dark:border-gray-700">
            <th className="text-[10px] font-semibold text-gray-400 dark:text-gray-500 uppercase pb-1.5 pr-2">Team</th>
            <th className="text-[10px] font-semibold text-gray-400 dark:text-gray-500 uppercase pb-1.5 text-center">Round</th>
            <th className="text-[10px] font-semibold text-gray-400 dark:text-gray-500 uppercase pb-1.5 text-right">Model</th>
            <th className="text-[10px] font-semibold text-gray-400 dark:text-gray-500 uppercase pb-1.5 text-right">Public</th>
            <th className="text-[10px] font-semibold text-gray-400 dark:text-gray-500 uppercase pb-1.5 text-right">Value</th>
          </tr>
        </thead>
        <tbody>
          {valuePicks.map((vp, i) => (
            <tr key={`${vp.teamId}-${vp.round}-${i}`} className="border-b border-gray-50 dark:border-gray-700/50 last:border-0">
              <td className="py-1.5 pr-2">
                <span className="text-xs font-medium text-gray-800 dark:text-gray-100">
                  ({vp.seed}) {vp.teamName}
                </span>
                <span className="text-[9px] text-gray-400 ml-1">{vp.region}</span>
              </td>
              <td className="py-1.5 text-center">
                <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-gray-100 dark:bg-gray-700 text-gray-500 dark:text-gray-400 font-medium">
                  {vp.round === 'Sweet 16' ? 'S16' : vp.round === 'Elite 8' ? 'E8' : vp.round === 'Final Four' ? 'FF' : vp.round === 'Championship' ? 'NC' : vp.round}
                </span>
              </td>
              <td className="py-1.5 text-right">
                <span className="text-xs font-bold tabular-nums text-green-500">
                  {(vp.modelWinPct * 100).toFixed(0)}%
                </span>
              </td>
              <td className="py-1.5 text-right">
                <span className="text-xs tabular-nums text-gray-500 dark:text-gray-400">
                  {(vp.publicPickPct * 100).toFixed(0)}%
                </span>
              </td>
              <td className="py-1.5 text-right">
                <span className={`text-xs font-bold tabular-nums ${
                  vp.valueRatio >= 1.5 ? 'text-green-500' : vp.valueRatio >= 1.2 ? 'text-yellow-500' : 'text-gray-500'
                }`}>
                  {vp.valueRatio.toFixed(2)}x
                </span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ─── Main Dashboard ──────────────────────────────────────────────────────

export default function AnalysisDashboard({
  simulationResults,
  teams,
  bracket,
  scoringSystem,
}: AnalysisDashboardProps) {
  // Championship top 10
  const championshipTop10 = useMemo(() => {
    return Object.values(simulationResults.teamResults)
      .sort((a, b) => b.championshipProb - a.championshipProb)
      .slice(0, 10);
  }, [simulationResults]);

  const maxChampProb = championshipTop10[0]?.championshipProb || 0.1;

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-sm font-bold text-gray-900 dark:text-gray-100">Analysis Dashboard</h3>
          <p className="text-[10px] text-gray-400 dark:text-gray-500 mt-0.5">
            Based on {simulationResults.iterations.toLocaleString()} simulations
          </p>
        </div>
      </div>

      {/* Tier 3: Bracket Score Card */}
      <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 shadow-sm p-4">
        <BracketScoreCard
          bracket={bracket}
          teams={teams}
          simulationResults={simulationResults}
          scoringSystem={scoringSystem}
        />
      </div>

      {/* Tier 2: Team Probability Waterfall */}
      <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 shadow-sm p-4">
        <TeamWaterfalls simulationResults={simulationResults} teams={teams} />
      </div>

      {/* Tier 2: Value Picks */}
      <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 shadow-sm p-4">
        <h4 className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-3">
          Value Picks — Contrarian Opportunities
        </h4>
        <ValuePicksTable bracket={bracket} teams={teams} simulationResults={simulationResults} />
      </div>

      {/* Championship Probability — enhanced */}
      <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 shadow-sm p-4">
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
    </div>
  );
}
