(function () {
    // ── STATE ──
    var seasons = [];
    var selectedSeasonId = null;
    var weeksData = [];
    var selectedWeek = null;       // null = "All"
    var selectedBoxScoreId = null;
    var leagueInfo = null;

    var els = {};

    // ── UTILITIES (from live-game.js) ──

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

    // ── API CALLS ──

    function loadSeasons() {
        fetch('/api/seasons')
            .then(function (res) { return res.json(); })
            .then(function (data) {
                if (!data || !data.seasons || data.seasons.length === 0) {
                    seasons = [];
                    renderSeasonDropdown();
                    showEmpty();
                    return;
                }

                seasons = data.seasons;
                renderSeasonDropdown();

                // Auto-select first season
                selectedSeasonId = seasons[0].id;
                els.seasonSelect.value = selectedSeasonId;
                loadGameSummaries(selectedSeasonId);
            })
            .catch(function () {
                showEmpty();
            });
    }

    function loadGameSummaries(seasonId) {
        fetch('/api/box-scores?season=' + encodeURIComponent(seasonId))
            .then(function (res) { return res.json(); })
            .then(function (data) {
                if (!data || !data.weeks || data.weeks.length === 0) {
                    weeksData = [];
                    leagueInfo = null;
                    renderWeekTabs();
                    showEmpty();
                    return;
                }

                weeksData = data.weeks;
                leagueInfo = data.league;

                // Default to most recent week
                selectedWeek = weeksData[weeksData.length - 1].week;
                selectedBoxScoreId = null;

                renderWeekTabs();
                renderGameCards();
                hideDetail();
            })
            .catch(function () {
                weeksData = [];
                renderWeekTabs();
                showEmpty();
            });
    }

    function loadBoxScore(boxScoreId) {
        fetch('/api/box-scores?id=' + encodeURIComponent(boxScoreId))
            .then(function (res) { return res.json(); })
            .then(function (data) {
                if (!data || !data.boxScore) return;
                renderBoxScore(data.boxScore);
            })
            .catch(function () {});
    }

    // ── STATE HELPERS ──

    function showEmpty() {
        els.empty.classList.remove('hidden');
        els.gameList.classList.add('hidden');
        els.detail.classList.add('hidden');
    }

    function hideEmpty() {
        els.empty.classList.add('hidden');
    }

    function hideDetail() {
        els.detail.classList.add('hidden');
    }

    // ── RENDER: SEASON DROPDOWN ──

    function renderSeasonDropdown() {
        var html = '';
        if (seasons.length === 0) {
            html = '<option value="">No seasons</option>';
        } else {
            for (var i = 0; i < seasons.length; i++) {
                var s = seasons[i];
                var label = s.id;
                html += '<option value="' + s.id + '">' + label + '</option>';
            }
        }
        els.seasonSelect.innerHTML = html;
    }

    // ── RENDER: WEEK TABS ──

    function renderWeekTabs() {
        if (weeksData.length === 0) {
            els.weekTabs.innerHTML = '';
            return;
        }

        var html = '<button class="bs-week-tab' + (selectedWeek === null ? ' active' : '') + '" data-week="all">All</button>';
        for (var i = 0; i < weeksData.length; i++) {
            var w = weeksData[i];
            var label = w.type === 'playoffs' ? 'Playoffs' : ('Wk ' + w.week);
            var isActive = selectedWeek === w.week;
            html += '<button class="bs-week-tab' + (isActive ? ' active' : '') + '" data-week="' + w.week + '">' + label + '</button>';
        }
        els.weekTabs.innerHTML = html;

        // Attach click handlers
        var tabs = els.weekTabs.querySelectorAll('.bs-week-tab');
        for (var j = 0; j < tabs.length; j++) {
            tabs[j].addEventListener('click', function () {
                var val = this.getAttribute('data-week');
                selectedWeek = val === 'all' ? null : parseInt(val);
                selectedBoxScoreId = null;
                renderWeekTabs();
                renderGameCards();
                hideDetail();
            });
        }
    }

    // ── RENDER: GAME CARDS ──

    function renderGameCards() {
        var filtered = [];
        if (selectedWeek === null) {
            filtered = weeksData;
        } else {
            for (var i = 0; i < weeksData.length; i++) {
                if (weeksData[i].week === selectedWeek) {
                    filtered.push(weeksData[i]);
                }
            }
        }

        if (filtered.length === 0) {
            showEmpty();
            return;
        }

        hideEmpty();
        els.gameList.classList.remove('hidden');

        var html = '';
        for (var w = 0; w < filtered.length; w++) {
            var week = filtered[w];
            var weekLabel = week.type === 'playoffs' ? 'Playoffs' : ('Week ' + week.week);

            // Add date if available
            if (week.date) {
                var d = week.date;
                var dateStr = d.month + '/' + d.date + '/' + d.year;
                weekLabel += ' \u2014 ' + dateStr;
            }

            // Show week group header when viewing "All"
            if (selectedWeek === null) {
                html += '<div class="bs-week-group">';
                html += '<div class="bs-week-label">' + weekLabel + '</div>';
            }

            html += '<div class="bs-games-grid">';
            for (var g = 0; g < week.games.length; g++) {
                var game = week.games[g];
                var isSelected = game.boxScoreID === selectedBoxScoreId;
                var homeIsWinner = game.winner === 'home';

                html += '<div class="bs-game-card' + (isSelected ? ' selected' : '') + '" data-id="' + game.boxScoreID + '">';
                html += '<span class="bs-game-card-badge">FINAL</span>';
                html += '<div class="bs-game-card-teams">';
                html += '<span class="bs-game-card-team' + (homeIsWinner ? ' winner' : '') + '">' + game.home.name + '</span>';
                html += '<span class="bs-game-card-vs">vs</span>';
                html += '<span class="bs-game-card-team' + (!homeIsWinner ? ' winner' : '') + '">' + game.away.name + '</span>';
                html += '</div>';
                html += '<span class="bs-game-card-score">' + game.home.score + ' - ' + game.away.score + '</span>';
                html += '</div>';
            }
            html += '</div>';

            if (selectedWeek === null) {
                html += '</div>';
            }
        }

        els.gameList.innerHTML = html;

        // Attach click handlers
        var cards = els.gameList.querySelectorAll('.bs-game-card');
        for (var c = 0; c < cards.length; c++) {
            cards[c].addEventListener('click', function () {
                var id = this.getAttribute('data-id');
                selectGame(id);
            });
        }
    }

    function selectGame(boxScoreId) {
        selectedBoxScoreId = boxScoreId;

        // Update card selection
        var cards = els.gameList.querySelectorAll('.bs-game-card');
        for (var i = 0; i < cards.length; i++) {
            if (cards[i].getAttribute('data-id') === boxScoreId) {
                cards[i].classList.add('selected');
            } else {
                cards[i].classList.remove('selected');
            }
        }

        loadBoxScore(boxScoreId);
    }

    // ── RENDER: BOX SCORE DISPLAY ──

    function renderBoxScore(bs) {
        els.detail.classList.remove('hidden');

        var state = bs.gameInfo.state;
        var home = bs.teamInfo.home;
        var away = bs.teamInfo.away;

        // Scoreboard
        els.homeName.textContent = home.name;
        els.awayName.textContent = away.name;
        els.homeScore.textContent = home.score.current;
        els.awayScore.textContent = away.score.current;

        // League badge
        var league = bs.league;
        els.leagueBadge.textContent = (league && league.abbreviation) ? league.abbreviation : '';

        // Quarter label: "FINAL" with OT indicator
        var otCount = state.overtimes || 0;
        if (otCount > 1) {
            els.quarter.textContent = 'FINAL (' + otCount + 'OT)';
        } else if (otCount === 1) {
            els.quarter.textContent = 'FINAL (OT)';
        } else {
            els.quarter.textContent = 'FINAL';
        }

        renderQuarterScores(bs);
        renderTeamStats(bs);
        renderPlayerStats(bs);

        // Scroll detail into view
        els.detail.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }

    // ── QUARTER SCORES (from live-game.js) ──

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

    // ── TEAM STATS (from live-game.js) ──

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

    // ── PLAYER STATS (from live-game.js) ──

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
            seasonSelect: document.getElementById('bs-season-select'),
            weekTabs: document.getElementById('bs-week-tabs'),
            empty: document.getElementById('bs-empty'),
            gameList: document.getElementById('bs-game-list'),
            detail: document.getElementById('bs-detail'),
            homeName: document.getElementById('bs-home-name'),
            awayName: document.getElementById('bs-away-name'),
            homeScore: document.getElementById('bs-home-score'),
            awayScore: document.getElementById('bs-away-score'),
            quarter: document.getElementById('bs-quarter'),
            leagueBadge: document.getElementById('bs-league-badge'),
            quarterScores: document.getElementById('bs-quarter-scores'),
            teamStats: document.getElementById('bs-team-stats'),
            awayPlayerStats: document.getElementById('bs-away-player-stats'),
            homePlayerStats: document.getElementById('bs-home-player-stats')
        };

        // Season change handler
        els.seasonSelect.addEventListener('change', function () {
            selectedSeasonId = this.value;
            selectedWeek = null;
            selectedBoxScoreId = null;
            hideDetail();
            loadGameSummaries(selectedSeasonId);
        });

        loadSeasons();
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();
