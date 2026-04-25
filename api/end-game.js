var { CosmosClient } = require("@azure/cosmos");

var client = new CosmosClient({
    endpoint: process.env.COSMOS_ENDPOINT,
    key: process.env.COSMOS_KEY
});

var database = client.database("DRMBL Database");
var seasonsContainer = database.container("Seasons");
var teamsContainer = database.container("Teams");

var BOX_SCORES_CONTAINER_ID = "Box Scores";
var PLAYERS_CONTAINER_ID = "Players";
var LIVE_GAMES_CONTAINER_ID = "Live Games";

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

function buildNewPlayerDoc(player, teamName, gameEntry, gameStats, seasonId) {
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
                    season: seasonId,
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

function updateExistingPlayer(playerDoc, player, teamName, gameEntry, gameStats, seasonId) {
    playerDoc.teams.current.name = teamName;
    playerDoc.teams.current.number = player.number;

    // Season rotation: if current season differs, push to past
    var current = playerDoc.stats.seasons.current;
    if (current.season && current.season !== seasonId) {
        if (!playerDoc.stats.seasons.past) playerDoc.stats.seasons.past = [];
        playerDoc.stats.seasons.past.push(JSON.parse(JSON.stringify(current)));
        current.season = seasonId;
        current.gamesPlayed = 0;
        current.games = [];
        current.totals = buildEmptyTotals();
        current.averages = buildEmptyTotals();
    }
    if (!current.season) current.season = seasonId;

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
    var customGame = !!body.customGame;
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
    // Add season and team references
    cleanedBS.season = seasonId;
    cleanedBS.team = {
        home: boxScore.teamInfo.home.name,
        away: boxScore.teamInfo.away.name
    };
    try {
        var boxScoresContainer = await getBoxScoresContainer();
        await boxScoresContainer.items.create(cleanedBS);
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

            // Recompute standings from REGULAR SEASON games only
            if (updated && seasonDoc.standings) {
                var standingsMap = {};
                var teams = seasonDoc.teams || [];
                for (var ti = 0; ti < teams.length; ti++) {
                    var t = teams[ti];
                    if (t.teamID) {
                        standingsMap[t.slot] = { slot: t.slot, name: t.name, wins: 0, losses: 0, pointDiff: 0 };
                    }
                }

                // Gather ONLY regular season games (exclude seeded/playoffs/rounds)
                var regularGames = [];
                if (seasonDoc.weeklySchedule) {
                    for (var wi = 0; wi < seasonDoc.weeklySchedule.length; wi++) {
                        var wk = seasonDoc.weeklySchedule[wi];
                        if (wk.type === "seeded" || wk.type === "playoffs") continue;
                        if (wk.games) regularGames = regularGames.concat(wk.games);
                    }
                }
                if (seasonDoc.games) {
                    for (var rgi = 0; rgi < seasonDoc.games.length; rgi++) {
                        if (!seasonDoc.games[rgi].round) regularGames.push(seasonDoc.games[rgi]);
                    }
                }

                for (var ai = 0; ai < regularGames.length; ai++) {
                    var ag = regularGames[ai];
                    if (!ag.winner || ag.winner === "") continue;
                    var hSlot = ag.home;
                    var aSlot = ag.away;
                    var hEntry = standingsMap[hSlot];
                    var aEntry = standingsMap[aSlot];
                    if (!hEntry || !aEntry) continue;
                    var hs = ag.homeScore || 0;
                    var as = ag.awayScore || 0;
                    if (ag.winner === hEntry.name) {
                        hEntry.wins++;
                        aEntry.losses++;
                    } else {
                        aEntry.wins++;
                        hEntry.losses++;
                    }
                    hEntry.pointDiff += (hs - as);
                    aEntry.pointDiff += (as - hs);
                }

                // Sort: wins desc, then pointDiff desc
                var standingsArr = Object.values(standingsMap);
                standingsArr.sort(function (a, b) {
                    if (b.wins !== a.wins) return b.wins - a.wins;
                    return b.pointDiff - a.pointDiff;
                });
                seasonDoc.standings = standingsArr;

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

    // ── C. Update team records (skip for simple tracker AND for custom games) ──
    // Custom games don't roll into team records or player season totals.
    var isSimple = boxScore.type === "simple";

    if (!isSimple && !customGame) {
    async function updateTeamRecord(teamID, isWinner, ownScore, oppScore) {
        try {
            var teamResp = await teamsContainer.item(teamID, teamID).read();
            var teamDoc = teamResp.resource;
            if (!teamDoc) { errors.push("Team not found: " + teamID); return; }

            var seasonEntry = null;
            for (var s = 0; s < teamDoc.seasons.length; s++) {
                if (teamDoc.seasons[s].id === seasonId) { seasonEntry = teamDoc.seasons[s]; break; }
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
                playerDoc = buildNewPlayerDoc(player, teamName, gameEntry, gameStats, seasonId);
                await playersContainer.items.create(playerDoc);
            } else {
                updateExistingPlayer(playerDoc, player, teamName, gameEntry, gameStats, seasonId);
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
    } // end if (!isSimple)

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

    // ── Response ──
    if (errors.length > 0) {
        return res.status(207).json({ success: true, boxScoreID: boxScoreID, warnings: errors });
    }
    return res.status(200).json({ success: true, boxScoreID: boxScoreID });
};
