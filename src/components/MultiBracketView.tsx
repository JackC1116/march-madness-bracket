import { useState, useMemo } from 'react';
import type { BracketState, Team, BracketArchetype, Round, Matchup, SimulationResults } from '../types';
import { estimatePortfolioWinProbability, computeWinProbCurve } from '../engine/multi-bracket';

interface MultiBracketViewProps {
  brackets: BracketState[];
  teams: Record<string, Team>;
  archetypes: BracketArchetype[];
  poolSize: number;
  simulationResults?: SimulationResults;
}

// ── Archetype configuration ──────────────────────────────────

const ARCHETYPE_CONFIG: Record<BracketArchetype, {
  label: string;
  color: string;
  darkColor: string;
  icon: string;
  strategy: string;
  bestFor: string;
}> = {
  chalk: {
    label: 'Chalk',
    color: '#00274C',
    darkColor: '#4a90d9',
    icon: '\u2713', // checkmark
    strategy: 'Plays it safe \u2014 picks the higher seed in every close game. Maximizes expected score by trusting the models.',
    bestFor: 'Best for small pools where consistency wins.',
  },
  contrarian: {
    label: 'Contrarian',
    color: '#FF6B00',
    darkColor: '#FF8C40',
    icon: '\u21C4', // arrows
    strategy: 'Goes against the crowd \u2014 picks underdogs in toss-up games that most people will get wrong. Optimizes for unique points.',
    bestFor: 'Best edge in large pools where you need differentiation.',
  },
  cinderella: {
    label: 'Cinderella',
    color: '#9b59b6',
    darkColor: '#b07cc6',
    icon: '\u2605', // star
    strategy: 'Bets on mid-major dark horses making deep runs. Targets seeds 10+ with upset-prone traits like defensive toughness and experience.',
    bestFor: 'High risk, high reward \u2014 for when you want to swing for the fences.',
  },
  bold_final_four: {
    label: 'Bold FF',
    color: '#27ae60',
    darkColor: '#4cd88a',
    icon: '\u2660', // spade
    strategy: 'Conservative early rounds, but unconventional Final Four picks. Picks chalk to survive, then differentiates where it matters most.',
    bestFor: 'Differentiates where the biggest points are \u2014 the late rounds.',
  },
};

const ROUND_ORDER: Round[] = ['R64', 'R32', 'Sweet 16', 'Elite 8', 'Final Four', 'Championship'];
const ROUND_POINTS: Record<string, number> = {
  R64: 1, R32: 2, 'Sweet 16': 4, 'Elite 8': 8, 'Final Four': 16, Championship: 32,
};

// ── Helper functions ─────────────────────────────────────────

function computeExpectedScore(bracket: BracketState): number {
  let total = 0;
  for (const m of Object.values(bracket.matchups)) {
    if (!m.winnerId || m.winProbA === null) continue;
    const prob = m.winnerId === m.teamAId ? m.winProbA : 1 - m.winProbA;
    total += prob * (ROUND_POINTS[m.round] || 0);
  }
  return total;
}

function countUpsets(bracket: BracketState): number {
  return Object.values(bracket.matchups).filter((m) => m.isUpset && m.winnerId).length;
}

function getChampion(bracket: BracketState, teams: Record<string, Team>): Team | null {
  const champMatch = Object.values(bracket.matchups).find((m) => m.round === 'Championship');
  return champMatch?.winnerId ? teams[champMatch.winnerId] ?? null : null;
}

function getFinalFour(bracket: BracketState, teams: Record<string, Team>): Team[] {
  const ffMatchups = Object.values(bracket.matchups).filter((m) => m.round === 'Final Four');
  const teamIds = new Set<string>();
  for (const m of ffMatchups) {
    if (m.teamAId) teamIds.add(m.teamAId);
    if (m.teamBId) teamIds.add(m.teamBId);
  }
  return [...teamIds].map((id) => teams[id]).filter(Boolean);
}

function getChampionProbability(bracket: BracketState): number {
  const champMatch = Object.values(bracket.matchups).find((m) => m.round === 'Championship');
  if (!champMatch?.winnerId || champMatch.winProbA === null) return 0;
  return champMatch.winnerId === champMatch.teamAId ? champMatch.winProbA : 1 - champMatch.winProbA;
}

interface DivergentPick {
  matchupId: string;
  round: Round;
  points: number;
  teamA: Team | null;
  teamB: Team | null;
  picks: { archetype: BracketArchetype; winner: Team | null; prob: number }[];
  probA: number;
}

