# Bracket Assist — NCAA March Madness Bracket Tool

## Product Spec v1.0

---

## 1. Overview

**Bracket Assist** is an interactive React web app that helps users fill out NCAA March Madness brackets by combining statistical models, Vegas odds, historical tournament trends, and user-defined biases. It supports three core modes: generating a single optimized bracket, generating multiple differentiated brackets for pool strategy, and an interactive guided pick mode for manual selection with AI-backed recommendations.

### Target User
Sports-savvy bracket pool participants who want data-driven picks with the ability to inject their own opinions — not a black-box optimizer, but a decision-support tool.

### Design Philosophy
- **Opinionated defaults, full override** — the system should produce a strong bracket out of the box, but every pick is overridable
- **Pool-aware** — bracket strategy changes based on pool size and scoring format; the tool should account for this
- **Transparent** — every recommendation should show *why* (which factors drove it, confidence level, upset probability)

---

## 2. Architecture

### 2.1 High-Level Stack

| Layer | Tech | Notes |
|-------|------|-------|
| Frontend | React + Tailwind | Single-page app, could target Vercel or Azure Static Web Apps |
| State Management | React Context + useReducer | Bracket state, user prefs, model weights |
| AI/LLM Layer | Claude API (Sonnet) | Natural language analysis, narrative generation, bias interpretation |
| Data Layer | Static JSON + API fetches | Pre-tournament data snapshot + live odds feeds |
| Build | Vite | Fast dev, single-file bundle option via `vite-plugin-singlefile` if needed |

### 2.2 Data Flow

```
[Data Sources] → [Normalization Engine] → [Composite Score Model] → [Bracket Generator]
                                                  ↑
                                          [User Overrides/Biases]
                                                  ↓
                                          [Pool Strategy Layer] → [Multi-Bracket Output]
```

---

## 3. Data Sources & Ingestion

### 3.1 Statistical Models

| Source | Data Points | Update Frequency |
|--------|------------|-----------------|
| KenPom | AdjEM, AdjO, AdjD, AdjT, SOS, Luck | Pre-tournament snapshot |
| NET Rankings | Quad record, NET rank | Pre-tournament snapshot |
| Sagarin | Ratings, schedule strength | Pre-tournament snapshot |
| Barttorvik (T-Rank) | AdjOE, AdjDE, Barthag, WAB | Pre-tournament snapshot |
| TeamRankings | Predictive rankings, SOS | Pre-tournament snapshot |

**Ingestion approach:** Pre-tournament, scrape or manually input key metrics into a `teams.json` master file. Each team record includes:

```json
{
  "id": "duke",
  "name": "Duke",
  "seed": 1,
  "region": "East",
  "conference": "ACC",
  "kenpom": { "rank": 3, "adjEM": 28.5, "adjO": 120.1, "adjD": 91.6, "adjT": 68.2 },
  "net": { "rank": 4, "q1_record": "10-3", "q2_record": "5-1" },
  "barttorvik": { "rank": 2, "barthag": 0.972 },
  "sagarin": { "rank": 5, "rating": 92.1 },
  "profile": {
    "style": "balanced",
    "tempo": "medium",
    "three_pt_rate": 0.38,
    "ft_rate": 0.33,
    "turnover_rate": 0.16,
    "orb_rate": 0.32
  }
}
```

### 3.2 Betting Lines / Vegas Odds

| Source | Data Points | Notes |
|--------|------------|-------|
| Consensus odds | Round-by-round win probabilities | Available from various odds aggregators |
| Futures | Championship futures price | Implied probability for title |
| Opening vs. current line | Line movement | Signals sharp money / information |

**Implementation:** Fetch from a public odds API or manually input consensus lines. Store as:

```json
{
  "matchup_id": "R1_E_1v16",
  "team_a": "duke",
  "team_b": "norfolk_state",
  "spread": -24.5,
  "moneyline_a": -10000,
  "moneyline_b": 3500,
  "over_under": 145.5,
  "implied_prob_a": 0.985
}
```

### 3.3 Historical Tournament Trends

Pre-computed historical trend database covering:

- **Seed matchup history** — e.g., 5v12 upset rate (35.4%), 1-seeds losing in R1 (1.5%), etc.
- **Conference performance** — tournament win rate by conference, adjusted for era
- **Style matchup edges** — tempo mismatches, 3PT-heavy teams in March, FT shooting in close games
- **Experience factors** — tournament experience (returning minutes), coach tournament record
- **Cinderella profiles** — common traits of deep-run mid-majors (low turnover rate, strong D, good FT%)
- **Fatigue / rest patterns** — performance in back-to-back games, travel distance effects

