import { useState, useEffect, useRef } from 'react';
import { useGame, useGameDispatch } from '../context/GameContext';

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
  };
  return LABELS[pending.action] || pending.action?.toUpperCase() || '';
}

export default function GameScreen() {
  const game = useGame();
  const dispatch = useGameDispatch();
  const [pendingAction, setPendingAction] = useState(null);
  const [suggestRebound, setSuggestRebound] = useState(false);
  const [suggestAssist, setSuggestAssist] = useState(null); // 'home' | 'away' | null
  const [suggestShot, setSuggestShot] = useState(null); // 'home' | 'away' | null
  const [suggestTurnover, setSuggestTurnover] = useState(null); // 'home' | 'away' | null
  const [suggestSteal, setSuggestSteal] = useState(null); // 'home' | 'away' | null
  const [suggestStopClock, setSuggestStopClock] = useState(false);

  const bs = game.boxScore;
  const isActive = bs.gameInfo.state.active;
  const timeLeft = bs.gameInfo.state.clock.timeLeft;
  const quarter = bs.gameInfo.state.currentQuarter;

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
        return;
      }
      dispatch({ type: 'SET_CLOCK_TIME', timeLeft: t - 1 });
    }, 1000);
    return () => clearInterval(id);
  }, [isActive, dispatch]);

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
      setPendingAction(null);
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
      setPendingAction(null);
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
      setPendingAction(null);
      return;
    }
    setPendingAction({ type: 'stat', side, action });
  }

  // --- Timeout handler (fires immediately, no player selection) ---
  function handleTimeoutTap(side, timeoutType) {
    setSuggestRebound(false);
    setSuggestAssist(null);
    setSuggestShot(null);
    setSuggestTurnover(null);
    setSuggestSteal(null);
    setSuggestStopClock(false);
    dispatch({ type: 'RECORD_TIMEOUT', side, timeoutType });
    setPendingAction(null);
    maybeAutoStop('Timeout');
  }

  // --- Player selection handler ---
  function handlePlayerSelect(side, playerIndex) {
    if (!pendingAction || pendingAction.side !== side) return;

    if (pendingAction.type === 'shot') {
      dispatch({
        type: pendingAction.made ? 'RECORD_MADE_SHOT' : 'RECORD_MISSED_SHOT',
        side,
        playerIndex,
        points: pendingAction.points,
      });
      if (pendingAction.made) {
        maybeAutoStop('Made Shot');
        if (pendingAction.points >= 2) {
          setSuggestAssist(side);
        }
      } else {
        setSuggestRebound(true);
      }
    }

    if (pendingAction.type === 'stat') {
      const act = pendingAction.action;
      if (act === 'rebound-offensive') {
        dispatch({ type: 'RECORD_REBOUND', side, playerIndex, reboundType: 'offensive' });
      } else if (act === 'rebound-defensive') {
        dispatch({ type: 'RECORD_REBOUND', side, playerIndex, reboundType: 'defensive' });
      } else if (act === 'assist') {
        dispatch({ type: 'RECORD_ASSIST', side, playerIndex });
        setSuggestShot(side);
      } else if (act === 'steal') {
        dispatch({ type: 'RECORD_STEAL', side, playerIndex });
        setSuggestTurnover(side === 'home' ? 'away' : 'home');
      } else if (act === 'block') {
        dispatch({ type: 'RECORD_BLOCK', side, playerIndex });
        setSuggestRebound(true);
      } else if (act === 'turnover-steal' || act === 'turnover-error') {
        dispatch({ type: 'RECORD_TURNOVER', side, playerIndex });
        if (act === 'turnover-steal') {
          setSuggestSteal(side === 'home' ? 'away' : 'home');
        }
        maybeAutoStop('Turnover');
      } else if (act === 'foul-personal') {
        dispatch({ type: 'RECORD_FOUL', side, playerIndex, foulType: 'personal' });
        maybeAutoStop('Foul');
      } else if (act === 'foul-technical') {
        dispatch({ type: 'RECORD_FOUL', side, playerIndex, foulType: 'technical' });
        maybeAutoStop('Foul');
      } else if (act === 'foul-flagrant') {
        dispatch({ type: 'RECORD_FOUL', side, playerIndex, foulType: 'flagrant' });
        maybeAutoStop('Foul');
      } else if (act === 'foul-offensive') {
        dispatch({ type: 'RECORD_FOUL', side, playerIndex, foulType: 'offensive' });
        maybeAutoStop('Foul');
      } else {
        // Parent actions (rebound, foul, turnover) need sub-menu first — ignore tap
        return;
      }
    }

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
    const showTimeoutSub = pendingAction?.type === 'stat' && pendingAction?.side === side && pendingAction?.action === 'timeout';
    const remaining = bs.teamInfo[side].stats.timeouts.remaining;

    return (
      <div className="game-section">
        <div className="section-label">GAME</div>
        <div className="action-row action-row-mgmt">
          <button
            className={`btn-action mgmt ${isStatActive(side, 'timeout') ? 'active' : ''}`}
            onClick={() => handleStatTap(side, 'timeout')}
          >
            TIMEOUT
          </button>
          <button
            className={`btn-action mgmt ${isStatActive(side, 'substitution') ? 'active' : ''}`}
            onClick={() => handleStatTap(side, 'substitution')}
          >
            SUB
          </button>
        </div>
        {showTimeoutSub && (
          <div className="action-row action-row-sub">
            <button
              className={`btn-action sub`}
              onClick={() => handleTimeoutTap(side, 'full')}
              disabled={remaining.full <= 0}
            >
              FULL ({remaining.full})
            </button>
            <button
              className={`btn-action sub`}
              onClick={() => handleTimeoutTap(side, 'short')}
              disabled={remaining.short <= 0}
            >
              SHORT ({remaining.short})
            </button>
          </div>
        )}
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
  };

  function renderPlayerSection(side) {
    const team = bs.teamInfo[side];
    const players = team.roster.inGame.filter((p) => p.playerID !== null);
    const isSelecting = pendingAction !== null && pendingAction.side === side;
    const subChoices = isSelecting && SUB_MENU_CHOICES[pendingAction.action];
    const isPlayerSelectable = isSelecting && !subChoices;

    return (
      <div className="game-section game-section-players">
        <div className="section-label">PLAYERS</div>
        {isSelecting && (
          <div className="selection-banner">
            <span className="selection-banner-text">
              SELECT: {pendingLabel(pendingAction)}
            </span>
            <button className="btn btn-small" onClick={() => setPendingAction(null)}>
              Cancel
            </button>
          </div>
        )}
        {subChoices ? (
          <div className="sub-menu-choices">
            {subChoices.map((choice) => (
              <button
                key={choice.action}
                className="btn btn-sub-choice"
                onClick={() => setPendingAction({ ...pendingAction, action: choice.action })}
              >
                {choice.label}
              </button>
            ))}
          </div>
        ) : (
        <div className="player-grid">
          {players.map((player) => {
            const actualIndex = team.roster.inGame.findIndex(
              (p) => p.playerID === player.playerID,
            );
            return (
              <div
                key={player.playerID}
                className={`player-card ${isPlayerSelectable ? 'selectable' : ''}`}
                onClick={isPlayerSelectable ? () => handlePlayerSelect(side, actualIndex) : undefined}
              >
                <span className="player-card-number">#{player.number || '?'}</span>
                <span className="player-card-name">{player.name}</span>
                <div className="player-card-stats">
                  <div className="stats-col">
                    <div className="stat-row"><span className="stat-label">PTS</span><span className="stat-value">{player.stats.offense.points}</span></div>
                    <div className="stat-row"><span className="stat-label">FG%</span><span className="stat-value">{player.stats.offense.shootingBreakdown.fieldGoals.totalPercentage}%</span></div>
                    <div className="stat-row"><span className="stat-label">REB</span><span className="stat-value">{player.stats.rebounds.total}</span></div>
                    <div className="stat-row"><span className="stat-label">AST</span><span className="stat-value">{player.stats.offense.assists}</span></div>
                  </div>
                  <div className="stats-divider" />
                  <div className="stats-col">
                    <div className="stat-row"><span className="stat-label">STL</span><span className="stat-value">{player.stats.defense.steals}</span></div>
                    <div className="stat-row"><span className="stat-label">BLK</span><span className="stat-value">{player.stats.defense.blocks}</span></div>
                    <div className="stat-row"><span className="stat-label">TO</span><span className="stat-value">{player.stats.general.turnovers}</span></div>
                    <div className="stat-row"><span className="stat-label">PF</span><span className="stat-value">{player.stats.general.fouls.personal.total}</span></div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
        )}
      </div>
    );
  }

  // --- Render team half ---
  const PARENT_ACTIONS = ['timeout'];

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

  const periodOver = timeLeft <= 0 && !isActive;

  // Scoreboard info: fouls, bonus, possession
  const QUARTER_KEYS_SB = { 1: 'first', 2: 'second', 3: 'third', 4: 'fourth' };
  const qKey = QUARTER_KEYS_SB[quarter] || 'fourth';
  const arrow = bs.gameInfo.state.possessionArrow;

  function getSideInfo(side) {
    const oppSide = side === 'home' ? 'away' : 'home';
    const oppFouls = bs.teamInfo[oppSide].stats.fouls.perQuarter[qKey]?.committed || 0;
    const oneAndOne = game.settings.fouls.bonus.oneAndOne;
    const dblBonus = game.settings.fouls.bonus.doubleBonus;
    const inBonus = oneAndOne != null && oppFouls >= oneAndOne;
    const inDoubleBonus = dblBonus != null && oppFouls >= dblBonus;
    const teamFouls = bs.teamInfo[side].stats.fouls.perQuarter[qKey]?.committed || 0;
    const timeouts = bs.teamInfo[side].stats.timeouts.remaining;
    return { teamFouls, inBonus, inDoubleBonus, timeouts };
  }

  const homeInfo = getSideInfo('home');
  const awayInfo = getSideInfo('away');

  return (
    <div className="screen game-screen">
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
          <span className={`scoreboard-time ${!isActive ? 'stopped' : ''}`}>
            {formatClock(timeLeft)}
          </span>
          {periodOver && quarter < 4 && (
            <button
              className="btn btn-small btn-next-quarter"
              onClick={() => dispatch({ type: 'ADVANCE_QUARTER' })}
            >
              Next: {formatQuarter(quarter + 1)}
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
      {!periodOver && (
        <div className={`game-status-banner ${isActive ? 'running' : 'stopped'}`}>
          {isActive ? 'CLOCK RUNNING' : 'CLOCK STOPPED'}
        </div>
      )}

      {/* Court area */}
      <div className="game-court">
        {renderHalf('home')}

        <div className="game-divider">
          <button className={`btn-divider indicator ${isAutoStopActive ? 'on' : 'off'}`}>
            <span>AUTO</span>
            <span>STOP</span>
          </button>

          <button
            className={`btn-clock ${isActive ? 'running' : 'stopped'} ${suggestStopClock && isActive ? 'suggest' : ''}`}
            onClick={() => { dispatch({ type: 'TOGGLE_CLOCK' }); setSuggestStopClock(false); }}
          >
            <span>{isActive ? 'STOP' : 'RUN'}</span>
            <span>CLOCK</span>
          </button>

          <button className="btn-divider" onClick={() => maybeAutoStop('Referee Timeout')}>
            <span>REF</span>
            <span>T.O.</span>
          </button>

          <button className="btn-divider" onClick={() => { dispatch({ type: 'JUMP_BALL' }); maybeAutoStop('Jump Ball'); }}>
            <span>JUMP</span>
            <span>BALL</span>
          </button>
        </div>

        {renderHalf('away')}
      </div>
    </div>
  );
}
