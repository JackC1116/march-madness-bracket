import type { AppMode, PoolConfig } from '../types';

interface HeaderProps {
  mode: AppMode;
  onModeChange: (mode: AppMode) => void;
  poolConfig: PoolConfig;
  dataStatus: 'loading' | 'ready' | 'error' | 'stale';
  lastUpdated?: string;
}

const modes: { key: AppMode; label: string; description: string }[] = [
  { key: 'single', label: 'Single Bracket', description: 'Build one optimized bracket' },
  { key: 'multi', label: 'Multi Bracket', description: 'Generate a portfolio of brackets' },
  { key: 'guided', label: 'Guided Picks', description: 'Walk through each game with AI help' },
];

const statusConfig: Record<string, { color: string; label: string }> = {
  loading: { color: 'bg-yellow-400', label: 'Loading data...' },
  ready: { color: 'bg-emerald-500', label: 'Data ready' },
  error: { color: 'bg-red-500', label: 'Data error' },
  stale: { color: 'bg-amber-500', label: 'Data may be stale' },
};

export default function Header({ mode, onModeChange, poolConfig, dataStatus, lastUpdated }: HeaderProps) {
  const status = statusConfig[dataStatus];

  return (
    <header className="w-full bg-white border-b border-gray-200">
      <div className="max-w-[1600px] mx-auto px-4 sm:px-6">
        {/* Top row: logo + data status */}
        <div className="flex items-center justify-between h-14">
          <div className="flex items-center gap-3">
            <h1 className="text-xl font-bold tracking-tight" style={{ color: '#00274C' }}>
              Bracket Assist
            </h1>
            <span className="text-xs text-gray-400 font-medium hidden sm:inline">
              March Madness 2026
            </span>
          </div>

          <div className="flex items-center gap-4">
            {/* Pool config summary */}
            <div className="hidden md:flex items-center gap-3 text-xs text-gray-500">
              <span className="px-2 py-1 bg-gray-50 rounded font-medium">
                Pool: {poolConfig.poolSize} entries
              </span>
              <span className="px-2 py-1 bg-gray-50 rounded font-medium">
                {poolConfig.scoringSystem.name}
              </span>
              {mode === 'multi' && (
                <span className="px-2 py-1 bg-gray-50 rounded font-medium">
                  {poolConfig.numBrackets} brackets
                </span>
              )}
            </div>

            {/* Data status indicator */}
            <div className="flex items-center gap-2">
              <span className={`w-2 h-2 rounded-full ${status.color} inline-block`} />
              <span className="text-xs text-gray-500">{status.label}</span>
              {lastUpdated && (
                <span className="text-[10px] text-gray-400 hidden lg:inline">
                  Updated {lastUpdated}
                </span>
              )}
            </div>
          </div>
        </div>

        {/* Mode selector tabs */}
        <nav className="flex gap-1 -mb-px">
          {modes.map((m) => {
            const isActive = mode === m.key;
            return (
              <button
                key={m.key}
                onClick={() => onModeChange(m.key)}
                className={`
                  relative px-4 py-2.5 text-sm font-medium rounded-t-lg transition-colors
                  ${
                    isActive
                      ? 'text-white'
                      : 'text-gray-500 hover:text-gray-700 hover:bg-gray-50'
                  }
                `}
                style={isActive ? { backgroundColor: '#00274C' } : undefined}
              >
                <span>{m.label}</span>
                <span
                  className={`block text-[10px] font-normal mt-0.5 ${
                    isActive ? 'text-blue-200' : 'text-gray-400'
                  }`}
                >
                  {m.description}
                </span>
              </button>
            );
          })}
        </nav>
      </div>
    </header>
  );
}
