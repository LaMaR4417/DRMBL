// Seed the 20 L3X3 Varonil Libre teams (15 named + 5 placeholders) and add
// them to the season's teams[]. Slot order = list order (A..T).

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

var SEASON_ID = "L3X3 - Varonil Libre - 2026";
var LEAGUE_PREFIX = "L3X3";
var GENDER_TOKEN = "Varonil";
var DIVISION_TOKEN = "Libre";

var TEAM_NAMES = [
    "The Babatundes",
    "Street Players",
    "Old Shool",
    "Ouyizz",
    "Helios",
    "Los Baggos",
    "Los Knicks",
    "Blackbass",
    "UTCA",
    "Catarrines Team",
    "R. Blitz",
    "TBD A",
    "Elios 2K26",
    "Falcons",
    "Lakers",
    "Lobos",
    "TBD B",
    "TBD C",
    "TBD D",
    "TBD E",
];

function asciiSlug(s) { return s.normalize("NFD").replace(/[̀-ͯ]/g, "").trim(); }
function teamIdSlug(name) { return asciiSlug(name).replace(/\s+/g, "_"); }
function slotLetter(i) { return String.fromCharCode(65 + i); }

function buildTeamDoc(name, teamID, slot) {
    return {
        id: teamID,
        name: name,
        origin: { city: "Cd. Acuña", state: "Coahuila", country: "México" },
        owner: { name: null, phone: null, email: null },
        status: { registered: true, active: true, inactive: false, disbanded: false },
        seasons: [{
            id: SEASON_ID,
            teamSlot: slot,
            roster: [],
        }],
    };
}

(async function () {
    var { resource: season } = await seasonsContainer.item(SEASON_ID, SEASON_ID).read();
    if (!season) { console.error("ABORT: season not found:", SEASON_ID); process.exit(1); }

    console.log("=== " + SEASON_ID + " ===");
    console.log("Existing teams in season:", (season.teams || []).length);

    if (!season.teams) season.teams = [];

    var plan = [];
    for (var i = 0; i < TEAM_NAMES.length; i++) {
        var name = TEAM_NAMES[i];
        var slot = slotLetter(i);
        var teamID = LEAGUE_PREFIX + "." + teamIdSlug(name) + "." + GENDER_TOKEN + "." + DIVISION_TOKEN;

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
            + (p.existingTeam ? "  [team exists]" : "  [create]")
            + (p.inSeasonAlready ? "  [in season]" : "  [add]"));
    });

    if (!APPLY) { console.log("\n(dry run — re-run with --apply to commit)"); return; }

    var addedSeasonEntries = 0, createdTeamDocs = 0;
    for (var j = 0; j < plan.length; j++) {
        var p = plan[j];
        if (!p.existingTeam) {
            await teamsContainer.items.upsert(buildTeamDoc(p.name, p.teamID, p.slot));
            createdTeamDocs++;
        }
        if (!p.inSeasonAlready) {
            season.teams.push({ slot: p.slot, teamID: p.teamID, name: p.name });
            addedSeasonEntries++;
        }
    }
    await seasonsContainer.item(SEASON_ID, SEASON_ID).replace(season);
    console.log("\nWRITE OK — team docs created:", createdTeamDocs, "| season.teams added:", addedSeasonEntries);
})().catch(function (e) { console.error(e); process.exit(1); });
