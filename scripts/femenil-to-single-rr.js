// Convert LOMBA Femenil seasons (Primera, Segunda, Juvenil) from double
// round robin to single round robin. For each unordered pair of teams,
// keep exactly one schedule entry:
//   - prefer completed over unplayed
//   - if both completed: keep alphabetically-first home, delete the other box score
//   - if neither completed: keep alphabetically-first home
// Excess completed games delete their box scores; an outer pass triggers a
// Season Stats recompute via the admin endpoint at the end.

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
var db = client.database("DRMBL Database");
var seasonsContainer = db.container("Seasons");
var boxScoresContainer = db.container("Box Scores");

var APPLY = process.argv.indexOf("--apply") !== -1;

var SEASON_IDS = [
    "LOMBA - Femenil Primera Fuerza - 2025-2026",
    "LOMBA - Femenil Segunda Fuerza - 2025-2026",
    "LOMBA - Femenil Juvenil - 2025-2026",
];

function pairKey(home, away) {
    var pair = [home, away].sort();
    return pair[0] + "|" + pair[1];
}

function pickKeeper(entries) {
    // Sort: completed first; within completed, alphabetically-first home wins.
    var completed = entries.filter(function (e) { return e.completion || (e.winner && e.winner !== ""); });
    var pool = completed.length > 0 ? completed : entries;
    pool.sort(function (a, b) { return a.home.localeCompare(b.home); });
    return pool[0];
}

async function processSeason(seasonId) {
    var { resource: season } = await seasonsContainer.item(seasonId, seasonId).read();
    if (!season) { console.error("MISS:", seasonId); return; }

    var sched = season.schedule || [];
    var totalBefore = 0;
    var allByPair = {};
    sched.forEach(function (dg) {
        (dg.games || []).forEach(function (g) {
            totalBefore++;
            var key = pairKey(g.home, g.away);
            if (!allByPair[key]) allByPair[key] = [];
            allByPair[key].push({ dg: dg, entry: g });
        });
    });

    var deletedBoxScores = [];
    var kept = 0, dropped = 0;
    Object.keys(allByPair).forEach(function (pair) {
        var pairEntries = allByPair[pair].map(function (x) { return x.entry; });
        if (pairEntries.length === 1) { kept++; return; }

        var keeper = pickKeeper(pairEntries);
        pairEntries.forEach(function (e) {
            if (e === keeper) return;
            dropped++;
            // Remove from its date group
            var owner = allByPair[pair].find(function (x) { return x.entry === e; });
            owner.dg.games = (owner.dg.games || []).filter(function (g) { return g !== e; });
            // If this was a completed game, mark its box score for deletion
            var isCompleted = e.completion || (e.winner && e.winner !== "");
            if (isCompleted && e.id) deletedBoxScores.push(e.id);
        });
        kept++;
    });

    // Drop empty date groups
    season.schedule = sched.filter(function (dg) { return (dg.games || []).length > 0; });

    var totalAfter = (season.schedule || []).reduce(function (a, dg) { return a + (dg.games || []).length; }, 0);

    console.log("=== " + seasonId + " ===");
    console.log("  games before: " + totalBefore + " | after: " + totalAfter + " | dropped: " + dropped);
    console.log("  unique pairs kept:", kept);
    console.log("  box scores to delete:", deletedBoxScores.length);
    deletedBoxScores.forEach(function (id) { console.log("    -", id); });

    if (!APPLY) return { deletedBoxScores: deletedBoxScores };

    // Write the season doc
    await seasonsContainer.item(seasonId, seasonId).replace(season);
    console.log("  SEASON UPDATED");

    // Delete the excess box scores
    for (var i = 0; i < deletedBoxScores.length; i++) {
        var bid = deletedBoxScores[i];
        try {
            await boxScoresContainer.item(bid, bid).delete();
            console.log("  BOX SCORE DELETED:", bid);
        } catch (e) {
            if (e.code === 404) console.log("  already gone:", bid);
            else console.error("  delete failed:", bid, e.message);
        }
    }

    return { deletedBoxScores: deletedBoxScores };
}

(async function () {
    for (var i = 0; i < SEASON_IDS.length; i++) {
        await processSeason(SEASON_IDS[i]);
        console.log("");
    }
    if (!APPLY) console.log("(dry run — re-run with --apply to commit)");
    else console.log("DONE — remember to trigger Season Stats recompute via admin endpoint");
})().catch(function (e) { console.error(e); process.exit(1); });
