// Add Day 2 (2026-06-03) to L3X3 with pre-labeled R4, R5, R6, R7 TBD slots.
// 14 placeholder slots total (slight upper-bound padding over the 11 minimum
// to absorb leftover-team byes or odd cross-bucket pairings).

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

var APPLY = process.argv.indexOf("--apply") !== -1;
var SEASON_ID = "L3X3 - Varonil Libre - 2026";

var DAY2_DATE = { year: 2026, month: 6, date: 3 };
var DAY2_ISO = "2026-06-03";

// Schedule plan: 4 courts × 5 timeslots = 20 capacity. We label 14 of them.
var SLOTS = [
    // R4 — 5 slots (covers Case A 4 games or Case B 5 games)
    { time: "19:00", court: 1, round: 4 },
    { time: "19:00", court: 2, round: 4 },
    { time: "19:00", court: 3, round: 4 },
    { time: "19:00", court: 4, round: 4 },
    { time: "19:20", court: 1, round: 4 },
    // R5 — 4 slots
    { time: "19:20", court: 2, round: 5 },
    { time: "19:20", court: 3, round: 5 },
    { time: "19:20", court: 4, round: 5 },
    { time: "19:40", court: 1, round: 5 },
    // R6 — 3 slots
    { time: "19:40", court: 2, round: 6 },
    { time: "19:40", court: 3, round: 6 },
    { time: "20:00", court: 1, round: 6 },
    // R7 (final) — 2 slots (upper bound; only 1 game expected in no-reset format)
    { time: "20:00", court: 2, round: 7 },
    { time: "20:20", court: 1, round: 7 },
];

function tbdGame(time, court, round) {
    return {
        id: "L3X3.Varonil_Libre_2026.TBD." + DAY2_ISO + "." + time.replace(":", "") + ".C" + court,
        home: "TBD",
        away: "TBD",
        homeTeamID: null,
        awayTeamID: null,
        homeSeed: null,
        awaySeed: null,
        round: round,
        court: court,
        time: time,
        wave: time,
        completion: false,
        winner: "",
        loser: "",
        homeScore: null,
        awayScore: null,
        forfeit: false,
        boxScoreId: null,
        isPlaceholder: true,
    };
}

(async function () {
    var { resource: season } = await seasonsContainer.item(SEASON_ID, SEASON_ID).read();
    if (!season) { console.error("ABORT: season not found"); process.exit(1); }

    var existing = (season.schedule || []).find(function (dg) {
        return dg.date.year === DAY2_DATE.year && dg.date.month === DAY2_DATE.month && dg.date.date === DAY2_DATE.date;
    });

    console.log("=== L3X3 Day 2 setup ===");
    console.log("  date:", DAY2_ISO);
    console.log("  Day 2 group already exists:", !!existing);
    console.log("  slots to add:", SLOTS.length);
    var byRound = {};
    SLOTS.forEach(function (s) { byRound[s.round] = (byRound[s.round] || 0) + 1; });
    console.log("  per round:", JSON.stringify(byRound));

    if (existing) {
        console.error("ABORT: Day 2 date group already exists — refusing to overwrite");
        process.exit(1);
    }

    var games = SLOTS.map(function (s) { return tbdGame(s.time, s.court, s.round); });
    var newDg = { date: DAY2_DATE, games: games };

    if (!APPLY) {
        console.log("\nWould create date group:");
        console.log("  ", JSON.stringify(newDg.date), "with", games.length, "TBDs");
        console.log("(dry run — re-run with --apply to commit)");
        return;
    }

    if (!season.schedule) season.schedule = [];
    season.schedule.push(newDg);
    season.schedule.sort(function (a, b) {
        var da = a.date.year * 10000 + a.date.month * 100 + a.date.date;
        var db = b.date.year * 10000 + b.date.month * 100 + b.date.date;
        return da - db;
    });

    await seasonsContainer.item(SEASON_ID, SEASON_ID).replace(season);
    console.log("\nWRITE OK");
})().catch(function (e) { console.error(e); process.exit(1); });
