// Technical removal of Lobos' R2 loss (Elios 2K26 vs Lobos, 0-21 forfeit).
// Elios 2K26 KEEPS their win — only Lobos' record is adjusted.
//
// Changes:
//   bracket.records["L3X3.Lobos.Varonil.Libre"].losses: 2 → 1
//   bracket.eliminated: remove "L3X3.Lobos.Varonil.Libre"
//
// The R2 game entry itself stays untouched — Elios still shows the W in the
// schedule/box score.

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
var LOBOS_ID = "L3X3.Lobos.Varonil.Libre";

(async function () {
    var { resource: season } = await seasonsContainer.item(SEASON_ID, SEASON_ID).read();

    var before = season.bracket.records[LOBOS_ID];
    console.log("Before:", JSON.stringify(before));
    console.log("Eliminated before:", season.bracket.eliminated.indexOf(LOBOS_ID) !== -1);

    if (!season.bracket.records[LOBOS_ID]) { console.error("ABORT: Lobos record missing"); process.exit(1); }
    if (season.bracket.records[LOBOS_ID].losses < 1) { console.error("ABORT: Lobos losses < 1, nothing to remove"); process.exit(1); }

    season.bracket.records[LOBOS_ID].losses -= 1;
    season.bracket.eliminated = season.bracket.eliminated.filter(function (t) { return t !== LOBOS_ID; });

    var after = season.bracket.records[LOBOS_ID];
    console.log("After:", JSON.stringify(after));
    console.log("Eliminated after:", season.bracket.eliminated.indexOf(LOBOS_ID) !== -1);

    await seasonsContainer.item(SEASON_ID, SEASON_ID).replace(season);
    console.log("\nWRITE OK");
})().catch(function (e) { console.error(e); process.exit(1); });
