import { useState, useEffect, useRef } from 'react';
import { useGame, useGameDispatch, useLiveSync } from '../context/GameContext';
import { useTranslation } from '../i18n/useTranslation';

const WARMUP_DEFAULT_SECONDS = 5 * 60;

function formatWarmup(seconds) {
  const t = Math.max(0, seconds || 0);
  const m = Math.floor(t / 60);
  const s = Math.floor(t % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
}

export default function TipOffOverlay() {
  const game = useGame();
  const dispatch = useGameDispatch();
  const liveSync = useLiveSync();
  const { t } = useTranslation();

  const isManual = game.settings?.tipOff?.possessionRule === 'manual';
  const [tipWinner, setTipWinner] = useState(null);
  // warmupRunning is local — only the countdown number is shared via reducer state
  // (game.warmupCountdown) so GameScreen can override its main-clock display.
  const [warmupRunning, setWarmupRunning] = useState(false);
  // Set true once the warm-up either expires naturally or is reset post-run; we
  // hide the warm-up controls after that since the next action is to pick the
  // tip-off winner (which itself starts the game).
  const [warmupCompleted, setWarmupCompleted] = useState(false);
  // Initialize the reducer countdown to the default on mount if it's not set.
  // Reset on unmount (i.e., user clicks Start Game / leaves overlay).
  const initRef = useRef(false);
  useEffect(() => {
    if (initRef.current) return undefined;
    initRef.current = true;
    if (game.warmupCountdown == null) {
      dispatch({ type: 'SET_WARMUP_COUNTDOWN', value: WARMUP_DEFAULT_SECONDS });
    }
    return () => {
      dispatch({ type: 'SET_WARMUP_COUNTDOWN', value: null });
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const warmupLeft = game.warmupCountdown != null ? game.warmupCountdown : WARMUP_DEFAULT_SECONDS;

  // Warm-up countdown (sub-second precision via performance.now delta).
  // Reducer reads its own latest value, so we don't have stale-closure issues.
  useEffect(() => {
    if (!warmupRunning) return undefined;
    let lastTick = performance.now();
    const id = setInterval(() => {
      const now = performance.now();
      const delta = (now - lastTick) / 1000;
      lastTick = now;
      dispatch({ type: 'TICK_WARMUP_COUNTDOWN', delta });
    }, 100);
    return () => clearInterval(id);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [warmupRunning]);

  // When the warm-up countdown reaches 0 (natural expiry), stop and clear so the
  // main game clock returns to game time. Mark completed to hide the controls.
  useEffect(() => {
    if (warmupRunning && warmupLeft <= 0) {
      setWarmupRunning(false);
      setWarmupCompleted(true);
      dispatch({ type: 'SET_WARMUP_COUNTDOWN', value: null });
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [warmupRunning, warmupLeft]);

  // Broadcast warm-up countdown to crowd UI
  useEffect(() => {
    if (!liveSync || typeof liveSync.broadcast !== 'function') return;
    if (warmupRunning && warmupLeft > 0) {
      liveSync.broadcast({ type: 'warmup', timeLeft: warmupLeft });
    } else {
      liveSync.broadcast({ type: 'warmup', timeLeft: null });
    }
  }, [warmupRunning, warmupLeft, liveSync]);

  function startWarmup() {
    if (warmupLeft <= 0) {
      dispatch({ type: 'SET_WARMUP_COUNTDOWN', value: WARMUP_DEFAULT_SECONDS });
    }
    setWarmupRunning(true);
  }
  function pauseWarmup() {
    setWarmupRunning(false);
  }
  function resetWarmup() {
    dispatch({ type: 'SET_WARMUP_COUNTDOWN', value: WARMUP_DEFAULT_SECONDS });
    setWarmupRunning(false);
  }
  function adjustWarmup(deltaSeconds) {
    const next = Math.max(0, warmupLeft + deltaSeconds);
    dispatch({ type: 'SET_WARMUP_COUNTDOWN', value: next });
  }

  function startGame(winner, finalPossession) {
    // Clear warm-up broadcast before tearing down
    if (liveSync && typeof liveSync.broadcast === 'function') {
      liveSync.broadcast({ type: 'warmup', timeLeft: null });
    }
    dispatch({ type: 'SET_TIP_OFF_WINNER', winner });
    dispatch({ type: 'SET_FIRST_POSSESSION', side: finalPossession });
    dispatch({ type: 'INIT_BOX_SCORE' });
    dispatch({ type: 'SET_STEP', step: 7 });
    // Auto-start the game clock so the scorekeeper doesn't have to press space
    // right after picking the tip-off winner.
    dispatch({ type: 'TOGGLE_CLOCK' });
  }

  function pickWinner(side) {
    setTipWinner(side);
    // Auto-tip rule: tip winner gets first possession → start the game now.
    // Manual rule: hold here and let the user pick possession next; that click
    // is what actually starts the game.
    if (!isManual) {
      startGame(side, side);
    }
  }

  function pickPossession(side) {
    if (!tipWinner) return;
    startGame(tipWinner, side);
  }

  const homeName = game.homeTeam?.name || 'Home';
  const awayName = game.awayTeam?.name || 'Away';

  return (
    <div className="tipoff-overlay-backdrop">
      <div className="tipoff-overlay">
        <button
          type="button"
          className="tipoff-open-scoreboard"
          onClick={liveSync && liveSync.openScoreboard}
          title="Open the crowd-facing scoreboard popup"
        >
          Open Scoreboard
        </button>
        <h2 className="tipoff-overlay-title">{t('tipoff', 'screenTitle')}</h2>

        <section className="tipoff-section">
          <p className="tipoff-overlay-prompt">{t('tipoff', 'whoWins')}</p>
          <div className="tipoff-overlay-choices">
            <button
              type="button"
              className={`tipoff-overlay-choice ${tipWinner === 'home' ? 'selected' : ''}`}
              onClick={() => pickWinner('home')}
            >
              <span className="tipoff-overlay-team">{homeName}</span>
              <span className="tipoff-overlay-side">HOME</span>
            </button>
            <button
              type="button"
              className={`tipoff-overlay-choice ${tipWinner === 'away' ? 'selected' : ''}`}
              onClick={() => pickWinner('away')}
            >
              <span className="tipoff-overlay-team">{awayName}</span>
              <span className="tipoff-overlay-side">AWAY</span>
            </button>
          </div>
        </section>

        {isManual && tipWinner && (
          <section className="tipoff-section">
            <p className="tipoff-overlay-prompt">{t('tipoff', 'whoPossession')}</p>
            <div className="tipoff-overlay-choices">
              <button
                type="button"
                className="tipoff-overlay-choice"
                onClick={() => pickPossession('home')}
              >
                <span className="tipoff-overlay-team">{homeName}</span>
              </button>
              <button
                type="button"
                className="tipoff-overlay-choice"
                onClick={() => pickPossession('away')}
              >
                <span className="tipoff-overlay-team">{awayName}</span>
              </button>
            </div>
          </section>
        )}

        {!warmupCompleted && (
          <section className="tipoff-section">
            <div className="tipoff-warmup-row">
              <span className="tipoff-warmup-label">Warm-Up</span>
              <span className={`tipoff-warmup-time ${warmupRunning ? 'running' : ''}`}>
                {formatWarmup(warmupLeft)}
              </span>
              <div className="tipoff-warmup-adjust">
                <button type="button" className="btn btn-small btn-ghost" onClick={() => adjustWarmup(-60)} title="Subtract 1 minute">−1m</button>
                <button type="button" className="btn btn-small btn-ghost" onClick={() => adjustWarmup(60)} title="Add 1 minute">+1m</button>
              </div>
              <div className="tipoff-warmup-actions">
                {!warmupRunning ? (
                  <button type="button" className="btn btn-small" onClick={startWarmup} disabled={warmupLeft <= 0}>
                    {warmupLeft === WARMUP_DEFAULT_SECONDS ? 'Start' : (warmupLeft > 0 ? 'Resume' : 'Start')}
                  </button>
                ) : (
                  <button type="button" className="btn btn-small" onClick={pauseWarmup}>
                    Pause
                  </button>
                )}
                {warmupLeft !== WARMUP_DEFAULT_SECONDS && (
                  <button type="button" className="btn btn-small btn-ghost" onClick={resetWarmup}>
                    Reset
                  </button>
                )}
              </div>
            </div>
          </section>
        )}

        {warmupCompleted && !tipWinner && (
          <p className="tipoff-overlay-hint">Pick the tip-off winner to start the game.</p>
        )}
      </div>
    </div>
  );
}
