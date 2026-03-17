// ============================================================
// Multi-Bracket Generator — Pool Strategy Engine
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
  BracketState,
  BracketArchetype,
  PoolConfig,
  Matchup,
  AdvancedModelSettings,
} from '../types';
import { generateBracket } from './bracket-generator';

const ROUND_ORDER: Round[] = [
  'R64', 'R32', 'Sweet 16', 'Elite 8', 'Final Four', 'Championship',
];

/**
 * A leverage game is a matchup where:
 * 1. The win probability is close to 50/50 (between 35-65%)
 * 2. The winner has a meaningful path forward in the bracket
 *
 * Picking differently on leverage games is how differentiated brackets
 * gain an edge — they share high-confidence picks but diverge where
 * the outcome is uncertain.
 */
interface LeverageGame {
  matchupId: string;
  round: Round;
  region: Region | 'Final Four';
  teamAId: string;
  teamBId: string;
  probA: number;
  leverageScore: number; // higher = more impactful divergence point
}

/**
 * Identify leverage games from simulation results and matchup probabilities.
 */
function identifyLeverageGames(
  simResults: SimulationResults,
  bracket: BracketState
): LeverageGame[] {
  const leverageGames: LeverageGame[] = [];

  for (const matchup of Object.values(bracket.matchups)) {
    if (!matchup.teamAId || !matchup.teamBId || matchup.winProbA === null) continue;

    const probA = matchup.winProbA;
    const closeness = 1 - Math.abs(probA - 0.5) * 2; // 0=blowout, 1=coin-flip

    // Only consider games with meaningful uncertainty
    if (closeness < 0.3) continue;

    // Compute leverage score: how much does picking differently matter?
    const roundIndex = ROUND_ORDER.indexOf(matchup.round as Round);
    const roundMultiplier = roundIndex >= 0 ? roundIndex + 1 : 1;

    // Teams with deep-run potential on leverage games are extra valuable
    const simA = simResults.teamResults[matchup.teamAId];
    const simB = simResults.teamResults[matchup.teamBId];
    const deepRunPotential = simA && simB
      ? (simA.sweetSixteenProb + simB.sweetSixteenProb) / 2
      : 0.2;

    const leverageScore = closeness * roundMultiplier * (1 + deepRunPotential);

    leverageGames.push({
      matchupId: matchup.id,
      round: matchup.round as Round,
      region: matchup.region,
      teamAId: matchup.teamAId,
      teamBId: matchup.teamBId,
      probA,
      leverageScore,
    });
  }

  // Sort by leverage score descending
  leverageGames.sort((a, b) => b.leverageScore - a.leverageScore);
  return leverageGames;
}

/**
 * Determine how many leverage games to flip based on pool size.
 * Larger pools require more differentiation to find an edge.
 */
function getDifferentiationLevel(poolSize: number): number {
  if (poolSize <= 10) return 2;
  if (poolSize <= 25) return 4;
  if (poolSize <= 50) return 6;
  if (poolSize <= 100) return 8;
  if (poolSize <= 500) return 12;
  return 15; // 500+ person pools need maximum differentiation
}

/**
 * Generate archetype-specific scoring system adjustments and appetite.
 */
function getArchetypeConfig(archetype: BracketArchetype): {
  upsetBias: number;       // -1 to 1: negative=chalk, positive=upsets
  finalFourBias: number;   // boost to non-1-seeds in Final Four
  cinderellaBias: number;  // boost to seeds 10+
  chalkBias: number;       // boost to seeds 1-4
} {
  switch (archetype) {
    case 'chalk':
      return { upsetBias: -0.6, finalFourBias: 0, cinderellaBias: 0, chalkBias: 0.15 };
    case 'contrarian':
      return { upsetBias: 0.4, finalFourBias: 0.2, cinderellaBias: 0.1, chalkBias: -0.1 };
    case 'cinderella':
      return { upsetBias: 0.3, finalFourBias: 0.15, cinderellaBias: 0.3, chalkBias: -0.15 };
    case 'bold_final_four':
      return { upsetBias: 0.1, finalFourBias: 0.4, cinderellaBias: 0.05, chalkBias: -0.05 };
    default:
      return { upsetBias: 0, finalFourBias: 0, cinderellaBias: 0, chalkBias: 0 };
  }
}

/**
 * Apply archetype-specific modifications to a bracket by flipping
 * select matchup winners according to the archetype's personality.
 */
