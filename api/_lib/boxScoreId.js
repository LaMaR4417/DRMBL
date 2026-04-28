// Box-score ID + structured-field generation, used by api/end-game.js and the
// migration script. Single source of truth so client and server agree.
//
// New ID format:
//   [leagueAbbr].[seasonSlug].[homeSlug]_vs_[awaySlug].[gameDate]
//   e.g. "DRMBL.Spring_2026.Wonderland_vs_DR_Elite.2026-04-26"
//
// Collisions (same matchup, same season, same date) are extremely rare.
// On collision, append ".g2", ".g3", etc. (caller responsible for retry on
// 409 Conflict if doing real-time inserts).

function reformatMDYToISO(mdy) {
    if (!mdy || typeof mdy !== 'string') return null;
    var parts = mdy.split('/');
    if (parts.length !== 3) return null;
    var m = parts[0].padStart(2, '0');
    var d = parts[1].padStart(2, '0');
    var y = parts[2];
    if (y.length === 2) y = '20' + y;
    if (!/^\d{4}$/.test(y) || !/^\d{2}$/.test(m) || !/^\d{2}$/.test(d)) return null;
    return y + '-' + m + '-' + d;
}

function isoDateFromTimestamp(ts) {
    if (!ts) return null;
    var d = new Date(ts);
    if (isNaN(d.getTime())) return null;
    return d.getUTCFullYear() + '-' +
        String(d.getUTCMonth() + 1).padStart(2, '0') + '-' +
        String(d.getUTCDate()).padStart(2, '0');
}

// Strip leading "<LEAGUE> - " prefix and slugify.
// "DRMBL - Men's Open - Spring 2026"        → "Mens_Open_Spring_2026"
// "LOMBA - Varonil Primera Fuerza - 2025-2026" → "Varonil_Primera_Fuerza_2025-2026"
function slugSeason(seasonID, leagueAbbr) {
    if (!seasonID) return 'Unknown_Season';
    var s = seasonID;
    var prefix = leagueAbbr + ' - ';
    if (s.indexOf(prefix) === 0) s = s.slice(prefix.length);
    s = s.replace(/[''`]/g, '');     // strip apostrophes
    s = s.replace(/ - /g, '_');       // " - " → "_"
    s = s.replace(/\s+/g, '_');       // remaining spaces → "_"
    return s;
}

// Take the second segment of a teamID. teamIDs are "<league>.<teamSlug>.<gender>.<division>"
// e.g. "DRMBL.Wonderland.Mens.Open" → "Wonderland"
//      "DRMBL.Del_Rio_Heat.Mens.Open" → "Del_Rio_Heat"
//      "LOMBA.Lakers.Varonil.Segunda_Fuerza_A" → "Lakers"
// Falls back to a slugified team display name when teamID is absent.
function teamIDToSlug(teamID, fallbackName) {
    if (teamID && typeof teamID === 'string') {
        var parts = teamID.split('.');
        if (parts.length >= 2 && parts[1]) return parts[1];
    }
    if (fallbackName) {
        return fallbackName.replace(/[''`.]/g, '').replace(/\s+/g, '_');
    }
    return 'Unknown';
}

function makeBoxScoreID(opts) {
    var league = opts.leagueAbbr || 'Unknown';
    var seasonSlug = slugSeason(opts.seasonID, league);
    var homeSlug = teamIDToSlug(opts.homeTeamID, opts.homeName);
    var awaySlug = teamIDToSlug(opts.awayTeamID, opts.awayName);
    var date = opts.gameDate || 'Unknown_Date';
    var base = league + '.' + seasonSlug + '.' + homeSlug + '_vs_' + awaySlug + '.' + date;
    if (opts.collisionSuffix) base += '.' + opts.collisionSuffix;
    return base;
}

// Build the structured doc fields used for indexing/queries. Pass in the
// box score itself + the request body context (homeTeamID/awayTeamID).
// Returns an object to be merged onto the box score before save.
function buildStructuredFields(boxScore, ctx) {
    var leagueAbbr = (boxScore.league && boxScore.league.abbreviation) || ctx.leagueAbbr || 'Unknown';
    var seasonID = ctx.seasonID || boxScore.season || null;
    var gameDate = reformatMDYToISO(boxScore.gameInfo && boxScore.gameInfo.general && boxScore.gameInfo.general.date)
        || isoDateFromTimestamp(boxScore.gameInfo && boxScore.gameInfo.general && boxScore.gameInfo.general.timestamp)
        || isoDateFromTimestamp(new Date().toISOString());
    var gameTimestamp = (boxScore.gameInfo && boxScore.gameInfo.general && boxScore.gameInfo.general.timestamp)
        || new Date().toISOString();

    return {
        leagueID: leagueAbbr,
        seasonID: seasonID,
        homeTeamID: ctx.homeTeamID || null,
        awayTeamID: ctx.awayTeamID || null,
        gameDate: gameDate,
        gameTimestamp: gameTimestamp
    };
}

module.exports = {
    makeBoxScoreID: makeBoxScoreID,
    buildStructuredFields: buildStructuredFields,
    reformatMDYToISO: reformatMDYToISO,
    isoDateFromTimestamp: isoDateFromTimestamp,
    slugSeason: slugSeason,
    teamIDToSlug: teamIDToSlug
};
