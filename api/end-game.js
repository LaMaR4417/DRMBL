var { CosmosClient } = require("@azure/cosmos");

var client = new CosmosClient({
    endpoint: process.env.COSMOS_ENDPOINT,
    key: process.env.COSMOS_KEY
});

var database = client.database("DRMBL Database");
var seasonsContainer = database.container("Seasons");
var teamsContainer = database.container("Teams");

var SEASON_ID = "Spring - Mens - 2026";
var BOX_SCORES_CONTAINER_ID = "Box Scores";
var PLAYERS_CONTAINER_ID = "Players";

async function getBoxScoresContainer() {
    var { container } = await database.containers.createIfNotExists({
        id: BOX_SCORES_CONTAINER_ID,
        partitionKey: { paths: ["/id"] }
    });
    return container;
}

async function getPlayersContainer() {
    var { container } = await database.containers.createIfNotExists({
        id: PLAYERS_CONTAINER_ID,
        partitionKey: { paths: ["/id"] }
    });
    return container;
}

// ── Helpers ──────────────────────────────────────────────────

function val(v) { return v || 0; }

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

function buildEmptyTotals() {
    return {
        offense: {
            points: 0,
            assists: 0,
            shootingBreakdown: {
                fieldGoals: {
                    totalAttempted: 0, totalMade: 0, totalMissed: 0, totalPercentage: 0,
                    "2-PointShots": { attempted: 0, made: 0, missed: 0, percentage: 0 },
                    "3-PointShots": { attempted: 0, made: 0, missed: 0, percentage: 0 }
                },
                freeThrows: { attempted: 0, made: 0, missed: 0, percentage: 0 }
            }
        },
        defense: { steals: 0, blocks: 0 },
        rebounds: { total: 0, defensive: 0, offensive: 0 },
        general: {
            minutesPlayed: 0,
            turnovers: 0,
            fouls: { personal: { total: 0, offensive: 0 }, technical: 0, flagrant: 0 },
            plusMinus: 0
        }
    };
}

function pct(made, attempted) {
    return attempted === 0 ? 0 : Math.round((made / attempted) * 100);
}

function addToTotals(totals, gameStats) {
    if (!totals || totals.offense == null) totals = buildEmptyTotals();
    var t = totals;
    var g = gameStats;

    t.offense.points = val(t.offense.points) + val(g.offense.points);
    t.offense.assists = val(t.offense.assists) + val(g.offense.assists);

    var tfg = t.offense.shootingBreakdown.fieldGoals;
    var gfg = g.offense.shootingBreakdown.fieldGoals;
    tfg.totalAttempted = val(tfg.totalAttempted) + val(gfg.totalAttempted);
    tfg.totalMade = val(tfg.totalMade) + val(gfg.totalMade);
    tfg.totalMissed = val(tfg.totalMissed) + val(gfg.totalMissed);
    tfg.totalPercentage = pct(tfg.totalMade, tfg.totalAttempted);

    for (var shotKey of ["2-PointShots", "3-PointShots"]) {
        tfg[shotKey].attempted = val(tfg[shotKey].attempted) + val(gfg[shotKey].attempted);
        tfg[shotKey].made = val(tfg[shotKey].made) + val(gfg[shotKey].made);
        tfg[shotKey].missed = val(tfg[shotKey].missed) + val(gfg[shotKey].missed);
        tfg[shotKey].percentage = pct(tfg[shotKey].made, tfg[shotKey].attempted);
    }

    var tft = t.offense.shootingBreakdown.freeThrows;
    var gft = g.offense.shootingBreakdown.freeThrows;
    tft.attempted = val(tft.attempted) + val(gft.attempted);
    tft.made = val(tft.made) + val(gft.made);
    tft.missed = val(tft.missed) + val(gft.missed);
    tft.percentage = pct(tft.made, tft.attempted);

    t.defense.steals = val(t.defense.steals) + val(g.defense.steals);
    t.defense.blocks = val(t.defense.blocks) + val(g.defense.blocks);

    t.rebounds.total = val(t.rebounds.total) + val(g.rebounds.total);
    t.rebounds.defensive = val(t.rebounds.defensive) + val(g.rebounds.defensive);
    t.rebounds.offensive = val(t.rebounds.offensive) + val(g.rebounds.offensive);

    t.general.minutesPlayed = val(t.general.minutesPlayed) + val(g.general.minutesPlayed);
    t.general.turnovers = val(t.general.turnovers) + val(g.general.turnovers);
    t.general.fouls.personal.total = val(t.general.fouls.personal.total) + val(g.general.fouls.personal.total);
    t.general.fouls.personal.offensive = val(t.general.fouls.personal.offensive) + val(g.general.fouls.personal.offensive);
    t.general.fouls.technical = val(t.general.fouls.technical) + val(g.general.fouls.technical);
    t.general.fouls.flagrant = val(t.general.fouls.flagrant) + val(g.general.fouls.flagrant);
    t.general.plusMinus = val(t.general.plusMinus) + val(g.general.plusMinus);

    return t;
}

