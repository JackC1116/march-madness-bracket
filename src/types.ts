// ============================================================
// Bracket Assist — Core Types
// ============================================================

export type Region = 'East' | 'West' | 'South' | 'Midwest';
export type Round = 'First Four' | 'R64' | 'R32' | 'Sweet 16' | 'Elite 8' | 'Final Four' | 'Championship';
export type UpsetAppetite = 'conservative' | 'moderate' | 'aggressive' | 'chaos';
export type BracketArchetype = 'chalk' | 'contrarian' | 'cinderella' | 'bold_final_four';
export type AppMode = 'single' | 'multi' | 'guided';
export type ThemeMode = 'light' | 'dark' | 'system';

export interface KenPomStats {
  rank: number;
  adjEM: number;
  adjO: number;
  adjD: number;
  adjT: number;
}

export interface NETStats {
  rank: number;
  q1Record: string;
  q2Record: string;
}

export interface BarttorvikStats {
  rank: number;
  barthag: number;
}

export interface SagarinStats {
  rank: number;
  rating: number;
}

export interface TeamProfile {
  style: 'balanced' | 'offensive' | 'defensive' | 'tempo-push' | 'grind-it-out';
  tempo: 'fast' | 'medium' | 'slow';
  threePtRate: number;
  ftRate: number;
  turnoverRate: number;
  orbRate: number;
}

export interface RecentForm {
  last10Record: string;      // e.g., "9-1"
  last10Wins: number;
  last10Losses: number;
  streak: string;            // e.g., "W11", "L2"
  confTourneyResult: string; // e.g., "Won title", "Lost semifinal", "Lost QF"
  momentum: 'hot' | 'warm' | 'neutral' | 'cool' | 'cold';
  injuryNote?: string;       // key injury if any
}

export interface Team {
  id: string;
  name: string;
  seed: number;
  region: Region;
  conference: string;
  kenpom: KenPomStats;
  net: NETStats;
  barttorvik: BarttorvikStats;
  sagarin: SagarinStats;
  profile: TeamProfile;
  recentForm?: RecentForm;
  location?: { lat: number; lng: number };
  isFirstFour?: boolean;
  firstFourOpponentId?: string;
}

export interface MatchupOdds {
  matchupId: string;
  teamAId: string;
  teamBId: string;
  spread: number;
  impliedProbA: number;
}

export interface HistoricalSeedMatchup {
  higherSeed: number;
  lowerSeed: number;
  round: string;
  gamesPlayed: number;
  higherSeedWins: number;
  upsetRate: number;
}

export interface ConferencePerformance {
  conference: string;
  tournamentWinRate: number;
  avgSeedPerformance: number;
}

export interface HistoricalTrends {
  seedMatchups: HistoricalSeedMatchup[];
  conferencePerformance: ConferencePerformance[];
  cinderellaTraits: string[];
}

// Composite scoring
export interface ModelWeights {
  kenpom: number;
  barttorvik: number;
  net: number;
  sagarin: number;
  vegas: number;
  historical: number;
  experience: number;
}

export const DEFAULT_WEIGHTS: ModelWeights = {
  kenpom: 0.25,
  barttorvik: 0.20,
  net: 0.10,
  sagarin: 0.10,
  vegas: 0.20,
  historical: 0.10,
  experience: 0.05,
};

// Bracket state
export interface Matchup {
  id: string;
  round: Round;
  region: Region | 'Final Four';
  position: number;      // position within the round/region
  teamAId: string | null;
  teamBId: string | null;
  winnerId: string | null;
  winProbA: number | null;
  locked: boolean;        // user locked this pick
  isUpset: boolean;
  confidence: number;     // 0-1 confidence in pick
}

export interface BracketState {
  matchups: Record<string, Matchup>;
  teams: Record<string, Team>;
}

// Simulation results
export interface TeamSimResult {
  teamId: string;
  avgRoundReached: number;
  championshipProb: number;
  finalFourProb: number;
  sweetSixteenProb: number;
  expectedRoundOfExit: Round;
  roundProbabilities: Record<string, number>;
}

export interface SimulationResults {
  teamResults: Record<string, TeamSimResult>;
  iterations: number;
}

// User biases
export interface StructuredBias {
  type: 'lock' | 'eliminate' | 'boost_conference' | 'penalize_conference';
  targetId: string;       // team or conference id
  round?: Round;          // for lock/eliminate
  modifier?: number;      // for boost/penalize (-0.2 to 0.2)
}

