// Fix tonight's bracket: R7 intermediate ran correctly (Babatundes beat
// Helios), but the engine failed to place a bye for #1 (Old School)
// because findNextTBD ran out of R7 slots. As a result, R8 final was
// never paired and the champion was incorrectly set to Babatundes.
//
// This script:
//   1. Clears the incorrect champion
//   2. Fills the 20:40 C1 TBD with the R8 final: Old School vs The Babatundes
//      (bucket: "final" so the save handler will declare champion correctly
//      when this game saves)

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
var OS_ID = "L3X3.Old_School.Varonil.Libre";
var BABATUNDES_ID = "L3X3.The_Babatundes.Varonil.Libre";
var DATE_ISO = "2026-06-03";

(async function () {
    var { resource: season } = await seasonsContainer.item(SEASON_ID, SEASON_ID).read();

    // 1. Clear wrong champion
    console.log("Champion was:", season.bracket && season.bracket.champion);
    if (season.bracket) season.bracket.champion = null;

    // 2. Look up team data
    var osTeam = (season.teams || []).find(function (t) { return (t.teamID || t.id) === OS_ID; });
    var bbTeam = (season.teams || []).find(function (t) { return (t.teamID || t.id) === BABATUNDES_ID; });
    if (!osTeam) { console.error("ABORT: Old School team not found"); process.exit(1); }
    if (!bbTeam) { console.error("ABORT: The Babatundes team not found"); process.exit(1); }

    var day2 = (season.schedule || []).find(function (dg) { return dg.date.year === 2026 && dg.date.month === 6 && dg.date.date === 3; });
    if (!day2) { console.error("ABORT: no Day 2"); process.exit(1); }

    // 3. Find 20:40 C1 slot (R8 TBD)
    var slotIdx = day2.games.findIndex(function (g) { return g.time === "20:40" && g.court === 1; });
    if (slotIdx === -1) { console.error("ABORT: no 20:40 C1 slot found"); process.exit(1); }
    var existing = day2.games[slotIdx];
    console.log("Existing 20:40 C1:", existing.home, "vs", existing.away, "(round=" + existing.round + ")");
    if (!existing.isPlaceholder) { console.error("ABORT: 20:40 C1 already has a real game"); process.exit(1); }

    var newEntry = {
        id: "L3X3.Varonil_Libre_2026.Old_School_vs_The_Babatundes." + DATE_ISO + ".2040.C1",
        home: "Old School",
        away: "The Babatundes",
        homeTeamID: OS_ID,
        awayTeamID: BABATUNDES_ID,
        homeSeed: osTeam.seed || null,
        awaySeed: bbTeam.seed || null,
        round: 8,
        court: 1,
        time: "20:40",
        wave: "20:40",
        bucket: "final",
        completion: false,
        winner: "",
        loser: "",
        homeScore: null,
        awayScore: null,
        forfeit: false,
        boxScoreId: null,
        isPlaceholder: false,
    };

    day2.games[slotIdx] = newEntry;
    day2.games.sort(function (a, b) { return (a.time || "").localeCompare(b.time || "") || (a.court || 0) - (b.court || 0); });

    console.log("\nPlaced R8 final at 20:40 C1:");
    console.log("  Old School vs The Babatundes (bucket: final)");

    await seasonsContainer.item(SEASON_ID, SEASON_ID).replace(season);
    console.log("\nWRITE OK — champion cleared, R8 final ready for recording");
})().catch(function (e) { console.error(e); process.exit(1); });
