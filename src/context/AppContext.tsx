import { createContext, useContext, useReducer, useEffect, type Dispatch, type ReactNode } from 'react';
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
  DEFAULT_WEIGHTS,
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
  | { type: 'AUTO_FILL_BRACKET' };

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

/**
 * Find the next-round matchup that this matchup feeds into.
 * Convention: matchup at position P in round N feeds into position floor(P/2) in round N+1
 * within the same region (or 'Final Four' region for Elite 8+).
 */
function findNextMatchup(
  matchups: Record<string, Matchup>,
  currentMatchup: Matchup,
): Matchup | null {
  const currentRoundIdx = roundIndex(currentMatchup.round);
  if (currentRoundIdx === -1 || currentRoundIdx >= ROUND_ORDER.length - 1) return null;

  const nextRound = ROUND_ORDER[currentRoundIdx + 1];
  const nextPosition = Math.floor(currentMatchup.position / 2);

  // Determine what region the next matchup lives in
  let nextRegion = currentMatchup.region;
  if (nextRound === 'Final Four' || nextRound === 'Championship') {
    nextRegion = 'Final Four';
  }

  for (const m of Object.values(matchups)) {
    if (m.round === nextRound && m.region === nextRegion && m.position === nextPosition) {
      return m;
    }
  }
  return null;
}

/**
 * Determine whether winnerId slots into teamA or teamB of the next matchup.
 * Even-position matchups feed teamA; odd-position matchups feed teamB.
 */
function slotSide(position: number): 'teamAId' | 'teamBId' {
  return position % 2 === 0 ? 'teamAId' : 'teamBId';
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
  const nextMatchup = findNextMatchup(matchups, current);
  if (nextMatchup) {
    const side = slotSide(current.position);
    matchups[nextMatchup.id] = {
      ...matchups[nextMatchup.id],
      [side]: winnerId,
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
      return { ...state, bracket: action.payload };

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
      const resetMatchups: Record<string, Matchup> = {};
      for (const [key, m] of Object.entries(state.bracket.matchups)) {
        resetMatchups[key] = {
          ...m,
          winnerId: null,
          locked: false,
          isUpset: false,
          confidence: 0,
          // Only keep teams for R64 / First Four; later rounds get cleared
          teamAId: roundIndex(m.round) <= 1 ? m.teamAId : null,
          teamBId: roundIndex(m.round) <= 1 ? m.teamBId : null,
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

    default:
      return state;
  }
}

// ── Default state ─────────────────────────────────────────────

const defaultState: AppState = {
  mode: 'single',
  weights: { ...DEFAULT_WEIGHTS },
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
};

// ── Context ───────────────────────────────────────────────────

interface AppContextValue {
  state: AppState;
  dispatch: Dispatch<AppAction>;
}

const AppContext = createContext<AppContextValue | undefined>(undefined);

export function AppProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(appReducer, defaultState);

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