export interface ClaudeBiasAdjustment {
  teamId: string;
  modifier: number;
  explanation: string;
}

// Pool config
export interface ScoringSystem {
  name: string;
  pointsByRound: number[];  // [R64, R32, S16, E8, FF, Champ]
}

export const SCORING_SYSTEMS: Record<string, ScoringSystem> = {
  standard: { name: 'Standard', pointsByRound: [1, 2, 4, 8, 16, 32] },
  upset_bonus: { name: 'Upset Bonus', pointsByRound: [1, 2, 4, 8, 16, 32] },  // + seed of winner
  seed_based: { name: 'Seed-Based', pointsByRound: [1, 1, 1, 1, 1, 1] },       // points = seed of winner
  custom: { name: 'Custom', pointsByRound: [1, 2, 4, 8, 16, 32] },
};

export interface PoolConfig {
  poolSize: number;
  scoringSystem: ScoringSystem;
  numBrackets: number;
  archetypes: BracketArchetype[];
}

// Claude API
export interface ClaudeMessage {
  role: 'user' | 'assistant';
  content: string;
}

export interface MatchupNarrative {
  matchupId: string;
  narrative: string;
  keyFactor: string;
  confidence: string;
}

// Advanced model settings
export interface AdvancedModelSettings {
  // Champion filter: only consider teams meeting these thresholds as title contenders
  championFilter: boolean;
  championFilterMinOffenseRank: number;
  championFilterMinDefenseRank: number;
  championFilterMinSosRank: number;

  // Upset calibration
  upsetCalibration: boolean;
  minFirstRoundUpsets: number;
  maxFirstRoundUpsets: number;
  alwaysPick12Over5: boolean;

  // Free throw adjustment
  freeThrowAdjustment: boolean;
  freeThrowPenaltyThreshold: number;

  // Tempo trapezoid
  tempoTrapezoid: boolean;
  tempoMinRange: number;
  tempoMaxRange: number;

  // Recency weighting
  recencyWeighting: boolean;
  recencyWeight: number;

  // Contrarian value
  contrarianValue: boolean;
  contrarianStrength: number;

  // Travel distance
  travelDistance: boolean;
}

export const DEFAULT_ADVANCED_SETTINGS: AdvancedModelSettings = {
  championFilter: false,
  championFilterMinOffenseRank: 40,
  championFilterMinDefenseRank: 25,
  championFilterMinSosRank: 23,

  upsetCalibration: false,
  minFirstRoundUpsets: 7,
  maxFirstRoundUpsets: 10,
  alwaysPick12Over5: false,

  freeThrowAdjustment: false,
  freeThrowPenaltyThreshold: 68,

  tempoTrapezoid: false,
  tempoMinRange: 64,
  tempoMaxRange: 72,

  recencyWeighting: false,
  recencyWeight: 0.15,

  contrarianValue: false,
  contrarianStrength: 0.3,

  travelDistance: false,
};

// Saved brackets
export interface SavedBracket {
  id: string;
  name: string;
  bracket: BracketState;
  createdAt: string;
  champion?: string; // team name
}

// App state
export interface PickHistoryEntry {
  matchupId: string;
  winnerId: string;
  previousWinnerId: string | null;
  /** Snapshot of matchups before the pick, used for full undo restore */
  previousMatchups: Record<string, Matchup>;
}

export interface AppState {
  mode: AppMode;
  weights: ModelWeights;
  luckFactor: number;  // 0-0.20: random noise injected into matchup simulations
  upsetAppetite: UpsetAppetite;
  biases: StructuredBias[];
  claudeBiases: ClaudeBiasAdjustment[];
  poolConfig: PoolConfig;
  bracket: BracketState;
  simulationResults: SimulationResults | null;
  narratives: Record<string, MatchupNarrative>;
  guidedPickIndex: number;
  multiBrackets: BracketState[];
  claudeApiKey: string;
  isSimulating: boolean;
  theme: ThemeMode;
  simulationIterations: number;
  pickHistory: PickHistoryEntry[];
  undoneActions: PickHistoryEntry[];
  comparisonBracket: BracketState | null;
  advancedSettings: AdvancedModelSettings;
  savedBrackets: SavedBracket[];
}
