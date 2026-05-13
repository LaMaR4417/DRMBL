// One-shot: reseed Varonil Empresarial championship from Selectivo Tec-CBTIS
// to Mango Sports after an SF score correction flipped the winner.
// Safety: refuses to run if any championship game has been played.

var fs = require("fs");
var path = require("path");
try {
    var envText = fs.readFileSync(path.join(__dirname, "..", ".env.local"), "utf8");
    envText.split(/\r?\n/).forEach(function (line) {
        var m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/i);
        if (m && !process.env[m[1]]) {
            var val = m[2];
            if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
                val = val.slice(1, -1);
            }
            val = val.replace(/\\n/g, "\n").replace(/\\r/g, "\r").replace(/\\t/g, "\t").trim();
            process.env[m[1]] = val;
        }
    });
} catch (e) { }

var { CosmosClient } = require("@azure/cosmos");
var client = new CosmosClient({ endpoint: process.env.COSMOS_ENDPOINT, key: process.env.COSMOS_KEY });
var seasonsContainer = client.database("DRMBL Database").container("Seasons");

var APPLY = process.argv.indexOf("--apply") !== -1;
var SEASON_ID = "LOMBA - Varonil Empresarial - 2025-2026";
var SUFFIX = "Varonil Empresarial - 2025-2026";

(async function () {
    var { resource: doc } = await seasonsContainer.item(SEASON_ID, SEASON_ID).read();
    var champ = doc.playoffs.championship;

    console.log("Current champ: " + champ.name1 + "(" + champ.seed1 + ") vs " + champ.name2 + "(" + champ.seed2 + ")");
    if ((champ.games || []).some(function (g) { return g && g.completion; })) {
        console.error("ABORT: championship has at least one completed game; refusing to overwrite");
        process.exit(1);
    }

    // Compute new matchup from current SF state
    var sfWinners = [];
    for (var i = 0; i < doc.playoffs.semiFinals.length; i++) {
        var sf = doc.playoffs.semiFinals[i];
        if ((sf.seed1Wins || 0) >= 2) sfWinners.push({ seed: sf.seed1, name: sf.name1 });
        else if ((sf.seed2Wins || 0) >= 2) sfWinners.push({ seed: sf.seed2, name: sf.name2 });
    }
    if (sfWinners.length !== 2) {
        console.error("ABORT: SFs are not both decided");
        process.exit(1);
    }
    sfWinners.sort(function (a, b) { return a.seed - b.seed; });
    var higher = sfWinners[0];
    var lower = sfWinners[1];

    console.log("New champ: " + higher.name + "(" + higher.seed + ") vs " + lower.name + "(" + lower.seed + ")");

    champ.seed1 = higher.seed;
    champ.name1 = higher.name;
    champ.seed2 = lower.seed;
    champ.name2 = lower.name;
    champ.seed1Wins = 0;
    champ.seed2Wins = 0;
    champ.games = [
        { id: "Playoff Final Game 1 - " + lower.name + " vs " + higher.name + " - " + SUFFIX, home: higher.name, away: lower.name, homeScore: null, awayScore: null, winner: "", forfeit: false, date: null, time: null, completion: false },
        { id: "Playoff Final Game 2 - " + higher.name + " vs " + lower.name + " - " + SUFFIX, home: lower.name, away: higher.name, homeScore: null, awayScore: null, winner: "", forfeit: false, date: null, time: null, completion: false },
        { id: "Playoff Final Game 3 - " + lower.name + " vs " + higher.name + " - " + SUFFIX, home: higher.name, away: lower.name, homeScore: null, awayScore: null, winner: "", forfeit: false, date: null, time: null, completion: false }
    ];

    if (APPLY) {
        await seasonsContainer.item(SEASON_ID, SEASON_ID).replace(doc);
        console.log("WRITE OK");
    } else {
        console.log("(dry run — re-run with --apply to commit)");
    }
})().catch(function (e) { console.error(e); process.exit(1); });
