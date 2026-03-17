// ============================================================
// Monte Carlo Bracket Simulation
// ============================================================

import type {
  Team,
  Round,
  Region,
  ModelWeights,
  StructuredBias,
  ClaudeBiasAdjustment,
  MatchupOdds,
  HistoricalTrends,
  SimulationResults,
  TeamSimResult,
  AdvancedModelSettings,
} from '../types';
import { computeAllCPR } from './composite-score';
import { computeWinProbability, simulateMatchup } from './matchup-sim';

/** Ordered rounds for progression tracking. */
const ROUND_ORDER: Round[] = [
  'R64', 'R32', 'Sweet 16', 'Elite 8', 'Final Four', 'Championship',
];

const ROUND_INDEX: Record<string, number> = {};
ROUND_ORDER.forEach((r, i) => { ROUND_INDEX[r] = i; });

/** Regions in bracket order for Final Four matchups. */
const REGION_ORDER: Region[] = ['East', 'West', 'South', 'Midwest'];

/**
 * Build the initial R64 bracket from 64 teams (after First Four resolution).
 * Returns an array of [teamA, teamB] pairs for R64, organized by region.
 *
 * Standard bracket seed pairings within a region:
 * 1v16, 8v9, 5v12, 4v13, 6v11, 3v14, 7v10, 2v15
 */
const SEED_MATCHUPS: [number, number][] = [
  [1, 16], [8, 9], [5, 12], [4, 13],
  [6, 11], [3, 14], [7, 10], [2, 15],
];

interface BracketSlot {
  team: Team;
  cpr: number;
}

/**
 * Resolve First Four matchups: for teams with isFirstFour flag,
 * simulate or take the higher-CPR team.
 */
function resolveFirstFour(
  teams: Team[],
  cprMap: Record<string, number>,
  luckFactor: number = 0,
): Team[] {
  const firstFourTeams = teams.filter((t) => t.isFirstFour);
  const regularTeams = teams.filter((t) => !t.isFirstFour);

  // Pair first-four teams by opponent ID
  const resolved: Team[] = [...regularTeams];
  const processed = new Set<string>();

  for (const team of firstFourTeams) {
    if (processed.has(team.id)) continue;

    const opponent = firstFourTeams.find(
      (t) => t.id === team.firstFourOpponentId
    );
    if (opponent) {
      processed.add(team.id);
      processed.add(opponent.id);

      const probA = 0.5 + (cprMap[team.id] - cprMap[opponent.id]) * 0.5;
      const aWins = simulateMatchup(Math.max(0.02, Math.min(0.98, probA)), luckFactor);
      resolved.push(aWins ? team : opponent);
    } else {
      // No opponent found — include the team as-is
      resolved.push(team);
    }
  }

  return resolved;
}

/**
 * Build region brackets: for each region, arrange teams by seed
 * and pair them according to standard bracket structure.
 */
function buildRegionBracket(
  regionTeams: Team[],
  cprMap: Record<string, number>
): BracketSlot[][] {
  // Index teams by seed within this region
  const bySeed = new Map<number, Team>();
  for (const t of regionTeams) {
    bySeed.set(t.seed, t);
  }

  // Build R64 matchups
  const r64Matchups: [BracketSlot, BracketSlot][] = [];
  for (const [seedA, seedB] of SEED_MATCHUPS) {
    const teamA = bySeed.get(seedA);
    const teamB = bySeed.get(seedB);
    if (teamA && teamB) {
      r64Matchups.push([
        { team: teamA, cpr: cprMap[teamA.id] },
        { team: teamB, cpr: cprMap[teamB.id] },
      ]);
    }
  }

  // Return as flat array of slots per matchup
  return r64Matchups.map(([a, b]) => [a, b]);
}

/**
 * Simulate a single full bracket iteration.
 *
 * Returns a record of teamId -> round index reached (0=R64 exit, 5=Champion).
 */
