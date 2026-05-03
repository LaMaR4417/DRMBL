// GET /api/stats?league=drmbl                       → active season's stats doc
// GET /api/stats?seasonId=<seasonID>                 → that season's stats doc
//
// Returns: { stats: <SeasonStats doc> }

var { CosmosClient } = require("@azure/cosmos");

var client = new CosmosClient({
    endpoint: process.env.COSMOS_ENDPOINT,
    key: process.env.COSMOS_KEY
});

var db = client.database("DRMBL Database");

module.exports = async function (req, res) {
    if (req.method !== "GET") {
        return res.status(405).json({ error: "Method not allowed" });
    }

    var seasonId = req.query.seasonId || null;
    var league = req.query.league || null;

    try {
        // Resolve seasonId from active league if not provided directly
        if (!seasonId && league) {
            var leagueDocId = league.toUpperCase() === 'DRMBL' ? 'DRMBL'
                : league.toLowerCase() === 'lomba' ? 'LOMBA'
                : league.toLowerCase() === 'copa-beta' ? 'Copa Beta'
                : league;
            var { resources: leagues } = await db.container('Leagues').items
                .query({ query: "SELECT * FROM c WHERE c.id = @id", parameters: [{ name: '@id', value: leagueDocId }] })
                .fetchAll();
            if (!leagues.length || !leagues[0].league || !leagues[0].league.activeSeason) {
                return res.status(404).json({ error: "Active season not found for league: " + league });
            }
            seasonId = leagues[0].league.activeSeason;
        }

        if (!seasonId) {
            return res.status(400).json({ error: "Provide seasonId or league parameter." });
        }

        // Look up the stats doc by seasonID
        var { resources: docs } = await db.container('Season Stats').items
            .query({ query: "SELECT * FROM c WHERE c.seasonID = @s", parameters: [{ name: '@s', value: seasonId }] })
            .fetchAll();

        if (!docs.length) {
            return res.status(404).json({ error: "No stats yet for season: " + seasonId });
        }

        return res.status(200).json({ stats: docs[0] });
    } catch (err) {
        console.error("Stats fetch error:", err.message);
        return res.status(500).json({ error: "Failed to load stats." });
    }
};
