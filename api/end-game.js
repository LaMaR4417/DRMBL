var { CosmosClient } = require("@azure/cosmos");
var { recomputeStandings } = require("./_lib/recomputeStandings");
var { makeBoxScoreID, buildStructuredFields } = require("./_lib/boxScoreId");
var { recomputeSeasonStats } = require("./_lib/seasonStats");

var client = new CosmosClient({
    endpoint: process.env.COSMOS_ENDPOINT,
    key: process.env.COSMOS_KEY
});

var database = client.database("DRMBL Database");
var seasonsContainer = database.container("Seasons");
var teamsContainer = database.container("Teams");

var BOX_SCORES_CONTAINER_ID = "Box Scores";
var LIVE_GAMES_CONTAINER_ID = "Live Games";
var SEASON_STATS_CONTAINER_ID = "Season Stats";

async function getBoxScoresContainer() {
    var { container } = await database.containers.createIfNotExists({
        id: BOX_SCORES_CONTAINER_ID,
        partitionKey: { paths: ["/id"] }
    });
    return container;
}

async function getSeasonStatsContainer() {
    var { container } = await database.containers.createIfNotExists({
        id: SEASON_STATS_CONTAINER_ID,
        partitionKey: { paths: ["/id"] }
    });
    return container;
}

// ── Helpers ──────────────────────────────────────────────────

function cleanBoxScore(bs) {
    var cleaned = JSON.parse(JSON.stringify(bs));
    for (var side of ["home", "away"]) {
        delete cleaned.teamInfo[side]._minutesPerPeriod;
        delete cleaned.teamInfo[side]._minutesPerOT;
        for (var i = 0; i < cleaned.teamInfo[side].roster.inGame.length; i++) {
            var p = cleaned.teamInfo[side].roster.inGame[i];
            delete p._clockTimeAtEntry;
            delete p.onCourt;
            delete p.captain;
        }
    }
    return cleaned;
}

// (Removed: val, buildEmptyTotals, pct, addToTotals, computeAverages,
//  buildNewPlayerDoc, updateExistingPlayer — all only used by the old
//  upsertPlayer / updateTeamRecord paths that wrote to dead-code schemas
//  and silently failed. Replaced architecturally by Season Stats container
//  + recomputeSeasonStats helper, which produces the same per-player + per-team
//  aggregates from box scores in one canonical place.)

// ── Main handler ─────────────────────────────────────────────

