# PoolBid Designer — Swimming Pool Contractor Tools

An AI-assisted bid-phase design tool for California swimming pool contractors. Converts a hand sketch and a property address into a professional preliminary drawing package — site plan, aerial overlay, pool geometry, isometric/3D view — plus a separate California concern review.

**Live app:** https://richsums.github.io/Swimming-Pool-Contractor-Tools/

---

## What it does

1. **Project setup** — capture client, address, APN, estimator, pool type, and notes.
2. **Sketch upload** — drag-drop a photo of the hand sketch. The interpreter extracts a draft parametric model and flags low-confidence features for human review.
3. **Site & aerial** — geocode the address and overlay the proposed pool on an aerial map (Esri World Imagery), with scale, north arrow, and imagery source disclosure.
4. **Design** — edit the parametric pool shell, spa, steps, bench, shelf, water feature, decking, equipment pad, safety features, and setbacks. Dimensions update live.
5. **3D View** — Three.js scene driven by the same parametric model. Orbit, switch between isometric/top/front/hero presets, and capture renderings.
6. **Concerns** — California rules engine evaluates safety features (CA HSC §115922), setbacks, equipment access, drainage, septic, imagery confidence, AHJ coverage, VGB drain covers (15 USC ch 106), and NEC 680.26 bonding. Findings include severity, source/rule basis, confidence, and recommended action.
7. **Export** — generate a professional PDF bid package (Cover, Site, Vicinity/Aerial, Pool Geometry, Details, Isometric). The concern report is exported separately and is not included on customer-facing sheets.

## Architecture (client-side)

Pure static site — no backend required. Modules:

| Module | Responsibility |
| --- | --- |
| `js/utils.js` | DOM helpers, toasts, storage, focus trap, formatters |
| `js/model.js` | Parametric design model + project persistence (localStorage) + revision control |
| `js/sketch.js` | Sketch ingestion + heuristic interpretation with confidence values |
| `js/geospatial.js` | Nominatim geocoding + Leaflet map + aerial overlay |
| `js/editor2d.js` | SVG site/pool plan editor with drag handles, dimensions, title block |
| `js/editor3d.js` | Three.js scene from parametric model, camera presets, snapshots |
| `js/rules.js` | California concern engine; rule versioning; severity/category/disposition |
| `js/export.js` | jsPDF-based drawing package + separate concern report PDF |
| `js/app.js` | Routing, lifecycle, UI wiring, keyboard shortcuts |

External libraries (CDN): Leaflet 1.9.4, Three.js r128, jsPDF 2.5.

## Design principles followed

- **Single source of truth** — every drawing, overlay, and concern finding is generated from one editable parametric model.
- **AI-assisted, not AI-only** — sketch interpretation surfaces confidence values and forces human confirmation for critical features.
- **Preliminary positioning** — every customer sheet carries a PRELIMINARY · NOT FOR CONSTRUCTION stamp and a disclaimer footer; the concern report is exported separately.
- **Traceable decisions** — every export records project ID, revision ID, sheets selected, timestamp.
- **Accessibility** — skip link, focus-visible outlines, keyboard navigation between steps (Alt + ←/→), ARIA labels on canvases, WCAG AA color contrast.
- **Responsive** — works down to 360 px viewports; tablet and desktop tested.

## Human-factors notes

- Workflow is presented as a stepper with completion states so the user always knows where they are.
- Disclaimers appear at three layers: top banner, sheet stamp, PDF footer.
- Confidence is exposed in the sketch step as a progress bar so low-confidence items are visually obvious before they reach the customer drawing.
- Destructive actions (delete project) require explicit confirmation.
- Loading states + toasts give consistent feedback for async work (geocoding, interpretation, PDF generation).

## Running locally

This is a static site — open `index.html` in a modern browser, or serve the folder:

```bash
cd "Swimming Pool Contractor Tools"
python3 -m http.server 8080
# then open http://localhost:8080
```

## Limitations

This is a **preliminary bid-phase tool**. It does not produce engineered or permit-ready drawings. Final legal, engineering, permitting, and AHJ approvals remain the contractor's responsibility. Sketch interpretation in this build is a deterministic heuristic over image hash + notes parsing — production would replace this with a trained computer vision pipeline (segmentation + detection + OCR/HTR) while keeping the same `InterpretedElement` contract.

## References

- California Contractors State License Board — C-53 Swimming Pool Contractor classification
- California Department of Public Health — California Swimming Pool Requirements
- California Health and Safety Code §115922 — Swimming Pool Safety Act
- 15 U.S.C. Chapter 106 — Pool and Spa Safety / drain cover standard
- NEC 680 / CEC 680 — Pool electrical bonding
- Local jurisdictions (city/county) vary; the rules engine surfaces "Unknown / Data Needed" findings to make this explicit.

## License

MIT — see `LICENSE`.
