import { useGame, useGameDispatch } from '../context/GameContext';
import { useTranslation } from '../i18n/useTranslation';

export default function AttendanceScreen() {
  const game = useGame();
  const dispatch = useGameDispatch();
  const { t } = useTranslation();

  const homePresent = game.homeAttendance.size;
  const awayPresent = game.awayAttendance.size;

  function getNumber(side, playerID) {
    const overrides = side === 'home' ? game.homeNumberOverrides : game.awayNumberOverrides;
    return overrides[playerID] ?? '';
  }

  function setNumber(side, playerID, value) {
    if (value === '') {
      dispatch({ type: 'CLEAR_NUMBER_OVERRIDE', side, playerID });
    } else {
      dispatch({ type: 'SET_NUMBER_OVERRIDE', side, playerID, number: value });
    }
  }

  function allNumbersAssigned(side) {
    const team = side === 'home' ? game.homeTeam : game.awayTeam;
    const attendance = side === 'home' ? game.homeAttendance : game.awayAttendance;
    if (!team || !team.roster) return false;
    return team.roster
      .filter((p) => attendance.has(p.playerID))
      .every((p) => getNumber(side, p.playerID) !== '');
  }

  const homeStarters = game.homeStarters;
  const awayStarters = game.awayStarters;

  const homeStartersNeeded = Math.min(5, homePresent);
  const awayStartersNeeded = Math.min(5, awayPresent);

  const canProceed =
    homePresent >= 1 && awayPresent >= 1 &&
    allNumbersAssigned('home') && allNumbersAssigned('away') &&
    game.homeCaptain !== null && game.awayCaptain !== null &&
    homeStarters.size === homeStartersNeeded && awayStarters.size === awayStartersNeeded;

  function togglePlayer(side, playerID) {
    const attendance = side === 'home' ? game.homeAttendance : game.awayAttendance;
    const captain = side === 'home' ? game.homeCaptain : game.awayCaptain;
    const isCheckedIn = attendance.has(playerID);

    if (isCheckedIn) {
      // Unchecking: clear captain if needed
      if (captain === playerID) {
        dispatch({ type: 'CLEAR_CAPTAIN', side });
      }
      dispatch({ type: 'TOGGLE_ATTENDANCE', side, playerID });
      const remaining = [...attendance].filter((id) => id !== playerID);
      if (remaining.length <= 5) {
        // 5 or fewer remain: auto-select all as starters
        dispatch({ type: 'SET_STARTERS', side, playerIDs: remaining });
      } else {
        // More than 5 remain: just remove this player from starters if they were one
        const starters = side === 'home' ? game.homeStarters : game.awayStarters;
        if (starters.has(playerID)) {
          dispatch({ type: 'TOGGLE_STARTER', side, playerID });
        }
      }
    } else {
      // Checking in
      dispatch({ type: 'TOGGLE_ATTENDANCE', side, playerID });
      const newCount = attendance.size + 1;
      if (newCount <= 5) {
        // 5 or fewer: auto-select all as starters
        dispatch({ type: 'SET_STARTERS', side, playerIDs: [...attendance, playerID] });
      } else if (newCount === 6) {
        // 6th player added: clear auto-selected starters
        dispatch({ type: 'SET_STARTERS', side, playerIDs: [] });
      }
    }
  }

  function selectAll(side) {
    const team = side === 'home' ? game.homeTeam : game.awayTeam;
    dispatch({ type: 'SELECT_ALL_ATTENDANCE', side });
    if (team && team.roster && team.roster.length <= 5) {
      dispatch({ type: 'SET_STARTERS', side, playerIDs: team.roster.map((p) => p.playerID) });
    } else {
      dispatch({ type: 'SET_STARTERS', side, playerIDs: [] });
    }
  }

  function clearAll(side) {
    dispatch({ type: 'CLEAR_CAPTAIN', side });
    dispatch({ type: 'SET_STARTERS', side, playerIDs: [] });
    dispatch({ type: 'CLEAR_ATTENDANCE', side });
  }

  function toggleCaptain(side, playerID) {
    const current = side === 'home' ? game.homeCaptain : game.awayCaptain;
    if (current === playerID) {
      dispatch({ type: 'CLEAR_CAPTAIN', side });
    } else {
      dispatch({ type: 'SET_CAPTAIN', side, playerID });
    }
  }

  function toggleStarter(side, playerID) {
    dispatch({ type: 'TOGGLE_STARTER', side, playerID });
  }

  function renderTeamRoster(side) {
    const team = side === 'home' ? game.homeTeam : game.awayTeam;
    const attendance = side === 'home' ? game.homeAttendance : game.awayAttendance;
    const captain = side === 'home' ? game.homeCaptain : game.awayCaptain;
    const starters = side === 'home' ? game.homeStarters : game.awayStarters;

    if (!team) return null;

    if (!team.roster) {
      return (
        <div className="attendance-half">
          <div className="attendance-team-header">
            <h3>{team.name}</h3>
          </div>
          <div className="loading-message">{t('attendance', 'loadingRoster')}</div>
        </div>
      );
    }

    return (
      <div className="attendance-half">
        <div className="attendance-team-header">
          <h3>{team.name}</h3>
          <div className="attendance-actions">
            <button className="btn btn-small" onClick={() => selectAll(side)}>
              {t('attendance', 'selectAll')}
            </button>
            <button className="btn btn-small" onClick={() => clearAll(side)}>
              {t('attendance', 'clearAll')}
            </button>
            <span className="attendance-count">{attendance.size}/{team.roster.length}</span>
          </div>
        </div>
        <div className="player-list">
          {team.roster.map((player) => {
            const present = attendance.has(player.playerID);
            const isCaptain = captain === player.playerID;
            const canSetCaptain = present && (captain === null || isCaptain);
            const isStarter = starters.has(player.playerID);
            const canSetStarter = present && attendance.size > 5 && (starters.size < 5 || isStarter);
            return (
              <div key={player.playerID} className={`attendance-row ${present ? 'checked' : ''}`}>
                <button
                  tabIndex={-1}
                  className={`btn btn-player ${present ? 'checked' : ''}`}
                  onClick={() => togglePlayer(side, player.playerID)}
                >
                  <span className="player-check">{present ? '\u2713' : ''}</span>
                  <span className="player-name">{player.name}</span>
                </button>
                <button
                  tabIndex={-1}
                  className={`btn btn-captain ${isCaptain ? 'active' : ''}`}
                  disabled={!canSetCaptain}
                  onClick={() => toggleCaptain(side, player.playerID)}
                >
                  {t('attendance', 'captain')}
                </button>
                <button
                  tabIndex={-1}
                  className={`btn btn-starter ${isStarter ? 'active' : ''}`}
                  disabled={!canSetStarter}
                  onClick={() => toggleStarter(side, player.playerID)}
                >
                  {t('attendance', 'starter')}
                </button>
                <input
                  className="number-input"
                  type="number"
                  min="0"
                  max="99"
                  placeholder="#"
                  disabled={!present}
                  value={getNumber(side, player.playerID)}
                  onChange={(e) => setNumber(side, player.playerID, e.target.value)}
                  onClick={(e) => e.stopPropagation()}
                />
              </div>
            );
          })}
        </div>
        {attendance.size > 12 && (
          <p className="attendance-warning">{t('attendance', 'maxPlayers', { count: attendance.size })}</p>
        )}
      </div>
    );
  }

  function getFooterHint() {
    if (homePresent < 1 || awayPresent < 1) {
      return t('attendance', 'needPlayers');
    }
    if (!allNumbersAssigned('home') || !allNumbersAssigned('away')) {
      return t('attendance', 'needNumbers');
    }
    if (game.homeCaptain === null || game.awayCaptain === null) {
      return t('attendance', 'needCaptain');
    }
    if (homeStarters.size < homeStartersNeeded || awayStarters.size < awayStartersNeeded) {
      return t('attendance', 'needStarters', { homeCount: homeStarters.size, awayCount: awayStarters.size });
    }
    return null;
  }

  const footerHint = getFooterHint();

  return (
    <div className="screen attendance-screen">
      <div className="screen-header">
        <button className="btn btn-back" onClick={() => dispatch({ type: 'SET_STEP', step: 2 })}>
          {t('common', 'back')}
        </button>
        <h2>{t('attendance', 'screenTitle')}</h2>
        <div className="header-spacer" />
      </div>

      <div className="attendance-content">
        {renderTeamRoster('home')}
        <div className="attendance-divider" />
        {renderTeamRoster('away')}
      </div>

      <div className="screen-footer">
        <button
          className="btn btn-primary btn-large"
          disabled={!canProceed}
          onClick={() => dispatch({ type: 'SET_STEP', step: 6 })}
        >
          {t('attendance', 'nextTipOff')}
        </button>
        {!canProceed && footerHint && (
          <p className="footer-hint">{footerHint}</p>
        )}
      </div>
    </div>
  );
}
