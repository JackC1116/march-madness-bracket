import { useState } from 'react';
import type {
  StructuredBias,
  ClaudeBiasAdjustment,
  UpsetAppetite,
  Team,
  Round,
} from '../types';

interface BiasPanelProps {
  biases: StructuredBias[];
  claudeBiases: ClaudeBiasAdjustment[];
  upsetAppetite: UpsetAppetite;
  teams: Record<string, Team>;
  onAddBias: (bias: StructuredBias) => void;
  onRemoveBias: (index: number) => void;
  onSetAppetite: (appetite: UpsetAppetite) => void;
  onApplyClaudeBias: (text: string) => void;
}

const ROUNDS: Round[] = ['R64', 'R32', 'Sweet 16', 'Elite 8', 'Final Four', 'Championship'];
const APPETITE_OPTIONS: { key: UpsetAppetite; label: string; emoji: string; desc: string }[] = [
  { key: 'conservative', label: 'Conservative', emoji: '🏦', desc: 'Mostly chalk, safe picks' },
  { key: 'moderate', label: 'Moderate', emoji: '⚖️', desc: 'A few upsets per round' },
  { key: 'aggressive', label: 'Aggressive', emoji: '🎯', desc: 'Several bold picks' },
  { key: 'chaos', label: 'Chaos', emoji: '🌪️', desc: 'Maximum upsets' },
];

const BIAS_TYPE_LABELS: Record<string, string> = {
  lock: 'Lock to round',
  eliminate: 'Eliminate at round',
  boost_conference: 'Boost conference',
  penalize_conference: 'Penalize conference',
};

