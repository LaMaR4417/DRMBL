# Brain Dump — DRMBL Site Pending Work

Running list of pending items from brain-dump sessions. Update statuses as work progresses. Items in priority order under each section.

## Active priority queue (DRMBL site)

| # | Item | Status | Notes |
|---|------|--------|-------|
| 1 | **Box Score page** — polish/build out | Pending | Currently basic. Foundation for #2. |
| 2 | **Schedule → Box Score deep link** | ✓ Done (2026-04-27) | DRMBL only. Completed games (with `boxScoreID`) get a `game-card-clickable` class + delegated handler navigating to `/box-scores?id=<boxScoreID>`. Honors ctrl/cmd-click + middle-click for new-tab. LOMBA / Copa Beta untouched. |
| 3 | **Player stats corrections** | DONE (Week 1) — see "Stat correction notes" below | All 3 teams (Wonderland, Reapers, Heat) corrected for Week 1. New corrections will appear here as they come up. |
| 4 | **Stats page** | ✓ Done (2026-04-27) | New `Season Stats` Cosmos container (one doc per season) populated by `recomputeSeasonStats` helper. `/api/stats` endpoint reads it. Frontend: 2K-style top-5 leaderboard cards (6 player + 6 team) on landing; click → sortable data grid with stat tabs, team filter, player search, sortable column headers, URL state. Mobile-responsive (PC-first). end-game.js auto-recomputes on every game save. |
| 5 | **Owner page** | ⏸ Stubbed (hidden from nav 2026-04-27) | Page still exists at `/owner.html` as old placeholder; no public entry point. Revisit when there's a defined use case (admin actions, "Meet the Captains" content, etc). |
| 6 | **Free Agents page** | ⏸ Stubbed | Doesn't exist yet, won't be built until there's an actual need. Revisit if league movement / free-agent activity becomes worth surfacing. |

## Cross-cutting work (affects multiple pages/data)

| Item | Status | Notes |
|------|--------|-------|
| **Box-score naming convention (DRMBL)** | ✓ Done (2026-04-27) | New format `[league].[seasonSlug].[home_vs_away].[date]` e.g. `DRMBL.Mens_Open_Spring_2026.Wonderland_vs_DR_Elite.2026-04-26`. Plus structured top-level fields `leagueID`, `seasonID`, `homeTeamID`, `awayTeamID`, `gameDate`, `gameTimestamp` for Cosmos queries. Helper at `api/_lib/boxScoreId.js`. Wired into `api/end-game.js` for new saves. 4 existing DRMBL box scores migrated + season doc references updated. LOMBA / Copa Beta out of scope (regional ESPN site work). |

## Future / out-of-scope (do NOT do here)

| Item | Notes |
|------|-------|
| **Site split: DRMBL-pure + regional ESPN site** | Eventually this codebase becomes DRMBL-only. Multi-league content (Copa Beta, LOMBA) moves to a separate "regional ESPN" site. **Rule:** when working on shared code, flag whether a fix is DRMBL-pure (do here), shared infra (do here, note migration cost), or other-league only (probably wait — about to throw away). |

## Completed (recent)

