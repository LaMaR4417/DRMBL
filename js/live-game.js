(function () {
    var POLL_INTERVAL = 3000;
    var STALE_THRESHOLD = 2 * 60 * 60 * 1000; // 2 hours

    var pollTimer = null;
    var clockTimer = null;
    var localTimeLeft = 0;
    var clockIsActive = false;

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
                if (!data || data.active === false || !data.boxScore) {
                    showNoGame();
                    return;
                }

                // Stale final game check (> 2 hours old + status final)
                var bs = data.boxScore;
                if (bs.gameInfo.general.status === 'final' && data.updatedAt) {
                    var age = Date.now() - new Date(data.updatedAt).getTime();
                    if (age > STALE_THRESHOLD) {
                        showNoGame();
                        return;
                    }
                }

                renderGame(bs, data.updatedAt);
            })
            .catch(function () {
                // Network error — keep showing whatever we had
            });
    }

    function startPolling() {
        poll();
        pollTimer = setInterval(poll, POLL_INTERVAL);
    }

    // ── LOCAL CLOCK ──

    function startLocalClock() {
        stopLocalClock();
        clockTimer = setInterval(function () {
            if (!clockIsActive || localTimeLeft <= 0) return;
            localTimeLeft -= 1;
            els.clock.textContent = formatClock(localTimeLeft);
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
        els.lastUpdated.classList.add('hidden');
        stopLocalClock();
    }

    // ── RENDER ──

    function renderGame(bs, updatedAt) {
        els.noGame.classList.add('hidden');
        els.liveGame.classList.remove('hidden');
        els.lastUpdated.classList.remove('hidden');

        var state = bs.gameInfo.state;
        var general = bs.gameInfo.general;
        var home = bs.teamInfo.home;
        var away = bs.teamInfo.away;

        // Scoreboard
        els.homeName.textContent = home.name;
        els.awayName.textContent = away.name;
        els.homeScore.textContent = home.score.current;
        els.awayScore.textContent = away.score.current;
        els.quarter.textContent = formatQuarter(state.currentQuarter);

        // Clock
        localTimeLeft = state.clock.timeLeft;
        clockIsActive = state.active;
        els.clock.textContent = formatClock(localTimeLeft);

        if (clockIsActive) {
            els.clock.classList.remove('stopped');
            startLocalClock();
        } else {
            els.clock.classList.add('stopped');
            stopLocalClock();
        }

        // Status
        if (general.status === 'final') {
            els.status.textContent = 'FINAL';
            els.status.className = 'live-status final';
            els.clock.classList.add('stopped');
            stopLocalClock();
        } else if (state.active) {
            els.status.textContent = '';
            els.status.className = 'live-status';
        } else {
            els.status.textContent = 'CLOCK STOPPED';
            els.status.className = 'live-status stopped';
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

    function renderQuarterScores(bs) {
        var state = bs.gameInfo.state;
        var periods = ['first', 'second', 'third', 'fourth'];
        var labels = ['Q1', 'Q2', 'Q3', 'Q4'];
        var otCount = state.overtimes || 0;
        for (var i = 1; i <= otCount; i++) {
            periods.push('OT' + i);
            labels.push('OT' + i);
        }

        var html = '<table class="live-quarter-table">';
        html += '<thead><tr><th></th>';
        for (var j = 0; j < labels.length; j++) {
            html += '<th>' + labels[j] + '</th>';
        }
        html += '<th class="total">T</th></tr></thead>';
        html += '<tbody>';

        var sides = ['home', 'away'];
        for (var s = 0; s < sides.length; s++) {
            var side = sides[s];
            var team = bs.teamInfo[side];
            html += '<tr><td class="team-col">' + team.name + '</td>';
            for (var k = 0; k < periods.length; k++) {
                var p = periods[k];
                var val = 0;
                if (p === 'first' || p === 'second' || p === 'third' || p === 'fourth') {
                    val = team.score.perQuarter[p] || 0;
                } else {
                    val = (team.score.perQuarter.overtime && team.score.perQuarter.overtime[p]) || 0;
                }
                html += '<td>' + val + '</td>';
            }
            html += '<td class="total">' + team.score.current + '</td>';
            html += '</tr>';
        }

        html += '</tbody></table>';
        els.quarterScores.innerHTML = html;
    }

    function renderTeamStats(bs) {
        var home = bs.teamInfo.home.stats;
        var away = bs.teamInfo.away.stats;

        var rows = [
            { label: 'FG%', home: home.shootingBreakdown.fieldGoals.totalPercentage + '%', away: away.shootingBreakdown.fieldGoals.totalPercentage + '%' },
            { label: 'FG', home: home.shootingBreakdown.fieldGoals.totalMade + '/' + home.shootingBreakdown.fieldGoals.totalAttempted, away: away.shootingBreakdown.fieldGoals.totalMade + '/' + away.shootingBreakdown.fieldGoals.totalAttempted },
            { label: '3PT', home: home.shootingBreakdown.fieldGoals['3-PointShots'].made + '/' + home.shootingBreakdown.fieldGoals['3-PointShots'].attempted, away: away.shootingBreakdown.fieldGoals['3-PointShots'].made + '/' + away.shootingBreakdown.fieldGoals['3-PointShots'].attempted },
            { label: 'FT', home: home.shootingBreakdown.freeThrows.made + '/' + home.shootingBreakdown.freeThrows.attempted, away: away.shootingBreakdown.freeThrows.made + '/' + away.shootingBreakdown.freeThrows.attempted },
            { label: 'REB', home: home.rebounds.total, away: away.rebounds.total },
            { label: 'AST', home: home.assists, away: away.assists },
            { label: 'STL', home: home.defense.steals, away: away.defense.steals },
            { label: 'BLK', home: home.defense.blocks, away: away.defense.blocks },
            { label: 'TO', home: home.turnovers, away: away.turnovers },
            { label: 'FOULS', home: home.fouls.total, away: away.fouls.total }
        ];

        var html = '<div class="live-stats-title">TEAM STATS</div>';
        html += '<div class="live-stats-grid">';
        for (var i = 0; i < rows.length; i++) {
            html += '<div class="live-stat-row">';
            html += '<span class="stat-home">' + rows[i].home + '</span>';
            html += '<span class="stat-label">' + rows[i].label + '</span>';
            html += '<span class="stat-away">' + rows[i].away + '</span>';
            html += '</div>';
        }
        html += '</div>';
        els.teamStats.innerHTML = html;
    }

    function renderPlayerStats(bs) {
        var html = '';
        var sides = ['home', 'away'];

        for (var s = 0; s < sides.length; s++) {
            var side = sides[s];
            var team = bs.teamInfo[side];
            var players = team.roster.inGame
                .filter(function (p) { return p.playerID !== null; })
                .sort(function (a, b) { return b.stats.offense.points - a.stats.offense.points; });

            html += '<div class="live-player-section">';
            html += '<div class="live-player-title">' + team.name + '</div>';
            html += '<div class="live-player-table-wrap">';
            html += '<table class="live-player-table">';
            html += '<thead><tr>';
            html += '<th class="col-num">#</th>';
            html += '<th class="col-name">PLAYER</th>';
            html += '<th>PTS</th><th>FG</th><th>3PT</th><th>FT</th>';
            html += '<th>REB</th><th>AST</th><th>STL</th><th>BLK</th>';
            html += '<th>TO</th><th>PF</th>';
            html += '</tr></thead>';
            html += '<tbody>';

            for (var i = 0; i < players.length; i++) {
                var p = players[i];
                var fg = p.stats.offense.shootingBreakdown.fieldGoals;
                var ft = p.stats.offense.shootingBreakdown.freeThrows;
                html += '<tr>';
                html += '<td class="col-num">' + (p.number || '?') + '</td>';
                html += '<td class="col-name">' + p.name + '</td>';
                html += '<td>' + p.stats.offense.points + '</td>';
                html += '<td>' + fg.totalMade + '/' + fg.totalAttempted + '</td>';
                html += '<td>' + fg['3-PointShots'].made + '/' + fg['3-PointShots'].attempted + '</td>';
                html += '<td>' + ft.made + '/' + ft.attempted + '</td>';
                html += '<td>' + p.stats.rebounds.total + '</td>';
                html += '<td>' + p.stats.offense.assists + '</td>';
                html += '<td>' + p.stats.defense.steals + '</td>';
                html += '<td>' + p.stats.defense.blocks + '</td>';
                html += '<td>' + p.stats.general.turnovers + '</td>';
                html += '<td>' + p.stats.general.fouls.personal.total + '</td>';
                html += '</tr>';
            }

            html += '</tbody></table>';
            html += '</div></div>';
        }

        els.playerStats.innerHTML = html;
    }

    // ── INIT ──

    function init() {
        els = {
            noGame: document.getElementById('no-game'),
            liveGame: document.getElementById('live-game'),
            homeName: document.getElementById('home-name'),
            awayName: document.getElementById('away-name'),
            homeScore: document.getElementById('home-score'),
            awayScore: document.getElementById('away-score'),
            quarter: document.getElementById('live-quarter'),
            clock: document.getElementById('live-clock'),
            status: document.getElementById('live-status'),
            quarterScores: document.getElementById('quarter-scores'),
            teamStats: document.getElementById('team-stats'),
            playerStats: document.getElementById('player-stats'),
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
