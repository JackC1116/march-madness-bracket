import type { BracketState, Team, Round, Region } from '../types';
import { compress, decompress } from './normalize';

/**
 * Encode a minimal representation of bracket picks into a URL hash.
 * We only encode the winnerId per matchup to keep the URL small.
 */
export function encodeBracketToURL(bracket: BracketState): string {
  const picks: Record<string, string | null> = {};
  for (const [id, matchup] of Object.entries(bracket.matchups)) {
    if (matchup.winnerId) {
      picks[id] = matchup.winnerId;
    }
  }
  const encoded = compress(picks);
  return `${window.location.origin}${window.location.pathname}#bracket=${encoded}`;
}

/**
 * Decode bracket picks from a URL hash string.
 * Returns a Record of matchupId -> winnerId.
 */
export function decodeBracketFromURL(hash: string): Record<string, string> | null {
  try {
    const prefix = '#bracket=';
    const raw = hash.startsWith(prefix) ? hash.slice(prefix.length) : hash;
    if (!raw) return null;
    return decompress<Record<string, string>>(raw);
  } catch {
    console.warn('Failed to decode bracket from URL');
    return null;
  }
}

const ROUND_ORDER: Round[] = [
  'R64',
  'R32',
  'Sweet 16',
  'Elite 8',
  'Final Four',
  'Championship',
];

const ROUND_DISPLAY: Record<string, string> = {
  R64: 'Round of 64',
  R32: 'Round of 32',
  'Sweet 16': 'Sweet 16',
  'Elite 8': 'Elite 8',
  'Final Four': 'Final Four',
  Championship: 'Championship',
};

const REGIONS: (Region | 'Final Four')[] = ['East', 'West', 'South', 'Midwest', 'Final Four'];

/**
 * Generate a plain-text summary of all bracket picks organized by region.
 */
export function generateTextSummary(
  bracket: BracketState,
  teams: Record<string, Team>,
): string {
  const lines: string[] = [];
  lines.push('=== Bracket Assist — 2026 NCAA Tournament ===');
  lines.push(`Generated: ${new Date().toLocaleDateString()}`);
  lines.push('');

  for (const region of REGIONS) {
    lines.push(`--- ${region} ---`);

    for (const round of ROUND_ORDER) {
      const matchups = Object.values(bracket.matchups)
        .filter((m) => {
          if (round === 'Final Four' || round === 'Championship') {
            return m.round === round && region === 'Final Four';
          }
          return m.region === region && m.round === round;
        })
        .sort((a, b) => a.position - b.position);

      if (matchups.length === 0) continue;

      lines.push(`  ${ROUND_DISPLAY[round] || round}:`);

      for (const m of matchups) {
        const tA = m.teamAId ? teams[m.teamAId] : null;
        const tB = m.teamBId ? teams[m.teamBId] : null;
        const winner = m.winnerId ? teams[m.winnerId] : null;

        const teamAStr = tA ? `(${tA.seed}) ${tA.name}` : 'TBD';
        const teamBStr = tB ? `(${tB.seed}) ${tB.name}` : 'TBD';
        const winnerStr = winner
          ? `=> (${winner.seed}) ${winner.name}${m.isUpset ? ' [UPSET]' : ''}`
          : '=> TBD';

        lines.push(`    ${teamAStr} vs ${teamBStr} ${winnerStr}`);
      }
    }

    // Only show Final Four once
    if (region === 'Final Four') break;

    lines.push('');
  }

  // Champion
  const champMatchup = Object.values(bracket.matchups).find(
    (m) => m.round === 'Championship',
  );
  if (champMatchup?.winnerId) {
    const champ = teams[champMatchup.winnerId];
    if (champ) {
      lines.push('');
      lines.push(`*** CHAMPION: (${champ.seed}) ${champ.name} ***`);
    }
  }

  return lines.join('\n');
}

/**
 * Trigger a JSON file download of the bracket state.
 */
export function downloadJSON(bracket: BracketState, teams: Record<string, Team>): void {
  const exportData = {
    title: 'Bracket Assist — 2026 NCAA Tournament',
    exportedAt: new Date().toISOString(),
    teams: Object.values(teams).map((t) => ({
      id: t.id,
      name: t.name,
      seed: t.seed,
      region: t.region,
      conference: t.conference,
    })),
    picks: Object.values(bracket.matchups)
      .filter((m) => m.winnerId)
      .map((m) => ({
        matchupId: m.id,
        round: m.round,
        region: m.region,
        teamA: m.teamAId,
        teamB: m.teamBId,
        winner: m.winnerId,
        isUpset: m.isUpset,
        locked: m.locked,
      })),
  };

  const json = JSON.stringify(exportData, null, 2);
  const blob = new Blob([json], { type: 'application/json' });
  const url = URL.createObjectURL(blob);

  const a = document.createElement('a');
  a.href = url;
  a.download = 'bracket-assist-2026.json';
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
