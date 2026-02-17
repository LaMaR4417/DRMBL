(function () {
    var POLL_INTERVAL = 1000;

    var pollTimer = null;
    var clockTimer = null;

    // All active games from the latest poll
    var allGames = [];

    // Currently selected game ID (null = auto-select first)
    var selectedGameId = null;

    // Per-game local clock state, keyed by gameId
    var gameClocks = {};

    var els = {};

    function formatClock(totalSeconds) {
        if (totalSeconds < 0) totalSeconds = 0;
        var m = Math.floor(totalSeconds / 60);
        var s = totalSeconds % 60;
        return m + ':' + (s < 10 ? '0' : '') + s;
    }

    function formatQuarter(q) {
        if (q <= 4) return 'Q' + q;
        return 'OT' + (q - 4);
    }

    // ── POLLING ──

    function poll() {
        fetch('/api/live-game')
            .then(function (res) { return res.json(); })
            .then(function (data) {
                if (!data || !data.games || data.games.length === 0) {
                    allGames = [];
                    renderAllGames();
                    return;
                }

                allGames = data.games;

                // Update per-game clock state
                var activeIds = {};
                for (var i = 0; i < allGames.length; i++) {
                    var game = allGames[i];
                    var id = game.gameId;
                    activeIds[id] = true;

                    if (!gameClocks[id]) {
                        gameClocks[id] = { localTimeLeft: 0, clockIsActive: false, lastUpdatedAt: null };
                    }

                    var gc = gameClocks[id];
                    var bs = game.boxScore;
                    var isNewData = game.updatedAt !== gc.lastUpdatedAt;

                    if (isNewData) {
                        gc.localTimeLeft = bs.gameInfo.state.clock.timeLeft;
                        gc.lastUpdatedAt = game.updatedAt;
                    }
                    gc.clockIsActive = bs.gameInfo.state.active && bs.gameInfo.general.status !== 'final';
                }

                // Clean up clocks for games no longer in the response
                for (var key in gameClocks) {
                    if (!activeIds[key]) delete gameClocks[key];
                }

                renderAllGames();
            })
            .catch(function () {});
    }

    function startPolling() {
        poll();
        pollTimer = setInterval(poll, POLL_INTERVAL);
    }

    // ── LOCAL CLOCK ──

    function startLocalClock() {
        stopLocalClock();
        clockTimer = setInterval(function () {
            for (var id in gameClocks) {
                var gc = gameClocks[id];
                if (gc.clockIsActive && gc.localTimeLeft > 0) {
                    gc.localTimeLeft -= 1;
                }
            }
            // Update the displayed clock for the selected game
            var activeId = selectedGameId || (allGames.length > 0 ? allGames[0].gameId : null);
            if (activeId) {
                var selGc = gameClocks[activeId];
                if (selGc && els.clock) {
                    els.clock.textContent = formatClock(selGc.localTimeLeft);
                }
            }
        }, 1000);
    }

    function stopLocalClock() {
        if (clockTimer) {
            clearInterval(clockTimer);
            clockTimer = null;
        }
    }

    // ── STATE SWITCHING ──

    function showNoGame() {
        els.noGame.classList.remove('hidden');
        els.liveGame.classList.add('hidden');
        els.gameSelector.classList.add('hidden');
        els.lastUpdated.classList.add('hidden');
        stopLocalClock();
    }

    // ── RENDER ──

    function selectGame(gameId) {
        selectedGameId = gameId;
        renderAllGames();
    }

    function pickBestGame() {
        // Priority: live (clock running) > stopped (in-progress but paused) > final
        var live = null, stopped = null;
        for (var i = 0; i < allGames.length; i++) {
            var bs = allGames[i].boxScore;
            var isFinal = bs.gameInfo.general.status === 'final';
            var isActive = bs.gameInfo.state.active;
            if (!isFinal && isActive && !live) live = allGames[i].gameId;
            if (!isFinal && !isActive && !stopped) stopped = allGames[i].gameId;
        }
        return live || stopped || allGames[0].gameId;
    }

    function renderGameSelector() {
        if (allGames.length <= 1) {
            els.gameSelector.classList.add('hidden');
            return;
        }

        els.gameSelector.classList.remove('hidden');
        var activeId = selectedGameId || allGames[0].gameId;

        var html = '';
        for (var i = 0; i < allGames.length; i++) {
            var g = allGames[i];
            var bs = g.boxScore;
            var home = bs.teamInfo.home;
            var away = bs.teamInfo.away;
            var isFinal = bs.gameInfo.general.status === 'final';
            var isActive = bs.gameInfo.state.active;
            var isSelected = g.gameId === activeId;

            var statusClass = isFinal ? 'final' : (isActive ? 'live' : 'stopped');

            var league = bs.league;
            html += '<button class="game-card' + (isSelected ? ' selected' : '') + '" data-game-id="' + g.gameId + '">';
            html += '<span class="game-card-status ' + statusClass + '">' + (isFinal ? 'FINAL' : (isActive ? 'LIVE' : 'STOPPED')) + '</span>';
            if (league && league.abbreviation) {
                html += '<span class="game-card-league">' + league.abbreviation + '</span>';
            }
            html += '<span class="game-card-teams">' + home.name + ' vs ' + away.name + '</span>';
            html += '<span class="game-card-score">' + home.score.current + ' - ' + away.score.current + '</span>';
            html += '</button>';
        }

        els.gameSelector.innerHTML = html;

        // Attach click handlers
        var cards = els.gameSelector.querySelectorAll('.game-card');
        for (var j = 0; j < cards.length; j++) {
            cards[j].addEventListener('click', function () {
                selectGame(this.getAttribute('data-game-id'));
            });
        }
    }

    function renderAllGames() {
        if (allGames.length === 0) {
            showNoGame();
            els.gameSelector.classList.add('hidden');
            stopLocalClock();
            return;
        }

        // If the selected game is no longer in the list, pick the best default
        var found = false;
        for (var i = 0; i < allGames.length; i++) {
            if (allGames[i].gameId === selectedGameId) { found = true; break; }
        }
        if (!found) selectedGameId = pickBestGame();

        renderGameSelector();

        // Find the selected game and render it
        var game = null;
        for (var k = 0; k < allGames.length; k++) {
            if (allGames[k].gameId === selectedGameId) { game = allGames[k]; break; }
        }
        if (!game) game = allGames[0];

        var gc = gameClocks[game.gameId] || { localTimeLeft: 0, clockIsActive: false };
        renderGame(game.boxScore, game.updatedAt, gc);
    }

    function renderGame(bs, updatedAt, gc) {
        els.noGame.classList.add('hidden');
        els.liveGame.classList.remove('hidden');
        els.lastUpdated.classList.remove('hidden');

        var state = bs.gameInfo.state;
        var general = bs.gameInfo.general;
        var home = bs.teamInfo.home;
        var away = bs.teamInfo.away;

        // Status header banner
        var isFinal = general.status === 'final';
        if (isFinal) {
            els.header.className = 'live-header final';
            els.headerLabel.textContent = 'FINAL';
            var otCount = state.overtimes || 0;
            els.headerSub.textContent = otCount > 0 ? (otCount > 1 ? '(' + otCount + 'OT)' : '(OT)') : '';
        } else if (state.active) {
            els.header.className = 'live-header in-progress';
            els.headerLabel.textContent = 'LIVE';
            els.headerSub.textContent = formatQuarter(state.currentQuarter);
        } else {
            els.header.className = 'live-header clock-stopped';
            els.headerLabel.textContent = 'CLOCK STOPPED';
            els.headerSub.textContent = formatQuarter(state.currentQuarter);
        }

        // League badge (centered between team names)
        var league = bs.league;
        els.leagueBadge.textContent = (league && league.abbreviation) ? league.abbreviation : '';

        // Score row
        els.homeName.textContent = home.name;
        els.awayName.textContent = away.name;
        els.homeScore.textContent = home.score.current;
        els.awayScore.textContent = away.score.current;
        els.quarter.textContent = formatQuarter(state.currentQuarter);

        // Clock: use per-game clock state
        els.clock.textContent = formatClock(gc.localTimeLeft);

        if (isFinal) {
            els.clock.classList.add('stopped');
            stopLocalClock();
        } else if (gc.clockIsActive) {
            els.clock.classList.remove('stopped');
            startLocalClock();
        } else {
            els.clock.classList.add('stopped');
            stopLocalClock();
        }

        renderQuarterScores(bs);
        renderTeamStats(bs);
        renderPlayerStats(bs);

        // Last updated
        if (updatedAt) {
            var ago = Math.round((Date.now() - new Date(updatedAt).getTime()) / 1000);
            if (ago < 10) {
                els.lastUpdated.textContent = 'Live';
                els.lastUpdated.className = 'live-last-updated live-indicator';
            } else {
                els.lastUpdated.textContent = 'Updated ' + ago + 's ago';
                els.lastUpdated.className = 'live-last-updated';
            }
        }
    }

    // ── QUARTER SCORES (flex-based, matching endgame) ──

    function renderQuarterScores(bs) {
        var state = bs.gameInfo.state;
        var periods = ['first', 'second', 'third', 'fourth'];
        var labels = ['Q1', 'Q2', 'Q3', 'Q4'];
        var otCount = state.overtimes || 0;
        for (var i = 1; i <= otCount; i++) {
            periods.push('OT' + i);
            labels.push('OT' + i);
        }

        var html = '<div class="eq-row eq-header"><span class="eq-team-col"></span>';
        for (var j = 0; j < labels.length; j++) {
            html += '<span class="eq-cell">' + labels[j] + '</span>';
        }
        html += '<span class="eq-cell eq-total">T</span></div>';

        var sides = ['home', 'away'];
        for (var s = 0; s < sides.length; s++) {
            var side = sides[s];
            var team = bs.teamInfo[side];
            html += '<div class="eq-row"><span class="eq-team-col">' + team.name + '</span>';
            for (var k = 0; k < periods.length; k++) {
                var p = periods[k];
                var val = 0;
                if (p === 'first' || p === 'second' || p === 'third' || p === 'fourth') {
                    val = team.score.perQuarter[p] || 0;
                } else {
                    val = (team.score.perQuarter.overtime && team.score.perQuarter.overtime[p]) || 0;
                }
                html += '<span class="eq-cell">' + val + '</span>';
            }
            html += '<span class="eq-cell eq-total">' + team.score.current + '</span>';
            html += '</div>';
        }

        els.quarterScores.innerHTML = html;
    }

    // ── TEAM STATS (grid-based, matching endgame) ──

    function renderTeamStats(bs) {
        var home = bs.teamInfo.home.stats;
        var away = bs.teamInfo.away.stats;

        var rows = [
            { label: 'FG', home: home.shootingBreakdown.fieldGoals.totalMade + '/' + home.shootingBreakdown.fieldGoals.totalAttempted, away: away.shootingBreakdown.fieldGoals.totalMade + '/' + away.shootingBreakdown.fieldGoals.totalAttempted },
            { label: 'FG%', home: home.shootingBreakdown.fieldGoals.totalPercentage + '%', away: away.shootingBreakdown.fieldGoals.totalPercentage + '%' },
            { label: '2PT', home: home.shootingBreakdown.fieldGoals['2-PointShots'].made + '/' + home.shootingBreakdown.fieldGoals['2-PointShots'].attempted, away: away.shootingBreakdown.fieldGoals['2-PointShots'].made + '/' + away.shootingBreakdown.fieldGoals['2-PointShots'].attempted },
            { label: '2P%', home: home.shootingBreakdown.fieldGoals['2-PointShots'].percentage + '%', away: away.shootingBreakdown.fieldGoals['2-PointShots'].percentage + '%' },
            { label: '3PT', home: home.shootingBreakdown.fieldGoals['3-PointShots'].made + '/' + home.shootingBreakdown.fieldGoals['3-PointShots'].attempted, away: away.shootingBreakdown.fieldGoals['3-PointShots'].made + '/' + away.shootingBreakdown.fieldGoals['3-PointShots'].attempted },
            { label: '3P%', home: home.shootingBreakdown.fieldGoals['3-PointShots'].percentage + '%', away: away.shootingBreakdown.fieldGoals['3-PointShots'].percentage + '%' },
            { label: 'FT', home: home.shootingBreakdown.freeThrows.made + '/' + home.shootingBreakdown.freeThrows.attempted, away: away.shootingBreakdown.freeThrows.made + '/' + away.shootingBreakdown.freeThrows.attempted },
            { label: 'FT%', home: home.shootingBreakdown.freeThrows.percentage + '%', away: away.shootingBreakdown.freeThrows.percentage + '%' },
            { label: 'TRB', home: home.rebounds.total, away: away.rebounds.total },
            { label: 'DRB', home: home.rebounds.defensive, away: away.rebounds.defensive },
            { label: 'ORB', home: home.rebounds.offensive, away: away.rebounds.offensive },
            { label: 'AST', home: home.assists, away: away.assists },
            { label: 'STL', home: home.defense.steals, away: away.defense.steals },
            { label: 'BLK', home: home.defense.blocks, away: away.defense.blocks },
            { label: 'TO', home: home.turnovers, away: away.turnovers },
            { label: 'FOULS', home: home.fouls.total, away: away.fouls.total }
        ];

        var html = '<div class="ets-row ets-header">';
        html += '<span class="ets-val home ets-team-name">' + bs.teamInfo.home.name + '</span>';
        html += '<span class="ets-label"></span>';
        html += '<span class="ets-val away ets-team-name">' + bs.teamInfo.away.name + '</span>';
        html += '</div>';
        for (var i = 0; i < rows.length; i++) {
            html += '<div class="ets-row">';
            html += '<span class="ets-val home">' + rows[i].home + '</span>';
            html += '<span class="ets-label">' + rows[i].label + '</span>';
            html += '<span class="ets-val away">' + rows[i].away + '</span>';
            html += '</div>';
        }
        els.teamStats.innerHTML = html;
    }

    // ── PLAYER STATS (matching endgame-player-table) ──

    function renderPlayerStats(bs) {
        renderPlayerStatsForSide(bs, 'away', els.awayPlayerStats);
        renderPlayerStatsForSide(bs, 'home', els.homePlayerStats);
    }

    function renderPlayerStatsForSide(bs, side, container) {
        var team = bs.teamInfo[side];
        var players = team.roster.inGame
            .filter(function (p) { return p.playerID !== null; })
            .sort(function (a, b) { return b.stats.offense.points - a.stats.offense.points; });

        var html = '<div class="live-section-title">' + team.name + ' \u2014 BOX SCORE</div>';
        html += '<div class="live-player-table-wrap">';
        html += '<table class="live-player-table">';
        html += '<thead><tr>';
        html += '<th class="ept-num">#</th>';
        html += '<th class="ept-name">PLAYER</th>';
        html += '<th>MIN</th>';
        html += '<th>PTS</th><th>FG</th><th>FG%</th>';
        html += '<th>2PT</th><th>2P%</th>';
        html += '<th>3PT</th><th>3P%</th>';
        html += '<th>FT</th><th>FT%</th>';
        html += '<th>TRB</th><th>DRB</th><th>ORB</th>';
        html += '<th>AST</th><th>STL</th><th>BLK</th>';
        html += '<th>TO</th><th>PF</th>';
        html += '<th>+/-</th><th>EFF</th>';
        html += '</tr></thead>';
        html += '<tbody>';

        for (var i = 0; i < players.length; i++) {
            var p = players[i];
            var fg = p.stats.offense.shootingBreakdown.fieldGoals;
            var ft = p.stats.offense.shootingBreakdown.freeThrows;
            var pm = p.stats.general.plusMinus;
            var eff = p.stats.offense.points + p.stats.rebounds.total + p.stats.offense.assists
                + p.stats.defense.steals + p.stats.defense.blocks - p.stats.general.turnovers
                - (fg.totalAttempted - fg.totalMade) - (ft.attempted - ft.made);
            html += '<tr>';
            html += '<td class="ept-num">' + (p.number || '?') + '</td>';
            html += '<td class="ept-name">' + p.name + '</td>';
            html += '<td>' + formatClock(p.stats.general.minutesPlayed) + '</td>';
            html += '<td>' + p.stats.offense.points + '</td>';
            html += '<td>' + fg.totalMade + '/' + fg.totalAttempted + '</td>';
            html += '<td>' + fg.totalPercentage + '%</td>';
            html += '<td>' + fg['2-PointShots'].made + '/' + fg['2-PointShots'].attempted + '</td>';
            html += '<td>' + fg['2-PointShots'].percentage + '%</td>';
            html += '<td>' + fg['3-PointShots'].made + '/' + fg['3-PointShots'].attempted + '</td>';
            html += '<td>' + fg['3-PointShots'].percentage + '%</td>';
            html += '<td>' + ft.made + '/' + ft.attempted + '</td>';
            html += '<td>' + ft.percentage + '%</td>';
            html += '<td>' + p.stats.rebounds.total + '</td>';
            html += '<td>' + p.stats.rebounds.defensive + '</td>';
            html += '<td>' + p.stats.rebounds.offensive + '</td>';
            html += '<td>' + p.stats.offense.assists + '</td>';
            html += '<td>' + p.stats.defense.steals + '</td>';
            html += '<td>' + p.stats.defense.blocks + '</td>';
            html += '<td>' + p.stats.general.turnovers + '</td>';
            html += '<td>' + p.stats.general.fouls.personal.total + '</td>';
            html += '<td>' + (pm >= 0 ? '+' : '') + pm + '</td>';
            html += '<td>' + eff + '</td>';
            html += '</tr>';
        }

        html += '</tbody></table>';
        html += '</div>';

        container.innerHTML = html;
    }

    // ── INIT ──

    function init() {
        els = {
            noGame: document.getElementById('no-game'),
            liveGame: document.getElementById('live-game'),
            gameSelector: document.getElementById('game-selector'),
            header: document.getElementById('live-header'),
            headerLabel: document.getElementById('live-header-label'),
            headerSub: document.getElementById('live-header-sub'),
            leagueBadge: document.getElementById('live-league-badge'),
            homeName: document.getElementById('home-name'),
            awayName: document.getElementById('away-name'),
            homeScore: document.getElementById('home-score'),
            awayScore: document.getElementById('away-score'),
            quarter: document.getElementById('live-quarter'),
            clock: document.getElementById('live-clock'),
            quarterScores: document.getElementById('quarter-scores'),
            teamStats: document.getElementById('team-stats'),
            awayPlayerStats: document.getElementById('away-player-stats'),
            homePlayerStats: document.getElementById('home-player-stats'),
            lastUpdated: document.getElementById('last-updated')
        };
        startPolling();
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();
