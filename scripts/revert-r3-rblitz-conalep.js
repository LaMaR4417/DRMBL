// One-shot: revert the R3 20:20 C4 slot from R. Blitz vs CONALEP back to
// a TBD placeholder, and put both teams back into the 1-1 queue. The newly
// deployed engine patch will then refuse to re-pair them since they already
// played in R1.

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

var R_BLITZ_ID = "L3X3.R._Blitz.Varonil.Libre";
var CONALEP_ID = "L3X3.CONALEP.Varonil.Libre";

(async function () {
    var { resource: season } = await seasonsContainer.item(SEASON_ID, SEASON_ID).read();

    // Find the R3 20:20 C4 entry
    var target = null;
    var targetDg = null;
    (season.schedule || []).forEach(function (dg) {
        (dg.games || []).forEach(function (g) {
            if (g.round === 3 && g.time === "20:20" && g.court === 4 && !g.isPlaceholder) {
                target = g;
                targetDg = dg;
            }
        });
    });

    if (!target) { console.error("ABORT: no non-placeholder game at R3 20:20 C4"); process.exit(1); }
    console.log("Current:", target.home, "vs", target.away);
    if (target.completion) { console.error("ABORT: game is already completed — refusing to touch"); process.exit(1); }

    var blitzTeam = { teamID: target.homeTeamID, name: target.home, seed: target.homeSeed };
    var conalepTeam = { teamID: target.awayTeamID, name: target.away, seed: target.awaySeed };
    if (blitzTeam.teamID !== R_BLITZ_ID || conalepTeam.teamID !== CONALEP_ID) {
        console.error("ABORT: target slot doesn't have R. Blitz vs CONALEP");
        console.error("  home:", blitzTeam, "away:", conalepTeam);
        process.exit(1);
    }

    // Build a TBD placeholder to replace the entry
    var dateISO = targetDg.date.year + "-" + String(targetDg.date.month).padStart(2, "0") + "-" + String(targetDg.date.date).padStart(2, "0");
    var tbdEntry = {
        id: "L3X3.Varonil_Libre_2026.TBD." + dateISO + "." + "20:20".replace(":", "") + ".C4",
        home: "TBD",
        away: "TBD",
        homeTeamID: null,
        awayTeamID: null,
        homeSeed: null,
        awaySeed: null,
        round: 3,
        court: 4,
        time: "20:20",
        wave: "20:20",
        completion: false,
        winner: "",
        loser: "",
        homeScore: null,
        awayScore: null,
        forfeit: false,
        boxScoreId: null,
        isPlaceholder: true,
    };

    // Add both teams back to 1-1 queue (R. Blitz first so they get the next opponent)
    if (!season.bracket.queues) season.bracket.queues = {};
    if (!season.bracket.queues["1-1"]) season.bracket.queues["1-1"] = [];
    season.bracket.queues["1-1"].unshift(conalepTeam);
    season.bracket.queues["1-1"].unshift(blitzTeam);

    console.log("\nWill replace R3 20:20 C4 with TBD");
    console.log("Will re-queue both teams into 1-1 (R. Blitz first):");
    console.log("  ", JSON.stringify(season.bracket.queues["1-1"]));

    if (!APPLY) { console.log("\n(dry run — re-run with --apply to commit)"); return; }

    // Replace in place
    Object.keys(target).forEach(function (k) { delete target[k]; });
    Object.assign(target, tbdEntry);

    await seasonsContainer.item(SEASON_ID, SEASON_ID).replace(season);
    console.log("\nWRITE OK");
})().catch(function (e) { console.error(e); process.exit(1); });
