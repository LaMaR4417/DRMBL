import { createContext, useContext, useReducer } from 'react';
import { buildBoxScore, buildEmptyPlayerStats } from '../data/boxScore';

const GameContext = createContext(null);
const GameDispatchContext = createContext(null);

const initialState = {
  // Pre-game setup step tracking
  setupStep: 0, // 0=home, 1=settings, 2=teams, 3=attendance, 4=numbers, 5=starters, 6=tipoff

  // Game settings (loaded from API at step 1, null until then)
  settings: null,

  // Team selections — set during team pick, roster loaded async from API
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

    case 'RESET_GAME':
      return { ...initialState };

    default:
      return state;
  }
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
  const [state, dispatch] = useReducer(gameReducer, initialState);
  return (
    <GameContext.Provider value={state}>
      <GameDispatchContext.Provider value={dispatch}>
        {children}
      </GameDispatchContext.Provider>
    </GameContext.Provider>
  );
}

export function useGame() {
  return useContext(GameContext);
}

export function useGameDispatch() {
  return useContext(GameDispatchContext);
}
