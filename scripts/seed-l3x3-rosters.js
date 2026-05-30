// Phase 1: rename Old Shool -> Old School (changes team doc id).
// Phase 2: seed rosters for 14 L3X3 teams (skips Lobos + TBD A).
// Shared players: search Players container by exact name; if one match,
// reuse and append L3X3 team to that player's teams[]. Otherwise create
// a new player doc with the next global uniqueNumber. Within-team name
// duplicates always create new docs (the user has confirmed they're
// distinct humans).

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

var OLD_SHOOL_OLD_ID = "L3X3.Old_Shool.Varonil.Libre";
var OLD_SCHOOL_NEW_ID = "L3X3.Old_School.Varonil.Libre";
var OLD_SCHOOL_NEW_NAME = "Old School";

// Team key here is the team display name AFTER any rename — so use Old School,
// not Old Shool. Player 4 is null where the roster only has 3 players. The
// duplicate Kenneth Aleta has already been removed from R. Blitz.
var ROSTERS = [
    { team: "The Babatundes", players: ["Leonel Arturo Domínguez Aura", "Jesús Gallegos Hernández", "Sebastian Cadena Moreno", "Luis Ángel Juárez Mendez"] },
    { team: "Street Players", players: ["Carlos Romero Hernández", "Moisés Alejandro Hernández Martínez", "David Salazar Padilla", "Roberto Antonio Ávalos Hernández"] },
    { team: "Old School", players: ["José Anguiano García", "Pedro Raúl Loredo Ramos", "José Gloria", "Pablo Hiram Rivera"] },
    { team: "Ouyizz", players: ["Kevin Araiz", "Cristian Velásquez", "Jose Herrera", "Juan Jiménez"] },
    { team: "Helios", players: ["Mario Rangel", "Angel Lopez", "David Carrillo", "Kevin Medrano"] },
    { team: "Los Baggos", players: ["Jesus Daniel Rubio Moreno", "Hector Sanchez Galvan", "Jesus Mario Bonilla Gonzalez", "Azael Ruiz Olvera"] },
    { team: "Los Knicks", players: ["Eduardo Castillo", "Eduardo Castillo", "Gael Castillo", "Anhuar Gabriel Hernandez Villasana"] },
    { team: "Blackbass", players: ["Daniel Adan Moreno Arreola", "Braulio Perez Chaires", "Roberto Espronceda Hernandez"] },
    { team: "UTCA", players: ["César Antonio Santiago Nicolás", "Carlos Ariel Nava Vargas", "Angel Emmanuel Rodriguez Rodriguez"] },
    { team: "Catarrines Team", players: ["Diego Armando Pérez Chacón", "Julio César Ruiz Maldonado", "Angel Gaddiel López Espinosa", "Cress Everardo Rodriguez Muñoz"] },
    { team: "R. Blitz", players: ["Luis Mario Reyes", "Jacob Scott", "Kenneth Aleta"] },
    { team: "Elios 2K26", players: ["José Ángel Castro Flores", "Osvaldo Julian Perez \"Pazzin\"", "José Fernando Reyes Cabello", "Juan Xavier Tanajara Morales"] },
    { team: "Falcons", players: ["Jesús Daniel García Vargas", "Rolando Cervantes Rodriguez", "Luis Enrique Hernandez Martinez", "Juan Carlos Cervantes Rodriguez"] },
    { team: "Lakers", players: ["Edgar Ceniceros", "Aarón Anguiano", "Omar Magadan", "Milton Rodríguez"] },
];

// ===== helpers =====

function normalizeName(name) {
    return name
        .normalize("NFD")
        .replace(/[̀-ͯ]/g, "")
        .replace(/[^A-Za-z0-9]+/g, "_")
        .replace(/^_+|_+$/g, "");
}

function buildPlayerDoc(name, id, teamName, teamID, seasonID, leagueID) {
    return {
        id: id,
        name: name,
        uniqueNumber: null,
        bio: {
            position: { primary: "", secondary: [] },
            weight: { lbs: null, kg: null },
            height: { feet: null, inches: null, cm: null },
            dob: { date: null, month: null, year: null, iso: null }
        },
        teams: [{ name: teamName, teamID: teamID, seasonID: seasonID, leagueID: leagueID, jerseyNumbers: [] }],
        statProfileID: id,
        games: []
    };
}

