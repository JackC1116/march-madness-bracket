import jsPDF from 'jspdf';
import type { BracketState, Team, Matchup, Round } from '../types';

const ROUND_ORDER: Round[] = [
  'R64',
  'R32',
  'Sweet 16',
  'Elite 8',
  'Final Four',
  'Championship',
];

const ROUND_LABELS: Record<string, string> = {
  R64: 'Round of 64',
  R32: 'Round of 32',
  'Sweet 16': 'Sweet 16',
  'Elite 8': 'Elite 8',
  'Final Four': 'Final Four',
  Championship: 'Championship',
};

const REGIONS = ['East', 'West', 'South', 'Midwest'] as const;

interface MatchupLine {
  teamA: string;
  seedA: number;
  teamB: string;
  seedB: number;
  winner: string;
  isUpset: boolean;
}

function formatMatchup(m: Matchup, teams: Record<string, Team>): MatchupLine | null {
  if (!m.teamAId || !m.teamBId) return null;
  const tA = teams[m.teamAId];
  const tB = teams[m.teamBId];
  if (!tA || !tB) return null;

  const winner = m.winnerId ? teams[m.winnerId] : null;

  return {
    teamA: tA.name,
    seedA: tA.seed,
    teamB: tB.name,
    seedB: tB.seed,
    winner: winner ? winner.name : 'TBD',
    isUpset: m.isUpset,
  };
}

/**
 * Export the bracket to a professional PDF document.
 */
