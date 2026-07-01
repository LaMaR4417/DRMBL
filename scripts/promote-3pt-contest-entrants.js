// Promote 3-Point Contest sign-ups (Registration Forms) into the contest
// division doc's `entrants` list, ready for building head-to-head matchups.
//
// Flow:  player signs up -> pending doc in "Registration Forms"
//        organizer runs this -> entrant added to the division doc (paid:false)
//        organizer marks who actually paid, then builds the bracket.
//
// Dedupes by (name + team), assigns sequential slots, and recomputes the
// prize pool from PAID entrants. Safe to re-run — only adds new sign-ups.
//
// Usage:  node scripts/promote-3pt-contest-entrants.js          (dry run)
//         node scripts/promote-3pt-contest-entrants.js --apply  (write)

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

var CONTEST_LEAGUE_ID = "DRMBL 3PT Contest";   // matches api/register.js
var DIVISION_DOC_ID = "DRMBL - 3-Point Contest - Spring 2026";

function slugSegment(s) {
    return String(s || "")
        .replace(/ñ/g, "n").replace(/Ñ/g, "N")
        .replace(/á/g, "a").replace(/é/g, "e").replace(/í/g, "i").replace(/ó/g, "o").replace(/ú/g, "u")
        .replace(/[\/\\?#]/g, "").replace(/\./g, "").replace(/\s+/g, "_").trim();
}

function dedupeKey(name, team) {
    return slugSegment(name).toLowerCase() + "|" + slugSegment(team).toLowerCase();
}

(async function () {
    var apply = process.argv.indexOf("--apply") !== -1;

    // Pending sign-ups, oldest first
    var { resources: signups } = await regForms.items.query({
        query: "SELECT c.playerName, c.teamName, c.submittedAt FROM c WHERE c.league = @lg ORDER BY c.submittedAt ASC",
        parameters: [{ name: "@lg", value: CONTEST_LEAGUE_ID }]
    }).fetchAll();

    console.log("Sign-ups in Registration Forms: " + signups.length);

    var read = await seasons.item(DIVISION_DOC_ID, DIVISION_DOC_ID).read();
    var doc = read.resource;
    if (!doc) { console.error("Division doc not found. Run seed-3pt-contest-division.js first."); process.exit(1); }

    doc.entrants = Array.isArray(doc.entrants) ? doc.entrants : [];
    var seen = {};
    doc.entrants.forEach(function (e) { seen[dedupeKey(e.name, e.team)] = true; });

    var nextSlot = doc.entrants.length + 1;
    var added = [];
    signups.forEach(function (s) {
        var key = dedupeKey(s.playerName, s.teamName);
        if (seen[key]) return;
        seen[key] = true;
        var entrant = {
            slot: nextSlot++,
            entrantID: "DRMBL.3PT." + slugSegment(s.playerName),
            name: s.playerName,
            team: s.teamName,
            paid: false
        };
        doc.entrants.push(entrant);
        added.push(entrant);
    });

    // Prize pool reflects entrants who have paid.
    var paidCount = doc.entrants.filter(function (e) { return e.paid; }).length;
    doc.prizePool = doc.prizePool || { perEntry: 5, total: 0, winner: null };
    doc.prizePool.total = paidCount * (doc.prizePool.perEntry || 5);

    console.log("Already in bracket: " + (doc.entrants.length - added.length));
    console.log("New entrants to add: " + added.length);
    added.forEach(function (e) { console.log("  +#" + e.slot + "  " + e.name + "  (" + e.team + ")"); });
    console.log("Paid so far: " + paidCount + "  ->  prize pool $" + doc.prizePool.total);

    if (!apply) {
        console.log("\nDry run. Re-run with --apply to write these changes.");
        return;
    }
    if (added.length === 0) {
        console.log("\nNothing new to write.");
        return;
    }

    await seasons.item(DIVISION_DOC_ID, DIVISION_DOC_ID).replace(doc, {
        accessCondition: { type: "IfMatch", condition: read.etag }
    });
    console.log("\nWrote " + added.length + " new entrant(s) to the division doc.");
})().catch(function (e) { console.error("Error:", e.message); process.exit(1); });
