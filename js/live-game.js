(function () {
    var POLL_INTERVAL = 3000;
    var STALE_THRESHOLD = 2 * 60 * 60 * 1000; // 2 hours

    var pollTimer = null;
    var clockTimer = null;
    var localTimeLeft = 0;
    var clockIsActive = false;
    var lastUpdatedAt = null;

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

        // Score row
        els.homeName.textContent = home.name;
        els.awayName.textContent = away.name;
        els.homeScore.textContent = home.score.current;
        els.awayScore.textContent = away.score.current;
        els.quarter.textContent = formatQuarter(state.currentQuarter);

        // Clock: only correct from server when new data arrives
        var isNewData = updatedAt !== lastUpdatedAt;
        if (isNewData) {
            localTimeLeft = state.clock.timeLeft;
            lastUpdatedAt = updatedAt;
        }
        clockIsActive = state.active;
        els.clock.textContent = formatClock(localTimeLeft);

        if (isFinal) {
            els.clock.classList.add('stopped');
            stopLocalClock();
        } else if (clockIsActive) {
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

        var html = '';
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
        var html = '';
        var sides = ['home', 'away'];

        for (var s = 0; s < sides.length; s++) {
            var side = sides[s];
            var team = bs.teamInfo[side];
            var players = team.roster.inGame
                .filter(function (p) { return p.playerID !== null; })
                .sort(function (a, b) { return b.stats.offense.points - a.stats.offense.points; });

            html += '<div class="live-section">';
            html += '<div class="live-section-title">' + team.name + ' \u2014 BOX SCORE</div>';
            html += '<div class="live-player-table-wrap">';
            html += '<table class="live-player-table">';
            html += '<thead><tr>';
            html += '<th class="ept-num">#</th>';
            html += '<th class="ept-name">PLAYER</th>';
            html += '<th>PTS</th><th>FG</th><th>FG%</th>';
            html += '<th>3PT</th><th>FT</th>';
            html += '<th>TRB</th><th>AST</th><th>STL</th><th>BLK</th>';
            html += '<th>TO</th><th>PF</th>';
            html += '</tr></thead>';
            html += '<tbody>';

            for (var i = 0; i < players.length; i++) {
                var p = players[i];
                var fg = p.stats.offense.shootingBreakdown.fieldGoals;
                var ft = p.stats.offense.shootingBreakdown.freeThrows;
                html += '<tr>';
                html += '<td class="ept-num">' + (p.number || '?') + '</td>';
                html += '<td class="ept-name">' + p.name + '</td>';
                html += '<td>' + p.stats.offense.points + '</td>';
                html += '<td>' + fg.totalMade + '/' + fg.totalAttempted + '</td>';
                html += '<td>' + fg.totalPercentage + '%</td>';
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
            header: document.getElementById('live-header'),
            headerLabel: document.getElementById('live-header-label'),
            headerSub: document.getElementById('live-header-sub'),
            homeName: document.getElementById('home-name'),
            awayName: document.getElementById('away-name'),
            homeScore: document.getElementById('home-score'),
            awayScore: document.getElementById('away-score'),
            quarter: document.getElementById('live-quarter'),
            clock: document.getElementById('live-clock'),
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
