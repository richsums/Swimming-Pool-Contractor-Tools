/* ============================================================
   plumbing_view.js — Plumbing visualizer renderer + interactions.
   - Renders the pool + components + pipes inside an SVG canvas
   - Palette drag-drop to add components
   - Move components by drag
   - Click-to-connect ports to draw pipes
   - Click components to open spec sidebar
   - Animations driven by the flow simulation
   - Controls: pump on/off, valve states, mode buttons
   ============================================================ */
(function (global) {
  'use strict';

  const NS = 'http://www.w3.org/2000/svg';
  const PlumbingView = {};
  let svg = null;
  let layers = {}; // gPool, gPipes, gComps, gPorts, gOverlay
  let project = null;
  let selectedComp = null;
  let pendingPipe = null; // { compId, portId }
  let dragState = null;
  let onChange = function () {};
  let onSelect = function () {};
  let simResult = { pipeStates: {}, alerts: [] };
  let viewBox = { x: 0, y: 0, w: 1200, h: 700 };
  let isPanning = false;
  let panStart = null;

  // ============================================================
  // Mount
  // ============================================================
  PlumbingView.mount = function (svgEl, opts) {
    svg = svgEl;
    onChange = (opts && opts.onChange) || (() => {});
    onSelect = (opts && opts.onSelect) || (() => {});

    svg.setAttribute('viewBox', `${viewBox.x} ${viewBox.y} ${viewBox.w} ${viewBox.h}`);
    svg.setAttribute('preserveAspectRatio', 'xMidYMid meet');

    // Drop zone (palette → canvas)
    svg.addEventListener('dragover', (e) => { e.preventDefault(); });
    svg.addEventListener('drop', onDrop);

    // Click/drag
    svg.addEventListener('mousedown', onPointerDown);
    svg.addEventListener('mousemove', onPointerMove);
    window.addEventListener('mouseup', onPointerUp);
    svg.addEventListener('click', onCanvasClick);

    // Touch
    svg.addEventListener('touchstart', onPointerDown, { passive: false });
    svg.addEventListener('touchmove', onPointerMove, { passive: false });
    window.addEventListener('touchend', onPointerUp);

    // Right-click to delete pipe / cancel
    svg.addEventListener('contextmenu', (e) => {
      if (pendingPipe) { e.preventDefault(); cancelPendingPipe(); }
    });

    // Pan/zoom
    svg.addEventListener('wheel', onWheel, { passive: false });

    // Resize handling — keep viewBox aspect aligned to container size
    if (global.ResizeObserver) {
      new ResizeObserver(() => render(project)).observe(svg);
    }
  };

  PlumbingView.setProject = function (p) {
    project = p;
    selectedComp = null;
    pendingPipe = null;
    render(project);
  };

  PlumbingView.setSimulation = function (sim) {
    simResult = sim || { pipeStates: {}, alerts: [] };
    // Cheap update: re-render only pipe styling
    updatePipeAnimations();
  };

  PlumbingView.refresh = function () { render(project); };

  // ============================================================
  // SVG helpers
  // ============================================================
  function el(tag, attrs, html) {
    const e = document.createElementNS(NS, tag);
    if (attrs) {
      for (const k in attrs) {
        if (attrs[k] === false || attrs[k] == null) continue;
        e.setAttribute(k, attrs[k]);
      }
    }
    if (html !== undefined) e.innerHTML = html;
    return e;
  }

  // ============================================================
  // Render
  // ============================================================
  function render(p) {
    if (!svg) return;
    while (svg.firstChild) svg.removeChild(svg.firstChild);

    // Defs (marker arrows, pattern for water, etc.)
    const defs = el('defs');
    defs.innerHTML = `
      <pattern id="poolWater" patternUnits="userSpaceOnUse" width="40" height="40">
        <rect width="40" height="40" fill="#a4d9ed"/>
        <path d="M 0 30 Q 10 24 20 30 T 40 30" stroke="#7cc5e0" stroke-width="1.2" fill="none"/>
        <path d="M 0 14 Q 10 8 20 14 T 40 14" stroke="#7cc5e0" stroke-width="1.2" fill="none"/>
      </pattern>
      <pattern id="grid" width="20" height="20" patternUnits="userSpaceOnUse">
        <path d="M 20 0 L 0 0 0 20" fill="none" stroke="#e9eef5" stroke-width="0.7"/>
      </pattern>
      <pattern id="gridMajor" width="100" height="100" patternUnits="userSpaceOnUse">
        <path d="M 100 0 L 0 0 0 100" fill="none" stroke="#cbd4df" stroke-width="0.8"/>
      </pattern>
      <marker id="dirArrow" markerWidth="8" markerHeight="8" refX="6" refY="3" orient="auto" markerUnits="strokeWidth">
        <path d="M0,0 L6,3 L0,6 Z" fill="#0a6fb8"/>
      </marker>
    `;
    svg.appendChild(defs);

    // Background grid
    svg.appendChild(el('rect', { x: viewBox.x, y: viewBox.y, width: viewBox.w, height: viewBox.h, fill: 'url(#grid)' }));
    svg.appendChild(el('rect', { x: viewBox.x, y: viewBox.y, width: viewBox.w, height: viewBox.h, fill: 'url(#gridMajor)' }));

    layers.gPool = el('g', { class: 'l-pool' });
    layers.gPipes = el('g', { class: 'l-pipes' });
    layers.gComps = el('g', { class: 'l-comps' });
    layers.gOverlay = el('g', { class: 'l-overlay' });

    drawPool();
    drawPipes();
    drawComponents();
    drawPendingPipe();

    svg.appendChild(layers.gPool);
    svg.appendChild(layers.gPipes);
    svg.appendChild(layers.gComps);
    svg.appendChild(layers.gOverlay);
  }

  // --- Pool model (generic, sized from parametric model where available) ---
  function drawPool() {
    const pm = (project && project.model) || null;
    const lengthFt = pm ? pm.pool.lengthFt : 30;
    const widthFt = pm ? pm.pool.widthFt : 15;

    // pool placed at canvas left, 100 ft scaled to fit
    const scale = 12; // 1 ft = 12 svg units
    const poolX = 60;
    const poolY = 220;
    const poolW = lengthFt * scale;
    const poolH = widthFt * scale;

    // pool body
    const pool = el('rect', {
      x: poolX, y: poolY, width: poolW, height: poolH, rx: 10,
      fill: 'url(#poolWater)', stroke: '#0a6fb8', 'stroke-width': 3,
    });
    layers.gPool.appendChild(pool);

    // coping
    layers.gPool.appendChild(el('rect', {
      x: poolX - 5, y: poolY - 5, width: poolW + 10, height: poolH + 10, rx: 12,
      fill: 'none', stroke: '#c8b89d', 'stroke-width': 3, 'stroke-linejoin': 'round',
    }));

    // label
    const lbl = el('text', {
      x: poolX + poolW / 2, y: poolY + poolH / 2 + 4, 'text-anchor': 'middle',
      'font-family': 'Inter, sans-serif', 'font-size': 14, fill: '#0a6fb8', 'font-weight': '700'
    });
    lbl.textContent = `POOL · ${lengthFt}' × ${widthFt}'`;
    layers.gPool.appendChild(lbl);

    // deck outline (faint)
    layers.gPool.appendChild(el('rect', {
      x: poolX - 50, y: poolY - 50, width: poolW + 100, height: poolH + 100, rx: 14,
      fill: 'none', stroke: '#cbd5e1', 'stroke-width': 1, 'stroke-dasharray': '4 4',
    }));

    // Equipment pad area indicator (right side of canvas)
    layers.gPool.appendChild(el('rect', {
      x: 720, y: 60, width: 440, height: 580, rx: 8,
      fill: '#fef3c7', stroke: '#b45309', 'stroke-width': 1.4, 'stroke-dasharray': '8 4', opacity: 0.45
    }));
    const padLbl = el('text', {
      x: 940, y: 80, 'text-anchor': 'middle',
      'font-family': 'Inter, sans-serif', 'font-size': 12, fill: '#b45309', 'font-weight': '700',
      'letter-spacing': '0.08em'
    });
    padLbl.textContent = 'EQUIPMENT PAD';
    layers.gPool.appendChild(padLbl);
  }

  // --- Pipes ---
  function drawPipes() {
    if (!project) return;
    const net = project.plumbing;
    if (!net) return;
    Object.values(net.pipes).forEach((p) => {
      const a = portCenter(p.fromComp, p.fromPort);
      const b = portCenter(p.toComp, p.toPort);
      if (!a || !b) return;
      const flow = simResult.pipeStates[p.id] || null;

      // Route: simple elbow (horizontal then vertical)
      const mid = { x: (a.x + b.x) / 2, y: a.y };
      const path = `M ${a.x} ${a.y} L ${mid.x} ${mid.y} L ${mid.x} ${b.y} L ${b.x} ${b.y}`;

      // Outer pipe (jacket)
      const jacket = el('path', {
        d: path, fill: 'none', stroke: '#6b7280', 'stroke-width': 6,
        'stroke-linecap': 'round', 'stroke-linejoin': 'round',
        class: 'pipe-jacket', 'data-pipe': p.id, 'data-flow': flow || 'idle',
      });
      // Inner pipe (water)
      const inner = el('path', {
        d: path, fill: 'none', stroke: flowColor(flow), 'stroke-width': 3,
        'stroke-linecap': 'round', 'stroke-linejoin': 'round',
        class: 'pipe-inner', 'data-pipe': p.id, 'data-flow': flow || 'idle',
      });
      // Animated dashes for active flow
      if (flow) {
        inner.setAttribute('stroke-dasharray', '10 8');
        inner.classList.add('pipe-anim-' + flow);
      }

      jacket.addEventListener('click', (e) => {
        e.stopPropagation();
        if (confirm('Delete this pipe segment?')) {
          Plumbing.removePipe(project.plumbing, p.id);
          onChange();
          render(project);
        }
      });
      layers.gPipes.appendChild(jacket);
      layers.gPipes.appendChild(inner);
    });
  }

  function flowColor(flow) {
    if (flow === 'pressure') return '#0a6fb8';
    if (flow === 'suction')  return '#0ea5e9';
    if (flow === 'waste')    return '#b91c1c';
    return '#9ca3af';
  }

  // --- Components ---
  function drawComponents() {
    if (!project || !project.plumbing) return;
    Object.values(project.plumbing.components).forEach((c) => drawComponent(c));
  }

  function drawComponent(c) {
    const def = Plumbing.componentDef(c.type);
    if (!def) return;
    const g = el('g', {
      class: 'comp' + (selectedComp === c.id ? ' selected' : ''),
      transform: `translate(${c.x}, ${c.y})`,
      'data-comp': c.id,
    });
    // Selection ring
    if (selectedComp === c.id) {
      const r = el('rect', {
        x: -def.size.w / 2 - 6, y: -def.size.h / 2 - 6,
        width: def.size.w + 12, height: def.size.h + 12, rx: 6,
        fill: 'none', stroke: '#0a6fb8', 'stroke-width': 1.6,
        'stroke-dasharray': '3 3',
      });
      g.appendChild(r);
    }

    // Body — clone icon
    const body = el('g', null, def.icon);
    g.appendChild(body);

    // Custom on/off indicator for pump
    if (def.role === 'pump') {
      const on = c.state === 'on';
      g.appendChild(el('circle', {
        cx: def.size.w / 2 - 10, cy: -def.size.h / 2 + 10,
        r: 6, fill: on ? '#15803d' : '#9ca3af', stroke: '#fff', 'stroke-width': 2,
        class: on ? 'pulse-ring' : ''
      }));
    }

    // Valve indicator
    if (def.role === 'valve-multiport') {
      const t = el('text', {
        x: 0, y: 38, 'text-anchor': 'middle',
        'font-family': 'Inter, sans-serif', 'font-size': 8, 'font-weight': '700',
        fill: c.state === 'backwash' ? '#b91c1c' : '#14253b',
      });
      t.textContent = (c.state || 'filter').toUpperCase();
      g.appendChild(t);
    } else if (def.role === 'valve-3way') {
      const handle = el('line', {
        x1: 0, y1: 0,
        x2: c.state === 'b' ? 0 : (c.state === 'a' ? 14 : -14),
        y2: c.state === 'b' ? -14 : 0,
        stroke: '#b91c1c', 'stroke-width': 3, 'stroke-linecap': 'round',
        transform: 'translate(0,0)',
      });
      g.appendChild(handle);
    } else if (def.role === 'valve-2way') {
      const handle = el('rect', {
        x: -2, y: -8, width: 4, height: 16,
        fill: c.state === 'open' ? '#15803d' : '#b91c1c',
        transform: c.state === 'open' ? 'rotate(0)' : 'rotate(90)'
      });
      g.appendChild(handle);
    }

    // Ports
    def.ports.forEach((port) => {
      const portColor = pendingPipe && pendingPipe.compId === c.id && pendingPipe.portId === port.id
        ? '#15803d'
        : portKindColor(port.kind);
      const dot = el('circle', {
        cx: port.x, cy: port.y, r: 5,
        fill: '#fff', stroke: portColor, 'stroke-width': 2,
        class: 'port', 'data-comp': c.id, 'data-port': port.id,
        'data-kind': port.kind, 'data-role': port.role,
      });
      dot.style.cursor = 'crosshair';
      g.appendChild(dot);
    });

    // Label
    const labelText = c.props && c.props.brand ? `${def.label} · ${c.props.brand}` : def.label;
    const lbl = el('text', {
      x: 0, y: def.size.h / 2 + 18, 'text-anchor': 'middle',
      'font-family': 'Inter, sans-serif', 'font-size': 9, fill: '#5a6b81',
    });
    lbl.textContent = labelText;
    g.appendChild(lbl);

    layers.gComps.appendChild(g);
  }

  function portKindColor(kind) {
    if (kind === 'suction') return '#0ea5e9';
    if (kind === 'pressure') return '#0a6fb8';
    if (kind === 'waste') return '#b91c1c';
    return '#5a6b81';
  }

  function drawPendingPipe() {
    if (!pendingPipe || !pendingPipe.cursor) return;
    const a = portCenter(pendingPipe.compId, pendingPipe.portId);
    if (!a) return;
    const b = pendingPipe.cursor;
    const path = `M ${a.x} ${a.y} L ${(a.x + b.x) / 2} ${a.y} L ${(a.x + b.x) / 2} ${b.y} L ${b.x} ${b.y}`;
    layers.gOverlay.appendChild(el('path', {
      d: path, fill: 'none', stroke: '#15803d', 'stroke-width': 2,
      'stroke-dasharray': '4 3', opacity: 0.8,
    }));
  }

  function updatePipeAnimations() {
    if (!svg) return;
    // Cheap update — re-render to keep code simple
    render(project);
  }

  function portCenter(compId, portId) {
    if (!project || !project.plumbing) return null;
    const c = project.plumbing.components[compId];
    if (!c) return null;
    const def = Plumbing.componentDef(c.type);
    if (!def) return null;
    const port = def.ports.find((p) => p.id === portId);
    if (!port) return null;
    return { x: c.x + port.x, y: c.y + port.y };
  }

  // ============================================================
  // Pointer / interactions
  // ============================================================
  function svgPoint(e) {
    const rect = svg.getBoundingClientRect();
    const t = e.touches ? e.touches[0] : e;
    const x = ((t.clientX - rect.left) / rect.width) * viewBox.w + viewBox.x;
    const y = ((t.clientY - rect.top) / rect.height) * viewBox.h + viewBox.y;
    return { x, y };
  }

  function onPointerDown(e) {
    const target = e.target;
    const pt = svgPoint(e);

    // Port click? start a pipe.
    if (target && target.classList && target.classList.contains('port')) {
      const compId = target.getAttribute('data-comp');
      const portId = target.getAttribute('data-port');
      if (pendingPipe) {
        // Complete pipe — but only if connecting different components
        if (pendingPipe.compId !== compId) {
          Plumbing.addPipe(project.plumbing, pendingPipe.compId, pendingPipe.portId, compId, portId);
          onChange();
        }
        pendingPipe = null;
        render(project);
      } else {
        pendingPipe = { compId, portId, cursor: { x: pt.x, y: pt.y } };
        render(project);
      }
      e.preventDefault();
      return;
    }

    // Component click? select + start drag
    const compG = closestComp(target);
    if (compG) {
      const compId = compG.getAttribute('data-comp');
      const c = project.plumbing.components[compId];
      if (!c) return;
      selectedComp = compId;
      onSelect(c);
      dragState = { compId, start: pt, origin: { x: c.x, y: c.y } };
      render(project);
      e.preventDefault();
      return;
    }

    // Otherwise: pan
    if (!pendingPipe) {
      isPanning = true;
      panStart = { ...pt, vbx: viewBox.x, vby: viewBox.y };
    }
  }

  function onPointerMove(e) {
    const pt = svgPoint(e);
    if (pendingPipe) {
      pendingPipe.cursor = pt;
      render(project);
      return;
    }
    if (dragState) {
      const dx = pt.x - dragState.start.x;
      const dy = pt.y - dragState.start.y;
      const c = project.plumbing.components[dragState.compId];
      if (c) {
        c.x = dragState.origin.x + dx;
        c.y = dragState.origin.y + dy;
        render(project);
      }
      return;
    }
    if (isPanning && panStart) {
      const dx = pt.x - panStart.x;
      const dy = pt.y - panStart.y;
      viewBox.x = panStart.vbx - dx;
      viewBox.y = panStart.vby - dy;
      svg.setAttribute('viewBox', `${viewBox.x} ${viewBox.y} ${viewBox.w} ${viewBox.h}`);
    }
  }

  function onPointerUp() {
    if (dragState) {
      onChange();
      dragState = null;
    }
    isPanning = false;
    panStart = null;
  }

  function onCanvasClick(e) {
    const target = e.target;
    // Deselect when clicking empty canvas
    if (target === svg || (target.tagName === 'rect' && target.getAttribute('fill') && target.getAttribute('fill').indexOf('grid') >= 0)) {
      if (!pendingPipe && !dragState) {
        if (selectedComp) {
          selectedComp = null;
          onSelect(null);
          render(project);
        }
      }
    }
  }

  function onWheel(e) {
    e.preventDefault();
    const factor = e.deltaY > 0 ? 1.12 : 0.9;
    const pt = svgPoint(e);
    const newW = viewBox.w * factor;
    const newH = viewBox.h * factor;
    // zoom around cursor
    viewBox.x = pt.x - (pt.x - viewBox.x) * (newW / viewBox.w);
    viewBox.y = pt.y - (pt.y - viewBox.y) * (newH / viewBox.h);
    viewBox.w = Math.max(400, Math.min(4000, newW));
    viewBox.h = Math.max(250, Math.min(2500, newH));
    svg.setAttribute('viewBox', `${viewBox.x} ${viewBox.y} ${viewBox.w} ${viewBox.h}`);
  }

  function closestComp(node) {
    while (node && node !== svg) {
      if (node.classList && node.classList.contains('comp')) return node;
      node = node.parentNode;
    }
    return null;
  }

  function cancelPendingPipe() {
    pendingPipe = null;
    render(project);
  }

  // ============================================================
  // Palette drop
  // ============================================================
  function onDrop(e) {
    e.preventDefault();
    const type = e.dataTransfer.getData('text/plain');
    if (!type || !Plumbing.componentDef(type)) return;
    const pt = svgPoint(e);
    if (!project.plumbing) project.plumbing = Plumbing.emptyNetwork();
    Plumbing.addComponent(project.plumbing, type, pt.x, pt.y);
    onChange();
    render(project);
  }

  // ============================================================
  // External controls
  // ============================================================
  PlumbingView.fit = function () {
    viewBox = { x: 0, y: 0, w: 1200, h: 700 };
    if (svg) svg.setAttribute('viewBox', `${viewBox.x} ${viewBox.y} ${viewBox.w} ${viewBox.h}`);
    render(project);
  };

  PlumbingView.deleteSelected = function () {
    if (!selectedComp || !project) return;
    Plumbing.removeComponent(project.plumbing, selectedComp);
    selectedComp = null;
    onSelect(null);
    onChange();
    render(project);
  };

  PlumbingView.selectedComponent = function () {
    if (!selectedComp || !project) return null;
    return project.plumbing.components[selectedComp];
  };

  PlumbingView.toPng = function () {
    return new Promise((resolve) => {
      if (!svg) return resolve(null);
      const xml = new XMLSerializer().serializeToString(svg);
      const blob = new Blob([xml], { type: 'image/svg+xml' });
      const url = URL.createObjectURL(blob);
      const img = new Image();
      img.onload = () => {
        const c = document.createElement('canvas');
        c.width = (svg.clientWidth || 1200) * 2;
        c.height = (svg.clientHeight || 700) * 2;
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

  global.PlumbingView = PlumbingView;
})(window);
