// Post-tournament cleanup: remove empty/unused slots from Day 2 schedule
// so the bracket displays only games that actually happened.
//
// Removes:
//   - 19:00 C3, C4 ("-" empty markers — no games played those courts at 7pm)
//   - 20:00 C3, C4 (R6 TBDs never filled because only 2 R6 games occurred)

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

(async function () {
    var { resource: season } = await seasonsContainer.item(SEASON_ID, SEASON_ID).read();
    var day2 = (season.schedule || []).find(function (dg) { return dg.date.year === 2026 && dg.date.month === 6 && dg.date.date === 3; });
    if (!day2) { console.error("ABORT: no Day 2"); process.exit(1); }

    var before = day2.games.length;

    // Remove empty placeholders + unused TBDs
    day2.games = day2.games.filter(function (g) {
        // Keep all real games (completed or scheduled with real teams)
        if (!g.isPlaceholder) return true;
        // Drop "-" empty markers
        if (g.home === "-" && g.away === "-") return false;
        // Drop unused TBDs (those that never got filled)
        if (g.home === "TBD" && g.away === "TBD") return false;
        return true;
    });

    var after = day2.games.length;
    console.log("Removed " + (before - after) + " empty/unused slots.");

    console.log("\nFinal Day 2 schedule:");
    day2.games.forEach(function (g) {
        var score = (g.homeScore != null && g.awayScore != null) ? "(" + g.homeScore + "-" + g.awayScore + ")" : "";
        console.log("  " + g.time + " C" + g.court + "  R" + g.round + "  " + g.home + " vs " + g.away + " " + score);
    });

    await seasonsContainer.item(SEASON_ID, SEASON_ID).replace(season);
    console.log("\nWRITE OK");
})().catch(function (e) { console.error(e); process.exit(1); });
