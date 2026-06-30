/* ── AWARDS PAGE ──
   Three tabs: Individual Awards + All-Star + All-DRMBL.

   ALL CONTENT IS EDITED IN THE DATA BLOCK BELOW.
   Fill in winners / players, then commit + push (Vercel deploys automatically).

   • Leave a `winner` (or the ALL_STARS list) empty and the page shows a
     graceful "To Be Announced" placeholder.
   • Remove the ALL_STAR_CONTESTS entries (or leave the array empty) to hide
     the Contests section entirely.
──────────────────────────────────────────────────────────────────────────── */

/* Shown as the hero subtitle. */
var SEASON_LABEL = 'Spring 2026 Season';

/* ── PERSONAL AWARDS ───────────────────────────────────────────────────────
   One object per award.
     title   – award name (required)
     winner  – player name (leave '' for "To Be Announced")
     team    – player's team (optional)
     stat    – short stat line shown under the name, e.g. '28.4 PPG' (optional)
     icon    – emoji shown on the card (optional)
     featured– true → big highlighted card up top. Featured cards sit
               side-by-side in a row (MVP + DPOY).
   Add, remove, or reorder freely.
──────────────────────────────────────────────────────────────────────────── */
var PERSONAL_AWARDS = [
    { id: 'mvp',  title: 'Most Valuable Player',         icon: '🏆', featured: true, winner: 'Christian Washington', team: 'R. Blitz', stat: '' },
    { id: 'dpoy', title: 'Defensive Player of the Year', icon: '🛡️', featured: true, winner: 'Tucker Terlizzi', team: 'R. Blitz', stat: '' }
];

/* ── STAT LEADERS ──────────────────────────────────────────────────────────
   The category leaders. Same fields as a personal award; `stat` is the
   leading value, e.g. '28.4 PPG'. Rendered in their own "Stat Leaders" block.
──────────────────────────────────────────────────────────────────────────── */
var STAT_LEADERS = [
    { id: 'points',   title: 'Points Leader',   icon: '🏀', winner: 'Christian Washington', team: 'R. Blitz', stat: '24.6 PPG' },
    { id: 'rebounds', title: 'Rebounds Leader', icon: '💪', winner: 'Mat Peeler', team: 'Del Rio Heat', stat: '15.4 RPG' },
    { id: 'assists',  title: 'Assists Leader',  icon: '🤝', winner: 'Angel Contreras', team: 'The Reapers', stat: '4.6 APG' },
    { id: 'steals',   title: 'Steals Leader',   icon: '⚡', winner: 'Tucker Terlizzi', team: 'R. Blitz', stat: '4.5 SPG' },
    { id: 'blocks',   title: 'Blocks Leader',   icon: '🚫', winner: 'Mat Peeler', team: 'Del Rio Heat', stat: '3.6 BPG' }
];

/* ── ALL-STARS ─────────────────────────────────────────────────────────────
   The players voted in for All-Star week. One object per player.
     name   – player name (required)
     team   – player's team (optional)
     number – jersey number, shown as #NN (optional)
   Order is preserved.
──────────────────────────────────────────────────────────────────────────── */
var ALL_STARS = [
    { name: 'Alex Melendez',        team: 'The Reapers' },
    { name: 'Angel Alonso',         team: 'DR Elite' },
    { name: 'Cameron Rodgers',      team: 'R. Blitz' },
    { name: 'Christian Lathan',     team: 'Del Rio Heat' },
    { name: 'Christian Washington', team: 'R. Blitz' },
    { name: 'Chuck Blum',           team: 'R. Blitz' },
    { name: 'Edwin Moncada',        team: 'Del Rio Heat' },
    { name: 'Francisco Avendaño',   team: 'Kings' },
    { name: 'Francisco Padilla',    team: 'DR Elite' },
    { name: 'Gabriel Esquivel',     team: 'R. Blitz' },
    { name: 'Jacob Scott',          team: 'Wonderland' },
    { name: 'James Thadon',         team: 'Air Ballers' },
    { name: 'Jordan Balderas',      team: 'Air Ballers' },
    { name: 'Jose Garcia',          team: 'Wonderland' },
    { name: 'Juan Gonzalez',        team: 'Wonderland' },
    { name: 'Julian Dominguez',     team: 'DR Elite' },
    { name: 'Kadeem Edmonson',      team: 'Air Ballers' },
    { name: 'Kenneth Aleta',        team: 'Wonderland' },
    { name: 'Malik Mumpfield',      team: 'R. Blitz' },
    { name: 'Marshall McKee',       team: 'Kings' },
    { name: 'Mat Peeler',           team: 'Del Rio Heat' },
    { name: 'Nathan Robinson',      team: 'R. Blitz' },
    { name: 'Roy Dominguez',        team: 'Cash Kings' },
    { name: 'Tucker Terlizzi',      team: 'R. Blitz' }
];

