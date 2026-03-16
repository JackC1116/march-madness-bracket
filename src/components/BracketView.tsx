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
  if (confidence > 0.75) return 'border-emerald-500';
  if (confidence > 0.5) return 'border-yellow-400';
  return 'border-red-400';
}

interface MatchupSlotProps {
  matchup: Matchup;
  teams: Record<string, Team>;
  isSelected: boolean;
  onPickWinner: (matchupId: string, winnerId: string) => void;
  onSelectMatchup: (matchupId: string) => void;
  compact?: boolean;
}

function MatchupSlot({ matchup, teams, isSelected, onPickWinner, onSelectMatchup, compact }: MatchupSlotProps) {
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
        rounded border-l-4 cursor-pointer transition-all
        ${isSelected ? 'ring-2 ring-blue-400 shadow-md' : 'hover:shadow-sm'}
        ${matchup.winnerId ? getConfidenceColor(matchup.confidence) : 'border-gray-300'}
        ${compact ? 'w-36' : 'w-48'}
        bg-white
      `}
    >
      {/* Team A */}
      <TeamRow
        team={teamA}
        winProb={winProbA}
        isWinner={matchup.winnerId === matchup.teamAId}
        isLocked={matchup.locked}
        isUpset={matchup.isUpset && matchup.winnerId === matchup.teamAId}
        compact={compact}
        onClick={teamA ? (e) => handlePick(e, teamA.id) : undefined}
      />
      <div className="border-t border-gray-100" />
      {/* Team B */}
      <TeamRow
        team={teamB}
        winProb={winProbB}
        isWinner={matchup.winnerId === matchup.teamBId}
        isLocked={matchup.locked}
        isUpset={matchup.isUpset && matchup.winnerId === matchup.teamBId}
        compact={compact}
        onClick={teamB ? (e) => handlePick(e, teamB.id) : undefined}
      />
    </div>
  );
}

interface TeamRowProps {
  team: Team | null;
  winProb: number;
  isWinner: boolean;
  isLocked: boolean;
  isUpset: boolean;
  compact?: boolean;
  onClick?: (e: React.MouseEvent) => void;
}

function TeamRow({ team, winProb, isWinner, isLocked, isUpset, compact, onClick }: TeamRowProps) {
  if (!team) {
    return (
      <div className={`flex items-center gap-1.5 ${compact ? 'px-1.5 py-1' : 'px-2 py-1.5'} text-gray-300`}>
        <span className="text-[10px] w-4 text-center">--</span>
        <span className="text-xs italic flex-1 truncate">TBD</span>
      </div>
    );
  }

  return (
    <div
      onClick={onClick}
      className={`
        flex items-center gap-1.5 ${compact ? 'px-1.5 py-1' : 'px-2 py-1.5'} transition-colors
        ${isWinner ? 'bg-blue-50 font-semibold' : 'hover:bg-gray-50'}
      `}
    >
      <span
        className="text-[10px] w-4 text-center font-bold rounded-sm leading-none py-0.5"
        style={{ color: '#00274C' }}
      >
        {team.seed}
      </span>
      <span className={`text-xs flex-1 truncate ${isWinner ? 'text-gray-900' : 'text-gray-600'}`}>
        {team.name}
      </span>
      <span className="text-[10px] text-gray-400 tabular-nums w-8 text-right">
        {(winProb * 100).toFixed(0)}%
      </span>
      {isLocked && <span className="text-[10px]" title="Locked pick">🔒</span>}
      {isUpset && <span className="text-[10px]" title="Upset pick">🔥</span>}
    </div>
  );
}

function RegionColumn({
  matchups,
  round,
  teams,
  selectedMatchupId,
  onPickWinner,
  onSelectMatchup,
  compact,
}: {
  matchups: Matchup[];
  round: Round;
  teams: Record<string, Team>;
  selectedMatchupId: string | null;
  onPickWinner: (matchupId: string, winnerId: string) => void;
  onSelectMatchup: (matchupId: string) => void;
  compact?: boolean;
}) {
  const sorted = [...matchups].sort((a, b) => a.position - b.position);

  // Gap grows as rounds progress to visually align matchups
  const roundIndex = ROUND_ORDER.indexOf(round);
  const gap = roundIndex <= 0 ? 4 : roundIndex === 1 ? 16 : roundIndex === 2 ? 40 : 88;

  return (
    <div className="flex flex-col items-center" style={{ gap: `${gap}px` }}>
      {sorted.map((m) => (
        <MatchupSlot
          key={m.id}
          matchup={m}
          teams={teams}
          isSelected={selectedMatchupId === m.id}
          onPickWinner={onPickWinner}
          onSelectMatchup={onSelectMatchup}
          compact={compact}
        />
      ))}
    </div>
  );
}

export default function BracketView({
  bracket,
  teams,
  onPickWinner,
  onSelectMatchup,
  selectedMatchupId,
}: BracketViewProps) {
  const allMatchups = Object.values(bracket.matchups);

  // Group matchups by region and round
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

  // Regional rounds: R64 -> R32 -> S16 -> E8
  const regionalRounds: Round[] = ['R64', 'R32', 'Sweet 16', 'Elite 8'];

  const finalFourMatchups = grouped['Final Four'] || {};
  const ffGames = finalFourMatchups['Final Four'] || [];
  const champGames = finalFourMatchups['Championship'] || [];

  return (
    <div className="w-full overflow-x-auto">
      <div className="min-w-[1200px] p-4">
        {/* Round labels */}
        <div className="flex justify-center mb-3">
          <div className="flex items-center gap-0">
            {[...regionalRounds].map((r) => (
              <div key={`l-${r}`} className="w-48 text-center text-[10px] font-semibold text-gray-400 uppercase tracking-wider">
                {r}
              </div>
            ))}
            <div className="w-48 text-center text-[10px] font-semibold uppercase tracking-wider" style={{ color: '#FF6B00' }}>
              Final Four
            </div>
            <div className="w-48 text-center text-[10px] font-semibold uppercase tracking-wider" style={{ color: '#FF6B00' }}>
              Championship
            </div>
            <div className="w-48 text-center text-[10px] font-semibold uppercase tracking-wider" style={{ color: '#FF6B00' }}>
              Final Four
            </div>
            {[...regionalRounds].reverse().map((r) => (
              <div key={`r-${r}`} className="w-48 text-center text-[10px] font-semibold text-gray-400 uppercase tracking-wider">
                {r}
              </div>
            ))}
          </div>
        </div>

        {/* Top half: East (left side) + South (right side) */}
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

        {/* Championship in center */}
        <div className="flex justify-center my-6">
          <div className="flex flex-col items-center gap-2">
            <div
              className="text-xs font-bold uppercase tracking-widest px-4 py-1 rounded-full text-white"
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
            {/* Winner display */}
            {champGames.length > 0 && champGames[0].winnerId && teams[champGames[0].winnerId] && (
              <div
                className="mt-2 px-6 py-3 rounded-lg text-white text-center font-bold text-lg shadow-lg"
                style={{ backgroundColor: '#00274C' }}
              >
                🏆 {teams[champGames[0].winnerId].name}
              </div>
            )}
          </div>
        </div>

        {/* Bottom half: South (left side) + Midwest (right side) */}
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

interface RegionPairProps {
  leftRegion: Region;
  rightRegion: Region;
  grouped: Record<string, Record<string, Matchup[]>>;
  regionalRounds: Round[];
  finalFourMatchups: Matchup[];
  teams: Record<string, Team>;
  selectedMatchupId: string | null;
  onPickWinner: (matchupId: string, winnerId: string) => void;
  onSelectMatchup: (matchupId: string) => void;
}

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
}: RegionPairProps) {
  const leftData = grouped[leftRegion] || {};
  const rightData = grouped[rightRegion] || {};

  return (
    <div className="flex items-center justify-center gap-0 my-4">
      {/* Left region: rounds flow left to right (R64 -> E8) */}
      <div className="flex items-center gap-2">
        <div className="w-16 text-right">
          <span
            className="text-xs font-bold uppercase tracking-wider writing-mode-vertical"
            style={{ color: '#00274C' }}
          >
            {leftRegion}
          </span>
        </div>
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

      {/* Final Four game for this pair */}
      <div className="flex flex-col items-center mx-4">
        <span className="text-[10px] font-semibold text-gray-400 uppercase mb-1">FF</span>
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
          <div className="w-48 h-14 border-2 border-dashed border-gray-200 rounded flex items-center justify-center text-xs text-gray-300">
            Final Four
          </div>
        )}
      </div>

      {/* Right region: rounds flow right to left (E8 -> R64) */}
      <div className="flex items-center gap-2">
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
        <div className="w-16 text-left">
          <span
            className="text-xs font-bold uppercase tracking-wider"
            style={{ color: '#00274C' }}
          >
            {rightRegion}
          </span>
        </div>
      </div>
    </div>
  );
}
