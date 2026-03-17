import { useState, useCallback } from 'react';
import type { AdvancedModelSettings } from '../types';
import { DEFAULT_ADVANCED_SETTINGS } from '../types';

interface AdvancedSettingsProps {
  settings: AdvancedModelSettings;
  onChange: (settings: AdvancedModelSettings) => void;
}

function Toggle({
  checked,
  onChange,
  disabled,
}: {
  checked: boolean;
  onChange: (val: boolean) => void;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={`relative inline-flex h-5 w-9 shrink-0 items-center rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-[#00274C] focus:ring-offset-2 dark:focus:ring-offset-gray-800 ${
        checked
          ? 'bg-[#00274C] dark:bg-blue-500'
          : 'bg-gray-300 dark:bg-gray-600'
      } ${disabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}`}
    >
      <span
        className={`inline-block h-3.5 w-3.5 rounded-full bg-white shadow transition-transform ${
          checked ? 'translate-x-[18px]' : 'translate-x-[3px]'
        }`}
      />
    </button>
  );
}

function NumberInput({
  value,
  onChange,
  min,
  max,
  step,
  disabled,
  suffix,
}: {
  value: number;
  onChange: (val: number) => void;
  min?: number;
  max?: number;
  step?: number;
  disabled?: boolean;
  suffix?: string;
}) {
  return (
    <div className="flex items-center gap-1.5">
      <input
        type="number"
        value={value}
        min={min}
        max={max}
        step={step ?? 1}
        disabled={disabled}
        onChange={(e) => {
          const v = parseFloat(e.target.value);
          if (!isNaN(v)) onChange(v);
        }}
        className={`w-16 px-2 py-1 text-xs text-right font-mono border rounded-md transition-colors
          ${disabled
            ? 'bg-gray-100 dark:bg-gray-700 text-gray-400 dark:text-gray-500 border-gray-200 dark:border-gray-600 cursor-not-allowed'
            : 'bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 border-gray-300 dark:border-gray-500 focus:border-[#00274C] dark:focus:border-blue-400 focus:ring-1 focus:ring-[#00274C] dark:focus:ring-blue-400'
          }`}
      />
      {suffix && (
        <span className={`text-[10px] ${disabled ? 'text-gray-400 dark:text-gray-600' : 'text-gray-500 dark:text-gray-400'}`}>
          {suffix}
        </span>
      )}
    </div>
  );
}

function SliderInput({
  value,
  onChange,
  min,
  max,
  step,
  disabled,
  suffix,
}: {
  value: number;
  onChange: (val: number) => void;
  min: number;
  max: number;
  step?: number;
  disabled?: boolean;
  suffix?: string;
}) {
  const pct = ((value - min) / (max - min)) * 100;
  return (
    <div className="flex items-center gap-2 flex-1">
      <input
        type="range"
        min={min}
        max={max}
        step={step ?? 1}
        value={value}
        disabled={disabled}
        onChange={(e) => onChange(parseFloat(e.target.value))}
        className={`flex-1 h-1.5 rounded-full appearance-none ${disabled ? 'cursor-not-allowed opacity-50' : 'cursor-pointer'}`}
        style={{
          background: disabled
            ? '#d1d5db'
            : `linear-gradient(to right, #00274C ${pct}%, #e5e7eb ${pct}%)`,
        }}
      />
      <span className={`text-xs font-bold tabular-nums w-10 text-right ${disabled ? 'text-gray-400 dark:text-gray-600' : 'text-gray-900 dark:text-gray-100'}`}>
        {Math.round(value * 100)}{suffix ?? '%'}
      </span>
    </div>
  );
}

function SectionDivider() {
  return <div className="border-t border-gray-100 dark:border-gray-700" />;
}

