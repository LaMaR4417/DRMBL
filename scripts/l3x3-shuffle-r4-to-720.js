// Move two R4 games on Day 2 from 19:00 to 19:20:
//   G1 (Old School vs Street Players)  19:00 C1 → 19:20 C2
//   G4 (R. Blitz vs P. Wagon)          19:00 C4 → 19:20 C3
// 19:00 C1 and C4 stay open (no R4 games). 19:20 C4 remains a TBD for R5.

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

var MOVES = [
    { from: { time: "19:00", court: 1 }, to: { time: "19:20", court: 2 }, expectHome: "Old School", expectAway: "Street Players" },
    { from: { time: "19:00", court: 4 }, to: { time: "19:20", court: 3 }, expectHome: "R. Blitz",   expectAway: "P. Wagon" },
];

function tbdGame(time, court) {
    return {
        id: "L3X3.Varonil_Libre_2026.TBD.2026-06-03." + time.replace(":", "") + ".C" + court,
        home: "TBD", away: "TBD",
        homeTeamID: null, awayTeamID: null, homeSeed: null, awaySeed: null,
        round: null, court: court, time: time, wave: time,
        completion: false, winner: "", loser: "",
        homeScore: null, awayScore: null, forfeit: false, boxScoreId: null,
        isPlaceholder: true,
    };
}

(async function () {
    var { resource: season } = await seasonsContainer.item(SEASON_ID, SEASON_ID).read();
    var day2 = (season.schedule || []).find(function (dg) { return dg.date.year === 2026 && dg.date.month === 6 && dg.date.date === 3; });
    if (!day2) { console.error("ABORT: no Day 2"); process.exit(1); }

    for (var i = 0; i < MOVES.length; i++) {
        var m = MOVES[i];
        var game = (day2.games || []).find(function (g) { return !g.isPlaceholder && g.time === m.from.time && g.court === m.from.court; });
        if (!game) { console.error("ABORT: no real game at", m.from); process.exit(1); }
        if (game.home !== m.expectHome || game.away !== m.expectAway) { console.error("ABORT: wrong matchup at", m.from, "expected", m.expectHome, "vs", m.expectAway, "got", game.home, "vs", game.away); process.exit(1); }

        var targetSlot = (day2.games || []).find(function (g) { return g.time === m.to.time && g.court === m.to.court; });
        console.log("MOVE", game.home, "vs", game.away, "→", m.to.time, "C" + m.to.court, "(target slot is", targetSlot ? (targetSlot.isPlaceholder ? "TBD" : (targetSlot.home + " vs " + targetSlot.away)) : "missing", ")");

        if (!APPLY) continue;

        // Update game's time + court
        game.time = m.to.time;
        game.court = m.to.court;
        game.wave = m.to.time;

        // If target was a TBD, remove it (we're overwriting); if target was an open game, that's a conflict (shouldn't happen here)
        if (targetSlot && targetSlot !== game) {
            if (targetSlot.isPlaceholder) {
                day2.games = day2.games.filter(function (g) { return g !== targetSlot; });
            } else {
                console.error("ABORT: target slot is occupied by a non-placeholder game", targetSlot);
                process.exit(1);
            }
        }

        // Add TBD placeholder at the vacated 19:00 slot
        var existingAtFrom = (day2.games || []).find(function (g) { return g.time === m.from.time && g.court === m.from.court; });
        if (!existingAtFrom) day2.games.push(tbdGame(m.from.time, m.from.court));
    }

    if (!APPLY) { console.log("\n(dry run — re-run with --apply to commit)"); return; }

    day2.games.sort(function (a, b) { return (a.time || "").localeCompare(b.time || "") || (a.court || 0) - (b.court || 0); });
    await seasonsContainer.item(SEASON_ID, SEASON_ID).replace(season);
    console.log("\nWRITE OK");
})().catch(function (e) { console.error(e); process.exit(1); });
