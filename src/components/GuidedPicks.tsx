import { useMemo } from 'react';
import type {
  BracketState, Team, MatchupNarrative, Matchup, Round,
  ModelWeights, StructuredBias, ClaudeBiasAdjustment,
  MatchupOdds, HistoricalTrends, AdvancedModelSettings,
} from '../types';
import { computeAllCPR } from '../engine/composite-score';
import { computeWinProbability } from '../engine/matchup-sim';

interface GuidedPicksProps {
  bracket: BracketState;
  teams: Record<string, Team>;
  currentIndex: number;
  narratives: Record<string, MatchupNarrative>;
  weights: ModelWeights;
  biases: StructuredBias[];
  claudeBiases?: ClaudeBiasAdjustment[];
  odds?: MatchupOdds[];
  historicalTrends?: HistoricalTrends;
  advancedSettings?: AdvancedModelSettings;
  onPick: (matchupId: string, winnerId: string) => void;
  onNext: () => void;
  onPrev: () => void;
  onAutoFill: () => void;
}

const ROUND_ORDER: Round[] = ['R64', 'R32', 'Sweet 16', 'Elite 8', 'Final Four', 'Championship'];

function getConfidenceLabel(confidence: number): { text: string; color: string; darkColor: string } {
  if (confidence > 0.8) return { text: 'Very High', color: 'text-emerald-600', darkColor: 'dark:text-emerald-400' };
  if (confidence > 0.65) return { text: 'High', color: 'text-emerald-500', darkColor: 'dark:text-emerald-400' };
  if (confidence > 0.5) return { text: 'Moderate', color: 'text-yellow-600', darkColor: 'dark:text-yellow-400' };
  if (confidence > 0.35) return { text: 'Low', color: 'text-orange-500', darkColor: 'dark:text-orange-400' };
  return { text: 'Toss-up', color: 'text-red-500', darkColor: 'dark:text-red-400' };
}

/** Return color classes for the recommendation banner based on favorite probability */
function getRecommendationStyle(favProb: number): { bg: string; border: string; text: string } {
  if (favProb > 0.75) return {
    bg: 'bg-emerald-50 dark:bg-emerald-900/30',
    border: 'border-emerald-200 dark:border-emerald-700',
    text: 'text-emerald-700 dark:text-emerald-300',
  };
  if (favProb > 0.55) return {
    bg: 'bg-amber-50 dark:bg-amber-900/30',
    border: 'border-amber-200 dark:border-amber-700',
    text: 'text-amber-700 dark:text-amber-300',
  };
  return {
    bg: 'bg-red-50 dark:bg-red-900/30',
    border: 'border-red-200 dark:border-red-700',
    text: 'text-red-700 dark:text-red-300',
  };
}

/** Describe a team's best statistical advantage in a short phrase */
function describeAdvantage(team: Team): string {
  const traits: { label: string; value: number }[] = [];

  // Offense
  if (team.kenpom.adjO > 112) traits.push({ label: `elite offense (AdjO: ${team.kenpom.adjO.toFixed(1)})`, value: team.kenpom.adjO });
  else if (team.kenpom.adjO > 106) traits.push({ label: `strong offense (AdjO: ${team.kenpom.adjO.toFixed(1)})`, value: team.kenpom.adjO - 5 });

  // Defense (lower is better)
  if (team.kenpom.adjD < 95) traits.push({ label: `elite defense (AdjD: ${team.kenpom.adjD.toFixed(1)})`, value: 120 - team.kenpom.adjD });
  else if (team.kenpom.adjD < 100) traits.push({ label: `strong defense (AdjD: ${team.kenpom.adjD.toFixed(1)})`, value: 110 - team.kenpom.adjD });

  // Overall efficiency
  if (team.kenpom.adjEM > 25) traits.push({ label: `dominant efficiency margin (+${team.kenpom.adjEM.toFixed(1)})`, value: team.kenpom.adjEM });
  else if (team.kenpom.adjEM > 18) traits.push({ label: `strong efficiency margin (+${team.kenpom.adjEM.toFixed(1)})`, value: team.kenpom.adjEM - 5 });

  // Three-point shooting
  if (team.profile.threePtRate > 0.40) traits.push({ label: `high 3PT rate (${(team.profile.threePtRate * 100).toFixed(0)}%)`, value: team.profile.threePtRate * 100 });

  // Low turnovers
  if (team.profile.turnoverRate < 0.15) traits.push({ label: `excellent ball security (TO rate: ${(team.profile.turnoverRate * 100).toFixed(1)}%)`, value: 30 - team.profile.turnoverRate * 100 });

  // Offensive rebounding
  if (team.profile.orbRate > 0.34) traits.push({ label: `dominant offensive rebounding (${(team.profile.orbRate * 100).toFixed(0)}%)`, value: team.profile.orbRate * 100 });

  // Sort by value and pick the best
  traits.sort((a, b) => b.value - a.value);
  return traits.length > 0 ? traits[0].label : `overall balance (KenPom #${team.kenpom.rank})`;
}

