import { useState, useEffect } from 'react';
import { useGameDispatch } from '../context/GameContext';
import { fetchLiveGames, deleteLiveGame } from '../data/api';
import { startAllStarFlow } from '../data/allStars';
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
      selectedLeague: ts.selectedLeague || null,
      selectedSeason: ts.selectedSeason,
      selectedGame: ts.selectedGame || null,
      allStarMode: !!ts.allStarMode,
      homeTeam: ts.homeTeam,
      awayTeam: ts.awayTeam,
      boxScore: game.boxScore,
    });
  }

  async function handleKill(game) {
    const home = game.boxScore?.teamInfo?.home?.name || 'Home';
    const away = game.boxScore?.teamInfo?.away?.name || 'Away';
    const confirmed = window.confirm(
      `Permanently delete the live game "${home} vs ${away}"? This removes it from the Live Games container — there's no undo.`
    );
    if (!confirmed) return;
    try {
      await deleteLiveGame(game.gameId);
      setGames((prev) => prev.filter((g) => g.gameId !== game.gameId));
    } catch (e) {
      window.alert('Failed to delete game: ' + (e?.message || 'unknown error'));
    }
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
                    <div className="resume-card-actions">
                      <button className="btn btn-primary btn-large" onClick={(e) => { e.stopPropagation(); handleResume(game); }}>
                        {t('home', 'resumeGame')}
                      </button>
                      <button
                        type="button"
                        className="btn btn-kill"
                        title="Delete this live game"
                        onClick={(e) => { e.stopPropagation(); handleKill(game); }}
                      >
                        Kill
                      </button>
                    </div>
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
          <button
            className="btn btn-large btn-allstar"
            onClick={() => startAllStarFlow(dispatch)}
          >
            {'⭐'} {t('home', 'allStarGame')}
          </button>
        </div>
      </div>
    </div>
  );
}