function computeAverages(totals, gamesPlayed) {
    if (!gamesPlayed || gamesPlayed === 0) return buildEmptyTotals();
    var n = gamesPlayed;
    function avg(v) { return Math.round((v / n) * 10) / 10; }

    var a = JSON.parse(JSON.stringify(totals));

    a.offense.points = avg(val(a.offense.points));
    a.offense.assists = avg(val(a.offense.assists));

    var fg = a.offense.shootingBreakdown.fieldGoals;
    fg.totalAttempted = avg(val(fg.totalAttempted));
    fg.totalMade = avg(val(fg.totalMade));
    fg.totalMissed = avg(val(fg.totalMissed));
    fg.totalPercentage = pct(totals.offense.shootingBreakdown.fieldGoals.totalMade, totals.offense.shootingBreakdown.fieldGoals.totalAttempted);

    for (var shotKey of ["2-PointShots", "3-PointShots"]) {
        fg[shotKey].attempted = avg(val(fg[shotKey].attempted));
        fg[shotKey].made = avg(val(fg[shotKey].made));
        fg[shotKey].missed = avg(val(fg[shotKey].missed));
        fg[shotKey].percentage = pct(totals.offense.shootingBreakdown.fieldGoals[shotKey].made, totals.offense.shootingBreakdown.fieldGoals[shotKey].attempted);
    }

    var ft = a.offense.shootingBreakdown.freeThrows;
    ft.attempted = avg(val(ft.attempted));
    ft.made = avg(val(ft.made));
    ft.missed = avg(val(ft.missed));
    ft.percentage = pct(totals.offense.shootingBreakdown.freeThrows.made, totals.offense.shootingBreakdown.freeThrows.attempted);

    a.defense.steals = avg(val(a.defense.steals));
    a.defense.blocks = avg(val(a.defense.blocks));

    a.rebounds.total = avg(val(a.rebounds.total));
    a.rebounds.defensive = avg(val(a.rebounds.defensive));
    a.rebounds.offensive = avg(val(a.rebounds.offensive));

    a.general.minutesPlayed = avg(val(a.general.minutesPlayed));
    a.general.turnovers = avg(val(a.general.turnovers));
    a.general.fouls.personal.total = avg(val(a.general.fouls.personal.total));
    a.general.fouls.personal.offensive = avg(val(a.general.fouls.personal.offensive));
    a.general.fouls.technical = avg(val(a.general.fouls.technical));
    a.general.fouls.flagrant = avg(val(a.general.fouls.flagrant));
    a.general.plusMinus = avg(val(a.general.plusMinus));

    return a;
}

function buildNewPlayerDoc(player, teamName, gameEntry, gameStats) {
    var parts = player.playerID.split(" - ");
    var dobStr = parts.length > 1 ? parts[parts.length - 1] : "";
    var dob = { year: null, month: null, date: null };
    if (dobStr.length === 8 && !isNaN(dobStr)) {
        dob.year = parseInt(dobStr.substring(0, 4));
        dob.month = parseInt(dobStr.substring(4, 6));
        dob.date = parseInt(dobStr.substring(6, 8));
    }

    var totals = addToTotals(buildEmptyTotals(), gameStats);

    return {
        id: player.playerID,
        playerInfo: {
            name: player.name,
            dateOfBirth: dob,
            positions: { primary: "", secondary: [] },
            height: { feet: null, inches: null },
            weight: null,
            handedness: null,
            status: { active: true, injured: false, inactive: false }
        },
        teams: {
            current: { name: teamName, number: player.number, otherNumbers: [] },
            past: []
        },
        stats: {
            career: {
                gamesPlayed: 1,
                games: [gameEntry],
                averages: computeAverages(totals, 1),
                totals: totals
            },
            seasons: {
                current: {
                    season: SEASON_ID,
                    gamesPlayed: 1,
                    games: [gameEntry],
                    averages: computeAverages(totals, 1),
                    totals: JSON.parse(JSON.stringify(totals))
                },
                past: []
            }
        }
    };
}

