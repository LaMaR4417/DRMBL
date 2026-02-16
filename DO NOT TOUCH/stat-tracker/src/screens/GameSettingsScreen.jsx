import { useGame, useGameDispatch } from '../context/GameContext';
import { ALL_PRESETS } from '../data/gameSettings';

export default function GameSettingsScreen() {
  const game = useGame();
  const dispatch = useGameDispatch();
  const settings = game.settings;

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
            {ALL_PRESETS.map((preset) => (
              <button
                key={preset.presetName}
                className={`btn btn-preset ${settings.presetName === preset.presetName ? 'active' : ''}`}
                onClick={() => selectPreset(preset)}
              >
                {preset.presetName}
              </button>
            ))}
            <button
              className={`btn btn-preset ${!ALL_PRESETS.some(p => p.presetName === settings.presetName) ? 'active' : ''}`}
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
            </div>
          </div>

          {/* Breaks */}
          <div className="settings-card">
            <h3 className="card-title">Breaks</h3>
            <div className="card-body">
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

          {/* Shot Clock */}
          <div className="settings-card">
            <h3 className="card-title">Shot Clock</h3>
            <div className="card-body">
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
            </div>
          </div>

          {/* Fouls */}
          <div className="settings-card">
            <h3 className="card-title">Fouls</h3>
            <div className="card-body">
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
                <label>1-and-1 Threshold</label>
                <input
                  type="number"
                  min="0"
                  max="20"
                  value={settings.fouls.bonus.oneAndOne ?? ''}
                  placeholder="Off"
                  onChange={(e) => {
                    const val = e.target.value === '' ? null : parseInt(e.target.value);
                    updateSetting('fouls.bonus.oneAndOne', val);
                  }}
                />
              </div>
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
