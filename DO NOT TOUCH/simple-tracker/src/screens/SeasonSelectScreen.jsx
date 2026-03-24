import { useState, useEffect } from 'react';
import { useGame, useGameDispatch } from '../context/GameContext';
import { fetchSeasons } from '../data/api';

export default function SeasonSelectScreen() {
  const game = useGame();
  const dispatch = useGameDispatch();
  const [seasons, setSeasons] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const leagueId = game.selectedLeague?.id;

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    fetchSeasons()
      .then((data) => {
        if (cancelled) return;
        const filtered = leagueId
          ? data.filter((s) => s.league?.abbreviation === leagueId)
          : data;
        setSeasons(filtered);
      })
      .catch((err) => { if (!cancelled) setError(err.message); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [leagueId]);

  function handleSelect(season) {
    dispatch({ type: 'SET_SEASON', season });
    dispatch({ type: 'SET_STEP', step: 3 });
  }

  return (
    <div className="screen">
      <div className="screen-header">
        <button className="btn btn-back" onClick={() => dispatch({ type: 'SET_STEP', step: 1 })}>Back</button>
        <h2>Select Season</h2>
        <div className="header-spacer" />
      </div>
      {loading && <div className="loading-message">Loading seasons...</div>}
      {error && <div className="error-message"><p>{error}</p></div>}
      {!loading && !error && (
        <div className="season-list">
          {seasons.map((s) => (
            <button key={s.id} className="btn btn-season-card" onClick={() => handleSelect(s)}>
              <span className="season-card-name">{s.id}</span>
              <span className="season-card-info">{s.teamCount} teams</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
