var { CosmosClient } = require("@azure/cosmos");
var { recomputeSeasonStats } = require("./_lib/seasonStats");

var client = new CosmosClient({
    endpoint: process.env.COSMOS_ENDPOINT,
    key: process.env.COSMOS_KEY
});

var database = client.database("DRMBL Database");
var leaguesContainer = database.container("Leagues");
var seasonsContainer = database.container("Seasons");
var boxScoresContainer = database.container("Box Scores");
var seasonStatsContainer = database.container("Season Stats");

// LOMBA-specific ID helpers (mirrors api/_lib/boxScoreId.js's DRMBL pattern but with
// LOMBA naming + M/D/YYYY date format).
function asciiSlug(s) {
    return s.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[''`"]/g, '').trim();
}
function teamSlug(name) { return asciiSlug(name).replace(/\s+/g, '_'); }
function lombaSeasonSlug(seasonId) {
    return seasonId.replace(/^LOMBA - /, '').replace(/[''`]/g, '').replace(/ - /g, '_').replace(/\s+/g, '_');
}
function mdyToISO(mdy, fallbackTs) {
    if (!mdy && fallbackTs) {
        var d = new Date(fallbackTs);
        if (!isNaN(d.getTime())) {
            var local = new Date(d.getTime() - 6 * 60 * 60 * 1000);
            return local.getUTCFullYear() + '-' + String(local.getUTCMonth() + 1).padStart(2, '0') + '-' + String(local.getUTCDate()).padStart(2, '0');
        }
    }
    if (!mdy) return null;
    var parts = mdy.split('/');
    if (parts.length !== 3) return null;
    var m = parseInt(parts[0], 10), d = parseInt(parts[1], 10);
    var y = parts[2]; if (y.length === 2) y = '20' + y;
    return y + '-' + String(m).padStart(2, '0') + '-' + String(d).padStart(2, '0');
}
function makeLombaBoxScoreID(seasonId, homeName, awayName, gameDate, suffix) {
    var base = ['LOMBA', lombaSeasonSlug(seasonId), teamSlug(homeName) + '_vs_' + teamSlug(awayName), gameDate].join('.');
    return suffix ? base + '.' + suffix : base;
}

// Add the new structured fields to a LOMBA box score before save.
function applyStructuredFields(boxScore, seasonId, homeTeamID, awayTeamID, gameDate) {
    boxScore.leagueID = 'LOMBA';
    boxScore.seasonID = seasonId;
    if (homeTeamID) boxScore.homeTeamID = homeTeamID;
    if (awayTeamID) boxScore.awayTeamID = awayTeamID;
    boxScore.gameDate = gameDate;
    boxScore.gameTimestamp = (boxScore.gameInfo && boxScore.gameInfo.general && boxScore.gameInfo.general.timestamp) || new Date().toISOString();
}

// Look up the full LOMBA team ID by team name within a season's roster.
async function resolveTeamID(teamName, seasonId) {
    if (!teamName) return null;
    try {
        var { resources: teams } = await client.database("DRMBL Database").container("Teams").items
            .query({
                query: "SELECT c.id, c.name FROM c WHERE STARTSWITH(c.id, 'LOMBA.') AND c.name = @n AND ARRAY_CONTAINS(c.seasons, { id: @s }, true)",
                parameters: [{ name: '@n', value: teamName }, { name: '@s', value: seasonId }]
            }).fetchAll();
        return teams[0] ? teams[0].id : null;
    } catch (e) { return null; }
}

