import { useState, useEffect } from 'react';
import { useGame, useGameDispatch } from '../context/GameContext';
import { fetchSeasonTeams, fetchTeamRoster } from '../data/api';

export default function TeamSelectScreen() {
  const game = useGame();
  const dispatch = useGameDispatch();

  const [teams, setTeams] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [advancing, setAdvancing] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    fetchSeasonTeams()
      .then((data) => {
        if (!cancelled) setTeams(data);
      })
      .catch((err) => {
        if (!cancelled) setError(err.message);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => { cancelled = true; };
  }, []);

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
        <div className="loading-message">Loading teams...</div>
      </div>
    );
  }

  if (error && teams.length === 0) {
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

  if (teams.length === 0) {
    return (
      <div className="screen team-select-screen">
        <div className="screen-header">
          <button className="btn btn-back" onClick={() => dispatch({ type: 'SET_STEP', step: 1 })}>
            Back
          </button>
          <h2>Pick Teams</h2>
          <div className="header-spacer" />
        </div>
        <div className="empty-message">No teams registered for this season yet.</div>
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

      <div className="team-select-content">
        {/* Home Team */}
        <div className="team-select-half">
          <h3 className="team-select-label">Home</h3>
          <div className="team-list">
            {teams.map((team) => {
              const isSelected = game.homeTeam?.teamID === team.teamID;
              const isOtherSide = game.awayTeam?.teamID === team.teamID;
              return (
                <button
                  key={team.teamID}
                  className={`btn btn-team ${isSelected ? 'selected' : ''} ${isOtherSide ? 'disabled' : ''}`}
                  disabled={isOtherSide}
                  onClick={() => selectTeam('home', team)}
                >
                  <span className="team-slot">{team.slot}</span>
                  <span className="team-name">{team.name}</span>
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
              return (
                <button
                  key={team.teamID}
                  className={`btn btn-team ${isSelected ? 'selected' : ''} ${isOtherSide ? 'disabled' : ''}`}
                  disabled={isOtherSide}
                  onClick={() => selectTeam('away', team)}
                >
                  <span className="team-slot">{team.slot}</span>
                  <span className="team-name">{team.name}</span>
                </button>
              );
            })}
          </div>
        </div>
      </div>

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
