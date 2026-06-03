// L3X3 (LOMBA 3x3) API endpoint. Independent from api/lomba.js — only shares
// the Cosmos containers. Actions: GET season, GET team, POST save-game.

var { CosmosClient } = require("@azure/cosmos");

var client = new CosmosClient({
    endpoint: process.env.COSMOS_ENDPOINT,
    key: process.env.COSMOS_KEY,
});

var database = client.database("DRMBL Database");
var seasonsContainer = database.container("Seasons");
var teamsContainer = database.container("Teams");
var playersContainer = database.container("Players");
var boxScoresContainer = database.container("Box Scores");

var SEASON_ID = "L3X3 - Varonil Libre - 2026";
var LEAGUE_ID = "L3X3";

// ── helpers ──

function asciiSlug(s) {
    return s.normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[''`"]/g, "").trim();
}
function teamSlug(name) { return asciiSlug(name).replace(/\s+/g, "_"); }
function seasonSlug(seasonId) {
    return seasonId.replace(/^L3X3 - /, "").replace(/[''`]/g, "").replace(/ - /g, "_").replace(/\s+/g, "_");
}
function makeBoxScoreID(seasonId, homeName, awayName, gameDate) {
    return ["L3X3", seasonSlug(seasonId), teamSlug(homeName) + "_vs_" + teamSlug(awayName), gameDate].join(".");
}
function mdyToISO(mdy, fallbackTs) {
    if (mdy) {
        var parts = mdy.split("/");
        if (parts.length === 3) {
            var m = parseInt(parts[0], 10), d = parseInt(parts[1], 10);
            var y = parts[2]; if (y.length === 2) y = "20" + y;
            return y + "-" + String(m).padStart(2, "0") + "-" + String(d).padStart(2, "0");
        }
    }
    if (fallbackTs) {
        var dt = new Date(fallbackTs);
        if (!isNaN(dt.getTime())) {
            var local = new Date(dt.getTime() - 6 * 60 * 60 * 1000);
            return local.getUTCFullYear() + "-" + String(local.getUTCMonth() + 1).padStart(2, "0") + "-" + String(local.getUTCDate()).padStart(2, "0");
        }
    }
    return null;
}
function addMinutes(timeStr, mins) {
    var parts = timeStr.split(":");
    var total = parseInt(parts[0], 10) * 60 + parseInt(parts[1], 10) + mins;
    var h = Math.floor(total / 60);
    var m = total % 60;
    return String(h).padStart(2, "0") + ":" + String(m).padStart(2, "0");
}
function dateGroupISO(dg) {
    return dg.date.year + "-" + String(dg.date.month).padStart(2, "0") + "-" + String(dg.date.date).padStart(2, "0");
}

async function persistJerseyNumbers(seasonId, boxScore) {
    var sides = ["home", "away"];
    for (var s = 0; s < sides.length; s++) {
        var side = sides[s];
        var teamSide = boxScore.teamInfo && boxScore.teamInfo[side];
        if (!teamSide) continue;
        var teamID = side === "home" ? boxScore.homeTeamID : boxScore.awayTeamID;
        var teamName = teamSide.name;
        var players = teamSide.players || [];
        for (var p = 0; p < players.length; p++) {
            var pl = players[p];
            if (!pl.playerID || !pl.number) continue;
            var num = parseInt(pl.number, 10);
            if (isNaN(num)) continue;
            try {
                var { resource: playerDoc } = await playersContainer.item(pl.playerID, pl.playerID).read();
                if (!playerDoc) continue;
                var teamRef = (playerDoc.teams || []).find(function (t) { return t.teamID === teamID && t.seasonID === seasonId; });
                if (!teamRef) {
                    if (!playerDoc.teams) playerDoc.teams = [];
                    playerDoc.teams.push({ name: teamName, teamID: teamID, seasonID: seasonId, leagueID: LEAGUE_ID, jerseyNumbers: [num] });
                } else {
                    if (!Array.isArray(teamRef.jerseyNumbers)) teamRef.jerseyNumbers = [];
                    if (teamRef.jerseyNumbers.indexOf(num) === -1) teamRef.jerseyNumbers.push(num);
                }
                await playersContainer.items.upsert(playerDoc);
            } catch (e) { /* skip on miss */ }
        }
    }
}

// ── Incremental queue-based advancement ──
//
// Each completed game pushes its winner + loser into bucket queues keyed by
// post-game record (e.g., "1-0", "0-1", "2-0", "1-1"). Eliminated teams (2
// losses) are skipped. Special R1 rule: the 3rd save's winner is diverted to
// cross-queue.w, and the 4th save's loser is diverted to cross-queue.l so
// the cross-pair completes early in R2.
//
// On each save, drain the queues: pair within same-record buckets and place
// each new game into the next chronological TBD slot at the appropriate
// round (overwriting isPlaceholder entries in place).

