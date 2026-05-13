// One-shot: restore null G3 slots in playoff series that were swept then edited.
// Bug: api/lomba.js save-playoff-game nulls remaining games when wins>=2 but
// doesn't restore them if a later edit drops wins below 2.

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

var FIXES = [
    {
        seasonId: "LOMBA - Varonil Segunda Fuerza A - 2025-2026",
        round: "quarterFinals",
        seriesIndex: 2,
        gameIndex: 2,
        home: "Bulls",
        away: "Tigres",
    },
    {
        seasonId: "LOMBA - Varonil Segunda Fuerza B - 2025-2026",
        round: "quarterFinals",
        seriesIndex: 1,
        gameIndex: 2,
        home: "Sigmas",
        away: "CONALEP",
    },
];

function freshSlot(home, away) {
    return {
        id: "",
        home: home,
        away: away,
        homeScore: null,
        awayScore: null,
        winner: "",
        forfeit: false,
        date: null,
        time: null,
        completion: false,
    };
}

(async function () {
    for (var f = 0; f < FIXES.length; f++) {
        var fix = FIXES[f];
        var { resource: doc } = await seasonsContainer.item(fix.seasonId, fix.seasonId).read();
        if (!doc) { console.error("MISS: season not found", fix.seasonId); continue; }

        var series = doc.playoffs && doc.playoffs[fix.round] && doc.playoffs[fix.round][fix.seriesIndex];
        if (!series) { console.error("MISS: series not found", fix.seasonId, fix.round, fix.seriesIndex); continue; }

        var before = series.games[fix.gameIndex];
        console.log("---", fix.seasonId, fix.round, "#" + fix.seriesIndex, series.name1, "vs", series.name2, "---");
        console.log("  wins:", series.seed1Wins + "-" + series.seed2Wins);
        console.log("  games[" + fix.gameIndex + "] before:", before === null ? "null" : JSON.stringify(before));

        // Safety: only restore if currently null AND wins are not a sweep
        if (before !== null) { console.log("  SKIP: slot is not null"); continue; }
        if ((series.seed1Wins || 0) >= 2 || (series.seed2Wins || 0) >= 2) { console.log("  SKIP: series is swept, slot should stay null"); continue; }

        var slot = freshSlot(fix.home, fix.away);
        console.log("  games[" + fix.gameIndex + "] after :", JSON.stringify(slot));

        if (APPLY) {
            series.games[fix.gameIndex] = slot;
            await seasonsContainer.item(fix.seasonId, fix.seasonId).replace(doc);
            console.log("  WRITE OK");
        }
    }

    if (!APPLY) console.log("\n(dry run — re-run with --apply to commit)");
    else console.log("\nDONE");
})().catch(function (e) { console.error(e); process.exit(1); });
