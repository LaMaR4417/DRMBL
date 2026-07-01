// 3-Point Contest recorder API.
//
// Single-elimination shootout where the pairings are RE-RANDOMIZED each round
// (not a fixed bracket tree). Individual shooters face off head-to-head; the
// higher score advances; the field halves each round until one champion.
//
// Byes (when a round has an odd number of players):
//   - Round 1: a RANDOM player gets the bye.
//   - Later rounds: the player with the HIGHEST score in the round just
//     completed gets the bye and auto-advances.
//
// Data:
//   Registration Forms  — sign-ups (source of the entrant pool). Walk-ins are
//                         added here on the fly via ?action=add-walkin.
//   Seasons             — the division doc "DRMBL - 3-Point Contest - Spring 2026"
//                         holds `entrants` + the live `bracket` state.
//
// Actions (query param ?action=):
//   GET  signups   -> list contest sign-ups (Registration Forms)
//   GET  state     -> the division doc (entrants + bracket + prizePool + status)
//   POST add-walkin-> body {playerName, teamName}; create a walk-in sign-up
//   POST start     -> body {entrants:[{playerName,teamName,paid?}]}; set entrants,
//                     draw round 1, status "in-progress"
//   POST save-match-> body {round, matchupId, scoreA, scoreB}; record result,
//                     advance the round / draw the next / crown the champion
//   POST reset     -> clear entrants + bracket back to an open shell

var { CosmosClient } = require("@azure/cosmos");

var client = new CosmosClient({
    endpoint: process.env.COSMOS_ENDPOINT,
    key: process.env.COSMOS_KEY
});

var db = client.database("DRMBL Database");
var regForms = db.container("Registration Forms");
var seasons = db.container("Seasons");

var CONTEST_LEAGUE_ID = "DRMBL 3PT Contest";
var CONTEST_EVENT_NAME = "DRMBL 3-Point Contest";
var DIVISION_DOC_ID = "DRMBL - 3-Point Contest - Spring 2026";
var ENTRY_FEE = 5;

// ── helpers ───────────────────────────────────────────────────────────────

