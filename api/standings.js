var { CosmosClient } = require("@azure/cosmos");

var client = new CosmosClient({
    endpoint: process.env.COSMOS_ENDPOINT,
    key: process.env.COSMOS_KEY
});

var database = client.database("DRMBL Database");
var seasonsContainer = database.container("Seasons");
var teamsContainer = database.container("Teams");

var SEASON_ID = "Spring - Mens - 2026";

module.exports = async function (req, res) {
    if (req.method !== "GET") {
        return res.status(405).json({ error: "Method not allowed" });
    }

    try {
        // 1. Read Season document to get team list
        var seasonResp = await seasonsContainer.item(SEASON_ID, SEASON_ID).read();
        var seasonDoc = seasonResp.resource;

        if (!seasonDoc) {
            return res.status(404).json({ error: "Season not found." });
        }

        var standings = [];
        var seasonStarted = false;

        // 2. For each slot, build standings entry
        for (var i = 0; i < seasonDoc.teams.length; i++) {
            var slot = seasonDoc.teams[i];
            var entry = {
                slot: slot.slot,
                name: slot.name || "TBD",
                rank: null,
                wins: 0,
                losses: 0,
                pointDifferential: null
            };

            // If a team is assigned to this slot, read their record
            if (slot.teamID) {
                try {
                    var teamResp = await teamsContainer.item(slot.teamID, slot.teamID).read();
                    var teamDoc = teamResp.resource;

                    if (teamDoc && teamDoc.seasons) {
                        // Find the season entry matching our season
                        for (var s = 0; s < teamDoc.seasons.length; s++) {
                            if (teamDoc.seasons[s].id === SEASON_ID) {
                                var record = teamDoc.seasons[s].record;
                                if (record) {
                                    entry.rank = record.rank;
                                    entry.wins = record.wins || 0;
                                    entry.losses = record.losses || 0;
                                    entry.pointDifferential = record.pointDifferential;

                                    if (entry.wins > 0 || entry.losses > 0) {
                                        seasonStarted = true;
                                    }
                                }
                                break;
                            }
                        }
                    }
                } catch (teamErr) {
                    // Team doc read failed — use defaults
                    console.error("Failed to read team " + slot.teamID + ":", teamErr.message);
                }
            }

            standings.push(entry);
        }

        // 3. Sort: ranked teams first (by rank ascending), then unranked
        standings.sort(function (a, b) {
            if (a.rank !== null && b.rank !== null) return a.rank - b.rank;
            if (a.rank !== null) return -1;
            if (b.rank !== null) return 1;
            // Both unranked — registered teams before TBD
            if (a.name !== "TBD" && b.name === "TBD") return -1;
            if (a.name === "TBD" && b.name !== "TBD") return 1;
            return 0;
        });

        return res.status(200).json({ standings: standings, seasonStarted: seasonStarted });

    } catch (err) {
        console.error("Standings fetch error:", err.message);
        return res.status(500).json({ error: "Failed to load standings." });
    }
};
