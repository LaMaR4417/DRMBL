var { CosmosClient } = require("@azure/cosmos");

var client = new CosmosClient({
    endpoint: process.env.COSMOS_ENDPOINT,
    key: process.env.COSMOS_KEY,
});

var database = client.database("DRMBL Database");
var seasonsContainer = database.container("Seasons");
var teamsContainer = database.container("Teams");
var playersContainer = database.container("Players");
var boxScoresContainer = database.container("Box Scores");

var SEASON_ID = "L3X3 - Varonil Libre - 2026";

function asciiSlug(s) { return s.normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[''`"]/g, "").trim(); }
function teamSlug(name) { return asciiSlug(name).replace(/\s+/g, "_"); }
function seasonSlug(seasonId) {
    return seasonId.replace(/^L3X3 - /, "").replace(/[''`]/g, "").replace(/ - /g, "_").replace(/\s+/g, "_");
}
function mdyToISO(mdy, fallbackTs) {
    if (mdy) {
        var parts = mdy.split("/");
        if (parts.length === 3) {
            var m = parseInt(parts[0], 10), d = parseInt(parts[1], 10);
            var y = parts[2]; if (y.length === 2) y = "20" + y;
            return y + "-" + String(m).padStart(2, "0") + "-" + String(d).padStart(2, "0");
        }
    }
    if (fallbackTs) {
        var dt = new Date(fallbackTs);
        if (!isNaN(dt.getTime())) {
            var local = new Date(dt.getTime() - 6 * 60 * 60 * 1000);
            return local.getUTCFullYear() + "-" + String(local.getUTCMonth() + 1).padStart(2, "0") + "-" + String(local.getUTCDate()).padStart(2, "0");
        }
    }
    return null;
}
function makeBoxScoreID(seasonId, homeName, awayName, gameDate, suffix) {
    var base = ["L3X3", seasonSlug(seasonId), teamSlug(homeName) + "_vs_" + teamSlug(awayName), gameDate].join(".");
    return suffix ? base + "." + suffix : base;
}

async function persistJerseyNumbers(season, boxScore) {
    var seasonId = season.id;
    var leagueID = "L3X3";
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
                    playerDoc.teams.push({ name: teamName, teamID: teamID, seasonID: seasonId, leagueID: leagueID, jerseyNumbers: [num] });
                } else {
                    if (!Array.isArray(teamRef.jerseyNumbers)) teamRef.jerseyNumbers = [];
                    if (teamRef.jerseyNumbers.indexOf(num) === -1) teamRef.jerseyNumbers.push(num);
                }
                await playersContainer.items.upsert(playerDoc);
            } catch (e) { /* skip on miss */ }
        }
    }
}

module.exports = async function (req, res) {
    var action = req.query.action;

    // GET /api/l3x3?action=season
    if (req.method === "GET" && action === "season") {
        try {
            var { resource: season } = await seasonsContainer.item(SEASON_ID, SEASON_ID).read();
            if (!season) return res.status(404).json({ error: "Season not found" });
            return res.status(200).json(season);
        } catch (err) {
            console.error("L3X3 season fetch error:", err.message);
            return res.status(500).json({ error: "Failed to load season" });
        }
    }

    // GET /api/l3x3?action=team&id=...
    if (req.method === "GET" && action === "team") {
        var teamID = req.query.id;
        if (!teamID) return res.status(400).json({ error: "Missing team id" });
        try {
            var { resource: team } = await teamsContainer.item(teamID, teamID).read();
            if (!team) return res.status(404).json({ error: "Team not found" });
            return res.status(200).json(team);
        } catch (err) {
            console.error("L3X3 team fetch error:", err.message);
            return res.status(500).json({ error: "Failed to load team" });
        }
    }

    // POST /api/l3x3?action=save-game
    if (req.method === "POST" && action === "save-game") {
        var boxScore = req.body && req.body.boxScore;
        if (!boxScore) return res.status(400).json({ error: "Missing boxScore" });

        try {
            var { resource: season } = await seasonsContainer.item(SEASON_ID, SEASON_ID).read();
            if (!season) return res.status(404).json({ error: "Season not found" });

            var dateStr = boxScore.gameInfo && boxScore.gameInfo.general && boxScore.gameInfo.general.date;
            var ts = boxScore.gameInfo && boxScore.gameInfo.general && boxScore.gameInfo.general.timestamp;
            var gameDate = boxScore.gameDate || mdyToISO(dateStr, ts);
            var homeName = boxScore.team && boxScore.team.home;
            var awayName = boxScore.team && boxScore.team.away;

            if (!gameDate || !homeName || !awayName) {
                return res.status(400).json({ error: "Box score missing date or team names" });
            }

            // Generate id with collision retry
            var baseID = makeBoxScoreID(SEASON_ID, homeName, awayName, gameDate);
            var attempt = 1, candidateID = baseID;
            while (attempt < 20) {
                try {
                    await boxScoresContainer.item(candidateID, candidateID).read();
                    attempt++;
                    candidateID = baseID + ".g" + (attempt + 1);
                } catch (e) {
                    if (e.code === 404) break;
                    throw e;
                }
            }
            boxScore.id = candidateID;

            // Backfill fields that may not have been set client-side
            boxScore.gameDate = gameDate;
            boxScore.seasonID = SEASON_ID;
            boxScore.leagueID = "L3X3";
            boxScore.season = SEASON_ID;
            boxScore.type = "3x3";
            if (!boxScore.recorder) boxScore.recorder = "l3x3-live-tap-simple";

            await boxScoresContainer.items.upsert(boxScore);

            // Persist jersey numbers to player docs (best-effort)
            await persistJerseyNumbers(season, boxScore);

            return res.status(200).json({ success: true, id: boxScore.id });
        } catch (err) {
            console.error("L3X3 save-game error:", err.message);
            return res.status(500).json({ error: "Failed to save game" });
        }
    }

    return res.status(400).json({ error: "Invalid action" });
};
