/* ── TEAM ADDER: Admin Portal Logic ── */

(function () {
    var state = {
        seasons: [],
        selectedSeason: null,
        playerCount: 0
    };

    var MAX_PLAYERS = 12;

    // ── DOM References ──
    var seasonSelect = document.getElementById('season-select');
    var btnNewSeason = document.getElementById('btn-new-season');
    var newSeasonForm = document.getElementById('new-season-form');
    var btnCreateSeason = document.getElementById('btn-create-season');
    var playoffsEnabled = document.getElementById('season-playoffs-enabled');
    var playoffConfig = document.getElementById('playoff-config');
    var btnAddPlayoffRound = document.getElementById('btn-add-playoff-round');
    var slotOverview = document.getElementById('slot-overview');
    var slotGrid = document.getElementById('slot-grid');
    var teamSection = document.getElementById('team-section');
    var rosterSection = document.getElementById('roster-section');
    var submitSection = document.getElementById('submit-section');
    var btnAddPlayer = document.getElementById('btn-add-player');
    var btnSubmitTeam = document.getElementById('btn-submit-team');
    var rosterList = document.getElementById('roster-list');
    var statusMessage = document.getElementById('status-message');

    // ── Utility ──

    function show(el) { el.classList.remove('hidden'); }
    function hide(el) { el.classList.add('hidden'); }

    function showStatus(msg, type) {
        statusMessage.textContent = msg;
        statusMessage.className = 'status-message ' + type;
        show(statusMessage);
        statusMessage.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }

    function hideStatus() { hide(statusMessage); }

    function formatPhone(input) {
        var digits = input.value.replace(/\D/g, '').substring(0, 10);
        var formatted = '';
        if (digits.length > 0) formatted = '(' + digits.substring(0, 3);
        if (digits.length >= 3) formatted += ') ' + digits.substring(3, 6);
        if (digits.length >= 6) formatted += '-' + digits.substring(6);
        input.value = formatted;
    }

    // ── Load Seasons ──

    function loadSeasons() {
        seasonSelect.innerHTML = '<option value="">Loading...</option>';
        fetch('/api/admin/seasons')
            .then(function (res) { return res.json(); })
            .then(function (data) {
                if (!data.success || !data.seasons) {
                    seasonSelect.innerHTML = '<option value="">Failed to load</option>';
                    return;
                }
                state.seasons = data.seasons;
                seasonSelect.innerHTML = '<option value="">-- Select a Season --</option>';
                for (var i = 0; i < data.seasons.length; i++) {
                    var s = data.seasons[i];
                    var opt = document.createElement('option');
                    opt.value = s.id;
                    var filledCount = 0;
                    var totalSlots = s.teams ? s.teams.length : 0;
                    if (s.teams) {
                        for (var t = 0; t < s.teams.length; t++) {
                            if (s.teams[t].teamID) filledCount++;
                        }
                    }
                    opt.textContent = s.id + ' (' + filledCount + '/' + totalSlots + ' teams)';
                    seasonSelect.appendChild(opt);
                }
            })
            .catch(function () {
                seasonSelect.innerHTML = '<option value="">Error loading seasons</option>';
            });
    }

    // ── Season Selection ──

    seasonSelect.addEventListener('change', function () {
        hideStatus();
        var seasonId = seasonSelect.value;
        if (!seasonId) {
            state.selectedSeason = null;
            hide(slotOverview);
            hide(teamSection);
            hide(rosterSection);
            hide(submitSection);
            return;
        }

        // Find the season in cached data
        for (var i = 0; i < state.seasons.length; i++) {
            if (state.seasons[i].id === seasonId) {
                state.selectedSeason = state.seasons[i];
                break;
            }
        }

        renderSlotOverview();
        renderTeamSection();
        show(slotOverview);
        show(teamSection);
        show(rosterSection);
        show(submitSection);

        // Init roster with 1 player if empty
        if (state.playerCount === 0) addPlayerRow();
    });

    // ── Slot Overview ──

    function renderSlotOverview() {
        var season = state.selectedSeason;
        if (!season || !season.teams) return;

        slotGrid.innerHTML = '';
        document.getElementById('slot-overview-label').textContent =
            'Team Slots (' + season.teams.length + ' total)';

        for (var i = 0; i < season.teams.length; i++) {
            var slot = season.teams[i];
            var card = document.createElement('div');
            var isOccupied = !!slot.teamID;
            card.className = 'slot-card ' + (isOccupied ? 'occupied' : 'open');
            card.innerHTML =
                '<span class="slot-letter">' + slot.slot + '</span>' +
                '<span class="slot-team-name">' + (isOccupied ? slot.name : 'OPEN') + '</span>';
            slotGrid.appendChild(card);
        }
    }

    // ── Team Section ──

    function renderTeamSection() {
        var season = state.selectedSeason;
        if (!season || !season.teams) return;

        var teamSlot = document.getElementById('team-slot');
        teamSlot.innerHTML = '';

        // Auto option
        var autoOpt = document.createElement('option');
        autoOpt.value = '';
        autoOpt.textContent = 'Auto (first open)';
        teamSlot.appendChild(autoOpt);

        for (var i = 0; i < season.teams.length; i++) {
            var slot = season.teams[i];
            if (!slot.teamID) {
                var opt = document.createElement('option');
                opt.value = slot.slot;
                opt.textContent = 'Slot ' + slot.slot;
                teamSlot.appendChild(opt);
            }
        }
    }

    // ── New Season Toggle ──

    btnNewSeason.addEventListener('click', function () {
        if (newSeasonForm.classList.contains('hidden')) {
            show(newSeasonForm);
            btnNewSeason.textContent = 'Cancel';
        } else {
            hide(newSeasonForm);
            btnNewSeason.textContent = '+ New Season';
        }
    });

    // ── Playoffs Toggle ──

    playoffsEnabled.addEventListener('change', function () {
        if (playoffsEnabled.checked) {
            show(playoffConfig);
        } else {
            hide(playoffConfig);
        }
    });

    // ── Add Playoff Round ──

    btnAddPlayoffRound.addEventListener('click', function () {
        var row = document.createElement('div');
        row.className = 'playoff-round-row';
        row.innerHTML =
            '<input type="text" class="playoff-round-name" placeholder="Round name">' +
            '<input type="text" class="playoff-round-away" placeholder="Away">' +
            '<input type="text" class="playoff-round-home" placeholder="Home">' +
            '<button type="button" class="link-remove playoff-remove">&times;</button>';
        document.getElementById('playoff-rounds-list').appendChild(row);
    });

    // Remove playoff round
    document.getElementById('playoff-rounds-list').addEventListener('click', function (e) {
        if (e.target.classList.contains('playoff-remove')) {
            e.target.closest('.playoff-round-row').remove();
        }
    });

    // ── Create Season ──

    btnCreateSeason.addEventListener('click', function () {
        hideStatus();

        var name = document.getElementById('season-name').value.trim();
        var division = document.getElementById('season-division').value.trim();
        var teamCount = parseInt(document.getElementById('season-team-count').value);
        var weeks = parseInt(document.getElementById('season-weeks').value);

        if (!name || !division || !teamCount || !weeks) {
            showStatus('Please fill in season name, division, team count, and weeks.', 'error');
            return;
        }

        var startMM = document.getElementById('season-start-mm').value.trim();
        var startDD = document.getElementById('season-start-dd').value.trim();
        var startYYYY = document.getElementById('season-start-yyyy').value.trim();

        if (!startMM || !startDD || !startYYYY) {
            showStatus('Please fill in the start date.', 'error');
            return;
        }

        var beginning = {
            year: parseInt(startYYYY),
            month: parseInt(startMM),
            date: parseInt(startDD)
        };

        var timeline = { beginning: beginning };

        var endMM = document.getElementById('season-end-mm').value.trim();
        var endDD = document.getElementById('season-end-dd').value.trim();
        var endYYYY = document.getElementById('season-end-yyyy').value.trim();
        if (endMM && endDD && endYYYY) {
            timeline.end = {
                year: parseInt(endYYYY),
                month: parseInt(endMM),
                date: parseInt(endDD)
            };
        }

        var breakWeeksStr = document.getElementById('season-break-weeks').value.trim();
        var breakWeeks = [];
        if (breakWeeksStr) {
            breakWeeks = breakWeeksStr.split(',').map(function (s) { return parseInt(s.trim()); }).filter(function (n) { return !isNaN(n); });
        }

        var schedule = {
            regularWeeks: weeks,
            weekIntervalDays: parseInt(document.getElementById('season-week-interval').value) || 7,
            gameStartTime: document.getElementById('season-game-start').value.trim() || '8:00 AM',
            gameIntervalMinutes: parseInt(document.getElementById('season-game-interval').value) || 60,
            breakWeeks: breakWeeks
        };

        // Playoffs
        if (playoffsEnabled.checked) {
            var rounds = [];
            var rows = document.querySelectorAll('#playoff-rounds-list .playoff-round-row');
            for (var i = 0; i < rows.length; i++) {
                var roundName = rows[i].querySelector('.playoff-round-name').value.trim();
                var away = rows[i].querySelector('.playoff-round-away').value.trim();
                var home = rows[i].querySelector('.playoff-round-home').value.trim();
                if (roundName) {
                    rounds.push({ name: roundName, away: away || roundName, home: home || roundName });
                }
            }

            var playoffObj = { enabled: true, rounds: rounds };

            var pfMM = document.getElementById('playoff-date-mm').value.trim();
            var pfDD = document.getElementById('playoff-date-dd').value.trim();
            var pfYYYY = document.getElementById('playoff-date-yyyy').value.trim();
            if (pfMM && pfDD && pfYYYY) {
                playoffObj.date = { year: parseInt(pfYYYY), month: parseInt(pfMM), date: parseInt(pfDD) };
            }

            playoffObj.gameIntervalMinutes = parseInt(document.getElementById('playoff-game-interval').value) || 90;

            schedule.playoffs = playoffObj;
        } else {
            schedule.playoffs = { enabled: false };
        }

        var payload = {
            name: name,
            division: division,
            teamCount: teamCount,
            timeline: timeline,
            schedule: schedule
        };

        btnCreateSeason.disabled = true;
        btnCreateSeason.textContent = 'CREATING...';

        fetch('/api/admin/create-season', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        })
        .then(function (res) { return res.json().then(function (data) { return { ok: res.ok, data: data }; }); })
        .then(function (result) {
            if (result.ok && result.data.success) {
                showStatus('Season created: ' + result.data.id + ' (' + result.data.teamCount + ' teams, ' + result.data.weeks + ' weeks)', 'success');
                hide(newSeasonForm);
                btnNewSeason.textContent = '+ New Season';
                loadSeasons();
            } else {
                showStatus('Error: ' + (result.data.error || 'Failed to create season'), 'error');
            }
        })
        .catch(function () {
            showStatus('Network error. Please try again.', 'error');
        })
        .finally(function () {
            btnCreateSeason.disabled = false;
            btnCreateSeason.textContent = 'Create Season';
        });
    });

    // ── Roster: Add Player Row ──

    function addPlayerRow() {
        if (state.playerCount >= MAX_PLAYERS) return;
        state.playerCount++;
        var n = state.playerCount;

        var row = document.createElement('div');
        row.className = 'admin-roster-row';
        row.setAttribute('data-player', n);

        row.innerHTML =
            '<div class="admin-roster-header">' +
                '<span class="admin-roster-num">' + n + '</span>' +
                '<input type="text" class="admin-roster-name-input" name="p' + n + '-name" ' +
                    'placeholder="Player name *" style="flex:1;padding:10px 14px;background:rgba(255,255,255,0.04);' +
                    'border:1px solid rgba(255,255,255,0.07);color:#fff;font-family:Inter,sans-serif;font-size:14px;outline:none;">' +
                '<button type="button" class="admin-roster-remove" title="Remove">&times;</button>' +
            '</div>' +
            '<button type="button" class="admin-roster-toggle">More details</button>' +
            '<div class="admin-roster-details">' +
                '<div class="form-row">' +
                    '<div class="form-group">' +
                        '<label>Date of Birth</label>' +
                        '<div class="dob-group">' +
                            '<input type="text" name="p' + n + '-mm" placeholder="MM" maxlength="2" inputmode="numeric">' +
                            '<span class="dob-sep">/</span>' +
                            '<input type="text" name="p' + n + '-dd" placeholder="DD" maxlength="2" inputmode="numeric">' +
                            '<span class="dob-sep">/</span>' +
                            '<input type="text" name="p' + n + '-yyyy" placeholder="YYYY" maxlength="4" inputmode="numeric">' +
                        '</div>' +
                    '</div>' +
                    '<div class="form-group">' +
                        '<label>Phone</label>' +
                        '<input type="tel" name="p' + n + '-phone" placeholder="Phone">' +
                    '</div>' +
                '</div>' +
                '<div class="form-row">' +
                    '<div class="form-group">' +
                        '<label>Primary Position</label>' +
                        '<select name="p' + n + '-position">' +
                            '<option value="">--</option>' +
                            '<option value="PG">PG</option>' +
                            '<option value="SG">SG</option>' +
                            '<option value="SF">SF</option>' +
                            '<option value="PF">PF</option>' +
                            '<option value="C">C</option>' +
                        '</select>' +
                    '</div>' +
                    '<div class="form-group">' +
                        '<label>Secondary Positions</label>' +
                        '<input type="text" name="p' + n + '-secondary" placeholder="e.g. SG, SF">' +
                    '</div>' +
                '</div>' +
                '<div class="form-row">' +
                    '<div class="form-group">' +
                        '<label>Height (ft)</label>' +
                        '<input type="number" name="p' + n + '-height-ft" min="3" max="8" placeholder="ft">' +
                    '</div>' +
                    '<div class="form-group">' +
                        '<label>Height (in)</label>' +
                        '<input type="number" name="p' + n + '-height-in" min="0" max="11" placeholder="in">' +
                    '</div>' +
                    '<div class="form-group">' +
                        '<label>Weight (lbs)</label>' +
                        '<input type="number" name="p' + n + '-weight" min="50" max="500" placeholder="lbs">' +
                    '</div>' +
                    '<div class="form-group">' +
                        '<label>Hand</label>' +
                        '<select name="p' + n + '-hand">' +
                            '<option value="">--</option>' +
                            '<option value="Right">Right</option>' +
                            '<option value="Left">Left</option>' +
                        '</select>' +
                    '</div>' +
                '</div>' +
                '<div class="form-group">' +
                    '<label class="checkbox-label">' +
                        '<input type="checkbox" name="p' + n + '-waiver">' +
                        '<span>Insurance waiver signed</span>' +
                    '</label>' +
                '</div>' +
            '</div>';

        rosterList.appendChild(row);

        if (state.playerCount >= MAX_PLAYERS) {
            btnAddPlayer.style.display = 'none';
        }
    }

    btnAddPlayer.addEventListener('click', addPlayerRow);

    // ── Roster: Toggle Details / Remove ──

    rosterList.addEventListener('click', function (e) {
        // Toggle details
        if (e.target.classList.contains('admin-roster-toggle')) {
            var details = e.target.nextElementSibling;
            if (details.classList.contains('expanded')) {
                details.classList.remove('expanded');
                e.target.textContent = 'More details';
            } else {
                details.classList.add('expanded');
                e.target.textContent = 'Less details';
            }
        }

        // Remove player
        if (e.target.classList.contains('admin-roster-remove')) {
            e.target.closest('.admin-roster-row').remove();
            state.playerCount--;
            // Re-number
            var rows = rosterList.querySelectorAll('.admin-roster-row');
            for (var i = 0; i < rows.length; i++) {
                rows[i].querySelector('.admin-roster-num').textContent = i + 1;
            }
            if (state.playerCount < MAX_PLAYERS) {
                btnAddPlayer.style.display = '';
            }
        }
    });

    // ── Phone formatting in roster ──

    rosterList.addEventListener('input', function (e) {
        if (e.target.type === 'tel') formatPhone(e.target);
        // Numeric only for DOB fields
        if (e.target.name && (e.target.name.indexOf('-mm') !== -1 || e.target.name.indexOf('-dd') !== -1 || e.target.name.indexOf('-yyyy') !== -1)) {
            e.target.value = e.target.value.replace(/\D/g, '');
        }
    });

    // ── Phone formatting for owner ──

    document.getElementById('owner-phone').addEventListener('input', function () {
        formatPhone(this);
    });

    // ── DOB auto-advance for season date fields ──

    document.querySelectorAll('.dob-group input').forEach(function (input) {
        input.addEventListener('input', function () {
            if (input.name && (input.name.indexOf('-mm') !== -1 || input.name.indexOf('-dd') !== -1 || input.name.indexOf('-yyyy') !== -1)) {
                input.value = input.value.replace(/\D/g, '');
            }
            var max = parseInt(input.getAttribute('maxlength'));
            if (max && input.value.length >= max) {
                input.value = input.value.substring(0, max);
                var group = input.closest('.dob-group');
                var inputs = group.querySelectorAll('input');
                for (var i = 0; i < inputs.length - 1; i++) {
                    if (inputs[i] === input) { inputs[i + 1].focus(); break; }
                }
            }
        });
    });

    // ── Submit Team ──

    btnSubmitTeam.addEventListener('click', function () {
        hideStatus();

        if (!state.selectedSeason) {
            showStatus('Please select a season first.', 'error');
            return;
        }

        var teamName = document.getElementById('team-name').value.trim();
        var ownerName = document.getElementById('owner-name').value.trim();

        if (!teamName) {
            showStatus('Team name is required.', 'error');
            document.getElementById('team-name').focus();
            return;
        }

        if (!ownerName) {
            showStatus('Owner name is required.', 'error');
            document.getElementById('owner-name').focus();
            return;
        }

        // Collect players
        var players = [];
        var rows = rosterList.querySelectorAll('.admin-roster-row');
        for (var i = 0; i < rows.length; i++) {
            var nameInput = rows[i].querySelector('.admin-roster-name-input');
            var name = nameInput ? nameInput.value.trim() : '';
            if (!name) continue;

            var n = rows[i].getAttribute('data-player');

            var mm = (rows[i].querySelector('[name="p' + n + '-mm"]') || {}).value || '';
            var dd = (rows[i].querySelector('[name="p' + n + '-dd"]') || {}).value || '';
            var yyyy = (rows[i].querySelector('[name="p' + n + '-yyyy"]') || {}).value || '';

            var player = {
                name: name,
                dob: {
                    month: mm ? parseInt(mm) : null,
                    date: dd ? parseInt(dd) : null,
                    year: yyyy ? parseInt(yyyy) : null
                },
                phone: (rows[i].querySelector('[name="p' + n + '-phone"]') || {}).value || '',
                position: (rows[i].querySelector('[name="p' + n + '-position"]') || {}).value || '',
                secondaryPositions: (rows[i].querySelector('[name="p' + n + '-secondary"]') || {}).value || '',
                heightFt: (rows[i].querySelector('[name="p' + n + '-height-ft"]') || {}).value || '',
                heightIn: (rows[i].querySelector('[name="p' + n + '-height-in"]') || {}).value || '',
                weight: (rows[i].querySelector('[name="p' + n + '-weight"]') || {}).value || '',
                handedness: (rows[i].querySelector('[name="p' + n + '-hand"]') || {}).value || '',
                waiverSigned: (rows[i].querySelector('[name="p' + n + '-waiver"]') || {}).checked || false
            };

            players.push(player);
        }

        var slot = document.getElementById('team-slot').value || undefined;

        var payload = {
            seasonId: state.selectedSeason.id,
            teamName: teamName,
            owner: {
                name: ownerName,
                phone: document.getElementById('owner-phone').value.trim(),
                email: document.getElementById('owner-email').value.trim()
            },
            players: players,
            slot: slot
        };

        btnSubmitTeam.disabled = true;
        btnSubmitTeam.textContent = 'ADDING TEAM...';

        fetch('/api/admin/add-team', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        })
        .then(function (res) { return res.json().then(function (data) { return { ok: res.ok, data: data }; }); })
        .then(function (result) {
            if (result.ok && result.data.success) {
                showStatus('Team added! ' + teamName + ' assigned to slot ' + result.data.slot + ' (ID: ' + result.data.teamID + ')', 'success');
                clearTeamForm();
                // Refresh seasons to update slot overview
                loadSeasons();
                // Re-select the season after refresh
                setTimeout(function () {
                    seasonSelect.value = state.selectedSeason.id;
                    seasonSelect.dispatchEvent(new Event('change'));
                }, 500);
            } else {
                showStatus('Error: ' + (result.data.error || 'Failed to add team'), 'error');
            }
        })
        .catch(function () {
            showStatus('Network error. Please try again.', 'error');
        })
        .finally(function () {
            btnSubmitTeam.disabled = false;
            btnSubmitTeam.textContent = 'Add Team to Season';
        });
    });

    function clearTeamForm() {
        document.getElementById('team-name').value = '';
        document.getElementById('owner-name').value = '';
        document.getElementById('owner-phone').value = '';
        document.getElementById('owner-email').value = '';
        rosterList.innerHTML = '';
        state.playerCount = 0;
        btnAddPlayer.style.display = '';
        addPlayerRow();
    }

    // ── Cheat code: SHIFT + AUTO ──

    (function () {
        var buffer = '';
        document.addEventListener('keydown', function (e) {
            if (!e.shiftKey) { buffer = ''; return; }
            if (e.key.length === 1) buffer += e.key.toUpperCase();
            if (buffer.indexOf('AUTO') !== -1) {
                buffer = '';
                e.preventDefault();
                document.getElementById('team-name').value = 'Test Team';
                document.getElementById('owner-name').value = 'John Owner';
                document.getElementById('owner-phone').value = '(830) 555-1234';
                document.getElementById('owner-email').value = 'owner@test.com';

                // Fill first player
                var firstRow = rosterList.querySelector('.admin-roster-row');
                if (firstRow) {
                    firstRow.querySelector('.admin-roster-name-input').value = 'Mike Johnson';
                    var n = firstRow.getAttribute('data-player');
                    var mm = firstRow.querySelector('[name="p' + n + '-mm"]');
                    var dd = firstRow.querySelector('[name="p' + n + '-dd"]');
                    var yyyy = firstRow.querySelector('[name="p' + n + '-yyyy"]');
                    if (mm) mm.value = '03';
                    if (dd) dd.value = '15';
                    if (yyyy) yyyy.value = '1995';
                }
            }
        });
        document.addEventListener('keyup', function (e) {
            if (e.key === 'Shift') buffer = '';
        });
    })();

    // ── Init ──
    loadSeasons();

})();
