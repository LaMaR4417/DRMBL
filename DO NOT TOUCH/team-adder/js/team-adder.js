/* ── TEAM ADDER: Admin Portal Logic ── */

(function () {
    var state = {
        seasons: [],
        selectedSeason: null,
        playerCount: 0,
        maxPlayers: 12,
        mode: null,         // 'add' or 'edit'
        selectedSlot: null, // slot letter
        editingTeamId: null // team ID when editing
    };

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
    var modeBanner = document.getElementById('mode-banner');
    var modeBannerText = document.getElementById('mode-banner-text');
    var modeBannerCancel = document.getElementById('mode-banner-cancel');
    var teamSection = document.getElementById('team-section');
    var teamSectionLegend = document.getElementById('team-section-legend');
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
        fetch('/api/admin?action=seasons')
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
        exitMode();

        var seasonId = seasonSelect.value;
        if (!seasonId) {
            state.selectedSeason = null;
            hide(slotOverview);
            return;
        }

        for (var i = 0; i < state.seasons.length; i++) {
            if (state.seasons[i].id === seasonId) {
                state.selectedSeason = state.seasons[i];
                break;
            }
        }

        state.maxPlayers = (state.selectedSeason && state.selectedSeason.maxRoster) || 12;

        renderSlotOverview();
        show(slotOverview);
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
            if (state.selectedSlot === slot.slot) card.className += ' selected';
            card.setAttribute('data-slot', slot.slot);
            if (isOccupied) card.setAttribute('data-team-id', slot.teamID);
            card.innerHTML =
                '<span class="slot-letter">' + slot.slot + '</span>' +
                '<span class="slot-team-name">' + (isOccupied ? slot.name : 'OPEN') + '</span>';
            slotGrid.appendChild(card);
        }
    }

    // ── Slot Click Handler ──

    slotGrid.addEventListener('click', function (e) {
        var card = e.target.closest('.slot-card');
        if (!card) return;

        hideStatus();
        var slotLetter = card.getAttribute('data-slot');
        var teamId = card.getAttribute('data-team-id');

        if (teamId) {
            // Occupied slot → edit mode
            enterEditMode(slotLetter, teamId);
        } else {
            // Open slot → add mode
            enterAddMode(slotLetter);
        }
    });

    // ── Mode Management ──

    function enterAddMode(slotLetter) {
        exitMode();
        state.mode = 'add';
        state.selectedSlot = slotLetter;
        state.editingTeamId = null;

        // Update slot highlight
        renderSlotOverview();

        // Show banner
        modeBanner.className = 'mode-banner mode-add';
        modeBannerText.textContent = 'Adding new team to Slot ' + slotLetter;
        show(modeBanner);

        // Update form sections
        teamSectionLegend.textContent = 'New Team — Slot ' + slotLetter;
        btnSubmitTeam.textContent = 'Add Team to Season';
        document.getElementById('roster-note').textContent =
            'Add players to the team. Only name is required. Up to ' + state.maxPlayers + ' players.';

        clearTeamForm();
        show(teamSection);
        show(rosterSection);
        show(submitSection);
        btnSubmitTeam.disabled = false;

        teamSection.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }

    function enterEditMode(slotLetter, teamId) {
        exitMode();
        state.mode = 'edit';
        state.selectedSlot = slotLetter;
        state.editingTeamId = teamId;

        // Update slot highlight
        renderSlotOverview();

        // Show banner
        modeBanner.className = 'mode-banner mode-edit';
        modeBannerText.textContent = 'Loading team from Slot ' + slotLetter + '...';
        show(modeBanner);

        // Show sections but disable submit while loading
        teamSectionLegend.textContent = 'Edit Team — Slot ' + slotLetter;
        btnSubmitTeam.textContent = 'Save Changes';
        document.getElementById('roster-note').textContent =
            'Edit players on the team. Only name is required. Up to ' + state.maxPlayers + ' players.';

        clearTeamForm();
        show(teamSection);
        show(rosterSection);
        show(submitSection);
        btnSubmitTeam.disabled = true;

        // Fetch team data
        var url = '/api/admin?action=team&id=' + encodeURIComponent(teamId) + '&season=' + encodeURIComponent(state.selectedSeason.id);
        fetch(url)
            .then(function (res) {
                return res.json().then(function (data) { return { status: res.status, data: data }; });
            })
            .then(function (result) {
                if (result.status === 404 || !result.data.success || !result.data.team) {
                    // Team document doesn't exist — fall back to add mode with pre-filled data
                    exitMode();
                    enterAddMode(slotLetter);

                    // Pre-fill from the team ID (format: "TeamName - OwnerName")
                    var parts = teamId.split(' - ');
                    var teamName = parts.length > 0 ? parts[0] : '';
                    var ownerName = parts.length > 1 ? parts.slice(1).join(' - ') : '';
                    document.getElementById('team-name').value = teamName;
                    document.getElementById('owner-name').value = ownerName;

                    showStatus('Team document not found in database. You can create it by filling in the details and submitting.', 'error');
                    return;
                }
                populateTeamForm(result.data.team);
                modeBannerText.textContent = 'Editing: ' + result.data.team.name + ' (Slot ' + slotLetter + ')';
                btnSubmitTeam.disabled = false;
                teamSection.scrollIntoView({ behavior: 'smooth', block: 'start' });
            })
            .catch(function () {
                showStatus('Network error loading team.', 'error');
                exitMode();
            });
    }

    function exitMode() {
        state.mode = null;
        state.selectedSlot = null;
        state.editingTeamId = null;

        hide(modeBanner);
        hide(teamSection);
        hide(rosterSection);
        hide(submitSection);

        // Remove selected highlight
        var cards = slotGrid.querySelectorAll('.slot-card');
        for (var i = 0; i < cards.length; i++) {
            cards[i].classList.remove('selected');
        }
    }

    modeBannerCancel.addEventListener('click', function () {
        hideStatus();
        exitMode();
    });

    // ── Populate Form for Edit Mode ──

    function populateTeamForm(team) {
        document.getElementById('team-name').value = team.name || '';
        document.getElementById('owner-name').value = (team.owner && team.owner.name) || '';
        document.getElementById('owner-phone').value = (team.owner && team.owner.phone) || '';
        document.getElementById('owner-email').value = (team.owner && team.owner.email) || '';

        // Clear and rebuild roster
        rosterList.innerHTML = '';
        state.playerCount = 0;
        btnAddPlayer.style.display = '';

        var roster = (team.season && team.season.roster) || [];

        // Only add rows for players with names (skip empty slots)
        var addedCount = 0;
        for (var i = 0; i < roster.length; i++) {
            var p = roster[i];
            if (!p.name || !p.name.trim()) continue;

            addPlayerRow();
            addedCount++;
            var row = rosterList.lastElementChild;
            var n = row.getAttribute('data-player');

            // Fill name
            row.querySelector('.admin-roster-name-input').value = p.name;

            // Fill DOB
            if (p.dob) {
                var mm = row.querySelector('[name="p' + n + '-mm"]');
                var dd = row.querySelector('[name="p' + n + '-dd"]');
                var yyyy = row.querySelector('[name="p' + n + '-yyyy"]');
                if (mm && p.dob.month) mm.value = String(p.dob.month).padStart(2, '0');
                if (dd && p.dob.date) dd.value = String(p.dob.date).padStart(2, '0');
                if (yyyy && p.dob.year) yyyy.value = String(p.dob.year);
            }

            // Fill phone
            var phoneInput = row.querySelector('[name="p' + n + '-phone"]');
            if (phoneInput && p.phone) phoneInput.value = p.phone;

            // Fill waiver
            var waiverInput = row.querySelector('[name="p' + n + '-waiver"]');
            if (waiverInput && p.insuranceWaiver && p.insuranceWaiver.signed) waiverInput.checked = true;
        }

        // If no players found, add one empty row
        if (addedCount === 0) addPlayerRow();
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

        var maxRoster = parseInt(document.getElementById('season-max-roster').value) || 12;

        var payload = {
            name: name,
            division: division,
            teamCount: teamCount,
            maxRoster: maxRoster,
            timeline: timeline,
            schedule: schedule
        };

        btnCreateSeason.disabled = true;
        btnCreateSeason.textContent = 'CREATING...';

        fetch('/api/admin?action=create-season', {
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
        if (state.playerCount >= state.maxPlayers) return;
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

        if (state.playerCount >= state.maxPlayers) {
            btnAddPlayer.style.display = 'none';
        }
    }

    btnAddPlayer.addEventListener('click', addPlayerRow);

    // ── Roster: Toggle Details / Remove ──

    rosterList.addEventListener('click', function (e) {
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

        if (e.target.classList.contains('admin-roster-remove')) {
            e.target.closest('.admin-roster-row').remove();
            state.playerCount--;
            var rows = rosterList.querySelectorAll('.admin-roster-row');
            for (var i = 0; i < rows.length; i++) {
                rows[i].querySelector('.admin-roster-num').textContent = i + 1;
            }
            if (state.playerCount < state.maxPlayers) {
                btnAddPlayer.style.display = '';
            }
        }
    });

    // ── Phone formatting ──

    rosterList.addEventListener('input', function (e) {
        if (e.target.type === 'tel') formatPhone(e.target);
        if (e.target.name && (e.target.name.indexOf('-mm') !== -1 || e.target.name.indexOf('-dd') !== -1 || e.target.name.indexOf('-yyyy') !== -1)) {
            e.target.value = e.target.value.replace(/\D/g, '');
        }
    });

    document.getElementById('owner-phone').addEventListener('input', function () {
        formatPhone(this);
    });

    // ── DOB auto-advance ──

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

    // ── Collect Players from Form ──

    function collectPlayers() {
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

            players.push({
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
            });
        }
        return players;
    }

    // ── Submit (Add or Edit) ──

    btnSubmitTeam.addEventListener('click', function () {
        hideStatus();

        if (!state.selectedSeason || !state.mode) {
            showStatus('Please select a slot first.', 'error');
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

        var players = collectPlayers();

        if (state.mode === 'add') {
            submitAddTeam(teamName, ownerName, players);
        } else if (state.mode === 'edit') {
            submitEditTeam(teamName, ownerName, players);
        }
    });

    function submitAddTeam(teamName, ownerName, players) {
        // Check if slot is already occupied (missing team doc scenario)
        var slotOccupied = false;
        if (state.selectedSeason && state.selectedSeason.teams) {
            for (var i = 0; i < state.selectedSeason.teams.length; i++) {
                if (state.selectedSeason.teams[i].slot === state.selectedSlot && state.selectedSeason.teams[i].teamID) {
                    slotOccupied = true;
                    break;
                }
            }
        }

        var payload = {
            seasonId: state.selectedSeason.id,
            teamName: teamName,
            owner: {
                name: ownerName,
                phone: document.getElementById('owner-phone').value.trim(),
                email: document.getElementById('owner-email').value.trim()
            },
            players: players,
            slot: state.selectedSlot
        };
        if (slotOccupied) payload.force = true;

        btnSubmitTeam.disabled = true;
        btnSubmitTeam.textContent = 'ADDING TEAM...';

        fetch('/api/admin?action=add-team', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        })
        .then(function (res) { return res.json().then(function (data) { return { ok: res.ok, data: data }; }); })
        .then(function (result) {
            if (result.ok && result.data.success) {
                showStatus('Team added! ' + teamName + ' assigned to slot ' + result.data.slot + ' (ID: ' + result.data.teamID + ')', 'success');
                refreshAfterChange();
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
    }

    function submitEditTeam(teamName, ownerName, players) {
        var payload = {
            teamId: state.editingTeamId,
            seasonId: state.selectedSeason.id,
            teamName: teamName,
            owner: {
                name: ownerName,
                phone: document.getElementById('owner-phone').value.trim(),
                email: document.getElementById('owner-email').value.trim()
            },
            players: players
        };

        btnSubmitTeam.disabled = true;
        btnSubmitTeam.textContent = 'SAVING...';

        fetch('/api/admin?action=edit-team', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        })
        .then(function (res) { return res.json().then(function (data) { return { ok: res.ok, data: data }; }); })
        .then(function (result) {
            if (result.ok && result.data.success) {
                showStatus('Team updated! ' + teamName, 'success');
                refreshAfterChange();
            } else {
                showStatus('Error: ' + (result.data.error || 'Failed to update team'), 'error');
            }
        })
        .catch(function () {
            showStatus('Network error. Please try again.', 'error');
        })
        .finally(function () {
            btnSubmitTeam.disabled = false;
            btnSubmitTeam.textContent = 'Save Changes';
        });
    }

    function refreshAfterChange() {
        var seasonId = state.selectedSeason ? state.selectedSeason.id : null;
        exitMode();
        loadSeasons();
        if (seasonId) {
            setTimeout(function () {
                seasonSelect.value = seasonId;
                seasonSelect.dispatchEvent(new Event('change'));
            }, 500);
        }
    }

    function clearTeamForm() {
        document.getElementById('team-name').value = '';
        document.getElementById('owner-name').value = '';
        document.getElementById('owner-phone').value = '';
        document.getElementById('owner-email').value = '';
        rosterList.innerHTML = '';
        state.playerCount = 0;
        btnAddPlayer.style.display = '';
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
