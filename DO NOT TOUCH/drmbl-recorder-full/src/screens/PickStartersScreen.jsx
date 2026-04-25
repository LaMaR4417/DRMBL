import { useGame, useGameDispatch } from '../context/GameContext';

export default function PickStartersScreen() {
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

  const homeStarters = game.homeStarters;
  const awayStarters = game.awayStarters;
  const canProceed = homeStarters.size === 5 && awayStarters.size === 5;

  function renderSide(side) {
    const team = side === 'home' ? game.homeTeam : game.awayTeam;
    const starters = side === 'home' ? homeStarters : awayStarters;
    const attendees = getAttendees(side);

    if (!team) return null;

    return (
      <div className="starters-half">
        <div className="starters-team-header">
          <h3>{team.name}</h3>
          <span className="starters-count">{starters.size}/5</span>
        </div>
        <div className="starters-list">
          {attendees.map((player) => {
            const isStarter = starters.has(player.playerID);
            const isFull = starters.size >= 5 && !isStarter;
            return (
              <button
                key={player.playerID}
                className={`btn btn-player ${isStarter ? 'starter' : ''} ${isFull ? 'disabled' : ''}`}
                disabled={isFull}
                onClick={() => dispatch({ type: 'TOGGLE_STARTER', side, playerID: player.playerID })}
              >
                <span className="player-check">{isStarter ? '\u2713' : ''}</span>
                <span className="player-number">#{getNumber(side, player.playerID)}</span>
                <span className="player-name">{player.name}</span>
              </button>
            );
          })}
        </div>
      </div>
    );
  }

  return (
    <div className="screen starters-screen">
      <div className="screen-header">
        <button className="btn btn-back" onClick={() => dispatch({ type: 'SET_STEP', step: 3 })}>
          Back
        </button>
        <h2>Pick Starters</h2>
        <div className="header-spacer" />
      </div>

      <div className="starters-content">
        {renderSide('home')}
        <div className="starters-divider" />
        {renderSide('away')}
      </div>

      <div className="screen-footer">
        <button
          className="btn btn-primary btn-large"
          disabled={!canProceed}
          onClick={() => dispatch({ type: 'SET_STEP', step: 6 })}
        >
          Next: Tip-Off
        </button>
        {!canProceed && (
          <p className="footer-hint">Select 5 starters per team</p>
        )}
      </div>
    </div>
  );
}
