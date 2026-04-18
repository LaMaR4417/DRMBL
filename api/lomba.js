var { CosmosClient } = require("@azure/cosmos");

var client = new CosmosClient({
    endpoint: process.env.COSMOS_ENDPOINT,
    key: process.env.COSMOS_KEY
});

var database = client.database("DRMBL Database");
var leaguesContainer = database.container("Leagues");
var seasonsContainer = database.container("Seasons");
var boxScoresContainer = database.container("Box Scores");

function parseTime(t) {
    if (!t) return 0;
    var d = new Date("2000-01-01 " + t);
    return isNaN(d.getTime()) ? 0 : d.getTime();
}

module.exports = async function (req, res) {
    var action = req.query.action;

    // GET /api/lomba?action=league
    if (req.method === "GET" && action === "league") {
        try {
            var { resource } = await leaguesContainer.item("LOMBA", "LOMBA").read();
            return res.status(200).json(resource);
        } catch (err) {
            console.error("LOMBA league fetch error:", err.message);
            return res.status(500).json({ error: "Failed to load league" });
        }
    }

    // GET /api/lomba?action=seasons
    if (req.method === "GET" && action === "seasons") {
        try {
            var { resources } = await seasonsContainer.items
                .query("SELECT * FROM c WHERE STARTSWITH(c.id, 'LOMBA -')")
                .fetchAll();
            return res.status(200).json(resources);
        } catch (err) {
            console.error("LOMBA seasons fetch error:", err.message);
            return res.status(500).json({ error: "Failed to load seasons" });
        }
    }

    // GET /api/lomba?action=season&id=...
    if (req.method === "GET" && action === "season") {
        var id = req.query.id;
        if (!id) return res.status(400).json({ error: "Missing id parameter" });
        try {
            var { resource } = await seasonsContainer.item(id, id).read();
            if (!resource) return res.status(404).json({ error: "Season not found" });
            return res.status(200).json(resource);
        } catch (err) {
            console.error("LOMBA season fetch error:", err.message);
            return res.status(500).json({ error: "Failed to load season" });
        }
    }

    // POST /api/lomba?action=save-game
    if (req.method === "POST" && action === "save-game") {
        var boxScore = req.body.boxScore;
        var seasonId = req.body.seasonId;
        var notes = req.body.notes || null;

        if (!boxScore || !seasonId) {
            return res.status(400).json({ error: "Missing boxScore or seasonId" });
        }

        try {
            await boxScoresContainer.items.upsert(boxScore);

            var { resource: season } = await seasonsContainer.item(seasonId, seasonId).read();
            if (!season) return res.status(404).json({ error: "Season not found" });

            var dateParts = boxScore.gameInfo.general.date.split("/");
            var dateEntry = {
                year: parseInt(dateParts[2]),
                month: parseInt(dateParts[0]),
                date: parseInt(dateParts[1])
            };

            var scheduleGame = {
                home: boxScore.team.home,
                away: boxScore.team.away,
                id: boxScore.id,
                time: boxScore.gameInfo.general.time,
                homeScore: boxScore.teamInfo.home.score.current,
                awayScore: boxScore.teamInfo.away.score.current,
                winner: boxScore.gameInfo.state.winner,
                forfeit: boxScore.gameInfo.state.forfeit || false
            };
            if (notes) scheduleGame.notes = notes;

            if (!season.schedule) season.schedule = [];

            var dateGroup = null;
            for (var i = 0; i < season.schedule.length; i++) {
                var s = season.schedule[i];
                if (s.date.year === dateEntry.year && s.date.month === dateEntry.month && s.date.date === dateEntry.date) {
                    dateGroup = s;
                    break;
                }
            }
            if (!dateGroup) {
                dateGroup = { date: dateEntry, games: [] };
                season.schedule.push(dateGroup);
            }

            var existingIdx = -1;
            for (var j = 0; j < dateGroup.games.length; j++) {
                if (dateGroup.games[j].id === scheduleGame.id) {
                    existingIdx = j;
                    break;
                }
            }
            if (existingIdx >= 0) {
                dateGroup.games[existingIdx] = scheduleGame;
            } else {
                dateGroup.games.push(scheduleGame);
            }

            dateGroup.games.sort(function (a, b) {
                return parseTime(a.time) - parseTime(b.time);
            });

            season.schedule.sort(function (a, b) {
                var da = new Date(a.date.year, a.date.month - 1, a.date.date);
                var db = new Date(b.date.year, b.date.month - 1, b.date.date);
                return da - db;
            });

            await seasonsContainer.items.upsert(season);

            return res.status(200).json({ success: true, id: boxScore.id });
        } catch (err) {
            console.error("LOMBA save game error:", err.message);
            return res.status(500).json({ error: "Failed to save game" });
        }
    }

    // POST /api/lomba?action=save-playoff-game
    if (req.method === "POST" && action === "save-playoff-game") {
        var seasonId = req.body.seasonId;
        var round = req.body.round;
        var seriesIndex = req.body.seriesIndex;
        var gameIndex = req.body.gameIndex;
        var gameData = req.body.gameData;
        var boxScore = req.body.boxScore;

        if (!seasonId || !round || seriesIndex == null || gameIndex == null || !gameData) {
            return res.status(400).json({ error: "Missing required playoff game parameters" });
        }

        try {
            // Save box score if provided
            if (boxScore) {
                await boxScoresContainer.items.upsert(boxScore);
            }

            // Read season doc
            var { resource: season } = await seasonsContainer.item(seasonId, seasonId).read();
            if (!season) return res.status(404).json({ error: "Season not found" });
            if (!season.playoffs) return res.status(400).json({ error: "Season has no playoffs" });

            // Get the series
            var series;
            if (round === 'championship') {
                series = season.playoffs.championship;
            } else {
                if (!season.playoffs[round] || !season.playoffs[round][seriesIndex]) {
                    return res.status(400).json({ error: "Series not found" });
                }
                series = season.playoffs[round][seriesIndex];
            }

            // Update the game
            var gameEntry = series.games[gameIndex];
            if (!gameEntry) return res.status(400).json({ error: "Game slot not found" });

            gameEntry.homeScore = gameData.homeScore;
            gameEntry.awayScore = gameData.awayScore;
            gameEntry.winner = gameData.winner;
            gameEntry.forfeit = gameData.forfeit || false;
            gameEntry.completion = true;
            if (boxScore) gameEntry.id = boxScore.id;

            // Update series wins
            if (gameData.winner === 'home') {
                // home is seed1 in games 1 & 3, seed2 in game 2
                if (gameEntry.home === series.name1) {
                    series.seed1Wins++;
                } else {
                    series.seed2Wins++;
                }
            } else if (gameData.winner === 'away') {
                if (gameEntry.away === series.name1) {
                    series.seed1Wins++;
                } else {
                    series.seed2Wins++;
                }
            }

            // If series is over (someone hit 2 wins), null out remaining games
            if (series.seed1Wins >= 2 || series.seed2Wins >= 2) {
                for (var g = 0; g < series.games.length; g++) {
                    if (series.games[g] && !series.games[g].completion) {
                        series.games[g] = null;
                    }
                }
            }

            // Check if all series in the current round are complete
            var allComplete = true;
            var winners = [];

            if (round === 'quarterFinals') {
                for (var q = 0; q < season.playoffs.quarterFinals.length; q++) {
                    var qf = season.playoffs.quarterFinals[q];
                    if (qf.seed1Wins >= 2) {
                        winners.push({ seed: qf.seed1, name: qf.name1 });
                    } else if (qf.seed2Wins >= 2) {
                        winners.push({ seed: qf.seed2, name: qf.name2 });
                    } else {
                        allComplete = false;
                    }
                }

                // If all QFs done, reseed and populate semis
                if (allComplete && winners.length === 4) {
                    winners.sort(function (a, b) { return a.seed - b.seed; });
                    // Highest vs lowest, 2nd vs 3rd
                    var sfMatchups = [
                        { seed1: winners[0].seed, name1: winners[0].name, seed2: winners[3].seed, name2: winners[3].name },
                        { seed1: winners[1].seed, name1: winners[1].name, seed2: winners[2].seed, name2: winners[2].name }
                    ];

                    for (var s = 0; s < 2; s++) {
                        var sf = season.playoffs.semiFinals[s];
                        sf.seed1 = sfMatchups[s].seed1;
                        sf.name1 = sfMatchups[s].name1;
                        sf.seed2 = sfMatchups[s].seed2;
                        sf.name2 = sfMatchups[s].name2;
                        sf.seed1Wins = 0;
                        sf.seed2Wins = 0;

                        var higher = sfMatchups[s].name1;
                        var lower = sfMatchups[s].name2;
                        var sfSeasonSuffix = seasonId.replace('LOMBA - ', '');

                        sf.games = [
                            { id: "Playoff SF Game 1 - " + lower + " vs " + higher + " - " + sfSeasonSuffix, home: higher, away: lower, homeScore: null, awayScore: null, winner: "", forfeit: false, date: null, time: null, completion: false },
                            { id: "Playoff SF Game 2 - " + higher + " vs " + lower + " - " + sfSeasonSuffix, home: lower, away: higher, homeScore: null, awayScore: null, winner: "", forfeit: false, date: null, time: null, completion: false },
                            { id: "Playoff SF Game 3 - " + lower + " vs " + higher + " - " + sfSeasonSuffix, home: higher, away: lower, homeScore: null, awayScore: null, winner: "", forfeit: false, date: null, time: null, completion: false }
                        ];
                    }
                }
            } else if (round === 'semiFinals') {
                // Push winners into championship as they become available
                var champ = season.playoffs.championship;
                var champSuffix = seasonId.replace('LOMBA - ', '');

                for (var sf2 = 0; sf2 < season.playoffs.semiFinals.length; sf2++) {
                    var sfSeries = season.playoffs.semiFinals[sf2];
                    var sfWinner = null;

                    if (sfSeries.seed1Wins >= 2) {
                        sfWinner = { seed: sfSeries.seed1, name: sfSeries.name1 };
                    } else if (sfSeries.seed2Wins >= 2) {
                        sfWinner = { seed: sfSeries.seed2, name: sfSeries.name2 };
                    }

                    if (sfWinner) {
                        // Place winner in championship — higher seed goes to seed1
                        if (champ.seed1 === null) {
                            champ.seed1 = sfWinner.seed;
                            champ.name1 = sfWinner.name;
                        } else if (champ.seed2 === null && champ.name1 !== sfWinner.name) {
                            // Second winner — make sure higher seed is seed1
                            if (sfWinner.seed < champ.seed1) {
                                champ.seed2 = champ.seed1;
                                champ.name2 = champ.name1;
                                champ.seed1 = sfWinner.seed;
                                champ.name1 = sfWinner.name;
                            } else {
                                champ.seed2 = sfWinner.seed;
                                champ.name2 = sfWinner.name;
                            }

                            // Both finalists known — generate game slots
                            var champHigher = champ.name1;
                            var champLower = champ.name2;
                            champ.seed1Wins = 0;
                            champ.seed2Wins = 0;
                            champ.games = [
                                { id: "Playoff Final Game 1 - " + champLower + " vs " + champHigher + " - " + champSuffix, home: champHigher, away: champLower, homeScore: null, awayScore: null, winner: "", forfeit: false, date: null, time: null, completion: false },
                                { id: "Playoff Final Game 2 - " + champHigher + " vs " + champLower + " - " + champSuffix, home: champLower, away: champHigher, homeScore: null, awayScore: null, winner: "", forfeit: false, date: null, time: null, completion: false },
                                { id: "Playoff Final Game 3 - " + champLower + " vs " + champHigher + " - " + champSuffix, home: champHigher, away: champLower, homeScore: null, awayScore: null, winner: "", forfeit: false, date: null, time: null, completion: false }
                            ];
                        }
                    }
                }
            }

            // Save updated season doc
            await seasonsContainer.items.upsert(season);

            return res.status(200).json({ success: true, season: season.playoffs });

        } catch (err) {
            console.error("LOMBA save playoff game error:", err.message);
            return res.status(500).json({ error: "Failed to save playoff game" });
        }
    }

    return res.status(400).json({ error: "Invalid action" });
};
