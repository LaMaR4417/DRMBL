(function () {
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

    function buildSchedule(teams, weeks) {
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
                    var spHref = sp.page ? sp.page : 'sponsor-bio.html?id=' + encodeURIComponent(sp.id);
                    html += '<a href="' + spHref + '" class="week-sponsor-logo week-sponsor-logo-' + sp.id + '"><img src="' + sp.img + '" alt="' + sp.name + '"></a>';
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

    function loadSeason() {
        fetch('/api/season')
            .then(function (res) { return res.json(); })
            .then(function (data) {
                if (data && data.teams && data.weeklySchedule) {
                    buildWeekNav(data.weeklySchedule);
                    buildSchedule(data.teams, data.weeklySchedule);
                }
            })
            .catch(function () {
                document.getElementById('schedule-content').innerHTML =
                    '<div class="schedule-empty">Unable to load schedule.</div>';
            });
    }

    function init() {
        document.getElementById('schedule-content').innerHTML =
            '<div class="schedule-empty">Loading schedule...</div>';
        loadSeason();
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();
