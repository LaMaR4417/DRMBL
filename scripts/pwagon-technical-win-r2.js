// One-shot: P. Wagon technical win override on the R2 game vs Ouyizz.
// Bracket record only — bump P. Wagon wins +1 and losses -1.
// Box scores stay as-is; Ouyizz record untouched.

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
var PWAGON_ID = "L3X3.P._Wagon.Varonil.Libre";

(async function () {
    var { resource: season } = await seasonsContainer.item(SEASON_ID, SEASON_ID).read();
    var rec = season.bracket && season.bracket.records && season.bracket.records[PWAGON_ID];
    if (!rec) { console.error("ABORT: no bracket record for P. Wagon"); process.exit(1); }

    console.log("P. Wagon current:", JSON.stringify(rec));
    var newRec = { wins: rec.wins + 1, losses: rec.losses - 1 };
    console.log("P. Wagon after :", JSON.stringify(newRec));

    if (newRec.losses < 0 || newRec.wins < 0) { console.error("ABORT: would produce negative count"); process.exit(1); }

    if (!APPLY) { console.log("\n(dry run — re-run with --apply to commit)"); return; }

    season.bracket.records[PWAGON_ID] = newRec;

    // If P. Wagon was in eliminated[], remove (this fix takes them off 2 losses)
    if (newRec.losses < 2) {
        var idx = (season.bracket.eliminated || []).indexOf(PWAGON_ID);
        if (idx !== -1) {
            season.bracket.eliminated.splice(idx, 1);
            console.log("REMOVED from eliminated[]");
        }
    }

    await seasonsContainer.item(SEASON_ID, SEASON_ID).replace(season);
    console.log("WRITE OK");
})().catch(function (e) { console.error(e); process.exit(1); });
