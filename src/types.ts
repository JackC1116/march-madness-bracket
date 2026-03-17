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
}
