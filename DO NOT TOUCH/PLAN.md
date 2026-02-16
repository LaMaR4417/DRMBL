# Basketball Stat Tracker - Planning

## Overview

A web-based scorekeeping app that replaces the traditional paper scorebook. Designed for tablet and laptop use at the scorer's table. The scorekeeper inputs all game actions in real time and the app produces a complete Box Score JSON when the game is done.

This is independent from the DRMBL website but shares the same data templates (Box Score, Team, Player, Season JSONs from `Imported from LMR-Jr/`).

---

## Target Devices

- **Primary:** Tablets (iPad, Android) and Laptops
- **Platform:** Web app (no app store needed) — open in a browser
- **Layout:** Split-screen with both teams visible at all times (left = home, right = away)

---

## Pre-Game Setup Flow

1. **Game Settings** — Choose a settings preset or customize. Presets are pre-configured profiles so the scorekeeper doesn't have to fill out every setting each time. Settings can still be adjusted per game. (See Game Settings section below.)
2. **Pick Teams** — Select home and away teams (load from Team JSON files)
3. **Check Attendance** — From the full roster, check off which players showed up
4. **Correct Numbers** — If a player is wearing a different jersey number, the scorekeeper can change it for this game. The alternate number gets stored in the player's `otherNumbers` array for future reference (per Player Template)
5. **Pick Starters** — Select 5 starters per team
6. **Tip-Off Interface** — Displays a "Start Game" button. Once pressed, the scorekeeper selects which team won the tip-off to establish initial possession tracking. The clock does not start here — it starts when the scorekeeper hits "Run Clock" on the live game screen

The Team JSON is the **source of truth** for player eligibility — only players in the JSON can play. Numbers are the only editable field.

---

## Game Settings

Settings presets are saved profiles that pre-fill game configuration so the scorekeeper can start quickly. The app ships with default presets (e.g., "DRMBL Default") and the user can create custom ones.

### Settings Presets

The scorekeeper picks a preset at the start of each game. Any setting can still be overridden on a per-game basis.

### Settings Fields

All settings below are defined in the `DRMBL Default (Game Settings).json` preset. See that file for the full JSON structure.

| Setting | Default (DRMBL) | Description |
|---------|-----------------|-------------|
| Period format | `{ quarters: true, halves: false }` | Whether the game uses 4 quarters or 2 halves |
| Minutes per period | 10 | Clock time per period (quarter or half, depending on format) |
| Minutes per overtime | 5 | Clock time per OT period |
| Break between quarters | 1 min | Countdown timer for between-quarter breaks |
| Halftime length | 3 min | Countdown timer for halftime break |
| Break before OT | 1 min | Countdown timer before overtime begins (also applies between OT periods) |
| Shot clock | `{ active: false, duration: null }` | Shot clock toggle and duration in seconds. Enable by setting `active: true` and `duration` to seconds (e.g., `{ active: true, duration: 30 }`) |
| Stoppages | see below | Controls when the game clock auto-stops on dead balls (see Stoppages section) |
| Foul-out limit | 5 | Number of personal fouls before a player fouls out |
| Bonus reset mode | `{ perPeriod: true, perHalf: false }` | Whether the team foul count resets each period (quarter) or each half |
| Bonus (1-and-1) threshold | off (`null`) | Team fouls to activate 1-and-1. The value is the activation threshold — next foul after this count sends them to the line. DRMBL doesn't use 1-and-1 |
| Double bonus threshold | 5 | Team fouls to activate double bonus. The 5th foul activates the bonus state; the 6th foul onward = 2 free throws |
| Full timeouts per team | 2 | Number of full timeouts available per team in regulation |
| Short timeouts per team | 2 | Number of short (30-second) timeouts available per team in regulation |
| Full timeout duration | 60 sec | Length of a full timeout in seconds |
| Short timeout duration | 30 sec | Length of a short timeout in seconds |
| Timeout allocation | `{ perGame: true, perHalf: false }` | Whether regulation timeouts are allocated per game (total) or per half (reset each half) |
| OT full timeouts | 1 | Full timeouts per team per overtime period |
| OT short timeouts | 0 | Short timeouts per team per overtime period |
| Timeout rollover (reg to OT) | false | Whether unused regulation timeouts carry over into overtime |
| Timeout rollover (OT to OT) | false | Whether unused OT timeouts carry over into the next OT period |
| Technical foul ejection limit | 2 | Number of technical fouls before a player is ejected |

