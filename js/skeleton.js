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
    { id: 'walmart', name: 'Walmart', img: 'sponsors/Walmart/logo.png', bgColor: '#007cc2', amount: 100, page: 'sponsors/Walmart/index.html', bio: 'Walmart of Del Rio proudly supports local youth and adult athletics. Thank you to our Del Rio Walmart for sponsoring $100 and donating a game ball for the season!', links: [{ label: 'Website', url: 'https://walmart.com' }, { label: 'Facebook', url: 'https://www.facebook.com/Walmart447' }, { label: 'Instagram', url: 'https://instagram.com/walmart0447' }, { label: '(830) 744-6034', url: 'tel:+18307446034' }, { label: '2410 Dodson Ave, Del Rio, TX 78840', url: 'https://maps.google.com/?q=2410+Dodson+Ave,+Del+Rio,+TX+78840' }] },
    { id: 'el-tacon-madre', name: 'El Tacon Madre', img: 'sponsors/El Tacon Madre/carousel.jpg', fillCard: true, amount: 150, page: 'sponsors/El Tacon Madre/index.html', bio: '<p class="bio-tagline">Authentic Mexican Restaurant</p><div class="bio-menu"><span class="bio-menu-item">Tacos de Bistec</span><span class="bio-menu-item">Tacos de Pastor</span><span class="bio-menu-item">Tacos de Tripas</span><span class="bio-menu-item">Tapat\u00edos</span><span class="bio-menu-item">Hamburgers</span><span class="bio-menu-item">Tortas</span></div><p class="bio-tagline">and so much more to choose from!</p><div class="bio-hours"><div class="bio-hours-row"><span class="bio-hours-label">Lunch Buffet</span><span class="bio-hours-detail">Monday \u2013 Friday &bull; 11 AM \u2013 2 PM</span></div><div class="bio-hours-row"><span class="bio-hours-label">Breakfast Buffet</span><span class="bio-hours-detail">Sunday &bull; 10 AM \u2013 2 PM</span></div></div><p class="bio-thanks">Thank you El Tacon Madre for supporting the DRMBL!</p>', links: [{ label: 'Facebook', url: 'https://www.facebook.com/profile.php?id=100057549785035' }, { label: 'Email', url: 'mailto:cord1226@gmail.com' }, { label: '(830) 212-1101', url: 'tel:+18302121101' }, { label: '(830) 309-1889', url: 'tel:+18303091889' }, { label: '101 Texas St, Del Rio, TX 78840', url: 'https://maps.google.com/?q=101+Texas+St,+Del+Rio,+TX+78840' }] },
];