function recordKey(rec) { return (rec && (rec.wins + "-" + rec.losses)) || "0-0"; }

// Returns true if these two team IDs have already faced each other in any
// completed (non-placeholder) game in the season. Used by pair selection
// to avoid repeating matchups across rounds.
function havePlayedBefore(season, teamAID, teamBID) {
    if (!teamAID || !teamBID) return false;
    var found = false;
    (season.schedule || []).forEach(function (dg) {
        (dg.games || []).forEach(function (g) {
            if (g.isPlaceholder || !g.completion) return;
            var pair = [g.homeTeamID, g.awayTeamID];
            if (pair.indexOf(teamAID) !== -1 && pair.indexOf(teamBID) !== -1) found = true;
        });
    });
    return found;
}

// Play-in promotion: when a game with a `pendingPlayIn` dependency saves,
// fill in the pending entry's away (or home) slot with the just-saved game's
// winner. The pending entry was pre-baked with one team known (e.g. Lobos)
// and the other side waiting on a referenced game's outcome.
//
// pendingPlayIn entries carry a `playInDependsOn: { round, time, court }`
// reference identifying which scheduled game produces the partner.
function promotePendingPlayIns(season, savedGame) {
    if (!savedGame || (savedGame.winner !== "home" && savedGame.winner !== "away")) return 0;
    var winnerName = savedGame.winner === "home" ? savedGame.home : savedGame.away;
    var winnerID = savedGame.winner === "home" ? savedGame.homeTeamID : savedGame.awayTeamID;
    var winnerSeed = savedGame.winner === "home" ? savedGame.homeSeed : savedGame.awaySeed;
    var promoted = 0;
    (season.schedule || []).forEach(function (dg) {
        (dg.games || []).forEach(function (g) {
            if (!g.pendingPlayIn || !g.playInDependsOn) return;
            var dep = g.playInDependsOn;
            if (savedGame.round !== dep.round) return;
            if (savedGame.time !== dep.time) return;
            if (savedGame.court !== dep.court) return;
            // Fill the empty side (assume away is the pending side; if home is
            // null/empty, fill home instead).
            if (!g.homeTeamID) {
                g.home = winnerName;
                g.homeTeamID = winnerID;
                g.homeSeed = winnerSeed;
            } else {
                g.away = winnerName;
                g.awayTeamID = winnerID;
                g.awaySeed = winnerSeed;
            }
            g.pendingPlayIn = false;
            promoted++;
        });
    });
    return promoted;
}

function isRoundComplete(season, round) {
    var total = 0, done = 0;
    (season.schedule || []).forEach(function (dg) {
        (dg.games || []).forEach(function (g) {
            if (g.round !== round || g.isPlaceholder) return;
            total++;
            if (g.completion) done++;
        });
    });
    return total > 0 && done >= total;
}

function placeByeEntry(season, team, round) {
    // Byes are NO-RESULT entries: the team advances but no W is credited
    // to records, and PD is unaffected (computePD already skips g.bye === true).
    // We still mark completion: true so isRoundComplete() recognizes the slot
    // as accounted for.
    var slot = findNextTBD(season, round);
    if (!slot) return null;
    var dateISO = dateGroupISO(slot.dg);
    var newEntry = {
        id: ["L3X3", seasonSlug(season.id), teamSlug(team.name) + "_vs_Bye", dateISO].join("."),
        home: team.name,
        away: "Bye",
        homeTeamID: team.teamID,
        awayTeamID: null,
        homeSeed: team.seed,
        awaySeed: null,
        round: round,
        court: slot.entry.court,
        time: slot.entry.time,
        bucket: "bye",
        completion: true,
        winner: "",
        loser: "",
        homeScore: null,
        awayScore: null,
        forfeit: false,
        bye: true,
        boxScoreId: null,
    };
    Object.keys(slot.entry).forEach(function (k) { delete slot.entry[k]; });
    Object.assign(slot.entry, newEntry);
    return slot.entry;
}

