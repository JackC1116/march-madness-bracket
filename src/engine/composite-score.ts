// ============================================================
// Composite Power Rating (CPR) Engine
// ============================================================

import type {
  Team,
  ModelWeights,
  StructuredBias,
  ClaudeBiasAdjustment,
  MatchupOdds,
  HistoricalTrends,
} from '../types';

/**
 * Normalize a value into the 0-1 range given known min/max bounds.
 * Clamps output to [0, 1].
 */
export function normalizeValue(value: number, min: number, max: number): number {
  if (max === min) return 0.5;
  const normalized = (value - min) / (max - min);
  return Math.max(0, Math.min(1, normalized));
}

/**
 * Normalize a rank inversely: lower rank (better) maps to a higher score.
 * Rank 1 -> ~1.0, Rank 353 -> ~0.0
 */
function normalizeRankInverse(rank: number, minRank: number, maxRank: number): number {
  if (maxRank === minRank) return 0.5;
  return 1 - (rank - minRank) / (maxRank - minRank);
}

/**
 * Historical seed adjustment: seeds 1-4 get a boost reflecting their
 * historical tournament success rate; mid-seeds get moderate credit;
 * high seeds (13-16) get penalized. Returns value in [0, 1].
 */
function historicalSeedAdjustment(seed: number, trends: HistoricalTrends | undefined): number {
  // Base adjustment curve: lower seed = higher adjustment
  const baseCurve: Record<number, number> = {
    1: 0.95, 2: 0.85, 3: 0.78, 4: 0.70,
    5: 0.58, 6: 0.55, 7: 0.50, 8: 0.45,
    9: 0.43, 10: 0.40, 11: 0.38, 12: 0.35,
    13: 0.20, 14: 0.12, 15: 0.05, 16: 0.02,
  };

  let adjustment = baseCurve[seed] ?? 0.3;

  // Refine with actual historical data if available
  if (trends && trends.seedMatchups.length > 0) {
    const relevantMatchups = trends.seedMatchups.filter(
      (sm) => sm.higherSeed === seed || sm.lowerSeed === seed
    );
    if (relevantMatchups.length > 0) {
      const totalGames = relevantMatchups.reduce((sum, m) => sum + m.gamesPlayed, 0);
      const totalWins = relevantMatchups.reduce((sum, m) => {
        if (m.higherSeed === seed) return sum + m.higherSeedWins;
        return sum + (m.gamesPlayed - m.higherSeedWins);
      }, 0);
      if (totalGames > 0) {
        const historicalWinRate = totalWins / totalGames;
        // Blend base curve with historical data (70/30 to smooth noise)
        adjustment = 0.7 * adjustment + 0.3 * historicalWinRate;
      }
    }
  }

  return adjustment;
}

/**
 * Experience factor based on team profile characteristics.
 * Teams with defensive identity, low turnover rate, and high FT rate
 * historically perform better in March. Returns value in [0, 1].
 */
function experienceFactor(team: Team): number {
  let score = 0.5;

  // Defensive teams historically overperform in tournament
  if (team.profile.style === 'defensive' || team.profile.style === 'grind-it-out') {
    score += 0.12;
  }

  // Low turnover rate is critical in single-elimination
  // turnoverRate typically 10-25%, lower is better
  score += (1 - normalizeValue(team.profile.turnoverRate, 0.10, 0.25)) * 0.15;

  // High FT rate suggests poise under pressure
  score += normalizeValue(team.profile.ftRate, 0.20, 0.45) * 0.10;

  // Offensive rebounding provides second chances
  score += normalizeValue(team.profile.orbRate, 0.20, 0.40) * 0.08;

  // Balanced teams are adaptable
  if (team.profile.style === 'balanced') {
    score += 0.05;
  }

  return Math.max(0, Math.min(1, score));
}

/**
 * Compute user bias modifier for a team from structured biases and Claude adjustments.
 * Returns a value typically in [-0.3, 0.3] that is added directly to CPR.
 */
function computeBiasModifier(
  team: Team,
  biases: StructuredBias[],
  claudeBiases?: ClaudeBiasAdjustment[]
): number {
  let modifier = 0;

  for (const bias of biases) {
    switch (bias.type) {
      case 'lock':
        // Locking a team gives it a strong boost
        if (bias.targetId === team.id) {
          modifier += 0.25;
        }
        break;
      case 'eliminate':
        // Eliminating a team heavily penalizes it
        if (bias.targetId === team.id) {
          modifier -= 0.5;
        }
        break;
      case 'boost_conference':
        if (team.conference === bias.targetId) {
          modifier += bias.modifier ?? 0.1;
        }
        break;
      case 'penalize_conference':
        if (team.conference === bias.targetId) {
          modifier += bias.modifier ?? -0.1;
        }
        break;
    }
  }

  // Apply Claude's bias adjustments
  if (claudeBiases) {
    for (const cb of claudeBiases) {
      if (cb.teamId === team.id) {
        modifier += cb.modifier;
      }
    }
  }

  return modifier;
}

