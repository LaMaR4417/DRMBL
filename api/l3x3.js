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

// Among the 4 R2 W-W games (bucket: "1-0"), find the winning team with the
// highest point differential. Tiebreaker: lower seed (= higher-seeded team).
function findPDByeRecipient(season) {
    var best = null;
    (season.schedule || []).forEach(function (dg) {
        (dg.games || []).forEach(function (g) {
            if (g.round !== 2 || g.isPlaceholder || !g.completion || g.bucket !== "1-0") return;
            var pd = g.winner === "home" ? ((g.homeScore || 0) - (g.awayScore || 0)) : ((g.awayScore || 0) - (g.homeScore || 0));
            var winnerTeamID = g.winner === "home" ? g.homeTeamID : g.awayTeamID;
            var winnerName = g.winner === "home" ? g.home : g.away;
            var winnerSeed = g.winner === "home" ? g.homeSeed : g.awaySeed;
            if (!best || pd > best.pd || (pd === best.pd && winnerSeed < best.seed)) {
                best = { teamID: winnerTeamID, name: winnerName, seed: winnerSeed, pd: pd };
            }
        });
    });
    return best;
}

function placeByeEntry(season, team, round) {
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
        winner: "home",
        loser: "away",
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
    var best = null;
    (season.schedule || []).forEach(function (dg) {
        var dateNum = dg.date ? (dg.date.year * 10000 + (dg.date.month || 0) * 100 + (dg.date.date || 0)) : 0;
        (dg.games || []).forEach(function (g) {
            if (!g.isPlaceholder || g.round !== round) return;
            var ts = (g.time || "23:59");
            var court = g.court || 99;
            if (!best) { best = { dg: dg, entry: g, dateNum: dateNum, time: ts, court: court }; return; }
            if (dateNum < best.dateNum) { best = { dg: dg, entry: g, dateNum: dateNum, time: ts, court: court }; return; }
            if (dateNum > best.dateNum) return;
            if (ts < best.time) { best = { dg: dg, entry: g, dateNum: dateNum, time: ts, court: court }; return; }
            if (ts > best.time) return;
            if (court < best.court) { best = { dg: dg, entry: g, dateNum: dateNum, time: ts, court: court }; return; }
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

function drainQueues(season, targetRound) {
    var queues = season.bracket.queues = season.bracket.queues || {};
    var placed = 0;

    // R3-specific: hold the 2-0 bucket until R2 is complete, then check for
    // the PD-bye case (5 teams in 2-0 → award bye to highest-PD R2 W-W winner).
    var prevRound = targetRound - 1;
    var holdTwoZero = (prevRound === 2 && !isRoundComplete(season, 2));
    var r2JustCompleted = (prevRound === 2 && isRoundComplete(season, 2));

    if (r2JustCompleted && queues["2-0"] && queues["2-0"].length === 5) {
        var byeRecipient = findPDByeRecipient(season);
        if (byeRecipient) {
            queues["2-0"] = queues["2-0"].filter(function (t) { return t.teamID !== byeRecipient.teamID; });
            placeByeEntry(season, byeRecipient, targetRound);
            placed++;
            if (!season.bracket.records[byeRecipient.teamID]) season.bracket.records[byeRecipient.teamID] = { wins: 0, losses: 0 };
            season.bracket.records[byeRecipient.teamID].wins++;
            var byeNewKey = recordKey(season.bracket.records[byeRecipient.teamID]);
            if (!queues[byeNewKey]) queues[byeNewKey] = [];
            queues[byeNewKey].push(byeRecipient);
        }
    }

    // Standard bucket queues: pair within bucket (FIFO)
    Object.keys(queues).forEach(function (key) {
        if (key === "cross") return;
        if (key === "2-0" && holdTwoZero) return; // hold until PD-bye determination
        var bucket = queues[key] || [];
        while (bucket.length >= 2) {
            var home = bucket.shift();
            var away = bucket.shift();
            var slot = findNextTBD(season, targetRound);
            if (!slot) { bucket.unshift(away); bucket.unshift(home); return; }
            fillTBD(season, slot, { home: home, away: away, bucket: key }, targetRound);
            placed++;
        }
        if (bucket.length === 0) delete queues[key];
    });

    // Cross-pair: pair w + l if both present
    if (queues.cross && queues.cross.w && queues.cross.l) {
        var slotX = findNextTBD(season, targetRound);
        if (slotX) {
            fillTBD(season, slotX, { home: queues.cross.w, away: queues.cross.l, bucket: "cross" }, targetRound);
            delete queues.cross;
            placed++;
        }
    }

    return placed;
}

function advanceIncremental(season, completedEntry, winnerTeam, loserTeam) {
    if (!season.bracket) season.bracket = { format: "swiss-double-elim-2loss", currentRound: 1, records: {}, eliminated: [], queues: {}, roundSaves: {} };
    if (!season.bracket.queues) season.bracket.queues = {};
    if (!season.bracket.roundSaves) season.bracket.roundSaves = {};
    var eliminated = season.bracket.eliminated || [];

    var r = completedEntry.round;
    season.bracket.roundSaves[r] = (season.bracket.roundSaves[r] || 0) + 1;
    var saveIdx = season.bracket.roundSaves[r];

    var winnerRec = season.bracket.records[winnerTeam.teamID];
    var loserRec = season.bracket.records[loserTeam.teamID];
    var winnerKey = recordKey(winnerRec);
    var loserKey = recordKey(loserRec);

    // Special R1 cross-pair rule: save #3 winner -> cross.w, save #4 loser -> cross.l
    var winnerDest = winnerKey;
    var loserDest = loserKey;
    if (r === 1 && saveIdx === 3) winnerDest = "cross-w";
    if (r === 1 && saveIdx === 4) loserDest = "cross-l";

    // Push to queues (skip eliminated)
    if (eliminated.indexOf(winnerTeam.teamID) === -1) {
        if (winnerDest === "cross-w") {
            if (!season.bracket.queues.cross) season.bracket.queues.cross = { w: null, l: null };
            season.bracket.queues.cross.w = winnerTeam;
        } else {
            if (!season.bracket.queues[winnerDest]) season.bracket.queues[winnerDest] = [];
            season.bracket.queues[winnerDest].push(winnerTeam);
        }
    }
    if (eliminated.indexOf(loserTeam.teamID) === -1) {
        if (loserDest === "cross-l") {
            if (!season.bracket.queues.cross) season.bracket.queues.cross = { w: null, l: null };
            season.bracket.queues.cross.l = loserTeam;
        } else {
            if (!season.bracket.queues[loserDest]) season.bracket.queues[loserDest] = [];
            season.bracket.queues[loserDest].push(loserTeam);
        }
    }

    var placed = drainQueues(season, r + 1);
    return { placed: placed, queues: season.bracket.queues };
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

                if (!season2.bracket) season2.bracket = { format: "swiss-double-elim-2loss", totalTeams: 18, currentRound: 1, records: {}, eliminated: [], queues: {}, roundSaves: {} };
                if (!season2.bracket.records) season2.bracket.records = {};
                if (!season2.bracket.eliminated) season2.bracket.eliminated = [];

                if (winnerSide === "home" || winnerSide === "away") {
                    var winnerTeamID = winnerSide === "home" ? matchedEntry.homeTeamID : matchedEntry.awayTeamID;
                    var loserTeamID = winnerSide === "home" ? matchedEntry.awayTeamID : matchedEntry.homeTeamID;
                    var winnerName = winnerSide === "home" ? matchedEntry.home : matchedEntry.away;
                    var loserName = winnerSide === "home" ? matchedEntry.away : matchedEntry.home;
                    var winnerSeed = winnerSide === "home" ? matchedEntry.homeSeed : matchedEntry.awaySeed;
                    var loserSeed = winnerSide === "home" ? matchedEntry.awaySeed : matchedEntry.homeSeed;

                    if (!season2.bracket.records[winnerTeamID]) season2.bracket.records[winnerTeamID] = { wins: 0, losses: 0 };
                    if (!season2.bracket.records[loserTeamID]) season2.bracket.records[loserTeamID] = { wins: 0, losses: 0 };
                    season2.bracket.records[winnerTeamID].wins++;
                    season2.bracket.records[loserTeamID].losses++;
                    if (season2.bracket.records[loserTeamID].losses >= 2 && season2.bracket.eliminated.indexOf(loserTeamID) === -1) {
                        season2.bracket.eliminated.push(loserTeamID);
                    }

                    advanceIncremental(season2, matchedEntry,
                        { teamID: winnerTeamID, name: winnerName, seed: winnerSeed },
                        { teamID: loserTeamID, name: loserName, seed: loserSeed }
                    );
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
