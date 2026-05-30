// Scaffold the new LOMBA 3x3 league. Creates the Leagues doc and a single
// empty Varonil Libre season doc for 2026. Idempotent — safe to re-run.

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
var leaguesContainer = db.container("Leagues");
var seasonsContainer = db.container("Seasons");

var APPLY = process.argv.indexOf("--apply") !== -1;

var LEAGUE_ID = "L3X3";
var FULL_NAME = "Liga Oficial Municipal de Basketball Acuña 3x3";
var SEASON_NAME = "2026";
var SEASON_ID = "L3X3 - Varonil Libre - 2026";
var DIVISION_FULL = "Varonil Libre";
var TIMELINE = {
    beginning: { year: 2026, month: 6, date: 1 },
    end: { year: 2026, month: 6, date: 5 },
};

var leagueDoc = {
    id: LEAGUE_ID,
    league: {
        fullName: FULL_NAME,
        abbreviation: LEAGUE_ID,
        seasons: [
            {
                name: SEASON_NAME,
                data: {
                    divisions: {
                        varonil: ["Libre"],
                    },
                },
            },
        ],
        activeSeasons: [SEASON_ID],
    },
};

var seasonDoc = {
    id: SEASON_ID,
    league: {
        fullName: FULL_NAME,
        abbreviation: LEAGUE_ID,
        season: {
            "league.seasons.name": SEASON_NAME,
            "league.seasons.data.divisions.varonil": "Libre",
        },
    },
    timeline: TIMELINE,
    teams: [],
    schedule: [],
    maxRoster: 4,
    leagueID: LEAGUE_ID,
    division: DIVISION_FULL,
    seasonName: SEASON_NAME,
};

(async function () {
    // === LEAGUE DOC ===
    var existingLeague = null;
    try {
        var { resource } = await leaguesContainer.item(LEAGUE_ID, LEAGUE_ID).read();
        existingLeague = resource || null;
    } catch (e) { if (e.code !== 404) throw e; }

    console.log("=== LEAGUE DOC " + LEAGUE_ID + " ===");
    console.log("  exists:", !!existingLeague);
    if (!existingLeague) {
        console.log("  WILL CREATE:", JSON.stringify(leagueDoc, null, 2));
    } else {
        console.log("  SKIP create — already exists");
    }

    // === SEASON DOC ===
    var existingSeason = null;
    try {
        var { resource: rs } = await seasonsContainer.item(SEASON_ID, SEASON_ID).read();
        existingSeason = rs || null;
    } catch (e) { if (e.code !== 404) throw e; }

    console.log("");
    console.log("=== SEASON DOC " + SEASON_ID + " ===");
    console.log("  exists:", !!existingSeason);
    if (!existingSeason) {
        console.log("  WILL CREATE:", JSON.stringify(seasonDoc, null, 2));
    } else {
        console.log("  SKIP create — already exists");
    }

    if (!APPLY) { console.log("\n(dry run — re-run with --apply to commit)"); return; }

    if (!existingLeague) {
        await leaguesContainer.items.create(leagueDoc);
        console.log("\nLEAGUE DOC CREATED");
    }
    if (!existingSeason) {
        await seasonsContainer.items.create(seasonDoc);
        console.log("SEASON DOC CREATED");
    }

    console.log("\nDONE");
})().catch(function (e) { console.error(e); process.exit(1); });
