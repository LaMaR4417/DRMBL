// Add R8 TBD at 20:40 C1, fillPriority 10. This slot is only used when R6
// closes with 3+ alive — the engine then places an R7 intermediate at 20:20
// C1 and the R8 final lands here. When R6 closes with 2 alive, R7 IS the
// final (at 20:20 C1) and this R8 slot stays as an unused TBD (cosmetic
// only — engine won't try to fill it because no round-8-needed scenario
// triggers).

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
var DATE_ISO = "2026-06-03";

(async function () {
    var { resource: season } = await seasonsContainer.item(SEASON_ID, SEASON_ID).read();
    var day2 = (season.schedule || []).find(function (dg) { return dg.date.year === 2026 && dg.date.month === 6 && dg.date.date === 3; });
    if (!day2) { console.error("ABORT: no Day 2"); process.exit(1); }

    var existing = (day2.games || []).find(function (g) { return g.time === "20:40" && g.court === 1; });
    if (existing) { console.log("20:40 C1 already exists; skipping. (round=" + existing.round + ")"); process.exit(0); }

    var newEntry = {
        id: "L3X3.Varonil_Libre_2026.TBD.R8." + DATE_ISO + ".2040.C1",
        home: "TBD", away: "TBD",
        homeTeamID: null, awayTeamID: null, homeSeed: null, awaySeed: null,
        round: 8, court: 1, time: "20:40", wave: "20:40",
        completion: false, winner: "", loser: "",
        homeScore: null, awayScore: null, forfeit: false, boxScoreId: null,
        isPlaceholder: true,
        fillPriority: 10,
    };

    day2.games.push(newEntry);
    day2.games.sort(function (a, b) { return (a.time || "").localeCompare(b.time || "") || (a.court || 0) - (b.court || 0); });

    console.log("Added R8 TBD slot at 20:40 C1 (fillPriority 10)");
    console.log("\nFinal Day 2 R5+ layout:");
    day2.games.forEach(function (g) {
        if (g.time < "19:40") return;
        var label = g.isPlaceholder ? "[TBD R" + g.round + " fp" + (g.fillPriority || "—") + "]" : "[" + g.home + " vs " + g.away + " R" + g.round + "]";
        console.log("  " + g.time + " C" + g.court + " " + label);
    });

    await seasonsContainer.item(SEASON_ID, SEASON_ID).replace(season);
    console.log("\nWRITE OK");
})().catch(function (e) { console.error(e); process.exit(1); });
