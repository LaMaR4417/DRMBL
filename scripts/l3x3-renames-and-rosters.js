// L3X3: rename TBD A -> P.LEP, TBD B -> P. Wagon. Apply rosters to:
//   P.LEP    : Javier Sandoval Alarcón, Roberto Carlos Mijares Herrera,
//              Fernando Reyes, Salvador Cruz Vargas
//   Lobos    : Francisco Avendaño, Hugo Lopez, Fidencio Hernandez, Diego Encinas
//   P. Wagon : Alexis, Leo, Hector, David Salvador
// Mirrors seed-l3x3-rosters.js's player-doc handling (search by name,
// link if exactly one match, else create new).

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
var playersContainer = db.container("Players");

var APPLY = process.argv.indexOf("--apply") !== -1;
var SEASON_ID = "L3X3 - Varonil Libre - 2026";
var LEAGUE_ID = "L3X3";

var RENAMES = [
    { oldName: "TBD A", oldId: "L3X3.TBD_A.Varonil.Libre", newName: "P.LEP", newId: "L3X3.P.LEP.Varonil.Libre" },
    { oldName: "TBD B", oldId: "L3X3.TBD_B.Varonil.Libre", newName: "P. Wagon", newId: "L3X3.P._Wagon.Varonil.Libre" },
];

var ROSTERS = [
    { team: "P.LEP", teamID: "L3X3.P.LEP.Varonil.Libre", players: ["Javier Sandoval Alarcón", "Roberto Carlos Mijares Herrera", "Fernando Reyes", "Salvador Cruz Vargas"] },
    { team: "Lobos", teamID: "L3X3.Lobos.Varonil.Libre", players: ["Francisco Avendaño", "Hugo Lopez", "Fidencio Hernandez", "Diego Encinas"] },
    { team: "P. Wagon", teamID: "L3X3.P._Wagon.Varonil.Libre", players: ["Alexis", "Leo", "Hector", "David Salvador"] },
];

function normalizeName(name) {
    return name.normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^A-Za-z0-9]+/g, "_").replace(/^_+|_+$/g, "");
}

function buildPlayerDoc(name, id, teamName, teamID, seasonID, leagueID) {
    return {
        id: id, name: name, uniqueNumber: null,
        bio: { position: { primary: "", secondary: [] }, weight: { lbs: null, kg: null }, height: { feet: null, inches: null, cm: null }, dob: { date: null, month: null, year: null, iso: null } },
        teams: [{ name: teamName, teamID: teamID, seasonID: seasonID, leagueID: leagueID, jerseyNumbers: [] }],
        statProfileID: id, games: []
    };
}

async function getNextUniqueNumber() {
    var { resources } = await playersContainer.items
        .query("SELECT VALUE MAX(c.uniqueNumber) FROM c WHERE IS_NUMBER(c.uniqueNumber)")
        .fetchAll();
    return ((resources[0] || 0)) + 1;
}

async function findPlayersByName(name) {
    var { resources } = await playersContainer.items
        .query({ query: "SELECT * FROM c WHERE c.name = @n", parameters: [{ name: "@n", value: name }] })
        .fetchAll();
    return resources;
}