function findNextTBD(season, round) {
    // Sort priority within a (date, time): by `fillPriority` if set on the
    // slot, otherwise by court ascending. fillPriority lets us hand-prefer
    // certain courts at certain times (e.g. 8pm C1, C2, C4 before C3).
    var best = null;
    function priority(g) { return typeof g.fillPriority === "number" ? g.fillPriority : (g.court || 99); }
    (season.schedule || []).forEach(function (dg) {
        var dateNum = dg.date ? (dg.date.year * 10000 + (dg.date.month || 0) * 100 + (dg.date.date || 0)) : 0;
        (dg.games || []).forEach(function (g) {
            if (!g.isPlaceholder || g.round !== round) return;
            var ts = (g.time || "23:59");
            var prio = priority(g);
            if (!best) { best = { dg: dg, entry: g, dateNum: dateNum, time: ts, prio: prio }; return; }
            if (dateNum < best.dateNum) { best = { dg: dg, entry: g, dateNum: dateNum, time: ts, prio: prio }; return; }
            if (dateNum > best.dateNum) return;
            if (ts < best.time) { best = { dg: dg, entry: g, dateNum: dateNum, time: ts, prio: prio }; return; }
            if (ts > best.time) return;
            if (prio < best.prio) { best = { dg: dg, entry: g, dateNum: dateNum, time: ts, prio: prio }; return; }
        });
    });
    return best ? { dg: best.dg, entry: best.entry } : null;
}

function fillTBD(season, slot, pair, round) {
    var dateISO = dateGroupISO(slot.dg);
    var newEntry = {
        id: makeBoxScoreID(season.id, pair.home.name, pair.away.name, dateISO),
        home: pair.home.name,
        away: pair.away.name,
        homeTeamID: pair.home.teamID,
        awayTeamID: pair.away.teamID,
        homeSeed: pair.home.seed,
        awaySeed: pair.away.seed,
        round: round,
        court: slot.entry.court,
        time: slot.entry.time,
        bucket: pair.bucket,
        completion: false,
        winner: "",
        loser: "",
        homeScore: null,
        awayScore: null,
        forfeit: false,
        boxScoreId: null,
    };
    Object.keys(slot.entry).forEach(function (k) { delete slot.entry[k]; });
    Object.assign(slot.entry, newEntry);
}

// ── Pure 1vN Swiss pairing (Day 2 logic) ──
//
// On each save, scan the schedule for all teams that completed games in the
// current round and are still alive. Filter out teams already in a scheduled
// next-round game. Rank remaining by current standings (W-L → PD), and
// greedy-pair them 1 vs N within the unpaired pool, skipping repeat matchups.
// Place pairs into the next chronological TBD slot for the next round.

function computePD(season) {
    var pd = {};
    (season.schedule || []).forEach(function (dg) {
        (dg.games || []).forEach(function (g) {
            if (g.isPlaceholder || !g.completion || g.bye) return;
            if (g.homeScore == null || g.awayScore == null) return;
            pd[g.homeTeamID] = (pd[g.homeTeamID] || 0) + (g.homeScore - g.awayScore);
            pd[g.awayTeamID] = (pd[g.awayTeamID] || 0) + (g.awayScore - g.homeScore);
        });
    });
    return pd;
}

function collectAliveFinishedTeams(season, round) {
    var eliminated = (season.bracket && season.bracket.eliminated) || [];
    var teams = [];
    var seen = {};
    (season.schedule || []).forEach(function (dg) {
        (dg.games || []).forEach(function (g) {
            if (g.isPlaceholder || !g.completion || g.round !== round) return;
            var candidates = g.bye
                ? [{ id: g.homeTeamID, name: g.home, seed: g.homeSeed }]
                : [{ id: g.homeTeamID, name: g.home, seed: g.homeSeed }, { id: g.awayTeamID, name: g.away, seed: g.awaySeed }];
            candidates.forEach(function (c) {
                if (!c.id || seen[c.id] || eliminated.indexOf(c.id) !== -1) return;
                teams.push({ teamID: c.id, name: c.name, seed: c.seed });
                seen[c.id] = true;
            });
        });
    });
    return teams;
}

function teamIDsInRound(season, round) {
    var set = {};
    (season.schedule || []).forEach(function (dg) {
        (dg.games || []).forEach(function (g) {
            if (g.isPlaceholder || g.round !== round) return;
            if (g.homeTeamID) set[g.homeTeamID] = true;
            if (g.awayTeamID) set[g.awayTeamID] = true;
        });
    });
    return set;
}

