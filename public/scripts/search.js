
/**
 * 新的搜索脚本。
 *
 * 三件事和原来不一样：
 *
 * 1. 打分按字段加权。标题最重；别名与主题名单独加权——玩家搜「元祖高达」时
 *    命中的是别名，那比在正文里蹭到一次要值钱得多；正文命中按出现次数给
 *    对数奖励，出现一次和出现十次不该差十倍。
 * 2. 模型结果按主题收组。同一个主题的各品类、各配色本来就是一件事，
 *    合成一条比逐条列出来有用得多。
 * 3. 结果分成「模型条目」与「站点内容」两段，不混在一张列表里。
 */
(function () {
  var form = document.querySelector('[data-search]');
  var input = form && form.querySelector('.search__input');
  var status = document.querySelector('#search-status');
  var list = document.querySelector('[data-search-results]');
  var clearBtn = document.querySelector('[data-search-clear]');
  if (!form || !input || !list) return;

  var DOC_INDEX_URL = '/search-index.json';
  var KIT_INDEX_URL = '/data/models/index.json';
  var SNIPPET_RADIUS = 62;
  var MAX_DOC = 20;
  var MAX_KIT = 14;
  /* 同一个主题少于这么多条就不合并了——那多半是用户要的就是其中一条 */
  var MERGE_MIN = 4;
  /* 合并后最多列出几个具体版本 */
  var MERGE_SHOW = 4;

  var timer = null;
  var index = null;
  var kits = null;
  var loading = null;
  var kitLoading = null;

  function load() {
    if (index) return Promise.resolve(index);
    if (loading) return loading;
    loading = fetch(DOC_INDEX_URL)
      .then(function (r) {
        if (!r.ok) throw new Error('HTTP ' + r.status);
        return r.json();
      })
      .then(function (data) {
        index = data.map(function (e) {
          return {
            title: e.t || '',
            desc: e.d || '',
            href: e.u,
            section: e.s,
            tags: e.g || [],
            text: e.x || '',
            lower: (e.t || '').toLowerCase(),
            lowerDesc: (e.d || '').toLowerCase(),
            lowerTags: (e.g || []).join(' ').toLowerCase(),
            lowerText: (e.x || '').toLowerCase(),
          };
        });
        return index;
      })
      .catch(function () {
        index = null;
        loading = null;
        throw new Error('索引加载失败');
      });
    return loading;
  }

  /**
   * 模型索引。列表页的数据结构直接复用：行是数组，字段顺序由 fields 定。
   * 这里把它摊平成和文档一样的形状，好让打分与摘录走同一套代码。
   */
  function loadKits() {
    if (kits) return Promise.resolve(kits);
    if (kitLoading) return kitLoading;
    kitLoading = fetch(KIT_INDEX_URL)
      .then(function (r) {
        if (!r.ok) throw new Error('HTTP ' + r.status);
        return r.json();
      })
      .then(function (payload) {
        var idx = {};
        payload.fields.forEach(function (f, i) {
          idx[f] = i;
        });
        kits = payload.rows.map(function (row) {
          var k = {};
          payload.fields.forEach(function (f, i) {
            k[f] = row[i];
          });
          var seriesLabel = payload.series[k.series] || '';
          var channelLabel = payload.channels[k.channel] || '';
          var aliases = k.aliases || [];
          var tags = k.tags || [];
          var text = [k.name, k.nameJa, k.subject]
            .concat(aliases)
            .concat(tags)
            .filter(Boolean)
            .join(' · ');
          var desc =
            k.category + ' ' + k.scale + ' · ' + seriesLabel + ' · ' + (k.released || k.listedAt || '—');
          if (k.priceJpy) desc += ' · ¥' + k.priceJpy.toLocaleString('en-US');
          else if (k.priceHkd) desc += ' · HK$' + k.priceHkd.toLocaleString('en-US');
          else if (k.priceCny) desc += ' · ¥' + k.priceCny.toLocaleString('en-US');
          var tagList = [k.category, k.scale, seriesLabel, channelLabel].concat(tags);
          return {
            title: k.name,
            desc: desc,
            href: '/data/models/' + encodeURIComponent(k.id) + '/',
            section: 'gundam',
            tags: tagList,
            aliases: aliases,
            subject: k.subject || '',
            subjectId: k.subjectId || '',
            text: text,
            lower: (k.name || '').toLowerCase(),
            lowerDesc: desc.toLowerCase(),
            lowerTags: tagList.join(' ').toLowerCase(),
            lowerAliases: aliases.join(' ').toLowerCase(),
            lowerSubject: (k.subject || '').toLowerCase(),
            lowerText: text.toLowerCase(),
          };
        });
        return kits;
      })
      .catch(function () {
        kits = null;
        kitLoading = null;
        throw new Error('模型索引加载失败');
      });
    return kitLoading;
  }

  /**
   * 相关度：按字段加权。
   *
   * 标题命中最重，标题开头再加分；别名与主题名次之——那是玩家真正在找的东西；
   * 标签、描述、正文依次递减。正文里出现的次数给对数奖励：出现一次和出现
   * 十次不该差十倍。
   */
  function score(entry, q) {
    var s = 0;
    if (entry.lower.indexOf(q) !== -1) s += 100;
    if (entry.lower.indexOf(q) === 0) s += 60;
    if (entry.lowerAliases && entry.lowerAliases.indexOf(q) !== -1) s += 45;
    if (entry.lowerSubject && entry.lowerSubject.indexOf(q) !== -1) s += 35;
    if (entry.lowerTags.indexOf(q) !== -1) s += 30;
    if (entry.lowerDesc.indexOf(q) !== -1) s += 20;
    var hits = entry.lowerText.split(q).length - 1;
    if (hits > 0) s += 10 + Math.min(22, Math.round(Math.log(hits + 1) / Math.LN2 * 9));
    return s;
  }

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c];
    });
  }

  /** 把命中片段标出来；只在确认是纯文本之后才插 <mark> */
  function highlight(text, q) {
    var i = text.toLowerCase().indexOf(q);
    if (i === -1) return esc(text);
    var end = i + q.length;
    return (
      esc(text.slice(Math.max(0, i - SNIPPET_RADIUS), i)) +
      '<mark>' +
      esc(text.slice(i, end)) +
      '</mark>' +
      esc(text.slice(end, end + SNIPPET_RADIUS))
    );
  }

  function snippet(entry, q) {
    var i = entry.lowerText.indexOf(q);
    if (i === -1) return entry.desc ? esc(entry.desc) : '';
    var start = Math.max(0, i - SNIPPET_RADIUS);
    var body = entry.text.slice(start, i + q.length + SNIPPET_RADIUS);
    return (start > 0 ? '…' : '') + highlight(body, q) + '…';
  }

  var SECTION_LABEL = { projects: 'Projects', notes: 'Notes', data: 'Data', about: 'About', gundam: '模型', site: '站点' };

  /**
   * 模型结果按主题收组。
   *
   * 搜「高达」会命中上千个条目，逐条列出来没有意义；同一个主题的各品类、
   * 各配色本来就是一件事，合成一条：标题是主题名（链到主题页），底下挂几个
   * 具体版本。少于 MERGE_MIN 条的组不合并——那多半是用户要的就是那一条。
   */
  function groupKits(hits) {
    var groups = new Map();
    var order = [];
    for (var i = 0; i < hits.length; i++) {
      var d = hits[i].doc;
      if (!d.subjectId) {
        order.push({ kind: 'kit', doc: d, score: hits[i].score });
        continue;
      }
      var g = groups.get(d.subjectId);
      if (!g) {
        g = { kind: 'subject', subject: d.subject, subjectId: d.subjectId, members: [], score: 0 };
        groups.set(d.subjectId, g);
        order.push(g);
      }
      g.members.push(d);
      if (hits[i].score > g.score) g.score = hits[i].score;
    }

    var out = [];
    for (var j = 0; j < order.length; j++) {
      var item = order[j];
      if (item.kind !== 'subject') {
        out.push(item);
        continue;
      }
      if (item.members.length < MERGE_MIN) {
        for (var m = 0; m < item.members.length; m++) {
          out.push({ kind: 'kit', doc: item.members[m], score: item.score });
        }
      } else {
        item.members.sort(function (a, b) {
          return b.lower.length - a.lower.length;
        });
        out.push(item);
      }
    }
    return out;
  }

  function byScore(a, b) {
    return b.score - a.score || a.doc.title.localeCompare(b.doc.title, 'zh-Hans-CN');
  }

  function render(q) {
    if (!q) {
      list.innerHTML = '';
      status.textContent =
        '共 ' + (index ? index.length : 0) + ' 篇内容与 ' + (kits ? kits.length : 0) + ' 条模型可搜索。输入关键词开始。';
      return;
    }

    var docHits = [];
    var kitHits = [];
    var i;
    var s;
    for (i = 0; i < index.length; i++) {
      s = score(index[i], q);
      if (s > 0) docHits.push({ doc: index[i], score: s });
    }
    if (kits) {
      for (i = 0; i < kits.length; i++) {
        s = score(kits[i], q);
        if (s > 0) kitHits.push({ doc: kits[i], score: s });
      }
    }
    docHits.sort(byScore);
    kitHits.sort(byScore);

    var grouped = groupKits(kitHits).sort(function (a, b) {
      return b.score - a.score;
    });
    var total = docHits.length + kitHits.length;
    var shownKits = grouped.slice(0, MAX_KIT);
    var shownDocs = docHits.slice(0, MAX_DOC);

    status.textContent = total
      ? '找到 ' + total + ' 条结果' +
        (total > MAX_DOC + MAX_KIT ? '（仅显示前若干条）' : '')
      : '没有匹配「' + q + '」的结果';

    var kitHtml = '';

    if (shownKits.length) {
      kitHtml += '<li class="search__group" role="presentation">模型条目</li>';
      for (var g = 0; g < shownKits.length; g++) {
        var item = shownKits[g];
        if (item.kind === 'subject') {
          kitHtml +=
            '<li class="search__hit search__hit--mech">' +
            '<a class="search__hit-link" href="/data/models/subject/' + encodeURIComponent(item.subjectId) + '/">' +
            '<span class="search__hit-title">' + highlight(item.subject, q) + '</span>' +
            '<span class="search__hit-meta">主题 · ' + item.members.length + ' 个版本</span>' +
            '</a>' +
            '<ul class="search__members">';
          for (var m = 0; m < Math.min(MERGE_SHOW, item.members.length); m++) {
            var mem = item.members[m];
            kitHtml +=
              '<li><a href="' + esc(mem.href) + '">' + highlight(mem.title, q) + '</a></li>';
          }
          if (item.members.length > MERGE_SHOW) {
            kitHtml +=
              '<li class="search__membersMore"><a href="' +
              esc('/data/models/subject/' + encodeURIComponent(item.subjectId) + '/') +
              '">还有 ' + (item.members.length - MERGE_SHOW) + ' 个版本</a></li>';
          }
          kitHtml += '</ul></li>';
        } else {
          var d = item.doc;
          kitHtml +=
            '<li class="search__hit">' +
            '<a class="search__hit-link" href="' + esc(d.href) + '">' +
            '<span class="search__hit-title">' + highlight(d.title, q) + '</span>' +
            '<span class="search__hit-meta">模型条目</span>' +
            '</a>' +
            '<p class="search__hit-snip">' + snippet(d, q) + '</p>' +
            '</li>';
        }
      }
    }

    var docHtml = '';

    if (shownDocs.length) {
      docHtml += '<li class="search__group" role="presentation">站点内容</li>';
      for (var k = 0; k < shownDocs.length; k++) {
        var doc = shownDocs[k].doc;
        docHtml +=
          '<li class="search__hit">' +
          '<a class="search__hit-link" href="' + esc(doc.href) + '">' +
          '<span class="search__hit-title">' + highlight(doc.title, q) + '</span>' +
          '<span class="search__hit-meta">' + esc(SECTION_LABEL[doc.section] || doc.section) + '</span>' +
          '</a>' +
          '<p class="search__hit-snip">' + snippet(doc, q) + '</p>' +
          '</li>';
      }
    }

    /*
     * 两段按各自最强的那条排：搜「对比」时命中「交叉对比色」的模型和命中
     * 「条目对比」这个页面，谁分高谁在前——不然一条高分的文档结果会被
     * 排在低分的模型结果下面。
     */
    if (kitHtml && docHtml) {
      list.innerHTML =
        shownKits[0].score >= shownDocs[0].score ? kitHtml + docHtml : docHtml + kitHtml;
    } else {
      list.innerHTML = kitHtml + docHtml;
    }
  }

  function run() {
    var q = input.value.trim().toLowerCase();
    if (clearBtn) clearBtn.hidden = input.value.length === 0;
    if (!index) {
      status.textContent = '正在加载索引…';
      load()
        .then(function () {
          afterDocIndex(q);
        })
        .catch(function () {
          status.textContent = '索引加载失败，请稍后重试。';
        });
      return;
    }
    afterDocIndex(q);
  }

  /* 文档索引就绪之后，模型索引只在真的搜起来时才去取 */
  function afterDocIndex(q) {
    if (q && !kits) {
      status.textContent = '正在准备模型索引…';
      loadKits()
        .then(function () {
          render(q);
        })
        .catch(function () {
          render(q);
        });
      return;
    }
    render(q);
  }

  input.addEventListener('input', function () {
    // 去抖 120ms：中文输入法下每个音节都会触发 input，不去抖会一直重排。
    if (timer) clearTimeout(timer);
    timer = setTimeout(run, 120);
  });

  form.addEventListener('submit', function (e) {
    e.preventDefault();
    run();
  });

  if (clearBtn) {
    clearBtn.addEventListener('click', function () {
      input.value = '';
      input.focus();
      run();
    });
  }

  // 预取索引：访客打开页面时就在后台取，真正输入时几乎不用等。
  load()
    .then(function () {
      status.textContent =
        '共 ' + index.length + ' 篇内容与 ' + (kits ? kits.length : '1742') + ' 条模型可搜索。输入关键词开始。';
    })
    .catch(function () {
      status.textContent = '索引加载失败，请稍后重试。';
    });

  // "/" 聚焦，除非访客正在输入
  document.addEventListener('keydown', function (e) {
    if (e.key !== '/' || e.metaKey || e.ctrlKey || e.altKey) return;
    var t = e.target;
    var tag = t && t.tagName;
    if (tag === 'INPUT' || tag === 'TEXTAREA' || (t && t.isContentEditable)) return;
    e.preventDefault();
    input.focus();
    input.select();
  });

  input.addEventListener('keydown', function (e) {
    if (e.key === 'Escape') {
      input.value = '';
      input.blur();
      run();
    }
  });

  // 直接带 ?q= 进来时立刻出结果
  var initial = new URLSearchParams(window.location.search).get('q');
  if (initial) {
    input.value = initial;
    run();
  }
})();
