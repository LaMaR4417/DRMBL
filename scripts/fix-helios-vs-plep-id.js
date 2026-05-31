// One-shot: fix the R1 schedule entry id for Helios vs P.LEP — the rename
// script split by "." to extract the team slug, and P.LEP contains a dot,
// so the new id ended up as "...Helios_vs_P.2026-06-01" instead of
// "...Helios_vs_P.LEP.2026-06-01".

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
var BAD_ID = "L3X3.Varonil_Libre_2026.Helios_vs_P.2026-06-01";
var GOOD_ID = "L3X3.Varonil_Libre_2026.Helios_vs_P.LEP.2026-06-01";

(async function () {
    var { resource: season } = await seasonsContainer.item(SEASON_ID, SEASON_ID).read();
    var found = null;
    for (var ds = 0; ds < (season.schedule || []).length; ds++) {
        var dg = season.schedule[ds];
        for (var gi = 0; gi < (dg.games || []).length; gi++) {
            if (dg.games[gi].id === BAD_ID) { found = dg.games[gi]; break; }
        }
        if (found) break;
    }
    if (!found) { console.log("no entry with bad id — nothing to fix"); return; }
    console.log("found bad id:", found.id);
    console.log("will rewrite to:", GOOD_ID);
    if (!APPLY) { console.log("(dry run)"); return; }
    found.id = GOOD_ID;
    await seasonsContainer.item(SEASON_ID, SEASON_ID).replace(season);
    console.log("FIXED");
})().catch(function (e) { console.error(e); process.exit(1); });
