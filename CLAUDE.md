# DRMBL - Del Rio Men's Basketball League

## Project Structure

```
css/skeleton.css    -- Global nav + sponsor carousel styles (self-contained skeleton)
css/style.css       -- Shared page content styles (hero, info, details, contact, footer)
css/form.css        -- Registration + sponsor form styles
css/rules.css       -- Rules page styles
css/schedule.css    -- Schedule page styles
css/sponsor.css     -- Sponsor Us page styles
css/placeholder.css -- Placeholder/coming-soon page styles

js/skeleton.js      -- Global nav, mobile menu, sponsor data, and carousel logic
js/schedule.js      -- Schedule page logic

index.html          -- Homepage
register.html       -- Team registration form
rules.html          -- Rules & regulations
schedule.html       -- Weekly schedule
sponsor.html        -- Sponsor Us page (why sponsor, goal tracker, sponsor list)
sponsor-bio.html    -- Individual sponsor profile page (reads ?id= from URL)
sponsor-form.html   -- Sponsor inquiry form (no carousel)
live-game.html      -- Placeholder
owner.html          -- Placeholder
standings.html      -- Placeholder
stats.html          -- Placeholder
thank-you.html      -- Registration confirmation (standalone, no nav/carousel)
sponsor-thank-you.html -- Sponsor form confirmation (standalone, no nav/carousel)
league-flyer.html   -- Printable flyer (standalone, no nav/carousel)
waiver.html         -- Printable minor waiver (standalone, no nav/carousel)
```

## Skeleton System

The global nav and sponsor carousel are a self-contained skeleton loaded by every main page:

- **css/skeleton.css** -- All styles for `.site-header`, `.nav-*`, `.menu-toggle`, `.mobile-menu`, `.sponsors-section`, `.sponsor-slot`, and the `scroll-sponsors` keyframe animation
- **js/skeleton.js** -- Injects the header nav + mobile menu, then injects the sponsor carousel below it. Contains the `SPONSORS` data array that powers the carousel, sponsor page, and bio pages

Every page that uses the skeleton includes these in `<head>`:
```html
<link rel="stylesheet" href="css/skeleton.css">
<link rel="stylesheet" href="css/style.css">
<!-- page-specific CSS if any -->
<script src="js/skeleton.js"></script>
```

Pages that skip the carousel: `sponsor-bio.html`, `sponsor-form.html`. The JS detects these by pathname and adds `.no-carousel` to `<body>`.

## How to Add a New Sponsor

All sponsor data lives in `js/skeleton.js` in the `SPONSORS` array (around line 28).

### Step 1: Add the logo file

Place the sponsor's logo image in a folder under `sponsors/`:
```
sponsors/Business Name/logo.png
```

### Step 2: Add the entry to the SPONSORS array

Open `js/skeleton.js` and add a new object to the `SPONSORS` array:

```js
{
    id: 'business-name',           // URL-safe slug (used in sponsor-bio.html?id=)
    name: 'Business Name',         // Display name
    img: 'sponsors/Business Name/logo.png',  // Path to logo
    amount: 100,                   // Dollar amount sponsored
    bio: 'Description of the business.',     // Shows on their bio page
    links: [
        { label: 'Website',   url: 'https://example.com' },
        { label: 'Facebook',  url: 'https://facebook.com/example' },
        { label: 'Instagram', url: 'https://instagram.com/example' }
    ]
}
```

### What this automatically updates

- **Carousel** (all pages): The sponsor's logo appears in the scrolling carousel. The `amount` field determines how many slots they get (`amount / 50` slots, minimum 1). Empty slots show "BECOME A SPONSOR".
- **Sponsor Us page** (`sponsor.html`): Their logo appears in the "Our Sponsors" grid, and the goal tracker updates with their contribution toward the $3,000 goal.
- **Bio page** (`sponsor-bio.html?id=business-name`): Their full profile renders with logo, bio text, and link buttons.

### Key constants

- `SPONSOR_GOAL = 3000` -- Total sponsorship target in dollars
- `SPONSOR_EACH = 50` -- Dollar value per carousel slot (goal / each = total slots)

### Fields reference

| Field    | Required | Description |
|----------|----------|-------------|
| `id`     | Yes      | URL-safe slug, must be unique. Used in `sponsor-bio.html?id=` |
| `name`   | Yes      | Display name shown everywhere |
| `img`    | No       | Path to logo image. If omitted, name text is shown instead |
| `amount` | Yes      | Dollar amount. Controls carousel slot count and goal tracker |
| `bio`    | No       | Description text for the bio page |
| `links`  | No       | Array of `{ label, url }` objects for the bio page buttons |

