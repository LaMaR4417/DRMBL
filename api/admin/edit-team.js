var { CosmosClient } = require("@azure/cosmos");

var client = new CosmosClient({
    endpoint: process.env.COSMOS_ENDPOINT,
    key: process.env.COSMOS_KEY
});

var database = client.database("DRMBL Database");
var teamsContainer = database.container("Teams");
var seasonsContainer = database.container("Seasons");

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

module.exports = async function (req, res) {
    if (req.method !== "POST") {
        return res.status(405).json({ error: "Method not allowed" });
    }

    try {
        var body = req.body;

        if (!body || !body.teamId || !body.seasonId) {
            return res.status(400).json({ error: "Missing required fields: teamId, seasonId" });
        }

        // Read team document
        var teamResponse = await teamsContainer.item(body.teamId, body.teamId).read();
        var teamDoc = teamResponse.resource;

        if (!teamDoc) {
            return res.status(404).json({ error: "Team not found." });
        }

        // Find the season entry
        var seasonIndex = -1;
        for (var i = 0; i < teamDoc.seasons.length; i++) {
            if (teamDoc.seasons[i].id === body.seasonId) {
                seasonIndex = i;
                break;
            }
        }

        if (seasonIndex === -1) {
            return res.status(404).json({ error: "Season entry not found on this team." });
        }

        // Determine max roster from season doc
        var maxRoster = 12;
        try {
            var seasonResponse = await seasonsContainer.item(body.seasonId, body.seasonId).read();
            if (seasonResponse.resource && seasonResponse.resource.maxRoster) {
                maxRoster = seasonResponse.resource.maxRoster;
            }
        } catch (e) {
            // fallback to 12
        }

        // Update owner if provided
        if (body.owner) {
            if (body.owner.name) teamDoc.owner.name = body.owner.name;
            if (body.owner.phone !== undefined) teamDoc.owner.phone = body.owner.phone;
            if (body.owner.email !== undefined) teamDoc.owner.email = body.owner.email;
        }

        // Update team name if provided
        if (body.teamName) {
            teamDoc.name = body.teamName;
        }

        // Update roster if provided
        if (body.players && Array.isArray(body.players)) {
            var roster = [];
            for (var p = 0; p < body.players.length; p++) {
                var player = body.players[p];
                if (!player.name || !player.name.trim()) continue;
                roster.push({
                    playerID: buildPlayerID(player),
                    name: player.name.trim(),
                    dob: {
                        year: (player.dob && player.dob.year) ? player.dob.year : null,
                        month: (player.dob && player.dob.month) ? player.dob.month : null,
                        date: (player.dob && player.dob.date) ? player.dob.date : null
                    },
                    phone: player.phone || null,
                    insuranceWaiver: { signed: player.waiverSigned || false }
                });
            }
            while (roster.length < maxRoster) {
                roster.push(buildEmptyPlayer());
            }
            teamDoc.seasons[seasonIndex].roster = roster;
        }

        // Replace the team document
        await teamsContainer.item(body.teamId, body.teamId).replace(teamDoc);

        // Also update team name in season doc if it changed
        if (body.teamName) {
            try {
                var seasonResp = await seasonsContainer.item(body.seasonId, body.seasonId).read();
                var seasonDoc = seasonResp.resource;
                if (seasonDoc && seasonDoc.teams) {
                    for (var t = 0; t < seasonDoc.teams.length; t++) {
                        if (seasonDoc.teams[t].teamID === body.teamId) {
                            seasonDoc.teams[t].name = body.teamName;
                            await seasonsContainer.item(body.seasonId, body.seasonId).replace(seasonDoc);
                            break;
                        }
                    }
                }
            } catch (syncErr) {
                console.error("Season name sync failed (team was updated):", syncErr.message);
            }
        }

        return res.status(200).json({ success: true, teamID: body.teamId });
    } catch (err) {
        console.error("Edit team error:", err.message);
        return res.status(500).json({ error: "Failed to update team." });
    }
};
