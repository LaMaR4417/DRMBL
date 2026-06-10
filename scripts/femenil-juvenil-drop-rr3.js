// Reduce Femenil Juvenil from 3 round robins to 2 by dropping the 3rd
// date group (2025-04-07). The first two dates already contain the full
// 7-team round robin (21 matchups each, home/away swapped on Date 2).
//
// 1st-place bye rule mentioned by user is left for a follow-up — the
// season doc has no playoff/bracket structure yet, and the regular-season
// schedule is a flat 21-game list per date with no rounds/times.

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
var SEASON_ID = "LOMBA - Femenil Juvenil - 2025-2026";

(async function () {
    var { resource: season } = await seasonsContainer.item(SEASON_ID, SEASON_ID).read();

    var before = (season.schedule || []).length;
    console.log("Before: " + before + " date groups");
    (season.schedule || []).forEach(function (dg, i) {
        console.log("  Date " + (i + 1) + ": " + dg.date.year + "-" + dg.date.month + "-" + dg.date.date + " (" + (dg.games || []).length + " games)");
    });

    // Keep only the first 2 date groups (round robins 1 and 2)
    season.schedule = (season.schedule || []).slice(0, 2);

    console.log("\nAfter: " + season.schedule.length + " date groups");
    season.schedule.forEach(function (dg, i) {
        console.log("  Date " + (i + 1) + ": " + dg.date.year + "-" + dg.date.month + "-" + dg.date.date + " (" + (dg.games || []).length + " games)");
    });

    await seasonsContainer.item(SEASON_ID, SEASON_ID).replace(season);
    console.log("\nWRITE OK — 2 round robins (42 total games, 12 per team)");
})().catch(function (e) { console.error(e); process.exit(1); });
