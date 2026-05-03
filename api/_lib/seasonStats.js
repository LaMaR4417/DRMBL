// Season Stats recompute. Called by api/end-game.js after a game is saved,
// and by the one-shot backfill script. Single source of truth for per-season
// player + team stat aggregation.
//
// Doc shape:
//   {
//     id, seasonID, leagueID, lastUpdated, gamesProcessed,
//     players: [{ playerID, name, teamID, teamName, gamesPlayed, totals, averages, gameLog }],
//     teams:   [{ teamID, teamName, gamesPlayed, wins, losses, totals, averages, gameLog }]
//   }
//
// Strategy: full recompute from all completed box scores for the season.
// Idempotent + self-healing — re-running produces identical results.
//
// NOTE: min-attempt thresholds for percentage leaderboards are NOT applied
// here. Add later if needed (e.g. require 10 FG attempted for FG% eligibility).

function emptyPlayerTotals() {
    return {
        points: 0,
        assists: 0,
        rebounds: { total: 0, offensive: 0, defensive: 0 },
        steals: 0,
        blocks: 0,
        turnovers: 0,
        fouls: { personal: 0, technical: 0, flagrant: 0 },
        minutesPlayed: 0,
        plusMinus: 0,
        fieldGoals: {
            totalAttempted: 0, totalMade: 0, totalMissed: 0, totalPercentage: 0,
            twoPoint: { attempted: 0, made: 0, missed: 0, percentage: 0 },
            threePoint: { attempted: 0, made: 0, missed: 0, percentage: 0 }
        },
        freeThrows: { attempted: 0, made: 0, missed: 0, percentage: 0 }
    };
}

function emptyTeamTotals() {
    return {
        pointsScored: 0,
        pointsAllowed: 0,
        assists: 0,
        rebounds: { total: 0, offensive: 0, defensive: 0 },
        steals: 0,
        blocks: 0,
        turnovers: 0,
        fouls: 0,
        fieldGoals: {
            totalAttempted: 0, totalMade: 0, totalMissed: 0, totalPercentage: 0,
            twoPoint: { attempted: 0, made: 0, missed: 0, percentage: 0 },
            threePoint: { attempted: 0, made: 0, missed: 0, percentage: 0 }
        },
        freeThrows: { attempted: 0, made: 0, missed: 0, percentage: 0 }
    };
}

function pct(made, attempted) {
    return attempted === 0 ? 0 : Math.round((made / attempted) * 100);
}

function avg(total, gp) {
    if (!gp) return 0;
    return Math.round((total / gp) * 10) / 10; // 1 decimal place
}

// Add a player's per-game stats into their season totals
function accumulatePlayer(totals, p) {
    var s = p.stats || {};
    var off = s.offense || {};
    var fg = (off.shootingBreakdown && off.shootingBreakdown.fieldGoals) || {};
    var fg2 = fg['2-PointShots'] || {};
    var fg3 = fg['3-PointShots'] || {};
    var ft = (off.shootingBreakdown && off.shootingBreakdown.freeThrows) || {};
    var def = s.defense || {};
    var reb = s.rebounds || {};
    var gen = s.general || {};
    var fouls = (gen.fouls && gen.fouls.personal) || {};

    totals.points += off.points || 0;
    totals.assists += off.assists || 0;
    totals.rebounds.total += reb.total || 0;
    totals.rebounds.offensive += reb.offensive || 0;
    totals.rebounds.defensive += reb.defensive || 0;
    totals.steals += def.steals || 0;
    totals.blocks += def.blocks || 0;
    totals.turnovers += gen.turnovers || 0;
    totals.fouls.personal += fouls.total || 0;
    totals.fouls.technical += (gen.fouls && gen.fouls.technical) || 0;
    totals.fouls.flagrant += (gen.fouls && gen.fouls.flagrant) || 0;
    totals.minutesPlayed += gen.minutesPlayed || 0;
    totals.plusMinus += gen.plusMinus || 0;
    totals.fieldGoals.totalAttempted += fg.totalAttempted || 0;
    totals.fieldGoals.totalMade += fg.totalMade || 0;
    totals.fieldGoals.totalMissed += fg.totalMissed || 0;
    totals.fieldGoals.twoPoint.attempted += fg2.attempted || 0;
    totals.fieldGoals.twoPoint.made += fg2.made || 0;
    totals.fieldGoals.twoPoint.missed += fg2.missed || 0;
    totals.fieldGoals.threePoint.attempted += fg3.attempted || 0;
    totals.fieldGoals.threePoint.made += fg3.made || 0;
    totals.fieldGoals.threePoint.missed += fg3.missed || 0;
    totals.freeThrows.attempted += ft.attempted || 0;
    totals.freeThrows.made += ft.made || 0;
    totals.freeThrows.missed += ft.missed || 0;
}

