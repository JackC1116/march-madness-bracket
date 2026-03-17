import { useMemo } from 'react';
import type { Matchup, Team, MatchupNarrative } from '../types';

function hashCode(str: string): number {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = ((hash << 5) - hash) + str.charCodeAt(i);
    hash |= 0;
  }
  return hash;
}

function estimatePublicPickPct(teamAId: string, seedA: number, teamBId: string, seedB: number): number {
  const noise = (Math.abs(hashCode(teamAId + teamBId)) % 100) / 1000 - 0.05;
  const diff = seedB - seedA;
  if (diff === 0) return 0.5 + noise;
  const base = 0.5 + diff * 0.035;
  return Math.min(0.97, Math.max(0.03, base + noise));
}

interface MatchupCardProps {
  matchup: Matchup;
  teamA: Team;
  teamB: Team;
  narrative?: MatchupNarrative;
  onPick: (winnerId: string) => void;
}

interface StatRowProps {
  label: string;
  tooltip?: string;
  valueA: string | number;
  valueB: string | number;
  highlightA?: boolean;
  highlightB?: boolean;
}

function StatRow({ label, tooltip, valueA, valueB, highlightA, highlightB }: StatRowProps) {
  return (
    <div className="flex items-center text-sm py-1.5 border-b border-gray-50 dark:border-gray-700 last:border-0">
      <span
        className={`w-20 text-right tabular-nums ${
          highlightA ? 'font-bold text-gray-900 dark:text-gray-100' : 'text-gray-600 dark:text-gray-400'
        }`}
      >
        {valueA}
      </span>
      <span
        className="flex-1 text-center text-xs text-gray-400 dark:text-gray-500 font-medium group relative cursor-help"
        title={tooltip}
      >
        <span className="border-b border-dotted border-gray-300 dark:border-gray-600">{label}</span>
        {tooltip && (
          <span className="invisible group-hover:visible absolute bottom-full left-1/2 -translate-x-1/2 mb-2 px-3 py-2 text-[11px] leading-snug text-white bg-gray-900 dark:bg-gray-700 rounded-lg shadow-lg w-52 text-left font-normal z-50 pointer-events-none">
            {tooltip}
            <span className="absolute top-full left-1/2 -translate-x-1/2 border-4 border-transparent border-t-gray-900 dark:border-t-gray-700" />
          </span>
        )}
      </span>
      <span
        className={`w-20 text-left tabular-nums ${
          highlightB ? 'font-bold text-gray-900 dark:text-gray-100' : 'text-gray-600 dark:text-gray-400'
        }`}
      >
        {valueB}
      </span>
    </div>
  );
}

function ProbabilityBar({ probA }: { probA: number }) {
  const pctA = Math.round(probA * 100);
  const pctB = 100 - pctA;

  return (
    <div className="w-full">
      <div className="flex justify-between text-xs font-bold mb-1">
        <span className="text-[#00274C] dark:text-blue-300">{pctA}%</span>
        <span className="text-gray-400 dark:text-gray-500">Win Probability</span>
        <span className="text-[#FF6B00] dark:text-orange-300">{pctB}%</span>
      </div>
      <div className="flex h-3 rounded-full overflow-hidden">
        <div
          className="transition-all duration-300"
          style={{ width: `${pctA}%`, backgroundColor: '#00274C' }}
        />
        <div
          className="transition-all duration-300"
          style={{ width: `${pctB}%`, backgroundColor: '#FF6B00' }}
        />
      </div>
    </div>
  );
}