### Stoppages

Controls when the game clock auto-stops on dead balls. Two parts:

**`during`** — Defines *when* stoppages activate, per period. Uses the same `perQuarter`/`perHalf` toggle pattern as the period format. Each period is either `false` (running clock for non-`always` actions) or `{ "enabled": true, "from": X }` (stoppages activate in the last X minutes).

**`for`** — Lists *which* actions from the Action Registry trigger clock stoppages. Each action has an `always` flag:
- `always: true` — This action stops the clock at all times, regardless of the `during` conditions
- `always: false` — This action only stops the clock when the current period's `during` condition is active

**DRMBL Default:**
- Q1–Q3: Running clock. Only `always: true` actions (Timeout, Referee Timeout) stop the clock
- Q4: Stoppages activate in the last 3 minutes — all `for` actions stop the clock
- OT: Stoppages activate in the last 1 minute — all `for` actions stop the clock

**Full-Game mode** (e.g., Championship preset): Set every action's `always` to `true`, making every dead ball stop the clock regardless of period.

**Running clock mode**: Set every action's `always` to `false` and disable all `during` periods — only manual clock control.

---

## Game Clock

- **Auto countdown timer** that the scorekeeper controls (start/stop)
- **Stoppages** are governed by the game settings preset (see Stoppages section above). The preset determines which periods have auto-stop behavior and when it kicks in
- **Actions with `always: true`** (e.g., Timeout, Referee Timeout) stop the clock regardless of the `during` conditions
- **End of period** always stops the clock (0:00 reached)
- **Manual stop** — Scorekeeper can manually stop the clock at any time via the center divider's Stop Clock button
- **Live override** — The "Auto Stop Clock" toggle in the center divider lets the scorekeeper override the preset's stoppage behavior mid-game (e.g., turn on full stoppages early if needed)
- **Clock settings (pre-game):**
  - Minutes per quarter (default: 10)
  - Minutes per overtime (default: 5)

---

## Action Bar — Input System

The primary input method. Actions are **top-level buttons** — the scorekeeper taps the action first, then selects which player it applies to.

Additionally, a **player-first** option at the bottom allows tapping a player first, then assigning an action.

### Top-Level Actions

**Scoring (7 buttons):**
- 1pt Made (free throw make)
- 1pt Missed (free throw miss)
- 2pt Made
- 2pt Missed
- 3pt Made
- 3pt Missed
- And-1 → forced sequence: shot type (2pt/3pt) → shooter → foul type → fouling defender

**Playmaking:**
- Assist
- Turnover → sub-menu: Steal / Player Error

**Defense:**
- Steal
- Block

**Rebounding:**
- Rebound → sub-menu: Offensive / Defensive → then pick player

**Fouls (1 button with sub-options):**
- Foul → sub-menu: Personal / Technical / Flagrant / Offensive

**Game Management:**
- Timeout
- Substitution

### Button Layout (per team half)

Each team's half of the screen has its own identical action panel:

```
┌─────────────────────────────────┐
│  1pt Made  │  2pt Made  │  3pt Made  │
│  1pt Miss  │  2pt Miss  │  3pt Miss  │
├─────────────────────────────────┤
│ Rebound │ Assist │ Steal │ Block │ Turnover │ Foul │
├─────────────────────────────────┤
│       Timeout       │    Substitution    │
└─────────────────────────────────┘
```

