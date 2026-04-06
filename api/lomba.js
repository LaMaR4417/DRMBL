var { CosmosClient } = require("@azure/cosmos");

var client = new CosmosClient({
    endpoint: process.env.COSMOS_ENDPOINT,
    key: process.env.COSMOS_KEY
});

var database = client.database("DRMBL Database");
var leaguesContainer = database.container("Leagues");
var seasonsContainer = database.container("Seasons");
var boxScoresContainer = database.container("Box Scores");

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

            return res.status(200).json({ success: true, id: boxScore.id });
        } catch (err) {
            console.error("LOMBA save game error:", err.message);
            return res.status(500).json({ error: "Failed to save game" });
        }
    }

    return res.status(400).json({ error: "Invalid action" });
};
