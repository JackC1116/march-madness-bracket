import type { AppMode, PoolConfig, ThemeMode } from '../types';

interface HeaderProps {
  mode: AppMode;
  onModeChange: (mode: AppMode) => void;
  poolConfig: PoolConfig;
  dataStatus: 'loading' | 'ready' | 'error' | 'stale';
  lastUpdated?: string;
  theme: ThemeMode;
  onThemeChange: (theme: ThemeMode) => void;
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

function ThemeToggle({ theme, onThemeChange }: { theme: ThemeMode; onThemeChange: (t: ThemeMode) => void }) {
  const cycleTheme = () => {
    const next: ThemeMode = theme === 'light' ? 'dark' : theme === 'dark' ? 'system' : 'light';
    onThemeChange(next);
  };

  return (
    <button
      onClick={cycleTheme}
      className="p-2 rounded-lg border border-gray-200 dark:border-gray-600 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
      title={`Theme: ${theme}`}
    >
      {theme === 'light' && (
        <svg className="w-4 h-4 text-yellow-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 3v1m0 16v1m9-9h-1M4 12H3m15.364 6.364l-.707-.707M6.343 6.343l-.707-.707m12.728 0l-.707.707M6.343 17.657l-.707.707M16 12a4 4 0 11-8 0 4 4 0 018 0z" />
        </svg>
      )}
      {theme === 'dark' && (
        <svg className="w-4 h-4 text-blue-300" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20.354 15.354A9 9 0 018.646 3.646 9.003 9.003 0 0012 21a9.003 9.003 0 008.354-5.646z" />
        </svg>
      )}
      {theme === 'system' && (
        <svg className="w-4 h-4 text-gray-500 dark:text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
        </svg>
      )}
    </button>
  );
}

export default function Header({ mode, onModeChange, poolConfig, dataStatus, lastUpdated, theme, onThemeChange }: HeaderProps) {
  const status = statusConfig[dataStatus];

  return (
    <header className="w-full bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700">
      <div className="max-w-[1600px] mx-auto px-4 sm:px-6">
        {/* Top row: logo + data status */}
        <div className="flex items-center justify-between h-14">
          <div className="flex items-center gap-3">
            <h1 className="text-xl font-bold tracking-tight" style={{ color: '#00274C' }}>
              <span className="dark:text-blue-300">Bracket Assist</span>
            </h1>
            <span className="text-xs text-gray-400 dark:text-gray-500 font-medium hidden sm:inline">
              March Madness 2026
            </span>
          </div>

          <div className="flex items-center gap-4">
            {/* Pool config summary */}
            <div className="hidden md:flex items-center gap-3 text-xs text-gray-500 dark:text-gray-400">
              <span className="px-2 py-1 bg-gray-50 dark:bg-gray-700 rounded font-medium">
                Pool: {poolConfig.poolSize} entries
              </span>
              <span className="px-2 py-1 bg-gray-50 dark:bg-gray-700 rounded font-medium">
                {poolConfig.scoringSystem.name}
              </span>
              {mode === 'multi' && (
                <span className="px-2 py-1 bg-gray-50 dark:bg-gray-700 rounded font-medium">
                  {poolConfig.numBrackets} brackets
                </span>
              )}
            </div>

            {/* Data status indicator */}
            <div className="flex items-center gap-2">
              <span className={`w-2 h-2 rounded-full ${status.color} inline-block`} />
              <span className="text-xs text-gray-500 dark:text-gray-400">{status.label}</span>
              {lastUpdated && (
                <span className="text-[10px] text-gray-400 dark:text-gray-500 hidden lg:inline">
                  Updated {lastUpdated}
                </span>
              )}
            </div>

            {/* Theme toggle */}
            <ThemeToggle theme={theme} onThemeChange={onThemeChange} />
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
                      : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-700'
                  }
                `}
                style={isActive ? { backgroundColor: '#00274C' } : undefined}
              >
                <span>{m.label}</span>
                <span
                  className={`block text-[10px] font-normal mt-0.5 ${
                    isActive ? 'text-blue-200' : 'text-gray-400 dark:text-gray-500'
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