function pairNextRound1vN(season, completedRound) {
    var nextRound = completedRound + 1;
    var done = collectAliveFinishedTeams(season, completedRound);
    var inNext = teamIDsInRound(season, nextRound);
    var available = done.filter(function (t) { return !inNext[t.teamID]; });
    if (available.length < 2) return 0;

    var records = (season.bracket && season.bracket.records) || {};
    var pd = computePD(season);
    available = available.map(function (t) {
        var r = records[t.teamID] || { wins: 0, losses: 0 };
        return { teamID: t.teamID, name: t.name, seed: t.seed, wins: r.wins, losses: r.losses, pd: pd[t.teamID] || 0 };
    });
    // Rank desc: more wins → fewer losses → higher PD → lower seed
    available.sort(function (a, b) {
        return (b.wins - a.wins) || (a.losses - b.losses) || (b.pd - a.pd) || (a.seed - b.seed);
    });

    // Tournament-specific override: Ouyizz plays both R4 G2 and R4 G6 (the
    // Lobos play-in slot). If they reach R5 AND the round has a natural bye
    // (odd alive count), give the bye to Ouyizz instead of the top seed —
    // earned rest for the back-to-back R4 workload. Skipped when alive is
    // even (would otherwise create a second bye, which we don't want).
    if (nextRound === 5 && available.length >= 2 && (available.length % 2 === 1)) {
        var ouyizzIdx = -1;
        for (var oi = 0; oi < available.length; oi++) {
            if (available[oi].teamID === "L3X3.Ouyizz.Varonil.Libre") { ouyizzIdx = oi; break; }
        }
        if (ouyizzIdx !== -1) {
            var ouyizz = available.splice(ouyizzIdx, 1)[0];
            placeByeEntry(season, ouyizz, nextRound);
        }
    }

    var placed = 0;
    var safety = available.length * 2;
    while (available.length >= 2 && safety-- > 0) {
        var home = available[0];
        var awayIdx = -1;
        for (var i = available.length - 1; i > 0; i--) {
            if (!havePlayedBefore(season, home.teamID, available[i].teamID)) { awayIdx = i; break; }
        }
        if (awayIdx === -1) {
            // Top team has faced every available opponent — rotate them and try next
            available.push(available.shift());
            continue;
        }
        available.shift(); // remove home (index 0)
        var away = available.splice(awayIdx - 1, 1)[0]; // -1 because shift moved indices
        var slot = findNextTBD(season, nextRound);
        if (!slot) {
            // No TBD slot — put both back and stop
            available.unshift(home);
            available.push(away);
            break;
        }
        fillTBD(season, slot, { home: home, away: away, bucket: "seeded" }, nextRound);
        placed++;
    }

    // Odd-count round: top-ranked unpaired team gets a bye (no result).
    if (available.length === 1) {
        placeByeEntry(season, available[0], nextRound);
    }

    return placed;
}

// ── handler ──