- **Top section** — Scoring: 2 rows x 3 columns (made on top, missed on bottom)
- **Middle section** — Stat actions: Rebound, Assist, Steal, Block, Turnover, Foul (single row, divided by lines above and below)
- **Bottom section** — Game management: Timeout, Substitution

### Center Divider Controls

The vertical line dividing the two team halves contains neutral game controls that don't belong to either team:

```
┌──────────────────────┐
│  Auto Stop Clock     │  ← Toggle on/off (auto-stops clock on fouls, etc.)
│  [Stop Clock]        │  ← Clock auto-starts from tip-off; defaults to "Stop Clock"
│  Referee Timeout     │  ← Stops clock for ref-called stoppages
│  Jump Ball           │  ← Neutral action — swaps possession arrow
└──────────────────────┘
```

- **Auto Stop Clock** — Toggle that enables/disables automatic clock stops on fouls
- **Run Clock / Stop Clock** — When transitioning from the Tip-Off screen to the Live Game UI, the clock starts automatically so the button shows "Stop Clock" by default (the game is already in motion). Pressing it stops the clock and the button converts to "Run Clock". This is the primary manual clock control
- **Referee Timeout** — Stops the clock for referee-initiated stoppages (not charged to either team)
- **Jump Ball** — Neutral action, not tied to either team. Triggers alternating possession arrow swap

---

## Stats Tracked Per Player (Per Game)

All stats from the Box Score Template `inGame` player object:

| Category | Stats |
|----------|-------|
| **Offense** | Points, Assists |
| **Shooting** | FG (2pt + 3pt) attempted/made/missed/%, 2pt attempted/made/missed/%, 3pt attempted/made/missed/%, FT attempted/made/missed/% |
| **Defense** | Steals, Blocks |
| **Rebounds** | Total, Offensive, Defensive |
| **General** | Minutes Played (auto from clock), Turnovers, Fouls (personal/technical/flagrant), Plus/Minus |

---

## Stats Tracked Per Team (Per Game)

All stats from the Box Score Template team-level stats:

- Score: current total + per-quarter breakdown
- Shooting breakdown (aggregate of all players)
- Assists, Steals, Blocks, Rebounds (off/def/total), Turnovers
- Fouls per quarter + bonus tracking (`opponentInBonus`)
- Timeouts: total available (full: 3, short: 2), used, remaining

---

## Game State Tracking

From the Box Score Template `gameInfo`:

- Current quarter (1st, 2nd, 3rd, 4th, OT1, OT2...)
- Clock time remaining
- Game status: Scheduled → Warm-Ups → In Progress → Time Out → Half Time → End → Concluded
- Active flag (is the clock running?)
- Winner/Loser (set when game concludes)
- Overtime count
- Players currently on court (5 per team)
- Starter designations
- Bonus status per team per quarter
- Possession tracking (established at tip-off, updated on turnovers, jump balls, etc.)
- Alternating possession arrow (for jump ball situations)

---

## Undo / Corrections

- **Simple undo:** Undo the most recent action (one step back)
- **Manual corrections:** Tap any stat to manually adjust the number up or down

---

## Data & Storage

- **Source data:** Team/Player/Season JSONs from `Imported from LMR-Jr/`
- **Output format:** Box Score JSON matching the `Box Score - Template.json` structure
- **Auto-save:** Browser local storage during the game (crash protection)
- **Export:** Download completed Box Score as a JSON file

---

## Tech Stack

**Recommendation: React + Vite**

Given the complexity of this app (real-time clock, two-team split view, 12+ players per side with live stat updates, undo history, substitution tracking, bonus calculations), a reactive framework is the right call. React handles the constant state changes cleanly.

- **React** — Component-based UI, reactive state updates
- **Vite** — Fast dev server, simple build tooling
- **No backend needed** — JSON file imports, local storage, file export
- **CSS** — Custom styles (matching DRMBL aesthetic if desired, or its own look)

---

## UI Screens / Views