/** Describe the specific edge the favorite has over the underdog */
function describeEdge(fav: Team, dog: Team): string {
  const edges: string[] = [];

  const emGap = fav.kenpom.adjEM - dog.kenpom.adjEM;
  if (emGap > 15) edges.push(`a massive ${emGap.toFixed(1)}-point efficiency gap`);
  else if (emGap > 8) edges.push(`a significant ${emGap.toFixed(1)}-point efficiency advantage`);

  if (fav.kenpom.adjD < dog.kenpom.adjD - 5) edges.push('superior defense');
  if (fav.kenpom.adjO > dog.kenpom.adjO + 5) edges.push('superior offense');

  if (fav.kenpom.rank < dog.kenpom.rank - 50) edges.push(`a substantial KenPom gap (#${fav.kenpom.rank} vs #${dog.kenpom.rank})`);

  if (fav.profile.turnoverRate < dog.profile.turnoverRate - 0.03) edges.push('better ball security');

  return edges.length > 0 ? edges.slice(0, 2).join(' and ') : `overall metrics (KenPom #${fav.kenpom.rank} vs #${dog.kenpom.rank})`;
}

/** Generate a template-based quick take from team stats and probability */
function generateQuickTake(teamA: Team, teamB: Team, probA: number): string {
  const favorite = probA >= 0.5 ? teamA : teamB;
  const underdog = probA >= 0.5 ? teamB : teamA;
  const favProb = probA >= 0.5 ? probA : 1 - probA;

  const emGap = Math.abs(teamA.kenpom.adjEM - teamB.kenpom.adjEM).toFixed(1);

  if (favProb > 0.9) {
    const favAdv = describeAdvantage(favorite);
    return `${favorite.name}'s ${favAdv} should overwhelm ${underdog.name}. The ${emGap}-point efficiency gap makes this one of the safest picks on the board.`;
  } else if (favProb > 0.75) {
    const favAdv = describeAdvantage(favorite);
    const dogStrength = describeAdvantage(underdog);
    return `${favorite.name}'s ${favAdv} gives them a clear edge. ${underdog.name}'s ${dogStrength} keeps them in the conversation, but the talent gap is real.`;
  } else if (favProb > 0.6) {
    const edge = describeEdge(favorite, underdog);
    const dogStrength = describeAdvantage(underdog);
    return `${favorite.name} is the favorite based on ${edge}, but ${underdog.name}'s ${dogStrength} could make this interesting. A reasonable upset pick for contrarian brackets.`;
  } else if (favProb > 0.55) {
    const edge = describeEdge(favorite, underdog);
    return `This is a competitive matchup. ${favorite.name} has the edge in ${edge}, but ${underdog.name} is a legitimate upset candidate. Bracket-busting potential here.`;
  } else {
    const aStr = describeAdvantage(teamA);
    const bStr = describeAdvantage(teamB);
    return `A true toss-up. ${teamA.name}'s ${aStr} vs ${teamB.name}'s ${bStr} makes this one of the hardest picks in the bracket. Trust your gut.`;
  }
}

