# DRMBL Standings — Recompute Logic Reference

Reference doc for debugging W/L issues, percentages, ranking, doubleheader
protection, or anything else standings-related on the DRMBL page.

## Where the logic lives

| Layer | File | Role |
|-------|------|------|
| Helper | `api/_lib/recomputeStandings.js` | Pure function that rebuilds the standings array from the season doc. Single source of truth for all computation (doubleheader, percentages, H2H, rank, tied). |
| Save endpoint | `api/end-game.js` (~L424) | After a game is saved, calls `recomputeStandings(seasonDoc)` and writes the result to `seasonDoc.standings` before persisting to Cosmos. |
| Renderer | `js/standings.js` (`buildDRMBLStandingsTable`) | **Dumb.** Reads pre-computed fields from each standings entry and drops them in cells. Only "logic" is `.toFixed(3)` for percentage formatting. |
| Styles | `css/standings.css` (`.drmbl-table`) | Column widths + alignment for W / L / WL% / P-WL% / +/-. |

The DRMBL save flow goes:
- `drmbl-recorder/full` (and the legacy `tracker/`) → `POST /api/end-game` → `recomputeStandings()` → Cosmos `Seasons` container

LOMBA does NOT use this path — LOMBA has its own endpoint (`api/lomba.js`) and computes standings client-side.

## Standings entry shape (stored in `seasonDoc.standings[]`)

```js
{
  slot,         // "A".."H"
  name,         // team display name
  wins,         // integer
  losses,       // protected — half-loss applied for 2nd doubleheader-week game
  pureLosses,   // raw count, no protection (display + Pure WL%)
  pointDiff,    // always full (protection does NOT apply to +/-)
  wlPct,        // wins / (wins + losses)  — float 0..1, or null if 0 games
  purePct,      // wins / (wins + pureLosses) — float 0..1, or null if 0 games
  rank,         // integer, may be shared if tied
  tied          // true if rank is shared with at least one other entry
}
```

## Doubleheader protection rule

When a team plays twice in a single week (same `weeklySchedule[i]` entry,
2+ games with their slot), the chronologically-second loss counts as
**0.5** instead of 1.0. The first game's loss is full. Wins always full.
Point differential always full.

Detection: per week, count slot occurrences in `games[]`. Sort games
chronologically by `time`. Track per-slot running counter. If the loser's
slot count for the week is ≥2 and this is their 2nd appearance, the loss
is protected.

## Tiebreaker chain (in order)

1. Wins desc
2. Losses asc (uses protected `losses`, not `pureLosses`)
3. Point differential desc
4. Head-to-head wins (regular-season only) — applied within each tied group
5. Truly tied → entries share a `rank` and get `tied = true` → renderer shows "T-2"

3+ team groups with circular H2H (A>B, B>C, C>A) stay tied — no further resolution.

## Common W/L issues — first things to check

**Wonderland (or any team) shows wrong losses count**
- Look at `weeklySchedule[i].games[]` for the week in question. Did the team appear twice?
- Was the chronologically-2nd game's loss the one that should be 0.5?
- Run the dry-run script (below) to see what the helper computes vs what's stored.

**Standings array exists but missing the new fields (`pureLosses`, `wlPct`, etc.)**
- The doc was last updated by old code, or no game has been saved since the helper was deployed.
- Fix: run the recompute apply script.

**Renderer shows "--" for percentages**
- The entry doesn't have `wlPct` / `purePct` set — usually means stale doc.
- Renderer treats `null` and `undefined` as "--" intentionally (e.g., team with 0 games played).

**Sort order looks wrong**
- Verify `losses` field on each entry — sort uses protected losses, NOT pure.
- Two teams with identical (wins, losses, pointDiff) but H2H played: H2H winner ranks above. If they haven't played, both stay tied at T-N.

**T-N rank not appearing for tied teams**
- Check that entries actually have `tied: true`. If false, the helper considered them separated (likely by H2H).
- Verify the relevant H2H game has `winner` set on the schedule game.

## Manual scripts (in f:/tmp — regenerate if missing)

All scripts read `f:/Claude Code Projects/Basketball/.env.local` for Cosmos creds.

### Dry-run recompute (compare stored vs. fresh)
```
node f:/tmp/recompute-now.js
```
Shows BEFORE/AFTER tables and a diff. Does NOT write.

### Apply recompute
```
node f:/tmp/recompute-now.js --apply
```
Writes the fresh standings back to Cosmos.

### Snapshot before risky changes
```
node f:/tmp/snapshot-drmbl.js
```
Saves the entire active DRMBL season doc to `f:/tmp/drmbl-snapshot-<timestamp>.json`.

### Restore from snapshot
```
node f:/tmp/restore-drmbl.js <snapshot-path>          # dry-run
node f:/tmp/restore-drmbl.js <snapshot-path> --apply  # actually restore
```

### Read live season doc + scan for doubleheader weeks
```
node f:/tmp/fetch-drmbl-season.js
```
Lists every week, marks doubleheader weeks (slot appearing 2+ times), and shows each game's status.

## If a script is missing or broken

The logic is fully reproducible from `api/_lib/recomputeStandings.js`. To regenerate:

1. Show this file to the agent: `DRMBL-STANDINGS-LOGIC.md`
2. Reference the helper at `api/_lib/recomputeStandings.js`
3. Ask the agent to rebuild whichever script is missing — they all follow the same pattern: load env from `.env.local` (handle the Vercel-CLI quote/`\n` quirk), instantiate `CosmosClient`, query `Leagues` for `id='DRMBL'` to get `activeSeason`, then read/write `Seasons` container.

## What the helper does NOT do

- Does NOT update individual team docs in the `Teams` container — `end-game.js` does that separately (see `updateTeamRecord`).
- Does NOT touch playoff games (`week.type === 'seeded'` or `'playoffs'` are skipped).
- Does NOT apply doubleheader protection to point differential.
- Does NOT mutate the input `seasonDoc` — returns a new sorted array; caller assigns to `seasonDoc.standings`.

## Active season

The "active" DRMBL season is identified by `Leagues['DRMBL'].league.activeSeason`.
As of last edit: `DRMBL - Men's Open - Spring 2026`. Always read this dynamically — do not hardcode the season ID.
