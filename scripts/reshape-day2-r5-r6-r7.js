// Reshape Day 2 post-R4 schedule:
//   - Retire 19:20 C3 TBD R5 (no R5 game at 7:20 anymore; replace with "-")
//   - 19:40 C1, C2, C3, C4 = R5 (fillPriority 1, 2, 3, 4)
//   - 20:00 C1, C2, C4, C3 = R6 (fillPriority 5, 6, 7, 8) — C3 last
//   - 20:20 C1 = R7 (fillPriority 9)
//
// All open TBDs from 19:40 onward are deleted and recreated fresh.

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
var DATE_ISO = "2026-06-03";

function tbdGame(time, court, round, fillPriority) {
    return {
        id: "L3X3.Varonil_Libre_2026.TBD.R" + round + "." + DATE_ISO + "." + time.replace(":", "") + ".C" + court,
        home: "TBD", away: "TBD",
        homeTeamID: null, awayTeamID: null, homeSeed: null, awaySeed: null,
        round: round, court: court, time: time, wave: time,
        completion: false, winner: "", loser: "",
        homeScore: null, awayScore: null, forfeit: false, boxScoreId: null,
        isPlaceholder: true,
        fillPriority: fillPriority,
    };
}

function emptySlot(time, court) {
    return {
        id: "L3X3.Varonil_Libre_2026.EMPTY." + DATE_ISO + "." + time.replace(":", "") + ".C" + court,
        home: "-", away: "-",
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
    if (!day2) { console.error("ABORT"); process.exit(1); }

    var before = day2.games.length;

    // Keep: 19:00 (all), 19:20 C1/C2/C4 (R4 games), 19:20 C3 if it's not a TBD (sanity)
    // Drop: 19:20 C3 TBD + everything from 19:40 onward that's an open TBD
    day2.games = day2.games.filter(function (g) {
        // Keep all completed games (non-placeholder)
        if (!g.isPlaceholder) return true;
        // Drop 19:20 C3 TBD (replaced by empty "-")
        if (g.time === "19:20" && g.court === 3) return false;
        // Drop anything >= 19:40
        if (g.time >= "19:40") return false;
        // Keep other TBDs (19:00 C3/C4 "-" markers)
        return true;
    });

    // Add empty slot at 19:20 C3 (replacement for the retired R5 TBD)
    day2.games.push(emptySlot("19:20", 3));

    // R5 TBDs: 19:40 C1-C4
    day2.games.push(tbdGame("19:40", 1, 5, 1));
    day2.games.push(tbdGame("19:40", 2, 5, 2));
    day2.games.push(tbdGame("19:40", 3, 5, 3));
    day2.games.push(tbdGame("19:40", 4, 5, 4));

    // R6 TBDs: 20:00 with priority C1, C2, C4, C3
    day2.games.push(tbdGame("20:00", 1, 6, 5));
    day2.games.push(tbdGame("20:00", 2, 6, 6));
    day2.games.push(tbdGame("20:00", 4, 6, 7));
    day2.games.push(tbdGame("20:00", 3, 6, 8));

    // R7 final: 20:20 C1
    day2.games.push(tbdGame("20:20", 1, 7, 9));

    day2.games.sort(function (a, b) { return (a.time || "").localeCompare(b.time || "") || (a.court || 0) - (b.court || 0); });

    console.log("before:", before, "after:", day2.games.length);
    console.log("\nFinal Day 2 layout:");
    day2.games.forEach(function (g) {
        var label = g.isPlaceholder ? (g.home === "-" ? "[—]" : ("[TBD R" + g.round + " fp" + (g.fillPriority || "—") + "]")) : ("[" + g.home + " vs " + g.away + " R" + g.round + "]");
        console.log("  " + g.time + " C" + g.court + " " + label);
    });

    await seasonsContainer.item(SEASON_ID, SEASON_ID).replace(season);
    console.log("\nWRITE OK");
})().catch(function (e) { console.error(e); process.exit(1); });