async function getNextUniqueNumber() {
    var { resources } = await playersContainer.items
        .query("SELECT VALUE MAX(c.uniqueNumber) FROM c WHERE IS_NUMBER(c.uniqueNumber)")
        .fetchAll();
    var max = (resources[0] || 0);
    return max + 1;
}

async function findPlayersByName(name) {
    var { resources } = await playersContainer.items
        .query({ query: "SELECT * FROM c WHERE c.name = @n", parameters: [{ name: "@n", value: name }] })
        .fetchAll();
    return resources;
}

// ===== Phase 1: rename Old Shool -> Old School =====

async function renameOldShool() {
    var oldDoc = null;
    try { var { resource } = await teamsContainer.item(OLD_SHOOL_OLD_ID, OLD_SHOOL_OLD_ID).read(); oldDoc = resource || null; } catch (e) { if (e.code !== 404) throw e; }

    var newDocExists = false;
    try { var { resource: r2 } = await teamsContainer.item(OLD_SCHOOL_NEW_ID, OLD_SCHOOL_NEW_ID).read(); newDocExists = !!r2; } catch (e) { if (e.code !== 404) throw e; }

    console.log("=== PHASE 1: rename Old Shool -> Old School ===");
    console.log("  old team doc exists:", !!oldDoc);
    console.log("  new team doc already exists:", newDocExists);

    if (!oldDoc && newDocExists) { console.log("  SKIP — already renamed"); return; }
    if (!oldDoc) { console.error("  ABORT: neither old nor new team doc exists"); process.exit(1); }

    if (APPLY) {
        var newDoc = JSON.parse(JSON.stringify(oldDoc));
        newDoc.id = OLD_SCHOOL_NEW_ID;
        newDoc.name = OLD_SCHOOL_NEW_NAME;
        delete newDoc._rid; delete newDoc._self; delete newDoc._etag; delete newDoc._attachments; delete newDoc._ts;
        await teamsContainer.items.create(newDoc);
        await teamsContainer.item(OLD_SHOOL_OLD_ID, OLD_SHOOL_OLD_ID).delete();

        var { resource: season } = await seasonsContainer.item(SEASON_ID, SEASON_ID).read();
        for (var t = 0; t < (season.teams || []).length; t++) {
            if (season.teams[t].teamID === OLD_SHOOL_OLD_ID) {
                season.teams[t].teamID = OLD_SCHOOL_NEW_ID;
                season.teams[t].name = OLD_SCHOOL_NEW_NAME;
            }
        }
        await seasonsContainer.item(SEASON_ID, SEASON_ID).replace(season);
        console.log("  RENAME OK");
    } else {
        console.log("  WOULD: create " + OLD_SCHOOL_NEW_ID + " (name 'Old School'), delete " + OLD_SHOOL_OLD_ID + ", update season.teams[] entry");
    }
}

// Returns season doc with any pending in-memory rename applied so phase 2 sees post-rename state in dry run too.
async function readSeasonWithPendingRenames() {
    var { resource: season } = await seasonsContainer.item(SEASON_ID, SEASON_ID).read();
    if (!APPLY) {
        for (var t = 0; t < (season.teams || []).length; t++) {
            if (season.teams[t].teamID === OLD_SHOOL_OLD_ID) {
                season.teams[t].teamID = OLD_SCHOOL_NEW_ID;
                season.teams[t].name = OLD_SCHOOL_NEW_NAME;
            }
        }
    }
    return season;
}

// ===== Phase 2: roster seeding =====

