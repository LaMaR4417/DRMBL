import { useState, useEffect } from 'react';
import { useGameDispatch } from '../context/GameContext';
import { fetchActiveDrmblSeason, fetchSeasonGames, fetchBoxScoreById, fetchGameSettings } from '../data/api';

function formatDate(d) {
  if (!d) return '';
  if (typeof d === 'string') return d;
  if (d.year && d.month && d.date) {
    return `${d.month}/${d.date}/${d.year}`;
  }
  return '';
}

function dateKey(d) {
  if (!d || typeof d !== 'object') return 0;
  return (d.year || 0) * 10000 + (d.month || 0) * 100 + (d.date || 0);
}

export default function GamePickerScreen() {
  const dispatch = useGameDispatch();
  const [season, setSeason] = useState(null);
  const [games, setGames] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [loadingId, setLoadingId] = useState(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    fetchActiveDrmblSeason()
      .then(async (seasonData) => {
        if (cancelled) return;
        if (!seasonData) {
          setError('No active DRMBL season found.');
          setLoading(false);
          return;
        }
        setSeason(seasonData);
        const allGames = await fetchSeasonGames(seasonData.id);
        if (cancelled) return;
        const final = allGames
          .filter((g) => g.status === 'final')
          .sort((a, b) => dateKey(b.weekDate) - dateKey(a.weekDate));
        setGames(final);
        setLoading(false);
      })
      .catch((e) => {
        if (cancelled) return;
        setError(e.message || 'Failed to load season');
        setLoading(false);
      });
    return () => { cancelled = true; };
  }, []);

  async function handlePickGame(game) {
    if (!game.id || !season) return;
    setLoadingId(game.id);
    try {
      const [boxScore, presets] = await Promise.all([
        fetchBoxScoreById(game.id),
        fetchGameSettings(),
      ]);
      if (!boxScore) throw new Error('Box score not found');
      const settings = structuredClone(presets[0]); // DRMBL default preset
      // Resolve slot info from season teams[] for the schedule-update fallback
      const slotByName = {};
      for (const t of (season.teams || [])) {
        if (t.name && t.slot) slotByName[t.name] = t.slot;
      }
      const homeName = boxScore.teamInfo.home.name;
      const awayName = boxScore.teamInfo.away.name;
      dispatch({
        type: 'LOAD_BOX_SCORE',
        boxScore,
        settings,
        seasonId: season.id,
        selectedGameId: game.id,
        homeTeam: { name: homeName, teamID: boxScore.homeTeamID || null, slot: slotByName[homeName] || null },
        awayTeam: { name: awayName, teamID: boxScore.awayTeamID || null, slot: slotByName[awayName] || null },
      });
    } catch (e) {
      window.alert('Failed to load game: ' + (e?.message || 'unknown error'));
      setLoadingId(null);
    }
  }

  return (
    <div className="screen home-screen">
      <div className="home-content">
        <h1 className="home-title">Retro-Fill</h1>
        <p className="home-subtitle">
          Pick a completed game to edit. Stats are wiped (scores preserved as targets) before re-tracking.
        </p>

        {loading && <div className="resume-loading">Loading games…</div>}
        {error && <div className="resume-error">{error}</div>}

        {!loading && !error && games.length === 0 && (
          <div className="resume-loading">No completed games in this season yet.</div>
        )}

        {!loading && !error && games.length > 0 && (
          <div className="resume-section">
            <span className="resume-section-label">
              {season ? `${season.id} — ${games.length} games` : 'Completed games'}
            </span>
            <div className="resume-list">
              {games.map((game) => (
                <div
                  key={game.id}
                  className="resume-card"
                  onClick={() => handlePickGame(game)}
                >
                  <span className="resume-status">FINAL</span>
                  <span className="resume-teams">
                    {game.away}
                    <span className="resume-score">{game.awayScore}</span>
                    <span className="resume-vs">@</span>
                    <span className="resume-score">{game.homeScore}</span>
                    {game.home}
                  </span>
                  <span className="resume-quarter">
                    {game.week ? `Week ${game.week} — ` : ''}{formatDate(game.weekDate)}
                  </span>
                  <div className="resume-card-actions">
                    <button
                      className="btn btn-primary btn-large"
                      disabled={loadingId === game.id}
                      onClick={(e) => { e.stopPropagation(); handlePickGame(game); }}
                    >
                      {loadingId === game.id ? 'Loading…' : 'Edit'}
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