function applyArchetypeOverrides(
  bracket: BracketState,
  archetype: BracketArchetype,
  leverageGames: LeverageGame[],
  simResults: SimulationResults,
  teamsById: Record<string, Team>,
  diffLevel: number
): BracketState {
  const config = getArchetypeConfig(archetype);
  const modifiedMatchups = { ...bracket.matchups };

  // Determine which leverage games to flip for this archetype
  const gamesToConsider = leverageGames.slice(0, Math.max(diffLevel * 2, leverageGames.length));

  let flipsRemaining = diffLevel;

  for (const lg of gamesToConsider) {
    if (flipsRemaining <= 0) break;

    const matchup = modifiedMatchups[lg.matchupId];
    if (!matchup || !matchup.teamAId || !matchup.teamBId) continue;

    const teamA = teamsById[matchup.teamAId];
    const teamB = teamsById[matchup.teamBId];
    if (!teamA || !teamB) continue;

    const currentWinner = matchup.winnerId;
    const currentIsA = currentWinner === matchup.teamAId;
    const currentTeam = currentIsA ? teamA : teamB;
    const alternateTeam = currentIsA ? teamB : teamA;

    let shouldFlip = false;

    // Archetype-specific flip logic
    switch (archetype) {
      case 'chalk': {
        // Chalk wants to ensure lower seeds win. Flip only if the
        // current pick is an upset and the favorite is strong.
        if (currentTeam.seed > alternateTeam.seed && lg.probA > 0.4) {
          shouldFlip = true;
        }
        break;
      }

      case 'contrarian': {
        // Contrarian picks the less popular side of close games.
        // In practice: if the current pick is the favorite, flip to underdog.
        if (currentTeam.seed <= alternateTeam.seed && lg.leverageScore > 2) {
          shouldFlip = Math.random() < 0.5 + config.upsetBias;
        }
        break;
      }

      case 'cinderella': {
        // Cinderella brackets aggressively pick mid-major / high-seed upsets.
        const isCinderellaCandidate = alternateTeam.seed >= 10;
        if (isCinderellaCandidate && currentTeam.seed < alternateTeam.seed) {
          // Check if this cinderella has traits that historically succeed
          const simAlt = simResults.teamResults[alternateTeam.id];
          if (simAlt && simAlt.sweetSixteenProb > 0.05) {
            shouldFlip = true;
          } else {
            shouldFlip = Math.random() < 0.3 + config.cinderellaBias;
          }
        }
        break;
      }

      case 'bold_final_four': {
        // Bold Final Four brackets pick unusual Final Four teams.
        // Focus flips on Elite 8 and Final Four games.
        const isLateRound = lg.round === 'Elite 8' || lg.round === 'Final Four' || lg.round === 'Championship';
        if (isLateRound) {
          // Prefer non-1-seeds to create a distinctive Final Four
          if (alternateTeam.seed > currentTeam.seed && alternateTeam.seed <= 6) {
            const simAlt = simResults.teamResults[alternateTeam.id];
            if (simAlt && simAlt.finalFourProb > 0.03) {
              shouldFlip = true;
            }
          }
        } else if (lg.round === 'Sweet 16' || lg.round === 'R32') {
          // Ensure the path is plausible for our bold FF picks
          if (alternateTeam.seed >= 3 && alternateTeam.seed <= 7) {
            shouldFlip = Math.random() < 0.3 + config.finalFourBias;
          }
        }
        break;
      }
    }

    if (shouldFlip) {
      // Flip the winner and propagate through subsequent rounds
      const newWinnerId = alternateTeam.id;
      modifiedMatchups[lg.matchupId] = {
        ...matchup,
        winnerId: newWinnerId,
        isUpset: alternateTeam.seed > (currentIsA ? teamA : teamB).seed,
        confidence: currentIsA ? 1 - (matchup.winProbA ?? 0.5) : matchup.winProbA ?? 0.5,
      };
      flipsRemaining--;

      // Propagate: if the old winner appears in later matchups, replace them
      propagateFlip(modifiedMatchups, currentWinner!, newWinnerId, lg.round);
    }
  }

  return {
    matchups: modifiedMatchups,
    teams: bracket.teams,
  };
}

/**
 * Propagate a winner flip through subsequent rounds.
 * If the old winner was advanced to later matchups, replace with new winner.
 */
