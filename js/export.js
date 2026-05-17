/* ============================================================
   export.js — PDF drawing package + concern report exporter.
   Uses jsPDF. Each sheet has a consistent title block and the
   word "PRELIMINARY" stamped to keep customer-facing sheets
   honest about their bid-phase status.
   Customer drawings and the concern report are exported as
   separate PDFs by default.
   ============================================================ */
(function (global) {
  'use strict';

  const Exporter = {};

  const PAGE_W = 11.0;   // landscape Letter
  const PAGE_H = 8.5;
  const MARGIN = 0.4;

  function newDoc() {
    const { jsPDF } = window.jspdf;
    return new jsPDF({ unit: 'in', format: 'letter', orientation: 'landscape' });
  }

  // --- Common title block ---
  function drawTitleBlock(doc, project, sheetTitle, sheetCode, sheetIdx, sheetTotal) {
    const x = PAGE_W - 3.4;
    const y = PAGE_H - 1.4;
    doc.setDrawColor(20, 37, 59);
    doc.setLineWidth(0.015);
    doc.rect(x, y, 3.0, 1.0);

    doc.setFontSize(8);
    doc.setTextColor(20, 37, 59);
    doc.setFont('helvetica', 'bold');
    doc.text('POOLBID DESIGNER', x + 0.1, y + 0.15);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7);
    doc.text('Preliminary Bid-Phase Drawing', x + 0.1, y + 0.28);

    doc.setLineWidth(0.005);
    doc.line(x, y + 0.35, x + 3, y + 0.35);

    doc.setFontSize(7);
    doc.text('CLIENT:', x + 0.1, y + 0.48);
    doc.setFont('helvetica', 'bold');
    doc.text(String(project.client || '—').slice(0, 30), x + 0.7, y + 0.48);

    doc.setFont('helvetica', 'normal');
    doc.text('ADDRESS:', x + 0.1, y + 0.6);
    doc.setFont('helvetica', 'bold');
    doc.text(String(project.address || '—').slice(0, 40), x + 0.9, y + 0.6);

    doc.setFont('helvetica', 'normal');
    doc.text('REV:', x + 0.1, y + 0.72);
    doc.setFont('helvetica', 'bold');
    doc.text(String(project.currentRevision || 'draft'), x + 0.5, y + 0.72);

    doc.setFont('helvetica', 'normal');
    doc.text('DATE:', x + 1.6, y + 0.72);
    doc.setFont('helvetica', 'bold');
    doc.text(new Date().toLocaleDateString(), x + 2.0, y + 0.72);

    doc.setFont('helvetica', 'normal');
    doc.text('SHEET:', x + 0.1, y + 0.84);
    doc.setFont('helvetica', 'bold');
    doc.text(sheetCode + '  (' + sheetIdx + ' of ' + sheetTotal + ')', x + 0.6, y + 0.84);

    doc.setFont('helvetica', 'normal');
    doc.text('TITLE:', x + 0.1, y + 0.96);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(9);
    doc.text(String(sheetTitle).slice(0, 28), x + 0.55, y + 0.96);
  }

  function drawSheetFrame(doc) {
    doc.setDrawColor(20, 37, 59);
    doc.setLineWidth(0.02);
    doc.rect(MARGIN, MARGIN, PAGE_W - MARGIN * 2, PAGE_H - MARGIN * 2);
  }

  function drawPreliminaryStamp(doc) {
    // Watermark stamp upper-left
    doc.setTextColor(217, 119, 6);
    doc.setFontSize(10);
    doc.setFont('helvetica', 'bold');
    doc.text('PRELIMINARY · NOT FOR CONSTRUCTION', MARGIN + 0.15, MARGIN + 0.25);
    doc.setTextColor(20, 37, 59);
    doc.setFont('helvetica', 'normal');
  }

  function drawDisclaimer(doc, y) {
    doc.setFontSize(6.5);
    doc.setTextColor(90, 107, 129);
    doc.text(
      'This drawing is a preliminary bid-phase concept generated from contractor inputs. Not engineered or permit-ready. ' +
        'Final legal, engineering, permitting, and AHJ approvals remain the contractor\'s responsibility.',
      MARGIN + 0.15, y, { maxWidth: PAGE_W - 4.5 }
    );
    doc.setTextColor(20, 37, 59);
  }

  // --- Sheet: Cover ---
  function sheetCover(doc, project, heroImg, sheets) {
    drawSheetFrame(doc);
    drawPreliminaryStamp(doc);

    doc.setFontSize(24);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(10, 111, 184);
    doc.text('POOLBID DESIGNER', MARGIN + 0.3, MARGIN + 1.3);

    doc.setFontSize(14);
    doc.setTextColor(20, 37, 59);
    doc.text('Preliminary Bid-Phase Drawing Package', MARGIN + 0.3, MARGIN + 1.7);

    // Client block
    doc.setFontSize(11);
    doc.setFont('helvetica', 'normal');
    let y = MARGIN + 2.4;
    const labelW = 1.4;
    [
      ['Client',     project.client || '—'],
      ['Address',    project.address || '—'],
      ['APN',        project.apn || '—'],
      ['Estimator',  project.estimator || '—'],
      ['Pool type',  ({gunite: 'Gunite / Shotcrete', fiberglass: 'Fiberglass', vinyl: 'Vinyl Liner'}[project.poolType] || project.poolType)],
      ['Revision',   project.currentRevision || 'draft'],
      ['Generated',  new Date().toLocaleString()],
    ].forEach(([k, v]) => {
      doc.setTextColor(90, 107, 129);
      doc.text(k.toUpperCase(), MARGIN + 0.3, y);
      doc.setTextColor(20, 37, 59);
      doc.setFont('helvetica', 'bold');
      doc.text(String(v), MARGIN + 0.3 + labelW, y);
      doc.setFont('helvetica', 'normal');
      y += 0.28;
    });

    // Hero image (3D snapshot)
    if (heroImg) {
      try {
        doc.addImage(heroImg, 'PNG', PAGE_W - 5.6, MARGIN + 0.9, 5.0, 3.0);
      } catch (e) { /* ignore */ }
    }

    // Sheet index
    y += 0.2;
    doc.setFontSize(10);
    doc.setFont('helvetica', 'bold');
    doc.text('SHEET INDEX', MARGIN + 0.3, y);
    y += 0.2;
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9);
    sheets.forEach((s, i) => {
      doc.text(`${(i+1).toString().padStart(2,'0')} · ${s.code}  ${s.title}`, MARGIN + 0.3, y);
      y += 0.18;
    });

    // Disclaimer + scope
    drawDisclaimer(doc, PAGE_H - 0.6);

    drawTitleBlock(doc, project, 'COVER · SUMMARY', 'A-0', 1, sheets.length);
  }

  // --- Generic image-bearing sheet (used for site plan, pool, iso) ---
  function sheetImage(doc, project, title, code, idx, total, imgDataUrl, options) {
    drawSheetFrame(doc);
    drawPreliminaryStamp(doc);
    drawTitleBlock(doc, project, title, code, idx, total);

    // Sheet title
    doc.setFontSize(14);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(20, 37, 59);
    doc.text(title, MARGIN + 0.3, MARGIN + 0.6);

    if (imgDataUrl) {
      try {
        // Available area
        const ax = MARGIN + 0.2;
        const ay = MARGIN + 0.9;
        const aw = PAGE_W - MARGIN * 2 - 3.6;
        const ah = PAGE_H - MARGIN * 2 - 1.5;
        doc.addImage(imgDataUrl, 'PNG', ax, ay, aw, ah);
      } catch (e) {
        doc.setFontSize(10);
        doc.text('(Could not embed sheet image)', MARGIN + 0.4, MARGIN + 2.2);
      }
    } else {
      doc.setFontSize(10);
      doc.text('(Sheet content placeholder)', MARGIN + 0.4, MARGIN + 2.2);
    }

    // Notes column
    if (options && options.notes) {
      const nx = PAGE_W - 3.5;
      let ny = MARGIN + 0.9;
      doc.setFontSize(8);
      doc.setFont('helvetica', 'bold');
      doc.text('NOTES', nx, ny); ny += 0.2;
      doc.setFont('helvetica', 'normal');
      options.notes.forEach((n) => {
        doc.text('• ' + n, nx, ny, { maxWidth: 3.2 });
        ny += 0.32;
      });
    }

    drawDisclaimer(doc, PAGE_H - 0.55);
  }

  // --- Sheet: Details (typical notes only — no images) ---
  function sheetDetails(doc, project, idx, total) {
    drawSheetFrame(doc);
    drawPreliminaryStamp(doc);
    drawTitleBlock(doc, project, 'DETAILS', 'A-5', idx, total);

    doc.setFontSize(14);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(20, 37, 59);
    doc.text('Typical Details', MARGIN + 0.3, MARGIN + 0.6);

    const m = project.model;
    const safetyMap = {
      'fence': 'Isolation fence ≥60" with self-closing/latching gate',
      'cover': 'Approved safety pool cover',
      'door-alarm': 'Exit alarms on home doors to pool area',
      'self-closing-doors': 'Self-closing/latching home doors',
      'pool-alarm': 'In-pool surface motion alarm',
      'removable-mesh': 'Removable mesh barrier with gate',
      'other': 'Other approved means (specify)',
    };

    let y = MARGIN + 1.0;
    function row(label, v) {
      doc.setFontSize(9);
      doc.setFont('helvetica', 'normal');
      doc.setTextColor(90, 107, 129);
      doc.text(label, MARGIN + 0.3, y);
      doc.setFont('helvetica', 'bold');
      doc.setTextColor(20, 37, 59);
      doc.text(String(v), MARGIN + 2.8, y);
      y += 0.22;
    }

    doc.setFontSize(11);
    doc.setFont('helvetica', 'bold');
    doc.text('POOL', MARGIN + 0.3, y); y += 0.2;
    row('Shape', m.pool.shape);
    row('Length × Width', m.pool.lengthFt + "' × " + m.pool.widthFt + "'");
    row('Shallow / Deep depth', m.pool.shallowDepthFt + "' / " + m.pool.deepDepthFt + "'");
    row('Steps', m.pool.features.steps ? 'Yes' : 'No');
    row('Bench / Shelf', (m.pool.features.bench ? 'Bench ' : '') + (m.pool.features.shelf ? 'Shelf' : ''));
    row('Attached spa', m.pool.features.spa ? 'Yes' : 'No');
    row('Water feature', m.pool.features.waterFeature ? 'Yes' : 'No');

    y += 0.15;
    doc.setFont('helvetica', 'bold');
    doc.text('DECKING', MARGIN + 0.3, y); y += 0.2;
    row('Material', m.deck.material);
    row('Average width', m.deck.avgWidthFt + "'");

    y += 0.15;
    doc.setFont('helvetica', 'bold');
    doc.text('EQUIPMENT', MARGIN + 0.3, y); y += 0.2;
    row('Pad footprint', m.equipment.widthFt + "' × " + m.equipment.depthFt + "'");
    row('Location (lot)', '(' + m.equipment.xFt + "', " + m.equipment.yFt + "')");

    y += 0.15;
    doc.setFont('helvetica', 'bold');
    doc.text('SAFETY FEATURES SELECTED', MARGIN + 0.3, y); y += 0.2;
    if (!m.safety.features.length) {
      doc.setFont('helvetica', 'normal');
      doc.setTextColor(185, 28, 28);
      doc.text('None selected. CA HSC §115922 requires ≥ 2 approved means.', MARGIN + 0.3, y);
      doc.setTextColor(20, 37, 59);
      y += 0.22;
    } else {
      m.safety.features.forEach((s) => {
        doc.setFont('helvetica', 'normal');
        doc.text('• ' + (safetyMap[s] || s), MARGIN + 0.3, y, { maxWidth: 4.2 });
        y += 0.22;
      });
    }

    // Right column: typical detail notes
    let ny = MARGIN + 1.0;
    const nx = PAGE_W - 4.2;
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(10);
    doc.text('TYPICAL DETAIL NOTES', nx, ny); ny += 0.22;
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8.5);
    [
      'Approved drain covers per 15 U.S.C. Ch. 106 / ANSI-APSP-16 to be specified.',
      'Equipotential bonding grid per NEC 680.26 / CEC 680.',
      'Gas line sizing and clearances verified by licensed sub.',
      'Deck drainage to be directed away from house, equipment, and neighboring property.',
      'All electrical receptacles GFCI protected per current CEC.',
      'Confirm sub-grade soil bearing and any expansive soil mitigation prior to shot­crete.',
      'Verify septic / leach field clearance prior to excavation.',
      'Coordinate VGB-compliant suction outlets and dual main drain spacing.',
    ].forEach((n) => {
      doc.text('• ' + n, nx, ny, { maxWidth: 4.0 });
      ny += 0.34;
    });

    drawDisclaimer(doc, PAGE_H - 0.55);
  }

  // --- Concern report (separate PDF, portrait) ---
  Exporter.exportConcerns = function (project, findings) {
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF({ unit: 'in', format: 'letter', orientation: 'portrait' });

    const W = 8.5, H = 11.0, M = 0.5;
    doc.setDrawColor(20, 37, 59);
    doc.setLineWidth(0.02);
    doc.rect(M, M, W - M * 2, H - M * 2);

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(18);
    doc.setTextColor(10, 111, 184);
    doc.text('California Concern Review', M + 0.3, M + 0.7);

    doc.setFontSize(10);
    doc.setTextColor(20, 37, 59);
    doc.setFont('helvetica', 'normal');
    doc.text('Internal use — not for customer release', M + 0.3, M + 0.92);

    let y = M + 1.3;
    doc.setFontSize(10);
    doc.setFont('helvetica', 'normal');
    doc.text('Client: ' + (project.client || '—'), M + 0.3, y); y += 0.2;
    doc.text('Address: ' + (project.address || '—'), M + 0.3, y); y += 0.2;
    doc.text('Revision: ' + (project.currentRevision || 'draft'), M + 0.3, y); y += 0.2;
    doc.text('Rules version: ' + Rules.VERSION + '   ·   Generated: ' + new Date().toLocaleString(), M + 0.3, y); y += 0.3;

    // Summary line
    const sum = Rules.summarize(findings);
    doc.setFont('helvetica', 'bold');
    doc.text(`Findings: ${sum.total}  ·  Hard ${sum.hard}  ·  Warning ${sum.warn}  ·  Advisory ${sum.adv}  ·  Unknown ${sum.unknown}  ·  Dismissed ${sum.dismissed}`,
      M + 0.3, y);
    y += 0.35;

    doc.setFont('helvetica', 'normal');
    findings.forEach((f, i) => {
      if (y > H - 1.2) {
        doc.addPage();
        doc.setDrawColor(20, 37, 59);
        doc.setLineWidth(0.02);
        doc.rect(M, M, W - M * 2, H - M * 2);
        y = M + 0.5;
      }
      const sevLabel = Rules.severityLabel(f.severity).toUpperCase();
      const color = {
        hard: [185, 28, 28],
        warn: [180, 83, 9],
        adv: [29, 78, 216],
        unknown: [107, 114, 128],
      }[f.severity] || [20, 37, 59];

      doc.setFont('helvetica', 'bold');
      doc.setTextColor.apply(doc, color);
      doc.text(`#${i+1} · ${sevLabel}`, M + 0.3, y);
      doc.setTextColor(20, 37, 59);

      doc.setFont('helvetica', 'normal');
      doc.text('· ' + f.category, M + 2.2, y);
      y += 0.18;

      doc.setFont('helvetica', 'bold');
      doc.text(f.description, M + 0.3, y, { maxWidth: W - M * 2 - 0.4 });
      const lines = doc.splitTextToSize(f.description, W - M * 2 - 0.4);
      y += lines.length * 0.16 + 0.04;

      doc.setFont('helvetica', 'normal');
      doc.setFontSize(9);
      doc.text('Basis: ' + f.ruleBasis, M + 0.3, y, { maxWidth: W - M * 2 - 0.4 });
      y += 0.18;
      doc.text('Recommended: ' + f.recommendedAction, M + 0.3, y, { maxWidth: W - M * 2 - 0.4 });
      const recLines = doc.splitTextToSize(f.recommendedAction, W - M * 2 - 0.4);
      y += recLines.length * 0.16 + 0.02;
      doc.text(`Confidence: ${f.confidence}  ·  Disposition: ${f.userDisposition}`, M + 0.3, y);
      y += 0.28;
      doc.setFontSize(10);
    });

    // Footer
    doc.setFontSize(7);
    doc.setTextColor(90, 107, 129);
    doc.text(
      'This report identifies likely concerns for contractor review. It is not a legal or permit determination. AHJ verification required.',
      M + 0.3, H - 0.6, { maxWidth: W - M * 2 - 0.4 }
    );

    return doc;
  };

  // --- Build full customer drawing package ---
  Exporter.buildPackage = async function (project, options) {
    const opts = options || {};
    const sheets = [];
    if (opts.cover !== false)    sheets.push({ code: 'A-0', title: 'Cover · Summary' });
    if (opts.site !== false)     sheets.push({ code: 'A-1', title: 'Site Plan' });
    if (opts.vicinity !== false) sheets.push({ code: 'A-2', title: 'Vicinity · Aerial Overlay' });
    if (opts.pool !== false)     sheets.push({ code: 'A-3', title: 'Pool Geometry Plan' });
    if (opts.details !== false)  sheets.push({ code: 'A-5', title: 'Details' });
    if (opts.iso !== false)      sheets.push({ code: 'A-9', title: 'Isometric · 3D View' });

    const doc = newDoc();

    // Capture images
    const planImg = await Editor2D.toPng();
    const isoImg = Editor3D.snapshot();
    const aerialImg = await Geo.captureSnapshot();

    let idx = 1;
    sheets.forEach((s, i) => {
      if (i > 0) doc.addPage();
      if (s.code === 'A-0') {
        sheetCover(doc, project, isoImg, sheets);
      } else if (s.code === 'A-1') {
        sheetImage(doc, project, 'Site Plan', s.code, idx, sheets.length, planImg, {
          notes: [
            'Lot boundary and house footprint shown from address geocode.',
            'Setbacks: ' + project.model.setbacks.propertyLineFt + "' property line · " + project.model.setbacks.houseFt + "' house.",
            'Equipment pad shown adjacent to pool. Verify clearances on site.',
            'Scale: graphic. Not for construction.',
          ]
        });
      } else if (s.code === 'A-2') {
        sheetImage(doc, project, 'Vicinity · Aerial Overlay', s.code, idx, sheets.length, aerialImg, {
          notes: [
            'Imagery source: see app banner. Verify currency before customer release.',
            'Pool placement is approximate — confirm on the site walk.',
          ]
        });
      } else if (s.code === 'A-3') {
        sheetImage(doc, project, 'Pool Geometry Plan', s.code, idx, sheets.length, planImg, {
          notes: [
            'Pool: ' + project.model.pool.lengthFt + "' × " + project.model.pool.widthFt + "'",
            'Shape: ' + project.model.pool.shape,
            'Shallow / Deep: ' + project.model.pool.shallowDepthFt + "' / " + project.model.pool.deepDepthFt + "'",
            'Features: ' + Object.entries(project.model.pool.features).filter(([,v])=>v).map(([k])=>k).join(', ') || 'shell only',
          ]
        });
      } else if (s.code === 'A-5') {
        sheetDetails(doc, project, idx, sheets.length);
      } else if (s.code === 'A-9') {
        sheetImage(doc, project, 'Isometric · 3D View', s.code, idx, sheets.length, isoImg, {
          notes: [
            'Visualization generated from the parametric model.',
            'Materials shown are placeholders for proposal review.',
          ]
        });
      }
      idx++;
    });

    return doc;
  };

  global.Exporter = Exporter;
})(window);
