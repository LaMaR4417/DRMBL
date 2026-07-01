// List / delete 3-Point Contest sign-ups in the "Registration Forms" container.
//
//   node scripts/delete-3pt-entry.js            -> list all contest sign-ups
//   node scripts/delete-3pt-entry.js <id>       -> delete that one sign-up
//   node scripts/delete-3pt-entry.js --latest   -> delete the most recent sign-up
//
// Deletes need (id, partitionKey). The container's partition key is /teamName,
// so we look up each doc's teamName before deleting.

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
var regForms = client.database("DRMBL Database").container("Registration Forms");

var CONTEST_LEAGUE_ID = "DRMBL 3PT Contest";

(async function () {
    var arg = process.argv[2];

    var { resources: rows } = await regForms.items.query({
        query: "SELECT c.id, c.teamName, c.playerName, c.submittedAt FROM c WHERE c.league = @lg ORDER BY c.submittedAt ASC",
        parameters: [{ name: "@lg", value: CONTEST_LEAGUE_ID }]
    }).fetchAll();

    if (!arg) {
        console.log("3-Point Contest sign-ups (" + rows.length + "):\n");
        rows.forEach(function (r, i) {
            console.log("  [" + (i + 1) + "] " + r.playerName + "  (" + r.teamName + ")  " + r.submittedAt);
            console.log("      id: " + r.id);
        });
        if (!rows.length) console.log("  (none)");
        console.log("\nDelete one with:  node scripts/delete-3pt-entry.js \"<id>\"   (or --latest)");
        return;
    }

    var target;
    if (arg === "--latest") {
        target = rows[rows.length - 1];
        if (!target) { console.log("No sign-ups to delete."); return; }
    } else {
        target = rows.filter(function (r) { return r.id === arg; })[0];
        if (!target) { console.error("No contest sign-up found with id: " + arg); process.exit(1); }
    }

    await regForms.item(target.id, target.teamName).delete();
    console.log("Deleted: " + target.playerName + "  (" + target.teamName + ")");
    console.log("  id: " + target.id);
})().catch(function (e) { console.error("Error:", e.message); process.exit(1); });
