import { useState, useEffect, useRef } from 'react';
import { useGame, useGameDispatch } from '../context/GameContext';
import { syncLiveGame, saveEndGame } from '../data/api';

function formatClock(totalSeconds) {
  const m = Math.floor(totalSeconds / 60);
  const s = totalSeconds % 60;
  return `${m}:${s.toString().padStart(2, '0')}`;
}

function formatQuarter(q) {
  if (q <= 4) return `Q${q}`;
  return `OT${q - 4}`;
}

function actionLabel(points, made) {
  return `${points}PT ${made ? 'MADE' : 'MISS'}`;
}

function pendingLabel(pending) {
  if (!pending) return '';
  if (pending.type === 'shot') return actionLabel(pending.points, pending.made);
  const LABELS = {
    rebound: 'REBOUND',
    'rebound-offensive': 'OFF. REBOUND',
    'rebound-defensive': 'DEF. REBOUND',
    assist: 'ASSIST',
    steal: 'STEAL',
    block: 'BLOCK',
    turnover: 'TURNOVER',
    'foul-personal': 'PERSONAL FOUL',
    'foul-technical': 'TECHNICAL FOUL',
    'foul-flagrant': 'FLAGRANT FOUL',
    'foul-offensive': 'OFFENSIVE FOUL',
    substitution: 'SUBSTITUTION',
    'late-add-sub-in': 'LATE ADD SUB IN',
  };
  return LABELS[pending.action] || pending.action?.toUpperCase() || '';
}