function getDivergentPicks(
  brackets: BracketState[],
  archetypes: BracketArchetype[],
  teams: Record<string, Team>
): DivergentPick[] {
  if (brackets.length < 2) return [];
  const diffs: DivergentPick[] = [];
  const base = brackets[0];

  for (const [id, matchup] of Object.entries(base.matchups)) {
    const winners = brackets.map((b) => b.matchups[id]?.winnerId);
    const allSame = winners.every((w) => w === winners[0]);
    if (allSame) continue;

    diffs.push({
      matchupId: id,
      round: matchup.round as Round,
      points: ROUND_POINTS[matchup.round] || 0,
      teamA: matchup.teamAId ? teams[matchup.teamAId] ?? null : null,
      teamB: matchup.teamBId ? teams[matchup.teamBId] ?? null : null,
      probA: matchup.winProbA ?? 0.5,
      picks: brackets.map((b, i) => {
        const bm = b.matchups[id];
        const winnerId = bm?.winnerId;
        return {
          archetype: archetypes[i] || 'chalk',
          winner: winnerId ? teams[winnerId] ?? null : null,
          prob: winnerId && bm
            ? winnerId === bm.teamAId ? (bm.winProbA ?? 0.5) : 1 - (bm.winProbA ?? 0.5)
            : 0,
        };
      }),
    });
  }

  // Sort by round (later rounds first), then by points descending
  const roundIdx = (r: Round) => ROUND_ORDER.indexOf(r);
  diffs.sort((a, b) => roundIdx(b.round) - roundIdx(a.round) || b.points - a.points);
  return diffs;
}

function getKeyDifferencesFromChalk(
  bracket: BracketState,
  chalkBracket: BracketState,
  teams: Record<string, Team>
): { matchup: Matchup; chalkWinner: Team | null; thisWinner: Team | null; round: Round; prob: number }[] {
  const diffs: { matchup: Matchup; chalkWinner: Team | null; thisWinner: Team | null; round: Round; prob: number }[] = [];
  for (const [id, matchup] of Object.entries(bracket.matchups)) {
    const chalkMatchup = chalkBracket.matchups[id];
    if (!chalkMatchup || matchup.winnerId === chalkMatchup.winnerId) continue;
    if (!matchup.winnerId) continue;
    const prob = matchup.winProbA !== null
      ? (matchup.winnerId === matchup.teamAId ? matchup.winProbA : 1 - matchup.winProbA)
      : 0.5;
    diffs.push({
      matchup,
      chalkWinner: chalkMatchup.winnerId ? teams[chalkMatchup.winnerId] ?? null : null,
      thisWinner: matchup.winnerId ? teams[matchup.winnerId] ?? null : null,
      round: matchup.round as Round,
      prob,
    });
  }
  // Sort by round descending (later rounds first)
  diffs.sort((a, b) => ROUND_ORDER.indexOf(b.round) - ROUND_ORDER.indexOf(a.round));
  return diffs;
}

// ── Section Components ───────────────────────────────────────

function PortfolioSummary({
  brackets,
  archetypes: _archetypes,
  teams,
  poolSize: _poolSize,
}: {
  brackets: BracketState[];
  archetypes: BracketArchetype[];
  teams: Record<string, Team>;
  poolSize: number;
}) {
  const stats = useMemo(() => {
    // Unique champion picks
    const champTeams = new Set<string>();
    for (const b of brackets) {
      const champ = getChampion(b, teams);
      if (champ) champTeams.add(champ.id);
    }

    // All unique winner picks across all matchups
    const uniquePicks = new Set<string>();
    for (const b of brackets) {
      for (const m of Object.values(b.matchups)) {
        if (m.winnerId) uniquePicks.add(`${m.id}:${m.winnerId}`);
      }
    }

    // Count divergent games
    const base = brackets[0];
    let divergentGames = 0;
    if (base) {
      for (const id of Object.keys(base.matchups)) {
        const winners = brackets.map((b) => b.matchups[id]?.winnerId);
        if (!winners.every((w) => w === winners[0])) divergentGames++;
      }
    }

    // Rough estimate of combined championship coverage
    // Sum of individual champion probabilities, capped at reasonable values
    let combinedChampProb = 0;
    const seenChamps = new Set<string>();
    for (const b of brackets) {
      const champMatch = Object.values(b.matchups).find((m) => m.round === 'Championship');
      if (champMatch?.winnerId && !seenChamps.has(champMatch.winnerId)) {
        seenChamps.add(champMatch.winnerId);
        // Use a rough championship probability based on seed
        const champTeam = teams[champMatch.winnerId];
        if (champTeam) {
          // Rough seed-based championship probability
          const seedProbs: Record<number, number> = {
            1: 0.18, 2: 0.10, 3: 0.07, 4: 0.05, 5: 0.03, 6: 0.02,
            7: 0.015, 8: 0.01, 9: 0.008, 10: 0.005, 11: 0.004, 12: 0.003,
            13: 0.001, 14: 0.0005, 15: 0.0002, 16: 0.0001,
          };
          combinedChampProb += seedProbs[champTeam.seed] ?? 0.005;
        }
      }
    }
    combinedChampProb = Math.min(combinedChampProb, 0.95);

    return {
      champTeamCount: champTeams.size,
      uniquePickCount: uniquePicks.size,
      divergentGames,
      combinedChampProb,
    };
  }, [brackets, teams]);

  return (
    <div className="bg-gradient-to-r from-[#00274C] to-[#003366] dark:from-gray-800 dark:to-gray-750 rounded-xl p-5 text-white">
      <div className="flex items-center gap-2 mb-3">
        <span className="text-lg font-bold">Portfolio Strategy</span>
        <span className="px-2 py-0.5 bg-white/20 rounded-full text-xs font-medium">
          {brackets.length} brackets
        </span>
      </div>
      <p className="text-sm text-blue-100 dark:text-gray-300 mb-4">
        Your {brackets.length} brackets cover {stats.champTeamCount} different championship outcomes
        with {stats.divergentGames} divergent games across the field.
      </p>
      <div className="grid grid-cols-3 gap-4">
        <div className="bg-white/10 rounded-lg p-3 text-center">
          <div className="text-2xl font-bold tabular-nums">{stats.champTeamCount}</div>
          <div className="text-[11px] text-blue-200 dark:text-gray-400 mt-0.5">Champion Picks</div>
        </div>
        <div className="bg-white/10 rounded-lg p-3 text-center">
          <div className="text-2xl font-bold tabular-nums">{stats.divergentGames}</div>
          <div className="text-[11px] text-blue-200 dark:text-gray-400 mt-0.5">Divergent Games</div>
        </div>
        <div className="bg-white/10 rounded-lg p-3 text-center">
          <div className="text-2xl font-bold tabular-nums">{(stats.combinedChampProb * 100).toFixed(0)}%</div>
          <div className="text-[11px] text-blue-200 dark:text-gray-400 mt-0.5">Outcome Coverage</div>
        </div>
      </div>
    </div>
  );
}

