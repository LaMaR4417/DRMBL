var { CosmosClient } = require("@azure/cosmos");

var client = new CosmosClient({
    endpoint: process.env.COSMOS_ENDPOINT,
    key: process.env.COSMOS_KEY
});

var database = client.database("DRMBL Database");

var CONTAINER_ID = "Game Settings";

// DRMBL Default preset — seeded on first call if container is empty
var DRMBL_DEFAULT = {
    id: "DRMBL Default",
    presetName: "DRMBL Default",
    periods: {
        format: { quarters: true, halves: false },
        minutesPerPeriod: 10,
        minutesPerOvertime: 5
    },
    breaks: {
        betweenQuarters: 1,
        halftime: 3,
        beforeOvertime: 1
    },
    shotClock: {
        active: false,
        duration: null
    },
    stoppages: {
        during: {
            perQuarter: {
                setting: true,
                "1stQuarter": false,
                "2ndQuarter": false,
                "3rdQuarter": false,
                "4thQuarter": { enabled: true, from: 3 },
                overtime: { enabled: true, from: 1 }
            },
            perHalf: {
                setting: false,
                "1stHalf": false,
                "2ndHalf": false,
                overtime: false
            }
        },
        for: [
            { action: "Made Shot", always: false },
            { action: "Foul", always: false },
            { action: "Turnover", always: false },
            { action: "Jump Ball", always: false },
            { action: "Timeout", always: true },
            { action: "Referee Timeout", always: true }
        ]
    },
    tipOff: {
        possessionRule: "tipWinner",
        jumpBallRule: "switchPossession"
    },
    fouls: {
        foulOutLimit: 5,
        bonus: {
            perPeriod: true,
            perHalf: false,
            oneAndOne: null,
            doubleBonus: 5
        },
        technicalEjectionLimit: 2
    },
    timeouts: {
        regulation: {
            allocation: { perGame: true, perHalf: false },
            full: 2,
            short: 2
        },
        overtime: {
            full: 1,
            short: 0
        },
        duration: {
            full: 60,
            short: 30
        },
        rollover: {
            regulationtoOT: false,
            OTtoOT: false
        }
    }
};

async function getContainer() {
    var { container } = await database.containers.createIfNotExists({
        id: CONTAINER_ID,
        partitionKey: { paths: ["/id"] }
    });
    return container;
}

module.exports = async function (req, res) {
    if (req.method === "GET") {
        try {
            var container = await getContainer();

            var { resources } = await container.items
                .query("SELECT * FROM c")
                .fetchAll();

            // If container is empty, seed with DRMBL Default
            if (resources.length === 0) {
                await container.items.create(DRMBL_DEFAULT);
                resources = [DRMBL_DEFAULT];
            }

            // Strip Cosmos DB system fields before sending
            var presets = resources.map(function (doc) {
                var preset = {};
                for (var key in doc) {
                    if (key !== "_rid" && key !== "_self" && key !== "_etag" && key !== "_attachments" && key !== "_ts") {
                        preset[key] = doc[key];
                    }
                }
                return preset;
            });

            return res.status(200).json({ presets: presets });

        } catch (err) {
            console.error("Game settings fetch error:", err.message);
            return res.status(500).json({ error: "Failed to load game settings." });
        }

    } else if (req.method === "POST") {
        try {
            var body = req.body;

            if (!body || !body.presetName) {
                return res.status(400).json({ error: "Missing presetName." });
            }

            // Use presetName as the document ID
            body.id = body.presetName;

            var container = await getContainer();

            // Upsert — creates if new, replaces if exists
            await container.items.upsert(body);

            return res.status(200).json({ success: true, id: body.id });

        } catch (err) {
            console.error("Game settings save error:", err.message);
            return res.status(500).json({ error: "Failed to save game settings." });
        }

    } else {
        return res.status(405).json({ error: "Method not allowed" });
    }
};
