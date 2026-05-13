import { useState, useEffect } from 'react';
import { useGame, useGameDispatch } from '../context/GameContext';
import { fetchTeamRoster, fetchLiveGames } from '../data/api';
import { useTranslation } from '../i18n/useTranslation';

export default function GameSelectScreen() {
  const game = useGame();
  const dispatch = useGameDispatch();
  const { t } = useTranslation();

  const [mode, setMode] = useState('scheduled'); // 'scheduled' | 'custom'
  const [advancing, setAdvancing] = useState(false);
  const [error, setError] = useState(null);
  const [inGameTeams, setInGameTeams] = useState(new Set());

  const season = game.selectedSeason;
  const teams = season?.teams || [];
  const standings = season?.standings || [];

  // Build the list of scheduled games from either weeklySchedule or games array
  const scheduledGames = (() => {
    if (!season) return [];
    if (season.weeklySchedule) {
      const all = [];
      for (const week of season.weeklySchedule) {
        for (const g of week.games || []) {
          all.push({ ...g, week: week.week, weekDate: week.date, weekType: week.type || null });
        }
      }
      return all;
    }
    return season.games || [];
  })();

  // Resolve slot letters to team names, handling seeded placeholders via standings
  function resolveSlot(slot) {
    // Check if it's a seed reference like "#1 Seed"
    const seedMatch = slot.match(/^#(\d+) Seed$/);
    if (seedMatch) {
      const seedIndex = parseInt(seedMatch[1], 10) - 1;
      if (standings[seedIndex]) {
        return standings[seedIndex].name;
      }
      return slot; // Return placeholder if standings not yet determined
    }
    // Named placeholders (e.g. "Winner SF1", "Loser SF2")
    if (slot.startsWith('Winner ') || slot.startsWith('Loser ')) {
      return slot;
    }
    // Regular slot letter → team name
    const team = teams.find((t) => t.slot === slot);
    return team ? team.name : slot;
  }

  function isResolvableGame(g) {
    // A game is selectable if both sides resolve to actual teams (not placeholders)
    const home = resolveSlot(g.home);
    const away = resolveSlot(g.away);
    const isPlaceholder = (s) =>
      s.startsWith('#') || s.startsWith('Winner ') || s.startsWith('Loser ');
    return !isPlaceholder(home) && !isPlaceholder(away);
  }

  function isGameCompleted(g) {
    return g.completion === true;
  }

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

  // Fetch live games to mark in-game teams
  useEffect(() => {
    fetchLiveGames()
      .then((liveGames) => {
        const busy = new Set();
        for (const g of liveGames) {
          if (g.boxScore?.gameInfo?.general?.status === 'final') continue;
          const home = g.boxScore?.teamInfo?.home?.name;
          const away = g.boxScore?.teamInfo?.away?.name;
          if (home) busy.add(home);
          if (away) busy.add(away);
        }
        setInGameTeams(busy);
      })
      .catch(() => {});
  }, []);

  // Custom matchup team selection
  function selectTeam(side, team) {
    const current = side === 'home' ? game.homeTeam : game.awayTeam;
    if (current?.teamID === team.teamID) {
      dispatch({ type: side === 'home' ? 'CLEAR_HOME_TEAM' : 'CLEAR_AWAY_TEAM' });
      return;
    }
    dispatch({
      type: side === 'home' ? 'SET_HOME_TEAM' : 'SET_AWAY_TEAM',
      teamID: team.teamID,
      name: team.name,
      slot: team.slot,
    });
  }

  function handleScheduledSelect(g) {
    dispatch({ type: 'SET_GAME', game: g });
  }

  const canProceed = game.homeTeam && game.awayTeam && game.homeTeam.teamID !== game.awayTeam.teamID;

  async function handleNext() {
    if (!canProceed || advancing) return;
    setAdvancing(true);
    setError(null);

    try {
      const [homeData, awayData] = await Promise.all([
        fetchTeamRoster(game.homeTeam.teamID, season.id),
        fetchTeamRoster(game.awayTeam.teamID, season.id),
      ]);

      dispatch({ type: 'SET_TEAM_ROSTER', side: 'home', roster: homeData.roster });
      dispatch({ type: 'SET_TEAM_ROSTER', side: 'away', roster: awayData.roster });
      dispatch({ type: 'SET_STEP', step: 4 });
    } catch (err) {
      setError(t('gameSelect', 'failedRosters') + ' ' + err.message);
    } finally {
      setAdvancing(false);
    }
  }

  return (
    <div className="screen game-select-screen">
      <div className={`screen-header ${canProceed ? 'has-matchup' : ''}`}>
        <button className="btn btn-back" onClick={() => dispatch({ type: 'SET_STEP', step: 2 })}>
          {t('common', 'back')}
        </button>
        {canProceed ? (
          <div className="matchup-bar">
            <span className="matchup-bar-team home">{game.homeTeam.name}</span>
            <span className="matchup-bar-vs">VS</span>
            <span className="matchup-bar-team away">{game.awayTeam.name}</span>
          </div>
        ) : (
          <>
            <h2>{t('gameSelect', 'screenTitle')}</h2>
            <div className="header-spacer" />
          </>
        )}
      </div>

      {/* Mode toggle */}
      <div className="game-select-mode-toggle">
        <button
          className={`btn btn-mode ${mode === 'scheduled' ? 'active' : ''}`}
          onClick={() => { setMode('scheduled'); dispatch({ type: 'CLEAR_GAME' }); }}
        >
          {t('gameSelect', 'scheduled')}
        </button>
        <button
          className={`btn btn-mode ${mode === 'custom' ? 'active' : ''}`}
          onClick={() => { setMode('custom'); dispatch({ type: 'CLEAR_GAME' }); }}
        >
          {t('gameSelect', 'custom')}
        </button>
      </div>

      {mode === 'scheduled' && (() => {
        const availableGames = scheduledGames.filter((g) => !isGameCompleted(g));
        const dateGroups = groupByDate(availableGames);
        return (
        <div className="scheduled-games-list">
          {dateGroups.length === 0 && (
            <div className="empty-message">{t('gameSelect', 'noGames')}</div>
          )}
          {dateGroups.map((group) => (
            <div key={group.dateKey} className="scheduled-date-group">
              <div className="scheduled-date-header">{group.dateKey}</div>
              {group.games.map((g, i) => {
                const homeName = resolveSlot(g.home);
                const awayName = resolveSlot(g.away);
                const resolvable = isResolvableGame(g);
                const isSelected = game.selectedGame?.id === g.id;
                const homeInGame = inGameTeams.has(homeName);
                const awayInGame = inGameTeams.has(awayName);
                const disabled = !resolvable || homeInGame || awayInGame;

                return (
                  <button
                    key={g.id || i}
                    className={`btn btn-scheduled-game ${isSelected ? 'selected' : ''} ${disabled ? 'disabled' : ''}`}
                    disabled={disabled}
                    onClick={() => handleScheduledSelect(g)}
                  >
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
                    {(homeInGame || awayInGame) && (
                      <span className="team-in-game-badge">{t('gameSelect', 'inGame')}</span>
                    )}
                  </button>
                );
              })}
            </div>
          ))}
        </div>
        );
      })()}

      {mode === 'custom' && (
        <div className="team-select-content">
          <div className="team-select-half">
            <h3 className="team-select-label">{t('common', 'home')}</h3>
            <div className="team-list">
              {teams.map((team) => {
                if (!team.teamID) return null;
                const isSelected = game.homeTeam?.teamID === team.teamID;
                const isOtherSide = game.awayTeam?.teamID === team.teamID;
                const isInGame = inGameTeams.has(team.name);
                const isDisabled = isOtherSide || isInGame;
                return (
                  <button
                    key={team.teamID}
                    className={`btn btn-team ${isSelected ? 'selected' : ''} ${isDisabled ? 'disabled' : ''}`}
                    disabled={isDisabled}
                    onClick={() => selectTeam('home', team)}
                  >
                    <span className="team-slot">{team.slot}</span>
                    <span className="team-name">{team.name}</span>
                    {isInGame && <span className="team-in-game-badge">{t('gameSelect', 'inGame')}</span>}
                  </button>
                );
              })}
            </div>
          </div>
          <div className="team-select-half">
            <h3 className="team-select-label">{t('common', 'away')}</h3>
            <div className="team-list">
              {teams.map((team) => {
                if (!team.teamID) return null;
                const isSelected = game.awayTeam?.teamID === team.teamID;
                const isOtherSide = game.homeTeam?.teamID === team.teamID;
                const isInGame = inGameTeams.has(team.name);
                const isDisabled = isOtherSide || isInGame;
                return (
                  <button
                    key={team.teamID}
                    className={`btn btn-team ${isSelected ? 'selected' : ''} ${isDisabled ? 'disabled' : ''}`}
                    disabled={isDisabled}
                    onClick={() => selectTeam('away', team)}
                  >
                    <span className="team-slot">{team.slot}</span>
                    <span className="team-name">{team.name}</span>
                    {isInGame && <span className="team-in-game-badge">{t('gameSelect', 'inGame')}</span>}
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {error && <div className="error-message inline-error"><p>{error}</p></div>}

      <div className="screen-footer">
        <button
          className="btn btn-primary btn-large"
          disabled={!canProceed || advancing}
          onClick={handleNext}
        >
          {advancing ? t('gameSelect', 'loadingRosters') : t('gameSelect', 'nextSettings')}
        </button>
      </div>
    </div>
  );
}
