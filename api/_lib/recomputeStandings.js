// DRMBL + Copa Beta standings recompute. Called by api/end-game.js
// after a game is saved, and by the one-shot fix script.
//
// (Removed 2026-06-02: the DRMBL doubleheader half-loss rule. Wonderland was
// the only team that ever got a doubleheader and the user asked for it to
// count as full losses. `losses` now equals `pureLosses` for every team; the
// field is kept around so downstream consumers don't break.)
//
// Tiebreaker chain: wins desc → losses asc → pointDiff desc → H2H wins
// within tied group (regular-season games only). Truly-tied entries
// share a rank and get tied=true so the renderer can show "T-2".
//
// Returns the sorted standings array. Each entry:
//   { slot, name, wins, losses, pureLosses, pointDiff, wlPct, purePct, rank, tied }

function parseTime(timeStr) {
    if (!timeStr) return 0;
    var match = timeStr.match(/^(\d+):(\d+)\s*(AM|PM)$/i);
    if (!match) return 0;
    var h = parseInt(match[1], 10);
    var m = parseInt(match[2], 10);
    var period = match[3].toUpperCase();
    if (period === "PM" && h !== 12) h += 12;
    if (period === "AM" && h === 12) h = 0;
    return h * 60 + m;
}

function makeEntry(slot, name) {
    return {
        slot: slot,
        name: name,
        wins: 0,
        losses: 0,
        pureLosses: 0,
        pointDiff: 0,
        wlPct: null,
        purePct: null,
        rank: 0,
        tied: false
    };
}

// Walk reg-season games and return a flat array of completed ones,
// each annotated with the slot of the winner and loser.
function gatherCompletedRegularGames(seasonDoc, standingsMap) {
    var out = [];
    if (seasonDoc.weeklySchedule) {
        for (var wi = 0; wi < seasonDoc.weeklySchedule.length; wi++) {
            var wk = seasonDoc.weeklySchedule[wi];
            if (wk.type === "seeded" || wk.type === "playoffs") continue;
            var games = wk.games || [];
            for (var gi = 0; gi < games.length; gi++) {
                var g = games[gi];
                if (!g.winner || g.winner === "") continue;
                var hEntry = standingsMap[g.home];
                var aEntry = standingsMap[g.away];
                if (!hEntry || !aEntry) continue;
                var winnerSlot = (g.winner === hEntry.name) ? g.home : g.away;
                var loserSlot = (winnerSlot === g.home) ? g.away : g.home;
                out.push({ winnerSlot: winnerSlot, loserSlot: loserSlot });
            }
        }
    }
    if (seasonDoc.games) {
        for (var rgi = 0; rgi < seasonDoc.games.length; rgi++) {
            var rg = seasonDoc.games[rgi];
            if (rg.round) continue;
            if (!rg.winner || rg.winner === "") continue;
            var h2 = standingsMap[rg.home];
            var a2 = standingsMap[rg.away];
            if (!h2 || !a2) continue;
            var ws = (rg.winner === h2.name) ? rg.home : rg.away;
            var ls = (ws === rg.home) ? rg.away : rg.home;
            out.push({ winnerSlot: ws, loserSlot: ls });
        }
    }
    return out;
}

// Apply H2H tiebreaker within groups tied on (wins, losses, pointDiff).
// Mutates standingsArr in place. Re-sorts each tied group by mini H2H wins.
function applyH2HTiebreaker(standingsArr, completedGames) {
    var i = 0;
    while (i < standingsArr.length) {
        var j = i + 1;
        while (j < standingsArr.length
            && standingsArr[j].wins === standingsArr[i].wins
            && standingsArr[j].losses === standingsArr[i].losses
            && standingsArr[j].pointDiff === standingsArr[i].pointDiff) {
            j++;
        }
        if (j - i >= 2) {
            // Tied group from i..j-1 — compute mini H2H wins among these slots
            var slotSet = {};
            for (var k = i; k < j; k++) slotSet[standingsArr[k].slot] = true;

            var h2hWins = {};
            for (var ki = i; ki < j; ki++) h2hWins[standingsArr[ki].slot] = 0;

            for (var ci = 0; ci < completedGames.length; ci++) {
                var cg = completedGames[ci];
                if (slotSet[cg.winnerSlot] && slotSet[cg.loserSlot]) {
                    h2hWins[cg.winnerSlot]++;
                }
            }

            var group = standingsArr.slice(i, j);
            group.sort(function (a, b) {
                return h2hWins[b.slot] - h2hWins[a.slot];
            });
            // Stash mini-H2H on entries so rank assignment can detect resolution
            for (var gi2 = 0; gi2 < group.length; gi2++) {
                group[gi2]._h2hWins = h2hWins[group[gi2].slot];
            }
            for (var ki2 = 0; ki2 < group.length; ki2++) {
                standingsArr[i + ki2] = group[ki2];
            }
        }
        i = j;
    }
}

