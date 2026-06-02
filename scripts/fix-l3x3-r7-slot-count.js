// Drop the second R7 slot (Day 2 20:20 C1) back to unlabeled — the no-reset
// final is a single game, not two.

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

(async function () {
    var { resource: season } = await seasonsContainer.item(SEASON_ID, SEASON_ID).read();
    var changed = 0;
    (season.schedule || []).forEach(function (dg) {
        if (!dg.date || dg.date.year !== 2026 || dg.date.month !== 6 || dg.date.date !== 3) return;
        (dg.games || []).forEach(function (g) {
            if (g.round !== 7) return;
            if (g.time === "20:20" && g.court === 1) {
                console.log("Found extra R7 slot at " + g.time + " C" + g.court + " — reverting to unlabeled");
                g.round = null;
                changed++;
            }
        });
    });
    console.log("changes:", changed);
    if (!APPLY) { console.log("(dry run)"); return; }
    if (changed > 0) await seasonsContainer.item(SEASON_ID, SEASON_ID).replace(season);
    console.log("WRITE OK");
})().catch(function (e) { console.error(e); process.exit(1); });