// Score-only contribution: just points scored + allowed.
// Used for games marked scoreOnly (untrackable detail stats — only the score is reliable).
function accumulateTeamScoreOnly(totals, teamSide, oppSide) {
    totals.pointsScored += (teamSide.score && teamSide.score.current) || 0;
    totals.pointsAllowed += (oppSide.score && oppSide.score.current) || 0;
}

// Full per-game aggregate (points scored/allowed PLUS all detail stats).
function accumulateTeam(totals, teamSide, oppSide) {
    accumulateTeamScoreOnly(totals, teamSide, oppSide);

    var s = teamSide.stats || {};
    var fg = (s.shootingBreakdown && s.shootingBreakdown.fieldGoals) || {};
    var fg2 = fg['2-PointShots'] || {};
    var fg3 = fg['3-PointShots'] || {};
    var ft = (s.shootingBreakdown && s.shootingBreakdown.freeThrows) || {};
    var reb = s.rebounds || {};
    var def = s.defense || {};

    totals.assists += s.assists || 0;
    totals.rebounds.total += reb.total || 0;
    totals.rebounds.offensive += reb.offensive || 0;
    totals.rebounds.defensive += reb.defensive || 0;
    totals.steals += def.steals || 0;
    totals.blocks += def.blocks || 0;
    totals.turnovers += s.turnovers || 0;
    totals.fouls += (s.fouls && s.fouls.total) || 0;
    totals.fieldGoals.totalAttempted += fg.totalAttempted || 0;
    totals.fieldGoals.totalMade += fg.totalMade || 0;
    totals.fieldGoals.totalMissed += fg.totalMissed || 0;
    totals.fieldGoals.twoPoint.attempted += fg2.attempted || 0;
    totals.fieldGoals.twoPoint.made += fg2.made || 0;
    totals.fieldGoals.twoPoint.missed += fg2.missed || 0;
    totals.fieldGoals.threePoint.attempted += fg3.attempted || 0;
    totals.fieldGoals.threePoint.made += fg3.made || 0;
    totals.fieldGoals.threePoint.missed += fg3.missed || 0;
    totals.freeThrows.attempted += ft.attempted || 0;
    totals.freeThrows.made += ft.made || 0;
    totals.freeThrows.missed += ft.missed || 0;
}

// Compute averages from totals + games-played
function computePlayerAverages(t, gp) {
    return {
        ppg: avg(t.points, gp),
        rpg: avg(t.rebounds.total, gp),
        apg: avg(t.assists, gp),
        spg: avg(t.steals, gp),
        bpg: avg(t.blocks, gp),
        topg: avg(t.turnovers, gp),
        mpg: avg(t.minutesPlayed / 60, gp), // mins (not seconds) per game
        plusMinusAvg: avg(t.plusMinus, gp),
        fgPct: pct(t.fieldGoals.totalMade, t.fieldGoals.totalAttempted),
        twoPct: pct(t.fieldGoals.twoPoint.made, t.fieldGoals.twoPoint.attempted),
        threePct: pct(t.fieldGoals.threePoint.made, t.fieldGoals.threePoint.attempted),
        ftPct: pct(t.freeThrows.made, t.freeThrows.attempted)
    };
}