function propagateFlip(
  matchups: Record<string, Matchup>,
  oldWinnerId: string,
  newWinnerId: string,
  startRound: Round
): void {
  const startIdx = ROUND_ORDER.indexOf(startRound);

  for (const matchup of Object.values(matchups)) {
    const roundIdx = ROUND_ORDER.indexOf(matchup.round as Round);
    if (roundIdx <= startIdx) continue;

    if (matchup.teamAId === oldWinnerId) {
      matchup.teamAId = newWinnerId;
    }
    if (matchup.teamBId === oldWinnerId) {
      matchup.teamBId = newWinnerId;
    }
    if (matchup.winnerId === oldWinnerId) {
      matchup.winnerId = newWinnerId;
    }
  }
}

/**
 * Assign archetypes to brackets based on pool configuration.
 * Ensures diversity in bracket strategies.
 */
function assignArchetypes(
  numBrackets: number,
  requestedArchetypes: BracketArchetype[]
): BracketArchetype[] {
  if (requestedArchetypes.length >= numBrackets) {
    return requestedArchetypes.slice(0, numBrackets);
  }

  const result: BracketArchetype[] = [...requestedArchetypes];
  const defaultRotation: BracketArchetype[] = [
    'chalk', 'contrarian', 'bold_final_four', 'cinderella',
  ];

  let rotIdx = 0;
  while (result.length < numBrackets) {
    const next = defaultRotation[rotIdx % defaultRotation.length];
    // Avoid excessive duplication
    if (result.filter((a) => a === next).length < Math.ceil(numBrackets / 4)) {
      result.push(next);
    }
    rotIdx++;
    // Safety valve
    if (rotIdx > numBrackets * 4) {
      result.push(defaultRotation[result.length % defaultRotation.length]);
    }
  }

  return result;
}

/**
 * Generate N differentiated brackets optimized for pool strategy.
 *
 * Strategy:
 * 1. Generate a "base" bracket using moderate settings
 * 2. Identify leverage games (close matchups with divergent paths)
 * 3. For each bracket, apply archetype-specific overrides on leverage games
 * 4. All brackets share high-confidence picks but diverge on leverage games
 *
 * @param teams - All tournament teams
 * @param simResults - Monte Carlo simulation results
 * @param poolConfig - Pool configuration (size, scoring, num brackets, archetypes)
 * @param weights - Model weights
 * @param biases - User biases
 * @param odds - Vegas odds (optional)
 * @param historicalTrends - Historical data (optional)
 * @param claudeBiases - Claude AI adjustments (optional)
 * @returns Array of BracketState, one per requested bracket
 */
export async function generateMultiBrackets(
  teams: Team[],
  simResults: SimulationResults,
  poolConfig: PoolConfig,
  weights: ModelWeights,
  biases: StructuredBias[],
  odds: MatchupOdds[] | undefined,
  historicalTrends: HistoricalTrends | undefined,
  claudeBiases?: ClaudeBiasAdjustment[],
  advancedSettings?: AdvancedModelSettings,
  onProgress?: (completed: number, total: number) => void
): Promise<BracketState[]> {
  const { numBrackets, poolSize, scoringSystem, archetypes } = poolConfig;

  // Step 1: Generate base bracket with moderate appetite
  const baseBracket = generateBracket(
    teams,
    simResults,
    'moderate',
    scoringSystem,
    weights,
    biases,
    odds,
    historicalTrends,
    claudeBiases,
    advancedSettings
  );

  // Step 2: Identify leverage games
  const leverageGames = identifyLeverageGames(simResults, baseBracket);

  // Step 3: Determine differentiation level based on pool size
  const diffLevel = getDifferentiationLevel(poolSize);

  // Step 4: Assign archetypes
  const assignedArchetypes = assignArchetypes(numBrackets, archetypes);

  // Build team lookup
  const teamsById: Record<string, Team> = {};
  for (const t of teams) {
    teamsById[t.id] = t;
  }

  // Step 5: Generate each bracket with archetype-specific modifications
  const brackets: BracketState[] = [];

  for (let i = 0; i < numBrackets; i++) {
    const archetype = assignedArchetypes[i];

    if (archetype === 'chalk' && i === 0) {
      // First chalk bracket can use the base bracket with conservative picks
      const chalkBracket = generateBracket(
        teams,
        simResults,
        'conservative',
        scoringSystem,
        weights,
        biases,
        odds,
        historicalTrends,
        claudeBiases,
        advancedSettings
      );
      brackets.push(chalkBracket);
    } else {
      // Apply archetype-specific overrides to base bracket
      // Each bracket gets a slightly different seed for randomized flip decisions
      const scaledDiffLevel = Math.max(
        1,
        Math.round(diffLevel * (0.7 + i * 0.15))
      );

      const modifiedBracket = applyArchetypeOverrides(
        // Deep-clone the base bracket to avoid cross-contamination
        deepCloneBracket(baseBracket),
        archetype,
        leverageGames,
        simResults,
        teamsById,
        scaledDiffLevel
      );

      brackets.push(modifiedBracket);
    }

    // Report progress and yield to the event loop between brackets
    if (onProgress) {
      onProgress(i + 1, numBrackets);
    }
    // Yield to the event loop so the UI can update with progress
    await new Promise((resolve) => setTimeout(resolve, 0));
  }

  return brackets;
}

