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
  AdvancedModelSettings,
} from '../types';
import { computeAllCPR, computeChampionViability } from './composite-score';
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
 * Resolve First Four matchups using probability-based selection.
 * Respects the simulation's win probabilities rather than always picking the favorite.
 */
interface FirstFourResult {
  resolvedTeams: Team[];
  matchups: Record<string, Matchup>;
}

function resolveFirstFour(teams: Team[], cprMap: Record<string, number>): FirstFourResult {
  const firstFour = teams.filter((t) => t.isFirstFour);
  const regular = teams.filter((t) => !t.isFirstFour);
  const resolved = [...regular];
  const processed = new Set<string>();
  const ffMatchups: Record<string, Matchup> = {};
  let position = 0;

  for (const team of firstFour) {
    if (processed.has(team.id)) continue;
    const opp = firstFour.find((t) => t.id === team.firstFourOpponentId);
    if (opp) {
      processed.add(team.id);
      processed.add(opp.id);
      position++;
      // Use CPR differential to compute win probability, then sample
      const diff = cprMap[team.id] - cprMap[opp.id];
      const probTeamWins = 1 / (1 + Math.exp(-5 * diff));
      const winner = Math.random() < probTeamWins ? team : opp;
      resolved.push(winner);

      const id = `ff-${position}`;
      ffMatchups[id] = {
        id,
        round: 'First Four' as Round,
        region: team.region,
        position,
        teamAId: team.id,
        teamBId: opp.id,
        winnerId: winner.id,
        winProbA: probTeamWins,
        locked: false,
        isUpset: winner.id === opp.id && cprMap[team.id] > cprMap[opp.id],
        confidence: Math.abs(probTeamWins - 0.5) * 2,
      };
    } else {
      resolved.push(team);
    }
  }

  return { resolvedTeams: resolved, matchups: ffMatchups };
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
  claudeBiases?: ClaudeBiasAdjustment[],
  advancedSettings?: AdvancedModelSettings
): BracketState {
  // Compute CPR
  const cprMap = computeAllCPR({
    allTeams: teams,
    weights,
    biases,
    claudeBiases,
    odds,
    historicalTrends,
    advancedSettings,
  });

  // Resolve First Four
  const { resolvedTeams, matchups: ffMatchups } = resolveFirstFour(teams, cprMap);

  // Index by ID
  const teamsById: Record<string, Team> = {};
  for (const t of teams) {
    teamsById[t.id] = t;
  }

  // Build matchups structure — start with First Four matchups
  const matchups: Record<string, Matchup> = { ...ffMatchups };
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
        'R64', historicalTrends, advancedSettings
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
          round, historicalTrends, advancedSettings
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

    // Apply champion filter: adjust CPR for Final Four viability
    let adjustedCprA = cprMap[teamA.id];
    let adjustedCprB = cprMap[teamB.id];
    if (advancedSettings?.championFilter) {
      const viabilityA = computeChampionViability(teamA, advancedSettings);
      const viabilityB = computeChampionViability(teamB, advancedSettings);
      if (!viabilityA) adjustedCprA -= 0.1;
      if (!viabilityB) adjustedCprB -= 0.1;
    }

    const probA = computeWinProbability(
      teamA, teamB, adjustedCprA, adjustedCprB,
      'Final Four', historicalTrends, advancedSettings
    );

    const result = pickWinner(
      { teamA, teamB, probA, cprA: adjustedCprA, cprB: adjustedCprB },
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

    // Apply champion filter: adjust CPR for Championship viability
    let adjustedCprA = cprMap[teamA.id];
    let adjustedCprB = cprMap[teamB.id];
    if (advancedSettings?.championFilter) {
      const viabilityA = computeChampionViability(teamA, advancedSettings);
      const viabilityB = computeChampionViability(teamB, advancedSettings);
      if (!viabilityA) adjustedCprA -= 0.1;
      if (!viabilityB) adjustedCprB -= 0.1;
    }

    const probA = computeWinProbability(
      teamA, teamB, adjustedCprA, adjustedCprB,
      'Championship', historicalTrends, advancedSettings
    );

    const result = pickWinner(
      { teamA, teamB, probA, cprA: adjustedCprA, cprB: adjustedCprB },
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

  // --- Post-processing: Upset Calibration ---
  if (advancedSettings?.upsetCalibration) {
    applyUpsetCalibration(matchups, teamsById, advancedSettings);
  }

  // --- Post-processing: Contrarian Value ---
  if (advancedSettings?.contrarianValue) {
    applyContrarianValue(matchups, teamsById, advancedSettings);
  }

  return {
    matchups,
    teams: teamsById,
  };
}

/**
 * Post-process bracket to calibrate the number of first-round upsets.
 *
 * - If fewer than minFirstRoundUpsets, flip close chalk matchups to upsets.
 * - If more than maxFirstRoundUpsets, flip some upsets back to chalk.
 * - If alwaysPick12Over5 is on, ensure at least one 12-over-5 upset exists.
 */
function applyUpsetCalibration(
  matchups: Record<string, Matchup>,
  teamsById: Record<string, Team>,
  settings: AdvancedModelSettings
): void {
  const r64Matchups = Object.values(matchups).filter((m) => m.round === 'R64');

  // Identify upsets and non-upsets with their closeness
  const upsets: { id: string; confidence: number }[] = [];
  const chalk: { id: string; confidence: number }[] = [];

  for (const m of r64Matchups) {
    if (!m.teamAId || !m.teamBId || !m.winnerId) continue;
    if (m.isUpset) {
      upsets.push({ id: m.id, confidence: m.confidence });
    } else {
      chalk.push({ id: m.id, confidence: m.confidence });
    }
  }

  // Sort chalk by confidence ascending (closest games first — best upset candidates)
  chalk.sort((a, b) => a.confidence - b.confidence);
  // Sort upsets by confidence ascending (weakest upsets first — best to flip back)
  upsets.sort((a, b) => a.confidence - b.confidence);

  // If too few upsets, flip close chalk to upsets
  while (upsets.length < settings.minFirstRoundUpsets && chalk.length > 0) {
    const toFlip = chalk.shift()!;
    const m = matchups[toFlip.id];
    if (!m || !m.teamAId || !m.teamBId) continue;

    const teamA = teamsById[m.teamAId];
    const teamB = teamsById[m.teamBId];
    if (!teamA || !teamB) continue;

    // Flip winner to the higher-seeded (underdog) team
    const underdog = teamA.seed > teamB.seed ? teamA : teamB;
    m.winnerId = underdog.id;
    m.isUpset = true;
    m.confidence = 1 - m.confidence;
    upsets.push({ id: m.id, confidence: m.confidence });
  }

  // If too many upsets, flip some back to chalk
  while (upsets.length > settings.maxFirstRoundUpsets && upsets.length > 0) {
    const toFlip = upsets.shift()!;
    const m = matchups[toFlip.id];
    if (!m || !m.teamAId || !m.teamBId) continue;

    const teamA = teamsById[m.teamAId];
    const teamB = teamsById[m.teamBId];
    if (!teamA || !teamB) continue;

    // Flip winner to the lower-seeded (favorite) team
    const favorite = teamA.seed <= teamB.seed ? teamA : teamB;
    m.winnerId = favorite.id;
    m.isUpset = false;
    m.confidence = 1 - m.confidence;
  }

  // Ensure at least one 12-over-5 upset if setting is on
  if (settings.alwaysPick12Over5) {
    const has12over5 = r64Matchups.some((m) => {
      if (!m.winnerId || !m.teamAId || !m.teamBId) return false;
      const winner = teamsById[m.winnerId];
      const teamA = teamsById[m.teamAId];
      const teamB = teamsById[m.teamBId];
      if (!winner || !teamA || !teamB) return false;
      const is5v12 = (teamA.seed === 5 && teamB.seed === 12) || (teamA.seed === 12 && teamB.seed === 5);
      return is5v12 && winner.seed === 12;
    });

    if (!has12over5) {
      // Find the closest 5-vs-12 matchup and flip it
      const candidates = r64Matchups.filter((m) => {
        if (!m.teamAId || !m.teamBId) return false;
        const teamA = teamsById[m.teamAId];
        const teamB = teamsById[m.teamBId];
        if (!teamA || !teamB) return false;
        return (teamA.seed === 5 && teamB.seed === 12) || (teamA.seed === 12 && teamB.seed === 5);
      });

      // Pick the one with the closest probability (best upset candidate)
      candidates.sort((a, b) => a.confidence - b.confidence);
      if (candidates.length > 0) {
        const m = matchups[candidates[0].id];
        if (m && m.teamAId && m.teamBId) {
          const teamA = teamsById[m.teamAId];
          const teamB = teamsById[m.teamBId];
          if (teamA && teamB) {
            const twelve = teamA.seed === 12 ? teamA : teamB;
            m.winnerId = twelve.id;
            m.isUpset = true;
          }
        }
      }
    }
  }
}

/**
 * Post-process bracket with contrarian value picks.
 *
 * For each R64/R32 matchup, compute a "value ratio" = true_probability / estimated_public_pick_pct.
 * Picks with ratio > 1.0 are value picks — boost their selection by flipping some picks to them.
 *
 * We estimate public pick percentage using seed as a proxy:
 * lower seeds are picked more heavily by the public.
 */
function applyContrarianValue(
  matchups: Record<string, Matchup>,
  teamsById: Record<string, Team>,
  settings: AdvancedModelSettings
): void {
  // Estimate public pick percentage by seed — the public heavily favors lower seeds
  const publicPickBySeed: Record<number, number> = {
    1: 0.97, 2: 0.92, 3: 0.85, 4: 0.78,
    5: 0.64, 6: 0.62, 7: 0.60, 8: 0.50,
    9: 0.50, 10: 0.40, 11: 0.38, 12: 0.36,
    13: 0.22, 14: 0.15, 15: 0.08, 16: 0.03,
  };

  const earlyRounds = Object.values(matchups).filter(
    (m) => m.round === 'R64' || m.round === 'R32'
  );

  for (const m of earlyRounds) {
    if (!m.teamAId || !m.teamBId || !m.winnerId || m.winProbA === null) continue;

    const teamA = teamsById[m.teamAId];
    const teamB = teamsById[m.teamBId];
    if (!teamA || !teamB) continue;

    const currentWinner = teamsById[m.winnerId];
    if (!currentWinner) continue;

    const otherTeam = currentWinner.id === teamA.id ? teamB : teamA;
    const otherProb = currentWinner.id === teamA.id ? (1 - m.winProbA) : m.winProbA;
    const otherPublicPick = publicPickBySeed[otherTeam.seed] ?? 0.5;

    // Value ratio for the non-picked team
    const valueRatio = otherProb / Math.max(otherPublicPick, 0.01);

    // If the other team has contrarian value and a reasonable win probability, consider flipping
    if (valueRatio > 1.0 && otherProb > 0.3) {
      // Flip with probability proportional to contrarian strength and value ratio
      const flipProb = Math.min(0.8, settings.contrarianStrength * (valueRatio - 1.0));
      if (Math.random() < flipProb) {
        m.winnerId = otherTeam.id;
        m.isUpset = otherTeam.seed > currentWinner.seed;
        m.confidence = otherProb;
      }
    }
  }
}
