(function () {
    // ── STATE ──
    var leagues = [];
    var seasons = [];
    var selectedLeagueId = null;   // null = "All"
    var selectedDivision = null;   // null = "All"
    var selectedSeasonId = null;   // null = "All"
    var selectedTeam = null;       // null = "All"
    var selectedDate = null;       // null = "All"
    var allGamesData = [];         // flat array from API
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

    function loadLeaguesAndSeasons() {
        Promise.all([
            fetch('/api/leagues').then(function (r) { return r.json(); }),
            fetch('/api/seasons').then(function (r) { return r.json(); })
        ])
        .then(function (results) {
            var leagueData = results[0];
            var seasonData = results[1];

            leagues = (leagueData && leagueData.leagues) ? leagueData.leagues : [];
            leagues.sort(function (a, b) { return a.id.localeCompare(b.id); });
            seasons = (seasonData && seasonData.seasons) ? seasonData.seasons : [];
            seasons.sort(function (a, b) { return a.id.localeCompare(b.id); });

            renderLeagueDropdown();
            renderDivisionDropdown();
            renderSeasonDropdown();
            renderTeamDropdown();
            renderDateDropdown();

            // Auto-load all game summaries
            if (seasons.length > 0) {
                loadAllGameSummaries();
            } else {
                showEmpty();
            }
        })
        .catch(function () {
            showEmpty();
        });
    }

    function getFilteredSeasons() {
        var filtered = seasons;
        if (selectedLeagueId) {
            filtered = filtered.filter(function (s) {
                return s.league && s.league.abbreviation === selectedLeagueId;
            });
        }
        if (selectedDivision) {
            filtered = filtered.filter(function (s) {
                return seasonMatchesDivision(s, selectedDivision);
            });
        }
        return filtered;
    }

    function loadAllGameSummaries() {
        var targetSeasons = selectedSeasonId ? [{ id: selectedSeasonId }] : getFilteredSeasons();

        if (targetSeasons.length === 0) {
            allGamesData = [];
            showEmpty();
            return;
        }

        var fetches = targetSeasons.map(function (s) {
            return fetch('/api/box-scores?season=' + encodeURIComponent(s.id))
                .then(function (r) { return r.json(); })
                .then(function (data) {
                    return { seasonId: s.id, data: data };
                })
                .catch(function () {
                    return { seasonId: s.id, data: null };
                });
        });

        Promise.all(fetches).then(function (results) {
            allGamesData = [];
            leagueInfo = null;

            for (var i = 0; i < results.length; i++) {
                var r = results[i];
                if (!r.data || !r.data.games) continue;
                if (!leagueInfo && r.data.league) leagueInfo = r.data.league;

                for (var g = 0; g < r.data.games.length; g++) {
                    var game = r.data.games[g];
                    game._seasonId = r.seasonId;
                    allGamesData.push(game);
                }
            }

            if (allGamesData.length === 0) {
                showEmpty();
                return;
            }

            selectedBoxScoreId = null;
            renderGameCards();
            hideDetail();
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

    // ── RENDER: LEAGUE DROPDOWN ──

    function renderLeagueDropdown() {
        var html = '<option value="">All Leagues</option>';
        for (var i = 0; i < leagues.length; i++) {
            var l = leagues[i];
            var label = (l.league && l.league.fullName) ? l.league.fullName : l.id;
            var isActive = selectedLeagueId === l.id;
            html += '<option value="' + l.id + '"' + (isActive ? ' selected' : '') + '>' + label + '</option>';
        }
        els.leagueSelect.innerHTML = html;
    }

    // ── RENDER: DIVISION DROPDOWN ──

    function getDivisionsFromLeague(league) {
        var result = [];
        if (!league) return result;
        // Handle singular "division" field (e.g. DRMBL: "Open")
        if (league.division && typeof league.division === 'string') {
            result.push(league.division);
        }
        // Handle plural "divisions" field (e.g. LOMBA: { varonil: [...] })
        var divs = league.divisions;
        if (divs) {
            if (typeof divs === 'string') {
                if (result.indexOf(divs) === -1) result.push(divs);
            } else {
                for (var cat in divs) {
                    if (Array.isArray(divs[cat])) {
                        var label = cat.charAt(0).toUpperCase() + cat.slice(1);
                        for (var d = 0; d < divs[cat].length; d++) {
                            result.push(label + ' - ' + divs[cat][d]);
                        }
                    }
                }
            }
        }
        return result;
    }

    function getDivisionsForLeague() {
        var filtered = selectedLeagueId
            ? seasons.filter(function (s) { return s.league && s.league.abbreviation === selectedLeagueId; })
            : seasons;

        var all = [];
        for (var i = 0; i < filtered.length; i++) {
            var entries = getDivisionsFromLeague(filtered[i].league);
            for (var j = 0; j < entries.length; j++) {
                if (all.indexOf(entries[j]) === -1) all.push(entries[j]);
            }
        }
        return all;
    }

    function seasonMatchesDivision(season, division) {
        if (!season.league) return false;
        var entries = getDivisionsFromLeague(season.league);
        return entries.indexOf(division) !== -1;
    }

    function renderDivisionDropdown() {
        var html = '<option value="">All Divisions</option>';
        if (selectedLeagueId) {
            // Single league selected — flat list
            var divisions = getDivisionsForLeague();
            for (var i = 0; i < divisions.length; i++) {
                var isActive = selectedDivision === divisions[i];
                html += '<option value="' + divisions[i] + '"' + (isActive ? ' selected' : '') + '>' + divisions[i] + '</option>';
            }
        } else {
            // All leagues — group by league
            for (var l = 0; l < leagues.length; l++) {
                var league = leagues[l];
                var abbr = league.id;
                var leagueSeasons = seasons.filter(function (s) { return s.league && s.league.abbreviation === abbr; });
                var divSet = [];
                for (var s = 0; s < leagueSeasons.length; s++) {
                    var entries = getDivisionsFromLeague(leagueSeasons[s].league);
                    for (var e = 0; e < entries.length; e++) {
                        if (divSet.indexOf(entries[e]) === -1) divSet.push(entries[e]);
                    }
                }
                if (divSet.length > 0) {
                    html += '<optgroup label="' + abbr + '">';
                    for (var d = 0; d < divSet.length; d++) {
                        var isActive = selectedDivision === divSet[d];
                        html += '<option value="' + divSet[d] + '"' + (isActive ? ' selected' : '') + '>' + divSet[d] + '</option>';
                    }
                    html += '</optgroup>';
                }
            }
        }
        els.divisionSelect.innerHTML = html;
    }

    // ── RENDER: SEASON DROPDOWN ──

    function renderSeasonDropdown() {
        var filtered = getFilteredSeasons();
        var html = '<option value="">All Seasons</option>';
        if (selectedLeagueId) {
            // Single league — flat list
            for (var i = 0; i < filtered.length; i++) {
                var isActive = selectedSeasonId === filtered[i].id;
                html += '<option value="' + filtered[i].id + '"' + (isActive ? ' selected' : '') + '>' + filtered[i].id + '</option>';
            }
        } else {
            // All leagues — group by league
            for (var l = 0; l < leagues.length; l++) {
                var abbr = leagues[l].id;
                var group = filtered.filter(function (s) { return s.league && s.league.abbreviation === abbr; });
                if (group.length > 0) {
                    html += '<optgroup label="' + abbr + '">';
                    for (var i = 0; i < group.length; i++) {
                        var isActive = selectedSeasonId === group[i].id;
                        html += '<option value="' + group[i].id + '"' + (isActive ? ' selected' : '') + '>' + group[i].id + '</option>';
                    }
                    html += '</optgroup>';
                }
            }
        }
        els.seasonSelect.innerHTML = html;
    }

    // ── RENDER: TEAM DROPDOWN ──

    function getTeamsForSelection() {
        var filtered = getFilteredSeasons();
        var teams = [];
        var seen = {};
        for (var i = 0; i < filtered.length; i++) {
            var s = filtered[i];
            if (!s.teams) continue;
            for (var t = 0; t < s.teams.length; t++) {
                var team = s.teams[t];
                if (team.name && !seen[team.name]) {
                    seen[team.name] = true;
                    teams.push(team.name);
                }
            }
        }
        teams.sort();
        return teams;
    }

    function renderTeamDropdown() {
        var filtered = getFilteredSeasons();
        var html = '<option value="">All Teams</option>';
        if (selectedLeagueId) {
            // Single league — flat list
            var teams = getTeamsForSelection();
            for (var i = 0; i < teams.length; i++) {
                var isActive = selectedTeam === teams[i];
                html += '<option value="' + teams[i] + '"' + (isActive ? ' selected' : '') + '>' + teams[i] + '</option>';
            }
        } else {
            // All leagues — group by league
            for (var l = 0; l < leagues.length; l++) {
                var abbr = leagues[l].id;
                var group = filtered.filter(function (s) { return s.league && s.league.abbreviation === abbr; });
                var seen = {};
                var teams = [];
                for (var s = 0; s < group.length; s++) {
                    if (!group[s].teams) continue;
                    for (var t = 0; t < group[s].teams.length; t++) {
                        var name = group[s].teams[t].name;
                        if (name && !seen[name]) { seen[name] = true; teams.push(name); }
                    }
                }
                teams.sort();
                if (teams.length > 0) {
                    html += '<optgroup label="' + abbr + '">';
                    for (var i = 0; i < teams.length; i++) {
                        var isActive = selectedTeam === teams[i];
                        html += '<option value="' + teams[i] + '"' + (isActive ? ' selected' : '') + '>' + teams[i] + '</option>';
                    }
                    html += '</optgroup>';
                }
            }
        }
        els.teamSelect.innerHTML = html;
    }

    // ── RENDER: DATE DROPDOWN ──

    function formatDateObj(date) {
        if (!date || date === 'TBD') return 'TBD';
        if (typeof date === 'string') return date;
        var months = ['January', 'February', 'March', 'April', 'May', 'June',
            'July', 'August', 'September', 'October', 'November', 'December'];
        return months[date.month - 1] + ' ' + date.date + ', ' + date.year;
    }

    function dateToValue(date) {
        if (!date || date === 'TBD') return 'TBD';
        if (typeof date === 'string') return date;
        return date.year + '-' + String(date.month).padStart(2, '0') + '-' + String(date.date).padStart(2, '0');
    }

    function renderDateDropdown() {
        var filtered = getFilteredSeasons();
        var seen = {};
        var dateEntries = [];

        for (var i = 0; i < filtered.length; i++) {
            var dates = filtered[i].dates || [];
            for (var d = 0; d < dates.length; d++) {
                var val = dateToValue(dates[d]);
                if (!seen[val]) {
                    seen[val] = true;
                    dateEntries.push({ value: val, label: formatDateObj(dates[d]) });
                }
            }
        }

        // Sort: TBD last, real dates chronologically
        dateEntries.sort(function (a, b) {
            if (a.value === 'TBD' && b.value !== 'TBD') return 1;
            if (a.value !== 'TBD' && b.value === 'TBD') return -1;
            return a.value.localeCompare(b.value);
        });

        var html = '<option value="">All Dates</option>';
        if (!selectedLeagueId && leagues.length > 1) {
            // Group by league
            for (var l = 0; l < leagues.length; l++) {
                var abbr = leagues[l].id;
                var leagueSeasons = filtered.filter(function (s) { return s.league && s.league.abbreviation === abbr; });
                var leagueSeen = {};
                var leagueDates = [];
                for (var s = 0; s < leagueSeasons.length; s++) {
                    var dates = leagueSeasons[s].dates || [];
                    for (var d = 0; d < dates.length; d++) {
                        var val = dateToValue(dates[d]);
                        if (!leagueSeen[val]) {
                            leagueSeen[val] = true;
                            leagueDates.push({ value: val, label: formatDateObj(dates[d]) });
                        }
                    }
                }
                leagueDates.sort(function (a, b) {
                    if (a.value === 'TBD' && b.value !== 'TBD') return 1;
                    if (a.value !== 'TBD' && b.value === 'TBD') return -1;
                    return a.value.localeCompare(b.value);
                });
                if (leagueDates.length > 0) {
                    html += '<optgroup label="' + abbr + '">';
                    for (var i = 0; i < leagueDates.length; i++) {
                        var isActive = selectedDate === leagueDates[i].value;
                        html += '<option value="' + leagueDates[i].value + '"' + (isActive ? ' selected' : '') + '>' + leagueDates[i].label + '</option>';
                    }
                    html += '</optgroup>';
                }
            }
        } else {
            for (var i = 0; i < dateEntries.length; i++) {
                var isActive = selectedDate === dateEntries[i].value;
                html += '<option value="' + dateEntries[i].value + '"' + (isActive ? ' selected' : '') + '>' + dateEntries[i].label + '</option>';
            }
        }

        els.dateSelect.innerHTML = html;
    }

    // ── RENDER: WEEK TABS (disabled — filtering via dropdowns) ──

    function renderWeekTabs() {
        els.weekTabs.innerHTML = '';
    }

    // ── RENDER: GAME CARDS ──

    function getFilteredGames() {
        var games = allGamesData;

        // Filter by team
        if (selectedTeam) {
            games = games.filter(function (g) {
                return g.home === selectedTeam || g.away === selectedTeam;
            });
        }

        // Filter by date
        if (selectedDate) {
            games = games.filter(function (g) {
                var gDate = gameCardDateValue(g);
                return gDate === selectedDate;
            });
        }

        return games;
    }

    function gameCardDateValue(game) {
        var d = game.weekDate;
        if (!d || d === 'TBD') return 'TBD';
        if (typeof d === 'string') return d;
        return d.year + '-' + String(d.month).padStart(2, '0') + '-' + String(d.date).padStart(2, '0');
    }

    function gameCardDateLabel(game) {
        var d = game.weekDate;
        if (!d || d === 'TBD') return 'TBD';
        if (typeof d === 'string') return d;
        var months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
        return months[d.month - 1] + ' ' + d.date + ', ' + d.year;
    }

    function getWeekRange(dateObj) {
        if (!dateObj || dateObj === 'TBD' || typeof dateObj === 'string') return 'TBD';
        var d = new Date(dateObj.year, dateObj.month - 1, dateObj.date);
        var day = d.getDay(); // 0=Sun, 1=Mon, ...
        // Calculate Monday (start of week)
        var diffToMon = day === 0 ? -6 : 1 - day;
        var monday = new Date(d);
        monday.setDate(d.getDate() + diffToMon);
        // Sunday = Monday + 6
        var sunday = new Date(monday);
        sunday.setDate(monday.getDate() + 6);

        var months = ['January', 'February', 'March', 'April', 'May', 'June',
            'July', 'August', 'September', 'October', 'November', 'December'];

        var monLabel = months[monday.getMonth()] + ' ' + monday.getDate();
        var sunLabel = months[sunday.getMonth()] + ' ' + sunday.getDate();

        // Use the Sunday's year (handles year boundary)
        var year = sunday.getFullYear();

        if (monday.getMonth() === sunday.getMonth()) {
            return monLabel + ' - ' + sunday.getDate() + ', ' + year;
        }
        return monLabel + ' - ' + sunLabel + ', ' + year;
    }

    function renderGameCards() {
        var games = getFilteredGames();

        if (games.length === 0) {
            showEmpty();
            return;
        }

        hideEmpty();
        els.gameList.classList.remove('hidden');

        // Group by week (if available) or date
        var groups = [];
        var groupMap = {};
        for (var i = 0; i < games.length; i++) {
            var game = games[i];
            var groupKey = game.week != null ? ('week-' + game.week) : ('date-' + gameCardDateValue(game));
            if (!groupMap[groupKey]) {
                var label = '';
                if (game.week != null) {
                    if (game.weekType === 'playoffs') label = 'Playoffs';
                    else if (game.weekType === 'seeded') label = 'Week ' + game.week + ' (Seeded)';
                    else label = 'Week ' + game.week;
                } else {
                    label = gameCardDateLabel(game);
                }
                var dateRange = game.week != null ? getWeekRange(game.weekDate) : null;
                groupMap[groupKey] = { key: groupKey, label: label, dateRange: dateRange, games: [] };
                groups.push(groupMap[groupKey]);
            }
            groupMap[groupKey].games.push(game);
        }

        // Helper to get league abbreviation for a game
        function getGameLeague(game) {
            if (!game._seasonId) return '';
            for (var i = 0; i < seasons.length; i++) {
                if (seasons[i].id === game._seasonId && seasons[i].league) {
                    return seasons[i].league.abbreviation || '';
                }
            }
            return '';
        }

        function renderGameCard(game) {
            var isSelected = game.id === selectedBoxScoreId;
            var isScheduled = game.status === 'scheduled';
            var isLive = game.status === 'live';
            var isFinal = game.status === 'final';
            var homeIsWinner = isFinal && game.winner === 'home';
            var awayIsWinner = isFinal && game.winner === 'away';

            var cardCls = 'bs-game-card';
            if (isSelected) cardCls += ' selected';
            if (isScheduled) cardCls += ' scheduled';
            if (isLive) cardCls += ' live';

            var h = '';
            h += '<div class="' + cardCls + '"' + (game.id ? ' data-id="' + game.id + '"' : '') + '>';

            if (isFinal) {
                h += '<span class="bs-game-card-badge badge-final">FINAL</span>';
            } else if (isLive) {
                h += '<span class="bs-game-card-badge badge-live">LIVE</span>';
            } else {
                h += '<span class="bs-game-card-badge badge-scheduled">' + (game.time || 'TBD') + '</span>';
            }

            h += '<div class="bs-game-card-teams">';
            h += '<span class="bs-game-card-team' + (homeIsWinner ? ' winner' : '') + '">' + game.home + '</span>';
            h += '<span class="bs-game-card-vs">vs</span>';
            h += '<span class="bs-game-card-team' + (awayIsWinner ? ' winner' : '') + '">' + game.away + '</span>';
            h += '</div>';

            if (isFinal || isLive) {
                h += '<span class="bs-game-card-score">' + game.homeScore + ' - ' + game.awayScore + '</span>';
            } else {
                h += '<span class="bs-game-card-score scheduled-score">TBD</span>';
            }

            h += '</div>';
            return h;
        }

        var showLeagueSections = !selectedLeagueId;

        var html = '';
        for (var g = 0; g < groups.length; g++) {
            var group = groups[g];
            html += '<div class="bs-week-group">';
            html += '<div class="bs-week-label"><span>' + group.label + '</span>' + (group.dateRange ? '<span class="bs-week-date-range">' + group.dateRange + '</span>' : '') + '</div>';

            if (showLeagueSections) {
                // Sub-group by league within each week/date group
                var leagueGroups = {};
                var leagueOrder = [];
                for (var i = 0; i < group.games.length; i++) {
                    var leagueAbbr = getGameLeague(group.games[i]) || 'Other';
                    if (!leagueGroups[leagueAbbr]) {
                        leagueGroups[leagueAbbr] = [];
                        leagueOrder.push(leagueAbbr);
                    }
                    leagueGroups[leagueAbbr].push(group.games[i]);
                }
                leagueOrder.sort();

                for (var l = 0; l < leagueOrder.length; l++) {
                    var abbr = leagueOrder[l];
                    html += '<div class="bs-league-section">';
                    html += '<div class="bs-league-section-label">' + abbr + '</div>';
                    html += '<div class="bs-games-grid">';
                    for (var i = 0; i < leagueGroups[abbr].length; i++) {
                        html += renderGameCard(leagueGroups[abbr][i]);
                    }
                    html += '</div>';
                    html += '</div>';
                }
            } else {
                html += '<div class="bs-games-grid">';
                for (var i = 0; i < group.games.length; i++) {
                    html += renderGameCard(group.games[i]);
                }
                html += '</div>';
            }

            html += '</div>';
        }

        els.gameList.innerHTML = html;

        // Attach click handlers (only for final/live games)
        var cards = els.gameList.querySelectorAll('.bs-game-card[data-id]');
        for (var c = 0; c < cards.length; c++) {
            cards[c].addEventListener('click', function () {
                var id = this.getAttribute('data-id');
                if (this.classList.contains('scheduled')) return;
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
            leagueSelect: document.getElementById('bs-league-select'),
            leagueClear: document.getElementById('bs-league-clear'),
            divisionSelect: document.getElementById('bs-division-select'),
            divisionClear: document.getElementById('bs-division-clear'),
            seasonSelect: document.getElementById('bs-season-select'),
            seasonClear: document.getElementById('bs-season-clear'),
            teamSelect: document.getElementById('bs-team-select'),
            teamClear: document.getElementById('bs-team-clear'),
            dateSelect: document.getElementById('bs-date-select'),
            dateClear: document.getElementById('bs-date-clear'),
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

        // Helper to show/hide clear buttons
        function updateClearButtons() {
            els.leagueClear.classList.toggle('hidden', !selectedLeagueId);
            els.divisionClear.classList.toggle('hidden', !selectedDivision);
            els.seasonClear.classList.toggle('hidden', !selectedSeasonId);
            els.teamClear.classList.toggle('hidden', !selectedTeam);
            els.dateClear.classList.toggle('hidden', !selectedDate);
        }

        // Clear button handlers
        els.leagueClear.addEventListener('click', function () {
            selectedLeagueId = null;
            selectedDivision = null;
            selectedSeasonId = null;
            selectedTeam = null;
            selectedDate = null;
            selectedWeek = null;
            selectedBoxScoreId = null;
            hideDetail();
            els.leagueSelect.value = '';
            renderLeagueDropdown();
            renderDivisionDropdown();
            renderSeasonDropdown();
            renderTeamDropdown();
            renderDateDropdown();
            updateClearButtons();
            loadAllGameSummaries();
        });

        els.divisionClear.addEventListener('click', function () {
            selectedDivision = null;
            selectedSeasonId = null;
            selectedTeam = null;
            selectedDate = null;
            selectedWeek = null;
            selectedBoxScoreId = null;
            hideDetail();
            els.divisionSelect.value = '';
            renderSeasonDropdown();
            renderTeamDropdown();
            renderDateDropdown();
            updateClearButtons();
            loadAllGameSummaries();
        });

        els.seasonClear.addEventListener('click', function () {
            selectedSeasonId = null;
            selectedTeam = null;
            selectedDate = null;
            selectedWeek = null;
            selectedBoxScoreId = null;
            hideDetail();
            els.seasonSelect.value = '';
            renderTeamDropdown();
            renderDateDropdown();
            updateClearButtons();
            loadAllGameSummaries();
        });

        els.teamClear.addEventListener('click', function () {
            selectedTeam = null;
            selectedWeek = null;
            selectedBoxScoreId = null;
            hideDetail();
            els.teamSelect.value = '';
            updateClearButtons();
            renderGameCards();
        });

        els.dateClear.addEventListener('click', function () {
            selectedDate = null;
            selectedWeek = null;
            selectedBoxScoreId = null;
            hideDetail();
            els.dateSelect.value = '';
            updateClearButtons();
            renderGameCards();
        });

        // League change → resets division, season, team, date
        els.leagueSelect.addEventListener('change', function () {
            selectedLeagueId = this.value || null;
            selectedDivision = null;
            selectedSeasonId = null;
            selectedTeam = null;
            selectedDate = null;
            selectedWeek = null;
            selectedBoxScoreId = null;
            hideDetail();
            renderDivisionDropdown();
            renderSeasonDropdown();
            renderTeamDropdown();
            renderDateDropdown();
            updateClearButtons();
            loadAllGameSummaries();
        });

        // Division change → resets season, team, date
        els.divisionSelect.addEventListener('change', function () {
            selectedDivision = this.value || null;
            selectedSeasonId = null;
            selectedTeam = null;
            selectedDate = null;
            selectedWeek = null;
            selectedBoxScoreId = null;
            hideDetail();
            renderSeasonDropdown();
            renderTeamDropdown();
            renderDateDropdown();
            updateClearButtons();
            loadAllGameSummaries();
        });

        // Season change → resets team, date
        els.seasonSelect.addEventListener('change', function () {
            selectedSeasonId = this.value || null;
            selectedTeam = null;
            selectedDate = null;
            selectedWeek = null;
            selectedBoxScoreId = null;
            hideDetail();
            renderTeamDropdown();
            renderDateDropdown();
            updateClearButtons();
            loadAllGameSummaries();
        });

        // Team change
        els.teamSelect.addEventListener('change', function () {
            selectedTeam = this.value || null;
            selectedWeek = null;
            selectedBoxScoreId = null;
            hideDetail();
            updateClearButtons();
            renderGameCards();
        });

        // Date change
        els.dateSelect.addEventListener('change', function () {
            selectedDate = this.value || null;
            selectedWeek = null;
            selectedBoxScoreId = null;
            hideDetail();
            updateClearButtons();
            renderGameCards();
        });

        loadLeaguesAndSeasons();
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();
