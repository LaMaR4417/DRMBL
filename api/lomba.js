var { CosmosClient } = require("@azure/cosmos");
var { recomputeSeasonStats } = require("./_lib/seasonStats");

var client = new CosmosClient({
    endpoint: process.env.COSMOS_ENDPOINT,
    key: process.env.COSMOS_KEY
});

var database = client.database("DRMBL Database");
var leaguesContainer = database.container("Leagues");
var seasonsContainer = database.container("Seasons");
var teamsContainer = database.container("Teams");
var playersContainer = database.container("Players");
var boxScoresContainer = database.container("Box Scores");
var seasonStatsContainer = database.container("Season Stats");

var L3X3_SEASON_ID = "L3X3 - Varonil Libre - 2026";

function l3x3SeasonSlug(seasonId) {
    return seasonId.replace(/^L3X3 - /, "").replace(/[''`]/g, "").replace(/ - /g, "_").replace(/\s+/g, "_");
}
function l3x3MakeBoxScoreID(seasonId, homeName, awayName, gameDate) {
    return ["L3X3", l3x3SeasonSlug(seasonId), teamSlug(homeName) + "_vs_" + teamSlug(awayName), gameDate].join(".");
}
async function l3x3PersistJerseyNumbers(seasonId, boxScore) {
    var sides = ["home", "away"];
    for (var s = 0; s < sides.length; s++) {
        var side = sides[s];
        var teamSide = boxScore.teamInfo && boxScore.teamInfo[side];
        if (!teamSide) continue;
        var teamID = side === "home" ? boxScore.homeTeamID : boxScore.awayTeamID;
        var teamName = teamSide.name;
        var players = teamSide.players || [];
        for (var p = 0; p < players.length; p++) {
            var pl = players[p];
            if (!pl.playerID || !pl.number) continue;
            var num = parseInt(pl.number, 10);
            if (isNaN(num)) continue;
            try {
                var { resource: playerDoc } = await playersContainer.item(pl.playerID, pl.playerID).read();
                if (!playerDoc) continue;
                var teamRef = (playerDoc.teams || []).find(function (t) { return t.teamID === teamID && t.seasonID === seasonId; });
                if (!teamRef) {
                    if (!playerDoc.teams) playerDoc.teams = [];
                    playerDoc.teams.push({ name: teamName, teamID: teamID, seasonID: seasonId, leagueID: "L3X3", jerseyNumbers: [num] });
                } else {
                    if (!Array.isArray(teamRef.jerseyNumbers)) teamRef.jerseyNumbers = [];
                    if (teamRef.jerseyNumbers.indexOf(num) === -1) teamRef.jerseyNumbers.push(num);
                }
                await playersContainer.items.upsert(playerDoc);
            } catch (e) { /* skip on miss */ }
        }
    }
}

// Wave advancement: when all games in a wave (same round + same time) are
// complete, pair their teams within record buckets (high seed vs low seed)
// and append new schedule entries one timeslot later.
function l3x3AddMinutes(timeStr, mins) {
    var parts = timeStr.split(":");
    var total = parseInt(parts[0], 10) * 60 + parseInt(parts[1], 10) + mins;
    var h = Math.floor(total / 60);
    var m = total % 60;
    return String(h).padStart(2, "0") + ":" + String(m).padStart(2, "0");
}
function l3x3DateGroupISO(dg) {
    return dg.date.year + "-" + String(dg.date.month).padStart(2, "0") + "-" + String(dg.date.date).padStart(2, "0");
}
function l3x3AdvanceWave(season, round, time, dateGroup) {
    var waveGames = (dateGroup.games || []).filter(function (g) { return g.round === round && g.time === time; });
    if (waveGames.length === 0) return null;
    if (!waveGames.every(function (g) { return g.completion; })) return null;

    // Collect teams from this wave
    var teams = [];
    waveGames.forEach(function (g) {
        teams.push({ teamID: g.homeTeamID, name: g.home, seed: g.homeSeed });
        teams.push({ teamID: g.awayTeamID, name: g.away, seed: g.awaySeed });
    });

    var records = (season.bracket && season.bracket.records) || {};
    var eliminated = (season.bracket && season.bracket.eliminated) || [];

    // Group by current record
    var buckets = {};
    teams.forEach(function (t) {
        if (eliminated.indexOf(t.teamID) !== -1) return;
        var rec = records[t.teamID] || { wins: 0, losses: 0 };
        var key = rec.wins + "-" + rec.losses;
        if (!buckets[key]) buckets[key] = [];
        buckets[key].push(t);
    });

    // Pair within each bucket by seed (high vs low)
    var pairings = [];
    Object.keys(buckets).forEach(function (key) {
        var bucket = buckets[key].slice().sort(function (a, b) { return a.seed - b.seed; });
        while (bucket.length >= 2) {
            var high = bucket.shift();
            var low = bucket.pop();
            pairings.push({ home: high, away: low, bucket: key });
        }
    });
    if (pairings.length === 0) return null;

    // Check if next-round games already exist for these teams (idempotency)
    var nextRound = round + 1;
    var existsAlready = (dateGroup.games || []).some(function (g) {
        if (g.round !== nextRound) return false;
        return pairings.some(function (p) {
            return (g.homeTeamID === p.home.teamID && g.awayTeamID === p.away.teamID) ||
                (g.homeTeamID === p.away.teamID && g.awayTeamID === p.home.teamID);
        });
    });
    if (existsAlready) return null;

    var nextTime = l3x3AddMinutes(time, 60);
    var dateISO = l3x3DateGroupISO(dateGroup);
    var courts = [1, 2, 3, 4];

    pairings.forEach(function (p, idx) {
        var court = courts[idx % 4];
        // If a TBD placeholder exists at (nextTime, court), overwrite in place;
        // otherwise append a new entry.
        var placeholder = (dateGroup.games || []).find(function (g) {
            return g.time === nextTime && g.court === court && g.isPlaceholder;
        });
        var newEntry = {
            id: l3x3MakeBoxScoreID(season.id, p.home.name, p.away.name, dateISO),
            home: p.home.name,
            away: p.away.name,
            homeTeamID: p.home.teamID,
            awayTeamID: p.away.teamID,
            homeSeed: p.home.seed,
            awaySeed: p.away.seed,
            round: nextRound,
            court: court,
            time: nextTime,
            wave: nextTime,
            bucket: p.bucket,
            completion: false,
            winner: "",
            loser: "",
            homeScore: null,
            awayScore: null,
            forfeit: false,
            boxScoreId: null,
        };
        if (placeholder) {
            // Overwrite the placeholder in place (preserves the slot's position)
            Object.keys(placeholder).forEach(function (k) { delete placeholder[k]; });
            Object.assign(placeholder, newEntry);
        } else {
            if (!dateGroup.games) dateGroup.games = [];
            dateGroup.games.push(newEntry);
        }
    });

    var stillOpen = (dateGroup.games || []).filter(function (g) { return g.round === round && !g.completion; });
    if (stillOpen.length === 0 && season.bracket) season.bracket.currentRound = nextRound;

    return { generated: newGames.length, nextRound: nextRound, nextTime: nextTime };
}

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

    // ─── L3X3 actions (folded in here to stay under the Vercel function cap) ───

    // GET /api/lomba?action=l3x3-season
    if (req.method === "GET" && action === "l3x3-season") {
        try {
            var { resource: l3season } = await seasonsContainer.item(L3X3_SEASON_ID, L3X3_SEASON_ID).read();
            if (!l3season) return res.status(404).json({ error: "Season not found" });
            return res.status(200).json(l3season);
        } catch (err) {
            console.error("L3X3 season fetch error:", err.message);
            return res.status(500).json({ error: "Failed to load season" });
        }
    }

    // GET /api/lomba?action=l3x3-team&id=...
    if (req.method === "GET" && action === "l3x3-team") {
        var l3teamID = req.query.id;
        if (!l3teamID) return res.status(400).json({ error: "Missing team id" });
        try {
            var { resource: l3team } = await teamsContainer.item(l3teamID, l3teamID).read();
            if (!l3team) return res.status(404).json({ error: "Team not found" });
            return res.status(200).json(l3team);
        } catch (err) {
            console.error("L3X3 team fetch error:", err.message);
            return res.status(500).json({ error: "Failed to load team" });
        }
    }

    // POST /api/lomba?action=l3x3-save-game
    if (req.method === "POST" && action === "l3x3-save-game") {
        var l3box = req.body && req.body.boxScore;
        if (!l3box) return res.status(400).json({ error: "Missing boxScore" });
        try {
            var { resource: l3season2 } = await seasonsContainer.item(L3X3_SEASON_ID, L3X3_SEASON_ID).read();
            if (!l3season2) return res.status(404).json({ error: "Season not found" });

            var l3homeName = l3box.team && l3box.team.home;
            var l3awayName = l3box.team && l3box.team.away;
            if (!l3homeName || !l3awayName) {
                return res.status(400).json({ error: "Box score missing team names" });
            }

            // Find an unplayed schedule entry matching home + away (consume placeholder)
            var matchedEntry = null;
            var matchedDg = null;
            if (l3season2.schedule) {
                for (var l3ds = 0; l3ds < l3season2.schedule.length; l3ds++) {
                    var l3dg = l3season2.schedule[l3ds];
                    for (var l3di = 0; l3di < (l3dg.games || []).length; l3di++) {
                        var l3sg = l3dg.games[l3di];
                        if (!l3sg.completion && l3sg.home === l3homeName && l3sg.away === l3awayName) {
                            matchedEntry = l3sg;
                            matchedDg = l3dg;
                            break;
                        }
                    }
                    if (matchedEntry) break;
                }
            }

            if (matchedEntry) {
                l3box.id = matchedEntry.id;
                l3box.gameDate = l3x3DateGroupISO(matchedDg);
            } else {
                // Ad-hoc fallback (off-bracket game)
                var l3dateStr = l3box.gameInfo && l3box.gameInfo.general && l3box.gameInfo.general.date;
                var l3ts = l3box.gameInfo && l3box.gameInfo.general && l3box.gameInfo.general.timestamp;
                var l3gameDate = l3box.gameDate || mdyToISO(l3dateStr, l3ts);
                if (!l3gameDate) return res.status(400).json({ error: "Box score missing date" });
                var l3base = l3x3MakeBoxScoreID(L3X3_SEASON_ID, l3homeName, l3awayName, l3gameDate);
                var l3attempt = 1, l3candidate = l3base;
                while (l3attempt < 20) {
                    try {
                        await boxScoresContainer.item(l3candidate, l3candidate).read();
                        l3attempt++;
                        l3candidate = l3base + ".g" + (l3attempt + 1);
                    } catch (e) {
                        if (e.code === 404) break;
                        throw e;
                    }
                }
                l3box.id = l3candidate;
                l3box.gameDate = l3gameDate;
            }

            l3box.seasonID = L3X3_SEASON_ID;
            l3box.leagueID = "L3X3";
            l3box.season = L3X3_SEASON_ID;
            l3box.type = "3x3";
            if (!l3box.recorder) l3box.recorder = "l3x3-live-tap-simple";

            await boxScoresContainer.items.upsert(l3box);
            await l3x3PersistJerseyNumbers(L3X3_SEASON_ID, l3box);

            // If this game was a scheduled bracket entry, update bracket state
            if (matchedEntry) {
                var winnerSide = (l3box.gameInfo && l3box.gameInfo.state && l3box.gameInfo.state.winner) || "";
                var homeScore = (l3box.teamInfo && l3box.teamInfo.home && l3box.teamInfo.home.score && l3box.teamInfo.home.score.current) || 0;
                var awayScore = (l3box.teamInfo && l3box.teamInfo.away && l3box.teamInfo.away.score && l3box.teamInfo.away.score.current) || 0;
                var forfeit = !!(l3box.gameInfo && l3box.gameInfo.state && l3box.gameInfo.state.forfeit);

                matchedEntry.completion = true;
                matchedEntry.winner = winnerSide;
                matchedEntry.loser = winnerSide === "home" ? "away" : (winnerSide === "away" ? "home" : "");
                matchedEntry.homeScore = homeScore;
                matchedEntry.awayScore = awayScore;
                matchedEntry.forfeit = forfeit;
                matchedEntry.boxScoreId = l3box.id;

                if (!l3season2.bracket) l3season2.bracket = { format: "swiss-double-elim-2loss", totalTeams: 16, currentRound: 1, records: {}, eliminated: [] };
                if (!l3season2.bracket.records) l3season2.bracket.records = {};
                if (!l3season2.bracket.eliminated) l3season2.bracket.eliminated = [];

                if (winnerSide === "home" || winnerSide === "away") {
                    var winnerTeamID = winnerSide === "home" ? matchedEntry.homeTeamID : matchedEntry.awayTeamID;
                    var loserTeamID = winnerSide === "home" ? matchedEntry.awayTeamID : matchedEntry.homeTeamID;
                    if (!l3season2.bracket.records[winnerTeamID]) l3season2.bracket.records[winnerTeamID] = { wins: 0, losses: 0 };
                    if (!l3season2.bracket.records[loserTeamID]) l3season2.bracket.records[loserTeamID] = { wins: 0, losses: 0 };
                    l3season2.bracket.records[winnerTeamID].wins++;
                    l3season2.bracket.records[loserTeamID].losses++;
                    if (l3season2.bracket.records[loserTeamID].losses >= 2 && l3season2.bracket.eliminated.indexOf(loserTeamID) === -1) {
                        l3season2.bracket.eliminated.push(loserTeamID);
                    }
                }

                l3x3AdvanceWave(l3season2, matchedEntry.round, matchedEntry.time, matchedDg);
            }

            await seasonsContainer.item(L3X3_SEASON_ID, L3X3_SEASON_ID).replace(l3season2);

            return res.status(200).json({ success: true, id: l3box.id });
        } catch (err) {
            console.error("L3X3 save-game error:", err.message);
            return res.status(500).json({ error: "Failed to save game" });
        }
    }

    return res.status(400).json({ error: "Invalid action" });
};
