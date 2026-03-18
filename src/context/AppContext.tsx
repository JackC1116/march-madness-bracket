import { createContext, useContext, useReducer, useEffect, useRef, type Dispatch, type ReactNode } from 'react';
import {
  type AppState,
  type AppMode,
  type ThemeMode,
  type ModelWeights,
  type UpsetAppetite,
  type StructuredBias,
  type ClaudeBiasAdjustment,
  type PoolConfig,
  type BracketState,
  type SimulationResults,
  type MatchupNarrative,
  type Matchup,
  type PickHistoryEntry,
  type AdvancedModelSettings,
  type SavedBracket,
  DEFAULT_WEIGHTS,
  DEFAULT_ADVANCED_SETTINGS,
  SCORING_SYSTEMS,
} from '../types';

// ── Action Types ──────────────────────────────────────────────

type AppAction =
  | { type: 'SET_MODE'; payload: AppMode }
  | { type: 'SET_WEIGHTS'; payload: ModelWeights }
  | { type: 'SET_UPSET_APPETITE'; payload: UpsetAppetite }
  | { type: 'ADD_BIAS'; payload: StructuredBias }
  | { type: 'REMOVE_BIAS'; payload: number }
  | { type: 'SET_CLAUDE_BIASES'; payload: ClaudeBiasAdjustment[] }
  | { type: 'SET_POOL_CONFIG'; payload: PoolConfig }
  | { type: 'PICK_WINNER'; payload: { matchupId: string; winnerId: string } }
  | { type: 'LOCK_PICK'; payload: string }
  | { type: 'UNLOCK_PICK'; payload: string }
  | { type: 'SET_BRACKET'; payload: BracketState }
  | { type: 'SET_SIMULATION_RESULTS'; payload: SimulationResults }
  | { type: 'SET_NARRATIVE'; payload: { matchupId: string; narrative: MatchupNarrative } }
  | { type: 'SET_GUIDED_INDEX'; payload: number }
  | { type: 'SET_MULTI_BRACKETS'; payload: BracketState[] }
  | { type: 'SET_CLAUDE_API_KEY'; payload: string }
  | { type: 'SET_IS_SIMULATING'; payload: boolean }
  | { type: 'SET_THEME'; payload: ThemeMode }
  | { type: 'SET_SIMULATION_ITERATIONS'; payload: number }
  | { type: 'UNDO' }
  | { type: 'REDO' }
  | { type: 'RESET_BRACKET' }
  | { type: 'AUTO_FILL_BRACKET' }
  | { type: 'CLEAR_SAVED_STATE' }
  | { type: 'SET_COMPARISON_BRACKET'; payload: BracketState }
  | { type: 'CLEAR_COMPARISON_BRACKET' }
  | { type: 'SET_ADVANCED_SETTINGS'; payload: AdvancedModelSettings }
  | { type: 'SET_LUCK_FACTOR'; payload: number }
  | { type: 'SAVE_BRACKET'; payload: { name: string } }
  | { type: 'LOAD_BRACKET'; payload: string }
  | { type: 'DELETE_BRACKET'; payload: string }
  | { type: 'RENAME_BRACKET'; payload: { id: string; name: string } };

// ── Round ordering for propagation logic ──────────────────────

const ROUND_ORDER: string[] = [
  'First Four',
  'R64',
  'R32',
  'Sweet 16',
  'Elite 8',
  'Final Four',
  'Championship',
];

function roundIndex(round: string): number {
  return ROUND_ORDER.indexOf(round);
}

// ── Pick propagation helpers ──────────────────────────────────

const FINAL_FOUR_PAIRINGS: [string, string][] = [['East', 'West'], ['South', 'Midwest']];

/**
 * Find the next-round matchup that this matchup feeds into, plus which slot
 * (teamAId or teamBId) the winner occupies. Uses 1-based positions matching
 * the canonical scheme from bracket-structure.ts.
 */
