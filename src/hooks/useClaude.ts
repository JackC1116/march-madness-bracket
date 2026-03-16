import { useCallback, useState } from 'react';
import { useAppState } from '../context/AppContext';
import type {
  BracketState,
  ClaudeBiasAdjustment,
  ClaudeMessage,
  MatchupNarrative,
  Team,
} from '../types';

interface ClaudeApiResponse {
  content: Array<{ type: string; text: string }>;
}

async function callClaudeApi(
  messages: ClaudeMessage[],
  system: string,
  maxTokens = 1024,
): Promise<string> {
  const res = await fetch('/api/claude', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ messages, system, max_tokens: maxTokens }),
  });

  if (!res.ok) {
    const errorText = await res.text();
    throw new Error(`Claude API error (${res.status}): ${errorText}`);
  }

  const data: ClaudeApiResponse = await res.json();
  return data.content?.[0]?.text ?? '';
}

// ── Mock responses when no API key is set ─────────────────────

const MOCK_NARRATIVE: MatchupNarrative = {
  matchupId: '',
  narrative:
    'Add your Claude API key in settings to get AI-powered matchup narratives with in-depth analysis of team strengths, weaknesses, historical performance, and key factors that could decide the game.',
  keyFactor: 'Claude API key required',
  confidence: 'N/A',
};

const MOCK_BIAS_RESPONSE: ClaudeBiasAdjustment[] = [];

const MOCK_CHAT_RESPONSE =
  'Connect your Claude API key in settings to unlock conversational bracket analysis. You will be able to ask questions about matchups, get contrarian picks, and discuss tournament strategy.';

const MOCK_SUMMARY =
  'Connect your Claude API key in settings to generate a full scouting report and bracket analysis summary powered by Claude.';

// ── Hook ──────────────────────────────────────────────────────

