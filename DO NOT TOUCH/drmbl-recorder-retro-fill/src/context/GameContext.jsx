import { createContext, useContext, useReducer, useEffect, useState, useRef, useCallback } from 'react';
import { buildBoxScore, buildEmptyPlayerStats, buildTeamStats } from '../data/boxScore';
import { subscribeLiveSync } from '../data/api';

const STORAGE_KEY = 'drmbl-tracker-active-game';
const BROADCAST_CHANNEL = 'drmbl-live-game';

const GameContext = createContext(null);
const GameDispatchContext = createContext(null);
const LiveSyncContext = createContext(null);

const initialState = {
  // Pre-game setup step tracking
  // 0=home, 1=league, 2=season, 3=game-select, 4=settings, 5=attendance, 6=tipoff, 7=game
  setupStep: 0,

  // Game settings (loaded from API at step 4, null until then)
  settings: null,

  // Selected league: { id, league: { fullName, divisions } }
  selectedLeague: null,

  // Selected season (full season object from API, includes teams/games/standings)
  selectedSeason: null,

  // Selected scheduled game from the season (null = custom matchup)
  selectedGame: null,

  // Team selections — set during game pick or custom matchup, roster loaded async from API
  // { teamID, name, slot, roster: [...] | null }
  homeTeam: null,
  awayTeam: null,

  // Attendance: which players showed up (playerID sets)
  homeAttendance: new Set(),
  awayAttendance: new Set(),

  // Number overrides for this game: { playerID: newNumber }
  homeNumberOverrides: {},
  awayNumberOverrides: {},

  // Starters: sets of 5 playerIDs per team
  homeStarters: new Set(),
  awayStarters: new Set(),

  // Captain: one playerID per team (or null)
  homeCaptain: null,
  awayCaptain: null,

  // Tip-off winner: 'home' | 'away' | null
  tipOffWinner: null,

  // First possession after tip-off: 'home' | 'away' | null
  firstPossession: null,

  // Box score: initialized after tip-off, before game tracking
  boxScore: null,

  // Pre-game warm-up timer (seconds). null = not active. Lives outside boxScore
  // because it's transient pre-game state, but in reducer state so the main
  // GameScreen clock can override its display when active.
  warmupCountdown: null,

  // Undo history: stack of previous boxScore snapshots (most recent last). Capped at HISTORY_LIMIT.
  pastBoxScores: [],

  // Retro-fill flag: true when this state was loaded from an existing box score
  // for editing (rather than built up from scratch). Used by GameScreen's save
  // flow to call saveEditGame (upsert) instead of saveEndGame (create).
  editMode: false,
};

// Helpers for game tracking reducers
function calcPercentage(made, attempted) {
  return attempted === 0 ? 0 : Math.round((made / attempted) * 100);
}

const QUARTER_KEYS = { 1: 'first', 2: 'second', 3: 'third', 4: 'fourth' };
function getQuarterKey(q) {
  if (q <= 4) return QUARTER_KEYS[q];
  return `OT${q - 4}`;
}
function isOTKey(qKey) {
  return qKey.startsWith('OT');
}

function finalizeTime(clockTimeAtEntry, timeLeftNow) {
  if (clockTimeAtEntry == null) return 0;
  return Math.max(0, clockTimeAtEntry - timeLeftNow);
}

