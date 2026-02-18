var { CosmosClient } = require("@azure/cosmos");

var client = new CosmosClient({
    endpoint: process.env.COSMOS_ENDPOINT,
    key: process.env.COSMOS_KEY
});

var database = client.database("DRMBL Database");
var seasonsContainer = database.container("Seasons");

module.exports = async function (req, res) {
    if (req.method !== "POST") {
        return res.status(405).json({ error: "Method not allowed" });
    }

    try {
        var body = req.body;

        if (!body || !body.seasonId) {
            return res.status(400).json({ error: "Missing required field: seasonId" });
        }

        // Read the existing season document
        var response = await seasonsContainer.item(body.seasonId, body.seasonId).read();
        var seasonDoc = response.resource;

        if (!seasonDoc) {
            return res.status(404).json({ error: "Season not found." });
        }

        // Apply updates (only allowed fields)
        var updated = [];

        if (body.maxRoster !== undefined) {
            var maxRoster = parseInt(body.maxRoster);
            if (maxRoster < 1 || maxRoster > 30) {
                return res.status(400).json({ error: "maxRoster must be between 1 and 30" });
            }
            seasonDoc.maxRoster = maxRoster;
            updated.push("maxRoster=" + maxRoster);
        }

        if (body.name !== undefined) {
            seasonDoc.name = body.name;
            updated.push("name=" + body.name);
        }

        if (body.division !== undefined) {
            seasonDoc.division = body.division;
            updated.push("division=" + body.division);
        }

        if (updated.length === 0) {
            return res.status(400).json({ error: "No valid fields to update. Supported: maxRoster, name, division" });
        }

        // Replace the document
        await seasonsContainer.item(body.seasonId, body.seasonId).replace(seasonDoc);

        return res.status(200).json({ success: true, seasonId: body.seasonId, updated: updated });
    } catch (err) {
        console.error("Update season error:", err.message);
        return res.status(500).json({ error: "Failed to update season." });
    }
};
