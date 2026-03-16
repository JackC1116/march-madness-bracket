import type { PoolConfig as PoolConfigType, BracketArchetype } from '../types';
import { SCORING_SYSTEMS } from '../types';

interface PoolConfigProps {
  config: PoolConfigType;
  onChange: (config: PoolConfigType) => void;
}

const ARCHETYPE_OPTIONS: { key: BracketArchetype; label: string; description: string; emoji: string }[] = [
  { key: 'chalk', label: 'Chalk', description: 'Favor higher seeds, minimize risk', emoji: '📋' },
  { key: 'contrarian', label: 'Contrarian', description: 'Differentiate from the field', emoji: '🔄' },
  { key: 'cinderella', label: 'Cinderella', description: 'Bet on mid-major dark horses', emoji: '✨' },
  { key: 'bold_final_four', label: 'Bold Final Four', description: 'Unconventional Final Four picks', emoji: '🎲' },
];

const POOL_SIZE_PRESETS = [10, 25, 50, 100, 250, 500, 1000];

export default function PoolConfig({ config, onChange }: PoolConfigProps) {
  const updateConfig = (partial: Partial<PoolConfigType>) => {
    onChange({ ...config, ...partial });
  };

  const toggleArchetype = (arch: BracketArchetype) => {
    const current = config.archetypes;
    const next = current.includes(arch)
      ? current.filter((a) => a !== arch)
      : [...current, arch];
    updateConfig({ archetypes: next });
  };

  const handleScoringChange = (systemName: string) => {
    const system = SCORING_SYSTEMS[systemName];
    if (system) {
      updateConfig({ scoringSystem: { ...system } });
    }
  };

  const handleCustomPoints = (roundIndex: number, value: number) => {
    const newPoints = [...config.scoringSystem.pointsByRound];
    newPoints[roundIndex] = value;
    updateConfig({
      scoringSystem: { ...config.scoringSystem, name: 'Custom', pointsByRound: newPoints },
    });
  };

  const currentSystemKey =
    Object.entries(SCORING_SYSTEMS).find(
      ([, sys]) => sys.name === config.scoringSystem.name
    )?.[0] || 'custom';

  const isCustom = currentSystemKey === 'custom';
  const roundLabels = ['R64', 'R32', 'Sweet 16', 'Elite 8', 'Final Four', 'Championship'];

  return (
    <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
      {/* Header */}
      <div className="px-5 py-3 border-b border-gray-100">
        <h3 className="text-sm font-bold text-gray-900">Pool Configuration</h3>
        <p className="text-xs text-gray-400 mt-0.5">
          Tailor bracket strategy to your pool&apos;s rules
        </p>
      </div>

      {/* Pool size */}
      <div className="px-5 py-4 border-b border-gray-100">
        <label className="text-xs font-semibold text-gray-500 uppercase tracking-wider block mb-2">
          Pool Size
        </label>
        <div className="flex items-center gap-3">
          <input
            type="number"
            min={2}
            max={10000}
            value={config.poolSize}
            onChange={(e) => updateConfig({ poolSize: Math.max(2, parseInt(e.target.value, 10) || 2) })}
            className="w-24 text-sm font-bold border border-gray-200 rounded-lg px-3 py-2 text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-200 tabular-nums"
          />
          <span className="text-xs text-gray-400">entries</span>
        </div>
        <div className="flex gap-1.5 mt-2">
          {POOL_SIZE_PRESETS.map((size) => (
            <button
              key={size}
              onClick={() => updateConfig({ poolSize: size })}
              className={`
                px-2 py-1 text-[10px] font-medium rounded border transition-colors
                ${
                  config.poolSize === size
                    ? 'border-blue-300 bg-blue-50 text-blue-700'
                    : 'border-gray-200 text-gray-500 hover:bg-gray-50'
                }
              `}
            >
              {size}
            </button>
          ))}
        </div>
        <p className="text-[10px] text-gray-400 mt-2">
          Larger pools favor higher-variance strategies. Smaller pools favor chalk.
        </p>
      </div>

      {/* Scoring system */}
      <div className="px-5 py-4 border-b border-gray-100">
        <label className="text-xs font-semibold text-gray-500 uppercase tracking-wider block mb-2">
          Scoring System
        </label>
        <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-4">
          {Object.entries(SCORING_SYSTEMS).map(([key, sys]) => (
            <button
              key={key}
              onClick={() => handleScoringChange(key)}
              className={`
                px-3 py-2.5 rounded-lg border text-center transition-all
                ${
                  currentSystemKey === key
                    ? 'border-blue-300 bg-blue-50 shadow-sm'
                    : 'border-gray-200 hover:border-gray-300 hover:bg-gray-50'
                }
              `}
            >
              <span
                className={`text-xs font-bold block ${
                  currentSystemKey === key ? 'text-blue-700' : 'text-gray-700'
                }`}
              >
                {sys.name}
              </span>
              <span className="text-[9px] text-gray-400 block mt-0.5">
                {key === 'standard' && '1-2-4-8-16-32'}
                {key === 'upset_bonus' && '+ seed of winner'}
                {key === 'seed_based' && 'pts = seed number'}
                {key === 'custom' && 'Set your own'}
              </span>
            </button>
          ))}
        </div>

        {/* Points by round (always visible, editable when custom) */}
        <div className="mt-3 bg-gray-50 rounded-lg p-3">
          <div className="grid grid-cols-6 gap-2">
            {roundLabels.map((label, i) => (
              <div key={label} className="text-center">
                <span className="text-[9px] text-gray-400 font-medium block mb-1">{label}</span>
                {isCustom ? (
                  <input
                    type="number"
                    min={0}
                    max={100}
                    value={config.scoringSystem.pointsByRound[i] ?? 0}
                    onChange={(e) =>
                      handleCustomPoints(i, parseInt(e.target.value, 10) || 0)
                    }
                    className="w-full text-xs text-center font-bold border border-gray-200 rounded px-1 py-1 focus:outline-none focus:ring-2 focus:ring-blue-200"
                  />
                ) : (
                  <span className="text-sm font-bold text-gray-700 tabular-nums">
                    {config.scoringSystem.pointsByRound[i]}
                  </span>
                )}
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Number of brackets (multi mode) */}
      <div className="px-5 py-4 border-b border-gray-100">
        <label className="text-xs font-semibold text-gray-500 uppercase tracking-wider block mb-2">
          Number of Brackets
        </label>
        <div className="flex items-center gap-3">
          <input
            type="range"
            min={1}
            max={25}
            step={1}
            value={config.numBrackets}
            onChange={(e) => updateConfig({ numBrackets: parseInt(e.target.value, 10) })}
            className="flex-1 h-1.5 rounded-full appearance-none cursor-pointer"
            style={{
              background: `linear-gradient(to right, #00274C ${(config.numBrackets / 25) * 100}%, #e5e7eb ${(config.numBrackets / 25) * 100}%)`,
            }}
          />
          <span className="text-sm font-bold text-gray-900 tabular-nums w-8 text-center">
            {config.numBrackets}
          </span>
        </div>
        <p className="text-[10px] text-gray-400 mt-1">
          More brackets increase coverage but dilute individual bracket quality.
        </p>
      </div>

      {/* Archetypes */}
      <div className="px-5 py-4">
        <label className="text-xs font-semibold text-gray-500 uppercase tracking-wider block mb-2">
          Bracket Archetypes
        </label>
        <p className="text-[10px] text-gray-400 mb-3">
          Select strategies to include in multi-bracket generation.
        </p>
        <div className="grid grid-cols-2 gap-2">
          {ARCHETYPE_OPTIONS.map((arch) => {
            const isActive = config.archetypes.includes(arch.key);
            return (
              <button
                key={arch.key}
                onClick={() => toggleArchetype(arch.key)}
                className={`
                  flex items-start gap-2.5 px-3 py-3 rounded-lg border text-left transition-all
                  ${
                    isActive
                      ? 'border-blue-300 bg-blue-50 shadow-sm'
                      : 'border-gray-200 hover:border-gray-300 hover:bg-gray-50'
                  }
                `}
              >
                <div className="flex items-center justify-center w-8 h-8 rounded-lg bg-white border border-gray-100 text-lg shrink-0">
                  {arch.emoji}
                </div>
                <div>
                  <span
                    className={`text-xs font-bold block ${
                      isActive ? 'text-blue-700' : 'text-gray-700'
                    }`}
                  >
                    {arch.label}
                  </span>
                  <span className="text-[10px] text-gray-400 leading-tight block mt-0.5">
                    {arch.description}
                  </span>
                </div>
                {isActive && (
                  <svg className="w-4 h-4 text-blue-500 shrink-0 ml-auto" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                )}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
