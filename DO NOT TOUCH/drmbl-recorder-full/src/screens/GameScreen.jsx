import { useState, useEffect, useRef } from 'react';
import { useGame, useGameDispatch, useLiveSync } from '../context/GameContext';
import { syncLiveGame, saveEndGame } from '../data/api';
import { useTranslation } from '../i18n/useTranslation';

function formatClock(totalSeconds) {
  const t = Math.max(0, totalSeconds || 0);
  // In the last minute show tenths (SS.t); otherwise show MM:SS
  if (t < 60) {
    const whole = Math.floor(t);
    const tenths = Math.floor((t - whole) * 10);
    return `${whole}.${tenths}`;
  }
  const m = Math.floor(t / 60);
  const s = Math.floor(t % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
}

function formatQuarter(q) {
  if (q <= 4) return `Q${q}`;
  return `OT${q - 4}`;
}

export default function GameScreen() {
  const game = useGame();
  const dispatch = useGameDispatch();
  const liveSync = useLiveSync();
  const { t } = useTranslation();
  const [pendingAction, setPendingAction] = useState(null);
  const [chord, setChord] = useState({ side: null, category: null });
  // User toggle to suppress auto-stop even when stoppages settings say it should fire.
  // false = follow settings (default); true = force off (clock keeps running through actions).
  const [autoStopDisabled, setAutoStopDisabled] = useState(false);
  const [correctionMode, setCorrectionMode] = useState(false);
  const [clockEdit, setClockEdit] = useState(null); // null | { minutes, seconds }
  const [suggestRebound, setSuggestRebound] = useState(false);
  const [suggestAssist, setSuggestAssist] = useState(null); // 'home' | 'away' | null
  const [suggestShot, setSuggestShot] = useState(null); // 'home' | 'away' | null
  const [suggestTurnover, setSuggestTurnover] = useState(null); // 'home' | 'away' | null
  const [suggestSteal, setSuggestSteal] = useState(null); // 'home' | 'away' | null
  const [suggestStopClock, setSuggestStopClock] = useState(false);
  const [timeoutCountdown, setTimeoutCountdown] = useState(null); // { side, type, timeLeft }
  const [breakCountdown, setBreakCountdown] = useState(null); // seconds remaining in period break
  const [lateAddNumbers, setLateAddNumbers] = useState({}); // { playerID: 'number' }
  const [sortCol, setSortCol] = useState({ home: 'PTS', away: 'PTS' });
  const [sortDir, setSortDir] = useState({ home: 'desc', away: 'desc' });
  const [saveStatus, setSaveStatus] = useState(null); // null | 'pending' | 'saving' | 'saved' | 'error'
  const [saveError, setSaveError] = useState(null);

  const bs = game.boxScore;

  // Translated labels for pending actions
  const PENDING_LABELS = {
    rebound: t('game', 'rebound'),
    'rebound-offensive': t('game', 'offRebound'),
    'rebound-defensive': t('game', 'defRebound'),
    assist: t('game', 'assist'),
    steal: t('game', 'steal'),
    block: t('game', 'block'),
    turnover: t('game', 'turnover'),
    'foul-personal': t('game', 'personalFoul'),
    'foul-technical': t('game', 'technicalFoul'),
    'foul-flagrant': t('game', 'flagrantFoul'),
    'foul-offensive': t('game', 'offensiveFoul'),
    substitution: t('game', 'substitution'),
    'late-add-sub-in': t('game', 'lateAddSubIn'),
  };

  function actionLabel(points, made) {
    return `${points}PT ${made ? t('game', 'made') : t('game', 'miss')}`;
  }

  function pendingLabel(pending) {
    if (!pending) return '';
    if (pending.type === 'shot') return actionLabel(pending.points, pending.made);
    return PENDING_LABELS[pending.action] || pending.action?.toUpperCase() || '';
  }

  // Translated sub-menu choices
  const SUB_MENU_CHOICES = {
    rebound: [
      { action: 'rebound-offensive', label: t('game', 'offensive') },
      { action: 'rebound-defensive', label: t('game', 'defensive') },
    ],
    foul: [
      { action: 'foul-personal', label: t('game', 'personal') },
      { action: 'foul-offensive', label: t('game', 'offensive') },
      { action: 'foul-technical', label: t('game', 'technical') },
      { action: 'foul-flagrant', label: t('game', 'flagrant') },
    ],
    turnover: [
      { action: 'turnover-steal', label: t('game', 'stolen') },
      { action: 'turnover-error', label: t('game', 'error') },
    ],
    timeout: [
      { action: 'timeout-full', label: t('game', 'full'), timeoutType: 'full' },
      { action: 'timeout-short', label: t('game', 'short'), timeoutType: 'short' },
    ],
  };

  // --- Live game sync (fire-and-forget POST to Cosmos) ---
  const shouldSync = useRef(false);
  const initialSynced = useRef(false);

  // Build metadata to persist alongside box score for resume support
  const syncMeta = { settings: game.settings, selectedLeague: game.selectedLeague, selectedSeason: game.selectedSeason, selectedGame: game.selectedGame, homeTeam: game.homeTeam, awayTeam: game.awayTeam };

  // One-time sync when GameScreen first mounts with a box score
  useEffect(() => {
    if (!bs || initialSynced.current) return;
    initialSynced.current = true;
    syncLiveGame(bs, syncMeta);
  }, [bs]);

  // Sync after meaningful actions (flag-based)
  useEffect(() => {
    if (!bs || !shouldSync.current) return;
    shouldSync.current = false;
    syncLiveGame(bs, syncMeta);
  }, [bs]);

  // Periodic sync while clock is running (keeps live page clock aligned)
  const bsRef = useRef(bs);
  useEffect(() => { bsRef.current = bs; }, [bs]);
  const syncMetaRef = useRef(syncMeta);
  useEffect(() => { syncMetaRef.current = syncMeta; });
  useEffect(() => {
    if (!bs.gameInfo.state.active) return;
    const id = setInterval(() => {
      if (bsRef.current) syncLiveGame(bsRef.current, syncMetaRef.current);
    }, 5000);
    return () => clearInterval(id);
  }, [bs.gameInfo.state.active]);

  const isActive = bs.gameInfo.state.active;
  const timeLeft = bs.gameInfo.state.clock.timeLeft;
  const quarter = bs.gameInfo.state.currentQuarter;
  const periodOver = timeLeft <= 0 && !isActive;
  const isFinal = bs.gameInfo.general.status === 'final';

  // Period-end label + game-over detection
  const periodEndLabel = (() => {
    if (!periodOver) return '';
    const homeScore = bs.teamInfo.home.score.current;
    const awayScore = bs.teamInfo.away.score.current;
    const isTied = homeScore === awayScore;
    if (quarter >= 4 && !isTied) return t('game', 'final');
    if (quarter === 2) return t('game', 'firstHalf');
    return t('game', 'endQuarter', { quarter: formatQuarter(quarter) });
  })();
  const isGameOver = periodOver && periodEndLabel === t('game', 'final');

  // Derived: is auto-stop currently active based on game settings + current period/time?
  const isAutoStopActive = (() => {
    const dur = game.settings.stoppages.during;
    if (dur.perQuarter.setting) {
      let key;
      if (quarter === 1) key = '1stQuarter';
      else if (quarter === 2) key = '2ndQuarter';
      else if (quarter === 3) key = '3rdQuarter';
      else if (quarter === 4) key = '4thQuarter';
      else key = 'overtime';
      const config = dur.perQuarter[key];
      return !!(config && config.enabled && timeLeft <= config.from * 60);
    }
    if (dur.perHalf.setting) {
      let key;
      if (quarter <= 2) key = '1stHalf';
      else if (quarter <= 4) key = '2ndHalf';
      else key = 'overtime';
      const config = dur.perHalf[key];
      return !!(config && config.enabled && timeLeft <= config.from * 60);
    }
    return false;
  })();

  // Effective: settings say auto-stop should fire AND the user hasn't toggled it off
  const isAutoStopOn = isAutoStopActive && !autoStopDisabled;

  // Auto-stop clock or suggest based on action and stoppages settings
  function maybeAutoStop(actionName) {
    if (!isActive) return;
    if (autoStopDisabled) return; // user-disabled — let the clock keep running
    const entry = game.settings.stoppages.for.find(e => e.action === actionName);
    if (!entry) return;
    if (entry.always || isAutoStopActive) {
      dispatch({ type: 'TOGGLE_CLOCK' });
      shouldSync.current = true;
    } else {
      setSuggestStopClock(true);
    }
  }

  // --- Clock timer ---
  const timeLeftRef = useRef(timeLeft);
  useEffect(() => {
    timeLeftRef.current = timeLeft;
  }, [timeLeft]);

  useEffect(() => {
    if (!isActive) return;
    let lastTick = performance.now();
    const id = setInterval(() => {
      const now = performance.now();
      const delta = (now - lastTick) / 1000;
      lastTick = now;
      const tl = timeLeftRef.current;
      if (tl <= 0) {
        clearInterval(id);
        dispatch({ type: 'TOGGLE_CLOCK' });
        shouldSync.current = true;
        return;
      }
      const newTl = Math.max(0, tl - delta);
      dispatch({ type: 'SET_CLOCK_TIME', timeLeft: newTl });
      if (newTl <= 0) {
        clearInterval(id);
        dispatch({ type: 'TOGGLE_CLOCK' });
        shouldSync.current = true;
      }
    }, 100);
    return () => clearInterval(id);
  }, [isActive, dispatch]);

  // --- Hotkeys: spacebar (clock), Ctrl+Z (undo), and chord-tree input ---
  // Chord tree:
  //   1/2 → pick side (home/away)
  //   Q/W/E → pick category (scoring/stats/game)
  //   Q,W,E,R,T,Y → action within category
  //   sub-menu Q/W/E/R for rebound/foul/turnover/timeout types
  //   player select uses 3 rows: QWERT (slots 0-4), ASDFG (5-9), ZXCVB (10-14)
  //   Escape pops one level
  useEffect(() => {
    const PLAYER_KEYS = ['q','w','e','r','t','a','s','d','f','g','z','x','c','v','b'];
    // Single keyboard row Q-Y: mades first (Q W E), then misses (R T Y)
    const SCORING_MAP = {
      q: { points: 1, made: true },  w: { points: 2, made: true },  e: { points: 3, made: true },
      r: { points: 1, made: false }, t: { points: 2, made: false }, y: { points: 3, made: false },
    };
    // Single keyboard row Q-Y: top button row first (Q W E), then second row (R T Y)
    const STATS_MAP = {
      q: 'rebound', w: 'assist',   e: 'steal',
      r: 'block',   t: 'turnover', y: 'foul',
    };
    const SUB_KEYS = ['q', 'w', 'e', 'r'];

    function onKeyDown(e) {
      const tag = e.target && e.target.tagName;
      const inField = tag === 'INPUT' || tag === 'TEXTAREA' || (e.target && e.target.isContentEditable);

      // Ctrl+Z / Cmd+Z: undo last trackable action
      if ((e.ctrlKey || e.metaKey) && (e.key === 'z' || e.key === 'Z')) {
        if (inField) return;
        e.preventDefault();
        dispatch({ type: 'UNDO' });
        shouldSync.current = true;
        return;
      }

      // Spacebar: toggle clock — locked while a timeout is running
      if (e.code === 'Space' || e.key === ' ') {
        if (inField) return;
        if (e.repeat) return;
        e.preventDefault();
        if (timeoutCountdown) return; // user must end the timeout via the button
        dispatch({ type: 'TOGGLE_CLOCK' });
        shouldSync.current = true;
        return;
      }

      if (inField) return;

      // Escape: pop one chord level
      if (e.key === 'Escape') {
        e.preventDefault();
        if (pendingAction) {
          cancelPending();
        } else if (chord.category) {
          setChord((c) => ({ ...c, category: null }));
        } else if (chord.side) {
          setChord({ side: null, category: null });
        }
        return;
      }

      const key = e.key.length === 1 ? e.key.toLowerCase() : e.key;

      // Player / sub-menu selection (when an action is pending)
      if (pendingAction) {
        const subChoices = SUB_MENU_CHOICES[pendingAction.action];
        if (subChoices) {
          // Sub-menu open (rebound/foul/turnover/timeout type)
          const idx = SUB_KEYS.indexOf(key);
          if (idx === -1 || idx >= subChoices.length) return;
          e.preventDefault();
          const choice = subChoices[idx];
          if (pendingAction.action === 'timeout') {
            handleTimeoutTap(pendingAction.side, choice.timeoutType);
          } else {
            handleSubMenuTap(pendingAction.side, choice.action);
          }
          return;
        }
        // Player select — use display order (courtPlayers, then bench for sub flow)
        const pIdx = PLAYER_KEYS.indexOf(key);
        if (pIdx === -1) return;
        const team = bs.teamInfo[pendingAction.side];
        if (!team) return;
        const inGame = team.roster.inGame;
        const courtPlayers = inGame.filter((p) => p.playerID !== null && p.onCourt);
        const benchPlayers = inGame.filter((p) => p.playerID !== null && !p.onCourt);
        const isSubFlow = pendingAction.action === 'substitution';
        const ordered = isSubFlow ? [...courtPlayers, ...benchPlayers] : courtPlayers;
        const player = ordered[pIdx];
        if (!player) return;
        const actualIndex = inGame.findIndex((p) => p.playerID === player.playerID);
        if (actualIndex === -1) return;
        e.preventDefault();
        if (isSubFlow) {
          if (pendingAction.outIndex == null) handleSubOut(pendingAction.side, actualIndex);
          else handleSubIn(pendingAction.side, actualIndex);
        } else {
          handlePlayerSelect(pendingAction.side, actualIndex);
        }
        return;
      }

      // Side selection (1/2)
      if (!chord.side) {
        if (key === '1') { e.preventDefault(); setChord({ side: 'home', category: null }); }
        else if (key === '2') { e.preventDefault(); setChord({ side: 'away', category: null }); }
        return;
      }

      // Category selection (Q/W/E)
      if (!chord.category) {
        if (key === 'q') { e.preventDefault(); setChord((c) => ({ ...c, category: 'scoring' })); }
        else if (key === 'w') { e.preventDefault(); setChord((c) => ({ ...c, category: 'stats' })); }
        else if (key === 'e') { e.preventDefault(); setChord((c) => ({ ...c, category: 'game' })); }
        return;
      }

      // Action selection within category
      if (chord.category === 'scoring') {
        const x = SCORING_MAP[key];
        if (!x) return;
        e.preventDefault();
        handleShotTap(chord.side, x.points, x.made);
        setChord({ side: null, category: null });
      } else if (chord.category === 'stats') {
        const action = STATS_MAP[key];
        if (!action) return;
        e.preventDefault();
        handleStatTap(chord.side, action);
        setChord({ side: null, category: null });
      } else if (chord.category === 'game') {
        if (key === 'q') {
          e.preventDefault();
          handleStatTap(chord.side, 'timeout');
          setChord({ side: null, category: null });
        } else if (key === 'w') {
          e.preventDefault();
          handleStatTap(chord.side, 'substitution');
          setChord({ side: null, category: null });
        }
      }
    }
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dispatch, chord, pendingAction, bs, correctionMode, timeoutCountdown]);

  // --- Timeout countdown timer ---
  const toCountdownRef = useRef(null);
  useEffect(() => {
    if (toCountdownRef.current) toCountdownRef.current = timeoutCountdown;
  }, [timeoutCountdown]);

  useEffect(() => {
    if (!timeoutCountdown) return;
    toCountdownRef.current = timeoutCountdown;
    let lastTick = performance.now();
    const id = setInterval(() => {
      const now = performance.now();
      const delta = (now - lastTick) / 1000;
      lastTick = now;
      const cur = toCountdownRef.current;
      if (!cur) { clearInterval(id); return; }
      const next = cur.timeLeft - delta;
      if (next <= 0) {
        clearInterval(id);
        setTimeoutCountdown(null);
        return;
      }
      setTimeoutCountdown({ ...cur, timeLeft: next });
    }, 100);
    return () => clearInterval(id);
  }, [timeoutCountdown?.side, timeoutCountdown?.type]); // restart only when a new timeout starts

  // --- Broadcast break countdown to crowd UI ---
  useEffect(() => {
    if (!liveSync || typeof liveSync.broadcast !== 'function') return;
    if (breakCountdown != null && breakCountdown > 0) {
      liveSync.broadcast({
        type: 'break',
        breakCountdown,
        currentQuarter: quarter,
      });
    } else {
      liveSync.broadcast({ type: 'break', breakCountdown: null });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [breakCountdown, quarter]);

  // --- Broadcast timeout countdown to crowd UI ---
  useEffect(() => {
    if (!liveSync || typeof liveSync.broadcast !== 'function') return;
    if (timeoutCountdown && timeoutCountdown.timeLeft > 0) {
      liveSync.broadcast({
        type: 'timeout',
        side: timeoutCountdown.side,
        timeoutType: timeoutCountdown.type,
        timeLeft: timeoutCountdown.timeLeft,
      });
    } else {
      liveSync.broadcast({ type: 'timeout', timeLeft: null });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [timeoutCountdown]);

  // --- Break countdown timer (between periods) ---
  const breakRef = useRef(null);
  useEffect(() => {
    if (!periodOver) {
      setBreakCountdown(null);
      breakRef.current = null;
      return;
    }
    if (isGameOver) return;
    let breakMin = 0;
    if (quarter === 1 || quarter === 3) {
      breakMin = game.settings.breaks?.betweenQuarters ?? 1;
    } else if (quarter === 2) {
      breakMin = game.settings.breaks?.halftime ?? 3;
    } else if (quarter >= 4) {
      breakMin = game.settings.breaks?.beforeOvertime ?? 1;
    }
    const breakSec = breakMin * 60;
    if (breakSec <= 0) {
      setBreakCountdown(null);
      breakRef.current = null;
      return;
    }
    breakRef.current = breakSec;
    setBreakCountdown(breakSec);
    const id = setInterval(() => {
      const cur = breakRef.current;
      if (cur == null || cur <= 1) {
        clearInterval(id);
        breakRef.current = null;
        setBreakCountdown(null);
        // Auto-advance to next period so the clock shows 10:00 (or OT time)
        // paused, waiting for the user to press space/Start.
        if (!isGameOver && !isFinal) {
          dispatch({ type: 'ADVANCE_QUARTER' });
          shouldSync.current = true;
        }
        return;
      }
      breakRef.current = cur - 1;
      setBreakCountdown(cur - 1);
    }, 1000);
    return () => clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [periodOver, quarter]);

  // --- End game save (fires once when END_GAME dispatch settles) ---
  useEffect(() => {
    if (saveStatus !== 'pending') return;
    if (!bs || bs.gameInfo.general.status !== 'final') return;
    setSaveStatus('saving');

    saveEndGame(bs, game.homeTeam.teamID, game.awayTeam.teamID, game.homeTeam.slot, game.awayTeam.slot, game.selectedSeason?.id)
      .then(() => setSaveStatus('saved'))
      .catch((err) => { setSaveStatus('error'); setSaveError(err.message); });
  }, [saveStatus, bs?.gameInfo?.general?.status]);

  // --- Cancel helper (clears pending + correction + clock edit) ---
  function cancelPending() {
    setPendingAction(null);
    setCorrectionMode(false);
    setClockEdit(null);
  }

  // --- Scoring button handler ---
  function handleShotTap(side, points, made) {
    setSuggestRebound(false);
    setSuggestAssist(null);
    setSuggestShot(null);
    setSuggestTurnover(null);
    setSuggestSteal(null);
    setSuggestStopClock(false);
    if (
      pendingAction?.type === 'shot' &&
      pendingAction?.side === side &&
      pendingAction?.points === points &&
      pendingAction?.made === made
    ) {
      cancelPending();
      return;
    }
    setPendingAction({ type: 'shot', side, points, made });
  }

  function isShotActive(side, points, made) {
    return (
      pendingAction?.type === 'shot' &&
      pendingAction?.side === side &&
      pendingAction?.points === points &&
      pendingAction?.made === made
    );
  }

  // --- Stat action handler (non-shot) ---
  function handleStatTap(side, action) {
    setSuggestRebound(false);
    setSuggestAssist(null);
    setSuggestShot(null);
    setSuggestTurnover(null);
    setSuggestSteal(null);
    setSuggestStopClock(false);
    if (pendingAction?.type === 'stat' && pendingAction?.side === side && pendingAction?.action === action) {
      cancelPending();
      return;
    }
    setPendingAction({ type: 'stat', side, action });
  }

  function isStatActive(side, action) {
    return (
      pendingAction?.type === 'stat' &&
      pendingAction?.side === side &&
      pendingAction?.action === action
    );
  }

  // --- Sub-menu handler (for rebound, foul) ---
  function handleSubMenuTap(side, action) {
    if (pendingAction?.type === 'stat' && pendingAction?.side === side && pendingAction?.action === action) {
      cancelPending();
      return;
    }
    setPendingAction({ type: 'stat', side, action });
  }

  // --- Substitution handlers (two-step: pick OUT then pick IN) ---
  function handleSubOut(side, playerIndex) {
    setPendingAction({ ...pendingAction, outIndex: playerIndex });
  }

  function handleSubIn(side, playerIndex) {
    setSuggestRebound(false);
    setSuggestAssist(null);
    setSuggestShot(null);
    setSuggestTurnover(null);
    setSuggestSteal(null);
    setSuggestStopClock(false);
    dispatch({ type: 'RECORD_SUBSTITUTION', side, outIndex: pendingAction.outIndex, inIndex: playerIndex });
    shouldSync.current = true;
    setPendingAction(null);
  }

  // --- Timeout handler (fires immediately, no player selection) ---
  function handleTimeoutTap(side, timeoutType) {
    setSuggestRebound(false);
    setSuggestAssist(null);
    setSuggestShot(null);
    setSuggestTurnover(null);
    setSuggestSteal(null);
    setSuggestStopClock(false);
    const isCorrection = correctionMode;
    dispatch({ type: 'RECORD_TIMEOUT', side, timeoutType, correction: isCorrection });
    shouldSync.current = true;
    setPendingAction(null);
    if (!isCorrection) {
      maybeAutoStop('Timeout');
      const duration = game.settings.timeouts?.duration?.[timeoutType] || (timeoutType === 'full' ? 60 : 30);
      setTimeoutCountdown({ side, type: timeoutType, timeLeft: duration });
    }
    if (isCorrection) {
      setCorrectionMode(false);
      setTimeoutCountdown(null);
    }
  }

  // --- Player selection handler ---
  function handlePlayerSelect(side, playerIndex) {
    if (!pendingAction || pendingAction.side !== side) return;
    const isCorrection = correctionMode;

    if (pendingAction.type === 'shot') {
      dispatch({
        type: pendingAction.made ? 'RECORD_MADE_SHOT' : 'RECORD_MISSED_SHOT',
        side,
        playerIndex,
        points: pendingAction.points,
        correction: isCorrection,
      });
      if (!isCorrection) {
        if (pendingAction.made) {
          maybeAutoStop('Made Shot');
          if (pendingAction.points >= 2) {
            setSuggestAssist(side);
          }
        } else {
          setSuggestRebound(true);
        }
      }
    }

    if (pendingAction.type === 'stat') {
      const act = pendingAction.action;
      if (act === 'rebound-offensive') {
        dispatch({ type: 'RECORD_REBOUND', side, playerIndex, reboundType: 'offensive', correction: isCorrection });
      } else if (act === 'rebound-defensive') {
        dispatch({ type: 'RECORD_REBOUND', side, playerIndex, reboundType: 'defensive', correction: isCorrection });
      } else if (act === 'assist') {
        dispatch({ type: 'RECORD_ASSIST', side, playerIndex, correction: isCorrection });
        if (!isCorrection) setSuggestShot(side);
      } else if (act === 'steal') {
        dispatch({ type: 'RECORD_STEAL', side, playerIndex, correction: isCorrection });
        if (!isCorrection) setSuggestTurnover(side === 'home' ? 'away' : 'home');
      } else if (act === 'block') {
        dispatch({ type: 'RECORD_BLOCK', side, playerIndex, correction: isCorrection });
        if (!isCorrection) setSuggestRebound(true);
      } else if (act === 'turnover-steal' || act === 'turnover-error') {
        dispatch({ type: 'RECORD_TURNOVER', side, playerIndex, correction: isCorrection });
        if (!isCorrection) {
          if (act === 'turnover-steal') {
            setSuggestSteal(side === 'home' ? 'away' : 'home');
          }
          maybeAutoStop('Turnover');
        }
      } else if (act === 'foul-personal') {
        dispatch({ type: 'RECORD_FOUL', side, playerIndex, foulType: 'personal', correction: isCorrection });
        if (!isCorrection) maybeAutoStop('Foul');
      } else if (act === 'foul-technical') {
        dispatch({ type: 'RECORD_FOUL', side, playerIndex, foulType: 'technical', correction: isCorrection });
        if (!isCorrection) maybeAutoStop('Foul');
      } else if (act === 'foul-flagrant') {
        dispatch({ type: 'RECORD_FOUL', side, playerIndex, foulType: 'flagrant', correction: isCorrection });
        if (!isCorrection) maybeAutoStop('Foul');
      } else if (act === 'foul-offensive') {
        dispatch({ type: 'RECORD_FOUL', side, playerIndex, foulType: 'offensive', correction: isCorrection });
        if (!isCorrection) maybeAutoStop('Foul');
      } else {
        // Parent actions (rebound, foul, turnover) need sub-menu first — ignore tap
        return;
      }
    }

    shouldSync.current = true;
    if (isCorrection) setCorrectionMode(false);
    setPendingAction(null);
  }

  // --- Render sections ---
  function renderShotSection(side, dimmed) {
    return (
      <div className={`game-section ${dimmed ? 'chord-dimmed' : ''}`}>
        <div className="section-label">{t('game', 'scoring')}</div>
        <div className="action-row">
          {[1, 2, 3].map((pts) => (
            <button
              key={`${pts}-made`}
              className={`btn-action made ${isShotActive(side, pts, true) ? 'active' : ''} ${suggestShot === side && pts >= 2 ? 'suggest' : ''}`}
              onClick={() => handleShotTap(side, pts, true)}
            >
              {actionLabel(pts, true)}
              <span className="hotkey-badge">{SHOT_HOTKEYS[`made-${pts}`]}</span>
            </button>
          ))}
          {[1, 2, 3].map((pts) => (
            <button
              key={`${pts}-miss`}
              className={`btn-action miss ${isShotActive(side, pts, false) ? 'active' : ''}`}
              onClick={() => handleShotTap(side, pts, false)}
            >
              {actionLabel(pts, false)}
              <span className="hotkey-badge">{SHOT_HOTKEYS[`miss-${pts}`]}</span>
            </button>
          ))}
        </div>
      </div>
    );
  }

  function renderStatSection(side, dimmed) {
    return (
      <div className={`game-section ${dimmed ? 'chord-dimmed' : ''}`}>
        <div className="section-label">{t('game', 'stats')}</div>
        <div className="action-row action-row-stats">
          <button
            className={`btn-action stat ${isStatActive(side, 'rebound') || isStatActive(side, 'rebound-offensive') || isStatActive(side, 'rebound-defensive') ? 'active' : ''} ${suggestRebound ? 'suggest' : ''}`}
            onClick={() => handleStatTap(side, 'rebound')}
          >
            {t('game', 'rebound')}
            <span className="hotkey-badge">{STAT_HOTKEYS.rebound}</span>
          </button>
          <button
            className={`btn-action stat ${isStatActive(side, 'assist') ? 'active' : ''} ${suggestAssist === side ? 'suggest' : ''}`}
            onClick={() => handleStatTap(side, 'assist')}
          >
            {t('game', 'assist')}
            <span className="hotkey-badge">{STAT_HOTKEYS.assist}</span>
          </button>
          <button
            className={`btn-action stat ${isStatActive(side, 'steal') ? 'active' : ''} ${suggestSteal === side ? 'suggest' : ''}`}
            onClick={() => handleStatTap(side, 'steal')}
          >
            {t('game', 'steal')}
            <span className="hotkey-badge">{STAT_HOTKEYS.steal}</span>
          </button>
          <button
            className={`btn-action stat ${isStatActive(side, 'block') ? 'active' : ''}`}
            onClick={() => handleStatTap(side, 'block')}
          >
            {t('game', 'block')}
            <span className="hotkey-badge">{STAT_HOTKEYS.block}</span>
          </button>
          <button
            className={`btn-action stat ${isStatActive(side, 'turnover') || isStatActive(side, 'turnover-steal') || isStatActive(side, 'turnover-error') ? 'active' : ''} ${suggestTurnover === side ? 'suggest' : ''}`}
            onClick={() => handleStatTap(side, 'turnover')}
          >
            {t('game', 'turnover')}
            <span className="hotkey-badge">{STAT_HOTKEYS.turnover}</span>
          </button>
          <button
            className={`btn-action stat ${isStatActive(side, 'foul') || isStatActive(side, 'foul-personal') || isStatActive(side, 'foul-technical') || isStatActive(side, 'foul-flagrant') || isStatActive(side, 'foul-offensive') ? 'active' : ''}`}
            onClick={() => handleStatTap(side, 'foul')}
          >
            {t('game', 'foul')}
            <span className="hotkey-badge">{STAT_HOTKEYS.foul}</span>
          </button>
        </div>
      </div>
    );
  }

  function renderMgmtSection(side, dimmed) {
    const toActive = timeoutCountdown?.side === side;
    return (
      <div className={`game-section ${dimmed ? 'chord-dimmed' : ''}`}>
        <div className="section-label">{t('game', 'gameLabel')}</div>
        <div className="action-row action-row-mgmt">
          <button
            className={`btn-action mgmt ${isStatActive(side, 'timeout') ? 'active' : ''}`}
            onClick={() => handleStatTap(side, 'timeout')}
          >
            {t('game', 'timeout')}
            {toActive && (
              <span className="to-timer">
                {timeoutCountdown.type === 'full' ? t('game', 'full') : t('game', 'short')} {formatClock(timeoutCountdown.timeLeft)}
              </span>
            )}
            <span className="hotkey-badge">{STAT_HOTKEYS.timeout}</span>
          </button>
          <button
            className={`btn-action mgmt ${isStatActive(side, 'substitution') ? 'active' : ''}`}
            onClick={() => handleStatTap(side, 'substitution')}
          >
            {t('game', 'substitution')}
            <span className="hotkey-badge">{STAT_HOTKEYS.substitution}</span>
          </button>
          <button
            className={`btn-action mgmt ${isStatActive(side, 'late-add') ? 'active' : ''}`}
            onClick={() => { setLateAddNumbers({}); handleStatTap(side, 'late-add'); }}
          >
            {t('game', 'lateAdd')}
          </button>
        </div>
      </div>
    );
  }

  function renderPlayerCard(player, team, opts = {}) {
    const { selectable, onClick, highlighted, dimmed, hotkey } = opts;
    return (
      <div
        key={player.playerID}
        className={`player-card ${selectable ? 'selectable' : ''} ${highlighted ? 'highlighted' : ''} ${dimmed ? 'dimmed' : ''}`}
        onClick={selectable ? onClick : undefined}
      >
        {selectable && hotkey && <span className="hotkey-badge player-hotkey">{hotkey}</span>}
        <span className="player-card-number">#{player.number || '?'}</span>
        <span className="player-card-name">{player.name}</span>
        <div className="player-card-stats">
          <div className="stats-col">
            <div className="stat-row"><span className="stat-label">PTS</span><span className="stat-value">{player.stats.offense.points}</span></div>
            <div className="stat-row"><span className="stat-label">FG%</span><span className="stat-value">{player.stats.offense.shootingBreakdown.fieldGoals.totalPercentage}%</span></div>
            <div className="stat-row"><span className="stat-label">REB</span><span className="stat-value">{player.stats.rebounds.total}</span></div>
            <div className="stat-row"><span className="stat-label">AST</span><span className="stat-value">{player.stats.offense.assists}</span></div>
            <div className="stat-row"><span className="stat-label">MIN</span><span className="stat-value">{formatClock(player.stats.general.minutesPlayed)}</span></div>
          </div>
          <div className="stats-divider" />
          <div className="stats-col">
            <div className="stat-row"><span className="stat-label">STL</span><span className="stat-value">{player.stats.defense.steals}</span></div>
            <div className="stat-row"><span className="stat-label">BLK</span><span className="stat-value">{player.stats.defense.blocks}</span></div>
            <div className="stat-row"><span className="stat-label">TO</span><span className="stat-value">{player.stats.general.turnovers}</span></div>
            <div className="stat-row"><span className="stat-label">PF</span><span className="stat-value">{player.stats.general.fouls.personal.total}</span></div>
            <div className="stat-row"><span className="stat-label">+/-</span><span className="stat-value">{player.stats.general.plusMinus >= 0 ? '+' : ''}{player.stats.general.plusMinus}</span></div>
          </div>
        </div>
      </div>
    );
  }

  function handleLateAddSubIn(side, playerIndex) {
    dispatch({ type: 'SUB_IN_PLAYER', side, playerIndex });
    shouldSync.current = true;
    setPendingAction(null);
  }

  function handleLateAdd(side, player) {
    const num = lateAddNumbers[player.playerID] || '';
    if (!num) return;
    dispatch({ type: 'LATE_ADD_PLAYER', side, playerID: player.playerID, name: player.name, number: num });
    shouldSync.current = true;
    setLateAddNumbers({});
    setPendingAction(null);
  }

  function renderPlayerSection(side) {
    const team = bs.teamInfo[side];
    const courtPlayers = team.roster.inGame.filter((p) => p.playerID !== null && p.onCourt);
    const benchPlayers = team.roster.inGame.filter((p) => p.playerID !== null && !p.onCourt);
    const isSelecting = pendingAction !== null && pendingAction.side === side;
    const subChoices = isSelecting && SUB_MENU_CHOICES[pendingAction.action];
    const isSub = isSelecting && pendingAction.action === 'substitution';
    const isLateAdd = isSelecting && pendingAction.action === 'late-add';
    const isLateAddSubIn = isSelecting && pendingAction.action === 'late-add-sub-in';
    const subStep = isSub ? (pendingAction.outIndex != null ? 2 : 1) : 0;
    const isPlayerSelectable = isSelecting && !subChoices && !isSub && !isLateAdd && !isLateAddSubIn;

    // Late Add mode: show available players from full roster
    if (isLateAdd) {
      const inGameIDs = new Set(team.roster.inGame.filter((p) => p.playerID !== null).map((p) => p.playerID));
      const available = team.roster.full.filter((p) => !inGameIDs.has(p.playerID));
      const hasEmptySlot = team.roster.inGame.some((p) => p.playerID === null);

      return (
        <div className="game-section game-section-players">
          <div className="selection-banner">
            <span className="selection-banner-text">{t('game', 'lateAddSelect')}</span>
            <button className="btn btn-small" onClick={() => { setLateAddNumbers({}); cancelPending(); }}>
              {t('common', 'cancel')}
            </button>
          </div>
          {!hasEmptySlot ? (
            <div className="late-add-full">{t('game', 'rosterFull')}</div>
          ) : available.length === 0 ? (
            <div className="late-add-full">{t('game', 'allInGame')}</div>
          ) : (
            <div className="late-add-list">
              {available.map((player) => {
                const num = lateAddNumbers[player.playerID] || '';
                return (
                  <div key={player.playerID} className="late-add-row">
                    <span className="late-add-name">{player.name}</span>
                    <input
                      className="late-add-number"
                      type="number"
                      min="0"
                      max="99"
                      placeholder="#"
                      value={num}
                      onChange={(e) => setLateAddNumbers({ ...lateAddNumbers, [player.playerID]: e.target.value })}
                    />
                    <button
                      className="btn btn-small btn-late-add-confirm"
                      disabled={!num}
                      onClick={() => handleLateAdd(side, player)}
                    >
                      {t('game', 'add')}
                    </button>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      );
    }

    // Late Add Sub In mode: pick a bench player to put on court
    if (isLateAddSubIn) {
      return (
        <div className="game-section game-section-players">
          <div className="selection-banner">
            <span className="selection-banner-text">{t('game', 'lateAddSubInSelect')}</span>
            <button className="btn btn-small" onClick={() => cancelPending()}>
              {t('common', 'cancel')}
            </button>
          </div>
          <div className="player-grid">
            {benchPlayers.length > 0 ? benchPlayers.map((player) => {
              const actualIndex = team.roster.inGame.findIndex((p) => p.playerID === player.playerID);
              return renderPlayerCard(player, team, {
                selectable: true,
                onClick: () => handleLateAddSubIn(side, actualIndex),
              });
            }) : (
              <div className="sub-empty-bench">{t('game', 'noBenchAvailable')}</div>
            )}
          </div>
        </div>
      );
    }

    // Substitution mode: two-step court/bench selection
    if (isSub) {
      const outPlayer = subStep === 2 ? team.roster.inGame[pendingAction.outIndex] : null;
      return (
        <div className="game-section game-section-players">
          <div className="selection-banner">
            <span className="selection-banner-text">
              {subStep === 1
                ? t('game', 'selectPlayerOut')
                : t('game', 'playerOutSelectIn', { number: outPlayer?.number || '?', name: outPlayer?.name })}
            </span>
            <button className="btn btn-small" onClick={() => {
              if (subStep === 2) {
                setPendingAction({ ...pendingAction, outIndex: undefined });
              } else {
                setPendingAction(null);
              }
            }}>
              {subStep === 2 ? t('common', 'back') : t('common', 'cancel')}
            </button>
          </div>

          <div className="sub-section-label">{t('game', 'onCourt')}</div>
          <div className="player-grid">
            {courtPlayers.map((player, displayIdx) => {
              const actualIndex = team.roster.inGame.findIndex((p) => p.playerID === player.playerID);
              const isOut = subStep === 2 && actualIndex === pendingAction.outIndex;
              return renderPlayerCard(player, team, {
                selectable: subStep === 1,
                onClick: () => handleSubOut(side, actualIndex),
                highlighted: isOut,
                dimmed: subStep === 2 && !isOut,
                hotkey: subStep === 1 ? PLAYER_HOTKEYS[displayIdx] : null,
              });
            })}
          </div>

          <div className="sub-section-label">{t('game', 'onBench')}</div>
          <div className="player-grid">
            {benchPlayers.length > 0 ? benchPlayers.map((player, displayIdx) => {
              const actualIndex = team.roster.inGame.findIndex((p) => p.playerID === player.playerID);
              return renderPlayerCard(player, team, {
                selectable: subStep === 2,
                onClick: () => handleSubIn(side, actualIndex),
                dimmed: subStep === 1,
                hotkey: subStep === 2 ? PLAYER_HOTKEYS[displayIdx] : null,
              });
            }) : (
              <div className="sub-empty-bench">{t('game', 'noBench')}</div>
            )}
          </div>
        </div>
      );
    }

    return (
      <div className="game-section game-section-players">
        <div className="section-label">{t('game', 'players')}</div>
        {isSelecting && (
          <div className="selection-banner">
            <span className="selection-banner-text">
              {correctionMode ? t('game', 'correct') : t('game', 'select')}: {pendingLabel(pendingAction)}
            </span>
            <button className="btn btn-small" onClick={() => cancelPending()}>
              {t('common', 'cancel')}
            </button>
          </div>
        )}
        {subChoices ? (
          <div className="sub-menu-choices">
            {subChoices.map((choice, i) => {
              const isTimeout = choice.timeoutType != null;
              const remaining = isTimeout ? bs.teamInfo[side].stats.timeouts.remaining[choice.timeoutType] : null;
              return (
                <button
                  key={choice.action}
                  className="btn btn-sub-choice"
                  onClick={() => {
                    if (isTimeout) {
                      handleTimeoutTap(side, choice.timeoutType);
                    } else {
                      setPendingAction({ ...pendingAction, action: choice.action });
                    }
                  }}
                >
                  {choice.label}{isTimeout ? ` (${remaining})` : ''}
                  <span className="hotkey-badge">{SUB_MENU_HOTKEYS[i]}</span>
                </button>
              );
            })}
          </div>
        ) : (
        <div className="player-grid">
          {courtPlayers.map((player, displayIdx) => {
            const actualIndex = team.roster.inGame.findIndex(
              (p) => p.playerID === player.playerID,
            );
            return renderPlayerCard(player, team, {
              selectable: isPlayerSelectable,
              onClick: () => handlePlayerSelect(side, actualIndex),
              hotkey: PLAYER_HOTKEYS[displayIdx],
            });
          })}
          {courtPlayers.length < 5 && benchPlayers.length > 0 && (
            <div
              className="player-card player-card-placeholder selectable"
              onClick={() => setPendingAction({ type: 'stat', side, action: 'late-add-sub-in' })}
            >
              <span className="placeholder-label">{t('game', 'lateAddLine1')}</span>
              <span className="placeholder-label">{t('game', 'lateAddLine2')}</span>
            </div>
          )}
        </div>
        )}
      </div>
    );
  }

  // --- Render team half ---
  const PARENT_ACTIONS = [];

  function renderHalf(side) {
    const isParent = pendingAction?.type === 'stat' && PARENT_ACTIONS.includes(pendingAction?.action);
    const hasPending = pendingAction !== null && pendingAction.side === side;
    const otherHasPending = pendingAction !== null && pendingAction.side !== side;
    // Only enter full player-selection mode for concrete (non-parent) actions
    const isSelecting = hasPending && !isParent;
    const isOtherSelecting = otherHasPending && !isParent;
    // Chord side selection dims the opposite half until the chord finishes
    const chordTargetsThis = chord.side === side;
    const chordTargetsOther = chord.side != null && chord.side !== side;
    // After a category is picked, dim the other categories within this half
    const chordCat = chordTargetsThis ? chord.category : null;
    const dimScoring = chordCat != null && chordCat !== 'scoring';
    const dimStats = chordCat != null && chordCat !== 'stats';
    const dimGame = chordCat != null && chordCat !== 'game';

    return (
      <div className={`game-half ${side} ${(isOtherSelecting || chordTargetsOther) ? 'dimmed' : ''} ${(isSelecting || chordTargetsThis) ? 'selecting' : ''}`}>
        {!isSelecting && renderShotSection(side, dimScoring)}
        {!isSelecting && renderStatSection(side, dimStats)}
        {!isSelecting && renderMgmtSection(side, dimGame)}
        {renderPlayerSection(side)}
      </div>
    );
  }

  // --- End-game view ---
  if (isFinal) {
    const winner = bs.gameInfo.state.winner;
    const homeScore = bs.teamInfo.home.score.current;
    const awayScore = bs.teamInfo.away.score.current;
    const pq = { home: bs.teamInfo.home.score.perQuarter, away: bs.teamInfo.away.score.perQuarter };
    const periods = ['first', 'second', 'third', 'fourth'];
    const otCount = bs.gameInfo.state.overtimes || 0;
    for (let i = 1; i <= otCount; i++) periods.push(`OT${i}`);

    const periodLabels = periods.map((p) => {
      if (p === 'first') return 'Q1';
      if (p === 'second') return 'Q2';
      if (p === 'third') return 'Q3';
      if (p === 'fourth') return 'Q4';
      return p;
    });

    function getQuarterScore(side, period) {
      if (['first', 'second', 'third', 'fourth'].includes(period)) {
        return pq[side][period] || 0;
      }
      const otKey = period; // "OT1", "OT2", etc.
      return pq[side].overtime?.[otKey] || 0;
    }

    const PLAYER_COLUMNS = [
      { key: '#', label: '#', className: 'ept-num', get: (p) => Number(p.number) || 0, display: (p) => p.number || '?' },
      { key: 'PLAYER', label: 'PLAYER', className: 'ept-name', get: (p) => p.name, display: (p) => p.name },
      { key: 'MIN', label: 'MIN', get: (p) => p.stats.general.minutesPlayed, display: (p) => formatClock(p.stats.general.minutesPlayed) },
      { key: 'PTS', label: 'PTS', get: (p) => p.stats.offense.points },
      { key: 'FG', label: 'FG', get: (p) => p.stats.offense.shootingBreakdown.fieldGoals.totalMade, display: (p) => `${p.stats.offense.shootingBreakdown.fieldGoals.totalMade}/${p.stats.offense.shootingBreakdown.fieldGoals.totalAttempted}` },
      { key: 'FG%', label: 'FG%', get: (p) => p.stats.offense.shootingBreakdown.fieldGoals.totalPercentage, display: (p) => `${p.stats.offense.shootingBreakdown.fieldGoals.totalPercentage}%` },
      { key: '2PT', label: '2PT', get: (p) => p.stats.offense.shootingBreakdown.fieldGoals['2-PointShots'].made, display: (p) => `${p.stats.offense.shootingBreakdown.fieldGoals['2-PointShots'].made}/${p.stats.offense.shootingBreakdown.fieldGoals['2-PointShots'].attempted}` },
      { key: '2P%', label: '2P%', get: (p) => p.stats.offense.shootingBreakdown.fieldGoals['2-PointShots'].percentage, display: (p) => `${p.stats.offense.shootingBreakdown.fieldGoals['2-PointShots'].percentage}%` },
      { key: '3PT', label: '3PT', get: (p) => p.stats.offense.shootingBreakdown.fieldGoals['3-PointShots'].made, display: (p) => `${p.stats.offense.shootingBreakdown.fieldGoals['3-PointShots'].made}/${p.stats.offense.shootingBreakdown.fieldGoals['3-PointShots'].attempted}` },
      { key: '3P%', label: '3P%', get: (p) => p.stats.offense.shootingBreakdown.fieldGoals['3-PointShots'].percentage, display: (p) => `${p.stats.offense.shootingBreakdown.fieldGoals['3-PointShots'].percentage}%` },
      { key: 'FT', label: 'FT', get: (p) => p.stats.offense.shootingBreakdown.freeThrows.made, display: (p) => `${p.stats.offense.shootingBreakdown.freeThrows.made}/${p.stats.offense.shootingBreakdown.freeThrows.attempted}` },
      { key: 'FT%', label: 'FT%', get: (p) => p.stats.offense.shootingBreakdown.freeThrows.percentage, display: (p) => `${p.stats.offense.shootingBreakdown.freeThrows.percentage}%` },
      { key: 'TRB', label: 'TRB', get: (p) => p.stats.rebounds.total },
      { key: 'DRB', label: 'DRB', get: (p) => p.stats.rebounds.defensive },
      { key: 'ORB', label: 'ORB', get: (p) => p.stats.rebounds.offensive },
      { key: 'AST', label: 'AST', get: (p) => p.stats.offense.assists },
      { key: 'STL', label: 'STL', get: (p) => p.stats.defense.steals },
      { key: 'BLK', label: 'BLK', get: (p) => p.stats.defense.blocks },
      { key: 'TO', label: 'TO', get: (p) => p.stats.general.turnovers },
      { key: 'PF', label: 'PF', get: (p) => p.stats.general.fouls.personal.total },
      { key: '+/-', label: '+/-', get: (p) => p.stats.general.plusMinus, display: (p) => `${p.stats.general.plusMinus >= 0 ? '+' : ''}${p.stats.general.plusMinus}` },
      { key: 'EFF', label: 'EFF', get: (p) => { const fg = p.stats.offense.shootingBreakdown.fieldGoals; const ft = p.stats.offense.shootingBreakdown.freeThrows; return p.stats.offense.points + p.stats.rebounds.total + p.stats.offense.assists + p.stats.defense.steals + p.stats.defense.blocks - p.stats.general.turnovers - (fg.totalAttempted - fg.totalMade) - (ft.attempted - ft.made); } },
    ];

    function handleSort(side, key) {
      const col = sortCol[side];
      const dir = sortDir[side];
      if (col === key) {
        setSortDir({ ...sortDir, [side]: dir === 'desc' ? 'asc' : 'desc' });
      } else {
        setSortCol({ ...sortCol, [side]: key });
        setSortDir({ ...sortDir, [side]: 'desc' });
      }
    }

    function getPlayerStats(side) {
      const col = PLAYER_COLUMNS.find((c) => c.key === sortCol[side]);
      const dir = sortDir[side];
      return bs.teamInfo[side].roster.inGame
        .filter((p) => p.playerID !== null)
        .sort((a, b) => {
          const av = col ? col.get(a) : 0;
          const bv = col ? col.get(b) : 0;
          if (typeof av === 'string' && typeof bv === 'string') {
            return dir === 'asc' ? av.localeCompare(bv) : bv.localeCompare(av);
          }
          return dir === 'asc' ? av - bv : bv - av;
        });
    }

    function exportBoxScore() {
      const json = JSON.stringify(bs, null, 2);
      const blob = new Blob([json], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${bs.teamInfo.home.name}-vs-${bs.teamInfo.away.name}-boxscore.json`;
      a.click();
      URL.revokeObjectURL(url);
    }

    return (
      <div className="screen endgame-screen">
        <div className="endgame-header">
          <span className="endgame-label">{t('endgame', 'final')}</span>
          {otCount > 0 && <span className="endgame-ot">({otCount > 1 ? `${otCount}OT` : 'OT'})</span>}
        </div>

        <div className="endgame-score-row">
          <div className={`endgame-team ${winner === 'home' ? 'winner' : ''}`}>
            <span className="endgame-team-name">{bs.teamInfo.home.name}</span>
            <span className="endgame-team-score">{homeScore}</span>
          </div>
          <span className="endgame-dash">&ndash;</span>
          <div className={`endgame-team ${winner === 'away' ? 'winner' : ''}`}>
            <span className="endgame-team-score">{awayScore}</span>
            <span className="endgame-team-name">{bs.teamInfo.away.name}</span>
          </div>
        </div>

        <div className="endgame-body">
          <div className="endgame-left">
            <div className="endgame-section">
              <div className="endgame-section-title">{t('endgame', 'scoringByPeriod')}</div>
              <div className="endgame-quarter-table">
                <div className="eq-row eq-header">
                  <span className="eq-team-col"></span>
                  {periodLabels.map((l) => <span key={l} className="eq-cell">{l}</span>)}
                  <span className="eq-cell eq-total">{t('endgame', 'totalCol')}</span>
                </div>
                {['home', 'away'].map((side) => (
                  <div key={side} className={`eq-row ${winner === side ? 'eq-winner' : ''}`}>
                    <span className="eq-team-col">{bs.teamInfo[side].name}</span>
                    {periods.map((p) => <span key={p} className="eq-cell">{getQuarterScore(side, p)}</span>)}
                    <span className="eq-cell eq-total">{bs.teamInfo[side].score.current}</span>
                  </div>
                ))}
              </div>
            </div>

            <div className="endgame-section">
              <div className="endgame-section-title">{t('endgame', 'teamStats')}</div>
              <div className="endgame-team-stats">
                {(() => {
                  const stats = [
                    { label: 'FG', home: `${bs.teamInfo.home.stats.shootingBreakdown.fieldGoals.totalMade}/${bs.teamInfo.home.stats.shootingBreakdown.fieldGoals.totalAttempted}`, away: `${bs.teamInfo.away.stats.shootingBreakdown.fieldGoals.totalMade}/${bs.teamInfo.away.stats.shootingBreakdown.fieldGoals.totalAttempted}` },
                    { label: 'FG%', home: bs.teamInfo.home.stats.shootingBreakdown.fieldGoals.totalPercentage, away: bs.teamInfo.away.stats.shootingBreakdown.fieldGoals.totalPercentage, suffix: '%' },
                    { label: '2PT', home: `${bs.teamInfo.home.stats.shootingBreakdown.fieldGoals['2-PointShots'].made}/${bs.teamInfo.home.stats.shootingBreakdown.fieldGoals['2-PointShots'].attempted}`, away: `${bs.teamInfo.away.stats.shootingBreakdown.fieldGoals['2-PointShots'].made}/${bs.teamInfo.away.stats.shootingBreakdown.fieldGoals['2-PointShots'].attempted}` },
                    { label: '2P%', home: bs.teamInfo.home.stats.shootingBreakdown.fieldGoals['2-PointShots'].percentage, away: bs.teamInfo.away.stats.shootingBreakdown.fieldGoals['2-PointShots'].percentage, suffix: '%' },
                    { label: '3PT', home: `${bs.teamInfo.home.stats.shootingBreakdown.fieldGoals['3-PointShots'].made}/${bs.teamInfo.home.stats.shootingBreakdown.fieldGoals['3-PointShots'].attempted}`, away: `${bs.teamInfo.away.stats.shootingBreakdown.fieldGoals['3-PointShots'].made}/${bs.teamInfo.away.stats.shootingBreakdown.fieldGoals['3-PointShots'].attempted}` },
                    { label: '3P%', home: bs.teamInfo.home.stats.shootingBreakdown.fieldGoals['3-PointShots'].percentage, away: bs.teamInfo.away.stats.shootingBreakdown.fieldGoals['3-PointShots'].percentage, suffix: '%' },
                    { label: 'FT', home: `${bs.teamInfo.home.stats.shootingBreakdown.freeThrows.made}/${bs.teamInfo.home.stats.shootingBreakdown.freeThrows.attempted}`, away: `${bs.teamInfo.away.stats.shootingBreakdown.freeThrows.made}/${bs.teamInfo.away.stats.shootingBreakdown.freeThrows.attempted}` },
                    { label: 'FT%', home: bs.teamInfo.home.stats.shootingBreakdown.freeThrows.percentage, away: bs.teamInfo.away.stats.shootingBreakdown.freeThrows.percentage, suffix: '%' },
                    { label: 'TRB', home: bs.teamInfo.home.stats.rebounds.total, away: bs.teamInfo.away.stats.rebounds.total },
                    { label: 'DRB', home: bs.teamInfo.home.stats.rebounds.defensive, away: bs.teamInfo.away.stats.rebounds.defensive },
                    { label: 'ORB', home: bs.teamInfo.home.stats.rebounds.offensive, away: bs.teamInfo.away.stats.rebounds.offensive },
                    { label: 'AST', home: bs.teamInfo.home.stats.assists, away: bs.teamInfo.away.stats.assists },
                    { label: 'STL', home: bs.teamInfo.home.stats.defense.steals, away: bs.teamInfo.away.stats.defense.steals },
                    { label: 'BLK', home: bs.teamInfo.home.stats.defense.blocks, away: bs.teamInfo.away.stats.defense.blocks },
                    { label: 'TO', home: bs.teamInfo.home.stats.turnovers, away: bs.teamInfo.away.stats.turnovers },
                    { label: t('endgame', 'fouls'), home: bs.teamInfo.home.stats.fouls.total, away: bs.teamInfo.away.stats.fouls.total },
                  ];
                  return stats.map((s) => (
                    <div key={s.label} className="ets-row">
                      <span className="ets-val home">{s.suffix ? `${s.home}${s.suffix}` : s.home}</span>
                      <span className="ets-label">{s.label}</span>
                      <span className="ets-val away">{s.suffix ? `${s.away}${s.suffix}` : s.away}</span>
                    </div>
                  ));
                })()}
              </div>
            </div>
          </div>

          <div className="endgame-right">
            {['home', 'away'].map((side) => (
              <div key={side} className="endgame-section">
                <div className="endgame-section-title">{t('endgame', 'boxScore', { teamName: bs.teamInfo[side].name })}</div>
                <div className="endgame-player-table-wrap">
                  <table className="endgame-player-table">
                    <thead>
                      <tr>
                        {PLAYER_COLUMNS.map((col) => (
                          <th
                            key={col.key}
                            className={`${col.className || ''} ept-sortable ${sortCol[side] === col.key ? 'ept-sorted' : ''}`}
                            onClick={() => handleSort(side, col.key)}
                          >
                            {col.label}
                            {sortCol[side] === col.key && (
                              <span className="ept-sort-arrow">{sortDir[side] === 'desc' ? '\u25BC' : '\u25B2'}</span>
                            )}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {getPlayerStats(side).map((p) => (
                        <tr key={p.playerID}>
                          {PLAYER_COLUMNS.map((col) => (
                            <td key={col.key} className={col.className || ''}>
                              {col.display ? col.display(p) : col.get(p)}
                            </td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="endgame-footer">
          {saveStatus === 'saving' && <span className="save-indicator saving">{t('endgame', 'savingGame')}</span>}
          {saveStatus === 'saved' && <span className="save-indicator saved">{t('endgame', 'gameSaved')}</span>}
          {saveStatus === 'error' && (
            <span className="save-indicator error">
              {saveError ? t('endgame', 'saveFailedDetail', { error: saveError }) : t('endgame', 'saveFailed')}
              <button className="btn btn-small" onClick={() => setSaveStatus('pending')}>{t('endgame', 'retry')}</button>
            </span>
          )}
          <button className="btn btn-back-to-game" onClick={() => { dispatch({ type: 'UNDO_END_GAME' }); shouldSync.current = true; }}>{t('endgame', 'backToGame')}</button>
          <button className="btn" onClick={exportBoxScore}>{t('endgame', 'exportBoxScore')}</button>
          <button className="btn btn-primary btn-large" onClick={() => dispatch({ type: 'RESET_GAME' })}>{t('endgame', 'newGame')}</button>
        </div>
      </div>
    );
  }

  // Scoreboard info: fouls, bonus, possession
  const QUARTER_KEYS_SB = { 1: 'first', 2: 'second', 3: 'third', 4: 'fourth' };
  const qKey = quarter <= 4 ? QUARTER_KEYS_SB[quarter] : `OT${quarter - 4}`;
  const isOTQuarter = quarter > 4;
  const arrow = bs.gameInfo.state.possessionArrow;

  function getQuarterFouls(side, key) {
    if (key.startsWith('OT')) {
      return bs.teamInfo[side].stats.fouls.perQuarter.overtime[key]?.committed || 0;
    }
    return bs.teamInfo[side].stats.fouls.perQuarter[key]?.committed || 0;
  }

  function getSideInfo(side) {
    const oppSide = side === 'home' ? 'away' : 'home';
    const oppFouls = getQuarterFouls(oppSide, qKey);
    const oneAndOne = game.settings.fouls.bonus.oneAndOne;
    const dblBonus = game.settings.fouls.bonus.doubleBonus;
    const inBonus = oneAndOne != null && oppFouls >= oneAndOne;
    const inDoubleBonus = dblBonus != null && oppFouls >= dblBonus;
    const teamFouls = getQuarterFouls(side, qKey);
    const timeouts = bs.teamInfo[side].stats.timeouts.remaining;
    return { teamFouls, inBonus, inDoubleBonus, timeouts };
  }

  const homeInfo = getSideInfo('home');
  const awayInfo = getSideInfo('away');

  const liveStatusLabel = (() => {
    switch (liveSync.saveStatus) {
      case 'saving': return 'Saving…';
      case 'saved': return 'Saved';
      case 'error': return 'Save failed';
      default: return 'Idle';
    }
  })();

  // Hotkey constants for inline badges on each option
  const SHOT_HOTKEYS = { 'made-1': 'Q', 'made-2': 'W', 'made-3': 'E', 'miss-1': 'R', 'miss-2': 'T', 'miss-3': 'Y' };
  const STAT_HOTKEYS = { rebound: 'Q', assist: 'W', steal: 'E', block: 'R', turnover: 'T', foul: 'Y', timeout: 'Q', substitution: 'W' };
  const SUB_MENU_HOTKEYS = ['Q', 'W', 'E', 'R'];
  const PLAYER_HOTKEYS = ['Q', 'W', 'E', 'R', 'T', 'A', 'S', 'D', 'F', 'G', 'Z', 'X', 'C', 'V', 'B'];

  return (
    <div className={`screen game-screen ${correctionMode ? 'correction-mode' : ''}`}>
      {/* Live-sync bar: open crowd scoreboard + show save status */}
      <div className="livesync-bar">
        <button type="button" className="livesync-btn" onClick={liveSync.openScoreboard}>
          Open Scoreboard
        </button>
        <span className={`livesync-status livesync-${liveSync.saveStatus}`}>{liveStatusLabel}</span>
      </div>


      {/* Scoreboard */}
      <div className="game-scoreboard">
        <div className="scoreboard-team home">
          <span className={`scoreboard-badge ${homeInfo.inDoubleBonus ? 'active' : ''}`}>{t('game', 'doubleBonus')}</span>
          <span className={`scoreboard-badge ${homeInfo.inBonus && !homeInfo.inDoubleBonus ? 'active' : ''}`}>{t('game', 'bonus')}</span>
          <span className="scoreboard-fouls">{t('game', 'foulsLabel', { count: homeInfo.teamFouls })}</span>
          <span className="scoreboard-timeouts">
            <span className="to-label">{t('game', 'timeoutsLabel')}</span>
            <span className={`to-count ${homeInfo.timeouts.full <= 0 ? 'depleted' : ''}`}>{t('game', 'fullCount', { count: homeInfo.timeouts.full })}</span>
            <span className="to-divider"></span>
            <span className={`to-count ${homeInfo.timeouts.short <= 0 ? 'depleted' : ''}`}>{t('game', 'shortCount', { count: homeInfo.timeouts.short })}</span>
          </span>
          <span className={`scoreboard-poss ${arrow === 'home' ? 'active' : ''}`}>{t('game', 'possession')}</span>
          <span className="scoreboard-team-name">{bs.teamInfo.home.name}</span>
          <span className="scoreboard-score">{bs.teamInfo.home.score.current}</span>
        </div>
        <div className="scoreboard-clock">
          <span className="scoreboard-quarter">{formatQuarter(quarter)}</span>
          {clockEdit != null ? (
            <div className="clock-edit">
              <div className="clock-edit-inputs">
                <input
                  type="number"
                  min="0"
                  max="99"
                  value={clockEdit.minutes}
                  onChange={(e) => setClockEdit({ ...clockEdit, minutes: Math.max(0, parseInt(e.target.value) || 0) })}
                />
                <span>:</span>
                <input
                  type="number"
                  min="0"
                  max="59"
                  value={clockEdit.seconds}
                  onChange={(e) => setClockEdit({ ...clockEdit, seconds: Math.min(59, Math.max(0, parseInt(e.target.value) || 0)) })}
                />
              </div>
              <div className="clock-edit-actions">
                <button onClick={() => {
                  dispatch({ type: 'SET_CLOCK_TIME', timeLeft: (clockEdit.minutes * 60) + clockEdit.seconds });
                  shouldSync.current = true;
                  setClockEdit(null);
                  setCorrectionMode(false);
                }}>{t('game', 'set')}</button>
                <button onClick={() => setClockEdit(null)}>X</button>
              </div>
            </div>
          ) : (
            <span
              className={`scoreboard-time ${!isActive ? 'stopped' : ''} ${correctionMode ? 'editable' : ''}`}
              onClick={() => {
                if (correctionMode) {
                  const t = Math.max(0, timeLeft || 0);
                  const m = Math.floor(t / 60);
                  const s = Math.floor(t % 60);
                  setClockEdit({ minutes: m, seconds: s });
                }
              }}
            >
              {timeoutCountdown && timeoutCountdown.timeLeft > 0
                ? formatClock(timeoutCountdown.timeLeft)
                : (periodOver && breakCountdown != null && breakCountdown > 0
                    ? formatClock(breakCountdown)
                    : formatClock(timeLeft))}
            </span>
          )}
          {periodOver && !isGameOver && !isFinal && (
            <span className="btn btn-small btn-next-quarter period-break-label">
              NEXT: {formatQuarter(quarter + 1)}
            </span>
          )}
          {isGameOver && !isFinal && (
            <button
              className="btn btn-small btn-end-game"
              onClick={() => { dispatch({ type: 'END_GAME' }); shouldSync.current = true; setSaveStatus('pending'); }}
            >
              {t('game', 'endGame')}
            </button>
          )}
        </div>
        <div className="scoreboard-team away">
          <span className="scoreboard-score">{bs.teamInfo.away.score.current}</span>
          <span className="scoreboard-team-name">{bs.teamInfo.away.name}</span>
          <span className={`scoreboard-poss ${arrow === 'away' ? 'active' : ''}`}>{t('game', 'possession')}</span>
          <span className="scoreboard-timeouts">
            <span className="to-label">{t('game', 'timeoutsLabel')}</span>
            <span className={`to-count ${awayInfo.timeouts.full <= 0 ? 'depleted' : ''}`}>{t('game', 'fullCount', { count: awayInfo.timeouts.full })}</span>
            <span className="to-divider"></span>
            <span className={`to-count ${awayInfo.timeouts.short <= 0 ? 'depleted' : ''}`}>{t('game', 'shortCount', { count: awayInfo.timeouts.short })}</span>
          </span>
          <span className="scoreboard-fouls">{t('game', 'foulsLabel', { count: awayInfo.teamFouls })}</span>
          <span className={`scoreboard-badge ${awayInfo.inBonus && !awayInfo.inDoubleBonus ? 'active' : ''}`}>{t('game', 'bonus')}</span>
          <span className={`scoreboard-badge ${awayInfo.inDoubleBonus ? 'active' : ''}`}>{t('game', 'doubleBonus')}</span>
        </div>
      </div>

      {/* Clock status banner */}
      {!periodOver ? (
        <div className={`game-status-banner ${isActive ? 'running' : 'stopped'}`}>
          {isActive ? t('game', 'clockRunning') : t('game', 'clockStopped')}
        </div>
      ) : (
        <div className={`game-status-banner period-end ${isGameOver || isFinal ? 'final' : ''}`}>
          {isFinal ? t('game', 'final') : periodEndLabel}
        </div>
      )}

      {/* Court area */}
      <div className="game-court">
        {renderHalf('home')}

        <div className="game-divider">
          {breakCountdown != null && breakCountdown > 0 && (
            <button
              className="btn-divider skip-break"
              onClick={() => {
                breakRef.current = null;
                setBreakCountdown(null);
                if (!isGameOver && !isFinal) {
                  dispatch({ type: 'ADVANCE_QUARTER' });
                  shouldSync.current = true;
                }
              }}
            >
              <span>{t('game', 'skip')}</span>
              <span>{t('game', 'breakLabel')}</span>
            </button>
          )}

          <button
            type="button"
            className={`btn-divider indicator ${isAutoStopOn ? 'on' : 'off'} ${autoStopDisabled ? 'user-off' : ''}`}
            onClick={() => setAutoStopDisabled((v) => !v)}
            title={autoStopDisabled ? 'Auto-stop disabled — click to follow settings' : 'Auto-stop follows settings — click to disable'}
          >
            <span>{t('game', 'auto')}</span>
            <span>{t('game', 'stop')}</span>
          </button>

          {periodOver && !isGameOver && !isFinal ? (
            <button
              className="btn-clock next-period"
              onClick={() => { dispatch({ type: 'ADVANCE_QUARTER' }); dispatch({ type: 'TOGGLE_CLOCK' }); shouldSync.current = true; }}
            >
              <span>{t('game', 'start')}</span>
              <span>{t('game', 'next')}</span>
              <span>{t('game', 'period')}</span>
            </button>
          ) : timeoutCountdown ? (
            <button
              className="btn-clock timeout-end"
              onClick={() => { setTimeoutCountdown(null); }}
            >
              <span>END</span>
              <span>TIMEOUT</span>
            </button>
          ) : (
            <button
              className={`btn-clock ${isActive ? 'running' : 'stopped'} ${suggestStopClock && isActive ? 'suggest' : ''}`}
              onClick={() => { dispatch({ type: 'TOGGLE_CLOCK' }); setSuggestStopClock(false); shouldSync.current = true; }}
            >
              <span>{isActive ? t('game', 'stop') : t('game', 'run')}</span>
              <span>{t('game', 'clock')}</span>
            </button>
          )}

          <button className="btn-divider" onClick={() => { maybeAutoStop('Referee Timeout'); shouldSync.current = true; }}>
            <span>{t('game', 'ref')}</span>
            <span>{t('game', 'to')}</span>
          </button>

          <button className="btn-divider" onClick={() => { dispatch({ type: 'JUMP_BALL' }); maybeAutoStop('Jump Ball'); shouldSync.current = true; }}>
            <span>{t('game', 'jump')}</span>
            <span>{t('game', 'ball')}</span>
          </button>

          <button
            className={`btn-divider ${correctionMode ? 'correction-active' : ''}`}
            onClick={() => {
              setCorrectionMode(!correctionMode);
              setPendingAction(null);
              setClockEdit(null);
            }}
          >
            <span>{t('game', 'corr')}</span>
            <span>{t('game', 'ect')}</span>
          </button>

          {correctionMode && quarter > 1 && (
            <button
              className="btn-divider correction-active"
              onClick={() => {
                dispatch({ type: 'REVERT_QUARTER' });
                shouldSync.current = true;
                setCorrectionMode(false);
              }}
            >
              <span>{t('game', 'prev')}</span>
              <span>{t('game', 'period')}</span>
            </button>
          )}
        </div>

        {renderHalf('away')}
      </div>
    </div>
  );
}