export function useClaude() {
  const { state, dispatch } = useAppState();
  const [isLoading, setIsLoading] = useState(false);
  const hasApiKey = Boolean(state.claudeApiKey);

  const generateNarrative = useCallback(
    async (matchupId: string, teamA: Team, teamB: Team): Promise<MatchupNarrative> => {
      if (!hasApiKey) {
        const mock = { ...MOCK_NARRATIVE, matchupId };
        dispatch({ type: 'SET_NARRATIVE', payload: { matchupId, narrative: mock } });
        return mock;
      }

      setIsLoading(true);
      try {
        const system = `You are an expert NCAA basketball analyst. Provide a concise, insightful matchup narrative. Respond with valid JSON: { "narrative": string, "keyFactor": string, "confidence": "high" | "medium" | "low" }.`;
        const userMessage = `Analyze this NCAA tournament matchup:

Team A: ${teamA.name} (Seed ${teamA.seed}, ${teamA.conference})
- KenPom: #${teamA.kenpom.rank} (AdjEM: ${teamA.kenpom.adjEM}, AdjO: ${teamA.kenpom.adjO}, AdjD: ${teamA.kenpom.adjD})
- NET: #${teamA.net.rank} (Q1: ${teamA.net.q1Record}, Q2: ${teamA.net.q2Record})
- Style: ${teamA.profile.style}, Tempo: ${teamA.profile.tempo}

Team B: ${teamB.name} (Seed ${teamB.seed}, ${teamB.conference})
- KenPom: #${teamB.kenpom.rank} (AdjEM: ${teamB.kenpom.adjEM}, AdjO: ${teamB.kenpom.adjO}, AdjD: ${teamB.kenpom.adjD})
- NET: #${teamB.net.rank} (Q1: ${teamB.net.q1Record}, Q2: ${teamB.net.q2Record})
- Style: ${teamB.profile.style}, Tempo: ${teamB.profile.tempo}

Provide a narrative about how this matchup might play out, the key factor, and your confidence.`;

        const text = await callClaudeApi(
          [{ role: 'user', content: userMessage }],
          system,
          512,
        );

        let parsed: { narrative: string; keyFactor: string; confidence: string };
        try {
          parsed = JSON.parse(text);
        } catch {
          parsed = { narrative: text, keyFactor: 'See analysis', confidence: 'medium' };
        }

        const narrative: MatchupNarrative = {
          matchupId,
          narrative: parsed.narrative,
          keyFactor: parsed.keyFactor,
          confidence: parsed.confidence,
        };

        dispatch({ type: 'SET_NARRATIVE', payload: { matchupId, narrative } });
        return narrative;
      } finally {
        setIsLoading(false);
      }
    },
    [hasApiKey, dispatch],
  );

  const interpretBias = useCallback(
    async (freeText: string): Promise<ClaudeBiasAdjustment[]> => {
      if (!hasApiKey) return MOCK_BIAS_RESPONSE;

      setIsLoading(true);
      try {
        const system = `You are an NCAA basketball analyst. The user will describe their gut feelings or biases about teams. Interpret them and respond with a JSON array of adjustments: [{ "teamId": string, "modifier": number (-0.2 to 0.2), "explanation": string }]. Use common team names as teamId (lowercase, hyphenated, e.g., "gonzaga", "duke", "north-carolina").`;

        const text = await callClaudeApi(
          [{ role: 'user', content: freeText }],
          system,
          512,
        );

        let adjustments: ClaudeBiasAdjustment[];
        try {
          adjustments = JSON.parse(text);
        } catch {
          adjustments = [];
        }

        dispatch({ type: 'SET_CLAUDE_BIASES', payload: adjustments });
        return adjustments;
      } finally {
        setIsLoading(false);
      }
    },
    [hasApiKey, dispatch],
  );

  const chat = useCallback(
    async (
      messages: ClaudeMessage[],
      matchupContext?: { teamA: Team; teamB: Team },
    ): Promise<string> => {
      if (!hasApiKey) return MOCK_CHAT_RESPONSE;

      setIsLoading(true);
      try {
        let system =
          'You are Bracket Assist, an expert NCAA basketball analyst embedded in a March Madness bracket app. Provide insightful, data-driven analysis while being conversational and engaging.';

        if (matchupContext) {
          system += `\n\nCurrent matchup context:
Team A: ${matchupContext.teamA.name} (${matchupContext.teamA.seed} seed, KenPom #${matchupContext.teamA.kenpom.rank})
Team B: ${matchupContext.teamB.name} (${matchupContext.teamB.seed} seed, KenPom #${matchupContext.teamB.kenpom.rank})`;
        }

        return await callClaudeApi(messages, system, 1024);
      } finally {
        setIsLoading(false);
      }
    },
    [hasApiKey],
  );

  const generateBracketSummary = useCallback(
    async (bracket: BracketState): Promise<string> => {
      if (!hasApiKey) return MOCK_SUMMARY;

      setIsLoading(true);
      try {
        const system =
          'You are an expert NCAA bracket analyst. Generate a scouting report for the completed bracket. Highlight bold picks, potential upset vulnerabilities, overall strategy, and expected scoring performance.';

        // Build a condensed representation of the bracket
        const picks: string[] = [];
        const matchups = Object.values(bracket.matchups).sort((a, b) => {
          const roundOrder = ['First Four', 'R64', 'R32', 'Sweet 16', 'Elite 8', 'Final Four', 'Championship'];
          return roundOrder.indexOf(a.round) - roundOrder.indexOf(b.round);
        });

        for (const m of matchups) {
          if (m.winnerId && m.teamAId && m.teamBId) {
            const winner = bracket.teams[m.winnerId];
            const loser = bracket.teams[m.teamAId === m.winnerId ? m.teamBId : m.teamAId];
            if (winner && loser) {
              picks.push(
                `${m.round} (${m.region}): ${winner.name} (${winner.seed}) over ${loser.name} (${loser.seed})${m.isUpset ? ' [UPSET]' : ''}`,
              );
            }
          }
        }

        const userMessage = `Here is a completed March Madness bracket. Provide a scouting report:\n\n${picks.join('\n')}`;

        return await callClaudeApi(
          [{ role: 'user', content: userMessage }],
          system,
          1500,
        );
      } finally {
        setIsLoading(false);
      }
    },
    [hasApiKey],
  );

  return {
    generateNarrative,
    interpretBias,
    chat,
    generateBracketSummary,
    isLoading,
  };
}
