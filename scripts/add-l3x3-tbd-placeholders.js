// Pre-fill TBD placeholder slots for Day 1 timeslots that don't have games yet.
// Lets external UIs render the full evening playing schedule. As the bracket
// advances, the wave-advance logic in api/lomba.js will overwrite these TBDs
// with real matchups at the same (date, time, court) coordinate.

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

var DAY1_DATE = { year: 2026, month: 6, date: 1 };
var DAY1_ISO = "2026-06-01";
var TBD_TIMESLOTS = ["20:00", "20:30", "21:00", "21:30", "22:00", "22:30"];
var COURTS = [1, 2, 3, 4];

function tbdGame(time, court) {
    return {
        id: "L3X3.Varonil_Libre_2026.TBD." + DAY1_ISO + "." + time.replace(":", "") + ".C" + court,
        home: "TBD",
        away: "TBD",
        homeTeamID: null,
        awayTeamID: null,
        homeSeed: null,
        awaySeed: null,
        round: null,
        court: court,
        time: time,
        wave: time,
        completion: false,
        winner: "",
        loser: "",
        homeScore: null,
        awayScore: null,
        forfeit: false,
        boxScoreId: null,
        isPlaceholder: true,
    };
}

(async function () {
    var { resource: season } = await seasonsContainer.item(SEASON_ID, SEASON_ID).read();
    if (!season) { console.error("ABORT: season not found"); process.exit(1); }

    // Locate Day 1 date group
    var day1Group = (season.schedule || []).find(function (dg) {
        return dg.date && dg.date.year === DAY1_DATE.year && dg.date.month === DAY1_DATE.month && dg.date.date === DAY1_DATE.date;
    });
    if (!day1Group) { console.error("ABORT: Day 1 date group not in schedule"); process.exit(1); }

    var existingByKey = {};
    (day1Group.games || []).forEach(function (g) { existingByKey[g.time + "|C" + g.court] = g; });

    var toAdd = [];
    TBD_TIMESLOTS.forEach(function (time) {
        COURTS.forEach(function (court) {
            var key = time + "|C" + court;
            if (!existingByKey[key]) toAdd.push(tbdGame(time, court));
        });
    });

    console.log("=== L3X3 Day 1 TBD placeholder fill ===");
    console.log("  existing games on Day 1:", (day1Group.games || []).length);
    console.log("  TBD timeslots:", TBD_TIMESLOTS.join(", "));
    console.log("  placeholders to add:", toAdd.length);

    if (!APPLY) { console.log("\n(dry run — re-run with --apply to commit)"); return; }
    if (toAdd.length === 0) { console.log("\nnothing to do"); return; }

    day1Group.games = (day1Group.games || []).concat(toAdd);
    await seasonsContainer.item(SEASON_ID, SEASON_ID).replace(season);
    console.log("\nWRITE OK");
})().catch(function (e) { console.error(e); process.exit(1); });
