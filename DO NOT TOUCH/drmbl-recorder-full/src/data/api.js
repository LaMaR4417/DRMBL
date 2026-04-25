// API helper for fetching season and team data from the DRMBL backend

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

export async function fetchTeamRoster(teamID, seasonID) {
  const res = await fetch(`/api/season?type=team&id=${encodeURIComponent(teamID)}&season=${encodeURIComponent(seasonID)}`);
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

// Delete a live-game doc from Cosmos (used to abandon/kill an in-progress game).
export async function deleteLiveGame(gameId) {
  const res = await fetch('/api/live-game?id=' + encodeURIComponent(gameId), {
    method: 'DELETE',
  });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.error || 'Failed to delete live game');
  }
  return true;
}

// Live-sync status pub/sub so the UI can show "saving / saved / error" indicators
const liveSyncListeners = new Set();
export function subscribeLiveSync(fn) {
  liveSyncListeners.add(fn);
  return () => liveSyncListeners.delete(fn);
}
function emitLiveSync(status) {
  liveSyncListeners.forEach((fn) => {
    try { fn(status); } catch (e) { /* ignore */ }
  });
}

export function syncLiveGame(boxScore, meta) {
  emitLiveSync('saving');
  fetch('/api/live-game', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      gameId: boxScore.gameId,
      boxScore,
      trackerState: meta ? {
        settings: meta.settings,
        selectedLeague: meta.selectedLeague || null,
        selectedSeason: meta.selectedSeason,
        selectedGame: meta.selectedGame || null,
        homeTeam: meta.homeTeam,
        awayTeam: meta.awayTeam,
      } : null,
    }),
  })
    .then((res) => emitLiveSync(res && res.ok ? 'saved' : 'error'))
    .catch(() => emitLiveSync('error'));
}

export async function saveEndGame(boxScore, homeTeamID, awayTeamID, homeSlot, awaySlot, seasonId, options = {}) {
  // options:
  //   scheduleGameId — id of the scheduled game this recording fills (when applicable)
  //   customGame     — true when this matchup wasn't picked from the schedule;
  //                    end-game.js will skip schedule + standings updates so a
  //                    debug recording with real teams doesn't mark a regular-
  //                    season game complete by accident
  const res = await fetch('/api/end-game', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      boxScore,
      homeTeamID,
      awayTeamID,
      homeSlot,
      awaySlot,
      seasonId,
      scheduleGameId: options.scheduleGameId || null,
      customGame: !!options.customGame,
    }),
  });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.error || 'Failed to save game');
  }
  return res.json();
}
