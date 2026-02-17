var { CosmosClient } = require("@azure/cosmos");

var client = new CosmosClient({
    endpoint: process.env.COSMOS_ENDPOINT,
    key: process.env.COSMOS_KEY
});

var database = client.database("DRMBL Database");
var seasonsContainer = database.container("Seasons");

module.exports = async function (req, res) {
    if (req.method !== "GET") {
        return res.status(405).json({ error: "Method not allowed" });
    }

    try {
        var query = "SELECT c.id, c.name, c.division, c.timeline, c.teams FROM c";
        var { resources } = await seasonsContainer.items.query(query).fetchAll();

        return res.status(200).json({ success: true, seasons: resources });
    } catch (err) {
        console.error("Failed to list seasons:", err.message);
        return res.status(500).json({ error: "Failed to load seasons." });
    }
};
