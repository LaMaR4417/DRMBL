// Seed Round 1 of the L3X3 Swiss-style double-elim bracket onto the season doc.
// 16 rated teams paired high-vs-low (1v16, 2v15, ..., 8v9).
// 8 games across 2 timeslots (7:00 and 7:30 PM) on 4 courts.

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

// Seed order (1-16). Mirrors the user-confirmed rating ordering.
var SEEDS = [
    { seed: 1, teamName: "The Babatundes" },
    { seed: 2, teamName: "Old School" },
    { seed: 3, teamName: "Helios" },
    { seed: 4, teamName: "R. Blitz" },
    { seed: 5, teamName: "Ouyizz" },
    { seed: 6, teamName: "Los Baggos" },
    { seed: 7, teamName: "Catarrines Team" },
    { seed: 8, teamName: "Lakers" },
    { seed: 9, teamName: "Lobos" },
    { seed: 10, teamName: "Street Players" },
    { seed: 11, teamName: "Los Knicks" },
    { seed: 12, teamName: "Blackbass" },
    { seed: 13, teamName: "UTCA" },
    { seed: 14, teamName: "TBD A" },          // The "?" team from the rating list
    { seed: 15, teamName: "Elios 2K26" },
    { seed: 16, teamName: "Falcons" },
];

function emptyGame(idx, home, away, court, time) {
    return {
        gameID: "L3X3.R1.G" + (idx + 1),
        round: 1,
        court: court,
        time: time,
        home: { teamID: home.teamID, name: home.name, seed: home.seed },
        away: { teamID: away.teamID, name: away.name, seed: away.seed },
        completion: false,
        winner: null,
        loser: null,
        homeScore: null,
        awayScore: null,
        boxScoreId: null,
    };
}

(async function () {
    var { resource: season } = await seasonsContainer.item(SEASON_ID, SEASON_ID).read();
    if (!season) { console.error("ABORT: season not found"); process.exit(1); }

    // Map team names -> teamID + seed
    var seasonByName = {};
    (season.teams || []).forEach(function (t) { seasonByName[t.name] = t; });

    var entries = [];
    for (var i = 0; i < SEEDS.length; i++) {
        var t = SEEDS[i];
        var hit = seasonByName[t.teamName];
        if (!hit) { console.error("ABORT: team not in season.teams: " + t.teamName); process.exit(1); }
        entries.push({ teamID: hit.teamID, name: hit.name, seed: t.seed });
    }

    // High-vs-low pairing: 1v16, 2v15, ..., 8v9
    var games = [];
    var courts = [1, 2, 3, 4];
    var slots = ["19:00", "19:30"];
    for (var p = 0; p < 8; p++) {
        var home = entries[p];           // seeds 1..8 (the higher-rated)
        var away = entries[15 - p];      // seeds 16..9 (the lower-rated)
        var slot = slots[Math.floor(p / 4)];
        var court = courts[p % 4];
        games.push(emptyGame(p, home, away, court, slot));
    }

    var bracket = {
        format: "swiss-double-elim-2loss",
        totalTeams: 16,
        currentRound: 1,
        rounds: [
            { number: 1, label: "Ronda 1", games: games }
        ],
        eliminated: [],
        records: entries.reduce(function (acc, e) { acc[e.teamID] = { wins: 0, losses: 0 }; return acc; }, {}),
    };

    console.log("=== L3X3 Round 1 bracket ===");
    console.log("  total teams:", entries.length);
    console.log("");
    console.log("Pairings:");
    games.forEach(function (g) {
        console.log("  " + g.gameID + "  court " + g.court + "  " + g.time + "  | #" + g.home.seed + " " + g.home.name + " vs #" + g.away.seed + " " + g.away.name);
    });
    console.log("");
    console.log("season.bracket already exists?", !!season.bracket);

    if (!APPLY) { console.log("\n(dry run — re-run with --apply to commit)"); return; }

    if (season.bracket && (season.bracket.rounds || []).some(function (r) { return r.games && r.games.some(function (g) { return g.completion; }); })) {
        console.error("ABORT: season.bracket already has completed games — refusing to overwrite");
        process.exit(1);
    }

    season.bracket = bracket;
    await seasonsContainer.item(SEASON_ID, SEASON_ID).replace(season);
    console.log("WRITE OK");
})().catch(function (e) { console.error(e); process.exit(1); });
