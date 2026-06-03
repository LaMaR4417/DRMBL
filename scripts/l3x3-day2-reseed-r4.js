// 1. Move the 2 completed Day-2 R4 games (Old School vs Babatundes,
//    Ouyizz vs Los Baggos) back to Day 1's date group at late-evening
//    times so they don't take up Day 2 slots. Renames the box scores
//    + schedule entries to use the new Day-1 date.
// 2. Remove the open Day-2 entries that the engine auto-paired
//    (R. Blitz vs Street Players, plus 3 open R5 games) — those are
//    going to be replaced.
// 3. Seed Day 2's R4 with the manual seeded pairings: 1v10, 2v9, 3v8,
//    4v7, 5v6 using the current standings.

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
var boxScoresContainer = db.container("Box Scores");

var APPLY = process.argv.indexOf("--apply") !== -1;
var SEASON_ID = "L3X3 - Varonil Libre - 2026";

var DAY1 = { year: 2026, month: 6, date: 2 };
var DAY2 = { year: 2026, month: 6, date: 3 };
var DAY1_ISO = "2026-06-02";

// R4 seeded pairings — by standings rank (1 = best W-L → PD)
var R4_PAIRINGS = [
    { home: "Old School",      homeID: "L3X3.Old_School.Varonil.Libre",       homeSeed: 1,  away: "Street Players",  awayID: "L3X3.Street_Players.Varonil.Libre",   awaySeed: 10 },
    { home: "Ouyizz",          homeID: "L3X3.Ouyizz.Varonil.Libre",           homeSeed: 2,  away: "Helios",          awayID: "L3X3.Helios.Varonil.Libre",           awaySeed: 9 },
    { home: "Lakers",          homeID: "L3X3.Lakers.Varonil.Libre",           homeSeed: 3,  away: "Los Baggos",      awayID: "L3X3.Los_Baggos.Varonil.Libre",       awaySeed: 8 },
    { home: "R. Blitz",        homeID: "L3X3.R._Blitz.Varonil.Libre",         homeSeed: 4,  away: "P. Wagon",        awayID: "L3X3.P._Wagon.Varonil.Libre",         awaySeed: 7 },
    { home: "The Babatundes",  homeID: "L3X3.The_Babatundes.Varonil.Libre",   homeSeed: 5,  away: "Elios 2K26",      awayID: "L3X3.Elios_2K26.Varonil.Libre",       awaySeed: 6 },
];

// R4 slots on Day 2: 19:00 C1, C2, C3, C4 + 19:20 C1
var R4_SLOTS = [
    { time: "19:00", court: 1 },
    { time: "19:00", court: 2 },
    { time: "19:00", court: 3 },
    { time: "19:00", court: 4 },
    { time: "19:20", court: 1 },
];

// Late-evening Day-1 slots for the 2 moved games
var MOVED_SLOTS = [
    { time: "22:00", court: 1 },
    { time: "22:00", court: 2 },
];

