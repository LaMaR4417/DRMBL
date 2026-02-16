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
