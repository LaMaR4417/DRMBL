// Player profile page: takes ?id=<playerID>, fetches the active DRMBL season's
// Season Stats doc, finds this player, renders profile + per-game averages,
// season totals, shooting splits, and a game log (all sourced from the doc).

(function () {
    'use strict';

    // Minimum games-played for a player to count as "qualified" in the stats race.
    // Scales with season progress: floor(maxTeamGames / 2) + 1. Keep formula in sync
    // with stats.js. Set when the stats doc loads.
    var minGamesQualified = 1;

    function computeMinGames(doc) {
        var teams = (doc && doc.teams) || [];
        var max = 0;
        for (var i = 0; i < teams.length; i++) {
            if ((teams[i].gamesPlayed || 0) > max) max = teams[i].gamesPlayed;
        }
        return Math.max(1, Math.floor(max / 2) + 1);
    }

    function getParam(name) {
        var p = new URLSearchParams(window.location.search);
        return p.get(name);
    }
    function fmt1(v) { return (v == null || isNaN(v)) ? '--' : (Math.round(v * 10) / 10).toString(); }
    function fmtInt(v) { return (v == null || isNaN(v)) ? '--' : Math.round(v).toString(); }
    function fmtPct(v) { return (v == null || isNaN(v)) ? '--' : Math.round(v) + '%'; }
    function fmtMin(seconds) { if (!seconds) return '0'; return Math.round(seconds / 60).toString(); }
    function escapeHtml(s) {
        return String(s == null ? '' : s)
            .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
    }

    var playerId = getParam('id');
    var loadingEl = document.getElementById('player-loading');
    var errorEl = document.getElementById('player-error');
    var contentEl = document.getElementById('player-content');

    if (!playerId) {
        loadingEl.classList.add('hidden');
        errorEl.classList.remove('hidden');
        errorEl.textContent = 'Missing player id. Use ?id=<playerID> in the URL.';
        return;
    }

    function showError(msg) {
        loadingEl.classList.add('hidden');
        contentEl.classList.add('hidden');
        errorEl.classList.remove('hidden');
        errorEl.textContent = msg;
    }

    fetch('/api/stats?league=drmbl')
        .then(function (r) { return r.ok ? r.json() : Promise.reject(new Error('Stats fetch failed (' + r.status + ')')); })
        .then(function (resp) {
            var stats = resp.stats;
            minGamesQualified = computeMinGames(stats);
            var entry = (stats.players || []).find(function (p) { return p.playerID === playerId; });
            if (!entry) {
                showError('No stats found for player: ' + playerId + '. They may not have appeared in any tracked games yet.');
                return;
            }
            renderHeader(entry);
            renderAverages(entry);
            renderTotals(entry);
            renderSplits(entry);
            renderGameLog(entry);
            loadingEl.classList.add('hidden');
            contentEl.classList.remove('hidden');
        })
        .catch(function (e) {
            showError('Failed to load profile: ' + e.message);
        });

    function renderHeader(entry) {
        var qualified = (entry.gamesPlayed || 0) >= minGamesQualified;
        document.getElementById('player-jersey').textContent = '';
        document.getElementById('player-name').textContent = (entry.name || playerId) + (qualified ? '' : '*');
        document.getElementById('player-team').textContent = entry.teamName || '';
        document.getElementById('player-gp').textContent = entry.gamesPlayed != null ? entry.gamesPlayed : '--';
        var bio = document.getElementById('player-bio');
        if (!qualified) {
            bio.innerHTML = '<span class="not-qualified-note">* Not yet qualified for stat leaders (needs ' + minGamesQualified + ' games).</span>';
        } else {
            bio.innerHTML = '';
        }
    }

    var AVG_STATS = [
        { key: 'ppg', label: 'PTS' },
        { key: 'rpg', label: 'REB' },
        { key: 'apg', label: 'AST' },
        { key: 'spg', label: 'STL' },
        { key: 'bpg', label: 'BLK' },
        { key: 'topg', label: 'TO' },
        { key: 'mpg', label: 'MIN' },
    ];

    function renderAverages(entry) {
        var avgs = entry.averages || {};
        var html = '';
        for (var i = 0; i < AVG_STATS.length; i++) {
            var s = AVG_STATS[i];
            html += '<div class="stat-cell"><span class="stat-label">' + s.label + '</span><span class="stat-value">' + fmt1(avgs[s.key]) + '</span></div>';
        }
        document.getElementById('player-avg-grid').innerHTML = html;
    }

    function renderTotals(entry) {
        var t = entry.totals || {};
        var cells = [
            { label: 'PTS',   value: fmtInt(t.points) },
            { label: 'REB',   value: fmtInt(t.rebounds && t.rebounds.total) },
            { label: 'AST',   value: fmtInt(t.assists) },
            { label: 'STL',   value: fmtInt(t.steals) },
            { label: 'BLK',   value: fmtInt(t.blocks) },
            { label: 'TO',    value: fmtInt(t.turnovers) },
            { label: 'MIN',   value: fmtMin(t.minutesPlayed) },
            { label: 'FOULS', value: fmtInt(t.fouls && t.fouls.personal) },
        ];
        var html = '';
        for (var i = 0; i < cells.length; i++) {
            html += '<div class="stat-cell"><span class="stat-label">' + cells[i].label + '</span><span class="stat-value">' + cells[i].value + '</span></div>';
        }
        document.getElementById('player-tot-grid').innerHTML = html;
    }

    function renderSplits(entry) {
        var t = entry.totals || {};
        var fg = t.fieldGoals || {};
        var fg2 = fg.twoPoint || {};
        var fg3 = fg.threePoint || {};
        var ft = t.freeThrows || {};
        function row(label, made, att) {
            var p = att ? Math.round((made / att) * 100) : null;
            return '<div class="split-row">'
                + '<span class="split-label">' + label + '</span>'
                + '<span class="split-pct">' + fmtPct(p) + '</span>'
                + '<span class="split-frac">' + (made || 0) + '/' + (att || 0) + '</span>'
                + '</div>';
        }
        document.getElementById('player-splits-grid').innerHTML =
            row('FG', fg.totalMade, fg.totalAttempted) +
            row('2P', fg2.made, fg2.attempted) +
            row('3P', fg3.made, fg3.attempted) +
            row('FT', ft.made, ft.attempted);
    }

    function renderGameLog(entry) {
        var log = (entry.gameLog || []).slice();
        // Most recent first
        log.sort(function (a, b) { return (b.date || '').localeCompare(a.date || ''); });
        if (log.length === 0) {
            document.getElementById('player-game-log-body').innerHTML = '<p class="game-log-empty">No game appearances yet.</p>';
            return;
        }
        var rows = log.map(function (g) {
            var resultCls = g.result === 'W' ? 'win' : 'loss';
            var bsLink = g.boxScoreID ? '/box-scores.html?id=' + encodeURIComponent(g.boxScoreID) : null;
            var dateCell = bsLink
                ? '<a href="' + bsLink + '">' + escapeHtml(g.date || '--') + '</a>'
                : escapeHtml(g.date || '--');
            return '<tr>'
                + '<td class="gl-date">' + dateCell + '</td>'
                + '<td class="gl-opp">' + escapeHtml(g.opponent || '') + '</td>'
                + '<td class="gl-result ' + resultCls + '">' + (g.result || '') + '</td>'
                + '<td class="gl-stat">' + fmtInt(g.points) + '</td>'
                + '<td class="gl-stat">' + fmtInt(g.rebounds) + '</td>'
                + '<td class="gl-stat">' + fmtInt(g.assists) + '</td>'
                + '<td class="gl-stat">' + fmtMin(g.minutesPlayed) + '</td>'
                + '</tr>';
        });
        document.getElementById('player-game-log-body').innerHTML =
            '<table class="game-log-table">'
            + '<thead><tr>'
            + '<th>DATE</th><th>OPP</th><th>RESULT</th>'
            + '<th>PTS</th><th>REB</th><th>AST</th><th>MIN</th>'
            + '</tr></thead>'
            + '<tbody>' + rows.join('') + '</tbody>'
            + '</table>';
    }
})();