function updateExistingPlayer(playerDoc, player, teamName, gameEntry, gameStats) {
    playerDoc.teams.current.name = teamName;
    playerDoc.teams.current.number = player.number;

    // Season rotation: if current season differs, push to past
    var current = playerDoc.stats.seasons.current;
    if (current.season && current.season !== SEASON_ID) {
        if (!playerDoc.stats.seasons.past) playerDoc.stats.seasons.past = [];
        playerDoc.stats.seasons.past.push(JSON.parse(JSON.stringify(current)));
        current.season = SEASON_ID;
        current.gamesPlayed = 0;
        current.games = [];
        current.totals = buildEmptyTotals();
        current.averages = buildEmptyTotals();
    }
    if (!current.season) current.season = SEASON_ID;

    // Update season stats
    current.gamesPlayed = (current.gamesPlayed || 0) + 1;
    if (!current.games) current.games = [];
    current.games.push(gameEntry);
    current.totals = addToTotals(current.totals, gameStats);
    current.averages = computeAverages(current.totals, current.gamesPlayed);

    // Update career stats
    var career = playerDoc.stats.career;
    career.gamesPlayed = (career.gamesPlayed || 0) + 1;
    if (!career.games) career.games = [];
    career.games.push(gameEntry);
    career.totals = addToTotals(career.totals, gameStats);
    career.averages = computeAverages(career.totals, career.gamesPlayed);
}

// ── Main handler ─────────────────────────────────────────────

