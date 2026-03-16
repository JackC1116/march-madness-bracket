import { useState, useMemo } from 'react';
import type { BracketState, Team, BracketArchetype, Round } from '../types';

interface MultiBracketViewProps {
  brackets: BracketState[];
  teams: Record<string, Team>;
  archetypes: BracketArchetype[];
}

const ARCHETYPE_LABELS: Record<BracketArchetype, { label: string; color: string }> = {
  chalk: { label: 'Chalk', color: '#00274C' },
  contrarian: { label: 'Contrarian', color: '#FF6B00' },
  cinderella: { label: 'Cinderella', color: '#9b59b6' },
  bold_final_four: { label: 'Bold FF', color: '#27ae60' },
};

const ROUND_ORDER: Round[] = ['R64', 'R32', 'Sweet 16', 'Elite 8', 'Final Four', 'Championship'];
const ROUND_POINTS: Record<string, number> = {
  R64: 1, R32: 2, 'Sweet 16': 4, 'Elite 8': 8, 'Final Four': 16, Championship: 32,
};

function computeExpectedScore(bracket: BracketState): number {
  let total = 0;
  for (const m of Object.values(bracket.matchups)) {
    if (!m.winnerId || m.winProbA === null) continue;
    const prob = m.winnerId === m.teamAId ? m.winProbA : 1 - m.winProbA;
    total += prob * (ROUND_POINTS[m.round] || 0);
  }
  return total;
}

