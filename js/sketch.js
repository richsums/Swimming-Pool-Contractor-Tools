/* ============================================================
   sketch.js — Sketch upload + heuristic interpretation
   This preview build uses a deterministic heuristic over image
   metadata + user notes. In production this is replaced by a
   trained CV pipeline (segmentation, detection, OCR/HTR).
   The contract is the same: produce InterpretedElement[] with
   confidence values that drive the parametric model.
   ============================================================ */
(function (global) {
  'use strict';

  const Sketch = {};

  // Supported features the interpreter recognizes (and confidence priors).
  // In the heuristic build, priors are mixed with simple image stats and
  // notes parsing to produce per-feature confidence.
  const FEATURE_LIBRARY = [
    { type: 'pool',     label: 'Pool outline',           prior: 0.92, critical: true  },
    { type: 'spa',      label: 'Attached spa',           prior: 0.62, critical: false },
    { type: 'steps',    label: 'Entry steps',            prior: 0.78, critical: false },
    { type: 'bench',    label: 'Bench seat',             prior: 0.55, critical: false },
    { type: 'shelf',    label: 'Baja shelf',             prior: 0.48, critical: false },
    { type: 'waterFeature', label: 'Water feature',      prior: 0.35, critical: false },
    { type: 'deck',     label: 'Deck extents',           prior: 0.82, critical: false },
    { type: 'equipment',label: 'Equipment pad location', prior: 0.6,  critical: true  },
    { type: 'house',    label: 'House outline',          prior: 0.86, critical: false },
    { type: 'fence',    label: 'Fence / barrier line',   prior: 0.5,  critical: true  },
    { type: 'slope',    label: 'Slope indication',       prior: 0.3,  critical: false },
  ];

  // --- File handling ---
  Sketch.readFile = function (file) {
    return new Promise((resolve, reject) => {
      if (!file) return reject(new Error('No file'));
      if (file.size > 12 * 1024 * 1024) return reject(new Error('Image too large (>12 MB)'));
      const fr = new FileReader();
      fr.onload = () => resolve(fr.result);
      fr.onerror = () => reject(fr.error || new Error('Read failed'));
      fr.readAsDataURL(file);
    });
  };

  // --- Sample/demo sketch (data URL, hand-drawn-looking SVG) ---
  Sketch.sampleDataUrl = function () {
    const svg = `
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 600 420" width="600" height="420">
        <defs>
          <pattern id="p" width="6" height="6" patternUnits="userSpaceOnUse">
            <path d="M0 6 L6 0" stroke="#dcd6c8" stroke-width="0.3"/>
          </pattern>
        </defs>
        <rect width="100%" height="100%" fill="#fbf8ee"/>
        <rect width="100%" height="100%" fill="url(#p)"/>
        <!-- lot boundary -->
        <rect x="40" y="40" width="520" height="340" fill="none" stroke="#3a3a3a" stroke-width="2" stroke-dasharray="4 4"/>
        <text x="50" y="60" font-family="Comic Sans MS, cursive" font-size="14" fill="#2a2a2a">EASY LANE</text>
        <!-- house -->
        <path d="M70 90 L350 90 L350 230 L260 230 L260 260 L70 260 Z" fill="none" stroke="#222" stroke-width="2"/>
        <text x="180" y="170" font-family="Comic Sans MS, cursive" font-size="16" fill="#222">EXISTING HOUSE</text>
        <!-- pool -->
        <rect x="170" y="290" width="260" height="70" fill="none" stroke="#0b5d8a" stroke-width="3" rx="6"/>
        <text x="240" y="328" font-family="Comic Sans MS, cursive" font-size="16" fill="#0b5d8a">30' x 16' POOL</text>
        <!-- spa -->
        <circle cx="450" cy="325" r="22" fill="none" stroke="#0b5d8a" stroke-width="3"/>
        <text x="438" y="330" font-family="Comic Sans MS, cursive" font-size="12" fill="#0b5d8a">SPA</text>
        <!-- equipment -->
        <rect x="78" y="320" width="55" height="30" fill="none" stroke="#222" stroke-width="2"/>
        <text x="80" y="340" font-family="Comic Sans MS, cursive" font-size="10" fill="#222">EQUIP</text>
        <!-- steps -->
        <path d="M180 290 L195 285 L210 290" fill="none" stroke="#0b5d8a" stroke-width="2"/>
        <text x="180" y="278" font-family="Comic Sans MS, cursive" font-size="10" fill="#0b5d8a">STEPS</text>
        <!-- dimensions -->
        <text x="280" y="280" font-family="Comic Sans MS, cursive" font-size="11" fill="#444">~30'</text>
        <text x="440" y="380" font-family="Comic Sans MS, cursive" font-size="11" fill="#444">SETBACK 5'</text>
        <!-- fence -->
        <path d="M40 280 L40 380 L560 380 L560 280" fill="none" stroke="#a14b1f" stroke-width="1.5" stroke-dasharray="2 3"/>
        <text x="500" y="276" font-family="Comic Sans MS, cursive" font-size="10" fill="#a14b1f">FENCE</text>
      </svg>`;
    return 'data:image/svg+xml;base64,' + btoa(unescape(encodeURIComponent(svg)));
  };

  /**
   * interpret — Heuristic interpretation.
   * Inputs:
   *   imageDataUrl: data URL of the uploaded sketch
   *   notes:        contractor notes (used to bump priors)
   * Output:
   *   Promise<{ elements, model }>  where model is a partial update
   *   to the parametric design model and elements is a list of
   *   InterpretedElement records.
   *
   * Production replacement contract:
   *   - same return shape
   *   - elements[i].confidence in [0,1]
   *   - elements[i].status = 'observed' | 'inferred' | 'low-confidence'
   *   - never silently invent high-impact dimensions
   */
  Sketch.interpret = function (imageDataUrl, notes) {
    return new Promise((resolve) => {
      // Tiny "vision" stand-in: hash the image bytes to a stable
      // pseudo-random seed so the same sketch always interprets the same way.
      const seed = hashStr(imageDataUrl || '') || 1;
      let rnd = mulberry32(seed);

      // Notes parsing — pulls out dimensions like 30 x 16 and feature mentions.
      const noteHints = parseNotes(notes || '');

      const elements = FEATURE_LIBRARY.map((f) => {
        // Mix prior with note hint and a stable jitter.
        let conf = f.prior * (0.78 + rnd() * 0.32);
        if (noteHints.features.includes(f.type)) conf = Math.min(1, conf + 0.18);
        conf = Math.round(conf * 100) / 100;

        const status =
          conf >= 0.8 ? 'observed' :
          conf >= 0.6 ? 'inferred' :
                        'low-confidence';

        return {
          id: U.uid('feat'),
          type: f.type,
          label: f.label,
          critical: f.critical,
          confidence: conf,
          status,
          userDisposition: 'pending', // pending | confirmed | rejected | edited
        };
      });

      // Build a partial model update — only for high-confidence items.
      const modelUpdate = { pool: { features: {} } };
      if (noteHints.lengthFt) modelUpdate.pool.lengthFt = noteHints.lengthFt;
      if (noteHints.widthFt)  modelUpdate.pool.widthFt = noteHints.widthFt;

      elements.forEach((el) => {
        if (el.confidence >= 0.7 && el.type in { spa: 1, steps: 1, bench: 1, shelf: 1, waterFeature: 1 }) {
          modelUpdate.pool.features[el.type] = true;
        }
      });

      setTimeout(() => resolve({ elements, modelUpdate, noteHints }), 700);
    });
  };

  // --- Notes parsing (extracts dimensions and feature mentions) ---
  function parseNotes(text) {
    const out = { features: [], lengthFt: null, widthFt: null };
    const lower = (text || '').toLowerCase();

    const dimMatch = lower.match(/(\d+(?:\.\d+)?)\s*['x×*]\s*(\d+(?:\.\d+)?)/);
    if (dimMatch) {
      const a = parseFloat(dimMatch[1]);
      const b = parseFloat(dimMatch[2]);
      out.lengthFt = Math.max(a, b);
      out.widthFt = Math.min(a, b);
    }

    [
      ['spa', /\bspa\b|\bhot ?tub\b/],
      ['steps', /\bsteps?\b|\bentry\b|\bstairs?\b/],
      ['bench', /\bbench\b|\bseat\b/],
      ['shelf', /\bbaja\b|\b(sun|tan)\s*shelf\b/],
      ['waterFeature', /\bwater feature\b|\bwaterfall\b|\bscupper\b/],
    ].forEach(([k, re]) => {
      if (re.test(lower)) out.features.push(k);
    });
    return out;
  }

  // --- Tiny stable PRNG so same input -> same interpretation ---
  function mulberry32(seed) {
    return function () {
      seed |= 0;
      seed = (seed + 0x6d2b79f5) | 0;
      let t = seed;
      t = Math.imul(t ^ (t >>> 15), 1 | t);
      t ^= t + Math.imul(t ^ (t >>> 7), 61 | t);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  function hashStr(s) {
    let h = 5381;
    for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) | 0;
    return Math.abs(h) || 1;
  }

  global.Sketch = Sketch;
})(window);
