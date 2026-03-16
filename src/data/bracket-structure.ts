import type { Team, Matchup, BracketState, Region, Round } from '../types';

// Seed matchups for Round of 64: position -> [topSeed, bottomSeed]
const R64_SEED_PAIRINGS: [number, number][] = [
  [1, 16],
  [8, 9],
  [5, 12],
  [4, 13],
  [6, 11],
  [3, 14],
  [7, 10],
  [2, 15],
];

const REGIONS: Region[] = ['East', 'South', 'West', 'Midwest'];

// Final Four bracket: East vs West, South vs Midwest
const FINAL_FOUR_PAIRINGS: [Region, Region][] = [
  ['East', 'West'],
  ['South', 'Midwest'],
];

/**
 * Build a matchup ID.
 * First Four:    "ff-{position}"
 * Regional:      "{region}-{round}-{position}"
 * Final Four:    "ff4-{position}"
 * Championship:  "champ"
 */
function makeMatchupId(round: Round, region: Region | 'Final Four', position: number): string {
  if (round === 'First Four') return `ff-${position}`;
  if (round === 'Championship') return 'champ';
  if (round === 'Final Four') return `ff4-${position}`;

  const regionKey = region.toLowerCase().replace(' ', '');
  const roundKey = round.toLowerCase().replace(' ', '');
  return `${regionKey}-${roundKey}-${position}`;
}

/**
 * Given a round and position within that round (for a single region),
 * return the matchup ID of the next-round game the winner feeds into,
 * plus which slot (A or B) the winner occupies.
 */
function getNextMatchup(
  round: Round,
  region: Region | 'Final Four',
  position: number,
): { nextMatchupId: string; slot: 'A' | 'B' } | null {
  const nextPosition = Math.floor((position - 1) / 2) + 1;
  const slot: 'A' | 'B' = position % 2 === 1 ? 'A' : 'B';

  switch (round) {
    case 'First Four':
      // First Four winners go into R64 at a specific position — handled separately
      return null;
    case 'R64':
      return { nextMatchupId: makeMatchupId('R32', region, nextPosition), slot };
    case 'R32':
      return { nextMatchupId: makeMatchupId('Sweet 16', region, nextPosition), slot };
    case 'Sweet 16':
      return { nextMatchupId: makeMatchupId('Elite 8', region, nextPosition), slot };
    case 'Elite 8': {
      // Winners go to Final Four
      const ff4Pos = region === FINAL_FOUR_PAIRINGS[0][0] || region === FINAL_FOUR_PAIRINGS[0][1]
        ? 1
        : 2;
      const ff4Slot: 'A' | 'B' =
        region === FINAL_FOUR_PAIRINGS[0][0] || region === FINAL_FOUR_PAIRINGS[1][0] ? 'A' : 'B';
      return { nextMatchupId: makeMatchupId('Final Four', 'Final Four', ff4Pos), slot: ff4Slot };
    }
    case 'Final Four':
      return { nextMatchupId: 'champ', slot };
    case 'Championship':
      return null;
    default:
      return null;
  }
}

/**
 * Determine the First Four matchups and which R64 slot they feed into.
 * Returns an array of { teamAId, teamBId, region, r64Position } objects.
 */
interface FirstFourConfig {
  teamAId: string;
  teamBId: string;
  region: Region;
  r64Position: number; // which R64 position slot (1=1v16, 5=6v11, etc.)
  r64Slot: 'A' | 'B'; // which team slot in the R64 matchup (B for 16 seeds, B for 11 seeds)
}

const FIRST_FOUR_CONFIGS: FirstFourConfig[] = [
  { teamAId: 'umbc', teamBId: 'howard', region: 'Midwest', r64Position: 1, r64Slot: 'B' },
  { teamAId: 'prairie-view', teamBId: 'lehigh', region: 'South', r64Position: 1, r64Slot: 'B' },
  { teamAId: 'texas', teamBId: 'nc-state', region: 'West', r64Position: 5, r64Slot: 'B' },
  { teamAId: 'miami-oh', teamBId: 'smu', region: 'Midwest', r64Position: 5, r64Slot: 'B' },
];

/**
 * Find a team by seed and region from the teams array.
 * For First Four teams, they share a seed/region, so we skip them here.
 */
function findTeam(teams: Team[], seed: number, region: Region): Team | undefined {
  return teams.find(
    (t) => t.seed === seed && t.region === region && !t.isFirstFour,
  );
}

/**
 * Initialize the full 67-game bracket (4 First Four + 63 main bracket).
 */
