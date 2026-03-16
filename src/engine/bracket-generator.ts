// ============================================================
// Bracket Generator — Single Bracket Mode
// ============================================================

import type {
  Team,
  Region,
  Round,
  ModelWeights,
  StructuredBias,
  ClaudeBiasAdjustment,
  MatchupOdds,
  HistoricalTrends,
  SimulationResults,
  UpsetAppetite,
  ScoringSystem,
  BracketState,
  Matchup,
} from '../types';
import { computeAllCPR } from './composite-score';
import { computeWinProbability } from './matchup-sim';

const SEED_MATCHUPS: [number, number][] = [
  [1, 16], [8, 9], [5, 12], [4, 13],
  [6, 11], [3, 14], [7, 10], [2, 15],
];

const REGION_ORDER: Region[] = ['East', 'West', 'South', 'Midwest'];

const ROUND_ORDER: Round[] = [
  'R64', 'R32', 'Sweet 16', 'Elite 8', 'Final Four', 'Championship',
];

interface PickCandidate {
  teamA: Team;
  teamB: Team;
  probA: number;
  cprA: number;
  cprB: number;
}

/**
 * Decide the upset appetite threshold for flipping a pick.
 *
 * - conservative: almost always pick the favorite
 * - moderate: mild upset consideration at toss-up games
 * - aggressive: introduce randomness at close matchups
 * - chaos: force upsets at many matchups
 */
function shouldUpset(
  probFavorite: number,
  appetite: UpsetAppetite,
  _round: Round
): boolean {
  // Higher seeds are bigger upsets — we scale by how close to 50/50
  const closeness = 1 - Math.abs(probFavorite - 0.5) * 2; // 0=blowout, 1=toss-up

  switch (appetite) {
    case 'conservative':
      // Only upset if it's essentially a coin flip (>48%)
      return closeness > 0.96 && Math.random() < 0.15;

    case 'moderate':
      // Upset consideration at close games
      if (closeness > 0.7) return Math.random() < 0.25;
      if (closeness > 0.4) return Math.random() < 0.08;
      return false;

    case 'aggressive':
      // Meaningful upset chance at anything within range
      if (closeness > 0.6) return Math.random() < 0.45;
      if (closeness > 0.3) return Math.random() < 0.20;
      if (closeness > 0.1) return Math.random() < 0.05;
      return false;

    case 'chaos':
      // Force upsets liberally — true March Madness experience
      if (closeness > 0.5) return Math.random() < 0.65;
      if (closeness > 0.2) return Math.random() < 0.35;
      return Math.random() < 0.10;

    default:
      return false;
  }
}

/**
 * Compute expected point value of picking a given team at a given round,
 * accounting for the scoring system.
 *
 * For seed-based scoring, picking a higher seed (underdog) yields more
 * points per correct pick, which may justify riskier picks.
 *
 * For upset-bonus scoring, points = base + seed of winner.
 */
function expectedPickValue(
  team: Team,
  winProb: number,
  roundIndex: number,
  scoringSystem: ScoringSystem
): number {
  const basePoints = scoringSystem.pointsByRound[roundIndex] ?? 1;

  if (scoringSystem.name === 'Seed-Based') {
    // Points = seed of winner; higher seeds earn more
    return winProb * team.seed;
  }

  if (scoringSystem.name === 'Upset Bonus') {
    // Points = base + seed of winner
    return winProb * (basePoints + team.seed);
  }

  // Standard scoring
  return winProb * basePoints;
}

/**
 * Pick the winner of a matchup considering upset appetite and scoring system.
 */
