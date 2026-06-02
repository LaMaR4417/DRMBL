// Convert LOMBA Femenil Juvenil from single round robin to triple.
// Keeps Leg 1 (existing 21 placeholders on 2025-04-05) untouched.
// Adds Leg 2 on 2025-04-06 with orientation swapped, Leg 3 on 2025-04-07
// with the same orientation as Leg 1.

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
var SEASON_ID = "LOMBA - Femenil Juvenil - 2025-2026";

var LEG_2_DATE = { year: 2025, month: 4, date: 6 };
var LEG_2_ISO = "2025-04-06";
var LEG_3_DATE = { year: 2025, month: 4, date: 7 };
var LEG_3_ISO = "2025-04-07";

function asciiSlug(s) { return s.normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[''`"]/g, "").trim(); }
function teamSlug(name) { return asciiSlug(name).replace(/\s+/g, "_"); }
function seasonSlug(seasonId) {
    return seasonId.replace(/^LOMBA - /, "").replace(/[''`]/g, "").replace(/ - /g, "_").replace(/\s+/g, "_");
}
function makeID(home, away, isoDate) {
    return ["LOMBA", seasonSlug(SEASON_ID), teamSlug(home) + "_vs_" + teamSlug(away), isoDate].join(".");
}
function makeGame(home, away, isoDate) {
    return {
        id: makeID(home, away, isoDate),
        home: home,
        away: away,
        time: null,
        homeScore: null,
        awayScore: null,
        winner: "",
        forfeit: false,
    };
}

(async function () {
    var { resource: season } = await seasonsContainer.item(SEASON_ID, SEASON_ID).read();
    if (!season) { console.error("ABORT: season not found"); process.exit(1); }

    var allGames = [];
    (season.schedule || []).forEach(function (dg) {
        (dg.games || []).forEach(function (g) { allGames.push({ dg: dg, game: g }); });
    });
    var totalBefore = allGames.length;
    var completed = allGames.filter(function (x) { return x.game.completion || (x.game.winner && x.game.winner !== ""); });

    // Use the existing entries' (home, away) as Leg 1. Leg 2 swaps orientation. Leg 3 mirrors Leg 1.
    var existingMatchups = allGames.map(function (x) { return { home: x.game.home, away: x.game.away }; });

    var leg2Games = existingMatchups.map(function (m) { return makeGame(m.away, m.home, LEG_2_ISO); });
    var leg3Games = existingMatchups.map(function (m) { return makeGame(m.home, m.away, LEG_3_ISO); });

    console.log("=== " + SEASON_ID + " ===");
    console.log("  games before:", totalBefore, "(completed:", completed.length + ")");
    console.log("  Leg 2 (orientation-swapped):", leg2Games.length, "@", LEG_2_ISO);
    console.log("  Leg 3 (same orientation):", leg3Games.length, "@", LEG_3_ISO);
    console.log("  games after:", totalBefore + leg2Games.length + leg3Games.length);
    console.log("  sample Leg 2:", JSON.stringify(leg2Games[0]));
    console.log("  sample Leg 3:", JSON.stringify(leg3Games[0]));

    if (!APPLY) { console.log("\n(dry run — re-run with --apply to commit)"); return; }

    // Make sure no date group at 4/6 or 4/7 yet
    var hasLeg2 = (season.schedule || []).some(function (dg) { return dg.date.year === LEG_2_DATE.year && dg.date.month === LEG_2_DATE.month && dg.date.date === LEG_2_DATE.date; });
    var hasLeg3 = (season.schedule || []).some(function (dg) { return dg.date.year === LEG_3_DATE.year && dg.date.month === LEG_3_DATE.month && dg.date.date === LEG_3_DATE.date; });
    if (hasLeg2 || hasLeg3) { console.error("ABORT: a leg-2 or leg-3 date group already exists"); process.exit(1); }

    season.schedule.push({ date: LEG_2_DATE, games: leg2Games });
    season.schedule.push({ date: LEG_3_DATE, games: leg3Games });
    season.schedule.sort(function (a, b) {
        var da = new Date(a.date.year, a.date.month - 1, a.date.date);
        var db = new Date(b.date.year, b.date.month - 1, b.date.date);
        return da - db;
    });

    await seasonsContainer.item(SEASON_ID, SEASON_ID).replace(season);
    console.log("\nWRITE OK");
})().catch(function (e) { console.error(e); process.exit(1); });