### Example: Adding "Del Rio Auto" as a $200 sponsor

1. Place logo at `sponsors/Del Rio Auto/logo.png`
2. In `js/skeleton.js`, add to the `SPONSORS` array:
```js
{ id: 'del-rio-auto', name: 'Del Rio Auto', img: 'sponsors/Del Rio Auto/logo.png', amount: 200, bio: 'Your trusted local dealership since 1995.', links: [{ label: 'Website', url: 'https://delrioauto.com' }, { label: 'Facebook', url: 'https://facebook.com/delrioauto' }] },
```
3. Commit and push -- Vercel deploys automatically.

## API Endpoints

- `POST /api/register` -- Team registration (Cosmos DB)
- `POST /api/sponsor` -- Sponsor form submission (Cosmos DB)
- `GET /api/season` -- Fetch all teams for the current season
- `GET /api/team?id=TEAM_ID` -- Fetch a team's roster

## Deployment

Hosted on Vercel. Push to `main` triggers automatic deployment.

---

# Stat Tracker App

A React + Vite SPA for live basketball game stat tracking. Lives in `DO NOT TOUCH/stat-tracker/`. Builds to `/tracker/` and is served at `/tracker/` on Vercel.

## Stat Tracker File Structure

```
DO NOT TOUCH/stat-tracker/
  src/
    main.jsx                       -- React entry point (StrictMode wrapper)
    App.jsx                        -- Step-based router (steps 0-7)
    index.css                      -- All styles (CSS variables, per-screen sections)
    context/
      GameContext.jsx               -- React Context + useReducer for all game state
    data/
      api.js                       -- fetchSeasonTeams(), fetchTeamRoster(teamID)
      boxScore.js                  -- buildBoxScore() initializes box score JSON from game state
      gameSettings.js              -- DRMBL_DEFAULT preset (periods, fouls, timeouts, stoppages)
    screens/
      HomeScreen.jsx               -- Step 0: Welcome, "New Game" button
      GameSettingsScreen.jsx       -- Step 1: Configure game rules (presets + editable cards)
      TeamSelectScreen.jsx         -- Step 2: Pick home/away teams from API
      AttendanceScreen.jsx         -- Step 3: Check-in, assign numbers, pick captain + 5 starters
      AssignNumbersScreen.jsx      -- Step 4: (Legacy, skipped in main flow)
      PickStartersScreen.jsx       -- Step 5: (Legacy, skipped in main flow)
      TipOffScreen.jsx             -- Step 6: Tip-off winner + first possession → init box score
      GameScreen.jsx               -- Step 7: Live game tracking UI
  vite.config.js                   -- base: '/tracker/', builds to ../../tracker, proxies /api
```

## Architecture

**State management:** Single `useReducer` in `GameContext.jsx` with 30+ action types. All box score mutations use `structuredClone()` for immutability. Two context providers: `GameContext` (read) and `GameDispatchContext` (dispatch).

**Navigation:** Step-based (`setupStep` 0-7). `App.jsx` switches on step number to render the correct screen component. The main flow is: 0 → 1 → 2 → 3 → 6 → 7 (steps 4-5 are legacy, skipped).

**Styling:** Single `index.css` with CSS custom properties. Dark theme with court-wood accent. Uses Bebas Neue for headings, system fonts for body. All styles organized by screen section with comment headers.

## Pre-Game Setup Flow

| Step | Screen | What Happens |
|------|--------|-------------|
| 0 | HomeScreen | "New Game" button → step 1 |
| 1 | GameSettingsScreen | Pick preset (DRMBL Default), edit periods/fouls/timeouts/stoppages/tip rules |
| 2 | TeamSelectScreen | Fetch teams from `/api/season`, select home + away, fetch rosters |
| 3 | AttendanceScreen | Mark present players, assign jersey numbers, pick captain, pick 5 starters per team |
| 6 | TipOffScreen | Who won the tip? (+ who got possession if manual rule) → `INIT_BOX_SCORE` → step 7 |

## Game Tracking UI (Step 7 — GameScreen.jsx)

