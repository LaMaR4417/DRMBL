// Copa ColMex registration endpoint — staging-only.
//
// Inserts into Registration Forms (DRMBL Database). Does NOT create Team or
// Season docs — those happen after manual approval. The doc id uses the new
// Box Scores-style convention:
//   Copa_ColMex.<Category>_<Gender>_<SeasonName>.<TeamName>.<ISO timestamp>
// so a queue listing immediately shows league/category/gender at a glance.
//
// No date cutoff — the form stays open during and after the tournament so
// teams that signed up in person can still be entered for record-keeping.
//
// Honeypot: a 'website' field in the body is treated as a bot trap — any
// non-empty value short-circuits to a 200 (silent drop) so bots don't retry.

var { CosmosClient } = require("@azure/cosmos");

var client = new CosmosClient({
    endpoint: process.env.COSMOS_ENDPOINT,
    key: process.env.COSMOS_KEY
});

var registrationContainer = client
    .database("DRMBL Database")
    .container("Registration Forms");

var LEAGUE_ID = "Copa ColMex";
var SEASON_NAME = "Primer Copa ColMex Piedras Negras";
var VALID_DIVISIONS = ["Femenil", "Varonil"];
var VALID_CATEGORIES = ["2009-2010", "2011-2012", "2013-2014", "2015-2016", "2017-2018"];

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

function buildDocId(teamName, category, division, submittedAtIso) {
    var leagueSeg = slugSegment(LEAGUE_ID);
    var contextSeg = slugSegment(category + " " + division + " " + SEASON_NAME);
    var teamSeg = slugSegment(teamName);
    // Strip milliseconds + replace ":" so the ISO doesn't collide with the
    // segment separator "." used by Box Scores. Result: 2026-05-23T10-00-00
    var tsSeg = submittedAtIso.slice(0, 19).replace(/:/g, "-");
    return leagueSeg + "." + contextSeg + "." + teamSeg + "." + tsSeg;
}

module.exports = async function (req, res) {
    if (req.method !== "POST") {
        return res.status(405).json({ error: "Method not allowed" });
    }

    var body = (req.body && typeof req.body === "object") ? req.body : {};

    // Honeypot — silent success so bots don't retry
    if (body.website && String(body.website).trim().length > 0) {
        return res.status(200).json({ success: true });
    }

    var teamName = body.teamName ? String(body.teamName).trim() : "";
    if (!teamName) {
        return res.status(400).json({ error: "Falta el nombre del equipo." });
    }
    if (VALID_DIVISIONS.indexOf(body.division) < 0) {
        return res.status(400).json({ error: "División inválida. Use Femenil o Varonil." });
    }
    if (VALID_CATEGORIES.indexOf(body.category) < 0) {
        return res.status(400).json({ error: "Categoría inválida." });
    }
    if (!body.owner || !body.owner.name || !body.owner.phone) {
        return res.status(400).json({ error: "Faltan datos del entrenador (nombre y teléfono)." });
    }

    var now = new Date().toISOString();
    var docId = buildDocId(teamName, body.category, body.division, now);

    var players = [];
    if (Array.isArray(body.players)) {
        for (var i = 0; i < body.players.length; i++) {
            var p = body.players[i];
            var pname = p && p.name ? String(p.name).trim() : "";
            if (!pname) continue;
            players.push({
                name: pname,
                dob: p && p.dob && typeof p.dob === "object" ? {
                    year: p.dob.year || null,
                    month: p.dob.month || null,
                    date: p.dob.date || null
                } : null,
                phone: p && p.phone ? String(p.phone).trim() : null
            });
        }
    }

    var doc = {
        id: docId,
        league: LEAGUE_ID,
        seasonName: SEASON_NAME,
        category: body.category,
        division: body.division,
        teamName: teamName,
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
};