function simulateOnce(
  teamsById: Record<string, Team>,
  _cprMap: Record<string, number>,
  regionBrackets: Record<Region, BracketSlot[][]>,
  historicalTrends: HistoricalTrends | undefined,
  advancedSettings?: AdvancedModelSettings,
  luckFactor: number = 0,
): Record<string, number> {
  const roundReached: Record<string, number> = {};

  // Initialize all teams at round 0 (they at least participated in R64)
  for (const id of Object.keys(teamsById)) {
    roundReached[id] = 0;
  }

  // Simulate each region through Elite 8
  const regionWinners: Record<Region, BracketSlot> = {} as Record<Region, BracketSlot>;

  for (const region of REGION_ORDER) {
    const bracket = regionBrackets[region];
    if (!bracket || bracket.length === 0) continue;

    // Current round's competitors
    let currentRound: BracketSlot[] = [];

    // R64
    for (const [slotA, slotB] of bracket) {
      const prob = computeWinProbability(
        slotA.team, slotB.team,
        slotA.cpr, slotB.cpr,
        'R64', historicalTrends, advancedSettings, region
      );
      const aWins = simulateMatchup(prob, luckFactor);
      const winner = aWins ? slotA : slotB;
      roundReached[winner.team.id] = 1; // advances past R64
      currentRound.push(winner);
    }

    // R32 through Elite 8 (rounds 1, 2, 3 in our indexing)
    const roundNames: Round[] = ['R32', 'Sweet 16', 'Elite 8'];
    for (let ri = 0; ri < roundNames.length; ri++) {
      const nextRound: BracketSlot[] = [];
      for (let i = 0; i < currentRound.length; i += 2) {
        if (i + 1 >= currentRound.length) {
          nextRound.push(currentRound[i]);
          continue;
        }
        const slotA = currentRound[i];
        const slotB = currentRound[i + 1];
        const prob = computeWinProbability(
          slotA.team, slotB.team,
          slotA.cpr, slotB.cpr,
          roundNames[ri], historicalTrends, advancedSettings, region
        );
        const aWins = simulateMatchup(prob, luckFactor);
        const winner = aWins ? slotA : slotB;
        roundReached[winner.team.id] = ri + 2; // R32=1, S16=2, E8=3
        nextRound.push(winner);
      }
      currentRound = nextRound;
    }

    if (currentRound.length > 0) {
      regionWinners[region] = currentRound[0];
      roundReached[currentRound[0].team.id] = 4; // Final Four
    }
  }

  // Final Four: East vs West, South vs Midwest (standard bracket pairings)
  const semis: [Region, Region][] = [
    ['East', 'West'],
    ['South', 'Midwest'],
  ];
  const finalists: BracketSlot[] = [];

  for (const [regionA, regionB] of semis) {
    const slotA = regionWinners[regionA];
    const slotB = regionWinners[regionB];
    if (slotA && slotB) {
      const prob = computeWinProbability(
        slotA.team, slotB.team,
        slotA.cpr, slotB.cpr,
        'Final Four', historicalTrends, advancedSettings, 'Final Four'
      );
      const aWins = simulateMatchup(prob, luckFactor);
      const winner = aWins ? slotA : slotB;
      roundReached[winner.team.id] = 5; // Championship game
      finalists.push(winner);
    } else if (slotA) {
      roundReached[slotA.team.id] = 5;
      finalists.push(slotA);
    } else if (slotB) {
      roundReached[slotB.team.id] = 5;
      finalists.push(slotB);
    }
  }

  // Championship
  if (finalists.length === 2) {
    const prob = computeWinProbability(
      finalists[0].team, finalists[1].team,
      finalists[0].cpr, finalists[1].cpr,
      'Championship', historicalTrends, advancedSettings, 'Final Four'
    );
    const aWins = simulateMatchup(prob, luckFactor);
    const champion = aWins ? finalists[0] : finalists[1];
    roundReached[champion.team.id] = 6; // Champion
  } else if (finalists.length === 1) {
    roundReached[finalists[0].team.id] = 6;
  }

  return roundReached;
}

/**
 * Convert average round index to a Round label.
 */
function roundIndexToRound(avgIndex: number): Round {
  const rounded = Math.round(avgIndex);
  const clamped = Math.max(0, Math.min(5, rounded));
  return ROUND_ORDER[clamped];
}

/**
 * Yield control back to the event loop to keep the UI responsive.
 * In a browser context this allows rendering and user interaction.
 */
