// Move CONALEP from Femenil Juvenil to Femenil Segunda Fuerza.
// Drops CONALEP's Juvenil team doc, season entry, and placeholder games,
// then adds the equivalents in Segunda Fuerza at the next open slot.

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

var TEAM_NAME = "CONALEP";
var JUVENIL_ID = "LOMBA - Femenil Juvenil - 2025-2026";
var SEGUNDA_ID = "LOMBA - Femenil Segunda Fuerza - 2025-2026";
var JUVENIL_TEAM_ID = "LOMBA.CONALEP.Femenil.Juvenil";
var SEGUNDA_TEAM_ID = "LOMBA.CONALEP.Femenil.Segunda_Fuerza";

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
    // ============== JUVENIL: remove CONALEP ==============
    var { resource: juv } = await seasonsContainer.item(JUVENIL_ID, JUVENIL_ID).read();
    if (!juv) { console.error("ABORT: Juvenil season not found"); process.exit(1); }

    var juvHadEntry = (juv.teams || []).some(function (t) { return t.name === TEAM_NAME; });
    var juvOldTeams = (juv.teams || []).length;
    var juvOldGames = (juv.schedule || []).reduce(function (a, dg) { return a + (dg.games || []).length; }, 0);

    var juvNewTeams = (juv.teams || []).filter(function (t) { return t.name !== TEAM_NAME; });
    var juvNewGamesPerGroup = (juv.schedule || []).map(function (dg) {
        return { date: dg.date, games: (dg.games || []).filter(function (g) { return g.home !== TEAM_NAME && g.away !== TEAM_NAME; }) };
    }).filter(function (dg) { return dg.games.length > 0; });
    var juvNewGameCount = juvNewGamesPerGroup.reduce(function (a, dg) { return a + dg.games.length; }, 0);

    console.log("=== JUVENIL: remove " + TEAM_NAME + " ===");
    console.log("  had entry in season.teams:", juvHadEntry);
    console.log("  teams: " + juvOldTeams + " -> " + juvNewTeams.length);
    console.log("  games: " + juvOldGames + " -> " + juvNewGameCount + " (drops " + (juvOldGames - juvNewGameCount) + ")");

    var juvTeamDocExists = false;
    try { var r = await teamsContainer.item(JUVENIL_TEAM_ID, JUVENIL_TEAM_ID).read(); juvTeamDocExists = !!r.resource; } catch (e) { if (e.code !== 404) throw e; }
    console.log("  Juvenil team doc exists (will delete):", juvTeamDocExists);

    // ============== SEGUNDA: add CONALEP ==============
    var { resource: seg } = await seasonsContainer.item(SEGUNDA_ID, SEGUNDA_ID).read();
    if (!seg) { console.error("ABORT: Segunda season not found"); process.exit(1); }

    var segAlreadyHas = (seg.teams || []).some(function (t) { return t.name === TEAM_NAME; });
    var segNewSlot = slotLetter((seg.teams || []).length);
    var segOldTeams = (seg.teams || []).length;
    var segOldGames = (seg.schedule || []).reduce(function (a, dg) { return a + (dg.games || []).length; }, 0);

    var segOtherTeamNames = (seg.teams || []).filter(function (t) { return t.name !== TEAM_NAME; }).map(function (t) { return t.name; });
    var newSegGames = [];
    for (var i = 0; i < segOtherTeamNames.length; i++) {
        var opp = segOtherTeamNames[i];
        newSegGames.push({
            home: TEAM_NAME, away: opp,
            id: makeBoxScoreID(SEGUNDA_ID, TEAM_NAME, opp, PLACEHOLDER_ISO),
            time: null, homeScore: null, awayScore: null, winner: "", forfeit: false,
        });
        newSegGames.push({
            home: opp, away: TEAM_NAME,
            id: makeBoxScoreID(SEGUNDA_ID, opp, TEAM_NAME, PLACEHOLDER_ISO),
            time: null, homeScore: null, awayScore: null, winner: "", forfeit: false,
        });
    }

    console.log("");
    console.log("=== SEGUNDA: add " + TEAM_NAME + " ===");
    console.log("  already in season.teams:", segAlreadyHas);
    console.log("  teams: " + segOldTeams + " -> " + (segOldTeams + (segAlreadyHas ? 0 : 1)));
    console.log("  new slot for " + TEAM_NAME + ":", segNewSlot);
    console.log("  new schedule games to add:", newSegGames.length);
    console.log("  games: " + segOldGames + " -> " + (segOldGames + newSegGames.length));

    var segTeamDocExists = false;
    try { var r2 = await teamsContainer.item(SEGUNDA_TEAM_ID, SEGUNDA_TEAM_ID).read(); segTeamDocExists = !!r2.resource; } catch (e) { if (e.code !== 404) throw e; }
    console.log("  Segunda team doc exists (will create if not):", segTeamDocExists);

    if (!APPLY) { console.log("\n(dry run — re-run with --apply to commit)"); return; }

    // === APPLY: Juvenil ===
    juv.teams = juvNewTeams;
    juv.schedule = juvNewGamesPerGroup;
    await seasonsContainer.item(JUVENIL_ID, JUVENIL_ID).replace(juv);
    console.log("\nJUVENIL season updated");

    if (juvTeamDocExists) {
        await teamsContainer.item(JUVENIL_TEAM_ID, JUVENIL_TEAM_ID).delete();
        console.log("JUVENIL team doc deleted");
    }

    // === APPLY: Segunda ===
    if (!segAlreadyHas) seg.teams.push({ slot: segNewSlot, teamID: SEGUNDA_TEAM_ID, name: TEAM_NAME });

    // Find existing placeholder date group, or create one, and append the new games
    var placeholderGroup = (seg.schedule || []).find(function (dg) { return dg.date && dg.date.year === PLACEHOLDER_DATE_ENTRY.year && dg.date.month === PLACEHOLDER_DATE_ENTRY.month && dg.date.date === PLACEHOLDER_DATE_ENTRY.date; });
    if (!placeholderGroup) {
        placeholderGroup = { date: PLACEHOLDER_DATE_ENTRY, games: [] };
        if (!seg.schedule) seg.schedule = [];
        seg.schedule.push(placeholderGroup);
    }
    for (var k = 0; k < newSegGames.length; k++) placeholderGroup.games.push(newSegGames[k]);
    await seasonsContainer.item(SEGUNDA_ID, SEGUNDA_ID).replace(seg);
    console.log("SEGUNDA season updated");

    if (!segTeamDocExists) {
        await teamsContainer.items.upsert({
            id: SEGUNDA_TEAM_ID,
            name: TEAM_NAME,
            origin: { city: "Cd. Acuña", state: "Coahuila", country: "México" },
            owner: { name: null, phone: null, email: null },
            status: { registered: true, active: true, inactive: false, disbanded: false },
            seasons: [{ id: SEGUNDA_ID, teamSlot: segNewSlot, roster: [] }],
        });
        console.log("SEGUNDA team doc created");
    }

    console.log("\nDONE");
})().catch(function (e) { console.error(e); process.exit(1); });
