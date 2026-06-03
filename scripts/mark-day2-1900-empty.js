// Change the home/away labels on the two intentionally-empty Day 2 19:00
// slots (C3 and C4) from "TBD" to "-" so UIs render them as deliberate
// empties rather than "waiting to be filled". Their round=null keeps the
// auto-pairing engine from touching them (engine only fills round=N+1).

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
    if (!day2) { console.error("ABORT"); process.exit(1); }

    var changed = 0;
    (day2.games || []).forEach(function (g) {
        if (g.time !== "19:00") return;
        if (g.court !== 3 && g.court !== 4) return;
        if (!g.isPlaceholder) return;
        g.home = "-";
        g.away = "-";
        changed++;
    });
    console.log("relabeled:", changed);
    await seasonsContainer.item(SEASON_ID, SEASON_ID).replace(season);
    console.log("WRITE OK");
})().catch(function (e) { console.error(e); process.exit(1); });