function gameReducer(state, action) {
  switch (action.type) {
    case 'SET_STEP':
      return { ...state, setupStep: action.step };

    case 'SET_SETTINGS':
      return { ...state, settings: action.settings };

    case 'SET_LEAGUE':
      return {
        ...state,
        selectedLeague: action.league,
        selectedSeason: null,
        selectedGame: null,
        homeTeam: null,
        awayTeam: null,
        homeAttendance: new Set(),
        awayAttendance: new Set(),
        homeNumberOverrides: {},
        awayNumberOverrides: {},
        homeStarters: new Set(),
        awayStarters: new Set(),
        homeCaptain: null,
        awayCaptain: null,
      };

    case 'SET_SEASON':
      return {
        ...state,
        selectedSeason: action.season,
        selectedGame: null,
        homeTeam: null,
        awayTeam: null,
        homeAttendance: new Set(),
        awayAttendance: new Set(),
        homeNumberOverrides: {},
        awayNumberOverrides: {},
        homeStarters: new Set(),
        awayStarters: new Set(),
        homeCaptain: null,
        awayCaptain: null,
      };

    case 'SET_GAME': {
      const season = state.selectedSeason;
      const game = action.game;
      // Resolve team info from season teams using slot letters
      const teams = season?.teams || [];
      const homeSlot = game.home;
      const awaySlot = game.away;
      const homeInfo = teams.find((t) => t.slot === homeSlot);
      const awayInfo = teams.find((t) => t.slot === awaySlot);
      return {
        ...state,
        selectedGame: game,
        homeTeam: homeInfo ? { teamID: homeInfo.teamID, name: homeInfo.name, slot: homeSlot, roster: null } : null,
        awayTeam: awayInfo ? { teamID: awayInfo.teamID, name: awayInfo.name, slot: awaySlot, roster: null } : null,
        homeAttendance: new Set(),
        awayAttendance: new Set(),
        homeNumberOverrides: {},
        awayNumberOverrides: {},
        homeStarters: new Set(),
        awayStarters: new Set(),
        homeCaptain: null,
        awayCaptain: null,
      };
    }

    case 'CLEAR_GAME':
      return {
        ...state,
        selectedGame: null,
        homeTeam: null,
        awayTeam: null,
        homeAttendance: new Set(),
        awayAttendance: new Set(),
        homeNumberOverrides: {},
        awayNumberOverrides: {},
        homeStarters: new Set(),
        awayStarters: new Set(),
        homeCaptain: null,
        awayCaptain: null,
      };

    case 'UPDATE_SETTING': {
      const newSettings = structuredClone(state.settings);
      setNestedValue(newSettings, action.path, action.value);
      return { ...state, settings: newSettings };
    }

    case 'SET_HOME_TEAM':
      return {
        ...state,
        homeTeam: { teamID: action.teamID, name: action.name, slot: action.slot, roster: null },
        homeAttendance: new Set(),
        homeNumberOverrides: {},
        homeStarters: new Set(),
        homeCaptain: null,
      };

    case 'CLEAR_HOME_TEAM':
      return {
        ...state,
        homeTeam: null,
        homeAttendance: new Set(),
        homeNumberOverrides: {},
        homeStarters: new Set(),
        homeCaptain: null,
      };

    case 'SET_AWAY_TEAM':
      return {
        ...state,
        awayTeam: { teamID: action.teamID, name: action.name, slot: action.slot, roster: null },
        awayAttendance: new Set(),
        awayNumberOverrides: {},
        awayStarters: new Set(),
        awayCaptain: null,
      };

    case 'CLEAR_AWAY_TEAM':
      return {
        ...state,
        awayTeam: null,
        awayAttendance: new Set(),
        awayNumberOverrides: {},
        awayStarters: new Set(),
        awayCaptain: null,
      };

    case 'SET_TEAM_ROSTER': {
      const teamKey = action.side === 'home' ? 'homeTeam' : 'awayTeam';
      const team = state[teamKey];
      if (!team) return state;
      return { ...state, [teamKey]: { ...team, roster: action.roster } };
    }

    case 'APPEND_TO_ROSTER': {
      const teamKey = action.side === 'home' ? 'homeTeam' : 'awayTeam';
      const team = state[teamKey];
      if (!team || !team.roster) return state;
      return {
        ...state,
        [teamKey]: { ...team, roster: [...team.roster, { playerID: action.playerID, name: action.name }] }
      };
    }

    case 'TOGGLE_ATTENDANCE': {
      const key = action.side === 'home' ? 'homeAttendance' : 'awayAttendance';
      const next = new Set(state[key]);
      if (next.has(action.playerID)) {
        next.delete(action.playerID);
      } else {
        next.add(action.playerID);
      }
      return { ...state, [key]: next };
    }

    case 'SELECT_ALL_ATTENDANCE': {
      const teamKey = action.side === 'home' ? 'homeTeam' : 'awayTeam';
      const attKey = action.side === 'home' ? 'homeAttendance' : 'awayAttendance';
      const team = state[teamKey];
      if (!team || !team.roster) return state;
      const all = new Set(team.roster.map((p) => p.playerID));
      return { ...state, [attKey]: all };
    }

    case 'CLEAR_ATTENDANCE': {
      const attKey = action.side === 'home' ? 'homeAttendance' : 'awayAttendance';
      return { ...state, [attKey]: new Set() };
    }

    case 'SET_NUMBER_OVERRIDE': {
      const key = action.side === 'home' ? 'homeNumberOverrides' : 'awayNumberOverrides';
      return {
        ...state,
        [key]: { ...state[key], [action.playerID]: action.number },
      };
    }

    case 'CLEAR_NUMBER_OVERRIDE': {
      const key = action.side === 'home' ? 'homeNumberOverrides' : 'awayNumberOverrides';
      const next = { ...state[key] };
      delete next[action.playerID];
      return { ...state, [key]: next };
    }

    case 'TOGGLE_STARTER': {
      const key = action.side === 'home' ? 'homeStarters' : 'awayStarters';
      const next = new Set(state[key]);
      if (next.has(action.playerID)) {
        next.delete(action.playerID);
      } else if (next.size < 5) {
        next.add(action.playerID);
      }
      return { ...state, [key]: next };
    }

    case 'SET_STARTERS': {
      const key = action.side === 'home' ? 'homeStarters' : 'awayStarters';
      return { ...state, [key]: new Set(action.playerIDs) };
    }

    case 'SET_CAPTAIN': {
      const key = action.side === 'home' ? 'homeCaptain' : 'awayCaptain';
      return { ...state, [key]: action.playerID };
    }

    case 'CLEAR_CAPTAIN': {
      const key = action.side === 'home' ? 'homeCaptain' : 'awayCaptain';
      return { ...state, [key]: null };
    }

    case 'SET_TIP_OFF_WINNER':
      return { ...state, tipOffWinner: action.winner };

    case 'INIT_BOX_SCORE':
      return { ...state, boxScore: buildBoxScore(state) };

    case 'SET_WARMUP_COUNTDOWN':
      return { ...state, warmupCountdown: action.value };

    case 'TICK_WARMUP_COUNTDOWN': {
      // Decrement by delta seconds; clamp at 0; preserve null (inactive) state.
      if (state.warmupCountdown == null) return state;
      return { ...state, warmupCountdown: Math.max(0, state.warmupCountdown - (action.delta || 0)) };
    }

    case 'RECORD_MADE_SHOT': {
      const bs = structuredClone(state.boxScore);
      const { side, playerIndex, points, correction } = action;
      const delta = correction ? -1 : 1;
      const pointsDelta = correction ? -points : points;
      const player = bs.teamInfo[side].roster.inGame[playerIndex];
      const teamStats = bs.teamInfo[side].stats;
      const qKey = getQuarterKey(bs.gameInfo.state.currentQuarter);

      player.stats.offense.points = Math.max(0, player.stats.offense.points + pointsDelta);

      if (points === 1) {
        const ft = player.stats.offense.shootingBreakdown.freeThrows;
        ft.attempted = Math.max(0, ft.attempted + delta);
        ft.made = Math.max(0, ft.made + delta);
        ft.percentage = calcPercentage(ft.made, ft.attempted);
        const tft = teamStats.shootingBreakdown.freeThrows;
        tft.attempted = Math.max(0, tft.attempted + delta);
        tft.made = Math.max(0, tft.made + delta);
        tft.percentage = calcPercentage(tft.made, tft.attempted);
      } else {
        const shotKey = points === 2 ? '2-PointShots' : '3-PointShots';
        const fg = player.stats.offense.shootingBreakdown.fieldGoals;
        fg.totalAttempted = Math.max(0, fg.totalAttempted + delta);
        fg.totalMade = Math.max(0, fg.totalMade + delta);
        fg[shotKey].attempted = Math.max(0, fg[shotKey].attempted + delta);
        fg[shotKey].made = Math.max(0, fg[shotKey].made + delta);
        fg[shotKey].percentage = calcPercentage(fg[shotKey].made, fg[shotKey].attempted);
        fg.totalPercentage = calcPercentage(fg.totalMade, fg.totalAttempted);
        const tfg = teamStats.shootingBreakdown.fieldGoals;
        tfg.totalAttempted = Math.max(0, tfg.totalAttempted + delta);
        tfg.totalMade = Math.max(0, tfg.totalMade + delta);
        tfg[shotKey].attempted = Math.max(0, tfg[shotKey].attempted + delta);
        tfg[shotKey].made = Math.max(0, tfg[shotKey].made + delta);
        tfg[shotKey].percentage = calcPercentage(tfg[shotKey].made, tfg[shotKey].attempted);
        tfg.totalPercentage = calcPercentage(tfg.totalMade, tfg.totalAttempted);
      }

      bs.teamInfo[side].score.current = Math.max(0, bs.teamInfo[side].score.current + pointsDelta);
      if (isOTKey(qKey)) {
        bs.teamInfo[side].score.perQuarter.overtime[qKey] =
          Math.max(0, (bs.teamInfo[side].score.perQuarter.overtime[qKey] || 0) + pointsDelta);
      } else {
        bs.teamInfo[side].score.perQuarter[qKey] =
          Math.max(0, (bs.teamInfo[side].score.perQuarter[qKey] || 0) + pointsDelta);
      }

      // Plus/minus: update all on-court players (no floor — can be negative)
      const oppSide = side === 'home' ? 'away' : 'home';
      for (const p of bs.teamInfo[side].roster.inGame) {
        if (p.playerID && p.onCourt) p.stats.general.plusMinus += pointsDelta;
      }
      for (const p of bs.teamInfo[oppSide].roster.inGame) {
        if (p.playerID && p.onCourt) p.stats.general.plusMinus -= pointsDelta;
      }

      return { ...state, boxScore: bs };
    }

    case 'RECORD_MISSED_SHOT': {
      const bs = structuredClone(state.boxScore);
      const { side, playerIndex, points, correction } = action;
      const delta = correction ? -1 : 1;
      const player = bs.teamInfo[side].roster.inGame[playerIndex];
      const teamStats = bs.teamInfo[side].stats;

      if (points === 1) {
        const ft = player.stats.offense.shootingBreakdown.freeThrows;
        ft.attempted = Math.max(0, ft.attempted + delta);
        ft.missed = Math.max(0, ft.missed + delta);
        ft.percentage = calcPercentage(ft.made, ft.attempted);
        const tft = teamStats.shootingBreakdown.freeThrows;
        tft.attempted = Math.max(0, tft.attempted + delta);
        tft.missed = Math.max(0, tft.missed + delta);
        tft.percentage = calcPercentage(tft.made, tft.attempted);
      } else {
        const shotKey = points === 2 ? '2-PointShots' : '3-PointShots';
        const fg = player.stats.offense.shootingBreakdown.fieldGoals;
        fg.totalAttempted = Math.max(0, fg.totalAttempted + delta);
        fg.totalMissed = Math.max(0, fg.totalMissed + delta);
        fg[shotKey].attempted = Math.max(0, fg[shotKey].attempted + delta);
        fg[shotKey].missed = Math.max(0, fg[shotKey].missed + delta);
        fg[shotKey].percentage = calcPercentage(fg[shotKey].made, fg[shotKey].attempted);
        fg.totalPercentage = calcPercentage(fg.totalMade, fg.totalAttempted);
        const tfg = teamStats.shootingBreakdown.fieldGoals;
        tfg.totalAttempted = Math.max(0, tfg.totalAttempted + delta);
        tfg.totalMissed = Math.max(0, tfg.totalMissed + delta);
        tfg[shotKey].attempted = Math.max(0, tfg[shotKey].attempted + delta);
        tfg[shotKey].missed = Math.max(0, tfg[shotKey].missed + delta);
        tfg[shotKey].percentage = calcPercentage(tfg[shotKey].made, tfg[shotKey].attempted);
        tfg.totalPercentage = calcPercentage(tfg.totalMade, tfg.totalAttempted);
      }

      return { ...state, boxScore: bs };
    }

    case 'SET_CLOCK_TIME':
      return {
        ...state,
        boxScore: {
          ...state.boxScore,
          gameInfo: {
            ...state.boxScore.gameInfo,
            state: {
              ...state.boxScore.gameInfo.state,
              clock: { ...state.boxScore.gameInfo.state.clock, timeLeft: action.timeLeft },
            },
          },
        },
      };

    case 'TOGGLE_CLOCK': {
      const bs = structuredClone(state.boxScore);
      const wasActive = bs.gameInfo.state.active;
      const timeLeftNow = bs.gameInfo.state.clock.timeLeft;

      bs.gameInfo.general.status = 'in-progress';
      bs.gameInfo.state.active = !wasActive;

      for (const side of ['home', 'away']) {
        for (const p of bs.teamInfo[side].roster.inGame) {
          if (!p.playerID || !p.onCourt) continue;
          if (wasActive) {
            // Clock stopping: finalize accumulated time
            p.stats.general.minutesPlayed += finalizeTime(p._clockTimeAtEntry, timeLeftNow);
            p._clockTimeAtEntry = null;
          } else {
            // Clock starting: begin tracking
            p._clockTimeAtEntry = timeLeftNow;
          }
        }
      }

      return { ...state, boxScore: bs };
    }

    case 'ADVANCE_QUARTER': {
      const bs = structuredClone(state.boxScore);
      const nextQ = bs.gameInfo.state.currentQuarter + 1;
      const wasOT = bs.gameInfo.state.currentQuarter > 4;
      bs.gameInfo.state.currentQuarter = nextQ;
      const isOT = nextQ > 4;
      bs.gameInfo.state.clock.timeLeft = isOT
        ? bs.gameInfo.state.clock.perOT * 60
        : bs.gameInfo.state.clock.perQuarter * 60;
      bs.gameInfo.state.active = false;
      if (isOT) bs.gameInfo.state.overtimes += 1;

      // Clear clock-entry timestamps (time already finalized when clock stopped at 0:00)
      for (const side of ['home', 'away']) {
        for (const p of bs.teamInfo[side].roster.inGame) {
          p._clockTimeAtEntry = null;
        }
      }

      // Reset timeouts entering OT (no rollover by default — settings.timeouts.rollover)
      if (isOT && state.settings?.timeouts) {
        const otCfg = state.settings.timeouts.overtime || { full: 0, short: 0 };
        const rollOTtoOT = !!state.settings.timeouts.rollover?.OTtoOT;
        const rollRegToOT = !!state.settings.timeouts.rollover?.regulationtoOT;
        const shouldRoll = wasOT ? rollOTtoOT : rollRegToOT;
        for (const side of ['home', 'away']) {
          const t = bs.teamInfo[side].stats.timeouts;
          if (shouldRoll) {
            t.remaining.full += otCfg.full || 0;
            t.remaining.short += otCfg.short || 0;
          } else {
            t.remaining.full = otCfg.full || 0;
            t.remaining.short = otCfg.short || 0;
          }
        }
      }

      return { ...state, boxScore: bs };
    }

    case 'REVERT_QUARTER': {
      const bs = structuredClone(state.boxScore);
      const curQ = bs.gameInfo.state.currentQuarter;
      if (curQ <= 1) return state;
      bs.gameInfo.state.currentQuarter = curQ - 1;
      bs.gameInfo.state.clock.timeLeft = 0;
      bs.gameInfo.state.active = false;
      if (curQ > 4) bs.gameInfo.state.overtimes = Math.max(0, bs.gameInfo.state.overtimes - 1);
      for (const side of ['home', 'away']) {
        for (const p of bs.teamInfo[side].roster.inGame) {
          p._clockTimeAtEntry = null;
        }
      }
      return { ...state, boxScore: bs };
    }

    case 'UNDO_END_GAME': {
      const bs = structuredClone(state.boxScore);
      bs.gameInfo.general.status = 'in-progress';
      bs.gameInfo.state.winner = null;
      bs.gameInfo.state.loser = null;
      return { ...state, boxScore: bs };
    }

    case 'END_GAME': {
      const bs = structuredClone(state.boxScore);
      bs.gameInfo.general.status = 'final';
      const homeScore = bs.teamInfo.home.score.current;
      const awayScore = bs.teamInfo.away.score.current;
      bs.gameInfo.state.winner = homeScore >= awayScore ? 'home' : 'away';
      bs.gameInfo.state.loser = homeScore >= awayScore ? 'away' : 'home';

      // Finalize any remaining on-court time if clock was still active
      if (bs.gameInfo.state.active) {
        const timeLeftNow = bs.gameInfo.state.clock.timeLeft;
        for (const side of ['home', 'away']) {
          for (const p of bs.teamInfo[side].roster.inGame) {
            if (p.playerID && p.onCourt && p._clockTimeAtEntry != null) {
              p.stats.general.minutesPlayed += finalizeTime(p._clockTimeAtEntry, timeLeftNow);
            }
            p._clockTimeAtEntry = null;
          }
        }
      }

      bs.gameInfo.state.active = false;
      return { ...state, boxScore: bs };
    }

    case 'RECORD_REBOUND': {
      const bs = structuredClone(state.boxScore);
      const { side, playerIndex, reboundType, correction } = action;
      const delta = correction ? -1 : 1;
      const player = bs.teamInfo[side].roster.inGame[playerIndex];
      const teamStats = bs.teamInfo[side].stats;

      player.stats.rebounds[reboundType] = Math.max(0, player.stats.rebounds[reboundType] + delta);
      player.stats.rebounds.total = Math.max(0, player.stats.rebounds.total + delta);
      teamStats.rebounds[reboundType] = Math.max(0, teamStats.rebounds[reboundType] + delta);
      teamStats.rebounds.total = Math.max(0, teamStats.rebounds.total + delta);

      return { ...state, boxScore: bs };
    }

    case 'RECORD_ASSIST': {
      const bs = structuredClone(state.boxScore);
      const { side, playerIndex, correction } = action;
      const delta = correction ? -1 : 1;
      const player = bs.teamInfo[side].roster.inGame[playerIndex];

      player.stats.offense.assists = Math.max(0, player.stats.offense.assists + delta);
      bs.teamInfo[side].stats.assists = Math.max(0, bs.teamInfo[side].stats.assists + delta);

      return { ...state, boxScore: bs };
    }

    case 'RECORD_STEAL': {
      const bs = structuredClone(state.boxScore);
      const { side, playerIndex, correction } = action;
      const delta = correction ? -1 : 1;
      const player = bs.teamInfo[side].roster.inGame[playerIndex];

      player.stats.defense.steals = Math.max(0, player.stats.defense.steals + delta);
      bs.teamInfo[side].stats.defense.steals = Math.max(0, bs.teamInfo[side].stats.defense.steals + delta);

      return { ...state, boxScore: bs };
    }

    case 'RECORD_BLOCK': {
      const bs = structuredClone(state.boxScore);
      const { side, playerIndex, correction } = action;
      const delta = correction ? -1 : 1;
      const player = bs.teamInfo[side].roster.inGame[playerIndex];

      player.stats.defense.blocks = Math.max(0, player.stats.defense.blocks + delta);
      bs.teamInfo[side].stats.defense.blocks = Math.max(0, bs.teamInfo[side].stats.defense.blocks + delta);

      return { ...state, boxScore: bs };
    }

    case 'RECORD_TURNOVER': {
      const bs = structuredClone(state.boxScore);
      const { side, playerIndex, correction } = action;
      const delta = correction ? -1 : 1;
      const player = bs.teamInfo[side].roster.inGame[playerIndex];

      player.stats.general.turnovers = Math.max(0, player.stats.general.turnovers + delta);
      bs.teamInfo[side].stats.turnovers = Math.max(0, bs.teamInfo[side].stats.turnovers + delta);

      return { ...state, boxScore: bs };
    }

    case 'RECORD_FOUL': {
      const bs = structuredClone(state.boxScore);
      const { side, playerIndex, foulType, correction } = action;
      const delta = correction ? -1 : 1;
      const player = bs.teamInfo[side].roster.inGame[playerIndex];
      const teamStats = bs.teamInfo[side].stats;
      const qKey = getQuarterKey(bs.gameInfo.state.currentQuarter);

      if (foulType === 'personal') {
        player.stats.general.fouls.personal.total = Math.max(0, player.stats.general.fouls.personal.total + delta);
      } else if (foulType === 'offensive') {
        player.stats.general.fouls.personal.total = Math.max(0, player.stats.general.fouls.personal.total + delta);
        player.stats.general.fouls.personal.offensive = Math.max(0, player.stats.general.fouls.personal.offensive + delta);
      } else if (foulType === 'technical') {
        player.stats.general.fouls.technical = Math.max(0, player.stats.general.fouls.technical + delta);
      } else if (foulType === 'flagrant') {
        player.stats.general.fouls.flagrant = Math.max(0, player.stats.general.fouls.flagrant + delta);
      }

      teamStats.fouls.total = Math.max(0, teamStats.fouls.total + delta);
      if (isOTKey(qKey)) {
        if (!teamStats.fouls.perQuarter.overtime[qKey]) {
          teamStats.fouls.perQuarter.overtime[qKey] = { committed: 0, opponentInBonus: false };
        }
        teamStats.fouls.perQuarter.overtime[qKey].committed = Math.max(0, teamStats.fouls.perQuarter.overtime[qKey].committed + delta);
      } else {
        if (!teamStats.fouls.perQuarter[qKey]) {
          teamStats.fouls.perQuarter[qKey] = { committed: 0, opponentInBonus: false };
        }
        teamStats.fouls.perQuarter[qKey].committed = Math.max(0, teamStats.fouls.perQuarter[qKey].committed + delta);
      }

      return { ...state, boxScore: bs };
    }

    case 'SET_FIRST_POSSESSION':
      return { ...state, firstPossession: action.side };

    case 'SET_POSSESSION': {
      return {
        ...state,
        boxScore: {
          ...state.boxScore,
          gameInfo: {
            ...state.boxScore.gameInfo,
            state: {
              ...state.boxScore.gameInfo.state,
              possession: action.side,
            },
          },
        },
      };
    }

    case 'RECORD_TIMEOUT': {
      const bs = structuredClone(state.boxScore);
      const { side, timeoutType, correction } = action; // timeoutType: 'full' | 'short'
      const delta = correction ? -1 : 1;
      const timeouts = bs.teamInfo[side].stats.timeouts;

      timeouts.used[timeoutType] = Math.max(0, timeouts.used[timeoutType] + delta);
      timeouts.remaining[timeoutType] = Math.min(
        timeouts.total?.[timeoutType] ?? Infinity,
        Math.max(0, timeouts.remaining[timeoutType] - delta),
      );

      return { ...state, boxScore: bs };
    }

    case 'RECORD_SUBSTITUTION': {
      const bs = structuredClone(state.boxScore);
      const { side, outIndex, inIndex } = action;
      const clockActive = bs.gameInfo.state.active;
      const timeLeftNow = bs.gameInfo.state.clock.timeLeft;
      const outPlayer = bs.teamInfo[side].roster.inGame[outIndex];
      const inPlayer = bs.teamInfo[side].roster.inGame[inIndex];

      if (clockActive && outPlayer._clockTimeAtEntry != null) {
        outPlayer.stats.general.minutesPlayed += finalizeTime(outPlayer._clockTimeAtEntry, timeLeftNow);
      }
      outPlayer.onCourt = false;
      outPlayer._clockTimeAtEntry = null;

      inPlayer.onCourt = true;
      inPlayer._clockTimeAtEntry = clockActive ? timeLeftNow : null;

      return { ...state, boxScore: bs };
    }

    case 'LATE_ADD_PLAYER': {
      const bs = structuredClone(state.boxScore);
      const { side, playerID, name, number } = action;
      const emptyIndex = bs.teamInfo[side].roster.inGame.findIndex((p) => p.playerID === null);
      if (emptyIndex === -1) return state;
      bs.teamInfo[side].roster.inGame[emptyIndex] = {
        playerID,
        name,
        number,
        starter: false,
        onCourt: false,
        captain: false,
        position: null,
        stats: buildEmptyPlayerStats(),
        _clockTimeAtEntry: null,
      };
      return { ...state, boxScore: bs };
    }

    case 'SUB_IN_PLAYER': {
      const bs = structuredClone(state.boxScore);
      const { side, playerIndex } = action;
      const player = bs.teamInfo[side].roster.inGame[playerIndex];
      player.onCourt = true;
      player._clockTimeAtEntry = bs.gameInfo.state.active
        ? bs.gameInfo.state.clock.timeLeft
        : null;
      return { ...state, boxScore: bs };
    }

    case 'JUMP_BALL': {
      const bs = structuredClone(state.boxScore);
      const arrow = bs.gameInfo.state.possessionArrow;
      bs.gameInfo.state.possession = arrow;
      bs.gameInfo.state.possessionArrow = arrow === 'home' ? 'away' : 'home';
      return { ...state, boxScore: bs };
    }

    case 'RESTORE_GAME': {
      return {
        ...initialState,
        setupStep: 7,
        settings: action.settings,
        selectedLeague: action.selectedLeague || null,
        selectedSeason: action.selectedSeason,
        selectedGame: action.selectedGame || null,
        homeTeam: action.homeTeam,
        awayTeam: action.awayTeam,
        boxScore: action.boxScore,
      };
    }

    case 'LOAD_BOX_SCORE': {
      // Retro-fill entry point: hydrate from a completed box score, mark editMode.
      return {
        ...initialState,
        setupStep: 7,
        settings: action.settings,
        selectedSeason: action.seasonId ? { id: action.seasonId } : null,
        selectedGame: action.selectedGameId ? { id: action.selectedGameId } : null,
        homeTeam: action.homeTeam,
        awayTeam: action.awayTeam,
        boxScore: action.boxScore,
        editMode: true,
      };
    }

    case 'WIPE_STATS': {
      // Retro-fill: zero all per-player and per-team stats AND the team score,
      // but preserve the original score.current and score.perQuarter as
      // score.target / score.targetPerQuarter for UI reference. Resets the clock
      // and game status so the user can re-track from Q1 with footage as a guide.
      if (!state.boxScore) return state;
      const newBS = structuredClone(state.boxScore);
      const settings = state.settings;
      for (const side of ['home', 'away']) {
        const teamSide = newBS.teamInfo[side];
        teamSide.score.target = teamSide.score.current;
        teamSide.score.targetPerQuarter = { ...(teamSide.score.perQuarter || {}) };
        teamSide.score.current = 0;
        teamSide.score.perQuarter = { first: 0, second: 0, third: 0, fourth: 0, overtime: {} };
        teamSide.stats = buildTeamStats(settings);
        const inGame = (teamSide.roster && teamSide.roster.inGame) || [];
        for (const slot of inGame) {
          if (slot.playerID) {
            slot.stats = buildEmptyPlayerStats();
            slot.dnp = false;
            slot._clockTimeAtEntry = slot.starter ? (settings?.periods?.minutesPerPeriod ?? 10) * 60 : null;
            slot.onCourt = !!slot.starter;
          }
        }
      }
      const periodSeconds = (settings?.periods?.minutesPerPeriod ?? 10) * 60;
      newBS.gameInfo.state.currentQuarter = 1;
      newBS.gameInfo.state.clock.timeLeft = periodSeconds;
      newBS.gameInfo.state.active = false;
      newBS.gameInfo.state.winner = '';
      newBS.gameInfo.state.loser = '';
      newBS.gameInfo.state.overtimes = 0;
      newBS.gameInfo.general.status = 'in-progress';
      return { ...state, boxScore: newBS };
    }

    case 'RESET_GAME':
      try { localStorage.removeItem(STORAGE_KEY); } catch (e) { /* ignore */ }
      return { ...initialState };

    default:
      return state;
  }
}

