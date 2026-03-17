import { useCallback } from 'react';
import type { ModelWeights } from '../types';
import { DEFAULT_WEIGHTS } from '../types';

interface WeightSlidersProps {
  weights: ModelWeights;
  onChange: (weights: ModelWeights) => void;
  iterations?: number;
  onIterationsChange?: (n: number) => void;
}

const WEIGHT_KEYS: { key: keyof ModelWeights; label: string; description: string }[] = [
  { key: 'kenpom', label: 'KenPom', description: 'Adjusted efficiency margin' },
  { key: 'barttorvik', label: 'Barttorvik', description: 'Barthag win probability' },
  { key: 'net', label: 'NET', description: 'NCAA Evaluation Tool' },
  { key: 'sagarin', label: 'Sagarin', description: 'Sagarin ratings' },
  { key: 'vegas', label: 'Vegas', description: 'Betting market odds' },
  { key: 'historical', label: 'Historical', description: 'Seed matchup history' },
  { key: 'experience', label: 'Experience', description: 'Tournament experience' },
];

export default function WeightSliders({ weights, onChange, iterations, onIterationsChange }: WeightSlidersProps) {
  const handleSliderChange = useCallback(
    (changedKey: keyof ModelWeights, newValue: number) => {
      const oldValue = weights[changedKey];
      const delta = newValue - oldValue;

      if (Math.abs(delta) < 0.001) return;

      // Calculate sum of all other weights
      const otherKeys = WEIGHT_KEYS.filter((w) => w.key !== changedKey);
      const otherSum = otherKeys.reduce((sum, w) => sum + weights[w.key], 0);

      const newWeights = { ...weights };
      newWeights[changedKey] = newValue;

      if (otherSum > 0.001) {
        // Proportionally adjust other weights so total remains 1.0
        const scale = (1 - newValue) / otherSum;
        for (const w of otherKeys) {
          newWeights[w.key] = Math.max(0, weights[w.key] * scale);
        }
      } else {
        // If other weights are all zero, distribute remaining equally
        const remaining = 1 - newValue;
        const share = remaining / otherKeys.length;
        for (const w of otherKeys) {
          newWeights[w.key] = share;
        }
      }

      // Normalize to exactly 1.0 to avoid floating-point drift
      const total = Object.values(newWeights).reduce((s, v) => s + v, 0);
      if (total > 0) {
        for (const key of Object.keys(newWeights) as (keyof ModelWeights)[]) {
          newWeights[key] = newWeights[key] / total;
        }
      }

      onChange(newWeights);
    },
    [weights, onChange]
  );

  const handleReset = () => {
    onChange({ ...DEFAULT_WEIGHTS });
  };

  const total = Object.values(weights).reduce((s, v) => s + v, 0);

  return (
    <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 shadow-sm p-5">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h3 className="text-sm font-bold text-gray-900 dark:text-gray-100">Model Weights</h3>
          <p className="text-xs text-gray-400 dark:text-gray-500 mt-0.5">Adjust how each data source influences predictions</p>
        </div>
        <button
          onClick={handleReset}
          className="px-3 py-1.5 text-xs font-medium text-gray-500 dark:text-gray-400 border border-gray-200 dark:border-gray-600 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
        >
          Reset to defaults
        </button>
      </div>

      {/* Weight sum indicator */}
      <div className="flex items-center gap-2 mb-4 px-3 py-2 rounded-lg bg-gray-50 dark:bg-gray-700">
        <span className="text-xs text-gray-400 dark:text-gray-500">Total:</span>
        <span
          className={`text-xs font-bold tabular-nums ${
            Math.abs(total - 1) < 0.01 ? 'text-emerald-600' : 'text-red-500'
          }`}
        >
          {(total * 100).toFixed(1)}%
        </span>
        <div className="flex-1 h-1.5 bg-gray-200 dark:bg-gray-600 rounded-full overflow-hidden">
          {WEIGHT_KEYS.map((w, i) => {
            const colors = [
              '#00274C', '#1a5276', '#2980b9', '#3498db', '#FF6B00', '#e67e22', '#f39c12',
            ];
            return (
              <div
                key={w.key}
                className="h-full inline-block"
                style={{
                  width: `${weights[w.key] * 100}%`,
                  backgroundColor: colors[i],
                }}
              />
            );
          })}
        </div>
      </div>

      {/* Sliders */}
      <div className="space-y-3">
        {WEIGHT_KEYS.map((w, i) => {
          const value = weights[w.key];
          const pct = (value * 100).toFixed(1);
          const defaultPct = (DEFAULT_WEIGHTS[w.key] * 100).toFixed(1);
          const isModified = Math.abs(value - DEFAULT_WEIGHTS[w.key]) > 0.005;
          const colors = [
            '#00274C', '#1a5276', '#2980b9', '#3498db', '#FF6B00', '#e67e22', '#f39c12',
          ];

          return (
            <div key={w.key}>
              <div className="flex items-center justify-between mb-1">
                <div className="flex items-center gap-2">
                  <div
                    className="w-2.5 h-2.5 rounded-sm"
                    style={{ backgroundColor: colors[i] }}
                  />
                  <span className="text-xs font-semibold text-gray-700 dark:text-gray-200">{w.label}</span>
                  <span className="text-[10px] text-gray-400 dark:text-gray-500">{w.description}</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <span className="text-xs font-bold tabular-nums text-gray-900 dark:text-gray-100 w-12 text-right">
                    {pct}%
                  </span>
                  {isModified && (
                    <span className="text-[10px] text-gray-400 tabular-nums">
                      (def: {defaultPct}%)
                    </span>
                  )}
                </div>
              </div>
              <input
                type="range"
                min={0}
                max={100}
                step={1}
                value={Math.round(value * 100)}
                onChange={(e) =>
                  handleSliderChange(w.key, parseInt(e.target.value, 10) / 100)
                }
                className="w-full h-1.5 rounded-full appearance-none cursor-pointer"
                style={{
                  background: `linear-gradient(to right, ${colors[i]} ${value * 100}%, #e5e7eb ${value * 100}%)`,
                }}
              />
            </div>
          );
        })}
      </div>

      {/* Visual weight distribution */}
      <div className="mt-4 pt-3 border-t border-gray-100 dark:border-gray-700">
        <div className="flex gap-0.5 h-6 rounded-lg overflow-hidden">
          {WEIGHT_KEYS.map((w, i) => {
            const colors = [
              '#00274C', '#1a5276', '#2980b9', '#3498db', '#FF6B00', '#e67e22', '#f39c12',
            ];
            const pct = weights[w.key] * 100;
            if (pct < 1) return null;
            return (
              <div
                key={w.key}
                className="h-full flex items-center justify-center transition-all duration-200"
                style={{ width: `${pct}%`, backgroundColor: colors[i] }}
                title={`${w.label}: ${pct.toFixed(1)}%`}
              >
                {pct > 8 && (
                  <span className="text-[9px] text-white font-bold truncate px-1">
                    {w.label}
                  </span>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Monte Carlo Iterations Slider */}
      {iterations !== undefined && onIterationsChange && (
        <div className="mt-4 pt-3 border-t border-gray-100 dark:border-gray-700">
          <div className="flex items-center justify-between mb-1">
            <span className="text-xs font-semibold text-gray-700">Simulation Iterations</span>
            <span className="text-xs font-bold tabular-nums text-gray-900">
              {iterations.toLocaleString()}
            </span>
          </div>
          <input
            type="range"
            min={1000}
            max={50000}
            step={1000}
            value={iterations}
            onChange={(e) => onIterationsChange(parseInt(e.target.value, 10))}
            className="w-full h-1.5 rounded-full appearance-none cursor-pointer"
            style={{
              background: `linear-gradient(to right, #00274C ${((iterations - 1000) / 49000) * 100}%, #e5e7eb ${((iterations - 1000) / 49000) * 100}%)`,
            }}
          />
          <p className="text-[10px] text-gray-400 mt-1">
            More iterations = more accurate, slower
          </p>
        </div>
      )}
    </div>
  );
}