// ── Portfolio Win Probability ────────────────────────────────

export interface PortfolioWinEstimate {
  winProbability: number;         // P(at least one bracket wins pool)
  top10Probability: number;       // P(at least one bracket in top 10%)
  top25Probability: number;       // P(at least one bracket in top 25%)
  optimalBracketCount: number;    // Recommended # of brackets for this pool
  perBracketWinProb: number[];    // Individual bracket win probabilities
  expectedROI: number;            // If entry fee = $10, expected return per dollar
}

/**
 * Estimate the probability that at least one bracket in the portfolio wins
 * or finishes in the top percentile of a pool.
 *
 * Approach (simplified but reasonable):
 * - Each bracket's "win probability" ~ 1/poolSize * diversityBonus
 * - diversityBonus accounts for how differentiated the bracket is from chalk
 * - Portfolio probability uses the complement formula with a correlation discount
 * - Correlation is estimated from shared picks between brackets
 */
export function estimatePortfolioWinProbability(
  brackets: BracketState[],
  poolSize: number,
  _simResults: SimulationResults,
  _teams: Record<string, Team>,
): PortfolioWinEstimate {
  const N = brackets.length;
  if (N === 0 || poolSize <= 0) {
    return {
      winProbability: 0,
      top10Probability: 0,
      top25Probability: 0,
      optimalBracketCount: 1,
      perBracketWinProb: [],
      expectedROI: 0,
    };
  }

  // --- Compute per-bracket uniqueness (how far from chalk) ---
  // Use the first bracket as the "chalk" reference (index 0 is typically chalk)
  const chalkBracket = brackets[0];
  const totalMatchups = Object.keys(chalkBracket.matchups).length;

  const perBracketUniqueness: number[] = brackets.map((b) => {
    let diffCount = 0;
    for (const id of Object.keys(chalkBracket.matchups)) {
      if (b.matchups[id]?.winnerId !== chalkBracket.matchups[id]?.winnerId) {
        diffCount++;
      }
    }
    // Uniqueness is fraction of picks that differ from chalk, 0..1
    return totalMatchups > 0 ? diffCount / totalMatchups : 0;
  });

  // --- Per-bracket win probability ---
  const baseSingleWinProb = 1 / poolSize;

  const perBracketWinProb: number[] = perBracketUniqueness.map((uniqueness) => {
    // Diversity bonus: more unique brackets have a slight edge in large pools
    const diversityBonus = 1 + uniqueness * 0.3;
    return Math.min(baseSingleWinProb * diversityBonus, 0.99);
  });

  // --- Correlation factor ---
  // Compute average shared-pick ratio across all bracket pairs
  let totalSharedRatio = 0;
  let pairCount = 0;
  for (let i = 0; i < N; i++) {
    for (let j = i + 1; j < N; j++) {
      let sharedPicks = 0;
      for (const id of Object.keys(brackets[i].matchups)) {
        if (brackets[i].matchups[id]?.winnerId === brackets[j].matchups[id]?.winnerId) {
          sharedPicks++;
        }
      }
      totalSharedRatio += totalMatchups > 0 ? sharedPicks / totalMatchups : 1;
      pairCount++;
    }
  }
  const avgSharedRatio = pairCount > 0 ? totalSharedRatio / pairCount : 1;
  const correlationFactor = 1 - avgSharedRatio * 0.7;

  // Effective independent brackets
  const effectiveIndependentBrackets = N * Math.max(correlationFactor, 0.1);

  // --- Portfolio probabilities ---
  const avgWinProb = perBracketWinProb.reduce((s, p) => s + p, 0) / N;
  const winProbability = 1 - Math.pow(1 - avgWinProb, effectiveIndependentBrackets);

  // Top 10%: each bracket has roughly poolSize*0.1 "winning" slots
  const top10Base = Math.min(0.1 * (1 + avgSharedRatio * 0.2), 0.99);
  const top10Probability = 1 - Math.pow(1 - top10Base, effectiveIndependentBrackets);

  // Top 25%: each bracket has roughly poolSize*0.25 "winning" slots
  const top25Base = Math.min(0.25 * (1 + avgSharedRatio * 0.1), 0.99);
  const top25Probability = 1 - Math.pow(1 - top25Base, effectiveIndependentBrackets);

  // --- Optimal bracket count ---
  // Find where marginal win probability gain < 1/poolSize
  const marginalThreshold = 1 / poolSize;
  let optimalBracketCount = 1;
  let prevProb = 1 - Math.pow(1 - avgWinProb, 1 * Math.max(correlationFactor, 0.1));
  for (let k = 2; k <= 20; k++) {
    const kProb = 1 - Math.pow(1 - avgWinProb, k * Math.max(correlationFactor, 0.1));
    const marginalGain = kProb - prevProb;
    if (marginalGain < marginalThreshold) break;
    optimalBracketCount = k;
    prevProb = kProb;
  }
  // Floor based on pool size heuristics
  if (poolSize <= 25) optimalBracketCount = Math.max(optimalBracketCount, 1);
  else if (poolSize <= 100) optimalBracketCount = Math.max(optimalBracketCount, 3);
  else optimalBracketCount = Math.max(optimalBracketCount, 5);
  optimalBracketCount = Math.min(optimalBracketCount, 10);

  // --- Expected ROI ---
  // Assuming entry fee = $10, prize pool = poolSize * $10, winner-take-all
  const prizePool = poolSize * 10;
  const totalCost = N * 10;
  const expectedReturn = winProbability * prizePool;
  const expectedROI = totalCost > 0 ? expectedReturn / totalCost : 0;

  return {
    winProbability,
    top10Probability,
    top25Probability,
    optimalBracketCount,
    perBracketWinProb,
    expectedROI,
  };
}

