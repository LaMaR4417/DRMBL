var { CosmosClient } = require("@azure/cosmos");

var client = new CosmosClient({
    endpoint: process.env.COSMOS_ENDPOINT,
    key: process.env.COSMOS_KEY
});

var leaguesContainer = client
    .database("DRMBL Database")
    .container("Leagues");

module.exports = async function (req, res) {
    if (req.method !== "GET") {
        return res.status(405).json({ error: "Method not allowed" });
    }

    try {
        var { resources } = await leaguesContainer.items
            .query("SELECT * FROM c")
            .fetchAll();

        var leagues = resources.map(function (doc) {
            return {
                id: doc.id,
                league: doc.league || null
            };
        });

        return res.status(200).json({ leagues: leagues });

    } catch (err) {
        console.error("Leagues list error:", err.message);
        return res.status(500).json({ error: "Failed to load leagues." });
    }
};
