import { useState } from 'react';
import { useGame, useGameDispatch } from '../context/GameContext';

export default function TipOffScreen() {
  const game = useGame();
  const dispatch = useGameDispatch();
  const isManual = game.settings.tipOff.possessionRule === 'manual';
  const [tipWinner, setTipWinner] = useState(null);

  function selectWinner(winner) {
    if (isManual) {
      setTipWinner(winner);
      dispatch({ type: 'SET_TIP_OFF_WINNER', winner });
    } else {
      dispatch({ type: 'SET_TIP_OFF_WINNER', winner });
      dispatch({ type: 'SET_FIRST_POSSESSION', side: winner });
      dispatch({ type: 'INIT_BOX_SCORE' });
      dispatch({ type: 'SET_STEP', step: 7 });
    }
  }

  function selectPossession(side) {
    dispatch({ type: 'SET_FIRST_POSSESSION', side });
    dispatch({ type: 'INIT_BOX_SCORE' });
    dispatch({ type: 'SET_STEP', step: 7 });
  }

  return (
    <div className="screen tipoff-screen">
      <div className="screen-header">
        <button className="btn btn-back" onClick={() => {
          if (tipWinner) {
            setTipWinner(null);
          } else {
            dispatch({ type: 'SET_STEP', step: 3 });
          }
        }}>
          Back
        </button>
        <h2>Tip-Off</h2>
        <div className="header-spacer" />
      </div>

      <div className="tipoff-content">
        {!tipWinner ? (
          <>
            <p className="tipoff-prompt">Who wins the tip?</p>
            <div className="tipoff-choices">
              <button className="btn btn-tipoff" onClick={() => selectWinner('home')}>
                <span className="tipoff-team-name">{game.homeTeam?.name}</span>
                <span className="tipoff-label">Home</span>
              </button>
              <button className="btn btn-tipoff" onClick={() => selectWinner('away')}>
                <span className="tipoff-team-name">{game.awayTeam?.name}</span>
                <span className="tipoff-label">Away</span>
              </button>
            </div>
          </>
        ) : (
          <>
            <p className="tipoff-prompt">Who gained possession?</p>
            <p className="tipoff-hint">
              {tipWinner === 'home' ? game.homeTeam?.name : game.awayTeam?.name} won the tip.
              Who ended up with the ball?
            </p>
            <div className="tipoff-choices">
              <button className="btn btn-tipoff" onClick={() => selectPossession('home')}>
                <span className="tipoff-team-name">{game.homeTeam?.name}</span>
                <span className="tipoff-label">Home</span>
              </button>
              <button className="btn btn-tipoff" onClick={() => selectPossession('away')}>
                <span className="tipoff-team-name">{game.awayTeam?.name}</span>
                <span className="tipoff-label">Away</span>
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