function findNextMatchup(
  matchups: Record<string, Matchup>,
  currentMatchup: Matchup,
): { matchup: Matchup; slot: 'teamAId' | 'teamBId' } | null {
  const currentRoundIdx = roundIndex(currentMatchup.round);
  if (currentRoundIdx === -1 || currentRoundIdx >= ROUND_ORDER.length - 1) return null;

  const nextRound = ROUND_ORDER[currentRoundIdx + 1];
  let nextPosition: number;
  let slot: 'teamAId' | 'teamBId';
  let nextRegion = currentMatchup.region;

  if (currentMatchup.round === 'First Four') {
    // First Four → R64 propagation is handled separately via FIRST_FOUR_CONFIGS
    return null;
  } else if (currentMatchup.round === 'Elite 8') {
    // Elite 8 winner → Final Four
    const pairIdx = FINAL_FOUR_PAIRINGS.findIndex(
      ([a, b]) => a === currentMatchup.region || b === currentMatchup.region
    );
    if (pairIdx === -1) return null;
    nextPosition = pairIdx + 1;
    slot = FINAL_FOUR_PAIRINGS[pairIdx][0] === currentMatchup.region ? 'teamAId' : 'teamBId';
    nextRegion = 'Final Four';
  } else if (currentMatchup.round === 'Final Four') {
    // Final Four winner → Championship
    nextPosition = 1;
    slot = currentMatchup.position === 1 ? 'teamAId' : 'teamBId';
    nextRegion = 'Final Four';
  } else {
    // Regional rounds: R64→R32, R32→S16, S16→E8
    nextPosition = Math.floor((currentMatchup.position - 1) / 2) + 1;
    slot = currentMatchup.position % 2 === 1 ? 'teamAId' : 'teamBId';
  }

  for (const m of Object.values(matchups)) {
    if (m.round === nextRound && m.region === nextRegion && m.position === nextPosition) {
      return { matchup: m, slot };
    }
  }
  return null;
}

/**
 * Handle PICK_WINNER: place winner in current matchup, propagate to the next round,
 * and cascade-invalidate any downstream picks that relied on the loser.
 */
function handlePickWinner(
  state: AppState,
  matchupId: string,
  winnerId: string,
): AppState {
  const matchups = { ...state.bracket.matchups };
  const current = matchups[matchupId];
  if (!current) return state;

  // Determine the loser
  const loserId =
    current.teamAId === winnerId ? current.teamBId : current.teamAId;

  // Set winner on current matchup
  const winnerSeed = state.bracket.teams[winnerId]?.seed ?? 16;
  const teamASeed = current.teamAId ? state.bracket.teams[current.teamAId]?.seed ?? 16 : 16;
  const teamBSeed = current.teamBId ? state.bracket.teams[current.teamBId]?.seed ?? 16 : 16;
  const higherSeed = Math.min(teamASeed, teamBSeed);

  matchups[matchupId] = {
    ...current,
    winnerId,
    isUpset: winnerSeed > higherSeed,
  };

  // Propagate winner into next-round matchup
  const next = findNextMatchup(matchups, current);
  if (next) {
    matchups[next.matchup.id] = {
      ...matchups[next.matchup.id],
      [next.slot]: winnerId,
    };
  }

  // Cascade invalidation: if the loser had been picked in any later matchup, clear those
  if (loserId) {
    cascadeInvalidate(matchups, loserId, roundIndex(current.round) + 1);
  }

  return {
    ...state,
    bracket: { ...state.bracket, matchups },
  };
}

/**
 * Walk forward from startRoundIdx clearing any matchup that references the eliminated team.
 */
