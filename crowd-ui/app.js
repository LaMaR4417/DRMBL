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
        var t = Math.max(0, seconds);
        if (t < 60) {
            // Last minute: show SS.t
            var whole = Math.floor(t);
            var tenths = Math.floor((t - whole) * 10);
            return whole + '.' + tenths;
        }
        var s = Math.floor(t);
        var m = Math.floor(s / 60);
        var rem = s % 60;
        return m + ':' + (rem < 10 ? '0' : '') + rem;
    }

    function formatPeriod(quarter) {
        if (quarter == null) return 'Q1';
        if (quarter <= 4) return 'Q' + quarter;
        return 'OT' + (quarter - 4);
    }

    // Compact period display for the big yellow center label: "1st"-"4th" or "OT"/"OT2"
    function formatPeriodShort(quarter) {
        var ordinals = { 1: '1st', 2: '2nd', 3: '3rd', 4: '4th' };
        if (quarter == null) return ordinals[1];
        if (quarter <= 4) return ordinals[quarter];
        var n = quarter - 4;
        return n === 1 ? 'OT' : 'OT' + n;
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
    var clockHandle = null;
    var lastUpdatedAt = null;
    var localClock = {
        timeLeft: 0,
        active: false,
        finished: false
    };
    // Overlay state — when either is active, the clock + period labels are overridden
    var breakState = { active: false, seconds: 0, lastQuarter: null };
    var timeoutState = { active: false, seconds: 0, type: null, side: null };

    function startLocalClock() {
        stopLocalClock();
        var lastTick = performance.now();
        clockHandle = setInterval(function () {
            var now = performance.now();
            var delta = (now - lastTick) / 1000;
            lastTick = now;
            // Don't tick the regular clock while a break or timeout overlay is showing
            if (breakState.active || timeoutState.active) return;
            if (localClock.active && localClock.timeLeft > 0) {
                localClock.timeLeft -= delta;
                if (localClock.timeLeft < 0) localClock.timeLeft = 0;
                $('sb-clock').textContent = formatClock(localClock.timeLeft);
            }
        }, 100);
    }

    function applyBreakOverlay() {
        $('sb-clock').textContent = formatClock(breakState.seconds);
        $('sb-period').textContent = 'BRK';
    }

    function applyTimeoutOverlay() {
        $('sb-clock').textContent = formatClock(timeoutState.seconds);
        $('sb-period').textContent = 'TO';
    }

    function stopLocalClock() {
        if (clockHandle) { clearInterval(clockHandle); clockHandle = null; }
    }

    function renderScoreboard(payload, fromBroadcast) {
        var bs = payload && payload.boxScore;
        if (!bs) return;
        var state = (bs.gameInfo && bs.gameInfo.state) || {};
        var general = (bs.gameInfo && bs.gameInfo.general) || {};
        var home = (bs.teamInfo && bs.teamInfo.home) || {};
        var away = (bs.teamInfo && bs.teamInfo.away) || {};

        $('sb-period').textContent = formatPeriodShort(state.currentQuarter);

        // Sync local clock from server. In broadcast mode the source is in-browser
        // (zero latency) so we trust every payload. In polled mode we only sync on
        // first payload, when the server is paused, or when drift > ~1.5s — that
        // prevents the tenths digit from flickering back to .0 on every poll.
        var serverTime = state.clock && state.clock.timeLeft;
        var isFinal = general.status === 'final';
        if (serverTime != null) {
            var drift = Math.abs(localClock.timeLeft - serverTime);
            var firstPayload = lastUpdatedAt == null;
            var serverPaused = !state.active;
            if (fromBroadcast || firstPayload || serverPaused || drift > 1.5) {
                localClock.timeLeft = serverTime;
            }
            localClock.active = !!state.active && !isFinal;
            localClock.finished = isFinal;
        }

        // Clock color: white by default, red only when stopped mid-period
        // (between-quarter pauses, pre-game, period-end, and FINAL stay white)
        var q = state.currentQuarter || 1;
        var periodLength = (state.clock && (q > 4 ? state.clock.perOT : state.clock.perQuarter)) || null;
        var t = localClock.timeLeft;
        var atPeriodStart = periodLength != null && t >= periodLength - 0.05;
        var atPeriodEnd = t <= 0.05;
        var stoppedMid = !localClock.active && !isFinal && !atPeriodStart && !atPeriodEnd;

        var clockEl = $('sb-clock');
        clockEl.textContent = formatClock(localClock.timeLeft);
        clockEl.classList.toggle('clock-stopped-mid', stoppedMid);

        // Team names + scores
        $('sb-home-name').textContent = (home.name || 'HOME TEAM').toUpperCase();
        $('sb-away-name').textContent = (away.name || 'AWAY TEAM').toUpperCase();
        $('sb-home-score').textContent = (home.score && home.score.current) || 0;
        $('sb-away-score').textContent = (away.score && away.score.current) || 0;

        // Possession arrows
        var poss = state.possession;
        $('sb-home-arrow').classList.toggle('active', poss === 'home');
        $('sb-away-arrow').classList.toggle('active', poss === 'away');

        // Bonus dots — level driven by opponent's quarter fouls vs settings thresholds
        var homeFouls = getQuarterFouls('home', q, bs);
        var awayFouls = getQuarterFouls('away', q, bs);
        var bonusCfg = getBonusConfig(payload);
        function bonusLevel(oppFouls) {
            if (bonusCfg.doubleBonus != null && oppFouls >= bonusCfg.doubleBonus) return 2;
            if (bonusCfg.oneAndOne != null && oppFouls >= bonusCfg.oneAndOne) return 1;
            return 0;
        }
        function applyBonus(side, level) {
            var lbl = $('sb-' + side + '-bonus-text');
            lbl.textContent = level === 2 ? 'DOUBLE BONUS' : 'BONUS';
            lbl.classList.toggle('active', level > 0);
        }
        applyBonus('home', bonusLevel(awayFouls));
        applyBonus('away', bonusLevel(homeFouls));

        // Foul counts (this team's fouls this quarter)
        $('sb-home-fouls').textContent = homeFouls;
        $('sb-away-fouls').textContent = awayFouls;

        // Timeouts (FULL # / SHORT # remaining)
        var homeTO = (home.stats && home.stats.timeouts && home.stats.timeouts.remaining) || {};
        var awayTO = (away.stats && away.stats.timeouts && away.stats.timeouts.remaining) || {};
        $('sb-home-to-full').textContent = homeTO.full || 0;
        $('sb-home-to-short').textContent = homeTO.short || 0;
        $('sb-away-to-full').textContent = awayTO.full || 0;
        $('sb-away-to-short').textContent = awayTO.short || 0;

        // Connection indicator
        var conn = $('sb-conn');
        if (payload.updatedAt && payload.updatedAt !== lastUpdatedAt) {
            lastUpdatedAt = payload.updatedAt;
            conn.textContent = 'LIVE';
            conn.className = 'sb-conn ok';
        } else if (!conn.classList.contains('ok')) {
            conn.textContent = 'LIVE';
            conn.className = 'sb-conn ok';
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
        startLocalClock();
        pollOnce(gameId);
        if (pollHandle) clearInterval(pollHandle);
        pollHandle = setInterval(function () { pollOnce(gameId); }, POLL_INTERVAL);
    }

    // ── Broadcast scoreboard (zero-latency in-browser sync) ──
    var bc = null;
    function startBroadcastScoreboard() {
        show('scoreboard-view');
        startLocalClock();
        var conn = $('sb-conn');
        conn.textContent = 'WAITING FOR TRACKER';
        conn.className = 'sb-conn';

        if (typeof BroadcastChannel === 'undefined') {
            setConnError('BROADCASTCHANNEL UNSUPPORTED');
            return;
        }

        bc = new BroadcastChannel('drmbl-live-game');
        bc.onmessage = function (ev) {
            var msg = ev && ev.data;
            if (!msg) return;
            if (msg.type === 'state' && msg.payload) {
                renderScoreboard(msg.payload, true);
                // Re-apply any active overlay since renderScoreboard rewrote clock/period
                if (timeoutState.active) applyTimeoutOverlay();
                else if (breakState.active) applyBreakOverlay();
            } else if (msg.type === 'break') {
                if (msg.breakCountdown != null && msg.breakCountdown > 0) {
                    breakState.active = true;
                    breakState.seconds = msg.breakCountdown;
                    breakState.lastQuarter = msg.currentQuarter;
                    if (!timeoutState.active) applyBreakOverlay();
                } else {
                    breakState.active = false;
                    breakState.seconds = 0;
                    // The next state broadcast will restore the regular display
                }
            } else if (msg.type === 'timeout') {
                if (msg.timeLeft != null && msg.timeLeft > 0) {
                    timeoutState.active = true;
                    timeoutState.seconds = msg.timeLeft;
                    timeoutState.type = msg.timeoutType || null;
                    timeoutState.side = msg.side || null;
                    applyTimeoutOverlay();
                } else {
                    timeoutState.active = false;
                    timeoutState.seconds = 0;
                    // Restore: break overlay if still active, else next state will fix clock
                    if (breakState.active) applyBreakOverlay();
                }
            } else if (msg.type === 'end') {
                breakState.active = false;
                timeoutState.active = false;
                renderScoreboard(msg.payload || { boxScore: {} }, true);
                var c = $('sb-conn');
                c.textContent = 'GAME ENDED';
                c.className = 'sb-conn';
            }
        };
        // Ask the tracker for current state so we render immediately on open
        try { bc.postMessage({ type: 'request-state' }); } catch (e) { /* ignore */ }
    }

    function stopBroadcast() {
        if (bc) { try { bc.close(); } catch (e) {} bc = null; }
    }

    // Pause polling + local clock when tab is hidden to save bandwidth
    document.addEventListener('visibilitychange', function () {
        var gameId = getQueryParam('game');
        var source = getQueryParam('source');
        if (!gameId && source !== 'broadcast') return;
        if (document.hidden) {
            if (pollHandle) { clearInterval(pollHandle); pollHandle = null; }
            stopLocalClock();
        } else {
            if (gameId && !pollHandle) {
                pollHandle = setInterval(function () { pollOnce(gameId); }, POLL_INTERVAL);
                pollOnce(gameId);
            }
            startLocalClock();
        }
    });

    // ── Boot ──────────────────────────
    var source = getQueryParam('source');
    var gameId = getQueryParam('game');
    if (source === 'broadcast') {
        startBroadcastScoreboard();
    } else if (gameId) {
        startScoreboard(gameId);
    } else {
        loadSelector();
    }
})();
