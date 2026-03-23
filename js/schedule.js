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

    // Fallback data for all Copa Beta categories
    var CB_FALLBACK = [
        {
            id: '2009-2010-femenil', division: 'Femenil', category: '2009-2010',
            teams: [
                { slot: 'A', name: 'Ballers' }, { slot: 'B', name: 'Linces' },
                { slot: 'C', name: "Tota's Team" }, { slot: 'D', name: 'Genesis Dream' }
            ],
            groups: null,
            games: [
                { date: { year: 2026, month: 3, date: 28 }, time: '9:00 AM', location: 'Court A', away: 'B', home: 'C' },
                { date: { year: 2026, month: 3, date: 28 }, time: '11:00 AM', location: 'Court C', away: 'C', home: 'D' },
                { date: { year: 2026, month: 3, date: 28 }, time: '1:00 PM', location: 'Court A', away: 'D', home: 'A' },
                { date: { year: 2026, month: 3, date: 28 }, time: '5:00 PM', location: 'Court C', away: 'A', home: 'B' },
                { date: { year: 2026, month: 3, date: 29 }, time: '4:00 PM', location: 'Court B', away: '#2 Seed', home: '#1 Seed', round: 'Championship' }
            ]
        },
        {
            id: '2013-2014-femenil', division: 'Femenil', category: '2013-2014',
            teams: [
                { slot: 'A', name: 'Linces' }, { slot: 'B', name: 'Spurs Acuna' },
                { slot: 'C', name: 'Spurs Monclova' }, { slot: 'D', name: 'Alfa y Omega' }
            ],
            groups: null,
            games: [
                { date: { year: 2026, month: 3, date: 28 }, time: '9:00 AM', location: 'Court C', away: 'A', home: 'B' },
                { date: { year: 2026, month: 3, date: 28 }, time: '10:00 AM', location: 'Court C', away: 'C', home: 'D' },
                { date: { year: 2026, month: 3, date: 28 }, time: '12:00 PM', location: 'Court C', away: 'B', home: 'D' },
                { date: { year: 2026, month: 3, date: 28 }, time: '2:00 PM', location: 'Court C', away: 'A', home: 'C' },
                { date: { year: 2026, month: 3, date: 29 }, time: '12:00 PM', location: 'Court B', away: '#2 Seed', home: '#1 Seed', round: 'Championship' }
            ]
        },
        {
            id: '2009-2010-varonil', division: 'Varonil', category: '2009-2010',
            teams: [
                { slot: 'A', name: 'Betas' }, { slot: 'B', name: 'Leones' },
                { slot: 'C', name: 'Carneros' }, { slot: 'D', name: 'Sigmas' },
                { slot: 'E', name: 'Ballers' }, { slot: 'F', name: "Tota's Boys" },
                { slot: 'G', name: 'Sonics' }
            ],
            groups: { A: ['D', 'A', 'B', 'G'], B: ['F', 'C', 'E'] },
            games: [
                { date: { year: 2026, month: 3, date: 28 }, time: '5:00 PM', location: 'Court A', away: 'A', home: 'B', group: 'A' },
                { date: { year: 2026, month: 3, date: 28 }, time: '6:00 PM', location: 'Court A', away: 'C', home: 'E', group: 'B' },
                { date: { year: 2026, month: 3, date: 28 }, time: '8:00 PM', location: 'Court A', away: 'F', home: 'C', group: 'B' },
                { date: { year: 2026, month: 3, date: 28 }, time: '8:00 PM', location: 'Court B', away: 'B', home: 'G', group: 'A' },
                { date: { year: 2026, month: 3, date: 29 }, time: '9:00 AM', location: 'Court A', away: 'D', home: 'A', group: 'A' },
                { date: { year: 2026, month: 3, date: 29 }, time: '11:00 AM', location: 'Court A', away: 'G', home: 'D', group: 'A' },
                { date: { year: 2026, month: 3, date: 29 }, time: '1:00 PM', location: 'Court A', away: 'E', home: 'F', group: 'B' },
                { date: { year: 2026, month: 3, date: 29 }, time: '3:00 PM', location: 'Court A', away: '#2 Seed', home: '#1 Seed', round: 'Championship' }
            ]
        },
        {
            id: '2011-2012-varonil', division: 'Varonil', category: '2011-2012',
            teams: [
                { slot: 'A', name: 'Ballers' }, { slot: 'B', name: 'Centauros' },
                { slot: 'C', name: 'Titanes' }, { slot: 'D', name: 'Alfa y Omega' },
                { slot: 'E', name: 'Betas' }, { slot: 'F', name: "Tota's Boys" }
            ],
            groups: { A: ['B', 'E', 'F'], B: ['D', 'C', 'A'] },
            games: [
                { date: { year: 2026, month: 3, date: 28 }, time: '10:00 AM', location: 'Court A', away: 'E', home: 'F', group: 'A' },
                { date: { year: 2026, month: 3, date: 28 }, time: '2:00 PM', location: 'Court A', away: 'D', home: 'C', group: 'B' },
                { date: { year: 2026, month: 3, date: 28 }, time: '3:00 PM', location: 'Court C', away: 'B', home: 'E', group: 'A' },
                { date: { year: 2026, month: 3, date: 28 }, time: '4:00 PM', location: 'Court C', away: 'A', home: 'D', group: 'B' },
                { date: { year: 2026, month: 3, date: 29 }, time: '10:00 AM', location: 'Court A', away: 'C', home: 'A', group: 'B' },
                { date: { year: 2026, month: 3, date: 29 }, time: '11:00 AM', location: 'Court B', away: 'F', home: 'B', group: 'A' },
                { date: { year: 2026, month: 3, date: 29 }, time: '3:00 PM', location: 'Court B', away: '#2 Seed', home: '#1 Seed', round: 'Championship' }
            ]
        },
        {
            id: '2013-2014-varonil', division: 'Varonil', category: '2013-2014',
            teams: [
                { slot: 'A', name: 'Betas' }, { slot: 'B', name: 'Leones' },
                { slot: 'C', name: 'Spurs Monclova' }, { slot: 'D', name: 'Alfa y Omega' }
            ],
            groups: null,
            games: [
                { date: { year: 2026, month: 3, date: 28 }, time: '11:00 AM', location: 'Court B', away: 'A', home: 'B' },
                { date: { year: 2026, month: 3, date: 28 }, time: '12:00 PM', location: 'Court A', away: 'C', home: 'D' },
                { date: { year: 2026, month: 3, date: 28 }, time: '6:00 PM', location: 'Court C', away: 'B', home: 'D' },
                { date: { year: 2026, month: 3, date: 28 }, time: '7:00 PM', location: 'Court C', away: 'A', home: 'C' },
                { date: { year: 2026, month: 3, date: 29 }, time: '2:00 PM', location: 'Court B', away: '#2 Seed', home: '#1 Seed', round: 'Championship' }
            ]
        },
        {
            id: '2015-2016-varonil', division: 'Varonil', category: '2015-2016',
            teams: [
                { slot: 'A', name: 'Ballers' }, { slot: 'B', name: 'Betas' },
                { slot: 'C', name: 'Centauros' }, { slot: 'D', name: 'Leones' },
                { slot: 'E', name: 'Nets' }, { slot: 'F', name: 'Alfa y Omega' }
            ],
            groups: { A: ['A', 'B', 'C'], B: ['D', 'E', 'F'] },
            games: [
                { date: { year: 2026, month: 3, date: 28 }, time: '8:00 AM', location: 'Court A', away: 'A', home: 'B', group: 'A' },
                { date: { year: 2026, month: 3, date: 28 }, time: '8:00 AM', location: 'Court B', away: 'D', home: 'E', group: 'B' },
                { date: { year: 2026, month: 3, date: 28 }, time: '9:00 AM', location: 'Court B', away: 'E', home: 'F', group: 'B' },
                { date: { year: 2026, month: 3, date: 28 }, time: '1:00 PM', location: 'Court B', away: 'B', home: 'C', group: 'A' },
                { date: { year: 2026, month: 3, date: 28 }, time: '3:00 PM', location: 'Court B', away: 'F', home: 'D', group: 'B' },
                { date: { year: 2026, month: 3, date: 28 }, time: '7:00 PM', location: 'Court A', away: 'C', home: 'A', group: 'A' },
                { date: { year: 2026, month: 3, date: 29 }, time: '8:00 AM', location: 'Court A', away: '#2 Seed', home: '#1 Seed', round: 'Championship' }
            ]
        },
        {
            id: '2017-2018-varonil', division: 'Varonil', category: '2017-2018',
            teams: [
                { slot: 'A', name: 'Betas' }, { slot: 'B', name: 'Centauros' },
                { slot: 'C', name: 'Eagle Pass' }, { slot: 'D', name: 'Nets' },
                { slot: 'E', name: 'Spurs Acuna' }, { slot: 'F', name: 'Alfa y Omega' }
            ],
            groups: { A: ['A', 'B', 'C'], B: ['D', 'E', 'F'] },
            games: [
                { date: { year: 2026, month: 3, date: 28 }, time: '8:00 AM', location: 'Court C', away: 'A', home: 'B', group: 'A' },
                { date: { year: 2026, month: 3, date: 28 }, time: '9:00 AM', location: 'Court C', away: 'D', home: 'E', group: 'B' },
                { date: { year: 2026, month: 3, date: 28 }, time: '11:00 AM', location: 'Court A', away: 'E', home: 'F', group: 'B' },
                { date: { year: 2026, month: 3, date: 28 }, time: '12:00 PM', location: 'Court B', away: 'B', home: 'C', group: 'A' },
                { date: { year: 2026, month: 3, date: 28 }, time: '1:00 PM', location: 'Court C', away: 'F', home: 'D', group: 'B' },
                { date: { year: 2026, month: 3, date: 28 }, time: '6:00 PM', location: 'Court B', away: 'C', home: 'A', group: 'A' },
                { date: { year: 2026, month: 3, date: 29 }, time: '9:00 AM', location: 'Court B', away: '#2 Seed', home: '#1 Seed', round: 'Championship' }
            ]
        },
        {
            id: 'universitario-varonil', division: 'Varonil', category: 'Universitario',
            teams: [
                { slot: 'A', name: 'Del Rio' }, { slot: 'B', name: 'Lakers' },
                { slot: 'C', name: 'Halcones' }, { slot: 'D', name: 'Selectivo' },
                { slot: 'E', name: 'Tec NM Toros' }
            ],
            groups: null,
            games: [
                { date: { year: 2026, month: 3, date: 28 }, time: '10:00 AM', location: 'Court B', away: 'A', home: 'B' },
                { date: { year: 2026, month: 3, date: 28 }, time: '2:00 PM', location: 'Court B', away: 'C', home: 'D' },
                { date: { year: 2026, month: 3, date: 28 }, time: '4:00 PM', location: 'Court B', away: 'E', home: 'A' },
                { date: { year: 2026, month: 3, date: 28 }, time: '5:00 PM', location: 'Court B', away: 'B', home: 'C' },
                { date: { year: 2026, month: 3, date: 28 }, time: '7:00 PM', location: 'Court B', away: 'D', home: 'E' },
                { date: { year: 2026, month: 3, date: 29 }, time: '11:00 AM', location: 'Court A', away: '#2 Seed', home: '#1 Seed', round: 'Championship' }
            ]
        }
    ];

    // Copa Beta active filters
    var cbFilters = { division: 'all', category: 'all', team: 'all' };
    var cbData = CB_FALLBACK;

    function parseCopaBetaAPI(apiCategories) {
        return apiCategories.map(function (cat) {
            var div = cat.league && cat.league.divisions;
            var division = '';
            var category = '';
            if (div) {
                if (div.femenil && div.femenil.length) { division = 'Femenil'; category = div.femenil[0]; }
                else if (div.varonil && div.varonil.length) { division = 'Varonil'; category = div.varonil[0]; }
            }
            // Strip location division info — just keep court
            var games = (cat.games || []).map(function (g) {
                var loc = g.location || '';
                var courtMatch = loc.match(/^(Court\s+\w+)/i);
                return {
                    date: g.date, time: g.time,
                    location: courtMatch ? courtMatch[1] : loc,
                    away: g.away, home: g.home,
                    group: g.group || null, round: g.round || null
                };
            });
            return {
                id: (category + '-' + division).toLowerCase().replace(/\s+/g, '-'),
                division: division, category: category,
                teams: cat.teams || [], groups: cat.groups || null, games: games
            };
        });
    }

    function getCBDivisions(data) {
        var seen = {};
        var result = [];
        for (var i = 0; i < data.length; i++) {
            if (!seen[data[i].division]) { seen[data[i].division] = true; result.push(data[i].division); }
        }
        return result;
    }

    function getCBCategories(data, divFilter) {
        var seen = {};
        var result = [];
        for (var i = 0; i < data.length; i++) {
            if (divFilter !== 'all' && data[i].division !== divFilter) continue;
            if (!seen[data[i].category]) { seen[data[i].category] = true; result.push(data[i].category); }
        }
        return result;
    }

    function getCBTeams(data, divFilter, catFilter) {
        var seen = {};
        var result = [];
        for (var i = 0; i < data.length; i++) {
            if (divFilter !== 'all' && data[i].division !== divFilter) continue;
            if (catFilter !== 'all' && data[i].category !== catFilter) continue;
            for (var t = 0; t < data[i].teams.length; t++) {
                var name = data[i].teams[t].name;
                if (name && !seen[name]) { seen[name] = true; result.push(name); }
            }
        }
        return result.sort();
    }

    function buildCBFilterBar() {
        var nav = document.getElementById('week-nav-inner');
        var divisions = getCBDivisions(cbData);
        var categories = getCBCategories(cbData, cbFilters.division);
        var teams = getCBTeams(cbData, cbFilters.division, cbFilters.category);

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

        // Team filter
        html += '<select class="cb-filter-select" id="cb-filter-team">';
        html += '<option value="all">All Teams</option>';
        for (var t = 0; t < teams.length; t++) {
            var sel3 = cbFilters.team === teams[t] ? ' selected' : '';
            html += '<option value="' + teams[t] + '"' + sel3 + '>' + teams[t] + '</option>';
        }
        html += '</select>';

        html += '</div>';
        nav.innerHTML = html;

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
        document.getElementById('cb-filter-team').addEventListener('change', function () {
            cbFilters.team = this.value;
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

                // Team filter
                if (cbFilters.team !== 'all' && !isChamp) {
                    if (awayName !== cbFilters.team && homeName !== cbFilters.team) continue;
                }

                allGames.push({
                    date: game.date, time: game.time, location: game.location,
                    away: awayName, home: homeName,
                    division: cat.division, category: cat.category,
                    group: game.group || null, round: game.round || null,
                    isChamp: isChamp
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

        // Sort games within each date by time
        for (var k = 0; k < dateGroups.length; k++) {
            dateGroups[k].games.sort(function (a, b) {
                return parseTime(a.time) - parseTime(b.time);
            });
        }

        if (allGames.length === 0) {
            container.innerHTML = '<div class="schedule-empty">No games match your filters.</div>';
            return;
        }

        var html = '';
        for (var s = 0; s < dateGroups.length; s++) {
            var dg = dateGroups[s];
            html += '<section class="week-section cb-day-section" data-week="' + s + '">';
            html += '<div class="week-header">';
            html += '<h2 class="week-title">' + formatDate(dg.date) + '</h2>';
            html += '</div>';
            html += '<div class="games-grid">';

            for (var m = 0; m < dg.games.length; m++) {
                var gm = dg.games[m];
                var cardCls = 'game-card cb-game-card' + (gm.isChamp ? ' game-card-playoff' : '');

                html += '<div class="' + cardCls + '">';

                // Left: time + court
                html += '<div class="cb-game-info">';
                html += '<div class="game-time">' + gm.time + '</div>';
                html += '<div class="cb-game-court">' + (gm.location || '') + '</div>';
                html += '</div>';

                // Teams
                html += '<div class="game-team game-team-away">' + gm.away + '</div>';
                html += '<div class="game-vs">VS</div>';
                html += '<div class="game-team game-team-home">' + gm.home + '</div>';

                // Right: division/category/group badge
                html += '<div class="cb-game-meta">';
                html += '<span class="cb-badge cb-badge-' + gm.division.toLowerCase() + '">' + gm.division + '</span>';
                html += '<span class="cb-badge-cat">' + gm.category + '</span>';
                if (gm.group) {
                    html += '<span class="cb-badge-group">Grp ' + gm.group + '</span>';
                }
                if (gm.round) {
                    var rCls = gm.round === 'Championship' ? ' game-round-championship' : '';
                    html += '<span class="game-round' + rCls + '">' + gm.round + '</span>';
                }
                html += '</div>';

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
        // Render immediately with fallback
        buildCBFilterBar();
        buildCBSchedule();

        // Try API
        fetch('/api/copa-beta')
            .then(function (res) { return res.json(); })
            .then(function (data) {
                if (data && data.categories && data.categories.length) {
                    cbData = parseCopaBetaAPI(data.categories);
                    buildCBFilterBar();
                    buildCBSchedule();
                }
            })
            .catch(function () {
                // Fallback already rendered
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