1. **Home / Game Select** — Start a new game or resume a saved one
2. **Pre-Game Setup** — Team selection → attendance → numbers → starters
3. **Tip-Off** — Final pre-game screen before clock starts
4. **Live Game** — The main scorekeeping interface (split-screen, action bar, clock, rosters)
5. **Box Score Summary** — Post-game review of the full box score before export
6. **Export** — Download the Box Score JSON

---

## Open Questions — Resolved

- [x] Button layout / organization — defined (see Button Layout section)
- [x] Should the tip-off interface track which team wins the jump ball? — Yes, scorekeeper picks which team won tip-off to establish possession
- [x] Jump Ball — swaps alternating possession arrow, lives in center divider

---

## Open Questions — Needs Discussion

### Game Flow

**1. Substitution Flow** — RESOLVED
Pressing "Substitution" transitions that team's half into a substitution UI:
- **Left side** of the half shows **On-Court** players
- **Right side** of the half shows **On-Bench** players
- Tap a player on either side to highlight them, then tap a player on the opposite side to swap them
- Example: Tap LeBron James (on-court) → highlighted → Tap Shane Battier (on-bench) → they exchange places
- Works in either direction (can start from bench or court side)
- Can perform multiple swaps before exiting the substitution UI

**2. End of Quarter / Half** — RESOLVED
- Clock auto-stops when it hits 0:00
- Scorekeeper manually advances to the next period
- Fouls and bonus reset based on game settings (configurable per period structure)
- **Important:** The app must support both **quarter-based** (4 quarters) and **half-based** (2 halves) game formats. This is a game setting.

**3. Halftime / Between Periods** — RESOLVED
- Nothing special — same flow as any period transition
- A countdown timer displays the break time so the scorekeeper knows how long until the next period
- Break times are configurable in game settings (between quarters, halftime, before OT — all independently malleable)

**4. Overtime Trigger** — RESOLVED
- Scorekeeper manually triggers overtime (no auto-detection)

**5. End of Game** — RESOLVED
- Scorekeeper manually ends the game (no auto-detection)
- Transitions to Box Score Summary → Export

**6. Foul-Out** — RESOLVED
- Foul-out limit is configurable in game settings (malleable)
- When a player reaches the limit, the UI notifies the scorekeeper and forces a substitution before any further actions can be taken
- The fouled-out player cannot re-enter the game

**7. Bonus Threshold** — RESOLVED
- All bonus settings are configurable in game settings (malleable)
- Must support:
  - **Bonus (1-and-1)** — threshold is configurable (e.g., 7 team fouls per period)
  - **Double bonus** — threshold is configurable (e.g., 10 team fouls per period)
- Thresholds apply per period and adapt to the period format (quarters or halves)
- The foul count that triggers each level is independently settable

**8. Timeout Sub-Types** — RESOLVED
- Scorekeeper presses "Timeout" → picks Full or Short
- Number of each type available per team is configurable in game settings (malleable)
- Duration of each type is configurable in game settings (malleable)
- When a timeout is selected:
  - Game clock stops automatically
  - A timeout countdown clock appears with the duration of the chosen type
  - When the timeout clock runs out, the scorekeeper is notified
- Remaining timeouts are tracked and displayed per team

### UI / Layout

**9. Player Roster Placement**
Where do the player names/numbers/stats sit on each team's half — above the action buttons, below them, or beside them?

**10. Scoreboard Placement**
Where does the main scoreboard live (team names, total scores, clock display, quarter indicator)? Top of screen? In the center divider? Spanning full width?

**11. Possession Arrow Display**
Where does the possession arrow show visually? In the center divider near the clock? As an indicator on the team that has possession?

**12. Per-Quarter Score Display**
Where does the quarter-by-quarter score breakdown show? Always visible? Or available on demand (e.g., tap the score to expand)?

### Gameplay Logic / Auto-Actions

**13. Offensive Foul → Turnover?** — RESOLVED
- Yes, offensive foul auto-counts as a turnover for that player + change of possession
- Foul recording structure updated — `personal` becomes a nested object:
  ```json
  "fouls": {
      "personal": {
          "total": 3,
          "offensive": 1
      },
      "technical": 0,
      "flagrant": 0
  }
  ```