async function seedRosters() {
    console.log("\n=== PHASE 2: roster seeding ===");

    var season = await readSeasonWithPendingRenames();
    var nameToTeam = {};
    (season.teams || []).forEach(function (t) { nameToTeam[t.name] = t; });

    var nextUnique = await getNextUniqueNumber();
    console.log("  starting uniqueNumber:", nextUnique);

    var plans = [];

    for (var r = 0; r < ROSTERS.length; r++) {
        var roster = ROSTERS[r];
        var teamMeta = nameToTeam[roster.team];
        if (!teamMeta) { console.error("  ABORT: team not in season.teams: " + roster.team); process.exit(1); }

        // Detect within-team duplicates so we can force-create for those
        var nameCounts = {};
        roster.players.forEach(function (n) { nameCounts[n] = (nameCounts[n] || 0) + 1; });

        var teamPlan = { team: roster.team, teamID: teamMeta.teamID, slot: teamMeta.slot, players: [] };
        for (var p = 0; p < roster.players.length; p++) {
            var pname = roster.players[p];
            var forceNew = nameCounts[pname] > 1;

            var matches = [];
            if (!forceNew) matches = await findPlayersByName(pname);

            var decision;
            if (forceNew) {
                decision = { action: "create-new", reason: "within-team duplicate" };
            } else if (matches.length === 1) {
                decision = { action: "link", playerID: matches[0].id, existingLeagues: (matches[0].teams || []).map(function (tt) { return tt.leagueID; }) };
            } else if (matches.length > 1) {
                decision = { action: "create-new", reason: "ambiguous (" + matches.length + " existing matches)" };
            } else {
                decision = { action: "create-new", reason: "no match" };
            }

            if (decision.action === "create-new") {
                decision.assignedUnique = nextUnique;
                decision.newPlayerID = normalizeName(pname) + "$" + nextUnique;
                nextUnique++;
            }
            teamPlan.players.push({ name: pname, decision: decision });
        }
        plans.push(teamPlan);
    }

    // Print plan
    console.log("");
    plans.forEach(function (tp) {
        console.log("  " + tp.slot + " | " + tp.team + " [" + tp.teamID + "]");
        tp.players.forEach(function (pp) {
            var d = pp.decision;
            if (d.action === "link") {
                console.log("      LINK  '" + pp.name + "' -> " + d.playerID + "  (in leagues: " + JSON.stringify(d.existingLeagues) + ")");
            } else {
                console.log("      NEW   '" + pp.name + "' -> " + d.newPlayerID + "  (" + d.reason + ")");
            }
        });
    });

    if (!APPLY) return;

    // Apply
    var teamDocCache = {};
    async function getTeamDoc(teamID) {
        if (teamDocCache[teamID]) return teamDocCache[teamID];
        var { resource } = await teamsContainer.item(teamID, teamID).read();
        teamDocCache[teamID] = resource;
        return resource;
    }

    for (var i = 0; i < plans.length; i++) {
        var tp = plans[i];
        var teamDoc = await getTeamDoc(tp.teamID);
        var seasonEntry = (teamDoc.seasons || []).find(function (s) { return s.id === SEASON_ID; });
        if (!seasonEntry) { console.error("ABORT: team doc has no season entry for", SEASON_ID, tp.teamID); process.exit(1); }
        if (!seasonEntry.roster) seasonEntry.roster = [];

        for (var j = 0; j < tp.players.length; j++) {
            var pl = tp.players[j];
            var d = pl.decision;
            var playerID;

            if (d.action === "link") {
                playerID = d.playerID;
                // Read existing player doc, append L3X3 team to teams[] (idempotent)
                var { resource: existing } = await playersContainer.item(playerID, playerID).read();
                if (!existing.teams) existing.teams = [];
                var already = existing.teams.some(function (tt) { return tt.teamID === tp.teamID && tt.seasonID === SEASON_ID; });
                if (!already) {
                    existing.teams.push({ name: tp.team, teamID: tp.teamID, seasonID: SEASON_ID, leagueID: LEAGUE_ID, jerseyNumbers: [] });
                    await playersContainer.items.upsert(existing);
                }
            } else {
                playerID = d.newPlayerID;
                var newPlayer = buildPlayerDoc(pl.name, playerID, tp.team, tp.teamID, SEASON_ID, LEAGUE_ID);
                newPlayer.uniqueNumber = d.assignedUnique;
                await playersContainer.items.upsert(newPlayer);
            }

            // Push onto team roster (idempotent)
            var rosterHas = seasonEntry.roster.some(function (rr) { return rr.playerID === playerID; });
            if (!rosterHas) seasonEntry.roster.push({ name: pl.name, playerID: playerID });
        }

        await teamsContainer.items.upsert(teamDoc);
        console.log("  WROTE: " + tp.team);
    }
}

(async function () {
    await renameOldShool();
    await seedRosters();
    if (!APPLY) console.log("\n(dry run — re-run with --apply to commit)");
    else console.log("\nDONE");
})().catch(function (e) { console.error(e); process.exit(1); });
