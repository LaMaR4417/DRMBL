(function () {
    // ── State ──
    var statsDoc = null;
    var els = {};

    // Stats shown on the landing leaderboards (top-5 cards).
    // Each entry: { key, label, accessor (player → number), valueFmt (number → string), isPercent }
    var LANDING_STATS = [
        { key: 'ppg',      label: 'Points',      accessor: function (p) { return p.averages.ppg; },     fmt: oneDec },
        { key: 'rpg',      label: 'Rebounds',    accessor: function (p) { return p.averages.rpg; },     fmt: oneDec },
        { key: 'apg',      label: 'Assists',     accessor: function (p) { return p.averages.apg; },     fmt: oneDec },
        { key: 'spg',      label: 'Steals',      accessor: function (p) { return p.averages.spg; },     fmt: oneDec },
        { key: 'bpg',      label: 'Blocks',      accessor: function (p) { return p.averages.bpg; },     fmt: oneDec },
        { key: 'fgPct',    label: 'FG %',        accessor: function (p) { return p.averages.fgPct; },   fmt: pctFmt }
    ];

    // Stats available in the detail data-grid (sortable columns).
    var DETAIL_STATS = [
        { key: 'gp',        label: 'GP',     accessor: function (p) { return p.gamesPlayed; } },
        { key: 'ppg',       label: 'PPG',    accessor: function (p) { return p.averages.ppg; },          fmt: oneDec },
        { key: 'rpg',       label: 'RPG',    accessor: function (p) { return p.averages.rpg; },          fmt: oneDec },
        { key: 'apg',       label: 'APG',    accessor: function (p) { return p.averages.apg; },          fmt: oneDec },
        { key: 'spg',       label: 'SPG',    accessor: function (p) { return p.averages.spg; },          fmt: oneDec },
        { key: 'bpg',       label: 'BPG',    accessor: function (p) { return p.averages.bpg; },          fmt: oneDec },
        { key: 'topg',      label: 'TOPG',   accessor: function (p) { return p.averages.topg; },         fmt: oneDec },
        { key: 'mpg',       label: 'MPG',    accessor: function (p) { return p.averages.mpg; },          fmt: oneDec },
        { key: 'fgPct',     label: 'FG%',    accessor: function (p) { return p.averages.fgPct; },        fmt: pctFmt },
        { key: 'twoPct',    label: '2P%',    accessor: function (p) { return p.averages.twoPct; },       fmt: pctFmt },
        { key: 'threePct',  label: '3P%',    accessor: function (p) { return p.averages.threePct; },     fmt: pctFmt },
        { key: 'ftPct',     label: 'FT%',    accessor: function (p) { return p.averages.ftPct; },        fmt: pctFmt },
        { key: 'plusMinus', label: '+/-',    accessor: function (p) { return p.averages.plusMinusAvg; }, fmt: signedDec }
    ];

    // Team leaderboard stats (landing display)
    var TEAM_STATS = [
        { key: 'ppgScored',  label: 'Points / Game',          accessor: function (t) { return t.averages.ppgScored; },  fmt: oneDec },
        { key: 'ppgAllowed', label: 'Points Allowed',         accessor: function (t) { return t.averages.ppgAllowed; }, fmt: oneDec, ascending: true },
        { key: 'netRating',  label: 'Net Rating',             accessor: function (t) { return t.averages.netRating; },  fmt: signedDec },
        { key: 'rpg',        label: 'Rebounds / Game',        accessor: function (t) { return t.averages.rpg; },        fmt: oneDec },
        { key: 'apg',        label: 'Assists / Game',         accessor: function (t) { return t.averages.apg; },        fmt: oneDec },
        { key: 'fgPct',      label: 'FG %',                   accessor: function (t) { return t.averages.fgPct; },      fmt: pctFmt }
    ];

    // ── Formatters ──
    function oneDec(v) { return (v == null) ? '--' : (Math.round(v * 10) / 10).toFixed(1); }
    function pctFmt(v) { return (v == null) ? '--' : v + '%'; }
    function signedDec(v) {
        if (v == null) return '--';
        var rounded = Math.round(v * 10) / 10;
        return (rounded > 0 ? '+' : '') + rounded.toFixed(1);
    }

    // ── Fetch ──
    function loadStats() {
        fetch('/api/stats?league=drmbl')
            .then(function (r) { return r.json(); })
            .then(function (data) {
                if (!data || !data.stats) {
                    showEmpty('No stats available yet.');
                    return;
                }
                statsDoc = data.stats;
                applyUrlState();
            })
            .catch(function () {
                showEmpty('Unable to load stats.');
            });
    }

    function showEmpty(msg) {
        els.landing.innerHTML = '<div class="stats-empty">' + msg + '</div>';
        els.landing.classList.remove('hidden');
        els.detail.classList.add('hidden');
    }

    // ── URL state ──
    function applyUrlState() {
        var params = new URLSearchParams(window.location.search);
        var stat = params.get('stat');
        var team = params.get('team');
        if (stat) {
            renderDetail(stat, team || 'all');
        } else {
            renderLanding();
        }
    }

    function setUrlState(stat, team) {
        var p = new URLSearchParams();
        if (stat) p.set('stat', stat);
        if (team && team !== 'all') p.set('team', team);
        var search = p.toString();
        var url = window.location.pathname + (search ? '?' + search : '');
        history.pushState({ stat: stat, team: team }, '', url);
    }

    // ── Landing render ──
    function renderLanding() {
        els.detail.classList.add('hidden');
        els.landing.classList.remove('hidden');

        var html = '';

        // Player leaderboards (6 cards)
        html += '<h2 class="stats-section-title">Player Leaderboards</h2>';
        html += '<div class="stats-cards-grid">';
        for (var i = 0; i < LANDING_STATS.length; i++) {
            html += renderLeaderboardCard(LANDING_STATS[i]);
        }
        html += '</div>';

        // Team leaderboards
        html += '<h2 class="stats-section-title">Team Leaderboards</h2>';
        html += '<div class="stats-cards-grid">';
        for (var t = 0; t < TEAM_STATS.length; t++) {
            html += renderTeamCard(TEAM_STATS[t]);
        }
        html += '</div>';

        els.landing.innerHTML = html;

        // Card click → detail view
        var cards = els.landing.querySelectorAll('.stats-card[data-stat]');
        for (var c = 0; c < cards.length; c++) {
            cards[c].addEventListener('click', function () {
                var stat = this.getAttribute('data-stat');
                renderDetail(stat, 'all');
                setUrlState(stat, 'all');
            });
        }
    }

    function renderLeaderboardCard(statDef) {
        var players = (statsDoc.players || [])
            .filter(function (p) { return p.gamesPlayed > 0; })
            .sort(function (a, b) { return statDef.accessor(b) - statDef.accessor(a); })
            .slice(0, 5);

        var html = '<div class="stats-card" data-stat="' + statDef.key + '" role="button" tabindex="0">';
        html += '<div class="stats-card-header">';
        html += '<span class="stats-card-title">' + statDef.label + '</span>';
        html += '<span class="stats-card-arrow">&rarr;</span>';
        html += '</div>';
        html += '<ol class="stats-card-list">';
        for (var i = 0; i < players.length; i++) {
            var p = players[i];
            html += '<li class="stats-card-row">';
            html += '<span class="stats-card-rank">' + (i + 1) + '</span>';
            html += '<span class="stats-card-name">' + escapeHtml(p.name) + '</span>';
            html += '<span class="stats-card-row-team">' + escapeHtml(p.teamName) + '</span>';
            html += '<span class="stats-card-value">' + statDef.fmt(statDef.accessor(p)) + '</span>';
            html += '</li>';
        }
        if (players.length === 0) {
            html += '<li class="stats-card-empty">No data yet</li>';
        }
        html += '</ol>';
        html += '</div>';
        return html;
    }

    function renderTeamCard(statDef) {
        var teams = (statsDoc.teams || [])
            .filter(function (t) { return t.gamesPlayed > 0; })
            .sort(function (a, b) {
                if (statDef.ascending) return statDef.accessor(a) - statDef.accessor(b);
                return statDef.accessor(b) - statDef.accessor(a);
            })
            .slice(0, 5);

        var html = '<div class="stats-card stats-card-team">';
        html += '<div class="stats-card-header">';
        html += '<span class="stats-card-title">' + statDef.label + '</span>';
        html += '</div>';
        html += '<ol class="stats-card-list">';
        for (var i = 0; i < teams.length; i++) {
            var t = teams[i];
            html += '<li class="stats-card-row">';
            html += '<span class="stats-card-rank">' + (i + 1) + '</span>';
            html += '<span class="stats-card-name">' + escapeHtml(t.teamName) + '</span>';
            html += '<span class="stats-card-team">' + t.wins + '-' + t.losses + '</span>';
            html += '<span class="stats-card-value">' + statDef.fmt(statDef.accessor(t)) + '</span>';
            html += '</li>';
        }
        if (teams.length === 0) {
            html += '<li class="stats-card-empty">No data yet</li>';
        }
        html += '</ol>';
        html += '</div>';
        return html;
    }

    // ── Detail render (sortable data grid) ──
    function renderDetail(activeStatKey, teamFilter) {
        els.landing.classList.add('hidden');
        els.detail.classList.remove('hidden');

        // Populate stat selector
        var statSel = els.detailStat;
        statSel.innerHTML = '';
        for (var i = 0; i < DETAIL_STATS.length; i++) {
            var s = DETAIL_STATS[i];
            var opt = document.createElement('option');
            opt.value = s.key;
            opt.textContent = s.label;
            if (s.key === activeStatKey) opt.selected = true;
            statSel.appendChild(opt);
        }

        // Populate team filter
        var teamSel = els.detailTeam;
        teamSel.innerHTML = '<option value="all">All Teams</option>';
        var teamSet = {};
        for (var p = 0; p < (statsDoc.players || []).length; p++) {
            var pl = statsDoc.players[p];
            if (pl.teamID && !teamSet[pl.teamID]) {
                teamSet[pl.teamID] = pl.teamName;
            }
        }
        var teamIds = Object.keys(teamSet).sort(function (a, b) { return teamSet[a].localeCompare(teamSet[b]); });
        for (var ti = 0; ti < teamIds.length; ti++) {
            var topt = document.createElement('option');
            topt.value = teamIds[ti];
            topt.textContent = teamSet[teamIds[ti]];
            if (teamIds[ti] === teamFilter) topt.selected = true;
            teamSel.appendChild(topt);
        }

        renderDetailTable(activeStatKey, teamFilter, els.detailSearch.value || '');
    }

    function renderDetailTable(activeStatKey, teamFilter, searchTerm) {
        var statDef = DETAIL_STATS.find(function (s) { return s.key === activeStatKey; }) || DETAIL_STATS[1];
        var search = (searchTerm || '').trim().toLowerCase();

        var players = (statsDoc.players || [])
            .filter(function (p) { return p.gamesPlayed > 0; })
            .filter(function (p) { return teamFilter === 'all' || p.teamID === teamFilter; })
            .filter(function (p) { return !search || p.name.toLowerCase().indexOf(search) !== -1; })
            .sort(function (a, b) { return statDef.accessor(b) - statDef.accessor(a); });

        var html = '<div class="stats-table-wrap">';
        html += '<table class="stats-table">';
        html += '<thead><tr>';
        html += '<th class="st-rank">#</th>';
        html += '<th class="st-player">PLAYER</th>';
        html += '<th class="st-team">TEAM</th>';
        for (var i = 0; i < DETAIL_STATS.length; i++) {
            var s = DETAIL_STATS[i];
            var isActive = s.key === activeStatKey;
            var cls = 'st-stat st-sortable' + (isActive ? ' st-active' : '');
            html += '<th class="' + cls + '" data-sort="' + s.key + '" title="Sort by ' + s.label + '">' + s.label + (isActive ? ' <span class="st-arrow">&#9660;</span>' : '') + '</th>';
        }
        html += '</tr></thead>';
        html += '<tbody>';

        for (var pi = 0; pi < players.length; pi++) {
            var p = players[pi];
            html += '<tr>';
            html += '<td class="st-rank">' + (pi + 1) + '</td>';
            html += '<td class="st-player">' + escapeHtml(p.name) + '</td>';
            html += '<td class="st-team">' + escapeHtml(p.teamName) + '</td>';
            for (var si = 0; si < DETAIL_STATS.length; si++) {
                var sd = DETAIL_STATS[si];
                var val = sd.accessor(p);
                var fmt = sd.fmt ? sd.fmt(val) : (val == null ? '--' : val);
                var tdCls = 'st-stat' + (sd.key === activeStatKey ? ' st-active' : '');
                html += '<td class="' + tdCls + '">' + fmt + '</td>';
            }
            html += '</tr>';
        }

        html += '</tbody></table>';
        html += '</div>';

        if (players.length === 0) {
            html = '<div class="stats-empty">No players match the current filters.</div>';
        }

        els.detailTable.innerHTML = html;

        // Header click → re-sort by clicked stat (also syncs the dropdown + URL)
        var headers = els.detailTable.querySelectorAll('th[data-sort]');
        for (var hi = 0; hi < headers.length; hi++) {
            headers[hi].addEventListener('click', function () {
                var newStat = this.getAttribute('data-sort');
                els.detailStat.value = newStat;
                renderDetailTable(newStat, teamFilter, searchTerm);
                setUrlState(newStat, teamFilter);
            });
        }
    }

    function escapeHtml(s) {
        if (s == null) return '';
        return String(s).replace(/[&<>"']/g, function (c) {
            return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
        });
    }

    // ── Init ──
    function init() {
        els.landing = document.getElementById('stats-landing');
        els.detail = document.getElementById('stats-detail');
        els.back = document.getElementById('stats-back');
        els.detailStat = document.getElementById('stats-detail-stat');
        els.detailTeam = document.getElementById('stats-detail-team');
        els.detailSearch = document.getElementById('stats-detail-search');
        els.detailTable = document.getElementById('stats-detail-table');

        els.back.addEventListener('click', function () {
            renderLanding();
            history.pushState({}, '', window.location.pathname);
        });

        els.detailStat.addEventListener('change', function () {
            var teamFilter = els.detailTeam.value || 'all';
            renderDetail(this.value, teamFilter);
            setUrlState(this.value, teamFilter);
        });

        els.detailTeam.addEventListener('change', function () {
            var stat = els.detailStat.value;
            renderDetailTable(stat, this.value || 'all', els.detailSearch.value);
            setUrlState(stat, this.value || 'all');
        });

        els.detailSearch.addEventListener('input', function () {
            var stat = els.detailStat.value;
            var team = els.detailTeam.value || 'all';
            renderDetailTable(stat, team, this.value);
        });

        window.addEventListener('popstate', applyUrlState);

        loadStats();
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();
