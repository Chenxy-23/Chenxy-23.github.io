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

  function renderPage() {
    if (!pdfDoc) return Promise.resolve();
    if (renderTask) renderTask.cancel();
    return pdfDoc.getPage(currentPage).then(function (page) {
      baseViewport = page.getViewport({ scale: 1 });
      var scale = fitScale() * zoom;
      var viewport = page.getViewport({ scale: scale });
      var outputScale = window.devicePixelRatio || 1;
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
  document.getElementById('btn-zoom-in').addEventListener('click', function () { zoom = Math.min(3, zoom + 0.15); renderPage(); });
  document.getElementById('btn-zoom-out').addEventListener('click', function () { zoom = Math.max(0.4, zoom - 0.15); renderPage(); });
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
    resizeTimer = setTimeout(function () { renderPage(); }, 200);
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