Store as `historical_trends.json` with lookup functions.

### 3.4 User-Defined Biases

Allow users to express preferences in structured and unstructured ways:

**Structured biases:**
- Lock a team to advance to a specific round
- Eliminate a team at a specific round
- Boost/penalize a conference (e.g., "Big 12 is overrated this year")
- Set upset appetite: Conservative / Moderate / Aggressive / Chaos
- Favor specific matchup styles (e.g., "I like defensive teams in March")

**Unstructured biases (Claude-powered):**
- Free-text input: *"I think Gonzaga is fraudulent — they haven't beaten anyone good"*
- Claude interprets the sentiment, maps it to a quantitative adjustment, and explains what it did
- Example output: *"Understood — reducing Gonzaga's composite score by 12% based on your SOS concern. This drops them from a Sweet 16 exit to a Round of 32 exit in the base model."*

---

## 4. Composite Scoring Model

### 4.1 Weighted Composite Score

Each team gets a **Composite Power Rating (CPR)** computed as:

```
CPR = w1 * normalize(kenpom_adjEM)
    + w2 * normalize(barttorvik_barthag)
    + w3 * normalize(net_rank)
    + w4 * normalize(sagarin_rating)
    + w5 * normalize(vegas_implied_prob)
    + w6 * historical_seed_adjustment
    + w7 * experience_factor
    + user_bias_modifier
```

**Default weights:**

| Factor | Weight | Rationale |
|--------|--------|-----------|
| KenPom AdjEM | 0.25 | Gold standard predictive metric |
| Barttorvik Barthag | 0.20 | Strong complementary model |
| NET Rank | 0.10 | Committee's own metric, useful for seeding context |
| Sagarin | 0.10 | Independent validation |
| Vegas Implied Prob | 0.20 | Market-efficient, absorbs injury/motivation info |
| Historical Seed Adj | 0.10 | Empirical seed-round performance |
| Experience Factor | 0.05 | Tournament minutes returning, coach record |

Users can adjust weights via sliders in the UI.

### 4.2 Matchup Simulation

For each potential matchup, compute win probability:

```
P(A beats B) = logistic(CPR_A - CPR_B) * style_matchup_modifier * trend_modifier
```

Where:
- `logistic()` converts rating differential to probability
- `style_matchup_modifier` accounts for tempo/style mismatches (e.g., slow-tempo team vs. fast = higher variance)
- `trend_modifier` applies historical round-specific adjustments

### 4.3 Full Bracket Simulation

Run **Monte Carlo simulation** (10,000 iterations) where each game outcome is sampled from the win probability distribution. This produces:

- **Expected round of exit** for each team
- **Championship probability** for each team
- **Confidence intervals** for each pick
- **Upset probability matrix** — heatmap of where upsets are most likely

---

## 5. Core Features

### 5.1 Mode 1: Optimized Single Bracket

**Goal:** Generate the single most likely bracket (or the highest expected-value bracket for a given scoring system).

**Flow:**
1. Load all data sources → compute CPR for each team
2. Apply user biases
3. Simulate bracket → select most probable winner of each game
4. Present full bracket with confidence indicators per pick

**Scoring system awareness:**
- Standard (1/2/4/8/16/32) — favors chalk
- Upset bonus — favors picking a few calculated upsets
- Seed-based (points = seed of winning team) — heavily favors upsets
- Custom — user defines point values per round

### 5.2 Mode 2: Multi-Bracket Pool Strategy

**Goal:** Generate N differentiated brackets optimized for a pool of size M.

**Key insight:** In a 100-person pool, picking all chalk guarantees mediocrity. Optimal strategy requires *portfolio diversification* — brackets that share a common base of high-confidence picks but diverge on key leverage games.

**Algorithm:**
1. Identify **leverage games** — matchups where:
   - Win probability is 40-60% (true toss-ups)
   - The winner's path diverges significantly (e.g., the winner faces a much easier/harder R2 opponent)
   - Public picking % diverges from model probability (contrarian value)
