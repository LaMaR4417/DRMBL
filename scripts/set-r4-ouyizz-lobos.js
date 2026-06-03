// Hard-code R4 G6 at 7:20 C3 as Ouyizz vs Lobos.
//
// Replaces the pendingPlayIn entry. Since the rule "favorite faces Lobos"
// collapses to Ouyizz vs Lobos regardless of the G2 outcome, no runtime
// play-in promotion is needed.

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
var OUYIZZ_ID = "L3X3.Ouyizz.Varonil.Libre";
var LOBOS_ID = "L3X3.Lobos.Varonil.Libre";
var DATE_ISO = "2026-06-03";

(async function () {
    var { resource: season } = await seasonsContainer.item(SEASON_ID, SEASON_ID).read();
    var day2 = (season.schedule || []).find(function (dg) { return dg.date.year === 2026 && dg.date.month === 6 && dg.date.date === 3; });
    if (!day2) { console.error("ABORT: no Day 2"); process.exit(1); }

    // Look up Ouyizz and Lobos seeds
    var ouyizzTeam = (season.teams || []).find(function (t) { return (t.teamID || t.id) === OUYIZZ_ID; });
    var lobosTeam = (season.teams || []).find(function (t) { return (t.teamID || t.id) === LOBOS_ID; });
    var ouyizzSeed = ouyizzTeam ? (ouyizzTeam.seed || null) : null;
    var lobosSeed = lobosTeam ? (lobosTeam.seed || null) : null;

    // Find existing 19:20 C3 entry
    var slotIdx = day2.games.findIndex(function (g) { return g.time === "19:20" && g.court === 3; });
    if (slotIdx === -1) { console.error("ABORT: no 19:20 C3 slot found"); process.exit(1); }
    var existing = day2.games[slotIdx];
    console.log("Existing 19:20 C3:", existing.home, "vs", existing.away, "(pendingPlayIn=" + !!existing.pendingPlayIn + ")");

    var newEntry = {
        id: "L3X3.Varonil_Libre_2026.Ouyizz_vs_Lobos." + DATE_ISO + ".1920.C3",
        home: "Ouyizz",
        away: "Lobos",
        homeTeamID: OUYIZZ_ID,
        awayTeamID: LOBOS_ID,
        homeSeed: ouyizzSeed,
        awaySeed: lobosSeed,
        round: 4,
        court: 3,
        time: "19:20",
        wave: "19:20",
        bucket: "play-in-fixed",
        completion: false,
        winner: "",
        loser: "",
        homeScore: null,
        awayScore: null,
        forfeit: false,
        boxScoreId: null,
        isPlaceholder: false,
    };

    day2.games[slotIdx] = newEntry;
    day2.games.sort(function (a, b) { return (a.time || "").localeCompare(b.time || "") || (a.court || 0) - (b.court || 0); });

    console.log("\nWriting hard-coded R4 G6 at 19:20 C3:");
    console.log("  " + newEntry.home + " vs " + newEntry.away + " (R" + newEntry.round + ", isPlaceholder=" + newEntry.isPlaceholder + ")");

    await seasonsContainer.item(SEASON_ID, SEASON_ID).replace(season);
    console.log("\nWRITE OK");
})().catch(function (e) { console.error(e); process.exit(1); });
