/* ============================================================
   app.js — main application controller.
   Wires UI, model, modules, and routing together.
   ============================================================ */
(function () {
  'use strict';

  const STEPS = ['setup', 'sketch', 'site', 'design', '3d', 'concerns', 'export'];

  // --- App state ---
  const App = {
    currentStep: 'welcome', // welcome or one of STEPS
    project: null,
    findings: [],
    mapInitialized: false,
    threeInitialized: false,
  };

  // ============================================================
  // Boot
  // ============================================================
  document.addEventListener('DOMContentLoaded', () => {
    bindGlobalUI();
    bindWelcome();
    bindSetup();
    bindSketch();
    bindSite();
    bindDesign();
    bindThree();
    bindConcerns();
    bindExport();
    bindStepper();
    bindModals();
    bindKeyboard();

    // Resume previous active project if any
    const active = Model.active();
    if (active) {
      App.project = active;
      refreshProjectBar();
      unlockStepper();
      go('setup');
      hydrateSetupForm();
    } else {
      go('welcome');
    }
  });

  // ============================================================
  // Stepper / routing
  // ============================================================
  function go(step) {
    const views = U.$$('.view');
    views.forEach((v) => v.classList.remove('view-active'));
    const target = U.$('#view-' + step);
    if (target) target.classList.add('view-active');

    U.$$('.step').forEach((b) => {
      b.classList.toggle('active', b.dataset.step === step);
      if (STEPS.indexOf(b.dataset.step) < STEPS.indexOf(step)) {
        b.classList.add('completed');
      } else {
        b.classList.remove('completed');
      }
    });

    App.currentStep = step;

    // Lifecycle hooks per step
    if (step === 'site') initSiteIfNeeded();
    if (step === 'design') renderDesign();
    if (step === '3d') initThreeIfNeeded();
    if (step === 'concerns') runRules();

    // Focus main for screen readers
    const main = U.$('#main-content');
    if (main) main.focus({ preventScroll: true });
  }

  function unlockStepper() {
    U.$$('.step').forEach((b) => (b.disabled = false));
    U.$('#btn-save-revision').disabled = false;
    U.$('#btn-export').disabled = false;
  }
  function lockStepper() {
    U.$$('.step').forEach((b) => (b.disabled = true));
    U.$('#btn-save-revision').disabled = true;
    U.$('#btn-export').disabled = true;
  }

  function bindStepper() {
    U.$$('.step').forEach((b) => {
      b.addEventListener('click', () => {
        if (!App.project && b.dataset.step !== 'welcome') return;
        go(b.dataset.step);
      });
    });
    U.$$('[data-goto]').forEach((b) => {
      b.addEventListener('click', () => {
        const step = b.dataset.goto;
        // Persist intermediate state where appropriate
        if (App.currentStep === 'design') captureDesignToModel();
        go(step);
      });
    });
  }

  // ============================================================
  // Global UI: top nav + project bar + welcome cards
  // ============================================================
  function bindGlobalUI() {
    U.$('#btn-new-project').addEventListener('click', () => {
      App.project = Model.create({ client: '', address: '' });
      refreshProjectBar();
      unlockStepper();
      go('setup');
      hydrateSetupForm();
    });
    U.$('#btn-projects').addEventListener('click', openProjectsModal);
    U.$('#btn-help').addEventListener('click', () => openModal('modal-help'));
    U.$('#btn-save-revision').addEventListener('click', saveRevision);
    U.$('#btn-export').addEventListener('click', () => go('export'));
  }

  function bindWelcome() {
    U.$('#card-new').addEventListener('click', () => U.$('#btn-new-project').click());
    U.$('#card-open').addEventListener('click', openProjectsModal);
    U.$('#card-demo').addEventListener('click', () => {
      const sample = Model.sample();
      App.project = Model.create(sample);
      refreshProjectBar();
      unlockStepper();
      hydrateSetupForm();
      // Pre-fill safety so the demo is meaningful
      App.project.model.safety.features = ['fence', 'self-closing-doors'];
      Model.save(App.project);
      go('setup');
      U.toast('Loaded sample California residential project.', 'success');
    });
  }

  function refreshProjectBar() {
    if (!App.project) {
      U.$('#active-project-name').textContent = 'No project loaded';
      U.$('#active-project-rev').textContent = '';
      lockStepper();
      return;
    }
    const p = App.project;
    U.$('#active-project-name').textContent =
      (p.client || 'Untitled') + (p.address ? ' · ' + p.address : '');
    U.$('#active-project-rev').textContent = p.currentRevision || 'draft';
  }

  // ============================================================
  // Step 1: Project setup
  // ============================================================
  function bindSetup() {
    const form = U.$('#form-setup');
    form.addEventListener('submit', (e) => {
      e.preventDefault();
      if (!App.project) App.project = Model.create({});
      const data = new FormData(form);
      Object.assign(App.project, {
        client: data.get('client').trim(),
        address: data.get('address').trim(),
        apn: data.get('apn').trim(),
        estimator: data.get('estimator').trim(),
        notes: data.get('notes').trim(),
        poolType: data.get('poolType'),
      });
      if (!App.project.client) {
        markInvalid('f-client'); return;
      }
      if (!App.project.address) {
        markInvalid('f-address'); return;
      }
      Model.save(App.project);
      refreshProjectBar();
      unlockStepper();
      U.toast('Project saved.', 'success');
      go('sketch');
    });
    U.$('#btn-cancel-setup').addEventListener('click', () => go('welcome'));
  }
  function hydrateSetupForm() {
    if (!App.project) return;
    U.$('#f-client').value = App.project.client || '';
    U.$('#f-address').value = App.project.address || '';
    U.$('#f-apn').value = App.project.apn || '';
    U.$('#f-estimator').value = App.project.estimator || '';
    U.$('#f-pooltype').value = App.project.poolType || 'gunite';
    U.$('#f-notes').value = App.project.notes || '';
  }
  function markInvalid(id) {
    const el = U.$('#' + id);
    el.setAttribute('aria-invalid', 'true');
    el.focus();
    setTimeout(() => el.removeAttribute('aria-invalid'), 3000);
  }

  // ============================================================
  // Step 2: Sketch upload + interpretation
  // ============================================================
  function bindSketch() {
    const dz = U.$('#dropzone');
    const file = U.$('#sketch-file');
    dz.addEventListener('click', (e) => {
      if (e.target.tagName === 'BUTTON') return;
      file.click();
    });
    dz.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        file.click();
      }
    });
    dz.addEventListener('dragover', (e) => {
      e.preventDefault();
      dz.classList.add('is-drag');
    });
    dz.addEventListener('dragleave', () => dz.classList.remove('is-drag'));
    dz.addEventListener('drop', (e) => {
      e.preventDefault();
      dz.classList.remove('is-drag');
      const f = e.dataTransfer.files && e.dataTransfer.files[0];
      if (f) handleSketchFile(f);
    });
    file.addEventListener('change', (e) => {
      const f = e.target.files && e.target.files[0];
      if (f) handleSketchFile(f);
    });

    U.$('#btn-load-demo-sketch').addEventListener('click', (e) => {
      e.stopPropagation();
      const url = Sketch.sampleDataUrl();
      setSketchImage(url);
      if (App.project) {
        App.project.sketch.imageDataUrl = url;
        Model.save(App.project);
      }
    });

    U.$('#btn-sketch-rotate').addEventListener('click', () => {
      if (!App.project) return;
      App.project.sketch.rotationDeg = ((App.project.sketch.rotationDeg || 0) + 90) % 360;
      Model.save(App.project);
      U.$('#sketch-img').style.transform = 'rotate(' + App.project.sketch.rotationDeg + 'deg)';
    });
    U.$('#btn-sketch-replace').addEventListener('click', () => {
      U.$('#sketch-file').click();
    });

    U.$('#btn-interpret').addEventListener('click', interpretCurrentSketch);
    U.$('#btn-sketch-continue').addEventListener('click', () => go('site'));
  }

  function handleSketchFile(file) {
    if (!App.project) {
      U.toast('Create a project first.', 'warning');
      return;
    }
    Sketch.readFile(file).then((dataUrl) => {
      setSketchImage(dataUrl);
      App.project.sketch.imageDataUrl = dataUrl;
      App.project.sketch.rotationDeg = 0;
      Model.save(App.project);
    }).catch((e) => U.toast('Could not load image: ' + e.message, 'error'));
  }
  function setSketchImage(dataUrl) {
    U.$('#dropzone-empty').hidden = true;
    U.$('#dropzone-preview').hidden = false;
    U.$('#sketch-img').src = dataUrl;
    U.$('#sketch-img').style.transform = 'rotate(0deg)';
    U.$('#btn-interpret').disabled = false;
  }

  async function interpretCurrentSketch() {
    if (!App.project || !App.project.sketch.imageDataUrl) return;
    U.loading('Interpreting sketch…');
    try {
      const out = await Sketch.interpret(App.project.sketch.imageDataUrl, App.project.notes);
      App.project.sketch.interpretedAt = new Date().toISOString();
      App.project.sketch.elements = out.elements;
      // Merge model update
      if (out.modelUpdate) {
        if (out.modelUpdate.pool) {
          Object.assign(App.project.model.pool, out.modelUpdate.pool);
          if (out.modelUpdate.pool.features) {
            Object.assign(App.project.model.pool.features, out.modelUpdate.pool.features);
          }
        }
      }
      Model.save(App.project);
      renderFeatureList();
      U.$('#btn-sketch-continue').disabled = false;
      U.toast('Sketch interpreted. Review and confirm features.', 'success');
    } catch (e) {
      U.toast('Interpretation failed: ' + e.message, 'error');
    } finally {
      U.loading(false);
    }
  }

  function renderFeatureList() {
    const list = U.$('#feature-list');
    list.innerHTML = '';
    const els = (App.project && App.project.sketch.elements) || [];
    if (!els.length) {
      list.innerHTML = '<li class="feature-empty">No interpretation yet.</li>';
      return;
    }
    els.forEach((el) => {
      const klass = 'feature-item' + (el.confidence < 0.6 ? ' veryLow' : el.confidence < 0.8 ? ' low' : '');
      const li = U.el('li', { class: klass });

      const conf = U.el('div', { class: 'feature-conf', 'aria-label': 'Confidence ' + Math.round(el.confidence * 100) + '%' },
        U.el('i', { style: 'width:' + Math.round(el.confidence * 100) + '%' }));
      const label = U.el('div', { class: 'feature-meta' });
      label.appendChild(U.el('strong', null, el.label));
      label.appendChild(U.el('div', { class: 'muted small' },
        `${Math.round(el.confidence * 100)}% · ${el.status}${el.critical ? ' · critical' : ''}`));

      const actions = U.el('div', { class: 'feature-actions' });
      const confirmBtn = U.el('button', { class: 'btn btn-small btn-secondary', type: 'button' }, '✓ Confirm');
      const rejectBtn = U.el('button', { class: 'btn btn-small btn-ghost', type: 'button' }, '✕ Reject');
      confirmBtn.addEventListener('click', () => {
        el.userDisposition = 'confirmed';
        Model.save(App.project);
        renderFeatureList();
      });
      rejectBtn.addEventListener('click', () => {
        el.userDisposition = 'rejected';
        Model.save(App.project);
        renderFeatureList();
      });
      if (el.userDisposition === 'confirmed') {
        confirmBtn.style.background = '#15803d';
        confirmBtn.style.color = '#fff';
      }
      if (el.userDisposition === 'rejected') {
        li.style.opacity = '0.55';
      }
      actions.appendChild(confirmBtn);
      actions.appendChild(rejectBtn);

      li.appendChild(conf);
      li.appendChild(label);
      li.appendChild(actions);
      list.appendChild(li);
    });
  }

  // ============================================================
  // Step 3: Geospatial / Site
  // ============================================================
  function bindSite() {
    U.$('#btn-geocode').addEventListener('click', geocodeAddress);
    U.$('#btn-toggle-aerial').addEventListener('click', () => {
      const cur = Geo.toggleBase();
      U.toast('Switched to ' + (cur === 'aerial' ? 'aerial' : 'street map') + ' tiles.', 'info');
    });
    U.$('#btn-place-pool').addEventListener('click', () => {
      if (!App.project) return;
      const center = Geo.getMap() && Geo.getMap().getCenter();
      if (!center) {
        U.toast('Geocode the address first.', 'warning');
        return;
      }
      Geo.placePool(center.lat, center.lng, App.project.model);
      App.project.geo.poolOverlay = { lat: center.lat, lng: center.lng, rotationDeg: 0 };
      Model.save(App.project);
    });
    U.$('#pool-rotation').addEventListener('input', (e) => {
      U.$('#pool-rotation-out').textContent = e.target.value + '°';
      if (App.project) {
        App.project.model.pool.rotationDeg = parseInt(e.target.value, 10);
        Model.save(App.project);
      }
    });
  }
  function initSiteIfNeeded() {
    if (App.mapInitialized) {
      const map = Geo.getMap();
      if (map) setTimeout(() => map.invalidateSize(), 100);
      return;
    }
    Geo.initMap('map');
    App.mapInitialized = true;
    if (App.project && App.project.geo && App.project.geo.lat) {
      Geo.center(App.project.geo.lat, App.project.geo.lng, 19);
      Geo.placePool(App.project.geo.lat, App.project.geo.lng, App.project.model);
    } else if (App.project && App.project.address) {
      // Auto-geocode silently
      geocodeAddress(true);
    }
  }
  async function geocodeAddress(silent) {
    if (!App.project) return;
    U.loading('Geocoding address…');
    try {
      const r = await Geo.geocode(App.project.address);
      if (!r) {
        U.toast('Address not found. Try a more specific address.', 'warning');
        return;
      }
      App.project.geo.lat = r.lat;
      App.project.geo.lng = r.lng;
      App.project.geo.accuracy = r.importance > 0.5 ? 'good' : 'approximate';
      App.project.geo.imagerySource = 'Esri World Imagery';
      App.project.geo.imageryDate = new Date().getFullYear() + ' (mosaic)';
      Model.save(App.project);
      Geo.center(r.lat, r.lng, 19);
      Geo.placePool(r.lat, r.lng, App.project.model);
      U.$('#imagery-status').textContent =
        'Imagery: ' + App.project.geo.imagerySource + ' · ' + App.project.geo.imageryDate;
      if (!silent) U.toast('Address geocoded.', 'success');
    } catch (e) {
      U.toast('Geocoding failed: ' + e.message, 'error');
    } finally {
      U.loading(false);
    }
  }

  // ============================================================
  // Step 4: 2D Design
  // ============================================================
  function bindDesign() {
    const svg = U.$('#plan-svg');
    Editor2D.mount(svg);

    Editor2D.onDrag = (handle, dxFt, dyFt) => {
      if (!App.project) return;
      const m = App.project.model;
      if (handle === 'pool') {
        m.pool.positionFt.x = Math.max(0, m.pool.positionFt.x + dxFt);
        m.pool.positionFt.y = Math.max(0, m.pool.positionFt.y + dyFt);
      } else if (handle === 'equipment') {
        m.equipment.xFt = Math.max(0, m.equipment.xFt + dxFt);
        m.equipment.yFt = Math.max(0, m.equipment.yFt + dyFt);
      }
      Editor2D.render(m);
    };
    Editor2D.onDragEnd = () => {
      if (App.project) Model.save(App.project);
    };

    // Bind side controls
    const bindNum = (id, set) => {
      U.$(id).addEventListener('input', (e) => {
        if (!App.project) return;
        set(parseFloat(e.target.value));
        Editor2D.render(App.project.model);
        Model.save(App.project);
      });
    };
    bindNum('#d-length', (v) => App.project.model.pool.lengthFt = v);
    bindNum('#d-width', (v) => App.project.model.pool.widthFt = v);
    bindNum('#d-shallow', (v) => App.project.model.pool.shallowDepthFt = v);
    bindNum('#d-deep', (v) => App.project.model.pool.deepDepthFt = v);
    bindNum('#d-deck-width', (v) => App.project.model.deck.avgWidthFt = v);
    bindNum('#d-set-pl', (v) => App.project.model.setbacks.propertyLineFt = v);
    bindNum('#d-set-house', (v) => App.project.model.setbacks.houseFt = v);

    U.$('#d-shape').addEventListener('change', (e) => {
      if (!App.project) return;
      App.project.model.pool.shape = e.target.value;
      Editor2D.render(App.project.model);
      Model.save(App.project);
    });
    U.$('#d-deck-mat').addEventListener('change', (e) => {
      if (!App.project) return;
      App.project.model.deck.material = e.target.value;
      Model.save(App.project);
    });

    [['#d-spa', 'spa'], ['#d-steps', 'steps'], ['#d-bench', 'bench'], ['#d-shelf', 'shelf'], ['#d-water', 'waterFeature']]
      .forEach(([sel, key]) => {
        U.$(sel).addEventListener('change', (e) => {
          if (!App.project) return;
          App.project.model.pool.features[key] = e.target.checked;
          Editor2D.render(App.project.model);
          Model.save(App.project);
        });
      });

    U.$$('.safety').forEach((cb) => {
      cb.addEventListener('change', () => {
        if (!App.project) return;
        App.project.model.safety.features = U.$$('.safety:checked').map((c) => c.value);
        Model.save(App.project);
      });
    });

    U.$('#btn-fit-plan').addEventListener('click', () => {
      if (App.project) Editor2D.render(App.project.model);
    });
    U.$('#btn-toggle-grid').addEventListener('click', () => {
      const v = Editor2D.toggleGrid();
      if (App.project) Editor2D.render(App.project.model);
      U.toast('Grid ' + (v ? 'on' : 'off'), 'info', 1500);
    });
    U.$('#btn-toggle-dims').addEventListener('click', () => {
      const v = Editor2D.toggleDims();
      if (App.project) Editor2D.render(App.project.model);
      U.toast('Dimensions ' + (v ? 'on' : 'off'), 'info', 1500);
    });
  }

  function hydrateDesignSide() {
    if (!App.project) return;
    const m = App.project.model;
    U.$('#d-length').value = m.pool.lengthFt;
    U.$('#d-width').value = m.pool.widthFt;
    U.$('#d-shallow').value = m.pool.shallowDepthFt;
    U.$('#d-deep').value = m.pool.deepDepthFt;
    U.$('#d-deck-width').value = m.deck.avgWidthFt;
    U.$('#d-set-pl').value = m.setbacks.propertyLineFt;
    U.$('#d-set-house').value = m.setbacks.houseFt;
    U.$('#d-shape').value = m.pool.shape;
    U.$('#d-deck-mat').value = m.deck.material;
    U.$('#d-spa').checked = !!m.pool.features.spa;
    U.$('#d-steps').checked = !!m.pool.features.steps;
    U.$('#d-bench').checked = !!m.pool.features.bench;
    U.$('#d-shelf').checked = !!m.pool.features.shelf;
    U.$('#d-water').checked = !!m.pool.features.waterFeature;
    U.$$('.safety').forEach((cb) => {
      cb.checked = (m.safety.features || []).includes(cb.value);
    });
  }

  function renderDesign() {
    if (!App.project) return;
    hydrateDesignSide();
    // Wait one frame for layout
    requestAnimationFrame(() => Editor2D.render(App.project.model));
  }

  function captureDesignToModel() {
    // already captured live, but save just in case
    if (App.project) Model.save(App.project);
  }

  // ============================================================
  // Step 5: 3D
  // ============================================================
  function bindThree() {
    U.$('#btn-cam-iso').addEventListener('click', () => Editor3D.cameraIso());
    U.$('#btn-cam-top').addEventListener('click', () => Editor3D.cameraTop());
    U.$('#btn-cam-front').addEventListener('click', () => Editor3D.cameraFront());
    U.$('#btn-cam-hero').addEventListener('click', () => Editor3D.cameraHero());
    U.$('#btn-three-shot').addEventListener('click', () => {
      const png = Editor3D.snapshot();
      if (!png) {
        U.toast('Could not capture rendering.', 'error');
        return;
      }
      const a = document.createElement('a');
      a.download = (App.project && App.project.client ? App.project.client.replace(/\W+/g, '_') : 'pool') + '_render.png';
      a.href = png;
      a.click();
      U.toast('Rendering captured.', 'success');
    });
  }
  function initThreeIfNeeded() {
    if (!App.threeInitialized) {
      Editor3D.mount(U.$('#three-canvas'));
      App.threeInitialized = true;
    }
    if (App.project) {
      requestAnimationFrame(() => Editor3D.render(App.project.model));
    }
  }

  // ============================================================
  // Step 6: Concerns
  // ============================================================
  function bindConcerns() {
    U.$('#btn-rerun-rules').addEventListener('click', runRules);
    ['#filter-hard', '#filter-warn', '#filter-adv', '#filter-unknown'].forEach((sel) => {
      U.$(sel).addEventListener('change', renderConcerns);
    });
  }
  function runRules() {
    if (!App.project) return;
    let findings = Rules.evaluate(App.project);
    findings = Rules.applyDispositions(findings, App.project.concernDispositions);
    App.findings = findings;
    App.project.concerns = findings;
    Model.save(App.project);
    renderConcerns();
  }
  function renderConcerns() {
    const summary = U.$('#concerns-summary');
    const list = U.$('#concerns-list');
    summary.innerHTML = '';
    list.innerHTML = '';

    const s = Rules.summarize(App.findings);
    [
      { k: 'hard', label: 'Hard Fail', n: s.hard },
      { k: 'warn', label: 'Warning', n: s.warn },
      { k: 'adv',  label: 'Advisory', n: s.adv },
      { k: 'unknown', label: 'Unknown', n: s.unknown },
    ].forEach(({ k, label, n }) => {
      const pill = U.el('span', { class: 'concern-pill ' + k });
      pill.appendChild(U.el('span', { class: 'dot' }));
      pill.appendChild(U.el('span', { class: 'count' }, String(n)));
      pill.appendChild(U.el('span', null, label));
      summary.appendChild(pill);
    });

    const filterMap = {
      hard: U.$('#filter-hard').checked,
      warn: U.$('#filter-warn').checked,
      adv:  U.$('#filter-adv').checked,
      unknown: U.$('#filter-unknown').checked,
    };

    const filtered = App.findings.filter((f) => filterMap[f.severity]);
    if (!filtered.length) {
      list.appendChild(U.el('div', { class: 'muted', style: 'padding: 1rem; text-align:center' },
        'No findings in current filter.'));
      return;
    }

    filtered.forEach((f) => {
      const card = U.el('div', { class: 'concern ' + Rules.severityClass(f.severity) + (f.userDisposition === 'dismissed' ? ' dismissed' : '') });
      const badge = U.el('span', { class: 'badge ' + Rules.severityBadgeClass(f.severity) }, Rules.severityLabel(f.severity));
      const body = U.el('div');
      body.appendChild(U.el('h4', null, f.category));
      body.appendChild(U.el('p', null, f.description));
      const meta = U.el('div', { class: 'meta' });
      meta.appendChild(U.el('span', null, 'Basis: ' + f.ruleBasis));
      meta.appendChild(U.el('span', null, 'Confidence: ' + f.confidence));
      meta.appendChild(U.el('span', null, 'Recommended: ' + f.recommendedAction));
      body.appendChild(meta);

      const actions = U.el('div', { class: 'actions' });
      const ack = U.el('button', { class: 'btn btn-small btn-secondary', type: 'button' }, 'Acknowledge');
      const dismiss = U.el('button', { class: 'btn btn-small btn-ghost', type: 'button' }, 'Dismiss');
      ack.addEventListener('click', () => {
        f.userDisposition = 'acknowledged';
        App.project.concernDispositions[f.id] = 'acknowledged';
        Model.save(App.project);
        renderConcerns();
      });
      dismiss.addEventListener('click', () => {
        f.userDisposition = 'dismissed';
        App.project.concernDispositions[f.id] = 'dismissed';
        Model.save(App.project);
        renderConcerns();
      });
      actions.appendChild(ack);
      actions.appendChild(dismiss);

      card.appendChild(badge);
      card.appendChild(body);
      card.appendChild(actions);
      list.appendChild(card);
    });
  }

  // ============================================================
  // Step 7: Export
  // ============================================================
  function bindExport() {
    U.$('#btn-export-customer').addEventListener('click', exportCustomer);
    U.$('#btn-export-concerns').addEventListener('click', exportConcerns);
    U.$('#btn-export-json').addEventListener('click', exportJson);
    U.$('#btn-finish').addEventListener('click', () => {
      if (!App.project) return;
      Model.commitRevision(App.project.id, 'Bid package generated');
      App.project = Model.get(App.project.id);
      refreshProjectBar();
      U.toast('Revision committed.', 'success');
    });
  }

  async function exportCustomer() {
    if (!App.project) return;
    // Ensure latest design is rendered before snapshotting
    renderDesign();
    initThreeIfNeeded();
    U.loading('Generating PDF package…');
    try {
      // Build sheet options from checkboxes
      const opts = {};
      U.$$('.sheet').forEach((cb) => { opts[cb.dataset.sheet] = cb.checked; });
      // Allow the 3D canvas a render frame
      await new Promise((r) => setTimeout(r, 250));
      const doc = await Exporter.buildPackage(App.project, opts);
      const filename = safeFilename(App.project.client || 'project') + '_bid_package.pdf';
      doc.save(filename);
      Model.recordExport(App.project.id, 'customer', Object.keys(opts).filter((k) => opts[k]));
      U.toast('Customer PDF generated.', 'success');
    } catch (e) {
      console.error(e);
      U.toast('PDF export failed: ' + e.message, 'error');
    } finally {
      U.loading(false);
    }
  }

  function exportConcerns() {
    if (!App.project || !App.findings.length) {
      // Make sure rules have run
      runRules();
    }
    if (!App.findings.length) {
      U.toast('No findings to export.', 'warning');
      return;
    }
    const doc = Exporter.exportConcerns(App.project, App.findings);
    const filename = safeFilename(App.project.client || 'project') + '_concern_report.pdf';
    doc.save(filename);
    Model.recordExport(App.project.id, 'concern', []);
    U.toast('Concern report PDF generated.', 'success');
  }

  function exportJson() {
    if (!App.project) return;
    const json = JSON.stringify(App.project, null, 2);
    const blob = new Blob([json], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = safeFilename(App.project.client || 'project') + '.poolbid.json';
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  }

  function safeFilename(s) {
    return String(s).replace(/[^a-z0-9_\-]+/gi, '_').slice(0, 40) || 'project';
  }

  function saveRevision() {
    if (!App.project) return;
    Model.commitRevision(App.project.id, 'manual save');
    App.project = Model.get(App.project.id);
    refreshProjectBar();
    U.toast('Revision saved.', 'success');
  }

  // ============================================================
  // Modals
  // ============================================================
  let activeModal = null;
  let trapRelease = null;
  function openModal(id) {
    const m = U.$('#' + id);
    if (!m) return;
    m.hidden = false;
    activeModal = m;
    trapRelease = U.trapFocus(m);
  }
  function closeModal() {
    if (!activeModal) return;
    activeModal.hidden = true;
    activeModal = null;
    if (trapRelease) trapRelease();
  }
  function bindModals() {
    U.$$('[data-close-modal]').forEach((b) => b.addEventListener('click', closeModal));
    U.$$('.modal').forEach((m) =>
      m.addEventListener('click', (e) => { if (e.target === m) closeModal(); })
    );
  }
  function openProjectsModal() {
    const list = U.$('#project-list');
    list.innerHTML = '';
    const items = Model.list();
    if (!items.length) {
      list.appendChild(U.el('li', { class: 'muted', style: 'padding:1rem;text-align:center' }, 'No projects yet.'));
    }
    items.forEach((p) => {
      const li = U.el('li', { class: 'project-entry' });
      const meta = U.el('div');
      meta.appendChild(U.el('strong', null, p.client || 'Untitled'));
      meta.appendChild(U.el('div', { class: 'meta' },
        (p.address || 'No address') + ' · updated ' + U.fmtDateTime(p.updatedAt)
      ));
      const ctrl = U.el('div', { class: 'controls' });
      const openBtn = U.el('button', { class: 'btn btn-small btn-primary', type: 'button' }, 'Open');
      const dupBtn = U.el('button', { class: 'btn btn-small btn-secondary', type: 'button' }, 'Duplicate');
      const delBtn = U.el('button', { class: 'btn btn-small btn-ghost', type: 'button' }, 'Delete');
      openBtn.addEventListener('click', () => {
        App.project = Model.get(p.id);
        Model.setActive(p.id);
        refreshProjectBar();
        unlockStepper();
        hydrateSetupForm();
        closeModal();
        go('setup');
      });
      dupBtn.addEventListener('click', () => {
        const copy = Model.duplicate(p.id);
        if (copy) {
          U.toast('Project duplicated.', 'success');
          openProjectsModal();
        }
      });
      delBtn.addEventListener('click', () => {
        if (!confirm('Delete project "' + (p.client || 'Untitled') + '"? This cannot be undone.')) return;
        Model.remove(p.id);
        if (App.project && App.project.id === p.id) {
          App.project = null;
          refreshProjectBar();
          lockStepper();
          go('welcome');
        }
        openProjectsModal();
      });
      ctrl.appendChild(openBtn);
      ctrl.appendChild(dupBtn);
      ctrl.appendChild(delBtn);
      li.appendChild(meta);
      li.appendChild(ctrl);
      list.appendChild(li);
    });
    openModal('modal-projects');
  }

  // ============================================================
  // Keyboard
  // ============================================================
  function bindKeyboard() {
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && activeModal) {
        closeModal();
        return;
      }
      if (e.altKey && (e.key === 'ArrowRight' || e.key === 'ArrowLeft')) {
        if (!App.project) return;
        const idx = STEPS.indexOf(App.currentStep);
        if (idx === -1) return;
        const ni = e.key === 'ArrowRight'
          ? Math.min(STEPS.length - 1, idx + 1)
          : Math.max(0, idx - 1);
        if (App.currentStep === 'design') captureDesignToModel();
        go(STEPS[ni]);
        e.preventDefault();
      }
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 's') {
        e.preventDefault();
        saveRevision();
      }
    });
  }
})();
