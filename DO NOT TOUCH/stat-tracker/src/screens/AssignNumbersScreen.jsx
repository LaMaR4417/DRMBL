import { useGame, useGameDispatch } from '../context/GameContext';

export default function AssignNumbersScreen() {
  const game = useGame();
  const dispatch = useGameDispatch();

  function getAttendees(side) {
    const team = side === 'home' ? game.homeTeam : game.awayTeam;
    const attendance = side === 'home' ? game.homeAttendance : game.awayAttendance;
    if (!team || !team.roster) return [];
    return team.roster.filter((p) => attendance.has(p.playerID));
  }

  function getNumber(side, playerID) {
    const overrides = side === 'home' ? game.homeNumberOverrides : game.awayNumberOverrides;
    return overrides[playerID] ?? '';
  }

  function setNumber(side, playerID, value) {
    if (value === '') {
      dispatch({ type: 'CLEAR_NUMBER_OVERRIDE', side, playerID });
    } else {
      dispatch({ type: 'SET_NUMBER_OVERRIDE', side, playerID, number: value });
    }
  }

  const homeAttendees = getAttendees('home');
  const awayAttendees = getAttendees('away');
  const homeAllAssigned = homeAttendees.every((p) => getNumber('home', p.playerID) !== '');
  const awayAllAssigned = awayAttendees.every((p) => getNumber('away', p.playerID) !== '');
  const canProceed = homeAllAssigned && awayAllAssigned;

  function renderSide(side) {
    const team = side === 'home' ? game.homeTeam : game.awayTeam;
    const attendees = side === 'home' ? homeAttendees : awayAttendees;

    if (!team) return null;

    return (
      <div className="numbers-half">
        <div className="numbers-team-header">
          <h3>{team.name}</h3>
        </div>
        <div className="numbers-list">
          {attendees.map((player) => (
            <div key={player.playerID} className="number-row">
              <span className="number-player-name">{player.name}</span>
              <input
                className="number-input"
                type="number"
                min="0"
                max="99"
                placeholder="#"
                value={getNumber(side, player.playerID)}
                onChange={(e) => setNumber(side, player.playerID, e.target.value)}
              />
            </div>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="screen numbers-screen">
      <div className="screen-header">
        <button className="btn btn-back" onClick={() => dispatch({ type: 'SET_STEP', step: 3 })}>
          Back
        </button>
        <h2>Assign Numbers</h2>
        <div className="header-spacer" />
      </div>

      <div className="numbers-content">
        {renderSide('home')}
        <div className="numbers-divider" />
        {renderSide('away')}
      </div>

      <div className="screen-footer">
        <button
          className="btn btn-primary btn-large"
          disabled={!canProceed}
          onClick={() => dispatch({ type: 'SET_STEP', step: 5 })}
        >
          Next: Pick Starters
        </button>
        {!canProceed && (
          <p className="footer-hint">Every player needs a number assigned</p>
        )}
      </div>
    </div>
  );
}
