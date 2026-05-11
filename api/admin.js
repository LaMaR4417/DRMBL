var { CosmosClient } = require("@azure/cosmos");
var { recomputeSeasonStats } = require("./_lib/seasonStats");

var client = new CosmosClient({
    endpoint: process.env.COSMOS_ENDPOINT,
    key: process.env.COSMOS_KEY
});

var db = client.database("DRMBL Database");
var playersContainer = db.container("Players");
var teamsContainer = db.container("Teams");
var seasonsContainer = db.container("Seasons");
var leaguesContainer = db.container("Leagues");
var boxScoresContainer = db.container("Box Scores");
var seasonStatsContainer = db.container("Season Stats");

function normalizeName(name) {
    return name
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .replace(/[^A-Za-z0-9]+/g, "_")
        .replace(/^_+|_+$/g, "");
}

function buildPlayerDoc(name, id, teamName, teamID, seasonID, leagueID) {
    return {
        id: id,
        name: name,
        uniqueNumber: null,
        bio: {
            position: { primary: "", secondary: [] },
            weight: { lbs: null, kg: null },
            height: { feet: null, inches: null, cm: null },
            dob: { date: null, month: null, year: null, iso: null }
        },
        teams: [{ name: teamName, teamID: teamID, seasonID: seasonID, leagueID: leagueID, jerseyNumbers: [] }],
        statProfileID: id,
        games: []
    };
}