function pickWinner(
  candidate: PickCandidate,
  roundIndex: number,
  appetite: UpsetAppetite,
  scoringSystem: ScoringSystem,
  simResults: SimulationResults | undefined,
  round: Round
): { winner: Team; loser: Team; probWinner: number; isUpset: boolean } {
  const { teamA, teamB, probA } = candidate;
  const isFavoriteA = probA >= 0.5;
  const favorite = isFavoriteA ? teamA : teamB;
  const underdog = isFavoriteA ? teamB : teamA;
  const probFavorite = isFavoriteA ? probA : 1 - probA;

  // Check scoring-based expected value
  const evFavorite = expectedPickValue(favorite, probFavorite, roundIndex, scoringSystem);
  const evUnderdog = expectedPickValue(underdog, 1 - probFavorite, roundIndex, scoringSystem);

  // If the underdog has higher expected value under the scoring system,
  // strongly consider picking the upset
  if (evUnderdog > evFavorite * 1.05) {
    // Scoring system favors the underdog
    return {
      winner: underdog,
      loser: favorite,
      probWinner: 1 - probFavorite,
      isUpset: true,
    };
  }

  // Check upset appetite
  if (shouldUpset(probFavorite, appetite, round)) {
    return {
      winner: underdog,
      loser: favorite,
      probWinner: 1 - probFavorite,
      isUpset: true,
    };
  }

  // Factor in simulation-based deep run probability for later rounds
  if (simResults && roundIndex >= 2) {
    const simA = simResults.teamResults[teamA.id];
    const simB = simResults.teamResults[teamB.id];
    if (simA && simB) {
      const roundKey = ROUND_ORDER[roundIndex];
      const deepRunA = simA.roundProbabilities[roundKey] ?? 0;
      const deepRunB = simB.roundProbabilities[roundKey] ?? 0;

      // If the "underdog" has a significantly better deep run profile,
      // pick them even if the head-to-head slightly favors the other
      if (!isFavoriteA && deepRunA > deepRunB * 1.3 && probA > 0.35) {
        return {
          winner: teamA,
          loser: teamB,
          probWinner: probA,
          isUpset: teamA.seed > teamB.seed,
        };
      }
      if (isFavoriteA && deepRunB > deepRunA * 1.3 && (1 - probA) > 0.35) {
        return {
          winner: teamB,
          loser: teamA,
          probWinner: 1 - probA,
          isUpset: teamB.seed > teamA.seed,
        };
      }
    }
  }

  // Default: pick the favorite
  return {
    winner: favorite,
    loser: underdog,
    probWinner: probFavorite,
    isUpset: false,
  };
}

/**
 * Resolve First Four matchups deterministically (pick higher CPR).
 */
function resolveFirstFour(teams: Team[], cprMap: Record<string, number>): Team[] {
  const firstFour = teams.filter((t) => t.isFirstFour);
  const regular = teams.filter((t) => !t.isFirstFour);
  const resolved = [...regular];
  const processed = new Set<string>();

  for (const team of firstFour) {
    if (processed.has(team.id)) continue;
    const opp = firstFour.find((t) => t.id === team.firstFourOpponentId);
    if (opp) {
      processed.add(team.id);
      processed.add(opp.id);
      resolved.push(cprMap[team.id] >= cprMap[opp.id] ? team : opp);
    } else {
      resolved.push(team);
    }
  }

  return resolved;
}

/**
 * Generate a complete bracket with optimal picks.
 *
 * @param teams - All tournament teams
 * @param simulationResults - Monte Carlo results (optional but recommended)
 * @param upsetAppetite - How aggressively to pick upsets
 * @param scoringSystem - Pool scoring system
 * @param weights - Model weights
 * @param biases - User biases
 * @param odds - Vegas odds (optional)
 * @param historicalTrends - Historical data (optional)
 * @param claudeBiases - Claude AI adjustments (optional)
 * @returns Complete BracketState
 */
