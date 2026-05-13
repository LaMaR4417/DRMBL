import { useState, useEffect } from 'react';
import { useGame, useGameDispatch } from '../context/GameContext';
import { fetchSeasons } from '../data/api';
import { useTranslation } from '../i18n/useTranslation';

export default function SeasonSelectScreen() {
  const game = useGame();
  const dispatch = useGameDispatch();
  const { t } = useTranslation();

  const [seasons, setSeasons] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const leagueId = game.selectedLeague?.id;

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);

    fetchSeasons()
      .then((data) => {
        if (cancelled) return;
        // Filter seasons to only those belonging to the selected league
        const filtered = leagueId
          ? data.filter((s) => s.league?.abbreviation === leagueId)
          : data;
        setSeasons(filtered);
      })
      .catch((err) => {
        if (!cancelled) setError(err.message);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => { cancelled = true; };
  }, [leagueId]);

  function handleSelect(season) {
    dispatch({ type: 'SET_SEASON', season });
    dispatch({ type: 'SET_STEP', step: 3 });
  }

  return (
    <div className="screen season-select-screen">
      <div className="screen-header">
        <button className="btn btn-back" onClick={() => dispatch({ type: 'SET_STEP', step: 1 })}>
          {t('common', 'back')}
        </button>
        <h2>{t('seasonSelect', 'screenTitle')}</h2>
        <div className="header-spacer" />
      </div>

      {loading && (
        <div className="loading-message">{t('seasonSelect', 'loading')}</div>
      )}

      {error && (
        <div className="error-message">
          <p>{error}</p>
          <button className="btn btn-primary" onClick={() => window.location.reload()}>
            {t('common', 'retry')}
          </button>
        </div>
      )}

      {!loading && !error && seasons.length === 0 && (
        <div className="empty-message">{t('seasonSelect', 'noSeasons')}</div>
      )}

      {!loading && !error && seasons.length > 0 && (
        <div className="season-list">
          {seasons.map((season) => (
            <button
              key={season.id}
              className="btn btn-season-card"
              onClick={() => handleSelect(season)}
            >
              <span className="season-card-name">{season.id}</span>
              <span className="season-card-info">
                {season.teamCount} {t('seasonSelect', 'teams')}
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
