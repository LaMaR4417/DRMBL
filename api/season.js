var { CosmosClient } = require("@azure/cosmos");

var client = new CosmosClient({
    endpoint: process.env.COSMOS_ENDPOINT,
    key: process.env.COSMOS_KEY
});

var seasonsContainer = client
    .database("DRMBL Database")
    .container("Seasons");

var teamsContainer = client
    .database("DRMBL Database")
    .container("Teams");

var DEFAULT_SEASON_ID = "Spring - Mens - 2026";

module.exports = async function (req, res) {
    if (req.method !== "GET") {
        return res.status(405).json({ error: "Method not allowed" });
    }

    // Team lookup: /api/season?type=team&id=...&season=...
    if (req.query.type === "team") {
        var teamID = req.query.id;
        var seasonID = req.query.season;
        if (!teamID || !seasonID) {
            return res.status(400).json({ error: "Missing team id or season parameter." });
        }

        try {
            var teamResponse = await teamsContainer.item(teamID, teamID).read();
            var teamDoc = teamResponse.resource;

            if (!teamDoc) {
                return res.status(404).json({ error: "Team not found." });
            }

            var seasonEntry = null;
            for (var i = 0; i < teamDoc.seasons.length; i++) {
                if (teamDoc.seasons[i].id === seasonID) {
                    seasonEntry = teamDoc.seasons[i];
                    break;
                }
            }

            if (!seasonEntry) {
                return res.status(404).json({ error: "Team not found in current season." });
            }

            var roster = [];
            for (var j = 0; j < seasonEntry.roster.length; j++) {
                var p = seasonEntry.roster[j];
                if (p.name) {
                    roster.push({
                        playerID: p.playerID,
                        name: p.name
                    });
                }
            }

            return res.status(200).json({
                id: teamDoc.id,
                name: teamDoc.name,
                roster: roster
            });

        } catch (err) {
            console.error("Team fetch error:", err.message);
            return res.status(500).json({ error: "Failed to load team data." });
        }
    }

    // Default: season lookup
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
            teams: seasonDoc.teams,
            weeklySchedule: seasonDoc.weeklySchedule || null,
            games: seasonDoc.games || null,
            groups: seasonDoc.groups || null
        });

    } catch (err) {
        console.error("Season fetch error:", err.message);
        return res.status(500).json({ error: "Failed to load season data." });
    }
};