module.exports = async function (req, res) {
    var action = req.query.action;

    // GET /api/l3x3?action=season
    if (req.method === "GET" && action === "season") {
        try {
            var { resource: season } = await seasonsContainer.item(SEASON_ID, SEASON_ID).read();
            if (!season) return res.status(404).json({ error: "Season not found" });
            return res.status(200).json(season);
        } catch (err) {
            console.error("L3X3 season fetch error:", err.message);
            return res.status(500).json({ error: "Failed to load season" });
        }
    }

    // GET /api/l3x3?action=team&id=...
    if (req.method === "GET" && action === "team") {
        var teamID = req.query.id;
        if (!teamID) return res.status(400).json({ error: "Missing team id" });
        try {
            var { resource: team } = await teamsContainer.item(teamID, teamID).read();
            if (!team) return res.status(404).json({ error: "Team not found" });
            return res.status(200).json(team);
        } catch (err) {
            console.error("L3X3 team fetch error:", err.message);
            return res.status(500).json({ error: "Failed to load team" });
        }
    }

    // POST /api/l3x3?action=save-game
    if (req.method === "POST" && action === "save-game") {
        var box = req.body && req.body.boxScore;
        if (!box) return res.status(400).json({ error: "Missing boxScore" });
        try {
            var { resource: season2 } = await seasonsContainer.item(SEASON_ID, SEASON_ID).read();
            if (!season2) return res.status(404).json({ error: "Season not found" });

            var homeName = box.team && box.team.home;
            var awayName = box.team && box.team.away;
            if (!homeName || !awayName) {
                return res.status(400).json({ error: "Box score missing team names" });
            }

            // Find an unplayed schedule entry matching home + away (consume placeholder)
            var matchedEntry = null;
            var matchedDg = null;
            if (season2.schedule) {
                for (var ds = 0; ds < season2.schedule.length; ds++) {
                    var dg = season2.schedule[ds];
                    for (var di = 0; di < (dg.games || []).length; di++) {
                        var sg = dg.games[di];
                        if (sg.isPlaceholder) continue;
                        if (!sg.completion && sg.home === homeName && sg.away === awayName) {
                            matchedEntry = sg;
                            matchedDg = dg;
                            break;
                        }
                    }
                    if (matchedEntry) break;
                }
            }

            if (matchedEntry) {
                box.id = matchedEntry.id;
                box.gameDate = dateGroupISO(matchedDg);
            } else {
                // Ad-hoc fallback (off-bracket game)
                var dateStr = box.gameInfo && box.gameInfo.general && box.gameInfo.general.date;
                var ts = box.gameInfo && box.gameInfo.general && box.gameInfo.general.timestamp;
                var gameDate = box.gameDate || mdyToISO(dateStr, ts);
                if (!gameDate) return res.status(400).json({ error: "Box score missing date" });
                var baseID = makeBoxScoreID(SEASON_ID, homeName, awayName, gameDate);
                var attempt = 1, candidate = baseID;
                while (attempt < 20) {
                    try {
                        await boxScoresContainer.item(candidate, candidate).read();
                        attempt++;
                        candidate = baseID + ".g" + (attempt + 1);
                    } catch (e) {
                        if (e.code === 404) break;
                        throw e;
                    }
                }
                box.id = candidate;
                box.gameDate = gameDate;
            }

            box.seasonID = SEASON_ID;
            box.leagueID = LEAGUE_ID;
            box.season = SEASON_ID;
            box.type = "3x3";
            if (!box.recorder) box.recorder = "l3x3-live-tap-simple";

            await boxScoresContainer.items.upsert(box);
            await persistJerseyNumbers(SEASON_ID, box);

            // If this game was a scheduled bracket entry, update bracket state
            if (matchedEntry) {
                var winnerSide = (box.gameInfo && box.gameInfo.state && box.gameInfo.state.winner) || "";
                var homeScore = (box.teamInfo && box.teamInfo.home && box.teamInfo.home.score && box.teamInfo.home.score.current) || 0;
                var awayScore = (box.teamInfo && box.teamInfo.away && box.teamInfo.away.score && box.teamInfo.away.score.current) || 0;
                var forfeit = !!(box.gameInfo && box.gameInfo.state && box.gameInfo.state.forfeit);

                matchedEntry.completion = true;
                matchedEntry.winner = winnerSide;
                matchedEntry.loser = winnerSide === "home" ? "away" : (winnerSide === "away" ? "home" : "");
                matchedEntry.homeScore = homeScore;
                matchedEntry.awayScore = awayScore;
                matchedEntry.forfeit = forfeit;
                matchedEntry.boxScoreId = box.id;

                if (!season2.bracket) season2.bracket = { format: "swiss-1vN", totalTeams: 18, currentRound: 1, records: {}, eliminated: [] };
                if (!season2.bracket.records) season2.bracket.records = {};
                if (!season2.bracket.eliminated) season2.bracket.eliminated = [];

                if (winnerSide === "home" || winnerSide === "away") {
                    var winnerTeamID = winnerSide === "home" ? matchedEntry.homeTeamID : matchedEntry.awayTeamID;
                    var loserTeamID = winnerSide === "home" ? matchedEntry.awayTeamID : matchedEntry.homeTeamID;

                    if (!season2.bracket.records[winnerTeamID]) season2.bracket.records[winnerTeamID] = { wins: 0, losses: 0 };
                    if (!season2.bracket.records[loserTeamID]) season2.bracket.records[loserTeamID] = { wins: 0, losses: 0 };
                    season2.bracket.records[winnerTeamID].wins++;
                    season2.bracket.records[loserTeamID].losses++;
                    if (season2.bracket.records[loserTeamID].losses >= 2 && season2.bracket.eliminated.indexOf(loserTeamID) === -1) {
                        season2.bracket.eliminated.push(loserTeamID);
                    }

                    // If any scheduled play-in entry was waiting on this game,
                    // fill in its pending team slot with the winner first.
                    promotePendingPlayIns(season2, matchedEntry);

                    // Only pair next round once THIS round is fully complete.
                    // Avoids premature partial pairings while other games of
                    // the same round are still open.
                    if (isRoundComplete(season2, matchedEntry.round)) {
                        pairNextRound1vN(season2, matchedEntry.round);
                    }
                }
            }

            await seasonsContainer.item(SEASON_ID, SEASON_ID).replace(season2);

            return res.status(200).json({ success: true, id: box.id });
        } catch (err) {
            console.error("L3X3 save-game error:", err.message);
            return res.status(500).json({ error: "Failed to save game" });
        }
    }

    return res.status(400).json({ error: "Invalid action" });
};
