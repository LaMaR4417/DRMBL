import { useState, useEffect } from 'react';
import { useGameDispatch } from '../context/GameContext';
import { fetchLiveGames } from '../data/api';

export default function HomeScreen() {
  const dispatch = useGameDispatch();
  const [games, setGames] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    fetchLiveGames()
      .then((list) => {
        if (cancelled) return;
        const resumable = list.filter(
          (g) => g.boxScore && g.boxScore.gameInfo.general.status !== 'final',
        );
        setGames(resumable);
      })
      .catch(() => {})
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, []);

  function handleResume(game) {
    const ts = game.trackerState || {};
    const bs = game.boxScore;
    dispatch({
      type: 'RESTORE_GAME',
      selectedLeague: ts.selectedLeague,
      selectedSeason: ts.selectedSeason,
      selectedGame: ts.selectedGame,
      homeTeam: ts.homeTeam,
      awayTeam: ts.awayTeam,
      homeScore: bs.teamInfo.home.score.current,
      awayScore: bs.teamInfo.away.score.current,
      currentQuarter: bs.gameInfo.state.currentQuarter || 1,
      gameId: game.gameId,
    });
  }

  return (
    <div className="screen home-screen">
      <div className="home-content">
        <h1 className="home-title">SIMPLE TRACKER</h1>
        <p className="home-subtitle">Quick Scorekeeping</p>

        {loading && <div className="resume-loading">Loading active games...</div>}

        {!loading && games.length > 0 && (
          <div className="resume-section">
            <span className="resume-section-label">Active Games</span>
            <div className="resume-list">
              {games.map((game) => {
                const bs = game.boxScore;
                return (
                  <div key={game.gameId} className="resume-card" onClick={() => handleResume(game)}>
                    <span className="resume-status live">LIVE</span>
                    <span className="resume-teams">
                      {bs.teamInfo.home.name}
                      <span className="resume-score">{bs.teamInfo.home.score.current}</span>
                      <span className="resume-vs">vs</span>
                      <span className="resume-score">{bs.teamInfo.away.score.current}</span>
                      {bs.teamInfo.away.name}
                    </span>
                    <button className="btn btn-primary btn-large">Resume Game</button>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        <div className="home-actions">
          <button className="btn btn-primary btn-large" onClick={() => dispatch({ type: 'SET_STEP', step: 1 })}>
            New Game
          </button>
        </div>
      </div>
    </div>
  );
}
