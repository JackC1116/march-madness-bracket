import { useEffect, useState, useCallback, useMemo, useRef } from 'react';
import { AppProvider, useAppState } from './context/AppContext';
import { useBracket } from './hooks/useBracket';
import { useSimulation } from './hooks/useSimulation';
import { useClaude } from './hooks/useClaude';
import { TEAMS } from './data/teams';
import { MATCHUP_ODDS } from './data/odds';
import { HISTORICAL_TRENDS } from './data/historical-trends';
import { initializeBracket } from './data/bracket-structure';
import { generateBracket } from './engine/bracket-generator';
import { generateMultiBrackets } from './engine/multi-bracket';
import type { AppMode, ThemeMode } from './types';

import Header from './components/Header';
import BracketView from './components/BracketView';
import MatchupCard from './components/MatchupCard';
import WeightSliders from './components/WeightSliders';
import BiasPanel from './components/BiasPanel';
import PoolConfig from './components/PoolConfig';
import AnalysisDashboard from './components/AnalysisDashboard';
import ClaudeChat from './components/ClaudeChat';
import MultiBracketView from './components/MultiBracketView';
import ExportPanel from './components/ExportPanel';
import GuidedPicks from './components/GuidedPicks';
import BracketComparison from './components/BracketComparison';

function Confetti() {
  const colors = ['#00274C', '#FF6B00', '#22c55e', '#eab308', '#ef4444', '#8b5cf6'];
  const particles = useMemo(() => Array.from({ length: 60 }, (_, i) => ({
    id: i,
    left: Math.random() * 100,
    delay: Math.random() * 2,
    duration: 2 + Math.random() * 2,
    color: colors[Math.floor(Math.random() * colors.length)],
    size: 6 + Math.random() * 8,
    isCircle: Math.random() > 0.5,
    rotation: Math.random() * 360,
  })), []); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="fixed inset-0 pointer-events-none z-50 overflow-hidden">
      {particles.map(p => (
        <div key={p.id} className="absolute" style={{
          left: `${p.left}%`,
          top: '-20px',
          width: p.size,
          height: p.size,
          backgroundColor: p.color,
          animationName: 'confetti-fall',
          animationTimingFunction: 'ease-in',
          animationFillMode: 'forwards',
          animationDelay: `${p.delay}s`,
          animationDuration: `${p.duration}s`,
          borderRadius: p.isCircle ? '50%' : '2px',
          transform: `rotate(${p.rotation}deg)`,
        }} />
      ))}
    </div>
  );
}

