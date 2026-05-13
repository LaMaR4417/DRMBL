// Edit-game endpoint: upsert variant of end-game.js. Used by the retro-fill
// recorder app to overwrite an existing box score with corrected stats while
// preserving the original box-score id (and therefore all inbound links).
//
// Key differences vs end-game.js:
//   1. Uses items.upsert() instead of items.create() — no collision retry.
//   2. Preserves boxScore.id as-is (does NOT regenerate via makeBoxScoreID).
//   3. Strips score.target and score.targetPerQuarter from each side before
//      persisting — those are UI-only references for the wipe-and-retrack flow.
//   4. Schedule update matches by boxScoreID (the existing doc id) so already-
//      completed games can be re-overwritten with fresh winner/loser/scores.
//   5. Same recompute paths for standings + Season Stats so the rest of the
//      system stays consistent.

var { CosmosClient } = require("@azure/cosmos");
var { recomputeStandings } = require("./_lib/recomputeStandings");
var { buildStructuredFields } = require("./_lib/boxScoreId");
var { recomputeSeasonStats } = require("./_lib/seasonStats");

var client = new CosmosClient({
    endpoint: process.env.COSMOS_ENDPOINT,
    key: process.env.COSMOS_KEY
});

var database = client.database("DRMBL Database");
var seasonsContainer = database.container("Seasons");

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

function cleanBoxScore(bs) {
    var cleaned = JSON.parse(JSON.stringify(bs));
    for (var side of ["home", "away"]) {
        delete cleaned.teamInfo[side]._minutesPerPeriod;
        delete cleaned.teamInfo[side]._minutesPerOT;
        // Strip retro-fill UI-only reference fields
        if (cleaned.teamInfo[side].score) {
            delete cleaned.teamInfo[side].score.target;
            delete cleaned.teamInfo[side].score.targetPerQuarter;
        }
        for (var i = 0; i < cleaned.teamInfo[side].roster.inGame.length; i++) {
            var p = cleaned.teamInfo[side].roster.inGame[i];
            delete p._clockTimeAtEntry;
            delete p.onCourt;
            delete p.captain;
        }
    }
    return cleaned;
}

module.exports = async function (req, res) {
    if (req.method !== "POST") {
        return res.status(405).json({ error: "Method not allowed" });
    }

    var body = req.body;
    if (!body || !body.boxScore || !body.homeTeamID || !body.awayTeamID) {
        return res.status(400).json({ error: "Missing required fields." });
    }
    if (!body.boxScore.id) {
        return res.status(400).json({ error: "Missing boxScore.id (edit-game requires an existing id to upsert into)." });
    }

    var boxScore = body.boxScore;
    var homeTeamID = body.homeTeamID;
    var awayTeamID = body.awayTeamID;
    var homeSlot = body.homeSlot || null;
    var awaySlot = body.awaySlot || null;
    var scheduleGameId = body.scheduleGameId || null;
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

    // ── A. Upsert box score (CRITICAL) ──
    var cleanedBS = cleanBoxScore(boxScore);
    cleanedBS.season = seasonId;
    cleanedBS.team = {
        home: boxScore.teamInfo.home.name,
        away: boxScore.teamInfo.away.name
    };

    // Mark DNP on inGame slots that ended with 0 minutes played (matches end-game.js).
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

    // Add structured top-level fields (same as end-game.js — for query indexing).
    var structured = buildStructuredFields(cleanedBS, {
        seasonID: seasonId,
        homeTeamID: homeTeamID,
        awayTeamID: awayTeamID
    });
    Object.assign(cleanedBS, structured);
    // CRITICAL: do NOT regenerate id. Preserve the existing id so the upsert
    // overwrites the same doc instead of creating a new one.

    var boxScoreID = cleanedBS.id;

    try {
        var boxScoresContainer = await getBoxScoresContainer();
        await boxScoresContainer.items.upsert(cleanedBS);
    } catch (err) {
        console.error("CRITICAL: Box score upsert failed:", err.message);
        return res.status(500).json({ error: "Failed to upsert box score." });
    }

    // ── B. Update season (schedule entry + standings) ──
    if (customGame) {
        // skip schedule + standings for custom games
    } else
    try {
        var seasonResp = await seasonsContainer.item(seasonId, seasonId).read();
        var seasonDoc = seasonResp.resource;

        if (seasonDoc) {
            var updated = false;
            var winnerName = boxScore.teamInfo[winnerSide].name;
            var loserName = boxScore.teamInfo[loserSide].name;

            function writeGameResult(gameObj) {
                gameObj.winner = winnerName;
                gameObj.loser = loserName;
                gameObj.homeScore = homeScore;
                gameObj.awayScore = awayScore;
                gameObj.boxScoreID = boxScoreID;
                gameObj.completion = true;
            }

            // Edit-game match: prefer boxScoreID match (the game has already been
            // saved once; we know its id). Fall back to scheduleGameId / slot match
            // for safety, with NO guard on completion (we're editing a completed game).
            function gameMatches(gameObj) {
                if (gameObj.boxScoreID && gameObj.boxScoreID === boxScoreID) return true;
                if (scheduleGameId && gameObj.id === scheduleGameId) return true;
                if (!scheduleGameId && homeSlot && awaySlot &&
                    gameObj.home === homeSlot && gameObj.away === awaySlot) return true;
                return false;
            }

            // Mode 1: weeklySchedule (DRMBL)
            if (seasonDoc.weeklySchedule) {
                for (var w = 0; w < seasonDoc.weeklySchedule.length && !updated; w++) {
                    var week = seasonDoc.weeklySchedule[w];
                    if (!week.games) continue;
                    for (var g = 0; g < week.games.length; g++) {
                        if (gameMatches(week.games[g])) {
                            writeGameResult(week.games[g]);
                            updated = true;
                            break;
                        }
                    }
                }
            }

            // Mode 2: games array (Copa Beta, LOMBA predetermined)
            if (!updated && seasonDoc.games) {
                for (var gi = 0; gi < seasonDoc.games.length; gi++) {
                    if (gameMatches(seasonDoc.games[gi])) {
                        writeGameResult(seasonDoc.games[gi]);
                        updated = true;
                        break;
                    }
                }
            }

            // Mode 3: on-the-fly schedule (LOMBA fallback) — for an EDIT we
            // shouldn't need to push a new entry since the game was already saved
            // once. If the match still missed, log a warning but don't fail.
            if (!updated) {
                errors.push("Season: edit could not locate the schedule entry to update");
            }

            // Recompute standings (same as end-game.js).
            if (seasonDoc.standings) {
                seasonDoc.standings = recomputeStandings(seasonDoc);
            }

            await seasonsContainer.item(seasonId, seasonId).replace(seasonDoc);
        }
    } catch (err) {
        console.error("Season update failed:", err.message);
        errors.push("Season update failed: " + err.message);
    }

    // ── C. Defensive Live Games cleanup (edit shouldn't normally touch live, but be safe) ──
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

    // ── D. Recompute Season Stats from scratch ──
    var isSimple = boxScore.type === "simple";
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

    if (errors.length > 0) {
        return res.status(207).json({ success: true, boxScoreID: boxScoreID, warnings: errors });
    }
    return res.status(200).json({ success: true, boxScoreID: boxScoreID });
};
