# Currently Pending Work — Stat Tracker App

## 1. TipOffScreen Two-Step Flow (Manual Mode)

**File:** `src/screens/TipOffScreen.jsx`

When `settings.tipOff.possessionRule === 'manual'`:
- **Step 1:** "Who wins the tip?" → sets `tipOffWinner`
- **Step 2:** "Who gained possession?" → sets `firstPossession`
- The team that did NOT gain first possession gets the possession arrow

When `settings.tipOff.possessionRule === 'tipWinner'` (DRMBL Default):
- Single step: tip winner = first possession automatically
- Possession arrow goes to the other team (tip loser)

---

## 2. boxScore.js — Use firstPossession

**File:** `src/data/boxScore.js`

Currently lines 157-158 use `gameState.tipOffWinner` for possession initialization:
```js
possession: gameState.tipOffWinner,
possessionArrow: gameState.tipOffWinner === 'home' ? 'away' : 'home',
```

**Change to:**
```js
possession: gameState.firstPossession,
possessionArrow: gameState.firstPossession === 'home' ? 'away' : 'home',
```

---

## 3. Sub-Header UI (Team Fouls, Bonus, Possession)

**File:** `src/screens/GameScreen.jsx`

Add a mirrored bar below the scoreboard showing per-side:
- **Team Fouls** — read from `stats.fouls.perQuarter[currentQuarterKey].committed`
- **Bonus** — derived: team foul count >= `settings.fouls.bonus.oneAndOne` threshold (if set)
- **Double Bonus** — derived: team foul count >= `settings.fouls.bonus.doubleBonus` threshold (if set)
- **Possession Indicator** — read from `boxScore.gameInfo.state.possession`

Layout mirrored: Home stats on left, Away stats on right.

DRMBL Default thresholds:
- `fouls.bonus.perPeriod: true` (fouls reset per quarter)
- `fouls.bonus.oneAndOne: null` (1-and-1 is OFF)
- `fouls.bonus.doubleBonus: 5` (double bonus at 5 team fouls per period)
- `fouls.foulOutLimit: 5`

---

## 4. CSS — Sub-Header & Setting Hint

**File:** `src/index.css`

- Add `.game-subheader` styles (mirrored bar layout, team fouls, bonus badges, possession dot)
- Add `.setting-hint` styles (used in GameSettingsScreen Tip-Off card)

---

## 5. Wire Up JUMP BALL Button

**File:** `src/screens/GameScreen.jsx`

The JUMP BALL button (currently `/* TODO */`) needs to dispatch:
```js
dispatch({ type: 'JUMP_BALL' })
```

The `JUMP_BALL` reducer action already exists in GameContext.jsx — it awards possession per the current arrow and flips the arrow.

---

## 6. Phase 2 — Stat Dispatching

**File:** `src/screens/GameScreen.jsx` + `src/context/GameContext.jsx`

Currently `// TODO: dispatch stat actions in Phase 2` at GameScreen.jsx line ~134.

Stats to wire up with new reducer actions:
| Stat | Player Fields | Team Fields |
|------|--------------|-------------|
| Rebound (OFF) | `rebounds.offensive`, `rebounds.total` | `rebounds.offensive`, `rebounds.total` |
| Rebound (DEF) | `rebounds.defensive`, `rebounds.total` | `rebounds.defensive`, `rebounds.total` |
| Assist | `offense.assists` | `assists` |
| Steal | `defense.steals` | `defense.steals` |
| Block | `defense.blocks` | `defense.blocks` |
| Turnover | `general.turnovers` | `turnovers` |
| Foul (Personal) | `general.fouls.personal.total` | `fouls.total`, `fouls.perQuarter[q].committed` |
| Foul (Offensive) | `general.fouls.personal.offensive` | Same as personal |
| Foul (Technical) | `general.fouls.technical` | — |
| Foul (Flagrant) | `general.fouls.flagrant` | — |

Also needed:
- Foul-out detection (player reaches `foulOutLimit`)
- Bonus/Double Bonus state updates in `fouls.perQuarter[q].opponentInBonus`
- Technical ejection detection (player reaches `technicalEjectionLimit`)

---

## 7. Future Phases (Not Yet Planned)

- Substitutions (bench ↔ court)
- Timeouts (use/remaining tracking, auto-stoppage)
- Auto-stoppages per settings
- And-1 flow (made shot + foul)
- Plus/Minus tracking
- Minutes Played tracking
- Undo system (action log + replay)
- End Game / Export box score
