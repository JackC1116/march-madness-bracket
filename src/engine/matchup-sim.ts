// ============================================================
// Matchup Simulation Engine
// ============================================================

import type {
  Team,
  Round,
  HistoricalTrends,
  AdvancedModelSettings,
} from '../types';

/**
 * Standard logistic function: converts a rating differential into a probability.
 * k controls steepness; calibrated so a ~10-point CPR gap yields ~75% win probability.
 */
function logistic(diff: number, k: number = 5.0): number {
  return 1 / (1 + Math.exp(-k * diff));
}

/**
 * Compute a style-matchup modifier based on how two teams' profiles interact.
 *
 * - Tempo mismatches increase variance (slight boost to underdog).
 * - Defensive / grind-it-out teams receive a "March bonus" reflecting
 *   the historical advantage of defense in tournament play.
 * - Three-point-heavy teams have higher variance (can shoot themselves
 *   in or out of a game).
 *
 * Returns a multiplier centered around 1.0 (typically 0.90 - 1.10).
 */
function computeStyleMatchupModifier(teamA: Team, teamB: Team): number {
  let modifier = 1.0;

  // --- Tempo mismatch ---
  const tempoValues: Record<string, number> = { fast: 3, medium: 2, slow: 1 };
  const tempoA = tempoValues[teamA.profile.tempo] ?? 2;
  const tempoB = tempoValues[teamB.profile.tempo] ?? 2;
  const tempoMismatch = Math.abs(tempoA - tempoB);

  // Large tempo mismatch increases variance, which benefits the underdog.
  // We apply this symmetrically — the caller's probability already captures
  // who the favorite is, so this just slightly compresses toward 0.5.
  if (tempoMismatch >= 2) {
    modifier *= 0.97; // slight regression toward coin-flip
  }

  // --- March defensive bonus ---
  // Defensive teams historically outperform their regular-season metrics
  // in the tournament pressure cooker.
  const marchDefenseBonus = (team: Team): number => {
    if (team.profile.style === 'defensive') return 0.03;
    if (team.profile.style === 'grind-it-out') return 0.025;
    return 0;
  };

  // Apply differential defensive bonus: positive means teamA benefits
  const defDiff = marchDefenseBonus(teamA) - marchDefenseBonus(teamB);
  modifier += defDiff;

  // --- Three-point variance ---
  // Teams reliant on the three have higher variance: they can beat
  // anyone on a hot shooting night but also flame out.
  const highThreeThreshold = 0.38;
  const aIsThreeHeavy = teamA.profile.threePtRate > highThreeThreshold;
  const bIsThreeHeavy = teamB.profile.threePtRate > highThreeThreshold;

  if (aIsThreeHeavy && !bIsThreeHeavy) {
    modifier *= 0.98; // slight compression — three-point reliance is volatile
  } else if (bIsThreeHeavy && !aIsThreeHeavy) {
    modifier *= 1.02;
  }

  // --- Turnover-forcing defense vs. turnover-prone offense ---
  // A team with low turnover rate facing a high-turnover opponent benefits.
  const toDiff = teamB.profile.turnoverRate - teamA.profile.turnoverRate;
  if (toDiff > 0.05) {
    modifier += 0.015;
  } else if (toDiff < -0.05) {
    modifier -= 0.015;
  }

  return modifier;
}

/**
 * Round-specific historical trend modifier.
 *
 * Some seed matchups historically deviate from what pure metrics predict.
 * Classic example: 12-seeds beat 5-seeds at ~35% instead of the ~25%
 * that metrics might suggest.
 *
 * Returns a multiplier on team A's win probability. Centered around 1.0.
 */
