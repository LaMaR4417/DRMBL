(function () {
    // ── League mode detection ──
    function getLeagueFromPath() {
        var path = window.location.pathname.replace(/\/+$/, '');
        if (path.indexOf('/schedule/copa-beta') !== -1) return 'copa-beta';
        if (path.indexOf('/schedule/lomba') !== -1) return 'lomba';
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
        3:  { sponsor: 'Chick-fil-A Del Rio' },
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

    function showLoadingState() {
        var container = document.getElementById('schedule-content');
        container.innerHTML = '<div class="schedule-loading"><span class="team-name-loading" style="width:200px;height:24px;display:block;margin:40px auto;"></span></div>';
    }

    function loadSeason() {
        // Show shimmer while loading
        showLoadingState();

        fetch('/api/seasons?league=drmbl')
            .then(function (res) { return res.json(); })
            .then(function (data) {
                var season = data && data.season;
                if (!season || !season.weeklySchedule) return;
                buildWeekNav(season.weeklySchedule);
                buildScheduleSkeleton(season.weeklySchedule);
                if (season.teams) fillTeamNames(season.teams);
            })
            .catch(function () {
                var container = document.getElementById('schedule-content');
                container.innerHTML = '<p style="text-align:center;color:#888;padding:40px;">Unable to load schedule.</p>';
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
                var awayResolved = getTeamName(cat.teams, game.away);
                var homeResolved = getTeamName(cat.teams, game.home);
                var awayName = awayResolved || game.away;
                var homeName = homeResolved || game.home;

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
                        // Special label for Court B Sunday 10am
                        if (activeCourts[col] === 'Court B' && time === '10:00 AM' && dg.date && dg.date.date === 29) {
                            html += '<div class="cb-court-card cb-court-prep-slot">';
                            html += '<div class="cb-card-court">Court B</div>';
                            html += '<div class="cb-card-info"><div class="cb-card-time">10:00 AM</div></div>';
                            html += '<div class="cb-card-matchup"><span class="cb-card-prep-label">Preparaci\u00f3n de Cancha</span></div>';
                            html += '</div>';
                        } else {
                            html += '<div class="cb-court-card cb-court-empty-slot"></div>';
                        }
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

    // ── LOMBA ──────────────────────────────────────────

    var lombaLeagueData = null;
    var lombaSeasonsData = null;
    var lombaFilters = { gender: 'all', division: 'all', team: 'all', view: 'season' };

    function getLOMBAGenders() {
        if (!lombaLeagueData || !lombaLeagueData.league || !lombaLeagueData.league.seasons) return [];
        var genders = {};
        var seasons = lombaLeagueData.league.seasons;
        for (var i = 0; i < seasons.length; i++) {
            var divs = seasons[i].data.divisions;
            for (var g in divs) genders[g] = true;
        }
        return Object.keys(genders);
    }

    function getLOMBADivisions(gender) {
        if (!lombaLeagueData || !lombaLeagueData.league || !lombaLeagueData.league.seasons) return [];
        var divs = [];
        var seasons = lombaLeagueData.league.seasons;
        for (var i = 0; i < seasons.length; i++) {
            var genderDivs = seasons[i].data.divisions;
            if (gender === 'all') {
                for (var g in genderDivs) {
                    for (var d = 0; d < genderDivs[g].length; d++) {
                        if (divs.indexOf(genderDivs[g][d]) === -1) divs.push(genderDivs[g][d]);
                    }
                }
            } else if (genderDivs[gender]) {
                for (var d2 = 0; d2 < genderDivs[gender].length; d2++) {
                    if (divs.indexOf(genderDivs[gender][d2]) === -1) divs.push(genderDivs[gender][d2]);
                }
            }
        }
        return divs;
    }

    function getLOMBATeamsGrouped() {
        if (!lombaSeasonsData || !lombaLeagueData) return [];
        var groups = [];
        var leagueSeasons = lombaLeagueData.league.seasons || [];

        for (var ls = 0; ls < leagueSeasons.length; ls++) {
            var seasonName = leagueSeasons[ls].name;
            var divisions = leagueSeasons[ls].data.divisions;
            var genders = Object.keys(divisions);

            for (var gi = 0; gi < genders.length; gi++) {
                var gender = genders[gi];
                if (lombaFilters.gender !== 'all' && lombaFilters.gender !== gender) continue;

                var divList = divisions[gender];
                for (var di = 0; di < divList.length; di++) {
                    var divName = divList[di];
                    if (lombaFilters.division !== 'all' && lombaFilters.division !== divName) continue;

                    var genderKey = 'league.seasons.data.divisions.' + gender;
                    for (var si = 0; si < lombaSeasonsData.length; si++) {
                        var s = lombaSeasonsData[si];
                        if (s.league && s.league.season &&
                            s.league.season['league.seasons.name'] === seasonName &&
                            s.league.season[genderKey] === divName) {
                            var teams = (s.teams || []).slice().sort(function (a, b) {
                                return a.name.localeCompare(b.name);
                            });
                            if (teams.length > 0) {
                                var gLabel = gender.charAt(0).toUpperCase() + gender.slice(1);
                                groups.push({
                                    label: gLabel + ' \u2014 ' + divName,
                                    seasonId: s.id,
                                    gender: gender,
                                    division: divName,
                                    teams: teams
                                });
                            }
                            break;
                        }
                    }
                }
            }
        }
        return groups;
    }

    function findTeamInfoBySeasonId(seasonId) {
        if (!lombaSeasonsData) return null;
        for (var si = 0; si < lombaSeasonsData.length; si++) {
            var s = lombaSeasonsData[si];
            if (s.id === seasonId && s.league && s.league.season) {
                var season = s.league.season;
                for (var key in season) {
                    if (key.indexOf('league.seasons.data.divisions.') === 0) {
                        var gender = key.replace('league.seasons.data.divisions.', '');
                        return { gender: gender, division: season[key] };
                    }
                }
            }
        }
        return null;
    }

    function buildLOMBAFilterBar() {
        var nav = document.getElementById('week-nav-inner');
        if (!nav) return;

        var genders = getLOMBAGenders();
        var divisions = getLOMBADivisions(lombaFilters.gender);
        var teamGroups = getLOMBATeamsGrouped();

        var html = '';

        // View toggle
        html += '<div class="lomba-view-toggle">';
        html += '<button type="button" class="lomba-view-btn' + (lombaFilters.view === 'season' ? ' active' : '') + '" data-view="season">Temporada</button>';
        html += '<button type="button" class="lomba-view-btn' + (lombaFilters.view === 'playoffs' ? ' active' : '') + '" data-view="playoffs">Playoffs</button>';
        html += '</div>';

        if (lombaFilters.view === 'playoffs') {
            nav.innerHTML = html;
            nav.querySelectorAll('.lomba-view-btn').forEach(function (btn) {
                btn.addEventListener('click', function () {
                    lombaFilters.view = this.getAttribute('data-view');
                    buildLOMBAFilterBar();
                    renderLOMBASchedule();
                });
            });
            return;
        }

        // Gender filter
        html += '<select class="lomba-sched-filter" id="lomba-sched-gender">';
        html += '<option value="all">All Categories</option>';
        for (var g = 0; g < genders.length; g++) {
            var label = genders[g].charAt(0).toUpperCase() + genders[g].slice(1);
            var sel = lombaFilters.gender === genders[g] ? ' selected' : '';
            html += '<option value="' + genders[g] + '"' + sel + '>' + label + '</option>';
        }
        html += '</select>';

        // Division filter
        html += '<select class="lomba-sched-filter" id="lomba-sched-division">';
        html += '<option value="all">All Divisions</option>';
        for (var d = 0; d < divisions.length; d++) {
            var sel2 = lombaFilters.division === divisions[d] ? ' selected' : '';
            html += '<option value="' + divisions[d] + '"' + sel2 + '>' + divisions[d] + '</option>';
        }
        html += '</select>';

        // Team filter (grouped by division, value = seasonId::teamName)
        html += '<select class="lomba-sched-filter" id="lomba-sched-team">';
        html += '<option value="all">All Teams</option>';
        for (var tg = 0; tg < teamGroups.length; tg++) {
            var grp = teamGroups[tg];
            html += '<optgroup label="' + grp.label + '">';
            for (var ti = 0; ti < grp.teams.length; ti++) {
                var teamVal = grp.seasonId + '::' + grp.teams[ti].name;
                var sel3 = lombaFilters.team === teamVal ? ' selected' : '';
                html += '<option value="' + teamVal + '"' + sel3 + '>' + grp.teams[ti].name + '</option>';
            }
            html += '</optgroup>';
        }
        html += '</select>';

        var hasFilter = lombaFilters.gender !== 'all' || lombaFilters.division !== 'all' || lombaFilters.team !== 'all';
        if (hasFilter) {
            html += '<button type="button" class="lomba-sched-clear" id="lomba-sched-clear">&times;</button>';
        }

        nav.innerHTML = html;

        nav.querySelectorAll('.lomba-view-btn').forEach(function (btn) {
            btn.addEventListener('click', function () {
                lombaFilters.view = this.getAttribute('data-view');
                buildLOMBAFilterBar();
                renderLOMBASchedule();
            });
        });

        document.getElementById('lomba-sched-gender').addEventListener('change', function () {
            lombaFilters.gender = this.value;
            lombaFilters.division = 'all';
            lombaFilters.team = 'all';
            buildLOMBAFilterBar();
            renderLOMBASchedule();
        });
        document.getElementById('lomba-sched-division').addEventListener('change', function () {
            lombaFilters.division = this.value;
            lombaFilters.team = 'all';
            buildLOMBAFilterBar();
            renderLOMBASchedule();
        });
        document.getElementById('lomba-sched-team').addEventListener('change', function () {
            lombaFilters.team = this.value;
            // Auto-filter to team's division and gender
            if (this.value !== 'all') {
                var parts = this.value.split('::');
                var seasonId = parts[0];
                var info = findTeamInfoBySeasonId(seasonId);
                if (info) {
                    lombaFilters.gender = info.gender;
                    lombaFilters.division = info.division;
                }
            }
            buildLOMBAFilterBar();
            renderLOMBASchedule();
        });
        if (hasFilter) {
            document.getElementById('lomba-sched-clear').addEventListener('click', function () {
                lombaFilters.gender = 'all';
                lombaFilters.division = 'all';
                lombaFilters.team = 'all';
                buildLOMBAFilterBar();
                renderLOMBASchedule();
            });
        }
    }

    function getFilteredLOMBASeasons() {
        if (!lombaSeasonsData || !lombaLeagueData) return [];
        var result = [];
        var leagueSeasons = lombaLeagueData.league.seasons || [];

        for (var ls = 0; ls < leagueSeasons.length; ls++) {
            var seasonName = leagueSeasons[ls].name;
            var divisions = leagueSeasons[ls].data.divisions;
            var genders = Object.keys(divisions);

            for (var gi = 0; gi < genders.length; gi++) {
                var gender = genders[gi];
                if (lombaFilters.gender !== 'all' && lombaFilters.gender !== gender) continue;

                var divList = divisions[gender];
                for (var di = 0; di < divList.length; di++) {
                    var divName = divList[di];
                    if (lombaFilters.division !== 'all' && lombaFilters.division !== divName) continue;

                    var genderKey = 'league.seasons.data.divisions.' + gender;
                    for (var si = 0; si < lombaSeasonsData.length; si++) {
                        var s = lombaSeasonsData[si];
                        if (s.league && s.league.season &&
                            s.league.season['league.seasons.name'] === seasonName &&
                            s.league.season[genderKey] === divName) {
                            result.push({
                                season: s,
                                gender: gender,
                                division: divName
                            });
                            break;
                        }
                    }
                }
            }
        }
        return result;
    }

    function parseTimeForSort(timeStr) {
        var parsed = normalizeLOMBATime(timeStr);
        if (!parsed) return 0;
        return parsed.hours * 60 + parsed.minutes;
    }

    function formatHourDisplay(hour) {
        var ampm = hour >= 12 ? 'PM' : 'AM';
        var h = hour % 12 || 12;
        return h + ' ' + ampm;
    }

    function normalizeLOMBATime(timeStr) {
        if (!timeStr) return null;
        // Handle "8:00:00 p.m." or "8:00:00 a.m." format
        var s = timeStr.trim().toLowerCase();
        s = s.replace(/\./g, '').replace(/\s+/g, ' '); // "8:00:00 pm"
        var match = s.match(/^(\d+):(\d+)(?::(\d+))?\s*(am|pm)$/);
        if (!match) return null;
        var h = parseInt(match[1]);
        var m = parseInt(match[2]);
        var period = match[4];
        if (period === 'pm' && h !== 12) h += 12;
        if (period === 'am' && h === 12) h = 0;
        return { hours: h, minutes: m };
    }

    function getTimeGroupKey(timeStr) {
        var parsed = normalizeLOMBATime(timeStr);
        if (!parsed) return 'unscheduled';
        return parsed.hours;
    }

    function buildLOMBAGameCard(gEntry) {
        var game = gEntry.game;
        var isForfeit = game.forfeit === true;
        var hasResult = game.homeScore !== undefined && game.homeScore !== null;
        var winnerIsHome = game.winner === 'home';
        var winnerIsAway = game.winner === 'away';

        var cardCls = 'lomba-card';
        if (isForfeit) cardCls += ' lomba-forfeit';
        if (hasResult) cardCls += ' lomba-final';

        var html = '<div class="' + cardCls + '">';

        // Division tag at top
        html += '<div class="lomba-card-division">' + gEntry.gender + ' — ' + gEntry.division + '</div>';

        // Matchup
        html += '<div class="lomba-card-matchup">';

        // Away
        html += '<div class="lomba-card-team' + (hasResult && winnerIsAway ? ' lomba-winner' : '') + '">';
        html += '<span class="lomba-card-name">' + game.away + '</span>';
        if (hasResult) html += '<span class="lomba-card-score">' + game.awayScore + '</span>';
        html += '</div>';

        // Divider
        html += '<div class="lomba-card-vs">' + (hasResult ? 'FINAL' : 'VS') + '</div>';

        // Home
        html += '<div class="lomba-card-team' + (hasResult && winnerIsHome ? ' lomba-winner' : '') + '">';
        html += '<span class="lomba-card-name">' + game.home + '</span>';
        if (hasResult) html += '<span class="lomba-card-score">' + game.homeScore + '</span>';
        html += '</div>';

        html += '</div>'; // end matchup

        // Footer: forfeit badge + notes
        if (isForfeit || game.notes) {
            html += '<div class="lomba-card-footer">';
            if (isForfeit) html += '<span class="lomba-forfeit-badge">FORFEIT</span>';
            if (game.notes) html += '<span class="lomba-card-note">' + game.notes + '</span>';
            html += '</div>';
        }

        html += '</div>';
        return html;
    }

    function collectLOMBAGames(filtered) {
        var allGames = [];
        for (var f = 0; f < filtered.length; f++) {
            var entry = filtered[f];
            var schedule = entry.season.schedule || [];
            var genderLabel = entry.gender.charAt(0).toUpperCase() + entry.gender.slice(1);

            for (var s = 0; s < schedule.length; s++) {
                var games = schedule[s].games || [];
                for (var g = 0; g < games.length; g++) {
                    if (lombaFilters.team !== 'all') {
                        var teamName = lombaFilters.team.split('::')[1];
                        if (games[g].home !== teamName && games[g].away !== teamName) continue;
                    }
                    allGames.push({
                        game: games[g],
                        date: schedule[s].date,
                        gender: genderLabel,
                        division: entry.division
                    });
                }
            }
        }
        return allGames;
    }

    function renderLOMBAByMatchup(container, allGames) {
        var teamName = lombaFilters.team.split('::')[1];

        // Group by opponent
        var oppMap = {};
        for (var i = 0; i < allGames.length; i++) {
            var g = allGames[i];
            var opp = g.game.home === teamName ? g.game.away : g.game.home;
            if (!oppMap[opp]) oppMap[opp] = { games: [], wins: 0, losses: 0, division: g.division, gender: g.gender };
            oppMap[opp].games.push(g);
            var isHome = g.game.home === teamName;
            var won = (g.game.winner === 'home' && isHome) || (g.game.winner === 'away' && !isHome);
            if (won) oppMap[opp].wins++;
            else oppMap[opp].losses++;
        }

        var opponents = Object.keys(oppMap).sort();

        if (opponents.length === 0) {
            container.innerHTML = '<div class="schedule-empty">No games found.</div>';
            return;
        }

        var html = '';
        for (var oi = 0; oi < opponents.length; oi++) {
            var opp = opponents[oi];
            var data = oppMap[opp];

            html += '<section class="week-section">';
            html += '<div class="week-header">';
            html += '<h2 class="week-title">vs ' + opp + ' (' + data.wins + '-' + data.losses + ')</h2>';
            html += '<p class="lomba-matchup-division">' + data.gender + ' \u2014 ' + data.division + '</p>';
            html += '</div>';

            html += '<div class="lomba-time-games">';
            for (var gi = 0; gi < data.games.length; gi++) {
                html += buildLOMBAGameCard(data.games[gi]);
            }
            html += '</div>';

            html += '</section>';
        }

        container.innerHTML = html;
    }

    function renderLOMBAByDate(container, allGames) {
        // Group by date
        var dateMap = {};
        for (var i = 0; i < allGames.length; i++) {
            var g = allGames[i];
            var d = g.date;
            var dateKey = d.year + '-' + String(d.month).padStart(2, '0') + '-' + String(d.date).padStart(2, '0');
            if (!dateMap[dateKey]) dateMap[dateKey] = { date: d, games: [] };
            dateMap[dateKey].games.push(g);
        }

        var dateKeys = Object.keys(dateMap).sort();

        if (dateKeys.length === 0) {
            container.innerHTML = '<div class="schedule-empty">No games scheduled yet.</div>';
            return;
        }

        var months = ['January', 'February', 'March', 'April', 'May', 'June',
            'July', 'August', 'September', 'October', 'November', 'December'];

        var html = '';
        for (var dk = 0; dk < dateKeys.length; dk++) {
            var group = dateMap[dateKeys[dk]];
            var d = group.date;
            var dateStr = months[d.month - 1] + ' ' + d.date + ', ' + d.year;

            group.games.sort(function (a, b) {
                return parseTimeForSort(a.game.time) - parseTimeForSort(b.game.time);
            });

            // Sub-group by hour
            var timeGroups = [];
            var timeMap = {};
            for (var gi = 0; gi < group.games.length; gi++) {
                var timeKey = getTimeGroupKey(group.games[gi].game.time);
                if (!timeMap[timeKey]) {
                    timeMap[timeKey] = { time: group.games[gi].game.time, games: [] };
                    timeGroups.push(timeMap[timeKey]);
                }
                timeMap[timeKey].games.push(group.games[gi]);
            }

            html += '<section class="week-section" data-week="' + dk + '">';
            html += '<div class="week-header">';
            html += '<h2 class="week-title">' + dateStr + '</h2>';
            html += '</div>';

            for (var ti = 0; ti < timeGroups.length; ti++) {
                var tg = timeGroups[ti];
                var hourKey = getTimeGroupKey(tg.time);
                var timeDisplay = hourKey !== 'unscheduled' ? formatHourDisplay(hourKey) : '';

                html += '<div class="lomba-time-group">';
                if (timeDisplay) {
                    html += '<div class="lomba-time-header">' + timeDisplay + '</div>';
                }
                html += '<div class="lomba-time-games">';
                for (var tgi = 0; tgi < tg.games.length; tgi++) {
                    html += buildLOMBAGameCard(tg.games[tgi]);
                }
                html += '</div>';
                html += '</div>';
            }

            html += '</section>';
        }

        container.innerHTML = html;
    }

    function renderLOMBAPlayoffs(container) {
        if (!lombaSeasonsData) { container.innerHTML = ''; return; }

        var html = '';
        var leagueSeasons = lombaLeagueData && lombaLeagueData.league ? lombaLeagueData.league.seasons : [];

        for (var ls = 0; ls < leagueSeasons.length; ls++) {
            var seasonName = leagueSeasons[ls].name;
            var divisions = leagueSeasons[ls].data.divisions;
            var genders = Object.keys(divisions);

            for (var gi = 0; gi < genders.length; gi++) {
                var gender = genders[gi];
                var genderLabel = gender.charAt(0).toUpperCase() + gender.slice(1);
                var divList = divisions[gender];

                for (var di = 0; di < divList.length; di++) {
                    var divName = divList[di];
                    var genderKey = 'league.seasons.data.divisions.' + gender;

                    var matchSeason = null;
                    for (var si = 0; si < lombaSeasonsData.length; si++) {
                        var s = lombaSeasonsData[si];
                        if (s.league && s.league.season &&
                            s.league.season['league.seasons.name'] === seasonName &&
                            s.league.season[genderKey] === divName) {
                            matchSeason = s;
                            break;
                        }
                    }

                    if (!matchSeason || !matchSeason.playoffs) continue;
                    var playoffs = matchSeason.playoffs;

                    html += '<section class="lomba-playoff-section">';
                    html += '<div class="week-header"><h2 class="week-title">' + genderLabel + ' — ' + divName + '</h2></div>';

                    var rounds = [
                        { key: 'quarterFinals', label: 'Cuartos de Final', series: playoffs.quarterFinals || [] },
                        { key: 'semiFinals', label: 'Semifinales', series: playoffs.semiFinals || [] },
                        { key: 'championship', label: 'Final', series: playoffs.championship ? [playoffs.championship] : [] }
                    ];

                    for (var r = 0; r < rounds.length; r++) {
                        var round = rounds[r];
                        var seriesList = round.series;
                        var hasContent = false;
                        for (var ch = 0; ch < seriesList.length; ch++) {
                            if (seriesList[ch] && (seriesList[ch].name1 || seriesList[ch].name2)) { hasContent = true; break; }
                        }
                        if (!hasContent) continue;

                        html += '<div class="lomba-playoff-round">';
                        html += '<h3 class="lomba-playoff-round-label">' + round.label + '</h3>';

                        for (var si2 = 0; si2 < seriesList.length; si2++) {
                            var series = seriesList[si2];
                            if (!series || (!series.name1 && !series.name2)) continue;

                            var isOver = series.seed1Wins >= 2 || series.seed2Wins >= 2;
                            var seriesTitle = '#' + series.seed1 + ' ' + series.name1 + ' vs #' + series.seed2 + ' ' + series.name2;

                            html += '<div class="lomba-matchup-section">';
                            html += '<h3 class="lomba-matchup-title">' + seriesTitle + ' (' + series.seed1Wins + '-' + series.seed2Wins + ')</h3>';
                            html += '<p class="lomba-matchup-division">' + genderLabel + ' — ' + divName + '</p>';

                            html += '<div class="lomba-time-games lomba-playoff-games">';

                            var games = series.games || [];
                            for (var gmi = 0; gmi < games.length; gmi++) {
                                var gm = games[gmi];
                                if (gm === null) continue;
                                var gmComplete = gm.completion;
                                var gmWinnerHome = gm.winner === 'home';
                                var gmWinnerAway = gm.winner === 'away';
                                var isForfeit = gm.forfeit && gmComplete;

                                html += '<div class="lomba-card' + (gmComplete ? ' lomba-final' : '') + (isForfeit ? ' lomba-forfeit' : '') + '">';
                                html += '<div class="lomba-card-division">Juego ' + (gmi + 1) + '</div>';
                                html += '<div class="lomba-card-matchup">';
                                html += '<div class="lomba-card-team' + (gmComplete && gmWinnerAway ? ' lomba-winner' : '') + '">';
                                html += '<span class="lomba-card-name">' + gm.away + '</span>';
                                if (gmComplete) html += '<span class="lomba-card-score">' + gm.awayScore + '</span>';
                                html += '</div>';
                                html += '<div class="lomba-card-vs">' + (gmComplete ? 'FINAL' : 'VS') + '</div>';
                                html += '<div class="lomba-card-team' + (gmComplete && gmWinnerHome ? ' lomba-winner' : '') + '">';
                                html += '<span class="lomba-card-name">' + gm.home + '</span>';
                                if (gmComplete) html += '<span class="lomba-card-score">' + gm.homeScore + '</span>';
                                html += '</div>';
                                html += '</div>';
                                if (isForfeit) html += '<div class="lomba-card-footer"><span class="lomba-forfeit-badge">FORFEIT</span></div>';
                                html += '</div>';
                            }

                            html += '</div>';
                            html += '</div>';
                        }

                        html += '</div>';
                    }

                    html += '</section>';
                }
            }
        }

        if (!html) {
            html = '<div class="schedule-empty">No hay playoffs disponibles.</div>';
        }

        container.innerHTML = html;
    }

    function renderLOMBASchedule() {
        var container = document.getElementById('schedule-content');

        if (lombaFilters.view === 'playoffs') {
            renderLOMBAPlayoffs(container);
            return;
        }

        var filtered = getFilteredLOMBASeasons();
        var allGames = collectLOMBAGames(filtered);

        if (lombaFilters.team !== 'all') {
            renderLOMBAByMatchup(container, allGames);
        } else {
            renderLOMBAByDate(container, allGames);
        }
    }

    function showLOMBAScheduleShimmer() {
        var container = document.getElementById('schedule-content');
        var html = '';
        for (var i = 0; i < 3; i++) {
            html += '<section class="week-section">';
            html += '<div class="week-header"><h2 class="week-title"><span class="shimmer-block" style="width:200px;height:24px;display:inline-block"></span></h2></div>';
            html += '<div class="games-grid">';
            for (var g = 0; g < 4; g++) {
                html += '<div class="game-card">';
                html += '<div class="game-time"><span class="shimmer-block" style="width:50px;height:16px;display:inline-block"></span></div>';
                html += '<div class="game-team game-team-away"><span class="shimmer-block" style="width:100px;height:16px;display:inline-block"></span></div>';
                html += '<div class="game-vs">VS</div>';
                html += '<div class="game-team game-team-home"><span class="shimmer-block" style="width:100px;height:16px;display:inline-block"></span></div>';
                html += '<div class="game-label"><span class="shimmer-block" style="width:60px;height:14px;display:inline-block"></span></div>';
                html += '</div>';
            }
            html += '</div></section>';
        }
        container.innerHTML = html;
    }

    function loadLOMBA() {
        showLOMBAScheduleShimmer();

        fetch('/api/seasons?league=lomba')
            .then(function (r) { return r.json(); })
            .then(function (data) {
                lombaLeagueData = { league: data.leagueInfo };
                lombaSeasonsData = data.seasons || [];
                buildLOMBAFilterBar();
                renderLOMBASchedule();
            })
            .catch(function (err) {
                console.error('LOMBA schedule error:', err);
                var container = document.getElementById('schedule-content');
                container.innerHTML = '<div class="schedule-empty">Unable to load schedule. Please try again later.</div>';
            });
    }

    function init() {
        initLeagueSwitcher();

        if (CURRENT_LEAGUE === 'copa-beta') {
            loadCopaBeta();
        } else if (CURRENT_LEAGUE === 'lomba') {
            loadLOMBA();
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