export function initializeBracket(teams: Team[]): BracketState {
  const matchups: Record<string, Matchup> = {};
  const teamsMap: Record<string, Team> = {};

  // Index all teams
  for (const team of teams) {
    teamsMap[team.id] = team;
  }

  // --- First Four (4 games) ---
  for (let i = 0; i < FIRST_FOUR_CONFIGS.length; i++) {
    const config = FIRST_FOUR_CONFIGS[i];
    const id = makeMatchupId('First Four', config.region, i + 1);
    matchups[id] = {
      id,
      round: 'First Four',
      region: config.region,
      position: i + 1,
      teamAId: config.teamAId,
      teamBId: config.teamBId,
      winnerId: null,
      winProbA: null,
      locked: false,
      isUpset: false,
      confidence: 0,
    };
  }

  // --- Round of 64 (32 games, 8 per region) ---
  for (const region of REGIONS) {
    for (let pos = 1; pos <= 8; pos++) {
      const [seedA, seedB] = R64_SEED_PAIRINGS[pos - 1];
      const id = makeMatchupId('R64', region, pos);

      const teamA = findTeam(teams, seedA, region);
      let teamBId: string | null = null;

      // Check if this slot has a First Four feeder
      const ffConfig = FIRST_FOUR_CONFIGS.find(
        (ff) => ff.region === region && ff.r64Position === pos,
      );

      if (ffConfig) {
        // The non-First-Four team is in slot A, First Four winner in slot B
        if (ffConfig.r64Slot === 'B') {
          // teamB will be filled when First Four is resolved; leave null
          teamBId = null;
        }
      } else {
        const teamB = findTeam(teams, seedB, region);
        teamBId = teamB?.id ?? null;
      }

      matchups[id] = {
        id,
        round: 'R64',
        region,
        position: pos,
        teamAId: teamA?.id ?? null,
        teamBId,
        winnerId: null,
        winProbA: null,
        locked: false,
        isUpset: false,
        confidence: 0,
      };
    }
  }

  // --- Round of 32 (16 games, 4 per region) ---
  for (const region of REGIONS) {
    for (let pos = 1; pos <= 4; pos++) {
      const id = makeMatchupId('R32', region, pos);
      matchups[id] = {
        id,
        round: 'R32',
        region,
        position: pos,
        teamAId: null,
        teamBId: null,
        winnerId: null,
        winProbA: null,
        locked: false,
        isUpset: false,
        confidence: 0,
      };
    }
  }

  // --- Sweet 16 (8 games, 2 per region) ---
  for (const region of REGIONS) {
    for (let pos = 1; pos <= 2; pos++) {
      const id = makeMatchupId('Sweet 16', region, pos);
      matchups[id] = {
        id,
        round: 'Sweet 16',
        region,
        position: pos,
        teamAId: null,
        teamBId: null,
        winnerId: null,
        winProbA: null,
        locked: false,
        isUpset: false,
        confidence: 0,
      };
    }
  }

  // --- Elite 8 (4 games, 1 per region) ---
  for (const region of REGIONS) {
    const id = makeMatchupId('Elite 8', region, 1);
    matchups[id] = {
      id,
      round: 'Elite 8',
      region,
      position: 1,
      teamAId: null,
      teamBId: null,
      winnerId: null,
      winProbA: null,
      locked: false,
      isUpset: false,
      confidence: 0,
    };
  }

  // --- Final Four (2 games) ---
  for (let pos = 1; pos <= 2; pos++) {
    const id = makeMatchupId('Final Four', 'Final Four', pos);
    matchups[id] = {
      id,
      round: 'Final Four',
      region: 'Final Four',
      position: pos,
      teamAId: null,
      teamBId: null,
      winnerId: null,
      winProbA: null,
      locked: false,
      isUpset: false,
      confidence: 0,
    };
  }

  // --- Championship (1 game) ---
  matchups['champ'] = {
    id: 'champ',
    round: 'Championship',
    region: 'Final Four',
    position: 1,
    teamAId: null,
    teamBId: null,
    winnerId: null,
    winProbA: null,
    locked: false,
    isUpset: false,
    confidence: 0,
  };

  return { matchups, teams: teamsMap };
}

/**
 * Given a matchup ID, return the IDs of the two feeder matchups
 * whose winners populate this matchup's teamA and teamB slots.
 */
