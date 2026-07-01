// Create the DRMBL 3-Point Contest division doc in the "Seasons" container.
//
// This is a head-to-head shootout "division" (like a LOMBA division is its own
// season doc), but with individual ENTRANTS instead of teams, and a BRACKET of
// 1v1 matchups instead of a round-robin schedule.
//
// DISCRETE BY DESIGN: it intentionally has NO top-level `league` block. The
// public Box-Scores page filters seasons by `season.league.abbreviation`, and
// Standings/Schedule only show a league's `activeSeasons`. With no `league`
// block and no entry in the DRMBL League doc's activeSeasons, this division is
// invisible on every public page — reachable only by its id.
//
// Idempotent: if the doc already exists it is left untouched (re-run safe).
//
// Usage:  node scripts/seed-3pt-contest-division.js          (create if absent)
//         node scripts/seed-3pt-contest-division.js --force  (overwrite)

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
var seasons = client.database("DRMBL Database").container("Seasons");

var DOC_ID = "DRMBL - 3-Point Contest - Spring 2026";

var DOC = {
    id: DOC_ID,
    leagueID: "DRMBL",
    division: "3-Point Contest",
    seasonName: "Spring 2026",
    format: "head-to-head",          // 1v1 shootout matchups
    status: "open",                  // open for sign-ups
    discrete: true,                  // hidden from public pages (see header note)
    entryFee: { amount: 5, currency: "USD", format: "winner-take-all" },
    prizePool: { perEntry: 5, total: 0, winner: null },
    // Individual shooters. Populated from Registration Forms sign-ups via
    // scripts/promote-3pt-contest-entrants.js (organizer promotes those who pay).
    //   { slot, entrantID, name, team, paid }
    entrants: [],
    // Head-to-head matchups, built later from `entrants`.
    //   { round, id, playerA:{entrantID,name}, playerB:{entrantID,name},
    //     scoreA, scoreB, winner, completion }
    bracket: []
    // NOTE: intentionally no top-level `league` object — keeps it off public filters.
};

(async function () {
    var force = process.argv.indexOf("--force") !== -1;

    var existing = null;
    try {
        var read = await seasons.item(DOC_ID, DOC_ID).read();
        existing = read.resource;
    } catch (e) {
        if (e.code !== 404) throw e;
    }

    if (existing && !force) {
        console.log("Division doc already exists — leaving it untouched:");
        console.log("  id: " + existing.id);
        console.log("  entrants: " + (existing.entrants ? existing.entrants.length : 0));
        console.log("  bracket matchups: " + (existing.bracket ? existing.bracket.length : 0));
        console.log("\nRe-run with --force to overwrite.");
        return;
    }

    if (existing && force) {
        await seasons.item(DOC_ID, DOC_ID).replace(DOC);
        console.log("Overwrote existing division doc:");
    } else {
        await seasons.items.create(DOC);
        console.log("Created division doc:");
    }
    console.log(JSON.stringify(DOC, null, 2));
})().catch(function (e) { console.error("Error:", e.message); process.exit(1); });
