const { CosmosClient } = require("@azure/cosmos");

const client = new CosmosClient({
    endpoint: process.env.COSMOS_ENDPOINT,
    key: process.env.COSMOS_KEY
});

const container = client
    .database("DRMBL Database")
    .container("Registration Forms");

module.exports = async function (req, res) {
    if (req.method !== "POST") {
        return res.status(405).json({ error: "Method not allowed" });
    }

    try {
        var body = req.body;

        if (!body || !body.teamName || !body.owner || !body.players) {
            return res.status(400).json({ error: "Missing required fields" });
        }

        var now = new Date().toISOString();
        body.id = body.teamName + " - " + now;
        body.submittedAt = now;

        var { resource } = await container.items.create(body);

        return res.status(200).json({ success: true, id: resource.id });
    } catch (err) {
        console.error("Cosmos DB error:", err.message);
        return res.status(500).json({ error: "Registration failed. Please try again." });
    }
};