// Actions whose box-score mutation should be undoable via Ctrl+Z
const TRACKABLE_ACTIONS = new Set([
  'RECORD_MADE_SHOT',
  'RECORD_MISSED_SHOT',
  'RECORD_REBOUND',
  'RECORD_ASSIST',
  'RECORD_STEAL',
  'RECORD_BLOCK',
  'RECORD_TURNOVER',
  'RECORD_FOUL',
  'RECORD_TIMEOUT',
  'RECORD_SUBSTITUTION',
  'LATE_ADD_PLAYER',
  'SUB_IN_PLAYER',
  'JUMP_BALL',
  'ADVANCE_QUARTER',
  'REVERT_QUARTER',
  'TOGGLE_CLOCK',
  'SET_POSSESSION',
  'END_GAME',
]);

const HISTORY_LIMIT = 50;

// Wraps gameReducer with a box-score history stack so UNDO can roll back the last trackable action.
function undoableReducer(state, action) {
  if (action.type === 'UNDO') {
    const past = state.pastBoxScores || [];
    if (past.length === 0) return state;
    return {
      ...state,
      boxScore: past[past.length - 1],
      pastBoxScores: past.slice(0, -1),
    };
  }

  const prevBoxScore = state.boxScore;
  const next = gameReducer(state, action);

  // Reset history when starting / restoring / loading / resetting / wiping
  if (
    action.type === 'INIT_BOX_SCORE' ||
    action.type === 'RESTORE_GAME' ||
    action.type === 'LOAD_BOX_SCORE' ||
    action.type === 'WIPE_STATS' ||
    action.type === 'RESET_GAME'
  ) {
    return { ...next, pastBoxScores: [] };
  }

  // Push prior box-score snapshot for trackable actions that actually changed it
  if (TRACKABLE_ACTIONS.has(action.type) && prevBoxScore && next.boxScore !== prevBoxScore) {
    const stack = (state.pastBoxScores || []).concat([prevBoxScore]);
    if (stack.length > HISTORY_LIMIT) stack.shift();
    return { ...next, pastBoxScores: stack };
  }

  return next;
}