module.exports = async function (req, res) {
    if (req.method !== "POST") {
        return res.status(405).json({ error: "Method not allowed" });
    }

    var body = req.body;
    if (!body || !body.boxScore || !body.homeTeamID || !body.awayTeamID) {
        return res.status(400).json({ error: "Missing required fields." });
    }

    var boxScore = body.boxScore;
    var homeTeamID = body.homeTeamID;
    var awayTeamID = body.awayTeamID;
    var homeSlot = body.homeSlot || null;
    var awaySlot = body.awaySlot || null;
    var scheduleGameId = body.scheduleGameId || null;
    // customGame=true means the user started a one-off matchup that wasn't picked
    // from the schedule. Skip the season schedule + standings update so we don't
    // accidentally close out a real upcoming game by team-slot collision.
    // Detect from request body OR from the box score itself (id prefix / explicit
    // flag set by buildBoxScore).
    var customGame = !!body.customGame
        || !!(body.boxScore && body.boxScore.customGame)
        || !!(body.boxScore && typeof body.boxScore.id === 'string' && body.boxScore.id.indexOf('.Custom.') !== -1);
    var seasonId = body.seasonId;
    if (!seasonId) {
        return res.status(400).json({ error: "Missing required field: seasonId" });
    }
    var errors = [];

    var homeScore = boxScore.teamInfo.home.score.current;
    var awayScore = boxScore.teamInfo.away.score.current;
    var winnerSide = boxScore.gameInfo.state.winner;
    var loserSide = boxScore.gameInfo.state.loser;

    // ── A. Save box score (CRITICAL) ──
    var cleanedBS = cleanBoxScore(boxScore);
    // Add season and team references (legacy display fields, kept for backward compat)
    cleanedBS.season = seasonId;
    cleanedBS.team = {
        home: boxScore.teamInfo.home.name,
        away: boxScore.teamInfo.away.name
    };

    // Mark DNP on inGame slots that ended with 0 minutes played. The game is
    // FINAL at save time, so 0 minutes = the player suited up but didn't play.
    // recomputeSeasonStats skips dnp slots from player stat aggregation.
    for (var dnpSide of ['home', 'away']) {
        var dnpRoster = cleanedBS.teamInfo[dnpSide].roster.inGame || [];
        for (var dnpI = 0; dnpI < dnpRoster.length; dnpI++) {
            var dnpSlot = dnpRoster[dnpI];
            if (!dnpSlot.playerID) continue;
            var dnpMins = dnpSlot.stats && dnpSlot.stats.general && dnpSlot.stats.general.minutesPlayed;
            if (!dnpMins || dnpMins === 0) {
                dnpSlot.dnp = true;
            }
        }
    }

    // Add structured top-level fields for indexing/queries (queryable by Cosmos)
    var structured = buildStructuredFields(cleanedBS, {
        seasonID: seasonId,
        homeTeamID: homeTeamID,
        awayTeamID: awayTeamID
    });
    Object.assign(cleanedBS, structured);

    // Rewrite the ID using the new convention: [league].[season].[home_vs_away].[date]
    // Custom games keep their existing ID convention (they use ".Custom." marker).
    if (!customGame) {
        cleanedBS.id = makeBoxScoreID({
            leagueAbbr: structured.leagueID,
            seasonID: structured.seasonID,
            homeTeamID: structured.homeTeamID,
            awayTeamID: structured.awayTeamID,
            homeName: cleanedBS.teamInfo.home.name,
            awayName: cleanedBS.teamInfo.away.name,
            gameDate: structured.gameDate
        });
    }

    try {
        var boxScoresContainer = await getBoxScoresContainer();
        // On collision (same matchup played twice same date), retry with .g2/.g3...
        var attempt = 0;
        var baseId = cleanedBS.id;
        while (true) {
            try {
                await boxScoresContainer.items.create(cleanedBS);
                break;
            } catch (createErr) {
                if (createErr && createErr.code === 409 && !customGame) {
                    attempt++;
                    if (attempt > 9) throw createErr;
                    cleanedBS.id = baseId + '.g' + (attempt + 1);
                    continue;
                }
                if (createErr && createErr.code === 409 && customGame) {
                    // Custom/All-Star re-save (End Game → Back to Game → End
                    // Game keeps the same timestamped id): overwrite so the
                    // corrected final wins instead of failing forever.
                    await boxScoresContainer.items.upsert(cleanedBS);
                    break;
                }
                throw createErr;
            }
        }
    } catch (err) {
        console.error("CRITICAL: Box score save failed:", err.message);
        return res.status(500).json({ error: "Failed to save box score." });
    }

    var boxScoreID = cleanedBS.id;

    // ── B. Update season (IMPORTANT) ──
    // For custom (off-schedule) games we still want the box score saved (Step A
    // already ran) and players updated, but the schedule + standings stay
    // untouched — pretend the season-side update doesn't apply.
    if (customGame) {
        // skip
    } else
    try {
        var seasonResp = await seasonsContainer.item(seasonId, seasonId).read();
        var seasonDoc = seasonResp.resource;

        if (seasonDoc) {
            var updated = false;
            var winnerName = boxScore.teamInfo[winnerSide].name;
            var loserName = boxScore.teamInfo[loserSide].name;

            // Helper to write result fields on a matched game object
            function writeGameResult(gameObj) {
                gameObj.winner = winnerName;
                gameObj.loser = loserName;
                gameObj.homeScore = homeScore;
                gameObj.awayScore = awayScore;
                gameObj.boxScoreID = boxScoreID;
                gameObj.completion = true;
            }

            // Mode 1: weeklySchedule (predetermined — DRMBL)
            if (seasonDoc.weeklySchedule && homeSlot && awaySlot) {
                for (var w = 0; w < seasonDoc.weeklySchedule.length && !updated; w++) {
                    var week = seasonDoc.weeklySchedule[w];
                    if (!week.games) continue;
                    for (var g = 0; g < week.games.length; g++) {
                        var wg = week.games[g];
                        // Match by game ID if provided, otherwise fall back to slot matching
                        if (scheduleGameId && wg.id === scheduleGameId && !wg.completion) {
                            writeGameResult(wg);
                            updated = true;
                            break;
                        } else if (!scheduleGameId && wg.home === homeSlot && wg.away === awaySlot && !wg.winner) {
                            writeGameResult(wg);
                            updated = true;
                            break;
                        }
                    }
                }
            }

            // Mode 2: games array (Copa Beta, LOMBA predetermined)
            if (!updated && seasonDoc.games) {
                for (var gi = 0; gi < seasonDoc.games.length; gi++) {
                    var sg = seasonDoc.games[gi];
                    // Match by game ID if provided, otherwise fall back to slot matching
                    if (scheduleGameId && sg.id === scheduleGameId && !sg.completion) {
                        writeGameResult(sg);
                        updated = true;
                        break;
                    } else if (!scheduleGameId && sg.home === homeSlot && sg.away === awaySlot && !sg.winner) {
                        writeGameResult(sg);
                        updated = true;
                        break;
                    }
                }
            }

            // Mode 3: on-the-fly schedule (LOMBA fallback)
            if (!updated) {
                if (!seasonDoc.schedule) seasonDoc.schedule = [];

                var gameDate = boxScore.gameInfo.general.date;
                var gameDateObj = null;
                if (gameDate) {
                    var parts = gameDate.split("/");
                    if (parts.length === 3) {
                        gameDateObj = {
                            year: parseInt(parts[2]),
                            month: parseInt(parts[0]),
                            date: parseInt(parts[1])
                        };
                    }
                }

                var scheduleEntry = {
                    home: boxScore.teamInfo.home.name,
                    away: boxScore.teamInfo.away.name,
                    id: boxScoreID,
                    winner: winnerName,
                    loser: loserName,
                    homeScore: homeScore,
                    awayScore: awayScore
                };

                var dateFound = false;
                if (gameDateObj) {
                    for (var d = 0; d < seasonDoc.schedule.length; d++) {
                        var sd = seasonDoc.schedule[d].date;
                        if (sd && sd.year === gameDateObj.year && sd.month === gameDateObj.month && sd.date === gameDateObj.date) {
                            seasonDoc.schedule[d].games.push(scheduleEntry);
                            dateFound = true;
                            break;
                        }
                    }
                }

                if (!dateFound) {
                    seasonDoc.schedule.push({
                        date: gameDateObj || "TBD",
                        games: [scheduleEntry]
                    });
                }

                updated = true;
            }

            // Recompute standings (DRMBL doubleheader-aware via recomputeStandings helper)
            if (updated && seasonDoc.standings) {
                var standingsArr = recomputeStandings(seasonDoc);
                seasonDoc.standings = standingsArr;

                // Rebuild slot-keyed map for downstream seed resolution
                var standingsMap = {};
                for (var smi = 0; smi < standingsArr.length; smi++) {
                    standingsMap[standingsArr[smi].slot] = standingsArr[smi];
                }

                // ── Resolve seed placeholders in upcoming games ──
                // Build slot-by-seed lookup: standings[0] = #1 Seed, etc.
                var seedToSlot = {};
                var seedToName = {};
                for (var si = 0; si < standingsArr.length; si++) {
                    seedToSlot["#" + (si + 1) + " Seed"] = standingsArr[si].slot;
                    seedToName["#" + (si + 1) + " Seed"] = standingsArr[si].name;
                }

                // Build grouped seed lookup for Copa Beta: #1A Seed, #2B Seed, etc.
                if (seasonDoc.groups) {
                    var groupKeys = Object.keys(seasonDoc.groups);
                    for (var gki = 0; gki < groupKeys.length; gki++) {
                        var gKey = groupKeys[gki];
                        var groupSlots = seasonDoc.groups[gKey];
                        // Filter standings to only teams in this group, preserving rank order
                        var groupStandings = [];
                        for (var gsi = 0; gsi < standingsArr.length; gsi++) {
                            if (groupSlots.indexOf(standingsArr[gsi].slot) !== -1) {
                                groupStandings.push(standingsArr[gsi]);
                            }
                        }
                        for (var gri = 0; gri < groupStandings.length; gri++) {
                            var groupSeedKey = "#" + (gri + 1) + gKey + " Seed";
                            seedToSlot[groupSeedKey] = groupStandings[gri].slot;
                            seedToName[groupSeedKey] = groupStandings[gri].name;
                        }
                    }
                }

                // Gather ALL games (including playoffs) for seed + winner/loser resolution
                var allGames = [];
                if (seasonDoc.weeklySchedule) {
                    for (var awi = 0; awi < seasonDoc.weeklySchedule.length; awi++) {
                        var awk = seasonDoc.weeklySchedule[awi];
                        if (awk.games) {
                            for (var agi = 0; agi < awk.games.length; agi++) {
                                allGames.push(awk.games[agi]);
                            }
                        }
                    }
                }
                if (seasonDoc.games) {
                    for (var agi2 = 0; agi2 < seasonDoc.games.length; agi2++) {
                        allGames.push(seasonDoc.games[agi2]);
                    }
                }

                // Build a map of round labels to their results (for Winner/Loser resolution)
                // At this point, completed playoff games should already have resolved slots
                var roundResults = {};
                for (var ri = 0; ri < allGames.length; ri++) {
                    var rg = allGames[ri];
                    if (rg.round && rg.completion && rg.winner) {
                        // Determine winner/loser slots by matching winner name to home/away
                        var homeIsWinnerRound = standingsMap[rg.home] && standingsMap[rg.home].name === rg.winner;
                        roundResults[rg.round] = {
                            winner: rg.winner,
                            loser: rg.loser,
                            winnerSlot: homeIsWinnerRound ? rg.home : rg.away,
                            loserSlot: homeIsWinnerRound ? rg.away : rg.home
                        };
                    }
                }

                // Resolve placeholders in all unplayed games
                for (var pi = 0; pi < allGames.length; pi++) {
                    var pg = allGames[pi];
                    if (pg.completion) continue; // already played, skip
                    // Event cards (e.g. All-Star week ceremonies) have a title but no
                    // home/away matchup — nothing to resolve, and .match() would throw.
                    if (typeof pg.home !== "string" || typeof pg.away !== "string") continue;

                    // Resolve #N Seed patterns
                    if (seedToSlot[pg.home]) {
                        pg.home = seedToSlot[pg.home];
                    }
                    if (seedToSlot[pg.away]) {
                        pg.away = seedToSlot[pg.away];
                    }

                    // Resolve "Winner X" / "Loser X" patterns
                    var winnerMatch = pg.home.match(/^(Winner|Loser)\s+(.+)$/i);
                    if (winnerMatch) {
                        var refRound = winnerMatch[2];
                        var isWinnerRef = winnerMatch[1].toLowerCase() === "winner";
                        if (roundResults[refRound]) {
                            pg.home = isWinnerRef ? roundResults[refRound].winnerSlot : roundResults[refRound].loserSlot;
                        }
                    }
                    var awayWinnerMatch = pg.away.match(/^(Winner|Loser)\s+(.+)$/i);
                    if (awayWinnerMatch) {
                        var refRound2 = awayWinnerMatch[2];
                        var isWinnerRef2 = awayWinnerMatch[1].toLowerCase() === "winner";
                        if (roundResults[refRound2]) {
                            pg.away = isWinnerRef2 ? roundResults[refRound2].winnerSlot : roundResults[refRound2].loserSlot;
                        }
                    }

                    // Also update the game ID to reflect resolved teams
                    if (pg.home && pg.away && standingsMap[pg.home] && standingsMap[pg.away]) {
                        var homeName = standingsMap[pg.home].name;
                        var awayName = standingsMap[pg.away].name;
                        var dateStr = pg.date ? (pg.date.month + "/" + pg.date.date + "/" + pg.date.year) : "TBD";
                        var roundStr = pg.round ? " - " + pg.round : "";
                        pg.id = awayName + " vs. " + homeName + roundStr + " - " + dateStr;
                    }
                }
            }

            if (updated) {
                await seasonsContainer.item(seasonId, seasonId).replace(seasonDoc);
            } else {
                errors.push("Season: could not save game to schedule");
            }
        }
    } catch (err) {
        console.error("Season update failed:", err.message);
        errors.push("Season update failed: " + err.message);
    }

    // (Removed: per-team-doc record updates and per-player-doc upserts.
    //  Both wrote to phantom schema fields and silently failed for every game
    //  ever saved. Per-team + per-player season aggregates are computed
    //  authoritatively in step F via recomputeSeasonStats.)
    var isSimple = boxScore.type === "simple";

    // ── E. Remove from Live Games container ──
    var liveGameId = body.gameId || (boxScore && boxScore.gameId);
    if (liveGameId) {
        try {
            var liveContainer = await database.containers.createIfNotExists({
                id: LIVE_GAMES_CONTAINER_ID,
                partitionKey: { paths: ["/id"] }
            });
            await liveContainer.container.item(liveGameId, liveGameId).delete();
        } catch (err) {
            if (err.code !== 404) {
                console.error("Live game cleanup failed:", err.message);
                errors.push("Live game cleanup failed: " + err.message);
            }
        }
    }

    // ── F. Recompute Season Stats (DRMBL + Copa Beta — anything with structured fields) ──
    // Walk every completed box score for this season and rebuild the Season Stats doc.
    // Skipped for custom games (they don't belong to season-wide stats) and simple-tracker
    // games (those don't carry the structured fields needed for proper aggregation).
    if (!customGame && !isSimple) {
        try {
            var statsContainer = await getSeasonStatsContainer();
            var bsContainer = await getBoxScoresContainer();
            var { resources: seasonBoxScores } = await bsContainer.items
                .query({
                    query: "SELECT * FROM c WHERE c.seasonID = @s OR c.season = @s",
                    parameters: [{ name: "@s", value: seasonId }]
                })
                .fetchAll();
            var { resource: seasonDocForStats } = await seasonsContainer.item(seasonId, seasonId).read();
            if (seasonDocForStats) {
                var statsDoc = recomputeSeasonStats(seasonDocForStats, seasonBoxScores);
                await statsContainer.items.upsert(statsDoc);
            }
        } catch (err) {
            console.error("Season Stats recompute failed:", err.message);
            errors.push("Season Stats recompute failed: " + err.message);
        }
    }

    // ── Response ──
    if (errors.length > 0) {
        return res.status(207).json({ success: true, boxScoreID: boxScoreID, warnings: errors });
    }
    return res.status(200).json({ success: true, boxScoreID: boxScoreID });
};