document.addEventListener('DOMContentLoaded', function() {
    // ── BASE PATH PREFIX ──
    // Derive from skeleton.js src so relative URLs work from any page depth
    var skeletonScript = document.querySelector('script[src*="skeleton.js"]');
    var basePrefix = skeletonScript ? skeletonScript.getAttribute('src').replace('js/skeleton.js', '') : '';

    // ── HEADER NAV ──
    var b = basePrefix;
    var header = document.createElement('header');
    header.className = 'site-header';
    header.innerHTML =
        '<nav class="nav-inner">' +
            '<a href="' + b + 'index.html" class="nav-link nav-primary">Home</a>' +
            '<a href="' + b + 'index.html#info" class="nav-link nav-secondary">Join the League</a>' +
            '<a href="' + b + 'sponsor.html#current-sponsors" class="nav-link nav-secondary">Our Sponsors</a>' +
            '<a href="' + b + 'schedule.html" class="nav-link nav-secondary">Schedule</a>' +
            '<a href="' + b + 'live-game.html" class="nav-link nav-secondary">Live Game</a>' +
            '<a href="' + b + 'standings.html" class="nav-link nav-secondary">Standings</a>' +
            '<a href="' + b + 'stats.html" class="nav-link nav-secondary">Stats</a>' +
            '<a href="' + b + 'box-scores.html" class="nav-link nav-secondary">Box Scores</a>' +
            '<a href="' + b + 'owner.html" class="nav-link nav-secondary">Owner</a>' +
            '<a href="' + b + 'rules.html" class="nav-link nav-secondary">Rules</a>' +
            '<a href="' + b + 'sponsor.html" class="nav-link nav-secondary">Sponsor Us</a>' +
            '<button type="button" class="menu-toggle" aria-label="Menu">' +
                '<span></span><span></span><span></span>' +
            '</button>' +
        '</nav>' +
        '<div class="mobile-menu">' +
            '<a href="' + b + 'index.html" class="nav-link">Home</a>' +
            '<a href="' + b + 'index.html#info" class="nav-link">Join the League</a>' +
            '<a href="' + b + 'sponsor.html#current-sponsors" class="nav-link">Our Sponsors</a>' +
            '<a href="' + b + 'schedule.html" class="nav-link">Schedule</a>' +
            '<a href="' + b + 'live-game.html" class="nav-link">Live Game</a>' +
            '<a href="' + b + 'standings.html" class="nav-link">Standings</a>' +
            '<a href="' + b + 'stats.html" class="nav-link">Stats</a>' +
            '<a href="' + b + 'box-scores.html" class="nav-link">Box Scores</a>' +
            '<a href="' + b + 'owner.html" class="nav-link">Owner</a>' +
            '<a href="' + b + 'rules.html" class="nav-link">Rules</a>' +
            '<a href="' + b + 'sponsor.html" class="nav-link">Sponsor Us</a>' +
        '</div>';

    document.body.insertBefore(header, document.body.firstChild);

    var toggle = header.querySelector('.menu-toggle');
    var menu = header.querySelector('.mobile-menu');
    toggle.addEventListener('click', function() {
        toggle.classList.toggle('open');
        menu.classList.toggle('open');
    });

    // ── SECRET: Shift + "track" opens stat tracker ──
    var _sk = '';
    var _skTimer = null;
    document.addEventListener('keydown', function(e) {
        if (!e.shiftKey) { _sk = ''; return; }
        var k = e.key.toLowerCase();
        if (k === 'shift') return;
        _sk += k;
        clearTimeout(_skTimer);
        _skTimer = setTimeout(function() { _sk = ''; }, 2000);
        if (_sk === 'track') {
            _sk = '';
            window.location.href = '/tracker/';
        }
    });

    // ── OUR SPONSORS SECTION (before footer) ──
    // Skip on sponsor.html (has its own) and sponsor-form
    var path = window.location.pathname;
    var skipSponsorsGrid = path.indexOf('sponsor.html') !== -1 ||
                           path.indexOf('sponsor-form') !== -1;

    if (!skipSponsorsGrid && SPONSORS.length > 0) {
        var footer = document.querySelector('footer');
        if (footer) {
            var sponsorSection = document.createElement('section');
            sponsorSection.className = 'skeleton-sponsors-section';
            sponsorSection.id = 'current-sponsors';
            var innerHtml = '<div class="section-inner">' +
                '<h2 class="section-heading">Our Sponsors</h2>' +
                '<hr class="section-rule">' +
                '<div class="sponsor-logos-grid">';
            for (var s = 0; s < SPONSORS.length; s++) {
                var sp = SPONSORS[s];
                var bgStyle = sp.bgColor ? ' style="background-color:' + sp.bgColor + '"' : '';
                var fillCls = sp.fillCard ? ' sponsor-logo-fill' : '';
                var spHref = sp.page ? basePrefix + sp.page : basePrefix + 'sponsor-bio.html?id=' + encodeURIComponent(sp.id);
                innerHtml += '<a href="' + spHref + '" class="sponsor-logo-card' + fillCls + '"' + bgStyle + '>';
                if (sp.img) {
                    innerHtml += '<img src="' + basePrefix + sp.img + '" alt="' + sp.name + '">';
                } else {
                    innerHtml += '<span class="sponsor-logo-text">' + sp.name + '</span>';
                }
                innerHtml += '</a>';
            }
            innerHtml += '</div></div>';
            sponsorSection.innerHTML = innerHtml;
            footer.parentNode.insertBefore(sponsorSection, footer);
        }
    }

    // ── SPONSOR CAROUSEL ──
    // Skip carousel on sponsor bio and sponsor form pages
    if (path.indexOf('sponsor-bio') !== -1) { document.body.classList.add('no-carousel'); return; }
    if (path.indexOf('sponsor-form') !== -1) { document.body.classList.add('no-carousel'); return; }
    if (path.indexOf('/sponsors/') !== -1) { document.body.classList.add('no-carousel'); return; }

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
            if (sp.bgColor) div.style.backgroundColor = sp.bgColor;
            var a = document.createElement('a');
            a.href = sp.page ? sp.page : 'sponsor-bio.html?id=' + encodeURIComponent(sp.id);
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
