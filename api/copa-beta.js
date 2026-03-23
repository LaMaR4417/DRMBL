var { CosmosClient } = require("@azure/cosmos");

var client = new CosmosClient({
    endpoint: process.env.COSMOS_ENDPOINT,
    key: process.env.COSMOS_KEY
});

var seasonsContainer = client
    .database("DRMBL Database")
    .container("Seasons");

module.exports = async function (req, res) {
    if (req.method !== "GET") {
        return res.status(405).json({ error: "Method not allowed" });
    }

    try {
        var { resources } = await seasonsContainer.items
            .query("SELECT * FROM c WHERE CONTAINS(c.id, 'Copa Beta - Categoria')")
            .fetchAll();

        var categories = resources.map(function (doc) {
            return {
                id: doc.id,
                league: doc.league || null,
                teams: doc.teams || [],
                games: doc.games || [],
                groups: doc.groups || null,
                timeline: doc.timeline || null
            };
        });

        return res.status(200).json({ categories: categories });

    } catch (err) {
        console.error("Copa Beta fetch error:", err.message);
        return res.status(500).json({ error: "Failed to load Copa Beta data." });
    }
};