/**
 * Find vegas implied probability for a given team from odds data.
 * Returns 0.5 if no odds data is available.
 */
function findVegasImpliedProb(teamId: string, odds: MatchupOdds[] | undefined): number {
  if (!odds || odds.length === 0) return 0.5;

  for (const o of odds) {
    if (o.teamAId === teamId) return o.impliedProbA;
    if (o.teamBId === teamId) return 1 - o.impliedProbA;
  }
  return 0.5;
}

export interface CPRContext {
  allTeams: Team[];
  weights: ModelWeights;
  biases: StructuredBias[];
  claudeBiases?: ClaudeBiasAdjustment[];
  odds?: MatchupOdds[];
  historicalTrends?: HistoricalTrends;
}

/**
 * Precompute normalization bounds across all teams for consistent scaling.
 */
function computeBounds(teams: Team[]) {
  const adjEMs = teams.map((t) => t.kenpom.adjEM);
  const barthags = teams.map((t) => t.barttorvik.barthag);
  const netRanks = teams.map((t) => t.net.rank);
  const sagarinRatings = teams.map((t) => t.sagarin.rating);

  return {
    adjEM: { min: Math.min(...adjEMs), max: Math.max(...adjEMs) },
    barthag: { min: Math.min(...barthags), max: Math.max(...barthags) },
    netRank: { min: Math.min(...netRanks), max: Math.max(...netRanks) },
    sagarin: { min: Math.min(...sagarinRatings), max: Math.max(...sagarinRatings) },
  };
}

/**
 * Compute the Composite Power Rating (CPR) for a single team.
 *
 * CPR = w1 * normalize(kenpom_adjEM)
 *     + w2 * normalize(barttorvik_barthag)
 *     + w3 * normalize(net_rank)          [inversely]
 *     + w4 * normalize(sagarin_rating)
 *     + w5 * normalize(vegas_implied_prob)
 *     + w6 * historical_seed_adjustment
 *     + w7 * experience_factor
 *     + user_bias_modifier
 */
export function computeCPR(
  team: Team,
  weights: ModelWeights,
  biases: StructuredBias[],
  odds: MatchupOdds[] | undefined,
  historicalTrends: HistoricalTrends | undefined,
  bounds: {
    adjEM: { min: number; max: number };
    barthag: { min: number; max: number };
    netRank: { min: number; max: number };
    sagarin: { min: number; max: number };
  },
  claudeBiases?: ClaudeBiasAdjustment[]
): number {
  const normKenpom = normalizeValue(team.kenpom.adjEM, bounds.adjEM.min, bounds.adjEM.max);
  const normBarthag = normalizeValue(team.barttorvik.barthag, bounds.barthag.min, bounds.barthag.max);
  const normNet = normalizeRankInverse(team.net.rank, bounds.netRank.min, bounds.netRank.max);
  const normSagarin = normalizeValue(team.sagarin.rating, bounds.sagarin.min, bounds.sagarin.max);
  const normVegas = findVegasImpliedProb(team.id, odds);
  const histAdj = historicalSeedAdjustment(team.seed, historicalTrends);
  const expFactor = experienceFactor(team);
  const biasModifier = computeBiasModifier(team, biases, claudeBiases);

  const cpr =
    weights.kenpom * normKenpom +
    weights.barttorvik * normBarthag +
    weights.net * normNet +
    weights.sagarin * normSagarin +
    weights.vegas * normVegas +
    weights.historical * histAdj +
    weights.experience * expFactor +
    biasModifier;

  return cpr;
}

/**
 * Compute CPR for all teams, returning a map of teamId -> CPR.
 * This precomputes normalization bounds once for consistency.
 */
export function computeAllCPR(context: CPRContext): Record<string, number> {
  const { allTeams, weights, biases, claudeBiases, odds, historicalTrends } = context;
  const bounds = computeBounds(allTeams);
  const results: Record<string, number> = {};

  for (const team of allTeams) {
    results[team.id] = computeCPR(
      team,
      weights,
      biases,
      odds,
      historicalTrends,
      bounds,
      claudeBiases
    );
  }

  return results;
}
