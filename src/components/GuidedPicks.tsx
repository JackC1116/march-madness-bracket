import { useMemo } from 'react';
import type { BracketState, Team, MatchupNarrative, Matchup, Round } from '../types';

interface GuidedPicksProps {
  bracket: BracketState;
  teams: Record<string, Team>;
  currentIndex: number;
  narratives: Record<string, MatchupNarrative>;
  onPick: (matchupId: string, winnerId: string) => void;
  onNext: () => void;
  onPrev: () => void;
  onAutoFill: () => void;
}

const ROUND_ORDER: Round[] = ['R64', 'R32', 'Sweet 16', 'Elite 8', 'Final Four', 'Championship'];

function getConfidenceLabel(confidence: number): { text: string; color: string } {
  if (confidence > 0.8) return { text: 'Very High', color: 'text-emerald-600' };
  if (confidence > 0.65) return { text: 'High', color: 'text-emerald-500' };
  if (confidence > 0.5) return { text: 'Moderate', color: 'text-yellow-600' };
  if (confidence > 0.35) return { text: 'Low', color: 'text-orange-500' };
  return { text: 'Toss-up', color: 'text-red-500' };
}

function MiniMatchup({
  matchup,
  teams,
  isCurrent,
}: {
  matchup: Matchup;
  teams: Record<string, Team>;
  isCurrent: boolean;
}) {
  const winner = matchup.winnerId ? teams[matchup.winnerId] : null;
  const teamA = matchup.teamAId ? teams[matchup.teamAId] : null;
  const teamB = matchup.teamBId ? teams[matchup.teamBId] : null;

  return (
    <div
      className={`
        px-1.5 py-1 rounded text-[8px] border transition-all
        ${isCurrent ? 'border-blue-400 bg-blue-50 dark:bg-blue-900/30 ring-1 ring-blue-200' : 'border-gray-100 dark:border-gray-600'}
        ${winner ? 'bg-gray-50 dark:bg-gray-700' : 'bg-white dark:bg-gray-800'}
      `}
    >
      <div className={`truncate ${winner && winner.id === matchup.teamAId ? 'font-bold dark:text-gray-100' : 'text-gray-400 dark:text-gray-500'}`}>
        {teamA ? `${teamA.seed} ${teamA.name}` : 'TBD'}
      </div>
      <div className={`truncate ${winner && winner.id === matchup.teamBId ? 'font-bold dark:text-gray-100' : 'text-gray-400 dark:text-gray-500'}`}>
        {teamB ? `${teamB.seed} ${teamB.name}` : 'TBD'}
      </div>
    </div>
  );
}