// Walk sorted array, assign rank (skip-convention) and tied flag.
// Two consecutive entries are considered tied iff every sort field matches —
// (wins, losses, pointDiff, _h2hWins). _h2hWins differing means H2H separated them.
function assignRanksAndTies(standingsArr) {
    for (var i = 0; i < standingsArr.length; i++) {
        if (i === 0) {
            standingsArr[i].rank = 1;
        } else {
            var prev = standingsArr[i - 1];
            var curr = standingsArr[i];
            var sameRecord = prev.wins === curr.wins
                && prev.losses === curr.losses
                && prev.pointDiff === curr.pointDiff;
            var sameH2H = (prev._h2hWins || 0) === (curr._h2hWins || 0);
            if (sameRecord && sameH2H) {
                curr.rank = prev.rank;
            } else {
                curr.rank = i + 1; // skip convention
            }
        }
    }

    // Mark tied flags + clean up internal field
    var rankCounts = {};
    for (var ri = 0; ri < standingsArr.length; ri++) {
        var r = standingsArr[ri].rank;
        rankCounts[r] = (rankCounts[r] || 0) + 1;
    }
    for (var ti = 0; ti < standingsArr.length; ti++) {
        standingsArr[ti].tied = rankCounts[standingsArr[ti].rank] > 1;
        delete standingsArr[ti]._h2hWins;
    }
}

function recomputeStandings(seasonDoc) {
    var standingsMap = {};
    var teams = seasonDoc.teams || [];
    for (var ti = 0; ti < teams.length; ti++) {
        var t = teams[ti];
        if (t.teamID) standingsMap[t.slot] = makeEntry(t.slot, t.name);
    }

    // ── DRMBL path: walk weeklySchedule games and credit W/L + pointDiff ──
    if (seasonDoc.weeklySchedule) {
        for (var wi = 0; wi < seasonDoc.weeklySchedule.length; wi++) {
            var wk = seasonDoc.weeklySchedule[wi];
            if (wk.type === "seeded" || wk.type === "playoffs") continue;
            var games = wk.games || [];

            for (var gi = 0; gi < games.length; gi++) {
                var ag = games[gi];
                if (!ag.winner || ag.winner === "") continue;
                var hEntry = standingsMap[ag.home];
                var aEntry = standingsMap[ag.away];
                if (!hEntry || !aEntry) continue;

                var hs = ag.homeScore || 0;
                var as = ag.awayScore || 0;
                var winnerSlot = (ag.winner === hEntry.name) ? ag.home : ag.away;
                var loserSlot = (winnerSlot === ag.home) ? ag.away : ag.home;
                var winnerEntry = standingsMap[winnerSlot];
                var loserEntry = standingsMap[loserSlot];

                winnerEntry.wins++;
                loserEntry.pureLosses++;
                loserEntry.losses++;

                hEntry.pointDiff += (hs - as);
                aEntry.pointDiff += (as - hs);
            }
        }
    }

    // ── Copa Beta path: flat games[] (no doubleheader logic) ──
    if (seasonDoc.games) {
        for (var rgi = 0; rgi < seasonDoc.games.length; rgi++) {
            var rg = seasonDoc.games[rgi];
            if (rg.round) continue; // skip playoff rounds — handled elsewhere
            if (!rg.winner || rg.winner === "") continue;
            var h2 = standingsMap[rg.home];
            var a2 = standingsMap[rg.away];
            if (!h2 || !a2) continue;

            var hs2 = rg.homeScore || 0;
            var as2 = rg.awayScore || 0;
            if (rg.winner === h2.name) {
                h2.wins++;
                a2.losses++;
                a2.pureLosses++;
            } else {
                a2.wins++;
                h2.losses++;
                h2.pureLosses++;
            }
            h2.pointDiff += (hs2 - as2);
            a2.pointDiff += (as2 - hs2);
        }
    }

    var standingsArr = Object.values(standingsMap);

    // Pre-compute percentages (null when no games played → renderer shows '--')
    for (var ei = 0; ei < standingsArr.length; ei++) {
        var e = standingsArr[ei];
        var protectedDenom = e.wins + e.losses;
        var pureDenom = e.wins + e.pureLosses;
        e.wlPct = protectedDenom > 0 ? e.wins / protectedDenom : null;
        e.purePct = pureDenom > 0 ? e.wins / pureDenom : null;
    }

    // Primary sort: wins desc → losses (protected) asc → pointDiff desc
    standingsArr.sort(function (a, b) {
        if (b.wins !== a.wins) return b.wins - a.wins;
        if (a.losses !== b.losses) return a.losses - b.losses;
        return b.pointDiff - a.pointDiff;
    });

    // H2H tiebreaker within tied groups, then rank + tied flags
    var completedGames = gatherCompletedRegularGames(seasonDoc, standingsMap);
    applyH2HTiebreaker(standingsArr, completedGames);
    assignRanksAndTies(standingsArr);

    return standingsArr;
}

module.exports = { recomputeStandings };