export function getFeederMatchupIds(matchupId: string): { teamAFrom: string | null; teamBFrom: string | null } {
  // Championship
  if (matchupId === 'champ') {
    return {
      teamAFrom: makeMatchupId('Final Four', 'Final Four', 1),
      teamBFrom: makeMatchupId('Final Four', 'Final Four', 2),
    };
  }

  // Final Four
  if (matchupId.startsWith('ff4-')) {
    const pos = parseInt(matchupId.split('-')[1], 10);
    const [regionA, regionB] = FINAL_FOUR_PAIRINGS[pos - 1];
    return {
      teamAFrom: makeMatchupId('Elite 8', regionA, 1),
      teamBFrom: makeMatchupId('Elite 8', regionB, 1),
    };
  }

  // First Four feeds into R64 — no feeders for First Four itself
  if (matchupId.startsWith('ff-')) {
    return { teamAFrom: null, teamBFrom: null };
  }

  // Parse regional matchup ID: "{region}-{round}-{position}"
  const parts = matchupId.split('-');
  // Handle multi-word regions/rounds
  const regionKey = parts[0]; // east, south, west, midwest
  const regionMap: Record<string, Region> = {
    east: 'East',
    south: 'South',
    west: 'West',
    midwest: 'Midwest',
  };
  const region = regionMap[regionKey];
  if (!region) return { teamAFrom: null, teamBFrom: null };

  const roundKey = parts.slice(1, -1).join('');
  const position = parseInt(parts[parts.length - 1], 10);

  const prevRoundMap: Record<string, Round> = {
    r32: 'R64',
    sweet16: 'R32',
    elite8: 'Sweet 16',
  };

  const prevRound = prevRoundMap[roundKey];
  if (!prevRound) {
    // R64 has no feeder (or has First Four feeder handled separately)
    return { teamAFrom: null, teamBFrom: null };
  }

  const feedA = position * 2 - 1;
  const feedB = position * 2;

  return {
    teamAFrom: makeMatchupId(prevRound, region, feedA),
    teamBFrom: makeMatchupId(prevRound, region, feedB),
  };
}

/**
 * Advance a winner from one matchup into the next round.
 * Returns a new BracketState with the winner propagated.
 */
export function advanceWinner(state: BracketState, matchupId: string, winnerId: string): BracketState {
  const matchup = state.matchups[matchupId];
  if (!matchup) return state;

  const newMatchups = { ...state.matchups };

  // Set the winner on the current matchup
  newMatchups[matchupId] = { ...matchup, winnerId };

  // Handle First Four: propagate winner to the correct R64 slot
  if (matchup.round === 'First Four') {
    const ffIndex = matchup.position - 1;
    const config = FIRST_FOUR_CONFIGS[ffIndex];
    if (config) {
      const r64Id = makeMatchupId('R64', config.region, config.r64Position);
      const r64Matchup = newMatchups[r64Id];
      if (r64Matchup) {
        if (config.r64Slot === 'A') {
          newMatchups[r64Id] = { ...r64Matchup, teamAId: winnerId };
        } else {
          newMatchups[r64Id] = { ...r64Matchup, teamBId: winnerId };
        }
      }
    }
    return { ...state, matchups: newMatchups };
  }

  // For all other rounds, find the next matchup
  const next = getNextMatchup(matchup.round, matchup.region, matchup.position);
  if (next) {
    const nextMatchup = newMatchups[next.nextMatchupId];
    if (nextMatchup) {
      if (next.slot === 'A') {
        newMatchups[next.nextMatchupId] = { ...nextMatchup, teamAId: winnerId };
      } else {
        newMatchups[next.nextMatchupId] = { ...nextMatchup, teamBId: winnerId };
      }
    }
  }

  return { ...state, matchups: newMatchups };
}

/**
 * Get all matchup IDs for a given round.
 */
export function getMatchupsByRound(state: BracketState, round: Round): Matchup[] {
  return Object.values(state.matchups).filter((m) => m.round === round);
}

/**
 * Get all matchup IDs for a given region.
 */
export function getMatchupsByRegion(state: BracketState, region: Region): Matchup[] {
  return Object.values(state.matchups).filter((m) => m.region === region);
}

/**
 * Return the total number of matchups in the bracket (67 = 4 First Four + 63 main).
 */
export function getTotalMatchups(state: BracketState): number {
  return Object.keys(state.matchups).length;
}

/**
 * Check if the entire bracket is complete (all matchups have a winner).
 */
export function isBracketComplete(state: BracketState): boolean {
  return Object.values(state.matchups).every((m) => m.winnerId !== null);
}

/**
 * Get the champion team ID, if the bracket is complete.
 */
export function getChampion(state: BracketState): string | null {
  return state.matchups['champ']?.winnerId ?? null;
}

// Re-export for convenience
export { makeMatchupId, getNextMatchup, FIRST_FOUR_CONFIGS, R64_SEED_PAIRINGS, REGIONS, FINAL_FOUR_PAIRINGS };
