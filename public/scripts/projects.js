  // Client-side ordering and domain filtering for the project cards.
  //
  // Only each card's CSS `order` changes, and hidden cards get `data-hidden` —
  // the DOM keeps the order it was rendered in, so crawlers, no-JS visitors and
  // the tab sequence all still get a stable list, and nothing moves (so no
  // listeners or anchors can break).
  //
  // The script sits right after the grid, i.e. during parsing and before the
  // first paint, so cards are never shown in one order and then visibly
  // reordered.
  (function () {
    var grid = document.querySelector('[data-sortable]');
    if (!grid) return;

    var cards = Array.prototype.slice.call(grid.children);
    var sortButtons = Array.prototype.slice.call(document.querySelectorAll('[data-sort]'));
    var filterButtons = Array.prototype.slice.call(document.querySelectorAll('[data-filter]'));
    var hintEl = document.querySelector('[data-sort-hint]');
    var STORAGE_KEY = 'njucm:projects-sort';
    var FILTER_KEY = 'njucm:projects-domain';
    var MODES = { random: 1, updated: 1, created: 1 };

    function shuffle(list) {
      var out = list.slice();
      for (var i = out.length - 1; i > 0; i--) {
        var j = Math.floor(Math.random() * (i + 1));
        var tmp = out[i];
        out[i] = out[j];
        out[j] = tmp;
      }
      return out;
    }

    // Newest first. Cards without the attribute sort to the bottom.
    function byDate(list, attr) {
      return list.slice().sort(function (a, b) {
        var av = a.getAttribute(attr) || '';
        var bv = b.getAttribute(attr) || '';
        if (av === bv) return 0;
        if (!av) return 1;
        if (!bv) return -1;
        return av < bv ? 1 : -1;
      });
    }

    /**
     * Order and filtering are applied together because the visible count depends
     * on both: `order` is assigned over the whole set first, so a hidden card
     * keeps a stable slot and unhiding never reshuffles the visible ones.
     */
    function apply(mode, domain) {
      var ordered;
      if (mode === 'updated') ordered = byDate(cards, 'data-updated');
      else if (mode === 'created') ordered = byDate(cards, 'data-created');
      else ordered = shuffle(cards);

      for (var i = 0; i < ordered.length; i++) {
        ordered[i].style.order = String(i);
      }

      for (var c = 0; c < cards.length; c++) {
        var d = cards[c].getAttribute('data-domain') || '';
        if (domain && d !== domain) cards[c].setAttribute('data-hidden', 'true');
        else cards[c].removeAttribute('data-hidden');
      }

      for (var b = 0; b < sortButtons.length; b++) {
        var on = sortButtons[b].getAttribute('data-sort') === mode;
        sortButtons[b].setAttribute('aria-pressed', on ? 'true' : 'false');
        if (on && hintEl) hintEl.textContent = sortButtons[b].getAttribute('data-hint') || '';
      }

      for (var f = 0; f < filterButtons.length; f++) {
        var dom = filterButtons[f].getAttribute('data-filter') || '';
        filterButtons[f].setAttribute('aria-pressed', dom === domain ? 'true' : 'false');
      }

      grid.setAttribute('data-sorted', mode);
      grid.setAttribute('data-domain', domain || 'all');
    }

    function fromUrl() {
      var p = new URLSearchParams(window.location.search);
      var m = p.get('sort');
      var d = p.get('domain');
      return {
        mode: m && MODES[m] ? m : null,
        domain: d || null,
      };
    }

    function initialMode() {
      var from = fromUrl().mode;
      if (from) return from;
      try {
        var saved = window.localStorage.getItem(STORAGE_KEY);
        if (saved && MODES[saved]) return saved;
      } catch (e) {
        /* storage can be blocked; random is a fine fallback */
      }
      return 'random';
    }

    function initialDomain() {
      var from = fromUrl().domain;
      if (from) return from;
      try {
        return window.localStorage.getItem(FILTER_KEY) || '';
      } catch (e) {
        return '';
      }
    }

    function syncUrl(mode, domain) {
      var url = new URL(window.location.href);
      if (mode === 'random') url.searchParams.delete('sort');
      else url.searchParams.set('sort', mode);
      if (domain) url.searchParams.set('domain', domain);
      else url.searchParams.delete('domain');
      window.history.replaceState(null, '', url);
    }

    function remember(key, value) {
      try {
        window.localStorage.setItem(key, value);
      } catch (e) {
        /* ignore */
      }
    }

    var mode = initialMode();
    var domain = initialDomain();

    for (var i = 0; i < sortButtons.length; i++) {
      sortButtons[i].addEventListener('click', function () {
        mode = this.getAttribute('data-sort');
        apply(mode, domain); // clicking 随机 again re-rolls the order
        remember(STORAGE_KEY, mode);
        syncUrl(mode, domain);
      });
    }

    for (var j = 0; j < filterButtons.length; j++) {
      filterButtons[j].addEventListener('click', function () {
        domain = this.getAttribute('data-filter') || '';
        apply(mode, domain);
        remember(FILTER_KEY, domain);
        syncUrl(mode, domain);
      });
    }

    apply(mode, domain);
  })();
