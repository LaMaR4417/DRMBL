var { CosmosClient } = require("@azure/cosmos");

var client = new CosmosClient({
    endpoint: process.env.COSMOS_ENDPOINT,
    key: process.env.COSMOS_KEY
});

var database = client.database("DRMBL Database");
var seasonsContainer = database.container("Seasons");

var boxScoresContainer = database.container("Box Scores");
var liveGamesContainer = database.container("Live Games");

module.exports = async function (req, res) {
    if (req.method !== "GET") {
        return res.status(405).json({ error: "Method not allowed" });
    }

    var boxScoreId = req.query.id;
    var seasonId = req.query.season;

    // ── Single box score fetch ──
    if (boxScoreId) {
        try {
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

    // ── Game list for a season ──
    if (seasonId) {
        try {
            var seasonResp = await seasonsContainer.item(seasonId, seasonId).read();
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

            // Collect all game IDs from both weeklySchedule and schedule
            var allGames = [];

            // Mode 1: weeklySchedule (predetermined — DRMBL)
            if (seasonDoc.weeklySchedule) {
                for (var w = 0; w < seasonDoc.weeklySchedule.length; w++) {
                    var week = seasonDoc.weeklySchedule[w];
                    if (!week.games) continue;
                    for (var g = 0; g < week.games.length; g++) {
                        var game = week.games[g];
                        var homeName = slotNames[game.home] || game.home;
                        var awayName = slotNames[game.away] || game.away;
                        allGames.push({
                            id: game.id || null,
                            home: homeName,
                            away: awayName,
                            homeSlot: game.home,
                            awaySlot: game.away,
                            time: game.time || null,
                            location: game.location || null,
                            week: week.week,
                            weekType: week.type || null,
                            weekNote: week.note || null,
                            weekDate: week.date || null,
                            round: game.round || null,
                            status: "scheduled"
                        });
                    }
                }
            }

            // Mode 2: schedule (on-the-fly — LOMBA)
            if (seasonDoc.schedule) {
                for (var s = 0; s < seasonDoc.schedule.length; s++) {
                    var entry = seasonDoc.schedule[s];
                    if (!entry.games) continue;
                    for (var g = 0; g < entry.games.length; g++) {
                        var game = entry.games[g];
                        allGames.push({
                            id: game.id || null,
                            home: game.home,
                            away: game.away,
                            homeSlot: null,
                            awaySlot: null,
                            time: null,
                            week: null,
                            weekType: null,
                            weekNote: null,
                            weekDate: entry.date || null,
                            round: null,
                            status: "scheduled"
                        });
                    }
                }
            }

            // Mode 3: top-level games array (tournament-style — Copa Beta)
            if (seasonDoc.games && !seasonDoc.weeklySchedule) {
                for (var g = 0; g < seasonDoc.games.length; g++) {
                    var game = seasonDoc.games[g];
                    var homeName = slotNames[game.home] || game.home;
                    var awayName = slotNames[game.away] || game.away;
                    allGames.push({
                        id: game.id || null,
                        home: homeName,
                        away: awayName,
                        homeSlot: game.home,
                        awaySlot: game.away,
                        time: game.time || null,
                        location: game.location || null,
                        week: null,
                        weekType: null,
                        weekNote: null,
                        weekDate: game.date || null,
                        round: game.round || null,
                        status: "scheduled"
                    });
                }
            }

            // Collect all game IDs that need lookup
            var gameIds = [];
            for (var i = 0; i < allGames.length; i++) {
                if (allGames[i].id) gameIds.push(allGames[i].id);
            }

            // Batch lookup: Box Scores
            var boxScoreMap = {};
            if (gameIds.length > 0) {
                try {
                    var query = "SELECT c.id, c.team, c.gameInfo, c.teamInfo.home.score.current AS homeScore, c.teamInfo.away.score.current AS awayScore FROM c WHERE c.season = @season";
                    var { resources: boxDocs } = await boxScoresContainer.items
                        .query({ query: query, parameters: [{ name: "@season", value: seasonId }] })
                        .fetchAll();
                    for (var b = 0; b < boxDocs.length; b++) {
                        boxScoreMap[boxDocs[b].id] = boxDocs[b];
                    }
                } catch (err) {
                    console.error("Box scores lookup failed:", err.message);
                }
            }

            // Batch lookup: Live Games
            var liveGameMap = {};
            try {
                var { resources: liveDocs } = await liveGamesContainer.items
                    .query("SELECT c.id, c.team, c.gameInfo, c.teamInfo.home.score.current AS homeScore, c.teamInfo.away.score.current AS awayScore FROM c")
                    .fetchAll();
                for (var l = 0; l < liveDocs.length; l++) {
                    liveGameMap[liveDocs[l].id] = liveDocs[l];
                }
            } catch (err) {
                console.error("Live games lookup failed:", err.message);
            }

            // Merge status into allGames
            for (var i = 0; i < allGames.length; i++) {
                var gid = allGames[i].id;
                if (gid && boxScoreMap[gid]) {
                    var bs = boxScoreMap[gid];
                    allGames[i].status = "final";
                    allGames[i].homeScore = bs.homeScore || 0;
                    allGames[i].awayScore = bs.awayScore || 0;
                    allGames[i].winner = bs.gameInfo && bs.gameInfo.state ? bs.gameInfo.state.winner : null;
                } else if (gid && liveGameMap[gid]) {
                    var lg = liveGameMap[gid];
                    allGames[i].status = "live";
                    allGames[i].homeScore = lg.homeScore || 0;
                    allGames[i].awayScore = lg.awayScore || 0;
                    allGames[i].quarter = lg.gameInfo && lg.gameInfo.state ? lg.gameInfo.state.currentQuarter : null;
                }
            }

            // Add any box scores for this season that weren't in the schedule
            var scheduledIds = {};
            for (var i = 0; i < allGames.length; i++) {
                if (allGames[i].id) scheduledIds[allGames[i].id] = true;
            }
            for (var bsId in boxScoreMap) {
                if (!scheduledIds[bsId]) {
                    var bs = boxScoreMap[bsId];
                    allGames.push({
                        id: bsId,
                        home: bs.team ? bs.team.home : "Unknown",
                        away: bs.team ? bs.team.away : "Unknown",
                        homeSlot: null,
                        awaySlot: null,
                        time: null,
                        week: null,
                        weekType: null,
                        weekNote: null,
                        weekDate: bs.gameInfo && bs.gameInfo.general ? bs.gameInfo.general.date : null,
                        round: null,
                        status: "final",
                        homeScore: bs.homeScore || 0,
                        awayScore: bs.awayScore || 0,
                        winner: bs.gameInfo && bs.gameInfo.state ? bs.gameInfo.state.winner : null
                    });
                }
            }

            return res.status(200).json({
                league: seasonDoc.league || null,
                games: allGames
            });

        } catch (err) {
            if (err.code === 404) {
                return res.status(404).json({ error: "Season not found." });
            }
            console.error("Box scores error:", err.message);
            return res.status(500).json({ error: "Failed to load games." });
        }
    }

    return res.status(400).json({ error: "Provide season or id parameter." });
};