export default function AdvancedSettings({ settings, onChange }: AdvancedSettingsProps) {
  const [expanded, setExpanded] = useState(false);

  const update = useCallback(
    (patch: Partial<AdvancedModelSettings>) => {
      onChange({ ...settings, ...patch });
    },
    [settings, onChange]
  );

  const handleReset = useCallback(() => {
    onChange({ ...DEFAULT_ADVANCED_SETTINGS });
  }, [onChange]);

  return (
    <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 shadow-sm">
      {/* Header / collapse toggle */}
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center justify-between px-5 py-4 text-left hover:bg-gray-50 dark:hover:bg-gray-750 rounded-xl transition-colors"
      >
        <div>
          <h3 className="text-sm font-bold text-gray-900 dark:text-gray-100">
            Advanced Model Settings
          </h3>
          <p className="text-xs text-gray-400 dark:text-gray-500 mt-0.5">
            Fine-tune simulation heuristics
          </p>
        </div>
        <svg
          className={`w-4 h-4 text-gray-400 dark:text-gray-500 transition-transform duration-200 ${expanded ? 'rotate-90' : ''}`}
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth={2}
        >
          <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
        </svg>
      </button>

      {expanded && (
        <div className="px-5 pb-5 space-y-4">
          <SectionDivider />

          {/* ── Champion Filter ─────────────────────────────── */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-gray-700 dark:text-gray-200">
                Champion Filter
              </span>
              <Toggle
                checked={settings.championFilter}
                onChange={(v) => update({ championFilter: v })}
              />
            </div>
            <p className={`text-[10px] leading-snug ${settings.championFilter ? 'text-gray-500 dark:text-gray-400' : 'text-gray-400 dark:text-gray-600'}`}>
              Only consider teams meeting all thresholds as title contenders. 15 of 18 champs since 2007 met this profile.
            </p>
            <div className="grid grid-cols-1 gap-1.5 pl-1">
              <div className="flex items-center justify-between">
                <span className={`text-[11px] ${settings.championFilter ? 'text-gray-600 dark:text-gray-300' : 'text-gray-400 dark:text-gray-600'}`}>
                  Min Offense Rank
                </span>
                <NumberInput
                  value={settings.championFilterMinOffenseRank}
                  onChange={(v) => update({ championFilterMinOffenseRank: v })}
                  min={1}
                  max={100}
                  disabled={!settings.championFilter}
                />
              </div>
              <div className="flex items-center justify-between">
                <span className={`text-[11px] ${settings.championFilter ? 'text-gray-600 dark:text-gray-300' : 'text-gray-400 dark:text-gray-600'}`}>
                  Min Defense Rank
                </span>
                <NumberInput
                  value={settings.championFilterMinDefenseRank}
                  onChange={(v) => update({ championFilterMinDefenseRank: v })}
                  min={1}
                  max={100}
                  disabled={!settings.championFilter}
                />
              </div>
              <div className="flex items-center justify-between">
                <span className={`text-[11px] ${settings.championFilter ? 'text-gray-600 dark:text-gray-300' : 'text-gray-400 dark:text-gray-600'}`}>
                  Min SOS Rank
                </span>
                <NumberInput
                  value={settings.championFilterMinSosRank}
                  onChange={(v) => update({ championFilterMinSosRank: v })}
                  min={1}
                  max={100}
                  disabled={!settings.championFilter}
                />
              </div>
            </div>
          </div>

          <SectionDivider />

          {/* ── Upset Calibration ──────────────────────────── */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-gray-700 dark:text-gray-200">
                Upset Calibration
              </span>
              <Toggle
                checked={settings.upsetCalibration}
                onChange={(v) => update({ upsetCalibration: v })}
              />
            </div>
            <p className={`text-[10px] leading-snug ${settings.upsetCalibration ? 'text-gray-500 dark:text-gray-400' : 'text-gray-400 dark:text-gray-600'}`}>
              Ensure a realistic number of Round 1 upsets (~8-9 historically).
            </p>
            <div className="grid grid-cols-1 gap-1.5 pl-1">
              <div className="flex items-center justify-between">
                <span className={`text-[11px] ${settings.upsetCalibration ? 'text-gray-600 dark:text-gray-300' : 'text-gray-400 dark:text-gray-600'}`}>
                  Target R1 upsets
                </span>
                <div className="flex items-center gap-1">
                  <NumberInput
                    value={settings.minFirstRoundUpsets}
                    onChange={(v) => update({ minFirstRoundUpsets: v })}
                    min={0}
                    max={16}
                    disabled={!settings.upsetCalibration}
                  />
                  <span className={`text-[10px] ${settings.upsetCalibration ? 'text-gray-500 dark:text-gray-400' : 'text-gray-400 dark:text-gray-600'}`}>to</span>
                  <NumberInput
                    value={settings.maxFirstRoundUpsets}
                    onChange={(v) => update({ maxFirstRoundUpsets: v })}
                    min={0}
                    max={16}
                    disabled={!settings.upsetCalibration}
                  />
                </div>
              </div>
              <div className="flex items-center justify-between">
                <span className={`text-[11px] ${settings.upsetCalibration ? 'text-gray-600 dark:text-gray-300' : 'text-gray-400 dark:text-gray-600'}`}>
                  Always pick at least one 12-over-5
                </span>
                <Toggle
                  checked={settings.alwaysPick12Over5}
                  onChange={(v) => update({ alwaysPick12Over5: v })}
                  disabled={!settings.upsetCalibration}
                />
              </div>
              <p className={`text-[10px] ${settings.upsetCalibration ? 'text-gray-400 dark:text-gray-500' : 'text-gray-300 dark:text-gray-700'}`}>
                34 of 40 tourneys had a 12-over-5 upset.
              </p>
            </div>
          </div>

          <SectionDivider />

          {/* ── Free Throw Adjustment ─────────────────────── */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-gray-700 dark:text-gray-200">
                Free Throw Adjustment
              </span>
              <Toggle
                checked={settings.freeThrowAdjustment}
                onChange={(v) => update({ freeThrowAdjustment: v })}
              />
            </div>
            <p className={`text-[10px] leading-snug ${settings.freeThrowAdjustment ? 'text-gray-500 dark:text-gray-400' : 'text-gray-400 dark:text-gray-600'}`}>
              Penalize teams below a FT% threshold. Last 34 champs averaged 71.9% FT.
            </p>
            <div className="flex items-center justify-between pl-1">
              <span className={`text-[11px] ${settings.freeThrowAdjustment ? 'text-gray-600 dark:text-gray-300' : 'text-gray-400 dark:text-gray-600'}`}>
                Penalize below
              </span>
              <NumberInput
                value={settings.freeThrowPenaltyThreshold}
                onChange={(v) => update({ freeThrowPenaltyThreshold: v })}
                min={50}
                max={80}
                disabled={!settings.freeThrowAdjustment}
                suffix="% FT"
              />
            </div>
          </div>

          <SectionDivider />

          {/* ── Tempo Trapezoid ────────────────────────────── */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-gray-700 dark:text-gray-200">
                Tempo Trapezoid
              </span>
              <Toggle
                checked={settings.tempoTrapezoid}
                onChange={(v) => update({ tempoTrapezoid: v })}
              />
            </div>
            <p className={`text-[10px] leading-snug ${settings.tempoTrapezoid ? 'text-gray-500 dark:text-gray-400' : 'text-gray-400 dark:text-gray-600'}`}>
              Penalize extreme-tempo teams in later rounds. Teams outside the safe range are upset-vulnerable.
            </p>
            <div className="flex items-center justify-between pl-1">
              <span className={`text-[11px] ${settings.tempoTrapezoid ? 'text-gray-600 dark:text-gray-300' : 'text-gray-400 dark:text-gray-600'}`}>
                Safe tempo range
              </span>
              <div className="flex items-center gap-1">
                <NumberInput
                  value={settings.tempoMinRange}
                  onChange={(v) => update({ tempoMinRange: v })}
                  min={55}
                  max={80}
                  disabled={!settings.tempoTrapezoid}
                />
                <span className={`text-[10px] ${settings.tempoTrapezoid ? 'text-gray-500 dark:text-gray-400' : 'text-gray-400 dark:text-gray-600'}`}>-</span>
                <NumberInput
                  value={settings.tempoMaxRange}
                  onChange={(v) => update({ tempoMaxRange: v })}
                  min={55}
                  max={80}
                  disabled={!settings.tempoTrapezoid}
                />
              </div>
            </div>
          </div>

          <SectionDivider />

          {/* ── Recency Weighting ─────────────────────────── */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-gray-700 dark:text-gray-200">
                Recency Weighting
              </span>
              <Toggle
                checked={settings.recencyWeighting}
                onChange={(v) => update({ recencyWeighting: v })}
              />
            </div>
            <p className={`text-[10px] leading-snug ${settings.recencyWeighting ? 'text-gray-500 dark:text-gray-400' : 'text-gray-400 dark:text-gray-600'}`}>
              Weight recent form more heavily. Last 10 games matter more than October.
            </p>
            <div className="flex items-center justify-between pl-1">
              <span className={`text-[11px] ${settings.recencyWeighting ? 'text-gray-600 dark:text-gray-300' : 'text-gray-400 dark:text-gray-600'}`}>
                Weight
              </span>
              <SliderInput
                value={settings.recencyWeight}
                onChange={(v) => update({ recencyWeight: v })}
                min={0}
                max={1}
                step={0.01}
                disabled={!settings.recencyWeighting}
              />
            </div>
          </div>

          <SectionDivider />

          {/* ── Contrarian Value ──────────────────────────── */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-gray-700 dark:text-gray-200">
                Contrarian Value
              </span>
              <Toggle
                checked={settings.contrarianValue}
                onChange={(v) => update({ contrarianValue: v })}
              />
            </div>
            <p className={`text-[10px] leading-snug ${settings.contrarianValue ? 'text-gray-500 dark:text-gray-400' : 'text-gray-400 dark:text-gray-600'}`}>
              Favor teams with high true probability relative to low public pick%. Use true_prob / public_pick_pct.
            </p>
            <div className="flex items-center justify-between pl-1">
              <span className={`text-[11px] ${settings.contrarianValue ? 'text-gray-600 dark:text-gray-300' : 'text-gray-400 dark:text-gray-600'}`}>
                Strength
              </span>
              <SliderInput
                value={settings.contrarianStrength}
                onChange={(v) => update({ contrarianStrength: v })}
                min={0}
                max={1}
                step={0.01}
                disabled={!settings.contrarianValue}
              />
            </div>
          </div>

          <SectionDivider />

          {/* Reset button */}
          <button
            onClick={handleReset}
            className="w-full py-2 text-xs font-medium text-gray-500 dark:text-gray-400 border border-gray-200 dark:border-gray-600 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
          >
            Reset to Defaults
          </button>
        </div>
      )}
    </div>
  );
}