function asciiSlug(s) { return s.normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[''`"]/g, "").trim(); }
function teamSlug(name) { return asciiSlug(name).replace(/\s+/g, "_"); }
function makeBoxScoreID(homeName, awayName, isoDate) {
    return ["L3X3", "Varonil_Libre_2026", teamSlug(homeName) + "_vs_" + teamSlug(awayName), isoDate].join(".");
}
function tbdGame(time, court, round) {
    return {
        id: "L3X3.Varonil_Libre_2026.TBD.2026-06-03." + time.replace(":", "") + ".C" + court,
        home: "TBD", away: "TBD",
        homeTeamID: null, awayTeamID: null,
        homeSeed: null, awaySeed: null,
        round: round, court: court, time: time, wave: time,
        completion: false, winner: "", loser: "",
        homeScore: null, awayScore: null, forfeit: false,
        boxScoreId: null, isPlaceholder: true,
    };
}

(async function () {
    var { resource: season } = await seasonsContainer.item(SEASON_ID, SEASON_ID).read();

    var day1 = (season.schedule || []).find(function (dg) { return dg.date.year === DAY1.year && dg.date.month === DAY1.month && dg.date.date === DAY1.date; });
    var day2 = (season.schedule || []).find(function (dg) { return dg.date.year === DAY2.year && dg.date.month === DAY2.month && dg.date.date === DAY2.date; });
    if (!day1 || !day2) { console.error("ABORT: missing date group"); process.exit(1); }

    // === Step 1: identify Day-2 entries ===
    var toMove = []; // completed R4 games to relocate
    var toDelete = []; // open entries to delete entirely
    (day2.games || []).forEach(function (g) {
        if (g.isPlaceholder) return;
        if (g.completion) { toMove.push(g); return; }
        toDelete.push(g);
    });

    console.log("=== Step 1: Day 2 inventory ===");
    console.log("  to MOVE (completed):", toMove.length);
    toMove.forEach(function (g) { console.log("    -", g.home, "vs", g.away, "| R" + g.round, "| id:", g.id); });
    console.log("  to DELETE (open):", toDelete.length);
    toDelete.forEach(function (g) { console.log("    -", g.home, "vs", g.away, "| R" + g.round); });

    if (toMove.length !== 2) console.warn("  WARN: expected 2 moves, got " + toMove.length);

    // === Step 2: prep moved games — generate new ids with Day-1 date, update times ===
    var movedNewIds = [];
    toMove.forEach(function (g, idx) {
        var newID = makeBoxScoreID(g.home, g.away, DAY1_ISO);
        movedNewIds.push({ oldID: g.id, newID: newID, entry: g, newSlot: MOVED_SLOTS[idx] });
        console.log("    move plan:", g.home, "vs", g.away, "→ Day 1", MOVED_SLOTS[idx].time, "C" + MOVED_SLOTS[idx].court, "| id:", newID);
    });

    // === Step 3: plan new R4 entries ===
    console.log("\n=== Step 3: new Day-2 R4 seeded pairings ===");
    R4_PAIRINGS.forEach(function (p, i) {
        var slot = R4_SLOTS[i];
        var id = makeBoxScoreID(p.home, p.away, "2026-06-03");
        console.log("  R4 G" + (i + 1) + " (#" + p.homeSeed + " vs #" + p.awaySeed + "):", slot.time, "C" + slot.court, "|", p.home, "vs", p.away, "| id:", id);
    });

    if (!APPLY) { console.log("\n(dry run — re-run with --apply to commit)"); return; }

    // === Apply ===

    // 3a: Rewrite + move box scores for the moved games
    for (var i = 0; i < movedNewIds.length; i++) {
        var m = movedNewIds[i];
        try {
            var { resource: oldBox } = await boxScoresContainer.item(m.oldID, m.oldID).read();
            if (oldBox) {
                var newBox = JSON.parse(JSON.stringify(oldBox));
                delete newBox._rid; delete newBox._self; delete newBox._etag; delete newBox._attachments; delete newBox._ts;
                newBox.id = m.newID;
                newBox.gameDate = DAY1_ISO;
                if (newBox.gameInfo && newBox.gameInfo.general) newBox.gameInfo.general.date = "6/2/2026";
                await boxScoresContainer.items.create(newBox);
                await boxScoresContainer.item(m.oldID, m.oldID).delete();
                console.log("  box score rewritten:", m.oldID, "→", m.newID);
            }
        } catch (e) { console.error("  WARN box-score move failed:", m.oldID, e.message); }
    }

    // 3b: Move schedule entries from day2 to day1 with updated id + time + court
    movedNewIds.forEach(function (m) {
        m.entry.id = m.newID;
        m.entry.boxScoreId = m.newID;
        m.entry.time = m.newSlot.time;
        m.entry.court = m.newSlot.court;
        m.entry.wave = m.newSlot.time;
        // Strip from Day 2
        day2.games = day2.games.filter(function (g) { return g !== m.entry; });
        // Add to Day 1
        day1.games.push(m.entry);
    });

    // 3c: Remove open entries from Day 2
    var toDeleteIds = toDelete.map(function (g) { return g.id; });
    day2.games = (day2.games || []).filter(function (g) { return toDeleteIds.indexOf(g.id) === -1; });

    // 3d: Restore TBDs for what we deleted (R4 19:00 C3, plus R5 19:20 C2/C3/C4)
    // Restore R4 slot at 19:00 C3 → will be overwritten by new R4 seeding next
    // Restore R5 slots at 19:20 C2, C3, C4
    var restoreTBDs = [
        { time: "19:00", court: 3, round: 4 },
        { time: "19:20", court: 2, round: 5 },
        { time: "19:20", court: 3, round: 5 },
        { time: "19:20", court: 4, round: 5 },
    ];
    restoreTBDs.forEach(function (t) {
        var exists = (day2.games || []).some(function (g) { return g.time === t.time && g.court === t.court; });
        if (!exists) day2.games.push(tbdGame(t.time, t.court, t.round));
    });

    // 3e: Fill the 5 R4 TBDs with the seeded pairings
    R4_PAIRINGS.forEach(function (p, i) {
        var slot = R4_SLOTS[i];
        // Find the existing R4 TBD at this slot, overwrite in place
        var tbd = (day2.games || []).find(function (g) { return g.isPlaceholder && g.time === slot.time && g.court === slot.court; });
        var entry = {
            id: makeBoxScoreID(p.home, p.away, "2026-06-03"),
            home: p.home, away: p.away,
            homeTeamID: p.homeID, awayTeamID: p.awayID,
            homeSeed: p.homeSeed, awaySeed: p.awaySeed,
            round: 4, court: slot.court, time: slot.time, wave: slot.time,
            bucket: "seeded",
            completion: false, winner: "", loser: "",
            homeScore: null, awayScore: null, forfeit: false,
            boxScoreId: null,
        };
        if (tbd) {
            Object.keys(tbd).forEach(function (k) { delete tbd[k]; });
            Object.assign(tbd, entry);
        } else {
            day2.games.push(entry);
        }
    });

    // 3f: Sort each day's games by (time, court) for tidiness
    function sortDgGames(dg) {
        (dg.games || []).sort(function (a, b) {
            return (a.time || "").localeCompare(b.time || "") || (a.court || 0) - (b.court || 0);
        });
    }
    sortDgGames(day1);
    sortDgGames(day2);

    // 3g: Clear any queue residue so the engine doesn't try to re-pair these teams
    if (season.bracket) {
        season.bracket.queues = {};
        season.bracket.roundSaves = season.bracket.roundSaves || {};
    }

    await seasonsContainer.item(SEASON_ID, SEASON_ID).replace(season);
    console.log("\nWRITE OK");
})().catch(function (e) { console.error(e); process.exit(1); });
