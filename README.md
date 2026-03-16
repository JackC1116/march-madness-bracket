# Bracket Assist — 2026 NCAA March Madness Bracket Tool

An interactive bracket builder that combines statistical models, Vegas odds, historical trends, and AI-powered analysis to help you fill out winning brackets.

## Features

- **Optimized Single Bracket** — Generate the most likely bracket based on composite scoring
- **Multi-Bracket Pool Strategy** — Generate differentiated brackets for pool competition
- **Interactive Guided Picks** — Walk through each game with AI recommendations
- **Claude AI Analysis** — Matchup narratives, bias interpretation, deep analysis chat
- **Monte Carlo Simulation** — 10,000 iteration simulation for championship probabilities
- **Configurable Model Weights** — Adjust KenPom, Barttorvik, NET, Sagarin, Vegas importance
- **Pool-Aware Scoring** — Standard, upset bonus, seed-based, or custom scoring
- **PDF Export** — Print-ready bracket
- **Shareable Links** — Share your bracket via URL

## Quick Start

```bash
npm install
npm run dev
```

## Deploy to Vercel

```bash
npx vercel
```

Set `ANTHROPIC_API_KEY` in Vercel environment variables for Claude AI features.

## Tech Stack

- React 19 + TypeScript
- Tailwind CSS v4
- Vite
- Claude API (Sonnet) for AI analysis
- jsPDF for PDF export
- Vercel for deployment

## Data Sources

- KenPom ratings
- Barttorvik (T-Rank)
- NET rankings
- Sagarin ratings
- Vegas odds (consensus lines)
- Historical tournament trends (seed matchup history, conference performance)
