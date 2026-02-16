var { CosmosClient } = require("@azure/cosmos");

var client = new CosmosClient({
    endpoint: process.env.COSMOS_ENDPOINT,
    key: process.env.COSMOS_KEY
});

var teamsContainer = client
    .database("DRMBL Database")
    .container("Teams");

module.exports = async function (req, res) {
    if (req.method !== "GET") {
        return res.status(405).json({ error: "Method not allowed" });
    }

    var teamID = req.query.id;
    var seasonID = req.query.season;
    if (!teamID || !seasonID) {
        return res.status(400).json({ error: "Missing team id or season parameter." });
    }

    try {
        var response = await teamsContainer.item(teamID, teamID).read();
        var teamDoc = response.resource;

        if (!teamDoc) {
            return res.status(404).json({ error: "Team not found." });
        }

        // Find the current season entry
        var seasonEntry = null;
        for (var i = 0; i < teamDoc.seasons.length; i++) {
            if (teamDoc.seasons[i].id === seasonID) {
                seasonEntry = teamDoc.seasons[i];
                break;
            }
        }

        if (!seasonEntry) {
            return res.status(404).json({ error: "Team not found in current season." });
        }

        // Return only the fields the stat tracker needs
        // Filter out empty roster slots
        var roster = [];
        for (var j = 0; j < seasonEntry.roster.length; j++) {
            var p = seasonEntry.roster[j];
            if (p.name) {
                roster.push({
                    playerID: p.playerID,
                    name: p.name
                });
            }
        }

        return res.status(200).json({
            id: teamDoc.id,
            name: teamDoc.name,
            roster: roster
        });

    } catch (err) {
        console.error("Team fetch error:", err.message);
        return res.status(500).json({ error: "Failed to load team data." });
    }
};
