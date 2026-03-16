import type { MatchupOdds } from '../types';

/**
 * First-round betting odds for all 32 R64 matchups plus 4 First Four games.
 * Spread is from Team A's perspective (negative = Team A favored).
 * impliedProbA is Team A's implied win probability.
 */
export const MATCHUP_ODDS: MatchupOdds[] = [
  // ============================================================
  // FIRST FOUR
  // ============================================================
  {
    matchupId: 'ff-1',
    teamAId: 'umbc',
    teamBId: 'howard',
    spread: -3.5,
    impliedProbA: 0.62,
  },
  {
    matchupId: 'ff-2',
    teamAId: 'prairie-view',
    teamBId: 'lehigh',
    spread: 4.0,
    impliedProbA: 0.38,
  },
  {
    matchupId: 'ff-3',
    teamAId: 'texas',
    teamBId: 'nc-state',
    spread: -1.5,
    impliedProbA: 0.54,
  },
  {
    matchupId: 'ff-4',
    teamAId: 'miami-oh',
    teamBId: 'smu',
    spread: 2.0,
    impliedProbA: 0.45,
  },

  // ============================================================
  // EAST REGION — Round of 64
  // ============================================================
  {
    matchupId: 'east-r64-1',
    teamAId: 'duke',
    teamBId: 'siena',
    spread: -26.5,
    impliedProbA: 0.99,
  },
  {
    matchupId: 'east-r64-2',
    teamAId: 'ohio-state',
    teamBId: 'tcu',
    spread: -1.0,
    impliedProbA: 0.52,
  },
  {
    matchupId: 'east-r64-3',
    teamAId: 'st-johns',
    teamBId: 'northern-iowa',
    spread: -7.5,
    impliedProbA: 0.78,
  },
  {
    matchupId: 'east-r64-4',
    teamAId: 'kansas',
    teamBId: 'cal-baptist',
    spread: -14.0,
    impliedProbA: 0.92,
  },
  {
    matchupId: 'east-r64-5',
    teamAId: 'louisville',
    teamBId: 'south-florida',
    spread: -4.5,
    impliedProbA: 0.65,
  },
  {
    matchupId: 'east-r64-6',
    teamAId: 'michigan-state',
    teamBId: 'north-dakota-state',
    spread: -17.0,
    impliedProbA: 0.95,
  },
  {
    matchupId: 'east-r64-7',
    teamAId: 'ucla',
    teamBId: 'ucf',
    spread: -2.5,
    impliedProbA: 0.57,
  },
  {
    matchupId: 'east-r64-8',
    teamAId: 'uconn',
    teamBId: 'furman',
    spread: -18.5,
    impliedProbA: 0.96,
  },

  // ============================================================
  // SOUTH REGION — Round of 64
  // ============================================================
  {
    matchupId: 'south-r64-1',
    teamAId: 'florida',
    teamBId: 'prairie-view', // placeholder: First Four winner
    spread: -27.0,
    impliedProbA: 0.99,
  },
  {
    matchupId: 'south-r64-2',
    teamAId: 'clemson',
    teamBId: 'iowa',
    spread: -1.0,
    impliedProbA: 0.52,
  },
  {
    matchupId: 'south-r64-3',
    teamAId: 'vanderbilt',
    teamBId: 'mcneese',
    spread: -8.0,
    impliedProbA: 0.80,
  },
  {
    matchupId: 'south-r64-4',
    teamAId: 'nebraska',
    teamBId: 'troy',
    spread: -13.5,
    impliedProbA: 0.91,
  },
  {
    matchupId: 'south-r64-5',
    teamAId: 'north-carolina',
    teamBId: 'vcu',
    spread: -4.0,
    impliedProbA: 0.63,
  },
  {
    matchupId: 'south-r64-6',
    teamAId: 'illinois',
    teamBId: 'penn',
    spread: -19.0,
    impliedProbA: 0.96,
  },
  {
    matchupId: 'south-r64-7',
    teamAId: 'st-marys',
    teamBId: 'texas-am',
    spread: -2.0,
    impliedProbA: 0.55,
  },
  {
    matchupId: 'south-r64-8',
    teamAId: 'houston',
    teamBId: 'idaho',
    spread: -21.5,
    impliedProbA: 0.98,
  },

  // ============================================================
  // WEST REGION — Round of 64
  // ============================================================
  {
    matchupId: 'west-r64-1',
    teamAId: 'arizona',
    teamBId: 'liu',
    spread: -30.0,
    impliedProbA: 0.99,
  },
  {
    matchupId: 'west-r64-2',
    teamAId: 'villanova',
    teamBId: 'utah-state',
    spread: -1.0,
    impliedProbA: 0.52,
  },
  {
    matchupId: 'west-r64-3',
    teamAId: 'wisconsin',
    teamBId: 'high-point',
    spread: -8.5,
    impliedProbA: 0.81,
  },
  {
    matchupId: 'west-r64-4',
    teamAId: 'arkansas',
    teamBId: 'hawaii',
    spread: -13.5,
    impliedProbA: 0.91,
  },
  {
    matchupId: 'west-r64-5',
    teamAId: 'byu',
    teamBId: 'texas', // placeholder: First Four winner
    spread: -5.5,
    impliedProbA: 0.70,
  },
  {
    matchupId: 'west-r64-6',
    teamAId: 'gonzaga',
    teamBId: 'kennesaw-state',
    spread: -18.0,
    impliedProbA: 0.96,
  },
  {
    matchupId: 'west-r64-7',
    teamAId: 'miami',
    teamBId: 'missouri',
    spread: -2.5,
    impliedProbA: 0.57,
  },
  {
    matchupId: 'west-r64-8',
    teamAId: 'purdue',
    teamBId: 'queens',
    spread: -20.5,
    impliedProbA: 0.97,
  },

  // ============================================================
  // MIDWEST REGION — Round of 64
  // ============================================================
  {
    matchupId: 'midwest-r64-1',
    teamAId: 'michigan',
    teamBId: 'umbc', // placeholder: First Four winner
    spread: -27.5,
    impliedProbA: 0.99,
  },
  {
    matchupId: 'midwest-r64-2',
    teamAId: 'georgia',
    teamBId: 'st-louis',
    spread: -1.5,
    impliedProbA: 0.53,
  },
  {
    matchupId: 'midwest-r64-3',
    teamAId: 'texas-tech',
    teamBId: 'akron',
    spread: -8.0,
    impliedProbA: 0.80,
  },
  {
    matchupId: 'midwest-r64-4',
    teamAId: 'alabama',
    teamBId: 'hofstra',
    spread: -15.5,
    impliedProbA: 0.94,
  },
  {
    matchupId: 'midwest-r64-5',
    teamAId: 'tennessee',
    teamBId: 'miami-oh', // placeholder: First Four winner
    spread: -6.0,
    impliedProbA: 0.72,
  },
  {
    matchupId: 'midwest-r64-6',
    teamAId: 'virginia',
    teamBId: 'wright-state',
    spread: -20.0,
    impliedProbA: 0.97,
  },
  {
    matchupId: 'midwest-r64-7',
    teamAId: 'kentucky',
    teamBId: 'santa-clara',
    spread: -2.0,
    impliedProbA: 0.55,
  },
  {
    matchupId: 'midwest-r64-8',
    teamAId: 'iowa-state',
    teamBId: 'tennessee-state',
    spread: -23.0,
    impliedProbA: 0.98,
  },
];
