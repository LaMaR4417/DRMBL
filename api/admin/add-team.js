var { CosmosClient } = require("@azure/cosmos");

var client = new CosmosClient({
    endpoint: process.env.COSMOS_ENDPOINT,
    key: process.env.COSMOS_KEY
});

var database = client.database("DRMBL Database");
var teamsContainer = database.container("Teams");
var seasonsContainer = database.container("Seasons");

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

function buildTeamDoc(body, teamSlot, seasonID, regularGameCount, playoffRoundCount) {
    var teamID = sanitizeForID(body.teamName) + " - " + sanitizeForID(body.owner.name);

    var roster = [];
    if (body.players && body.players.length > 0) {
        for (var i = 0; i < body.players.length; i++) {
            var p = body.players[i];
            if (!p.name || !p.name.trim()) continue;
            roster.push({
                playerID: buildPlayerID(p),
                name: p.name.trim(),
                dob: {
                    year: (p.dob && p.dob.year) ? p.dob.year : null,
                    month: (p.dob && p.dob.month) ? p.dob.month : null,
                    date: (p.dob && p.dob.date) ? p.dob.date : null
                },
                phone: p.phone || null,
                insuranceWaiver: { signed: p.waiverSigned || false }
            });
        }
    }
    while (roster.length < 12) {
        roster.push(buildEmptyPlayer());
    }

    var games = [];
    for (var g = 0; g < regularGameCount; g++) {
        games.push(buildEmptyGame());
    }

    var playoffs = [];
    for (var pf = 0; pf < playoffRoundCount; pf++) {
        playoffs.push(buildEmptyGame());
    }

    return {
        id: teamID,
        name: body.teamName,
        owner: {
            name: body.owner.name || "",
            phone: body.owner.phone || "",
            email: body.owner.email || ""
        },
        status: {
            registered: true,
            active: false,
            inactive: false,
            disbanded: false
        },
        seasons: [{
            id: seasonID,
            teamSlot: teamSlot,
            roster: roster,
            record: {
                rank: null,
                wins: null,
                losses: null,
                pointDifferential: null,
                games: games,
                playoffs: playoffs
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

        if (!body || !body.seasonId || !body.teamName || !body.owner || !body.owner.name) {
            return res.status(400).json({ error: "Missing required fields: seasonId, teamName, owner.name" });
        }

        // Step 1: Read the Season document
        var seasonResponse = await seasonsContainer.item(body.seasonId, body.seasonId).read();
        var seasonDoc = seasonResponse.resource;
        var seasonEtag = seasonResponse.etag;

        if (!seasonDoc || !seasonDoc.teams || !Array.isArray(seasonDoc.teams)) {
            return res.status(404).json({ error: "Season not found or malformed." });
        }

        // Count regular games and playoff rounds from the schedule
        var regularGameCount = 0;
        var playoffRoundCount = 0;
        if (seasonDoc.weeklySchedule) {
            for (var w = 0; w < seasonDoc.weeklySchedule.length; w++) {
                if (seasonDoc.weeklySchedule[w].type === "playoffs") {
                    playoffRoundCount = seasonDoc.weeklySchedule[w].games ? seasonDoc.weeklySchedule[w].games.length : 0;
                } else {
                    regularGameCount++;
                }
            }
        }

        // Step 2: Find the target slot
        var targetSlot = null;
        var targetIndex = -1;

        if (body.slot) {
            // Admin specified a slot
            for (var i = 0; i < seasonDoc.teams.length; i++) {
                if (seasonDoc.teams[i].slot === body.slot) {
                    if (seasonDoc.teams[i].teamID) {
                        return res.status(409).json({ error: "Slot " + body.slot + " is already taken by " + seasonDoc.teams[i].name });
                    }
                    targetSlot = body.slot;
                    targetIndex = i;
                    break;
                }
            }
            if (targetIndex === -1) {
                return res.status(400).json({ error: "Slot " + body.slot + " does not exist in this season." });
            }
        } else {
            // Auto-assign first open slot
            for (var i = 0; i < seasonDoc.teams.length; i++) {
                if (!seasonDoc.teams[i].teamID) {
                    targetSlot = seasonDoc.teams[i].slot;
                    targetIndex = i;
                    break;
                }
            }
            if (targetSlot === null) {
                return res.status(409).json({ error: "All slots are full. No open slots available." });
            }
        }

        // Step 3: Build and create the Team document
        var teamDoc = buildTeamDoc(body, targetSlot, body.seasonId, regularGameCount, playoffRoundCount);
        var teamID = teamDoc.id;
        await teamsContainer.items.create(teamDoc);

        // Step 4: Update the Season document with etag check
        seasonDoc.teams[targetIndex].teamID = teamID;
        seasonDoc.teams[targetIndex].name = body.teamName;

        try {
            var replaceOptions = {
                accessCondition: { type: "IfMatch", condition: seasonEtag }
            };
            await seasonsContainer.item(body.seasonId, body.seasonId).replace(seasonDoc, replaceOptions);
        } catch (conflictErr) {
            if (conflictErr.code === 412) {
                try {
                    await teamsContainer.item(teamID, teamID).delete();
                } catch (cleanupErr) {
                    console.error("Orphan team cleanup failed:", cleanupErr.message);
                }
                return res.status(409).json({ error: "Concurrent modification detected. Please try again." });
            }
            throw conflictErr;
        }

        return res.status(200).json({ success: true, teamID: teamID, slot: targetSlot });
    } catch (err) {
        console.error("Add team error:", err.message);

        if (err.code === 409) {
            return res.status(409).json({ error: "A team with this name and owner already exists." });
        }

        return res.status(500).json({ error: "Failed to add team." });
    }
};