- Non-offensive personal foul: only `personal.total` increments
- Offensive foul: `personal.total` increments AND `personal.offensive` increments AND a turnover is auto-added
- `personal.total` is what's checked against the foul-out limit
- **Note:** This is a change from the current Box Score Template where `personal` is a flat integer — template will need updating

**14. Block → Missed Shot?** — RESOLVED
- When a Block is recorded (defensive player selected), the app does **not** auto-register anything — instead it uses **visual hints (glowing buttons)** to guide the scorekeeper through the natural sequence
- **Step 1:** Scorekeeper taps Block → selects the defender who blocked it
- **Step 2:** The **2pt Miss** and **3pt Miss** buttons on the **opposite team's** side glow, prompting the scorekeeper to record who missed the shot and from where
- **Step 3:** After the miss is recorded, the **Rebound** buttons on **both teams** glow, along with the **Stop Clock** button — because whoever grabs a blocked shot gets a rebound, but if no one grabs it the ball likely went out of bounds (requiring a clock stop)
- **Important:** Glowing buttons are **advisory, not mandatory** — the scorekeeper is never locked into a specific action. If multiple things happen at once, they can record events in whatever order they need. The glow is there to guide intuitive use, not enforce a sequence

**15. Steal ↔ Turnover Relationship** — RESOLVED
- Steals and turnovers are **bidirectionally linked** via visual hints — the scorekeeper can start from either side
- **Turnover has a sub-menu** with two source options: **Steal** or **Player Error**

**Flow A — Starting from Steal (defensive side):**
- Scorekeeper taps Steal → selects the defensive player who stole the ball
- The **Turnover** button on the **opposite team's** side glows, guiding the scorekeeper to record who turned it over

**Flow B — Starting from Turnover (offensive side):**
- Scorekeeper taps Turnover → sub-menu: **Steal** or **Player Error**
- Selects the player who turned it over
- If **Player Error** was selected → **clock auto-stops** (ball is dead — out of bounds, traveling, etc.)
- If **Steal** was selected → the **Steal** button on the **opposite team's** side glows, guiding the scorekeeper to record who stole the ball (clock does NOT auto-stop — play continues with the other team)

- **Important:** All glowing is **advisory, not mandatory** — the scorekeeper can record events in any order they need

**16. And-1 Situations** — RESOLVED
- Dedicated **And-1 button** in the scoring section of each team's action panel
- The And-1 flow is a **forced sequence** (not advisory — scorekeeper must complete all steps):
  1. Scorekeeper taps **And-1**
  2. Pick the **shot type**: 2pt or 3pt
  3. Pick the **player who made the shot** (offensive team)
  4. Pick the **foul type** committed by the defender (Personal / Flagrant)
  5. Pick the **player who committed the foul** (defensive team)
- The app auto-records: made shot + points for the shooter, foul for the defender
- After the And-1 sequence completes, the scorekeeper still needs to manually record the **free throw attempt** (1pt Made or 1pt Missed) as a separate action — since that happens after a stoppage

### General

**17. Visual Design Direction**
Should this match the DRMBL site aesthetic (dark theme with orange/gold accents) or have its own standalone look?

**18. DRMBL Live-Game Connection** — DEFERRED
- Not a concern for now — this app is focused entirely on stat-tracking
- Live-game data sync to the DRMBL website's `live-game.html` page will be revisited later as a separate effort

---

## Notes

- The Box Score Template has 12 `inGame` player slots per team — this is the max roster for a game
- Percentages are stored as whole numbers (e.g. `45` for 45%), UI appends `%`
- Minutes played stored as decimal (8min 45sec = `8.75`)
- Bonus threshold is the activation count — the *next* foul after that count triggers free throws (e.g., `doubleBonus: 5` means the 6th foul sends them to the line)
- Plus/minus requires tracking which 5 players are on court and the score differential while they're in
