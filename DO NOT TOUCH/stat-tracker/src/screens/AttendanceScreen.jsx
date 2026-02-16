import { useGame, useGameDispatch } from '../context/GameContext';

export default function AttendanceScreen() {
  const game = useGame();
  const dispatch = useGameDispatch();

  const homePresent = game.homeAttendance.size;
  const awayPresent = game.awayAttendance.size;
  const canProceed = homePresent >= 5 && awayPresent >= 5;

  function togglePlayer(side, playerID) {
    dispatch({ type: 'TOGGLE_ATTENDANCE', side, playerID });
  }

  function selectAll(side) {
    dispatch({ type: 'SELECT_ALL_ATTENDANCE', side });
  }

  function clearAll(side) {
    dispatch({ type: 'CLEAR_ATTENDANCE', side });
  }

  function renderTeamRoster(side) {
    const team = side === 'home' ? game.homeTeam : game.awayTeam;
    const attendance = side === 'home' ? game.homeAttendance : game.awayAttendance;

    if (!team) return null;

    if (!team.roster) {
      return (
        <div className="attendance-half">
          <div className="attendance-team-header">
            <h3>{team.name}</h3>
          </div>
          <div className="loading-message">Loading roster...</div>
        </div>
      );
    }

    const allSelected = team.roster.every((p) => attendance.has(p.playerID));

    return (
      <div className="attendance-half">
        <div className="attendance-team-header">
          <h3>{team.name}</h3>
          <div className="attendance-actions">
            <button
              className="btn btn-small"
              onClick={() => (allSelected ? clearAll(side) : selectAll(side))}
            >
              {allSelected ? 'Clear All' : 'Select All'}
            </button>
            <span className="attendance-count">{attendance.size}/{team.roster.length}</span>
          </div>
        </div>
        <div className="player-list">
          {team.roster.map((player) => {
            const present = attendance.has(player.playerID);
            return (
              <button
                key={player.playerID}
                className={`btn btn-player ${present ? 'checked' : ''}`}
                onClick={() => togglePlayer(side, player.playerID)}
              >
                <span className="player-check">{present ? '\u2713' : ''}</span>
                <span className="player-name">{player.name}</span>
              </button>
            );
          })}
        </div>
        {attendance.size > 12 && (
          <p className="attendance-warning">Max 12 players per game. Currently: {attendance.size}</p>
        )}
        {attendance.size > 0 && attendance.size < 5 && (
          <p className="attendance-warning">Need at least 5 players. Currently: {attendance.size}</p>
        )}
      </div>
    );
  }

  return (
    <div className="screen attendance-screen">
      <div className="screen-header">
        <button className="btn btn-back" onClick={() => dispatch({ type: 'SET_STEP', step: 2 })}>
          Back
        </button>
        <h2>Check Attendance</h2>
        <div className="header-spacer" />
      </div>

      <div className="attendance-content">
        {renderTeamRoster('home')}
        <div className="attendance-divider" />
        {renderTeamRoster('away')}
      </div>

      <div className="screen-footer">
        <button
          className="btn btn-primary btn-large"
          disabled={!canProceed}
          onClick={() => dispatch({ type: 'SET_STEP', step: 4 })}
        >
          Next: Correct Numbers
        </button>
        {!canProceed && (
          <p className="footer-hint">Each team needs at least 5 players checked in</p>
        )}
      </div>
    </div>
  );
}