export default function GuidedPicks({
  bracket,
  teams,
  currentIndex,
  narratives,
  onPick,
  onNext,
  onPrev,
  onAutoFill,
}: GuidedPicksProps) {
  // Sort matchups in game order (by round, then region, then position)
  const orderedMatchups = useMemo(() => {
    return Object.values(bracket.matchups).sort((a, b) => {
      const roundDiff = ROUND_ORDER.indexOf(a.round as Round) - ROUND_ORDER.indexOf(b.round as Round);
      if (roundDiff !== 0) return roundDiff;
      if (a.region < b.region) return -1;
      if (a.region > b.region) return 1;
      return a.position - b.position;
    });
  }, [bracket.matchups]);

  const totalGames = orderedMatchups.length;
  const currentMatchup = orderedMatchups[currentIndex] || null;
  const completedCount = orderedMatchups.filter((m) => m.winnerId).length;
  const progress = totalGames > 0 ? (currentIndex + 1) / totalGames : 0;

  const teamA = currentMatchup?.teamAId ? teams[currentMatchup.teamAId] : null;
  const teamB = currentMatchup?.teamBId ? teams[currentMatchup.teamBId] : null;
  const narrative = currentMatchup ? narratives[currentMatchup.id] : undefined;
  const winProbA = currentMatchup?.winProbA ?? 0.5;
  const winProbB = 1 - winProbA;

  const confidenceA = getConfidenceLabel(winProbA);
  const confidenceB = getConfidenceLabel(winProbB);

  const remaining = totalGames - completedCount;

  return (
    <div className="flex gap-4">
      {/* Main content */}
      <div className="flex-1 max-w-2xl">
        {/* Progress bar */}
        <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 shadow-sm p-4 mb-4">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-semibold text-gray-500 dark:text-gray-400">
              Game {currentIndex + 1} of {totalGames}
            </span>
            <div className="flex items-center gap-3">
              <span className="text-xs text-gray-400">
                {completedCount} picked &middot; {remaining} remaining
              </span>
              {remaining > 0 && (
                <button
                  onClick={onAutoFill}
                  className="px-3 py-1 text-[10px] font-bold rounded-full text-white transition-colors hover:opacity-90"
                  style={{ backgroundColor: '#FF6B00' }}
                >
                  Auto-fill remaining
                </button>
              )}
            </div>
          </div>

          {/* Progress track */}
          <div className="h-2 bg-gray-100 dark:bg-gray-700 rounded-full overflow-hidden">
            <div
              className="h-full rounded-full transition-all duration-300"
              style={{ width: `${progress * 100}%`, backgroundColor: '#00274C' }}
            />
          </div>

          {/* Round indicators */}
          <div className="flex mt-2">
            {ROUND_ORDER.map((round) => {
              const roundMatchups = orderedMatchups.filter((m) => m.round === round);
              const firstIdx = orderedMatchups.indexOf(roundMatchups[0]);
              const lastIdx = orderedMatchups.indexOf(roundMatchups[roundMatchups.length - 1]);
              const isCurrent = currentIndex >= firstIdx && currentIndex <= lastIdx;
              const completed = roundMatchups.every((m) => m.winnerId);

              return (
                <div
                  key={round}
                  className="flex-1 text-center"
                >
                  <span
                    className={`text-[9px] font-medium ${
                      isCurrent
                        ? 'text-blue-600 font-bold'
                        : completed
                        ? 'text-emerald-500'
                        : 'text-gray-400'
                    }`}
                  >
                    {round === 'Sweet 16' ? 'S16' : round === 'Elite 8' ? 'E8' : round === 'Final Four' ? 'FF' : round === 'Championship' ? 'Champ' : round}
                  </span>
                </div>
              );
            })}
          </div>
        </div>

        {/* Current matchup card */}
        {currentMatchup && teamA && teamB ? (
          <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 shadow-sm overflow-hidden">
            {/* Round/region header */}
            <div className="px-5 py-3 text-white" style={{ backgroundColor: '#00274C' }}>
              <div className="flex items-center justify-between">
                <span className="text-xs font-medium uppercase tracking-wider text-blue-200">
                  {currentMatchup.region} &middot; {currentMatchup.round}
                </span>
                <span className="text-xs text-blue-300">Game #{currentMatchup.position + 1}</span>
              </div>
            </div>

            {/* Teams comparison */}
            <div className="flex">
              {/* Team A */}
              <button
                onClick={() => onPick(currentMatchup.id, teamA.id)}
                className={`flex-1 p-5 text-center transition-all border-r border-gray-100 dark:border-gray-700 hover:bg-blue-50 dark:hover:bg-blue-900/30 ${
                  currentMatchup.winnerId === teamA.id ? 'bg-blue-50 dark:bg-blue-900/30 ring-inset ring-2 ring-blue-300' : ''
                }`}
              >
                <div className="text-3xl font-black tabular-nums mb-1" style={{ color: '#00274C' }}>
                  {teamA.seed}
                </div>
                <div className="text-lg font-bold text-gray-900 dark:text-gray-100 mb-1">{teamA.name}</div>
                <div className="text-xs text-gray-400 dark:text-gray-500 mb-3">{teamA.conference}</div>

                {/* Key stats */}
                <div className="space-y-1.5 text-left max-w-[200px] mx-auto">
                  <div className="flex justify-between text-xs">
                    <span className="text-gray-400">KenPom</span>
                    <span className="font-bold text-gray-700 dark:text-gray-200">
                      #{teamA.kenpom.rank} ({teamA.kenpom.adjEM > 0 ? '+' : ''}{teamA.kenpom.adjEM.toFixed(1)})
                    </span>
                  </div>
                  <div className="flex justify-between text-xs">
                    <span className="text-gray-400">Barthag</span>
                    <span className="font-bold text-gray-700 dark:text-gray-200">{teamA.barttorvik.barthag.toFixed(4)}</span>
                  </div>
                  <div className="flex justify-between text-xs">
                    <span className="text-gray-400">NET</span>
                    <span className="font-bold text-gray-700 dark:text-gray-200">#{teamA.net.rank}</span>
                  </div>
                  <div className="flex justify-between text-xs">
                    <span className="text-gray-400">Q1 Record</span>
                    <span className="font-bold text-gray-700 dark:text-gray-200">{teamA.net.q1Record}</span>
                  </div>
                </div>

                {/* Win probability */}
                <div className="mt-4">
                  <div className="text-2xl font-black tabular-nums" style={{ color: '#00274C' }}>
                    {(winProbA * 100).toFixed(0)}%
                  </div>
                  <div className={`text-xs font-medium ${confidenceA.color}`}>
                    {confidenceA.text} confidence
                  </div>
                </div>

                {currentMatchup.winnerId === teamA.id && (
                  <div className="mt-3 inline-block px-4 py-1.5 rounded-full text-xs font-bold text-white" style={{ backgroundColor: '#00274C' }}>
                    YOUR PICK
                  </div>
                )}
              </button>

              {/* VS divider */}
              <div className="flex items-center -mx-4 z-10">
                <div className="w-8 h-8 rounded-full bg-gray-200 dark:bg-gray-600 flex items-center justify-center text-xs font-bold text-gray-500 dark:text-gray-400">
                  VS
                </div>
              </div>

              {/* Team B */}
              <button
                onClick={() => onPick(currentMatchup.id, teamB.id)}
                className={`flex-1 p-5 text-center transition-all border-l border-gray-100 dark:border-gray-700 hover:bg-orange-50 dark:hover:bg-orange-900/30 ${
                  currentMatchup.winnerId === teamB.id ? 'bg-orange-50 dark:bg-orange-900/30 ring-inset ring-2 ring-orange-300' : ''
                }`}
              >
                <div className="text-3xl font-black tabular-nums mb-1" style={{ color: '#FF6B00' }}>
                  {teamB.seed}
                </div>
                <div className="text-lg font-bold text-gray-900 dark:text-gray-100 mb-1">{teamB.name}</div>
                <div className="text-xs text-gray-400 dark:text-gray-500 mb-3">{teamB.conference}</div>

                <div className="space-y-1.5 text-left max-w-[200px] mx-auto">
                  <div className="flex justify-between text-xs">
                    <span className="text-gray-400">KenPom</span>
                    <span className="font-bold text-gray-700 dark:text-gray-200">
                      #{teamB.kenpom.rank} ({teamB.kenpom.adjEM > 0 ? '+' : ''}{teamB.kenpom.adjEM.toFixed(1)})
                    </span>
                  </div>
                  <div className="flex justify-between text-xs">
                    <span className="text-gray-400">Barthag</span>
                    <span className="font-bold text-gray-700 dark:text-gray-200">{teamB.barttorvik.barthag.toFixed(4)}</span>
                  </div>
                  <div className="flex justify-between text-xs">
                    <span className="text-gray-400">NET</span>
                    <span className="font-bold text-gray-700 dark:text-gray-200">#{teamB.net.rank}</span>
                  </div>
                  <div className="flex justify-between text-xs">
                    <span className="text-gray-400">Q1 Record</span>
                    <span className="font-bold text-gray-700 dark:text-gray-200">{teamB.net.q1Record}</span>
                  </div>
                </div>

                <div className="mt-4">
                  <div className="text-2xl font-black tabular-nums" style={{ color: '#FF6B00' }}>
                    {(winProbB * 100).toFixed(0)}%
                  </div>
                  <div className={`text-xs font-medium ${confidenceB.color}`}>
                    {confidenceB.text} confidence
                  </div>
                </div>

                {currentMatchup.winnerId === teamB.id && (
                  <div className="mt-3 inline-block px-4 py-1.5 rounded-full text-xs font-bold text-white" style={{ backgroundColor: '#FF6B00' }}>
                    YOUR PICK
                  </div>
                )}
              </button>
            </div>

            {/* Probability bar */}
            <div className="px-5 py-3 border-t border-gray-100 dark:border-gray-700">
              <div className="flex h-3 rounded-full overflow-hidden">
                <div
                  className="transition-all duration-300"
                  style={{ width: `${winProbA * 100}%`, backgroundColor: '#00274C' }}
                />
                <div
                  className="transition-all duration-300"
                  style={{ width: `${winProbB * 100}%`, backgroundColor: '#FF6B00' }}
                />
              </div>
            </div>

            {/* Narrative */}
            {narrative && (
              <div className="px-5 py-3 border-t border-gray-100 dark:border-gray-700 bg-gray-50 dark:bg-gray-700">
                <div className="flex items-start gap-2">
                  <div className="w-5 h-5 rounded-full flex items-center justify-center text-white text-[8px] font-bold shrink-0 mt-0.5" style={{ backgroundColor: '#00274C' }}>
                    AI
                  </div>
                  <div>
                    <p className="text-sm text-gray-600 dark:text-gray-300 leading-relaxed">{narrative.narrative}</p>
                    <div className="flex items-center gap-2 mt-2">
                      <span className="text-[10px] px-2 py-0.5 bg-white border border-gray-200 rounded-full text-gray-500">
                        Key: {narrative.keyFactor}
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* Navigation */}
            <div className="flex items-center justify-between px-5 py-3 border-t border-gray-100 dark:border-gray-700">
              <button
                onClick={onPrev}
                disabled={currentIndex === 0}
                className="flex items-center gap-1.5 px-3 py-2 text-xs font-medium text-gray-600 border border-gray-200 dark:border-gray-600 rounded-lg hover:bg-gray-50 dark:bg-gray-700 dark:hover:bg-gray-700 transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
              >
                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                </svg>
                Previous
              </button>

              <button
                onClick={onNext}
                className="flex items-center gap-1.5 px-3 py-2 text-xs font-medium border border-gray-200 dark:border-gray-600 rounded-lg hover:bg-gray-50 dark:bg-gray-700 dark:hover:bg-gray-700 transition-colors text-gray-500"
              >
                Skip
                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 5l7 7-7 7" />
                </svg>
              </button>

              <button
                onClick={onNext}
                disabled={!currentMatchup.winnerId}
                className="flex items-center gap-1.5 px-4 py-2 text-xs font-bold rounded-lg text-white transition-colors disabled:opacity-40"
                style={{ backgroundColor: '#00274C' }}
              >
                Next Game
                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                </svg>
              </button>
            </div>
          </div>
        ) : (
          <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 shadow-sm p-8 text-center">
            <p className="text-sm text-gray-400">
              {!currentMatchup
                ? 'All games have been reviewed!'
                : 'Waiting for teams to be determined from previous rounds.'}
            </p>
            {!currentMatchup && completedCount < totalGames && (
              <button
                onClick={onAutoFill}
                className="mt-4 px-4 py-2 text-xs font-bold rounded-lg text-white"
                style={{ backgroundColor: '#FF6B00' }}
              >
                Auto-fill remaining picks
              </button>
            )}
          </div>
        )}
      </div>

      {/* Mini bracket sidebar */}
      <div className="w-64 shrink-0 hidden lg:block">
        <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 shadow-sm p-3 sticky top-4">
          <h4 className="text-xs font-bold text-gray-700 dark:text-gray-200 mb-2">Bracket Overview</h4>

          {ROUND_ORDER.map((round) => {
            const roundMatchups = orderedMatchups.filter((m) => m.round === round);
            if (roundMatchups.length === 0) return null;

            return (
              <div key={round} className="mb-2">
                <div className="text-[9px] font-semibold text-gray-400 uppercase tracking-wider mb-1">
                  {round} ({roundMatchups.filter((m) => m.winnerId).length}/{roundMatchups.length})
                </div>
                <div className="grid grid-cols-2 gap-0.5">
                  {roundMatchups.map((m) => {
                    const idx = orderedMatchups.indexOf(m);
                    return (
                      <MiniMatchup
                        key={m.id}
                        matchup={m}
                        teams={teams}
                        isCurrent={idx === currentIndex}
                      />
                    );
                  })}
                </div>
              </div>
            );
          })}

          {/* Quick stats */}
          <div className="mt-3 pt-3 border-t border-gray-100 dark:border-gray-700">
            <div className="grid grid-cols-2 gap-2 text-center">
              <div>
                <span className="text-[9px] text-gray-400 block">Picked</span>
                <span className="text-sm font-bold" style={{ color: '#00274C' }}>
                  {completedCount}
                </span>
              </div>
              <div>
                <span className="text-[9px] text-gray-400 block">Remaining</span>
                <span className="text-sm font-bold" style={{ color: '#FF6B00' }}>
                  {remaining}
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
