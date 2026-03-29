import { useState, useEffect } from 'react';
import { useGame, useGameDispatch } from '../context/GameContext';
import { fetchLiveGames } from '../data/api';

export default function GameSelectScreen() {
  const game = useGame();
  const dispatch = useGameDispatch();
  const [mode, setMode] = useState('scheduled');
  const [inGameTeams, setInGameTeams] = useState(new Set());

  const season = game.selectedSeason;
  const teams = season?.teams || [];
  const standings = season?.standings || [];

  const scheduledGames = (() => {
    if (!season) return [];
    if (season.weeklySchedule) {
      const all = [];
      for (const week of season.weeklySchedule) {
        for (const g of week.games || []) {
          all.push({ ...g, week: week.week, weekType: week.type || null });
        }
      }
      return all;
    }
    return season.games || [];
  })();

  function resolveSlot(slot) {
    const seedMatch = slot.match(/^#(\d+) Seed$/);
    if (seedMatch) {
      const idx = parseInt(seedMatch[1], 10) - 1;
      return standings[idx]?.name || slot;
    }
    if (slot.startsWith('Winner ') || slot.startsWith('Loser ')) return slot;
    const team = teams.find((t) => t.slot === slot);
    return team?.name || slot;
  }

  function isResolvable(g) {
    const h = resolveSlot(g.home);
    const a = resolveSlot(g.away);
    const ph = (s) => s.startsWith('#') || s.startsWith('Winner ') || s.startsWith('Loser ');
    return !ph(h) && !ph(a);
  }

  function isCompleted(g) { return g.completion === true; }

  function formatDateKey(d) {
    if (!d || typeof d === 'string') return d || 'TBD';
    return `${d.month}/${d.date}/${d.year}`;
  }

  function groupByDate(games) {
    const groups = [];
    const map = {};
    for (const g of games) {
      const key = g.weekDate ? formatDateKey(g.weekDate) : formatDateKey(g.date);
      if (!map[key]) {
        map[key] = { dateKey: key, games: [] };
        groups.push(map[key]);
      }
      map[key].games.push(g);
    }
    return groups;
  }

  useEffect(() => {
    fetchLiveGames().then((live) => {
      const busy = new Set();
      for (const g of live) {
        if (g.boxScore?.gameInfo?.general?.status === 'final') continue;
        const liveSeason = g.trackerState?.selectedSeason?.id || '';
        const h = g.boxScore?.teamInfo?.home?.name;
        const a = g.boxScore?.teamInfo?.away?.name;
        // Key by season+team so same-named teams in different divisions aren't blocked
        if (h) busy.add(liveSeason + '~' + h);
        if (a) busy.add(liveSeason + '~' + a);
      }
      setInGameTeams(busy);
    }).catch(() => {});
  }, []);

  function selectTeam(side, team) {
    const current = side === 'home' ? game.homeTeam : game.awayTeam;
    if (current?.teamID === team.teamID) {
      dispatch({ type: side === 'home' ? 'CLEAR_HOME_TEAM' : 'CLEAR_AWAY_TEAM' });
      return;
    }
    dispatch({ type: side === 'home' ? 'SET_HOME_TEAM' : 'SET_AWAY_TEAM', teamID: team.teamID, name: team.name, slot: team.slot });
  }

  const canProceed = game.homeTeam && game.awayTeam && game.homeTeam.teamID !== game.awayTeam.teamID;

  function handleStart() {
    if (!canProceed) return;
    dispatch({ type: 'START_GAME' });
  }

  const availableGames = scheduledGames.filter((g) => !isCompleted(g));
  const dateGroups = groupByDate(availableGames);

  return (
    <div className="screen">
      <div className={`screen-header ${canProceed ? 'has-matchup' : ''}`}>
        <button className="btn btn-back" onClick={() => dispatch({ type: 'SET_STEP', step: 2 })}>Back</button>
        {canProceed ? (
          <div className="matchup-bar">
            <span className="matchup-bar-team home">{game.homeTeam.name}</span>
            <span className="matchup-bar-vs">VS</span>
            <span className="matchup-bar-team away">{game.awayTeam.name}</span>
          </div>
        ) : (
          <><h2>Select Game</h2><div className="header-spacer" /></>
        )}
      </div>

      <div className="game-select-mode-toggle">
        <button className={`btn btn-mode ${mode === 'scheduled' ? 'active' : ''}`}
          onClick={() => { setMode('scheduled'); dispatch({ type: 'CLEAR_GAME' }); }}>Scheduled</button>
        <button className={`btn btn-mode ${mode === 'custom' ? 'active' : ''}`}
          onClick={() => { setMode('custom'); dispatch({ type: 'CLEAR_GAME' }); }}>Custom</button>
      </div>

      {mode === 'scheduled' && (
        <div className="scheduled-games-list">
          {dateGroups.length === 0 && <div className="empty-message">No scheduled games.</div>}
          {dateGroups.map((group) => (
            <div key={group.dateKey} className="scheduled-date-group">
              <div className="scheduled-date-header">{group.dateKey}</div>
              {group.games.map((g, i) => {
                const homeName = resolveSlot(g.home);
                const awayName = resolveSlot(g.away);
                const resolvable = isResolvable(g);
                const isSelected = game.selectedGame?.id === g.id;
                const curSeason = season?.id || '';
                const homeInGame = inGameTeams.has(curSeason + '~' + homeName);
                const awayInGame = inGameTeams.has(curSeason + '~' + awayName);
                const disabled = !resolvable || homeInGame || awayInGame;
                return (
                  <button key={g.id || i}
                    className={`btn btn-scheduled-game ${isSelected ? 'selected' : ''} ${disabled ? 'disabled' : ''}`}
                    disabled={disabled}
                    onClick={() => dispatch({ type: 'SET_GAME', game: g })}>
                    <div className="scheduled-game-matchup">
                      <span className="scheduled-game-away">{awayName}</span>
                      <span className="scheduled-game-vs">vs</span>
                      <span className="scheduled-game-home">{homeName}</span>
                    </div>
                    <div className="scheduled-game-info">
                      {g.time && <span className="scheduled-game-time">{g.time}</span>}
                      {g.location && <span className="scheduled-game-location">{g.location}</span>}
                      {g.round && <span className="scheduled-game-round">{g.round}</span>}
                      {g.week && <span className="scheduled-game-week">W{g.week}</span>}
                    </div>
                    {(homeInGame || awayInGame) && <span className="team-in-game-badge">IN GAME</span>}
                  </button>
                );
              })}
            </div>
          ))}
        </div>
      )}

      {mode === 'custom' && (
        <div className="team-select-content">
          <div className="team-select-half">
            <h3 className="team-select-label">Home</h3>
            <div className="team-list">
              {teams.map((t) => {
                if (!t.teamID) return null;
                const sel = game.homeTeam?.teamID === t.teamID;
                const other = game.awayTeam?.teamID === t.teamID;
                const busy = inGameTeams.has((season?.id || '') + '~' + t.name);
                return (
                  <button key={t.teamID}
                    className={`btn btn-team ${sel ? 'selected' : ''} ${other || busy ? 'disabled' : ''}`}
                    disabled={other || busy}
                    onClick={() => selectTeam('home', t)}>
                    <span className="team-slot">{t.slot}</span>
                    <span className="team-name">{t.name}</span>
                    {busy && <span className="team-in-game-badge">IN GAME</span>}
                  </button>
                );
              })}
            </div>
          </div>
          <div className="team-select-half">
            <h3 className="team-select-label">Away</h3>
            <div className="team-list">
              {teams.map((t) => {
                if (!t.teamID) return null;
                const sel = game.awayTeam?.teamID === t.teamID;
                const other = game.homeTeam?.teamID === t.teamID;
                const busy = inGameTeams.has((season?.id || '') + '~' + t.name);
                return (
                  <button key={t.teamID}
                    className={`btn btn-team ${sel ? 'selected' : ''} ${other || busy ? 'disabled' : ''}`}
                    disabled={other || busy}
                    onClick={() => selectTeam('away', t)}>
                    <span className="team-slot">{t.slot}</span>
                    <span className="team-name">{t.name}</span>
                    {busy && <span className="team-in-game-badge">IN GAME</span>}
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      )}

      <div className="screen-footer">
        <button className="btn btn-primary btn-large" disabled={!canProceed} onClick={handleStart}>
          Start Game
        </button>
      </div>
    </div>
  );
}
