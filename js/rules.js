/* ============================================================
   rules.js — California concern review engine.
   Each finding includes: id, severity, category, description,
   ruleBasis, confidence, recommendedAction, userDisposition.
   Findings are NOT included on customer drawings unless the user
   explicitly exports a combined internal package.
   Rule set version is recorded on each evaluation for traceability.
   ============================================================ */
(function (global) {
  'use strict';

  const Rules = {};
  Rules.VERSION = '1.0';

  const SEV = {
    HARD: 'hard',
    WARN: 'warn',
    ADV: 'adv',
    UNKNOWN: 'unknown',
  };

  // Severity labels for UI
  Rules.severityLabel = function (s) {
    if (s === SEV.HARD) return 'Hard Fail';
    if (s === SEV.WARN) return 'Warning';
    if (s === SEV.ADV) return 'Advisory';
    return 'Unknown / Data Needed';
  };
  Rules.severityBadgeClass = function (s) {
    return {
      [SEV.HARD]: 'badge-hard',
      [SEV.WARN]: 'badge-warn',
      [SEV.ADV]: 'badge-adv',
      [SEV.UNKNOWN]: 'badge-unknown',
    }[s] || 'badge-unknown';
  };
  Rules.severityClass = function (s) {
    return {
      [SEV.HARD]: 'sev-hard',
      [SEV.WARN]: 'sev-warn',
      [SEV.ADV]: 'sev-adv',
      [SEV.UNKNOWN]: 'sev-unknown',
    }[s] || 'sev-unknown';
  };

  function mk(id, sev, category, description, basis, recAction, confidence) {
    return {
      id,
      severity: sev,
      category,
      description,
      ruleBasis: basis,
      recommendedAction: recAction,
      confidence: confidence || 'medium',
      userDisposition: 'open',
      rulesVersion: Rules.VERSION,
    };
  }

  /**
   * evaluate — returns Array<ComplianceFinding>
   * Inputs:
   *   project: full project object (model, geo, safety, etc.)
   * Notes:
   *   This is illustrative. Production version pulls jurisdiction
   *   rule packs and applies AHJ-specific deltas.
   */
  Rules.evaluate = function (project) {
    const findings = [];
    if (!project) return findings;
    const m = project.model;

    // ---- 1. Drowning prevention — CA HSC §115922 requires at least 2 approved means for covered residential projects.
    const safety = (m.safety && m.safety.features) || [];
    if (safety.length === 0) {
      findings.push(mk(
        'safety-none',
        SEV.HARD,
        'Drowning prevention',
        'No drowning-prevention safety features selected. California HSC §115922 requires at least two approved means for covered residential projects.',
        'CA Health & Safety Code §115922 — Swimming Pool Safety Act',
        'Select and document at least two approved means (e.g., isolation fence + self-closing/latching gate, approved cover, exit/door alarms, pool alarm, removable mesh, etc.).',
        'high'
      ));
    } else if (safety.length === 1) {
      findings.push(mk(
        'safety-one',
        SEV.WARN,
        'Drowning prevention',
        'Only one drowning-prevention safety feature is selected. CA HSC §115922 requires at least two approved means for covered residential projects.',
        'CA Health & Safety Code §115922',
        'Add a second approved means before customer sign-off, or document why this project is exempt (commercial, agricultural, etc.).',
        'high'
      ));
    } else {
      // OK — but still note that user should confirm interpretation
      findings.push(mk(
        'safety-ok-note',
        SEV.ADV,
        'Drowning prevention',
        `${safety.length} safety means selected. Confirm each meets the applicable California minimum specifications (e.g., fence ≥60", self-closing/latching, door alarm with sound profile).`,
        'CA HSC §115922; CBC/CRC residential pool barrier provisions',
        'Verify each selected means against the current California requirements during contractor walk-through.',
        'medium'
      ));
    }

    // ---- 2. Barrier / gate strategy
    if (!safety.includes('fence') && !safety.includes('removable-mesh')) {
      findings.push(mk(
        'barrier-strategy',
        SEV.WARN,
        'Barrier / gate',
        'No barrier or removable mesh barrier strategy is shown.',
        'CA HSC §115922(a)(1) and (a)(6); CBC Appendix V where adopted',
        'Confirm with the client whether a physical barrier will be installed and document gate/latch hardware.',
        'medium'
      ));
    }

    // ---- 3. Setbacks vs. property line (illustrative; jurisdictions vary)
    const sbPL = m.setbacks.propertyLineFt;
    if (sbPL < 5) {
      findings.push(mk(
        'setback-property',
        SEV.WARN,
        'Setback',
        `Pool/deck appears within ${sbPL} ft of the property line. Most California jurisdictions require ≥ 5 ft minimum for pool walls.`,
        'Local zoning code (varies by AHJ)',
        'Verify minimum pool setback in the city/county zoning code and adjust placement.',
        'medium'
      ));
    } else {
      findings.push(mk(
        'setback-property-info',
        SEV.ADV,
        'Setback',
        `Pool setback to property line is ${sbPL} ft (preliminary). Verify against the local zoning code.`,
        'Local zoning code (varies by AHJ)',
        'Confirm with city/county planning before final design.',
        'medium'
      ));
    }
    if (m.setbacks.houseFt < 5) {
      findings.push(mk(
        'setback-house',
        SEV.WARN,
        'Setback',
        `Pool is within ${m.setbacks.houseFt} ft of the existing house. Verify foundation/footing relationship and required separation.`,
        'CBC/CRC foundation provisions',
        'Coordinate with structural review if final separation < 5 ft.',
        'medium'
      ));
    }

    // ---- 4. Equipment access / clearance
    const e = m.equipment;
    const eFar = Math.hypot(
      (e.xFt + e.widthFt / 2) - (m.pool.positionFt.x + m.pool.lengthFt / 2),
      (e.yFt + e.depthFt / 2) - (m.pool.positionFt.y + m.pool.widthFt / 2),
    );
    if (eFar > Math.max(m.site.lotWidthFt, m.site.lotDepthFt) * 0.6) {
      findings.push(mk(
        'equipment-distance',
        SEV.ADV,
        'Equipment access',
        'Equipment pad is far from the pool. Long plumbing runs may impact hydraulics, head loss, and serviceability.',
        'Industry hydraulics best practice',
        'Confirm pipe sizing and pump selection for the run length; consider relocating closer to the pool if feasible.',
        'medium'
      ));
    }

    // Equipment too close to property line
    if ((e.xFt < 3) || (m.site.lotWidthFt - (e.xFt + e.widthFt) < 3)) {
      findings.push(mk(
        'equipment-pl',
        SEV.WARN,
        'Equipment access',
        'Equipment pad is close to a property line. Check setback, noise ordinance, and serviceability.',
        'Local zoning + noise ordinance (varies by AHJ)',
        'Verify minimum setback and document compliance with the applicable noise ordinance.',
        'medium'
      ));
    }

    // ---- 5. Drainage (heuristic: deck drains by default; warn if pool sits in a downhill spot)
    // For preview build we surface this as advisory without slope info.
    findings.push(mk(
      'drainage-review',
      SEV.ADV,
      'Drainage',
      'Confirm deck drainage routing does not direct water toward the home, equipment pad, or neighboring property.',
      'CRC R401.3 (surface drainage); contractor best practice',
      'Document deck slope/drain plan at the site walk and update the design accordingly.',
      'medium'
    ));

    // ---- 6. Septic / leach field
    findings.push(mk(
      'septic-unknown',
      SEV.UNKNOWN,
      'Site utilities',
      'Septic tank / leach field location not captured in this preview. Pool excavation must avoid leach fields.',
      'CA Plumbing Code §713 / local environmental health',
      'Locate and mark septic and leach field on the site plan before excavation. Owner/contractor verification required.',
      'low'
    ));

    // ---- 7. Imagery confidence
    const imageryStale = !project.geo || !project.geo.imageryDate;
    if (imageryStale) {
      findings.push(mk(
        'imagery-confidence',
        SEV.UNKNOWN,
        'Geospatial',
        'Aerial imagery source/date not captured. Overlay scale and alignment are preliminary.',
        'Imagery licensing + age policy',
        'Calibrate the overlay on the site walk and capture imagery source/date before customer release.',
        'low'
      ));
    }

    // ---- 8. AHJ coverage
    findings.push(mk(
      'ahj-coverage',
      SEV.UNKNOWN,
      'AHJ / permit',
      'Local jurisdiction rule pack not fully loaded in this preview build. AHJ-specific requirements (permitting, fencing, alarms, drain covers, electrical bonding) must be verified.',
      'Local building department / Health & Safety code',
      'Verify all AHJ-specific requirements with the city/county before bid release.',
      'data-unavailable'
    ));

    // ---- 9. Drain cover (Virginia Graeme Baker Act / 15 USC ch 106)
    findings.push(mk(
      'vgba-drain',
      SEV.ADV,
      'Safety / suction',
      'Confirm anti-entrapment drain cover assembly is specified per 15 U.S.C. Chapter 106 (Pool & Spa Safety Act).',
      '15 U.S.C. Chapter 106; ANSI/APSP-16 drain cover standard',
      'Specify approved VGB-compliant cover and dual main drains or alternate suction-relief method.',
      'high'
    ));

    // ---- 9b. Plumbing — only evaluate if user has placed components
    const plumb = project.plumbing || { components: {}, pipes: {} };
    const comps = Object.values(plumb.components);
    if (comps.length > 0) {
      const byRole = {};
      comps.forEach((c) => {
        const def = (global.Plumbing && Plumbing.componentDef && Plumbing.componentDef(c.type)) || null;
        if (!def) return;
        (byRole[def.role] = byRole[def.role] || []).push(c);
      });

      // Need a pump
      if (!byRole.pump || !byRole.pump.length) {
        findings.push(mk(
          'plumb-no-pump',
          SEV.HARD,
          'Plumbing',
          'No pump on the plumbing layout. Circulation system cannot run.',
          'Hydraulics design',
          'Add a pump on the equipment pad.',
          'high'
        ));
      }
      // Need a filter
      if (!byRole.filter || !byRole.filter.length) {
        findings.push(mk(
          'plumb-no-filter',
          SEV.HARD,
          'Plumbing',
          'No filter on the layout. Pool water cannot be filtered.',
          'Hydraulics design',
          'Add a cartridge, DE, or sand filter downstream of the pump.',
          'high'
        ));
      }
      // Sand/DE filter requires a multiport (backwash) valve
      const sandFilter = (byRole.filter || []).find((c) => c.props && (c.props.type === 'sand' || c.props.type === 'DE'));
      const hasMpv = !!(byRole['valve-multiport'] && byRole['valve-multiport'].length);
      if (sandFilter && !hasMpv) {
        findings.push(mk(
          'plumb-no-mpv',
          SEV.WARN,
          'Plumbing',
          'Sand/DE filter is selected but no multiport (backwash) valve is on the layout. Filter cannot be backwashed.',
          'Manufacturer & filter type requirement',
          'Add a multiport valve between the pump and the filter, or route through a separate backwash valve.',
          'high'
        ));
      }
      // MPV without waste line
      if (hasMpv) {
        const hasWaste = comps.some((c) => c.type === 'wasteLine');
        if (!hasWaste) {
          findings.push(mk(
            'plumb-no-waste',
            SEV.WARN,
            'Plumbing',
            'Multiport valve is present but no waste line is connected. Backwash flow has no discharge route.',
            'Hydraulics design + local wastewater code',
            'Add a waste line component and connect it to the MPV waste port.',
            'medium'
          ));
        }
      }
      // Heater without check valve downstream of salt cell / chlorinator (recommended)
      const hasHeater = comps.some((c) => c.type === 'heater');
      const hasSalt = comps.some((c) => c.type === 'saltCell');
      const hasCheck = comps.some((c) => c.type === 'checkValve');
      if (hasHeater && hasSalt && !hasCheck) {
        findings.push(mk(
          'plumb-heater-check',
          SEV.ADV,
          'Plumbing',
          'Heater and salt chlorine cell are on the same loop with no check valve. Acidic backflow can damage the heater heat exchanger.',
          'Manufacturer installation guidance (Pentair, Raypak, Jandy)',
          'Install a check valve between the heater outlet and the salt cell to prevent backflow.',
          'high'
        ));
      }
      // No returns
      const hasReturn = comps.some((c) => {
        const def = global.Plumbing && Plumbing.componentDef && Plumbing.componentDef(c.type);
        return def && def.role === 'sink' && c.type !== 'wasteLine';
      });
      if (!hasReturn) {
        findings.push(mk(
          'plumb-no-return',
          SEV.WARN,
          'Plumbing',
          'No return outlets (wall returns, jets, or features) on the layout. Water has nowhere to go after the equipment pad.',
          'Hydraulics design',
          'Add at least two wall returns or equivalent return paths.',
          'high'
        ));
      }
      // No suction sources
      const hasSource = comps.some((c) => {
        const def = global.Plumbing && Plumbing.componentDef && Plumbing.componentDef(c.type);
        return def && def.role === 'source' && c.type !== 'autofill';
      });
      if (!hasSource) {
        findings.push(mk(
          'plumb-no-source',
          SEV.HARD,
          'Plumbing',
          'No suction source (skimmer or main drain) on the layout.',
          'Hydraulics design + CA HSC §115928 (suction)',
          'Add at least one skimmer plus a VGB-compliant dual main drain.',
          'high'
        ));
      }
      // VGB single drain warning
      const mds = comps.filter((c) => c.type === 'mainDrain');
      mds.forEach((md) => {
        if (md.props && md.props.dualMainDrain === false) {
          findings.push(mk(
            'plumb-vgb-' + md.id,
            SEV.WARN,
            'Plumbing / Safety',
            'A main drain is marked as a single suction outlet without VGB-compliant alternate suction relief.',
            '15 U.S.C. Chapter 106 (Virginia Graeme Baker Pool & Spa Safety Act)',
            'Use dual main drains spaced ≥3 ft apart, or specify an approved single-suction VGB-compliant cover with anti-entrapment design.',
            'high'
          ));
        }
      });
    }

    // ---- 10. Pool electrical bonding (NEC 680.26)
    findings.push(mk(
      'nec-bonding',
      SEV.ADV,
      'Electrical',
      'Equipotential bonding required for the pool shell, perimeter surfaces, and metallic components.',
      'NEC 680.26; CEC 680',
      'Coordinate with the electrical sub to detail the bonding grid in final design.',
      'high'
    ));

    return findings;
  };

  // Apply user disposition map (resolved/dismissed/etc.) on top of fresh findings
  Rules.applyDispositions = function (findings, dispositions) {
    if (!dispositions) return findings;
    return findings.map((f) => ({ ...f, userDisposition: dispositions[f.id] || f.userDisposition }));
  };

  Rules.summarize = function (findings) {
    const out = { hard: 0, warn: 0, adv: 0, unknown: 0, dismissed: 0, total: 0 };
    findings.forEach((f) => {
      out.total++;
      if (f.userDisposition === 'dismissed' || f.userDisposition === 'n/a') out.dismissed++;
      else {
        if (f.severity === SEV.HARD) out.hard++;
        else if (f.severity === SEV.WARN) out.warn++;
        else if (f.severity === SEV.ADV) out.adv++;
        else out.unknown++;
      }
    });
    return out;
  };

  global.Rules = Rules;
  global.Rules.SEV = SEV;
})(window);