function cascadeInvalidate(
  matchups: Record<string, Matchup>,
  eliminatedTeamId: string,
  startRoundIdx: number,
): void {
  for (let ri = startRoundIdx; ri < ROUND_ORDER.length; ri++) {
    const round = ROUND_ORDER[ri];
    for (const key of Object.keys(matchups)) {
      const m = matchups[key];
      if (m.round !== round) continue;

      let changed = false;
      const update: Partial<Matchup> = {};

      if (m.teamAId === eliminatedTeamId) {
        update.teamAId = null;
        changed = true;
      }
      if (m.teamBId === eliminatedTeamId) {
        update.teamBId = null;
        changed = true;
      }
      if (m.winnerId === eliminatedTeamId) {
        update.winnerId = null;
        update.isUpset = false;
        changed = true;
      }

      if (changed) {
        matchups[key] = { ...m, ...update };
      }
    }
  }
}

/**
 * Auto-fill remaining unpicked matchups using simulation results.
 * Iterates round-by-round so propagation works correctly.
 */
function handleAutoFill(state: AppState): AppState {
  if (!state.simulationResults) return state;

  let current = state;

  for (const round of ROUND_ORDER) {
    const matchupsInRound = Object.values(current.bracket.matchups).filter(
      (m) => m.round === round && !m.winnerId && !m.locked && m.teamAId && m.teamBId,
    );

    for (const matchup of matchupsInRound) {
      const teamAResult = state.simulationResults.teamResults[matchup.teamAId!];
      const teamBResult = state.simulationResults.teamResults[matchup.teamBId!];

      // Pick team with higher championship probability, fallback to avgRoundReached
      let winnerId: string;
      if (teamAResult && teamBResult) {
        const scoreA = teamAResult.championshipProb * 1000 + teamAResult.avgRoundReached;
        const scoreB = teamBResult.championshipProb * 1000 + teamBResult.avgRoundReached;
        winnerId = scoreA >= scoreB ? matchup.teamAId! : matchup.teamBId!;
      } else if (teamAResult) {
        winnerId = matchup.teamAId!;
      } else if (teamBResult) {
        winnerId = matchup.teamBId!;
      } else {
        // No simulation data — pick higher seed (lower number)
        const seedA = current.bracket.teams[matchup.teamAId!]?.seed ?? 16;
        const seedB = current.bracket.teams[matchup.teamBId!]?.seed ?? 16;
        winnerId = seedA <= seedB ? matchup.teamAId! : matchup.teamBId!;
      }

      current = handlePickWinner(current, matchup.id, winnerId);
    }
  }

  return current;
}

// ── Reducer ───────────────────────────────────────────────────

