import { useState, useEffect } from 'react';
import { useGame, useGameDispatch } from '../context/GameContext';
import { fetchSeasons, fetchSeasonTeams, fetchTeamRoster, fetchLiveGames } from '../data/api';

export default function TeamSelectScreen() {
  const game = useGame();
  const dispatch = useGameDispatch();

  const [seasons, setSeasons] = useState([]);
  const [teams, setTeams] = useState([]);
  const [loading, setLoading] = useState(true);
  const [teamsLoading, setTeamsLoading] = useState(false);
  const [error, setError] = useState(null);
  const [advancing, setAdvancing] = useState(false);
  const [inGameTeams, setInGameTeams] = useState(new Set());

  // Load seasons list + live games on mount
  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);

    Promise.all([fetchSeasons(), fetchLiveGames()])
      .then(([seasonsData, liveGames]) => {
        if (cancelled) return;
        setSeasons(seasonsData);

        // Build set of team names currently in non-final live games
        const busy = new Set();
        for (const g of liveGames) {
          const status = g.boxScore?.gameInfo?.general?.status;
          if (status === 'final') continue;
          const home = g.boxScore?.teamInfo?.home?.name;
          const away = g.boxScore?.teamInfo?.away?.name;
          if (home) busy.add(home);
          if (away) busy.add(away);
        }
        setInGameTeams(busy);

        // Auto-select the previously selected season, or the first one
        if (seasonsData.length > 0) {
          const prev = game.selectedSeason;
          const match = prev ? seasonsData.find((s) => s.id === prev.id) : null;
          if (match) {
            loadTeamsForSeason(match.id, match.league);
          } else {
            loadTeamsForSeason(seasonsData[0].id, seasonsData[0].league);
          }
        }
      })
      .catch((err) => {
        if (!cancelled) setError(err.message);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => { cancelled = true; };
  }, []);

  function loadTeamsForSeason(seasonId, league) {
    setTeamsLoading(true);
    setError(null);
    dispatch({ type: 'SET_SEASON', id: seasonId, league });
    fetchSeasonTeams(seasonId)
      .then((data) => {
        setTeams(data.teams);
      })
      .catch((err) => {
        setError('Failed to load teams. ' + err.message);
        setTeams([]);
      })
      .finally(() => {
        setTeamsLoading(false);
      });
  }

  function handleSeasonSelect(season) {
    if (game.selectedSeason?.id === season.id) return;
    loadTeamsForSeason(season.id, season.league);
  }

  const canProceed =
    game.homeTeam && game.awayTeam && game.homeTeam.teamID !== game.awayTeam.teamID;

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

  async function handleNext() {
    if (!canProceed || advancing) return;
    setAdvancing(true);
    setError(null);

    try {
      // Fetch both rosters in parallel
      const [homeData, awayData] = await Promise.all([
        fetchTeamRoster(game.homeTeam.teamID),
        fetchTeamRoster(game.awayTeam.teamID),
      ]);

      dispatch({ type: 'SET_TEAM_ROSTER', side: 'home', roster: homeData.roster });
      dispatch({ type: 'SET_TEAM_ROSTER', side: 'away', roster: awayData.roster });
      dispatch({ type: 'SET_STEP', step: 3 });
    } catch (err) {
      setError('Failed to load rosters. ' + err.message);
    } finally {
      setAdvancing(false);
    }
  }

  if (loading) {
    return (
      <div className="screen team-select-screen">
        <div className="screen-header">
          <button className="btn btn-back" onClick={() => dispatch({ type: 'SET_STEP', step: 1 })}>
            Back
          </button>
          <h2>Pick Teams</h2>
          <div className="header-spacer" />
        </div>
        <div className="loading-message">Loading seasons...</div>
      </div>
    );
  }

  if (error && teams.length === 0 && seasons.length === 0) {
    return (
      <div className="screen team-select-screen">
        <div className="screen-header">
          <button className="btn btn-back" onClick={() => dispatch({ type: 'SET_STEP', step: 1 })}>
            Back
          </button>
          <h2>Pick Teams</h2>
          <div className="header-spacer" />
        </div>
        <div className="error-message">
          <p>{error}</p>
          <button className="btn btn-primary" onClick={() => window.location.reload()}>
            Retry
          </button>
        </div>
      </div>
    );
  }

  if (seasons.length === 0) {
    return (
      <div className="screen team-select-screen">
        <div className="screen-header">
          <button className="btn btn-back" onClick={() => dispatch({ type: 'SET_STEP', step: 1 })}>
            Back
          </button>
          <h2>Pick Teams</h2>
          <div className="header-spacer" />
        </div>
        <div className="empty-message">No seasons available.</div>
      </div>
    );
  }

  return (
    <div className="screen team-select-screen">
      <div className={`screen-header ${canProceed ? 'has-matchup' : ''}`}>
        <button className="btn btn-back" onClick={() => dispatch({ type: 'SET_STEP', step: 1 })}>
          Back
        </button>
        {canProceed ? (
          <div className="matchup-bar">
            <span className="matchup-bar-team home">{game.homeTeam.name}</span>
            <span className="matchup-bar-vs">VS</span>
            <span className="matchup-bar-team away">{game.awayTeam.name}</span>
          </div>
        ) : (
          <>
            <h2>Pick Teams</h2>
            <div className="header-spacer" />
          </>
        )}
      </div>

      {/* Season / League Selector */}
      {seasons.length > 1 && (
        <div className="season-selector">
          {seasons.map((season) => {
            const isActive = game.selectedSeason?.id === season.id;
            const label = season.league?.abbreviation || season.id;
            return (
              <button
                key={season.id}
                className={`btn btn-season ${isActive ? 'active' : ''}`}
                onClick={() => handleSeasonSelect(season)}
              >
                <span className="season-btn-abbr">{label}</span>
                <span className="season-btn-name">{season.id}</span>
              </button>
            );
          })}
        </div>
      )}

      {teamsLoading ? (
        <div className="loading-message">Loading teams...</div>
      ) : teams.length === 0 ? (
        <div className="empty-message">No teams registered for this season yet.</div>
      ) : (
        <div className="team-select-content">
          {/* Home Team */}
          <div className="team-select-half">
            <h3 className="team-select-label">Home</h3>
            <div className="team-list">
              {teams.map((team) => {
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
                    {isInGame && <span className="team-in-game-badge">IN GAME</span>}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Away Team */}
          <div className="team-select-half">
            <h3 className="team-select-label">Away</h3>
            <div className="team-list">
              {teams.map((team) => {
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
                    {isInGame && <span className="team-in-game-badge">IN GAME</span>}
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
          {advancing ? 'Loading Rosters...' : 'Next: Check Attendance'}
        </button>
      </div>
    </div>
  );
}