/** Get stat comparison items showing which team has the advantage in each category */
function getStatComparisons(teamA: Team, teamB: Team): {
  label: string;
  aVal: string;
  bVal: string;
  winner: 'A' | 'B' | 'tie';
}[] {
  const comparisons = [];

  // AdjEM
  const emWinner = teamA.kenpom.adjEM > teamB.kenpom.adjEM ? 'A' : teamA.kenpom.adjEM < teamB.kenpom.adjEM ? 'B' : 'tie';
  comparisons.push({
    label: 'Adj. Efficiency',
    aVal: `${teamA.kenpom.adjEM > 0 ? '+' : ''}${teamA.kenpom.adjEM.toFixed(1)}`,
    bVal: `${teamB.kenpom.adjEM > 0 ? '+' : ''}${teamB.kenpom.adjEM.toFixed(1)}`,
    winner: emWinner as 'A' | 'B' | 'tie',
  });

  // AdjO
  const oWinner = teamA.kenpom.adjO > teamB.kenpom.adjO ? 'A' : teamA.kenpom.adjO < teamB.kenpom.adjO ? 'B' : 'tie';
  comparisons.push({
    label: 'Adj. Offense',
    aVal: teamA.kenpom.adjO.toFixed(1),
    bVal: teamB.kenpom.adjO.toFixed(1),
    winner: oWinner as 'A' | 'B' | 'tie',
  });

  // AdjD (lower is better)
  const dWinner = teamA.kenpom.adjD < teamB.kenpom.adjD ? 'A' : teamA.kenpom.adjD > teamB.kenpom.adjD ? 'B' : 'tie';
  comparisons.push({
    label: 'Adj. Defense',
    aVal: teamA.kenpom.adjD.toFixed(1),
    bVal: teamB.kenpom.adjD.toFixed(1),
    winner: dWinner as 'A' | 'B' | 'tie',
  });

  // Turnover rate (lower is better)
  const toWinner = teamA.profile.turnoverRate < teamB.profile.turnoverRate ? 'A' : teamA.profile.turnoverRate > teamB.profile.turnoverRate ? 'B' : 'tie';
  comparisons.push({
    label: 'Turnover Rate',
    aVal: `${(teamA.profile.turnoverRate * 100).toFixed(1)}%`,
    bVal: `${(teamB.profile.turnoverRate * 100).toFixed(1)}%`,
    winner: toWinner as 'A' | 'B' | 'tie',
  });

  // 3PT Rate
  const threeWinner = teamA.profile.threePtRate > teamB.profile.threePtRate ? 'A' : teamA.profile.threePtRate < teamB.profile.threePtRate ? 'B' : 'tie';
  comparisons.push({
    label: '3PT Rate',
    aVal: `${(teamA.profile.threePtRate * 100).toFixed(0)}%`,
    bVal: `${(teamB.profile.threePtRate * 100).toFixed(0)}%`,
    winner: threeWinner as 'A' | 'B' | 'tie',
  });

  // ORB Rate
  const orbWinner = teamA.profile.orbRate > teamB.profile.orbRate ? 'A' : teamA.profile.orbRate < teamB.profile.orbRate ? 'B' : 'tie';
  comparisons.push({
    label: 'Off. Reb. Rate',
    aVal: `${(teamA.profile.orbRate * 100).toFixed(0)}%`,
    bVal: `${(teamB.profile.orbRate * 100).toFixed(0)}%`,
    winner: orbWinner as 'A' | 'B' | 'tie',
  });

  return comparisons;
}

