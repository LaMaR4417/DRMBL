var { CosmosClient } = require("@azure/cosmos");

var client = new CosmosClient({
    endpoint: process.env.COSMOS_ENDPOINT,
    key: process.env.COSMOS_KEY
});

var database = client.database("DRMBL Database");
var seasonsContainer = database.container("Seasons");

var BOX_SCORES_CONTAINER_ID = "Box Scores";
var DEFAULT_SEASON_ID = "Spring - Mens - 2026";

async function getBoxScoresContainer() {
    var { container } = await database.containers.createIfNotExists({
        id: BOX_SCORES_CONTAINER_ID,
        partitionKey: { paths: ["/id"] }
    });
    return container;
}

module.exports = async function (req, res) {
    if (req.method !== "GET") {
        return res.status(405).json({ error: "Method not allowed" });
    }

    var boxScoreId = req.query.id;
    var seasonId = req.query.season;

    // ── Single box score fetch ──
    if (boxScoreId) {
        try {
            var boxScoresContainer = await getBoxScoresContainer();
            var resp = await boxScoresContainer.item(boxScoreId, boxScoreId).read();
            var doc = resp.resource;

            if (!doc) {
                return res.status(404).json({ error: "Box score not found." });
            }

            return res.status(200).json({ boxScore: doc });
        } catch (err) {
            if (err.code === 404) {
                return res.status(404).json({ error: "Box score not found." });
            }
            console.error("Box score fetch error:", err.message);
            return res.status(500).json({ error: "Failed to load box score." });
        }
    }

    // ── Game summaries for a season ──
    if (seasonId || !boxScoreId) {
        try {
            var sid = seasonId || DEFAULT_SEASON_ID;
            var seasonResp = await seasonsContainer.item(sid, sid).read();
            var seasonDoc = seasonResp.resource;

            if (!seasonDoc) {
                return res.status(404).json({ error: "Season not found." });
            }

            // Build slot → team name lookup
            var slotNames = {};
            if (seasonDoc.teams) {
                for (var t = 0; t < seasonDoc.teams.length; t++) {
                    var team = seasonDoc.teams[t];
                    if (team.slot) {
                        slotNames[team.slot] = team.name || "TBD";
                    }
                }
            }

            // Extract completed games from weeklySchedule
            var weeks = [];
            var schedule = seasonDoc.weeklySchedule || [];

            for (var w = 0; w < schedule.length; w++) {
                var weekEntry = schedule[w];
                var completedGames = [];

                if (!weekEntry.games) continue;

                for (var g = 0; g < weekEntry.games.length; g++) {
                    var game = weekEntry.games[g];
                    if (!game.result || !game.result.boxScoreID) continue;

                    var result = game.result;

                    // Determine which side won
                    var homeSlot = game.home;
                    var awaySlot = game.away;
                    var winnerIsHome = result.winner.slot === homeSlot;

                    completedGames.push({
                        boxScoreID: result.boxScoreID,
                        time: game.time || null,
                        home: {
                            name: winnerIsHome ? result.winner.team : result.loser.team,
                            slot: homeSlot,
                            score: winnerIsHome ? result.winner.score : result.loser.score
                        },
                        away: {
                            name: winnerIsHome ? result.loser.team : result.winner.team,
                            slot: awaySlot,
                            score: winnerIsHome ? result.loser.score : result.winner.score
                        },
                        winner: winnerIsHome ? "home" : "away"
                    });
                }

                if (completedGames.length > 0) {
                    weeks.push({
                        week: weekEntry.week,
                        date: weekEntry.date || null,
                        type: weekEntry.type || null,
                        games: completedGames
                    });
                }
            }

            return res.status(200).json({
                league: seasonDoc.league || null,
                weeks: weeks
            });

        } catch (err) {
            if (err.code === 404) {
                return res.status(404).json({ error: "Season not found." });
            }
            console.error("Box scores summary error:", err.message);
            return res.status(500).json({ error: "Failed to load game summaries." });
        }
    }

    return res.status(400).json({ error: "Provide season or id parameter." });
};