function BracketApp() {
  const { state, dispatch } = useAppState();
  const {
    mode, weights, upsetAppetite, biases, claudeBiases,
    poolConfig, bracket, simulationResults, narratives,
    guidedPickIndex, multiBrackets, claudeApiKey, isSimulating, theme,
    simulationIterations, pickHistory, undoneActions, comparisonBracket,
  } = state;

  const { pickWinner, lockPick: _lockPick, resetBracket, autoFillBracket } = useBracket();
  const { runSimulation: _runSimulation, simulationProgress } = useSimulation();
  const { interpretBias } = useClaude();

  const [selectedMatchupId, setSelectedMatchupId] = useState<string | null>(null);
  const [leftPanel, setLeftPanel] = useState<'controls' | 'analysis'>('controls');
  const [showExport, setShowExport] = useState(false);
  const [showApiKeyInput, setShowApiKeyInput] = useState(false);
  const [showConfetti, setShowConfetti] = useState(false);
  const [showComparison, setShowComparison] = useState(false);
  const prevChampionRef = useRef<string | null>(null);

  // Initialize bracket on mount
  useEffect(() => {
    if (Object.keys(bracket.matchups).length === 0) {
      const initialBracket = initializeBracket(TEAMS);
      dispatch({ type: 'SET_BRACKET', payload: initialBracket });
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Keyboard shortcuts for undo/redo
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const isMac = navigator.platform.toUpperCase().indexOf('MAC') >= 0;
      const ctrlOrCmd = isMac ? e.metaKey : e.ctrlKey;

      if (ctrlOrCmd && e.key === 'z' && !e.shiftKey) {
        e.preventDefault();
        dispatch({ type: 'UNDO' });
      } else if (ctrlOrCmd && e.key === 'z' && e.shiftKey) {
        e.preventDefault();
        dispatch({ type: 'REDO' });
      } else if (ctrlOrCmd && e.key === 'y') {
        e.preventDefault();
        dispatch({ type: 'REDO' });
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [dispatch]);

  // Detect championship winner and trigger confetti
  useEffect(() => {
    const champMatchup = Object.values(bracket.matchups).find(
      (m) => m.round === 'Championship'
    );
    const champWinner = champMatchup?.winnerId ?? null;
    if (champWinner && champWinner !== prevChampionRef.current) {
      setShowConfetti(true);
      const timer = setTimeout(() => setShowConfetti(false), 4000);
      prevChampionRef.current = champWinner;
      return () => clearTimeout(timer);
    }
    prevChampionRef.current = champWinner;
  }, [bracket.matchups]);

  // Build teams lookup
  const teamsMap = bracket.teams;

  // Bracket completion stats
  const completionStats = useMemo(() => {
    const matchups = Object.values(bracket.matchups);
    const total = matchups.length;
    const picked = matchups.filter((m) => m.winnerId !== null).length;
    const percentage = total > 0 ? Math.round((picked / total) * 100) : 0;
    return { total, picked, percentage };
  }, [bracket.matchups]);

  // Get selected matchup
  const selectedMatchup = selectedMatchupId ? bracket.matchups[selectedMatchupId] : null;
  const selectedTeamA = selectedMatchup?.teamAId ? teamsMap[selectedMatchup.teamAId] : null;
  const selectedTeamB = selectedMatchup?.teamBId ? teamsMap[selectedMatchup.teamBId] : null;
  const selectedNarrative = selectedMatchupId ? narratives[selectedMatchupId] : undefined;

  // Mode change handler
  const handleModeChange = useCallback((newMode: AppMode) => {
    dispatch({ type: 'SET_MODE', payload: newMode });
  }, [dispatch]);

  // Theme change handler
  const handleThemeChange = useCallback((newTheme: ThemeMode) => {
    dispatch({ type: 'SET_THEME', payload: newTheme });
  }, [dispatch]);

  // Generate single bracket
  const handleGenerateBracket = useCallback(() => {
    if (!simulationResults) return;
    const generated = generateBracket(
      TEAMS, simulationResults, upsetAppetite,
      poolConfig.scoringSystem, weights, biases,
      MATCHUP_ODDS, HISTORICAL_TRENDS,
    );
    dispatch({ type: 'SET_BRACKET', payload: generated });
  }, [simulationResults, upsetAppetite, poolConfig.scoringSystem, weights, biases, dispatch]);

  // Generate multi brackets
  const handleGenerateMulti = useCallback(() => {
    if (!simulationResults) return;
    const brackets = generateMultiBrackets(
      TEAMS, simulationResults, poolConfig,
      weights, biases, MATCHUP_ODDS, HISTORICAL_TRENDS,
    );
    dispatch({ type: 'SET_MULTI_BRACKETS', payload: brackets });
  }, [simulationResults, poolConfig, weights, biases, dispatch]);

  // Claude bias handler
  const handleApplyClaudeBias = useCallback(async (text: string) => {
    const adjustments = await interpretBias(text);
    if (adjustments.length > 0) {
      dispatch({ type: 'SET_CLAUDE_BIASES', payload: [...claudeBiases, ...adjustments] });
    }
  }, [interpretBias, claudeBiases, dispatch]);

  // Guided picks navigation
  const handleGuidedNext = useCallback(() => {
    dispatch({ type: 'SET_GUIDED_INDEX', payload: guidedPickIndex + 1 });
  }, [guidedPickIndex, dispatch]);

  const handleGuidedPrev = useCallback(() => {
    dispatch({ type: 'SET_GUIDED_INDEX', payload: Math.max(0, guidedPickIndex - 1) });
  }, [guidedPickIndex, dispatch]);

  // Undo/Redo handlers
  const handleUndo = useCallback(() => {
    dispatch({ type: 'UNDO' });
  }, [dispatch]);

  const handleRedo = useCallback(() => {
    dispatch({ type: 'REDO' });
  }, [dispatch]);

  const handleCompare = useCallback((compBracket: import('./types').BracketState) => {
    dispatch({ type: 'SET_COMPARISON_BRACKET', payload: compBracket });
    setShowComparison(true);
  }, [dispatch]);

  const handleCloseComparison = useCallback(() => {
    dispatch({ type: 'CLEAR_COMPARISON_BRACKET' });
    setShowComparison(false);
  }, [dispatch]);

  const canUndo = pickHistory.length > 0;
  const canRedo = undoneActions.length > 0;

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-gray-900">
      {showConfetti && <Confetti />}
      {/* Header */}
      <Header
        mode={mode}
        onModeChange={handleModeChange}
        poolConfig={poolConfig}
        dataStatus="ready"
        lastUpdated="March 16, 2026"
        theme={theme}
        onThemeChange={handleThemeChange}
      />

      {/* Bracket Completion Tracker */}
      {completionStats.total > 0 && (
        <div className="bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 px-4 py-1.5">
          <div className="flex items-center gap-3 max-w-screen-2xl mx-auto">
            <span className="text-xs font-medium text-gray-600 dark:text-gray-300 whitespace-nowrap">
              {completionStats.picked}/{completionStats.total} games picked
            </span>
            <div className="flex-1 h-2 bg-gray-200 dark:bg-gray-600 rounded-full overflow-hidden">
              <div
                className="h-full rounded-full transition-all duration-300"
                style={{
                  width: `${completionStats.percentage}%`,
                  backgroundColor: completionStats.percentage === 100 ? '#10b981' : '#00274C',
                }}
              />
            </div>
            <span className="text-xs font-bold tabular-nums text-gray-700 dark:text-gray-200 whitespace-nowrap">
              {completionStats.percentage}%
            </span>
          </div>
        </div>
      )}

      {/* API Key Banner */}
      {!claudeApiKey && (
        <div className="bg-blue-50 dark:bg-blue-900/30 border-b border-blue-200 dark:border-blue-800 px-4 py-2 text-center text-sm">
          <span className="text-blue-700 dark:text-blue-300">
            AI features available —{' '}
            <button
              onClick={() => setShowApiKeyInput(!showApiKeyInput)}
              className="underline font-medium hover:text-blue-900 dark:hover:text-blue-100"
            >
              add your Claude API key
            </button>
            {' '}for matchup narratives, bias interpretation, and analysis chat.
          </span>
          {showApiKeyInput && (
            <div className="mt-2 flex items-center justify-center gap-2">
              <input
                type="password"
                placeholder="sk-ant-..."
                className="px-3 py-1 border rounded text-sm w-80 dark:bg-gray-700 dark:border-gray-600 dark:text-gray-100"
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    dispatch({ type: 'SET_CLAUDE_API_KEY', payload: (e.target as HTMLInputElement).value });
                    setShowApiKeyInput(false);
                  }
                }}
              />
              <span className="text-xs text-gray-500 dark:text-gray-400">Press Enter to save</span>
            </div>
          )}
        </div>
      )}

      <div className="flex flex-col lg:flex-row">
        {/* Left Sidebar */}
        <aside className="w-full lg:w-80 xl:w-96 border-r border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 overflow-y-auto lg:h-[calc(100vh-64px)] shrink-0">
          {/* Sidebar tabs */}
          <div className="flex border-b border-gray-200 dark:border-gray-700">
            <button
              onClick={() => setLeftPanel('controls')}
              className={`flex-1 px-4 py-3 text-sm font-medium ${
                leftPanel === 'controls'
                  ? 'text-[#00274C] dark:text-blue-300 border-b-2 border-[#00274C] dark:border-blue-300'
                  : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200'
              }`}
            >
              Controls
            </button>
            <button
              onClick={() => setLeftPanel('analysis')}
              className={`flex-1 px-4 py-3 text-sm font-medium ${
                leftPanel === 'analysis'
                  ? 'text-[#00274C] dark:text-blue-300 border-b-2 border-[#00274C] dark:border-blue-300'
                  : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200'
              }`}
            >
              Analysis
            </button>
          </div>

          <div className="p-4 space-y-4">
            {leftPanel === 'controls' ? (
              <>
                {/* Weight Sliders */}
                <WeightSliders
                  weights={weights}
                  onChange={(w) => dispatch({ type: 'SET_WEIGHTS', payload: w })}
                  iterations={simulationIterations}
                  onIterationsChange={(n) => dispatch({ type: 'SET_SIMULATION_ITERATIONS', payload: n })}
                />

                {/* Pool Config */}
                <PoolConfig
                  config={poolConfig}
                  onChange={(c) => dispatch({ type: 'SET_POOL_CONFIG', payload: c })}
                />

                {/* Bias Panel */}
                <BiasPanel
                  biases={biases}
                  claudeBiases={claudeBiases}
                  upsetAppetite={upsetAppetite}
                  teams={teamsMap}
                  onAddBias={(b) => dispatch({ type: 'ADD_BIAS', payload: b })}
                  onRemoveBias={(i) => dispatch({ type: 'REMOVE_BIAS', payload: i })}
                  onSetAppetite={(a) => dispatch({ type: 'SET_UPSET_APPETITE', payload: a })}
                  onApplyClaudeBias={handleApplyClaudeBias}
                />

                {/* Action Buttons */}
                <div className="space-y-2 pt-2">
                  {mode === 'single' && (
                    <button
                      onClick={handleGenerateBracket}
                      disabled={!simulationResults || isSimulating}
                      className="w-full py-3 bg-[#00274C] text-white rounded-lg font-medium hover:bg-[#003366] disabled:opacity-50 disabled:cursor-not-allowed transition"
                    >
                      {isSimulating ? 'Simulating...' : 'Generate Bracket'}
                    </button>
                  )}
                  {mode === 'multi' && (
                    <button
                      onClick={handleGenerateMulti}
                      disabled={!simulationResults || isSimulating}
                      className="w-full py-3 bg-[#FF6B00] text-white rounded-lg font-medium hover:bg-[#e06000] disabled:opacity-50 disabled:cursor-not-allowed transition"
                    >
                      {isSimulating ? 'Simulating...' : `Generate ${poolConfig.numBrackets} Brackets`}
                    </button>
                  )}
                  <button
                    onClick={resetBracket}
                    className="w-full py-2 border border-gray-300 dark:border-gray-600 text-gray-600 dark:text-gray-300 rounded-lg text-sm hover:bg-gray-50 dark:hover:bg-gray-700 transition"
                  >
                    Reset Bracket
                  </button>
                  <button
                    onClick={() => setShowExport(!showExport)}
                    className="w-full py-2 border border-gray-300 dark:border-gray-600 text-gray-600 dark:text-gray-300 rounded-lg text-sm hover:bg-gray-50 dark:hover:bg-gray-700 transition"
                  >
                    Export / Share
                  </button>
                </div>

                {showExport && (
                  <ExportPanel bracket={bracket} teams={teamsMap} onCompare={handleCompare} />
                )}
              </>
            ) : (
              <>
                {simulationResults ? (
                  <AnalysisDashboard
                    simulationResults={simulationResults}
                    teams={teamsMap}
                    bracket={bracket}
                  />
                ) : (
                  <div className="text-center py-12 text-gray-400">
                    <p className="text-lg">Running simulation...</p>
                    <p className="text-sm mt-1">Analysis will appear once the Monte Carlo simulation completes.</p>
                  </div>
                )}
              </>
            )}
          </div>
        </aside>

        {/* Main Content */}
        <main className="flex-1 overflow-x-auto">
          {/* Simulation status bar with progress */}
          {isSimulating && (
            <div className="bg-amber-50 dark:bg-amber-900/30 border-b border-amber-200 dark:border-amber-800 px-4 py-2 text-sm text-amber-700 dark:text-amber-300">
              <div className="flex items-center gap-3">
                <span className="whitespace-nowrap">
                  Running Monte Carlo simulation ({simulationIterations.toLocaleString()} iterations)...
                </span>
                <div className="flex-1 h-2 bg-amber-200 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-amber-500 rounded-full transition-all duration-200"
                    style={{ width: `${Math.round(simulationProgress * 100)}%` }}
                  />
                </div>
                <span className="text-xs font-bold tabular-nums whitespace-nowrap">
                  {Math.round(simulationProgress * 100)}%
                </span>
              </div>
            </div>
          )}

          {/* Undo/Redo Floating Toolbar */}
          <div className="sticky top-0 z-10 flex items-center gap-1 px-4 py-2 bg-white/80 dark:bg-gray-800/80 backdrop-blur-sm border-b border-gray-100 dark:border-gray-700">
            <button
              onClick={handleUndo}
              disabled={!canUndo}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg border border-gray-200 dark:border-gray-600 text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 disabled:opacity-30 disabled:cursor-not-allowed transition"
              title="Undo (Ctrl+Z)"
            >
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 15L3 9m0 0l6-6M3 9h12a6 6 0 010 12h-3" />
              </svg>
              Undo
              <kbd className="hidden sm:inline ml-1 px-1 py-0.5 text-[10px] bg-gray-100 dark:bg-gray-600 rounded">Ctrl+Z</kbd>
            </button>
            <button
              onClick={handleRedo}
              disabled={!canRedo}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg border border-gray-200 dark:border-gray-600 text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 disabled:opacity-30 disabled:cursor-not-allowed transition"
              title="Redo (Ctrl+Shift+Z)"
            >
              Redo
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M15 15l6-6m0 0l-6-6m6 6H9a6 6 0 000 12h3" />
              </svg>
              <kbd className="hidden sm:inline ml-1 px-1 py-0.5 text-[10px] bg-gray-100 dark:bg-gray-600 rounded">Ctrl+Shift+Z</kbd>
            </button>
          </div>

          {/* Comparison banner */}
          {comparisonBracket && !showComparison && (
            <div className="bg-blue-50 dark:bg-blue-900/30 border-b border-blue-200 dark:border-blue-800 px-4 py-2 flex items-center justify-between">
              <span className="text-sm text-blue-700 dark:text-blue-300">
                A friend's bracket is loaded for comparison.
              </span>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setShowComparison(true)}
                  className="px-3 py-1 text-xs font-medium bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition"
                >
                  View Comparison
                </button>
                <button
                  onClick={handleCloseComparison}
                  className="px-3 py-1 text-xs font-medium border border-blue-300 dark:border-blue-600 text-blue-700 dark:text-blue-300 rounded-lg hover:bg-blue-100 dark:hover:bg-blue-800 transition"
                >
                  Dismiss
                </button>
              </div>
            </div>
          )}

          {showComparison && comparisonBracket ? (
            <div className="p-4 overflow-y-auto">
              <BracketComparison
                myBracket={bracket}
                compBracket={comparisonBracket}
                teams={teamsMap}
                onClose={handleCloseComparison}
              />
            </div>
          ) : mode === 'guided' ? (
            <div className="p-4">
              <GuidedPicks
                bracket={bracket}
                teams={teamsMap}
                currentIndex={guidedPickIndex}
                narratives={narratives}
                onPick={pickWinner}
                onNext={handleGuidedNext}
                onPrev={handleGuidedPrev}
                onAutoFill={autoFillBracket}
              />
            </div>
          ) : mode === 'multi' && multiBrackets.length > 0 ? (
            <div className="p-4">
              <MultiBracketView
                brackets={multiBrackets}
                teams={teamsMap}
                archetypes={poolConfig.archetypes}
              />
            </div>
          ) : (
            <div className="p-4">
              <BracketView
                bracket={bracket}
                teams={teamsMap}
                onPickWinner={pickWinner}
                onSelectMatchup={setSelectedMatchupId}
                selectedMatchupId={selectedMatchupId}
              />
            </div>
          )}
        </main>

        {/* Right Sidebar — Matchup Detail / Claude Chat (only when matchup selected) */}
        <aside className={`border-l border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 overflow-y-auto lg:h-[calc(100vh-64px)] shrink-0 transition-all ${selectedMatchup && selectedTeamA && selectedTeamB ? 'w-full lg:w-80 xl:w-96' : 'w-0 lg:w-0 overflow-hidden'}`}>
          {selectedMatchup && selectedTeamA && selectedTeamB ? (
            <div className="space-y-0">
              <MatchupCard
                matchup={selectedMatchup}
                teamA={selectedTeamA}
                teamB={selectedTeamB}
                narrative={selectedNarrative}
                onPick={(winnerId) => pickWinner(selectedMatchup.id, winnerId)}
              />
              <ClaudeChat
                matchupId={selectedMatchupId}
                teams={teamsMap}
                bracket={bracket}
                apiKey={claudeApiKey}
              />
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center h-full text-gray-400 dark:text-gray-500 p-8">
              <svg className="w-16 h-16 mb-4 opacity-30" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
                  d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
              <p className="text-lg font-medium">Select a matchup</p>
              <p className="text-sm mt-1 text-center">Click any game in the bracket to see detailed analysis and AI insights.</p>
            </div>
          )}
        </aside>
      </div>
    </div>
  );
}

function App() {
  return (
    <AppProvider>
      <BracketApp />
    </AppProvider>
  );
}

export default App;