/** Find historical seed matchup data for context */
function findHistoricalSeedMatchup(
  teamA: Team,
  teamB: Team,
  round: string,
  trends?: HistoricalTrends,
): { description: string; upsetRate: number } | null {
  if (!trends || trends.seedMatchups.length === 0) return null;

  const higherSeed = Math.min(teamA.seed, teamB.seed);
  const lowerSeed = Math.max(teamA.seed, teamB.seed);

  if (higherSeed === lowerSeed) return null;

  const match = trends.seedMatchups.find(
    (sm) => sm.higherSeed === higherSeed && sm.lowerSeed === lowerSeed && sm.round === round,
  );

  if (!match || match.gamesPlayed < 5) return null;

  const upsetPct = (match.upsetRate * 100).toFixed(1);
  const favPct = ((1 - match.upsetRate) * 100).toFixed(1);
  return {
    description: `${higherSeed} vs ${lowerSeed} seeds: Historically, the ${lowerSeed}-seed wins ${upsetPct}% of the time (${match.gamesPlayed} games). The ${higherSeed}-seed wins ${favPct}%.`,
    upsetRate: match.upsetRate,
  };
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
  weights,
  biases,
  claudeBiases,
  odds,
  historicalTrends,
  advancedSettings,
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

  // Precompute all CPR values for consistent normalization
  const allCPR = useMemo(() => {
    const allTeams = Object.values(teams);
    if (allTeams.length === 0) return {};
    return computeAllCPR({
      allTeams,
      weights,
      biases,
      claudeBiases,
      odds,
      historicalTrends,
      advancedSettings,
    });
  }, [teams, weights, biases, claudeBiases, odds, historicalTrends, advancedSettings]);

  const totalGames = orderedMatchups.length;
  const currentMatchup = orderedMatchups[currentIndex] || null;
  const completedCount = orderedMatchups.filter((m) => m.winnerId).length;
  const progress = totalGames > 0 ? (currentIndex + 1) / totalGames : 0;

  const teamA = currentMatchup?.teamAId ? teams[currentMatchup.teamAId] : null;
  const teamB = currentMatchup?.teamBId ? teams[currentMatchup.teamBId] : null;
  const narrative = currentMatchup ? narratives[currentMatchup.id] : undefined;

  // Compute actual win probability from the model
  const winProbA = useMemo(() => {
    if (!teamA || !teamB || !currentMatchup) return 0.5;
    const cprA = allCPR[teamA.id];
    const cprB = allCPR[teamB.id];
    if (cprA == null || cprB == null) return 0.5;
    return computeWinProbability(
      teamA,
      teamB,
      cprA,
      cprB,
      currentMatchup.round as Round,
      historicalTrends,
      advancedSettings,
    );
  }, [teamA, teamB, currentMatchup, allCPR, historicalTrends, advancedSettings]);

  const winProbB = 1 - winProbA;

  const confidenceA = getConfidenceLabel(winProbA);
  const confidenceB = getConfidenceLabel(winProbB);

  const remaining = totalGames - completedCount;

  // Derived analysis data
  const favProb = Math.max(winProbA, winProbB);
  const favorite = winProbA >= 0.5 ? teamA : teamB;
  const underdog = winProbA >= 0.5 ? teamB : teamA;

  const recommendation = useMemo(() => {
    if (!favorite || !underdog) return null;
    if (favProb > 0.75) return { label: `Model favors ${favorite.name} at ${(favProb * 100).toFixed(0)}%`, type: 'strong' as const };
    if (favProb > 0.55) return { label: `Model leans ${favorite.name} at ${(favProb * 100).toFixed(0)}%`, type: 'moderate' as const };
    return { label: 'Toss-up game', type: 'tossup' as const };
  }, [favorite, underdog, favProb]);

  const isUpsetAlert = useMemo(() => {
    if (!teamA || !teamB) return false;
    return teamA.seed !== teamB.seed && favProb < 0.65;
  }, [teamA, teamB, favProb]);

  const statComparisons = useMemo(() => {
    if (!teamA || !teamB) return [];
    return getStatComparisons(teamA, teamB);
  }, [teamA, teamB]);

  const historicalContext = useMemo(() => {
    if (!teamA || !teamB || !currentMatchup) return null;
    return findHistoricalSeedMatchup(teamA, teamB, currentMatchup.round, historicalTrends);
  }, [teamA, teamB, currentMatchup, historicalTrends]);

  const quickTake = useMemo(() => {
    if (!teamA || !teamB) return '';
    return generateQuickTake(teamA, teamB, winProbA);
  }, [teamA, teamB, winProbA]);

  const recStyle = getRecommendationStyle(favProb);

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

            {/* Recommendation banner */}
            {recommendation && (
              <div className={`px-5 py-2.5 border-b ${recStyle.bg} ${recStyle.border} flex items-center gap-2`}>
                {isUpsetAlert && (
                  <span className="px-2 py-0.5 text-[10px] font-bold rounded-full bg-red-100 dark:bg-red-900/50 text-red-700 dark:text-red-300 border border-red-200 dark:border-red-700">
                    UPSET ALERT
                  </span>
                )}
                <span className={`text-sm font-semibold ${recStyle.text}`}>
                  {recommendation.label}
                </span>
              </div>
            )}

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
                  <div className={`text-xs font-medium ${confidenceA.color} ${confidenceA.darkColor}`}>
                    {confidenceA.text} confidence
                  </div>
                </div>

                {/* Pick button with probability */}
                <div className="mt-3">
                  {currentMatchup.winnerId === teamA.id ? (
                    <span className="inline-block px-4 py-1.5 rounded-full text-xs font-bold text-white" style={{ backgroundColor: '#00274C' }}>
                      YOUR PICK
                    </span>
                  ) : (
                    <span className="inline-block px-4 py-2 rounded-lg text-xs font-bold text-white transition-opacity hover:opacity-90" style={{ backgroundColor: '#00274C' }}>
                      Pick {teamA.name} ({(winProbA * 100).toFixed(0)}%)
                    </span>
                  )}
                </div>
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
                  <div className={`text-xs font-medium ${confidenceB.color} ${confidenceB.darkColor}`}>
                    {confidenceB.text} confidence
                  </div>
                </div>

                {/* Pick button with probability */}
                <div className="mt-3">
                  {currentMatchup.winnerId === teamB.id ? (
                    <span className="inline-block px-4 py-1.5 rounded-full text-xs font-bold text-white" style={{ backgroundColor: '#FF6B00' }}>
                      YOUR PICK
                    </span>
                  ) : (
                    <span className="inline-block px-4 py-2 rounded-lg text-xs font-bold text-white transition-opacity hover:opacity-90" style={{ backgroundColor: '#FF6B00' }}>
                      Pick {teamB.name} ({(winProbB * 100).toFixed(0)}%)
                    </span>
                  )}
                </div>
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

            {/* Statistical comparison table */}
            <div className="px-5 py-3 border-t border-gray-100 dark:border-gray-700">
              <h4 className="text-[10px] font-bold uppercase tracking-wider text-gray-400 dark:text-gray-500 mb-2">
                Head-to-Head Comparison
              </h4>
              <div className="space-y-1">
                {statComparisons.map((stat) => (
                  <div key={stat.label} className="flex items-center text-xs">
                    <span
                      className={`flex-1 text-right pr-2 font-mono tabular-nums ${
                        stat.winner === 'A'
                          ? 'font-bold text-gray-900 dark:text-gray-100'
                          : 'text-gray-400 dark:text-gray-500'
                      }`}
                    >
                      {stat.aVal}
                      {stat.winner === 'A' && (
                        <span className="ml-1 text-emerald-500 text-[10px]">&#9650;</span>
                      )}
                    </span>
                    <span className="w-24 text-center text-[10px] text-gray-400 dark:text-gray-500 font-medium shrink-0">
                      {stat.label}
                    </span>
                    <span
                      className={`flex-1 text-left pl-2 font-mono tabular-nums ${
                        stat.winner === 'B'
                          ? 'font-bold text-gray-900 dark:text-gray-100'
                          : 'text-gray-400 dark:text-gray-500'
                      }`}
                    >
                      {stat.winner === 'B' && (
                        <span className="mr-1 text-emerald-500 text-[10px]">&#9650;</span>
                      )}
                      {stat.bVal}
                    </span>
                  </div>
                ))}
              </div>
            </div>

            {/* Historical seed context */}
            {historicalContext && (
              <div className="px-5 py-3 border-t border-gray-100 dark:border-gray-700 bg-indigo-50/50 dark:bg-indigo-900/20">
                <div className="flex items-start gap-2">
                  <div className="w-5 h-5 rounded-full bg-indigo-100 dark:bg-indigo-800 flex items-center justify-center shrink-0 mt-0.5">
                    <svg className="w-3 h-3 text-indigo-600 dark:text-indigo-300" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                  </div>
                  <div>
                    <p className="text-xs font-semibold text-indigo-700 dark:text-indigo-300 mb-0.5">Historical Seed Context</p>
                    <p className="text-xs text-indigo-600 dark:text-indigo-400 leading-relaxed">{historicalContext.description}</p>
                    {historicalContext.upsetRate > 0.3 && (
                      <span className="inline-block mt-1 px-2 py-0.5 text-[10px] font-bold rounded-full bg-red-100 dark:bg-red-900/40 text-red-600 dark:text-red-400 border border-red-200 dark:border-red-700">
                        Upset rate: {(historicalContext.upsetRate * 100).toFixed(1)}%
                      </span>
                    )}
                    {historicalContext.upsetRate <= 0.3 && historicalContext.upsetRate > 0.1 && (
                      <span className="inline-block mt-1 px-2 py-0.5 text-[10px] font-bold rounded-full bg-amber-100 dark:bg-amber-900/40 text-amber-600 dark:text-amber-400 border border-amber-200 dark:border-amber-700">
                        Upset rate: {(historicalContext.upsetRate * 100).toFixed(1)}%
                      </span>
                    )}
                    {historicalContext.upsetRate <= 0.1 && (
                      <span className="inline-block mt-1 px-2 py-0.5 text-[10px] font-bold rounded-full bg-emerald-100 dark:bg-emerald-900/40 text-emerald-600 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-700">
                        Upset rate: {(historicalContext.upsetRate * 100).toFixed(1)}%
                      </span>
                    )}
                  </div>
                </div>
              </div>
            )}

            {/* Quick Take */}
            {quickTake && (
              <div className="px-5 py-3 border-t border-gray-100 dark:border-gray-700 bg-gray-50 dark:bg-gray-700/50">
                <div className="flex items-start gap-2">
                  <div className="w-5 h-5 rounded-full flex items-center justify-center text-white text-[8px] font-bold shrink-0 mt-0.5" style={{ backgroundColor: '#00274C' }}>
                    QT
                  </div>
                  <div>
                    <p className="text-xs font-semibold text-gray-700 dark:text-gray-200 mb-0.5">Quick Take</p>
                    <p className="text-sm text-gray-600 dark:text-gray-300 leading-relaxed">{quickTake}</p>
                  </div>
                </div>
              </div>
            )}

            {/* AI Narrative (if available) */}
            {narrative && (
              <div className="px-5 py-3 border-t border-gray-100 dark:border-gray-700 bg-gray-50 dark:bg-gray-700">
                <div className="flex items-start gap-2">
                  <div className="w-5 h-5 rounded-full flex items-center justify-center text-white text-[8px] font-bold shrink-0 mt-0.5" style={{ backgroundColor: '#00274C' }}>
                    AI
                  </div>
                  <div>
                    <p className="text-sm text-gray-600 dark:text-gray-300 leading-relaxed">{narrative.narrative}</p>
                    <div className="flex items-center gap-2 mt-2">
                      <span className="text-[10px] px-2 py-0.5 bg-white dark:bg-gray-600 border border-gray-200 dark:border-gray-500 rounded-full text-gray-500 dark:text-gray-300">
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
                className="flex items-center gap-1.5 px-3 py-2 text-xs font-medium text-gray-600 dark:text-gray-300 border border-gray-200 dark:border-gray-600 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
              >
                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                </svg>
                Previous
              </button>

              <button
                onClick={onNext}
                className="flex items-center gap-1.5 px-3 py-2 text-xs font-medium border border-gray-200 dark:border-gray-600 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors text-gray-500 dark:text-gray-400"
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
