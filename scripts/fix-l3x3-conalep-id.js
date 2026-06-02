// Rename the L3X3 slot-O team doc from the leftover P.LEP id to CONALEP.
// Fixes the stale teamSlot on the team doc, the season.teams[] entry,
// every schedule game that references the old id, the bracket.records key,
// and the 4 player docs that still point at L3X3.P.LEP.Varonil.Libre in
// their teams[] array.

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
var playersContainer = db.container("Players");

var APPLY = process.argv.indexOf("--apply") !== -1;
var SEASON_ID = "L3X3 - Varonil Libre - 2026";
var OLD_ID = "L3X3.P.LEP.Varonil.Libre";
var NEW_ID = "L3X3.CONALEP.Varonil.Libre";
var NEW_NAME = "CONALEP";
var EXPECTED_SLOT = "O";

(async function () {
    // === Inspect ===
    var { resource: season } = await seasonsContainer.item(SEASON_ID, SEASON_ID).read();
    if (!season) { console.error("ABORT: season not found"); process.exit(1); }

    var oldTeamDoc = null;
    try { var { resource } = await teamsContainer.item(OLD_ID, OLD_ID).read(); oldTeamDoc = resource || null; } catch (e) { if (e.code !== 404) throw e; }
    var newTeamDoc = null;
    try { var { resource: r2 } = await teamsContainer.item(NEW_ID, NEW_ID).read(); newTeamDoc = r2 || null; } catch (e) { if (e.code !== 404) throw e; }

    console.log("Team doc state:");
    console.log("  old (" + OLD_ID + "): exists =", !!oldTeamDoc);
    console.log("  new (" + NEW_ID + "): exists =", !!newTeamDoc);

    if (newTeamDoc) { console.log("ABORT: new team doc already exists — refusing to overwrite"); process.exit(1); }
    if (!oldTeamDoc) { console.log("ABORT: old team doc missing"); process.exit(1); }

    var seasonEntry = (season.teams || []).find(function (t) { return t.teamID === OLD_ID; });
    console.log("  season.teams[] entry uses OLD id:", !!seasonEntry, seasonEntry ? "slot=" + seasonEntry.slot + " name=" + seasonEntry.name : "");

    var scheduleRefs = [];
    (season.schedule || []).forEach(function (dg) {
        (dg.games || []).forEach(function (g) {
            if (g.homeTeamID === OLD_ID || g.awayTeamID === OLD_ID) scheduleRefs.push(g);
        });
    });
    console.log("  schedule entries referencing OLD id:", scheduleRefs.length);
    scheduleRefs.forEach(function (g) { console.log("    -", g.id, "|", g.home, "vs", g.away); });

    var recordsRef = season.bracket && season.bracket.records && season.bracket.records[OLD_ID];
    console.log("  bracket.records OLD id present:", !!recordsRef, recordsRef ? "(" + JSON.stringify(recordsRef) + ")" : "");

    var { resources: playerRefs } = await playersContainer.items
        .query({ query: "SELECT * FROM c WHERE EXISTS (SELECT VALUE t FROM t IN c.teams WHERE t.teamID = @t)", parameters: [{ name: "@t", value: OLD_ID }] })
        .fetchAll();
    console.log("  player docs referencing OLD id:", playerRefs.length);
    playerRefs.forEach(function (p) { console.log("    -", p.id, "|", p.name); });

    if (!APPLY) { console.log("\n(dry run — re-run with --apply to commit)"); return; }

    // === Apply ===

    // 1. Create new team doc (clone old, change id, name, slot)
    var newDoc = JSON.parse(JSON.stringify(oldTeamDoc));
    newDoc.id = NEW_ID;
    newDoc.name = NEW_NAME;
    if (newDoc.seasons && newDoc.seasons[0]) newDoc.seasons[0].teamSlot = EXPECTED_SLOT;
    delete newDoc._rid; delete newDoc._self; delete newDoc._etag; delete newDoc._attachments; delete newDoc._ts;
    await teamsContainer.items.create(newDoc);
    console.log("TEAM DOC CREATED:", NEW_ID);

    // 2. Delete old team doc
    await teamsContainer.item(OLD_ID, OLD_ID).delete();
    console.log("OLD TEAM DOC DELETED:", OLD_ID);

    // 3. Update season.teams[] + schedule + bracket.records
    if (seasonEntry) seasonEntry.teamID = NEW_ID;
    scheduleRefs.forEach(function (g) {
        if (g.homeTeamID === OLD_ID) g.homeTeamID = NEW_ID;
        if (g.awayTeamID === OLD_ID) g.awayTeamID = NEW_ID;
    });
    if (season.bracket && season.bracket.records && season.bracket.records[OLD_ID]) {
        season.bracket.records[NEW_ID] = season.bracket.records[OLD_ID];
        delete season.bracket.records[OLD_ID];
    }
    await seasonsContainer.item(SEASON_ID, SEASON_ID).replace(season);
    console.log("SEASON DOC UPDATED");

    // 4. Update player docs
    for (var i = 0; i < playerRefs.length; i++) {
        var p = playerRefs[i];
        (p.teams || []).forEach(function (t) {
            if (t.teamID === OLD_ID) {
                t.teamID = NEW_ID;
                t.name = NEW_NAME;
            }
        });
        await playersContainer.items.upsert(p);
        console.log("  PLAYER UPDATED:", p.id);
    }

    console.log("\nDONE");
})().catch(function (e) { console.error(e); process.exit(1); });
