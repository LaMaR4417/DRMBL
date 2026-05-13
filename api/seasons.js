var { CosmosClient } = require("@azure/cosmos");

var client = new CosmosClient({
    endpoint: process.env.COSMOS_ENDPOINT,
    key: process.env.COSMOS_KEY
});

var seasonsContainer = client
    .database("DRMBL Database")
    .container("Seasons");

var teamsContainer = client
    .database("DRMBL Database")
    .container("Teams");

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

    // ── Team lookup: ?type=team&id=...&season=... ──
    if (req.query.type === "team") {
        var teamID = req.query.id;
        var seasonID = req.query.season;
        if (!teamID || !seasonID) {
            return res.status(400).json({ error: "Missing team id or season parameter." });
        }
        try {
            var teamResponse = await teamsContainer.item(teamID, teamID).read();
            var teamDoc = teamResponse.resource;
            if (!teamDoc) {
                return res.status(404).json({ error: "Team not found." });
            }
            var seasonEntry = null;
            for (var i = 0; i < (teamDoc.seasons || []).length; i++) {
                if (teamDoc.seasons[i].id === seasonID) {
                    seasonEntry = teamDoc.seasons[i];
                    break;
                }
            }
            if (!seasonEntry) {
                return res.status(404).json({ error: "Team not found in current season." });
            }
            var roster = [];
            for (var j = 0; j < (seasonEntry.roster || []).length; j++) {
                var p = seasonEntry.roster[j];
                if (p.name) {
                    roster.push({ playerID: p.playerID, name: p.name });
                }
            }
            return res.status(200).json({
                id: teamDoc.id,
                name: teamDoc.name,
                roster: roster
            });
        } catch (err) {
            console.error("Team fetch error:", err.message);
            return res.status(500).json({ error: "Failed to load team data." });
        }
    }

    // ── Single-season lookup: ?id=<seasonId> (no type=team) ──
    if (req.query.id) {
        try {
            var seasonId = req.query.id;
            var response = await seasonsContainer.item(seasonId, seasonId).read();
            var seasonDoc = response.resource;
            if (!seasonDoc) {
                return res.status(404).json({ error: "Season not found." });
            }
            return res.status(200).json({
                id: seasonDoc.id,
                league: seasonDoc.league || null,
                teams: seasonDoc.teams,
                weeklySchedule: seasonDoc.weeklySchedule || null,
                games: seasonDoc.games || null,
                groups: seasonDoc.groups || null
            });
        } catch (err) {
            console.error("Season fetch error:", err.message);
            return res.status(500).json({ error: "Failed to load season data." });
        }
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

            if (!drmblLeague.length || !drmblLeague[0].league.activeSeasons || !drmblLeague[0].league.activeSeasons.length) {
                return res.status(404).json({ error: "No active DRMBL season found." });
            }

            var leagueDoc = drmblLeague[0];
            // DRMBL has one division currently — use the first active season ID
            var activeSeasonId = leagueDoc.league.activeSeasons[0];

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

            if (!lombaLeague.length || !lombaLeague[0].league.activeSeasons || !lombaLeague[0].league.activeSeasons.length) {
                return res.status(404).json({ error: "No active LOMBA season found." });
            }

            var lombaLeagueDoc = lombaLeague[0];
            // LOMBA may have multiple active seasons (one per division). Fetch each by direct ID.
            var lombaActiveIds = lombaLeagueDoc.league.activeSeasons;

            var lombaFetches = lombaActiveIds.map(function (id) {
                return seasonsContainer.item(id, id).read()
                    .then(function (r) { return r.resource; })
                    .catch(function () { return null; });
            });
            var lombaSeasons = (await Promise.all(lombaFetches)).filter(function (d) { return d != null; });

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

            // Copa Beta also uses activeSeasons[] — fetch each active doc by direct ID
            var cbResources = [];
            if (leagueInfo && leagueInfo.activeSeasons && leagueInfo.activeSeasons.length) {
                var cbFetches = leagueInfo.activeSeasons.map(function (id) {
                    return seasonsContainer.item(id, id).read()
                        .then(function (r) { return r.resource; })
                        .catch(function () { return null; });
                });
                cbResources = (await Promise.all(cbFetches)).filter(function (d) { return d != null; });
            }

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
