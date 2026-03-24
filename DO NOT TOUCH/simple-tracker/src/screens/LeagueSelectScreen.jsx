import { useState, useEffect } from 'react';
import { useGameDispatch } from '../context/GameContext';
import { fetchLeagues } from '../data/api';

export default function LeagueSelectScreen() {
  const dispatch = useGameDispatch();
  const [leagues, setLeagues] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    let cancelled = false;
    fetchLeagues()
      .then((data) => { if (!cancelled) setLeagues(data); })
      .catch((err) => { if (!cancelled) setError(err.message); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, []);

  function handleSelect(league) {
    dispatch({ type: 'SET_LEAGUE', league });
    dispatch({ type: 'SET_STEP', step: 2 });
  }

  return (
    <div className="screen">
      <div className="screen-header">
        <button className="btn btn-back" onClick={() => dispatch({ type: 'SET_STEP', step: 0 })}>Back</button>
        <h2>Select League</h2>
        <div className="header-spacer" />
      </div>
      {loading && <div className="loading-message">Loading leagues...</div>}
      {error && <div className="error-message"><p>{error}</p></div>}
      {!loading && !error && (
        <div className="league-list">
          {leagues.map((lg) => (
            <button key={lg.id} className="btn btn-league" onClick={() => handleSelect(lg)}>
              <span className="league-abbr">{lg.id}</span>
              <span className="league-name">{lg.league?.fullName || lg.id}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
