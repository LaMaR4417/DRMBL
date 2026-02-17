import { useState, useEffect } from 'react';
import { useGame, useGameDispatch } from '../context/GameContext';
import { fetchGameSettings } from '../data/api';
import { useTranslation } from '../i18n/useTranslation';

export default function GameSettingsScreen() {
  const game = useGame();
  const dispatch = useGameDispatch();
  const { t } = useTranslation();
  const settings = game.settings;

  const [presets, setPresets] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [customName, setCustomName] = useState('');
  const [saving, setSaving] = useState(false);

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

  const isCustom = !presets.some(p => p.presetName === settings?.presetName);

  async function handleSave() {
    if (!customName.trim() || saving) return;
    setSaving(true);
    try {
      const payload = structuredClone(settings);
      payload.presetName = customName.trim();
      const res = await fetch('/api/game-settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      if (!res.ok) throw new Error('Failed to save');
      // Update local state: add to presets list and select it
      setPresets((prev) => {
        const filtered = prev.filter(p => p.presetName !== payload.presetName);
        return [...filtered, payload];
      });
      dispatch({ type: 'SET_SETTINGS', settings: payload });
      setCustomName('');
    } catch (err) {
      setError(t('settings', 'failedSavePreset') + ' ' + err.message);
    } finally {
      setSaving(false);
    }
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
            {t('common', 'back')}
          </button>
          <h2>{t('settings', 'screenTitle')}</h2>
          <div className="header-spacer" />
        </div>
        <div className="loading-message">{t('settings', 'loadingPresets')}</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="screen settings-screen">
        <div className="screen-header">
          <button className="btn btn-back" onClick={() => dispatch({ type: 'SET_STEP', step: 0 })}>
            {t('common', 'back')}
          </button>
          <h2>{t('settings', 'screenTitle')}</h2>
          <div className="header-spacer" />
        </div>
        <div className="error-message">
          <p>{error}</p>
          <button className="btn btn-primary" onClick={() => window.location.reload()}>
            {t('common', 'retry')}
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
          {t('common', 'back')}
        </button>
        <h2>{t('settings', 'screenTitle')}</h2>
        <div className="header-spacer" />
      </div>

      <div className="settings-content">
        {/* Preset Selector */}
        <div className="settings-presets">
          <label className="settings-label">{t('settings', 'preset')}</label>
          <div className="preset-row">
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
                className={`btn btn-preset ${isCustom ? 'active' : ''}`}
                onClick={() => updateSetting('presetName', 'Custom')}
              >
                {t('common', 'custom')}
              </button>
            </div>
            {isCustom && (
              <>
                <input
                  type="text"
                  className="custom-name-input"
                  placeholder={t('settings', 'presetPlaceholder')}
                  value={customName}
                  onChange={(e) => setCustomName(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter') handleSave(); }}
                />
                <button
                  className="btn btn-save-preset"
                  disabled={!customName.trim() || saving}
                  onClick={handleSave}
                >
                  {saving ? t('common', 'saving') : t('common', 'save')}
                </button>
              </>
            )}
          </div>
        </div>

        <div className="settings-cards">
          {/* Periods */}
          <div className="settings-card">
            <h3 className="card-title">{t('settings', 'periodsTitle')}</h3>
            <div className="card-body">
              <div className="setting-row">
                <label>{t('settings', 'format')}</label>
                <div className="toggle-group">
                  <button
                    className={`btn btn-toggle ${settings.periods.format.quarters ? 'active' : ''}`}
                    onClick={() => toggleFormat(true)}
                  >
                    {t('settings', 'quarters')}
                  </button>
                  <button
                    className={`btn btn-toggle ${settings.periods.format.halves ? 'active' : ''}`}
                    onClick={() => toggleFormat(false)}
                  >
                    {t('settings', 'halves')}
                  </button>
                </div>
              </div>
              <div className="setting-row">
                <label>{settings.periods.format.quarters ? t('settings', 'minutesPerQuarter') : t('settings', 'minutesPerHalf')}</label>
                <input
                  type="number"
                  min="1"
                  max="30"
                  value={settings.periods.minutesPerPeriod}
                  onChange={(e) => updateSetting('periods.minutesPerPeriod', parseInt(e.target.value) || 1)}
                />
              </div>
              <div className="setting-row">
                <label>{t('settings', 'minutesPerOvertime')}</label>
                <input
                  type="number"
                  min="1"
                  max="15"
                  value={settings.periods.minutesPerOvertime}
                  onChange={(e) => updateSetting('periods.minutesPerOvertime', parseInt(e.target.value) || 1)}
                />
              </div>
              <h4 className="subsection-title">{t('settings', 'shotClock')}</h4>
              <div className="setting-row">
                <label>{t('settings', 'enabled')}</label>
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
                    {settings.shotClock.active ? t('common', 'on') : t('common', 'off')}
                  </button>
                </div>
              </div>
              {settings.shotClock.active && (
                <div className="setting-row">
                  <label>{t('settings', 'durationSeconds')}</label>
                  <input
                    type="number"
                    min="10"
                    max="60"
                    value={settings.shotClock.duration || 24}
                    onChange={(e) => updateSetting('shotClock.duration', parseInt(e.target.value) || 24)}
                  />
                </div>
              )}
              <h4 className="subsection-title">{t('settings', 'breaks')}</h4>
              {settings.periods.format.quarters && (
                <div className="setting-row">
                  <label>{t('settings', 'betweenQuarters')}</label>
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
                <label>{t('settings', 'halftime')}</label>
                <input
                  type="number"
                  min="0"
                  max="20"
                  value={settings.breaks.halftime}
                  onChange={(e) => updateSetting('breaks.halftime', parseInt(e.target.value) || 0)}
                />
              </div>
              <div className="setting-row">
                <label>{t('settings', 'beforeOvertime')}</label>
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
            <h3 className="card-title">{t('settings', 'stoppagesTitle')}</h3>
            <div className="card-body">
              <p className="setting-hint">
                {t('settings', 'stoppagesHint')}
              </p>
              {(() => {
                const mode = settings.periods.format.quarters ? 'perQuarter' : 'perHalf';
                const periods = settings.periods.format.quarters
                  ? [
                      { key: '1stQuarter', tKey: 'period_1stQuarter' },
                      { key: '2ndQuarter', tKey: 'period_2ndQuarter' },
                      { key: '3rdQuarter', tKey: 'period_3rdQuarter' },
                      { key: '4thQuarter', tKey: 'period_4thQuarter' },
                      { key: 'overtime', tKey: 'period_overtime' },
                    ]
                  : [
                      { key: '1stHalf', tKey: 'period_1stHalf' },
                      { key: '2ndHalf', tKey: 'period_2ndHalf' },
                      { key: 'overtime', tKey: 'period_overtime' },
                    ];
                const allOn = periods.every(({ key }) => {
                  const val = settings.stoppages.during[mode][key];
                  return val && val.enabled;
                });
                return (
                  <>
                    <div className="setting-row">
                      <label>{t('settings', 'fullGame')}</label>
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
                          {allOn ? t('common', 'on') : t('common', 'off')}
                        </button>
                      </div>
                    </div>
                    {periods.map(({ key, tKey }) => {
                      const val = settings.stoppages.during[mode][key];
                      const isOn = val && val.enabled;
                      return (
                        <div key={key}>
                          <div className="setting-row">
                            <label>{t('settings', tKey)}</label>
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
                                {isOn ? t('common', 'on') : t('common', 'off')}
                              </button>
                            </div>
                          </div>
                          {isOn && (
                            <div className="setting-row">
                              <label>{t('settings', 'lastMin')}</label>
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
            <h3 className="card-title">{t('settings', 'actionsTitle')}</h3>
            <div className="card-body">
              <p className="setting-hint">
                {t('settings', 'actionsHint')}
              </p>
              {settings.stoppages.for.map((entry, i) => (
                <div className="setting-row" key={entry.action}>
                  <label>{t('actions', entry.action) || entry.action}</label>
                  <div className="toggle-group">
                    <button
                      className={`btn btn-toggle ${entry.always ? 'active' : ''}`}
                      onClick={() => updateSetting(`stoppages.for.${i}.always`, !entry.always)}
                    >
                      {entry.always ? t('common', 'on') : t('common', 'off')}
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Tip-Off & Fouls */}
          <div className="settings-card">
            <h3 className="card-title">{t('settings', 'tipOffTitle')}</h3>
            <div className="card-body">
              <div className="setting-row">
                <label>{t('settings', 'possessionRule')}</label>
                <div className="toggle-group">
                  <button
                    className={`btn btn-toggle ${settings.tipOff.possessionRule === 'tipWinner' ? 'active' : ''}`}
                    onClick={() => updateSetting('tipOff.possessionRule', 'tipWinner')}
                  >
                    {t('settings', 'tipWinner')}
                  </button>
                  <button
                    className={`btn btn-toggle ${settings.tipOff.possessionRule === 'manual' ? 'active' : ''}`}
                    onClick={() => updateSetting('tipOff.possessionRule', 'manual')}
                  >
                    {t('settings', 'manual')}
                  </button>
                </div>
              </div>
              <p className="setting-hint">
                {settings.tipOff.possessionRule === 'tipWinner'
                  ? t('settings', 'tipWinnerHint')
                  : t('settings', 'manualHint')}
              </p>
              <h4 className="subsection-title">{t('settings', 'jumpBall')}</h4>
              <div className="setting-row">
                <label>{t('settings', 'rule')}</label>
                <div className="toggle-group">
                  <button
                    className={`btn btn-toggle ${settings.tipOff.jumpBallRule === 'switchPossession' ? 'active' : ''}`}
                    onClick={() => updateSetting('tipOff.jumpBallRule', 'switchPossession')}
                  >
                    {t('settings', 'switchPossession')}
                  </button>
                  <button
                    className={`btn btn-toggle ${settings.tipOff.jumpBallRule === 'tipOff' ? 'active' : ''}`}
                    onClick={() => updateSetting('tipOff.jumpBallRule', 'tipOff')}
                  >
                    {t('settings', 'tipOffOption')}
                  </button>
                </div>
              </div>
              <h4 className="subsection-title">{t('settings', 'fouls')}</h4>
              <div className="setting-row">
                <label>{t('settings', 'foulOutLimit')}</label>
                <input
                  type="number"
                  min="3"
                  max="10"
                  value={settings.fouls.foulOutLimit}
                  onChange={(e) => updateSetting('fouls.foulOutLimit', parseInt(e.target.value) || 5)}
                />
              </div>
              <div className="setting-row">
                <label>{t('settings', 'bonusReset')}</label>
                <div className="toggle-group">
                  <button
                    className={`btn btn-toggle ${settings.fouls.bonus.perPeriod ? 'active' : ''}`}
                    onClick={() => toggleBonusReset(true)}
                  >
                    {t('settings', 'perPeriod')}
                  </button>
                  <button
                    className={`btn btn-toggle ${settings.fouls.bonus.perHalf ? 'active' : ''}`}
                    onClick={() => toggleBonusReset(false)}
                  >
                    {t('settings', 'perHalf')}
                  </button>
                </div>
              </div>
              <div className="setting-row">
                <label>{t('settings', 'oneAndOne')}</label>
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
                    {settings.fouls.bonus.oneAndOne != null ? t('common', 'on') : t('common', 'off')}
                  </button>
                </div>
              </div>
              {settings.fouls.bonus.oneAndOne != null && (
                <div className="setting-row">
                  <label>{t('settings', 'oneAndOneThreshold')}</label>
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
                <label>{t('settings', 'doubleBonusThreshold')}</label>
                <input
                  type="number"
                  min="0"
                  max="20"
                  value={settings.fouls.bonus.doubleBonus ?? ''}
                  placeholder={t('common', 'off')}
                  onChange={(e) => {
                    const val = e.target.value === '' ? null : parseInt(e.target.value);
                    updateSetting('fouls.bonus.doubleBonus', val);
                  }}
                />
              </div>
              <div className="setting-row">
                <label>{t('settings', 'techEjectionLimit')}</label>
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
            <h3 className="card-title">{t('settings', 'timeoutsTitle')}</h3>
            <div className="card-body">
              <div className="setting-row">
                <label>{t('settings', 'allocation')}</label>
                <div className="toggle-group">
                  <button
                    className={`btn btn-toggle ${settings.timeouts.regulation.allocation.perGame ? 'active' : ''}`}
                    onClick={() => toggleTimeoutAllocation(true)}
                  >
                    {t('settings', 'perGame')}
                  </button>
                  <button
                    className={`btn btn-toggle ${settings.timeouts.regulation.allocation.perHalf ? 'active' : ''}`}
                    onClick={() => toggleTimeoutAllocation(false)}
                  >
                    {t('settings', 'perHalf')}
                  </button>
                </div>
              </div>
              <div className="setting-row">
                <label>{t('settings', 'fullTimeouts')}</label>
                <input
                  type="number"
                  min="0"
                  max="10"
                  value={settings.timeouts.regulation.full}
                  onChange={(e) => updateSetting('timeouts.regulation.full', parseInt(e.target.value) || 0)}
                />
              </div>
              <div className="setting-row">
                <label>{t('settings', 'shortTimeouts')}</label>
                <input
                  type="number"
                  min="0"
                  max="10"
                  value={settings.timeouts.regulation.short}
                  onChange={(e) => updateSetting('timeouts.regulation.short', parseInt(e.target.value) || 0)}
                />
              </div>
              <div className="setting-row">
                <label>{t('settings', 'fullDuration')}</label>
                <input
                  type="number"
                  min="10"
                  max="120"
                  value={settings.timeouts.duration.full}
                  onChange={(e) => updateSetting('timeouts.duration.full', parseInt(e.target.value) || 60)}
                />
              </div>
              <div className="setting-row">
                <label>{t('settings', 'shortDuration')}</label>
                <input
                  type="number"
                  min="10"
                  max="60"
                  value={settings.timeouts.duration.short}
                  onChange={(e) => updateSetting('timeouts.duration.short', parseInt(e.target.value) || 30)}
                />
              </div>
              <h4 className="subsection-title">{t('settings', 'overtimeSection')}</h4>
              <div className="setting-row">
                <label>{t('settings', 'otFullTimeouts')}</label>
                <input
                  type="number"
                  min="0"
                  max="5"
                  value={settings.timeouts.overtime.full}
                  onChange={(e) => updateSetting('timeouts.overtime.full', parseInt(e.target.value) || 0)}
                />
              </div>
              <div className="setting-row">
                <label>{t('settings', 'otShortTimeouts')}</label>
                <input
                  type="number"
                  min="0"
                  max="5"
                  value={settings.timeouts.overtime.short}
                  onChange={(e) => updateSetting('timeouts.overtime.short', parseInt(e.target.value) || 0)}
                />
              </div>
              <h4 className="subsection-title">{t('settings', 'rollover')}</h4>
              <div className="setting-row">
                <label>{t('settings', 'regulationToOT')}</label>
                <div className="toggle-group">
                  <button
                    className={`btn btn-toggle ${settings.timeouts.rollover.regulationtoOT ? 'active' : ''}`}
                    onClick={() => updateSetting('timeouts.rollover.regulationtoOT', !settings.timeouts.rollover.regulationtoOT)}
                  >
                    {settings.timeouts.rollover.regulationtoOT ? t('common', 'on') : t('common', 'off')}
                  </button>
                </div>
              </div>
              <div className="setting-row">
                <label>{t('settings', 'otToOT')}</label>
                <div className="toggle-group">
                  <button
                    className={`btn btn-toggle ${settings.timeouts.rollover.OTtoOT ? 'active' : ''}`}
                    onClick={() => updateSetting('timeouts.rollover.OTtoOT', !settings.timeouts.rollover.OTtoOT)}
                  >
                    {settings.timeouts.rollover.OTtoOT ? t('common', 'on') : t('common', 'off')}
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
          {t('settings', 'nextPickTeams')}
        </button>
      </div>
    </div>
  );
}
