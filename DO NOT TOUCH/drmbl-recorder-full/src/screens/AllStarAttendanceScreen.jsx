import { useState, useEffect } from 'react';
import { useGame, useGameDispatch } from '../context/GameContext';
import { fetchGameSettings } from '../data/api';
import { useTranslation } from '../i18n/useTranslation';

// All-Star squad assignment — a modified AttendanceScreen where BOTH sides
// show the same shared player pool. Claiming a player on one side (check-in)
// removes them from the other side's list; unclaiming returns them to both.
// Jersey numbers and captains are optional here (exhibition); starters are
// still required because they drive on-court/minutes tracking.
export default function AllStarAttendanceScreen() {
  const game = useGame();
  const dispatch = useGameDispatch();
  const { t } = useTranslation();
  const [addingTo, setAddingTo] = useState(null); // 'home' | 'away' | null
  const [newRows, setNewRows] = useState([]); // array of { name, number }

  // Settings are normally loaded on the (skipped) settings screen — auto-load
  // the default preset here so Next → Tip-Off can INIT_BOX_SCORE safely.
  useEffect(() => {
    if (game.settings) return;
    let cancelled = false;
    fetchGameSettings()
      .then((presets) => {
        if (cancelled || !presets || presets.length === 0) return;
        const preferred =
          presets.find((p) => /all.?star/i.test(p.presetName || '')) || presets[0];
        dispatch({ type: 'SET_SETTINGS', settings: structuredClone(preferred) });
      })
      .catch(() => { /* operator can still load settings via Back */ });
    return () => { cancelled = true; };
  }, [game.settings, dispatch]);

  function openAddForm(side) {
    setAddingTo(side);
    setNewRows([{ name: '', number: '' }]);
  }

  function closeAddForm() {
    setAddingTo(null);
    setNewRows([]);
  }

  function addRow() {
    setNewRows((prev) => [...prev, { name: '', number: '' }]);
  }

  function removeRow(index) {
    setNewRows((prev) => prev.filter((_, i) => i !== index));
  }

  function updateRow(index, field, value) {
    setNewRows((prev) => prev.map((r, i) => (i === index ? { ...r, [field]: value } : r)));
  }

  // On-the-fly add: local only — never POST /api/admin, so hand-entered
  // players don't get written into any real team's Cosmos roster. Added to
  // BOTH side rosters (shared pool semantics), then claimed on the side used.
  function handleSaveAll(side) {
    const toAdd = newRows
      .map((r) => ({ name: r.name.trim(), number: r.number }))
      .filter((r) => r.name.length > 0);
    if (toAdd.length === 0) return;

    const attendance = side === 'home' ? game.homeAttendance : game.awayAttendance;
    const before = [...attendance];
    const newIDs = [];

    for (let i = 0; i < toAdd.length; i++) {
      const { name, number } = toAdd[i];
      const playerID = `AllStar.Add.${Date.now()}.${i}.${Math.floor(Math.random() * 1e6)}`;
      newIDs.push(playerID);
      dispatch({ type: 'APPEND_TO_ROSTER', side: 'home', playerID, name });
      dispatch({ type: 'APPEND_TO_ROSTER', side: 'away', playerID, name });
      dispatch({ type: 'TOGGLE_ATTENDANCE', side, playerID });
      if (number !== '' && !isNaN(parseInt(number))) {
        dispatch({ type: 'SET_NUMBER_OVERRIDE', side, playerID, number: String(parseInt(number)) });
      }
    }

    // Mirror togglePlayer's auto-starter rule for the whole batch at once
    // (per-player calls would each read the same stale attendance snapshot).
    const finalPresent = [...before, ...newIDs];
    if (finalPresent.length <= 5) {
      dispatch({ type: 'SET_STARTERS', side, playerIDs: finalPresent });
    } else if (before.length <= 5) {
      dispatch({ type: 'SET_STARTERS', side, playerIDs: [] });
    }
    closeAddForm();
  }

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

  const homeStartersNeeded = Math.min(5, homePresent);
  const awayStartersNeeded = Math.min(5, awayPresent);

  const canProceed =
    !!game.settings &&
    homePresent >= 5 && awayPresent >= 5 &&
    game.homeStarters.size === homeStartersNeeded &&
    game.awayStarters.size === awayStartersNeeded;

  function togglePlayer(side, playerID) {
    const attendance = side === 'home' ? game.homeAttendance : game.awayAttendance;
    const captain = side === 'home' ? game.homeCaptain : game.awayCaptain;
    const isClaimed = attendance.has(playerID);

    if (isClaimed) {
      if (captain === playerID) {
        dispatch({ type: 'CLEAR_CAPTAIN', side });
      }
      dispatch({ type: 'TOGGLE_ATTENDANCE', side, playerID });
      const remaining = [...attendance].filter((id) => id !== playerID);
      if (remaining.length <= 5) {
        dispatch({ type: 'SET_STARTERS', side, playerIDs: remaining });
      } else {
        const starters = side === 'home' ? game.homeStarters : game.awayStarters;
        if (starters.has(playerID)) {
          dispatch({ type: 'TOGGLE_STARTER', side, playerID });
        }
      }
    } else {
      dispatch({ type: 'TOGGLE_ATTENDANCE', side, playerID });
      const newCount = attendance.size + 1;
      if (newCount <= 5) {
        dispatch({ type: 'SET_STARTERS', side, playerIDs: [...attendance, playerID] });
      } else if (newCount === 6) {
        dispatch({ type: 'SET_STARTERS', side, playerIDs: [] });
      }
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

  function renderSquad(side) {
    const team = side === 'home' ? game.homeTeam : game.awayTeam;
    const otherAttendance = side === 'home' ? game.awayAttendance : game.homeAttendance;
    const attendance = side === 'home' ? game.homeAttendance : game.awayAttendance;
    const captain = side === 'home' ? game.homeCaptain : game.awayCaptain;
    const starters = side === 'home' ? game.homeStarters : game.awayStarters;

    if (!team || !team.roster) return null;

    // Shared-pool rule: hide anyone already claimed by the other squad.
    const visible = team.roster.filter((p) => !otherAttendance.has(p.playerID));

    return (
      <div className="attendance-half allstar-half">
        <div className="attendance-team-header">
          <h3>{team.name}</h3>
          <div className="attendance-actions">
            <button className="btn btn-small" onClick={() => clearAll(side)}>
              {t('attendance', 'clearAll')}
            </button>
            <button className="btn btn-small" onClick={() => addingTo === side ? addRow() : openAddForm(side)}>
              + Add
            </button>
            <span className="attendance-count">{attendance.size}</span>
          </div>
        </div>
        {addingTo === side && (
          <div className="add-player-form">
            <div className="add-player-rows">
              {newRows.map((row, idx) => (
                <div key={idx} className="add-player-row">
                  <input
                    type="text"
                    className="add-player-input"
                    placeholder={`Player ${idx + 1} name`}
                    value={row.name}
                    onChange={(e) => updateRow(idx, 'name', e.target.value)}
                    autoFocus={idx === newRows.length - 1}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') addRow();
                      if (e.key === 'Escape') closeAddForm();
                    }}
                  />
                  <input
                    type="number"
                    className="add-player-number"
                    placeholder="#"
                    min="0"
                    max="99"
                    value={row.number}
                    onChange={(e) => updateRow(idx, 'number', e.target.value)}
                  />
                  <button
                    className="btn btn-small btn-remove"
                    onClick={() => removeRow(idx)}
                    title="Remove this row"
                  >
                    ✕
                  </button>
                </div>
              ))}
            </div>
            <div className="add-player-actions">
              <button
                className="btn btn-small btn-primary"
                disabled={newRows.every((r) => !r.name.trim())}
                onClick={() => handleSaveAll(side)}
              >
                {`Add ${newRows.filter((r) => r.name.trim()).length} Player${newRows.filter((r) => r.name.trim()).length === 1 ? '' : 's'}`}
              </button>
              <button className="btn btn-small" onClick={closeAddForm}>
                Cancel
              </button>
            </div>
          </div>
        )}
        <div className="player-list">
          {visible.map((player) => {
            const claimed = attendance.has(player.playerID);
            const isCaptain = captain === player.playerID;
            const canSetCaptain = claimed && (captain === null || isCaptain);
            const isStarter = starters.has(player.playerID);
            const canSetStarter = claimed && attendance.size > 5 && (starters.size < 5 || isStarter);
            return (
              <div key={player.playerID} className={`attendance-row ${claimed ? 'checked' : ''}`}>
                <button
                  tabIndex={-1}
                  className={`btn btn-player ${claimed ? 'checked' : ''}`}
                  onClick={() => togglePlayer(side, player.playerID)}
                >
                  <span className="player-check">{claimed ? '✓' : ''}</span>
                  <span className="player-name">{player.name}</span>
                  {player.honor === 'HM' && <span className="allstar-hm-badge">HM</span>}
                  {player.teamName && <span className="allstar-origin">{player.teamName}</span>}
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
                  disabled={!claimed}
                  value={getNumber(side, player.playerID)}
                  onChange={(e) => setNumber(side, player.playerID, e.target.value)}
                  onClick={(e) => e.stopPropagation()}
                />
              </div>
            );
          })}
        </div>
      </div>
    );
  }

  function getFooterHint() {
    if (!game.settings) {
      return t('allstar', 'loadingSettings');
    }
    if (homePresent < 5 || awayPresent < 5) {
      return t('allstar', 'needPlayers');
    }
    if (game.homeStarters.size < homeStartersNeeded || game.awayStarters.size < awayStartersNeeded) {
      return t('attendance', 'needStarters', {
        homeCount: game.homeStarters.size,
        awayCount: game.awayStarters.size,
      });
    }
    return null;
  }

  const footerHint = getFooterHint();

  return (
    <div className="screen attendance-screen allstar-screen">
      <div className="screen-header">
        <button className="btn btn-back" onClick={() => dispatch({ type: 'SET_STEP', step: 4 })}>
          {t('common', 'back')}
        </button>
        <h2>{'⭐'} {t('allstar', 'screenTitle')}</h2>
        <div className="header-spacer" />
      </div>

      <p className="allstar-hint">{t('allstar', 'hint')}</p>

      <div className="attendance-content">
        {renderSquad('home')}
        <div className="attendance-divider" />
        {renderSquad('away')}
      </div>

      <div className="screen-footer">
        <button
          className="btn btn-primary btn-large"
          disabled={!canProceed}
          onClick={() => {
            dispatch({ type: 'INIT_BOX_SCORE' });
            dispatch({ type: 'SET_STEP', step: 6 });
          }}
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
