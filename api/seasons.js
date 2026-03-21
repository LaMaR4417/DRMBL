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
            .query("SELECT c.id, c.league, c.teams, c.weeklySchedule FROM c")
            .fetchAll();

        var seasons = resources.map(function (doc) {
            var teams = (doc.teams || []).filter(function (t) { return t.teamID; }).map(function (t) {
                return { name: t.name, slot: t.slot };
            });
            var dates = (doc.weeklySchedule || []).map(function (w) {
                return w.date || null;
            });
            return {
                id: doc.id,
                league: doc.league || null,
                teamCount: teams.length,
                teams: teams,
                dates: dates
            };
        });

        return res.status(200).json({ seasons: seasons });

    } catch (err) {
        console.error("Seasons list error:", err.message);
        return res.status(500).json({ error: "Failed to load seasons." });
    }
};
