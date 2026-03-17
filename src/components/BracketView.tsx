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
      <div className="flex items-center gap-1 px-1.5 py-[3px] text-gray-300 h-[22px]">
        <span className="text-[9px] w-3 text-center">--</span>
        <span className="text-[10px] italic flex-1 truncate">TBD</span>
      </div>
    );
  }

  return (
    <div
      onClick={onClick}
      className={`
        flex items-center gap-1 px-1.5 py-[3px] transition-colors cursor-pointer h-[22px]
        ${isWinner ? 'bg-blue-50 font-semibold' : 'hover:bg-gray-50'}
      `}
    >
      <span className="text-[9px] w-3 text-center font-bold" style={{ color: '#00274C' }}>
        {team.seed}
      </span>
      <span className={`text-[10px] flex-1 truncate ${isWinner ? 'text-gray-900' : 'text-gray-600'}`}>
        {team.name}
      </span>
      <span className="text-[9px] text-gray-400 tabular-nums w-6 text-right">
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

function MatchupSlot({ matchup, teams, isSelected, onPickWinner, onSelectMatchup }: MatchupSlotProps) {
  const teamA = matchup.teamAId ? teams[matchup.teamAId] : null;
  const teamB = matchup.teamBId ? teams[matchup.teamBId] : null;
  const winProbA = matchup.winProbA ?? 0.5;
  const winProbB = 1 - winProbA;

  const handlePick = (e: React.MouseEvent, teamId: string) => {
    e.stopPropagation();
    onPickWinner(matchup.id, teamId);
  };

  return (
    <div
      onClick={() => onSelectMatchup(matchup.id)}
      className={`
        rounded border-l-[3px] cursor-pointer transition-all bg-white shadow-xs
        ${isSelected ? 'ring-2 ring-blue-400 shadow-md' : 'hover:shadow'}
        ${matchup.winnerId ? getConfidenceColor(matchup.confidence) : 'border-l-gray-300'}
        w-[130px]
      `}
    >
      <TeamRow
        team={teamA}
        winProb={winProbA}
        isWinner={matchup.winnerId === matchup.teamAId}
        isLocked={matchup.locked}
        isUpset={matchup.isUpset && matchup.winnerId === matchup.teamAId}
        onClick={teamA ? (e) => handlePick(e, teamA.id) : undefined}
      />
      <div className="border-t border-gray-100" />
      <TeamRow
        team={teamB}
        winProb={winProbB}
        isWinner={matchup.winnerId === matchup.teamBId}
        isLocked={matchup.locked}
        isUpset={matchup.isUpset && matchup.winnerId === matchup.teamBId}
        onClick={teamB ? (e) => handlePick(e, teamB.id) : undefined}
      />
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
}: {
  matchups: Matchup[];
  round: Round;
  teams: Record<string, Team>;
  selectedMatchupId: string | null;
  onPickWinner: (matchupId: string, winnerId: string) => void;
  onSelectMatchup: (matchupId: string) => void;
}) {
  const sorted = [...matchups].sort((a, b) => a.position - b.position);
  const roundIndex = ROUND_ORDER.indexOf(round);
  // Exponential gap growth so matchups align vertically with their feeders
  const gap = roundIndex <= 0 ? 2 : roundIndex === 1 ? 26 : roundIndex === 2 ? 74 : 170;

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
    <div className="flex items-center justify-center gap-0 my-2">
      {/* Left region label */}
      <div className="w-14 flex-shrink-0 text-right pr-1">
        <span className="text-[10px] font-bold uppercase tracking-wider" style={{ color: '#00274C' }}>
          {leftRegion}
        </span>
      </div>

      {/* Left region rounds: R64 -> E8 */}
      <div className="flex items-center gap-1">
        {regionalRounds.map((round) => (
          <RegionColumn
            key={`${leftRegion}-${round}`}
            matchups={leftData[round] || []}
            round={round}
            teams={teams}
            selectedMatchupId={selectedMatchupId}
            onPickWinner={onPickWinner}
            onSelectMatchup={onSelectMatchup}
          />
        ))}
      </div>

      {/* Final Four game */}
      <div className="flex flex-col items-center mx-2 flex-shrink-0">
        <span className="text-[9px] font-semibold text-gray-400 uppercase mb-0.5">FF</span>
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
          <div className="w-[130px] h-12 border-2 border-dashed border-gray-200 rounded flex items-center justify-center text-[10px] text-gray-300">
            Final Four
          </div>
        )}
      </div>

      {/* Right region rounds: E8 -> R64 */}
      <div className="flex items-center gap-1">
        {[...regionalRounds].reverse().map((round) => (
          <RegionColumn
            key={`${rightRegion}-${round}`}
            matchups={rightData[round] || []}
            round={round}
            teams={teams}
            selectedMatchupId={selectedMatchupId}
            onPickWinner={onPickWinner}
            onSelectMatchup={onSelectMatchup}
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
    <div className="w-full overflow-x-auto">
      <div className="inline-block min-w-max px-2 py-3">
        {/* First Four */}
        {firstFourGames.length > 0 && (
          <div className="mb-4 pb-3 border-b border-dashed border-gray-200">
            <div className="text-[10px] font-bold uppercase tracking-wider text-center mb-2" style={{ color: '#FF6B00' }}>
              First Four — Dayton, OH
            </div>
            <div className="flex items-center justify-center gap-3">
              {firstFourGames.sort((a, b) => a.position - b.position).map((m) => (
                <div key={m.id} className="flex flex-col items-center">
                  <span className="text-[8px] text-gray-400 uppercase mb-0.5">
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
          <div className="flex items-center gap-1">
            {regionalRounds.map((r) => (
              <div key={`l-${r}`} className="w-[130px] text-center text-[9px] font-semibold text-gray-400 uppercase tracking-wider">
                {r}
              </div>
            ))}
          </div>
          <div className="mx-2 w-[130px] text-center text-[9px] font-semibold uppercase tracking-wider" style={{ color: '#FF6B00' }}>
            Final Four
          </div>
          <div className="flex items-center gap-1">
            {[...regionalRounds].reverse().map((r) => (
              <div key={`r-${r}`} className="w-[130px] text-center text-[9px] font-semibold text-gray-400 uppercase tracking-wider">
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
        <div className="flex justify-center my-4">
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
