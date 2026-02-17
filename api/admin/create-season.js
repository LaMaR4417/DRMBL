var { CosmosClient } = require("@azure/cosmos");

var client = new CosmosClient({
    endpoint: process.env.COSMOS_ENDPOINT,
    key: process.env.COSMOS_KEY
});

var database = client.database("DRMBL Database");
var seasonsContainer = database.container("Seasons");

// Generate slot letters: A, B, C, ... Z, AA, AB, etc.
function slotLetter(index) {
    var result = "";
    var n = index;
    do {
        result = String.fromCharCode(65 + (n % 26)) + result;
        n = Math.floor(n / 26) - 1;
    } while (n >= 0);
    return result;
}

// Parse time string like "8:00 AM" into minutes from midnight
function parseTime(timeStr) {
    var parts = timeStr.match(/(\d+):(\d+)\s*(AM|PM)/i);
    if (!parts) return 480; // default 8:00 AM
    var hours = parseInt(parts[1]);
    var minutes = parseInt(parts[2]);
    var period = parts[3].toUpperCase();
    if (period === "PM" && hours !== 12) hours += 12;
    if (period === "AM" && hours === 12) hours = 0;
    return hours * 60 + minutes;
}

// Format minutes from midnight into "H:MM AM/PM"
function formatTime(totalMinutes) {
    var hours = Math.floor(totalMinutes / 60);
    var minutes = totalMinutes % 60;
    var period = hours >= 12 ? "PM" : "AM";
    var displayHours = hours % 12;
    if (displayHours === 0) displayHours = 12;
    return displayHours + ":" + String(minutes).padStart(2, "0") + " " + period;
}

// Add days to a date object, return new { year, month, date }
function addDays(dateObj, days) {
    var d = new Date(dateObj.year, dateObj.month - 1, dateObj.date);
    d.setDate(d.getDate() + days);
    return { year: d.getFullYear(), month: d.getMonth() + 1, date: d.getDate() };
}

// Generate round-robin schedule for N teams over the given weeks
function generateRoundRobin(teamCount, regularWeeks, startDate, weekIntervalDays, gameStartTime, gameIntervalMinutes, breakWeeks, playoffs) {
    // Use circle method for round-robin
    // If odd number of teams, add a "BYE" phantom team
    var n = teamCount;
    var hasBye = n % 2 !== 0;
    if (hasBye) n++;

    var teams = [];
    for (var i = 0; i < n; i++) teams.push(slotLetter(i));

    // Generate all possible round-robin rounds
    var rounds = [];
    for (var round = 0; round < n - 1; round++) {
        var matchups = [];
        for (var j = 0; j < n / 2; j++) {
            var home = j === 0 ? teams[0] : teams[n - 1 - ((round + j - 1) % (n - 1))];
            var away = j === 0 ? teams[1 + ((round) % (n - 1))] : teams[1 + ((round + n - 2 - j) % (n - 1))];

            // Skip matchups involving the BYE team
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

        // Skip break weeks (advance date but don't add games)
        if (breakWeeks && breakWeeks.indexOf(weekNumber) !== -1) {
            currentDate = addDays(currentDate, weekIntervalDays);
            w--; // don't count this as a played week
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

    // Add playoff weeks if enabled
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

module.exports = async function (req, res) {
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

        var schedule = body.schedule || {};
        var regularWeeks = parseInt(schedule.regularWeeks) || (teamCount - 1); // default: full round-robin
        var weekIntervalDays = parseInt(schedule.weekIntervalDays) || 7;
        var gameStartTime = schedule.gameStartTime || "8:00 AM";
        var gameIntervalMinutes = parseInt(schedule.gameIntervalMinutes) || 60;
        var breakWeeks = schedule.breakWeeks || [];
        var playoffs = schedule.playoffs || { enabled: false };

        if (!body.timeline || !body.timeline.beginning) {
            return res.status(400).json({ error: "Missing timeline.beginning (start date)" });
        }

        // Generate season ID
        var year = body.timeline.beginning.year;
        var seasonID = body.name + " - " + body.division + " - " + year;

        // Generate team slots
        var teams = [];
        for (var i = 0; i < teamCount; i++) {
            teams.push({ slot: slotLetter(i), teamID: "", name: "" });
        }

        // Generate schedule
        var weeklySchedule = generateRoundRobin(
            teamCount, regularWeeks, body.timeline.beginning,
            weekIntervalDays, gameStartTime, gameIntervalMinutes,
            breakWeeks, playoffs
        );

        // Compute end date from last scheduled week if not provided
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
};
