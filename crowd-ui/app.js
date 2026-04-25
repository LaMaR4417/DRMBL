(function () {
    var POLL_INTERVAL = 1000;
    var API_URL = '/api/live-game';

    // ── DOM helpers ──────────────────────────
    function $(id) { return document.getElementById(id); }

    function show(id) {
        var views = document.querySelectorAll('.view');
        for (var i = 0; i < views.length; i++) views[i].classList.add('hidden');
        $(id).classList.remove('hidden');
    }

    function getQueryParam(name) {
        var params = new URLSearchParams(window.location.search);
        return params.get(name);
    }

    // ── Formatting ──────────────────────────
    function formatClock(seconds) {
        if (seconds == null || isNaN(seconds)) return '0:00';
        var s = Math.max(0, Math.floor(seconds));
        var m = Math.floor(s / 60);
        var rem = s % 60;
        return m + ':' + (rem < 10 ? '0' : '') + rem;
    }

    function formatPeriod(quarter) {
        if (quarter == null) return 'Q1';
        if (quarter <= 4) return 'Q' + quarter;
        return 'OT' + (quarter - 4);
    }

    function quarterKey(q) {
        if (q === 1) return 'first';
        if (q === 2) return 'second';
        if (q === 3) return 'third';
        if (q === 4) return 'fourth';
        return 'OT' + (q - 4);
    }

    function getQuarterFouls(side, q, bs) {
        var key = quarterKey(q);
        var fouls = bs.teamInfo[side].stats.fouls.perQuarter;
        if (key.indexOf('OT') === 0) {
            var ot = fouls.overtime || {};
            return (ot[key] && ot[key].committed) || 0;
        }
        return (fouls[key] && fouls[key].committed) || 0;
    }

    // DRMBL defaults — used if tracker doesn't push settings in trackerState
    var DEFAULT_BONUS = { oneAndOne: null, doubleBonus: 5 };

    function getBonusConfig(payload) {
        var ts = payload && payload.trackerState;
        if (ts && ts.settings && ts.settings.fouls && ts.settings.fouls.bonus) {
            return ts.settings.fouls.bonus;
        }
        return DEFAULT_BONUS;
    }

    // ── Selector view ──────────────────────────
    function renderSelector(games) {
        var status = $('selector-status');
        var list = $('game-list');
        list.innerHTML = '';

        if (!games || games.length === 0) {
            status.textContent = 'No live games right now.';
            return;
        }

        status.textContent = games.length + ' game' + (games.length === 1 ? '' : 's') + ' available.';

        for (var i = 0; i < games.length; i++) {
            var g = games[i];
            var bs = g.boxScore || {};
            var info = bs.gameInfo || {};
            var general = info.general || {};
            var state = info.state || {};
            var teamHome = (bs.teamInfo && bs.teamInfo.home) || {};
            var teamAway = (bs.teamInfo && bs.teamInfo.away) || {};

            var homeName = teamHome.name || 'Home';
            var awayName = teamAway.name || 'Away';
            var homeScore = (teamHome.score && teamHome.score.current) || 0;
            var awayScore = (teamAway.score && teamAway.score.current) || 0;
            var status_ = general.status || 'in-progress';
            var period = formatPeriod(state.currentQuarter);
            var clock = formatClock(state.clock && state.clock.timeLeft);

            var statusCls = 'live';
            var statusLabel = 'LIVE';
            if (status_ === 'final') {
                statusCls = 'final';
                statusLabel = 'FINAL';
            } else if (status_ === 'scheduled') {
                statusCls = '';
                statusLabel = 'SCHEDULED';
            }

            var card = document.createElement('a');
            card.className = 'game-card';
            card.href = '?game=' + encodeURIComponent(g.gameId);
            card.innerHTML =
                '<div>' +
                    '<div class="game-card-teams">' + escapeHTML(homeName) + ' <span class="game-card-vs">vs</span> ' + escapeHTML(awayName) + '</div>' +
                    '<div class="game-card-meta">' + escapeHTML(period) + ' &middot; ' + escapeHTML(clock) + '</div>' +
                '</div>' +
                '<div>' +
                    '<div class="game-card-score">' + homeScore + ' &ndash; ' + awayScore + '</div>' +
                    '<div class="game-card-status ' + statusCls + '">' + statusLabel + '</div>' +
                '</div>';
            list.appendChild(card);
        }
    }

    function escapeHTML(s) {
        if (s == null) return '';
        return String(s)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;');
    }

    function loadSelector() {
        show('selector-view');
        $('selector-status').textContent = 'Loading live games…';
        fetch(API_URL)
            .then(function (r) { return r.json(); })
            .then(function (data) {
                renderSelector(data.games || []);
            })
            .catch(function (err) {
                $('selector-status').textContent = 'Failed to load games: ' + (err && err.message ? err.message : 'unknown error');
            });
    }

    // ── Scoreboard view ──────────────────────────
    var pollHandle = null;
    var lastUpdatedAt = null;

    function renderScoreboard(payload) {
        var bs = payload && payload.boxScore;
        if (!bs) return;
        var state = (bs.gameInfo && bs.gameInfo.state) || {};
        var general = (bs.gameInfo && bs.gameInfo.general) || {};
        var home = (bs.teamInfo && bs.teamInfo.home) || {};
        var away = (bs.teamInfo && bs.teamInfo.away) || {};

        $('sb-period').textContent = formatPeriod(state.currentQuarter);

        var clockEl = $('sb-clock');
        clockEl.textContent = formatClock(state.clock && state.clock.timeLeft);
        clockEl.classList.toggle('clock-running', !!state.active);
        clockEl.classList.toggle('clock-stopped', !state.active);

        var statusEl = $('sb-status');
        if (general.status === 'final') {
            statusEl.textContent = 'FINAL';
            statusEl.className = 'sb-status';
        } else if (state.active) {
            statusEl.textContent = 'CLOCK RUNNING';
            statusEl.className = 'sb-status running';
        } else {
            statusEl.textContent = 'CLOCK STOPPED';
            statusEl.className = 'sb-status stopped';
        }

        $('sb-home-name').textContent = (home.name || 'HOME').toUpperCase();
        $('sb-away-name').textContent = (away.name || 'AWAY').toUpperCase();
        $('sb-home-score').textContent = (home.score && home.score.current) || 0;
        $('sb-away-score').textContent = (away.score && away.score.current) || 0;

        var q = state.currentQuarter || 1;
        var homeFouls = getQuarterFouls('home', q, bs);
        var awayFouls = getQuarterFouls('away', q, bs);
        $('sb-home-fouls').textContent = homeFouls;
        $('sb-away-fouls').textContent = awayFouls;

        // Bonus: if opponent's fouls >= threshold, this team is in bonus
        var bonusCfg = getBonusConfig(payload);
        function bonusLabel(oppFouls) {
            if (bonusCfg.doubleBonus != null && oppFouls >= bonusCfg.doubleBonus) return '2X BONUS';
            if (bonusCfg.oneAndOne != null && oppFouls >= bonusCfg.oneAndOne) return 'BONUS';
            return '';
        }
        $('sb-home-bonus').textContent = bonusLabel(awayFouls);
        $('sb-away-bonus').textContent = bonusLabel(homeFouls);

        // Possession
        var poss = state.possession;
        $('sb-home-poss').classList.toggle('active', poss === 'home');
        $('sb-away-poss').classList.toggle('active', poss === 'away');

        // Timeouts
        var homeTO = home.stats && home.stats.timeouts && home.stats.timeouts.remaining;
        var awayTO = away.stats && away.stats.timeouts && away.stats.timeouts.remaining;
        $('sb-home-timeouts').textContent = 'TO ' + ((homeTO && homeTO.full) || 0) + 'F / ' + ((homeTO && homeTO.short) || 0) + 'S';
        $('sb-away-timeouts').textContent = 'TO ' + ((awayTO && awayTO.full) || 0) + 'F / ' + ((awayTO && awayTO.short) || 0) + 'S';

        // Connection indicator
        var conn = $('sb-conn');
        if (payload.updatedAt && payload.updatedAt !== lastUpdatedAt) {
            lastUpdatedAt = payload.updatedAt;
            conn.textContent = 'LIVE';
            conn.className = 'sb-conn ok';
        } else {
            // No new data this poll — keep status but mark slightly stale if extended
            if (!conn.classList.contains('ok')) {
                conn.textContent = 'LIVE';
                conn.className = 'sb-conn ok';
            }
        }
    }

    function setConnError(msg) {
        var conn = $('sb-conn');
        conn.textContent = msg || 'CONNECTION LOST';
        conn.className = 'sb-conn err';
    }

    function pollOnce(gameId) {
        return fetch(API_URL)
            .then(function (r) {
                if (!r.ok) throw new Error('HTTP ' + r.status);
                return r.json();
            })
            .then(function (data) {
                var games = data.games || [];
                var match = null;
                for (var i = 0; i < games.length; i++) {
                    if (games[i].gameId === gameId) { match = games[i]; break; }
                }
                if (!match) {
                    setConnError('GAME NOT FOUND');
                    return;
                }
                renderScoreboard(match);
            })
            .catch(function (err) {
                setConnError('CONNECTION LOST');
                console.warn('Poll failed:', err && err.message);
            });
    }

    function startScoreboard(gameId) {
        show('scoreboard-view');
        pollOnce(gameId);
        if (pollHandle) clearInterval(pollHandle);
        pollHandle = setInterval(function () { pollOnce(gameId); }, POLL_INTERVAL);
    }

    // Pause polling when tab is hidden to save bandwidth
    document.addEventListener('visibilitychange', function () {
        var gameId = getQueryParam('game');
        if (!gameId) return;
        if (document.hidden) {
            if (pollHandle) { clearInterval(pollHandle); pollHandle = null; }
        } else if (!pollHandle) {
            pollHandle = setInterval(function () { pollOnce(gameId); }, POLL_INTERVAL);
            pollOnce(gameId);
        }
    });

    // ── Boot ──────────────────────────
    var gameId = getQueryParam('game');
    if (gameId) {
        startScoreboard(gameId);
    } else {
        loadSelector();
    }
})();
