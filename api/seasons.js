var { CosmosClient } = require("@azure/cosmos");

var client = new CosmosClient({
    endpoint: process.env.COSMOS_ENDPOINT,
    key: process.env.COSMOS_KEY
});

var seasonsContainer = client
    .database("DRMBL Database")
    .container("Seasons");

function parseTime(timeStr) {
    if (!timeStr) return 0;
    var match = timeStr.match(/^(\d+):(\d+)\s*(AM|PM)$/i);
    if (!match) return 0;
    var h = parseInt(match[1]);
    var m = parseInt(match[2]);
    var period = match[3].toUpperCase();
    if (period === "PM" && h !== 12) h += 12;
    if (period === "AM" && h === 12) h = 0;
    return h * 60 + m;
}

function sortGamesByDate(games) {
    if (!games || !Array.isArray(games)) return games;
    return games.slice().sort(function (a, b) {
        var ad = a.date || {};
        var bd = b.date || {};
        if ((ad.year || 0) !== (bd.year || 0)) return (ad.year || 0) - (bd.year || 0);
        if ((ad.month || 0) !== (bd.month || 0)) return (ad.month || 0) - (bd.month || 0);
        if ((ad.date || 0) !== (bd.date || 0)) return (ad.date || 0) - (bd.date || 0);
        return parseTime(a.time) - parseTime(b.time);
    });
}

module.exports = async function (req, res) {
    if (req.method !== "GET") {
        return res.status(405).json({ error: "Method not allowed" });
    }

    var league = req.query.league || null;

    try {
        // DRMBL mode: fetch active season via League doc
        if (league === 'drmbl') {
            var leaguesContainer = client
                .database("DRMBL Database")
                .container("Leagues");

            var { resources: drmblLeague } = await leaguesContainer.items
                .query("SELECT * FROM c WHERE c.id = 'DRMBL'")
                .fetchAll();

            if (!drmblLeague.length || !drmblLeague[0].league.activeSeason) {
                return res.status(404).json({ error: "No active DRMBL season found." });
            }

            var leagueDoc = drmblLeague[0];
            var activeSeasonId = leagueDoc.league.activeSeason;

            var seasonResponse = await seasonsContainer.item(activeSeasonId, activeSeasonId).read();
            var seasonDoc = seasonResponse.resource;

            if (!seasonDoc) {
                return res.status(404).json({ error: "Active season not found." });
            }

            return res.status(200).json({
                leagueInfo: leagueDoc.league,
                season: {
                    id: seasonDoc.id,
                    league: seasonDoc.league || null,
                    teams: seasonDoc.teams || [],
                    standings: seasonDoc.standings || [],
                    weeklySchedule: seasonDoc.weeklySchedule || null,
                    timeline: seasonDoc.timeline || null
                }
            });
        }

        // LOMBA mode: fetch active season docs via League doc
        if (league === 'lomba') {
            var leaguesContainer = client
                .database("DRMBL Database")
                .container("Leagues");

            var { resources: lombaLeague } = await leaguesContainer.items
                .query("SELECT * FROM c WHERE c.id = 'LOMBA'")
                .fetchAll();

            if (!lombaLeague.length || !lombaLeague[0].league.activeSeason) {
                return res.status(404).json({ error: "No active LOMBA season found." });
            }

            var lombaLeagueDoc = lombaLeague[0];
            var lombaActiveSeason = lombaLeagueDoc.league.activeSeason;

            var { resources: lombaSeasons } = await seasonsContainer.items
                .query("SELECT * FROM c WHERE STARTSWITH(c.id, 'LOMBA -') AND ENDSWITH(c.id, '" + lombaActiveSeason + "')")
                .fetchAll();

            var seasons = lombaSeasons.map(function (doc) {
                return {
                    id: doc.id,
                    league: doc.league || null,
                    teams: doc.teams || [],
                    schedule: doc.schedule || [],
                    playoffs: doc.playoffs || null,
                    timeline: doc.timeline || null
                };
            });

            return res.status(200).json({
                leagueInfo: lombaLeagueDoc.league,
                seasons: seasons
            });
        }

        // Copa Beta mode: return league info + all Copa Beta categories
        if (league === 'copa-beta') {
            var leaguesContainer = client
                .database("DRMBL Database")
                .container("Leagues");

            var { resources: leagueResources } = await leaguesContainer.items
                .query("SELECT * FROM c WHERE c.id = 'Copa Beta'")
                .fetchAll();

            var leagueInfo = null;
            if (leagueResources.length > 0) {
                leagueInfo = leagueResources[0].league || null;
            }

            var { resources: cbResources } = await seasonsContainer.items
                .query("SELECT * FROM c WHERE STARTSWITH(c.id, 'Copa Beta -')")
                .fetchAll();

            var categories = cbResources.map(function (doc) {
                return {
                    id: doc.id,
                    league: doc.league || null,
                    teams: doc.teams || [],
                    games: doc.games || [],
                    groups: doc.groups || null,
                    timeline: doc.timeline || null,
                    standings: doc.standings || []
                };
            });

            return res.status(200).json({ leagueInfo: leagueInfo, categories: categories });
        }

        // Default: list all seasons
        var { resources } = await seasonsContainer.items
            .query("SELECT c.id, c.league, c.teams, c.weeklySchedule, c.games, c.standings FROM c")
            .fetchAll();

        var seasons = resources.map(function (doc) {
            var teams = (doc.teams || []).filter(function (t) { return t.teamID; }).map(function (t) {
                return { name: t.name, slot: t.slot, teamID: t.teamID };
            });
            var dates = [];
            if (doc.weeklySchedule) {
                dates = doc.weeklySchedule.map(function (w) { return w.date || null; });
            } else if (doc.games) {
                var seen = {};
                for (var i = 0; i < doc.games.length; i++) {
                    var d = doc.games[i].date;
                    if (d) {
                        var key = d.year + "-" + d.month + "-" + d.date;
                        if (!seen[key]) {
                            seen[key] = true;
                            dates.push(d);
                        }
                    }
                }
            }
            return {
                id: doc.id,
                league: doc.league || null,
                teamCount: teams.length,
                teams: teams,
                dates: dates,
                standings: doc.standings || [],
                weeklySchedule: doc.weeklySchedule || null,
                games: sortGamesByDate(doc.games || null)
            };
        });

        return res.status(200).json({ seasons: seasons });

    } catch (err) {
        console.error("Seasons list error:", err.message);
        return res.status(500).json({ error: "Failed to load seasons." });
    }
};
