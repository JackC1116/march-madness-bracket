import { useCallback, useMemo } from 'react';
import { useAppState } from '../context/AppContext';
import type { Matchup, Region, Round } from '../types';

export function useBracket() {
  const { state, dispatch } = useAppState();
  const { bracket } = state;

  const pickWinner = useCallback(
    (matchupId: string, winnerId: string) => {
      dispatch({ type: 'PICK_WINNER', payload: { matchupId, winnerId } });
    },
    [dispatch],
  );

  const lockPick = useCallback(
    (matchupId: string) => {
      dispatch({ type: 'LOCK_PICK', payload: matchupId });
    },
    [dispatch],
  );

  const resetBracket = useCallback(() => {
    dispatch({ type: 'RESET_BRACKET' });
  }, [dispatch]);

  const autoFillBracket = useCallback(() => {
    dispatch({ type: 'AUTO_FILL_BRACKET' });
  }, [dispatch]);

  const getMatchupsByRound = useCallback(
    (round: Round): Matchup[] => {
      return Object.values(bracket.matchups)
        .filter((m) => m.round === round)
        .sort((a, b) => a.position - b.position);
    },
    [bracket.matchups],
  );

  const getMatchupsByRegion = useCallback(
    (region: Region | 'Final Four'): Matchup[] => {
      return Object.values(bracket.matchups)
        .filter((m) => m.region === region)
        .sort((a, b) => {
          const roundOrder = ['First Four', 'R64', 'R32', 'Sweet 16', 'Elite 8', 'Final Four', 'Championship'];
          const ri = roundOrder.indexOf(a.round) - roundOrder.indexOf(b.round);
          return ri !== 0 ? ri : a.position - b.position;
        });
    },
    [bracket.matchups],
  );

  const totalMatchups = useMemo(() => {
    return Object.values(bracket.matchups).filter(
      (m) => m.teamAId !== null && m.teamBId !== null,
    ).length;
  }, [bracket.matchups]);

  const pickedMatchups = useMemo(() => {
    return Object.values(bracket.matchups).filter(
      (m) => m.winnerId !== null,
    ).length;
  }, [bracket.matchups]);

  const getCompletionPercentage = useCallback((): number => {
    if (totalMatchups === 0) return 0;
    return Math.round((pickedMatchups / totalMatchups) * 100);
  }, [totalMatchups, pickedMatchups]);

  const isComplete = useCallback((): boolean => {
    if (totalMatchups === 0) return false;
    return pickedMatchups === totalMatchups;
  }, [totalMatchups, pickedMatchups]);

  return {
    bracket,
    pickWinner,
    lockPick,
    resetBracket,
    autoFillBracket,
    getMatchupsByRound,
    getMatchupsByRegion,
    getCompletionPercentage,
    isComplete,
  };
}
