// Builds an initialized Box Score JSON from pre-game setup data

export function buildEmptyPlayerStats() {
  return {
    offense: {
      points: 0,
      assists: 0,
      shootingBreakdown: {
        fieldGoals: {
          totalAttempted: 0,
          totalMade: 0,
          totalMissed: 0,
          totalPercentage: 0,
          '2-PointShots': { attempted: 0, made: 0, missed: 0, percentage: 0 },
          '3-PointShots': { attempted: 0, made: 0, missed: 0, percentage: 0 },
        },
        freeThrows: { attempted: 0, made: 0, missed: 0, percentage: 0 },
      },
    },
    defense: { steals: 0, blocks: 0 },
    rebounds: { total: 0, defensive: 0, offensive: 0 },
    general: {
      minutesPlayed: 0,
      turnovers: 0,
      fouls: {
        personal: { total: 0, offensive: 0 },
        technical: 0,
        flagrant: 0,
      },
      plusMinus: 0,
    },
  };
}

function buildTeamStats(settings) {
  const fullTO = settings.timeouts?.regulation?.full ?? 3;
  const shortTO = settings.timeouts?.regulation?.short ?? 2;

  return {
    shootingBreakdown: {
      fieldGoals: {
        totalAttempted: 0,
        totalMade: 0,
        totalMissed: 0,
        totalPercentage: 0,
        '2-PointShots': { attempted: 0, made: 0, missed: 0, percentage: 0 },
        '3-PointShots': { attempted: 0, made: 0, missed: 0, percentage: 0 },
      },
      freeThrows: { attempted: 0, made: 0, missed: 0, percentage: 0 },
    },
    assists: 0,
    defense: { steals: 0, blocks: 0 },
    rebounds: { total: 0, offensive: 0, defensive: 0 },
    turnovers: 0,
    fouls: {
      total: 0,
      perQuarter: {
        first: { committed: 0, opponentInBonus: false },
        second: { committed: 0, opponentInBonus: false },
        third: { committed: 0, opponentInBonus: false },
        fourth: { committed: 0, opponentInBonus: false },
        overtime: {},
      },
    },
    timeouts: {
      total: { full: fullTO, short: shortTO },
      used: { full: 0, short: 0 },
      remaining: { full: fullTO, short: shortTO },
    },
  };
}

function buildTeamSide(team, attendance, numberOverrides, starters, captainID, settings) {
  // Full roster (everyone on the team)
  const full = team.roster.map((p) => ({
    playerID: p.playerID,
    name: p.name,
    number: numberOverrides[p.playerID] ?? null,
    position: null,
  }));

  // In-game roster (only players who checked in, up to 12)
  const minutesPerPeriod = settings.periods?.minutesPerPeriod ?? 10;
  const initialTimeLeft = minutesPerPeriod * 60;
  const attendees = team.roster.filter((p) => attendance.has(p.playerID));
  const inGame = attendees.map((p) => ({
    playerID: p.playerID,
    name: p.name,
    number: numberOverrides[p.playerID] ?? null,
    starter: starters.has(p.playerID),
    onCourt: starters.has(p.playerID),
    captain: p.playerID === captainID,
    position: null,
    stats: buildEmptyPlayerStats(),
    _clockTimeAtEntry: starters.has(p.playerID) ? initialTimeLeft : null,
  }));

  // Pad to 12 slots if needed
  while (inGame.length < 12) {
    inGame.push({
      playerID: null,
      name: '',
      number: null,
      starter: false,
      onCourt: false,
      position: null,
      stats: buildEmptyPlayerStats(),
      _clockTimeAtEntry: null,
    });
  }

  const minutesPerOT = settings.periods?.minutesPerOvertime ?? 5;

  return {
    name: team.name,
    score: {
      current: 0,
      perQuarter: {
        first: 0,
        second: 0,
        third: 0,
        fourth: 0,
        overtime: {},
      },
    },
    stats: buildTeamStats(settings),
    roster: { full, inGame },
    _minutesPerPeriod: minutesPerPeriod,
    _minutesPerOT: minutesPerOT,
  };
}

export function buildBoxScore(gameState) {
  const now = new Date();
  const timestamp = now.toISOString();
  const homeName = gameState.homeTeam.name;
  const awayName = gameState.awayTeam.name;

  const minutesPerPeriod = gameState.settings.periods?.minutesPerPeriod ?? 10;
  const minutesPerOT = gameState.settings.periods?.minutesPerOvertime ?? 5;

  return {
    id: `${homeName} vs. ${awayName} - ${timestamp}`,
    gameInfo: {
      general: {
        timestamp,
        date: now.toLocaleDateString(),
        time: now.toLocaleTimeString(),
        location: null,
        status: 'in-progress',
      },
      state: {
        active: true,
        currentQuarter: 1,
        clock: {
          timeLeft: minutesPerPeriod * 60,
          perQuarter: minutesPerPeriod,
          perOT: minutesPerOT,
        },
        winner: null,
        loser: null,
        overtimes: 0,
        possession: gameState.firstPossession,
        possessionArrow: gameState.firstPossession === 'home' ? 'away' : 'home',
      },
    },
    teamInfo: {
      home: buildTeamSide(
        gameState.homeTeam,
        gameState.homeAttendance,
        gameState.homeNumberOverrides,
        gameState.homeStarters,
        gameState.homeCaptain,
        gameState.settings,
      ),
      away: buildTeamSide(
        gameState.awayTeam,
        gameState.awayAttendance,
        gameState.awayNumberOverrides,
        gameState.awayStarters,
        gameState.awayCaptain,
        gameState.settings,
      ),
    },
    tipOffWinner: gameState.tipOffWinner,
  };
}