export default function GameScreen() {
  const game = useGame();
  const dispatch = useGameDispatch();
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

  // --- Live game sync (fire-and-forget POST to Cosmos) ---
  const shouldSync = useRef(false);
  const initialSynced = useRef(false);

  // One-time sync when GameScreen first mounts with a box score
  useEffect(() => {
    if (!bs || initialSynced.current) return;
    initialSynced.current = true;
    syncLiveGame(bs);
  }, [bs]);

  // Sync after meaningful actions (flag-based)
  useEffect(() => {
    if (!bs || !shouldSync.current) return;
    shouldSync.current = false;
    syncLiveGame(bs);
  }, [bs]);

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
    if (quarter >= 4 && !isTied) return 'FINAL';
    if (quarter === 2) return '1ST HALF';
    return `END ${formatQuarter(quarter)}`;
  })();
  const isGameOver = periodOver && periodEndLabel === 'FINAL';

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
      const t = timeLeftRef.current;
      if (t <= 0) {
        clearInterval(id);
        dispatch({ type: 'TOGGLE_CLOCK' });
        shouldSync.current = true;
        return;
      }
      dispatch({ type: 'SET_CLOCK_TIME', timeLeft: t - 1 });
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
    if (isCorrection) setCorrectionMode(false);
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
        <div className="section-label">SCORING</div>
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
        <div className="section-label">STATS</div>
        <div className="action-row action-row-stats">
          <button
            className={`btn-action stat ${isStatActive(side, 'rebound') || isStatActive(side, 'rebound-offensive') || isStatActive(side, 'rebound-defensive') ? 'active' : ''} ${suggestRebound ? 'suggest' : ''}`}
            onClick={() => handleStatTap(side, 'rebound')}
          >
            REBOUND
          </button>
          <button
            className={`btn-action stat ${isStatActive(side, 'assist') ? 'active' : ''} ${suggestAssist === side ? 'suggest' : ''}`}
            onClick={() => handleStatTap(side, 'assist')}
          >
            ASSIST
          </button>
          <button
            className={`btn-action stat ${isStatActive(side, 'steal') ? 'active' : ''} ${suggestSteal === side ? 'suggest' : ''}`}
            onClick={() => handleStatTap(side, 'steal')}
          >
            STEAL
          </button>
          <button
            className={`btn-action stat ${isStatActive(side, 'block') ? 'active' : ''}`}
            onClick={() => handleStatTap(side, 'block')}
          >
            BLOCK
          </button>
          <button
            className={`btn-action stat ${isStatActive(side, 'turnover') || isStatActive(side, 'turnover-steal') || isStatActive(side, 'turnover-error') ? 'active' : ''} ${suggestTurnover === side ? 'suggest' : ''}`}
            onClick={() => handleStatTap(side, 'turnover')}
          >
            TURNOVER
          </button>
          <button
            className={`btn-action stat ${isStatActive(side, 'foul') || isStatActive(side, 'foul-personal') || isStatActive(side, 'foul-technical') || isStatActive(side, 'foul-flagrant') || isStatActive(side, 'foul-offensive') ? 'active' : ''}`}
            onClick={() => handleStatTap(side, 'foul')}
          >
            FOUL
          </button>
        </div>
      </div>
    );
  }

  function renderMgmtSection(side) {
    const toActive = timeoutCountdown?.side === side;
    const toBlocked = timeoutCountdown != null && timeoutCountdown.side !== side;
    return (
      <div className="game-section">
        <div className="section-label">GAME</div>
        <div className="action-row action-row-mgmt">
          <button
            className={`btn-action mgmt ${isStatActive(side, 'timeout') ? 'active' : ''}`}
            onClick={() => handleStatTap(side, 'timeout')}
            disabled={toBlocked || periodOver}
          >
            TIMEOUT
            {toActive && (
              <span className="to-timer">
                {timeoutCountdown.type === 'full' ? 'FULL' : 'SHORT'} {formatClock(timeoutCountdown.timeLeft)}
              </span>
            )}
          </button>
          <button
            className={`btn-action mgmt ${isStatActive(side, 'substitution') ? 'active' : ''}`}
            onClick={() => handleStatTap(side, 'substitution')}
          >
            SUBSTITUTION
          </button>
          <button
            className={`btn-action mgmt ${isStatActive(side, 'late-add') ? 'active' : ''}`}
            onClick={() => { setLateAddNumbers({}); handleStatTap(side, 'late-add'); }}
          >
            LATE ADD
          </button>
        </div>
      </div>
    );
  }

  const SUB_MENU_CHOICES = {
    rebound: [
      { action: 'rebound-offensive', label: 'OFFENSIVE' },
      { action: 'rebound-defensive', label: 'DEFENSIVE' },
    ],
    foul: [
      { action: 'foul-personal', label: 'PERSONAL' },
      { action: 'foul-offensive', label: 'OFFENSIVE' },
      { action: 'foul-technical', label: 'TECHNICAL' },
      { action: 'foul-flagrant', label: 'FLAGRANT' },
    ],
    turnover: [
      { action: 'turnover-steal', label: 'STOLEN' },
      { action: 'turnover-error', label: 'ERROR' },
    ],
    timeout: [
      { action: 'timeout-full', label: 'FULL', timeoutType: 'full' },
      { action: 'timeout-short', label: 'SHORT', timeoutType: 'short' },
    ],
  };

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
            <span className="selection-banner-text">LATE ADD: SELECT PLAYER</span>
            <button className="btn btn-small" onClick={() => { setLateAddNumbers({}); cancelPending(); }}>
              Cancel
            </button>
          </div>
          {!hasEmptySlot ? (
            <div className="late-add-full">Roster is full (12 players)</div>
          ) : available.length === 0 ? (
            <div className="late-add-full">All roster players are already in the game</div>
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
                      ADD
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
            <span className="selection-banner-text">LATE ADD SUB IN: SELECT PLAYER</span>
            <button className="btn btn-small" onClick={() => cancelPending()}>
              Cancel
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
              <div className="sub-empty-bench">No bench players available</div>
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
                ? 'SELECT: PLAYER OUT'
                : `#${outPlayer?.number || '?'} ${outPlayer?.name} OUT → SELECT: PLAYER IN`}
            </span>
            <button className="btn btn-small" onClick={() => {
              if (subStep === 2) {
                setPendingAction({ ...pendingAction, outIndex: undefined });
              } else {
                setPendingAction(null);
              }
            }}>
              {subStep === 2 ? 'Back' : 'Cancel'}
            </button>
          </div>

          <div className="sub-section-label">ON COURT</div>
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

          <div className="sub-section-label">ON BENCH</div>
          <div className="player-grid">
            {benchPlayers.length > 0 ? benchPlayers.map((player) => {
              const actualIndex = team.roster.inGame.findIndex((p) => p.playerID === player.playerID);
              return renderPlayerCard(player, team, {
                selectable: subStep === 2,
                onClick: () => handleSubIn(side, actualIndex),
                dimmed: subStep === 1,
              });
            }) : (
              <div className="sub-empty-bench">No bench players</div>
            )}
          </div>
        </div>
      );
    }

    return (
      <div className="game-section game-section-players">
        <div className="section-label">PLAYERS</div>
        {isSelecting && (
          <div className="selection-banner">
            <span className="selection-banner-text">
              {correctionMode ? 'CORRECT' : 'SELECT'}: {pendingLabel(pendingAction)}
            </span>
            <button className="btn btn-small" onClick={() => cancelPending()}>
              Cancel
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
                  disabled={isTimeout && remaining <= 0}
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
              <span className="placeholder-label">LATE ADD</span>
              <span className="placeholder-label">SUB IN</span>
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
          <span className="endgame-label">FINAL</span>
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
          {/* Left half: Scoring by Period + Team Stats */}
          <div className="endgame-left">
            <div className="endgame-section">
              <div className="endgame-section-title">SCORING BY PERIOD</div>
              <div className="endgame-quarter-table">
                <div className="eq-row eq-header">
                  <span className="eq-team-col"></span>
                  {periodLabels.map((l) => <span key={l} className="eq-cell">{l}</span>)}
                  <span className="eq-cell eq-total">T</span>
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
              <div className="endgame-section-title">TEAM STATS</div>
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
                    { label: 'FOULS', home: bs.teamInfo.home.stats.fouls.total, away: bs.teamInfo.away.stats.fouls.total },
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

          {/* Right half: Player Box Scores */}
          <div className="endgame-right">
            {['home', 'away'].map((side) => (
              <div key={side} className="endgame-section">
                <div className="endgame-section-title">{bs.teamInfo[side].name} — BOX SCORE</div>
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
          {saveStatus === 'saving' && <span className="save-indicator saving">Saving game...</span>}
          {saveStatus === 'saved' && <span className="save-indicator saved">Game saved!</span>}
          {saveStatus === 'error' && (
            <span className="save-indicator error">
              Save failed{saveError ? `: ${saveError}` : ''}
              <button className="btn btn-small" onClick={() => setSaveStatus('pending')}>RETRY</button>
            </span>
          )}
          <button className="btn" onClick={exportBoxScore}>EXPORT BOX SCORE</button>
          <button className="btn btn-primary btn-large" onClick={() => dispatch({ type: 'RESET_GAME' })}>NEW GAME</button>
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
          <span className={`scoreboard-badge ${homeInfo.inDoubleBonus ? 'active' : ''}`}>2x BONUS</span>
          <span className={`scoreboard-badge ${homeInfo.inBonus && !homeInfo.inDoubleBonus ? 'active' : ''}`}>BONUS</span>
          <span className="scoreboard-fouls">FOULS: {homeInfo.teamFouls}</span>
          <span className="scoreboard-timeouts">
            <span className="to-label">Timeouts:</span>
            <span className={`to-count ${homeInfo.timeouts.full <= 0 ? 'depleted' : ''}`}>Full:{homeInfo.timeouts.full}</span>
            <span className="to-divider"></span>
            <span className={`to-count ${homeInfo.timeouts.short <= 0 ? 'depleted' : ''}`}>Short:{homeInfo.timeouts.short}</span>
          </span>
          <span className={`scoreboard-poss ${arrow === 'home' ? 'active' : ''}`}>POSSESSION</span>
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
                }}>SET</button>
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
              END GAME
            </button>
          )}
        </div>
        <div className="scoreboard-team away">
          <span className="scoreboard-score">{bs.teamInfo.away.score.current}</span>
          <span className="scoreboard-team-name">{bs.teamInfo.away.name}</span>
          <span className={`scoreboard-poss ${arrow === 'away' ? 'active' : ''}`}>POSSESSION</span>
          <span className="scoreboard-timeouts">
            <span className="to-label">Timeouts:</span>
            <span className={`to-count ${awayInfo.timeouts.full <= 0 ? 'depleted' : ''}`}>Full:{awayInfo.timeouts.full}</span>
            <span className="to-divider"></span>
            <span className={`to-count ${awayInfo.timeouts.short <= 0 ? 'depleted' : ''}`}>Short:{awayInfo.timeouts.short}</span>
          </span>
          <span className="scoreboard-fouls">FOULS: {awayInfo.teamFouls}</span>
          <span className={`scoreboard-badge ${awayInfo.inBonus && !awayInfo.inDoubleBonus ? 'active' : ''}`}>BONUS</span>
          <span className={`scoreboard-badge ${awayInfo.inDoubleBonus ? 'active' : ''}`}>2x BONUS</span>
        </div>
      </div>

      {/* Clock status banner */}
      {!periodOver ? (
        <div className={`game-status-banner ${isActive ? 'running' : 'stopped'}`}>
          {isActive ? 'CLOCK RUNNING' : 'CLOCK STOPPED'}
        </div>
      ) : (
        <div className={`game-status-banner period-end ${isGameOver || isFinal ? 'final' : ''}`}>
          {isFinal ? 'FINAL' : periodEndLabel}
        </div>
      )}

      {/* Court area */}
      <div className={`game-court ${periodOver ? 'period-over' : ''}`}>
        {renderHalf('home')}

        <div className="game-divider">
          <button className={`btn-divider indicator ${isAutoStopActive ? 'on' : 'off'}`}>
            <span>AUTO</span>
            <span>STOP</span>
          </button>

          {periodOver && !isGameOver && !isFinal ? (
            <button
              className="btn-clock next-period"
              onClick={() => { dispatch({ type: 'ADVANCE_QUARTER' }); dispatch({ type: 'TOGGLE_CLOCK' }); shouldSync.current = true; }}
              disabled={breakCountdown != null && breakCountdown > 0}
            >
              <span>START</span>
              <span>NEXT</span>
              <span>PERIOD</span>
            </button>
          ) : (
            <button
              className={`btn-clock ${isActive ? 'running' : 'stopped'} ${suggestStopClock && isActive ? 'suggest' : ''}`}
              onClick={() => { dispatch({ type: 'TOGGLE_CLOCK' }); setSuggestStopClock(false); shouldSync.current = true; }}
              disabled={(periodOver && (isGameOver || isFinal)) || (!isActive && timeoutCountdown != null)}
            >
              <span>{isActive ? 'STOP' : 'RUN'}</span>
              <span>CLOCK</span>
            </button>
          )}

          <button className="btn-divider" onClick={() => { maybeAutoStop('Referee Timeout'); shouldSync.current = true; }} disabled={periodOver}>
            <span>REF</span>
            <span>T.O.</span>
          </button>

          <button className="btn-divider" onClick={() => { dispatch({ type: 'JUMP_BALL' }); maybeAutoStop('Jump Ball'); shouldSync.current = true; }}>
            <span>JUMP</span>
            <span>BALL</span>
          </button>

          <button
            className={`btn-divider ${correctionMode ? 'correction-active' : ''}`}
            onClick={() => {
              setCorrectionMode(!correctionMode);
              setPendingAction(null);
              setClockEdit(null);
            }}
          >
            <span>CORR</span>
            <span>ECT</span>
          </button>
        </div>

        {renderHalf('away')}
      </div>
    </div>
  );
}
