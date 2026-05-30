// Migrate L3X3 R1 games from season.bracket.rounds[] into season.schedule[]
// and slim down season.bracket to just metadata.

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

// Day 1 = Monday 2026-06-01 (the timeline beginning)
var R1_DATE = { year: 2026, month: 6, date: 1 };
var R1_DATE_ISO = "2026-06-01";

function asciiSlug(s) { return s.normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[''`"]/g, "").trim(); }
function teamSlug(name) { return asciiSlug(name).replace(/\s+/g, "_"); }
function seasonSlug(seasonId) {
    return seasonId.replace(/^L3X3 - /, "").replace(/[''`]/g, "").replace(/ - /g, "_").replace(/\s+/g, "_");
}
function makeBoxScoreID(seasonId, homeName, awayName, date) {
    return ["L3X3", seasonSlug(seasonId), teamSlug(homeName) + "_vs_" + teamSlug(awayName), date].join(".");
}

(async function () {
    var { resource: season } = await seasonsContainer.item(SEASON_ID, SEASON_ID).read();
    if (!season) { console.error("ABORT: season not found"); process.exit(1); }

    if (!season.bracket || !season.bracket.rounds || !season.bracket.rounds[0]) {
        console.error("ABORT: no bracket.rounds[0] to migrate");
        process.exit(1);
    }
    if ((season.schedule || []).length > 0) {
        console.error("ABORT: season.schedule already populated — refusing to overwrite");
        process.exit(1);
    }

    var r1games = season.bracket.rounds[0].games || [];
    console.log("Migrating " + r1games.length + " R1 games into season.schedule");

    var scheduleGames = r1games.map(function (g) {
        var bsid = makeBoxScoreID(SEASON_ID, g.home.name, g.away.name, R1_DATE_ISO);
        return {
            id: bsid,
            home: g.home.name,
            away: g.away.name,
            homeTeamID: g.home.teamID,
            awayTeamID: g.away.teamID,
            homeSeed: g.home.seed,
            awaySeed: g.away.seed,
            round: 1,
            court: g.court,
            time: g.time,
            wave: g.time,           // wave key = time within round
            completion: false,
            winner: "",
            loser: "",
            homeScore: null,
            awayScore: null,
            forfeit: false,
            boxScoreId: null,
        };
    });

    var newSchedule = [{ date: R1_DATE, games: scheduleGames }];

    // Slim the bracket to metadata only
    var slimBracket = {
        format: season.bracket.format,
        totalTeams: season.bracket.totalTeams,
        currentRound: 1,
        records: season.bracket.records || {},
        eliminated: season.bracket.eliminated || [],
    };

    console.log("\nNew schedule[0]: " + scheduleGames.length + " games at date " + JSON.stringify(R1_DATE));
    scheduleGames.slice(0, 3).forEach(function (g) {
        console.log("  sample: " + g.id);
        console.log("          " + g.home + " (#" + g.homeSeed + ") vs " + g.away + " (#" + g.awaySeed + ") | court " + g.court + " " + g.time);
    });
    console.log("  ...");
    console.log("\nSlim bracket fields:", JSON.stringify({ format: slimBracket.format, totalTeams: slimBracket.totalTeams, currentRound: slimBracket.currentRound, recordsCount: Object.keys(slimBracket.records).length, eliminatedCount: slimBracket.eliminated.length }, null, 2));

    if (!APPLY) { console.log("\n(dry run — re-run with --apply to commit)"); return; }

    season.schedule = newSchedule;
    season.bracket = slimBracket;
    await seasonsContainer.item(SEASON_ID, SEASON_ID).replace(season);
    console.log("\nWRITE OK");
})().catch(function (e) { console.error(e); process.exit(1); });
