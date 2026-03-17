import { useEffect, useState, useCallback } from 'react';
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
import type { AppMode } from './types';

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

function BracketApp() {
  const { state, dispatch } = useAppState();
  const {
    mode, weights, upsetAppetite, biases, claudeBiases,
    poolConfig, bracket, simulationResults, narratives,
    guidedPickIndex, multiBrackets, claudeApiKey, isSimulating,
  } = state;

  const { pickWinner, lockPick: _lockPick, resetBracket, autoFillBracket } = useBracket();
  const { runSimulation: _runSimulation } = useSimulation();
  const { interpretBias } = useClaude();

  const [selectedMatchupId, setSelectedMatchupId] = useState<string | null>(null);
  const [leftPanel, setLeftPanel] = useState<'controls' | 'analysis'>('controls');
  const [showExport, setShowExport] = useState(false);
  const [showApiKeyInput, setShowApiKeyInput] = useState(false);

  // Initialize bracket on mount
  useEffect(() => {
    if (Object.keys(bracket.matchups).length === 0) {
      const initialBracket = initializeBracket(TEAMS);
      dispatch({ type: 'SET_BRACKET', payload: initialBracket });
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Build teams lookup
  const teamsMap = bracket.teams;

  // Get selected matchup
  const selectedMatchup = selectedMatchupId ? bracket.matchups[selectedMatchupId] : null;
  const selectedTeamA = selectedMatchup?.teamAId ? teamsMap[selectedMatchup.teamAId] : null;
  const selectedTeamB = selectedMatchup?.teamBId ? teamsMap[selectedMatchup.teamBId] : null;
  const selectedNarrative = selectedMatchupId ? narratives[selectedMatchupId] : undefined;

  // Mode change handler
  const handleModeChange = useCallback((newMode: AppMode) => {
    dispatch({ type: 'SET_MODE', payload: newMode });
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

  return (
    <div className="min-h-screen bg-slate-50">
      {/* Header */}
      <Header
        mode={mode}
        onModeChange={handleModeChange}
        poolConfig={poolConfig}
        dataStatus="ready"
        lastUpdated="March 16, 2026"
      />

      {/* API Key Banner */}
      {!claudeApiKey && (
        <div className="bg-blue-50 border-b border-blue-200 px-4 py-2 text-center text-sm">
          <span className="text-blue-700">
            AI features available —{' '}
            <button
              onClick={() => setShowApiKeyInput(!showApiKeyInput)}
              className="underline font-medium hover:text-blue-900"
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
                className="px-3 py-1 border rounded text-sm w-80"
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    dispatch({ type: 'SET_CLAUDE_API_KEY', payload: (e.target as HTMLInputElement).value });
                    setShowApiKeyInput(false);
                  }
                }}
              />
              <span className="text-xs text-gray-500">Press Enter to save</span>
            </div>
          )}
        </div>
      )}

      <div className="flex flex-col lg:flex-row">
        {/* Left Sidebar */}
        <aside className="w-full lg:w-80 xl:w-96 border-r border-gray-200 bg-white overflow-y-auto lg:h-[calc(100vh-64px)] shrink-0">
          {/* Sidebar tabs */}
          <div className="flex border-b border-gray-200">
            <button
              onClick={() => setLeftPanel('controls')}
              className={`flex-1 px-4 py-3 text-sm font-medium ${
                leftPanel === 'controls'
                  ? 'text-[#00274C] border-b-2 border-[#00274C]'
                  : 'text-gray-500 hover:text-gray-700'
              }`}
            >
              Controls
            </button>
            <button
              onClick={() => setLeftPanel('analysis')}
              className={`flex-1 px-4 py-3 text-sm font-medium ${
                leftPanel === 'analysis'
                  ? 'text-[#00274C] border-b-2 border-[#00274C]'
                  : 'text-gray-500 hover:text-gray-700'
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
                    className="w-full py-2 border border-gray-300 text-gray-600 rounded-lg text-sm hover:bg-gray-50 transition"
                  >
                    Reset Bracket
                  </button>
                  <button
                    onClick={() => setShowExport(!showExport)}
                    className="w-full py-2 border border-gray-300 text-gray-600 rounded-lg text-sm hover:bg-gray-50 transition"
                  >
                    Export / Share
                  </button>
                </div>

                {showExport && (
                  <ExportPanel bracket={bracket} teams={teamsMap} />
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
          {/* Simulation status bar */}
          {isSimulating && (
            <div className="bg-amber-50 border-b border-amber-200 px-4 py-2 text-sm text-amber-700 text-center">
              Running Monte Carlo simulation (10,000 iterations)...
            </div>
          )}

          {mode === 'guided' ? (
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
        <aside className={`border-l border-gray-200 bg-white overflow-y-auto lg:h-[calc(100vh-64px)] shrink-0 transition-all ${selectedMatchup && selectedTeamA && selectedTeamB ? 'w-full lg:w-80 xl:w-96' : 'w-0 lg:w-0 overflow-hidden'}`}>
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
            <div className="flex flex-col items-center justify-center h-full text-gray-400 p-8">
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
