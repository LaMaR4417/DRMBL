(function () {
    // Fallback team names used until live data loads
    var DEFAULT_TEAMS = [
        { "id": "A", "name": "TBD" },
        { "id": "B", "name": "TBD" },
        { "id": "C", "name": "TBD" },
        { "id": "D", "name": "TBD" },
        { "id": "E", "name": "TBD" },
        { "id": "F", "name": "TBD" },
        { "id": "G", "name": "TBD" },
        { "id": "H", "name": "TBD" }
    ];

    var SCHEDULE_DATA = {
        "teams": DEFAULT_TEAMS,
        "weeks": [
            {
                "week": 1, "date": "TBD", "label": "Week 1", "sponsor": "Walmart",
                "games": [
                    { "time": "9:00 AM",  "away": "A", "home": "H" },
                    { "time": "10:00 AM", "away": "G", "home": "B" },
                    { "time": "11:00 AM", "away": "C", "home": "F" },
                    { "time": "12:00 PM", "away": "E", "home": "D" }
                ]
            },
            {
                "week": 2, "date": "TBD", "label": "Week 2", "sponsor": "El Tacon Madre",
                "games": [
                    { "time": "9:00 AM",  "away": "H", "home": "G" },
                    { "time": "10:00 AM", "away": "F", "home": "A" },
                    { "time": "11:00 AM", "away": "B", "home": "E" },
                    { "time": "12:00 PM", "away": "D", "home": "C" }
                ]
            },
            {
                "week": 3, "date": "TBD", "label": "Week 3",
                "games": [
                    { "time": "9:00 AM",  "away": "F", "home": "H" },
                    { "time": "10:00 AM", "away": "E", "home": "G" },
                    { "time": "11:00 AM", "away": "A", "home": "D" },
                    { "time": "12:00 PM", "away": "C", "home": "B" }
                ]
            },
            {
                "week": 4, "date": "TBD", "label": "Week 4",
                "games": [
                    { "time": "9:00 AM",  "away": "H", "home": "E" },
                    { "time": "10:00 AM", "away": "F", "home": "D" },
                    { "time": "11:00 AM", "away": "G", "home": "C" },
                    { "time": "12:00 PM", "away": "B", "home": "A" }
                ]
            },
            {
                "week": 5, "date": "TBD", "label": "Week 5",
                "games": [
                    { "time": "9:00 AM",  "away": "D", "home": "H" },
                    { "time": "10:00 AM", "away": "E", "home": "C" },
                    { "time": "11:00 AM", "away": "F", "home": "B" },
                    { "time": "12:00 PM", "away": "A", "home": "G" }
                ]
            },
            {
                "week": 6, "date": "TBD", "label": "Week 6",
                "games": [
                    { "time": "9:00 AM",  "away": "H", "home": "C" },
                    { "time": "10:00 AM", "away": "D", "home": "B" },
                    { "time": "11:00 AM", "away": "E", "home": "A" },
                    { "time": "12:00 PM", "away": "G", "home": "F" }
                ]
            },
            {
                "week": 7, "date": "TBD", "label": "Week 7",
                "games": [
                    { "time": "9:00 AM",  "away": "B", "home": "H" },
                    { "time": "10:00 AM", "away": "C", "home": "A" },
                    { "time": "11:00 AM", "away": "D", "home": "G" },
                    { "time": "12:00 PM", "away": "F", "home": "E" }
                ]
            },
            {
                "week": 8, "date": "TBD", "label": "Week 8", "type": "seeded",
                "note": "Seeds determined by Week 7 standings",
                "games": [
                    { "time": "9:00 AM",  "away": "#4 Seed", "home": "#1 Seed" },
                    { "time": "10:00 AM", "away": "#3 Seed", "home": "#2 Seed" },
                    { "time": "11:00 AM", "away": "#8 Seed", "home": "#5 Seed" },
                    { "time": "12:00 PM", "away": "#7 Seed", "home": "#6 Seed" }
                ]
            },
            {
                "week": 9, "date": "TBD", "label": "Week 9", "type": "seeded",
                "note": "Seeds determined by Week 7 standings",
                "games": [
                    { "time": "9:00 AM",  "away": "#3 Seed", "home": "#1 Seed" },
                    { "time": "10:00 AM", "away": "#4 Seed", "home": "#2 Seed" },
                    { "time": "11:00 AM", "away": "#8 Seed", "home": "#5 Seed" },
                    { "time": "12:00 PM", "away": "#7 Seed", "home": "#6 Seed" }
                ]
            },
            {
                "week": 10, "date": "TBD", "label": "Week 10", "type": "seeded",
                "note": "Seeds determined by Week 7 standings",
                "games": [
                    { "time": "9:00 AM",  "away": "#2 Seed", "home": "#1 Seed" },
                    { "time": "10:00 AM", "away": "#4 Seed", "home": "#3 Seed" },
                    { "time": "11:00 AM", "away": "#6 Seed", "home": "#5 Seed" },
                    { "time": "12:00 PM", "away": "#8 Seed", "home": "#7 Seed" }
                ]
            },
            {
                "week": 11, "date": "TBD", "label": "Playoff Sunday", "type": "playoffs",
                "games": [
                    { "time": "9:00 AM",  "away": "#4 Seed", "home": "#1 Seed", "round": "Semifinal 1" },
                    { "time": "10:30 AM", "away": "#3 Seed", "home": "#2 Seed", "round": "Semifinal 2" },
                    { "time": "12:00 PM", "away": "Loser SF1", "home": "Loser SF2", "round": "3rd Place" },
                    { "time": "1:30 PM",  "away": "Winner SF1", "home": "Winner SF2", "round": "Championship" }
                ]
            }
        ]
    };

    function formatDate(dateStr) {
        if (!dateStr || dateStr === 'TBD') return 'TBD';
        var parts = dateStr.split('-');
        var d = new Date(parts[0], parts[1] - 1, parts[2]);
        var months = ['January', 'February', 'March', 'April', 'May', 'June',
            'July', 'August', 'September', 'October', 'November', 'December'];
        return months[d.getMonth()] + ' ' + d.getDate() + ', ' + d.getFullYear();
    }

    function getTeamName(teams, id) {
        for (var i = 0; i < teams.length; i++) {
            if (teams[i].id === id) return teams[i].name;
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

        // "All" scrolls to top of schedule
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

    // Highlight active tab on scroll
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

    function buildSchedule(data) {
        var container = document.getElementById('schedule-content');
        var teams = data.teams;
        var weeks = data.weeks;
        var html = '';

        for (var i = 0; i < weeks.length; i++) {
            var w = weeks[i];
            var isPlayoff = w.type === 'playoffs';
            var isSeeded = w.type === 'seeded';
            var sectionCls = 'week-section' + (isPlayoff ? ' week-section-playoff' : '') + (isSeeded ? ' week-section-seeded' : '');

            html += '<section class="' + sectionCls + '" data-week="' + i + '">';
            html += '<div class="week-header">';
            if (w.sponsor) {
                var sp = findSponsor(w.sponsor);
                html += '<div class="week-sponsor-bar">';
                html += '<h2 class="week-title">' + w.label + '</h2>';
                html += '<p class="week-sponsor">Presented by ' + w.sponsor + '</p>';
                if (sp && sp.img) {
                    var spHref = sp.page ? sp.page : 'sponsor-bio.html?id=' + encodeURIComponent(sp.id);
                    html += '<a href="' + spHref + '" class="week-sponsor-logo week-sponsor-logo-' + sp.id + '"><img src="' + sp.img + '" alt="' + sp.name + '"></a>';
                }
                html += '</div>';
            } else {
                html += '<h2 class="week-title">' + w.label + '</h2>';
            }
            html += '<p class="week-date">' + formatDate(w.date) + '</p>';
            if (w.note) {
                html += '<p class="week-note">' + w.note + '</p>';
            }
            html += '</div>';
            html += '<div class="games-grid">';

            for (var g = 0; g < w.games.length; g++) {
                var game = w.games[g];
                var isSeeded = w.type === 'seeded';
                var awayName = (isPlayoff || isSeeded) ? game.away : getTeamName(teams, game.away);
                var homeName = (isPlayoff || isSeeded) ? game.home : getTeamName(teams, game.home);
                var cardCls = 'game-card' + (isPlayoff ? ' game-card-playoff' : '');

                html += '<div class="' + cardCls + '">';
                html += '<div class="game-time">' + game.time + '</div>';
                html += '<div class="game-team game-team-away">' + awayName + '</div>';
                html += '<div class="game-vs">VS</div>';
                html += '<div class="game-team game-team-home">' + homeName + '</div>';

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

    function loadLiveTeams() {
        fetch('/api/season')
            .then(function (res) { return res.json(); })
            .then(function (data) {
                if (data && data.teams) {
                    var liveTeams = [];
                    for (var i = 0; i < data.teams.length; i++) {
                        var t = data.teams[i];
                        liveTeams.push({
                            id: t.slot,
                            name: t.name || "TBD"
                        });
                    }
                    SCHEDULE_DATA.teams = liveTeams;
                    buildSchedule(SCHEDULE_DATA);
                }
            })
            .catch(function () {
                // Keep fallback names on error
            });
    }

    function init() {
        buildWeekNav(SCHEDULE_DATA.weeks);
        buildSchedule(SCHEDULE_DATA);
        loadLiveTeams();
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();