| Item | When | Notes |
|------|------|-------|
| Standings recompute (doubleheader, percentages, H2H, T-N rank) | 2026-04-27 | See [DRMBL-STANDINGS-LOGIC.md](DRMBL-STANDINGS-LOGIC.md). |
| Wonderland 0W 2L → 0W 1.5L correction | 2026-04-27 | Doubleheader protection for 2nd game (vs Del Rio Heat). |
| Wonderland stat-routing fix (Big Fabian, Mateo) | 2026-04-27 | Created 2 new player docs ($84, $85), added to roster, swapped Juan/Memo buckets in both Week 1 box scores. Established local-workspace + push-to-Cosmos pattern for multi-doc fixes. |
| The Reapers stat-routing fix (Alex/Angel/Trey) | 2026-04-27 | Internal swaps + 1 new player ($86 Trey, last name TBD). Required chain-protection (break-after-first-match) since swaps formed a cycle. Established `refresh-backups.js` pattern for keeping snapshot honest after partial pushes. |
| Del Rio Heat shot-type rebalance (Mat, Cam) | 2026-04-27 | Within-player shot bucket reassignment (3PT↔2PT). No roster/player changes. Team total preserved by mirror-swap design. |
| Box-score winner highlight (gold, schedule-style) | 2026-04-27 | Detail scoreboard + game-card list now use `var(--court-wood)` for winners, matching schedule page. |
| Box-score naming convention rename (DRMBL) | 2026-04-27 | All 4 DRMBL Week 1 box scores renamed to new `[league].[season].[home_vs_away].[date]` format. Added structured query fields. Established `push-workspace.js` (with DELETE support) and discovered SDK quirk: deleted docs return `{resource: undefined}` not 404. |
| Schedule → Box Score deep link (DRMBL) | 2026-04-27 | Completed schedule games are now clickable, navigate to `/box-scores?id=<boxScoreID>`. Includes hover style + ctrl/cmd/middle-click new-tab support. |
| Box-score deep-link race fix | 2026-04-27 | Fixed bug where opening a box score from a schedule deep link would flash briefly then revert — async summaries fetch was clobbering URL-set selection. |
| Stats page (DRMBL) | 2026-04-27 | New Cosmos `Season Stats` container, `recomputeSeasonStats` helper, `/api/stats` endpoint, 2K-style leaderboards landing + sortable detail grid. End-game.js auto-recomputes on each save. |

## Stat correction notes (item #3)

### Wonderland — DONE (2026-04-27)
- Big Fabian = "Fabian Hernandez" (uniqueNumber 84), Mateo = "Mateo Lopez" (uniqueNumber 85)
- Both registered as new player docs; added to Wonderland team roster (9 → 11)
- Juan González + Memo Diego buckets swapped in both Week 1 box scores (kept their jersey numbers as worn by Big Fabian / Mateo)
- Approach: NOT removed from inGame — instead the slot's playerID/name was reassigned to the real player. Stats stay in place.
- (Decision deviation from original plan: rather than removing Juan/Memo from inGame and re-adding Big Fabian/Mateo, we did in-place replacement to preserve slot order. Juan/Memo remain on team roster since they're still registered teammates.)

### The Reapers — DONE (2026-04-27)
- (Originally misnoted as "Air Ballers" — corrections were on The Reapers' side of the Air Ballers game)
- Mostly *internal* swaps, not new registrations:
  - Andre Ruben Navarro bucket (#7, 14 pts) → real player **Alex Melendez** (already registered)
  - Alex Melendez bucket    (#5, 10 pts) → real player **Angel Contreras** (already registered)
  - Elijah Maltos bucket   (#11, 2 pts)  → **Trey** (new player, last name TBD — placeholder ID `Trey_Unknown$86`)
- **Chain protection critical**: had to add `break` after first match per slot in the swap loop, otherwise Andre→Alex→Angel cascade would land everything as Angel.
- Andre + Elijah remain on roster (still registered teammates, just didn't play); Trey added (12 → 13).

### Del Rio Heat — DONE (2026-04-27)
- Within-player shot-type rebalance (no roster touched, no players created)
- Mat #14: 24 → 23 pts; 2PT 9/12 (75%) → 10/13 (77%); 3PT 2/3 (67%) → 1/2 (50%); FG 11/15 unchanged
- Cam #4:  15 → 16 pts; 2PT 6/8 (75%) → 5/7 (71%); 3PT 1/3 (33%) → 2/4 (50%); FG 7/11 unchanged
- Team total preserved at 64 (within-team swaps cancel)
- Approach: ADJUSTMENTS array with `sourceBucket → destBucket` semantics; missed = attempted-made invariant means the "missed" field self-preserves when made AND att both move by 1.

## Workspace context (current session)

Active workspace for the Wonderland fix: `f:/tmp/drmbl-workspace-2026-04-27T17-37-20-011Z/`
- `backups/` — pristine copies, restore source
- `working/` — local edits, push to Cosmos when done
- See [DRMBL-STANDINGS-LOGIC.md](DRMBL-STANDINGS-LOGIC.md) for restore patterns and helper-script docs

## How to use this doc

- New brain-dump items: add to the top of the relevant section
- Status changes: update the Status column inline
- When item is done: move row to "Completed" with date + brief notes
- Don't let "Completed" balloon — prune to last 90 days quarterly