/* ── ALL-STAR HONORABLE MENTIONS (optional) ────────────────────────────────
   Same fields as ALL_STARS. Leave empty to hide the section.
──────────────────────────────────────────────────────────────────────────── */
var HONORABLE_MENTIONS = [
    { name: 'Alan Dobbins',     team: 'Cash Kings' },
    { name: 'Alexis Flores',    team: 'The Reapers' },
    { name: 'Angel Contreras',  team: 'The Reapers' },
    { name: 'Enrique Bustos',   team: 'Kings' },
    { name: 'Jacob Hernandez',  team: 'The Reapers' },
    { name: 'Joel Dominguez',   team: 'DR Elite' },
    { name: 'Kameron Williams', team: 'Del Rio Heat' },
    { name: 'Leonel Dominguez', team: 'The Reapers' }
];

/* ── TEAM COLORS ───────────────────────────────────────────────────────────
   Accent color used on All-Star cards (the team-color glow that pops in when
   a card is revealed). Key must match the `team` string exactly. Edit hexes
   to match official team colors; unknown teams fall back to the league gold.
──────────────────────────────────────────────────────────────────────────── */
var TEAM_COLORS = {
    'R. Blitz':     '#ffd21f', // gold / yellow
    'Del Rio Heat': '#b1334a', // maroon
    'The Reapers':  '#c79a3a', // grey + gold (gold pop)
    'DR Elite':     '#aab3c0', // black (shown as silver so it reads on dark)
    'Wonderland':   '#ffffff', // white
    'Air Ballers':  '#3f74d6', // navy blue
    'Kings':        '#9b51e0', // purple
    'Cash Kings':   '#ff5da2'  // pink
};

/* ── ALL-DRMBL TEAMS ───────────────────────────────────────────────────────
   The 1st / 2nd / 3rd honor teams. One object per tier; `players` is the list
   of selections (name + team). Player team colors come from TEAM_COLORS.
   Add/remove players freely; an empty name shows "To Be Announced".
──────────────────────────────────────────────────────────────────────────── */
var ALL_DRMBL_TEAMS = [
    {
        tier: 'First Team', rank: 1, medal: '🥇',
        players: [
            { name: 'Angel Alonso',        team: 'DR Elite' },
            { name: 'Christian Washington', team: 'R. Blitz' },
            { name: 'Jordan Balderas',     team: 'Air Ballers' },
            { name: 'Mat Peeler',          team: 'Del Rio Heat' },
            { name: 'Tucker Terlizzi',     team: 'R. Blitz' }
        ]
    },
    {
        tier: 'Second Team', rank: 2, medal: '🥈',
        players: [
            { name: 'Chuck Blum',          team: 'R. Blitz' },
            { name: 'Jacob Scott',         team: 'Wonderland' },
            { name: 'Julian Dominguez',    team: 'DR Elite' },
            { name: 'Kenneth Aleta',       team: 'Wonderland' },
            { name: 'Nathan Robinson',     team: 'R. Blitz' }
        ]
    },
    {
        tier: 'Third Team', rank: 3, medal: '🥉',
        players: [
            { name: 'Cameron Rodgers',     team: 'R. Blitz' },
            { name: 'Christian Lathan',    team: 'Del Rio Heat' },
            { name: 'Kadeem Edmonson',     team: 'Air Ballers' },
            { name: 'Malik Mumpfield',     team: 'R. Blitz' },
            { name: 'Marshall McKee',      team: 'Kings' }
        ]
    }
];

