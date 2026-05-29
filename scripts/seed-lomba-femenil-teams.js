// Seed teams into a LOMBA Femenil season. Creates team docs in Teams
// container and pushes {slot, teamID, name} into the season's teams[].
// Slots are assigned A, B, C, ... in the order the names appear.

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
var db = client.database("DRMBL Database");
var seasonsContainer = db.container("Seasons");
var teamsContainer = db.container("Teams");
var leaguesContainer = db.container("Leagues");

var APPLY = process.argv.indexOf("--apply") !== -1;

// Seasons to ensure exist before seeding (creates season doc + patches
// league doc if missing). Uses LOMBA Femenil Primera Fuerza as template.
var SEASONS_TO_INIT = [
    {
        seasonId: "LOMBA - Femenil Juvenil - 2025-2026",
        gender: "femenil",            // key in league.seasons[0].data.divisions
        divisionShort: "Juvenil",     // value appended to gender's division list
        divisionFull: "Femenil Juvenil", // season.division field
        seasonName: "2025-2026",
        timeline: { beginning: { year: 2025, month: 4, date: 5 }, end: { year: 2026, month: 6, date: 14 } },
    },
];

var CONFIGS = [
    {
        seasonId: "LOMBA - Femenil Primera Fuerza - 2025-2026",
        genderToken: "Femenil",
        divisionToken: "Primera_Fuerza",
        teamNames: [
            "Totas",
            "CBTIS-54",
            "Tec",
            "Linces",
            "Bad Girls",
            "Totas 40",
            "IMSS",
            "Valquirias",
        ],
    },
    {
        seasonId: "LOMBA - Femenil Segunda Fuerza - 2025-2026",
        genderToken: "Femenil",
        divisionToken: "Segunda_Fuerza",
        teamNames: [
            "CBTIS-54 B",
            "Linces B",
            "Mambas",
            "Amazonas",
            "Broncas",
            "Panteras",
            "Mayko Girls A",
            "Mayko Girls B",
            "UA de C",
            "Génesis",
        ],
    },
    {
        seasonId: "LOMBA - Femenil Juvenil - 2025-2026",
        genderToken: "Femenil",
        divisionToken: "Juvenil",
        teamNames: [
            "Génesis",
            "Alfa y Omega",
            "Spurs",
            "Linces C",
            "CBTIS-54 C",
            "Mayko Girls C",
            "CONALEP",
        ],
    },
];

function asciiSlug(s) { return s.normalize("NFD").replace(/[̀-ͯ]/g, "").trim(); }
function teamIdSlug(name) { return asciiSlug(name).replace(/\s+/g, "_"); }
function slotLetter(i) { return String.fromCharCode(65 + i); }

function buildTeamDoc(name, teamID, slot, seasonId) {
    return {
        id: teamID,
        name: name,
        origin: { city: "Cd. Acuña", state: "Coahuila", country: "México" },
        owner: { name: null, phone: null, email: null },
        status: { registered: true, active: true, inactive: false, disbanded: false },
        seasons: [{
            id: seasonId,
            teamSlot: slot,
            roster: [],
        }],
    };
}

