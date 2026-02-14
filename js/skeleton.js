/* ── SKELETON: Global Nav + Sponsor Carousel ──
   Single entry point for the persistent site shell.
   Builds the header nav, mobile menu, and sponsor carousel.
──────────────────────────────────────────────── */

/* ── SPONSOR DATA ──────────────────────────────────────────
   Shared config used by the carousel on every page.

   SPONSOR_GOAL  = total sponsorship target
   SPONSOR_EACH  = dollar value one slot represents
   -> SPONSOR_GOAL / SPONSOR_EACH = slots per carousel set

   Add sponsors here:
   {
       id:     'example-biz',
       name:   'Example Biz',
       img:    'sponsors/example.png',
       amount: 200,
       bio:    'Short description...',
       links: [
           { label: 'Website',   url: 'https://example.com' },
           { label: 'Facebook',  url: 'https://facebook.com/example' },
           { label: 'Instagram', url: 'https://instagram.com/example' },
       ]
   }
──────────────────────────────────────────────────────────── */
var SPONSOR_GOAL = 3000;
var SPONSOR_EACH = 50;
var SPONSORS = [
    // { id: 'example-biz', name: 'Example Biz', img: 'sponsors/example.png', amount: 200, bio: 'A great local business.', links: [{ label: 'Website', url: 'https://example.com' }] },
    { id: 'navarro-mueblerias', name: 'Navarro Mueblerias', img: 'sponsors/Navarro Mueblerias/NM-Logo.jpeg', amount: 50, bio: 'Navarro Mueblerias has been furnishing Del Rio homes for over 20 years. From living rooms to bedrooms, we carry top-quality furniture at prices that work for every family. Stop by our showroom or visit us online \u2014 con Navarro siempre gano!', links: [{ label: 'Website', url: 'https://example.com' }, { label: 'Facebook', url: 'https://facebook.com/navarromueblerias' }, { label: 'Instagram', url: 'https://instagram.com/navarromueblerias' }] },
];

document.addEventListener('DOMContentLoaded', function() {
    // ── HEADER NAV ──
    var header = document.createElement('header');
    header.className = 'site-header';
    header.innerHTML =
        '<nav class="nav-inner">' +
            '<a href="index.html" class="nav-link nav-primary">Home</a>' +
            '<a href="index.html#info" class="nav-link nav-secondary">Join the League</a>' +
            '<a href="sponsor.html#current-sponsors" class="nav-link nav-secondary">Our Sponsors</a>' +
            '<a href="schedule.html" class="nav-link nav-secondary">Schedule</a>' +
            '<a href="live-game.html" class="nav-link nav-secondary">Live Game</a>' +
            '<a href="standings.html" class="nav-link nav-secondary">Standings</a>' +
            '<a href="stats.html" class="nav-link nav-secondary">Stats</a>' +
            '<a href="owner.html" class="nav-link nav-secondary">Owner</a>' +
            '<a href="rules.html" class="nav-link nav-secondary">Rules</a>' +
            '<a href="sponsor.html" class="nav-link nav-secondary">Sponsor Us</a>' +
            '<button type="button" class="menu-toggle" aria-label="Menu">' +
                '<span></span><span></span><span></span>' +
            '</button>' +
        '</nav>' +
        '<div class="mobile-menu">' +
            '<a href="index.html" class="nav-link">Home</a>' +
            '<a href="index.html#info" class="nav-link">Join the League</a>' +
            '<a href="sponsor.html#current-sponsors" class="nav-link">Our Sponsors</a>' +
            '<a href="schedule.html" class="nav-link">Schedule</a>' +
            '<a href="live-game.html" class="nav-link">Live Game</a>' +
            '<a href="standings.html" class="nav-link">Standings</a>' +
            '<a href="stats.html" class="nav-link">Stats</a>' +
            '<a href="owner.html" class="nav-link">Owner</a>' +
            '<a href="rules.html" class="nav-link">Rules</a>' +
            '<a href="sponsor.html" class="nav-link">Sponsor Us</a>' +
        '</div>';

    document.body.insertBefore(header, document.body.firstChild);

    var toggle = header.querySelector('.menu-toggle');
    var menu = header.querySelector('.mobile-menu');
    toggle.addEventListener('click', function() {
        toggle.classList.toggle('open');
        menu.classList.toggle('open');
    });

    // ── SPONSOR CAROUSEL ──
    // Skip carousel on sponsor bio and sponsor form pages
    if (window.location.pathname.indexOf('sponsor-bio') !== -1) { document.body.classList.add('no-carousel'); return; }
    if (window.location.pathname.indexOf('sponsor-form') !== -1) { document.body.classList.add('no-carousel'); return; }

    // Inject carousel HTML after the header
    var section = document.createElement('section');
    section.className = 'sponsors-section';
    section.innerHTML =
        '<div class="sponsors-track-wrapper">' +
            '<div class="sponsors-track"></div>' +
        '</div>';

    if (header.nextSibling) {
        header.parentNode.insertBefore(section, header.nextSibling);
    } else {
        document.body.insertBefore(section, document.body.firstChild);
    }

    var track = section.querySelector('.sponsors-track');
    var totalSlots = Math.round(SPONSOR_GOAL / SPONSOR_EACH);
    var pool = [];

    // Build weighted sponsor slots
    var filled = 0;
    SPONSORS.forEach(function (sp) {
        var count = Math.max(1, Math.round(sp.amount / SPONSOR_EACH));
        filled += count;
        for (var i = 0; i < count; i++) pool.push(sp);
    });

    // Fill remaining with empty placeholders
    for (var i = filled; i < totalSlots; i++) pool.push(null);

    // Shuffle for even distribution
    for (var i = pool.length - 1; i > 0; i--) {
        var j = Math.floor(Math.random() * (i + 1));
        var t = pool[i]; pool[i] = pool[j]; pool[j] = t;
    }

    // Render slots
    pool.forEach(function (sp) {
        var div = document.createElement('div');
        div.className = 'sponsor-slot';
        if (sp) {
            var a = document.createElement('a');
            a.href = 'sponsor-bio.html?id=' + encodeURIComponent(sp.id);
            a.className = 'sponsor-slot-link';
            if (sp.img) {
                var img = document.createElement('img');
                img.src = sp.img;
                img.alt = sp.name;
                a.appendChild(img);
            } else {
                a.textContent = sp.name;
            }
            div.appendChild(a);
        } else {
            var ad = document.createElement('a');
            ad.href = 'sponsor.html';
            ad.className = 'sponsor-slot-link';
            ad.textContent = 'BECOME A SPONSOR';
            div.appendChild(ad);
        }
        track.appendChild(div);
    });

    // Clone for endless scroll
    var originals = Array.from(track.children);
    if (!originals.length) return;
    var slotW = originals[0].offsetWidth + 30;
    var setW  = originals.length * slotW;
    var copies = Math.ceil(window.innerWidth / setW) + 1;
    for (var c = 1; c < copies; c++)
        originals.forEach(function (s) { track.appendChild(s.cloneNode(true)); });
    Array.from(track.children).forEach(function (s) {
        track.appendChild(s.cloneNode(true));
    });
    track.style.animationDuration = (track.scrollWidth / 2 / 50) + 's';
});