module.exports = async function (req, res) {
    var action = req.query.action;

    try {
        if (req.method === "GET" && action === "leagues") {
            var { resources: leagues } = await leaguesContainer.items.query("SELECT * FROM c").fetchAll();
            return res.status(200).json({ leagues: leagues });
        }

        if (req.method === "GET" && action === "teams") {
            var league = req.query.league;
            if (!league) return res.status(400).json({ error: "Missing league" });

            var { resource: leagueDoc } = await leaguesContainer.item(league, league).read();
            if (!leagueDoc) return res.status(404).json({ error: "League not found" });

            var activeSeasons = leagueDoc.league.activeSeasons;
            if (!activeSeasons || !activeSeasons.length) return res.status(404).json({ error: "No active season" });

            // Fetch each active season doc by direct ID. Works for single-season (DRMBL)
            // and multi-season (LOMBA, Copa Beta) leagues uniformly.
            var seasonFetches = activeSeasons.map(function (id) {
                return seasonsContainer.item(id, id).read()
                    .then(function (r) { return r.resource; })
                    .catch(function () { return null; });
            });
            var seasons = (await Promise.all(seasonFetches)).filter(function (d) { return d != null; });

            var teams = [];
            for (var i = 0; i < seasons.length; i++) {
                var s = seasons[i];
                var sTeams = s.teams || [];
                for (var j = 0; j < sTeams.length; j++) {
                    teams.push({
                        teamID: sTeams[j].teamID,
                        name: sTeams[j].name,
                        slot: sTeams[j].slot,
                        seasonID: s.id
                    });
                }
            }
            return res.status(200).json({ teams: teams });
        }

        if (req.method === "GET" && action === "team") {
            var teamID = req.query.id;
            if (!teamID) return res.status(400).json({ error: "Missing team id" });
            var { resource: team } = await teamsContainer.item(teamID, teamID).read();
            if (!team) return res.status(404).json({ error: "Team not found" });
            return res.status(200).json(team);
        }

        if (req.method === "GET" && action === "player") {
            var pid = req.query.id;
            if (!pid) return res.status(400).json({ error: "Missing player id" });
            var { resource: player } = await playersContainer.item(pid, pid).read();
            if (!player) return res.status(404).json({ error: "Player not found" });
            return res.status(200).json(player);
        }

        if (req.method === "POST" && action === "add-player") {
            var data = req.body;
            if (!data.name || !data.teamID) {
                return res.status(400).json({ error: "Missing name or teamID" });
            }

            var { resource: teamDoc } = await teamsContainer.item(data.teamID, data.teamID).read();
            if (!teamDoc) return res.status(404).json({ error: "Team not found" });

            var seasonID = teamDoc.seasons[0].id;
            var teamName = teamDoc.name;
            var leagueID = data.teamID.split(".")[0];

            // Determine next available uniqueNumber globally
            var { resources: allPlayers } = await playersContainer.items
                .query("SELECT c.uniqueNumber FROM c WHERE IS_NUMBER(c.uniqueNumber)")
                .fetchAll();
            var maxUnique = 0;
            for (var up = 0; up < allPlayers.length; up++) {
                if (allPlayers[up].uniqueNumber > maxUnique) maxUnique = allPlayers[up].uniqueNumber;
            }
            var newUniqueNumber = maxUnique + 1;

            var normalized = normalizeName(data.name);
            var playerID = normalized + "$" + newUniqueNumber;

            var playerDoc = buildPlayerDoc(data.name, playerID, teamName, data.teamID, seasonID, leagueID);
            playerDoc.uniqueNumber = newUniqueNumber;
            if (data.jerseyNumber != null && !isNaN(parseInt(data.jerseyNumber))) {
                playerDoc.teams[0].jerseyNumbers = [parseInt(data.jerseyNumber)];
            }
            await playersContainer.items.upsert(playerDoc);

            teamDoc.seasons[0].roster.push({ name: data.name, playerID: playerID });
            await teamsContainer.items.upsert(teamDoc);

            return res.status(200).json({ player: playerDoc });
        }

        if (req.method === "POST" && action === "update-player") {
            var pdata = req.body;
            if (!pdata.id) return res.status(400).json({ error: "Missing player id" });

            var { resource: existingPlayer } = await playersContainer.item(pdata.id, pdata.id).read();
            if (!existingPlayer) return res.status(404).json({ error: "Player not found" });

            if (pdata.name !== undefined) existingPlayer.name = pdata.name;
            if (pdata.uniqueNumber !== undefined) existingPlayer.uniqueNumber = pdata.uniqueNumber;
            if (pdata.bio !== undefined) existingPlayer.bio = pdata.bio;
            if (pdata.teams !== undefined) existingPlayer.teams = pdata.teams;

            // Team-specific jerseyNumbers update (array)
            if (pdata.jerseyNumbers !== undefined && pdata.teamID) {
                var teamsArr = existingPlayer.teams || [];
                for (var ti = 0; ti < teamsArr.length; ti++) {
                    if (teamsArr[ti].teamID === pdata.teamID) {
                        teamsArr[ti].jerseyNumbers = Array.isArray(pdata.jerseyNumbers) ? pdata.jerseyNumbers : [];
                    }
                }
            }

            await playersContainer.items.upsert(existingPlayer);

            if (pdata.name !== undefined && existingPlayer.teams) {
                for (var t = 0; t < existingPlayer.teams.length; t++) {
                    var teamRef = existingPlayer.teams[t];
                    try {
                        var { resource: tDoc } = await teamsContainer.item(teamRef.teamID, teamRef.teamID).read();
                        if (tDoc && tDoc.seasons) {
                            for (var s2 = 0; s2 < tDoc.seasons.length; s2++) {
                                var roster = tDoc.seasons[s2].roster || [];
                                for (var r = 0; r < roster.length; r++) {
                                    if (roster[r].playerID === pdata.id) {
                                        roster[r].name = pdata.name;
                                    }
                                }
                            }
                            await teamsContainer.items.upsert(tDoc);
                        }
                    } catch (e) { /* skip */ }
                }
            }

            return res.status(200).json({ player: existingPlayer });
        }

        if (req.method === "POST" && action === "delete-player") {
            var ddata = req.body;
            if (!ddata.id) return res.status(400).json({ error: "Missing player id" });

            var { resource: delPlayer } = await playersContainer.item(ddata.id, ddata.id).read();
            if (!delPlayer) return res.status(404).json({ error: "Player not found" });

            if (delPlayer.teams) {
                for (var dt = 0; dt < delPlayer.teams.length; dt++) {
                    var dtRef = delPlayer.teams[dt];
                    try {
                        var { resource: dtDoc } = await teamsContainer.item(dtRef.teamID, dtRef.teamID).read();
                        if (dtDoc && dtDoc.seasons) {
                            for (var ds = 0; ds < dtDoc.seasons.length; ds++) {
                                dtDoc.seasons[ds].roster = (dtDoc.seasons[ds].roster || []).filter(function (rp) {
                                    return rp.playerID !== ddata.id;
                                });
                            }
                            await teamsContainer.items.upsert(dtDoc);
                        }
                    } catch (e) { /* skip */ }
                }
            }

            await playersContainer.item(ddata.id, ddata.id).delete();
            return res.status(200).json({ success: true });
        }

        if (req.method === "POST" && action === "delete-box-score") {
            var bsData = req.body;
            if (!bsData || !bsData.id) return res.status(400).json({ error: "Missing box score id" });
            try {
                await boxScoresContainer.item(bsData.id, bsData.id).delete();
                return res.status(200).json({ success: true, id: bsData.id });
            } catch (err) {
                if (err.code === 404) return res.status(404).json({ error: "Box score not found" });
                throw err;
            }
        }

        if (req.method === "POST" && action === "recompute-season-stats") {
            var rsData = req.body;
            if (!rsData || !rsData.seasonId) return res.status(400).json({ error: "Missing seasonId" });

            var { resource: seasonDoc } = await seasonsContainer.item(rsData.seasonId, rsData.seasonId).read();
            if (!seasonDoc) return res.status(404).json({ error: "Season not found" });

            var { resources: seasonBoxScores } = await boxScoresContainer.items
                .query({
                    query: "SELECT * FROM c WHERE c.seasonID = @s OR c.season = @s",
                    parameters: [{ name: "@s", value: rsData.seasonId }]
                })
                .fetchAll();

            var statsDoc = recomputeSeasonStats(seasonDoc, seasonBoxScores);
            await seasonStatsContainer.items.upsert(statsDoc);

            return res.status(200).json({
                success: true,
                seasonId: rsData.seasonId,
                gamesProcessed: statsDoc.gamesProcessed,
                playerCount: (statsDoc.players || []).length,
                teamCount: (statsDoc.teams || []).length
            });
        }

        return res.status(400).json({ error: "Invalid action" });

    } catch (err) {
        console.error("Admin API error:", err.message);
        return res.status(500).json({ error: err.message });
    }
};