2. Generate bracket archetypes:
   - **Chalk bracket** — most probable outcome
   - **Contrarian bracket** — targets games where public % significantly overestimates a team
   - **Cinderella bracket** — aggressive upset picks in early rounds, chalk in later rounds
   - **Bold Final Four** — chalk early, contrarian Final Four picks
3. User selects how many brackets to generate and which archetypes to include

**Pool size adjustments:**
- Small pool (≤20): Fewer brackets needed, moderate differentiation
- Medium pool (20-100): 3-5 brackets, moderate-to-high differentiation
- Large pool (100+): 5-10 brackets, aggressive differentiation, target low-ownership Final Four teams

### 5.3 Mode 3: Interactive Guided Picks

**Goal:** Walk the user through each game with recommendations, letting them make the final call.

**UI Flow:**
1. Present matchup card with:
   - Team comparison (key stats side-by-side)
   - Model win probability
   - Vegas line
   - Historical seed matchup data
   - Key narrative (Claude-generated): *"UConn is 14-2 in tournament openers as a 1/2 seed under Hurley. Norfolk State ranks 280th in AdjD — this should be a comfortable win."*
2. User clicks to select winner or asks Claude for more analysis
3. After each pick, downstream matchups update in real-time
4. Running bracket score projection shown throughout

**Claude integration in guided mode:**
- "Tell me more about this matchup" → Claude provides deeper analysis
- "Who should I pick if I'm going contrarian?" → Claude suggests the upset with reasoning
- "What does history say?" → Claude surfaces relevant historical parallels

---

## 6. UI / UX Design

### 6.1 Layout

```
┌─────────────────────────────────────────────────────┐
│  Header: Mode Selector | Pool Config | Data Status  │
├────────────┬────────────────────────────────────────┤
│            │                                        │
│  Controls  │         Bracket Visualization          │
│  Panel     │                                        │
│            │     (Interactive SVG/Canvas bracket     │
│  - Weights │      with zoom, click-to-pick,         │
│  - Biases  │      confidence color coding)          │
│  - Pool    │                                        │
│    Config  │                                        │
│  - Upset   │                                        │
│    Appetite│                                        │
│            │                                        │
├────────────┼────────────────────────────────────────┤
│  Analysis  │  Matchup Detail / Claude Chat          │
│  Dashboard │  (contextual — shows current matchup)  │
└────────────┴────────────────────────────────────────┘
```

### 6.2 Bracket Visualization

- **Full 63-game bracket** rendered as interactive SVG or Canvas
- Color-coded confidence: Green (>75%), Yellow (50-75%), Red (<50%)
- Click any matchup to open detail panel
- Hover for quick stats tooltip
- Locked picks shown with lock icon
- Upset picks highlighted with flame icon

### 6.3 Key UI Components

| Component | Description |
|-----------|-------------|
| `<BracketView>` | Main bracket SVG with all 6 rounds |
| `<MatchupCard>` | Detailed comparison for a single game |
| `<WeightSliders>` | Adjust model factor weights |
| `<BiasPanel>` | Structured + free-text bias input |
| `<PoolConfig>` | Pool size, scoring system, # of brackets |
| `<AnalysisDashboard>` | Aggregate stats, upset matrix, championship odds |
| `<ClaudeChat>` | Contextual AI chat for matchup analysis |
| `<MultiBracketView>` | Side-by-side comparison of generated brackets |
| `<ExportPanel>` | Print / PDF / ESPN export options |

### 6.4 Design Direction

