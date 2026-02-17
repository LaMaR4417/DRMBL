import { useState, useEffect, useRef } from 'react';
import { useGame, useGameDispatch } from '../context/GameContext';
import { syncLiveGame, saveEndGame } from '../data/api';
import { useTranslation } from '../i18n/useTranslation';

function formatClock(totalSeconds) {
  const m = Math.floor(totalSeconds / 60);
  const s = totalSeconds % 60;
  return `${m}:${s.toString().padStart(2, '0')}`;
}

function formatQuarter(q) {
  if (q <= 4) return `Q${q}`;
  return `OT${q - 4}`;
}

export default function GameScreen() {
  const game = useGame();
  const dispatch = useGameDispatch();
  const { t } = useTranslation();
  const [pendingAction, setPendingAction] = useState(null);
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
  const syncMeta = { settings: game.settings, selectedSeason: game.selectedSeason, homeTeam: game.homeTeam, awayTeam: game.awayTeam };

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

  // Auto-stop clock or suggest based on action and stoppages settings
  function maybeAutoStop(actionName) {
    if (!isActive) return;
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
    const id = setInterval(() => {
      const tl = timeLeftRef.current;
      if (tl <= 0) {
        clearInterval(id);
        dispatch({ type: 'TOGGLE_CLOCK' });
        shouldSync.current = true;
        return;
      }
      dispatch({ type: 'SET_CLOCK_TIME', timeLeft: tl - 1 });
    }, 1000);
    return () => clearInterval(id);
  }, [isActive, dispatch]);

  // --- Timeout countdown timer ---
  const toCountdownRef = useRef(null);
  useEffect(() => {
    if (toCountdownRef.current) toCountdownRef.current = timeoutCountdown;
  }, [timeoutCountdown]);

  useEffect(() => {
    if (!timeoutCountdown) return;
    toCountdownRef.current = timeoutCountdown;
    const id = setInterval(() => {
      const cur = toCountdownRef.current;
      if (!cur || cur.timeLeft <= 1) {
        clearInterval(id);
        setTimeoutCountdown(null);
        return;
      }
      setTimeoutCountdown({ ...cur, timeLeft: cur.timeLeft - 1 });
    }, 1000);
    return () => clearInterval(id);
  }, [timeoutCountdown?.side, timeoutCountdown?.type]); // restart only when a new timeout starts

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
        breakRef.current = 0;
        setBreakCountdown(0);
        return;
      }
      breakRef.current = cur - 1;
      setBreakCountdown(cur - 1);
    }, 1000);
    return () => clearInterval(id);
  }, [periodOver, quarter]);

  // --- End game save (fires once when END_GAME dispatch settles) ---
  useEffect(() => {
    if (saveStatus !== 'pending') return;
    if (!bs || bs.gameInfo.general.status !== 'final') return;
    setSaveStatus('saving');

    saveEndGame(bs, game.homeTeam.teamID, game.awayTeam.teamID, game.homeTeam.slot, game.awayTeam.slot)
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
  function renderShotSection(side) {
    return (
      <div className="game-section">
        <div className="section-label">{t('game', 'scoring')}</div>
        <div className="action-row">
          {[1, 2, 3].map((pts) => (
            <button
              key={`${pts}-made`}
              className={`btn-action made ${isShotActive(side, pts, true) ? 'active' : ''} ${suggestShot === side && pts >= 2 ? 'suggest' : ''}`}
              onClick={() => handleShotTap(side, pts, true)}
            >
              {actionLabel(pts, true)}
            </button>
          ))}
          {[1, 2, 3].map((pts) => (
            <button
              key={`${pts}-miss`}
              className={`btn-action miss ${isShotActive(side, pts, false) ? 'active' : ''}`}
              onClick={() => handleShotTap(side, pts, false)}
            >
              {actionLabel(pts, false)}
            </button>
          ))}
        </div>
      </div>
    );
  }

  function renderStatSection(side) {
    return (
      <div className="game-section">
        <div className="section-label">{t('game', 'stats')}</div>
        <div className="action-row action-row-stats">
          <button
            className={`btn-action stat ${isStatActive(side, 'rebound') || isStatActive(side, 'rebound-offensive') || isStatActive(side, 'rebound-defensive') ? 'active' : ''} ${suggestRebound ? 'suggest' : ''}`}
            onClick={() => handleStatTap(side, 'rebound')}
          >
            {t('game', 'rebound')}
          </button>
          <button
            className={`btn-action stat ${isStatActive(side, 'assist') ? 'active' : ''} ${suggestAssist === side ? 'suggest' : ''}`}
            onClick={() => handleStatTap(side, 'assist')}
          >
            {t('game', 'assist')}
          </button>
          <button
            className={`btn-action stat ${isStatActive(side, 'steal') ? 'active' : ''} ${suggestSteal === side ? 'suggest' : ''}`}
            onClick={() => handleStatTap(side, 'steal')}
          >
            {t('game', 'steal')}
          </button>
          <button
            className={`btn-action stat ${isStatActive(side, 'block') ? 'active' : ''}`}
            onClick={() => handleStatTap(side, 'block')}
          >
            {t('game', 'block')}
          </button>
          <button
            className={`btn-action stat ${isStatActive(side, 'turnover') || isStatActive(side, 'turnover-steal') || isStatActive(side, 'turnover-error') ? 'active' : ''} ${suggestTurnover === side ? 'suggest' : ''}`}
            onClick={() => handleStatTap(side, 'turnover')}
          >
            {t('game', 'turnover')}
          </button>
          <button
            className={`btn-action stat ${isStatActive(side, 'foul') || isStatActive(side, 'foul-personal') || isStatActive(side, 'foul-technical') || isStatActive(side, 'foul-flagrant') || isStatActive(side, 'foul-offensive') ? 'active' : ''}`}
            onClick={() => handleStatTap(side, 'foul')}
          >
            {t('game', 'foul')}
          </button>
        </div>
      </div>
    );
  }

  function renderMgmtSection(side) {
    const toActive = timeoutCountdown?.side === side;
    return (
      <div className="game-section">
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
          </button>
          <button
            className={`btn-action mgmt ${isStatActive(side, 'substitution') ? 'active' : ''}`}
            onClick={() => handleStatTap(side, 'substitution')}
          >
            {t('game', 'substitution')}
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
    const { selectable, onClick, highlighted, dimmed } = opts;
    return (
      <div
        key={player.playerID}
        className={`player-card ${selectable ? 'selectable' : ''} ${highlighted ? 'highlighted' : ''} ${dimmed ? 'dimmed' : ''}`}
        onClick={selectable ? onClick : undefined}
      >
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
            {courtPlayers.map((player) => {
              const actualIndex = team.roster.inGame.findIndex((p) => p.playerID === player.playerID);
              const isOut = subStep === 2 && actualIndex === pendingAction.outIndex;
              return renderPlayerCard(player, team, {
                selectable: subStep === 1,
                onClick: () => handleSubOut(side, actualIndex),
                highlighted: isOut,
                dimmed: subStep === 2 && !isOut,
              });
            })}
          </div>

          <div className="sub-section-label">{t('game', 'onBench')}</div>
          <div className="player-grid">
            {benchPlayers.length > 0 ? benchPlayers.map((player) => {
              const actualIndex = team.roster.inGame.findIndex((p) => p.playerID === player.playerID);
              return renderPlayerCard(player, team, {
                selectable: subStep === 2,
                onClick: () => handleSubIn(side, actualIndex),
                dimmed: subStep === 1,
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
            {subChoices.map((choice) => {
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
                </button>
              );
            })}
          </div>
        ) : (
        <div className="player-grid">
          {courtPlayers.map((player) => {
            const actualIndex = team.roster.inGame.findIndex(
              (p) => p.playerID === player.playerID,
            );
            return renderPlayerCard(player, team, {
              selectable: isPlayerSelectable,
              onClick: () => handlePlayerSelect(side, actualIndex),
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

    return (
      <div className={`game-half ${side} ${isOtherSelecting ? 'dimmed' : ''} ${isSelecting ? 'selecting' : ''}`}>
        {!isSelecting && renderShotSection(side)}
        {!isSelecting && renderStatSection(side)}
        {!isSelecting && renderMgmtSection(side)}
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

  return (
    <div className={`screen game-screen ${correctionMode ? 'correction-mode' : ''}`}>
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
                  const m = Math.floor(timeLeft / 60);
                  const s = timeLeft % 60;
                  setClockEdit({ minutes: m, seconds: s });
                }
              }}
            >
              {periodOver && breakCountdown != null && breakCountdown > 0
                ? formatClock(breakCountdown)
                : formatClock(timeLeft)}
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
              onClick={() => { breakRef.current = 0; setBreakCountdown(0); }}
            >
              <span>{t('game', 'skip')}</span>
              <span>{t('game', 'breakLabel')}</span>
            </button>
          )}

          <button className={`btn-divider indicator ${isAutoStopActive ? 'on' : 'off'}`}>
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
          ) : (
            <button
              className={`btn-clock ${isActive ? 'running' : 'stopped'} ${suggestStopClock && isActive ? 'suggest' : ''}`}
              onClick={() => { if (!isActive && timeoutCountdown) setTimeoutCountdown(null); dispatch({ type: 'TOGGLE_CLOCK' }); setSuggestStopClock(false); shouldSync.current = true; }}
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
