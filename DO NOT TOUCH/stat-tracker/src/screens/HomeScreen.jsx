import { useGameDispatch } from '../context/GameContext';

export default function HomeScreen() {
  const dispatch = useGameDispatch();

  return (
    <div className="screen home-screen">
      <div className="home-content">
        <h1 className="home-title">STAT TRACKER</h1>
        <p className="home-subtitle">Basketball Scorekeeping App</p>
        <div className="home-actions">
          <button
            className="btn btn-primary btn-large"
            onClick={() => dispatch({ type: 'SET_STEP', step: 1 })}
          >
            New Game
          </button>
        </div>
      </div>
    </div>
  );
}
