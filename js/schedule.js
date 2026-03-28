(function () {
    // ── League mode detection ──
    function getLeagueFromPath() {
        var path = window.location.pathname.replace(/\/+$/, '');
        if (path.indexOf('/schedule/copa-beta') !== -1) return 'copa-beta';
        return 'drmbl';
    }

    var CURRENT_LEAGUE = getLeagueFromPath();

    function initLeagueSwitcher() {
        var btns = document.querySelectorAll('.league-btn');
        for (var i = 0; i < btns.length; i++) {
            if (btns[i].getAttribute('data-league') === CURRENT_LEAGUE) {
                btns[i].classList.add('active');
            }
        }

    }

    // Presentation config — maps week numbers to sponsor/label overrides
    var WEEK_META = {
        1:  { sponsor: 'Walmart' },
        2:  { sponsor: 'El Tacon Madre' },
        11: { label: 'Playoff Sunday' }
    };

    function formatDate(date) {
        if (!date || date === 'TBD') return 'TBD';
        if (typeof date === 'string') {
            if (date === 'TBD') return 'TBD';
            var parts = date.split('-');
            date = { year: parseInt(parts[0]), month: parseInt(parts[1]), date: parseInt(parts[2]) };
        }
        var months = ['January', 'February', 'March', 'April', 'May', 'June',
            'July', 'August', 'September', 'October', 'November', 'December'];
        return months[date.month - 1] + ' ' + date.date + ', ' + date.year;
    }

    function getTeamName(teams, id) {
        for (var i = 0; i < teams.length; i++) {
            if (teams[i].slot === id) return teams[i].name || 'TBD';
        }
        return id;
    }

    function findSponsor(name) {
        if (typeof SPONSORS === 'undefined') return null;
        for (var i = 0; i < SPONSORS.length; i++) {
            if (SPONSORS[i].name === name) return SPONSORS[i];
        }
        return null;
    }

    function buildWeekNav(weeks) {
        var nav = document.getElementById('week-nav-inner');
        var html = '';
        html += '<button type="button" class="week-tab active" data-week="all">All</button>';
        for (var i = 0; i < weeks.length; i++) {
            var w = weeks[i];
            var meta = WEEK_META[w.week] || {};
            var isPlayoff = w.type === 'playoffs';
            var cls = 'week-tab' + (isPlayoff ? ' week-tab-playoff' : '');
            var label = isPlayoff ? 'Playoffs' : 'Wk ' + w.week;
            html += '<button type="button" class="' + cls + '" data-week="' + i + '">' + label + '</button>';
        }
        nav.innerHTML = html;

        var tabs = nav.querySelectorAll('.week-tab');
        for (var j = 0; j < tabs.length; j++) {
            tabs[j].addEventListener('click', handleTabClick);
        }
    }

    function handleTabClick(e) {
        var weekVal = e.currentTarget.getAttribute('data-week');

        if (weekVal === 'all') {
            var hero = document.querySelector('.schedule-hero');
            if (hero) window.scrollTo({ top: 0, behavior: 'smooth' });
            return;
        }

        var target = document.querySelector('.week-section[data-week="' + weekVal + '"]');
        if (target) {
            var offset = document.querySelector('.week-nav').offsetHeight +
                document.querySelector('.site-header').offsetHeight;
            var top = target.getBoundingClientRect().top + window.pageYOffset - offset - 10;
            window.scrollTo({ top: top, behavior: 'smooth' });
        }
    }

    function updateActiveTab() {
        var sections = document.querySelectorAll('.week-section');
        var tabs = document.querySelectorAll('.week-tab');
        var offset = (document.querySelector('.week-nav') ? document.querySelector('.week-nav').offsetHeight : 0) +
            (document.querySelector('.site-header') ? document.querySelector('.site-header').offsetHeight : 0) + 20;
        var activeWeek = 'all';

        for (var i = 0; i < sections.length; i++) {
            var rect = sections[i].getBoundingClientRect();
            if (rect.top <= offset && rect.bottom > offset) {
                activeWeek = sections[i].getAttribute('data-week');
                break;
            }
        }

        for (var j = 0; j < tabs.length; j++) {
            tabs[j].classList.remove('active');
            if (tabs[j].getAttribute('data-week') === activeWeek) {
                tabs[j].classList.add('active');
            }
        }
    }

    var scrollTimer;
    window.addEventListener('scroll', function () {
        clearTimeout(scrollTimer);
        scrollTimer = setTimeout(updateActiveTab, 50);
    });

    function buildScheduleSkeleton(weeks) {
        var container = document.getElementById('schedule-content');
        var html = '';

        for (var i = 0; i < weeks.length; i++) {
            var w = weeks[i];
            var meta = WEEK_META[w.week] || {};
            var isPlayoff = w.type === 'playoffs';
            var isSeeded = w.type === 'seeded';
            var label = meta.label || ('Week ' + w.week);
            var sectionCls = 'week-section' + (isPlayoff ? ' week-section-playoff' : '') + (isSeeded ? ' week-section-seeded' : '');

            html += '<section class="' + sectionCls + '" data-week="' + i + '">';
            html += '<div class="week-header">';
            if (meta.sponsor) {
                var sp = findSponsor(meta.sponsor);
                html += '<div class="week-sponsor-bar">';
                html += '<h2 class="week-title">' + label + '</h2>';
                html += '<p class="week-sponsor">Presented by ' + meta.sponsor + '</p>';
                if (sp && sp.img) {
                    var spHref = sp.page ? '/' + sp.page : '/sponsor-bio.html?id=' + encodeURIComponent(sp.id);
                    html += '<a href="' + spHref + '" class="week-sponsor-logo week-sponsor-logo-' + sp.id + '"><img src="/' + sp.img + '" alt="' + sp.name + '"></a>';
                }
                html += '</div>';
            } else {
                html += '<h2 class="week-title">' + label + '</h2>';
            }
            html += '<p class="week-date">' + formatDate(w.date) + '</p>';
            if (w.note) {
                html += '<p class="week-note">' + w.note + '</p>';
            }
            html += '</div>';
            html += '<div class="games-grid">';

            for (var g = 0; g < w.games.length; g++) {
                var game = w.games[g];
                var awaySlot = (isPlayoff || isSeeded) ? game.away : game.away;
                var homeSlot = (isPlayoff || isSeeded) ? game.home : game.home;
                var cardCls = 'game-card' + (isPlayoff ? ' game-card-playoff' : '');
                var showSlot = !(isPlayoff || isSeeded);

                html += '<div class="' + cardCls + '">';
                html += '<div class="game-time">' + game.time + '</div>';
                html += '<div class="game-team game-team-away" ' + (showSlot ? 'data-slot="' + awaySlot + '"' : '') + '>' + (showSlot ? '<span class="team-name-loading"></span>' : awaySlot) + '</div>';
                html += '<div class="game-vs">VS</div>';
                html += '<div class="game-team game-team-home" ' + (showSlot ? 'data-slot="' + homeSlot + '"' : '') + '>' + (showSlot ? '<span class="team-name-loading"></span>' : homeSlot) + '</div>';

                if (isPlayoff && game.round) {
                    var roundCls = 'game-round';
                    if (game.round === 'Championship') roundCls += ' game-round-championship';
                    html += '<div class="game-label">' + '<span class="' + roundCls + '">' + game.round + '</span></div>';
                } else {
                    html += '<div class="game-label">Game ' + (g + 1) + '</div>';
                }

                html += '</div>';
            }

            html += '</div>';
            html += '</section>';
        }

        container.innerHTML = html;
    }

    function fillTeamNames(teams) {
        var slots = document.querySelectorAll('[data-slot]');
        for (var i = 0; i < slots.length; i++) {
            var slotId = slots[i].getAttribute('data-slot');
            slots[i].textContent = getTeamName(teams, slotId);
        }
    }

    // Fallback data for local/offline viewing
    var FALLBACK_TEAMS = [
        { "slot": "A", "name": "Wonderland" },
        { "slot": "B", "name": "DR Elite" },
        { "slot": "C", "name": "Air Ballers" },
        { "slot": "D", "name": "bbl crackin" },
        { "slot": "E", "name": null },
        { "slot": "F", "name": null },
        { "slot": "G", "name": null },
        { "slot": "H", "name": null }
    ];

    var FALLBACK_SCHEDULE = [
        { "week": 1, "date": "TBD", "games": [
            { "time": "9:00 AM",  "away": "A", "home": "H" },
            { "time": "10:00 AM", "away": "G", "home": "B" },
            { "time": "11:00 AM", "away": "C", "home": "F" },
            { "time": "12:00 PM", "away": "E", "home": "D" }
        ]},
        { "week": 2, "date": "TBD", "games": [
            { "time": "9:00 AM",  "away": "H", "home": "G" },
            { "time": "10:00 AM", "away": "F", "home": "A" },
            { "time": "11:00 AM", "away": "B", "home": "E" },
            { "time": "12:00 PM", "away": "D", "home": "C" }
        ]},
        { "week": 3, "date": "TBD", "games": [
            { "time": "9:00 AM",  "away": "F", "home": "H" },
            { "time": "10:00 AM", "away": "E", "home": "G" },
            { "time": "11:00 AM", "away": "A", "home": "D" },
            { "time": "12:00 PM", "away": "C", "home": "B" }
        ]},
        { "week": 4, "date": "TBD", "games": [
            { "time": "9:00 AM",  "away": "H", "home": "E" },
            { "time": "10:00 AM", "away": "F", "home": "D" },
            { "time": "11:00 AM", "away": "G", "home": "C" },
            { "time": "12:00 PM", "away": "B", "home": "A" }
        ]},
        { "week": 5, "date": "TBD", "games": [
            { "time": "9:00 AM",  "away": "D", "home": "H" },
            { "time": "10:00 AM", "away": "E", "home": "C" },
            { "time": "11:00 AM", "away": "F", "home": "B" },
            { "time": "12:00 PM", "away": "A", "home": "G" }
        ]},
        { "week": 6, "date": "TBD", "games": [
            { "time": "9:00 AM",  "away": "H", "home": "C" },
            { "time": "10:00 AM", "away": "D", "home": "B" },
            { "time": "11:00 AM", "away": "E", "home": "A" },
            { "time": "12:00 PM", "away": "G", "home": "F" }
        ]},
        { "week": 7, "date": "TBD", "games": [
            { "time": "9:00 AM",  "away": "B", "home": "H" },
            { "time": "10:00 AM", "away": "C", "home": "A" },
            { "time": "11:00 AM", "away": "D", "home": "G" },
            { "time": "12:00 PM", "away": "F", "home": "E" }
        ]},
        { "week": 8, "date": "TBD", "type": "seeded", "note": "Seeds determined by Week 7 standings", "games": [
            { "time": "9:00 AM",  "away": "#4 Seed", "home": "#1 Seed" },
            { "time": "10:00 AM", "away": "#3 Seed", "home": "#2 Seed" },
            { "time": "11:00 AM", "away": "#8 Seed", "home": "#5 Seed" },
            { "time": "12:00 PM", "away": "#7 Seed", "home": "#6 Seed" }
        ]},
        { "week": 9, "date": "TBD", "type": "seeded", "note": "Seeds determined by Week 7 standings", "games": [
            { "time": "9:00 AM",  "away": "#3 Seed", "home": "#1 Seed" },
            { "time": "10:00 AM", "away": "#4 Seed", "home": "#2 Seed" },
            { "time": "11:00 AM", "away": "#8 Seed", "home": "#5 Seed" },
            { "time": "12:00 PM", "away": "#7 Seed", "home": "#6 Seed" }
        ]},
        { "week": 10, "date": "TBD", "type": "seeded", "note": "Seeds determined by Week 7 standings", "games": [
            { "time": "9:00 AM",  "away": "#2 Seed", "home": "#1 Seed" },
            { "time": "10:00 AM", "away": "#4 Seed", "home": "#3 Seed" },
            { "time": "11:00 AM", "away": "#6 Seed", "home": "#5 Seed" },
            { "time": "12:00 PM", "away": "#8 Seed", "home": "#7 Seed" }
        ]},
        { "week": 11, "date": "TBD", "type": "playoffs", "games": [
            { "time": "9:00 AM",  "away": "#4 Seed", "home": "#1 Seed", "round": "Semifinal 1" },
            { "time": "10:30 AM", "away": "#3 Seed", "home": "#2 Seed", "round": "Semifinal 2" },
            { "time": "12:00 PM", "away": "Loser SF1", "home": "Loser SF2", "round": "3rd Place" },
            { "time": "1:30 PM",  "away": "Winner SF1", "home": "Winner SF2", "round": "Championship" }
        ]}
    ];

    function loadSeason() {
        // Step 1: Render skeleton immediately with fallback schedule
        buildWeekNav(FALLBACK_SCHEDULE);
        buildScheduleSkeleton(FALLBACK_SCHEDULE);

        // Step 2: Fetch teams from API and fill in names
        fetch('/api/season')
            .then(function (res) { return res.json(); })
            .then(function (data) {
                if (data && data.teams) {
                    fillTeamNames(data.teams);
                }
                // If API returns a different schedule structure, rebuild
                if (data && data.weeklySchedule &&
                    data.weeklySchedule.length !== FALLBACK_SCHEDULE.length) {
                    buildWeekNav(data.weeklySchedule);
                    buildScheduleSkeleton(data.weeklySchedule);
                    if (data.teams) fillTeamNames(data.teams);
                }
            })
            .catch(function () {
                // API unavailable (local dev) — fill with fallback team names
                fillTeamNames(FALLBACK_TEAMS);
            });
    }

    // ── COPA BETA ──────────────────────────────────────────

    // No hardcoded fallback — Copa Beta data comes entirely from API
    // Copa Beta active filters
    var cbFilters = { division: 'all', category: 'all', team: 'all', court: 'all' };
    var cbLiveGames = {};  // keyed by "away~home" team names
    var cbLiveTimer = null;

    function fetchLiveGames() {
        return fetch('/api/live-game')
            .then(function (res) { return res.json(); })
            .then(function (data) {
                var map = {};
                var games = data.games || [];
                for (var i = 0; i < games.length; i++) {
                    var g = games[i];
                    if (!g.boxScore || !g.boxScore.teamInfo) continue;
                    var bs = g.boxScore;
                    var status = bs.gameInfo && bs.gameInfo.general ? bs.gameInfo.general.status : '';
                    if (status === 'final') continue; // skip finished games
                    var away = bs.teamInfo.away.name;
                    var home = bs.teamInfo.home.name;
                    var quarter = bs.gameInfo && bs.gameInfo.state ? bs.gameInfo.state.currentQuarter : null;
                    var clock = bs.gameInfo && bs.gameInfo.state && bs.gameInfo.state.clock ? bs.gameInfo.state.clock.timeLeft : null;
                    // Use scheduleGameId as key for unique matching across divisions
                    var scheduleGameId = g.trackerState && g.trackerState.selectedGame ? g.trackerState.selectedGame.id : null;
                    var liveEntry = {
                        awayScore: bs.teamInfo.away.score.current,
                        homeScore: bs.teamInfo.home.score.current,
                        quarter: quarter,
                        clock: clock
                    };
                    if (scheduleGameId) {
                        map[scheduleGameId] = liveEntry;
                    } else {
                        // Fallback for older live games without scheduleGameId
                        map[away + '~' + home] = liveEntry;
                    }
                }
                cbLiveGames = map;
                return map;
            })
            .catch(function () { return {}; });
    }

    function formatClock(seconds) {
        if (seconds == null) return '';
        var m = Math.floor(seconds / 60);
        var s = seconds % 60;
        return m + ':' + (s < 10 ? '0' : '') + s;
    }

    function updateLiveCards() {
        var cards = document.querySelectorAll('.cb-court-card[data-away][data-home]');
        for (var i = 0; i < cards.length; i++) {
            var card = cards[i];
            var gameId = card.getAttribute('data-game-id');
            // Match by scheduleGameId first, fallback to team name key
            var live = gameId ? cbLiveGames[gameId] : null;
            if (!live) {
                var fallbackKey = card.getAttribute('data-away') + '~' + card.getAttribute('data-home');
                live = cbLiveGames[fallbackKey];
            }
            var matchupEl = card.querySelector('.cb-card-matchup');
            var badgeEl = card.querySelector('.cb-live-badge');
            var infoEl = card.querySelector('.cb-card-info');

            if (live) {
                // Add LIVE badge if not present
                if (!badgeEl && infoEl) {
                    var badge = document.createElement('div');
                    badge.className = 'cb-live-badge';
                    badge.textContent = 'LIVE';
                    infoEl.insertBefore(badge, infoEl.firstChild);
                }
                // Add live class to card
                card.classList.add('cb-card-live');

                // Update matchup with live scores
                if (matchupEl) {
                    var away = card.getAttribute('data-away');
                    var home = card.getAttribute('data-home');
                    var qLabel = live.quarter ? 'Q' + live.quarter : '';
                    var clockLabel = live.clock != null ? formatClock(live.clock) : '';
                    var liveInfo = qLabel + (clockLabel ? ' ' + clockLabel : '');

                    matchupEl.innerHTML =
                        '<span class="cb-card-team">' + away + '</span>' +
                        '<span class="cb-card-score cb-live-score">' + live.awayScore + '</span>' +
                        '<span class="cb-card-vs cb-live-info">' + liveInfo + '</span>' +
                        '<span class="cb-card-score cb-live-score">' + live.homeScore + '</span>' +
                        '<span class="cb-card-team">' + home + '</span>';
                }
            } else if (card.classList.contains('cb-card-live')) {
                // Game was live but no longer — restore with FINAL
                if (badgeEl) badgeEl.remove();
                card.classList.remove('cb-card-live');

                if (matchupEl) {
                    var away = card.getAttribute('data-away');
                    var home = card.getAttribute('data-home');
                    // Re-fetch schedule scores from the card's original data
                    // Show FINAL since the game must have ended
                    var oldScores = matchupEl.querySelectorAll('.cb-live-score');
                    var aScore = oldScores.length > 0 ? oldScores[0].textContent : '';
                    var hScore = oldScores.length > 1 ? oldScores[1].textContent : '';
                    matchupEl.innerHTML =
                        '<span class="cb-card-team">' + away + '</span>' +
                        '<span class="cb-card-score">' + aScore + '</span>' +
                        '<span class="cb-card-vs cb-card-final">FINAL</span>' +
                        '<span class="cb-card-score">' + hScore + '</span>' +
                        '<span class="cb-card-team">' + home + '</span>';
                }
            }
        }
    }

    function startLivePolling() {
        if (cbLiveTimer) return;
        // Initial fetch
        fetchLiveGames().then(function () { updateLiveCards(); });
        // Poll every 20 seconds
        cbLiveTimer = setInterval(function () {
            fetchLiveGames().then(function () { updateLiveCards(); });
        }, 20000);
    }

    function stopLivePolling() {
        if (cbLiveTimer) {
            clearInterval(cbLiveTimer);
            cbLiveTimer = null;
        }
    }
    var cbData = [];
    var cbSkeletonMode = false;
    var cbLeagueDivisions = null;

    function parseCopaBetaAPI(apiCategories) {
        return apiCategories.map(function (cat) {
            var div = cat.league && cat.league.divisions;
            var division = '';
            var category = '';
            if (div) {
                var divKeys = Object.keys(div);
                for (var dk = 0; dk < divKeys.length; dk++) {
                    var key = divKeys[dk];
                    if (div[key] && div[key].length) {
                        division = key.charAt(0).toUpperCase() + key.slice(1);
                        category = div[key][0];
                        break;
                    }
                }
            }
            // Strip location division info — just keep court
            var games = (cat.games || []).map(function (g) {
                var loc = g.location || '';
                var courtMatch = loc.match(/^(Court\s+\w+)/i);
                return {
                    id: g.id || null,
                    date: g.date, time: g.time,
                    location: courtMatch ? courtMatch[1] : loc,
                    away: g.away, home: g.home,
                    group: g.group || null, round: g.round || null,
                    homeScore: g.homeScore != null ? g.homeScore : null,
                    awayScore: g.awayScore != null ? g.awayScore : null,
                    winner: g.winner || null,
                    completion: g.completion || false
                };
            });
            return {
                id: (category + '-' + division).toLowerCase().replace(/\s+/g, '-'),
                division: division, category: category,
                teams: cat.teams || [], groups: cat.groups || null, games: games
            };
        });
    }

    function getCBDivisions() {
        if (cbLeagueDivisions) {
            var result = [];
            var keys = Object.keys(cbLeagueDivisions);
            for (var i = 0; i < keys.length; i++) {
                result.push(keys[i].charAt(0).toUpperCase() + keys[i].slice(1));
            }
            return result;
        }
        var seen = {};
        var fallback = [];
        for (var j = 0; j < cbData.length; j++) {
            if (!seen[cbData[j].division]) { seen[cbData[j].division] = true; fallback.push(cbData[j].division); }
        }
        return fallback;
    }

    function getCBCategories(divFilter) {
        if (cbLeagueDivisions) {
            var result = [];
            var keys = Object.keys(cbLeagueDivisions);
            for (var i = 0; i < keys.length; i++) {
                var divName = keys[i].charAt(0).toUpperCase() + keys[i].slice(1);
                if (divFilter !== 'all' && divName !== divFilter) continue;
                var cats = cbLeagueDivisions[keys[i]];
                for (var c = 0; c < cats.length; c++) {
                    result.push(cats[c]);
                }
            }
            return result;
        }
        var seen = {};
        var fallback = [];
        for (var j = 0; j < cbData.length; j++) {
            if (divFilter !== 'all' && cbData[j].division !== divFilter) continue;
            if (!seen[cbData[j].category]) { seen[cbData[j].category] = true; fallback.push(cbData[j].category); }
        }
        return fallback;
    }

    function getCBTeamsGrouped(data, divFilter, catFilter) {
        var groups = [];
        var seen = {};
        var divOrder = getCBDivisions();
        for (var di = 0; di < divOrder.length; di++) {
            var div = divOrder[di];
            for (var i = 0; i < data.length; i++) {
                if (data[i].division !== div) continue;
                if (divFilter !== 'all' && data[i].division !== divFilter) continue;
                if (catFilter !== 'all' && data[i].category !== catFilter) continue;
                var key = div + '|' + data[i].category;
                if (seen[key]) continue;
                seen[key] = true;
                var teamNames = [];
                for (var t = 0; t < data[i].teams.length; t++) {
                    var name = data[i].teams[t].name;
                    if (name) teamNames.push(name);
                }
                teamNames.sort();
                groups.push({ division: div, category: data[i].category, teams: teamNames });
            }
        }
        return groups;
    }

    var CB_COURTS = ['Court A', 'Court B', 'Court C'];

    function buildCBFilterBar() {
        var nav = document.getElementById('week-nav-inner');
        var divisions = getCBDivisions();
        var categories = getCBCategories(cbFilters.division);
        var teamGroups = getCBTeamsGrouped(cbData, cbFilters.division, cbFilters.category);

        var html = '<div class="cb-filters">';

        // Division filter
        html += '<select class="cb-filter-select" id="cb-filter-division">';
        html += '<option value="all">All Divisions</option>';
        for (var d = 0; d < divisions.length; d++) {
            var sel = cbFilters.division === divisions[d] ? ' selected' : '';
            html += '<option value="' + divisions[d] + '"' + sel + '>' + divisions[d] + '</option>';
        }
        html += '</select>';

        // Category filter
        html += '<select class="cb-filter-select" id="cb-filter-category">';
        html += '<option value="all">All Categories</option>';
        for (var c = 0; c < categories.length; c++) {
            var sel2 = cbFilters.category === categories[c] ? ' selected' : '';
            html += '<option value="' + categories[c] + '"' + sel2 + '>' + categories[c] + '</option>';
        }
        html += '</select>';

        // Court filter
        html += '<select class="cb-filter-select" id="cb-filter-court">';
        html += '<option value="all">All Courts</option>';
        for (var ct = 0; ct < CB_COURTS.length; ct++) {
            var sel4 = cbFilters.court === CB_COURTS[ct] ? ' selected' : '';
            html += '<option value="' + CB_COURTS[ct] + '"' + sel4 + '>' + CB_COURTS[ct] + '</option>';
        }
        html += '</select>';

        // Team filter (grouped by division + category)
        html += '<select class="cb-filter-select" id="cb-filter-team">';
        html += '<option value="all">All Teams</option>';
        for (var tg = 0; tg < teamGroups.length; tg++) {
            var grp = teamGroups[tg];
            html += '<optgroup label="' + grp.division + ' \u2014 ' + grp.category + '">';
            for (var t = 0; t < grp.teams.length; t++) {
                var sel3 = cbFilters.team === grp.teams[t] ? ' selected' : '';
                html += '<option value="' + grp.teams[t] + '"' + sel3 + '>' + grp.teams[t] + '</option>';
            }
            html += '</optgroup>';
        }
        html += '</select>';

        // Clear filters button
        var hasActiveFilter = cbFilters.division !== 'all' || cbFilters.category !== 'all' || cbFilters.court !== 'all' || cbFilters.team !== 'all';
        if (hasActiveFilter) {
            html += '<button type="button" class="cb-filter-clear" id="cb-filter-clear">&times; Clear</button>';
        }

        html += '</div>';
        nav.innerHTML = html;

        if (hasActiveFilter) {
            document.getElementById('cb-filter-clear').addEventListener('click', function () {
                cbFilters.division = 'all';
                cbFilters.category = 'all';
                cbFilters.court = 'all';
                cbFilters.team = 'all';
                buildCBFilterBar();
                buildCBSchedule();
            });
        }

        document.getElementById('cb-filter-division').addEventListener('change', function () {
            cbFilters.division = this.value;
            cbFilters.category = 'all';
            cbFilters.team = 'all';
            buildCBFilterBar();
            buildCBSchedule();
        });
        document.getElementById('cb-filter-category').addEventListener('change', function () {
            cbFilters.category = this.value;
            cbFilters.team = 'all';
            buildCBFilterBar();
            buildCBSchedule();
        });
        document.getElementById('cb-filter-court').addEventListener('change', function () {
            cbFilters.court = this.value;
            buildCBFilterBar();
            buildCBSchedule();
        });
        document.getElementById('cb-filter-team').addEventListener('change', function () {
            cbFilters.team = this.value;
            buildCBFilterBar();
            buildCBSchedule();
        });
    }

    function buildCBSchedule() {
        var container = document.getElementById('schedule-content');

        // Flatten all games across categories, attaching category metadata
        var allGames = [];
        for (var i = 0; i < cbData.length; i++) {
            var cat = cbData[i];
            if (cbFilters.division !== 'all' && cat.division !== cbFilters.division) continue;
            if (cbFilters.category !== 'all' && cat.category !== cbFilters.category) continue;

            for (var g = 0; g < cat.games.length; g++) {
                var game = cat.games[g];
                var isChamp = !!game.round;
                var awayName = isChamp ? game.away : getTeamName(cat.teams, game.away);
                var homeName = isChamp ? game.home : getTeamName(cat.teams, game.home);

                // Court filter
                if (cbFilters.court !== 'all' && game.location !== cbFilters.court) continue;

                // Team filter
                if (cbFilters.team !== 'all' && !isChamp) {
                    if (awayName !== cbFilters.team && homeName !== cbFilters.team) continue;
                }

                allGames.push({
                    date: game.date, time: game.time, location: game.location,
                    away: awayName, home: homeName,
                    awayScore: game.awayScore != null ? game.awayScore : null,
                    homeScore: game.homeScore != null ? game.homeScore : null,
                    division: cat.division, category: cat.category,
                    group: game.group || null, round: game.round || null,
                    isChamp: isChamp,
                    gameId: game.id || null
                });
            }
        }

        // Group games by date
        var dateGroups = [];
        var dateMap = {};
        for (var j = 0; j < allGames.length; j++) {
            var d = allGames[j].date;
            var key = d ? (d.year + '-' + d.month + '-' + d.date) : 'TBD';
            if (!dateMap[key]) {
                dateMap[key] = { date: d, games: [] };
                dateGroups.push(dateMap[key]);
            }
            dateMap[key].games.push(allGames[j]);
        }

        if (allGames.length === 0) {
            if (cbSkeletonMode) {
                // Show shimmer placeholder while loading
                var shimHtml = '';
                for (var sh = 0; sh < 2; sh++) {
                    shimHtml += '<section class="week-section cb-day-section">';
                    shimHtml += '<div class="week-header"><h2 class="week-title"><span class="team-name-loading" style="width:140px;height:20px"></span></h2></div>';
                    shimHtml += '<div class="cb-courts-grid cb-courts-3">';
                    for (var sc = 0; sc < 3; sc++) {
                        shimHtml += '<div class="cb-court-card">';
                        shimHtml += '<div class="cb-card-info">';
                        shimHtml += '<div><span class="team-name-loading" style="width:50px"></span></div>';
                        shimHtml += '<div><span class="team-name-loading" style="width:65px"></span></div>';
                        shimHtml += '</div>';
                        shimHtml += '<div class="cb-card-matchup">';
                        shimHtml += '<span class="team-name-loading" style="width:70px"></span>';
                        shimHtml += '<span class="cb-card-vs">vs</span>';
                        shimHtml += '<span class="team-name-loading" style="width:70px"></span>';
                        shimHtml += '</div>';
                        shimHtml += '</div>';
                    }
                    shimHtml += '</div>';
                    shimHtml += '</section>';
                }
                container.innerHTML = shimHtml;
                return;
            }
            container.innerHTML = '<div class="schedule-empty">No games match your filters.</div>';
            return;
        }

        // Determine which courts to show
        var courtsToShow = cbFilters.court !== 'all' ? [cbFilters.court] : CB_COURTS;

        var html = '';
        for (var s = 0; s < dateGroups.length; s++) {
            var dg = dateGroups[s];
            html += '<section class="week-section cb-day-section" data-week="' + s + '">';
            html += '<div class="week-header">';
            html += '<h2 class="week-title">' + formatDate(dg.date) + '</h2>';
            html += '</div>';

            // Find which courts have games on this date
            var activeCourts = [];
            if (cbFilters.court !== 'all') {
                activeCourts = [cbFilters.court];
            } else {
                var courtSeen = {};
                for (var ac = 0; ac < dg.games.length; ac++) {
                    var loc = dg.games[ac].location;
                    if (loc && !courtSeen[loc]) { courtSeen[loc] = true; activeCourts.push(loc); }
                }
                // Sort courts in order A, B, C
                activeCourts.sort();
            }

            // Build a map of court -> time -> game
            var courtTimeMap = {};
            var allTimes = [];
            var timesSeen = {};
            for (var ci = 0; ci < activeCourts.length; ci++) {
                courtTimeMap[activeCourts[ci]] = {};
            }
            for (var cg = 0; cg < dg.games.length; cg++) {
                var gm = dg.games[cg];
                if (courtTimeMap[gm.location]) {
                    courtTimeMap[gm.location][gm.time] = gm;
                }
                if (!timesSeen[gm.time]) {
                    timesSeen[gm.time] = true;
                    allTimes.push(gm.time);
                }
            }
            allTimes.sort(function (a, b) { return parseTime(a) - parseTime(b); });

            // Court headers row
            html += '<div class="cb-courts-grid cb-courts-' + activeCourts.length + '">';
            for (var ch = 0; ch < activeCourts.length; ch++) {
                html += '<div class="cb-court-header">' + activeCourts[ch] + '</div>';
            }
            html += '</div>';

            // Time slot rows
            for (var ti = 0; ti < allTimes.length; ti++) {
                var time = allTimes[ti];
                html += '<div class="cb-courts-grid cb-courts-' + activeCourts.length + ' cb-time-row">';

                for (var col = 0; col < activeCourts.length; col++) {
                    var gm = courtTimeMap[activeCourts[col]][time];
                    if (gm) {
                        if (cbSkeletonMode) {
                            html += '<div class="cb-court-card">';
                            html += '<div class="cb-card-court">' + activeCourts[col] + '</div>';
                            html += '<div class="cb-card-info">';
                            html += '<div class="cb-card-time">' + gm.time + '</div>';
                            html += '<div><span class="team-name-loading" style="width:50px"></span></div>';
                            html += '<div><span class="team-name-loading" style="width:65px"></span></div>';
                            html += '</div>';
                            html += '<div class="cb-card-matchup">';
                            html += '<span class="team-name-loading" style="width:70px"></span>';
                            html += '<span class="cb-card-vs">vs</span>';
                            html += '<span class="team-name-loading" style="width:70px"></span>';
                            html += '</div>';
                            html += '</div>';
                        } else {
                            var cardCls = 'cb-court-card' + (gm.isChamp ? ' cb-court-card-champ' : '');
                            html += '<div class="' + cardCls + ' cb-div-' + gm.division.toLowerCase() + '" data-away="' + gm.away + '" data-home="' + gm.home + '"' + (gm.gameId ? ' data-game-id="' + gm.gameId + '"' : '') + '>';
                            html += '<div class="cb-card-court">' + activeCourts[col] + '</div>';
                            html += '<div class="cb-card-info">';
                            html += '<div class="cb-card-time">' + gm.time + '</div>';
                            html += '<div class="cb-card-division cb-card-div-' + gm.division.toLowerCase() + '">' + gm.division + '</div>';
                            html += '<div class="cb-card-label">' + gm.category + '</div>';
                            if (gm.group) {
                                html += '<div class="cb-card-label">Group ' + gm.group + '</div>';
                            }
                            if (gm.round) {
                                var rCls = gm.round === 'Championship' ? ' game-round-championship' : '';
                                html += '<div class="cb-card-round' + rCls + '">' + gm.round + '</div>';
                            }
                            html += '</div>';
                            html += '<div class="cb-card-matchup">';
                            var hasScore = gm.awayScore != null && gm.homeScore != null;
                            html += '<span class="cb-card-team">' + gm.away + '</span>';
                            if (hasScore) {
                                html += '<span class="cb-card-score">' + gm.awayScore + '</span>';
                            }
                            html += '<span class="cb-card-vs' + (hasScore ? ' cb-card-final' : '') + '">' + (hasScore ? 'FINAL' : 'vs') + '</span>';
                            if (hasScore) {
                                html += '<span class="cb-card-score">' + gm.homeScore + '</span>';
                            }
                            html += '<span class="cb-card-team">' + gm.home + '</span>';
                            html += '</div>';
                            html += '</div>';
                        }
                    } else {
                        html += '<div class="cb-court-card cb-court-empty-slot"></div>';
                    }
                }

                html += '</div>';
            }

            html += '</div>';
            html += '</section>';
        }

        container.innerHTML = html;
    }

    function parseTime(t) {
        if (!t) return 0;
        var match = t.match(/(\d+):(\d+)\s*(AM|PM)/i);
        if (!match) return 0;
        var h = parseInt(match[1]);
        var m = parseInt(match[2]);
        var ampm = match[3].toUpperCase();
        if (ampm === 'PM' && h !== 12) h += 12;
        if (ampm === 'AM' && h === 12) h = 0;
        return h * 60 + m;
    }

    function loadCopaBeta() {
        // Step 1: Render skeleton with fallback structure
        cbSkeletonMode = true;
        cbData = [];
        buildCBSchedule();

        // Fetch real data from API
        fetch('/api/seasons?league=copa-beta')
            .then(function (res) { return res.json(); })
            .then(function (data) {
                if (data && data.leagueInfo && data.leagueInfo.divisions) {
                    cbLeagueDivisions = data.leagueInfo.divisions;
                }
                if (data && data.categories && data.categories.length) {
                    cbData = parseCopaBetaAPI(data.categories);
                } else {
                    cbData = [];
                }
                cbSkeletonMode = false;
                buildCBFilterBar();
                buildCBSchedule();
                startLivePolling();
            })
            .catch(function () {
                cbSkeletonMode = false;
                cbData = [];
                var wrap = document.getElementById('schedule-content');
                if (wrap) wrap.innerHTML = '<div class="schedule-empty">Unable to load schedule. Please try again later.</div>';
            });
    }

    function init() {
        initLeagueSwitcher();

        if (CURRENT_LEAGUE === 'copa-beta') {
            loadCopaBeta();
        } else {
            loadSeason();
        }
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();