// Fire-and-await Season Stats recompute. Doesn't fail the whole save on error.
async function recomputeStatsForSeason(seasonDoc) {
    try {
        var { resources: bsList } = await boxScoresContainer.items
            .query({ query: "SELECT * FROM c WHERE c.seasonID = @s", parameters: [{ name: '@s', value: seasonDoc.id }] })
            .fetchAll();
        var stats = recomputeSeasonStats(seasonDoc, bsList);
        await seasonStatsContainer.items.upsert(stats);
    } catch (e) {
        console.error('Season Stats recompute failed for ' + seasonDoc.id + ':', e.message);
    }
}

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
            // Rewrite ID to new format + add structured fields BEFORE save (mirrors DRMBL pattern)
            var dateStr = boxScore.gameInfo && boxScore.gameInfo.general && boxScore.gameInfo.general.date;
            var ts = boxScore.gameInfo && boxScore.gameInfo.general && boxScore.gameInfo.general.timestamp;
            var gameDate = mdyToISO(dateStr, ts);
            var homeName = boxScore.team && boxScore.team.home;
            var awayName = boxScore.team && boxScore.team.away;
            var homeTeamID = await resolveTeamID(homeName, seasonId);
            var awayTeamID = await resolveTeamID(awayName, seasonId);

            if (gameDate && homeName && awayName) {
                var baseID = makeLombaBoxScoreID(seasonId, homeName, awayName, gameDate);
                // Collision retry: if base ID exists, append .g2/.g3
                var attempt = 1, candidateID = baseID;
                while (attempt < 10) {
                    try {
                        await boxScoresContainer.item(candidateID, candidateID).read();
                        attempt++;
                        candidateID = baseID + '.g' + (attempt + 1);
                    } catch (e) {
                        if (e.code === 404) break; // ID free
                        throw e;
                    }
                }
                boxScore.id = candidateID;
            }
            applyStructuredFields(boxScore, seasonId, homeTeamID, awayTeamID, gameDate);

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

            // Consume any unplayed placeholder for the same matchup (any date group).
            // Lets pre-seeded matchup placeholders be "promoted" by the first real save
            // without leaving the placeholder behind as an orphan.
            for (var pdgi = season.schedule.length - 1; pdgi >= 0; pdgi--) {
                var pdg = season.schedule[pdgi];
                var pgames = pdg.games || [];
                for (var pgi = pgames.length - 1; pgi >= 0; pgi--) {
                    var pgame = pgames[pgi];
                    var isUnplayed = (!pgame.winner || pgame.winner === "") && pgame.completion !== true;
                    var sameTeams = pgame.home === scheduleGame.home && pgame.away === scheduleGame.away;
                    var differentId = pgame.id !== scheduleGame.id;
                    if (isUnplayed && sameTeams && differentId) {
                        pgames.splice(pgi, 1);
                    }
                }
                if (pgames.length === 0) season.schedule.splice(pdgi, 1);
            }

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

            // Fire-and-await Season Stats recompute (mirrors DRMBL end-game pattern)
            await recomputeStatsForSeason(season);

            return res.status(200).json({ success: true, id: boxScore.id });
        } catch (err) {
            console.error("LOMBA save game error:", err.message);
            return res.status(500).json({ error: "Failed to save game" });
        }
    }

    // POST /api/lomba?action=schedule-games
    if (req.method === "POST" && action === "schedule-games") {
        var assignments = req.body.assignments;
        if (!assignments || !Array.isArray(assignments) || assignments.length === 0) {
            return res.status(400).json({ error: "Missing assignments" });
        }

        try {
            // Group assignments by seasonId
            var bySeasonId = {};
            for (var a = 0; a < assignments.length; a++) {
                var asgn = assignments[a];
                if (!bySeasonId[asgn.seasonId]) bySeasonId[asgn.seasonId] = [];
                bySeasonId[asgn.seasonId].push(asgn);
            }

            for (var sid in bySeasonId) {
                var { resource: season } = await seasonsContainer.item(sid, sid).read();
                if (!season) continue;

                var sAssignments = bySeasonId[sid];
                for (var ai = 0; ai < sAssignments.length; ai++) {
                    var assign = sAssignments[ai];

                    if (assign.type === 'playoff') {
                        // Find the playoff game
                        var series;
                        if (assign.round === 'championship') {
                            series = season.playoffs.championship;
                        } else {
                            series = season.playoffs[assign.round][assign.seriesIndex];
                        }
                        if (series && series.games[assign.gameIndex]) {
                            series.games[assign.gameIndex].date = assign.date;
                            series.games[assign.gameIndex].time = assign.time;
                            series.games[assign.gameIndex].court = assign.court;
                        }
                    } else {
                        // Regular season: find game by ID
                        var found = false;
                        for (var si = 0; si < (season.schedule || []).length; si++) {
                            var games = season.schedule[si].games || [];
                            for (var gi = 0; gi < games.length; gi++) {
                                if (games[gi].id === assign.gameId) {
                                    games[gi].date = assign.date;
                                    games[gi].time = assign.time;
                                    games[gi].court = assign.court;
                                    found = true;
                                    break;
                                }
                            }
                            if (found) break;
                        }
                    }
                }

                await seasonsContainer.items.upsert(season);
            }

            return res.status(200).json({ success: true, count: assignments.length });
        } catch (err) {
            console.error("LOMBA schedule games error:", err.message);
            return res.status(500).json({ error: "Failed to schedule games" });
        }
    }

    // POST /api/lomba?action=edit-game
    if (req.method === "POST" && action === "edit-game") {
        var gameId = req.body.gameId;
        var seasonId = req.body.seasonId;
        var gameData = req.body.gameData;
        var boxScore = req.body.boxScore;

        if (!gameId || !seasonId || !gameData) {
            return res.status(400).json({ error: "Missing required parameters" });
        }

        try {
            // Refresh structured fields on the box score before save (idempotent — the
            // ID stays the same since we're editing an existing game).
            if (boxScore) {
                var dStr = boxScore.gameInfo && boxScore.gameInfo.general && boxScore.gameInfo.general.date;
                var ts = boxScore.gameInfo && boxScore.gameInfo.general && boxScore.gameInfo.general.timestamp;
                var gameDate = mdyToISO(dStr, ts);
                var homeName = boxScore.team && boxScore.team.home;
                var awayName = boxScore.team && boxScore.team.away;
                var homeTeamID = await resolveTeamID(homeName, seasonId);
                var awayTeamID = await resolveTeamID(awayName, seasonId);
                applyStructuredFields(boxScore, seasonId, homeTeamID, awayTeamID, gameDate);
                await boxScoresContainer.items.upsert(boxScore);
            }

            // Read season doc and find the game by ID across all date groups
            var { resource: season } = await seasonsContainer.item(seasonId, seasonId).read();
            if (!season) return res.status(404).json({ error: "Season not found" });

            var found = false;
            for (var i = 0; i < (season.schedule || []).length; i++) {
                var games = season.schedule[i].games || [];
                for (var j = 0; j < games.length; j++) {
                    if (games[j].id === gameId) {
                        games[j].homeScore = gameData.homeScore;
                        games[j].awayScore = gameData.awayScore;
                        games[j].winner = gameData.winner;
                        games[j].forfeit = gameData.forfeit || false;
                        found = true;
                        break;
                    }
                }
                if (found) break;
            }

            if (!found) {
                return res.status(404).json({ error: "Game not found in schedule" });
            }

            await seasonsContainer.items.upsert(season);

            // Stat aggregates may have shifted (score change, forfeit toggle) — recompute
            await recomputeStatsForSeason(season);

            return res.status(200).json({ success: true, id: gameId });

        } catch (err) {
            console.error("LOMBA edit game error:", err.message);
            return res.status(500).json({ error: "Failed to edit game" });
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
            // Apply new ID format + structured fields to the box score before save
            if (boxScore) {
                var dStrPo = boxScore.gameInfo && boxScore.gameInfo.general && boxScore.gameInfo.general.date;
                var tsPo = boxScore.gameInfo && boxScore.gameInfo.general && boxScore.gameInfo.general.timestamp;
                var gameDatePo = mdyToISO(dStrPo, tsPo);
                var homeNamePo = boxScore.team && boxScore.team.home;
                var awayNamePo = boxScore.team && boxScore.team.away;
                var homeTeamIDPo = await resolveTeamID(homeNamePo, seasonId);
                var awayTeamIDPo = await resolveTeamID(awayNamePo, seasonId);

                if (gameDatePo && homeNamePo && awayNamePo) {
                    var basePo = makeLombaBoxScoreID(seasonId, homeNamePo, awayNamePo, gameDatePo);
                    var attemptPo = 1, candidatePo = basePo;
                    while (attemptPo < 10) {
                        try {
                            await boxScoresContainer.item(candidatePo, candidatePo).read();
                            attemptPo++;
                            candidatePo = basePo + '.g' + (attemptPo + 1);
                        } catch (e) {
                            if (e.code === 404) break;
                            throw e;
                        }
                    }
                    boxScore.id = candidatePo;
                }
                applyStructuredFields(boxScore, seasonId, homeTeamIDPo, awayTeamIDPo, gameDatePo);
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

            // Recalculate series wins from all completed games
            series.seed1Wins = 0;
            series.seed2Wins = 0;
            for (var w = 0; w < series.games.length; w++) {
                var gm = series.games[w];
                if (!gm || !gm.completion) continue;
                var gmWinnerName = gm.winner === 'home' ? gm.home : gm.away;
                if (gmWinnerName === series.name1) {
                    series.seed1Wins++;
                } else if (gmWinnerName === series.name2) {
                    series.seed2Wins++;
                }
            }

            // Reconcile game slots to current series state. If a side has 2 wins,
            // unplayed games are "no necesario" (null). Otherwise restore any
            // previously-nulled slots — an earlier sweep may have nulled them and
            // a later edit can drop the count back below 2.
            if (series.seed1Wins >= 2 || series.seed2Wins >= 2) {
                for (var g = 0; g < series.games.length; g++) {
                    if (series.games[g] && !series.games[g].completion) {
                        series.games[g] = null;
                    }
                }
            } else {
                for (var gr = 0; gr < series.games.length; gr++) {
                    if (series.games[gr] === null) {
                        var lowerSeedHome = (gr === 1);
                        series.games[gr] = {
                            id: "",
                            home: lowerSeedHome ? series.name2 : series.name1,
                            away: lowerSeedHome ? series.name1 : series.name2,
                            homeScore: null,
                            awayScore: null,
                            winner: "",
                            forfeit: false,
                            date: null,
                            time: null,
                            completion: false,
                        };
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
                // Reconcile championship to current SF winners. Rebuild matchup +
                // games when both SFs are decided and the result has changed (e.g.
                // an SF edit flipped a winner). Refuse to clobber once any
                // championship game has been played.
                var champ = season.playoffs.championship;
                var champSuffix = seasonId.replace('LOMBA - ', '');

                var sfWinners = [];
                for (var sf2 = 0; sf2 < season.playoffs.semiFinals.length; sf2++) {
                    var sfS = season.playoffs.semiFinals[sf2];
                    if (sfS.seed1Wins >= 2) sfWinners.push({ seed: sfS.seed1, name: sfS.name1 });
                    else if (sfS.seed2Wins >= 2) sfWinners.push({ seed: sfS.seed2, name: sfS.name2 });
                }

                var champHasPlay = (champ.games || []).some(function (gm) { return gm && gm.completion; });

                if (sfWinners.length === 2 && !champHasPlay) {
                    sfWinners.sort(function (a, b) { return a.seed - b.seed; });
                    var newHigher = sfWinners[0];
                    var newLower = sfWinners[1];
                    var matchupChanged = champ.name1 !== newHigher.name || champ.name2 !== newLower.name;

                    if (matchupChanged) {
                        champ.seed1 = newHigher.seed;
                        champ.name1 = newHigher.name;
                        champ.seed2 = newLower.seed;
                        champ.name2 = newLower.name;
                        champ.seed1Wins = 0;
                        champ.seed2Wins = 0;
                        champ.games = [
                            { id: "Playoff Final Game 1 - " + newLower.name + " vs " + newHigher.name + " - " + champSuffix, home: newHigher.name, away: newLower.name, homeScore: null, awayScore: null, winner: "", forfeit: false, date: null, time: null, completion: false },
                            { id: "Playoff Final Game 2 - " + newHigher.name + " vs " + newLower.name + " - " + champSuffix, home: newLower.name, away: newHigher.name, homeScore: null, awayScore: null, winner: "", forfeit: false, date: null, time: null, completion: false },
                            { id: "Playoff Final Game 3 - " + newLower.name + " vs " + newHigher.name + " - " + champSuffix, home: newHigher.name, away: newLower.name, homeScore: null, awayScore: null, winner: "", forfeit: false, date: null, time: null, completion: false }
                        ];
                    }
                } else if (sfWinners.length === 1 && !champHasPlay && champ.seed1 === null) {
                    champ.seed1 = sfWinners[0].seed;
                    champ.name1 = sfWinners[0].name;
                }
            }

            // Save updated season doc
            await seasonsContainer.items.upsert(season);

            // Recompute Season Stats so leaderboards reflect the playoff result
            await recomputeStatsForSeason(season);

            return res.status(200).json({ success: true, season: season.playoffs });

        } catch (err) {
            console.error("LOMBA save playoff game error:", err.message);
            return res.status(500).json({ error: "Failed to save playoff game" });
        }
    }

    return res.status(400).json({ error: "Invalid action" });
};
