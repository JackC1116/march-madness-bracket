import { useMemo } from 'react';
import type { BracketState, Team, Matchup, Region, Round } from '../types';

interface BracketViewProps {
  bracket: BracketState;
  teams: Record<string, Team>;
  onPickWinner: (matchupId: string, winnerId: string) => void;
  onSelectMatchup: (matchupId: string) => void;
  selectedMatchupId: string | null;
}

const ROUND_ORDER: Round[] = ['R64', 'R32', 'Sweet 16', 'Elite 8', 'Final Four', 'Championship'];

function getConfidenceColor(confidence: number): string {
  if (confidence > 0.75) return 'border-l-emerald-500';
  if (confidence > 0.5) return 'border-l-yellow-400';
  return 'border-l-red-400';
}

const UPSET_RATES: Record<string, number> = {
  '1v16': 1.3, '2v15': 6.2, '3v14': 15.1, '4v13': 21.3,
  '5v12': 35.6, '6v11': 37.2, '7v10': 39.5, '8v9': 48.1,
};

function getUpsetRate(winnerSeed: number, loserSeed: number): number | null {
  if (winnerSeed <= loserSeed) return null; // not an upset
  const high = Math.max(winnerSeed, loserSeed);
  const low = Math.min(winnerSeed, loserSeed);
  const key = `${low}v${high}`;
  return UPSET_RATES[key] ?? null;
}

function getSeedColorClasses(seed: number): string {
  if (seed <= 4) return 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200';
  if (seed <= 8) return 'bg-teal-100 text-teal-800 dark:bg-teal-900 dark:text-teal-200';
  if (seed <= 12) return 'bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-200';
  return 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200';
}

// ── Connector Group ──────────────────────────────────────────
// Wraps a pair of matchups and draws bracket lines to the next round.
// `direction` controls whether lines extend right (left-side regions) or left (right-side regions).
function ConnectorGroup({
  children,
  direction,
  matchupHeight,
  gap,
}: {
  children: React.ReactNode;
  direction: 'right' | 'left';
  matchupHeight: number;
  gap: number;
}) {
  // Total height of one matchup + gap between the pair
  const pairHeight = matchupHeight * 2 + gap;
  const lineLen = 8; // horizontal line length in px
  const midY = pairHeight / 2;
  const topY = matchupHeight / 2;
  const botY = pairHeight - matchupHeight / 2;

  const isRight = direction === 'right';

  return (
    <div className="relative" style={{ height: `${pairHeight}px` }}>
      {children}
      {/* SVG connector lines */}
      <svg
        className="absolute top-0 pointer-events-none"
        style={{
          [isRight ? 'right' : 'left']: `-${lineLen + 4}px`,
          width: `${lineLen + 4}px`,
          height: `${pairHeight}px`,
        }}
      >
        {/* Top horizontal line */}
        <line
          x1={isRight ? 0 : lineLen + 4}
          y1={topY}
          x2={isRight ? lineLen : 4}
          y2={topY}
          stroke="#cbd5e1"
          strokeWidth="1.5"
        />
        {/* Bottom horizontal line */}
        <line
          x1={isRight ? 0 : lineLen + 4}
          y1={botY}
          x2={isRight ? lineLen : 4}
          y2={botY}
          stroke="#cbd5e1"
          strokeWidth="1.5"
        />
        {/* Vertical line connecting top and bottom */}
        <line
          x1={isRight ? lineLen : 4}
          y1={topY}
          x2={isRight ? lineLen : 4}
          y2={botY}
          stroke="#cbd5e1"
          strokeWidth="1.5"
        />
        {/* Horizontal line from junction to next round */}
        <line
          x1={isRight ? lineLen : 4}
          y1={midY}
          x2={isRight ? lineLen + 4 : 0}
          y2={midY}
          stroke="#cbd5e1"
          strokeWidth="1.5"
        />
      </svg>
    </div>
  );
}

