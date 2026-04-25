export async function fetchLombaLeague() {
    var res = await fetch('/api/seasons?league=lomba');
    if (!res.ok) throw new Error('Failed to fetch LOMBA data');
    return res.json();
}

export async function fetchSeason(seasonId) {
    var res = await fetch('/api/lomba?action=season&id=' + encodeURIComponent(seasonId));
    if (!res.ok) throw new Error('Failed to fetch season');
    return res.json();
}

export async function savePlayoffGame(seasonId, round, seriesIndex, gameIndex, gameData, boxScore) {
    var res = await fetch('/api/lomba?action=save-playoff-game', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ seasonId, round, seriesIndex, gameIndex, gameData, boxScore }),
    });
    if (!res.ok) throw new Error('Failed to save playoff game');
    return res.json();
}

export async function saveRegularGame(boxScore, seasonId, notes) {
    var res = await fetch('/api/lomba?action=save-game', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ boxScore, seasonId, notes }),
    });
    if (!res.ok) throw new Error('Failed to save game');
    return res.json();
}

export async function editRegularGame(gameId, seasonId, gameData, boxScore) {
    var res = await fetch('/api/lomba?action=edit-game', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ gameId, seasonId, gameData, boxScore }),
    });
    if (!res.ok) throw new Error('Failed to edit game');
    return res.json();
}
