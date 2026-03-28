import { useState, useEffect, useRef } from 'react';
import { useGame, useGameDispatch } from '../context/GameContext';
import { syncLiveGame, saveEndGame, deleteLiveGame } from '../data/api';

export default function SimpleGameScreen() {
  const game = useGame();
  const dispatch = useGameDispatch();

  // Screen phase: 'playing' | 'confirming' | 'submitted'
  const [phase, setPhase] = useState('playing');
  const [saveStatus, setSaveStatus] = useState(null);
  const [saveError, setSaveError] = useState(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [lastAction, setLastAction] = useState(null);
  const [editingSide, setEditingSide] = useState(null);
  const [editValue, setEditValue] = useState('');

  function handleScore(side, points) {
    dispatch({ type: 'ADD_POINTS', side, points });
    setLastAction({ side, points, key: Date.now() });
  }

  function startEdit(side) {
    if (phase !== 'playing') return;
    setEditingSide(side);
    setEditValue(String(side === 'home' ? game.homeScore : game.awayScore));
  }

  function commitEdit() {
    if (!editingSide) return;
    const num = parseInt(editValue, 10);
    if (!isNaN(num) && num >= 0) {
      const current = editingSide === 'home' ? game.homeScore : game.awayScore;
      const diff = num - current;
      if (diff !== 0) dispatch({ type: 'ADD_POINTS', side: editingSide, points: diff });
    }
    setEditingSide(null);
    setEditValue('');
  }

  function cancelEdit() {
    setEditingSide(null);
    setEditValue('');
  }

  const homeName = game.homeTeam?.name || 'Home';
  const awayName = game.awayTeam?.name || 'Away';
  const homeWins = game.homeScore > game.awayScore;
  const awayWins = game.awayScore > game.homeScore;
  const tied = game.homeScore === game.awayScore;

  // Division label
  const divisionLabel = (() => {
    const league = game.selectedSeason?.league;
    if (!league) return null;
    const abbr = league.abbreviation || '';
    const divs = league.divisions;
    if (!divs || typeof divs === 'string') return abbr ? `${abbr} — ${divs || ''}` : null;
    const parts = [];
    for (const [gender, cats] of Object.entries(divs)) {
      if (Array.isArray(cats)) parts.push(`${gender}: ${cats.join(', ')}`);
    }
    return parts.length > 0 ? `${abbr} — ${parts.join(' | ')}` : abbr;
  })();

  // Build box score
  function buildBoxScore(status) {
    const now = new Date();
    const isFinal = status === 'final';
    return {
      id: `${homeName} vs. ${awayName} - ${now.toISOString()}`,
      gameId: game.gameId,
      type: 'simple',
      season: game.selectedSeason?.id || null,
      league: game.selectedSeason?.league || null,
      gameInfo: {
        general: {
          timestamp: now.toISOString(),
          date: now.toLocaleDateString(),
          time: now.toLocaleTimeString(),
          location: game.selectedGame?.location || null,
          status: status,
        },
        state: {
          active: !isFinal,
          currentQuarter: game.currentQuarter,
          clock: { timeLeft: 0, perQuarter: 0, perOT: 0 },
          winner: isFinal ? (game.homeScore >= game.awayScore ? 'home' : 'away') : null,
          loser: isFinal ? (game.homeScore >= game.awayScore ? 'away' : 'home') : null,
          overtimes: Math.max(0, game.currentQuarter - 4),
          possession: null,
          possessionArrow: null,
        },
      },
      teamInfo: {
        home: {
          name: homeName,
          score: { current: game.homeScore, perQuarter: {} },
          stats: {},
          roster: { full: [], inGame: [] },
        },
        away: {
          name: awayName,
          score: { current: game.awayScore, perQuarter: {} },
          stats: {},
          roster: { full: [], inGame: [] },
        },
      },
      tipOffWinner: null,
    };
  }

  // Live sync on score/quarter change
  const syncTimeout = useRef(null);
  useEffect(() => {
    if (!game.gameId || phase !== 'playing') return;
    clearTimeout(syncTimeout.current);
    syncTimeout.current = setTimeout(() => {
      syncLiveGame(game.gameId, buildBoxScore('in-progress'), {
        selectedLeague: game.selectedLeague,
        selectedSeason: game.selectedSeason ? { id: game.selectedSeason.id, league: game.selectedSeason.league } : null,
        selectedGame: game.selectedGame,
        homeTeam: game.homeTeam,
        awayTeam: game.awayTeam,
      });
    }, 500);
    return () => clearTimeout(syncTimeout.current);
  }, [game.homeScore, game.awayScore, game.currentQuarter]);

  // Submit game (only when user confirms)
  function handleConfirmSubmit() {
    setSaveStatus('saving');
    const bs = buildBoxScore('final');
    saveEndGame(bs, game.homeTeam?.teamID, game.awayTeam?.teamID, game.homeTeam?.slot, game.awayTeam?.slot, game.selectedSeason?.id, game.selectedGame?.id)
      .then(() => {
        setSaveStatus('saved');
        setPhase('submitted');
        dispatch({ type: 'END_GAME' });
      })
      .catch((err) => { setSaveStatus('error'); setSaveError(err.message); });
  }

  function handleDelete() {
    if (game.gameId) deleteLiveGame(game.gameId).catch(() => {});
    dispatch({ type: 'RESET' });
  }

  // ── PLAYING PHASE ──
  if (phase === 'playing') {
    return (
      <div className="screen simple-game-screen">
        {divisionLabel && <div className="simple-division-bar">{divisionLabel}</div>}

        <div className="simple-scoreboard">
          <div className="simple-side home">
            <span className="simple-team-name">{homeName}</span>
            {editingSide === 'home' ? (
              <div className="simple-score-edit">
                <input className="simple-score-input" type="number" min="0" value={editValue}
                  onChange={(e) => setEditValue(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter') commitEdit(); if (e.key === 'Escape') cancelEdit(); }}
                  autoFocus />
                <div className="simple-score-edit-actions">
                  <button className="btn btn-small btn-edit-ok" onClick={commitEdit}>OK</button>
                  <button className="btn btn-small btn-edit-cancel" onClick={cancelEdit}>Cancel</button>
                </div>
              </div>
            ) : (
              <span className="simple-score" onClick={() => startEdit('home')}>{game.homeScore}</span>
            )}
            {lastAction?.side === 'home' && (
              <span key={lastAction.key} className={`score-flash ${lastAction.points > 0 ? 'add' : 'sub'}`}>
                {lastAction.points > 0 ? '+' : ''}{lastAction.points}
              </span>
            )}
            {editingSide !== 'home' && (
              <div className="simple-controls">
                <div className="simple-controls-row">
                  <button className="btn btn-score-add" onClick={() => handleScore('home', 1)}>+1</button>
                  <button className="btn btn-score-add" onClick={() => handleScore('home', 2)}>+2</button>
                  <button className="btn btn-score-add" onClick={() => handleScore('home', 3)}>+3</button>
                </div>
                <div className="simple-controls-row">
                  <button className="btn btn-score-sub" onClick={() => handleScore('home', -1)}>-1</button>
                  <button className="btn btn-score-sub" onClick={() => handleScore('home', -2)}>-2</button>
                  <button className="btn btn-score-sub" onClick={() => handleScore('home', -3)}>-3</button>
                </div>
              </div>
            )}
          </div>

          <div className="simple-divider">
            <span className="simple-quarter">
              {game.currentQuarter <= 4 ? `Q${game.currentQuarter}` : `OT${game.currentQuarter - 4}`}
            </span>
            <div className="simple-quarter-controls">
              <button className="btn btn-quarter" onClick={() => dispatch({ type: 'ADVANCE_QUARTER' })}>&#9654;</button>
              <button className="btn btn-quarter" disabled={game.currentQuarter <= 1} onClick={() => dispatch({ type: 'REVERT_QUARTER' })}>&#9664;</button>
            </div>
          </div>

          <div className="simple-side away">
            <span className="simple-team-name">{awayName}</span>
            {editingSide === 'away' ? (
              <div className="simple-score-edit">
                <input className="simple-score-input" type="number" min="0" value={editValue}
                  onChange={(e) => setEditValue(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter') commitEdit(); if (e.key === 'Escape') cancelEdit(); }}
                  autoFocus />
                <div className="simple-score-edit-actions">
                  <button className="btn btn-small btn-edit-ok" onClick={commitEdit}>OK</button>
                  <button className="btn btn-small btn-edit-cancel" onClick={cancelEdit}>Cancel</button>
                </div>
              </div>
            ) : (
              <span className="simple-score" onClick={() => startEdit('away')}>{game.awayScore}</span>
            )}
            {lastAction?.side === 'away' && (
              <span key={lastAction.key} className={`score-flash ${lastAction.points > 0 ? 'add' : 'sub'}`}>
                {lastAction.points > 0 ? '+' : ''}{lastAction.points}
              </span>
            )}
            {editingSide !== 'away' && (
              <div className="simple-controls">
                <div className="simple-controls-row">
                  <button className="btn btn-score-add" onClick={() => handleScore('away', 1)}>+1</button>
                  <button className="btn btn-score-add" onClick={() => handleScore('away', 2)}>+2</button>
                  <button className="btn btn-score-add" onClick={() => handleScore('away', 3)}>+3</button>
                </div>
                <div className="simple-controls-row">
                  <button className="btn btn-score-sub" onClick={() => handleScore('away', -1)}>-1</button>
                  <button className="btn btn-score-sub" onClick={() => handleScore('away', -2)}>-2</button>
                  <button className="btn btn-score-sub" onClick={() => handleScore('away', -3)}>-3</button>
                </div>
              </div>
            )}
          </div>
        </div>

        <div className="simple-footer">
          <div className="simple-footer-actions">
            <button className="btn btn-end-game" onClick={() => setPhase('confirming')}>End Game</button>
            {!confirmDelete ? (
              <button className="btn btn-delete-game" onClick={() => setConfirmDelete(true)}>Delete Game</button>
            ) : (
              <div className="delete-confirm">
                <span className="delete-confirm-label">Delete this game?</span>
                <button className="btn btn-delete-confirm" onClick={handleDelete}>Yes, Delete</button>
                <button className="btn btn-delete-cancel" onClick={() => setConfirmDelete(false)}>Cancel</button>
              </div>
            )}
          </div>
        </div>
      </div>
    );
  }

  // ── CONFIRMING PHASE ──
  if (phase === 'confirming') {
    return (
      <div className="screen simple-game-screen">
        {divisionLabel && <div className="simple-division-bar">{divisionLabel}</div>}

        <div className="confirm-screen">
          <h2 className="confirm-title">Confirm Final Score</h2>

          <div className="confirm-scoreboard">
            <div className={`confirm-team ${homeWins ? 'winner' : ''}`}>
              <span className="confirm-team-name">{homeName}</span>
              <span className="confirm-team-score">{game.homeScore}</span>
              {homeWins && <span className="confirm-winner-badge">W</span>}
            </div>
            <div className="confirm-vs">
              <span>{game.currentQuarter <= 4 ? `Q${game.currentQuarter}` : `OT${game.currentQuarter - 4}`}</span>
              {tied && <span className="confirm-tied">TIED</span>}
            </div>
            <div className={`confirm-team ${awayWins ? 'winner' : ''}`}>
              <span className="confirm-team-name">{awayName}</span>
              <span className="confirm-team-score">{game.awayScore}</span>
              {awayWins && <span className="confirm-winner-badge">W</span>}
            </div>
          </div>

          {tied && (
            <div className="confirm-warning">Score is tied. Go back to add overtime if needed.</div>
          )}

          {saveStatus === 'error' && (
            <div className="confirm-error">
              {saveError || 'Failed to save'}
              <button className="btn btn-small" onClick={handleConfirmSubmit}>Retry</button>
            </div>
          )}

          <div className="confirm-actions">
            <button className="btn btn-confirm-back" onClick={() => { setPhase('playing'); setSaveStatus(null); setSaveError(null); }}>
              Go Back
            </button>
            <button className="btn btn-confirm-submit" disabled={saveStatus === 'saving'} onClick={handleConfirmSubmit}>
              {saveStatus === 'saving' ? 'Submitting...' : 'Confirm & Submit'}
            </button>
          </div>
        </div>
      </div>
    );
  }

  // ── SUBMITTED PHASE ──
  return (
    <div className="screen simple-game-screen">
      {divisionLabel && <div className="simple-division-bar">{divisionLabel}</div>}

      <div className="confirm-screen">
        <span className="submitted-label">FINAL</span>

        <div className="confirm-scoreboard">
          <div className={`confirm-team ${homeWins ? 'winner' : ''}`}>
            <span className="confirm-team-name">{homeName}</span>
            <span className="confirm-team-score">{game.homeScore}</span>
            {homeWins && <span className="confirm-winner-badge">W</span>}
          </div>
          <div className="confirm-vs">—</div>
          <div className={`confirm-team ${awayWins ? 'winner' : ''}`}>
            <span className="confirm-team-name">{awayName}</span>
            <span className="confirm-team-score">{game.awayScore}</span>
            {awayWins && <span className="confirm-winner-badge">W</span>}
          </div>
        </div>

        <span className="save-indicator saved">Game Saved</span>

        <button className="btn btn-primary btn-large" onClick={() => dispatch({ type: 'RESET' })}>
          New Game
        </button>
      </div>
    </div>
  );
}