export default function MultiBracketView({ brackets, teams, archetypes }: MultiBracketViewProps) {
  const [activeTab, setActiveTab] = useState(0);

  // Compute expected scores
  const scores = useMemo(() => brackets.map(computeExpectedScore), [brackets]);

  // Find differences between brackets (matchups where winners differ)
  const differences = useMemo(() => {
    if (brackets.length < 2) return new Set<string>();
    const diffs = new Set<string>();
    const base = brackets[0];
    for (let i = 1; i < brackets.length; i++) {
      for (const [id, matchup] of Object.entries(base.matchups)) {
        const other = brackets[i].matchups[id];
        if (other && matchup.winnerId !== other.winnerId) {
          diffs.add(id);
        }
      }
    }
    return diffs;
  }, [brackets]);

  // Identify "leverage games" - games that differ and are in later rounds (high point value)
  const leverageGames = useMemo(() => {
    return [...differences]
      .map((id) => {
        const m = brackets[0]?.matchups[id];
        return m ? { id, round: m.round, points: ROUND_POINTS[m.round] || 0 } : null;
      })
      .filter((g): g is NonNullable<typeof g> => g !== null)
      .sort((a, b) => b.points - a.points);
  }, [differences, brackets]);

  if (brackets.length === 0) {
    return (
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-8 text-center">
        <p className="text-sm text-gray-400">No brackets generated yet. Configure your pool settings and generate brackets.</p>
      </div>
    );
  }

  const activeBracket = brackets[activeTab];
  const activeArchetype = archetypes[activeTab] || 'chalk';
  const archetypeInfo = ARCHETYPE_LABELS[activeArchetype];

  return (
    <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
      {/* Tabs */}
      <div className="flex border-b border-gray-100">
        {brackets.map((_, i) => {
          const arch = archetypes[i] || 'chalk';
          const info = ARCHETYPE_LABELS[arch];
          const isActive = i === activeTab;
          return (
            <button
              key={i}
              onClick={() => setActiveTab(i)}
              className={`
                flex-1 px-4 py-3 text-center transition-colors border-b-2
                ${isActive ? 'border-current bg-gray-50' : 'border-transparent hover:bg-gray-50'}
              `}
              style={{ color: isActive ? info.color : '#9ca3af' }}
            >
              <span className="text-xs font-bold block">{info.label}</span>
              <span className="text-[10px] text-gray-400 block mt-0.5 tabular-nums">
                {scores[i].toFixed(1)} pts expected
              </span>
            </button>
          );
        })}
      </div>

      {/* Summary bar */}
      <div className="px-5 py-3 bg-gray-50 border-b border-gray-100 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div
            className="w-3 h-3 rounded-full"
            style={{ backgroundColor: archetypeInfo.color }}
          />
          <span className="text-sm font-bold text-gray-900">{archetypeInfo.label} Bracket</span>
        </div>
        <div className="flex items-center gap-4">
          <div className="text-right">
            <span className="text-[10px] text-gray-400 block">Expected Score</span>
            <span className="text-sm font-bold tabular-nums" style={{ color: archetypeInfo.color }}>
              {scores[activeTab].toFixed(1)}
            </span>
          </div>
          <div className="text-right">
            <span className="text-[10px] text-gray-400 block">Differences</span>
            <span className="text-sm font-bold tabular-nums text-gray-700">
              {differences.size} games
            </span>
          </div>
        </div>
      </div>

      {/* Bracket picks by round */}
      <div className="px-5 py-4">
        <div className="space-y-4">
          {ROUND_ORDER.map((round) => {
            const roundMatchups = Object.values(activeBracket.matchups)
              .filter((m) => m.round === round)
              .sort((a, b) => a.position - b.position);

            if (roundMatchups.length === 0) return null;

            return (
              <div key={round}>
                <div className="flex items-center gap-2 mb-2">
                  <h4 className="text-xs font-semibold text-gray-500 uppercase tracking-wider">
                    {round}
                  </h4>
                  <span className="text-[10px] text-gray-400">
                    ({roundMatchups.length} games &middot; {ROUND_POINTS[round]} pts each)
                  </span>
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-8 gap-1.5">
                  {roundMatchups.map((m) => {
                    const isDiff = differences.has(m.id);
                    const isLeverage = leverageGames.some((g) => g.id === m.id);
                    const winner = m.winnerId ? teams[m.winnerId] : null;
                    const teamA = m.teamAId ? teams[m.teamAId] : null;
                    const teamB = m.teamBId ? teams[m.teamBId] : null;

                    return (
                      <div
                        key={m.id}
                        className={`
                          px-2.5 py-2 rounded-lg border text-center transition-all
                          ${isLeverage ? 'border-orange-300 bg-orange-50' : isDiff ? 'border-blue-200 bg-blue-50' : 'border-gray-200'}
                        `}
                      >
                        {/* Teams */}
                        <div className="text-[10px] text-gray-400 mb-0.5">
                          {teamA ? `(${teamA.seed}) ${teamA.name}` : 'TBD'}
                        </div>
                        <div className="text-[10px] text-gray-400 mb-1">
                          vs {teamB ? `(${teamB.seed}) ${teamB.name}` : 'TBD'}
                        </div>

                        {/* Winner */}
                        {winner ? (
                          <div className="flex items-center justify-center gap-1">
                            <span
                              className="text-xs font-bold truncate"
                              style={{ color: m.isUpset ? '#FF6B00' : '#00274C' }}
                            >
                              {winner.name}
                            </span>
                            {m.isUpset && <span className="text-[10px]">🔥</span>}
                            {m.locked && <span className="text-[10px]">🔒</span>}
                          </div>
                        ) : (
                          <span className="text-xs text-gray-300 italic">No pick</span>
                        )}

                        {/* Badges */}
                        <div className="flex items-center justify-center gap-1 mt-1">
                          {isLeverage && (
                            <span className="text-[8px] px-1.5 py-0.5 bg-orange-100 text-orange-700 rounded-full font-bold">
                              LEVERAGE
                            </span>
                          )}
                          {isDiff && !isLeverage && (
                            <span className="text-[8px] px-1.5 py-0.5 bg-blue-100 text-blue-600 rounded-full font-medium">
                              DIFF
                            </span>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Leverage games summary */}
      {leverageGames.length > 0 && (
        <div className="px-5 py-4 border-t border-gray-100">
          <h4 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">
            Key Leverage Games
          </h4>
          <p className="text-[10px] text-gray-400 mb-3">
            Games where your brackets diverge most in high-value rounds.
          </p>
          <div className="space-y-1.5">
            {leverageGames.slice(0, 8).map((game) => {
              const m = activeBracket.matchups[game.id];
              if (!m) return null;
              const teamA = m.teamAId ? teams[m.teamAId] : null;
              const teamB = m.teamBId ? teams[m.teamBId] : null;

              // Show what each bracket picked
              const picks = brackets.map((b, i) => {
                const bm = b.matchups[game.id];
                const winner = bm?.winnerId ? teams[bm.winnerId] : null;
                return {
                  archetype: archetypes[i] || 'chalk',
                  winner: winner?.name || 'TBD',
                };
              });

              return (
                <div
                  key={game.id}
                  className="flex items-center gap-3 px-3 py-2 bg-orange-50 rounded-lg border border-orange-100"
                >
                  <div className="flex-1">
                    <span className="text-xs font-medium text-gray-700">
                      {teamA ? `(${teamA.seed}) ${teamA.name}` : 'TBD'} vs{' '}
                      {teamB ? `(${teamB.seed}) ${teamB.name}` : 'TBD'}
                    </span>
                    <span className="text-[10px] text-gray-400 ml-2">
                      {m.round} &middot; {game.points} pts
                    </span>
                  </div>
                  <div className="flex gap-2">
                    {picks.map((p, i) => (
                      <span
                        key={i}
                        className="text-[10px] px-2 py-0.5 rounded-full font-bold text-white"
                        style={{ backgroundColor: ARCHETYPE_LABELS[p.archetype as BracketArchetype]?.color || '#666' }}
                      >
                        {p.winner}
                      </span>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Score comparison */}
      <div className="px-5 py-4 border-t border-gray-100 bg-gray-50">
        <h4 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3">
          Expected Score Comparison
        </h4>
        <div className="flex gap-3">
          {brackets.map((_, i) => {
            const arch = archetypes[i] || 'chalk';
            const info = ARCHETYPE_LABELS[arch];
            const score = scores[i];
            const maxScore = Math.max(...scores);
            const pct = maxScore > 0 ? (score / maxScore) * 100 : 0;

            return (
              <div key={i} className="flex-1">
                <div className="flex items-center justify-between mb-1">
                  <span className="text-[10px] font-bold" style={{ color: info.color }}>
                    {info.label}
                  </span>
                  <span className="text-xs font-bold tabular-nums text-gray-700">
                    {score.toFixed(1)}
                  </span>
                </div>
                <div className="h-4 bg-gray-200 rounded-full overflow-hidden">
                  <div
                    className="h-full rounded-full transition-all duration-500"
                    style={{ width: `${pct}%`, backgroundColor: info.color }}
                  />
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