// Helper to set a nested value by dot-path (e.g. "periods.minutesPerPeriod")
function setNestedValue(obj, path, value) {
  const keys = path.split('.');
  let current = obj;
  for (let i = 0; i < keys.length - 1; i++) {
    current = current[keys[i]];
  }
  current[keys[keys.length - 1]] = value;
}

export function GameProvider({ children }) {
  const [state, dispatch] = useReducer(undoableReducer, initialState);
  const [saveStatus, setSaveStatus] = useState('idle'); // 'idle' | 'saving' | 'saved' | 'error'
  const [lastSavedAt, setLastSavedAt] = useState(null);
  const bcRef = useRef(null);
  const scoreboardWindowRef = useRef(null);

  // Persist game state to localStorage whenever boxScore changes during active game
  useEffect(() => {
    if (state.setupStep !== 7 || !state.boxScore) return;
    try {
      const snapshot = {
        settings: state.settings,
        selectedLeague: state.selectedLeague,
        selectedSeason: state.selectedSeason,
        selectedGame: state.selectedGame,
        homeTeam: state.homeTeam,
        awayTeam: state.awayTeam,
        boxScore: state.boxScore,
      };
      localStorage.setItem(STORAGE_KEY, JSON.stringify(snapshot));
    } catch (e) { /* quota exceeded or private browsing — ignore */ }
  }, [state.boxScore, state.setupStep]);

  // Initialize BroadcastChannel once
  useEffect(() => {
    if (typeof BroadcastChannel === 'undefined') return undefined;
    bcRef.current = new BroadcastChannel(BROADCAST_CHANNEL);
    return () => {
      try { bcRef.current?.close(); } catch (e) { /* ignore */ }
      bcRef.current = null;
    };
  }, []);

  // Build a broadcast/save payload from current state (only valid in step 7 with a boxScore)
  const buildPayload = useCallback(() => {
    if (!state.boxScore) return null;
    return {
      gameId: state.boxScore.gameId,
      boxScore: state.boxScore,
      trackerState: { settings: state.settings },
    };
  }, [state.boxScore, state.settings]);

  // Broadcast box-score state on every change so the scoreboard popup re-renders instantly
  useEffect(() => {
    if (state.setupStep !== 7 || !state.boxScore || !bcRef.current) return;
    const payload = buildPayload();
    if (!payload) return;
    try {
      bcRef.current.postMessage({
        type: 'state',
        payload: { ...payload, updatedAt: new Date().toISOString() },
      });
    } catch (e) { /* ignore */ }
  }, [state.boxScore, state.setupStep, buildPayload]);

  // Respond to a fresh scoreboard popup asking for current state
  useEffect(() => {
    if (!bcRef.current) return undefined;
    const channel = bcRef.current;
    const handler = (ev) => {
      if (!ev || !ev.data || ev.data.type !== 'request-state') return;
      const payload = buildPayload();
      if (!payload) return;
      try {
        channel.postMessage({
          type: 'state',
          payload: { ...payload, updatedAt: new Date().toISOString() },
        });
      } catch (e) { /* ignore */ }
    };
    channel.addEventListener('message', handler);
    return () => channel.removeEventListener('message', handler);
  }, [buildPayload]);

  // Track save status emitted by syncLiveGame() (saves are dispatched from GameScreen)
  useEffect(() => {
    return subscribeLiveSync((status) => {
      setSaveStatus(status);
      if (status === 'saved') setLastSavedAt(Date.now());
    });
  }, []);

  // Generic broadcast helper — let consumers post arbitrary messages on the same channel
  // (e.g. break countdown updates from GameScreen).
  const broadcast = useCallback((message) => {
    if (!bcRef.current) return;
    try { bcRef.current.postMessage(message); } catch (e) { /* ignore */ }
  }, []);

  // Open the crowd-facing scoreboard in a popup window. Subsequent clicks refocus the existing window.
  const openScoreboard = useCallback(() => {
    if (scoreboardWindowRef.current && !scoreboardWindowRef.current.closed) {
      scoreboardWindowRef.current.focus();
      return;
    }
    scoreboardWindowRef.current = window.open(
      '/crowd-ui/?source=broadcast',
      'drmbl-scoreboard',
      'width=1280,height=720'
    );
  }, []);

  return (
    <GameContext.Provider value={state}>
      <GameDispatchContext.Provider value={dispatch}>
        <LiveSyncContext.Provider value={{ saveStatus, lastSavedAt, openScoreboard, broadcast }}>
          {children}
        </LiveSyncContext.Provider>
      </GameDispatchContext.Provider>
    </GameContext.Provider>
  );
}

export function getSavedGame() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    return JSON.parse(raw);
  } catch (e) { return null; }
}

export function useGame() {
  return useContext(GameContext);
}

export function useGameDispatch() {
  return useContext(GameDispatchContext);
}

export function useLiveSync() {
  return useContext(LiveSyncContext);
}