export default function BiasPanel({
  biases,
  claudeBiases,
  upsetAppetite,
  teams,
  onAddBias,
  onRemoveBias,
  onSetAppetite,
  onApplyClaudeBias,
}: BiasPanelProps) {
  const [biasType, setBiasType] = useState<StructuredBias['type']>('lock');
  const [selectedTarget, setSelectedTarget] = useState('');
  const [selectedRound, setSelectedRound] = useState<Round>('Sweet 16');
  const [modifier, setModifier] = useState(0.1);
  const [freeText, setFreeText] = useState('');
  const [isApplying, setIsApplying] = useState(false);

  const teamList = Object.values(teams).sort((a, b) => a.seed - b.seed || a.name.localeCompare(b.name));
  const conferences = [...new Set(Object.values(teams).map((t) => t.conference))].sort();

  const isTeamBias = biasType === 'lock' || biasType === 'eliminate';
  const isConferenceBias = biasType === 'boost_conference' || biasType === 'penalize_conference';

  const handleAdd = () => {
    if (!selectedTarget) return;
    const bias: StructuredBias = {
      type: biasType,
      targetId: selectedTarget,
    };
    if (biasType === 'lock' || biasType === 'eliminate') {
      bias.round = selectedRound;
    }
    if (biasType === 'boost_conference' || biasType === 'penalize_conference') {
      bias.modifier = biasType === 'penalize_conference' ? -Math.abs(modifier) : Math.abs(modifier);
    }
    onAddBias(bias);
    setSelectedTarget('');
  };

  const handleApplyFreeText = async () => {
    if (!freeText.trim()) return;
    setIsApplying(true);
    try {
      onApplyClaudeBias(freeText);
    } finally {
      setIsApplying(false);
    }
  };

  const getTargetLabel = (bias: StructuredBias) => {
    if (bias.type === 'boost_conference' || bias.type === 'penalize_conference') {
      return bias.targetId;
    }
    const team = teams[bias.targetId];
    return team ? `(${team.seed}) ${team.name}` : bias.targetId;
  };

  return (
    <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 shadow-sm overflow-hidden">
      {/* Header */}
      <div className="px-5 py-3 border-b border-gray-100 dark:border-gray-700 dark:border-gray-700">
        <h3 className="text-sm font-bold text-gray-900 dark:text-gray-100">Biases &amp; Preferences</h3>
        <p className="text-xs text-gray-400 dark:text-gray-500 mt-0.5">Override the model with your own opinions</p>
      </div>

      {/* Upset appetite selector */}
      <div className="px-5 py-4 border-b border-gray-100 dark:border-gray-700">
        <h4 className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-2">
          Upset Appetite
        </h4>
        <div className="grid grid-cols-4 gap-1.5">
          {APPETITE_OPTIONS.map((opt) => {
            const isActive = upsetAppetite === opt.key;
            return (
              <button
                key={opt.key}
                onClick={() => onSetAppetite(opt.key)}
                className={`
                  flex flex-col items-center gap-1 px-2 py-2.5 rounded-lg border transition-all text-center
                  ${
                    isActive
                      ? 'border-blue-300 dark:border-blue-600 bg-blue-50 dark:bg-blue-900/30 shadow-sm'
                      : 'border-gray-200 dark:border-gray-600 hover:border-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700'
                  }
                `}
              >
                <span className="text-lg">{opt.emoji}</span>
                <span
                  className={`text-[10px] font-bold ${
                    isActive ? 'text-blue-700' : 'text-gray-600'
                  }`}
                >
                  {opt.label}
                </span>
                <span className="text-[9px] text-gray-400 leading-tight">{opt.desc}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Structured biases */}
      <div className="px-5 py-4 border-b border-gray-100 dark:border-gray-700">
        <h4 className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-3">
          Structured Biases
        </h4>

        {/* Add bias form */}
        <div className="space-y-2 mb-3">
          {/* Bias type */}
          <div className="flex gap-1.5">
            {(
              ['lock', 'eliminate', 'boost_conference', 'penalize_conference'] as StructuredBias['type'][]
            ).map((type) => (
              <button
                key={type}
                onClick={() => {
                  setBiasType(type);
                  setSelectedTarget('');
                }}
                className={`
                  px-2.5 py-1.5 text-[10px] font-medium rounded-md border transition-colors
                  ${
                    biasType === type
                      ? 'border-blue-300 bg-blue-50 text-blue-700'
                      : 'border-gray-200 text-gray-500 hover:bg-gray-50'
                  }
                `}
              >
                {BIAS_TYPE_LABELS[type]}
              </button>
            ))}
          </div>

          {/* Target selection */}
          <div className="flex gap-2">
            <select
              value={selectedTarget}
              onChange={(e) => setSelectedTarget(e.target.value)}
              className="flex-1 text-xs border border-gray-200 dark:border-gray-600 rounded-lg px-2.5 py-2 bg-white dark:bg-gray-700 text-gray-700 dark:text-gray-200 focus:outline-none focus:ring-2 focus:ring-blue-200"
            >
              <option value="">
                {isTeamBias ? 'Select team...' : 'Select conference...'}
              </option>
              {isTeamBias &&
                teamList.map((t) => (
                  <option key={t.id} value={t.id}>
                    ({t.seed}) {t.name} - {t.region}
                  </option>
                ))}
              {isConferenceBias &&
                conferences.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
            </select>

            {/* Round selector for lock/eliminate */}
            {isTeamBias && (
              <select
                value={selectedRound}
                onChange={(e) => setSelectedRound(e.target.value as Round)}
                className="text-xs border border-gray-200 dark:border-gray-600 rounded-lg px-2.5 py-2 bg-white dark:bg-gray-700 text-gray-700 dark:text-gray-200 focus:outline-none focus:ring-2 focus:ring-blue-200"
              >
                {ROUNDS.map((r) => (
                  <option key={r} value={r}>
                    {r}
                  </option>
                ))}
              </select>
            )}

            {/* Modifier for conference boosts */}
            {isConferenceBias && (
              <div className="flex items-center gap-1">
                <input
                  type="range"
                  min={1}
                  max={20}
                  step={1}
                  value={Math.round(modifier * 100)}
                  onChange={(e) => setModifier(parseInt(e.target.value, 10) / 100)}
                  className="w-20"
                />
                <span className="text-xs tabular-nums text-gray-500 w-10">
                  {biasType === 'penalize_conference' ? '-' : '+'}
                  {(modifier * 100).toFixed(0)}%
                </span>
              </div>
            )}

            <button
              onClick={handleAdd}
              disabled={!selectedTarget}
              className="px-3 py-2 text-xs font-bold rounded-lg text-white transition-colors disabled:opacity-40"
              style={{ backgroundColor: '#00274C' }}
            >
              Add
            </button>
          </div>
        </div>

        {/* Active biases list */}
        {biases.length === 0 ? (
          <p className="text-xs text-gray-400 italic py-2">No structured biases added yet.</p>
        ) : (
          <div className="space-y-1.5">
            {biases.map((bias, i) => (
              <div
                key={i}
                className="flex items-center justify-between px-3 py-2 bg-gray-50 dark:bg-gray-700 rounded-lg"
              >
                <div className="flex items-center gap-2">
                  <span
                    className={`w-1.5 h-1.5 rounded-full ${
                      bias.type === 'lock'
                        ? 'bg-emerald-500'
                        : bias.type === 'eliminate'
                        ? 'bg-red-500'
                        : bias.type === 'boost_conference'
                        ? 'bg-blue-500'
                        : 'bg-orange-500'
                    }`}
                  />
                  <span className="text-xs font-medium text-gray-700">
                    {BIAS_TYPE_LABELS[bias.type]}:
                  </span>
                  <span className="text-xs text-gray-600">{getTargetLabel(bias)}</span>
                  {bias.round && (
                    <span className="text-[10px] px-1.5 py-0.5 bg-white border border-gray-200 rounded text-gray-500">
                      {bias.round}
                    </span>
                  )}
                  {bias.modifier !== undefined && (
                    <span className="text-[10px] px-1.5 py-0.5 bg-white border border-gray-200 rounded text-gray-500 tabular-nums">
                      {bias.modifier > 0 ? '+' : ''}
                      {(bias.modifier * 100).toFixed(0)}%
                    </span>
                  )}
                </div>
                <button
                  onClick={() => onRemoveBias(i)}
                  className="text-xs text-gray-400 hover:text-red-500 transition-colors p-1"
                >
                  &times;
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Claude biases (applied) */}
      {claudeBiases.length > 0 && (
        <div className="px-5 py-3 border-b border-gray-100 dark:border-gray-700">
          <h4 className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-2">
            AI-Interpreted Adjustments
          </h4>
          <div className="space-y-1.5">
            {claudeBiases.map((cb, i) => {
              const team = teams[cb.teamId];
              return (
                <div key={i} className="px-3 py-2 bg-purple-50 dark:bg-purple-900/30 rounded-lg">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-medium text-purple-800 dark:text-purple-300">
                      {team ? `(${team.seed}) ${team.name}` : cb.teamId}
                    </span>
                    <span
                      className={`text-xs font-bold tabular-nums ${
                        cb.modifier > 0 ? 'text-emerald-600' : 'text-red-600'
                      }`}
                    >
                      {cb.modifier > 0 ? '+' : ''}
                      {(cb.modifier * 100).toFixed(0)}%
                    </span>
                  </div>
                  <p className="text-[10px] text-purple-600 dark:text-purple-400 mt-0.5">{cb.explanation}</p>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Free-text bias input */}
      <div className="px-5 py-4">
        <h4 className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-2">
          Free-Text Opinions
        </h4>
        <p className="text-[10px] text-gray-400 mb-2">
          Type your thoughts and Claude will interpret them as bracket adjustments.
        </p>
        <textarea
          value={freeText}
          onChange={(e) => setFreeText(e.target.value)}
          placeholder='e.g., "I think Duke is overrated this year" or "Mid-major teams from the MVC always overperform"'
          rows={3}
          className="w-full text-xs border border-gray-200 dark:border-gray-600 rounded-lg px-3 py-2.5 resize-none text-gray-700 dark:text-gray-200 dark:bg-gray-700 placeholder:text-gray-300 dark:placeholder:text-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-200"
        />
        <div className="flex justify-end mt-2">
          <button
            onClick={handleApplyFreeText}
            disabled={!freeText.trim() || isApplying}
            className="px-4 py-2 text-xs font-bold rounded-lg text-white transition-colors disabled:opacity-40"
            style={{ backgroundColor: '#00274C' }}
          >
            {isApplying ? (
              <span className="flex items-center gap-1.5">
                <svg className="animate-spin h-3 w-3" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                </svg>
                Interpreting...
              </span>
            ) : (
              'Apply with Claude'
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
