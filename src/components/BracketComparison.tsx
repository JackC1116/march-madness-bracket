import { useMemo } from 'react';
import type { BracketState, Team, Round } from '../types';

interface BracketComparisonProps {
  myBracket: BracketState;
  compBracket: BracketState;
  teams: Record<string, Team>;
  onClose: () => void;
}

const ROUND_ORDER: Round[] = [
  'R64',
  'R32',
  'Sweet 16',
  'Elite 8',
  'Final Four',
  'Championship',
];

const ROUND_DISPLAY: Record<string, string> = {
  R64: 'Round of 64',
  R32: 'Round of 32',
  'Sweet 16': 'Sweet 16',
  'Elite 8': 'Elite 8',
  'Final Four': 'Final Four',
  Championship: 'Championship',
};

const LATE_ROUNDS = new Set<string>(['Sweet 16', 'Elite 8', 'Final Four', 'Championship']);

export default function BracketComparison({
  myBracket,
  compBracket,
  teams,
  onClose,
}: BracketComparisonProps) {
  const analysis = useMemo(() => {
    let totalGames = 0;
    let agreements = 0;
    const diffsByRound: Record<string, number> = {};
    const keyDifferences: Array<{
      round: string;
      region: string;
      teamA: string;
      teamB: string;
      myPick: string;
      theirPick: string;
    }> = [];

    const roundMatchups: Record<
      string,
      Array<{
        id: string;
        region: string;
        teamAName: string;
        teamBName: string;
        myPickName: string;
        theirPickName: string;
        agree: boolean;
        myPicked: boolean;
        theirPicked: boolean;
      }>
    > = {};

    for (const round of ROUND_ORDER) {
      diffsByRound[round] = 0;
      roundMatchups[round] = [];
    }

    const allMatchups = Object.values(myBracket.matchups)
      .filter((m) => ROUND_ORDER.includes(m.round as Round))
      .sort((a, b) => {
        const ri = ROUND_ORDER.indexOf(a.round as Round) - ROUND_ORDER.indexOf(b.round as Round);
        if (ri !== 0) return ri;
        if (a.region < b.region) return -1;
        if (a.region > b.region) return 1;
        return a.position - b.position;
      });

    for (const matchup of allMatchups) {
      totalGames++;
      const round = matchup.round;
      const compMatchup = compBracket.matchups[matchup.id];

      const myPick = matchup.winnerId;
      const theirPick = compMatchup?.winnerId ?? null;

      const myPicked = myPick !== null;
      const theirPicked = theirPick !== null;

      const teamA = matchup.teamAId ? teams[matchup.teamAId] : null;
      const teamB = matchup.teamBId ? teams[matchup.teamBId] : null;
      const myPickTeam = myPick ? teams[myPick] : null;
      const theirPickTeam = theirPick ? teams[theirPick] : null;

      const agree = myPicked && theirPicked && myPick === theirPick;
      if (agree) agreements++;

      if (myPicked && theirPicked && myPick !== theirPick) {
        diffsByRound[round] = (diffsByRound[round] || 0) + 1;

        if (LATE_ROUNDS.has(round)) {
          keyDifferences.push({
            round,
            region: matchup.region,
            teamA: teamA?.name ?? 'TBD',
            teamB: teamB?.name ?? 'TBD',
            myPick: myPickTeam?.name ?? 'TBD',
            theirPick: theirPickTeam?.name ?? 'TBD',
          });
        }
      }

      const teamALabel = teamA ? `(${teamA.seed}) ${teamA.name}` : 'TBD';
      const teamBLabel = teamB ? `(${teamB.seed}) ${teamB.name}` : 'TBD';

      roundMatchups[round].push({
        id: matchup.id,
        region: matchup.region,
        teamAName: teamALabel,
        teamBName: teamBLabel,
        myPickName: myPickTeam ? myPickTeam.name : myPicked ? 'Unknown' : '--',
        theirPickName: theirPickTeam ? theirPickTeam.name : theirPicked ? 'Unknown' : '--',
        agree,
        myPicked,
        theirPicked,
      });
    }

    return { totalGames, agreements, diffsByRound, keyDifferences, roundMatchups };
  }, [myBracket, compBracket, teams]);

  const pct = analysis.totalGames > 0
    ? Math.round((analysis.agreements / analysis.totalGames) * 100)
    : 0;

  return (
    <div className="max-w-4xl mx-auto p-4 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-bold text-gray-900 dark:text-gray-100">
          Bracket Comparison
        </h2>
        <button
          onClick={onClose}
          className="inline-flex items-center gap-1.5 px-4 py-2 text-sm font-medium rounded-lg border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 transition"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
          </svg>
          Close Comparison
        </button>
      </div>

      {/* Summary */}
      <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-5 space-y-4">
        <div className="text-center">
          <div className="text-3xl font-bold text-gray-900 dark:text-gray-100">
            {analysis.agreements}/{analysis.totalGames} picks agree
          </div>
          <div className="text-sm text-gray-500 dark:text-gray-400 mt-1">
            {pct}% agreement
          </div>
        </div>

        {/* Progress bar */}
        <div className="w-full h-3 bg-gray-200 dark:bg-gray-600 rounded-full overflow-hidden">
          <div
            className="h-full rounded-full transition-all duration-300"
            style={{
              width: `${pct}%`,
              backgroundColor: pct >= 80 ? '#10b981' : pct >= 50 ? '#f59e0b' : '#ef4444',
            }}
          />
        </div>

        {/* Divergence by round */}
        <div className="flex flex-wrap gap-3 justify-center">
          {ROUND_ORDER.map((round) => {
            const diffs = analysis.diffsByRound[round] || 0;
            return (
              <div
                key={round}
                className="text-center px-3 py-2 rounded-lg bg-gray-50 dark:bg-gray-700 border border-gray-100 dark:border-gray-600"
              >
                <div className="text-[10px] text-gray-400 dark:text-gray-500 uppercase tracking-wider">
                  {ROUND_DISPLAY[round] || round}
                </div>
                <div
                  className={`text-sm font-bold tabular-nums ${
                    diffs > 0 ? 'text-red-600 dark:text-red-400' : 'text-green-600 dark:text-green-400'
                  }`}
                >
                  {diffs} diff{diffs !== 1 ? 's' : ''}
                </div>
              </div>
            );
          })}
        </div>

        {/* Key differences in late rounds */}
        {analysis.keyDifferences.length > 0 && (
          <div className="mt-4">
            <h4 className="text-sm font-bold text-gray-700 dark:text-gray-300 mb-2">
              Key Differences (Sweet 16+)
            </h4>
            <div className="space-y-1">
              {analysis.keyDifferences.map((diff, i) => (
                <div
                  key={i}
                  className="flex items-center gap-2 text-xs px-3 py-2 rounded-lg bg-red-50 dark:bg-red-900/20 border border-red-100 dark:border-red-800"
                >
                  <span className="font-medium text-gray-500 dark:text-gray-400 w-24 shrink-0">
                    {diff.round}
                  </span>
                  <span className="text-gray-700 dark:text-gray-300">
                    You: <span className="font-bold">{diff.myPick}</span>
                  </span>
                  <span className="text-gray-400 dark:text-gray-500">vs</span>
                  <span className="text-gray-700 dark:text-gray-300">
                    Friend: <span className="font-bold">{diff.theirPick}</span>
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Round-by-round breakdown */}
      <div className="space-y-4">
        {ROUND_ORDER.map((round) => {
          const matchups = analysis.roundMatchups[round];
          if (!matchups || matchups.length === 0) return null;
          const diffs = analysis.diffsByRound[round] || 0;

          return (
            <div
              key={round}
              className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 overflow-hidden"
            >
              <div className="px-4 py-3 border-b border-gray-100 dark:border-gray-700 flex items-center justify-between">
                <h4 className="text-sm font-bold text-gray-900 dark:text-gray-100">
                  {ROUND_DISPLAY[round] || round}
                </h4>
                <span
                  className={`text-xs font-medium px-2 py-0.5 rounded-full ${
                    diffs > 0
                      ? 'bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400'
                      : 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400'
                  }`}
                >
                  {diffs > 0 ? `${diffs} difference${diffs !== 1 ? 's' : ''}` : 'All agree'}
                </span>
              </div>

              {/* Table header */}
              <div className="grid grid-cols-4 gap-2 px-4 py-2 text-[10px] font-medium uppercase tracking-wider text-gray-400 dark:text-gray-500 border-b border-gray-50 dark:border-gray-700">
                <span>Matchup</span>
                <span>Region</span>
                <span>Your Pick</span>
                <span>Friend's Pick</span>
              </div>

              {/* Rows */}
              <div className="divide-y divide-gray-50 dark:divide-gray-700">
                {matchups.map((m) => (
                  <div
                    key={m.id}
                    className={`grid grid-cols-4 gap-2 px-4 py-2.5 text-xs ${
                      m.agree
                        ? 'bg-green-50 dark:bg-green-900/10'
                        : m.myPicked && m.theirPicked
                          ? 'bg-red-50 dark:bg-red-900/10'
                          : 'bg-white dark:bg-gray-800'
                    }`}
                  >
                    <span className="text-gray-700 dark:text-gray-300 truncate" title={`${m.teamAName} vs ${m.teamBName}`}>
                      {m.teamAName} vs {m.teamBName}
                    </span>
                    <span className="text-gray-500 dark:text-gray-400">
                      {m.region}
                    </span>
                    <span
                      className={`font-medium ${
                        m.agree
                          ? 'text-green-700 dark:text-green-400'
                          : m.myPicked && m.theirPicked
                            ? 'text-red-700 dark:text-red-400'
                            : 'text-gray-600 dark:text-gray-400'
                      }`}
                    >
                      {m.myPickName}
                    </span>
                    <span
                      className={`font-medium ${
                        m.agree
                          ? 'text-green-700 dark:text-green-400'
                          : m.myPicked && m.theirPicked
                            ? 'text-orange-700 dark:text-orange-400'
                            : 'text-gray-600 dark:text-gray-400'
                      }`}
                    >
                      {m.theirPickName}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
