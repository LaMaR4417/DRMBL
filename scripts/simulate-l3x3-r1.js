// Local simulation of the incremental save handler. Reads the live L3X3
// season, applies 9 synthetic R1 saves in order (higher seed always wins),
// and prints the resulting schedule. Does NOT write to Cosmos — purely a
// dry-run to verify the logic before deploying.

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

// ── inline the helper functions from api/l3x3.js for simulation ──

function asciiSlug(s) { return s.normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[''`"]/g, "").trim(); }
function teamSlug(name) { return asciiSlug(name).replace(/\s+/g, "_"); }
function seasonSlug(seasonId) { return seasonId.replace(/^L3X3 - /, "").replace(/[''`]/g, "").replace(/ - /g, "_").replace(/\s+/g, "_"); }
function makeBoxScoreID(seasonId, homeName, awayName, gameDate) {
    return ["L3X3", seasonSlug(seasonId), teamSlug(homeName) + "_vs_" + teamSlug(awayName), gameDate].join(".");
}
function dateGroupISO(dg) { return dg.date.year + "-" + String(dg.date.month).padStart(2, "0") + "-" + String(dg.date.date).padStart(2, "0"); }
function recordKey(rec) { return (rec && (rec.wins + "-" + rec.losses)) || "0-0"; }

function findNextTBD(season, round) {
    var best = null;
    (season.schedule || []).forEach(function (dg) {
        (dg.games || []).forEach(function (g) {
            if (!g.isPlaceholder) return;
            if (g.round !== round) return;
            var ts = (g.time || "23:59");
            if (!best || ts < best.entry.time || (ts === best.entry.time && (g.court || 99) < (best.entry.court || 99))) {
                best = { dg: dg, entry: g };
            }
        });
    });
    return best;
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
function drainQueues(season, targetRound) {
    var queues = season.bracket.queues = season.bracket.queues || {};
    var placed = 0;
    Object.keys(queues).forEach(function (key) {
        if (key === "cross") return;
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
    if (queues.cross && queues.cross.w && queues.cross.l) {
        var slotX = findNextTBD(season, targetRound);
        if (slotX) {
            fillTBD(season, slotX, { home: queues.cross.w, away: queues.cross.l, bucket: "cross" }, targetRound);
            queues.cross = null;
            placed++;
        }
    }
    return placed;
}
function advanceIncremental(season, completedEntry, winnerTeam, loserTeam) {
    if (!season.bracket.queues) season.bracket.queues = {};
    if (!season.bracket.roundSaves) season.bracket.roundSaves = {};
    var eliminated = season.bracket.eliminated || [];
    var r = completedEntry.round;
    season.bracket.roundSaves[r] = (season.bracket.roundSaves[r] || 0) + 1;
    var saveIdx = season.bracket.roundSaves[r];
    var winnerRec = season.bracket.records[winnerTeam.teamID];
    var loserRec = season.bracket.records[loserTeam.teamID];
    var winnerDest = recordKey(winnerRec);
    var loserDest = recordKey(loserRec);
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

// ── simulate ──

(async function () {
    var { resource: season } = await seasonsContainer.item(SEASON_ID, SEASON_ID).read();

    // Sort R1 games by time + court (the order users would save them in)
    var r1Games = [];
    (season.schedule || []).forEach(function (dg) {
        (dg.games || []).forEach(function (g) {
            if (g.round === 1 && !g.isPlaceholder) r1Games.push(g);
        });
    });
    r1Games.sort(function (a, b) {
        return (a.time || "").localeCompare(b.time || "") || (a.court || 0) - (b.court || 0);
    });

    console.log("Will simulate", r1Games.length, "R1 saves in chronological order");
    console.log("(Higher seed wins each game)\n");

    if (!season.bracket.queues) season.bracket.queues = {};
    if (!season.bracket.roundSaves) season.bracket.roundSaves = {};

    r1Games.forEach(function (g, idx) {
        var winnerSide = g.homeSeed < g.awaySeed ? "home" : "away";
        var winnerTeamID = winnerSide === "home" ? g.homeTeamID : g.awayTeamID;
        var loserTeamID = winnerSide === "home" ? g.awayTeamID : g.homeTeamID;
        var winnerName = winnerSide === "home" ? g.home : g.away;
        var loserName = winnerSide === "home" ? g.away : g.home;
        var winnerSeed = winnerSide === "home" ? g.homeSeed : g.awaySeed;
        var loserSeed = winnerSide === "home" ? g.awaySeed : g.homeSeed;

        g.completion = true;
        g.winner = winnerSide;
        g.loser = winnerSide === "home" ? "away" : "home";
        g.homeScore = 21; g.awayScore = 15;

        if (!season.bracket.records[winnerTeamID]) season.bracket.records[winnerTeamID] = { wins: 0, losses: 0 };
        if (!season.bracket.records[loserTeamID]) season.bracket.records[loserTeamID] = { wins: 0, losses: 0 };
        season.bracket.records[winnerTeamID].wins++;
        season.bracket.records[loserTeamID].losses++;
        if (season.bracket.records[loserTeamID].losses >= 2 && season.bracket.eliminated.indexOf(loserTeamID) === -1) {
            season.bracket.eliminated.push(loserTeamID);
        }

        var placed = advanceIncremental(season, g,
            { teamID: winnerTeamID, name: winnerName, seed: winnerSeed },
            { teamID: loserTeamID, name: loserName, seed: loserSeed }
        );
        console.log("Save " + (idx + 1) + ": " + winnerName + " (#" + winnerSeed + ") beats " + loserName + " (#" + loserSeed + ") | placed " + placed + " R2 game(s)");
    });

    console.log("\n========== Resulting R2 schedule ==========");
    var r2Games = [];
    (season.schedule || []).forEach(function (dg) {
        (dg.games || []).forEach(function (g) {
            if (g.round === 2 && !g.isPlaceholder) r2Games.push(g);
        });
    });
    r2Games.sort(function (a, b) { return (a.time || "").localeCompare(b.time || "") || (a.court || 0) - (b.court || 0); });
    r2Games.forEach(function (g) {
        console.log("  " + g.time + " C" + g.court + " [" + g.bucket + "] | " + g.home + " (#" + g.homeSeed + ") vs " + g.away + " (#" + g.awaySeed + ")");
    });

    var remainingR2TBDs = ((season.schedule || []).flatMap(function (dg) { return dg.games || []; })).filter(function (g) { return g.round === 2 && g.isPlaceholder; }).length;
    console.log("\nR2 games scheduled:", r2Games.length, "/ 9 expected");
    console.log("R2 TBD slots remaining:", remainingR2TBDs);

    console.log("\n========== Bracket state ==========");
    console.log("Records keys:", Object.keys(season.bracket.records).length);
    console.log("Eliminated:", season.bracket.eliminated.length);
    console.log("Queue keys after R1 drain:", Object.keys(season.bracket.queues));
})().catch(function (e) { console.error(e); process.exit(1); });
