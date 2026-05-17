/* ============================================================
   editor3d.js — Three.js isometric / 3D view.
   Builds the scene deterministically from the parametric model.
   Camera presets: isometric, top, front, hero.
   ============================================================ */
(function (global) {
  'use strict';

  const Editor3D = {};
  let renderer, scene, camera, controls;
  let container = null;
  let needsResize = false;
  let modelGroup = null;
  let lights = [];
  let raf = null;

  // Material palette (preset-driven; can be expanded into a library)
  const M = {
    grass: () => new THREE.MeshLambertMaterial({ color: 0xa9c97e }),
    dirt: () => new THREE.MeshLambertMaterial({ color: 0xb89c79 }),
    deckConcrete: () => new THREE.MeshLambertMaterial({ color: 0xd8d3c9 }),
    deckPavers: () => new THREE.MeshLambertMaterial({ color: 0xbfb4a0 }),
    deckTravertine: () => new THREE.MeshLambertMaterial({ color: 0xe2d8c2 }),
    deckStamped: () => new THREE.MeshLambertMaterial({ color: 0xc7b6a2 }),
    house: () => new THREE.MeshLambertMaterial({ color: 0xe6e2d8 }),
    roof: () => new THREE.MeshLambertMaterial({ color: 0x6b5a4a }),
    water: () => new THREE.MeshPhongMaterial({
      color: 0x36c9f1, transparent: true, opacity: 0.85, shininess: 90, specular: 0xffffff,
    }),
    poolShell: () => new THREE.MeshLambertMaterial({ color: 0xe7f3fa, side: THREE.DoubleSide }),
    equipment: () => new THREE.MeshLambertMaterial({ color: 0xb45309 }),
    spa: () => new THREE.MeshPhongMaterial({ color: 0x9bd4e8, transparent: true, opacity: 0.85 }),
  };

  function deckMat(name) {
    if (name === 'pavers') return M.deckPavers();
    if (name === 'travertine') return M.deckTravertine();
    if (name === 'stamped') return M.deckStamped();
    return M.deckConcrete();
  }

  Editor3D.mount = function (containerEl) {
    container = containerEl;
    if (!container || !global.THREE) return;

    const w = container.clientWidth || 800;
    const h = container.clientHeight || 500;

    renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setPixelRatio(global.devicePixelRatio || 1);
    renderer.setSize(w, h);
    renderer.shadowMap.enabled = true;
    container.innerHTML = '';
    container.appendChild(renderer.domElement);

    scene = new THREE.Scene();
    scene.background = new THREE.Color(0xeaf3fb);
    scene.fog = new THREE.Fog(0xeaf3fb, 200, 600);

    camera = new THREE.PerspectiveCamera(40, w / h, 0.5, 1000);
    Editor3D.cameraIso();

    controls = new THREE.OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.08;
    controls.maxPolarAngle = Math.PI / 2 - 0.05;
    controls.minDistance = 30;
    controls.maxDistance = 350;

    // lighting
    const ambient = new THREE.AmbientLight(0xffffff, 0.55);
    scene.add(ambient);
    lights.push(ambient);
    const sun = new THREE.DirectionalLight(0xfff6e1, 1.0);
    sun.position.set(60, 90, 30);
    sun.castShadow = true;
    sun.shadow.mapSize.set(1024, 1024);
    sun.shadow.camera.left = -120; sun.shadow.camera.right = 120;
    sun.shadow.camera.top = 120; sun.shadow.camera.bottom = -120;
    scene.add(sun);
    lights.push(sun);

    // resize observer
    if (global.ResizeObserver) {
      const ro = new ResizeObserver(() => { needsResize = true; });
      ro.observe(container);
    } else {
      global.addEventListener('resize', () => { needsResize = true; });
    }

    animate();
  };

  function animate() {
    raf = requestAnimationFrame(animate);
    if (needsResize) doResize();
    if (controls) controls.update();
    if (renderer && scene && camera) renderer.render(scene, camera);
  }
  function doResize() {
    const w = container.clientWidth || 800;
    const h = container.clientHeight || 500;
    renderer.setSize(w, h);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    needsResize = false;
  }

  // --- camera presets ---
  Editor3D.cameraIso = function () {
    if (!camera) return;
    camera.position.set(80, 80, 80);
    camera.lookAt(0, 0, 0);
  };
  Editor3D.cameraTop = function () {
    if (!camera) return;
    camera.position.set(0, 140, 0.01);
    camera.lookAt(0, 0, 0);
  };
  Editor3D.cameraFront = function () {
    if (!camera) return;
    camera.position.set(0, 18, 90);
    camera.lookAt(0, 4, 0);
  };
  Editor3D.cameraHero = function () {
    if (!camera) return;
    camera.position.set(55, 32, 70);
    camera.lookAt(0, 2, 0);
  };

  // --- build scene from parametric model ---
  Editor3D.render = function (model) {
    if (!scene || !model) return;
    if (modelGroup) {
      scene.remove(modelGroup);
      disposeGroup(modelGroup);
    }
    modelGroup = new THREE.Group();

    const lotW = model.site.lotWidthFt;
    const lotD = model.site.lotDepthFt;

    // ground (centered at origin; lot coordinates are top-left positive)
    const ground = new THREE.Mesh(
      new THREE.PlaneGeometry(lotW + 20, lotD + 20),
      M.grass()
    );
    ground.rotation.x = -Math.PI / 2;
    ground.receiveShadow = true;
    ground.position.set(lotW / 2, 0, lotD / 2);
    modelGroup.add(ground);

    // lot dirt border
    const border = new THREE.Mesh(
      new THREE.RingGeometry(lotW / 2, lotW / 2 + 3, 64),
      M.dirt()
    );
    // (skip if too complex — keep ground simple)

    // house
    const hp = model.site.housePosition;
    const houseGeom = new THREE.BoxGeometry(model.site.houseWidthFt, 14, model.site.houseDepthFt);
    const house = new THREE.Mesh(houseGeom, M.house());
    house.position.set(hp.xFt + model.site.houseWidthFt / 2, 7, hp.yFt + model.site.houseDepthFt / 2);
    house.castShadow = true; house.receiveShadow = true;
    modelGroup.add(house);

    // roof
    const roof = new THREE.Mesh(
      new THREE.ConeGeometry(Math.max(model.site.houseWidthFt, model.site.houseDepthFt) * 0.62, 6, 4),
      M.roof()
    );
    roof.rotation.y = Math.PI / 4;
    roof.position.set(hp.xFt + model.site.houseWidthFt / 2, 17, hp.yFt + model.site.houseDepthFt / 2);
    roof.castShadow = true;
    modelGroup.add(roof);

    // deck
    const p = model.pool.positionFt;
    const dw = model.deck.avgWidthFt;
    if (dw > 0) {
      const deckGeom = new THREE.BoxGeometry(
        model.pool.lengthFt + dw * 2,
        0.6,
        model.pool.widthFt + dw * 2
      );
      const deck = new THREE.Mesh(deckGeom, deckMat(model.deck.material));
      deck.position.set(p.x + model.pool.lengthFt / 2, 0.3, p.y + model.pool.widthFt / 2);
      deck.receiveShadow = true;
      modelGroup.add(deck);
    }

    // pool shell (basin)
    const pl = model.pool.lengthFt;
    const pw = model.pool.widthFt;
    const pd = Math.max(model.pool.deepDepthFt, model.pool.shallowDepthFt);
    const shell = new THREE.Mesh(
      new THREE.BoxGeometry(pl, pd, pw),
      M.poolShell()
    );
    shell.position.set(p.x + pl / 2, -pd / 2 + 0.2, p.y + pw / 2);
    shell.castShadow = true; shell.receiveShadow = true;
    modelGroup.add(shell);

    // water surface
    const water = new THREE.Mesh(
      new THREE.PlaneGeometry(pl - 0.5, pw - 0.5),
      M.water()
    );
    water.rotation.x = -Math.PI / 2;
    water.position.set(p.x + pl / 2, 0.15, p.y + pw / 2);
    modelGroup.add(water);

    // pool coping ring (border above water)
    const coping = new THREE.Mesh(
      new THREE.BoxGeometry(pl + 1, 0.2, pw + 1),
      new THREE.MeshLambertMaterial({ color: 0xc8b89d })
    );
    coping.position.set(p.x + pl / 2, 0.4, p.y + pw / 2);
    modelGroup.add(coping);

    // spa
    if (model.pool.features.spa) {
      const spa = new THREE.Mesh(
        new THREE.CylinderGeometry(3.5, 3.5, 1.6, 36),
        M.spa()
      );
      spa.position.set(p.x + pl + 4, 0.5, p.y + pw / 2);
      modelGroup.add(spa);
      const spaWater = new THREE.Mesh(
        new THREE.CylinderGeometry(3.2, 3.2, 0.1, 36),
        M.water()
      );
      spaWater.position.set(p.x + pl + 4, 1.25, p.y + pw / 2);
      modelGroup.add(spaWater);
    }

    // steps (visual nub)
    if (model.pool.features.steps) {
      const steps = new THREE.Mesh(
        new THREE.BoxGeometry(3, 0.4, 1.4),
        new THREE.MeshLambertMaterial({ color: 0xb6e0f0 })
      );
      steps.position.set(p.x + 2.5, 0.2, p.y + 1);
      modelGroup.add(steps);
    }
    // shelf (sun shelf)
    if (model.pool.features.shelf) {
      const shelf = new THREE.Mesh(
        new THREE.BoxGeometry(5, 0.5, 2),
        new THREE.MeshLambertMaterial({ color: 0xb6e0f0 })
      );
      shelf.position.set(p.x + 3, 0.25, p.y + pw - 1.5);
      modelGroup.add(shelf);
    }

    // equipment pad
    const e = model.equipment;
    const equip = new THREE.Mesh(
      new THREE.BoxGeometry(e.widthFt, 1, e.depthFt),
      M.equipment()
    );
    equip.position.set(e.xFt + e.widthFt / 2, 0.5, e.yFt + e.depthFt / 2);
    equip.castShadow = true;
    modelGroup.add(equip);

    // simple equipment box on pad
    const pump = new THREE.Mesh(
      new THREE.CylinderGeometry(0.6, 0.6, 1.4, 16),
      new THREE.MeshLambertMaterial({ color: 0x2d3a4b })
    );
    pump.position.set(e.xFt + e.widthFt / 2 - 2, 1.8, e.yFt + e.depthFt / 2);
    modelGroup.add(pump);

    const heater = new THREE.Mesh(
      new THREE.BoxGeometry(2, 2, 1.6),
      new THREE.MeshLambertMaterial({ color: 0x5b6b81 })
    );
    heater.position.set(e.xFt + e.widthFt / 2 + 1.5, 1.6, e.yFt + e.depthFt / 2);
    modelGroup.add(heater);

    // Re-center scene at origin
    modelGroup.position.set(-lotW / 2, 0, -lotD / 2);
    scene.add(modelGroup);
  };

  Editor3D.snapshot = function () {
    if (!renderer || !scene || !camera) return null;
    // ensure last frame rendered
    renderer.render(scene, camera);
    return renderer.domElement.toDataURL('image/png');
  };

  function disposeGroup(g) {
    g.traverse((o) => {
      if (o.geometry) o.geometry.dispose && o.geometry.dispose();
      if (o.material) {
        if (Array.isArray(o.material)) o.material.forEach((m) => m.dispose && m.dispose());
        else o.material.dispose && o.material.dispose();
      }
    });
  }

  global.Editor3D = Editor3D;
})(window);
