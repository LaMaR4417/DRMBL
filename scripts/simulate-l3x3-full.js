// Full simulation of incremental advancement through R1 -> R2 -> R3 -> R4.
// Reads the live L3X3 season, applies synthetic saves (higher seed wins),
// and reports any issues at each round transition. Does NOT write to Cosmos.

var fs = require("fs");
var path = require("path");
try {
    var envText = fs.readFileSync(path.join(__dirname, "..", ".env.local"), "utf8");
    envText.split(/\r?\n/).forEach(function (line) {
        var m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/i);
        if (m && !process.env[m[1]]) {
            var val = m[2];
            if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) val = val.slice(1, -1);
            val = val.replace(/\\n/g, "\n").replace(/\\r/g, "\r").replace(/\\t/g, "\t").trim();
            process.env[m[1]] = val;
        }
    });
} catch (e) { }

var { CosmosClient } = require("@azure/cosmos");
var client = new CosmosClient({ endpoint: process.env.COSMOS_ENDPOINT, key: process.env.COSMOS_KEY });
var seasonsContainer = client.database("DRMBL Database").container("Seasons");

var SEASON_ID = "L3X3 - Varonil Libre - 2026";

// === inline helpers (mirror api/l3x3.js) ===
function asciiSlug(s) { return s.normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[''`"]/g, "").trim(); }
function teamSlug(name) { return asciiSlug(name).replace(/\s+/g, "_"); }
function seasonSlug(seasonId) { return seasonId.replace(/^L3X3 - /, "").replace(/[''`]/g, "").replace(/ - /g, "_").replace(/\s+/g, "_"); }
function makeBoxScoreID(seasonId, h, a, d) { return ["L3X3", seasonSlug(seasonId), teamSlug(h) + "_vs_" + teamSlug(a), d].join("."); }
function dateGroupISO(dg) { return dg.date.year + "-" + String(dg.date.month).padStart(2, "0") + "-" + String(dg.date.date).padStart(2, "0"); }
function recordKey(rec) { return (rec && (rec.wins + "-" + rec.losses)) || "0-0"; }

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
        home: pair.home.name, away: pair.away.name,
        homeTeamID: pair.home.teamID, awayTeamID: pair.away.teamID,
        homeSeed: pair.home.seed, awaySeed: pair.away.seed,
        round: round, court: slot.entry.court, time: slot.entry.time,
        bucket: pair.bucket, completion: false, winner: "", loser: "",
        homeScore: null, awayScore: null, forfeit: false, boxScoreId: null,
    };
    Object.keys(slot.entry).forEach(function (k) { delete slot.entry[k]; });
    Object.assign(slot.entry, newEntry);
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
        home: team.name, away: "Bye",
        homeTeamID: team.teamID, awayTeamID: null,
        homeSeed: team.seed, awaySeed: null,
        round: round, court: slot.entry.court, time: slot.entry.time,
        bucket: "bye", completion: true, winner: "home", loser: "away",
        homeScore: null, awayScore: null, forfeit: false, bye: true, boxScoreId: null,
    };
    Object.keys(slot.entry).forEach(function (k) { delete slot.entry[k]; });
    Object.assign(slot.entry, newEntry);
    return slot.entry;
}
function drainQueues(season, targetRound) {
    var queues = season.bracket.queues = season.bracket.queues || {};
    var placed = 0;
    var leftover = {};
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
            console.log("    🎁 PD-bye awarded to:", byeRecipient.name, "(PD +" + byeRecipient.pd + ", seed " + byeRecipient.seed + ")");
        }
    }

    Object.keys(queues).forEach(function (key) {
        if (key === "cross") return;
        if (key === "2-0" && holdTwoZero) return;
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
        else leftover[key] = bucket.length;
    });
    if (queues.cross && queues.cross.w && queues.cross.l) {
        var slotX = findNextTBD(season, targetRound);
        if (slotX) {
            fillTBD(season, slotX, { home: queues.cross.w, away: queues.cross.l, bucket: "cross" }, targetRound);
            delete queues.cross;
            placed++;
        }
    }
    return { placed: placed, leftover: leftover };
}

function advanceIncremental(season, completedEntry, winnerTeam, loserTeam) {
    if (!season.bracket.queues) season.bracket.queues = {};
    if (!season.bracket.roundSaves) season.bracket.roundSaves = {};
    var eliminated = season.bracket.eliminated || [];
    var r = completedEntry.round;
    season.bracket.roundSaves[r] = (season.bracket.roundSaves[r] || 0) + 1;
    var saveIdx = season.bracket.roundSaves[r];
    var winnerKey = recordKey(season.bracket.records[winnerTeam.teamID]);
    var loserKey = recordKey(season.bracket.records[loserTeam.teamID]);
    var winnerDest = winnerKey;
    var loserDest = loserKey;
    if (r === 1 && saveIdx === 3) winnerDest = "cross-w";
    if (r === 1 && saveIdx === 4) loserDest = "cross-l";
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
    return drainQueues(season, r + 1);
}

