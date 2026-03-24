import { useState, useEffect } from 'react';
import { useGameDispatch } from '../context/GameContext';
import { fetchLeagues } from '../data/api';
import { useTranslation } from '../i18n/useTranslation';

export default function LeagueSelectScreen() {
  const dispatch = useGameDispatch();
  const { t } = useTranslation();

  const [leagues, setLeagues] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);

    fetchLeagues()
      .then((data) => {
        if (!cancelled) setLeagues(data);
      })
      .catch((err) => {
        if (!cancelled) setError(err.message);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => { cancelled = true; };
  }, []);

  function handleSelect(league) {
    dispatch({ type: 'SET_LEAGUE', league });
    dispatch({ type: 'SET_STEP', step: 2 });
  }

  return (
    <div className="screen league-select-screen">
      <div className="screen-header">
        <button className="btn btn-back" onClick={() => dispatch({ type: 'SET_STEP', step: 0 })}>
          {t('common', 'back')}
        </button>
        <h2>{t('leagueSelect', 'screenTitle')}</h2>
        <div className="header-spacer" />
      </div>

      {loading && (
        <div className="loading-message">{t('leagueSelect', 'loading')}</div>
      )}

      {error && (
        <div className="error-message">
          <p>{error}</p>
          <button className="btn btn-primary" onClick={() => window.location.reload()}>
            {t('common', 'retry')}
          </button>
        </div>
      )}

      {!loading && !error && leagues.length === 0 && (
        <div className="empty-message">{t('leagueSelect', 'noLeagues')}</div>
      )}

      {!loading && !error && leagues.length > 0 && (
        <div className="league-list">
          {leagues.map((lg) => (
            <button
              key={lg.id}
              className="btn btn-league"
              onClick={() => handleSelect(lg)}
            >
              <span className="league-abbr">{lg.id}</span>
              <span className="league-name">{lg.league?.fullName || lg.id}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
