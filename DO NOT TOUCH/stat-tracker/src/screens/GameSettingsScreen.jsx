import { useState, useEffect } from 'react';
import { useGame, useGameDispatch } from '../context/GameContext';
import { fetchGameSettings } from '../data/api';

export default function GameSettingsScreen() {
  const game = useGame();
  const dispatch = useGameDispatch();
  const settings = game.settings;

  const [presets, setPresets] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    fetchGameSettings()
      .then((data) => {
        if (!cancelled) {
          setPresets(data);
          // Auto-select the first preset if no settings loaded yet
          if (!game.settings && data.length > 0) {
            dispatch({ type: 'SET_SETTINGS', settings: structuredClone(data[0]) });
          }
        }
      })
      .catch((err) => {
        if (!cancelled) setError(err.message);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => { cancelled = true; };
  }, []);

  function selectPreset(preset) {
    dispatch({ type: 'SET_SETTINGS', settings: structuredClone(preset) });
  }

  function updateSetting(path, value) {
    dispatch({ type: 'UPDATE_SETTING', path, value });
  }

  function toggleFormat(useQuarters) {
    updateSetting('periods.format.quarters', useQuarters);
    updateSetting('periods.format.halves', !useQuarters);
  }

  function toggleBonusReset(perPeriod) {
    updateSetting('fouls.bonus.perPeriod', perPeriod);
    updateSetting('fouls.bonus.perHalf', !perPeriod);
  }

  function toggleTimeoutAllocation(perGame) {
    updateSetting('timeouts.regulation.allocation.perGame', perGame);
    updateSetting('timeouts.regulation.allocation.perHalf', !perGame);
  }

  if (loading) {
    return (
      <div className="screen settings-screen">
        <div className="screen-header">
          <button className="btn btn-back" onClick={() => dispatch({ type: 'SET_STEP', step: 0 })}>
            Back
          </button>
          <h2>Game Settings</h2>
          <div className="header-spacer" />
        </div>
        <div className="loading-message">Loading presets...</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="screen settings-screen">
        <div className="screen-header">
          <button className="btn btn-back" onClick={() => dispatch({ type: 'SET_STEP', step: 0 })}>
            Back
          </button>
          <h2>Game Settings</h2>
          <div className="header-spacer" />
        </div>
        <div className="error-message">
          <p>{error}</p>
          <button className="btn btn-primary" onClick={() => window.location.reload()}>
            Retry
          </button>
        </div>
      </div>
    );
  }

  if (!settings) return null;

  return (
    <div className="screen settings-screen">
      <div className="screen-header">
        <button className="btn btn-back" onClick={() => dispatch({ type: 'SET_STEP', step: 0 })}>
          Back
        </button>
        <h2>Game Settings</h2>
        <div className="header-spacer" />
      </div>

      <div className="settings-content">
        {/* Preset Selector */}
        <div className="settings-presets">
          <label className="settings-label">Preset</label>
          <div className="preset-buttons">
            {presets.map((preset) => (
              <button
                key={preset.presetName}
                className={`btn btn-preset ${settings.presetName === preset.presetName ? 'active' : ''}`}
                onClick={() => selectPreset(preset)}
              >
                {preset.presetName}
              </button>
            ))}
            <button
              className={`btn btn-preset ${!presets.some(p => p.presetName === settings.presetName) ? 'active' : ''}`}
              onClick={() => updateSetting('presetName', 'Custom')}
            >
              Custom
            </button>
          </div>
        </div>

        <div className="settings-cards">
          {/* Periods */}
          <div className="settings-card">
            <h3 className="card-title">Periods</h3>
            <div className="card-body">
              <div className="setting-row">
                <label>Format</label>
                <div className="toggle-group">
                  <button
                    className={`btn btn-toggle ${settings.periods.format.quarters ? 'active' : ''}`}
                    onClick={() => toggleFormat(true)}
                  >
                    Quarters
                  </button>
                  <button
                    className={`btn btn-toggle ${settings.periods.format.halves ? 'active' : ''}`}
                    onClick={() => toggleFormat(false)}
                  >
                    Halves
                  </button>
                </div>
              </div>
              <div className="setting-row">
                <label>Minutes per {settings.periods.format.quarters ? 'Quarter' : 'Half'}</label>
                <input
                  type="number"
                  min="1"
                  max="30"
                  value={settings.periods.minutesPerPeriod}
                  onChange={(e) => updateSetting('periods.minutesPerPeriod', parseInt(e.target.value) || 1)}
                />
              </div>
              <div className="setting-row">
                <label>Minutes per Overtime</label>
                <input
                  type="number"
                  min="1"
                  max="15"
                  value={settings.periods.minutesPerOvertime}
                  onChange={(e) => updateSetting('periods.minutesPerOvertime', parseInt(e.target.value) || 1)}
                />
              </div>
              <h4 className="subsection-title">Shot Clock</h4>
              <div className="setting-row">
                <label>Enabled</label>
                <div className="toggle-group">
                  <button
                    className={`btn btn-toggle ${settings.shotClock.active ? 'active' : ''}`}
                    onClick={() => {
                      updateSetting('shotClock.active', !settings.shotClock.active);
                      if (!settings.shotClock.active && !settings.shotClock.duration) {
                        updateSetting('shotClock.duration', 24);
                      }
                    }}
                  >
                    {settings.shotClock.active ? 'On' : 'Off'}
                  </button>
                </div>
              </div>
              {settings.shotClock.active && (
                <div className="setting-row">
                  <label>Duration (seconds)</label>
                  <input
                    type="number"
                    min="10"
                    max="60"
                    value={settings.shotClock.duration || 24}
                    onChange={(e) => updateSetting('shotClock.duration', parseInt(e.target.value) || 24)}
                  />
                </div>
              )}
              <h4 className="subsection-title">Breaks</h4>
              {settings.periods.format.quarters && (
                <div className="setting-row">
                  <label>Between Quarters (min)</label>
                  <input
                    type="number"
                    min="0"
                    max="10"
                    value={settings.breaks.betweenQuarters}
                    onChange={(e) => updateSetting('breaks.betweenQuarters', parseInt(e.target.value) || 0)}
                  />
                </div>
              )}
              <div className="setting-row">
                <label>Halftime (min)</label>
                <input
                  type="number"
                  min="0"
                  max="20"
                  value={settings.breaks.halftime}
                  onChange={(e) => updateSetting('breaks.halftime', parseInt(e.target.value) || 0)}
                />
              </div>
              <div className="setting-row">
                <label>Before Overtime (min)</label>
                <input
                  type="number"
                  min="0"
                  max="10"
                  value={settings.breaks.beforeOvertime}
                  onChange={(e) => updateSetting('breaks.beforeOvertime', parseInt(e.target.value) || 0)}
                />
              </div>
            </div>
          </div>

          {/* Stoppages */}
          <div className="settings-card">
            <h3 className="card-title">Stoppages</h3>
            <div className="card-body">
              <p className="setting-hint">
                Controls when the game clock auto-stops on dead balls. Each period can activate stoppages in the last X minutes.
              </p>
              {(() => {
                const mode = settings.periods.format.quarters ? 'perQuarter' : 'perHalf';
                const periods = settings.periods.format.quarters
                  ? [
                      { key: '1stQuarter', label: '1st Quarter' },
                      { key: '2ndQuarter', label: '2nd Quarter' },
                      { key: '3rdQuarter', label: '3rd Quarter' },
                      { key: '4thQuarter', label: '4th Quarter' },
                      { key: 'overtime', label: 'Overtime' },
                    ]
                  : [
                      { key: '1stHalf', label: '1st Half' },
                      { key: '2ndHalf', label: '2nd Half' },
                      { key: 'overtime', label: 'Overtime' },
                    ];
                const allOn = periods.every(({ key }) => {
                  const val = settings.stoppages.during[mode][key];
                  return val && val.enabled;
                });
                return (
                  <>
                    <div className="setting-row">
                      <label>Full Game</label>
                      <div className="toggle-group">
                        <button
                          className={`btn btn-toggle ${allOn ? 'active' : ''}`}
                          onClick={() => {
                            periods.forEach(({ key }) => {
                              if (allOn) {
                                updateSetting(`stoppages.during.${mode}.${key}`, false);
                              } else {
                                const mins = key === 'overtime'
                                  ? settings.periods.minutesPerOvertime
                                  : settings.periods.minutesPerPeriod;
                                updateSetting(`stoppages.during.${mode}.${key}`, { enabled: true, from: mins });
                              }
                            });
                          }}
                        >
                          {allOn ? 'On' : 'Off'}
                        </button>
                      </div>
                    </div>
                    {periods.map(({ key, label }) => {
                      const val = settings.stoppages.during[mode][key];
                      const isOn = val && val.enabled;
                      return (
                        <div key={key}>
                          <div className="setting-row">
                            <label>{label}</label>
                            <div className="toggle-group">
                              <button
                                className={`btn btn-toggle ${isOn ? 'active' : ''}`}
                                onClick={() => {
                                  if (isOn) {
                                    updateSetting(`stoppages.during.${mode}.${key}`, false);
                                  } else {
                                    updateSetting(`stoppages.during.${mode}.${key}`, { enabled: true, from: 3 });
                                  }
                                }}
                              >
                                {isOn ? 'On' : 'Off'}
                              </button>
                            </div>
                          </div>
                          {isOn && (
                            <div className="setting-row">
                              <label>Last (min)</label>
                              <input
                                type="number"
                                min="1"
                                max={key === 'overtime' ? settings.periods.minutesPerOvertime : settings.periods.minutesPerPeriod}
                                value={val.from}
                                onChange={(e) => updateSetting(`stoppages.during.${mode}.${key}`, { enabled: true, from: parseInt(e.target.value) || 1 })}
                              />
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </>
                );
              })()}
            </div>
          </div>

          {/* Actions */}
          <div className="settings-card">
            <h3 className="card-title">Actions</h3>
            <div className="card-body">
              <p className="setting-hint">
                "On" actions always stop the clock. "Off" actions only stop the clock when the period's stoppages are active.
              </p>
              {settings.stoppages.for.map((entry, i) => (
                <div className="setting-row" key={entry.action}>
                  <label>{entry.action}</label>
                  <div className="toggle-group">
                    <button
                      className={`btn btn-toggle ${entry.always ? 'active' : ''}`}
                      onClick={() => updateSetting(`stoppages.for.${i}.always`, !entry.always)}
                    >
                      {entry.always ? 'On' : 'Off'}
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Tip-Off & Fouls */}
          <div className="settings-card">
            <h3 className="card-title">Tip-Off</h3>
            <div className="card-body">
              <div className="setting-row">
                <label>Possession Rule</label>
                <div className="toggle-group">
                  <button
                    className={`btn btn-toggle ${settings.tipOff.possessionRule === 'tipWinner' ? 'active' : ''}`}
                    onClick={() => updateSetting('tipOff.possessionRule', 'tipWinner')}
                  >
                    Tip Winner
                  </button>
                  <button
                    className={`btn btn-toggle ${settings.tipOff.possessionRule === 'manual' ? 'active' : ''}`}
                    onClick={() => updateSetting('tipOff.possessionRule', 'manual')}
                  >
                    Manual
                  </button>
                </div>
              </div>
              <p className="setting-hint">
                {settings.tipOff.possessionRule === 'tipWinner'
                  ? 'Tip-off loser gets the possession on the next Jump Ball or in the next period.'
                  : 'You will choose what team got possession first on the tip-off, the other team will be getting possession of the ball on the next Jump Ball or in the next period.'}
              </p>
              <h4 className="subsection-title">Jump Ball</h4>
              <div className="setting-row">
                <label>Rule</label>
                <div className="toggle-group">
                  <button
                    className={`btn btn-toggle ${settings.tipOff.jumpBallRule === 'switchPossession' ? 'active' : ''}`}
                    onClick={() => updateSetting('tipOff.jumpBallRule', 'switchPossession')}
                  >
                    Switch Possession
                  </button>
                  <button
                    className={`btn btn-toggle ${settings.tipOff.jumpBallRule === 'tipOff' ? 'active' : ''}`}
                    onClick={() => updateSetting('tipOff.jumpBallRule', 'tipOff')}
                  >
                    Tip-Off
                  </button>
                </div>
              </div>
              <h4 className="subsection-title">Fouls</h4>
              <div className="setting-row">
                <label>Foul-Out Limit</label>
                <input
                  type="number"
                  min="3"
                  max="10"
                  value={settings.fouls.foulOutLimit}
                  onChange={(e) => updateSetting('fouls.foulOutLimit', parseInt(e.target.value) || 5)}
                />
              </div>
              <div className="setting-row">
                <label>Bonus Reset</label>
                <div className="toggle-group">
                  <button
                    className={`btn btn-toggle ${settings.fouls.bonus.perPeriod ? 'active' : ''}`}
                    onClick={() => toggleBonusReset(true)}
                  >
                    Per Period
                  </button>
                  <button
                    className={`btn btn-toggle ${settings.fouls.bonus.perHalf ? 'active' : ''}`}
                    onClick={() => toggleBonusReset(false)}
                  >
                    Per Half
                  </button>
                </div>
              </div>
              <div className="setting-row">
                <label>1-and-1</label>
                <div className="toggle-group">
                  <button
                    className={`btn btn-toggle ${settings.fouls.bonus.oneAndOne != null ? 'active' : ''}`}
                    onClick={() => {
                      if (settings.fouls.bonus.oneAndOne == null) {
                        updateSetting('fouls.bonus.oneAndOne', 7);
                      } else {
                        updateSetting('fouls.bonus.oneAndOne', null);
                      }
                    }}
                  >
                    {settings.fouls.bonus.oneAndOne != null ? 'On' : 'Off'}
                  </button>
                </div>
              </div>
              {settings.fouls.bonus.oneAndOne != null && (
                <div className="setting-row">
                  <label>1-and-1 Threshold</label>
                  <input
                    type="number"
                    min="1"
                    max="20"
                    value={settings.fouls.bonus.oneAndOne}
                    onChange={(e) => updateSetting('fouls.bonus.oneAndOne', parseInt(e.target.value) || 1)}
                  />
                </div>
              )}
              <div className="setting-row">
                <label>Double Bonus Threshold</label>
                <input
                  type="number"
                  min="0"
                  max="20"
                  value={settings.fouls.bonus.doubleBonus ?? ''}
                  placeholder="Off"
                  onChange={(e) => {
                    const val = e.target.value === '' ? null : parseInt(e.target.value);
                    updateSetting('fouls.bonus.doubleBonus', val);
                  }}
                />
              </div>
              <div className="setting-row">
                <label>Tech Ejection Limit</label>
                <input
                  type="number"
                  min="1"
                  max="5"
                  value={settings.fouls.technicalEjectionLimit}
                  onChange={(e) => updateSetting('fouls.technicalEjectionLimit', parseInt(e.target.value) || 2)}
                />
              </div>
            </div>
          </div>

          {/* Timeouts */}
          <div className="settings-card">
            <h3 className="card-title">Timeouts</h3>
            <div className="card-body">
              <div className="setting-row">
                <label>Allocation</label>
                <div className="toggle-group">
                  <button
                    className={`btn btn-toggle ${settings.timeouts.regulation.allocation.perGame ? 'active' : ''}`}
                    onClick={() => toggleTimeoutAllocation(true)}
                  >
                    Per Game
                  </button>
                  <button
                    className={`btn btn-toggle ${settings.timeouts.regulation.allocation.perHalf ? 'active' : ''}`}
                    onClick={() => toggleTimeoutAllocation(false)}
                  >
                    Per Half
                  </button>
                </div>
              </div>
              <div className="setting-row">
                <label>Full Timeouts</label>
                <input
                  type="number"
                  min="0"
                  max="10"
                  value={settings.timeouts.regulation.full}
                  onChange={(e) => updateSetting('timeouts.regulation.full', parseInt(e.target.value) || 0)}
                />
              </div>
              <div className="setting-row">
                <label>Short Timeouts</label>
                <input
                  type="number"
                  min="0"
                  max="10"
                  value={settings.timeouts.regulation.short}
                  onChange={(e) => updateSetting('timeouts.regulation.short', parseInt(e.target.value) || 0)}
                />
              </div>
              <div className="setting-row">
                <label>Full Duration (sec)</label>
                <input
                  type="number"
                  min="10"
                  max="120"
                  value={settings.timeouts.duration.full}
                  onChange={(e) => updateSetting('timeouts.duration.full', parseInt(e.target.value) || 60)}
                />
              </div>
              <div className="setting-row">
                <label>Short Duration (sec)</label>
                <input
                  type="number"
                  min="10"
                  max="60"
                  value={settings.timeouts.duration.short}
                  onChange={(e) => updateSetting('timeouts.duration.short', parseInt(e.target.value) || 30)}
                />
              </div>
              <h4 className="subsection-title">Overtime</h4>
              <div className="setting-row">
                <label>OT Full Timeouts</label>
                <input
                  type="number"
                  min="0"
                  max="5"
                  value={settings.timeouts.overtime.full}
                  onChange={(e) => updateSetting('timeouts.overtime.full', parseInt(e.target.value) || 0)}
                />
              </div>
              <div className="setting-row">
                <label>OT Short Timeouts</label>
                <input
                  type="number"
                  min="0"
                  max="5"
                  value={settings.timeouts.overtime.short}
                  onChange={(e) => updateSetting('timeouts.overtime.short', parseInt(e.target.value) || 0)}
                />
              </div>
              <h4 className="subsection-title">Rollover</h4>
              <div className="setting-row">
                <label>Regulation to OT</label>
                <div className="toggle-group">
                  <button
                    className={`btn btn-toggle ${settings.timeouts.rollover.regulationtoOT ? 'active' : ''}`}
                    onClick={() => updateSetting('timeouts.rollover.regulationtoOT', !settings.timeouts.rollover.regulationtoOT)}
                  >
                    {settings.timeouts.rollover.regulationtoOT ? 'On' : 'Off'}
                  </button>
                </div>
              </div>
              <div className="setting-row">
                <label>OT to OT</label>
                <div className="toggle-group">
                  <button
                    className={`btn btn-toggle ${settings.timeouts.rollover.OTtoOT ? 'active' : ''}`}
                    onClick={() => updateSetting('timeouts.rollover.OTtoOT', !settings.timeouts.rollover.OTtoOT)}
                  >
                    {settings.timeouts.rollover.OTtoOT ? 'On' : 'Off'}
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="screen-footer">
        <button
          className="btn btn-primary btn-large"
          onClick={() => dispatch({ type: 'SET_STEP', step: 2 })}
        >
          Next: Pick Teams
        </button>
      </div>
    </div>
  );
}