### Layout
```
┌──────────────────────────────────────────────────────────────┐
│  HOME TEAM  42  │  Q1  7:32  │  38  AWAY TEAM               │  Scoreboard
│  POSSESSION     │            │                POSSESSION     │
│  FOULS: 3       │            │                    FOULS: 2   │
│  BONUS  2xBONUS │            │            BONUS  2xBONUS     │
├──────────────────────────────────────────────────────────────┤
│  CLOCK RUNNING / CLOCK STOPPED                               │  Status banner
├─────────────────┬────────┬───────────────────────────────────┤
│ [1PT][2PT][3PT] │ AUTO   │ [1PT][2PT][3PT]                  │  Made row
│ [1PT][2PT][3PT] │ STOP   │ [1PT][2PT][3PT]                  │  Miss row
│ [REB][AST][STL] │        │ [REB][AST][STL]                  │  Stat row 1
│ [BLK][TO][FOUL] │ STOP   │ [BLK][TO][FOUL]                 │  Stat row 2
│ [TIMEOUT] [SUB] │ CLOCK  │ [TIMEOUT] [SUB]                  │  Game row
│─────────────────│        │───────────────────────────────────│
│ #23 Player A 12 │ REF    │ #5  Player X  8                  │  Scrollable
│ #7  Player B  4 │ T.O.   │ #11 Player Y  2                  │  player
│ ...             │        │ ...                               │  roster
│                 │ JUMP   │                                   │
│                 │ BALL   │                                   │
└─────────────────┴────────┴───────────────────────────────────┘
```

### Scoring/Stat Flow
1. Tap action button (e.g., "2PT MADE") → sets `pendingAction` local state
2. If action has sub-menu (rebound/foul/turnover) → sub-menu appears in-place
3. Player roster on that side enters selection mode (gold borders, cancel banner)
4. Other side dims (opacity + pointer-events: none)
5. Tap player → dispatch appropriate reducer action → clear pending
6. Auto-stop logic evaluates: `maybeAutoStop(actionName)` checks `stoppages.for` + `stoppages.during`
7. Suggestion glows trigger (rebound glow after miss/block, clock glow when stoppage is optional)

### Auto-Stop System
- **Derived value** `isAutoStopActive`: computed from `game.settings.stoppages.during` config vs current quarter + timeLeft
- **`maybeAutoStop(actionName)`**: looks up action in `stoppages.for` array
  - If `always: true` → auto-stops clock
  - If `always: false` + `isAutoStopActive` → auto-stops clock
  - If `always: false` + NOT in stoppages window → triggers suggest glow on clock button
- **AUTO STOP indicator**: read-only button showing on/off based on `isAutoStopActive`

### Clock
- `useRef` for timeLeft to avoid interval teardown on every tick
- `useEffect` creates `setInterval(100ms)` only when `isActive` changes
- Auto-dispatches `TOGGLE_CLOCK` when reaching 0:00
- Box score initializes with `active: true` (clock starts immediately after tip-off)
- "Next Quarter" button appears when clock hits 0:00

## Game Settings (gameSettings.js)

DRMBL_DEFAULT preset:
- **Periods**: 4 quarters, 10 min each, 5 min OT
- **Breaks**: 1 min between quarters, 3 min halftime, 1 min before OT
- **Shot clock**: Off
- **Stoppages**: Only active in last 3 min of 4th quarter + last 1 min of OT. Timeouts/Ref TOs always stop clock. Made shots, fouls, turnovers, jump balls only stop during stoppages window
- **Tip-off**: Tip winner gets possession; jump balls use alternating possession arrow
- **Fouls**: 5 personal = foul-out, double bonus at 5 team fouls (per quarter reset), 2 technicals = ejection
- **Timeouts**: 2 full (60s) + 2 short (30s) per game; OT gets 1 full, 0 short; no rollover

## Box Score Structure

```
boxScore: {
  id, tipOffWinner,
  gameInfo: {
    general: { timestamp, date, time, location, status },
    state: { active, currentQuarter, clock: { timeLeft, perQuarter, perOT },
             winner, loser, overtimes, possession, possessionArrow }
  },
  teamInfo: {
    home/away: {
      name, score: { current, perQuarter },
      stats: { shootingBreakdown, assists, defense, rebounds, turnovers, fouls, timeouts },
      roster: {
        full: [{ playerID, name, number, position }],
        inGame: [{ playerID, name, number, starter, captain, position,
                   stats: { offense, defense, rebounds, general } }]  // 12 slots
      }
    }
  }
}
```

## Reducer Actions (GameContext.jsx)

