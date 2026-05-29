// Remove LOMBA Varonil Tercera Fuerza for the 2025-2026 season.
// Deletes the season doc + patches the league doc (drops division + activeSeasons entry).
// Safety: refuses to run if season has any teams, games, or playoffs.

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
var leaguesContainer = db.container("Leagues");

var APPLY = process.argv.indexOf("--apply") !== -1;

var SEASON_ID = "LOMBA - Varonil Tercera Fuerza - 2025-2026";
var DIVISION_NAME = "Tercera Fuerza";
var GENDER_KEY = "varonil";

(async function () {
    // === SAFETY: inspect season doc before deleting ===
    var seasonDoc = null;
    try {
        var { resource } = await seasonsContainer.item(SEASON_ID, SEASON_ID).read();
        seasonDoc = resource;
    } catch (e) { if (e.code !== 404) throw e; }

    if (!seasonDoc) {
        console.log("Season doc already gone:", SEASON_ID);
    } else {
        var teams = (seasonDoc.teams || []).length;
        var games = (seasonDoc.schedule || []).reduce(function (a, dg) { return a + (dg.games || []).length; }, 0);
        var hasPlayoffs = !!seasonDoc.playoffs;
        console.log("Season doc state:", SEASON_ID);
        console.log("  teams:", teams, "| schedule games:", games, "| has playoffs:", hasPlayoffs);
        if (teams > 0 || games > 0 || hasPlayoffs) {
            console.error("ABORT: season is not empty — refusing to delete to avoid data loss");
            process.exit(1);
        }
    }

    // === LEAGUE DOC patch ===
    var { resource: league } = await leaguesContainer.item("LOMBA", "LOMBA").read();
    var divList = league.league.seasons[0].data.divisions[GENDER_KEY] || [];
    var activeList = league.league.activeSeasons || [];
    var divPresent = divList.indexOf(DIVISION_NAME) !== -1;
    var activePresent = activeList.indexOf(SEASON_ID) !== -1;

    console.log("");
    console.log("League doc:");
    console.log("  current varonil divisions:", JSON.stringify(divList));
    console.log("  '" + DIVISION_NAME + "' in divisions:", divPresent);
    console.log("  season in activeSeasons:", activePresent);

    if (!APPLY) {
        console.log("\n(dry run — re-run with --apply to commit)");
        return;
    }

    // === Delete season doc ===
    if (seasonDoc) {
        await seasonsContainer.item(SEASON_ID, SEASON_ID).delete();
        console.log("SEASON DOC DELETED");
    }

    // === Patch league doc ===
    if (divPresent || activePresent) {
        if (divPresent) league.league.seasons[0].data.divisions[GENDER_KEY] = divList.filter(function (d) { return d !== DIVISION_NAME; });
        if (activePresent) league.league.activeSeasons = activeList.filter(function (s) { return s !== SEASON_ID; });
        await leaguesContainer.item("LOMBA", "LOMBA").replace(league);
        console.log("LEAGUE DOC PATCHED");
    }

    console.log("\nDONE");
})().catch(function (e) { console.error(e); process.exit(1); });
