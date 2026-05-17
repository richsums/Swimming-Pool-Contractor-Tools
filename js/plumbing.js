/* ============================================================
   plumbing.js — Pool plumbing visualizer.
   - Drag-drop component palette
   - Component library: pump, filter, valves, heater, salt cell,
     skimmer, drains, returns, jets, waterfall
   - Click-to-connect pipe drawing between ports
   - Flow simulation: BFS from pump through open valves
   - Animated water flow when pump runs
   - Backwash mode via multiport valve
   - Equipment specs (brand/model/GPM) per component
   - Saves/loads with the project
   ============================================================ */
(function (global) {
  'use strict';

  const NS = 'http://www.w3.org/2000/svg';
  const Plumbing = {};

  // ============================================================
  // Component library
  // ============================================================
  // Each entry defines:
  //   icon: SVG markup centered on (0,0) drawn at component size
  //   ports: [{id, label, kind: 'suction'|'pressure'|'either', x, y, role: 'in'|'out'|'waste'}]
  //   size: bounding box for hit-testing/move
  //   defaultProps: editable spec fields
  //   category: palette grouping
  //   role: 'source' | 'sink' | 'pump' | 'filter' | 'valve' | 'pass-through'
  //   valve / pump state: optional flag to render state controls
  const LIB = {
    skimmer: {
      label: 'Skimmer',
      category: 'Sources',
      role: 'source',
      size: { w: 56, h: 38 },
      icon: `<rect x="-28" y="-19" width="56" height="38" rx="6" fill="#cfe7f2" stroke="#0a6fb8" stroke-width="1.6"/>
             <circle cx="0" cy="-4" r="9" fill="#fff" stroke="#0a6fb8" stroke-width="1.4"/>
             <text x="0" y="14" text-anchor="middle" font-size="9" font-family="Inter,sans-serif" fill="#0a6fb8" font-weight="700">SKIMMER</text>`,
      ports: [{ id: 'out', label: 'Outlet', kind: 'suction', x: 28, y: 0, role: 'out' }],
      defaultProps: { brand: '', model: '', notes: '' },
    },
    mainDrain: {
      label: 'Main Drain',
      category: 'Sources',
      role: 'source',
      size: { w: 50, h: 40 },
      icon: `<circle cx="0" cy="0" r="18" fill="#cfe7f2" stroke="#0a6fb8" stroke-width="1.6"/>
             <circle cx="-8" cy="0" r="3" fill="#0a6fb8"/>
             <circle cx="8" cy="0" r="3" fill="#0a6fb8"/>
             <text x="0" y="3" text-anchor="middle" font-size="7" font-family="Inter,sans-serif" fill="#0a6fb8" font-weight="700">MD</text>`,
      ports: [{ id: 'out', label: 'Outlet', kind: 'suction', x: 18, y: 0, role: 'out' }],
      defaultProps: { brand: '', model: '', dualMainDrain: true, vgbCompliant: true, notes: '' },
    },
    spaDrain: {
      label: 'Spa Drain',
      category: 'Sources',
      role: 'source',
      size: { w: 46, h: 34 },
      icon: `<rect x="-22" y="-14" width="44" height="28" rx="4" fill="#cfe7f2" stroke="#0a6fb8" stroke-width="1.6"/>
             <text x="0" y="3" text-anchor="middle" font-size="9" font-family="Inter,sans-serif" fill="#0a6fb8" font-weight="700">SPA DR</text>`,
      ports: [{ id: 'out', label: 'Outlet', kind: 'suction', x: 22, y: 0, role: 'out' }],
      defaultProps: { brand: '', model: '', notes: '' },
    },
    pump: {
      label: 'Pump',
      category: 'Equipment',
      role: 'pump',
      size: { w: 80, h: 60 },
      icon: `<rect x="-40" y="-26" width="80" height="50" rx="6" fill="#fde7d8" stroke="#b45309" stroke-width="1.6"/>
             <circle cx="-10" cy="-2" r="14" fill="#fff" stroke="#b45309" stroke-width="1.4"/>
             <path d="M -10 -10 L -3 -2 L -10 6 L -17 -2 Z" fill="#b45309"/>
             <rect x="6" y="-12" width="24" height="20" rx="3" fill="#fff" stroke="#b45309" stroke-width="1.2"/>
             <text x="18" y="2" text-anchor="middle" font-size="8" font-family="Inter,sans-serif" fill="#b45309" font-weight="700">M</text>
             <text x="0" y="20" text-anchor="middle" font-size="9" font-family="Inter,sans-serif" fill="#b45309" font-weight="700">PUMP</text>`,
      ports: [
        { id: 'in', label: 'Suction', kind: 'suction', x: -40, y: -2, role: 'in' },
        { id: 'out', label: 'Discharge', kind: 'pressure', x: 40, y: -2, role: 'out' },
      ],
      defaultProps: { brand: 'Pentair', model: 'IntelliFlo VSF', hp: 1.5, type: 'variable-speed', voltage: 230, notes: '' },
      hasState: true,
    },
    filter: {
      label: 'Filter',
      category: 'Equipment',
      role: 'filter',
      size: { w: 60, h: 80 },
      icon: `<rect x="-22" y="-30" width="44" height="56" rx="22" fill="#e5e9f0" stroke="#5a6b81" stroke-width="1.6"/>
             <ellipse cx="0" cy="-30" rx="22" ry="6" fill="#cfd6e0" stroke="#5a6b81" stroke-width="1.4"/>
             <text x="0" y="2" text-anchor="middle" font-size="9" font-family="Inter,sans-serif" fill="#5a6b81" font-weight="700">FILTER</text>
             <text x="0" y="16" text-anchor="middle" font-size="7" font-family="Inter,sans-serif" fill="#5a6b81">DE / Cart / Sand</text>`,
      ports: [
        { id: 'in', label: 'Inlet', kind: 'pressure', x: -22, y: -10, role: 'in' },
        { id: 'out', label: 'Outlet', kind: 'pressure', x: 22, y: -10, role: 'out' },
      ],
      defaultProps: { brand: 'Pentair', model: 'Clean & Clear Plus 320', type: 'cartridge', area: 320, notes: '' },
    },
    multiportValve: {
      label: 'Multiport Valve',
      category: 'Valves',
      role: 'valve-multiport',
      size: { w: 62, h: 62 },
      icon: `<circle cx="0" cy="0" r="22" fill="#fff" stroke="#14253b" stroke-width="1.8"/>
             <circle cx="0" cy="0" r="12" fill="#e6ebf2" stroke="#14253b" stroke-width="1.2"/>
             <text x="0" y="3" text-anchor="middle" font-size="9" font-family="Inter,sans-serif" fill="#14253b" font-weight="700">MPV</text>`,
      ports: [
        { id: 'in', label: 'Pump In', kind: 'pressure', x: -22, y: 0, role: 'in' },
        { id: 'out', label: 'Filter / Return', kind: 'pressure', x: 22, y: 0, role: 'out' },
        { id: 'waste', label: 'Waste', kind: 'pressure', x: 0, y: 22, role: 'waste' },
      ],
      defaultProps: { brand: 'Pentair', model: '2" Side Mount', notes: '' },
      hasState: true,
      // valve state: 'filter' | 'backwash' | 'rinse' | 'recirculate' | 'waste' | 'closed'
    },
    valve3way: {
      label: '3-Way Valve',
      category: 'Valves',
      role: 'valve-3way',
      size: { w: 50, h: 50 },
      icon: `<rect x="-18" y="-18" width="36" height="36" rx="6" fill="#fff" stroke="#14253b" stroke-width="1.6"/>
             <path d="M -16 0 L 0 0 L 0 -16" fill="none" stroke="#14253b" stroke-width="2.2"/>
             <circle cx="0" cy="0" r="3" fill="#14253b"/>
             <text x="0" y="14" text-anchor="middle" font-size="8" font-family="Inter,sans-serif" fill="#14253b" font-weight="700">3W</text>`,
      ports: [
        { id: 'common', label: 'Common', kind: 'either', x: -18, y: 0, role: 'in' },
        { id: 'a', label: 'Port A', kind: 'either', x: 18, y: 0, role: 'out' },
        { id: 'b', label: 'Port B', kind: 'either', x: 0, y: -18, role: 'out' },
      ],
      defaultProps: { brand: 'Jandy', model: 'Never Lube 3-Way', notes: '' },
      hasState: true,
      // valve state: 'a' | 'b' | 'both' | 'closed'
    },
    valve2way: {
      label: '2-Way Ball Valve',
      category: 'Valves',
      role: 'valve-2way',
      size: { w: 44, h: 28 },
      icon: `<rect x="-18" y="-10" width="36" height="20" rx="4" fill="#fff" stroke="#14253b" stroke-width="1.6"/>
             <circle cx="0" cy="0" r="6" fill="#14253b"/>
             <text x="0" y="20" text-anchor="middle" font-size="7" font-family="Inter,sans-serif" fill="#14253b" font-weight="700">2W</text>`,
      ports: [
        { id: 'in', label: 'In', kind: 'either', x: -18, y: 0, role: 'in' },
        { id: 'out', label: 'Out', kind: 'either', x: 18, y: 0, role: 'out' },
      ],
      defaultProps: { brand: 'Jandy', model: 'Never Lube 2-Way', notes: '' },
      hasState: true,
      // valve state: 'open' | 'closed'
    },
    checkValve: {
      label: 'Check Valve',
      category: 'Valves',
      role: 'check',
      size: { w: 50, h: 24 },
      icon: `<rect x="-20" y="-10" width="40" height="20" rx="3" fill="#fff" stroke="#14253b" stroke-width="1.4"/>
             <path d="M -8 0 L 8 0" stroke="#14253b" stroke-width="2"/>
             <path d="M 4 -5 L 8 0 L 4 5 Z" fill="#14253b"/>
             <text x="0" y="18" text-anchor="middle" font-size="7" font-family="Inter,sans-serif" fill="#14253b">CHK</text>`,
      ports: [
        { id: 'in', label: 'In', kind: 'either', x: -20, y: 0, role: 'in' },
        { id: 'out', label: 'Out', kind: 'either', x: 20, y: 0, role: 'out' },
      ],
      defaultProps: { brand: '', model: '', notes: '' },
    },
    heater: {
      label: 'Heater',
      category: 'Equipment',
      role: 'pass-through',
      size: { w: 70, h: 60 },
      icon: `<rect x="-32" y="-26" width="64" height="50" rx="4" fill="#fff" stroke="#b91c1c" stroke-width="1.6"/>
             <path d="M -20 8 Q -16 -4 -12 8 Q -8 -4 -4 8 Q 0 -4 4 8 Q 8 -4 12 8 Q 16 -4 20 8" fill="none" stroke="#b91c1c" stroke-width="1.4"/>
             <text x="0" y="-12" text-anchor="middle" font-size="9" font-family="Inter,sans-serif" fill="#b91c1c" font-weight="700">HEATER</text>`,
      ports: [
        { id: 'in', label: 'In', kind: 'pressure', x: -32, y: -6, role: 'in' },
        { id: 'out', label: 'Out', kind: 'pressure', x: 32, y: -6, role: 'out' },
      ],
      defaultProps: { brand: 'Raypak', model: '406A', btu: 406000, fuel: 'natural-gas', notes: '' },
    },
    saltCell: {
      label: 'Salt Chlorine Cell',
      category: 'Equipment',
      role: 'pass-through',
      size: { w: 70, h: 36 },
      icon: `<rect x="-32" y="-15" width="64" height="30" rx="14" fill="#e6f6f1" stroke="#15803d" stroke-width="1.6"/>
             <text x="0" y="2" text-anchor="middle" font-size="9" font-family="Inter,sans-serif" fill="#15803d" font-weight="700">SALT CELL</text>`,
      ports: [
        { id: 'in', label: 'In', kind: 'pressure', x: -32, y: 0, role: 'in' },
        { id: 'out', label: 'Out', kind: 'pressure', x: 32, y: 0, role: 'out' },
      ],
      defaultProps: { brand: 'Pentair', model: 'IntelliChlor IC40', poolGallons: 40000, notes: '' },
    },
    uv: {
      label: 'UV Sterilizer',
      category: 'Equipment',
      role: 'pass-through',
      size: { w: 70, h: 30 },
      icon: `<rect x="-32" y="-12" width="64" height="24" rx="3" fill="#ede9fe" stroke="#6d28d9" stroke-width="1.6"/>
             <text x="0" y="2" text-anchor="middle" font-size="9" font-family="Inter,sans-serif" fill="#6d28d9" font-weight="700">UV</text>`,
      ports: [
        { id: 'in', label: 'In', kind: 'pressure', x: -32, y: 0, role: 'in' },
        { id: 'out', label: 'Out', kind: 'pressure', x: 32, y: 0, role: 'out' },
      ],
      defaultProps: { brand: '', model: '', notes: '' },
    },
    return: {
      label: 'Wall Return',
      category: 'Returns',
      role: 'sink',
      size: { w: 40, h: 28 },
      icon: `<rect x="-18" y="-12" width="36" height="24" rx="4" fill="#dcf2fb" stroke="#0a6fb8" stroke-width="1.6"/>
             <circle cx="0" cy="0" r="5" fill="#0a6fb8"/>
             <text x="0" y="20" text-anchor="middle" font-size="7" font-family="Inter,sans-serif" fill="#0a6fb8" font-weight="700">RTN</text>`,
      ports: [{ id: 'in', label: 'Inlet', kind: 'pressure', x: -18, y: 0, role: 'in' }],
      defaultProps: { brand: '', model: '', flowGpm: 25, notes: '' },
    },
    laminarJet: {
      label: 'Laminar Jet',
      category: 'Returns',
      role: 'sink',
      size: { w: 50, h: 36 },
      icon: `<rect x="-20" y="-14" width="40" height="22" rx="3" fill="#e0f2fe" stroke="#0a6fb8" stroke-width="1.6"/>
             <path d="M -10 10 Q -5 20 0 26 Q 5 20 10 10" fill="none" stroke="#0a6fb8" stroke-width="1.6"/>
             <text x="0" y="0" text-anchor="middle" font-size="8" font-family="Inter,sans-serif" fill="#0a6fb8" font-weight="700">LAMINAR</text>`,
      ports: [{ id: 'in', label: 'Inlet', kind: 'pressure', x: -20, y: 0, role: 'in' }],
      defaultProps: { brand: 'Pentair', model: 'Magicstream Laminar', hasLED: true, notes: '' },
    },
    spaJet: {
      label: 'Spa Jet',
      category: 'Returns',
      role: 'sink',
      size: { w: 40, h: 26 },
      icon: `<circle cx="0" cy="0" r="13" fill="#dcf2fb" stroke="#0a6fb8" stroke-width="1.6"/>
             <circle cx="0" cy="0" r="5" fill="#0a6fb8"/>
             <text x="0" y="20" text-anchor="middle" font-size="7" font-family="Inter,sans-serif" fill="#0a6fb8" font-weight="700">SPA</text>`,
      ports: [{ id: 'in', label: 'Inlet', kind: 'pressure', x: -13, y: 0, role: 'in' }],
      defaultProps: { brand: '', model: '', notes: '' },
    },
    waterfall: {
      label: 'Waterfall / Sheer',
      category: 'Returns',
      role: 'sink',
      size: { w: 60, h: 36 },
      icon: `<rect x="-26" y="-14" width="52" height="22" rx="3" fill="#e0f2fe" stroke="#0a6fb8" stroke-width="1.6"/>
             <path d="M -20 10 L -10 22 M -10 10 L 0 22 M 0 10 L 10 22 M 10 10 L 20 22" stroke="#0a6fb8" stroke-width="1.4"/>
             <text x="0" y="0" text-anchor="middle" font-size="8" font-family="Inter,sans-serif" fill="#0a6fb8" font-weight="700">WATERFALL</text>`,
      ports: [{ id: 'in', label: 'Inlet', kind: 'pressure', x: -26, y: 0, role: 'in' }],
      defaultProps: { brand: '', model: '', notes: '' },
    },
    autofill: {
      label: 'Auto Fill',
      category: 'Sources',
      role: 'source',
      size: { w: 50, h: 26 },
      icon: `<rect x="-22" y="-10" width="44" height="20" rx="3" fill="#fefce8" stroke="#a16207" stroke-width="1.4"/>
             <text x="0" y="3" text-anchor="middle" font-size="8" font-family="Inter,sans-serif" fill="#a16207" font-weight="700">AUTOFILL</text>`,
      ports: [{ id: 'out', label: 'Outlet', kind: 'pressure', x: 22, y: 0, role: 'out' }],
      defaultProps: { brand: '', model: '', notes: '' },
    },
    wasteLine: {
      label: 'Waste Line',
      category: 'Returns',
      role: 'sink',
      size: { w: 56, h: 26 },
      icon: `<rect x="-26" y="-10" width="52" height="20" rx="3" fill="#fee2e2" stroke="#b91c1c" stroke-width="1.4"/>
             <text x="0" y="3" text-anchor="middle" font-size="8" font-family="Inter,sans-serif" fill="#b91c1c" font-weight="700">WASTE / DECK</text>`,
      ports: [{ id: 'in', label: 'Inlet', kind: 'waste', x: -26, y: 0, role: 'in' }],
      defaultProps: { brand: '', model: '', notes: '' },
    },
  };

  Plumbing.LIB = LIB;

  // ============================================================
  // Default network helpers — empty by default; user builds it.
  // ============================================================
  Plumbing.emptyNetwork = function () {
    return {
      components: {},   // id -> { id, type, x, y, props, state }
      pipes: {},        // id -> { id, fromComp, fromPort, toComp, toPort, suction|pressure|waste }
      system: {
        pumpOn: false,
        mpvPosition: 'filter', // default state for any new MPV
        valvePositions: {},    // componentId -> state
      },
    };
  };

  // ============================================================
  // ID + utilities
  // ============================================================
  function compId() { return 'c_' + Math.random().toString(36).slice(2, 8); }
  function pipeId() { return 'p_' + Math.random().toString(36).slice(2, 8); }

  Plumbing.addComponent = function (network, type, x, y) {
    const def = LIB[type];
    if (!def) return null;
    const id = compId();
    const comp = {
      id,
      type,
      x, y,
      label: def.label,
      props: JSON.parse(JSON.stringify(def.defaultProps || {})),
    };
    if (def.role === 'valve-multiport') comp.state = 'filter';
    else if (def.role === 'valve-3way') comp.state = 'a';
    else if (def.role === 'valve-2way') comp.state = 'open';
    else if (def.role === 'pump') comp.state = 'off';
    network.components[id] = comp;
    return comp;
  };

  Plumbing.removeComponent = function (network, id) {
    delete network.components[id];
    // remove any pipes referencing it
    Object.keys(network.pipes).forEach((pid) => {
      const p = network.pipes[pid];
      if (p.fromComp === id || p.toComp === id) delete network.pipes[pid];
    });
  };

  Plumbing.addPipe = function (network, fromComp, fromPort, toComp, toPort) {
    // prevent duplicate / self
    if (fromComp === toComp) return null;
    for (const p of Object.values(network.pipes)) {
      if (
        (p.fromComp === fromComp && p.fromPort === fromPort && p.toComp === toComp && p.toPort === toPort) ||
        (p.fromComp === toComp && p.fromPort === toPort && p.toComp === fromComp && p.toPort === fromPort)
      ) return null;
    }
    const id = pipeId();
    network.pipes[id] = { id, fromComp, fromPort, toComp, toPort };
    return network.pipes[id];
  };

  Plumbing.removePipe = function (network, id) { delete network.pipes[id]; };

  Plumbing.componentDef = function (type) { return LIB[type]; };

  Plumbing.portPosition = function (component) {
    return function (portId) {
      const def = LIB[component.type];
      if (!def) return { x: component.x, y: component.y };
      const port = def.ports.find((p) => p.id === portId);
      if (!port) return { x: component.x, y: component.y };
      return { x: component.x + port.x, y: component.y + port.y };
    };
  };

  // ============================================================
  // Flow simulation.
  // Strategy:
  //   - When pump is OFF: no flow.
  //   - When pump is ON: walk from pump.suction port outward across
  //     pipes & open valves to find SOURCE nodes; mark those pipes
  //     as "suction" flow. Walk from pump.discharge outward to find
  //     SINK nodes; mark those pipes as "pressure" flow.
  //   - A multiport valve in 'backwash' inverts the flow direction
  //     through the filter and routes filter outlet → MPV → waste.
  //   - 'recirculate' bypasses the filter (no flow through filter).
  //   - 'closed' / 'waste'-only paths are handled per state.
  // The simulation produces per-pipe state: 'suction', 'pressure',
  // 'waste', or null. CSS animates non-null pipes.
  // ============================================================
  Plumbing.simulate = function (network) {
    const pipeStates = {}; // pipeId -> 'suction'|'pressure'|'waste'|null
    Object.keys(network.pipes).forEach((pid) => { pipeStates[pid] = null; });

    if (!network.system.pumpOn) return { pipeStates, alerts: [] };

    // Find a pump
    const pumps = Object.values(network.components).filter((c) => LIB[c.type] && LIB[c.type].role === 'pump');
    if (!pumps.length) return { pipeStates, alerts: ['No pump on the system. Pump cannot run.'] };
    const pump = pumps[0];

    // Build adjacency map by component+port
    const adj = {}; // key "compId|portId" -> [{otherComp, otherPort, pipeId}]
    function key(c, p) { return c + '|' + p; }
    Object.values(network.pipes).forEach((p) => {
      const a = key(p.fromComp, p.fromPort);
      const b = key(p.toComp, p.toPort);
      (adj[a] = adj[a] || []).push({ otherComp: p.toComp, otherPort: p.toPort, pipeId: p.id });
      (adj[b] = adj[b] || []).push({ otherComp: p.fromComp, otherPort: p.fromPort, pipeId: p.id });
    });

    function comp(id) { return network.components[id]; }

    /**
     * walk — BFS from a starting (compId, portId) outward. At each node
     * we decide which of its other ports the flow can continue through,
     * based on valve state. Returns the set of pipeIds traversed and
     * the kind of flow ('suction'|'pressure') to record on them.
     */
    function walk(startComp, startPort, flowKind) {
      const queue = [{ c: startComp, p: startPort }];
      const visitedPipes = new Set();
      const reached = new Set();
      const sinksReached = new Set();
      const sourcesReached = new Set();

      while (queue.length) {
        const node = queue.shift();
        const myKey = key(node.c, node.p);
        const neighbors = adj[myKey] || [];

        for (const n of neighbors) {
          if (visitedPipes.has(n.pipeId)) continue;
          visitedPipes.add(n.pipeId);
          pipeStates[n.pipeId] = flowKind;

          const nextComp = comp(n.otherComp);
          if (!nextComp) continue;
          const nextDef = LIB[nextComp.type];
          if (!nextDef) continue;

          // record source/sink hits
          if (nextDef.role === 'source') sourcesReached.add(nextComp.id);
          if (nextDef.role === 'sink')   sinksReached.add(nextComp.id);

          // Determine which other ports we can pass through.
          const passOut = continuationPorts(nextComp, nextDef, n.otherPort, flowKind, network);
          for (const out of passOut) {
            queue.push({ c: nextComp.id, p: out });
          }
        }
      }
      return { visitedPipes, sourcesReached, sinksReached };
    }

    /**
     * continuationPorts — given that flow entered nextComp at port
     * `enteredPort`, which other ports can the flow exit through?
     * Encodes valve state semantics.
     */
    function continuationPorts(nextComp, def, enteredPort, flowKind, net) {
      const role = def.role;
      const otherPorts = def.ports.filter((p) => p.id !== enteredPort).map((p) => p.id);

      if (role === 'source' || role === 'sink') return [];

      if (role === 'pump') {
        // Flow does not cross the pump in this simulation; the pump is
        // the origin of both the suction-side and pressure-side walks.
        return [];
      }

      if (role === 'pass-through' || role === 'filter' || role === 'check') {
        // For backwash mode through the multiport, the filter flow direction
        // is reversed but we don't model it as a different graph — we just
        // allow flow to traverse the filter the other way.
        return otherPorts;
      }

      if (role === 'valve-2way') {
        if (nextComp.state === 'open') return otherPorts;
        return [];
      }
      if (role === 'valve-3way') {
        // common <-> selected port
        const s = nextComp.state;
        if (s === 'closed') return [];
        if (s === 'both') return otherPorts;
        if (enteredPort === 'common') return [s];      // 'a' or 'b'
        if (enteredPort === s) return ['common'];
        return [];
      }
      if (role === 'valve-multiport') {
        const s = nextComp.state;
        if (s === 'closed') return [];
        // FILTER position: in <-> out, no waste
        if (s === 'filter') {
          if (enteredPort === 'in') return ['out'];
          if (enteredPort === 'out') return ['in'];
          return [];
        }
        // BACKWASH: in -> filter side (reverses filter), and filter side -> waste
        // We model this as: in <-> out and out <-> waste (so flow goes in -> out -> waste)
        if (s === 'backwash') {
          if (enteredPort === 'in') return ['out'];
          if (enteredPort === 'out') return ['waste', 'in'];
          if (enteredPort === 'waste') return ['out'];
          return [];
        }
        // RINSE: same as backwash routing but normal filter direction (in -> out -> waste through MPV)
        if (s === 'rinse') {
          if (enteredPort === 'in') return ['out'];
          if (enteredPort === 'out') return ['waste', 'in'];
          if (enteredPort === 'waste') return ['out'];
          return [];
        }
        // RECIRCULATE: bypass filter, in <-> out via the valve internally; filter not engaged
        if (s === 'recirculate') {
          if (enteredPort === 'in') return ['out'];
          if (enteredPort === 'out') return ['in'];
          return [];
        }
        // WASTE: in -> waste, filter bypassed
        if (s === 'waste') {
          if (enteredPort === 'in') return ['waste'];
          if (enteredPort === 'waste') return ['in'];
          return [];
        }
        return [];
      }

      // default: pass through
      return otherPorts;
    }

    // Walk both sides of the pump
    const def = LIB[pump.type];
    const suctionPort = def.ports.find((p) => p.role === 'in').id;
    const dischargePort = def.ports.find((p) => p.role === 'out').id;

    const suc = walk(pump.id, suctionPort, 'suction');
    const pres = walk(pump.id, dischargePort, 'pressure');

    // Mark any pipe that reached a waste-line sink as waste flow.
    const wasteSinkIds = new Set(
      Object.values(network.components).filter((c) => c.type === 'wasteLine').map((c) => c.id)
    );
    Object.values(network.pipes).forEach((p) => {
      if (pipeStates[p.id] === 'pressure' && wasteSinkIds.size) {
        // If this pipe connects to a waste sink, mark waste
        if (wasteSinkIds.has(p.fromComp) || wasteSinkIds.has(p.toComp)) {
          pipeStates[p.id] = 'waste';
        }
      }
    });

    // Alerts (live in-canvas hints)
    const alerts = [];
    if (suc.sourcesReached.size === 0) alerts.push('Pump suction has no source — connect at least one skimmer or main drain.');
    if (pres.sinksReached.size === 0) alerts.push('Pump discharge has no return path — connect a wall return, jet, or waterfall.');
    // backwash sanity: MPV in backwash needs a waste line
    const mpvBackwash = Object.values(network.components).find(
      (c) => LIB[c.type] && LIB[c.type].role === 'valve-multiport' && c.state === 'backwash'
    );
    if (mpvBackwash) {
      const hasWasteSink = wasteSinkIds.size > 0;
      if (!hasWasteSink) alerts.push('Multiport valve is set to backwash but no waste line is connected. Water has nowhere to go.');
    }

    return { pipeStates, alerts };
  };

  global.Plumbing = Plumbing;
})(window);
