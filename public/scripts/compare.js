  // 对比页。条目数据取列表页那份索引，从 ids 里挑出要对比的几条。
  (function () {
    var body = document.querySelector('[data-cmp-body]');
    var countEl = document.querySelector('[data-cmp-count]');
    if (!body) return;

    var STORAGE_KEY = 'njucm:gundam:compare';
    var INDEX_URL = '/data/models/index.json';

    function esc(s) {
      return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) {
        return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c];
      });
    }

    function stored() {
      try {
        var raw = localStorage.getItem(STORAGE_KEY);
        var list = raw ? JSON.parse(raw) : [];
        return Array.isArray(list) ? list : [];
      } catch (e) {
        return [];
      }
    }

    function wanted() {
      var ids = new URLSearchParams(window.location.search).get('ids');
      if (ids) return ids.split(',').filter(Boolean);
      return stored();
    }

    var ROWS = [
      { key: 'cover', label: '商品图', render: function (r) {
          return r.image
            ? '<img class="gcmppage__img" src="' + esc(r.image) + '" alt="" loading="lazy" decoding="async">'
            : '<span class="gcmppage__img gcmppage__img--none">无图</span>';
        } },
      { key: 'name', label: '品名', render: function (r) {
          return '<a href="/data/models/' + encodeURIComponent(r.id) + '/">' + esc(r.name) + '</a>' +
            (r.nameJa ? '<span class="gcmppage__ja">' + esc(r.nameJa) + '</span>' : '');
        } },
      { key: 'category', label: '品类 / 比例', render: function (r) {
          return '<span class="gcard__grade" data-category="' + esc(categoryMeta(r.category).label) + '">' + esc(categoryMeta(r.category).label) + '</span>' +
            '<span class="gcmppage__mono">' + esc(r.scale) + '</span>';
        } },
      { key: 'series', label: '作品线', render: function (r) {
          return '<a href="/data/models/series/' + encodeURIComponent(r.series) + '/">' +
            esc(r.seriesLabel) + '</a>';
        } },
      { key: 'channel', label: '渠道', render: function (r) {
          return esc(r.channelLabel);
        } },
      { key: 'released', label: '发售', render: function (r) {
          if (r.released) return '<span class="gcmppage__mono">' + esc(r.released) + '</span>';
          if (r.listedAt) return '<span class="gcmppage__mono">' + esc(r.listedAt) + '</span><span class="gcmppage__hint">商城上架</span>';
          return '—';
        } },
      { key: 'price', label: '官方定价', render: function (r) {
          if (r.priceJpy) return '<span class="gcmppage__mono">¥' + r.priceJpy.toLocaleString('en-US') + '</span>';
          if (r.priceHkd) return '<span class="gcmppage__mono">HK$' + r.priceHkd.toLocaleString('en-US') + '</span><span class="gcmppage__hint">港币</span>';
          if (r.priceCny) return '<span class="gcmppage__mono">¥' + r.priceCny.toLocaleString('en-US') + '</span><span class="gcmppage__hint">人民币</span>';
          return '—';
        } },
      { key: 'size', label: '全高 / 零件数', render: function (r) {
          var bits = [];
          if (r.heightMm !== null && r.heightMm !== undefined) bits.push('约 ' + r.heightMm + ' mm');
          if (r.parts !== null && r.parts !== undefined) bits.push(r.parts + ' 件');
          return bits.length ? '<span class="gcmppage__mono">' + esc(bits.join(' / ')) + '</span>' : '—';
        } },
      { key: 'skill', label: '拼装难度', render: function (r) {
          return r.skillLevel === null || r.skillLevel === undefined
            ? '—'
            : '<span class="gcmppage__mono">' + r.skillLevel + ' / 5</span>';
        } },
      { key: 'material', label: '材质', render: function (r) {
          return r.material ? esc(r.material) : '—';
        } },
      { key: 'subject', label: '主题', render: function (r) {
          if (!r.subject) return '—';
          return '<a href="/data/models/?q=' + encodeURIComponent(r.subject) + '">' + esc(r.subject) + '</a>';
        } },
      { key: 'aliases', label: '又名', render: function (r) {
          var list = r.aliases || [];
          return list.length ? '<span class="gcmppage__aliases">' + list.map(esc).join(' · ') + '</span>' : '—';
        } },
      { key: 'tags', label: '标签', render: function (r) {
          var list = r.tags || [];
          return list.length
            ? '<span class="gcmppage__tags">' + list.map(function (t) {
                return '<a href="/data/models/?tag=' + encodeURIComponent(t) + '">' + esc(t) + '</a>';
              }).join('') + '</span>'
            : '—';
        } },
      { key: 'note', label: '看点', render: function (r) {
          return r.note ? esc(r.note) : '—';
        } },
      { key: 'remove', label: '', render: function (r) {
          return '<button type="button" class="gcmppage__remove" data-cmp-remove="' + esc(r.id) + '">移除</button>';
        } },
    ];

    function render(rows) {
      if (!rows.length) {
        if (countEl) countEl.textContent = '尚未选择条目';
        body.innerHTML =
          '<p class="empty">还没有选中条目。在条目详情页点「加入对比」，或直接在这里粘一个 ids 参数。</p>';
        return;
      }

      if (countEl) countEl.textContent = '正在对比 ' + rows.length + ' 条';

      var html = '<table class="gcmppage__table"><thead><tr><th scope="col">项目</th>';
      for (var i = 0; i < rows.length; i++) {
        html += '<th scope="col" class="gcmppage__col">' + esc(rows[i].name) + '</th>';
      }
      html += '</tr></thead><tbody>';
      for (var r = 0; r < ROWS.length; r++) {
        var row = ROWS[r];
        html += '<tr' + (row.key === 'remove' ? ' class="gcmppage__row--remove"' : '') + '>';
        html += '<th scope="row">' + esc(row.label) + '</th>';
        for (var c = 0; c < rows.length; c++) {
          html += '<td>' + row.render(rows[c]) + '</td>';
        }
        html += '</tr>';
      }
      html += '</tbody></table>';
      body.innerHTML = html;

      if (countEl) countEl.textContent = '正在对比 ' + rows.length + ' 条';
    }

    function apply() {
      var ids = wanted();
      if (!ids.length) {
        render([]);
        return;
      }
      fetch(INDEX_URL)
        .then(function (res) {
          return res.json();
        })
        .then(function (payload) {
          var idx = {};
          payload.fields.forEach(function (f, i) {
            idx[f] = i;
          });
          var map = {};
          payload.rows.forEach(function (row) {
            var k = {};
            payload.fields.forEach(function (f, i) {
              k[f] = row[i];
            });
            k.seriesLabel = payload.series[k.series] || '';
            k.channelLabel = payload.channels[k.channel] || '';
            map[k.id] = k;
          });
          var rows = ids
            .map(function (id) { return map[id]; })
            .filter(Boolean);
          render(rows);
        })
        .catch(function () {
          body.innerHTML = '<p class="empty">索引加载失败，请稍后重试。</p>';
        });
    }

    document.addEventListener('click', function (e) {
      var btn = e.target.closest ? e.target.closest('[data-cmp-remove]') : null;
      if (!btn) return;
      var id = btn.getAttribute('data-cmp-remove');
      var next = stored().filter(function (x) { return x !== id; });
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
      } catch (err) {
        /* ignore */
      }
      var url = new URL(window.location.href);
      if (next.length) url.searchParams.set('ids', next.join(','));
      else url.searchParams.delete('ids');
      window.history.replaceState(null, '', url);
      apply();
      document.dispatchEvent(new CustomEvent('gundam:compare-change'));
    });

    apply();
  })();