// ── Team Row ───────────────────────────────────────────────
interface TeamRowProps {
  team: Team | null;
  winProb: number;
  isWinner: boolean;
  isLocked: boolean;
  isUpset: boolean;
  onClick?: (e: React.MouseEvent) => void;
}

function TeamRow({ team, winProb, isWinner, isLocked, isUpset, onClick }: TeamRowProps) {
  if (!team) {
    return (
      <div className="flex items-center gap-1 px-1.5 py-[3px] text-gray-300 dark:text-gray-500 h-[18px]">
        <span className="text-[9px] w-3 text-center">--</span>
        <span className="text-[10px] italic flex-1 truncate">TBD</span>
      </div>
    );
  }

  return (
    <div
      onClick={onClick}
      className={`
        flex items-center gap-1 px-1.5 py-[3px] transition-colors h-[18px]
        ${onClick ? 'cursor-pointer' : ''}
        ${isWinner ? 'bg-emerald-50 dark:bg-emerald-900/30 font-semibold' : onClick ? 'hover:bg-gray-50 dark:hover:bg-gray-700' : ''}
      `}
    >
      <span className={`text-[9px] w-3.5 text-center font-bold rounded-sm px-0.5 ${getSeedColorClasses(team.seed)}`}>
        {team.seed}
      </span>
      <span className={`text-[10px] flex-1 truncate ${isWinner ? 'text-gray-900 dark:text-gray-100' : 'text-gray-600 dark:text-gray-300'}`}>
        {team.name}
      </span>
      {isWinner && (
        <span className="text-emerald-600 dark:text-emerald-400 text-[10px] leading-none">&#10003;</span>
      )}
      <span className="text-[8px] text-gray-400 dark:text-gray-400 tabular-nums w-5 text-right">
        {(winProb * 100).toFixed(0)}%
      </span>
      {isLocked && <span className="text-[8px]">🔒</span>}
      {isUpset && <span className="text-[8px]">🔥</span>}
    </div>
  );
}

// ── Matchup Slot ───────────────────────────────────────────
interface MatchupSlotProps {
  matchup: Matchup;
  teams: Record<string, Team>;
  isSelected: boolean;
  onPickWinner: (matchupId: string, winnerId: string) => void;
  onSelectMatchup: (matchupId: string) => void;
}

function MatchupSlot({ matchup, teams, isSelected, onPickWinner: _onPickWinner, onSelectMatchup }: MatchupSlotProps) {
  const teamA = matchup.teamAId ? teams[matchup.teamAId] : null;
  const teamB = matchup.teamBId ? teams[matchup.teamBId] : null;
  const winProbA = matchup.winProbA ?? 0.5;
  const winProbB = 1 - winProbA;

  // Compute upset rate badge
  let upsetBadge: { rate: number; winnerSeed: number } | null = null;
  if (matchup.winnerId && teamA && teamB) {
    const winner = matchup.winnerId === teamA.id ? teamA : teamB;
    const loser = matchup.winnerId === teamA.id ? teamB : teamA;
    const rate = getUpsetRate(winner.seed, loser.seed);
    if (rate !== null) {
      upsetBadge = { rate, winnerSeed: winner.seed };
    }
  }

  return (
    <div className="flex flex-col items-center">
      <div
        onClick={() => onSelectMatchup(matchup.id)}
        className={`
          rounded border-l-[3px] cursor-pointer transition-all bg-white dark:bg-gray-700 shadow-xs dark:shadow-gray-900/50 dark:border dark:border-gray-600
          ${isSelected ? 'ring-2 ring-blue-400 shadow-md' : 'hover:shadow'}
          ${matchup.winnerId ? getConfidenceColor(matchup.confidence) : 'border-l-gray-300 dark:border-l-gray-600'}
          w-[122px]
        `}
      >
        <TeamRow
          team={teamA}
          winProb={winProbA}
          isWinner={matchup.winnerId === matchup.teamAId}
          isLocked={matchup.locked}
          isUpset={matchup.isUpset && matchup.winnerId === matchup.teamAId}
        />
        <div className="border-t border-gray-100 dark:border-gray-700" />
        <TeamRow
          team={teamB}
          winProb={winProbB}
          isWinner={matchup.winnerId === matchup.teamBId}
          isLocked={matchup.locked}
          isUpset={matchup.isUpset && matchup.winnerId === matchup.teamBId}
        />
      </div>
      {upsetBadge && (
        <div className="mt-0.5 px-1.5 py-0.5 rounded text-[8px] font-semibold bg-orange-100 text-orange-700 dark:bg-orange-900/50 dark:text-orange-300 whitespace-nowrap">
          🔥 {upsetBadge.winnerSeed}-seeds win {upsetBadge.rate}% of the time
        </div>
      )}
    </div>
  );
}