function appReducer(state: AppState, action: AppAction): AppState {
  switch (action.type) {
    case 'SET_MODE':
      return { ...state, mode: action.payload };

    case 'SET_WEIGHTS':
      return { ...state, weights: action.payload };

    case 'SET_UPSET_APPETITE':
      return { ...state, upsetAppetite: action.payload };

    case 'ADD_BIAS':
      return { ...state, biases: [...state.biases, action.payload] };

    case 'REMOVE_BIAS':
      return {
        ...state,
        biases: state.biases.filter((_, i) => i !== action.payload),
      };

    case 'SET_CLAUDE_BIASES':
      return { ...state, claudeBiases: action.payload };

    case 'SET_POOL_CONFIG':
      return { ...state, poolConfig: action.payload };

    case 'PICK_WINNER': {
      const historyEntry: PickHistoryEntry = {
        matchupId: action.payload.matchupId,
        winnerId: action.payload.winnerId,
        previousWinnerId: state.bracket.matchups[action.payload.matchupId]?.winnerId ?? null,
        previousMatchups: { ...state.bracket.matchups },
      };
      const newState = handlePickWinner(state, action.payload.matchupId, action.payload.winnerId);
      return {
        ...newState,
        pickHistory: [...state.pickHistory, historyEntry],
        undoneActions: [], // Clear redo stack on new pick
      };
    }

    case 'LOCK_PICK': {
      const m = state.bracket.matchups[action.payload];
      if (!m) return state;
      return {
        ...state,
        bracket: {
          ...state.bracket,
          matchups: {
            ...state.bracket.matchups,
            [action.payload]: { ...m, locked: true },
          },
        },
      };
    }

    case 'UNLOCK_PICK': {
      const m = state.bracket.matchups[action.payload];
      if (!m) return state;
      return {
        ...state,
        bracket: {
          ...state.bracket,
          matchups: {
            ...state.bracket.matchups,
            [action.payload]: { ...m, locked: false },
          },
        },
      };
    }

    case 'SET_BRACKET':
      return { ...state, bracket: action.payload, pickHistory: [], undoneActions: [], narratives: {} };

    case 'SET_SIMULATION_RESULTS':
      return { ...state, simulationResults: action.payload };

    case 'SET_NARRATIVE':
      return {
        ...state,
        narratives: {
          ...state.narratives,
          [action.payload.matchupId]: action.payload.narrative,
        },
      };

    case 'SET_GUIDED_INDEX':
      return { ...state, guidedPickIndex: action.payload };

    case 'SET_MULTI_BRACKETS':
      return { ...state, multiBrackets: action.payload };

    case 'SET_CLAUDE_API_KEY':
      return { ...state, claudeApiKey: action.payload };

    case 'SET_IS_SIMULATING':
      return { ...state, isSimulating: action.payload };

    case 'SET_THEME':
      return { ...state, theme: action.payload };

    case 'SET_SIMULATION_ITERATIONS':
      return { ...state, simulationIterations: action.payload };

    case 'UNDO': {
      if (state.pickHistory.length === 0) return state;
      const lastEntry = state.pickHistory[state.pickHistory.length - 1];
      // Restore the matchups snapshot from before the pick
      return {
        ...state,
        bracket: { ...state.bracket, matchups: { ...lastEntry.previousMatchups } },
        pickHistory: state.pickHistory.slice(0, -1),
        undoneActions: [...state.undoneActions, lastEntry],
      };
    }

    case 'REDO': {
      if (state.undoneActions.length === 0) return state;
      const redoEntry = state.undoneActions[state.undoneActions.length - 1];
      // Re-apply the pick using the stored winnerId
      const redoState = handlePickWinner(state, redoEntry.matchupId, redoEntry.winnerId);
      // Move entry back from undone to pick history (with current matchups as previous)
      const reappliedEntry: PickHistoryEntry = {
        matchupId: redoEntry.matchupId,
        winnerId: redoEntry.winnerId,
        previousWinnerId: state.bracket.matchups[redoEntry.matchupId]?.winnerId ?? null,
        previousMatchups: { ...state.bracket.matchups },
      };
      return {
        ...redoState,
        pickHistory: [...state.pickHistory, reappliedEntry],
        undoneActions: state.undoneActions.slice(0, -1),
      };
    }

    case 'RESET_BRACKET': {
      // Identify First Four team IDs so we can null out their R64 feeder slots
      const firstFourTeamIds = new Set<string>();
      for (const m of Object.values(state.bracket.matchups)) {
        if (m.round === 'First Four') {
          if (m.teamAId) firstFourTeamIds.add(m.teamAId);
          if (m.teamBId) firstFourTeamIds.add(m.teamBId);
        }
      }

      const resetMatchups: Record<string, Matchup> = {};
      for (const [key, m] of Object.entries(state.bracket.matchups)) {
        let teamAId = roundIndex(m.round) <= 1 ? m.teamAId : null;
        let teamBId = roundIndex(m.round) <= 1 ? m.teamBId : null;

        // For R64 matchups fed by First Four, null out the FF-winner slot
        if (m.round === 'R64') {
          if (teamAId && firstFourTeamIds.has(teamAId)) teamAId = null;
          if (teamBId && firstFourTeamIds.has(teamBId)) teamBId = null;
        }

        resetMatchups[key] = {
          ...m,
          winnerId: null,
          locked: false,
          isUpset: false,
          confidence: 0,
          teamAId,
          teamBId,
        };
      }
      return {
        ...state,
        bracket: { ...state.bracket, matchups: resetMatchups },
        narratives: {},
        guidedPickIndex: 0,
        pickHistory: [],
        undoneActions: [],
      };
    }

    case 'AUTO_FILL_BRACKET':
      return handleAutoFill(state);

    case 'CLEAR_SAVED_STATE':
      localStorage.removeItem(STORAGE_KEY);
      return { ...defaultState };

    case 'SET_COMPARISON_BRACKET':
      return { ...state, comparisonBracket: action.payload };

    case 'CLEAR_COMPARISON_BRACKET':
      return { ...state, comparisonBracket: null };

    case 'SET_ADVANCED_SETTINGS':
      return { ...state, advancedSettings: action.payload };

    case 'SET_LUCK_FACTOR':
      return { ...state, luckFactor: Math.max(0, Math.min(0.20, action.payload)) };

    case 'SAVE_BRACKET': {
      // Find champion name
      const champMatchup = Object.values(state.bracket.matchups).find(
        (m) => m.round === 'Championship'
      );
      const championId = champMatchup?.winnerId ?? null;
      const championName = championId ? state.bracket.teams[championId]?.name : undefined;

      const newBracket: SavedBracket = {
        id: `bracket-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        name: action.payload.name,
        bracket: JSON.parse(JSON.stringify(state.bracket)),
        createdAt: new Date().toISOString(),
        champion: championName,
      };
      return { ...state, savedBrackets: [...state.savedBrackets, newBracket] };
    }

    case 'LOAD_BRACKET': {
      const savedBracket = state.savedBrackets.find((b) => b.id === action.payload);
      if (!savedBracket) return state;
      return {
        ...state,
        bracket: JSON.parse(JSON.stringify(savedBracket.bracket)),
        pickHistory: [],
        undoneActions: [],
      };
    }

    case 'DELETE_BRACKET':
      return {
        ...state,
        savedBrackets: state.savedBrackets.filter((b) => b.id !== action.payload),
      };

    case 'RENAME_BRACKET':
      return {
        ...state,
        savedBrackets: state.savedBrackets.map((b) =>
          b.id === action.payload.id ? { ...b, name: action.payload.name } : b
        ),
      };

    default:
      return state;
  }
}

// ── Randomized weights per visitor ────────────────────────────

function getOrCreateUserSeed(): number {
  const key = 'bracket-assist-seed';
  const existing = localStorage.getItem(key);
  if (existing) return parseInt(existing, 10);
  const seed = Math.floor(Math.random() * 1000000);
  localStorage.setItem(key, String(seed));
  return seed;
}

/** Simple seeded PRNG (mulberry32) */
function seededRandom(seed: number): () => number {
  let s = seed | 0;
  return () => {
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function randomizeWeights(): ModelWeights {
  const rand = seededRandom(getOrCreateUserSeed());
  const noise = 0.03; // ±3% per weight
  const raw: ModelWeights = {
    kenpom: DEFAULT_WEIGHTS.kenpom + (rand() - 0.5) * 2 * noise,
    barttorvik: DEFAULT_WEIGHTS.barttorvik + (rand() - 0.5) * 2 * noise,
    net: DEFAULT_WEIGHTS.net + (rand() - 0.5) * 2 * noise,
    sagarin: DEFAULT_WEIGHTS.sagarin + (rand() - 0.5) * 2 * noise,
    vegas: DEFAULT_WEIGHTS.vegas + (rand() - 0.5) * 2 * noise,
    historical: DEFAULT_WEIGHTS.historical + (rand() - 0.5) * 2 * noise,
    experience: DEFAULT_WEIGHTS.experience + (rand() - 0.5) * 2 * noise,
  };
  // Clamp and normalize to sum to 1.0
  const keys = Object.keys(raw) as (keyof ModelWeights)[];
  for (const k of keys) raw[k] = Math.max(0.01, raw[k]);
  const total = keys.reduce((s, k) => s + raw[k], 0);
  for (const k of keys) raw[k] = raw[k] / total;
  return raw;
}

// ── Default state ─────────────────────────────────────────────

const defaultState: AppState = {
  mode: 'single',
  weights: randomizeWeights(),
  luckFactor: 0.05,
  upsetAppetite: 'moderate',
  biases: [],
  claudeBiases: [],
  poolConfig: {
    poolSize: 25,
    scoringSystem: SCORING_SYSTEMS.standard,
    numBrackets: 1,
    archetypes: ['chalk'],
  },
  bracket: {
    matchups: {},
    teams: {},
  },
  simulationResults: null,
  narratives: {},
  guidedPickIndex: 0,
  multiBrackets: [],
  claudeApiKey: '',
  isSimulating: false,
  theme: 'system',
  simulationIterations: 10000,
  pickHistory: [],
  undoneActions: [],
  comparisonBracket: null,
  advancedSettings: { ...DEFAULT_ADVANCED_SETTINGS },
  savedBrackets: [],
};

// ── localStorage persistence ──────────────────────────────────

const STORAGE_KEY = 'bracket-assist-state';

/** Keys to strip before persisting (transient runtime state). */
const TRANSIENT_KEYS: (keyof AppState)[] = ['isSimulating'];

function loadSavedState(): AppState {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as Partial<AppState>;
      // Merge with defaultState so any newly-added keys have defaults,
      // and force transient fields to safe values.
      return { ...defaultState, ...parsed, isSimulating: false };
    }
  } catch {
    // Corrupted or unavailable — fall through to default
  }
  return { ...defaultState };
}

// ── Context ───────────────────────────────────────────────────

interface AppContextValue {
  state: AppState;
  dispatch: Dispatch<AppAction>;
}

const AppContext = createContext<AppContextValue | undefined>(undefined);

export function AppProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(appReducer, undefined, loadSavedState);

  // Debounced save to localStorage on every state change
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    if (saveTimerRef.current) {
      clearTimeout(saveTimerRef.current);
    }
    saveTimerRef.current = setTimeout(() => {
      try {
        // Strip transient keys before persisting
        const toSave = { ...state } as Record<string, unknown>;
        for (const key of TRANSIENT_KEYS) {
          delete toSave[key];
        }
        localStorage.setItem(STORAGE_KEY, JSON.stringify(toSave));
      } catch {
        // localStorage full or unavailable — silently ignore
      }
    }, 100);
    return () => {
      if (saveTimerRef.current) {
        clearTimeout(saveTimerRef.current);
      }
    };
  }, [state]);

  // Apply dark mode class on document.documentElement
  useEffect(() => {
    const applyTheme = (theme: ThemeMode) => {
      if (theme === 'dark') {
        document.documentElement.classList.add('dark');
      } else if (theme === 'light') {
        document.documentElement.classList.remove('dark');
      } else {
        // system
        const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
        if (prefersDark) {
          document.documentElement.classList.add('dark');
        } else {
          document.documentElement.classList.remove('dark');
        }
      }
    };

    applyTheme(state.theme);

    // Listen for system theme changes when in 'system' mode
    if (state.theme === 'system') {
      const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
      const handler = (e: MediaQueryListEvent) => {
        if (e.matches) {
          document.documentElement.classList.add('dark');
        } else {
          document.documentElement.classList.remove('dark');
        }
      };
      mediaQuery.addEventListener('change', handler);
      return () => mediaQuery.removeEventListener('change', handler);
    }
  }, [state.theme]);

  return (
    <AppContext.Provider value={{ state, dispatch }}>
      {children}
    </AppContext.Provider>
  );
}

export function useAppState(): AppContextValue {
  const ctx = useContext(AppContext);
  if (!ctx) {
    throw new Error('useAppState must be used within an AppProvider');
  }
  return ctx;
}

export type { AppAction };