### Pre-Game Setup
| Action | Payload | Purpose |
|--------|---------|---------|
| `SET_STEP` | step | Navigate between screens |
| `SET_SETTINGS` | settings | Replace settings with preset |
| `UPDATE_SETTING` | path, value | Update nested setting by dot-path |
| `SET_HOME_TEAM` / `SET_AWAY_TEAM` | teamID, name, slot | Select team |
| `CLEAR_HOME_TEAM` / `CLEAR_AWAY_TEAM` | — | Deselect team + clear dependent state |
| `SET_TEAM_ROSTER` | side, roster | Load roster from API |
| `TOGGLE_ATTENDANCE` | side, playerID | Check player in/out |
| `SELECT_ALL_ATTENDANCE` / `CLEAR_ATTENDANCE` | side | Bulk attendance |
| `SET_NUMBER_OVERRIDE` / `CLEAR_NUMBER_OVERRIDE` | side, playerID, number | Jersey number |
| `TOGGLE_STARTER` / `SET_STARTERS` | side, playerID(s) | Pick starters (max 5) |
| `SET_CAPTAIN` / `CLEAR_CAPTAIN` | side, playerID | Designate captain |
| `SET_TIP_OFF_WINNER` | winner | Record tip winner |
| `SET_FIRST_POSSESSION` | side | Set initial possession |
| `INIT_BOX_SCORE` | — | Build box score from current state |

### Game Tracking
| Action | Payload | Purpose |
|--------|---------|---------|
| `RECORD_MADE_SHOT` | side, playerIndex, points | Record make + update score |
| `RECORD_MISSED_SHOT` | side, playerIndex, points | Record miss (no score change) |
| `SET_CLOCK_TIME` | timeLeft | Update clock |
| `TOGGLE_CLOCK` | — | Start/stop clock |
| `ADVANCE_QUARTER` | — | Next quarter, reset clock, stop |
| `RECORD_REBOUND` | side, playerIndex, reboundType | Off/def rebound |
| `RECORD_ASSIST` | side, playerIndex | Assist |
| `RECORD_STEAL` | side, playerIndex | Steal |
| `RECORD_BLOCK` | side, playerIndex | Block |
| `RECORD_TURNOVER` | side, playerIndex | Turnover |
| `RECORD_FOUL` | side, playerIndex, foulType | Personal/offensive/technical/flagrant |
| `SET_POSSESSION` | side | Update current possession |
| `JUMP_BALL` | — | Alternate possession arrow |

## What's Built (Complete)

- Full pre-game setup flow (home → settings → teams → attendance/numbers/starters → tip-off)
- Scoreboard with team names, scores, quarter, clock, fouls, possession arrow, bonus/2x bonus badges
- Game clock countdown with start/stop, auto-stop at 0:00, pulsing animations
- Shot tracking: 1PT/2PT/3PT made + missed with per-player and per-team stat updates
- Stat tracking: rebounds (off/def), assists, steals, blocks, turnovers (stolen/error), fouls (personal/offensive/technical/flagrant)
- Sub-menu system for multi-choice stats (rebound type, foul type, turnover type)
- Player selection flow with side dimming, cancel support, gold highlight
- Auto-stop clock system derived from game settings (per-quarter stoppages windows)
- Suggestion glow system (rebound glow after miss/block, clock glow for optional stoppages)
- Clock status banner (green "CLOCK RUNNING" / red pulsing "CLOCK STOPPED")
- Filled clock button (red STOP / green RUN)
- REF T.O. and JUMP BALL buttons wired with auto-stop
- Period advancement (Next Quarter button at 0:00)
- Possession arrow alternation on jump balls

## What's Remaining (Phase 2+)

### Core Game Mechanics
- **Timeout logic** -- Recording timeouts (full/short), decrementing remaining count, timeout duration timer
- **Substitution logic** -- Swapping bench/active players during stoppages
- **Possession tracking** -- Auto-update possession after made baskets, turnovers, etc.
- **And-1 flow** -- Made shot + foul combination

### Rules Enforcement
- **Foul-out detection** -- Alert when player hits foul limit (5 personal in DRMBL default)
- **Technical ejection** -- Alert at 2 technicals
- **Bonus behavior** -- Badges display but don't trigger free throw flow

### Period Management
- **Period advancement polish** -- Auto-start clock for next period, break timer between quarters

### Quality of Life
- **Undo system** -- Undo last recorded stat
- **Minutes played tracking** -- Track per-player time on court (stat field exists, not tracked)
- **Plus/minus tracking** -- Track per-player point differential while on court (stat field exists, not tracked)

### Post-Game
- **End game flow** -- Final score confirmation, winner/loser assignment
- **Box score export** -- Save/display final box score
