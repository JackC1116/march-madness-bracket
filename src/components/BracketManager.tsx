import { useState, useCallback, useMemo } from 'react';
import type { BracketState, SavedBracket } from '../types';

interface BracketManagerProps {
  bracket: BracketState;
  savedBrackets: SavedBracket[];
  onSave: (name: string) => void;
  onLoad: (id: string) => void;
  onDelete: (id: string) => void;
  onRename: (id: string, name: string) => void;
}

function getCompletionCount(bracket: BracketState): { picked: number; total: number } {
  const matchups = Object.values(bracket.matchups);
  const total = matchups.length;
  const picked = matchups.filter((m) => m.winnerId !== null).length;
  return { picked, total };
}

function getChampionName(bracket: BracketState): string | null {
  const champMatchup = Object.values(bracket.matchups).find(
    (m) => m.round === 'Championship'
  );
  const winnerId = champMatchup?.winnerId;
  if (!winnerId) return null;
  return bracket.teams[winnerId]?.name ?? null;
}

export default function BracketManager({
  bracket,
  savedBrackets,
  onSave,
  onLoad,
  onDelete,
  onRename,
}: BracketManagerProps) {
  const [expanded, setExpanded] = useState(false);
  const [showNameInput, setShowNameInput] = useState(false);
  const [newName, setNewName] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState('');
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  // Determine which saved bracket matches the current bracket (active bracket)
  const activeBracketId = useMemo(() => {
    const currentMatchups = JSON.stringify(bracket.matchups);
    for (const saved of savedBrackets) {
      if (JSON.stringify(saved.bracket.matchups) === currentMatchups) {
        return saved.id;
      }
    }
    return null;
  }, [bracket.matchups, savedBrackets]);

  const handleSave = useCallback(() => {
    const name = newName.trim();
    if (!name) return;
    onSave(name);
    setNewName('');
    setShowNameInput(false);
  }, [newName, onSave]);

  const handleRename = useCallback((id: string) => {
    const name = editName.trim();
    if (!name) return;
    onRename(id, name);
    setEditingId(null);
    setEditName('');
  }, [editName, onRename]);

  return (
    <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 shadow-sm">
      {/* Header */}
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center justify-between px-5 py-4 text-left hover:bg-gray-50 dark:hover:bg-gray-750 rounded-xl transition-colors"
      >
        <div className="flex items-center gap-2">
          <svg className="w-4 h-4 text-gray-500 dark:text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
          </svg>
          <div>
            <h3 className="text-sm font-bold text-gray-900 dark:text-gray-100">
              My Brackets
            </h3>
            <p className="text-xs text-gray-400 dark:text-gray-500 mt-0.5">
              {savedBrackets.length} saved bracket{savedBrackets.length !== 1 ? 's' : ''}
            </p>
          </div>
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
        <div className="px-5 pb-5 space-y-3">
          <div className="border-t border-gray-100 dark:border-gray-700" />

          {/* New bracket button */}
          {!showNameInput ? (
            <button
              onClick={() => setShowNameInput(true)}
              className="w-full flex items-center justify-center gap-1.5 py-2 text-xs font-medium text-[#00274C] dark:text-blue-300 border border-dashed border-gray-300 dark:border-gray-600 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
            >
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
              </svg>
              Save Current Bracket
            </button>
          ) : (
            <div className="flex items-center gap-2">
              <input
                type="text"
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') handleSave();
                  if (e.key === 'Escape') { setShowNameInput(false); setNewName(''); }
                }}
                placeholder="Bracket name..."
                autoFocus
                className="flex-1 px-2.5 py-1.5 text-xs border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 focus:border-[#00274C] dark:focus:border-blue-400 focus:ring-1 focus:ring-[#00274C] dark:focus:ring-blue-400 outline-none"
              />
              <button
                onClick={handleSave}
                disabled={!newName.trim()}
                className="px-3 py-1.5 text-xs font-medium bg-[#00274C] dark:bg-blue-600 text-white rounded-lg hover:bg-[#003366] dark:hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition"
              >
                Save
              </button>
              <button
                onClick={() => { setShowNameInput(false); setNewName(''); }}
                className="px-2 py-1.5 text-xs text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 transition"
              >
                Cancel
              </button>
            </div>
          )}

          {/* Saved brackets list */}
          {savedBrackets.length === 0 ? (
            <p className="text-center text-xs text-gray-400 dark:text-gray-500 py-4">
              No saved brackets yet. Save your current bracket to get started.
            </p>
          ) : (
            <div className="space-y-1.5">
              {savedBrackets.map((saved) => {
                const { picked, total } = getCompletionCount(saved.bracket);
                const champion = saved.champion || getChampionName(saved.bracket);
                const isActive = saved.id === activeBracketId;

                return (
                  <div
                    key={saved.id}
                    className={`relative rounded-lg border transition-colors ${
                      isActive
                        ? 'border-[#00274C] dark:border-blue-500 bg-blue-50/50 dark:bg-blue-900/20'
                        : 'border-gray-200 dark:border-gray-600 bg-gray-50 dark:bg-gray-750 hover:bg-gray-100 dark:hover:bg-gray-700'
                    }`}
                  >
                    <div className="px-3 py-2.5">
                      {editingId === saved.id ? (
                        <div className="flex items-center gap-2 mb-1">
                          <input
                            type="text"
                            value={editName}
                            onChange={(e) => setEditName(e.target.value)}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') handleRename(saved.id);
                              if (e.key === 'Escape') { setEditingId(null); setEditName(''); }
                            }}
                            autoFocus
                            className="flex-1 px-2 py-1 text-xs border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 outline-none focus:border-[#00274C] dark:focus:border-blue-400"
                          />
                          <button
                            onClick={() => handleRename(saved.id)}
                            className="text-xs text-[#00274C] dark:text-blue-300 font-medium"
                          >
                            OK
                          </button>
                        </div>
                      ) : (
                        <div className="flex items-center gap-1.5 mb-1">
                          {isActive && (
                            <svg className="w-3 h-3 text-amber-500 shrink-0" fill="currentColor" viewBox="0 0 24 24">
                              <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" />
                            </svg>
                          )}
                          <span className={`text-xs font-semibold truncate ${isActive ? 'text-[#00274C] dark:text-blue-300' : 'text-gray-800 dark:text-gray-200'}`}>
                            {saved.name}
                          </span>
                        </div>
                      )}

                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2 text-[10px] text-gray-500 dark:text-gray-400">
                          {champion && (
                            <span className="font-medium text-gray-700 dark:text-gray-300">
                              {champion}
                            </span>
                          )}
                          <span>{picked}/{total}</span>
                        </div>

                        <div className="flex items-center gap-1">
                          {!isActive && (
                            <button
                              onClick={() => onLoad(saved.id)}
                              className="px-2 py-1 text-[10px] font-medium text-[#00274C] dark:text-blue-300 bg-white dark:bg-gray-700 border border-gray-200 dark:border-gray-600 rounded hover:bg-gray-100 dark:hover:bg-gray-600 transition"
                            >
                              Load
                            </button>
                          )}
                          <button
                            onClick={() => { setEditingId(saved.id); setEditName(saved.name); }}
                            className="p-1 text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:hover:text-gray-300 transition"
                            title="Rename"
                          >
                            <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                              <path strokeLinecap="round" strokeLinejoin="round" d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
                            </svg>
                          </button>
                          {confirmDeleteId === saved.id ? (
                            <div className="flex items-center gap-1">
                              <button
                                onClick={() => { onDelete(saved.id); setConfirmDeleteId(null); }}
                                className="px-1.5 py-0.5 text-[10px] font-medium text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-900/30 border border-red-200 dark:border-red-800 rounded hover:bg-red-100 dark:hover:bg-red-900/50 transition"
                              >
                                Yes
                              </button>
                              <button
                                onClick={() => setConfirmDeleteId(null)}
                                className="px-1.5 py-0.5 text-[10px] text-gray-500 dark:text-gray-400"
                              >
                                No
                              </button>
                            </div>
                          ) : (
                            <button
                              onClick={() => setConfirmDeleteId(saved.id)}
                              className="p-1 text-gray-400 dark:text-gray-500 hover:text-red-500 dark:hover:text-red-400 transition"
                              title="Delete"
                            >
                              <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                              </svg>
                            </button>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