/* ── ALL-STAR CONTESTS (optional) ──────────────────────────────────────────
   Leave empty to hide the Contests section. One object per contest.
     title  – contest name (required)
     winner – player name
     team   – player's team (optional)
     result – short result line, e.g. '21 pts' (optional)
     icon   – emoji (optional)
──────────────────────────────────────────────────────────────────────────── */
var ALL_STAR_CONTESTS = [
    // { id: 'three-point', title: '3-Point Contest', icon: '🎯', winner: '', team: '', result: '' },
    // { id: 'dunk',        title: 'Dunk Contest',    icon: '💥', winner: '', team: '', result: '' }
];

/* ──────────────────────────────────────────────────────────────────────────
   RENDER LOGIC — no edits needed below.
──────────────────────────────────────────────────────────────────────────── */
(function () {
    var TBA = 'To Be Announced';

    function escapeHtml(s) {
        if (s == null) return '';
        return String(s).replace(/[&<>"']/g, function (c) {
            return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
        });
    }

    // ── Individual Awards ──
    function renderPersonal() {
        var featured = [];
        var rest = [];
        for (var i = 0; i < PERSONAL_AWARDS.length; i++) {
            (PERSONAL_AWARDS[i].featured ? featured : rest).push(PERSONAL_AWARDS[i]);
        }

        var html = '';

        // Reveal-all / hide-all toggle.
        html += '<div class="awards-controls"><button type="button" class="awards-reveal-all" data-reveal="Reveal All" data-hide="Hide All">Reveal All</button></div>';

        // Featured awards (MVP + DPOY) — side-by-side, equally large.
        if (featured.length) {
            html += '<div class="award-featured-row">';
            for (var f = 0; f < featured.length; f++) {
                html += renderFeatured(featured[f]);
            }
            html += '</div>';
        }

        // Any other (non-featured) personal awards.
        if (rest.length) {
            html += '<div class="award-grid">';
            for (var r = 0; r < rest.length; r++) {
                html += renderAwardCard(rest[r]);
            }
            html += '</div>';
        }

        // Stat leaders.
        if (typeof STAT_LEADERS !== 'undefined' && STAT_LEADERS.length) {
            html += '<h2 class="awards-block-title awards-block-title-sub">Stat Leaders</h2>';
            html += '<div class="award-grid">';
            for (var s = 0; s < STAT_LEADERS.length; s++) {
                html += renderAwardCard(STAT_LEADERS[s]);
            }
            html += '</div>';
        }

        if (!html) html = emptyState('No awards have been added yet.');
        document.getElementById('awards-personal').innerHTML = html;
    }

    // Covered overlay shown while a card is locked (before the tap-to-reveal).
    function coverHtml() {
        return '<div class="award-cover" aria-hidden="true">' +
                   '<span class="cover-bar cover-bar-lg"></span>' +
                   '<span class="cover-bar cover-bar-sm"></span>' +
                   '<span class="cover-prompt">Tap to reveal</span>' +
               '</div>';
    }

    function renderFeatured(a) {
        var has = !!(a.winner && a.winner.trim());
        var locked = has; // only lock real winners; a "TBA" card shows openly
        var cls = 'award-featured' + (has ? '' : ' is-pending') + (locked ? ' revealable is-locked' : '');
        var attrs = locked ? ' role="button" tabindex="0" aria-expanded="false" aria-label="Reveal ' + escapeHtml(a.title) + '"' : '';
        var html = '<div class="' + cls + '"' + attrs + '>';
        html += '<div class="award-featured-glow"></div>';
        html += '<div class="award-featured-badge">' + (a.icon ? '<span class="award-icon">' + a.icon + '</span>' : '') + escapeHtml(a.title) + '</div>';
        html += '<div class="award-card-body award-featured-body">';
        html += '<div class="award-reveal">';
        html += '<div class="award-featured-name">' + (has ? escapeHtml(a.winner) : TBA) + '</div>';
        if (has && a.team) html += '<div class="award-featured-team">' + escapeHtml(a.team) + '</div>';
        if (has && a.stat) html += '<div class="award-featured-stat">' + escapeHtml(a.stat) + '</div>';
        html += '</div>'; // .award-reveal
        if (locked) html += coverHtml();
        html += '</div>'; // .award-card-body
        html += '</div>';
        return html;
    }

    function renderAwardCard(a) {
        var has = !!(a.winner && a.winner.trim());
        var locked = has;
        var cls = 'award-card' + (has ? '' : ' is-pending') + (locked ? ' revealable is-locked' : '');
        var attrs = locked ? ' role="button" tabindex="0" aria-expanded="false" aria-label="Reveal ' + escapeHtml(a.title) + '"' : '';
        var html = '<div class="' + cls + '"' + attrs + '>';
        if (a.icon) html += '<div class="award-card-icon">' + a.icon + '</div>';
        html += '<h3 class="award-card-title">' + escapeHtml(a.title) + '</h3>';
        html += '<div class="award-card-body">';
        html += '<div class="award-reveal">';
        html += '<div class="award-card-winner">' + (has ? escapeHtml(a.winner) : TBA) + '</div>';
        if (has && a.team) html += '<div class="award-card-team">' + escapeHtml(a.team) + '</div>';
        if (has && a.stat) html += '<div class="award-card-stat">' + escapeHtml(a.stat) + '</div>';
        html += '</div>'; // .award-reveal
        if (locked) html += coverHtml();
        html += '</div>'; // .award-card-body
        html += '</div>';
        return html;
    }

    // ── All-Star ──
    function renderAllStar() {
        var html = '';

        html += '<div class="awards-controls"><button type="button" class="awards-reveal-all" data-reveal="Reveal All-Stars" data-hide="Hide All-Stars">Reveal All-Stars</button></div>';
        html += '<h2 class="awards-block-title">' + escapeHtml(SEASON_LABEL.replace(/ Season$/, '')) + ' All-Stars</h2>';

        if (ALL_STARS.length) {
            html += '<div class="allstar-grid">';
            for (var i = 0; i < ALL_STARS.length; i++) {
                html += renderAllStarCard(ALL_STARS[i]);
            }
            html += '</div>';
        } else {
            html += emptyState('All-Star selections will be announced soon.');
        }

        // Honorable mentions (optional)
        if (typeof HONORABLE_MENTIONS !== 'undefined' && HONORABLE_MENTIONS.length) {
            html += '<h2 class="awards-block-title awards-block-title-sub">Honorable Mentions</h2>';
            html += '<div class="allstar-grid allstar-grid-hm">';
            for (var h = 0; h < HONORABLE_MENTIONS.length; h++) {
                html += renderAllStarCard(HONORABLE_MENTIONS[h]);
            }
            html += '</div>';
        }

        // Contests (optional)
        if (ALL_STAR_CONTESTS.length) {
            html += '<h2 class="awards-block-title awards-block-title-sub">Contests</h2>';
            html += '<div class="award-grid award-grid-contests">';
            for (var c = 0; c < ALL_STAR_CONTESTS.length; c++) {
                var ct = ALL_STAR_CONTESTS[c];
                html += renderAwardCard({
                    title: ct.title, icon: ct.icon, winner: ct.winner, team: ct.team, stat: ct.result
                });
            }
            html += '</div>';
        }

        document.getElementById('awards-allstar').innerHTML = html;
    }

    function renderAllStarCard(p) {
        var color = (typeof TEAM_COLORS !== 'undefined' && TEAM_COLORS[p.team]) || '';
        var styleAttr = color ? ' style="--team-color:' + color + '"' : '';
        var html = '<div class="allstar-card revealable is-locked" role="button" tabindex="0" aria-expanded="false" aria-label="Reveal All-Star"' + styleAttr + '>';
        html += '<div class="award-card-body allstar-body">';
        html += '<div class="award-reveal">';
        if (p.number != null && String(p.number).trim() !== '') {
            html += '<div class="allstar-number">#' + escapeHtml(p.number) + '</div>';
        }
        html += '<div class="allstar-name">' + escapeHtml(p.name || TBA) + '</div>';
        if (p.team) html += '<div class="allstar-team">' + escapeHtml(p.team) + '</div>';
        html += '</div>'; // .award-reveal
        html += coverHtml();
        html += '</div>'; // .award-card-body
        html += '</div>';
        return html;
    }

    // ── All-DRMBL ──
    function renderAllDrmbl() {
        var html = '';
        html += '<div class="awards-controls"><button type="button" class="awards-reveal-all" data-reveal="Reveal All-DRMBL" data-hide="Hide All-DRMBL">Reveal All-DRMBL</button></div>';
        html += '<h2 class="awards-block-title">' + escapeHtml(SEASON_LABEL.replace(/ Season$/, '')) + ' All-DRMBL</h2>';

        if (typeof ALL_DRMBL_TEAMS === 'undefined' || !ALL_DRMBL_TEAMS.length) {
            html += emptyState('All-DRMBL teams will be announced soon.');
            document.getElementById('awards-alldrmbl').innerHTML = html;
            return;
        }

        for (var t = 0; t < ALL_DRMBL_TEAMS.length; t++) {
            var team = ALL_DRMBL_TEAMS[t];
            var players = team.players || [];
            html += '<section class="adrmbl-tier adrmbl-tier-' + (team.rank || (t + 1)) + '">';
            html += '<h3 class="adrmbl-tier-title">' +
                        (team.medal ? '<span class="adrmbl-medal">' + team.medal + '</span>' : '') +
                        escapeHtml(team.tier || ('Team ' + (t + 1))) +
                    '</h3>';
            html += '<div class="adrmbl-grid">';
            for (var p = 0; p < players.length; p++) {
                html += renderDrmblCard(players[p]);
            }
            html += '</div>';
            html += '</section>';
        }

        document.getElementById('awards-alldrmbl').innerHTML = html;
    }

    function renderDrmblCard(p) {
        var has = !!(p.name && p.name.trim());
        var color = (typeof TEAM_COLORS !== 'undefined' && TEAM_COLORS[p.team]) || '';
        var styleAttr = color ? ' style="--team-color:' + color + '"' : '';

        // Pending slots show openly; filled slots are tap-to-reveal.
        if (!has) {
            return '<div class="adrmbl-card is-pending"' + styleAttr + '>' +
                       '<div class="adrmbl-name">' + TBA + '</div>' +
                   '</div>';
        }

        var html = '<div class="adrmbl-card revealable is-locked" role="button" tabindex="0" aria-expanded="false" aria-label="Reveal All-DRMBL selection"' + styleAttr + '>';
        html += '<div class="award-card-body adrmbl-body">';
        html += '<div class="award-reveal">';
        html += '<div class="adrmbl-name">' + escapeHtml(p.name) + '</div>';
        if (p.position) html += '<div class="adrmbl-pos">' + escapeHtml(p.position) + '</div>';
        if (p.team) html += '<div class="adrmbl-team">' + escapeHtml(p.team) + '</div>';
        html += '</div>'; // .award-reveal
        html += coverHtml();
        html += '</div>'; // .award-card-body
        html += '</div>';
        return html;
    }

    function emptyState(msg) {
        return '<div class="awards-empty">' + escapeHtml(msg) + '</div>';
    }

    // ── Tabs ──
    // key → { view element id, url hash }
    var TAB_VIEWS = {
        'personal':  { el: 'awards-personal',  hash: '' },
        'all-star':  { el: 'awards-allstar',   hash: '#all-star' },
        'all-drmbl': { el: 'awards-alldrmbl',  hash: '#all-drmbl' }
    };

    function showTab(tab) {
        if (!TAB_VIEWS[tab]) tab = 'personal';

        for (var key in TAB_VIEWS) {
            if (!TAB_VIEWS.hasOwnProperty(key)) continue;
            var view = document.getElementById(TAB_VIEWS[key].el);
            if (view) view.classList.toggle('hidden', key !== tab);
        }

        var tabs = document.querySelectorAll('.awards-tab');
        for (var i = 0; i < tabs.length; i++) {
            var active = tabs[i].getAttribute('data-tab') === tab;
            tabs[i].classList.toggle('active', active);
            tabs[i].setAttribute('aria-pressed', active ? 'true' : 'false');
        }

        var hash = TAB_VIEWS[tab].hash;
        if (window.location.hash !== hash) {
            history.replaceState(null, '', window.location.pathname + hash);
        }
    }

    // ── Tap to reveal ──
    function revealCard(card, root) {
        card.classList.remove('is-locked');
        card.classList.add('is-revealed');
        card.setAttribute('aria-expanded', 'true');
        updateRevealAllBtn(root);
    }

    function lockCard(card) {
        card.classList.add('is-locked');
        card.classList.remove('is-revealed');
        card.setAttribute('aria-expanded', 'false');
    }

    function toggleAll(root) {
        var locked = root.querySelectorAll('.revealable.is-locked');
        if (locked.length) {
            // Reveal all, staggered for a cascade. Smaller step for bigger sets
            // so a long roster still finishes in roughly two seconds.
            var step = Math.max(45, Math.min(120, Math.round(1800 / locked.length)));
            for (var i = 0; i < locked.length; i++) {
                (function (el, idx, last) {
                    setTimeout(function () {
                        el.classList.remove('is-locked');
                        el.classList.add('is-revealed');
                        el.setAttribute('aria-expanded', 'true');
                        if (idx === last) updateRevealAllBtn(root);
                    }, idx * step);
                })(locked[i], i, locked.length - 1);
            }
        } else {
            // Re-lock everything for another viewing.
            var revealed = root.querySelectorAll('.revealable.is-revealed');
            for (var j = 0; j < revealed.length; j++) lockCard(revealed[j]);
            updateRevealAllBtn(root);
        }
    }

    function updateRevealAllBtn(root) {
        var btn = root.querySelector('.awards-reveal-all');
        if (!btn) return;
        var total = root.querySelectorAll('.revealable').length;
        if (!total) { btn.style.display = 'none'; return; }
        btn.style.display = '';
        var lockedLeft = root.querySelectorAll('.revealable.is-locked').length;
        if (lockedLeft === 0) {
            btn.textContent = btn.getAttribute('data-hide') || 'Hide All';
            btn.classList.add('is-reset');
        } else {
            btn.textContent = btn.getAttribute('data-reveal') || 'Reveal All';
            btn.classList.remove('is-reset');
        }
    }

    function wireReveal(root) {
        if (!root) return;

        root.addEventListener('click', function (e) {
            if (e.target.closest('.awards-reveal-all')) { toggleAll(root); return; }
            var card = e.target.closest('.revealable');
            if (card && card.classList.contains('is-locked')) revealCard(card, root);
        });

        root.addEventListener('keydown', function (e) {
            if (e.key !== 'Enter' && e.key !== ' ' && e.key !== 'Spacebar') return;
            var card = e.target.closest('.revealable');
            if (card && card.classList.contains('is-locked')) {
                e.preventDefault();
                revealCard(card, root);
            }
        });

        updateRevealAllBtn(root);
    }

    function init() {
        document.getElementById('awards-season').textContent = SEASON_LABEL;

        renderPersonal();
        renderAllStar();
        renderAllDrmbl();
        wireReveal(document.getElementById('awards-personal'));
        wireReveal(document.getElementById('awards-allstar'));
        wireReveal(document.getElementById('awards-alldrmbl'));

        var tabs = document.querySelectorAll('.awards-tab');
        for (var i = 0; i < tabs.length; i++) {
            tabs[i].addEventListener('click', function () {
                showTab(this.getAttribute('data-tab'));
            });
        }

        var hashToTab = { '#all-star': 'all-star', '#all-drmbl': 'all-drmbl' };
        showTab(hashToTab[window.location.hash] || 'personal');
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();
