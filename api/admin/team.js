var { CosmosClient } = require("@azure/cosmos");

var client = new CosmosClient({
    endpoint: process.env.COSMOS_ENDPOINT,
    key: process.env.COSMOS_KEY
});

var database = client.database("DRMBL Database");
var teamsContainer = database.container("Teams");

module.exports = async function (req, res) {
    if (req.method !== "GET") {
        return res.status(405).json({ error: "Method not allowed" });
    }

    var teamID = req.query.id;
    var seasonID = req.query.season;

    if (!teamID) {
        return res.status(400).json({ error: "Missing required query param: id" });
    }

    try {
        var response = await teamsContainer.item(teamID, teamID).read();
        var teamDoc = response.resource;

        if (!teamDoc) {
            return res.status(404).json({ error: "Team not found." });
        }

        // If season specified, include only that season entry
        if (seasonID && teamDoc.seasons) {
            var seasonEntry = null;
            for (var i = 0; i < teamDoc.seasons.length; i++) {
                if (teamDoc.seasons[i].id === seasonID) {
                    seasonEntry = teamDoc.seasons[i];
                    break;
                }
            }
            return res.status(200).json({
                success: true,
                team: {
                    id: teamDoc.id,
                    name: teamDoc.name,
                    owner: teamDoc.owner,
                    status: teamDoc.status,
                    season: seasonEntry
                }
            });
        }

        return res.status(200).json({ success: true, team: teamDoc });
    } catch (err) {
        console.error("Admin team fetch error:", err.message);
        return res.status(500).json({ error: "Failed to fetch team." });
    }
};