function yieldToEventLoop(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

/**
 * Run a Monte Carlo simulation of the full 63-game bracket.
 *
 * @param teams - Array of all tournament teams (64-68 including First Four)
 * @param weights - Model weight configuration
 * @param biases - User-defined structured biases
 * @param odds - Vegas odds for matchups (optional)
 * @param historicalTrends - Historical tournament data (optional)
 * @param iterations - Number of simulations (default 10,000)
 * @param claudeBiases - Claude AI bias adjustments (optional)
 * @param onProgress - Optional callback reporting progress every 500 iterations
 * @returns SimulationResults with per-team probabilities
 */
export async function runSimulation(
  teams: Team[],
  weights: ModelWeights,
  biases: StructuredBias[],
  odds: MatchupOdds[] | undefined,
  historicalTrends: HistoricalTrends | undefined,
  iterations: number = 10000,
  claudeBiases?: ClaudeBiasAdjustment[],
  onProgress?: (completed: number, total: number) => void,
  advancedSettings?: AdvancedModelSettings,
  luckFactor: number = 0,
): Promise<SimulationResults> {
  // Compute CPR for all teams once
  const cprMap = computeAllCPR({
    allTeams: teams,
    weights,
    biases,
    claudeBiases,
    odds,
    historicalTrends,
    advancedSettings,
  });

  // Index teams by ID
  const teamsById: Record<string, Team> = {};
  for (const t of teams) {
    teamsById[t.id] = t;
  }

  // Accumulation arrays
  const roundSums: Record<string, number> = {};
  const roundCounts: Record<string, number[]> = {};
  // roundCounts[teamId][roundIndex] = number of times team reached that round

  for (const t of teams) {
    roundSums[t.id] = 0;
    roundCounts[t.id] = new Array(7).fill(0); // indices 0-6
  }

  // Batch size for yielding to event loop
  const YIELD_INTERVAL = 500;

  for (let iter = 0; iter < iterations; iter++) {
    // Periodically yield to keep UI responsive and report progress
    if (iter > 0 && iter % YIELD_INTERVAL === 0) {
      if (onProgress) {
        onProgress(iter, iterations);
      }
      await yieldToEventLoop();
    }

    // Resolve First Four for this iteration
    const resolved = resolveFirstFour(teams, cprMap, luckFactor);

    // Group by region
    const byRegion: Record<Region, Team[]> = {
      East: [], West: [], South: [], Midwest: [],
    };
    for (const t of resolved) {
      if (byRegion[t.region]) {
        byRegion[t.region].push(t);
      }
    }

    // Build region brackets
    const regionBrackets: Record<Region, BracketSlot[][]> = {} as Record<Region, BracketSlot[][]>;
    for (const region of REGION_ORDER) {
      regionBrackets[region] = buildRegionBracket(byRegion[region], cprMap);
    }

    // Simulate one full tournament
    const result = simulateOnce(teamsById, cprMap, regionBrackets, historicalTrends, advancedSettings, luckFactor);

    // Accumulate results
    for (const [teamId, roundIdx] of Object.entries(result)) {
      roundSums[teamId] += roundIdx;
      // The team reached at least round 0. Mark all rounds they reached.
      for (let r = 0; r <= roundIdx; r++) {
        roundCounts[teamId][r]++;
      }
    }
  }

  // Build final results
  const teamResults: Record<string, TeamSimResult> = {};

  for (const t of teams) {
    const counts = roundCounts[t.id];
    const avgRound = roundSums[t.id] / iterations;

    // Round probabilities: probability of reaching each round
    const roundProbabilities: Record<string, number> = {};
    for (let i = 0; i < ROUND_ORDER.length; i++) {
      roundProbabilities[ROUND_ORDER[i]] = counts[i + 1] / iterations;
    }
    // Champion probability
    roundProbabilities['Champion'] = counts[6] / iterations;

    teamResults[t.id] = {
      teamId: t.id,
      avgRoundReached: avgRound,
      championshipProb: counts[6] / iterations,
      finalFourProb: counts[4] / iterations,
      sweetSixteenProb: counts[2] / iterations,
      expectedRoundOfExit: roundIndexToRound(avgRound),
      roundProbabilities,
    };
  }

  return {
    teamResults,
    iterations,
  };
}
