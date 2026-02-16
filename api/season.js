var { CosmosClient } = require("@azure/cosmos");

var client = new CosmosClient({
    endpoint: process.env.COSMOS_ENDPOINT,
    key: process.env.COSMOS_KEY
});

var seasonsContainer = client
    .database("DRMBL Database")
    .container("Seasons");

var DEFAULT_SEASON_ID = "Spring - Mens - 2026";

module.exports = async function (req, res) {
    if (req.method !== "GET") {
        return res.status(405).json({ error: "Method not allowed" });
    }

    try {
        var seasonId = req.query.id || DEFAULT_SEASON_ID;
        var response = await seasonsContainer.item(seasonId, seasonId).read();
        var seasonDoc = response.resource;

        if (!seasonDoc) {
            return res.status(404).json({ error: "Season not found." });
        }

        return res.status(200).json({
            id: seasonDoc.id,
            league: seasonDoc.league || null,
            teams: seasonDoc.teams
        });

    } catch (err) {
        console.error("Season fetch error:", err.message);
        return res.status(500).json({ error: "Failed to load season data." });
    }
};
