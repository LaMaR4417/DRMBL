// Pre-populate each LOMBA Femenil season's schedule[] with all double
// round-robin matchups, using save-flow-compatible IDs so future saves
// match in place.

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

// Mirrors api/lomba.js: asciiSlug + teamSlug + lombaSeasonSlug
function asciiSlug(s) { return s.normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[''`"]/g, "").trim(); }
function teamSlug(name) { return asciiSlug(name).replace(/\s+/g, "_"); }
function lombaSeasonSlug(seasonId) {
    return seasonId.replace(/^LOMBA - /, "").replace(/[''`]/g, "").replace(/ - /g, "_").replace(/\s+/g, "_");
}
function makeBoxScoreID(seasonId, homeName, awayName, gameDate) {
    return ["LOMBA", lombaSeasonSlug(seasonId), teamSlug(homeName) + "_vs_" + teamSlug(awayName), gameDate].join(".");
}

var PLACEHOLDER_ISO = "2025-04-05";
var PLACEHOLDER_DATE_ENTRY = { year: 2025, month: 4, date: 5 };

var TARGETS = [
    "LOMBA - Femenil Primera Fuerza - 2025-2026",
    "LOMBA - Femenil Segunda Fuerza - 2025-2026",
    "LOMBA - Femenil Juvenil - 2025-2026",
];

function buildMatchupsFor(season) {
    var teams = (season.teams || []).map(function (t) { return t.name; });
    var games = [];
    // Double round robin: every ordered pair (home, away) where home != away
    for (var i = 0; i < teams.length; i++) {
        for (var j = 0; j < teams.length; j++) {
            if (i === j) continue;
            var home = teams[i];
            var away = teams[j];
            games.push({
                home: home,
                away: away,
                id: makeBoxScoreID(season.id, home, away, PLACEHOLDER_ISO),
                time: null,
                homeScore: null,
                awayScore: null,
                winner: "",
                forfeit: false,
            });
        }
    }
    return games;
}

async function processSeason(seasonId) {
    var { resource: season } = await seasonsContainer.item(seasonId, seasonId).read();
    if (!season) { console.error("MISS:", seasonId); return; }
    console.log("=== " + seasonId + " ===");
    console.log("  teams:", (season.teams || []).length);
    console.log("  existing schedule date groups:", (season.schedule || []).length);

    var games = buildMatchupsFor(season);
    console.log("  generated matchups:", games.length);

    // Don't run if schedule already has entries — avoid clobbering real games
    if ((season.schedule || []).length > 0) {
        console.log("  SKIP: season.schedule already has entries — refusing to overwrite");
        return;
    }

    var dateGroup = { date: PLACEHOLDER_DATE_ENTRY, games: games };

    if (APPLY) {
        season.schedule = [dateGroup];
        await seasonsContainer.item(seasonId, seasonId).replace(season);
        console.log("  WRITE OK — " + games.length + " placeholders in date " + PLACEHOLDER_ISO);
    } else {
        console.log("  WOULD WRITE date group:", JSON.stringify(dateGroup.date), "with", games.length, "games");
        console.log("  sample game:", JSON.stringify(games[0]));
    }
    console.log("");
}

(async function () {
    for (var i = 0; i < TARGETS.length; i++) await processSeason(TARGETS[i]);
    if (!APPLY) console.log("(dry run — re-run with --apply to commit)");
})().catch(function (e) { console.error(e); process.exit(1); });
