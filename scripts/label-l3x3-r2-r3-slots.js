// Pre-label the next chronological TBD placeholders as round 2 and round 3.
// R2 = 9 slots (4 W-W + 4 L-L + 1 cross-pair). R3 = 7 slots (6 guaranteed
// + 1 conditional from the cross-pair outcome). Anything past that stays
// unlabeled (will be filled later as R4+).
//
// Skips the 19:00 TBD (still inside R1's time window — can't be used for R2
// since R1 results aren't in yet).

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

// Last R1 timeslot — TBDs at this time or earlier can't be R2 (R1 results not in)
var R1_TIME_BOUNDARY = "19:40";

var R2_SLOTS = 9;
var R3_SLOTS = 7;

function timeRank(t) {
    var parts = t.split(":");
    return parseInt(parts[0], 10) * 60 + parseInt(parts[1], 10);
}

(async function () {
    var { resource: season } = await seasonsContainer.item(SEASON_ID, SEASON_ID).read();
    if (!season) { console.error("ABORT: season not found"); process.exit(1); }

    var allTBDs = [];
    (season.schedule || []).forEach(function (dg) {
        (dg.games || []).forEach(function (g) {
            if (g.isPlaceholder) allTBDs.push(g);
        });
    });

    // Sort chronologically (time, court). Filter to only those >= R1 time boundary.
    allTBDs.sort(function (a, b) {
        var t = timeRank(a.time || "") - timeRank(b.time || "");
        return t !== 0 ? t : (a.court || 0) - (b.court || 0);
    });
    var eligibleForR2 = allTBDs.filter(function (g) { return timeRank(g.time || "") >= timeRank(R1_TIME_BOUNDARY); });

    var r2Targets = eligibleForR2.slice(0, R2_SLOTS);
    var r3Targets = eligibleForR2.slice(R2_SLOTS, R2_SLOTS + R3_SLOTS);

    console.log("All TBD placeholders:", allTBDs.length);
    console.log("Eligible for R2+ (time >= " + R1_TIME_BOUNDARY + "):", eligibleForR2.length);
    console.log("");
    console.log("Will label R2 (" + r2Targets.length + " slots):");
    r2Targets.forEach(function (g) { console.log("  " + g.time + " C" + g.court + "  (currently round=" + g.round + ")"); });
    console.log("");
    console.log("Will label R3 (" + r3Targets.length + " slots):");
    r3Targets.forEach(function (g) { console.log("  " + g.time + " C" + g.court + "  (currently round=" + g.round + ")"); });
    console.log("");
    var unlabeled = eligibleForR2.length - r2Targets.length - r3Targets.length;
    console.log("Unlabeled (R4+):", unlabeled, "slots remain");
    var skippedR1 = allTBDs.length - eligibleForR2.length;
    if (skippedR1 > 0) console.log("Skipped (during R1 time window):", skippedR1);

    if (!APPLY) { console.log("\n(dry run — re-run with --apply to commit)"); return; }

    r2Targets.forEach(function (g) { g.round = 2; });
    r3Targets.forEach(function (g) { g.round = 3; });

    await seasonsContainer.item(SEASON_ID, SEASON_ID).replace(season);
    console.log("\nWRITE OK");
})().catch(function (e) { console.error(e); process.exit(1); });
