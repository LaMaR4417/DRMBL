// API helper for fetching season and team data from the DRMBL backend

export async function fetchSeasonTeams() {
  const res = await fetch('/api/season');
  if (!res.ok) throw new Error('Failed to load season data');
  const data = await res.json();
  // Filter to only registered teams (non-empty teamID)
  return data.teams.filter((t) => t.teamID);
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

export function syncLiveGame(boxScore) {
  fetch('/api/live-game', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ boxScore }),
  }).catch(() => {});
}
