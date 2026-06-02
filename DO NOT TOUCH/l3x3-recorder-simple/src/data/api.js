const API = '/api/l3x3';

export async function fetchSeason() {
    const r = await fetch(`${API}?action=season`);
    if (!r.ok) throw new Error('Failed to load season');
    return r.json();
}

export async function fetchTeamRoster(teamID) {
    const r = await fetch(`${API}?action=team&id=${encodeURIComponent(teamID)}`);
    if (!r.ok) throw new Error('Failed to load team roster');
    return r.json();
}

export async function saveGame(boxScore) {
    const r = await fetch(`${API}?action=save-game`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ boxScore }),
    });
    if (!r.ok) {
        const e = await r.json().catch(() => ({}));
        throw new Error(e.error || 'Failed to save game');
    }
    return r.json();
}
