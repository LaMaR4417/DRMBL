// Team registration endpoint.
//
// Default (no league query param): DRMBL flow — creates a Team doc, claims
// an open slot in the active Season doc, and writes a Registration Form.
//
// `?league=copa-colmex`: staging-only flow — writes a pending Registration
// Form using the Box-Scores-style ID convention. Does NOT create Team or
// Season docs; organizer approves before publication. No date cutoff so
// in-person sign-ups can be entered after the fact.

var { CosmosClient } = require("@azure/cosmos");

var client = new CosmosClient({
    endpoint: process.env.COSMOS_ENDPOINT,
    key: process.env.COSMOS_KEY
});

var database = client.database("DRMBL Database");
var registrationContainer = database.container("Registration Forms");
var teamsContainer = database.container("Teams");
var seasonsContainer = database.container("Seasons");

// ─────────────────────────────────────────────────────────────────────────
// COPA COLMEX HANDLER — staging-only registration into Registration Forms.
// ─────────────────────────────────────────────────────────────────────────

var COLMEX_LEAGUE_ID = "Copa ColMex";
var COLMEX_SEASON_NAME = "Primer Copa ColMex Piedras Negras";
var COLMEX_VALID_DIVISIONS = ["Femenil", "Varonil"];
var COLMEX_VALID_CATEGORIES = ["2009-2010", "2011-2012", "2013-2014", "2015-2016", "2017-2018"];
// Origen is a free-text field with a curated suggestion list on the client
// (the ComboboxInput in inscripcion/index.html). Server only requires non-empty
// trimmed text with a sane length cap — coaches can submit cities not in the list.
var COLMEX_ORIGEN_MAX_LEN = 60;
var COLMEX_MIN_PLAYERS = 2;