export default function MatchupCard({ matchup, teamA, teamB, narrative, onPick }: MatchupCardProps) {
  const winProbA = matchup.winProbA ?? 0.5;

  // Deterministic public pick percentage
  const publicPickA = useMemo(
    () => estimatePublicPickPct(teamA.id, teamA.seed, teamB.id, teamB.seed),
    [teamA.id, teamA.seed, teamB.id, teamB.seed],
  );
  const publicPctA = Math.round(publicPickA * 100);
  const publicPctB = 100 - publicPctA;
  const publicFavoriteId = publicPickA >= 0.5 ? teamA.id : teamB.id;
  const isContrarianPick = matchup.winnerId !== null && matchup.winnerId !== publicFavoriteId;

  const kenpomBetter = teamA.kenpom.adjEM > teamB.kenpom.adjEM ? 'A' : 'B';
  const bartBetter = teamA.barttorvik.barthag > teamB.barttorvik.barthag ? 'A' : 'B';
  const netBetter = teamA.net.rank < teamB.net.rank ? 'A' : 'B';
  const sagBetter = teamA.sagarin.rating > teamB.sagarin.rating ? 'A' : 'B';

  return (
    <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 shadow-sm overflow-hidden max-w-lg w-full">
      {/* Header */}
      <div className="px-5 py-3 border-b border-gray-100 dark:border-gray-700" style={{ backgroundColor: '#00274C' }}>
        <div className="flex items-center justify-between">
          <span className="text-xs text-blue-200 font-medium uppercase tracking-wider">
            {matchup.region} &middot; {matchup.round}
          </span>
          {matchup.locked && <span className="text-sm" title="Locked">🔒</span>}
          {matchup.isUpset && <span className="text-sm" title="Upset">🔥</span>}
        </div>
      </div>

      {/* Team Headers */}
      <div className="flex items-stretch border-b border-gray-100 dark:border-gray-700">
        <button
          onClick={() => onPick(teamA.id)}
          className={`flex-1 px-4 py-3 text-center transition-colors hover:bg-blue-50 dark:hover:bg-blue-900/30 ${
            matchup.winnerId === teamA.id ? 'bg-blue-50 dark:bg-blue-900/30' : ''
          }`}
        >
          <div className="text-lg font-bold text-[#00274C] dark:text-blue-300">
            <span className="text-xs font-medium text-gray-400 dark:text-gray-500 mr-1">({teamA.seed})</span>
            {teamA.name}
          </div>
          <div className="text-xs text-gray-400 dark:text-gray-500 mt-0.5">{teamA.conference}</div>
          {matchup.winnerId === teamA.id && (
            <div className="mt-1 inline-block px-2 py-0.5 rounded-full text-[10px] font-bold text-white" style={{ backgroundColor: '#00274C' }}>
              PICKED
            </div>
          )}
        </button>

        <div className="w-px bg-gray-200 dark:bg-gray-700" />

        <button
          onClick={() => onPick(teamB.id)}
          className={`flex-1 px-4 py-3 text-center transition-colors hover:bg-orange-50 dark:hover:bg-orange-900/30 ${
            matchup.winnerId === teamB.id ? 'bg-orange-50 dark:bg-orange-900/30' : ''
          }`}
        >
          <div className="text-lg font-bold text-[#FF6B00] dark:text-orange-300">
            <span className="text-xs font-medium text-gray-400 dark:text-gray-500 mr-1">({teamB.seed})</span>
            {teamB.name}
          </div>
          <div className="text-xs text-gray-400 dark:text-gray-500 mt-0.5">{teamB.conference}</div>
          {matchup.winnerId === teamB.id && (
            <div className="mt-1 inline-block px-2 py-0.5 rounded-full text-[10px] font-bold text-white" style={{ backgroundColor: '#FF6B00' }}>
              PICKED
            </div>
          )}
        </button>
      </div>

      {/* Win probability bar */}
      <div className="px-5 py-3 border-b border-gray-100 dark:border-gray-700">
        <ProbabilityBar probA={winProbA} />
      </div>

      {/* Public pick percentages */}
      <div className="px-5 py-2.5 border-b border-gray-100 dark:border-gray-700 bg-gray-50 dark:bg-gray-750 dark:bg-gray-800/50">
        <div className="flex items-center justify-between">
          <span className="text-[10px] font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wider">Public Picks</span>
          {isContrarianPick && (
            <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-purple-100 text-purple-700 dark:bg-purple-900/40 dark:text-purple-300">
              Contrarian pick! 🔄
            </span>
          )}
        </div>
        <div className="flex items-center justify-between mt-1.5">
          <span className={`text-xs font-bold ${publicPickA >= 0.5 ? 'text-[#00274C] dark:text-blue-300' : 'text-gray-500 dark:text-gray-400'}`}>
            {teamA.name} {publicPctA}%
          </span>
          <span className={`text-xs font-bold ${publicPickA < 0.5 ? 'text-[#FF6B00] dark:text-orange-300' : 'text-gray-500 dark:text-gray-400'}`}>
            {teamB.name} {publicPctB}%
          </span>
        </div>
        <div className="flex h-1.5 rounded-full overflow-hidden mt-1">
          <div className="transition-all duration-300 bg-[#00274C] dark:bg-blue-400" style={{ width: `${publicPctA}%`, opacity: publicPickA >= 0.5 ? 1 : 0.4 }} />
          <div className="transition-all duration-300 bg-[#FF6B00] dark:bg-orange-400" style={{ width: `${publicPctB}%`, opacity: publicPickA < 0.5 ? 1 : 0.4 }} />
        </div>
      </div>

      {/* Stats comparison */}
      <div className="px-5 py-3 border-b border-gray-100 dark:border-gray-700">
        <h3 className="text-xs font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wider mb-2">
          Key Metrics
        </h3>
        <StatRow
          label="KenPom AdjEM"
          tooltip="KenPom Adjusted Efficiency Margin — the difference between a team's offensive and defensive efficiency, adjusted for opponent strength. The gold standard predictive metric in college basketball. Higher is better."
          valueA={teamA.kenpom.adjEM.toFixed(1)}
          valueB={teamB.kenpom.adjEM.toFixed(1)}
          highlightA={kenpomBetter === 'A'}
          highlightB={kenpomBetter === 'B'}
        />
        <StatRow
          label="Barthag"
          tooltip="Barttorvik Barthag — a team's estimated probability of beating an average Division I team on a neutral court. Ranges from 0 to 1. Combines offensive and defensive efficiency into a single win probability."
          valueA={teamA.barttorvik.barthag.toFixed(4)}
          valueB={teamB.barttorvik.barthag.toFixed(4)}
          highlightA={bartBetter === 'A'}
          highlightB={bartBetter === 'B'}
        />
        <StatRow
          label="NET Rank"
          tooltip="NCAA Evaluation Tool — the NCAA's official ranking metric used by the selection committee. Factors in game results, strength of schedule, game location, scoring margin, and net offensive/defensive efficiency. Lower is better."
          valueA={`#${teamA.net.rank}`}
          valueB={`#${teamB.net.rank}`}
          highlightA={netBetter === 'A'}
          highlightB={netBetter === 'B'}
        />
        <StatRow
          label="Sagarin"
          tooltip="Sagarin Ratings — an independent computer ranking system that uses a combination of pure points-based and win/loss-based methods. Provides an alternative perspective on team strength. Higher is better."
          valueA={teamA.sagarin.rating.toFixed(1)}
          valueB={teamB.sagarin.rating.toFixed(1)}
          highlightA={sagBetter === 'A'}
          highlightB={sagBetter === 'B'}
        />
        <StatRow
          label="KenPom Rank"
          tooltip="KenPom overall ranking — teams ranked by adjusted efficiency margin. Widely considered the most accurate predictive system in college basketball, created by Ken Pomeroy. Lower is better."
          valueA={`#${teamA.kenpom.rank}`}
          valueB={`#${teamB.kenpom.rank}`}
          highlightA={teamA.kenpom.rank < teamB.kenpom.rank}
          highlightB={teamB.kenpom.rank < teamA.kenpom.rank}
        />
        <StatRow
          label="Q1 Record"
          tooltip="Quadrant 1 record — wins and losses against the toughest opponents (home vs top 30 NET, neutral vs top 50, away vs top 75). The selection committee weighs Q1 wins heavily. More wins is better."
          valueA={teamA.net.q1Record}
          valueB={teamB.net.q1Record}
        />
      </div>

      {/* Team profiles */}
      <div className="px-5 py-3 border-b border-gray-100 dark:border-gray-700">
        <h3 className="text-xs font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wider mb-2">
          Play Style
        </h3>
        <div className="flex gap-4">
          <div className="flex-1">
            <div className="flex flex-wrap gap-1">
              <span className="px-2 py-0.5 text-[10px] rounded-full bg-blue-50 dark:bg-blue-900/40 text-blue-700 dark:text-blue-300 font-medium">
                {teamA.profile.style}
              </span>
              <span className="px-2 py-0.5 text-[10px] rounded-full bg-blue-50 dark:bg-blue-900/40 text-blue-700 dark:text-blue-300 font-medium">
                {teamA.profile.tempo} tempo
              </span>
            </div>
          </div>
          <div className="flex-1 text-right">
            <div className="flex flex-wrap justify-end gap-1">
              <span className="px-2 py-0.5 text-[10px] rounded-full bg-orange-50 dark:bg-orange-900/40 text-orange-700 dark:text-orange-300 font-medium">
                {teamB.profile.style}
              </span>
              <span className="px-2 py-0.5 text-[10px] rounded-full bg-orange-50 dark:bg-orange-900/40 text-orange-700 dark:text-orange-300 font-medium">
                {teamB.profile.tempo} tempo
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Spread */}
      <div className="px-5 py-2 border-b border-gray-100 dark:border-gray-700 flex items-center justify-between">
        <span className="text-xs text-gray-400">Vegas Spread</span>
        <span className="text-sm font-bold text-gray-700 dark:text-gray-200">
          {teamA.name}{' '}
          {winProbA >= 0.5 ? '-' : '+'}
          {Math.abs(((winProbA - 0.5) * 20)).toFixed(1)}
        </span>
      </div>

      {/* Historical seed matchup data */}
      <div className="px-5 py-2 border-b border-gray-100 dark:border-gray-700 flex items-center justify-between">
        <span className="text-xs text-gray-400">Seed Matchup</span>
        <span className="text-sm font-medium text-gray-600 dark:text-gray-300">
          #{teamA.seed} vs #{teamB.seed}
        </span>
      </div>

      {/* Claude narrative */}
      {narrative && (
        <div className="px-5 py-3 border-b border-gray-100 dark:border-gray-700">
          <h3 className="text-xs font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wider mb-1.5">
            AI Analysis
          </h3>
          <p className="text-sm text-gray-600 dark:text-gray-300 leading-relaxed">{narrative.narrative}</p>
          <div className="flex items-center gap-3 mt-2">
            <span className="text-[10px] px-2 py-0.5 bg-gray-100 dark:bg-gray-700 rounded-full text-gray-500 dark:text-gray-400 font-medium">
              Key: {narrative.keyFactor}
            </span>
            <span className="text-[10px] px-2 py-0.5 bg-gray-100 dark:bg-gray-700 rounded-full text-gray-500 dark:text-gray-400 font-medium">
              Confidence: {narrative.confidence}
            </span>
          </div>
        </div>
      )}

      {/* Pick buttons */}
      <div className="flex">
        <button
          onClick={() => onPick(teamA.id)}
          className="flex-1 py-3 text-sm font-bold text-center transition-colors hover:opacity-90 text-white"
          style={{ backgroundColor: '#00274C' }}
        >
          Pick {teamA.name}
        </button>
        <button
          onClick={() => onPick(teamB.id)}
          className="flex-1 py-3 text-sm font-bold text-center transition-colors hover:opacity-90 text-white"
          style={{ backgroundColor: '#FF6B00' }}
        >
          Pick {teamB.name}
        </button>
      </div>
    </div>
  );
}
