import React, { useState, useRef, useEffect, useCallback } from 'react';
import type { Team, BracketState, ClaudeMessage } from '../types';

interface ClaudeChatProps {
  matchupId: string | null;
  teams: Record<string, Team>;
  bracket: BracketState;
  apiKey: string;
}

const QUICK_QUESTIONS = [
  { label: 'Tell me more', prompt: 'Tell me more about this matchup. What are the key factors?' },
  { label: "Who's the contrarian pick?", prompt: "Who's the contrarian pick in this matchup and why?" },
  { label: 'What does history say?', prompt: 'What does historical seed matchup data say about this game?' },
  { label: 'Injury concerns?', prompt: 'Are there any injury or roster concerns for either team?' },
  { label: 'Style matchup', prompt: 'How do these teams\' play styles match up against each other?' },
];

export default function ClaudeChat({ matchupId, teams, bracket, apiKey }: ClaudeChatProps) {
  const [messages, setMessages] = useState<ClaudeMessage[]>([]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  // Get current matchup context
  const matchup = matchupId ? bracket.matchups[matchupId] : null;
  const teamA = matchup?.teamAId ? teams[matchup.teamAId] : null;
  const teamB = matchup?.teamBId ? teams[matchup.teamBId] : null;

  // Auto-scroll to bottom
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // Reset chat when matchup changes
  useEffect(() => {
    setMessages([]);
  }, [matchupId]);

  const buildSystemContext = useCallback(() => {
    if (!matchup || !teamA || !teamB) return '';
    return [
      `Current matchup: ${matchup.round}, ${matchup.region} region`,
      `${teamA.name} (${teamA.seed} seed, ${teamA.conference}) vs ${teamB.name} (${teamB.seed} seed, ${teamB.conference})`,
      `KenPom: ${teamA.name} AdjEM ${teamA.kenpom.adjEM.toFixed(1)} (#${teamA.kenpom.rank}) vs ${teamB.name} AdjEM ${teamB.kenpom.adjEM.toFixed(1)} (#${teamB.kenpom.rank})`,
      `Barttorvik: ${teamA.name} Barthag ${teamA.barttorvik.barthag.toFixed(4)} vs ${teamB.name} Barthag ${teamB.barttorvik.barthag.toFixed(4)}`,
      `NET: ${teamA.name} #${teamA.net.rank} (Q1: ${teamA.net.q1Record}) vs ${teamB.name} #${teamB.net.rank} (Q1: ${teamB.net.q1Record})`,
      matchup.winProbA !== null
        ? `Model win probability: ${teamA.name} ${(matchup.winProbA * 100).toFixed(1)}% - ${teamB.name} ${((1 - matchup.winProbA) * 100).toFixed(1)}%`
        : '',
      `Play styles: ${teamA.name} (${teamA.profile.style}, ${teamA.profile.tempo} tempo) vs ${teamB.name} (${teamB.profile.style}, ${teamB.profile.tempo} tempo)`,
    ]
      .filter(Boolean)
      .join('\n');
  }, [matchup, teamA, teamB]);

  const sendMessage = async (text: string) => {
    if (!text.trim() || !apiKey) return;

    const userMessage: ClaudeMessage = { role: 'user', content: text };
    const updatedMessages = [...messages, userMessage];
    setMessages(updatedMessages);
    setInput('');
    setIsLoading(true);

    try {
      const systemContext = buildSystemContext();
      const response = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': apiKey,
          'anthropic-version': '2023-06-01',
          'anthropic-dangerous-direct-browser-access': 'true',
        },
        body: JSON.stringify({
          model: 'claude-sonnet-4-20250514',
          max_tokens: 1024,
          system: `You are a March Madness bracket analysis assistant. Be concise, data-driven, and opinionated. Reference specific stats when possible. Keep responses to 2-3 paragraphs max.\n\nContext:\n${systemContext}`,
          messages: updatedMessages.map((m) => ({
            role: m.role,
            content: m.content,
          })),
        }),
      });

      if (!response.ok) {
        throw new Error(`API error: ${response.status}`);
      }

      const data = await response.json();
      const assistantText =
        data.content?.[0]?.text || 'Sorry, I could not generate a response.';

      setMessages((prev) => [
        ...prev,
        { role: 'assistant', content: assistantText },
      ]);
    } catch (err) {
      const errorMessage =
        err instanceof Error ? err.message : 'Unknown error occurred';
      setMessages((prev) => [
        ...prev,
        {
          role: 'assistant',
          content: `Error: ${errorMessage}. Please check your API key and try again.`,
        },
      ]);
    } finally {
      setIsLoading(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage(input);
    }
  };

  return (
    <div className="bg-white rounded-xl border border-gray-200 shadow-sm flex flex-col h-[600px]">
      {/* Header */}
      <div className="px-4 py-3 border-b border-gray-100 shrink-0">
        <div className="flex items-center gap-2">
          <div className="w-6 h-6 rounded-full flex items-center justify-center text-white text-[10px] font-bold" style={{ backgroundColor: '#00274C' }}>
            AI
          </div>
          <div>
            <h3 className="text-sm font-bold text-gray-900">Claude Analysis</h3>
            <p className="text-[10px] text-gray-400">
              {matchup && teamA && teamB
                ? `Discussing: ${teamA.name} vs ${teamB.name}`
                : 'Select a matchup to get started'}
            </p>
          </div>
        </div>
      </div>

      {/* Matchup context bar */}
      {matchup && teamA && teamB && (
        <div className="px-4 py-2 bg-gray-50 border-b border-gray-100 shrink-0">
          <div className="flex items-center justify-between text-xs">
            <div className="flex items-center gap-2">
              <span className="font-bold" style={{ color: '#00274C' }}>
                ({teamA.seed}) {teamA.name}
              </span>
              <span className="text-gray-400">vs</span>
              <span className="font-bold" style={{ color: '#FF6B00' }}>
                ({teamB.seed}) {teamB.name}
              </span>
            </div>
            <span className="text-[10px] text-gray-400">
              {matchup.round} &middot; {matchup.region}
            </span>
          </div>
          {matchup.winProbA !== null && (
            <div className="flex h-1.5 rounded-full overflow-hidden mt-1.5">
              <div
                className="transition-all"
                style={{ width: `${matchup.winProbA * 100}%`, backgroundColor: '#00274C' }}
              />
              <div
                className="transition-all"
                style={{ width: `${(1 - matchup.winProbA) * 100}%`, backgroundColor: '#FF6B00' }}
              />
            </div>
          )}
        </div>
      )}

      {/* Messages */}
      <div className="flex-1 overflow-y-auto px-4 py-3 space-y-3">
        {messages.length === 0 && (
          <div className="flex flex-col items-center justify-center h-full text-center">
            <div
              className="w-12 h-12 rounded-full flex items-center justify-center text-white text-lg font-bold mb-3"
              style={{ backgroundColor: '#00274C' }}
            >
              ?
            </div>
            <p className="text-sm text-gray-500 font-medium">Ask Claude anything about the bracket</p>
            <p className="text-xs text-gray-400 mt-1 max-w-xs">
              {matchup
                ? 'Use the quick questions below or type your own.'
                : 'Select a matchup first, or ask a general tournament question.'}
            </p>
          </div>
        )}

        {messages.map((msg, i) => (
          <div
            key={i}
            className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
          >
            <div
              className={`
                max-w-[85%] rounded-xl px-3.5 py-2.5 text-sm leading-relaxed
                ${
                  msg.role === 'user'
                    ? 'text-white rounded-br-sm'
                    : 'bg-gray-100 text-gray-700 rounded-bl-sm'
                }
              `}
              style={msg.role === 'user' ? { backgroundColor: '#00274C' } : undefined}
            >
              {msg.content.split('\n').map((line, j) => (
                <p key={j} className={j > 0 ? 'mt-2' : ''}>
                  {line}
                </p>
              ))}
            </div>
          </div>
        ))}

        {isLoading && (
          <div className="flex justify-start">
            <div className="bg-gray-100 rounded-xl rounded-bl-sm px-4 py-3">
              <div className="flex items-center gap-1.5">
                <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
              </div>
            </div>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* Quick questions */}
      {matchup && messages.length < 2 && (
        <div className="px-4 py-2 border-t border-gray-50 shrink-0">
          <div className="flex flex-wrap gap-1.5">
            {QUICK_QUESTIONS.map((q) => (
              <button
                key={q.label}
                onClick={() => sendMessage(q.prompt)}
                disabled={isLoading}
                className="px-2.5 py-1.5 text-[10px] font-medium border border-gray-200 rounded-full text-gray-600 hover:bg-gray-50 hover:border-gray-300 transition-colors disabled:opacity-40"
              >
                {q.label}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Input */}
      <div className="px-4 py-3 border-t border-gray-100 shrink-0">
        {!apiKey ? (
          <div className="text-center py-2">
            <p className="text-xs text-gray-400">
              Set your Claude API key to enable chat analysis.
            </p>
          </div>
        ) : (
          <div className="flex items-end gap-2">
            <textarea
              ref={inputRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Ask about this matchup..."
              rows={1}
              className="flex-1 text-sm border border-gray-200 rounded-xl px-3.5 py-2.5 resize-none text-gray-700 placeholder:text-gray-300 focus:outline-none focus:ring-2 focus:ring-blue-200 max-h-24"
              disabled={isLoading}
            />
            <button
              onClick={() => sendMessage(input)}
              disabled={isLoading || !input.trim()}
              className="shrink-0 w-10 h-10 rounded-xl flex items-center justify-center text-white transition-colors disabled:opacity-40"
              style={{ backgroundColor: '#00274C' }}
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8"
                />
              </svg>
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
