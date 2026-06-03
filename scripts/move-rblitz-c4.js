// Move R. Blitz vs P. Wagon R4 game from 19:20 C3 to 19:20 C4, swap TBD to C3.

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
    var game = (day2.games || []).find(function (g) { return !g.isPlaceholder && g.time === "19:20" && g.court === 3 && g.home === "R. Blitz" && g.away === "P. Wagon"; });
    if (!game) { console.error("not found"); process.exit(1); }
    var c4Slot = (day2.games || []).find(function (g) { return g.time === "19:20" && g.court === 4; });
    if (c4Slot && !c4Slot.isPlaceholder) { console.error("C4 occupied"); process.exit(1); }
    game.court = 4;
    if (c4Slot) { c4Slot.court = 3; }
    day2.games.sort(function (a, b) { return (a.time || "").localeCompare(b.time || "") || (a.court || 0) - (b.court || 0); });
    await seasonsContainer.item(SEASON_ID, SEASON_ID).replace(season);
    console.log("MOVED R. Blitz vs P. Wagon C3 → C4 at 19:20; TBD now at C3");
})().catch(function (e) { console.error(e); process.exit(1); });
