(function () {
  'use strict';

  var PDF_URL = '%E4%B8%89%E5%88%9B%E8%B5%9B-%E5%95%86%E5%8A%A1%E5%A4%A7%E6%95%B0%E6%8D%AE%E5%88%86%E6%9E%90%E5%AE%9E%E6%88%98%E8%B5%9B-%E7%AD%96%E5%88%92%E4%B9%A6.pdf';
  var TOC_URL = 'planner-toc.json';

  var pdfjsLib = window.pdfjsLib;
  pdfjsLib.GlobalWorkerOptions.workerSrc = 'vendor/pdfjs/pdf.worker.min.js';

  var pdfDoc = null;
  var zoom = 1;
  var baseW = 0;          // 第 1 页在 scale=1 时的宽度，用于等比缩放
  var pageMeta = [];      // 每页原始尺寸 {w, h}
  var renderGen = 0;      // 缩放/窗口变化时自增，作废旧渲染
  var currentPage = 1;
  var pageEls = [];       // {el, canvas, ctx, page, height, renderedGen}
  var recent = new Set(); // 最近渲染的页（LRU，用于释放内存上限）

  var wrap = document.getElementById('scroll-wrap');
  var pages = document.getElementById('pages');
  var loading = document.getElementById('loading');
  var errorBox = document.getElementById('error');
  var pageInput = document.getElementById('page-input');
  var pageTotal = document.getElementById('page-total');
  var zoomLevel = document.getElementById('zoom-level');

  function depthOf(title) {
    var m = title.match(/^\d+(\.\d+)*/);
    return m ? m[0].split('.').length : 0;
  }

  // 一页宽度适配容器：尽量大但不超过 840px
  function fitScale() {
    if (!baseW) return 1;
    var avail = Math.max(wrap.clientWidth - 40, 300);
    var target = Math.min(avail, 840);
    return Math.max(0.35, Math.min(2.5, target / baseW));
  }

  function totalScale() {
    return fitScale() * zoom;
  }

  function clampZoom(z) {
    return Math.max(0.4, Math.min(3, z));
  }

  // ===== 布局：为每一页生成容器 canvas =====
  function buildPages() {
    pages.innerHTML = '';
    pageEls = [];
    for (var i = 1; i <= pdfDoc.numPages; i++) {
      var el = document.createElement('div');
      el.className = 'v-page-wrap';
      el.dataset.page = i;
      var c = document.createElement('canvas');
      c.className = 'v-page-canvas';
      el.appendChild(c);
      pages.appendChild(el);
      pageEls.push({ el: el, canvas: c, ctx: c.getContext('2d'), page: i, height: 0, renderedGen: -1 });
    }
  }

  // 按当前缩放重新排高度并作废旧渲染（缩放 / 窗口尺寸变化时调用）
  function relayout() {
    renderGen++;
    var s = totalScale();
    for (var i = 0; i < pageEls.length; i++) {
      var it = pageEls[i];
      var m = pageMeta[it.page - 1];
      if (m) {
        it.height = m.h * s;
        it.el.style.height = it.height + 'px';
      }
      it.renderedGen = -1;
      it.canvas.width = 0; // 释放像素，按需重绘
    }
    zoomLevel.textContent = Math.round(zoom * 100) + '%';
    renderVisible();
  }

  // 视口 + 缓冲 内需要渲染的页
  function pagesInView(buffer) {
    var top = wrap.scrollTop;
    var vh = wrap.clientHeight;
    var res = [];
    for (var i = 0; i < pageEls.length; i++) {
      var it = pageEls[i];
      var h = it.height || 0;
      var elTop = it.el.offsetTop;
      var elBottom = elTop + h;
      if (elBottom < top - vh * buffer || elTop > top + vh * (1 + buffer)) continue;
      res.push(it);
    }
    return res;
  }

  function renderPage(it, gen) {
    if (it.renderedGen === gen) return;
    it.renderedGen = gen;
    var scale = totalScale();
    pdfDoc.getPage(it.page).then(function (pg) {
      if (gen !== renderGen) return;
      var vp = pg.getViewport({ scale: scale });
      var dpr = Math.min(window.devicePixelRatio || 1, 2);
      var c = it.canvas;
      c.width = Math.floor(vp.width * dpr);
      c.height = Math.floor(vp.height * dpr);
      c.style.width = vp.width + 'px';
      c.style.height = vp.height + 'px';
      it.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      return pg.render({ canvasContext: it.ctx, viewport: vp }).promise;
    }).then(function () {
      if (gen === renderGen) {
        trackRecent(it.page);
        releaseFar();
        updatePageUI();
      }
    }).catch(function (e) {
      if (e && e.name === 'RenderingCancelledException') return;
      if (gen === renderGen) it.renderedGen = -1;
    });
  }

  function renderVisible() {
    var gen = renderGen;
    pagesInView(1).forEach(function (it) { renderPage(it, gen); });
  }

  // LRU：最多保留 8 张已渲染页面，超出释放最旧像素
  function trackRecent(page) {
    recent.add(page);
    if (recent.size > 8) {
      var old = recent.values().next().value;
      recent.delete(old);
      var it = pageEls[old - 1];
      if (it && it.renderedGen >= 0) {
        it.renderedGen = -1;
        it.canvas.width = 0;
      }
    }
  }

  // 释放远离视口且不在 LRU 中的页面
  function releaseFar() {
    var vis = pagesInView(1);
    var visSet = new Set(vis.map(function (it) { return it.page; }));
    pageEls.forEach(function (it) {
      if (it.renderedGen < 0) return;
      if (visSet.has(it.page) || recent.has(it.page)) return;
      it.renderedGen = -1;
      it.canvas.width = 0;
    });
  }

  function computeCurrent() {
    var mid = wrap.scrollTop + wrap.clientHeight / 2;
    var best = 1, bestD = Infinity;
    pageEls.forEach(function (it) {
      var c = it.el.offsetTop + (it.height || 0) / 2;
      var d = Math.abs(c - mid);
      if (d < bestD) { bestD = d; best = it.page; }
    });
    return best;
  }

  function updatePageUI() {
    pageInput.value = currentPage;
    pageTotal.textContent = pdfDoc.numPages;
    var active = document.querySelector('.toc-item.current');
    if (active) active.classList.remove('current');
    var item = document.querySelector('.toc-item[data-page="' + currentPage + '"]');
    if (item) {
      item.classList.add('current');
      item.scrollIntoView({ block: 'nearest' });
    }
  }

  function jumpTo(page, smooth) {
    if (!pdfDoc) return;
    var n = Math.min(Math.max(1, Math.floor(page)), pdfDoc.numPages);
    var it = pageEls[n - 1];
    if (!it) return;
    var target = it.el.offsetTop - 12;
    if (smooth && 'scrollBehavior' in document.documentElement.style) {
      wrap.scrollTo({ top: target, behavior: 'smooth' });
    } else {
      wrap.scrollTop = target;
    }
  }

  var scrollTimer = null;
  function onScroll() {
    currentPage = computeCurrent();
    updatePageUI();
    clearTimeout(scrollTimer);
    scrollTimer = setTimeout(function () { renderVisible(); }, 80);
  }

  function closePreview() {
    if (window.parent && typeof window.parent.closePdfPreview === 'function') {
      window.parent.closePdfPreview();
    } else if (window.history.length > 1) {
      window.history.back();
    } else {
      window.close();
    }
  }

  // ===== 目录 =====
  fetch(TOC_URL)
    .then(function (r) { return r.json(); })
    .then(function (toc) {
      var list = document.getElementById('toc-list');
      toc.forEach(function (item) {
        var a = document.createElement('a');
        a.href = '#';
        a.className = 'toc-item';
        a.dataset.page = item.page;
        a.style.paddingLeft = (8 + depthOf(item.title) * 14) + 'px';
        a.textContent = item.title;
        a.addEventListener('click', function (e) {
          e.preventDefault();
          jumpTo(item.page, true);
        });
        list.appendChild(a);
      });
    })
    .catch(function () {
      var list = document.getElementById('toc-list');
      var tip = document.createElement('div');
      tip.className = 'toc-item';
      tip.textContent = '目录加载失败';
      list.appendChild(tip);
    });

  // ===== 工具栏 / 交互 =====
  document.getElementById('btn-toc').addEventListener('click', function () {
    document.getElementById('toc-panel').classList.toggle('hidden');
  });
  document.getElementById('btn-prev').addEventListener('click', function () { jumpTo(currentPage - 1, true); });
  document.getElementById('btn-next').addEventListener('click', function () { jumpTo(currentPage + 1, true); });
  document.getElementById('btn-zoom-in').addEventListener('click', function () {
    zoom = clampZoom(zoom + 0.15);
    relayout();
  });
  document.getElementById('btn-zoom-out').addEventListener('click', function () {
    zoom = clampZoom(zoom - 0.15);
    relayout();
  });
  document.getElementById('btn-close').addEventListener('click', closePreview);
  pageInput.addEventListener('keydown', function (e) {
    if (e.key === 'Enter') {
      jumpTo(parseInt(pageInput.value, 10) || currentPage, true);
    }
  });

  document.addEventListener('keydown', function (e) {
    var tag = (e.target.tagName || '').toLowerCase();
    if (tag === 'input') return;
    if (e.key === 'ArrowLeft' || e.key === 'PageUp') { e.preventDefault(); jumpTo(currentPage - 1, true); }
    if (e.key === 'ArrowRight' || e.key === 'PageDown') { e.preventDefault(); jumpTo(currentPage + 1, true); }
    if (e.key === 'Escape') { closePreview(); }
  });

  // Ctrl + 滚轮缩放（文档查看器惯例）
  wrap.addEventListener('wheel', function (e) {
    if (!e.ctrlKey) return;
    e.preventDefault();
    zoom = clampZoom(zoom + (e.deltaY < 0 ? 0.1 : -0.1));
    relayout();
  }, { passive: false });

  var resizeTimer = null;
  window.addEventListener('resize', function () {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(function () { relayout(); }, 200);
  });

  wrap.addEventListener('scroll', onScroll, { passive: true });

  // ===== 加载 PDF =====
  pdfjsLib.getDocument(PDF_URL).promise.then(function (doc) {
    pdfDoc = doc;
    pageTotal.textContent = doc.numPages;
    // 一次性读取所有页尺寸用于布局（不渲染）
    var jobs = [];
    for (var i = 1; i <= doc.numPages; i++) {
      jobs.push(doc.getPage(i).then(function (pg) {
        var vp = pg.getViewport({ scale: 1 });
        return { w: vp.width, h: vp.height };
      }));
    }
    return Promise.all(jobs).then(function (meta) {
      pageMeta = meta;
      baseW = meta[0] ? meta[0].w : 600;
      loading.hidden = true;
      buildPages();
      relayout();
    });
  }).catch(function (err) {
    console.error(err);
    loading.hidden = true;
    errorBox.hidden = false;
    errorBox.textContent = '加载失败：' + (err && err.message ? err.message : '未知错误');
  });
})();