/**
 * Compute win probability curve: for bracket counts 1..maxN, compute portfolio win prob.
 * Used for the diminishing returns chart.
 */
export function computeWinProbCurve(
  brackets: BracketState[],
  poolSize: number,
  _simResults: SimulationResults,
  _teams: Record<string, Team>,
  maxN: number = 10,
): { n: number; probability: number }[] {
  if (brackets.length === 0 || poolSize <= 0) return [];

  // Reuse the same logic from estimatePortfolioWinProbability
  const chalkBracket = brackets[0];
  const totalMatchups = Object.keys(chalkBracket.matchups).length;

  const perBracketUniqueness: number[] = brackets.map((b) => {
    let diffCount = 0;
    for (const id of Object.keys(chalkBracket.matchups)) {
      if (b.matchups[id]?.winnerId !== chalkBracket.matchups[id]?.winnerId) {
        diffCount++;
      }
    }
    return totalMatchups > 0 ? diffCount / totalMatchups : 0;
  });

  const baseSingleWinProb = 1 / poolSize;
  const perBracketWinProb = perBracketUniqueness.map((u) =>
    Math.min(baseSingleWinProb * (1 + u * 0.3), 0.99)
  );

  let totalSharedRatio = 0;
  let pairCount = 0;
  const N = brackets.length;
  for (let i = 0; i < N; i++) {
    for (let j = i + 1; j < N; j++) {
      let sharedPicks = 0;
      for (const id of Object.keys(brackets[i].matchups)) {
        if (brackets[i].matchups[id]?.winnerId === brackets[j].matchups[id]?.winnerId) {
          sharedPicks++;
        }
      }
      totalSharedRatio += totalMatchups > 0 ? sharedPicks / totalMatchups : 1;
      pairCount++;
    }
  }
  const avgSharedRatio = pairCount > 0 ? totalSharedRatio / pairCount : 1;
  const correlationFactor = Math.max(1 - avgSharedRatio * 0.7, 0.1);
  const avgWinProb = perBracketWinProb.reduce((s, p) => s + p, 0) / Math.max(N, 1);

  const curve: { n: number; probability: number }[] = [];
  for (let k = 1; k <= maxN; k++) {
    const prob = 1 - Math.pow(1 - avgWinProb, k * correlationFactor);
    curve.push({ n: k, probability: prob });
  }
  return curve;
}

/**
 * Deep-clone a BracketState to avoid mutation between bracket variations.
 */
function deepCloneBracket(bracket: BracketState): BracketState {
  const clonedMatchups: Record<string, Matchup> = {};
  for (const [key, matchup] of Object.entries(bracket.matchups)) {
    clonedMatchups[key] = { ...matchup };
  }
  return {
    matchups: clonedMatchups,
    teams: bracket.teams, // teams are read-only, safe to share reference
  };
}