async function processConfig(cfg) {
    var { resource: season } = await seasonsContainer.item(cfg.seasonId, cfg.seasonId).read();
    if (!season) { console.error("ABORT: season not found:", cfg.seasonId); return; }

    console.log("=== " + cfg.seasonId + " ===");
    console.log("Existing teams in season:", (season.teams || []).length);

    if (!season.teams) season.teams = [];

    var plan = [];
    for (var i = 0; i < cfg.teamNames.length; i++) {
        var name = cfg.teamNames[i];
        var slot = slotLetter(i);
        var teamID = "LOMBA." + teamIdSlug(name) + "." + cfg.genderToken + "." + cfg.divisionToken;

        var existingTeam = null;
        try {
            var { resource } = await teamsContainer.item(teamID, teamID).read();
            existingTeam = resource || null;
        } catch (e) { if (e.code !== 404) throw e; }

        var inSeasonAlready = season.teams.some(function (t) { return t.teamID === teamID; });

        plan.push({ name: name, slot: slot, teamID: teamID, existingTeam: !!existingTeam, inSeasonAlready: inSeasonAlready });
    }

    console.log("Plan:");
    plan.forEach(function (p) {
        console.log("  " + p.slot + " | " + p.name + " | " + p.teamID
            + (p.existingTeam ? "  [team exists — skip create]" : "  [create team]")
            + (p.inSeasonAlready ? "  [in season]" : "  [add to season]"));
    });

    if (!APPLY) { console.log(""); return; }

    var addedSeasonEntries = 0, createdTeamDocs = 0;
    for (var j = 0; j < plan.length; j++) {
        var p = plan[j];
        if (!p.existingTeam) {
            await teamsContainer.items.upsert(buildTeamDoc(p.name, p.teamID, p.slot, cfg.seasonId));
            createdTeamDocs++;
        }
        if (!p.inSeasonAlready) {
            season.teams.push({ slot: p.slot, teamID: p.teamID, name: p.name });
            addedSeasonEntries++;
        }
    }
    await seasonsContainer.item(cfg.seasonId, cfg.seasonId).replace(season);
    console.log("WRITE OK — team docs created:", createdTeamDocs, "| season.teams added:", addedSeasonEntries);
    console.log("");
}

async function ensureSeasonExists(init) {
    console.log("=== ensure season exists: " + init.seasonId + " ===");

    // 1. Patch league doc if needed
    var { resource: league } = await leaguesContainer.item("LOMBA", "LOMBA").read();
    var divList = league.league.seasons[0].data.divisions[init.gender] || [];
    var needsDivAdd = divList.indexOf(init.divisionShort) === -1;
    var activeList = league.league.activeSeasons || [];
    var needsActiveAdd = activeList.indexOf(init.seasonId) === -1;
    console.log("  league.divisions." + init.gender + " has '" + init.divisionShort + "':", !needsDivAdd);
    console.log("  league.activeSeasons has season:", !needsActiveAdd);

    if (APPLY && (needsDivAdd || needsActiveAdd)) {
        if (needsDivAdd) league.league.seasons[0].data.divisions[init.gender].push(init.divisionShort);
        if (needsActiveAdd) { league.league.activeSeasons = activeList.concat([init.seasonId]); league.league.activeSeasons.sort(); }
        await leaguesContainer.item("LOMBA", "LOMBA").replace(league);
        console.log("  LEAGUE DOC WRITE OK");
    }

    // 2. Create season doc if missing (template = same shape as existing Femenil seasons)
    var existingSeason = null;
    try {
        var { resource } = await seasonsContainer.item(init.seasonId, init.seasonId).read();
        existingSeason = resource || null;
    } catch (e) { if (e.code !== 404) throw e; }

    console.log("  season doc exists:", !!existingSeason);
    if (existingSeason) { console.log(""); return; }

    var newDoc = {
        id: init.seasonId,
        league: {
            fullName: "Liga Oficial Municipal de Basketball Acuña",
            abbreviation: "LOMBA",
            season: {
                "league.seasons.name": init.seasonName,
                ["league.seasons.data.divisions." + init.gender]: init.divisionShort,
            },
        },
        timeline: init.timeline,
        teams: [],
        schedule: [],
        maxRoster: 14,
        leagueID: "LOMBA",
        division: init.divisionFull,
        seasonName: init.seasonName,
    };

    if (APPLY) {
        await seasonsContainer.items.create(newDoc);
        console.log("  SEASON DOC CREATE OK");
    } else {
        console.log("  WOULD CREATE season doc:", JSON.stringify(newDoc, null, 2));
    }
    console.log("");
}

(async function () {
    for (var i = 0; i < SEASONS_TO_INIT.length; i++) await ensureSeasonExists(SEASONS_TO_INIT[i]);
    for (var c = 0; c < CONFIGS.length; c++) await processConfig(CONFIGS[c]);
    if (!APPLY) console.log("(dry run — re-run with --apply to commit)");
})().catch(function (e) { console.error(e); process.exit(1); });
