var { CosmosClient } = require("@azure/cosmos");

var client = new CosmosClient({
    endpoint: process.env.COSMOS_ENDPOINT,
    key: process.env.COSMOS_KEY
});

var database = client.database("DRMBL Database");
var teamsContainer = database.container("Teams");
var seasonsContainer = database.container("Seasons");

// ── Shared helpers ──────────────────────────────────────────

function sanitizeForID(str) {
    return str.replace(/[\/\\?#]/g, "");
}

function buildPlayerID(player) {
    if (!player.dob || !player.dob.year || !player.dob.month || !player.dob.date) {
        return player.name + " - unknown";
    }
    var mm = String(player.dob.month).padStart(2, "0");
    var dd = String(player.dob.date).padStart(2, "0");
    var yyyy = String(player.dob.year);
    return player.name + " - " + yyyy + mm + dd;
}

function buildEmptyPlayer() {
    return {
        playerID: "",
        name: "",
        dob: { year: null, month: null, date: null },
        phone: null,
        insuranceWaiver: { signed: false }
    };
}

function buildEmptyGame() {
    return {
        id: "",
        result: {
            winner: { team: "", score: null },
            loser: { team: "", score: null }
        }
    };
}

function slotLetter(index) {
    var result = "";
    var n = index;
    do {
        result = String.fromCharCode(65 + (n % 26)) + result;
        n = Math.floor(n / 26) - 1;
    } while (n >= 0);
    return result;
}

function parseTime(timeStr) {
    var parts = timeStr.match(/(\d+):(\d+)\s*(AM|PM)/i);
    if (!parts) return 480;
    var hours = parseInt(parts[1]);
    var minutes = parseInt(parts[2]);
    var period = parts[3].toUpperCase();
    if (period === "PM" && hours !== 12) hours += 12;
    if (period === "AM" && hours === 12) hours = 0;
    return hours * 60 + minutes;
}

function formatTime(totalMinutes) {
    var hours = Math.floor(totalMinutes / 60);
    var minutes = totalMinutes % 60;
    var period = hours >= 12 ? "PM" : "AM";
    var displayHours = hours % 12;
    if (displayHours === 0) displayHours = 12;
    return displayHours + ":" + String(minutes).padStart(2, "0") + " " + period;
}

function addDays(dateObj, days) {
    var d = new Date(dateObj.year, dateObj.month - 1, dateObj.date);
    d.setDate(d.getDate() + days);
    return { year: d.getFullYear(), month: d.getMonth() + 1, date: d.getDate() };
}

// ── Action: seasons (GET) ───────────────────────────────────

async function handleSeasons(req, res) {
    if (req.method !== "GET") {
        return res.status(405).json({ error: "Method not allowed" });
    }

    try {
        var query = "SELECT c.id, c.name, c.division, c.timeline, c.teams, c.maxRoster FROM c";
        var { resources } = await seasonsContainer.items.query(query).fetchAll();

        return res.status(200).json({ success: true, seasons: resources });
    } catch (err) {
        console.error("Failed to list seasons:", err.message);
        return res.status(500).json({ error: "Failed to load seasons." });
    }
}

// ── Action: team (GET) ──────────────────────────────────────

async function handleTeam(req, res) {
    if (req.method !== "GET") {
        return res.status(405).json({ error: "Method not allowed" });
    }

    var teamID = req.query.id;
    var seasonID = req.query.season;

    if (!teamID) {
        return res.status(400).json({ error: "Missing required query param: id" });
    }

    try {
        var response = await teamsContainer.item(teamID, teamID).read();
        var teamDoc = response.resource;

        if (!teamDoc) {
            return res.status(404).json({ error: "Team not found." });
        }

        if (seasonID && teamDoc.seasons) {
            var seasonEntry = null;
            for (var i = 0; i < teamDoc.seasons.length; i++) {
                if (teamDoc.seasons[i].id === seasonID) {
                    seasonEntry = teamDoc.seasons[i];
                    break;
                }
            }
            return res.status(200).json({
                success: true,
                team: {
                    id: teamDoc.id,
                    name: teamDoc.name,
                    owner: teamDoc.owner,
                    status: teamDoc.status,
                    season: seasonEntry
                }
            });
        }

        return res.status(200).json({ success: true, team: teamDoc });
    } catch (err) {
        console.error("Admin team fetch error:", err.message);
        return res.status(500).json({ error: "Failed to fetch team." });
    }
}

// ── Action: create-season (POST) ────────────────────────────

function generateRoundRobin(teamCount, regularWeeks, startDate, weekIntervalDays, gameStartTime, gameIntervalMinutes, breakWeeks, playoffs) {
    var n = teamCount;
    var hasBye = n % 2 !== 0;
    if (hasBye) n++;

    var teams = [];
    for (var i = 0; i < n; i++) teams.push(slotLetter(i));

    var rounds = [];
    for (var round = 0; round < n - 1; round++) {
        var matchups = [];
        for (var j = 0; j < n / 2; j++) {
            var home = j === 0 ? teams[0] : teams[n - 1 - ((round + j - 1) % (n - 1))];
            var away = j === 0 ? teams[1 + ((round) % (n - 1))] : teams[1 + ((round + n - 2 - j) % (n - 1))];

            if (hasBye && (home === slotLetter(n - 1) || away === slotLetter(n - 1))) continue;

            matchups.push({ away: away, home: home });
        }
        rounds.push(matchups);
    }

    var schedule = [];
    var weekNumber = 0;
    var currentDate = { year: startDate.year, month: startDate.month, date: startDate.date };
    var startMinutes = parseTime(gameStartTime);

    for (var w = 0; w < regularWeeks; w++) {
        weekNumber++;

        if (breakWeeks && breakWeeks.indexOf(weekNumber) !== -1) {
            currentDate = addDays(currentDate, weekIntervalDays);
            w--;
            continue;
        }

        var roundIndex = w % rounds.length;
        var matchups = rounds[roundIndex];

        var games = [];
        for (var g = 0; g < matchups.length; g++) {
            games.push({
                time: formatTime(startMinutes + g * gameIntervalMinutes),
                away: matchups[g].away,
                home: matchups[g].home
            });
        }

        schedule.push({
            week: weekNumber,
            date: { year: currentDate.year, month: currentDate.month, date: currentDate.date },
            games: games
        });

        currentDate = addDays(currentDate, weekIntervalDays);
    }

    if (playoffs && playoffs.enabled && playoffs.rounds && playoffs.rounds.length > 0) {
        var playoffWeekNumber = weekNumber + 1;
        var playoffDate = playoffs.date
            ? { year: playoffs.date.year, month: playoffs.date.month, date: playoffs.date.date }
            : currentDate;

        var playoffGames = [];
        var gameTime = startMinutes;

        for (var p = 0; p < playoffs.rounds.length; p++) {
            var round = playoffs.rounds[p];
            var game = {
                time: formatTime(gameTime),
                away: round.away || ("Seed " + (p + 1)),
                home: round.home || ("Seed " + (playoffs.rounds.length - p)),
                round: round.name || round
            };
            playoffGames.push(game);
            gameTime += gameIntervalMinutes;
        }

        schedule.push({
            week: playoffWeekNumber,
            type: "playoffs",
            date: { year: playoffDate.year, month: playoffDate.month, date: playoffDate.date },
            games: playoffGames
        });
    }

    return schedule;
}

async function handleCreateSeason(req, res) {
    if (req.method !== "POST") {
        return res.status(405).json({ error: "Method not allowed" });
    }

    try {
        var body = req.body;

        if (!body || !body.name || !body.division || !body.teamCount) {
            return res.status(400).json({ error: "Missing required fields: name, division, teamCount" });
        }

        var teamCount = parseInt(body.teamCount);
        if (teamCount < 2 || teamCount > 26) {
            return res.status(400).json({ error: "Team count must be between 2 and 26" });
        }

        var maxRoster = parseInt(body.maxRoster) || 12;
        if (maxRoster < 1 || maxRoster > 30) {
            return res.status(400).json({ error: "Max roster must be between 1 and 30" });
        }

        var schedule = body.schedule || {};
        var regularWeeks = parseInt(schedule.regularWeeks) || (teamCount - 1);
        var weekIntervalDays = parseInt(schedule.weekIntervalDays) || 7;
        var gameStartTime = schedule.gameStartTime || "8:00 AM";
        var gameIntervalMinutes = parseInt(schedule.gameIntervalMinutes) || 60;
        var breakWeeks = schedule.breakWeeks || [];
        var playoffs = schedule.playoffs || { enabled: false };

        if (!body.timeline || !body.timeline.beginning) {
            return res.status(400).json({ error: "Missing timeline.beginning (start date)" });
        }

        var year = body.timeline.beginning.year;
        var seasonID = body.name + " - " + body.division + " - " + year;

        var teams = [];
        for (var i = 0; i < teamCount; i++) {
            teams.push({ slot: slotLetter(i), teamID: "", name: "" });
        }

        var weeklySchedule = generateRoundRobin(
            teamCount, regularWeeks, body.timeline.beginning,
            weekIntervalDays, gameStartTime, gameIntervalMinutes,
            breakWeeks, playoffs
        );

        var timeline = {
            beginning: body.timeline.beginning,
            end: body.timeline.end || (weeklySchedule.length > 0
                ? weeklySchedule[weeklySchedule.length - 1].date
                : body.timeline.beginning)
        };

        var seasonDoc = {
            id: seasonID,
            division: body.division,
            name: body.name,
            maxRoster: maxRoster,
            timeline: timeline,
            teams: teams,
            weeklySchedule: weeklySchedule
        };

        await seasonsContainer.items.create(seasonDoc);

        return res.status(200).json({ success: true, id: seasonID, teamCount: teamCount, weeks: weeklySchedule.length });
    } catch (err) {
        console.error("Create season error:", err.message);

        if (err.code === 409) {
            return res.status(409).json({ error: "A season with this ID already exists." });
        }

        return res.status(500).json({ error: "Failed to create season." });
    }
}

// ── Action: add-team (POST) ─────────────────────────────────

function buildTeamDoc(body, teamSlot, seasonID, regularGameCount, playoffRoundCount, maxRoster) {
    var teamID = sanitizeForID(body.teamName) + " - " + sanitizeForID(body.owner.name);

    var roster = [];
    if (body.players && body.players.length > 0) {
        for (var i = 0; i < body.players.length; i++) {
            var p = body.players[i];
            if (!p.name || !p.name.trim()) continue;
            roster.push({
                playerID: buildPlayerID(p),
                name: p.name.trim(),
                dob: {
                    year: (p.dob && p.dob.year) ? p.dob.year : null,
                    month: (p.dob && p.dob.month) ? p.dob.month : null,
                    date: (p.dob && p.dob.date) ? p.dob.date : null
                },
                phone: p.phone || null,
                insuranceWaiver: { signed: p.waiverSigned || false }
            });
        }
    }
    var rosterSize = maxRoster || 12;
    while (roster.length < rosterSize) {
        roster.push(buildEmptyPlayer());
    }

    var games = [];
    for (var g = 0; g < regularGameCount; g++) {
        games.push(buildEmptyGame());
    }

    var playoffs = [];
    for (var pf = 0; pf < playoffRoundCount; pf++) {
        playoffs.push(buildEmptyGame());
    }

    return {
        id: teamID,
        name: body.teamName,
        owner: {
            name: body.owner.name || "",
            phone: body.owner.phone || "",
            email: body.owner.email || ""
        },
        status: {
            registered: true,
            active: false,
            inactive: false,
            disbanded: false
        },
        seasons: [{
            id: seasonID,
            teamSlot: teamSlot,
            roster: roster,
            record: {
                rank: null,
                wins: null,
                losses: null,
                pointDifferential: null,
                games: games,
                playoffs: playoffs
            }
        }]
    };
}

async function handleAddTeam(req, res) {
    if (req.method !== "POST") {
        return res.status(405).json({ error: "Method not allowed" });
    }

    try {
        var body = req.body;

        if (!body || !body.seasonId || !body.teamName || !body.owner || !body.owner.name) {
            return res.status(400).json({ error: "Missing required fields: seasonId, teamName, owner.name" });
        }

        var seasonResponse = await seasonsContainer.item(body.seasonId, body.seasonId).read();
        var seasonDoc = seasonResponse.resource;
        var seasonEtag = seasonResponse.etag;

        if (!seasonDoc || !seasonDoc.teams || !Array.isArray(seasonDoc.teams)) {
            return res.status(404).json({ error: "Season not found or malformed." });
        }

        var regularGameCount = 0;
        var playoffRoundCount = 0;
        if (seasonDoc.weeklySchedule) {
            for (var w = 0; w < seasonDoc.weeklySchedule.length; w++) {
                if (seasonDoc.weeklySchedule[w].type === "playoffs") {
                    playoffRoundCount = seasonDoc.weeklySchedule[w].games ? seasonDoc.weeklySchedule[w].games.length : 0;
                } else {
                    regularGameCount++;
                }
            }
        }

        var targetSlot = null;
        var targetIndex = -1;

        if (body.slot) {
            for (var i = 0; i < seasonDoc.teams.length; i++) {
                if (seasonDoc.teams[i].slot === body.slot) {
                    if (seasonDoc.teams[i].teamID && !body.force) {
                        return res.status(409).json({ error: "Slot " + body.slot + " is already taken by " + seasonDoc.teams[i].name });
                    }
                    targetSlot = body.slot;
                    targetIndex = i;
                    break;
                }
            }
            if (targetIndex === -1) {
                return res.status(400).json({ error: "Slot " + body.slot + " does not exist in this season." });
            }
        } else {
            for (var i = 0; i < seasonDoc.teams.length; i++) {
                if (!seasonDoc.teams[i].teamID) {
                    targetSlot = seasonDoc.teams[i].slot;
                    targetIndex = i;
                    break;
                }
            }
            if (targetSlot === null) {
                return res.status(409).json({ error: "All slots are full. No open slots available." });
            }
        }

        var maxRoster = seasonDoc.maxRoster || 12;
        var teamDoc = buildTeamDoc(body, targetSlot, body.seasonId, regularGameCount, playoffRoundCount, maxRoster);
        var teamID = teamDoc.id;
        await teamsContainer.items.create(teamDoc);

        seasonDoc.teams[targetIndex].teamID = teamID;
        seasonDoc.teams[targetIndex].name = body.teamName;

        try {
            var replaceOptions = {
                accessCondition: { type: "IfMatch", condition: seasonEtag }
            };
            await seasonsContainer.item(body.seasonId, body.seasonId).replace(seasonDoc, replaceOptions);
        } catch (conflictErr) {
            if (conflictErr.code === 412) {
                try {
                    await teamsContainer.item(teamID, teamID).delete();
                } catch (cleanupErr) {
                    console.error("Orphan team cleanup failed:", cleanupErr.message);
                }
                return res.status(409).json({ error: "Concurrent modification detected. Please try again." });
            }
            throw conflictErr;
        }

        return res.status(200).json({ success: true, teamID: teamID, slot: targetSlot });
    } catch (err) {
        console.error("Add team error:", err.message);

        if (err.code === 409) {
            return res.status(409).json({ error: "A team with this name and owner already exists." });
        }

        return res.status(500).json({ error: "Failed to add team." });
    }
}

// ── Action: edit-team (POST) ────────────────────────────────

async function handleEditTeam(req, res) {
    if (req.method !== "POST") {
        return res.status(405).json({ error: "Method not allowed" });
    }

    try {
        var body = req.body;

        if (!body || !body.teamId || !body.seasonId) {
            return res.status(400).json({ error: "Missing required fields: teamId, seasonId" });
        }

        var teamResponse = await teamsContainer.item(body.teamId, body.teamId).read();
        var teamDoc = teamResponse.resource;

        if (!teamDoc) {
            return res.status(404).json({ error: "Team not found." });
        }

        var seasonIndex = -1;
        for (var i = 0; i < teamDoc.seasons.length; i++) {
            if (teamDoc.seasons[i].id === body.seasonId) {
                seasonIndex = i;
                break;
            }
        }

        if (seasonIndex === -1) {
            return res.status(404).json({ error: "Season entry not found on this team." });
        }

        var maxRoster = 12;
        try {
            var seasonResponse = await seasonsContainer.item(body.seasonId, body.seasonId).read();
            if (seasonResponse.resource && seasonResponse.resource.maxRoster) {
                maxRoster = seasonResponse.resource.maxRoster;
            }
        } catch (e) {
            // fallback to 12
        }

        if (body.owner) {
            if (body.owner.name) teamDoc.owner.name = body.owner.name;
            if (body.owner.phone !== undefined) teamDoc.owner.phone = body.owner.phone;
            if (body.owner.email !== undefined) teamDoc.owner.email = body.owner.email;
        }

        if (body.teamName) {
            teamDoc.name = body.teamName;
        }

        if (body.players && Array.isArray(body.players)) {
            var roster = [];
            for (var p = 0; p < body.players.length; p++) {
                var player = body.players[p];
                if (!player.name || !player.name.trim()) continue;
                roster.push({
                    playerID: buildPlayerID(player),
                    name: player.name.trim(),
                    dob: {
                        year: (player.dob && player.dob.year) ? player.dob.year : null,
                        month: (player.dob && player.dob.month) ? player.dob.month : null,
                        date: (player.dob && player.dob.date) ? player.dob.date : null
                    },
                    phone: player.phone || null,
                    insuranceWaiver: { signed: player.waiverSigned || false }
                });
            }
            while (roster.length < maxRoster) {
                roster.push(buildEmptyPlayer());
            }
            teamDoc.seasons[seasonIndex].roster = roster;
        }

        await teamsContainer.item(body.teamId, body.teamId).replace(teamDoc);

        if (body.teamName) {
            try {
                var seasonResp = await seasonsContainer.item(body.seasonId, body.seasonId).read();
                var seasonDoc = seasonResp.resource;
                if (seasonDoc && seasonDoc.teams) {
                    for (var t = 0; t < seasonDoc.teams.length; t++) {
                        if (seasonDoc.teams[t].teamID === body.teamId) {
                            seasonDoc.teams[t].name = body.teamName;
                            await seasonsContainer.item(body.seasonId, body.seasonId).replace(seasonDoc);
                            break;
                        }
                    }
                }
            } catch (syncErr) {
                console.error("Season name sync failed (team was updated):", syncErr.message);
            }
        }

        return res.status(200).json({ success: true, teamID: body.teamId });
    } catch (err) {
        console.error("Edit team error:", err.message);
        return res.status(500).json({ error: "Failed to update team." });
    }
}

// ── Action: update-season (POST) ────────────────────────────

async function handleUpdateSeason(req, res) {
    if (req.method !== "POST") {
        return res.status(405).json({ error: "Method not allowed" });
    }

    try {
        var body = req.body;

        if (!body || !body.seasonId) {
            return res.status(400).json({ error: "Missing required field: seasonId" });
        }

        var response = await seasonsContainer.item(body.seasonId, body.seasonId).read();
        var seasonDoc = response.resource;

        if (!seasonDoc) {
            return res.status(404).json({ error: "Season not found." });
        }

        var updated = [];

        if (body.maxRoster !== undefined) {
            var maxRoster = parseInt(body.maxRoster);
            if (maxRoster < 1 || maxRoster > 30) {
                return res.status(400).json({ error: "maxRoster must be between 1 and 30" });
            }
            seasonDoc.maxRoster = maxRoster;
            updated.push("maxRoster=" + maxRoster);
        }

        if (body.name !== undefined) {
            seasonDoc.name = body.name;
            updated.push("name=" + body.name);
        }

        if (body.division !== undefined) {
            seasonDoc.division = body.division;
            updated.push("division=" + body.division);
        }

        if (updated.length === 0) {
            return res.status(400).json({ error: "No valid fields to update. Supported: maxRoster, name, division" });
        }

        await seasonsContainer.item(body.seasonId, body.seasonId).replace(seasonDoc);

        return res.status(200).json({ success: true, seasonId: body.seasonId, updated: updated });
    } catch (err) {
        console.error("Update season error:", err.message);
        return res.status(500).json({ error: "Failed to update season." });
    }
}

// ── Router ──────────────────────────────────────────────────

module.exports = async function (req, res) {
    var action = req.query.action;

    if (!action) {
        return res.status(400).json({ error: "Missing required query param: action" });
    }

    switch (action) {
        case "seasons":       return handleSeasons(req, res);
        case "team":          return handleTeam(req, res);
        case "create-season": return handleCreateSeason(req, res);
        case "add-team":      return handleAddTeam(req, res);
        case "edit-team":     return handleEditTeam(req, res);
        case "update-season": return handleUpdateSeason(req, res);
        default:
            return res.status(400).json({ error: "Unknown action: " + action });
    }
};