// ── Region Column ──────────────────────────────────────────
function RegionColumn({
  matchups,
  round,
  teams,
  selectedMatchupId,
  onPickWinner,
  onSelectMatchup,
  direction = 'right',
  isLastRound = false,
}: {
  matchups: Matchup[];
  round: Round;
  teams: Record<string, Team>;
  selectedMatchupId: string | null;
  onPickWinner: (matchupId: string, winnerId: string) => void;
  onSelectMatchup: (matchupId: string) => void;
  direction?: 'right' | 'left';
  isLastRound?: boolean;
}) {
  const sorted = [...matchups].sort((a, b) => a.position - b.position);
  const roundIndex = ROUND_ORDER.indexOf(round);
  // Exponential gap growth so matchups align vertically with their feeders
  const gap = roundIndex <= 0 ? 1 : roundIndex === 1 ? 18 : roundIndex === 2 ? 54 : 126;
  const matchupHeight = 39; // approximate height of a MatchupSlot (two 18px rows + 3px border)

  // Group matchups in pairs for connector lines (except last round in region)
  const shouldConnect = !isLastRound && sorted.length >= 2;

  if (shouldConnect) {
    const pairs: Matchup[][] = [];
    for (let i = 0; i < sorted.length; i += 2) {
      pairs.push(sorted.slice(i, i + 2));
    }
    // Gap between pairs: each pair occupies matchupHeight*2+gap for inner, then
    // we need additional spacing between groups to align with next round
    const pairInnerGap = gap;
    const pairOuterGap = roundIndex <= 0 ? gap + matchupHeight + 2 : gap * 2 + matchupHeight;

    return (
      <div className="flex flex-col items-center justify-center" style={{ gap: `${pairOuterGap}px` }}>
        {pairs.map((pair, pi) => (
          <ConnectorGroup
            key={pi}
            direction={direction}
            matchupHeight={matchupHeight}
            gap={pairInnerGap}
          >
            <div className="flex flex-col items-center justify-center" style={{ gap: `${pairInnerGap}px` }}>
              {pair.map((m) => (
                <MatchupSlot
                  key={m.id}
                  matchup={m}
                  teams={teams}
                  isSelected={selectedMatchupId === m.id}
                  onPickWinner={onPickWinner}
                  onSelectMatchup={onSelectMatchup}
                />
              ))}
            </div>
          </ConnectorGroup>
        ))}
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center justify-center" style={{ gap: `${gap}px` }}>
      {sorted.map((m) => (
        <MatchupSlot
          key={m.id}
          matchup={m}
          teams={teams}
          isSelected={selectedMatchupId === m.id}
          onPickWinner={onPickWinner}
          onSelectMatchup={onSelectMatchup}
        />
      ))}
    </div>
  );
}

// ── Region Pair ────────────────────────────────────────────
function RegionPair({
  leftRegion,
  rightRegion,
  grouped,
  regionalRounds,
  finalFourMatchups,
  teams,
  selectedMatchupId,
  onPickWinner,
  onSelectMatchup,
}: {
  leftRegion: Region;
  rightRegion: Region;
  grouped: Record<string, Record<string, Matchup[]>>;
  regionalRounds: Round[];
  finalFourMatchups: Matchup[];
  teams: Record<string, Team>;
  selectedMatchupId: string | null;
  onPickWinner: (matchupId: string, winnerId: string) => void;
  onSelectMatchup: (matchupId: string) => void;
}) {
  const leftData = grouped[leftRegion] || {};
  const rightData = grouped[rightRegion] || {};

  return (
    <div className="flex items-center justify-center gap-0 my-1">
      {/* Left region label */}
      <div className="w-14 flex-shrink-0 text-right pr-1">
        <span className="text-[10px] font-bold uppercase tracking-wider" style={{ color: '#00274C' }}>
          {leftRegion}
        </span>
      </div>

      {/* Left region rounds: R64 -> E8 */}
      <div className="flex items-center gap-3">
        {regionalRounds.map((round, idx) => (
          <RegionColumn
            key={`${leftRegion}-${round}`}
            matchups={leftData[round] || []}
            round={round}
            teams={teams}
            selectedMatchupId={selectedMatchupId}
            onPickWinner={onPickWinner}
            onSelectMatchup={onSelectMatchup}
            direction="right"
            isLastRound={idx === regionalRounds.length - 1}
          />
        ))}
      </div>

      {/* Final Four game */}
      <div className="flex flex-col items-center mx-2 flex-shrink-0">
        <span className="text-[9px] font-semibold text-gray-400 dark:text-gray-500 uppercase mb-0.5">FF</span>
        {finalFourMatchups.map((m) => (
          <MatchupSlot
            key={m.id}
            matchup={m}
            teams={teams}
            isSelected={selectedMatchupId === m.id}
            onPickWinner={onPickWinner}
            onSelectMatchup={onSelectMatchup}
          />
        ))}
        {finalFourMatchups.length === 0 && (
          <div className="w-[122px] h-12 border-2 border-dashed border-gray-200 dark:border-gray-700 rounded flex items-center justify-center text-[10px] text-gray-300 dark:text-gray-600">
            Final Four
          </div>
        )}
      </div>

      {/* Right region rounds: E8 -> R64 */}
      <div className="flex items-center gap-3">
        {[...regionalRounds].reverse().map((round, idx) => (
          <RegionColumn
            key={`${rightRegion}-${round}`}
            matchups={rightData[round] || []}
            round={round}
            teams={teams}
            selectedMatchupId={selectedMatchupId}
            onPickWinner={onPickWinner}
            onSelectMatchup={onSelectMatchup}
            direction="left"
            isLastRound={idx === 0}
          />
        ))}
      </div>

      {/* Right region label */}
      <div className="w-14 flex-shrink-0 text-left pl-1">
        <span className="text-[10px] font-bold uppercase tracking-wider" style={{ color: '#00274C' }}>
          {rightRegion}
        </span>
      </div>
    </div>
  );
}

// ── Main Bracket View ──────────────────────────────────────
export default function BracketView({
  bracket,
  teams,
  onPickWinner,
  onSelectMatchup,
  selectedMatchupId,
}: BracketViewProps) {
  const allMatchups = Object.values(bracket.matchups);

  const grouped = useMemo(() => {
    const map: Record<string, Record<string, Matchup[]>> = {};
    for (const m of allMatchups) {
      const regionKey = m.region;
      if (!map[regionKey]) map[regionKey] = {};
      if (!map[regionKey][m.round]) map[regionKey][m.round] = [];
      map[regionKey][m.round].push(m);
    }
    return map;
  }, [allMatchups]);

  const regionalRounds: Round[] = ['R64', 'R32', 'Sweet 16', 'Elite 8'];

  const finalFourMatchups = grouped['Final Four'] || {};
  const ffGames = finalFourMatchups['Final Four'] || [];
  const champGames = finalFourMatchups['Championship'] || [];

  // Collect First Four games from all regions
  const firstFourGames = allMatchups.filter((m) => m.round === 'First Four');

  return (
    <div className="w-full">
      <div className="inline-block min-w-max px-2 py-1">
        {/* First Four */}
        {firstFourGames.length > 0 && (
          <div className="mb-2 pb-1 border-b border-dashed border-gray-200 dark:border-gray-700">
            <div className="text-[8px] font-bold uppercase tracking-wider text-center mb-1" style={{ color: '#FF6B00' }}>
              First Four — Dayton, OH
            </div>
            <div className="flex items-center justify-center gap-2">
              {firstFourGames.sort((a, b) => a.position - b.position).map((m) => (
                <div key={m.id} className="flex flex-col items-center">
                  <span className="text-[8px] text-gray-400 dark:text-gray-500 uppercase mb-0.5">
                    {m.region}
                  </span>
                  <MatchupSlot
                    matchup={m}
                    teams={teams}
                    isSelected={selectedMatchupId === m.id}
                    onPickWinner={onPickWinner}
                    onSelectMatchup={onSelectMatchup}
                  />
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Round labels header */}
        <div className="flex items-center justify-center mb-2">
          <div className="w-14 flex-shrink-0" />
          <div className="flex items-center gap-3">
            {regionalRounds.map((r) => (
              <div key={`l-${r}`} className="w-[122px] text-center text-[9px] font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wider">
                {r}
              </div>
            ))}
          </div>
          <div className="mx-2 w-[122px] text-center text-[9px] font-semibold uppercase tracking-wider" style={{ color: '#FF6B00' }}>
            Final Four
          </div>
          <div className="flex items-center gap-3">
            {[...regionalRounds].reverse().map((r) => (
              <div key={`r-${r}`} className="w-[122px] text-center text-[9px] font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wider">
                {r}
              </div>
            ))}
          </div>
          <div className="w-14 flex-shrink-0" />
        </div>

        {/* East vs West */}
        <RegionPair
          leftRegion="East"
          rightRegion="West"
          grouped={grouped}
          regionalRounds={regionalRounds}
          finalFourMatchups={ffGames.filter((_, i) => i === 0)}
          teams={teams}
          selectedMatchupId={selectedMatchupId}
          onPickWinner={onPickWinner}
          onSelectMatchup={onSelectMatchup}
        />

        {/* Championship */}
        <div className="flex justify-center my-2">
          <div className="flex flex-col items-center gap-1.5">
            <div
              className="text-[10px] font-bold uppercase tracking-widest px-3 py-0.5 rounded-full text-white"
              style={{ backgroundColor: '#00274C' }}
            >
              Champion
            </div>
            {champGames.map((m) => (
              <MatchupSlot
                key={m.id}
                matchup={m}
                teams={teams}
                isSelected={selectedMatchupId === m.id}
                onPickWinner={onPickWinner}
                onSelectMatchup={onSelectMatchup}
              />
            ))}
            {champGames.length > 0 && champGames[0].winnerId && teams[champGames[0].winnerId] && (
              <div
                className="mt-1 px-4 py-2 rounded-lg text-white text-center font-bold text-sm shadow-lg"
                style={{ backgroundColor: '#00274C' }}
              >
                🏆 {teams[champGames[0].winnerId].name}
              </div>
            )}
          </div>
        </div>

        {/* South vs Midwest */}
        <RegionPair
          leftRegion="South"
          rightRegion="Midwest"
          grouped={grouped}
          regionalRounds={regionalRounds}
          finalFourMatchups={ffGames.filter((_, i) => i === 1)}
          teams={teams}
          selectedMatchupId={selectedMatchupId}
          onPickWinner={onPickWinner}
          onSelectMatchup={onSelectMatchup}
        />
      </div>
    </div>
  );
}
