  // 我的清单。条目从 index.json 里挑，id 从 localStorage 里来。
  (function () {
    var body = document.querySelector('[data-col-body]');
    var countEl = document.querySelector('[data-col-count]');
    var summaryEl = document.querySelector('[data-col-summary]');
    if (!body) return;

    var INDEX_URL = '/data/models/index.json';

    var LABEL = { wish: '想要', owned: '已有' };
    var HINT = {
      wish: '还没到手，先记着。',
      owned: '已经到手了。',
    };

    function esc(s) {
      return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) {
        return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c];
      });
    }

    function state() {
      if (!window.__gundamCollection) return { wish: [], owned: [] };
      return window.__gundamCollection.read();
    }

    /* 收藏状态由页面里的组件脚本提供；万一它还没跑起来，等一下再读 */
    function whenReady(fn) {
      if (window.__gundamCollection) {
        fn();
        return;
      }
      var tries = 0;
      var timer = setInterval(function () {
        if (window.__gundamCollection || ++tries > 40) {
          clearInterval(timer);
          fn();
        }
      }, 50);
    }

    function kindOf(id) {
      /* 一件东西可以既想要又已有——前者是愿望，后者是事实 */
      var s = state();
      return { wish: s.wish.indexOf(id) !== -1, owned: s.owned.indexOf(id) !== -1 };
    }

    function render(map) {
      var s = state();
      var ids = s.wish.concat(s.owned.filter(function (id) { return s.wish.indexOf(id) === -1; }));
      var rows = ids.map(function (id) { return map[id]; }).filter(Boolean);

      var counts = window.__gundamCollection ? window.__gundamCollection.counts() : { wish: 0, owned: 0 };
      if (countEl) {
        countEl.textContent = counts.wish + counts.owned
          ? '想要 ' + counts.wish + ' 件，已有 ' + counts.owned + ' 件'
          : '还没有标记任何条目';
      }

      /* 合计与分布 */
      var sum = 0;
      var sumHkd = 0;
      var priced = 0;
      var pricedHkd = 0;
      var byCat = {};
      var bySeries = {};
      for (var i = 0; i < rows.length; i++) {
        var r = rows[i];
        if (r.priceJpy) { sum += r.priceJpy; priced++; }
        else if (r.priceHkd) { sumHkd += r.priceHkd; pricedHkd++; }
        var c = r.categoryLabel || r.category;
        byCat[c] = (byCat[c] || 0) + 1;
        var sl = r.seriesLabel || r.series;
        bySeries[sl] = (bySeries[sl] || 0) + 1;
      }
      if (summaryEl) {
        if (!rows.length) {
          summaryEl.innerHTML = '';
        } else {
          var top = function (obj) {
            return Object.keys(obj)
              .sort(function (a, b) { return obj[b] - obj[a]; })
              .slice(0, 6)
              .map(function (k) { return '<li><span>' + esc(k) + '</span><b>' + obj[k] + '</b></li>'; })
              .join('');
          };
          summaryEl.innerHTML =
            '<div class="gcol__stat"><span class="gcol__statLabel">官方定价合计</span>' +
            '<b class="gcol__statValue">¥' + sum.toLocaleString('en-US') + '</b>' +
            '<span class="gcol__statHint">' + priced + ' / ' + rows.length + ' 条有定价</span></div>' +
            (pricedHkd
              ? '<div class="gcol__stat"><span class="gcol__statLabel">港币定价合计</span>' +
                '<b class="gcol__statValue">HK$' + sumHkd.toLocaleString('en-US') + '</b>' +
                '<span class="gcol__statHint">' + pricedHkd + ' 条按港币计价</span></div>'
              : '') +
            '<div class="gcol__stat"><span class="gcol__statLabel">品类分布</span><ul class="gcol__dist">' + top(byCat) + '</ul></div>' +
            '<div class="gcol__stat"><span class="gcol__statLabel">作品线分布</span><ul class="gcol__dist">' + top(bySeries) + '</ul></div>';
        }
      }

      /* 两份单子 */
      var html = '';
      ['wish', 'owned'].forEach(function (kind) {
        var list = s[kind]
          .map(function (id) { return map[id]; })
          .filter(Boolean);
        html +=
          '<section class="gcol__list">' +
          '<h2 class="gcol__listTitle">' + LABEL[kind] + ' <span class="gcol__listCount">' + list.length + '</span></h2>' +
          '<p class="gcol__listHint">' + HINT[kind] + '</p>';
        if (!list.length) {
          html += '<p class="gcol__empty">这一份还是空的。在条目详情页点「' + LABEL[kind] + '」就能加进来。</p>';
        } else {
          html += '<ul class="gcol__items">';
          for (var j = 0; j < list.length; j++) {
            var r = list[j];
            var flags = kindOf(r.id);
            html +=
              '<li class="gcol__item">' +
              '<a class="gcol__name" href="/data/models/' + encodeURIComponent(r.id) + '/">' + esc(r.name) + '</a>' +
              '<span class="gcol__meta">' +
              '<span class="gcard__grade" data-category="' + esc(r.categoryLabel || r.category) + '">' + esc(r.categoryLabel || r.category) + '</span>' +
              (r.scale ? '<span class="gcol__mono">' + esc(r.scale) + '</span>' : '') +
              (r.released || r.listedAt ? '<span class="gcol__mono">' + esc(r.released || r.listedAt) + '</span>' : '') +
              (r.priceJpy ? '<span class="gcol__mono">¥' + r.priceJpy.toLocaleString('en-US') + '</span>' : '') +
              (r.priceHkd ? '<span class="gcol__mono">HK$' + r.priceHkd.toLocaleString('en-US') + '</span>' : '') +
              '</span>' +
              '<span class="gcol__marks">' +
              (flags.wish ? '<span class="gcol__mark" data-kind="wish">想要</span>' : '') +
              (flags.owned ? '<span class="gcol__mark" data-kind="owned">已有</span>' : '') +
              '<button type="button" class="gcol__remove" data-col-remove="' + esc(r.id) + '" data-col-kind="' + kind + '">移除</button>' +
              '</span>' +
              '</li>';
          }
          html += '</ul>';
        }
        html += '</section>';
      });
      body.innerHTML = html;
    }

    function apply() {
      var s = state();
      var ids = s.wish.concat(s.owned);
      if (!ids.length) {
        render({});
        return;
      }
      fetch(INDEX_URL)
        .then(function (res) { return res.json(); })
        .then(function (payload) {
          var map = {};
          payload.rows.forEach(function (row) {
            var k = {};
            payload.fields.forEach(function (f, i) { k[f] = row[i]; });
            k.categoryLabel = payload.categoryLabels[k.category] || k.category;
            k.seriesLabel = payload.series[k.series] || '';
            map[k.id] = k;
          });
          render(map);
        })
        .catch(function () {
          body.innerHTML = '<p class="empty">索引加载失败，请稍后重试。</p>';
        });
    }

    document.addEventListener('click', function (e) {
      var btn = e.target.closest ? e.target.closest('[data-col-remove]') : null;
      if (btn && window.__gundamCollection) {
        var id = btn.getAttribute('data-col-remove');
        var kind = btn.getAttribute('data-col-kind');
        window.__gundamCollection.toggle(kind, id);
        apply();
        return;
      }
      if (e.target.closest && e.target.closest('[data-col-clear]') && window.__gundamCollection) {
        window.__gundamCollection.clear();
        apply();
      }
    });

    whenReady(apply);
  })();