// === simulate ===

function simulateRound(season, round) {
    var games = [];
    (season.schedule || []).forEach(function (dg) {
        (dg.games || []).forEach(function (g) {
            if (g.round === round && !g.isPlaceholder && !g.completion) games.push(g);
        });
    });
    games.sort(function (a, b) { return (a.time || "").localeCompare(b.time || "") || (a.court || 0) - (b.court || 0); });

    var placed = 0;
    var leftoverWarnings = [];
    games.forEach(function (g) {
        var winnerSide = (g.homeSeed || 99) < (g.awaySeed || 99) ? "home" : "away";
        var winnerTeamID = winnerSide === "home" ? g.homeTeamID : g.awayTeamID;
        var loserTeamID = winnerSide === "home" ? g.awayTeamID : g.homeTeamID;
        g.completion = true; g.winner = winnerSide; g.homeScore = 21; g.awayScore = 15;
        if (!season.bracket.records[winnerTeamID]) season.bracket.records[winnerTeamID] = { wins: 0, losses: 0 };
        if (!season.bracket.records[loserTeamID]) season.bracket.records[loserTeamID] = { wins: 0, losses: 0 };
        season.bracket.records[winnerTeamID].wins++;
        season.bracket.records[loserTeamID].losses++;
        if (season.bracket.records[loserTeamID].losses >= 2 && season.bracket.eliminated.indexOf(loserTeamID) === -1) {
            season.bracket.eliminated.push(loserTeamID);
        }
        var result = advanceIncremental(season, g,
            { teamID: winnerTeamID, name: winnerSide === "home" ? g.home : g.away, seed: winnerSide === "home" ? g.homeSeed : g.awaySeed },
            { teamID: loserTeamID, name: winnerSide === "home" ? g.away : g.home, seed: winnerSide === "home" ? g.awaySeed : g.homeSeed }
        );
        placed += result.placed;
        if (Object.keys(result.leftover).length > 0) leftoverWarnings.push({ saveIdx: season.bracket.roundSaves[round], leftover: result.leftover });
    });

    var nextRound = round + 1;
    var nextGames = [];
    (season.schedule || []).forEach(function (dg) {
        (dg.games || []).forEach(function (g) {
            if (g.round === nextRound && !g.isPlaceholder) nextGames.push(g);
        });
    });
    var remainingTBDs = [];
    (season.schedule || []).forEach(function (dg) {
        (dg.games || []).forEach(function (g) {
            if (g.round === nextRound && g.isPlaceholder) remainingTBDs.push(g);
        });
    });

    return {
        round: round,
        gamesPlayed: games.length,
        nextRoundGamesScheduled: nextGames.length,
        nextRoundTBDsRemaining: remainingTBDs.length,
        queueState: JSON.parse(JSON.stringify(season.bracket.queues || {})),
        leftoverWarnings: leftoverWarnings,
        eliminated: season.bracket.eliminated.length,
    };
}

(async function () {
    var { resource: season } = await seasonsContainer.item(SEASON_ID, SEASON_ID).read();
    if (!season.bracket) season.bracket = { records: {}, eliminated: [], queues: {}, roundSaves: {} };
    if (!season.bracket.records) season.bracket.records = {};
    if (!season.bracket.eliminated) season.bracket.eliminated = [];
    if (!season.bracket.queues) season.bracket.queues = {};
    if (!season.bracket.roundSaves) season.bracket.roundSaves = {};

    for (var r = 1; r <= 7; r++) {
        var report = simulateRound(season, r);
        console.log("=== Round " + r + " complete ===");
        console.log("  games played:", report.gamesPlayed);
        console.log("  R" + (r + 1) + " games auto-scheduled:", report.nextRoundGamesScheduled);
        console.log("  R" + (r + 1) + " TBDs remaining unfilled:", report.nextRoundTBDsRemaining);
        console.log("  eliminated count:", report.eliminated);
        console.log("  queue state after round:", JSON.stringify(report.queueState));
        if (report.leftoverWarnings.length > 0) {
            console.log("  ⚠️  leftovers (un-paired teams in queue):");
            report.leftoverWarnings.forEach(function (w) { console.log("     after save " + w.saveIdx + ":", JSON.stringify(w.leftover)); });
        }
        if (report.gamesPlayed === 0) {
            console.log("  ⚠️  NO GAMES TO PLAY for R" + r + " — pipeline broke");
            break;
        }
        console.log("");
    }
})().catch(function (e) { console.error(e); process.exit(1); });
