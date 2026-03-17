import { useCallback, useEffect, useRef, useState } from 'react';
import { useAppState } from '../context/AppContext';
import { runSimulation as runMonteCarloSim } from '../engine/monte-carlo';
import { TEAMS } from '../data/teams';
import { MATCHUP_ODDS } from '../data/odds';
import { HISTORICAL_TRENDS } from '../data/historical-trends';

export function useSimulation() {
  const { state, dispatch } = useAppState();
  const { weights, biases, claudeBiases, upsetAppetite, bracket, simulationResults, isSimulating, simulationIterations } =
    state;

  const debounceTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const abortRef = useRef<boolean>(false);
  const [simulationProgress, setSimulationProgress] = useState<number>(0);

  const runSimulation = useCallback(async () => {
    abortRef.current = false;
    setSimulationProgress(0);

    if (Object.keys(bracket.teams).length === 0) return;

    dispatch({ type: 'SET_IS_SIMULATING', payload: true });

    try {
      const results = await runMonteCarloSim(
        TEAMS,
        weights,
        biases,
        MATCHUP_ODDS,
        HISTORICAL_TRENDS,
        simulationIterations,
        claudeBiases,
        (completed, total) => {
          if (!abortRef.current) {
            setSimulationProgress(completed / total);
          }
        },
      );

      if (!abortRef.current) {
        setSimulationProgress(1);
        dispatch({ type: 'SET_SIMULATION_RESULTS', payload: results });
      }
    } catch (err: unknown) {
      console.error('Simulation failed:', err);
    } finally {
      if (!abortRef.current) {
        dispatch({ type: 'SET_IS_SIMULATING', payload: false });
      }
    }
  }, [bracket, weights, biases, claudeBiases, simulationIterations, dispatch]);

  // Auto-run simulation debounced at 500ms
  useEffect(() => {
    if (Object.keys(bracket.teams).length === 0) return;

    if (debounceTimer.current) {
      clearTimeout(debounceTimer.current);
    }

    debounceTimer.current = setTimeout(() => {
      runSimulation();
    }, 500);

    return () => {
      if (debounceTimer.current) {
        clearTimeout(debounceTimer.current);
      }
    };
  }, [weights, biases, claudeBiases, upsetAppetite, bracket, simulationIterations, runSimulation]);

  useEffect(() => {
    return () => {
      abortRef.current = true;
      if (debounceTimer.current) {
        clearTimeout(debounceTimer.current);
      }
    };
  }, []);

  return {
    runSimulation,
    simulationResults,
    isSimulating,
    simulationProgress,
  };
}
