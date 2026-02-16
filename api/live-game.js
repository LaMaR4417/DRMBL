var { CosmosClient } = require("@azure/cosmos");

var client = new CosmosClient({
    endpoint: process.env.COSMOS_ENDPOINT,
    key: process.env.COSMOS_KEY
});

var database = client.database("DRMBL Database");

var CONTAINER_ID = "Live Games";

async function getContainer() {
    var { container } = await database.containers.createIfNotExists({
        id: CONTAINER_ID,
        partitionKey: { paths: ["/id"] }
    });
    return container;
}

module.exports = async function (req, res) {
    if (req.method === "GET") {
        try {
            var container = await getContainer();

            var response = await container.item("active-game", "active-game").read();
            var doc = response.resource;

            if (!doc) {
                return res.status(200).json({ active: false });
            }

            return res.status(200).json({
                boxScore: doc.boxScore,
                updatedAt: doc.updatedAt
            });

        } catch (err) {
            // 404 from Cosmos means no active game document
            if (err.code === 404) {
                return res.status(200).json({ active: false });
            }
            console.error("Live game GET error:", err.message);
            return res.status(500).json({ error: "Failed to load live game." });
        }

    } else if (req.method === "POST") {
        try {
            var body = req.body;

            if (!body || !body.boxScore) {
                return res.status(400).json({ error: "Missing boxScore." });
            }

            var container = await getContainer();

            var doc = {
                id: "active-game",
                boxScore: body.boxScore,
                updatedAt: new Date().toISOString()
            };

            await container.items.upsert(doc);

            return res.status(200).json({ success: true });

        } catch (err) {
            console.error("Live game POST error:", err.message);
            return res.status(500).json({ error: "Failed to update live game." });
        }

    } else {
        return res.status(405).json({ error: "Method not allowed" });
    }
};