module.exports = async function (req, res) {
    if (req.method !== "POST") {
        return res.status(405).json({ error: "Method not allowed" });
    }

    var body = req.body;
    if (!body || !body.boxScore || !body.homeTeamID || !body.awayTeamID || !body.homeSlot || !body.awaySlot) {
        return res.status(400).json({ error: "Missing required fields." });
    }

    var boxScore = body.boxScore;
    var homeTeamID = body.homeTeamID;
    var awayTeamID = body.awayTeamID;
    var homeSlot = body.homeSlot;
    var awaySlot = body.awaySlot;
    var errors = [];

    // ── A. Save box score (CRITICAL) ──
    var cleanedBS = cleanBoxScore(boxScore);
    try {
        var boxScoresContainer = await getBoxScoresContainer();
        await boxScoresContainer.items.create(cleanedBS);
    } catch (err) {
        console.error("CRITICAL: Box score save failed:", err.message);
        return res.status(500).json({ error: "Failed to save box score." });
    }

    var boxScoreID = cleanedBS.id;
    var homeScore = boxScore.teamInfo.home.score.current;
    var awayScore = boxScore.teamInfo.away.score.current;
    var winnerSide = boxScore.gameInfo.state.winner;
    var loserSide = boxScore.gameInfo.state.loser;

    // ── B. Update season (IMPORTANT) ──
    try {
        var seasonResp = await seasonsContainer.item(SEASON_ID, SEASON_ID).read();
        var seasonDoc = seasonResp.resource;

        if (seasonDoc) {
            var gameResult = {
                boxScoreID: boxScoreID,
                winner: {
                    team: boxScore.teamInfo[winnerSide].name,
                    slot: winnerSide === "home" ? homeSlot : awaySlot,
                    score: boxScore.teamInfo[winnerSide].score.current
                },
                loser: {
                    team: boxScore.teamInfo[loserSide].name,
                    slot: loserSide === "home" ? homeSlot : awaySlot,
                    score: boxScore.teamInfo[loserSide].score.current
                }
            };

            var found = false;
            for (var w = 0; w < seasonDoc.weeklySchedule.length && !found; w++) {
                var week = seasonDoc.weeklySchedule[w];
                for (var g = 0; g < week.games.length; g++) {
                    if (week.games[g].home === homeSlot && week.games[g].away === awaySlot) {
                        week.games[g].result = gameResult;
                        found = true;
                        break;
                    }
                }
            }

            if (found) {
                await seasonsContainer.item(SEASON_ID, SEASON_ID).replace(seasonDoc);
            } else {
                errors.push("Season: no matching game for slots " + homeSlot + "/" + awaySlot);
            }
        }
    } catch (err) {
        console.error("Season update failed:", err.message);
        errors.push("Season update failed: " + err.message);
    }

    // ── C. Update team records (IMPORTANT) ──
    async function updateTeamRecord(teamID, isWinner, ownScore, oppScore) {
        try {
            var teamResp = await teamsContainer.item(teamID, teamID).read();
            var teamDoc = teamResp.resource;
            if (!teamDoc) { errors.push("Team not found: " + teamID); return; }

            var seasonEntry = null;
            for (var s = 0; s < teamDoc.seasons.length; s++) {
                if (teamDoc.seasons[s].id === SEASON_ID) { seasonEntry = teamDoc.seasons[s]; break; }
            }
            if (!seasonEntry) { errors.push("Season entry not found for team: " + teamID); return; }

            var record = seasonEntry.record;

            // Find first empty game slot
            var emptyIndex = -1;
            for (var g = 0; g < record.games.length; g++) {
                if (record.games[g].id === "") { emptyIndex = g; break; }
            }
            if (emptyIndex === -1) { errors.push("No empty game slots for team: " + teamID); return; }

            var winnerScore = isWinner ? ownScore : oppScore;
            var loserScore = isWinner ? oppScore : ownScore;
            var winnerName = boxScore.teamInfo[isWinner ? (ownScore === homeScore ? "home" : "away") : (oppScore === homeScore ? "home" : "away")].name;
            var loserName = boxScore.teamInfo[isWinner ? (oppScore === homeScore ? "home" : "away") : (ownScore === homeScore ? "home" : "away")].name;

            record.games[emptyIndex] = {
                id: boxScoreID,
                result: {
                    winner: { team: winnerName, score: winnerScore },
                    loser: { team: loserName, score: loserScore }
                }
            };

            record.wins = (record.wins || 0) + (isWinner ? 1 : 0);
            record.losses = (record.losses || 0) + (isWinner ? 0 : 1);
            record.pointDifferential = (record.pointDifferential || 0) + (ownScore - oppScore);

            await teamsContainer.item(teamID, teamID).replace(teamDoc);
        } catch (err) {
            console.error("Team update failed for " + teamID + ":", err.message);
            errors.push("Team update failed for " + teamID + ": " + err.message);
        }
    }

    var homeIsWinner = winnerSide === "home";
    await updateTeamRecord(homeTeamID, homeIsWinner, homeScore, awayScore);
    await updateTeamRecord(awayTeamID, !homeIsWinner, awayScore, homeScore);

    // ── D. Upsert player documents (IMPORTANT, fault-tolerant) ──
    async function upsertPlayer(player, side) {
        var teamName = boxScore.teamInfo[side].name;
        var oppName = boxScore.teamInfo[side === "home" ? "away" : "home"].name;

        var gameEntry = {
            boxScoreID: boxScoreID,
            date: boxScore.gameInfo.general.date,
            opponent: oppName,
            result: boxScore.gameInfo.state.winner === side ? "W" : "L",
            stats: {
                offense: player.stats.offense,
                defense: player.stats.defense,
                rebounds: player.stats.rebounds,
                general: {
                    minutesPlayed: player.stats.general.minutesPlayed,
                    turnovers: player.stats.general.turnovers,
                    fouls: player.stats.general.fouls,
                    plusMinus: player.stats.general.plusMinus
                }
            }
        };
        var gameStats = gameEntry.stats;

        try {
            var playersContainer = await getPlayersContainer();
            var playerDoc;
            var isNew = false;

            try {
                var resp = await playersContainer.item(player.playerID, player.playerID).read();
                playerDoc = resp.resource;
            } catch (readErr) {
                if (readErr.code === 404) { isNew = true; } else { throw readErr; }
            }

            if (isNew) {
                playerDoc = buildNewPlayerDoc(player, teamName, gameEntry, gameStats);
                await playersContainer.items.create(playerDoc);
            } else {
                updateExistingPlayer(playerDoc, player, teamName, gameEntry, gameStats);
                await playersContainer.item(player.playerID, player.playerID).replace(playerDoc);
            }
        } catch (err) {
            console.error("Player upsert failed for " + player.playerID + ":", err.message);
            errors.push("Player upsert failed for " + player.playerID);
        }
    }

    // Parallelize player upserts per side to stay within Vercel timeout
    var playerPromises = [];
    for (var side of ["home", "away"]) {
        var roster = boxScore.teamInfo[side].roster.inGame;
        for (var i = 0; i < roster.length; i++) {
            if (roster[i].playerID) {
                playerPromises.push(upsertPlayer(roster[i], side));
            }
        }
    }
    await Promise.allSettled(playerPromises);

    // ── Response ──
    if (errors.length > 0) {
        return res.status(207).json({ success: true, boxScoreID: boxScoreID, warnings: errors });
    }
    return res.status(200).json({ success: true, boxScoreID: boxScoreID });
};