function BracketCard({
  bracket,
  archetype,
  index,
  teams,
  chalkBracket,
  isExpanded,
  onToggle,
}: {
  bracket: BracketState;
  archetype: BracketArchetype;
  index: number;
  teams: Record<string, Team>;
  chalkBracket: BracketState;
  isExpanded: boolean;
  onToggle: () => void;
}) {
  const config = ARCHETYPE_CONFIG[archetype];
  const score = useMemo(() => computeExpectedScore(bracket), [bracket]);
  const upsets = useMemo(() => countUpsets(bracket), [bracket]);
  const champion = useMemo(() => getChampion(bracket, teams), [bracket, teams]);
  const finalFour = useMemo(() => getFinalFour(bracket, teams), [bracket, teams]);
  const champProb = useMemo(() => getChampionProbability(bracket), [bracket]);
  const keyDiffs = useMemo(
    () => getKeyDifferencesFromChalk(bracket, chalkBracket, teams),
    [bracket, chalkBracket, teams]
  );

  return (
    <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 shadow-sm overflow-hidden">
      {/* Card header */}
      <button
        onClick={onToggle}
        className="w-full px-5 py-4 flex items-center gap-4 hover:bg-gray-50 dark:hover:bg-gray-750 transition-colors text-left"
      >
        {/* Icon circle */}
        <div
          className="w-10 h-10 rounded-full flex items-center justify-center text-white text-lg font-bold shrink-0"
          style={{ backgroundColor: config.color }}
        >
          {config.icon}
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="font-bold text-gray-900 dark:text-gray-100">{config.label} Bracket</span>
            <span className="text-xs px-2 py-0.5 rounded-full font-medium text-white" style={{ backgroundColor: config.color }}>
              #{index + 1}
            </span>
          </div>
          <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5 truncate">{config.strategy}</p>
        </div>

        <div className="flex items-center gap-4 shrink-0">
          {champion && (
            <div className="text-right hidden sm:block">
              <div className="text-[10px] text-gray-400 uppercase tracking-wider">Champion</div>
              <div className="text-sm font-bold text-gray-900 dark:text-gray-100">
                ({champion.seed}) {champion.name}
              </div>
            </div>
          )}
          <div className="text-right">
            <div className="text-[10px] text-gray-400 uppercase tracking-wider">Expected</div>
            <div className="text-sm font-bold tabular-nums" style={{ color: config.color }}>
              {score.toFixed(1)} pts
            </div>
          </div>
          <svg
            className={`w-5 h-5 text-gray-400 transition-transform ${isExpanded ? 'rotate-180' : ''}`}
            fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}
          >
            <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
          </svg>
        </div>
      </button>

      {/* Expanded details */}
      {isExpanded && (
        <div className="border-t border-gray-100 dark:border-gray-700">
          {/* Strategy + Best For */}
          <div className="px-5 py-3 bg-gray-50 dark:bg-gray-750">
            <p className="text-sm text-gray-700 dark:text-gray-300">{config.strategy}</p>
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-1 italic">{config.bestFor}</p>
          </div>

          {/* Key stats row */}
          <div className="px-5 py-3 grid grid-cols-2 sm:grid-cols-4 gap-3 border-b border-gray-100 dark:border-gray-700">
            <div>
              <div className="text-[10px] text-gray-400 uppercase tracking-wider">Champion</div>
              <div className="text-sm font-bold text-gray-900 dark:text-gray-100 mt-0.5">
                {champion ? `(${champion.seed}) ${champion.name}` : 'N/A'}
              </div>
              {champProb > 0 && (
                <div className="text-[10px] text-gray-400 mt-0.5">
                  {(champProb * 100).toFixed(0)}% win probability
                </div>
              )}
            </div>
            <div>
              <div className="text-[10px] text-gray-400 uppercase tracking-wider">Final Four</div>
              <div className="text-xs text-gray-700 dark:text-gray-300 mt-1 space-y-0.5">
                {finalFour.map((t) => (
                  <div key={t.id}>({t.seed}) {t.name}</div>
                ))}
              </div>
            </div>
            <div>
              <div className="text-[10px] text-gray-400 uppercase tracking-wider">Expected Score</div>
              <div className="text-lg font-bold tabular-nums mt-0.5" style={{ color: config.color }}>
                {score.toFixed(1)}
              </div>
            </div>
            <div>
              <div className="text-[10px] text-gray-400 uppercase tracking-wider">Upsets Picked</div>
              <div className="text-lg font-bold tabular-nums text-gray-900 dark:text-gray-100 mt-0.5">
                {upsets}
              </div>
            </div>
          </div>

          {/* Key differences from chalk */}
          {archetype !== 'chalk' && keyDiffs.length > 0 && (
            <div className="px-5 py-3">
              <h4 className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-2">
                Key Differences from Chalk ({keyDiffs.length} total)
              </h4>
              <div className="space-y-1.5">
                {keyDiffs.slice(0, 5).map((diff) => {
                  const thisTeam = diff.thisWinner;
                  const chalkTeam = diff.chalkWinner;
                  return (
                    <div
                      key={diff.matchup.id}
                      className="flex items-center gap-2 px-3 py-2 rounded-lg bg-gray-50 dark:bg-gray-750 border border-gray-100 dark:border-gray-700"
                    >
                      <span
                        className="text-[10px] px-2 py-0.5 rounded-full font-bold text-white shrink-0"
                        style={{ backgroundColor: config.color }}
                      >
                        {diff.round}
                      </span>
                      <div className="flex-1 min-w-0 text-xs">
                        <span className="font-semibold text-gray-900 dark:text-gray-100">
                          Picks {thisTeam ? `(${thisTeam.seed}) ${thisTeam.name}` : 'TBD'}
                        </span>
                        <span className="text-gray-400 mx-1">over</span>
                        <span className="text-gray-500 dark:text-gray-400 line-through">
                          {chalkTeam ? `(${chalkTeam.seed}) ${chalkTeam.name}` : 'TBD'}
                        </span>
                      </div>
                      <span className="text-[10px] tabular-nums text-gray-400 shrink-0">
                        {(diff.prob * 100).toFixed(0)}% chance
                      </span>
                    </div>
                  );
                })}
                {keyDiffs.length > 5 && (
                  <p className="text-[10px] text-gray-400 pl-3">
                    +{keyDiffs.length - 5} more differences in earlier rounds
                  </p>
                )}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function ComparisonTable({
  brackets,
  archetypes,
  teams,
}: {
  brackets: BracketState[];
  archetypes: BracketArchetype[];
  teams: Record<string, Team>;
}) {
  const divergentPicks = useMemo(
    () => getDivergentPicks(brackets, archetypes, teams),
    [brackets, archetypes, teams]
  );

  if (divergentPicks.length === 0) return null;

  return (
    <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 shadow-sm overflow-hidden">
      <div className="px-5 py-4 border-b border-gray-100 dark:border-gray-700">
        <h3 className="text-sm font-bold text-gray-900 dark:text-gray-100">Divergence Map</h3>
        <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
          Games where your brackets pick differently, sorted by point value (later rounds first).
        </p>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead>
            <tr className="bg-gray-50 dark:bg-gray-750">
              <th className="text-left px-4 py-2 text-gray-500 dark:text-gray-400 font-semibold">Game</th>
              <th className="text-center px-2 py-2 text-gray-500 dark:text-gray-400 font-semibold">Round</th>
              {archetypes.slice(0, brackets.length).map((arch, i) => (
                <th key={i} className="text-center px-2 py-2 font-semibold" style={{ color: ARCHETYPE_CONFIG[arch].color }}>
                  {ARCHETYPE_CONFIG[arch].label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {divergentPicks.slice(0, 20).map((dp) => {
              const allPicks = dp.picks.map((p) => p.winner?.id);
              return (
                <tr key={dp.matchupId} className="border-t border-gray-50 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-750">
                  <td className="px-4 py-2 text-gray-700 dark:text-gray-300 whitespace-nowrap">
                    {dp.teamA ? `(${dp.teamA.seed}) ${dp.teamA.name}` : 'TBD'} vs{' '}
                    {dp.teamB ? `(${dp.teamB.seed}) ${dp.teamB.name}` : 'TBD'}
                  </td>
                  <td className="text-center px-2 py-2">
                    <span className="px-2 py-0.5 rounded-full bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300 text-[10px] font-medium">
                      {dp.round} ({dp.points}pt)
                    </span>
                  </td>
                  {dp.picks.map((pick, i) => {
                    const isUnique = allPicks.filter((id) => id === pick.winner?.id).length === 1;
                    const isConsensus = allPicks.every((id) => id === pick.winner?.id);
                    return (
                      <td
                        key={i}
                        className={`text-center px-2 py-2 font-medium ${
                          isConsensus
                            ? 'text-green-600 dark:text-green-400'
                            : isUnique
                              ? 'text-orange-600 dark:text-orange-400'
                              : 'text-gray-700 dark:text-gray-300'
                        }`}
                      >
                        {pick.winner ? (
                          <span className="whitespace-nowrap">
                            ({pick.winner.seed}) {pick.winner.name}
                          </span>
                        ) : (
                          <span className="text-gray-300 dark:text-gray-600">TBD</span>
                        )}
                      </td>
                    );
                  })}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {divergentPicks.length > 20 && (
        <div className="px-5 py-2 text-center text-[10px] text-gray-400 border-t border-gray-100 dark:border-gray-700">
          Showing top 20 of {divergentPicks.length} divergent games
        </div>
      )}
    </div>
  );
}

function CoverageAnalysis({
  brackets,
  archetypes,
  teams,
}: {
  brackets: BracketState[];
  archetypes: BracketArchetype[];
  teams: Record<string, Team>;
}) {
  const coverage = useMemo(() => {
    return brackets.map((b, i) => {
      const champ = getChampion(b, teams);
      const ff = getFinalFour(b, teams);
      const config = ARCHETYPE_CONFIG[archetypes[i] || 'chalk'];

      // Identify what scenarios this bracket is best positioned for
      const scenarioDesc = champ
        ? `Wins if ${champ.name} wins it all`
        : 'No champion selected';

      // Get unique FF teams not in other brackets
      const otherFFIds = new Set<string>();
      brackets.forEach((ob, oi) => {
        if (oi === i) return;
        getFinalFour(ob, teams).forEach((t) => otherFFIds.add(t.id));
      });
      const uniqueFF = ff.filter((t) => !otherFFIds.has(t.id));

      return {
        archetype: archetypes[i] || ('chalk' as BracketArchetype),
        config,
        champion: champ,
        finalFour: ff,
        uniqueFF,
        scenario: scenarioDesc,
      };
    });
  }, [brackets, archetypes, teams]);

  // Combined coverage: unique champions
  const allChamps = [...new Set(coverage.map((c) => c.champion?.name).filter(Boolean))];

  return (
    <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 shadow-sm overflow-hidden">
      <div className="px-5 py-4 border-b border-gray-100 dark:border-gray-700">
        <h3 className="text-sm font-bold text-gray-900 dark:text-gray-100">Coverage Analysis</h3>
        <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
          Which championship outcomes your brackets cover.
        </p>
      </div>
      <div className="px-5 py-4 space-y-3">
        {coverage.map((c, i) => (
          <div
            key={i}
            className="flex items-start gap-3 px-3 py-2.5 rounded-lg bg-gray-50 dark:bg-gray-750 border border-gray-100 dark:border-gray-700"
          >
            <div
              className="w-8 h-8 rounded-full flex items-center justify-center text-white text-sm font-bold shrink-0 mt-0.5"
              style={{ backgroundColor: c.config.color }}
            >
              {c.config.icon}
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <span className="text-sm font-semibold text-gray-900 dark:text-gray-100">
                  Bracket {i + 1}: {c.config.label}
                </span>
              </div>
              <p className="text-xs text-gray-600 dark:text-gray-400 mt-0.5">
                {c.scenario}
              </p>
              <div className="flex flex-wrap gap-1 mt-1.5">
                {c.finalFour.map((t) => (
                  <span
                    key={t.id}
                    className={`text-[10px] px-2 py-0.5 rounded-full font-medium ${
                      c.uniqueFF.some((u) => u.id === t.id)
                        ? 'bg-yellow-100 dark:bg-yellow-900/40 text-yellow-800 dark:text-yellow-300 border border-yellow-200 dark:border-yellow-800'
                        : 'bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-400'
                    }`}
                  >
                    ({t.seed}) {t.name}
                    {c.uniqueFF.some((u) => u.id === t.id) && ' *'}
                  </span>
                ))}
              </div>
            </div>
          </div>
        ))}
      </div>
      <div className="px-5 py-3 bg-gray-50 dark:bg-gray-750 border-t border-gray-100 dark:border-gray-700">
        <p className="text-xs text-gray-500 dark:text-gray-400">
          <span className="font-semibold">Combined:</span> Your brackets cover{' '}
          <span className="font-bold text-gray-700 dark:text-gray-200">{allChamps.length}</span> different
          championship scenarios ({allChamps.join(', ') || 'none'}).
          <span className="text-yellow-600 dark:text-yellow-400 ml-1">*</span> = unique Final Four pick not in other brackets.
        </p>
      </div>
    </div>
  );
}

function ScoreComparison({
  brackets,
  archetypes,
}: {
  brackets: BracketState[];
  archetypes: BracketArchetype[];
}) {
  const scores = useMemo(() => brackets.map(computeExpectedScore), [brackets]);
  const maxScore = Math.max(...scores);

  return (
    <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 shadow-sm overflow-hidden">
      <div className="px-5 py-4 border-b border-gray-100 dark:border-gray-700">
        <h3 className="text-sm font-bold text-gray-900 dark:text-gray-100">Expected Score Comparison</h3>
      </div>
      <div className="px-5 py-4 space-y-3">
        {brackets.map((_, i) => {
          const arch = archetypes[i] || 'chalk';
          const config = ARCHETYPE_CONFIG[arch];
          const score = scores[i];
          const pct = maxScore > 0 ? (score / maxScore) * 100 : 0;

          return (
            <div key={i}>
              <div className="flex items-center justify-between mb-1">
                <div className="flex items-center gap-2">
                  <div
                    className="w-3 h-3 rounded-full"
                    style={{ backgroundColor: config.color }}
                  />
                  <span className="text-xs font-bold text-gray-700 dark:text-gray-300">
                    {config.label}
                  </span>
                </div>
                <span className="text-sm font-bold tabular-nums" style={{ color: config.color }}>
                  {score.toFixed(1)} pts
                </span>
              </div>
              <div className="h-5 bg-gray-100 dark:bg-gray-700 rounded-full overflow-hidden">
                <div
                  className="h-full rounded-full transition-all duration-700 flex items-center justify-end pr-2"
                  style={{ width: `${pct}%`, backgroundColor: config.color }}
                >
                  {pct > 20 && (
                    <span className="text-[10px] font-bold text-white tabular-nums">
                      {score.toFixed(1)}
                    </span>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function WhyPortfolio({ poolSize, numBrackets }: { poolSize: number; numBrackets: number }) {
  return (
    <div className="bg-blue-50 dark:bg-blue-900/20 rounded-xl border border-blue-200 dark:border-blue-800 p-5">
      <h3 className="text-sm font-bold text-blue-900 dark:text-blue-200 mb-2">
        Why This Portfolio Approach?
      </h3>
      <p className="text-xs text-blue-800 dark:text-blue-300 leading-relaxed">
        In a <span className="font-bold">{poolSize}-person pool</span>, pure chalk gives you the most likely
        bracket but near-zero chance of winning because everyone else picks similarly. This portfolio of{' '}
        <span className="font-bold">{numBrackets} brackets</span> diversifies your risk &mdash; they share
        high-confidence picks across all brackets but diverge on leverage games where small differences create
        the biggest scoring swings. By covering multiple championship scenarios and varying upset picks, you
        maximize the probability that at least one of your entries finishes near the top.
      </p>
    </div>
  );
}

// ── Portfolio Win Probability Analysis ────────────────────────

function PortfolioAnalysis({
  brackets,
  teams,
  poolSize,
  simulationResults,
}: {
  brackets: BracketState[];
  teams: Record<string, Team>;
  poolSize: number;
  simulationResults: SimulationResults;
}) {
  const estimate = useMemo(
    () => estimatePortfolioWinProbability(brackets, poolSize, simulationResults, teams),
    [brackets, poolSize, simulationResults, teams]
  );

  const curve = useMemo(
    () => computeWinProbCurve(brackets, poolSize, simulationResults, teams, 10),
    [brackets, poolSize, simulationResults, teams]
  );

  const numBrackets = brackets.length;
  const avgPerBracket = estimate.perBracketWinProb.length > 0
    ? estimate.perBracketWinProb.reduce((s, p) => s + p, 0) / estimate.perBracketWinProb.length
    : 0;
  const singleBracketProb = estimate.perBracketWinProb[0] ?? (1 / poolSize);
  const multiplier = singleBracketProb > 0 ? estimate.winProbability / singleBracketProb : 1;

  const entryFee = 10;
  const totalCost = numBrackets * entryFee;
  const prizePool = poolSize * entryFee;
  const expectedReturn = estimate.winProbability * prizePool;

  // Chart: find max probability in curve for scaling
  const maxCurveProb = Math.max(...curve.map((c) => c.probability), 0.01);

  // Determine if adding more brackets helps
  const currentCurveEntry = curve.find((c) => c.n === numBrackets);
  const nextCurveEntry = curve.find((c) => c.n === numBrackets + 1);
  const marginalGain = currentCurveEntry && nextCurveEntry
    ? (nextCurveEntry.probability - currentCurveEntry.probability) * 100
    : 0;

  return (
    <div className="bg-gradient-to-br from-[#00274C] via-[#003366] to-[#004a8f] dark:from-gray-800 dark:via-gray-800 dark:to-gray-750 rounded-xl p-5 text-white shadow-lg border border-blue-900/30 dark:border-gray-700">
      {/* Header */}
      <div className="flex items-center gap-2 mb-4">
        <span className="text-lg font-bold tracking-tight">Portfolio Analysis</span>
        <span className="px-2 py-0.5 bg-white/15 rounded-full text-[11px] font-medium">
          {numBrackets} brackets / {poolSize}-person pool
        </span>
      </div>

      {/* Probability Cards */}
      <div className="grid grid-cols-3 gap-3 mb-5">
        <div className="bg-white/10 backdrop-blur-sm rounded-xl p-4 text-center border border-white/10">
          <div className="text-[10px] uppercase tracking-wider text-blue-200 dark:text-gray-400 mb-1">
            Win Probability
          </div>
          <div className="text-3xl font-extrabold tabular-nums">
            {(estimate.winProbability * 100).toFixed(1)}%
          </div>
          <div className="text-[10px] text-blue-300 dark:text-gray-500 mt-1">at least one wins</div>
        </div>
        <div className="bg-white/10 backdrop-blur-sm rounded-xl p-4 text-center border border-white/10">
          <div className="text-[10px] uppercase tracking-wider text-blue-200 dark:text-gray-400 mb-1">
            Top 10%
          </div>
          <div className="text-3xl font-extrabold tabular-nums">
            {(estimate.top10Probability * 100).toFixed(0)}%
          </div>
          <div className="text-[10px] text-blue-300 dark:text-gray-500 mt-1">one finishes top 10%</div>
        </div>
        <div className="bg-white/10 backdrop-blur-sm rounded-xl p-4 text-center border border-white/10">
          <div className="text-[10px] uppercase tracking-wider text-blue-200 dark:text-gray-400 mb-1">
            Top 25%
          </div>
          <div className="text-3xl font-extrabold tabular-nums">
            {(estimate.top25Probability * 100).toFixed(0)}%
          </div>
          <div className="text-[10px] text-blue-300 dark:text-gray-500 mt-1">one finishes top 25%</div>
        </div>
      </div>

      {/* Key insights */}
      <div className="bg-white/5 rounded-lg p-4 mb-5 border border-white/10 space-y-1.5">
        <p className="text-sm text-blue-100 dark:text-gray-300">
          With <span className="font-bold text-white">{numBrackets} brackets</span> in a{' '}
          <span className="font-bold text-white">{poolSize}-person pool</span>:
        </p>
        <ul className="text-sm text-blue-100 dark:text-gray-300 space-y-1 ml-1">
          <li className="flex items-start gap-2">
            <span className="text-blue-300 mt-0.5">&#8226;</span>
            Each bracket: ~{(avgPerBracket * 100).toFixed(1)}% chance of winning
          </li>
          <li className="flex items-start gap-2">
            <span className="text-blue-300 mt-0.5">&#8226;</span>
            Portfolio: ~{(estimate.winProbability * 100).toFixed(1)}% chance at least one wins
          </li>
          <li className="flex items-start gap-2">
            <span className="text-blue-300 mt-0.5">&#8226;</span>
            <span className="font-semibold text-white">{multiplier.toFixed(1)}x</span> better than submitting one bracket
          </li>
        </ul>
      </div>

      {/* Optimal bracket count + ROI */}
      <div className="grid grid-cols-2 gap-3 mb-5">
        <div className="bg-white/10 backdrop-blur-sm rounded-lg p-3 border border-white/10">
          <div className="text-[10px] uppercase tracking-wider text-blue-200 dark:text-gray-400 mb-1">
            Optimal Brackets
          </div>
          <div className="text-xl font-bold">{estimate.optimalBracketCount}</div>
          <div className="text-[10px] text-blue-300 dark:text-gray-500 mt-0.5">
            adding more has {marginalGain < 1 ? '<1' : `~${marginalGain.toFixed(1)}`}% gain
          </div>
        </div>
        <div className="bg-white/10 backdrop-blur-sm rounded-lg p-3 border border-white/10">
          <div className="text-[10px] uppercase tracking-wider text-blue-200 dark:text-gray-400 mb-1">
            Expected ROI
          </div>
          <div className="text-xl font-bold">
            {estimate.expectedROI.toFixed(2)}x
          </div>
          <div className="text-[10px] text-blue-300 dark:text-gray-500 mt-0.5 leading-tight">
            ${entryFee} x {numBrackets} = ${totalCost} in / ~${expectedReturn.toFixed(0)} expected
          </div>
        </div>
      </div>

      {/* ROI detail line */}
      <div className="bg-white/5 rounded-lg px-4 py-2.5 mb-5 border border-white/10 text-xs text-blue-200 dark:text-gray-400">
        Prize pool: <span className="font-semibold text-white">${prizePool.toLocaleString()}</span>{' '}
        ({poolSize} x ${entryFee}) &middot; Expected return:{' '}
        <span className="font-semibold text-white">${expectedReturn.toFixed(2)}</span>{' '}
        ({estimate.expectedROI >= 1 ? (
          <span className="text-green-300">+{((estimate.expectedROI - 1) * 100).toFixed(0)}%</span>
        ) : (
          <span className="text-red-300">{((estimate.expectedROI - 1) * 100).toFixed(0)}%</span>
        )})
      </div>

      {/* Diminishing returns chart */}
      <div>
        <div className="text-xs font-semibold text-blue-200 dark:text-gray-400 uppercase tracking-wider mb-3">
          Win Probability vs. Number of Brackets
        </div>
        <div className="flex items-end gap-1.5 h-32">
          {curve.map((point) => {
            const heightPct = maxCurveProb > 0 ? (point.probability / maxCurveProb) * 100 : 0;
            const isCurrentCount = point.n === numBrackets;
            return (
              <div key={point.n} className="flex-1 flex flex-col items-center gap-1">
                {/* Probability label */}
                <div className={`text-[9px] tabular-nums ${isCurrentCount ? 'text-white font-bold' : 'text-blue-300 dark:text-gray-500'}`}>
                  {(point.probability * 100).toFixed(1)}%
                </div>
                {/* Bar */}
                <div className="w-full flex-1 flex items-end">
                  <div
                    className={`w-full rounded-t transition-all duration-500 ${
                      isCurrentCount
                        ? 'bg-gradient-to-t from-blue-400 to-blue-200 shadow-lg shadow-blue-400/30'
                        : point.n <= numBrackets
                          ? 'bg-blue-400/50'
                          : 'bg-white/15'
                    }`}
                    style={{ height: `${Math.max(heightPct, 4)}%` }}
                  />
                </div>
                {/* Count label */}
                <div className={`text-[10px] tabular-nums ${isCurrentCount ? 'text-white font-bold' : 'text-blue-300 dark:text-gray-500'}`}>
                  {point.n}
                </div>
              </div>
            );
          })}
        </div>
        <div className="text-[10px] text-blue-300/60 dark:text-gray-600 text-center mt-1.5">
          Number of brackets
        </div>
      </div>
    </div>
  );
}

// ── Main Component ───────────────────────────────────────────

export default function MultiBracketView({ brackets, teams, archetypes, poolSize, simulationResults }: MultiBracketViewProps) {
  const [expandedCards, setExpandedCards] = useState<Set<number>>(() => new Set([0]));

  // Ensure we have enough archetypes for all brackets
  const effectiveArchetypes = useMemo(() => {
    const result = [...archetypes];
    const defaultRotation: BracketArchetype[] = ['chalk', 'contrarian', 'bold_final_four', 'cinderella'];
    while (result.length < brackets.length) {
      result.push(defaultRotation[result.length % defaultRotation.length]);
    }
    return result;
  }, [archetypes, brackets.length]);

  // Find chalk bracket (first one, or bracket 0)
  const chalkBracket = useMemo(() => {
    const chalkIdx = effectiveArchetypes.indexOf('chalk');
    return chalkIdx >= 0 ? brackets[chalkIdx] : brackets[0];
  }, [brackets, effectiveArchetypes]);

  const toggleCard = (index: number) => {
    setExpandedCards((prev) => {
      const next = new Set(prev);
      if (next.has(index)) {
        next.delete(index);
      } else {
        next.add(index);
      }
      return next;
    });
  };

  if (brackets.length === 0) {
    return (
      <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 shadow-sm p-8 text-center">
        <p className="text-sm text-gray-400 dark:text-gray-500">
          No brackets generated yet. Configure your pool settings and generate brackets.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4 max-w-5xl mx-auto">
      {/* Portfolio Summary */}
      <PortfolioSummary
        brackets={brackets}
        archetypes={effectiveArchetypes}
        teams={teams}
        poolSize={poolSize}
      />

      {/* Portfolio Win Probability Analysis */}
      {simulationResults && (
        <PortfolioAnalysis
          brackets={brackets}
          teams={teams}
          poolSize={poolSize}
          simulationResults={simulationResults}
        />
      )}

      {/* Per-Bracket Cards */}
      <div className="space-y-3">
        {brackets.map((bracket, i) => (
          <BracketCard
            key={i}
            bracket={bracket}
            archetype={effectiveArchetypes[i]}
            index={i}
            teams={teams}
            chalkBracket={chalkBracket}
            isExpanded={expandedCards.has(i)}
            onToggle={() => toggleCard(i)}
          />
        ))}
      </div>

      {/* Score Comparison */}
      <ScoreComparison brackets={brackets} archetypes={effectiveArchetypes} />

      {/* Comparison Table */}
      <ComparisonTable brackets={brackets} archetypes={effectiveArchetypes} teams={teams} />

      {/* Coverage Analysis */}
      <CoverageAnalysis brackets={brackets} archetypes={effectiveArchetypes} teams={teams} />

      {/* Why Portfolio */}
      <WhyPortfolio poolSize={poolSize} numBrackets={brackets.length} />
    </div>
  );
}
