export async function fetchLombaLeague() {
    var res = await fetch('/api/seasons?league=lomba');
    if (!res.ok) throw new Error('Failed to fetch LOMBA data');
    return res.json();
}

export async function saveSchedule(assignments) {
    var res = await fetch('/api/lomba?action=schedule-games', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ assignments }),
    });
    if (!res.ok) throw new Error('Failed to save schedule');
    return res.json();
}