function slugSegment(s) {
    return String(s || "")
        .replace(/ñ/g, "n").replace(/Ñ/g, "N")
        .replace(/á/g, "a").replace(/é/g, "e").replace(/í/g, "i").replace(/ó/g, "o").replace(/ú/g, "u")
        .replace(/Á/g, "A").replace(/É/g, "E").replace(/Í/g, "I").replace(/Ó/g, "O").replace(/Ú/g, "U")
        .replace(/[\/\\?#]/g, "").replace(/\./g, "").replace(/\s+/g, "_").trim();
}

function shuffle(arr) {
    var a = arr.slice();
    for (var i = a.length - 1; i > 0; i--) {
        var j = Math.floor(Math.random() * (i + 1));
        var t = a[i]; a[i] = a[j]; a[j] = t;
    }
    return a;
}

function ref(e) {
    return { entrantID: e.entrantID, name: e.name, team: e.team };
}

// Build a round from a pool of {entrantID,name,team,lastScore}.
// byeReason: "random" (round 1) or "highest-score" (later rounds).
function buildRound(roundNum, pool, byeReason) {
    var players = pool.slice();
    var bye = null;

    if (players.length % 2 === 1) {
        var byePlayer;
        if (byeReason === "highest-score") {
            // Highest score in the just-completed round; ties broken randomly.
            var ranked = shuffle(players).slice().sort(function (a, b) {
                return (b.lastScore == null ? -1 : b.lastScore) - (a.lastScore == null ? -1 : a.lastScore);
            });
            byePlayer = ranked[0];
        } else {
            byePlayer = shuffle(players)[0];
        }
        players = players.filter(function (p) { return p.entrantID !== byePlayer.entrantID; });
        bye = { entrantID: byePlayer.entrantID, name: byePlayer.name, team: byePlayer.team, reason: byeReason };
    }

    var order = shuffle(players);
    var matchups = [];
    for (var i = 0; i < order.length; i += 2) {
        matchups.push({
            id: "R" + roundNum + "M" + (i / 2 + 1),
            a: ref(order[i]),
            b: ref(order[i + 1]),
            scoreA: null,
            scoreB: null,
            winner: null,       // entrantID
            completion: false
        });
    }
    return { round: roundNum, matchups: matchups, bye: bye };
}

// Survivors of a completed round: each matchup winner (carrying their winning
// score) plus the round's bye (no score).
function survivorsOf(round) {
    var out = [];
    for (var i = 0; i < round.matchups.length; i++) {
        var m = round.matchups[i];
        var winIsA = m.winner === m.a.entrantID;
        var w = winIsA ? m.a : m.b;
        out.push({ entrantID: w.entrantID, name: w.name, team: w.team, lastScore: winIsA ? m.scoreA : m.scoreB });
    }
    if (round.bye) {
        out.push({ entrantID: round.bye.entrantID, name: round.bye.name, team: round.bye.team, lastScore: null });
    }
    return out;
}

async function readDivision() {
    var r = await seasons.item(DIVISION_DOC_ID, DIVISION_DOC_ID).read();
    return r;
}

function stateBody(doc) {
    return {
        id: doc.id,
        status: doc.status || "open",
        entryFee: doc.entryFee || { amount: ENTRY_FEE, currency: "USD", format: "winner-take-all" },
        prizePool: doc.prizePool || { perEntry: ENTRY_FEE, total: 0, winner: null },
        entrants: doc.entrants || [],
        bracket: doc.bracket && !Array.isArray(doc.bracket) ? doc.bracket : null
    };
}

async function saveDivision(doc, etag) {
    return seasons.item(DIVISION_DOC_ID, DIVISION_DOC_ID).replace(doc, {
        accessCondition: { type: "IfMatch", condition: etag }
    });
}

// ── action handlers ─────────────────────────────────────────────────────────

async function listSignups(req, res) {
    var { resources } = await regForms.items.query({
        query: "SELECT c.id, c.playerName, c.teamName, c.source, c.submittedAt FROM c WHERE c.league = @lg ORDER BY c.submittedAt ASC",
        parameters: [{ name: "@lg", value: CONTEST_LEAGUE_ID }]
    }).fetchAll();
    return res.status(200).json({ signups: resources });
}

async function getState(req, res) {
    var r = await readDivision();
    if (!r.resource) return res.status(404).json({ error: "Contest not set up." });
    return res.status(200).json(stateBody(r.resource));
}

// Public sign-up from the discrete 3pt-contest.html page. Requires the $5
// acknowledgment and is honeypot-protected. Writes a pending Registration Form.
async function publicSignup(req, res) {
    var body = (req.body && typeof req.body === "object") ? req.body : {};

    // Honeypot — silent success so bots don't retry.
    if (body.website && String(body.website).trim().length > 0) {
        return res.status(200).json({ success: true });
    }

    var playerName = body.playerName ? String(body.playerName).trim() : "";
    if (!playerName) return res.status(400).json({ error: "Please enter your full name." });
    var teamName = body.teamName ? String(body.teamName).trim() : "";
    if (!teamName) return res.status(400).json({ error: "Please enter your team (or \"Free Agent\")." });
    if (!body.acknowledged) return res.status(400).json({ error: "Please acknowledge the $5 entry fee." });

    var now = new Date().toISOString();
    var tsSeg = now.slice(0, 19).replace(/:/g, "-");
    var doc = {
        id: "3PT_Contest." + slugSegment(teamName) + "." + slugSegment(playerName) + "." + tsSeg,
        league: CONTEST_LEAGUE_ID,
        eventName: CONTEST_EVENT_NAME,
        teamName: teamName,
        playerName: playerName,
        source: "signup",
        entryFee: { amount: ENTRY_FEE, currency: "USD", format: "winner-take-all", acknowledged: true },
        status: "pending",
        submittedAt: now
    };
    try {
        await regForms.items.create(doc);
        return res.status(200).json({ success: true, id: doc.id });
    } catch (err) {
        if (err && err.code === 409) return res.status(409).json({ error: "You're already signed up. See you at the contest!" });
        throw err;
    }
}

async function addWalkin(req, res) {
    var body = (req.body && typeof req.body === "object") ? req.body : {};
    var playerName = body.playerName ? String(body.playerName).trim() : "";
    var teamName = body.teamName ? String(body.teamName).trim() : "";
    if (!playerName) return res.status(400).json({ error: "Player name is required." });
    if (!teamName) return res.status(400).json({ error: "Team is required (or \"Free Agent\")." });

    var now = new Date().toISOString();
    var tsSeg = now.slice(0, 19).replace(/:/g, "-");
    var doc = {
        id: "3PT_Contest." + slugSegment(teamName) + "." + slugSegment(playerName) + "." + tsSeg,
        league: CONTEST_LEAGUE_ID,
        eventName: CONTEST_EVENT_NAME,
        teamName: teamName,
        playerName: playerName,
        source: "walk-in",
        entryFee: { amount: ENTRY_FEE, currency: "USD", format: "winner-take-all", acknowledged: true },
        status: "pending",
        submittedAt: now
    };
    try {
        await regForms.items.create(doc);
    } catch (err) {
        if (err && err.code === 409) return res.status(409).json({ error: "That player is already on the list." });
        throw err;
    }
    return res.status(200).json({ success: true, signup: { id: doc.id, playerName: playerName, teamName: teamName, source: "walk-in", submittedAt: now } });
}

async function startBracket(req, res) {
    var body = (req.body && typeof req.body === "object") ? req.body : {};
    var incoming = Array.isArray(body.entrants) ? body.entrants : [];

    // Build unique entrant list from the present roster.
    var entrants = [];
    var seen = {};
    var slot = 1;
    for (var i = 0; i < incoming.length; i++) {
        var name = incoming[i] && incoming[i].playerName ? String(incoming[i].playerName).trim() : "";
        var team = incoming[i] && incoming[i].teamName ? String(incoming[i].teamName).trim() : "";
        if (!name) continue;
        var key = slugSegment(name).toLowerCase() + "|" + slugSegment(team).toLowerCase();
        if (seen[key]) continue;
        seen[key] = true;
        entrants.push({
            slot: slot,
            entrantID: "DRMBL.3PT." + slugSegment(name) + "-" + slot,
            name: name,
            team: team || "Free Agent",
            paid: incoming[i].paid === false ? false : true
        });
        slot++;
    }

    if (entrants.length < 2) {
        return res.status(400).json({ error: "Need at least 2 present players to start." });
    }

    var r = await readDivision();
    if (!r.resource) return res.status(404).json({ error: "Contest not set up." });
    var doc = r.resource;

    var pool = entrants.map(function (e) { return { entrantID: e.entrantID, name: e.name, team: e.team, lastScore: null }; });
    var round1 = buildRound(1, pool, "random");

    var paidCount = entrants.filter(function (e) { return e.paid; }).length;

    doc.entrants = entrants;
    doc.status = "in-progress";
    doc.prizePool = { perEntry: ENTRY_FEE, total: paidCount * ENTRY_FEE, winner: null };
    doc.bracket = {
        format: "single-elim-redraw",
        status: "in-progress",
        currentRound: 1,
        rounds: [round1],
        champion: null
    };

    try {
        await saveDivision(doc, r.etag);
    } catch (err) {
        if (err && err.code === 412) return res.status(409).json({ error: "Contest state changed — reload and try again." });
        throw err;
    }
    return res.status(200).json(stateBody(doc));
}

async function saveMatch(req, res) {
    var body = (req.body && typeof req.body === "object") ? req.body : {};
    var roundNum = parseInt(body.round, 10);
    var matchupId = body.matchupId ? String(body.matchupId) : "";
    var scoreA = body.scoreA == null ? null : parseInt(body.scoreA, 10);
    var scoreB = body.scoreB == null ? null : parseInt(body.scoreB, 10);

    if (!roundNum || !matchupId) return res.status(400).json({ error: "round and matchupId are required." });
    if (scoreA == null || scoreB == null || isNaN(scoreA) || isNaN(scoreB) || scoreA < 0 || scoreB < 0) {
        return res.status(400).json({ error: "Both scores must be non-negative numbers." });
    }
    if (scoreA === scoreB) {
        return res.status(400).json({ error: "Tie — shoot a tiebreak and enter different scores." });
    }

    var r = await readDivision();
    if (!r.resource) return res.status(404).json({ error: "Contest not set up." });
    var doc = r.resource;
    var bracket = doc.bracket;
    if (!bracket || Array.isArray(bracket) || !bracket.rounds) {
        return res.status(400).json({ error: "Bracket has not been started." });
    }

    var round = bracket.rounds.filter(function (rd) { return rd.round === roundNum; })[0];
    if (!round) return res.status(404).json({ error: "Round not found." });
    var match = round.matchups.filter(function (m) { return m.id === matchupId; })[0];
    if (!match) return res.status(404).json({ error: "Matchup not found." });

    match.scoreA = scoreA;
    match.scoreB = scoreB;
    match.winner = scoreA > scoreB ? match.a.entrantID : match.b.entrantID;
    match.completion = true;

    // If the round is now complete, advance.
    var roundDone = round.matchups.every(function (m) { return m.completion; });
    if (roundDone) {
        var survivors = survivorsOf(round);
        if (survivors.length === 1) {
            var champ = survivors[0];
            bracket.champion = { entrantID: champ.entrantID, name: champ.name, team: champ.team };
            bracket.status = "complete";
            doc.status = "complete";
            doc.prizePool = doc.prizePool || { perEntry: ENTRY_FEE, total: 0, winner: null };
            doc.prizePool.winner = { entrantID: champ.entrantID, name: champ.name, team: champ.team };
        } else {
            var nextNum = roundNum + 1;
            if (!bracket.rounds.some(function (rd) { return rd.round === nextNum; })) {
                bracket.rounds.push(buildRound(nextNum, survivors, "highest-score"));
                bracket.currentRound = nextNum;
            }
        }
    }

    try {
        await saveDivision(doc, r.etag);
    } catch (err) {
        if (err && err.code === 412) return res.status(409).json({ error: "Contest state changed — reload and try again." });
        throw err;
    }
    return res.status(200).json(stateBody(doc));
}

// Edit a sign-up's display name (setup list, before the bracket starts).
// The doc id keeps its original slug; only the playerName field changes.
async function editSignup(req, res) {
    var body = (req.body && typeof req.body === "object") ? req.body : {};
    var id = body.id ? String(body.id) : "";
    var teamName = body.teamName ? String(body.teamName) : "";
    var playerName = body.playerName ? String(body.playerName).trim() : "";
    if (!id || !teamName) return res.status(400).json({ error: "id and teamName are required." });
    if (!playerName) return res.status(400).json({ error: "Name cannot be empty." });

    var r;
    try {
        r = await regForms.item(id, teamName).read();
    } catch (e) {
        if (e.code === 404) return res.status(404).json({ error: "Sign-up not found." });
        throw e;
    }
    r.resource.playerName = playerName;
    await regForms.item(id, teamName).replace(r.resource);
    return res.status(200).json({ success: true, signup: { id: id, teamName: teamName, playerName: playerName, source: r.resource.source, submittedAt: r.resource.submittedAt } });
}

// Rename an entrant during the live bracket. Updates the entrant record plus
// every reference to it (matchup slots, byes, champion, prize-pool winner).
async function renameEntrant(req, res) {
    var body = (req.body && typeof req.body === "object") ? req.body : {};
    var entrantID = body.entrantID ? String(body.entrantID) : "";
    var name = body.name ? String(body.name).trim() : "";
    if (!entrantID || !name) return res.status(400).json({ error: "entrantID and name are required." });

    var r = await readDivision();
    if (!r.resource) return res.status(404).json({ error: "Contest not set up." });
    var doc = r.resource;

    var found = false;
    (doc.entrants || []).forEach(function (e) { if (e.entrantID === entrantID) { e.name = name; found = true; } });

    var b = doc.bracket;
    if (b && !Array.isArray(b) && b.rounds) {
        b.rounds.forEach(function (rd) {
            rd.matchups.forEach(function (m) {
                if (m.a && m.a.entrantID === entrantID) m.a.name = name;
                if (m.b && m.b.entrantID === entrantID) m.b.name = name;
            });
            if (rd.bye && rd.bye.entrantID === entrantID) rd.bye.name = name;
        });
        if (b.champion && b.champion.entrantID === entrantID) b.champion.name = name;
    }
    if (doc.prizePool && doc.prizePool.winner && doc.prizePool.winner.entrantID === entrantID) doc.prizePool.winner.name = name;

    if (!found) return res.status(404).json({ error: "Entrant not found." });

    try {
        await saveDivision(doc, r.etag);
    } catch (err) {
        if (err && err.code === 412) return res.status(409).json({ error: "Contest state changed — reload and try again." });
        throw err;
    }
    return res.status(200).json(stateBody(doc));
}

async function resetBracket(req, res) {
    var r = await readDivision();
    if (!r.resource) return res.status(404).json({ error: "Contest not set up." });
    var doc = r.resource;
    doc.status = "open";
    doc.entrants = [];
    doc.bracket = [];
    doc.prizePool = { perEntry: ENTRY_FEE, total: 0, winner: null };
    try {
        await saveDivision(doc, r.etag);
    } catch (err) {
        if (err && err.code === 412) return res.status(409).json({ error: "Contest state changed — reload and try again." });
        throw err;
    }
    return res.status(200).json(stateBody(doc));
}

// ── dispatch ────────────────────────────────────────────────────────────────

module.exports = async function (req, res) {
    var action = (req.query && req.query.action) || "";
    try {
        if (req.method === "GET") {
            if (action === "signups") return await listSignups(req, res);
            if (action === "state") return await getState(req, res);
            return res.status(400).json({ error: "Unknown GET action. Use signups or state." });
        }
        if (req.method === "POST") {
            if (action === "signup") return await publicSignup(req, res);
            if (action === "add-walkin") return await addWalkin(req, res);
            if (action === "edit-signup") return await editSignup(req, res);
            if (action === "start") return await startBracket(req, res);
            if (action === "save-match") return await saveMatch(req, res);
            if (action === "rename-entrant") return await renameEntrant(req, res);
            if (action === "reset") return await resetBracket(req, res);
            return res.status(400).json({ error: "Unknown POST action." });
        }
        return res.status(405).json({ error: "Method not allowed" });
    } catch (err) {
        console.error("3pt-contest error [" + action + "]:", err && err.message);
        return res.status(500).json({ error: "Server error. Please try again." });
    }
};
