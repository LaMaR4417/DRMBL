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
  const [possession, setPossession] = useState(null);
  const [warmupLeft, setWarmupLeft] = useState(WARMUP_DEFAULT_SECONDS);
  const [warmupRunning, setWarmupRunning] = useState(false);
  const warmupRef = useRef(WARMUP_DEFAULT_SECONDS);

  // Warm-up countdown (sub-second precision via performance.now delta)
  useEffect(() => {
    if (!warmupRunning) return undefined;
    let lastTick = performance.now();
    const id = setInterval(() => {
      const now = performance.now();
      const delta = (now - lastTick) / 1000;
      lastTick = now;
      const next = Math.max(0, warmupRef.current - delta);
      warmupRef.current = next;
      setWarmupLeft(next);
      if (next <= 0) {
        clearInterval(id);
        setWarmupRunning(false);
      }
    }, 100);
    return () => clearInterval(id);
  }, [warmupRunning]);

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
    warmupRef.current = WARMUP_DEFAULT_SECONDS;
    setWarmupLeft(WARMUP_DEFAULT_SECONDS);
    setWarmupRunning(true);
  }
  function pauseWarmup() {
    setWarmupRunning(false);
  }
  function resumeWarmup() {
    if (warmupRef.current > 0) setWarmupRunning(true);
  }
  function resetWarmup() {
    warmupRef.current = WARMUP_DEFAULT_SECONDS;
    setWarmupLeft(WARMUP_DEFAULT_SECONDS);
    setWarmupRunning(false);
  }

  function pickWinner(side) {
    setTipWinner(side);
    if (!isManual) setPossession(side);
  }

  function startGame() {
    if (!tipWinner) return;
    const finalPossession = isManual ? possession : tipWinner;
    if (!finalPossession) return;
    // Clear warm-up broadcast before tearing down
    if (liveSync && typeof liveSync.broadcast === 'function') {
      liveSync.broadcast({ type: 'warmup', timeLeft: null });
    }
    dispatch({ type: 'SET_TIP_OFF_WINNER', winner: tipWinner });
    dispatch({ type: 'SET_FIRST_POSSESSION', side: finalPossession });
    dispatch({ type: 'INIT_BOX_SCORE' });
    dispatch({ type: 'SET_STEP', step: 7 });
  }

  const homeName = game.homeTeam?.name || 'Home';
  const awayName = game.awayTeam?.name || 'Away';
  const canStart = tipWinner && (!isManual || possession);

  return (
    <div className="tipoff-overlay-backdrop">
      <div className="tipoff-overlay">
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
                className={`tipoff-overlay-choice ${possession === 'home' ? 'selected' : ''}`}
                onClick={() => setPossession('home')}
              >
                <span className="tipoff-overlay-team">{homeName}</span>
              </button>
              <button
                type="button"
                className={`tipoff-overlay-choice ${possession === 'away' ? 'selected' : ''}`}
                onClick={() => setPossession('away')}
              >
                <span className="tipoff-overlay-team">{awayName}</span>
              </button>
            </div>
          </section>
        )}

        <section className="tipoff-section">
          <div className="tipoff-warmup-row">
            <span className="tipoff-warmup-label">Warm-Up</span>
            <span className={`tipoff-warmup-time ${warmupRunning ? 'running' : ''}`}>
              {formatWarmup(warmupLeft)}
            </span>
            <div className="tipoff-warmup-actions">
              {!warmupRunning && warmupLeft === WARMUP_DEFAULT_SECONDS && (
                <button type="button" className="btn btn-small" onClick={startWarmup}>
                  Start 5:00
                </button>
              )}
              {warmupRunning && (
                <button type="button" className="btn btn-small" onClick={pauseWarmup}>
                  Pause
                </button>
              )}
              {!warmupRunning && warmupLeft > 0 && warmupLeft < WARMUP_DEFAULT_SECONDS && (
                <button type="button" className="btn btn-small" onClick={resumeWarmup}>
                  Resume
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

        <button
          type="button"
          className="btn btn-primary btn-large tipoff-start-game"
          disabled={!canStart}
          onClick={startGame}
        >
          Start Game
        </button>
      </div>
    </div>
  );
}
