// Reset the 3-Point Contest to a specific roster.
//   1. Deletes ALL contest sign-ups in "Registration Forms".
//   2. Resets the division doc (clears entrants + bracket, status -> open).
//   3. Creates the ROSTER below as fresh sign-ups.
//
// Edit ROSTER and run:  node scripts/reset-3pt-players.js

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
var regForms = db.container("Registration Forms");
var seasons = db.container("Seasons");

var CONTEST_LEAGUE_ID = "DRMBL 3PT Contest";
var CONTEST_EVENT_NAME = "DRMBL 3-Point Contest";
var DIVISION_DOC_ID = "DRMBL - 3-Point Contest - Spring 2026";
var ENTRY_FEE = 5;

var ROSTER = [
    { playerName: "Fernando Garza", teamName: "The Reapers" },
    { playerName: "Tristan Vela", teamName: "Air Ballers" },
    { playerName: "Chris Rodriguez", teamName: "Air Ballers" }
];

function slugSegment(s) {
    return String(s || "")
        .replace(/ñ/g, "n").replace(/Ñ/g, "N")
        .replace(/á/g, "a").replace(/é/g, "e").replace(/í/g, "i").replace(/ó/g, "o").replace(/ú/g, "u")
        .replace(/[\/\\?#]/g, "").replace(/\./g, "").replace(/\s+/g, "_").trim();
}

(async function () {
    // 1. Delete all existing contest sign-ups.
    var { resources: existing } = await regForms.items.query({
        query: "SELECT c.id, c.teamName, c.playerName FROM c WHERE c.league = @lg",
        parameters: [{ name: "@lg", value: CONTEST_LEAGUE_ID }]
    }).fetchAll();
    console.log("Deleting " + existing.length + " existing sign-up(s):");
    for (var i = 0; i < existing.length; i++) {
        console.log("  - " + existing[i].playerName + " (" + existing[i].teamName + ")");
        await regForms.item(existing[i].id, existing[i].teamName).delete();
    }

    // 2. Reset the division doc.
    var r = await seasons.item(DIVISION_DOC_ID, DIVISION_DOC_ID).read();
    var doc = r.resource;
    if (doc) {
        doc.status = "open";
        doc.entrants = [];
        doc.bracket = [];
        doc.prizePool = { perEntry: ENTRY_FEE, total: 0, winner: null };
        await seasons.item(DIVISION_DOC_ID, DIVISION_DOC_ID).replace(doc);
        console.log("Division doc reset to open (entrants + bracket cleared).");
    }

    // 3. Create the roster as fresh sign-ups.
    console.log("\nAdding " + ROSTER.length + " player(s):");
    for (var j = 0; j < ROSTER.length; j++) {
        var p = ROSTER[j];
        var now = new Date().toISOString();
        var tsSeg = now.slice(0, 19).replace(/:/g, "-");
        var newDoc = {
            id: "3PT_Contest." + slugSegment(p.teamName) + "." + slugSegment(p.playerName) + "." + tsSeg,
            league: CONTEST_LEAGUE_ID,
            eventName: CONTEST_EVENT_NAME,
            teamName: p.teamName,
            playerName: p.playerName,
            source: "signup",
            entryFee: { amount: ENTRY_FEE, currency: "USD", format: "winner-take-all", acknowledged: true },
            status: "pending",
            submittedAt: now
        };
        await regForms.items.create(newDoc);
        console.log("  + " + p.playerName + " (" + p.teamName + ")");
    }

    // 4. Show final list.
    var { resources: final } = await regForms.items.query({
        query: "SELECT c.playerName, c.teamName FROM c WHERE c.league = @lg ORDER BY c.submittedAt ASC",
        parameters: [{ name: "@lg", value: CONTEST_LEAGUE_ID }]
    }).fetchAll();
    console.log("\nCurrent contest sign-ups (" + final.length + "):");
    final.forEach(function (f) { console.log("  • " + f.playerName + " — " + f.teamName); });
})().catch(function (e) { console.error("Error:", e.message); process.exit(1); });