async function renameTeam(season, rn) {
    var oldDoc = null;
    try { var { resource } = await teamsContainer.item(rn.oldId, rn.oldId).read(); oldDoc = resource || null; } catch (e) { if (e.code !== 404) throw e; }
    var newExists = false;
    try { var { resource: r2 } = await teamsContainer.item(rn.newId, rn.newId).read(); newExists = !!r2; } catch (e) { if (e.code !== 404) throw e; }

    console.log("Rename: " + rn.oldName + " -> " + rn.newName);
    console.log("  old team doc exists:", !!oldDoc, "| new team doc exists:", newExists);

    if (!oldDoc && newExists) { console.log("  SKIP — already renamed"); return; }
    if (!oldDoc) { console.error("  ABORT: neither old nor new team doc exists"); process.exit(1); }

    if (!APPLY) { console.log("  WOULD rename team doc + update season.teams[] + bracket records + schedule entries"); return; }

    // Create new team doc with same content + updated id/name
    var newDoc = JSON.parse(JSON.stringify(oldDoc));
    newDoc.id = rn.newId;
    newDoc.name = rn.newName;
    delete newDoc._rid; delete newDoc._self; delete newDoc._etag; delete newDoc._attachments; delete newDoc._ts;
    await teamsContainer.items.create(newDoc);
    await teamsContainer.item(rn.oldId, rn.oldId).delete();

    // Update season.teams[]
    (season.teams || []).forEach(function (t) {
        if (t.teamID === rn.oldId) { t.teamID = rn.newId; t.name = rn.newName; }
    });

    // Update bracket.records (re-key)
    if (season.bracket && season.bracket.records && season.bracket.records[rn.oldId]) {
        season.bracket.records[rn.newId] = season.bracket.records[rn.oldId];
        delete season.bracket.records[rn.oldId];
    }

    // Update schedule entries that reference the old team
    (season.schedule || []).forEach(function (dg) {
        (dg.games || []).forEach(function (g) {
            if (g.homeTeamID === rn.oldId) { g.homeTeamID = rn.newId; g.home = rn.newName; }
            if (g.awayTeamID === rn.oldId) { g.awayTeamID = rn.newId; g.away = rn.newName; }
            // Rewrite the game id if it contained the old team slug
            var oldSlugIn = g.id && g.id.indexOf(rn.oldId.split(".")[1]) !== -1;
            if (oldSlugIn) {
                var newSlug = rn.newId.split(".")[1];
                var oldSlug = rn.oldId.split(".")[1];
                g.id = g.id.replace(oldSlug, newSlug);
            }
        });
    });

    console.log("  RENAMED");
}

async function applyRoster(season, roster) {
    var { resource: teamDoc } = await teamsContainer.item(roster.teamID, roster.teamID).read();
    if (!teamDoc) { console.error("MISS team:", roster.teamID); return; }
    var seasonEntry = (teamDoc.seasons || []).find(function (s) { return s.id === SEASON_ID; });
    if (!seasonEntry) { console.error("MISS season entry on team", roster.teamID); return; }
    if (!seasonEntry.roster) seasonEntry.roster = [];

    console.log("Roster: " + roster.team + " [" + roster.teamID + "]");

    var nextUnique = await getNextUniqueNumber();

    for (var p = 0; p < roster.players.length; p++) {
        var pname = roster.players[p];
        var matches = await findPlayersByName(pname);
        var playerID, action;
        if (matches.length === 1) {
            playerID = matches[0].id;
            action = "LINK existing " + playerID;
            if (APPLY) {
                var existing = matches[0];
                if (!existing.teams) existing.teams = [];
                var already = existing.teams.some(function (tt) { return tt.teamID === roster.teamID && tt.seasonID === SEASON_ID; });
                if (!already) {
                    existing.teams.push({ name: roster.team, teamID: roster.teamID, seasonID: SEASON_ID, leagueID: LEAGUE_ID, jerseyNumbers: [] });
                    await playersContainer.items.upsert(existing);
                }
            }
        } else {
            playerID = normalizeName(pname) + "$" + nextUnique;
            action = "NEW " + playerID + (matches.length > 1 ? " (ambiguous: " + matches.length + " matches)" : " (no match)");
            if (APPLY) {
                var newPlayer = buildPlayerDoc(pname, playerID, roster.team, roster.teamID, SEASON_ID, LEAGUE_ID);
                newPlayer.uniqueNumber = nextUnique;
                await playersContainer.items.upsert(newPlayer);
            }
            nextUnique++;
        }
        console.log("    '" + pname + "' -> " + action);

        if (APPLY) {
            var has = seasonEntry.roster.some(function (rr) { return rr.playerID === playerID; });
            if (!has) seasonEntry.roster.push({ name: pname, playerID: playerID });
        }
    }

    if (APPLY) await teamsContainer.items.upsert(teamDoc);
}

(async function () {
    var { resource: season } = await seasonsContainer.item(SEASON_ID, SEASON_ID).read();
    if (!season) { console.error("ABORT: season not found"); process.exit(1); }

    console.log("=== PHASE 1: renames ===");
    for (var i = 0; i < RENAMES.length; i++) await renameTeam(season, RENAMES[i]);

    if (APPLY) {
        await seasonsContainer.item(SEASON_ID, SEASON_ID).replace(season);
        console.log("\nSeason doc updated after renames");
    }

    console.log("\n=== PHASE 2: rosters ===");
    for (var r = 0; r < ROSTERS.length; r++) await applyRoster(season, ROSTERS[r]);

    if (!APPLY) console.log("\n(dry run — re-run with --apply to commit)");
    else console.log("\nDONE");
})().catch(function (e) { console.error(e); process.exit(1); });
