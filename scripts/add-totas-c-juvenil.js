// Add Totas C to Femenil Juvenil at the next open slot.
// Creates team doc, adds to season.teams[], and pushes 12 placeholder
// games (6 opponents × home/away).

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
var teamsContainer = db.container("Teams");

var APPLY = process.argv.indexOf("--apply") !== -1;

var TEAM_NAME = "Totas C";
var SEASON_ID = "LOMBA - Femenil Juvenil - 2025-2026";
var TEAM_ID = "LOMBA.Totas_C.Femenil.Juvenil";

var PLACEHOLDER_ISO = "2025-04-05";
var PLACEHOLDER_DATE_ENTRY = { year: 2025, month: 4, date: 5 };

function asciiSlug(s) { return s.normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[''`"]/g, "").trim(); }
function teamSlug(name) { return asciiSlug(name).replace(/\s+/g, "_"); }
function lombaSeasonSlug(seasonId) {
    return seasonId.replace(/^LOMBA - /, "").replace(/[''`]/g, "").replace(/ - /g, "_").replace(/\s+/g, "_");
}
function makeBoxScoreID(seasonId, homeName, awayName, gameDate) {
    return ["LOMBA", lombaSeasonSlug(seasonId), teamSlug(homeName) + "_vs_" + teamSlug(awayName), gameDate].join(".");
}
function slotLetter(i) { return String.fromCharCode(65 + i); }

(async function () {
    var { resource: season } = await seasonsContainer.item(SEASON_ID, SEASON_ID).read();
    if (!season) { console.error("ABORT: season not found"); process.exit(1); }

    var alreadyPresent = (season.teams || []).some(function (t) { return t.name === TEAM_NAME; });
    var newSlot = slotLetter((season.teams || []).length);
    var oldTeams = (season.teams || []).length;
    var oldGames = (season.schedule || []).reduce(function (a, dg) { return a + (dg.games || []).length; }, 0);

    var opponents = (season.teams || []).filter(function (t) { return t.name !== TEAM_NAME; }).map(function (t) { return t.name; });
    var newGames = [];
    for (var i = 0; i < opponents.length; i++) {
        var opp = opponents[i];
        newGames.push({
            home: TEAM_NAME, away: opp,
            id: makeBoxScoreID(SEASON_ID, TEAM_NAME, opp, PLACEHOLDER_ISO),
            time: null, homeScore: null, awayScore: null, winner: "", forfeit: false,
        });
        newGames.push({
            home: opp, away: TEAM_NAME,
            id: makeBoxScoreID(SEASON_ID, opp, TEAM_NAME, PLACEHOLDER_ISO),
            time: null, homeScore: null, awayScore: null, winner: "", forfeit: false,
        });
    }

    console.log("=== Add " + TEAM_NAME + " to " + SEASON_ID + " ===");
    console.log("  already in season.teams:", alreadyPresent);
    console.log("  teams: " + oldTeams + " -> " + (oldTeams + (alreadyPresent ? 0 : 1)));
    console.log("  new slot:", newSlot);
    console.log("  new schedule games to add:", newGames.length);
    console.log("  games: " + oldGames + " -> " + (oldGames + newGames.length));

    var teamDocExists = false;
    try { var r = await teamsContainer.item(TEAM_ID, TEAM_ID).read(); teamDocExists = !!r.resource; } catch (e) { if (e.code !== 404) throw e; }
    console.log("  team doc exists:", teamDocExists);

    if (!APPLY) { console.log("\n(dry run — re-run with --apply to commit)"); return; }

    if (!alreadyPresent) season.teams.push({ slot: newSlot, teamID: TEAM_ID, name: TEAM_NAME });

    var placeholderGroup = (season.schedule || []).find(function (dg) { return dg.date && dg.date.year === PLACEHOLDER_DATE_ENTRY.year && dg.date.month === PLACEHOLDER_DATE_ENTRY.month && dg.date.date === PLACEHOLDER_DATE_ENTRY.date; });
    if (!placeholderGroup) {
        placeholderGroup = { date: PLACEHOLDER_DATE_ENTRY, games: [] };
        if (!season.schedule) season.schedule = [];
        season.schedule.push(placeholderGroup);
    }
    for (var k = 0; k < newGames.length; k++) placeholderGroup.games.push(newGames[k]);

    await seasonsContainer.item(SEASON_ID, SEASON_ID).replace(season);
    console.log("\nSEASON DOC UPDATED");

    if (!teamDocExists) {
        await teamsContainer.items.upsert({
            id: TEAM_ID,
            name: TEAM_NAME,
            origin: { city: "Cd. Acuña", state: "Coahuila", country: "México" },
            owner: { name: null, phone: null, email: null },
            status: { registered: true, active: true, inactive: false, disbanded: false },
            seasons: [{ id: SEASON_ID, teamSlot: newSlot, roster: [] }],
        });
        console.log("TEAM DOC CREATED");
    }

    console.log("\nDONE");
})().catch(function (e) { console.error(e); process.exit(1); });