- White background, clean typography — not a cluttered sportsbook aesthetic
- Primary accent: Tournament blue (#00274C) with orange (#FF6B00) for upsets/highlights
- Data-dense but scannable — inspired by FiveThirtyEight's bracket interactives
- Mobile-responsive: bracket scrolls horizontally on mobile, matchup cards stack vertically

---

## 7. Claude API Integration

### 7.1 Use Cases

| Feature | Model | Purpose |
|---------|-------|---------|
| Matchup narratives | Sonnet | Generate 2-3 sentence analysis for each of 63 games |
| Bias interpretation | Sonnet | Parse free-text user opinions into quantitative adjustments |
| Deep analysis chat | Sonnet | On-demand conversational analysis of specific matchups |
| Bracket summary | Sonnet | Generate a "scouting report" for a completed bracket |

### 7.2 Prompt Architecture

**Matchup narrative prompt:**
```
System: You are an expert college basketball analyst. Given the statistical 
profiles of two teams and historical context, provide a concise 2-3 sentence 
analysis of this tournament matchup. Include the key factor that will decide 
the game and a confidence assessment. Be direct — no hedging.

User: {team_a_profile} vs {team_b_profile}
Round: {round}
Spread: {spread}
Model win probability: {prob}
Historical seed matchup record: {seed_history}
```

**Bias interpretation prompt:**
```
System: You are translating a user's basketball opinion into a numerical 
adjustment for a bracket prediction model. Given their free-text input, 
determine: (1) which team(s) are affected, (2) the direction of adjustment 
(boost or penalize), (3) the magnitude on a scale of -20% to +20%, and 
(4) a one-sentence explanation of your interpretation.

Respond in JSON: { "adjustments": [{ "team_id", "modifier", "explanation" }] }
```

### 7.3 Cost Management

- Pre-generate all 63 matchup narratives in a single batch call (~$0.15-0.30)
- Cache narratives — only regenerate if user changes picks upstream
- Bias interpretation: on-demand, ~$0.01 per query
- Deep analysis chat: on-demand, standard conversational pricing
- **Estimated total cost per bracket session:** $0.50-2.00

---

## 8. Export & Sharing

| Format | Description |
|--------|-------------|
| Print-ready PDF | Clean bracket layout for printing |
| ESPN/CBS/Yahoo import | Auto-fill bracket on major platforms (stretch goal — may require browser extension or manual input guide) |
| Shareable link | Static snapshot of bracket with analysis |
| JSON export | Raw bracket data for programmatic use |
| Comparison view | Side-by-side diff of two brackets |

---

## 9. Data Refresh & Tournament Flow

### Pre-Tournament (Selection Sunday → First Four)
- Initial data load: all statistical models, odds, historical data
- User completes bracket(s)
- Export / submit to pool(s)

### During Tournament (stretch goal)
- Live score integration
- Bracket survival tracker — which of your picks are still alive
- "What needs to happen" scenarios — if Pick X loses, what's your max possible score
- Re-bracket mode — given remaining teams, optimize remaining picks

---

## 10. Technical Implementation Plan

### Phase 1: Core Engine (MVP)
- [ ] `teams.json` schema + 2025 tournament data population
- [ ] `historical_trends.json` — seed matchup history, conference performance
- [ ] Composite scoring model with configurable weights
- [ ] Monte Carlo simulation engine (pure JS, runs client-side)
- [ ] Basic bracket visualization (React + SVG)
- [ ] Single bracket generation (Mode 1)

### Phase 2: Intelligence Layer
- [ ] Claude API integration for matchup narratives
- [ ] Bias interpretation (structured + free-text)
- [ ] Guided pick mode with matchup cards (Mode 3)
- [ ] Pool-aware scoring system configuration

### Phase 3: Pool Strategy
- [ ] Multi-bracket generation (Mode 2)
- [ ] Public pick % data integration (ESPN/Yahoo public brackets)
- [ ] Contrarian value identification
- [ ] Bracket portfolio optimization
- [ ] Multi-bracket comparison view

### Phase 4: Polish & Export
- [ ] Print-ready PDF export
- [ ] Mobile-responsive layout
- [ ] Shareable bracket links
- [ ] Bracket survival tracker (live tournament mode)

---

## 11. Open Questions & Decisions

1. **Data sourcing legality** — KenPom is paywalled. Options: manual input, use free alternatives (Barttorvik is free), or rely more heavily on Vegas odds (publicly available).
2. **Public pick % source** — ESPN's "Who Picked Whom" data is valuable for contrarian strategy but may not be available via API. May need to scrape or manually input.
3. **Deployment** — Vercel (easy, free tier) vs. Azure Static Web Apps (if corporate access needed) vs. single-file bundle (zero-deploy).
4. **Bracket auto-fill** — Direct integration with ESPN/Yahoo bracket challenges would be killer but likely requires a browser extension. Worth scoping?
5. **Historical data depth** — How many years back? 10 years is probably sufficient for trends; going back further introduces era bias.
6. **Real-time odds** — Free odds APIs exist but have rate limits. Acceptable to use a pre-tournament snapshot, or is live odds movement important?

---

## 12. Success Metrics

- User completes a full bracket in < 15 minutes (guided mode)
- Generated brackets score in the top 20% of a pool (backtested against prior tournaments)
- Multi-bracket portfolio includes at least one bracket in the top 10% of a pool (backtested)
- Claude narratives are rated as "useful" by user > 80% of the time
