/* ============================================================
   editor2d.js — SVG-based site plan editor.
   Renders deterministically from the parametric model. Edits in
   the editor write back to the model (single source of truth).
   ============================================================ */
(function (global) {
  'use strict';

  const Editor2D = {};
  const NS = 'http://www.w3.org/2000/svg';
  const PX_PER_FT_DEFAULT = 7; // base scale

  let svg = null;
  let viewportPad = 30;
  let pxPerFt = PX_PER_FT_DEFAULT;
  let showGrid = true;
  let showDims = true;
  let dragState = null;

  // Public init
  Editor2D.mount = function (svgEl) {
    svg = svgEl;
    svg.addEventListener('mousedown', onPointerDown);
    svg.addEventListener('mousemove', onPointerMove);
    svg.addEventListener('mouseup', onPointerUp);
    svg.addEventListener('mouseleave', onPointerUp);
    svg.addEventListener('touchstart', onPointerDown, { passive: false });
    svg.addEventListener('touchmove', onPointerMove, { passive: false });
    svg.addEventListener('touchend', onPointerUp);
  };

  Editor2D.setGrid = function (show) { showGrid = show; };
  Editor2D.setDims = function (show) { showDims = show; };
  Editor2D.toggleGrid = function () { showGrid = !showGrid; return showGrid; };
  Editor2D.toggleDims = function () { showDims = !showDims; return showDims; };

  Editor2D.fit = function (model) {
    if (!model || !svg) return;
    const w = svg.clientWidth || 800;
    const h = svg.clientHeight || 500;
    const sx = (w - viewportPad * 2) / model.site.lotWidthFt;
    const sy = (h - viewportPad * 2) / model.site.lotDepthFt;
    pxPerFt = Math.min(sx, sy);
  };

  // Convert lot-feet to svg-px (origin top-left of lot, padded)
  function ftToPx(x, y) {
    return { x: viewportPad + x * pxPerFt, y: viewportPad + y * pxPerFt };
  }
  function pxToFt(px, py) {
    return { x: (px - viewportPad) / pxPerFt, y: (py - viewportPad) / pxPerFt };
  }

  Editor2D.render = function (model) {
    if (!svg || !model) return;
    while (svg.firstChild) svg.removeChild(svg.firstChild);
    Editor2D.fit(model);

    const defs = document.createElementNS(NS, 'defs');
    defs.innerHTML = `
      <pattern id="grid" width="${pxPerFt * 5}" height="${pxPerFt * 5}" patternUnits="userSpaceOnUse">
        <path d="M ${pxPerFt * 5} 0 L 0 0 0 ${pxPerFt * 5}" fill="none" stroke="#e3e8ef" stroke-width="0.7"/>
      </pattern>
      <pattern id="grid-major" width="${pxPerFt * 10}" height="${pxPerFt * 10}" patternUnits="userSpaceOnUse">
        <path d="M ${pxPerFt * 10} 0 L 0 0 0 ${pxPerFt * 10}" fill="none" stroke="#b6c2d2" stroke-width="0.8"/>
      </pattern>
      <pattern id="hatchDeck" patternUnits="userSpaceOnUse" width="6" height="6" patternTransform="rotate(45)">
        <line x1="0" y1="0" x2="0" y2="6" stroke="#9aa6b8" stroke-width="1" />
      </pattern>
      <marker id="arrow" markerWidth="10" markerHeight="10" refX="8" refY="3" orient="auto" markerUnits="strokeWidth">
        <path d="M0,0 L0,6 L8,3 z" fill="#14253b"/>
      </marker>`;
    svg.appendChild(defs);

    // Background grid
    if (showGrid) {
      const bg = document.createElementNS(NS, 'rect');
      bg.setAttribute('x', 0); bg.setAttribute('y', 0);
      bg.setAttribute('width', '100%'); bg.setAttribute('height', '100%');
      bg.setAttribute('fill', 'url(#grid)');
      svg.appendChild(bg);
      const bg2 = document.createElementNS(NS, 'rect');
      bg2.setAttribute('x', 0); bg2.setAttribute('y', 0);
      bg2.setAttribute('width', '100%'); bg2.setAttribute('height', '100%');
      bg2.setAttribute('fill', 'url(#grid-major)');
      svg.appendChild(bg2);
    }

    drawLot(model);
    drawHouse(model);
    drawDeck(model);
    drawPool(model);
    drawSpa(model);
    drawEquipment(model);
    if (showDims) drawDimensions(model);
    drawTitleBlock(model);
    drawNorthArrow();
    drawScaleBar();
  };

  // --- Geometry primitives ---
  function rect(x, y, w, h, attrs) {
    const r = document.createElementNS(NS, 'rect');
    r.setAttribute('x', x); r.setAttribute('y', y);
    r.setAttribute('width', w); r.setAttribute('height', h);
    if (attrs) for (const k in attrs) r.setAttribute(k, attrs[k]);
    return r;
  }
  function text(x, y, content, attrs) {
    const t = document.createElementNS(NS, 'text');
    t.setAttribute('x', x); t.setAttribute('y', y);
    if (attrs) for (const k in attrs) t.setAttribute(k, attrs[k]);
    t.textContent = content;
    return t;
  }
  function line(x1, y1, x2, y2, attrs) {
    const l = document.createElementNS(NS, 'line');
    l.setAttribute('x1', x1); l.setAttribute('y1', y1);
    l.setAttribute('x2', x2); l.setAttribute('y2', y2);
    if (attrs) for (const k in attrs) l.setAttribute(k, attrs[k]);
    return l;
  }

  function drawLot(m) {
    const tl = ftToPx(0, 0);
    const br = ftToPx(m.site.lotWidthFt, m.site.lotDepthFt);
    const lot = rect(tl.x, tl.y, br.x - tl.x, br.y - tl.y, {
      fill: '#fafbfc', stroke: '#14253b', 'stroke-width': 1.6,
      'stroke-dasharray': '6 3'
    });
    svg.appendChild(lot);
    svg.appendChild(text(tl.x + 8, tl.y + 16, 'LOT BOUNDARY', {
      'font-family': 'Inter, sans-serif', 'font-size': 10, fill: '#5a6b81',
      'letter-spacing': '1.2'
    }));
  }

  function drawHouse(m) {
    const h = m.site.housePosition;
    const tl = ftToPx(h.xFt, h.yFt);
    const br = ftToPx(h.xFt + m.site.houseWidthFt, h.yFt + m.site.houseDepthFt);
    const house = rect(tl.x, tl.y, br.x - tl.x, br.y - tl.y, {
      fill: '#eef2f7', stroke: '#14253b', 'stroke-width': 1.5,
    });
    svg.appendChild(house);
    svg.appendChild(text((tl.x + br.x) / 2, (tl.y + br.y) / 2, 'EXISTING HOUSE', {
      'font-family': 'Inter, sans-serif', 'font-size': 11, fill: '#14253b',
      'text-anchor': 'middle', 'dominant-baseline': 'middle', 'font-weight': '600'
    }));
  }

  function drawDeck(m) {
    if (m.deck.avgWidthFt <= 0) return;
    const p = m.pool.positionFt;
    const dw = m.deck.avgWidthFt;
    const tl = ftToPx(p.x - dw, p.y - dw);
    const br = ftToPx(p.x + m.pool.lengthFt + dw, p.y + m.pool.widthFt + dw);
    const deck = rect(tl.x, tl.y, br.x - tl.x, br.y - tl.y, {
      fill: 'url(#hatchDeck)', stroke: '#6b7280', 'stroke-width': 1,
      'stroke-dasharray': '2 2', rx: 4,
    });
    svg.appendChild(deck);
  }

  function drawPool(m) {
    const p = m.pool.positionFt;
    const tl = ftToPx(p.x, p.y);
    const br = ftToPx(p.x + m.pool.lengthFt, p.y + m.pool.widthFt);

    let shape;
    if (m.pool.shape === 'freeform' || m.pool.shape === 'kidney') {
      const w = br.x - tl.x;
      const h = br.y - tl.y;
      const path = document.createElementNS(NS, 'path');
      // smooth freeform shape (varied curve)
      const d = [
        `M ${tl.x + w * 0.18} ${tl.y}`,
        `Q ${tl.x} ${tl.y} ${tl.x} ${tl.y + h * 0.4}`,
        `Q ${tl.x + w * 0.05} ${br.y} ${tl.x + w * 0.45} ${br.y}`,
        `Q ${br.x} ${br.y} ${br.x} ${br.y - h * 0.35}`,
        `Q ${br.x - w * 0.1} ${tl.y} ${tl.x + w * 0.6} ${tl.y}`,
        'Z',
      ].join(' ');
      path.setAttribute('d', d);
      shape = path;
    } else if (m.pool.shape === 'lshape') {
      const w = br.x - tl.x;
      const h = br.y - tl.y;
      const path = document.createElementNS(NS, 'path');
      const d = [
        `M ${tl.x} ${tl.y}`,
        `L ${tl.x + w * 0.7} ${tl.y}`,
        `L ${tl.x + w * 0.7} ${tl.y + h * 0.5}`,
        `L ${br.x} ${tl.y + h * 0.5}`,
        `L ${br.x} ${br.y}`,
        `L ${tl.x} ${br.y}`,
        'Z',
      ].join(' ');
      path.setAttribute('d', d);
      shape = path;
    } else {
      shape = rect(tl.x, tl.y, br.x - tl.x, br.y - tl.y, { rx: 4 });
    }

    shape.setAttribute('fill', '#bce4f4');
    shape.setAttribute('stroke', '#0a6fb8');
    shape.setAttribute('stroke-width', 2);
    shape.setAttribute('data-handle', 'pool');
    shape.style.cursor = 'grab';
    svg.appendChild(shape);

    // Pool waterline label
    const cx = (tl.x + br.x) / 2;
    const cy = (tl.y + br.y) / 2;
    svg.appendChild(text(cx, cy, 'POOL', {
      'font-family': 'Inter, sans-serif', 'font-size': 11, fill: '#0a6fb8',
      'text-anchor': 'middle', 'dominant-baseline': 'middle', 'font-weight': '700',
      'letter-spacing': '0.1em'
    }));

    // Steps
    if (m.pool.features.steps) {
      const step = rect(tl.x + 6, tl.y + 4, 26, 10, { fill: '#0a6fb8', opacity: 0.45 });
      svg.appendChild(step);
      svg.appendChild(text(tl.x + 6, tl.y - 2, 'steps', {
        'font-family': 'Inter, sans-serif', 'font-size': 8, fill: '#0a6fb8'
      }));
    }
    // Bench
    if (m.pool.features.bench) {
      const bench = rect(br.x - 32, br.y - 14, 26, 8, { fill: '#0a6fb8', opacity: 0.3 });
      svg.appendChild(bench);
    }
    // Shelf
    if (m.pool.features.shelf) {
      const shelf = rect(tl.x + 5, br.y - 22, 50, 16, { fill: '#cfeaf5', stroke: '#0a6fb8', 'stroke-dasharray': '3 3' });
      svg.appendChild(shelf);
      svg.appendChild(text(tl.x + 8, br.y - 26, 'baja shelf', {
        'font-family': 'Inter, sans-serif', 'font-size': 8, fill: '#0a6fb8'
      }));
    }
    // Water feature
    if (m.pool.features.waterFeature) {
      const c = document.createElementNS(NS, 'circle');
      c.setAttribute('cx', br.x - 12); c.setAttribute('cy', tl.y + 12);
      c.setAttribute('r', 5); c.setAttribute('fill', '#0a6fb8');
      svg.appendChild(c);
    }
  }

  function drawSpa(m) {
    if (!m.pool.features.spa) return;
    const p = m.pool.positionFt;
    const c = ftToPx(p.x + m.pool.lengthFt + 4, p.y + m.pool.widthFt / 2);
    const spa = document.createElementNS(NS, 'circle');
    spa.setAttribute('cx', c.x); spa.setAttribute('cy', c.y);
    spa.setAttribute('r', Math.max(8, pxPerFt * 3.5));
    spa.setAttribute('fill', '#9bd4e8');
    spa.setAttribute('stroke', '#0a6fb8');
    spa.setAttribute('stroke-width', 1.8);
    svg.appendChild(spa);
    svg.appendChild(text(c.x, c.y, 'SPA', {
      'font-family': 'Inter, sans-serif', 'font-size': 9, fill: '#0a6fb8',
      'text-anchor': 'middle', 'dominant-baseline': 'middle', 'font-weight': '700'
    }));
  }

  function drawEquipment(m) {
    const e = m.equipment;
    const tl = ftToPx(e.xFt, e.yFt);
    const br = ftToPx(e.xFt + e.widthFt, e.yFt + e.depthFt);
    const r = rect(tl.x, tl.y, br.x - tl.x, br.y - tl.y, {
      fill: '#fff6e1', stroke: '#b45309', 'stroke-width': 1.4, 'stroke-dasharray': '3 2'
    });
    r.setAttribute('data-handle', 'equipment');
    r.style.cursor = 'grab';
    svg.appendChild(r);
    svg.appendChild(text((tl.x + br.x) / 2, (tl.y + br.y) / 2, 'EQUIP', {
      'font-family': 'Inter, sans-serif', 'font-size': 9, fill: '#b45309',
      'text-anchor': 'middle', 'dominant-baseline': 'middle', 'font-weight': '700'
    }));
  }

  function drawDimensions(m) {
    const p = m.pool.positionFt;
    const tl = ftToPx(p.x, p.y);
    const br = ftToPx(p.x + m.pool.lengthFt, p.y + m.pool.widthFt);

    // Length dimension (above pool)
    const dy = tl.y - 16;
    svg.appendChild(line(tl.x, dy, br.x, dy, {
      stroke: '#14253b', 'stroke-width': 0.8,
      'marker-start': 'url(#arrow)', 'marker-end': 'url(#arrow)'
    }));
    svg.appendChild(text((tl.x + br.x) / 2, dy - 4,
      m.pool.lengthFt + "' (" + U.feetInches(m.pool.lengthFt) + ')',
      {
        'font-family': 'Inter, sans-serif', 'font-size': 10, fill: '#14253b',
        'text-anchor': 'middle', 'font-weight': '600'
      }));

    // Width dimension (right of pool)
    const dx = br.x + 18;
    svg.appendChild(line(dx, tl.y, dx, br.y, {
      stroke: '#14253b', 'stroke-width': 0.8,
      'marker-start': 'url(#arrow)', 'marker-end': 'url(#arrow)'
    }));
    const wt = text(dx + 4, (tl.y + br.y) / 2, m.pool.widthFt + "'", {
      'font-family': 'Inter, sans-serif', 'font-size': 10, fill: '#14253b',
      'font-weight': '600', 'dominant-baseline': 'middle'
    });
    svg.appendChild(wt);

    // Setback callouts
    const sbHouse = m.setbacks.houseFt;
    const sbLot = m.setbacks.propertyLineFt;
    svg.appendChild(text(tl.x, br.y + 16,
      'SB property: ' + sbLot + "'   SB house: " + sbHouse + "'",
      {
        'font-family': 'Inter, sans-serif', 'font-size': 9, fill: '#5a6b81'
      }));
  }

  function drawTitleBlock(m) {
    const w = svg.clientWidth || 800;
    const h = svg.clientHeight || 500;
    const x = w - 200, y = h - 70;
    const g = document.createElementNS(NS, 'g');
    const r = rect(x, y, 188, 60, { fill: '#fff', stroke: '#14253b', 'stroke-width': 1 });
    g.appendChild(r);
    g.appendChild(text(x + 8, y + 16, 'SITE PLAN — PRELIMINARY', {
      'font-family': 'Inter, sans-serif', 'font-size': 11, fill: '#14253b', 'font-weight': '700'
    }));
    g.appendChild(text(x + 8, y + 32, 'Not for construction', {
      'font-family': 'Inter, sans-serif', 'font-size': 9, fill: '#b45309'
    }));
    g.appendChild(text(x + 8, y + 48, 'Scale: NTS / Bid-phase', {
      'font-family': 'Inter, sans-serif', 'font-size': 9, fill: '#5a6b81'
    }));
    svg.appendChild(g);
  }

  function drawNorthArrow() {
    const w = svg.clientWidth || 800;
    const x = w - 60, y = 50;
    const g = document.createElementNS(NS, 'g');
    g.setAttribute('transform', `translate(${x},${y})`);
    const path = document.createElementNS(NS, 'path');
    path.setAttribute('d', 'M 0 -20 L 8 14 L 0 8 L -8 14 Z');
    path.setAttribute('fill', '#14253b');
    g.appendChild(path);
    g.appendChild(text(0, 28, 'N', {
      'font-family': 'serif', 'font-size': 14, fill: '#14253b',
      'text-anchor': 'middle', 'font-weight': '700'
    }));
    svg.appendChild(g);
  }

  function drawScaleBar() {
    const h = svg.clientHeight || 500;
    const x = 24, y = h - 24;
    const segFt = 10;
    const w = segFt * pxPerFt;
    const g = document.createElementNS(NS, 'g');
    g.appendChild(rect(x, y, w, 6, { fill: '#14253b' }));
    g.appendChild(rect(x + w, y, w, 6, { fill: '#fff', stroke: '#14253b' }));
    g.appendChild(text(x, y - 4, "0'", { 'font-family': 'Inter, sans-serif', 'font-size': 9, fill: '#14253b' }));
    g.appendChild(text(x + w, y - 4, segFt + "'", { 'font-family': 'Inter, sans-serif', 'font-size': 9, fill: '#14253b' }));
    g.appendChild(text(x + w * 2, y - 4, (segFt * 2) + "'", { 'font-family': 'Inter, sans-serif', 'font-size': 9, fill: '#14253b' }));
    svg.appendChild(g);
  }

  // --- Drag interactions for pool + equipment ---
  function pointerXY(e) {
    const rect = svg.getBoundingClientRect();
    const t = e.touches ? e.touches[0] : e;
    return { x: t.clientX - rect.left, y: t.clientY - rect.top };
  }

  function onPointerDown(e) {
    const target = e.target;
    if (!target || !target.dataset || !target.dataset.handle) return;
    e.preventDefault();
    const pt = pointerXY(e);
    dragState = { handle: target.dataset.handle, start: pt };
    target.style.cursor = 'grabbing';
  }
  function onPointerMove(e) {
    if (!dragState) return;
    e.preventDefault();
    const pt = pointerXY(e);
    const dxPx = pt.x - dragState.start.x;
    const dyPx = pt.y - dragState.start.y;
    const dxFt = dxPx / pxPerFt;
    const dyFt = dyPx / pxPerFt;
    if (Editor2D.onDrag) Editor2D.onDrag(dragState.handle, dxFt, dyFt);
    dragState.start = pt;
  }
  function onPointerUp(e) {
    if (!dragState) return;
    if (Editor2D.onDragEnd) Editor2D.onDragEnd(dragState.handle);
    dragState = null;
  }

  // Export current SVG as a serialized string (for PDF embedding)
  Editor2D.toSvgString = function () {
    if (!svg) return '';
    const clone = svg.cloneNode(true);
    clone.setAttribute('xmlns', NS);
    clone.setAttribute('width', svg.clientWidth || 800);
    clone.setAttribute('height', svg.clientHeight || 500);
    return new XMLSerializer().serializeToString(clone);
  };

  // Export to PNG via canvas (used by PDF export)
  Editor2D.toPng = function () {
    return new Promise((resolve) => {
      if (!svg) return resolve(null);
      const svgStr = Editor2D.toSvgString();
      const blob = new Blob([svgStr], { type: 'image/svg+xml;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const img = new Image();
      img.onload = () => {
        const c = document.createElement('canvas');
        c.width = (svg.clientWidth || 800) * 2;
        c.height = (svg.clientHeight || 500) * 2;
        const ctx = c.getContext('2d');
        ctx.fillStyle = '#fff';
        ctx.fillRect(0, 0, c.width, c.height);
        ctx.drawImage(img, 0, 0, c.width, c.height);
        URL.revokeObjectURL(url);
        resolve(c.toDataURL('image/png'));
      };
      img.onerror = () => { URL.revokeObjectURL(url); resolve(null); };
      img.src = url;
    });
  };

  global.Editor2D = Editor2D;
})(window);
