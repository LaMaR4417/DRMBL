export async function fetchLeagues() {
  const res = await fetch('/api/leagues');
  if (!res.ok) throw new Error('Failed to load leagues');
  const data = await res.json();
  return data.leagues || [];
}

export async function fetchSeasons() {
  const res = await fetch('/api/seasons');
  if (!res.ok) throw new Error('Failed to load seasons');
  const data = await res.json();
  return data.seasons || [];
}

export async function fetchLiveGames() {
  const res = await fetch('/api/live-game');
  if (!res.ok) return [];
  const data = await res.json();
  return data.games || [];
}

export function syncLiveGame(gameId, boxScore, meta) {
  fetch('/api/live-game', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ gameId, boxScore, trackerState: meta }),
  }).catch(() => {});
}

export async function deleteLiveGame(gameId) {
  const res = await fetch(`/api/live-game?id=${encodeURIComponent(gameId)}`, {
    method: 'DELETE',
  });
  if (!res.ok && res.status !== 404) {
    throw new Error('Failed to delete live game');
  }
}

export async function saveEndGame(boxScore, homeTeamID, awayTeamID, homeSlot, awaySlot, seasonId, scheduleGameId) {
  const res = await fetch('/api/end-game', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ boxScore, homeTeamID, awayTeamID, homeSlot, awaySlot, seasonId, scheduleGameId }),
  });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.error || 'Failed to save game');
  }
  return res.json();
}
