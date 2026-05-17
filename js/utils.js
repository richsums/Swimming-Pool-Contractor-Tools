/* ============================================================
   utils.js — small helpers used across the app
   ============================================================ */
(function (global) {
  'use strict';

  const U = {};

  // --- ID generation (stable, short, sortable enough) ---
  U.uid = function (prefix) {
    const t = Date.now().toString(36);
    const r = Math.random().toString(36).slice(2, 7);
    return (prefix || 'id') + '_' + t + r;
  };

  U.revId = function () {
    const d = new Date();
    const pad = (n) => String(n).padStart(2, '0');
    return (
      'r' +
      d.getFullYear() +
      pad(d.getMonth() + 1) +
      pad(d.getDate()) +
      '-' +
      pad(d.getHours()) +
      pad(d.getMinutes()) +
      pad(d.getSeconds())
    );
  };

  // --- DOM helpers ---
  U.$ = (sel, root) => (root || document).querySelector(sel);
  U.$$ = (sel, root) => Array.from((root || document).querySelectorAll(sel));

  U.el = function (tag, attrs, children) {
    const e = document.createElement(tag);
    if (attrs) {
      for (const k in attrs) {
        if (k === 'class') e.className = attrs[k];
        else if (k === 'dataset') Object.assign(e.dataset, attrs[k]);
        else if (k.startsWith('on') && typeof attrs[k] === 'function')
          e.addEventListener(k.slice(2).toLowerCase(), attrs[k]);
        else if (k === 'html') e.innerHTML = attrs[k];
        else if (attrs[k] === true) e.setAttribute(k, '');
        else if (attrs[k] !== false && attrs[k] !== null && attrs[k] !== undefined)
          e.setAttribute(k, attrs[k]);
      }
    }
    if (children !== undefined && children !== null) {
      if (Array.isArray(children)) {
        children.forEach((c) => c && e.appendChild(typeof c === 'string' ? document.createTextNode(c) : c));
      } else if (typeof children === 'string' || typeof children === 'number') {
        e.textContent = children;
      } else {
        e.appendChild(children);
      }
    }
    return e;
  };

  // --- Toast notifications ---
  U.toast = function (message, kind = 'info', timeout = 3800) {
    const wrap = U.$('#toasts');
    if (!wrap) {
      console.log('[toast]', kind, message);
      return;
    }
    const t = U.el('div', { class: 'toast ' + kind, role: 'status' }, message);
    wrap.appendChild(t);
    setTimeout(() => {
      t.style.opacity = '0';
      t.style.transform = 'translateX(40px)';
      setTimeout(() => t.remove(), 250);
    }, timeout);
  };

  // --- Loading overlay ---
  U.loading = function (msg) {
    const w = U.$('#loading');
    const m = U.$('#loading-msg');
    if (msg === false) {
      w.hidden = true;
      return;
    }
    if (m) m.textContent = msg || 'Working…';
    w.hidden = false;
  };

  // --- Storage helpers (localStorage with JSON) ---
  U.store = {
    get(key, fallback) {
      try {
        const raw = localStorage.getItem(key);
        return raw == null ? fallback : JSON.parse(raw);
      } catch (e) {
        console.warn('store.get failed', key, e);
        return fallback;
      }
    },
    set(key, value) {
      try {
        localStorage.setItem(key, JSON.stringify(value));
        return true;
      } catch (e) {
        console.warn('store.set failed', key, e);
        U.toast('Could not save locally — storage may be full.', 'error');
        return false;
      }
    },
    remove(key) {
      localStorage.removeItem(key);
    },
  };

  // --- Number / unit helpers ---
  U.feetInches = function (decFeet) {
    if (!isFinite(decFeet)) return '';
    const sign = decFeet < 0 ? '-' : '';
    const v = Math.abs(decFeet);
    const ft = Math.floor(v);
    const inches = Math.round((v - ft) * 12);
    if (inches === 12) return sign + (ft + 1) + "' 0\"";
    return sign + ft + "' " + inches + '"';
  };

  U.clamp = (v, min, max) => Math.max(min, Math.min(max, v));

  // --- Debounce ---
  U.debounce = function (fn, wait) {
    let t;
    return function () {
      clearTimeout(t);
      const args = arguments;
      const ctx = this;
      t = setTimeout(() => fn.apply(ctx, args), wait);
    };
  };

  // --- Geometry helpers (very small) ---
  U.distance = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);

  // --- Date format ---
  U.fmtDate = function (iso) {
    if (!iso) return '';
    const d = new Date(iso);
    return d.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
  };

  U.fmtDateTime = function (iso) {
    if (!iso) return '';
    const d = new Date(iso);
    return d.toLocaleString(undefined, {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  // --- Focus trap for modals ---
  U.trapFocus = function (root) {
    if (!root) return () => {};
    const selectors =
      'a[href], area[href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), button:not([disabled]), iframe, object, embed, [tabindex="0"], [contenteditable]';
    const nodes = U.$$(selectors, root);
    if (!nodes.length) return () => {};
    const first = nodes[0];
    const last = nodes[nodes.length - 1];
    function onKey(e) {
      if (e.key !== 'Tab') return;
      if (e.shiftKey && document.activeElement === first) {
        last.focus();
        e.preventDefault();
      } else if (!e.shiftKey && document.activeElement === last) {
        first.focus();
        e.preventDefault();
      }
    }
    root.addEventListener('keydown', onKey);
    first.focus();
    return () => root.removeEventListener('keydown', onKey);
  };

  global.U = U;
})(window);