export function exportToPDF(bracket: BracketState, teams: Record<string, Team>): void {
  const doc = new jsPDF({ orientation: 'landscape', unit: 'pt', format: 'letter' });
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const margin = 40;

  // ── Header ────────────────────────────────────────────────
  doc.setFillColor(30, 58, 138); // deep blue
  doc.rect(0, 0, pageWidth, 55, 'F');
  doc.setTextColor(255, 255, 255);
  doc.setFontSize(20);
  doc.setFont('helvetica', 'bold');
  doc.text('Bracket Assist — 2026 NCAA Tournament', pageWidth / 2, 35, { align: 'center' });

  // ── Timestamp ─────────────────────────────────────────────
  doc.setFontSize(9);
  doc.setFont('helvetica', 'normal');
  doc.text(`Generated ${new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}`, pageWidth / 2, 50, { align: 'center' });

  let y = 75;

  // ── Region sections ───────────────────────────────────────
  for (const region of REGIONS) {
    // Check if we need a new page
    if (y > pageHeight - 100) {
      doc.addPage();
      y = margin;
    }

    // Region header
    doc.setFillColor(59, 130, 246);
    doc.rect(margin, y, pageWidth - margin * 2, 22, 'F');
    doc.setTextColor(255, 255, 255);
    doc.setFontSize(13);
    doc.setFont('helvetica', 'bold');
    doc.text(`${region} Region`, margin + 8, y + 16);
    y += 32;

    for (const round of ROUND_ORDER) {
      if (round === 'Final Four' || round === 'Championship') continue;

      const matchups = Object.values(bracket.matchups)
        .filter((m) => m.region === region && m.round === round)
        .sort((a, b) => a.position - b.position);

      if (matchups.length === 0) continue;

      const lines: MatchupLine[] = [];
      for (const m of matchups) {
        const line = formatMatchup(m, teams);
        if (line) lines.push(line);
      }

      if (lines.length === 0) continue;

      // Check page space: each round needs ~15 + lines * 14
      const neededHeight = 20 + lines.length * 14;
      if (y + neededHeight > pageHeight - margin) {
        doc.addPage();
        y = margin;
      }

      // Round label
      doc.setTextColor(30, 58, 138);
      doc.setFontSize(10);
      doc.setFont('helvetica', 'bold');
      doc.text(ROUND_LABELS[round] || round, margin + 4, y + 10);
      y += 16;

      // Matchup lines
      doc.setFontSize(9);
      doc.setFont('helvetica', 'normal');

      for (const line of lines) {
        doc.setTextColor(60, 60, 60);
        const matchupText = `(${line.seedA}) ${line.teamA}  vs  (${line.seedB}) ${line.teamB}`;
        doc.text(matchupText, margin + 12, y + 10);

        // Winner
        if (line.winner !== 'TBD') {
          doc.setFont('helvetica', 'bold');
          if (line.isUpset) {
            doc.setTextColor(220, 38, 38); // red for upsets
          } else {
            doc.setTextColor(22, 163, 74); // green for chalk
          }
          const winnerText = `Winner: ${line.winner}${line.isUpset ? ' (UPSET)' : ''}`;
          doc.text(winnerText, 420, y + 10);
          doc.setFont('helvetica', 'normal');
        } else {
          doc.setTextColor(156, 163, 175);
          doc.text('TBD', 420, y + 10);
        }

        y += 14;
      }

      y += 6;
    }

    y += 10;
  }

  // ── Final Four & Championship ─────────────────────────────
  if (y > pageHeight - 120) {
    doc.addPage();
    y = margin;
  }

  doc.setFillColor(234, 179, 8); // gold
  doc.rect(margin, y, pageWidth - margin * 2, 22, 'F');
  doc.setTextColor(30, 30, 30);
  doc.setFontSize(13);
  doc.setFont('helvetica', 'bold');
  doc.text('Final Four & Championship', margin + 8, y + 16);
  y += 32;

  for (const round of ['Final Four', 'Championship'] as Round[]) {
    const matchups = Object.values(bracket.matchups)
      .filter((m) => m.round === round)
      .sort((a, b) => a.position - b.position);

    if (matchups.length === 0) continue;

    doc.setTextColor(30, 58, 138);
    doc.setFontSize(10);
    doc.setFont('helvetica', 'bold');
    doc.text(ROUND_LABELS[round] || round, margin + 4, y + 10);
    y += 16;

    doc.setFontSize(9);
    doc.setFont('helvetica', 'normal');

    for (const m of matchups) {
      const line = formatMatchup(m, teams);
      if (!line) {
        doc.setTextColor(156, 163, 175);
        doc.text('TBD vs TBD', margin + 12, y + 10);
        y += 14;
        continue;
      }

      doc.setTextColor(60, 60, 60);
      doc.text(
        `(${line.seedA}) ${line.teamA}  vs  (${line.seedB}) ${line.teamB}`,
        margin + 12,
        y + 10,
      );

      if (line.winner !== 'TBD') {
        doc.setFont('helvetica', 'bold');
        doc.setTextColor(line.isUpset ? 220 : 22, line.isUpset ? 38 : 163, line.isUpset ? 38 : 74);
        doc.text(`Winner: ${line.winner}${line.isUpset ? ' (UPSET)' : ''}`, 420, y + 10);
        doc.setFont('helvetica', 'normal');
      }

      y += 14;
    }

    y += 8;
  }

  // ── Champion highlight ────────────────────────────────────
  const championship = Object.values(bracket.matchups).find(
    (m) => m.round === 'Championship',
  );
  if (championship?.winnerId) {
    const champ = teams[championship.winnerId];
    if (champ) {
      y += 10;
      if (y > pageHeight - 50) {
        doc.addPage();
        y = margin;
      }
      doc.setFillColor(234, 179, 8);
      doc.roundedRect(pageWidth / 2 - 140, y, 280, 36, 4, 4, 'F');
      doc.setTextColor(30, 30, 30);
      doc.setFontSize(16);
      doc.setFont('helvetica', 'bold');
      doc.text(`Champion: (${champ.seed}) ${champ.name}`, pageWidth / 2, y + 23, {
        align: 'center',
      });
    }
  }

  // ── Footer ────────────────────────────────────────────────
  const totalPages = doc.getNumberOfPages();
  for (let i = 1; i <= totalPages; i++) {
    doc.setPage(i);
    doc.setFontSize(7);
    doc.setTextColor(160, 160, 160);
    doc.setFont('helvetica', 'normal');
    doc.text(
      `Bracket Assist | Page ${i} of ${totalPages}`,
      pageWidth / 2,
      pageHeight - 15,
      { align: 'center' },
    );
  }

  doc.save('bracket-assist-2026.pdf');
}
