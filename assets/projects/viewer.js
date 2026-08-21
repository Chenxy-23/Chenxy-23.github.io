(function () {
  'use strict';

  var PDF_URL = '%E4%B8%89%E5%88%9B%E8%B5%9B-%E5%95%86%E5%8A%A1%E5%A4%A7%E6%95%B0%E6%8D%AE%E5%88%86%E6%9E%90%E5%AE%9E%E6%88%98%E8%B5%9B-%E7%AD%96%E5%88%92%E4%B9%A6.pdf';
  var TOC_URL = 'planner-toc.json';

  var pdfjsLib = window.pdfjsLib;
  pdfjsLib.GlobalWorkerOptions.workerSrc = 'vendor/pdfjs/pdf.worker.min.js';

  var pdfDoc = null;
  var currentPage = 1;
  var zoom = 1;
  var baseViewport = null;
  var renderTask = null;

  // 页面渲染缓存：翻页/回看时直接复用像素，跳过昂贵的 getPage + render
  // key = 页码，value = { canvas, styleW, styleH }
  var pageCache = new Map();
  var CACHE_LIMIT = 6;
  // 限制高分屏 devicePixelRatio，避免超大 canvas 拖慢渲染
  var outputScale = Math.min(window.devicePixelRatio || 1, 2);

  var canvas = document.getElementById('pdf-canvas');
  var ctx = canvas.getContext('2d');
  var wrap = document.getElementById('canvas-wrap');
  var loading = document.getElementById('loading');
  var errorBox = document.getElementById('error');
  var pageInput = document.getElementById('page-input');
  var pageTotal = document.getElementById('page-total');
  var zoomLevel = document.getElementById('zoom-level');

  function depthOf(title) {
    var m = title.match(/^\d+(\.\d+)*/);
    return m ? m[0].split('.').length : 0;
  }

  function fitScale() {
    if (!baseViewport) return 1;
    var avail = Math.max(wrap.clientWidth - 48, 300);
    return Math.max(0.4, Math.min(2.5, avail / baseViewport.width));
  }

  function clearCache() {
    pageCache.clear();
  }

  function updatePageUI() {
    pageInput.value = currentPage;
    pageTotal.textContent = pdfDoc.numPages;
    zoomLevel.textContent = Math.round(zoom * 100) + '%';
    var active = document.querySelector('.toc-item.current');
    if (active) active.classList.remove('current');
    var item = document.querySelector('.toc-item[data-page="' + currentPage + '"]');
    if (item) {
      item.classList.add('current');
      item.scrollIntoView({ block: 'nearest' });
    }
  }

  // 把一张已渲染好的 canvas 绘制到主 canvas 上（命中缓存时走这里）
  function blit(source, styleW, styleH) {
    canvas.width = source.width;
    canvas.height = source.height;
    canvas.style.width = styleW + 'px';
    canvas.style.height = styleH + 'px';
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.drawImage(source, 0, 0);
  }

  // 后台预渲染相邻页，静默写入缓存，翻到时秒开
  function preload(page) {
    if (!pdfDoc || page < 1 || page > pdfDoc.numPages) return;
    if (pageCache.has(page)) return;
    var scale = fitScale() * zoom;
    pdfDoc.getPage(page).then(function (p) {
      var viewport = p.getViewport({ scale: scale });
      var off = document.createElement('canvas');
      var octx = off.getContext('2d');
      off.width = Math.floor(viewport.width * outputScale);
      off.height = Math.floor(viewport.height * outputScale);
      octx.setTransform(outputScale, 0, 0, outputScale, 0, 0);
      p.render({ canvasContext: octx, viewport: viewport }).promise.then(function () {
        pageCache.set(page, { canvas: off, styleW: viewport.width, styleH: viewport.height });
      }).catch(function () {});
    }).catch(function () {});
  }

  function renderPage() {
    if (!pdfDoc) return Promise.resolve();

    // 命中缓存：直接绘制
    var hit = pageCache.get(currentPage);
    if (hit) {
      if (renderTask) { renderTask.cancel(); renderTask = null; }
      blit(hit.canvas, hit.styleW, hit.styleH);
      updatePageUI();
      wrap.scrollTop = 0;
      preload(currentPage + 1);
      preload(currentPage - 1);
      return Promise.resolve();
    }

    if (renderTask) renderTask.cancel();
    var scale, viewport;
    return pdfDoc.getPage(currentPage).then(function (page) {
      baseViewport = page.getViewport({ scale: 1 });
      scale = fitScale() * zoom;
      viewport = page.getViewport({ scale: scale });
      canvas.width = Math.floor(viewport.width * outputScale);
      canvas.height = Math.floor(viewport.height * outputScale);
      canvas.style.width = viewport.width + 'px';
      canvas.style.height = viewport.height + 'px';
      ctx.setTransform(outputScale, 0, 0, outputScale, 0, 0);
      renderTask = page.render({ canvasContext: ctx, viewport: viewport });
      return renderTask.promise;
    }).then(function () {
      updatePageUI();
      wrap.scrollTop = 0;
      // 缓存当前页，并预加载相邻页
      var copy = document.createElement('canvas');
      copy.width = canvas.width;
      copy.height = canvas.height;
      copy.getContext('2d').drawImage(canvas, 0, 0);
      if (pageCache.size >= CACHE_LIMIT) {
        pageCache.delete(pageCache.keys().next().value);
      }
      pageCache.set(currentPage, { canvas: copy, styleW: viewport.width, styleH: viewport.height });
      preload(currentPage + 1);
      preload(currentPage - 1);
    }).catch(function (err) {
      if (err && err.name === 'RenderingCancelledException') return;
      throw err;
    });
  }

  function jumpTo(page) {
    if (!pdfDoc) return;
    currentPage = Math.min(Math.max(1, Math.floor(page)), pdfDoc.numPages);
    renderPage();
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

  // 目录
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
          jumpTo(item.page);
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

  // 工具栏
  document.getElementById('btn-toc').addEventListener('click', function () {
    document.getElementById('toc-panel').classList.toggle('hidden');
    setTimeout(function () { renderPage(); }, 210);
  });
  document.getElementById('btn-prev').addEventListener('click', function () { jumpTo(currentPage - 1); });
  document.getElementById('btn-next').addEventListener('click', function () { jumpTo(currentPage + 1); });
  document.getElementById('btn-zoom-in').addEventListener('click', function () { zoom = Math.min(3, zoom + 0.15); clearCache(); renderPage(); });
  document.getElementById('btn-zoom-out').addEventListener('click', function () { zoom = Math.max(0.4, zoom - 0.15); clearCache(); renderPage(); });
  document.getElementById('btn-close').addEventListener('click', closePreview);
  pageInput.addEventListener('keydown', function (e) {
    if (e.key === 'Enter') {
      jumpTo(parseInt(pageInput.value, 10) || currentPage);
    }
  });

  document.addEventListener('keydown', function (e) {
    var tag = (e.target.tagName || '').toLowerCase();
    if (tag === 'input') return;
    if (e.key === 'ArrowLeft' || e.key === 'PageUp') { e.preventDefault(); jumpTo(currentPage - 1); }
    if (e.key === 'ArrowRight' || e.key === 'PageDown') { e.preventDefault(); jumpTo(currentPage + 1); }
    if (e.key === 'Escape') { closePreview(); }
  });

  var resizeTimer = null;
  window.addEventListener('resize', function () {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(function () { clearCache(); renderPage(); }, 200);
  });

  // 加载 PDF
  pdfjsLib.getDocument(PDF_URL).promise.then(function (doc) {
    pdfDoc = doc;
    pageTotal.textContent = doc.numPages;
    loading.hidden = true;
    return renderPage();
  }).catch(function (err) {
    console.error(err);
    loading.hidden = true;
    errorBox.hidden = false;
    errorBox.textContent = '加载失败：' + (err && err.message ? err.message : '未知错误');
  });
})();
