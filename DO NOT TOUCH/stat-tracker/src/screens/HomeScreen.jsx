import { useState, useEffect } from 'react';
import { useGameDispatch } from '../context/GameContext';
import { fetchLiveGames } from '../data/api';
import { useTranslation } from '../i18n/useTranslation';

function formatQuarter(q) {
  if (q <= 4) return `Q${q}`;
  return `OT${q - 4}`;
}

function formatClock(totalSeconds) {
  const m = Math.floor(totalSeconds / 60);
  const s = totalSeconds % 60;
  return `${m}:${s.toString().padStart(2, '0')}`;
}

export default function HomeScreen() {
  const dispatch = useGameDispatch();
  const { t } = useTranslation();
  const [games, setGames] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(false);
    fetchLiveGames()
      .then((list) => {
        if (cancelled) return;
        // Only show games that are not final AND have trackerState with settings
        const resumable = list.filter(
          (g) => g.boxScore
            && g.boxScore.gameInfo.general.status !== 'final'
            && g.trackerState?.settings,
        );
        setGames(resumable);
        setLoading(false);
      })
      .catch(() => {
        if (cancelled) return;
        setError(true);
        setLoading(false);
      });
    return () => { cancelled = true; };
  }, []);

  function handleResume(game) {
    const ts = game.trackerState;
    dispatch({
      type: 'RESTORE_GAME',
      settings: ts.settings,
      selectedSeason: ts.selectedSeason,
      homeTeam: ts.homeTeam,
      awayTeam: ts.awayTeam,
      boxScore: game.boxScore,
    });
  }

  return (
    <div className="screen home-screen">
      <div className="home-content">
        <h1 className="home-title">{t('home', 'title')}</h1>
        <p className="home-subtitle">{t('home', 'subtitle')}</p>

        {loading && (
          <div className="resume-loading">{t('home', 'loadingGames')}</div>
        )}

        {error && (
          <div className="resume-error">{t('home', 'loadFailed')}</div>
        )}

        {!loading && !error && games.length > 0 && (
          <div className="resume-section">
            <span className="resume-section-label">{t('home', 'activeGames')}</span>
            <div className="resume-list">
              {games.map((game) => {
                const bs = game.boxScore;
                const isActive = bs.gameInfo.state.active;
                return (
                  <div
                    key={game.gameId}
                    className="resume-card"
                    onClick={() => handleResume(game)}
                  >
                    <span className={`resume-status ${isActive ? 'live' : 'stopped'}`}>
                      {isActive ? t('home', 'live') : t('home', 'stopped')}
                    </span>
                    <span className="resume-teams">
                      {bs.teamInfo.home.name}
                      <span className="resume-score">
                        {bs.teamInfo.home.score.current}
                      </span>
                      <span className="resume-vs">{t('home', 'vs')}</span>
                      <span className="resume-score">
                        {bs.teamInfo.away.score.current}
                      </span>
                      {bs.teamInfo.away.name}
                    </span>
                    <span className="resume-quarter">
                      {formatQuarter(bs.gameInfo.state.currentQuarter)} — {formatClock(bs.gameInfo.state.clock.timeLeft)}
                    </span>
                    <button className="btn btn-primary btn-large">{t('home', 'resumeGame')}</button>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        <div className="home-actions">
          <button
            className="btn btn-primary btn-large"
            onClick={() => dispatch({ type: 'SET_STEP', step: 1 })}
          >
            {t('home', 'newGame')}
          </button>
        </div>
      </div>
    </div>
  );
}
