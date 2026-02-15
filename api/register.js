var { CosmosClient } = require("@azure/cosmos");

var client = new CosmosClient({
    endpoint: process.env.COSMOS_ENDPOINT,
    key: process.env.COSMOS_KEY
});

var database = client.database("DRMBL Database");
var registrationContainer = database.container("Registration Forms");
var teamsContainer = database.container("Teams");
var seasonsContainer = database.container("Seasons");

var SEASON_ID = "Spring - Mens - 2026";

function sanitizeForID(str) {
    return str.replace(/[\/\\?#]/g, "");
}

function buildPlayerID(player) {
    if (!player.dob || !player.dob.year || !player.dob.month || !player.dob.date) {
        return player.name + " - unknown";
    }
    var mm = String(player.dob.month).padStart(2, "0");
    var dd = String(player.dob.date).padStart(2, "0");
    var yyyy = String(player.dob.year);
    return player.name + " - " + yyyy + mm + dd;
}

function buildEmptyPlayer() {
    return {
        playerID: "",
        name: "",
        dob: { year: null, month: null, date: null },
        phone: null,
        insuranceWaiver: { signed: false }
    };
}

function buildEmptyGame() {
    return {
        id: "",
        result: {
            winner: { team: "", score: null },
            loser: { team: "", score: null }
        }
    };
}

function buildTeamDoc(body, teamSlot) {
    var teamID = sanitizeForID(body.teamName) + " - " + sanitizeForID(body.owner.name);

    var roster = [];
    for (var i = 0; i < body.players.length; i++) {
        var p = body.players[i];
        roster.push({
            playerID: buildPlayerID(p),
            name: p.name,
            dob: {
                year: p.dob.year,
                month: p.dob.month,
                date: p.dob.date
            },
            phone: p.phone || null,
            insuranceWaiver: { signed: false }
        });
    }
    while (roster.length < 12) {
        roster.push(buildEmptyPlayer());
    }

    var games = [];
    for (var g = 0; g < 10; g++) {
        games.push(buildEmptyGame());
    }

    return {
        id: teamID,
        name: body.teamName,
        owner: {
            name: body.owner.name,
            phone: body.owner.phone,
            email: body.owner.email
        },
        status: {
            registered: true,
            active: false,
            inactive: false,
            disbanded: false
        },
        seasons: [{
            id: SEASON_ID,
            teamSlot: teamSlot,
            roster: roster,
            record: {
                rank: null,
                wins: null,
                losses: null,
                pointDifferential: null,
                games: games,
                playoffs: [buildEmptyGame()]
            }
        }]
    };
}

module.exports = async function (req, res) {
    if (req.method !== "POST") {
        return res.status(405).json({ error: "Method not allowed" });
    }

    try {
        var body = req.body;

        if (!body || !body.teamName || !body.owner || !body.players) {
            return res.status(400).json({ error: "Missing required fields" });
        }

        // Step 1: Read the Season document to find the next open slot
        var seasonResponse = await seasonsContainer.item(SEASON_ID, SEASON_ID).read();
        var seasonDoc = seasonResponse.resource;
        var seasonEtag = seasonResponse.etag;

        if (!seasonDoc || !seasonDoc.teams || !Array.isArray(seasonDoc.teams)) {
            console.error("Season document not found or malformed:", SEASON_ID);
            return res.status(500).json({ error: "Registration is not open yet." });
        }

        // Step 2: Find the first open slot
        var openSlot = null;
        var openSlotIndex = -1;
        for (var i = 0; i < seasonDoc.teams.length; i++) {
            if (!seasonDoc.teams[i].teamID) {
                openSlot = seasonDoc.teams[i].slot;
                openSlotIndex = i;
                break;
            }
        }

        if (openSlot === null) {
            return res.status(409).json({ error: "League is full. Registration is closed." });
        }

        // Step 3: Build and create the Team document
        var teamDoc = buildTeamDoc(body, openSlot);
        var teamID = teamDoc.id;
        await teamsContainer.items.create(teamDoc);

        // Step 4: Update the Season document with etag check for race conditions
        seasonDoc.teams[openSlotIndex].teamID = teamID;
        seasonDoc.teams[openSlotIndex].name = body.teamName;

        try {
            var replaceOptions = {
                accessCondition: { type: "IfMatch", condition: seasonEtag }
            };
            await seasonsContainer.item(SEASON_ID, SEASON_ID).replace(seasonDoc, replaceOptions);
        } catch (conflictErr) {
            if (conflictErr.code === 412) {
                try {
                    await teamsContainer.item(teamID, teamID).delete();
                } catch (cleanupErr) {
                    console.error("Orphan team cleanup failed:", cleanupErr.message);
                }
                return res.status(409).json({ error: "Another team just registered. Please try again." });
            }
            throw conflictErr;
        }

        // Step 5: Save the registration form (best-effort)
        try {
            var now = new Date().toISOString();
            body.id = body.teamName + " - " + now;
            body.submittedAt = now;
            await registrationContainer.items.create(body);
        } catch (formErr) {
            console.error("Registration form save failed (team was created):", formErr.message);
        }

        return res.status(200).json({ success: true, teamID: teamID, slot: openSlot });

    } catch (err) {
        console.error("Registration error:", err.message);

        if (err.code === 409) {
            return res.status(409).json({ error: "A team with this name and owner already exists." });
        }

        return res.status(500).json({ error: "Registration failed. Please try again." });
    }
};