function slugSegment(s) {
    return String(s || "")
        .replace(/ñ/g, "n").replace(/Ñ/g, "N")
        .replace(/á/g, "a").replace(/é/g, "e").replace(/í/g, "i").replace(/ó/g, "o").replace(/ú/g, "u")
        .replace(/Á/g, "A").replace(/É/g, "E").replace(/Í/g, "I").replace(/Ó/g, "O").replace(/Ú/g, "U")
        .replace(/[\/\\?#]/g, "")
        .replace(/\./g, "")
        .replace(/\s+/g, "_")
        .trim();
}

function buildColMexDocId(teamName, category, division, submittedAtIso) {
    var leagueSeg = slugSegment(COLMEX_LEAGUE_ID);
    var contextSeg = slugSegment(category + " " + division + " " + COLMEX_SEASON_NAME);
    var teamSeg = slugSegment(teamName);
    // Strip milliseconds + replace ":" so the ISO doesn't collide with the
    // segment separator "." used by Box Scores. Result: 2026-05-23T10-00-00
    var tsSeg = submittedAtIso.slice(0, 19).replace(/:/g, "-");
    return leagueSeg + "." + contextSeg + "." + teamSeg + "." + tsSeg;
}

async function handleCopaColMexRegistration(req, res) {
    var body = (req.body && typeof req.body === "object") ? req.body : {};

    // Honeypot — silent success so bots don't retry
    if (body.website && String(body.website).trim().length > 0) {
        return res.status(200).json({ success: true });
    }

    var teamName = body.teamName ? String(body.teamName).trim() : "";
    if (!teamName) {
        return res.status(400).json({ error: "Falta el nombre del equipo." });
    }
    var origen = body.origen ? String(body.origen).trim() : "";
    if (!origen) {
        return res.status(400).json({ error: "Falta el origen del equipo." });
    }
    if (origen.length > COLMEX_ORIGEN_MAX_LEN) {
        return res.status(400).json({ error: "Origen demasiado largo (máx " + COLMEX_ORIGEN_MAX_LEN + " caracteres)." });
    }
    if (COLMEX_VALID_DIVISIONS.indexOf(body.division) < 0) {
        return res.status(400).json({ error: "División inválida. Use Femenil o Varonil." });
    }
    if (COLMEX_VALID_CATEGORIES.indexOf(body.category) < 0) {
        return res.status(400).json({ error: "Categoría inválida." });
    }
    if (!body.owner || !body.owner.name || !body.owner.phone) {
        return res.status(400).json({ error: "Faltan datos del entrenador (nombre y teléfono)." });
    }

    var players = [];
    if (Array.isArray(body.players)) {
        for (var i = 0; i < body.players.length; i++) {
            var p = body.players[i];
            var firstNames = p && p.firstNames ? String(p.firstNames).trim() : "";
            var lastNames = p && p.lastNames ? String(p.lastNames).trim() : "";
            if (!firstNames || !lastNames) continue;
            var rawNumber = p && p.number != null ? String(p.number).trim() : "";
            var number = rawNumber.replace(/[^0-9]/g, "").slice(0, 3);
            players.push({
                firstNames: firstNames,
                lastNames: lastNames,
                number: number || null
            });
        }
    }
    if (players.length < COLMEX_MIN_PLAYERS) {
        return res.status(400).json({ error: "Captura al menos " + COLMEX_MIN_PLAYERS + " jugadores con nombres y apellidos." });
    }

    var now = new Date().toISOString();
    var docId = buildColMexDocId(teamName, body.category, body.division, now);

    var doc = {
        id: docId,
        league: COLMEX_LEAGUE_ID,
        seasonName: COLMEX_SEASON_NAME,
        category: body.category,
        division: body.division,
        teamName: teamName,
        origen: origen,
        owner: {
            name: String(body.owner.name).trim(),
            phone: String(body.owner.phone).trim(),
            email: body.owner.email ? String(body.owner.email).trim() : null
        },
        players: players,
        status: "pending",
        submittedAt: now
    };

    try {
        await registrationContainer.items.create(doc);
        return res.status(200).json({ success: true, id: docId });
    } catch (err) {
        console.error("Copa ColMex registration error:", err && err.message);
        if (err && err.code === 409) {
            return res.status(409).json({ error: "Ya existe una inscripción reciente con ese nombre. Contacte al organizador." });
        }
        return res.status(500).json({ error: "Error al registrar. Intente de nuevo." });
    }
}

// ─────────────────────────────────────────────────────────────────────────
// DRMBL HANDLER — original flow: creates Team + claims Season slot.
// ─────────────────────────────────────────────────────────────────────────

var DRMBL_SEASON_ID = "Spring - Mens - 2026";

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

function buildTeamDoc(body, teamSlot) {
    var teamID = sanitizeForID(body.teamName) + " - " + sanitizeForID(body.owner.name);

    var roster = [];
    for (var i = 0; i < body.players.length; i++) {
        var p = body.players[i];
        roster.push({
            playerID: buildPlayerID(p),
            name: p.name,
            dob: {
                year: p.dob.year,
                month: p.dob.month,
                date: p.dob.date
            },
            phone: p.phone || null,
            insuranceWaiver: { signed: false }
        });
    }
    while (roster.length < 12) {
        roster.push(buildEmptyPlayer());
    }

    var games = [];
    for (var g = 0; g < 10; g++) {
        games.push(buildEmptyGame());
    }

    return {
        id: teamID,
        name: body.teamName,
        owner: {
            name: body.owner.name,
            phone: body.owner.phone,
            email: body.owner.email
        },
        status: {
            registered: true,
            active: false,
            inactive: false,
            disbanded: false
        },
        seasons: [{
            id: DRMBL_SEASON_ID,
            teamSlot: teamSlot,
            roster: roster,
            record: {
                rank: null,
                wins: null,
                losses: null,
                pointDifferential: null,
                games: games,
                playoffs: [buildEmptyGame()]
            }
        }]
    };
}

async function handleDrmblRegistration(req, res) {
    try {
        var body = req.body;

        if (!body || !body.teamName || !body.owner || !body.players) {
            return res.status(400).json({ error: "Missing required fields" });
        }

        // Step 1: Read the Season document to find the next open slot
        var seasonResponse = await seasonsContainer.item(DRMBL_SEASON_ID, DRMBL_SEASON_ID).read();
        var seasonDoc = seasonResponse.resource;
        var seasonEtag = seasonResponse.etag;

        if (!seasonDoc || !seasonDoc.teams || !Array.isArray(seasonDoc.teams)) {
            console.error("Season document not found or malformed:", DRMBL_SEASON_ID);
            return res.status(500).json({ error: "Registration is not open yet." });
        }

        // Step 2: Find the first open slot
        var openSlot = null;
        var openSlotIndex = -1;
        for (var i = 0; i < seasonDoc.teams.length; i++) {
            if (!seasonDoc.teams[i].teamID) {
                openSlot = seasonDoc.teams[i].slot;
                openSlotIndex = i;
                break;
            }
        }

        if (openSlot === null) {
            return res.status(409).json({ error: "League is full. Registration is closed." });
        }

        // Step 3: Build and create the Team document
        var teamDoc = buildTeamDoc(body, openSlot);
        var teamID = teamDoc.id;
        await teamsContainer.items.create(teamDoc);

        // Step 4: Update the Season document with etag check for race conditions
        seasonDoc.teams[openSlotIndex].teamID = teamID;
        seasonDoc.teams[openSlotIndex].name = body.teamName;

        try {
            var replaceOptions = {
                accessCondition: { type: "IfMatch", condition: seasonEtag }
            };
            await seasonsContainer.item(DRMBL_SEASON_ID, DRMBL_SEASON_ID).replace(seasonDoc, replaceOptions);
        } catch (conflictErr) {
            if (conflictErr.code === 412) {
                try {
                    await teamsContainer.item(teamID, teamID).delete();
                } catch (cleanupErr) {
                    console.error("Orphan team cleanup failed:", cleanupErr.message);
                }
                return res.status(409).json({ error: "Another team just registered. Please try again." });
            }
            throw conflictErr;
        }

        // Step 5: Save the registration form (best-effort)
        try {
            var now = new Date().toISOString();
            body.id = body.teamName + " - " + now;
            body.submittedAt = now;
            await registrationContainer.items.create(body);
        } catch (formErr) {
            console.error("Registration form save failed (team was created):", formErr.message);
        }

        return res.status(200).json({ success: true, teamID: teamID, slot: openSlot });

    } catch (err) {
        console.error("Registration error:", err.message);

        if (err.code === 409) {
            return res.status(409).json({ error: "A team with this name and owner already exists." });
        }

        return res.status(500).json({ error: "Registration failed. Please try again." });
    }
}

// ─────────────────────────────────────────────────────────────────────────
// DISPATCH
// ─────────────────────────────────────────────────────────────────────────

module.exports = async function (req, res) {
    if (req.method !== "POST") {
        return res.status(405).json({ error: "Method not allowed" });
    }

    if (req.query && req.query.league === "copa-colmex") {
        return handleCopaColMexRegistration(req, res);
    }

    return handleDrmblRegistration(req, res);
};