export function generateBracket(
  teams: Team[],
  simulationResults: SimulationResults | undefined,
  upsetAppetite: UpsetAppetite,
  scoringSystem: ScoringSystem,
  weights: ModelWeights,
  biases: StructuredBias[],
  odds: MatchupOdds[] | undefined,
  historicalTrends: HistoricalTrends | undefined,
  claudeBiases?: ClaudeBiasAdjustment[]
): BracketState {
  // Compute CPR
  const cprMap = computeAllCPR({
    allTeams: teams,
    weights,
    biases,
    claudeBiases,
    odds,
    historicalTrends,
  });

  // Resolve First Four
  const resolvedTeams = resolveFirstFour(teams, cprMap);

  // Index by ID
  const teamsById: Record<string, Team> = {};
  for (const t of teams) {
    teamsById[t.id] = t;
  }

  // Build matchups structure
  const matchups: Record<string, Matchup> = {};
  function createMatchupId(round: Round, region: Region | 'Final Four', position: number): string {
    return `${round}-${region}-${position}`;
  }

  // Group resolved teams by region
  const byRegion: Record<Region, Team[]> = { East: [], West: [], South: [], Midwest: [] };
  for (const t of resolvedTeams) {
    if (byRegion[t.region]) byRegion[t.region].push(t);
  }

  // Track winners advancing through rounds per region
  const regionAdvancers: Record<Region, Team[]> = { East: [], West: [], South: [], Midwest: [] };

  // --- R64 ---
  for (const region of REGION_ORDER) {
    const regionTeams = byRegion[region];
    const bySeed = new Map<number, Team>();
    for (const t of regionTeams) bySeed.set(t.seed, t);

    const r64Winners: Team[] = [];

    for (let i = 0; i < SEED_MATCHUPS.length; i++) {
      const [seedA, seedB] = SEED_MATCHUPS[i];
      const teamA = bySeed.get(seedA);
      const teamB = bySeed.get(seedB);

      if (!teamA || !teamB) continue;

      const probA = computeWinProbability(
        teamA, teamB, cprMap[teamA.id], cprMap[teamB.id],
        'R64', historicalTrends
      );

      const result = pickWinner(
        { teamA, teamB, probA, cprA: cprMap[teamA.id], cprB: cprMap[teamB.id] },
        0, upsetAppetite, scoringSystem, simulationResults, 'R64'
      );

      const matchupId = createMatchupId('R64', region, i);
      matchups[matchupId] = {
        id: matchupId,
        round: 'R64',
        region,
        position: i,
        teamAId: teamA.id,
        teamBId: teamB.id,
        winnerId: result.winner.id,
        winProbA: probA,
        locked: false,
        isUpset: result.isUpset,
        confidence: result.probWinner,
      };

      r64Winners.push(result.winner);
    }

    regionAdvancers[region] = r64Winners;
  }

  // --- R32 through Elite 8 ---
  for (let roundIdx = 1; roundIdx <= 3; roundIdx++) {
    const round = ROUND_ORDER[roundIdx];

    for (const region of REGION_ORDER) {
      const advancers = regionAdvancers[region];
      const nextAdvancers: Team[] = [];

      for (let i = 0; i < advancers.length; i += 2) {
        if (i + 1 >= advancers.length) {
          nextAdvancers.push(advancers[i]);
          continue;
        }

        const teamA = advancers[i];
        const teamB = advancers[i + 1];
        const probA = computeWinProbability(
          teamA, teamB, cprMap[teamA.id], cprMap[teamB.id],
          round, historicalTrends
        );

        const result = pickWinner(
          { teamA, teamB, probA, cprA: cprMap[teamA.id], cprB: cprMap[teamB.id] },
          roundIdx, upsetAppetite, scoringSystem, simulationResults, round
        );

        const pos = Math.floor(i / 2);
        const matchupId = createMatchupId(round, region, pos);
        matchups[matchupId] = {
          id: matchupId,
          round,
          region,
          position: pos,
          teamAId: teamA.id,
          teamBId: teamB.id,
          winnerId: result.winner.id,
          winProbA: probA,
          locked: false,
          isUpset: result.isUpset,
          confidence: result.probWinner,
        };

        nextAdvancers.push(result.winner);
      }

      regionAdvancers[region] = nextAdvancers;
    }
  }

  // --- Final Four ---
  const semis: [Region, Region][] = [['East', 'West'], ['South', 'Midwest']];
  const finalists: Team[] = [];

  for (let i = 0; i < semis.length; i++) {
    const [regionA, regionB] = semis[i];
    const teamA = regionAdvancers[regionA][0];
    const teamB = regionAdvancers[regionB][0];

    if (!teamA || !teamB) {
      if (teamA) finalists.push(teamA);
      if (teamB) finalists.push(teamB);
      continue;
    }

    const probA = computeWinProbability(
      teamA, teamB, cprMap[teamA.id], cprMap[teamB.id],
      'Final Four', historicalTrends
    );

    const result = pickWinner(
      { teamA, teamB, probA, cprA: cprMap[teamA.id], cprB: cprMap[teamB.id] },
      4, upsetAppetite, scoringSystem, simulationResults, 'Final Four'
    );

    const matchupId = createMatchupId('Final Four', 'Final Four', i);
    matchups[matchupId] = {
      id: matchupId,
      round: 'Final Four',
      region: 'Final Four',
      position: i,
      teamAId: teamA.id,
      teamBId: teamB.id,
      winnerId: result.winner.id,
      winProbA: probA,
      locked: false,
      isUpset: result.isUpset,
      confidence: result.probWinner,
    };

    finalists.push(result.winner);
  }

  // --- Championship ---
  if (finalists.length === 2) {
    const teamA = finalists[0];
    const teamB = finalists[1];
    const probA = computeWinProbability(
      teamA, teamB, cprMap[teamA.id], cprMap[teamB.id],
      'Championship', historicalTrends
    );

    const result = pickWinner(
      { teamA, teamB, probA, cprA: cprMap[teamA.id], cprB: cprMap[teamB.id] },
      5, upsetAppetite, scoringSystem, simulationResults, 'Championship'
    );

    const matchupId = createMatchupId('Championship', 'Final Four', 0);
    matchups[matchupId] = {
      id: matchupId,
      round: 'Championship',
      region: 'Final Four',
      position: 0,
      teamAId: teamA.id,
      teamBId: teamB.id,
      winnerId: result.winner.id,
      winProbA: probA,
      locked: false,
      isUpset: result.isUpset,
      confidence: result.probWinner,
    };
  }

  return {
    matchups,
    teams: teamsById,
  };
}