function computeTrendModifier(
  teamA: Team,
  teamB: Team,
  round: Round,
  historicalTrends: HistoricalTrends | undefined
): number {
  if (!historicalTrends || historicalTrends.seedMatchups.length === 0) {
    return 1.0;
  }

  const higherSeed = Math.min(teamA.seed, teamB.seed);
  const lowerSeed = Math.max(teamA.seed, teamB.seed);
  const teamAIsHigherSeed = teamA.seed <= teamB.seed;

  // Find matching historical record
  const match = historicalTrends.seedMatchups.find(
    (sm) =>
      sm.higherSeed === higherSeed &&
      sm.lowerSeed === lowerSeed &&
      sm.round === round
  );

  if (!match || match.gamesPlayed < 10) {
    return 1.0;
  }

  // Historical expected win rate for the higher seed
  const historicalHigherSeedWinRate = match.higherSeedWins / match.gamesPlayed;
  // If the upset rate is notably higher than expected, adjust
  // The modifier nudges the probability toward the historical baseline.
  // We keep it subtle (max ~5% shift) to avoid overriding metrics.
  if (teamAIsHigherSeed) {
    // If history says higher seeds win less than expected, reduce teamA's prob
    const historicalAdjust = historicalHigherSeedWinRate;
    // Blend: modifier is a ratio that adjusts from pure-metric toward historical
    // For example, if historical win rate for 5-seed vs 12-seed is 0.65 instead
    // of the metric-implied ~0.75, modifier will be < 1.0
    return 0.85 + 0.15 * (historicalAdjust / Math.max(historicalAdjust, 0.5));
  } else {
    // teamA is the lower seed (underdog)
    const upsetRate = match.upsetRate;
    return 0.85 + 0.15 * (upsetRate / Math.max(1 - upsetRate, 0.5));
  }
}

/**
 * Conference performance adjustment.
 * Some conferences consistently over- or under-perform in March.
 */
function conferenceAdjustment(
  teamA: Team,
  teamB: Team,
  historicalTrends: HistoricalTrends | undefined
): number {
  if (!historicalTrends || historicalTrends.conferencePerformance.length === 0) {
    return 1.0;
  }

  const confA = historicalTrends.conferencePerformance.find(
    (c) => c.conference === teamA.conference
  );
  const confB = historicalTrends.conferencePerformance.find(
    (c) => c.conference === teamB.conference
  );

  if (!confA || !confB) return 1.0;

  const confDiff = confA.tournamentWinRate - confB.tournamentWinRate;
  // Subtle adjustment: max ~3% shift
  return 1.0 + confDiff * 0.1;
}

/**
 * Compute the win probability for team A over team B.
 *
 * P(A beats B) = logistic(CPR_A - CPR_B)
 *              * style_matchup_modifier
 *              * trend_modifier
 *              * conference_modifier
 *
 * Result is clamped to [0.02, 0.98] to avoid certainties.
 */
export function computeWinProbability(
  teamA: Team,
  teamB: Team,
  cprA: number,
  cprB: number,
  round: Round,
  historicalTrends: HistoricalTrends | undefined,
  advancedSettings?: AdvancedModelSettings
): number {
  const diff = cprA - cprB;
  let prob = logistic(diff);

  const styleModifier = computeStyleMatchupModifier(teamA, teamB);
  const trendModifier = computeTrendModifier(teamA, teamB, round, historicalTrends);
  const confModifier = conferenceAdjustment(teamA, teamB, historicalTrends);

  prob = prob * styleModifier * trendModifier * confModifier;

  // --- Tempo Trapezoid: increase variance for extreme tempo teams ---
  if (advancedSettings?.tempoTrapezoid) {
    const { tempoMinRange, tempoMaxRange } = advancedSettings;
    const aOutside = teamA.kenpom.adjT < tempoMinRange || teamA.kenpom.adjT > tempoMaxRange;
    const bOutside = teamB.kenpom.adjT < tempoMinRange || teamB.kenpom.adjT > tempoMaxRange;

    if (aOutside || bOutside) {
      // Increase upset probability by compressing toward 0.5
      // Multiply the upset boost by 1.2 for teams with extreme tempo
      const upsetBoost = 1.2;
      // Move probability toward 0.5 (increase variance / upset chance)
      const distFromHalf = prob - 0.5;
      prob = 0.5 + distFromHalf / upsetBoost;
    }
  }

  // Clamp to avoid 0% or 100% — upsets always possible in March
  return Math.max(0.02, Math.min(0.98, prob));
}

/**
 * Simulate a single matchup outcome given a win probability for team A.
 * Returns true if team A wins, false if team B wins.
 */
export function simulateMatchup(probAWins: number): boolean {
  return Math.random() < probAWins;
}
