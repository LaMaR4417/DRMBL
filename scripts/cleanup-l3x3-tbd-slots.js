// Delete unused TBD slots:
//   Day 1 (2026-06-02): 21:00 C3, C4 and 21:20 C1, C2, C3, C4 (6 unlabeled slots
//     that exist as buffer for R4+ but those rounds moved to Day 2)
//   Day 2 (2026-06-03): 20:20 C1 (leftover unlabeled after the R7 fix)

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

var TO_DELETE = [
    { date: { year: 2026, month: 6, date: 2 }, time: "21:00", court: 3 },
    { date: { year: 2026, month: 6, date: 2 }, time: "21:00", court: 4 },
    { date: { year: 2026, month: 6, date: 2 }, time: "21:20", court: 1 },
    { date: { year: 2026, month: 6, date: 2 }, time: "21:20", court: 2 },
    { date: { year: 2026, month: 6, date: 2 }, time: "21:20", court: 3 },
    { date: { year: 2026, month: 6, date: 2 }, time: "21:20", court: 4 },
    { date: { year: 2026, month: 6, date: 3 }, time: "20:20", court: 1 },
];

function dateMatches(a, b) { return a.year === b.year && a.month === b.month && a.date === b.date; }

(async function () {
    var { resource: season } = await seasonsContainer.item(SEASON_ID, SEASON_ID).read();

    var deletedCount = 0;
    var protectedCount = 0;
    (season.schedule || []).forEach(function (dg) {
        dg.games = (dg.games || []).filter(function (g) {
            var shouldDelete = TO_DELETE.some(function (target) {
                return dateMatches(dg.date, target.date) && g.time === target.time && g.court === target.court;
            });
            if (!shouldDelete) return true;
            if (!g.isPlaceholder) {
                console.log("  PROTECT (not a placeholder, has data):", dg.date.year + "/" + dg.date.month + "/" + dg.date.date, g.time, "C" + g.court, "round=" + g.round);
                protectedCount++;
                return true;
            }
            deletedCount++;
            return false;
        });
    });

    console.log("planned to delete:", TO_DELETE.length);
    console.log("actually deleted:", deletedCount);
    console.log("protected (had real data):", protectedCount);

    if (!APPLY) { console.log("\n(dry run — re-run with --apply to commit)"); return; }
    if (deletedCount > 0) await seasonsContainer.item(SEASON_ID, SEASON_ID).replace(season);
    console.log("WRITE OK");
})().catch(function (e) { console.error(e); process.exit(1); });