// gpAll: every game (used for score-related averages — score-only games still count here).
// gpFull: only fully-tracked games (used for detail stats so they aren't diluted).
function computeTeamAverages(t, gpAll, gpFull) {
    return {
        ppgScored:  avg(t.pointsScored, gpAll),
        ppgAllowed: avg(t.pointsAllowed, gpAll),
        netRating:  avg(t.pointsScored - t.pointsAllowed, gpAll),
        apg:        avg(t.assists, gpFull),
        rpg:        avg(t.rebounds.total, gpFull),
        spg:        avg(t.steals, gpFull),
        bpg:        avg(t.blocks, gpFull),
        topg:       avg(t.turnovers, gpFull),
        fgPct:      pct(t.fieldGoals.totalMade, t.fieldGoals.totalAttempted),
        twoPct:     pct(t.fieldGoals.twoPoint.made, t.fieldGoals.twoPoint.attempted),
        threePct:   pct(t.fieldGoals.threePoint.made, t.fieldGoals.threePoint.attempted),
        ftPct:      pct(t.freeThrows.made, t.freeThrows.attempted)
    };
}

// Recompute the full Season Stats doc.
// boxScores: array of completed box-score docs for this season.
// Returns the new doc shape (caller persists it).
function recomputeSeasonStats(seasonDoc, boxScores) {
    var leagueAbbr = (seasonDoc.league && seasonDoc.league.abbreviation) || 'Unknown';
    var seasonId = seasonDoc.id;

    // playerID → entry  (only includes players who actually played at least 1 game)
    var playerMap = {};
    // teamID → entry  (initialize from season.teams, so 0-game teams still appear)
    var teamMap = {};
    for (var ti = 0; ti < (seasonDoc.teams || []).length; ti++) {
        var t = seasonDoc.teams[ti];
        if (t.teamID) {
            teamMap[t.teamID] = {
                teamID: t.teamID,
                teamName: t.name,
                gamesPlayed: 0,        // every game (used for W/L + score averages)
                gamesWithFullStats: 0, // only fully-tracked games (used for detail averages)
                wins: 0,
                losses: 0,
                totals: emptyTeamTotals(),
                averages: null,
                gameLog: []
            };
        }
    }

    var processed = 0;

    for (var bi = 0; bi < boxScores.length; bi++) {
        var bs = boxScores[bi];
        if (!bs.teamInfo || !bs.teamInfo.home || !bs.teamInfo.away) continue;
        // Only count completed games
        var status = bs.gameInfo && bs.gameInfo.general && bs.gameInfo.general.status;
        if (status !== 'final') continue;
        processed++;

        // scoreOnly: this game's per-player stats and team detail aggregates are excluded
        // from the season totals. Only the score (W/L + points scored/allowed) counts.
        var isScoreOnly = bs.scoreOnly === true;

        var sides = ['home', 'away'];
        for (var si = 0; si < sides.length; si++) {
            var sideName = sides[si];
            var side = bs.teamInfo[sideName];
            var opp = bs.teamInfo[sideName === 'home' ? 'away' : 'home'];
            var teamID = sideName === 'home' ? bs.homeTeamID : bs.awayTeamID;

            // Per-team accumulate (always: at minimum the score counts)
            if (teamID && teamMap[teamID]) {
                var tEntry = teamMap[teamID];
                tEntry.gamesPlayed++;
                if (isScoreOnly) {
                    accumulateTeamScoreOnly(tEntry.totals, side, opp);
                } else {
                    tEntry.gamesWithFullStats++;
                    accumulateTeam(tEntry.totals, side, opp);
                }
                var winnerSide = bs.gameInfo && bs.gameInfo.state && bs.gameInfo.state.winner;
                if (winnerSide === sideName) tEntry.wins++;
                else if (winnerSide && winnerSide !== sideName) tEntry.losses++;
                tEntry.gameLog.push({
                    boxScoreID: bs.id,
                    date: bs.gameDate || (bs.gameInfo.general && bs.gameInfo.general.date),
                    opponent: opp.name,
                    result: winnerSide === sideName ? 'W' : (winnerSide ? 'L' : ''),
                    pointsScored: (side.score && side.score.current) || 0,
                    pointsAllowed: (opp.score && opp.score.current) || 0,
                    scoreOnly: isScoreOnly
                });
            }

            // Per-player accumulate — skip entirely for scoreOnly games (stats untrustworthy)
            if (isScoreOnly) continue;

            var inGame = (side.roster && side.roster.inGame) || [];
            for (var pi = 0; pi < inGame.length; pi++) {
                var p = inGame[pi];
                if (!p.playerID) continue;

                var pEntry = playerMap[p.playerID];
                if (!pEntry) {
                    pEntry = {
                        playerID: p.playerID,
                        name: p.name,
                        teamID: teamID || null,
                        teamName: side.name,
                        gamesPlayed: 0,
                        totals: emptyPlayerTotals(),
                        averages: null,
                        gameLog: []
                    };
                    playerMap[p.playerID] = pEntry;
                }
                pEntry.gamesPlayed++;
                accumulatePlayer(pEntry.totals, p);

                pEntry.gameLog.push({
                    boxScoreID: bs.id,
                    date: bs.gameDate || (bs.gameInfo.general && bs.gameInfo.general.date),
                    opponent: opp.name,
                    result: (bs.gameInfo && bs.gameInfo.state && bs.gameInfo.state.winner === sideName) ? 'W' : 'L',
                    points: (p.stats && p.stats.offense && p.stats.offense.points) || 0,
                    rebounds: (p.stats && p.stats.rebounds && p.stats.rebounds.total) || 0,
                    assists: (p.stats && p.stats.offense && p.stats.offense.assists) || 0,
                    minutesPlayed: (p.stats && p.stats.general && p.stats.general.minutesPlayed) || 0
                });
            }
        }
    }

    // Compute percentages on totals + averages
    for (var pid in playerMap) {
        var pe = playerMap[pid];
        pe.totals.fieldGoals.totalPercentage = pct(pe.totals.fieldGoals.totalMade, pe.totals.fieldGoals.totalAttempted);
        pe.totals.fieldGoals.twoPoint.percentage = pct(pe.totals.fieldGoals.twoPoint.made, pe.totals.fieldGoals.twoPoint.attempted);
        pe.totals.fieldGoals.threePoint.percentage = pct(pe.totals.fieldGoals.threePoint.made, pe.totals.fieldGoals.threePoint.attempted);
        pe.totals.freeThrows.percentage = pct(pe.totals.freeThrows.made, pe.totals.freeThrows.attempted);
        pe.averages = computePlayerAverages(pe.totals, pe.gamesPlayed);
    }
    for (var tid in teamMap) {
        var te = teamMap[tid];
        te.totals.fieldGoals.totalPercentage = pct(te.totals.fieldGoals.totalMade, te.totals.fieldGoals.totalAttempted);
        te.totals.fieldGoals.twoPoint.percentage = pct(te.totals.fieldGoals.twoPoint.made, te.totals.fieldGoals.twoPoint.attempted);
        te.totals.fieldGoals.threePoint.percentage = pct(te.totals.fieldGoals.threePoint.made, te.totals.fieldGoals.threePoint.attempted);
        te.totals.freeThrows.percentage = pct(te.totals.freeThrows.made, te.totals.freeThrows.attempted);
        te.averages = computeTeamAverages(te.totals, te.gamesPlayed, te.gamesWithFullStats);
    }

    var statsId = leagueAbbr + '.' +
        (seasonId.replace(new RegExp('^' + leagueAbbr + ' - '), '').replace(/[''`]/g, '').replace(/ - /g, '_').replace(/\s+/g, '_'));

    return {
        id: statsId,
        seasonID: seasonId,
        leagueID: leagueAbbr,
        lastUpdated: new Date().toISOString(),
        gamesProcessed: processed,
        players: Object.values(playerMap),
        teams: Object.values(teamMap)
    };
}

module.exports = {
    recomputeSeasonStats: recomputeSeasonStats
};
