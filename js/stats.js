(function () {
    // Minimum games-played for a player to count as "qualified" in the stats race.
    // Flat threshold: a player must have played at least this many games. Non-qualified
    // players still appear on the leaderboards and grid, marked with *.
    var minGamesQualified = 4;

    function isQualified(p) { return (p.gamesPlayed || 0) >= qualThreshold(); }
    function nameWithAsterisk(p) { return (p.name || '') + (isQualified(p) ? '' : '*'); }

    // Regular-season vs playoff leaderboards. The stats doc carries both datasets:
    //   players / teams               → regular season
    //   playoffPlayers / playoffTeams → playoffs
    var activeMode = 'regular';
    function curPlayers() { return (statsDoc && (activeMode === 'playoffs' ? statsDoc.playoffPlayers : statsDoc.players)) || []; }
    function curTeams() { return (statsDoc && (activeMode === 'playoffs' ? statsDoc.playoffTeams : statsDoc.teams)) || []; }
    function hasPlayoffStats() { return !!(statsDoc && statsDoc.playoffPlayers && statsDoc.playoffPlayers.length); }
    // Playoffs have only a handful of games, so the regular-season qualification gate
    // (minGamesQualified) doesn't apply — anyone who played a playoff game qualifies.
    function qualThreshold() { return activeMode === 'playoffs' ? 1 : minGamesQualified; }

    // ── State ──
    var statsDoc = null;
    var els = {};
    // Primary sort for the detail grid.
    //   { field, dir }  field ∈ { 'name', 'team', <stat key> }, dir ∈ { 'asc', 'desc' }
    // When field is 'name' or 'team', the active stat (dropdown value) is used as
    // the tiebreaker. When field is a stat key, primarySort.field === activeStatKey.
    // null means uninitialized — populated on first detail render.
    var primarySort = null;

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
    // Totals trail the per-game/percentage stats; visually separated by an emphasized header.
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
        { key: 'eff',       label: 'EFF',    accessor: function (p) {
            var gp = p.gamesPlayed || 0;
            if (!gp) return 0;
            var fg = (p.totals && p.totals.fieldGoals) || {};
            var ft = (p.totals && p.totals.freeThrows) || {};
            var reb = (p.totals && p.totals.rebounds) || {};
            var eff = (p.totals.points || 0)
                + (reb.total || 0)
                + (p.totals.assists || 0)
                + (p.totals.steals || 0)
                + (p.totals.blocks || 0)
                - (p.totals.turnovers || 0)
                - ((fg.totalAttempted || 0) - (fg.totalMade || 0))
                - ((ft.attempted || 0) - (ft.made || 0));
            return eff / gp;
        }, fmt: oneDec },
        { key: 'plusMinus', label: '+/-',    accessor: function (p) { return p.averages.plusMinusAvg; }, fmt: signedDec },
        // Totals — raw season counts, sortable like the rest.
        // Shooting-split columns sort by makes; display "made/attempted".
        { key: 'totalPts',  label: 'PTS',    accessor: function (p) { return p.totals.points; },         fmt: intFmt, group: 'totals' },
        { key: 'totalReb',  label: 'REB',    accessor: function (p) { return p.totals.rebounds.total; }, fmt: intFmt, group: 'totals' },
        { key: 'totalOreb', label: 'OREB',   accessor: function (p) { return p.totals.rebounds.offensive; }, fmt: intFmt, group: 'totals' },
        { key: 'totalDreb', label: 'DREB',   accessor: function (p) { return p.totals.rebounds.defensive; }, fmt: intFmt, group: 'totals' },
        { key: 'totalAst',  label: 'AST',    accessor: function (p) { return p.totals.assists; },        fmt: intFmt, group: 'totals' },
        { key: 'totalStl',  label: 'STL',    accessor: function (p) { return p.totals.steals; },         fmt: intFmt, group: 'totals' },
        { key: 'totalBlk',  label: 'BLK',    accessor: function (p) { return p.totals.blocks; },         fmt: intFmt, group: 'totals' },
        { key: 'totalTo',   label: 'TO',     accessor: function (p) { return p.totals.turnovers; },      fmt: intFmt, group: 'totals' },
        { key: 'totalMin',  label: 'MIN',    accessor: function (p) { return (p.totals.minutesPlayed || 0) / 60; }, fmt: oneDec, group: 'totals' },
        { key: 'fgm',   label: 'FGM',    accessor: function (p) { return p.totals.fieldGoals.totalMade; },           fmt: intFmt, group: 'totals' },
        { key: 'fga',   label: 'FGA',    accessor: function (p) { return p.totals.fieldGoals.totalAttempted; },      fmt: intFmt, group: 'totals' },
        { key: '2ptm',  label: '2PTM',   accessor: function (p) { return p.totals.fieldGoals.twoPoint.made; },       fmt: intFmt, group: 'totals' },
        { key: '2pta',  label: '2PTA',   accessor: function (p) { return p.totals.fieldGoals.twoPoint.attempted; },  fmt: intFmt, group: 'totals' },
        { key: '3ptm',  label: '3PTM',   accessor: function (p) { return p.totals.fieldGoals.threePoint.made; },     fmt: intFmt, group: 'totals' },
        { key: '3pta',  label: '3PTA',   accessor: function (p) { return p.totals.fieldGoals.threePoint.attempted; },fmt: intFmt, group: 'totals' },
        { key: 'ftm',   label: 'FTM',    accessor: function (p) { return p.totals.freeThrows.made; },                fmt: intFmt, group: 'totals' },
        { key: 'fta',   label: 'FTA',    accessor: function (p) { return p.totals.freeThrows.attempted; },           fmt: intFmt, group: 'totals' }
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
    function intFmt(v) { return (v == null) ? '--' : Math.round(v).toString(); }
    function signedInt(v) {
        if (v == null) return '--';
        var n = Math.round(v);
        return (n > 0 ? '+' : '') + n;
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

    // ── Mode toggle (Regular Season / Playoffs) ──
    // Only shown once playoff games exist; swaps which dataset the leaderboards read.
    function renderModeToggle() {
        if (!els.modeToggle) return;
        if (!hasPlayoffStats()) {
            els.modeToggle.classList.add('hidden');
            els.modeToggle.innerHTML = '';
            return;
        }
        els.modeToggle.classList.remove('hidden');
        els.modeToggle.innerHTML =
            '<button type="button" class="stats-mode-btn' + (activeMode === 'regular' ? ' active' : '') + '" data-mode="regular">Regular Season</button>' +
            '<button type="button" class="stats-mode-btn' + (activeMode === 'playoffs' ? ' active' : '') + '" data-mode="playoffs">Playoffs</button>';
        var btns = els.modeToggle.querySelectorAll('.stats-mode-btn');
        for (var i = 0; i < btns.length; i++) {
            btns[i].addEventListener('click', function () {
                var mode = this.getAttribute('data-mode');
                if (mode === activeMode) return;
                activeMode = mode;
                renderModeToggle();
                // Re-render the active view. Team filter resets to 'all' since the
                // two datasets can have different teams.
                if (els.detail && !els.detail.classList.contains('hidden')) {
                    var stat = els.detailStat.value || 'ppg';
                    primarySort = { field: stat, dir: 'desc' };
                    renderDetail(stat, 'all');
                    setUrlState(stat, 'all');
                } else {
                    renderLanding();
                    setUrlState(null, null);
                }
            });
        }
    }

    // ── URL state ──
    function applyUrlState() {
        var params = new URLSearchParams(window.location.search);
        activeMode = (params.get('mode') === 'playoffs' && hasPlayoffStats()) ? 'playoffs' : 'regular';
        renderModeToggle();
        var stat = params.get('stat');
        var team = params.get('team');
        primarySort = null;
        if (stat) {
            primarySort = { field: stat, dir: 'desc' };
            renderDetail(stat, team || 'all');
        } else {
            renderLanding();
        }
    }

    function setUrlState(stat, team) {
        var p = new URLSearchParams();
        if (activeMode === 'playoffs') p.set('mode', 'playoffs');
        if (stat) p.set('stat', stat);
        if (team && team !== 'all') p.set('team', team);
        var search = p.toString();
        var url = window.location.pathname + (search ? '?' + search : '');
        history.pushState({ stat: stat, team: team, mode: activeMode }, '', url);
    }

    // ── Landing render ──
    function renderLanding() {
        primarySort = null;
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
                primarySort = { field: stat, dir: 'desc' };
                renderDetail(stat, 'all');
                setUrlState(stat, 'all');
            });
        }
    }

    function renderLeaderboardCard(statDef) {
        var players = curPlayers()
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
            var profileHref = '/player.html?id=' + encodeURIComponent(p.playerID);
            var qCls = isQualified(p) ? '' : ' stats-unqualified';
            html += '<li class="stats-card-row' + qCls + '">';
            html += '<span class="stats-card-rank">' + (i + 1) + '</span>';
            html += '<a class="stats-card-name stats-card-player-link" href="' + profileHref + '" title="' + (isQualified(p) ? '' : 'Not yet qualified — needs ' + minGamesQualified + ' games') + '">' + escapeHtml(nameWithAsterisk(p)) + '</a>';
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
        var teams = curTeams()
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
        var modePlayers = curPlayers();
        for (var p = 0; p < modePlayers.length; p++) {
            var pl = modePlayers[p];
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

        var pf = primarySort && primarySort.field;
        var pdir = primarySort && primarySort.dir;

        var hideUnqualified = els.detailQualified && els.detailQualified.getAttribute('aria-pressed') === 'true';
        var players = curPlayers()
            .filter(function (p) { return p.gamesPlayed > 0; })
            .filter(function (p) { return !hideUnqualified || isQualified(p); })
            .filter(function (p) { return teamFilter === 'all' || p.teamID === teamFilter; })
            .filter(function (p) { return !search || p.name.toLowerCase().indexOf(search) !== -1; })
            .sort(function (a, b) {
                if (pf === 'name' || pf === 'team') {
                    var av = pf === 'name' ? a.name : a.teamName;
                    var bv = pf === 'name' ? b.name : b.teamName;
                    var cmp = String(av || '').localeCompare(String(bv || ''));
                    if (cmp !== 0) return pdir === 'desc' ? -cmp : cmp;
                    // Tiebreaker: active stat descending
                    return statDef.accessor(b) - statDef.accessor(a);
                }
                // Primary is a stat (or unset → desc fallback)
                var diff = statDef.accessor(b) - statDef.accessor(a);
                return pdir === 'asc' ? -diff : diff;
            });

        var html = '<div class="stats-table-area">';
        if (activeMode === 'regular') {
            html += '<p class="stats-qualified-note">* Players with fewer than ' + minGamesQualified + ' games are not yet qualified for stat leaders.</p>';
        }
        html += '<div class="stats-scroll-top"><div class="stats-scroll-top-inner"></div></div>';
        html += '<div class="stats-table-wrap">';
        html += '<table class="stats-table">';
        var nameActive = pf === 'name';
        var teamActive = pf === 'team';
        var arrowFor = function (active) {
            if (!active) return '';
            var ch = pdir === 'asc' ? '&#9650;' : '&#9660;';
            return ' <span class="st-arrow">' + ch + '</span>';
        };

        html += '<thead><tr>';
        html += '<th class="st-rank">#</th>';
        html += '<th class="st-player st-sortable' + (nameActive ? ' st-active' : '') + '" data-sort="__name__" title="Sort by player name">PLAYER' + arrowFor(nameActive) + '</th>';
        html += '<th class="st-team st-sortable' + (teamActive ? ' st-active' : '') + '" data-sort="__team__" title="Sort by team">TEAM' + arrowFor(teamActive) + '</th>';
        for (var i = 0; i < DETAIL_STATS.length; i++) {
            var s = DETAIL_STATS[i];
            var isActive = s.key === pf;
            var prevGroup = i > 0 ? DETAIL_STATS[i - 1].group : null;
            var isGroupStart = s.group && s.group !== prevGroup;
            var cls = 'st-stat st-sortable' + (isActive ? ' st-active' : '') + (isGroupStart ? ' st-group-start' : '');
            html += '<th class="' + cls + '" data-sort="' + s.key + '" title="Sort by ' + s.label + '">' + s.label + arrowFor(isActive) + '</th>';
        }
        html += '</tr></thead>';
        html += '<tbody>';

        for (var pi = 0; pi < players.length; pi++) {
            var p = players[pi];
            var rowCls = isQualified(p) ? '' : ' stats-unqualified';
            html += '<tr class="' + rowCls.trim() + '">';
            html += '<td class="st-rank">' + (pi + 1) + '</td>';
            html += '<td class="st-player"><a class="st-player-link" href="/player.html?id=' + encodeURIComponent(p.playerID) + '" title="' + (isQualified(p) ? '' : 'Not yet qualified — needs ' + minGamesQualified + ' games') + '">' + escapeHtml(nameWithAsterisk(p)) + '</a></td>';
            html += '<td class="st-team">' + escapeHtml(p.teamName) + '</td>';
            for (var si = 0; si < DETAIL_STATS.length; si++) {
                var sd = DETAIL_STATS[si];
                var fmtVal;
                if (sd.displayFn) {
                    fmtVal = sd.displayFn(p);
                } else {
                    var val = sd.accessor(p);
                    fmtVal = sd.fmt ? sd.fmt(val) : (val == null ? '--' : val);
                }
                var prevGroupTd = si > 0 ? DETAIL_STATS[si - 1].group : null;
                var isGroupStartTd = sd.group && sd.group !== prevGroupTd;
                var tdCls = 'st-stat' + (sd.key === pf ? ' st-active' : '') + (isGroupStartTd ? ' st-group-start' : '');
                html += '<td class="' + tdCls + '">' + fmtVal + '</td>';
            }
            html += '</tr>';
        }

        html += '</tbody></table>';
        html += '</div>'; // .stats-table-wrap
        html += '</div>'; // .stats-table-area

        if (players.length === 0) {
            html = '<div class="stats-empty">No players match the current filters.</div>';
        }

        els.detailTable.innerHTML = html;

        // Sync sticky top scrollbar with the actual table-wrap scroll
        var topBar = els.detailTable.querySelector('.stats-scroll-top');
        var topInner = els.detailTable.querySelector('.stats-scroll-top-inner');
        var wrap = els.detailTable.querySelector('.stats-table-wrap');
        var table = wrap && wrap.querySelector('table');
        if (topBar && topInner && wrap && table) {
            // Match the inner spacer to the table's natural width so the scroll
            // ranges line up. Re-measured on resize.
            function syncWidth() {
                topInner.style.width = table.scrollWidth + 'px';
            }
            syncWidth();
            window.addEventListener('resize', syncWidth);

            var locked = false;
            topBar.addEventListener('scroll', function () {
                if (locked) return;
                locked = true;
                wrap.scrollLeft = topBar.scrollLeft;
                locked = false;
            });
            wrap.addEventListener('scroll', function () {
                if (locked) return;
                locked = true;
                topBar.scrollLeft = wrap.scrollLeft;
                locked = false;
            });
        }

        // Header click → re-sort.
        //   PLAYER/TEAM → set/toggle primary sort; active stat (dropdown) remains
        //                 unchanged and serves as the tiebreaker.
        //   Stat column → override primary (clears any name/team grouping), toggle
        //                 asc/desc if same column, default desc on a different
        //                 column. Syncs the dropdown + URL.
        var headers = els.detailTable.querySelectorAll('th[data-sort]');
        for (var hi = 0; hi < headers.length; hi++) {
            headers[hi].addEventListener('click', function () {
                var key = this.getAttribute('data-sort');
                if (key === '__name__' || key === '__team__') {
                    var field = key === '__name__' ? 'name' : 'team';
                    if (primarySort && primarySort.field === field) {
                        primarySort = { field: field, dir: primarySort.dir === 'asc' ? 'desc' : 'asc' };
                    } else {
                        primarySort = { field: field, dir: 'asc' };
                    }
                    renderDetailTable(activeStatKey, teamFilter, searchTerm);
                    return;
                }
                // Stat column: override primary (clears name/team grouping)
                if (primarySort && primarySort.field === key) {
                    primarySort = { field: key, dir: primarySort.dir === 'asc' ? 'desc' : 'asc' };
                } else {
                    primarySort = { field: key, dir: 'desc' };
                }
                els.detailStat.value = key;
                renderDetailTable(key, teamFilter, searchTerm);
                setUrlState(key, teamFilter);
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
        els.modeToggle = document.getElementById('stats-mode-toggle');
        els.back = document.getElementById('stats-back');
        els.detailStat = document.getElementById('stats-detail-stat');
        els.detailQualified = document.getElementById('stats-detail-qualified');
        els.detailTeam = document.getElementById('stats-detail-team');
        els.detailSearch = document.getElementById('stats-detail-search');
        els.detailTable = document.getElementById('stats-detail-table');

        els.back.addEventListener('click', function () {
            renderLanding();
            history.pushState({}, '', window.location.pathname);
        });

        els.detailStat.addEventListener('change', function () {
            var newStat = this.value;
            var teamFilter = els.detailTeam.value || 'all';
            // If primary is name/team, keep the grouping — the active stat just
            // changes the tiebreaker. Otherwise the new stat becomes primary, desc.
            var keepGrouping = primarySort && (primarySort.field === 'name' || primarySort.field === 'team');
            if (!keepGrouping) {
                primarySort = { field: newStat, dir: 'desc' };
            }
            renderDetail(newStat, teamFilter);
            setUrlState(newStat, teamFilter);
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

        els.detailQualified.addEventListener('click', function () {
            var on = this.getAttribute('aria-pressed') === 'true';
            var next = !on;
            this.setAttribute('aria-pressed', next ? 'true' : 'false');
            this.classList.toggle('active', next);
            this.textContent = next ? 'Show All Players' : 'Hide Non-Qualifying Players*';
            var stat = els.detailStat.value;
            var team = els.detailTeam.value || 'all';
            renderDetailTable(stat, team, els.detailSearch.value || '');
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
