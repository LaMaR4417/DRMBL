// API helper for fetching season and team data from the DRMBL backend

export async function fetchSeasons() {
  const res = await fetch('/api/seasons');
  if (!res.ok) throw new Error('Failed to load seasons');
  const data = await res.json();
  return data.seasons || [];
}

export async function fetchSeasonTeams(seasonId) {
  const url = seasonId
    ? `/api/season?id=${encodeURIComponent(seasonId)}`
    : '/api/season';
  const res = await fetch(url);
  if (!res.ok) throw new Error('Failed to load season data');
  const data = await res.json();
  return {
    id: data.id,
    league: data.league || null,
    teams: (data.teams || []).filter((t) => t.teamID),
  };
}

export async function fetchTeamRoster(teamID) {
  const res = await fetch(`/api/team?id=${encodeURIComponent(teamID)}`);
  if (!res.ok) throw new Error('Failed to load team data');
  return res.json();
}

export async function fetchGameSettings() {
  const res = await fetch('/api/game-settings');
  if (!res.ok) throw new Error('Failed to load game settings');
  const data = await res.json();
  return data.presets;
}

export async function fetchLiveGames() {
  const res = await fetch('/api/live-game');
  if (!res.ok) return [];
  const data = await res.json();
  return data.games || [];
}

export function syncLiveGame(boxScore) {
  fetch('/api/live-game', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ gameId: boxScore.gameId, boxScore }),
  }).catch(() => {});
}

export async function saveEndGame(boxScore, homeTeamID, awayTeamID, homeSlot, awaySlot) {
  const res = await fetch('/api/end-game', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ boxScore, homeTeamID, awayTeamID, homeSlot, awaySlot }),
  });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.error || 'Failed to save game');
  }
  return res.json();
}
