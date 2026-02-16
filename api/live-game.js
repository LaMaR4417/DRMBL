var { CosmosClient } = require("@azure/cosmos");

var client = new CosmosClient({
    endpoint: process.env.COSMOS_ENDPOINT,
    key: process.env.COSMOS_KEY
});

var database = client.database("DRMBL Database");

var CONTAINER_ID = "Live Games";
var STALE_THRESHOLD = 2 * 60 * 60 * 1000; // 2 hours

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

            var { resources } = await container.items
                .query("SELECT * FROM c")
                .fetchAll();

            var now = Date.now();
            var games = resources
                .filter(function (doc) {
                    // Filter out stale final games (older than 2 hours)
                    if (doc.boxScore && doc.boxScore.gameInfo && doc.boxScore.gameInfo.general.status === "final" && doc.updatedAt) {
                        var age = now - new Date(doc.updatedAt).getTime();
                        if (age > STALE_THRESHOLD) return false;
                    }
                    return true;
                })
                .map(function (doc) {
                    return {
                        gameId: doc.id,
                        boxScore: doc.boxScore,
                        updatedAt: doc.updatedAt
                    };
                });

            return res.status(200).json({ games: games });

        } catch (err) {
            console.error("Live game GET error:", err.message);
            return res.status(500).json({ error: "Failed to load live games." });
        }

    } else if (req.method === "POST") {
        try {
            var body = req.body;

            if (!body || !body.boxScore) {
                return res.status(400).json({ error: "Missing boxScore." });
            }

            var container = await getContainer();

            var doc = {
                id: body.gameId || "active-game",
                boxScore: body.boxScore,
                updatedAt: new Date().toISOString()
            };

            await container.items.upsert(doc);

            return res.status(200).json({ success: true });

        } catch (err) {
            console.error("Live game POST error:", err.message);
            return res.status(500).json({ error: "Failed to update live game." });
        }

    } else if (req.method === "DELETE") {
        try {
            var gameId = req.query.id;
            if (!gameId) {
                return res.status(400).json({ error: "Missing game id." });
            }

            var container = await getContainer();
            await container.item(gameId, gameId).delete();

            return res.status(200).json({ success: true });

        } catch (err) {
            if (err.code === 404) {
                return res.status(200).json({ success: true });
            }
            console.error("Live game DELETE error:", err.message);
            return res.status(500).json({ error: "Failed to delete live game." });
        }

    } else {
        return res.status(405).json({ error: "Method not allowed" });
    }
};
