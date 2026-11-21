/* ═══════════════════════════════════════════════════════════════
   TRIDENTE · cliente del dashboard
   ═══════════════════════════════════════════════════════════════ */
(() => {
"use strict";

const nf0 = new Intl.NumberFormat("es-ES", { maximumFractionDigits: 0 });
const nf1 = new Intl.NumberFormat("es-ES", { minimumFractionDigits: 1, maximumFractionDigits: 1 });
const nf2 = new Intl.NumberFormat("es-ES", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const S = {
  data: null,
  period: "all",
  visible: { marea: true, pezvela: true, meteoro: true, combined: true, spy: true },
  weights: { marea: 34, pezvela: 33, meteoro: 33 },
  radar: "pezvela",
  hist: "marea",
  calTab: "combined",
  capital: null,          // editable: importe de la cartera (por defecto, el del servidor)
};

const COLORS = { marea: "#35d0e6", pezvela: "#ffb648", meteoro: "#b58cf0", combined: "#45e0b0", spy: "#8ea3bb" };
const LABELS = { marea: "MAREA", pezvela: "VELA", meteoro: "METEORO", combined: "TRIDENTE", spy: "S&P 500" };
const CLASS_COLOR = { equity: "#35d0e6", bond: "#45e0b0", commodity: "#ffb648", cash: "#6f849c", stock: "#b58cf0" };
const CLASS_LABEL = { equity: "RV · ETFs", bond: "Renta fija", commodity: "Materias primas", cash: "Liquidez", stock: "Acciones" };

/* ───────────── helpers ───────────── */
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));
const el = (tag, cls, html) => { const e = document.createElement(tag); if (cls) e.className = cls; if (html != null) e.innerHTML = html; return e; };

const pct = (v, d = 1, sign = false) => {
  if (v == null || Number.isNaN(v)) return "—";
  if (Math.abs(v) < 0.00005) v = 0;
  const s = sign && v > 0 ? "+" : "";
  return s + (d === 0 ? nf0.format(v * 100) : d === 1 ? nf1.format(v * 100) : nf2.format(v * 100)) + "\u00a0%";
};
const num = (v, d = 2) => (v == null || Number.isNaN(v) ? "—" : (d === 1 ? nf1 : nf2).format(v));
const money = (v) => (v == null ? "—" : nf0.format(v) + "\u00a0€");
const cls = (v) => (v == null ? "neu" : v > 0 ? "pos" : v < 0 ? "neg" : "neu");
const fmtInt = (v) => (v == null ? "—" : Number(v).toLocaleString("es-ES"));
// Cobertura de análisis de cada sistema.
//   analyzed / expected = valores que el motor ha analizado / valores que PODÍA analizar.
//   skipped = valores del universo sin un año de histórico (salidas a bolsa, escisiones, valores
//   opados que Yahoo deja con un precio suelto): no se pueden analizar con RSC de 52 semanas, así
//   que se restan del denominador y se muestran aparte. Un 100 % aquí es lo normal; por debajo
//   del 100 % es que se ha quedado algo fuera por un fallo de descarga.
function covInfo(ex) {
  const c = ex.coverage || {};
  const lbl = c.label || "activos";
  if (c.analyzed == null || !c.expected) {
    return { txt: "—", cls: "neu", badge: "", extra: "", tip: "sin datos de cobertura" };
  }
  const pct = c.pct == null ? 100 : c.pct;
  const txt = `${fmtInt(c.analyzed)} / ${fmtInt(c.expected)}`;
  const cls = pct >= 99.5 ? "pos" : pct >= 95 ? "neu" : "neg";
  // aviso sólo cuando falta algo de verdad: ámbar por debajo del 99,5 %, rojo por debajo del 90 %
  const tone = pct >= 90 ? "" : "off";
  const tip = `${fmtInt(c.analyzed)} de ${fmtInt(c.expected)} ${lbl} analizables`
    + ` (${num(pct, 1)} %)`
    + (c.skipped ? ` · ${fmtInt(c.skipped)} sin un año de histórico, no analizables todavía` : "")
    + (c.missing ? ` · ${fmtInt(c.missing)} se han quedado fuera por falta de datos` : "");
  // «s/h» = sin un año de histórico (no analizable con RSC de 52 semanas); se explica al pasar el ratón
  const extra = c.skipped
    ? `<span class="muted" style="font-weight:500" title="${fmtInt(c.skipped)} valores que cotizan pero aún no tienen un año de histórico (salidas a bolsa y escisiones): no se pueden analizar con RSC de 52 semanas">+${fmtInt(c.skipped)} s/h</span>`
    : "";
  const badge = pct >= 99.5 ? ""
    : `<span class="badge${tone ? " " + tone : ""}" style="margin-left:8px" title="${tip}">datos ${num(pct, 1)} %</span>`;
  return { txt, cls, badge, extra, tip };
}
const monthES = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];
const fmtDate = (iso) => {
  if (!iso) return "—";
  const d = new Date(iso.length <= 10 ? iso + "T00:00:00" : iso);
  return d.getDate() + " " + monthES[d.getMonth()] + " " + d.getFullYear();
};

function hexRgba(hex, a) {
  const h = hex.replace("#", "");
  const n = parseInt(h.length === 3 ? h.split("").map((c) => c + c).join("") : h, 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
}

function heatColor(v, invert = false) {
  // v en [-1,1] normalmente; devuelve rgba de rojo→neutro→verde
  const x = Math.max(-1, Math.min(1, v));
  if (invert) return `rgba(255,182,72,${0.10 + Math.abs(x) * 0.42})`;
  const a = 0.10 + Math.min(1, Math.abs(x)) * 0.55;
  return x >= 0 ? `rgba(78,224,140,${a})` : `rgba(255,107,125,${a})`;
}

/* ───────────── arranque ───────────── */
// Modo estático: si no hay motor Python detrás (GitHub Pages, Cloudflare Pages…), el payload se
// sirve como fichero en data/dashboard.json. Todo el cálculo de pesos e importes es cliente.
async function loadStaticPayload() {
  for (const url of ["data/dashboard.json", "./data/dashboard.json"]) {
    try {
      const r = await fetch(url, { cache: "no-cache" });
      if (r.ok) { S.data = await r.json(); S.staticMode = true; return true; }
    } catch (e) { /* siguiente candidato */ }
  }
  return false;
}

const STATIC_BUILD = !!document.querySelector('meta[name="tridente-static"]');
const ENC_BUILD = !!document.querySelector('meta[name="tridente-encrypted"]');

/* ── descifrado del payload (PBKDF2-SHA256 + AES-256-GCM, WebCrypto) ── */
const b64 = (s) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));
const KEY_STORE = "tridente_key";

async function decryptWith(password) {
  const r = await fetch("data/dashboard.enc", { cache: "no-store" });
  if (!r.ok) throw new Error("no se pudo descargar el paquete cifrado");
  const env = await r.json();
  const enc = new TextEncoder();
  const base = await crypto.subtle.importKey("raw", enc.encode(password), "PBKDF2", false, ["deriveKey"]);
  const key = await crypto.subtle.deriveKey(
    { name: "PBKDF2", salt: b64(env.salt), iterations: env.iter, hash: "SHA-256" },
    base, { name: "AES-GCM", length: 256 }, false, ["decrypt"]
  );
  const plain = await crypto.subtle.decrypt({ name: "AES-GCM", iv: b64(env.iv) }, key, b64(env.ct));
  return { data: JSON.parse(new TextDecoder().decode(plain)), password };
}

function finishBoot() {
  const bootEl = $("#boot"), ref = $("#btn-refresh");
  if (bootEl) { bootEl.classList.add("hide"); setTimeout(() => bootEl.remove(), 600); }
  if (ref) { ref.innerHTML = "Datos del día"; ref.disabled = true; ref.onclick = null; }
  const lg = $("#login");
  if (lg) lg.hidden = true;
  render();
}

function askPassword() {
  return new Promise((resolve) => {
    const box = $("#login"), form = $("#login-form"), inp = $("#login-pass"),
      btn = $("#login-btn"), err = $("#login-err"), rem = $("#login-remember");
    box.hidden = false;
    setTimeout(() => inp.focus(), 150);
    form.onsubmit = async (ev) => {
      ev.preventDefault();
      btn.disabled = true; btn.textContent = "Comprobando…"; err.textContent = "";
      try {
        const out = await decryptWith(inp.value);
        if (rem.checked) localStorage.setItem(KEY_STORE, inp.value);
        resolve(out);
      } catch (e) {
        err.textContent = "Contraseña incorrecta.";
        inp.value = ""; inp.focus();
      } finally {
        btn.disabled = false; btn.textContent = "Entrar";
      }
    };
  });
}

async function boot() {
  const bootEl = $("#boot"), msg = $("#boot-msg");
  let tries = 0;
  if (ENC_BUILD) {
    msg.textContent = "Acceso privado…";
    let out = null;
    const saved = localStorage.getItem(KEY_STORE);
    if (saved) { try { out = await decryptWith(saved); } catch (e) { localStorage.removeItem(KEY_STORE); } }
    if (!out) out = await askPassword();
    S.data = out.data; S.staticMode = true;
    finishBoot();
    return;
  }
  if (STATIC_BUILD) {                       // export para hosting estático: no hay API que sondear
    msg.textContent = "Cargando datos publicados…";
    if (await loadStaticPayload()) { finishBoot(); return; }
  }
  while (true) {
    tries++;
    try {
      const r = await fetch("/api/dashboard", { cache: "no-store" });
      if (r.ok) { S.data = await r.json(); break; }
      if (r.status === 404 || r.status === 405 || r.status === 403) {
        msg.textContent = "Cargando datos publicados…";
        if (await loadStaticPayload()) break;
      }
      const st = await (await fetch("/api/status", { cache: "no-store" })).json();
      const stt = st.state || {};
      msg.textContent = stt.message || "Construyendo el dashboard…";
      if (stt.progress) msg.textContent += ` (${Math.round(stt.progress * 100)} %)`;
    } catch (e) {
      if (tries >= 2) {
        msg.textContent = "Cargando datos publicados…";
        if (await loadStaticPayload()) break;
      }
      msg.textContent = "Reintentando conexión con el motor…";
    }
    await new Promise((res) => setTimeout(res, Math.min(2500 + tries * 250, 6000)));
  }
  bootEl.classList.add("hide");
  setTimeout(() => bootEl.remove(), 600);
  if (S.staticMode) {
    const b = $("#btn-refresh");
    if (b) {
      b.innerHTML = "Datos del día";
      b.disabled = true;
      b.title = "Sitio estático: los datos se regeneran automáticamente cada día";
      b.onclick = null;
    }
    const st = $("#status-pill");
    if (st && !st.dataset.keep) st.title = "Sitio estático · se actualiza solo cada día";
  }
  render();
}

/* ───────────── render global ───────────── */
function render() {
  renderStatus();
  renderHero();
  renderKpis();
  renderSignals();
  renderPortfolio();
  renderEquityChart();
  renderAnnual();
  renderCalendar();
  renderMetrics();
  renderCorrelation();
  renderDrawdown();
  renderWeights();
  renderRadar();
  renderHistory();
  renderFooter();
  bindControls();
  wireCapitalInputs();
  $$("section").forEach((s, i) => { s.classList.add("fade-in"); s.style.animationDelay = (i * 40) + "ms"; });
}

function renderStatus() {
  const d = S.data, h = d.data_health || {};
  $("#data-date").textContent = fmtDate(h.last_data_date);
  S.capital = Number(window.localStorage.getItem("tridente_capital")) || Number(d.capital) || 250000;
  syncCapitalInputs();
  $("#period-pill").innerHTML = `Histórico desde <b>${d.period_start || "—"}</b> · ${d.n_common_months || 0} meses`;
  const pill = $("#status-pill"), txt = $("#status-txt");
  txt.innerHTML = `Datos hasta <b>${fmtDate(h.last_data_date)}</b> · <span class="muted">${h.stock_tickers || 0} acciones · ${h.etf_tickers || 0} ETFs</span>`;
  pill.querySelector(".dot").className = "dot";
}

function renderHero() {
  const box = $("#hero-systems");
  box.innerHTML = "";
  const order = ["marea", "pezvela", "meteoro"];
  order.forEach((k) => {
    const s = S.data.systems[k], m = s.metrics || {};
    const card = el("div", "tri-card");
    card.innerHTML = `
      <div class="tri-bar" style="background:${COLORS[k]}"></div>
      <div>
        <div class="tri-name" style="color:${COLORS[k]}">${s.name}</div>
        <div class="tri-kind">${s.kind} · ${s.extra.kind_label || ""}</div>
      </div>
      <div class="tri-val">
        <b class="${cls(m.ytd)}">${pct(m.ytd, 1, true)}</b>
        <span>YTD · CAGR ${pct(m.cagr, 1)}</span>
      </div>`;
    box.appendChild(card);
  });
}

function renderKpis() {
  const d = S.data, k = d.kpis, spy = d.benchmark.metrics || {};
  const combo = computeCombinedMetrics();
  const tiles = [
    { label: "TRIDENTE · YTD", value: pct(combo.ytd, 1, true), note: `S&P 500 ${pct(spy.ytd, 1, true)}`, tone: cls(combo.ytd) },
    { label: "Rentabilidad anual", value: pct(combo.cagr, 1), note: `desde ${d.period_start}`, tone: "neu" },
    { label: "Sharpe", value: num(combo.sharpe), note: `S&P 500 ${num(spy.sharpe)}`, tone: "neu" },
    { label: "Peor caída", value: pct(combo.maxdd, 1), note: `S&P 500 ${pct(spy.maxdd, 1)}`, tone: "neg" },
    { label: "Mejor sistema", value: k.best_system || "—", note: `CAGR ${pct(k.best_cagr, 1)}`, tone: "neu" },
    { label: "Liquidez media", value: pct(k.avg_liquidity, 1), note: `${k.n_signals} posiciones vivas`, tone: "neu" },
  ];
  $("#kpis").innerHTML = tiles.map((t) => `
    <div class="kpi">
      <div class="kpi-label">${t.label}</div>
      <div class="kpi-value ${t.tone}">${t.value}</div>
      <div class="kpi-note">${t.note}</div>
    </div>`).join("");
}

/* ───────────── señales ───────────── */
function chipsList(list, kind, names, emptyText) {
  if (!list || !list.length) {
    return `<span class="muted" style="font-size:12px">${emptyText || "Sin cambios"}</span>`;
  }
  return list.map((x) => {
    const t = typeof x === "string" ? x : x.ticker;
    const w = typeof x === "string" ? null : (x.to != null ? x.to : x.weight);
    return `<span class="chip ${kind}"><b class="tk">${t}</b>${w != null && kind !== "sell" ? `<span class="w">${pct(w, 1)}</span>` : ""}</span>`;
  }).join("");
}

function deltaList(list, kind) {
  if (!list || !list.length) return `<span class="muted" style="font-size:12px">Sin cambios</span>`;
  return list.map((x) => {
    const arrow = `${pct(x.from, 1)} → <b>${pct(x.to, 1)}</b>`;
    return `<span class="chip ${kind}" title="Peso actual ${pct(x.from, 1)} · peso objetivo ${pct(x.to, 1)}">` +
           `<b class="tk">${x.ticker}</b><span class="w">${arrow}</span></span>`;
  }).join("");
}

function renderSignals() {
  const box = $("#signal-cards");
  box.innerHTML = "";
  ["marea", "pezvela", "meteoro"].forEach((key) => {
    const s = S.data.systems[key], sig = s.signal, ex = s.extra;
    const prov = sig.provisional_weights || [];
    const ch = sig.changes || { buy: [], sell: [], hold: [] };
    const card = el("div", "card");
    const glow = `<div class="card-glow" style="background:${COLORS[key]}"></div>`;
    let extraRows = "";
    if (key === "marea") {
      const mr = sig.mean_reversion || {};
      const cv = covInfo(ex);
      extraRows = `
        <div class="split" title="${cv.tip}"><span>ETFs analizados</span><b class="${cv.cls}">${cv.txt}</b>${cv.extra}</div>
        <div class="split"><span>Sub-estrategias activas</span><b>${(sig.sub_strategies || []).length} / 10</b></div>
        <div class="split" title="Reversión a la media: si el acumulado de los TRES últimos cierres mensuales es ≥ +10 %, el mes siguiente el libro va a 100 % BIL y los modelos se desactivan"><span>Regla reversión (3 cierres ≥ +10 %)</span><b class="${mr.active ? "neg" : "pos"}">${mr.active ? "ACTIVA → BIL" : "no activa"}</b></div>
        <div class="split"><span>Acumulado 3 cierres</span><b>${pct(mr.cumulative, 1, true)}</b>${mr.window && mr.window.length ? ` <span class="muted" style="font-size:11px">${mr.window.join(" · ")}</span>` : ""}</div>`;
    } else if (key === "pezvela") {
      const st = ex.stats || {};
      const liq = ex.liquidity ?? 0;
      const cv = covInfo(ex);
      extraRows = `
        <div class="split" title="${cv.tip}"><span>Valores analizados</span><b class="${cv.cls}">${cv.txt}</b>${cv.extra}${cv.badge}</div>
        <div class="split"><span>Referencia del RSC (52 sem)</span><b>${ex.rsc_bench || "S&amp;P 500"}</b></div>
        <div class="split"><span>Filtro de mercado (SPY &gt; SMA40w)</span><b class="${ex.market_ok ? "pos" : "neg"}">${ex.market_ok ? "ALCISTA" : "BAJISTA"}</b></div>
        <div class="split"><span>SPY sobre su SMA40w${ex.week_closed === false ? " · provisional" : ""}</span><b class="${cls(ex.market_dist)}">${ex.market_dist == null ? "—" : pct((ex.market_dist || 0) / 100, 1, true)}</b></div>
        <div class="split"><span>Cruces del RSC esta semana</span><b>${st.crosses ?? "—"}</b></div>
        <div class="split"><span>Cruces la semana anterior</span><b class="muted">${st.crosses_prev_week ?? "—"}</b></div>
        <div class="split"><span>Pasan la calidad 6/6</span><b>${st.quality_candidates ?? 0} de ${st.quality_checked ?? 0} comprobados</b></div>
        <div class="split"><span>Posiciones en cartera</span><b>${(ex.positions || []).filter((p) => p.class !== "cash").length} / ${ex.max_positions || 12}</b></div>
        <div class="split"><span>Liquidez</span><b class="${liq > 0.005 ? "muted" : ""}">${pct(liq, 1)}</b></div>
        <div class="split"><span>Con Atlas mensual</span><b>${st.atlas ?? 0}</b></div>`;
    } else {
      const reg = sig.regime || {};
      const cv = covInfo(ex);
      extraRows = `
        <div class="split"><span>Régimen SPY ROC12</span><b class="${reg.ok ? "pos" : "neg"}">${reg.ok ? "ALCISTA" : "REFUGIO"}</b></div>
        <div class="split"><span>ROC 12M del S&P 500</span><b class="${cls(reg.spy_roc12)}">${pct((reg.spy_roc12 || 0) / 100, 1, true)}</b></div>
        <div class="split" title="Con el ROC12 del S&P 500 negativo el libro va entero al mejor de IEF/BIL/SHY por momentum de 3 meses; ahí va también el remanente que deja libre el tope del 30 %"><span>Refugio (régimen bajista)</span><b>${ex.refuge ? `mejor de IEF/BIL/SHY · hoy ${ex.refuge}` : "—"}</b></div>
        <div class="split"><span>Filtro R² (252d)</span><b>&gt; 0,60</b></div>
        <div class="split" title="${cv.tip}"><span>Valores analizados</span><b class="${cv.cls}">${cv.txt}</b>${cv.extra}${cv.badge}</div>`;
    }

    const buyLabel = key === "pezvela" ? "Entra en cartera" : "Comprar";

    // VELA: lo que pide el sistema es ver los cruces de ESTA semana, no los de antes
    let crossBlock = "", eligibleBlock = "";
    if (key === "pezvela") {
      // Con el filtro de mercado apagado VELA no compra nada nuevo (las abiertas se mantienen):
      // sin avisar, la lista de cruces de la semana parecería una orden de compra.
      const mktOff = ex.market_ok === false;
      const cands = (ex.candidates || []).slice(0, 10);
      const elig = (ex.eligible_all || []);
      const entering = new Set(ex.entered || []);
      eligibleBlock = elig.length ? `
        <div>
          <div class="rowlbl">Pasan el 6/6 y cruzan esta semana <span class="muted">(${elig.length})</span>${mktOff ? ' <span class="neg">· filtro bajista: sin entradas nuevas</span>' : ""}</div>
          <div class="chips">${elig.map((r) => {
            const ent = entering.has(r.ticker);
            const fallos = (r.fails || []).filter(Boolean);
            return `<span class="chip buy" title="RSC ${num(r.rsc)} · calidad ${r.quality ?? "?"}/6${r.atlas ? " · Atlas" : ""}${ent ? " · entra esta semana" : " · sin hueco libre"}${fallos.length ? " · falla: " + fallos.join(", ") : ""}"
              style="${ent ? "" : "opacity:.55"}"><b class="tk">${r.ticker}</b><span class="w">${num(r.rsc)}${ent ? " →" : ""}</span></span>`;
          }).join("")}</div>
          ${(ex.vetoed || []).length ? `<div class="hint" style="margin-top:6px">Vetados por el 6/6: ${ex.vetoed.map((v) => `<b>${v.ticker}</b> <span class="muted">(${v.fails.join(", ") || "sin datos"})</span>`).join(" · ")}</div>` : ""}
          <div class="hint" style="margin-top:6px">${mktOff
            ? "Con SPY por debajo de su SMA40w VELA congela las entradas: no compra nada nuevo, pero las posiciones abiertas se mantienen hasta su propia señal de salida."
            : "Sólo pueden entrar tantas como huecos libres haya; el resto queda en cola. Entran por orden de RSC: primero la de RSC más alto de la lista."}</div>
        </div>` : "";
      crossBlock = `
        <div>
          <div class="rowlbl">Cruzan el RSC esta semana <span class="muted">(${ex.stats?.crosses ?? 0})</span></div>
          <div class="chips">${cands.length
            ? cands.map((r) => `<span class="chip buy" title="RSC Mansfield ${num(r.rsc)}${r.quality_ok ? " · calidad 6/6" : ""}"><b class="tk">${r.ticker}</b><span class="w">${num(r.rsc)}${r.quality_ok ? " ✓" : ""}</span></span>`).join("")
            : '<span class="muted">sin cruces esta semana</span>'}</div>
          <div class="hint" style="margin-top:6px">El número es el RSC de Mansfield en el cruce; ✓ = pasa el filtro de calidad 6/6.</div>
        </div>`;
    }
    card.innerHTML = `
      ${glow}
      <div class="card-top">
        <div class="card-head">
          <div>
            <div class="card-name" style="color:${COLORS[key]}">${s.name}</div>
            <div class="card-kind">${s.kind} · ${ex.kind_label}</div>
          </div>
          <span class="badge ok" style="margin-left:auto">Provisional</span>
        </div>
        <div class="chip" style="margin-top:12px;background:transparent;border-color:var(--line-strong)">
          <span class="w">${key === "pezvela" ? "Semana del" : "Para"}</span>
          <b>${key === "pezvela" ? fmtDate(sig.calc_date) : (sig.next_month || fmtDate(sig.calc_date))}</b>
        </div>
      </div>
      <div class="card-body">
        ${crossBlock}
        <div>
          <div class="rowlbl">${buyLabel}</div>
          <div class="chips">${chipsList(ch.buy, "buy", null, (ch.ampliar || []).length ? "Ninguna posición nueva (ver Ampliar)" : "Sin cambios")}</div>
          ${key === "pezvela" ? `<div class="hint" style="margin-top:6px">El 6/6 filtra la entrada; lo que ya está dentro no sale por calidad.
            Huecos disponibles tras las ventas: ${ex.free_slots ?? 0} de 12${(ex.free_slots ?? 0) === 0 ? " (cartera completa)" : ""}.</div>` : ""}
        </div>
        ${key === "pezvela" ? eligibleBlock : ""}
        ${(ch.ampliar || []).length ? `
        <div>
          <div class="rowlbl">Ampliar <span class="muted">ya está en cartera: hay que comprar más</span></div>
          <div class="chips">${deltaList(ch.ampliar, "buy")}</div>
        </div>` : ""}
        <div>
          <div class="rowlbl">Vender</div>
          <div class="chips">${chipsList(ch.sell, "sell")}</div>
        </div>
        ${(ch.reducir || []).length ? `
        <div>
          <div class="rowlbl">Reducir <span class="muted">ya está en cartera: hay que vender parte</span></div>
          <div class="chips">${deltaList(ch.reducir, "sell")}</div>
        </div>` : ""}
        <div>
          <div class="rowlbl">Mantener</div>
          <div class="chips">${chipsList(ch.hold, "buy")}</div>
        </div>
        <div>
          <div class="rowlbl">Cartera provisional</div>
          <div class="chips">${prov.length ? prov.map((p) => {
            const src = key === "meteoro" ? ((ex.sources || {})[p.ticker] || "") : "";
            const tag = src === "I" ? "IA" : src === "M" ? "M" : "";
            return `<span class="chip ${p.class === "cash" ? "cash" : ""}" ${tag ? `title="${tag === "IA" ? "Inercia ajustada" : "Mansfield semanal"}"` : ""}><b class="tk">${p.ticker}</b><span class="w">${pct(p.weight, 1)}${tag ? " · " + tag : ""}</span></span>`;
          }).join("") : '<span class="muted">sin datos</span>'}</div>
          ${key === "meteoro" ? '<div class="hint" style="margin-top:6px">Se alternan las fuentes: 1 por inercia ajustada (IA) y 1 por Mansfield semanal (M).</div>' : ""}
        </div>
        <div style="margin-top:auto">${extraRows}</div>
      </div>`;
    box.appendChild(card);
  });
}

/* ───────────── capital editable ───────────── */
function syncCapitalInputs() {
  $$("[data-capital]").forEach((inp) => {
    if (document.activeElement !== inp) inp.value = Math.round(S.capital);
  });
  const lbl = $("#capital-mini");
  if (lbl) lbl.textContent = money(S.capital);
}

function setCapital(v) {
  const n = Math.max(1000, Math.min(100_000_000, Math.round(Number(v) || 0)));
  S.capital = n;
  try { window.localStorage.setItem("tridente_capital", String(n)); } catch (e) { /* modo privado */ }
  syncCapitalInputs();
  renderWeights();      // recompone exposición, importes y tabla
  renderPortfolio();
}

function wireCapitalInputs() {
  $$("[data-capital]").forEach((inp) => {
    inp.addEventListener("change", () => setCapital(inp.value));
    inp.addEventListener("keydown", (e) => { if (e.key === "Enter") { inp.blur(); setCapital(inp.value); } });
  });
}

/* ───────────── cartera vigente ───────────── */
function renderPortfolio() {
  const box = $("#portfolio-cards");
  box.innerHTML = "";
  const marea = S.data.systems.marea;
  $("#cartera-month").innerHTML = `En vigor: <b>${marea.signal.hold_month || "—"}</b>`;
  ["marea", "pezvela", "meteoro"].forEach((key) => {
    const s = S.data.systems[key], w = s.signal.closed_weights || [];
    const card = el("div", "card");
    const max = Math.max(...w.map((x) => x.weight), 0.0001);
    const rows = w.length ? w.map((x) => `
      <div style="margin-bottom:10px">
        <div class="split" style="border:none;padding:0 0 4px">
          <span><b class="tk">${x.ticker}</b> <span class="muted" style="font-size:11px">${x.name}</span></span>
          <b>${pct(x.weight, 1)}</b>
        </div>
        <div class="wbar"><i style="width:${(x.weight / max) * 100}%;background:${CLASS_COLOR[x.class] || COLORS[key]}"></i></div>
      </div>`).join("") : '<div class="muted">Sin posiciones</div>';
    card.innerHTML = `
      <div class="card-top">
        <div class="card-head">
          <div>
            <div class="card-name" style="color:${COLORS[key]}">${s.name}</div>
            <div class="card-kind">${s.kind}</div>
          </div>
          <span class="badge" style="margin-left:auto">${w.filter((x) => x.ticker !== "Liquidez").length} posiciones</span>
        </div>
      </div>
      <div class="card-body">
        <div class="split"><span>Cierre de referencia</span><b>${s.signal.closed_date || "—"}</b></div>
        ${rows}
        <div class="split" style="margin-top:auto"><span>Rentabilidad YTD</span><b class="${cls(s.metrics.ytd)}">${pct(s.metrics.ytd, 1, true)}</b></div>
        <div class="split"><span>CAGR histórico</span><b>${pct(s.metrics.cagr, 1)}</b></div>
      </div>`;
    box.appendChild(card);
  });
}

/* ───────────── series y métricas en vivo ───────────── */
function combinedSeries() {
  const w = S.weights;
  const total = w.marea + w.pezvela + w.meteoro || 1;
  const maps = {};
  ["marea", "pezvela", "meteoro"].forEach((k) => {
    const m = new Map();
    (S.data.systems[k].monthly || []).forEach((p) => m.set(p.d, p.r));
    maps[k] = m;
  });
  const dates = Array.from(maps.marea.keys()).filter((d) => maps.pezvela.has(d) && maps.meteoro.has(d)).sort();
  const abiertos = new Set();                    // el mes en curso lo marcan los componentes
  ["marea", "pezvela", "meteoro"].forEach((k) =>
    (S.data.systems[k].monthly || []).forEach((p) => { if (p.prov) abiertos.add(p.d); }));
  return dates.map((d) => ({
    prov: abiertos.has(d),
    d,
    r: (maps.marea.get(d) * w.marea + maps.pezvela.get(d) * w.pezvela + maps.meteoro.get(d) * w.meteoro) / total,
  }));
}

function statsFrom(series) {
  if (!series.length) return {};
  // Trayectoria (total, YTD, caída) sobre todo lo dibujado, mes en curso incluido; lo que se
  // anualiza (CAGR, vol, Sharpe, Sortino, recuentos) sólo sobre meses cerrados: meter un mes de
  // 11 días en la media y la desviación sesgaría el Sharpe y lo haría moverse cada día.
  const cerrados = series.filter((p) => p.prov !== true);
  let eq = 1, peak = 1, maxdd = 0, eqc = 1;
  const rets = [];
  let ytd = 1;
  const lastYear = new Date(series[series.length - 1].d).getFullYear();
  series.forEach((p) => {
    eq *= 1 + p.r;
    peak = Math.max(peak, eq);
    maxdd = Math.min(maxdd, eq / peak - 1);
    if (new Date(p.d).getFullYear() === lastYear) ytd *= 1 + p.r;
  });
  cerrados.forEach((p) => eqc *= 1 + p.r);
  rets.push(...cerrados.map((p) => p.r));
  const n = rets.length || series.length;
  const mean = rets.reduce((a, b) => a + b, 0) / n;
  const varr = rets.reduce((a, b) => a + (b - mean) ** 2, 0) / Math.max(1, n - 1);
  const vol = Math.sqrt(varr) * Math.sqrt(12);
  const years = n / 12;
  const sorted = rets.slice().sort((a, b) => a - b);
  const downs = rets.filter((r) => r < 0);
  const dvol = downs.length > 1 ? Math.sqrt(downs.reduce((a, b) => a + (b - mean) ** 2, 0) / (downs.length - 1)) * Math.sqrt(12) : 0;
  return {
    total: eq - 1, cagr: Math.pow(cerrados.length ? eqc : eq, 1 / years) - 1, vol,
    sharpe: vol > 0 ? (mean * 12) / vol : 0,
    sortino: dvol > 0 ? (mean * 12) / dvol : 0,
    calmar: maxdd < 0 ? (Math.pow(cerrados.length ? eqc : eq, 1 / years) - 1) / Math.abs(maxdd) : 0,
    maxdd, ytd: ytd - 1, months: n,
    win_rate: rets.filter((r) => r > 0).length / n,
    best_month: sorted[sorted.length - 1], worst_month: sorted[0],
    current_dd: eq / peak - 1,
    start: series[0].d.slice(0, 7),
  };
}

function computeCombinedMetrics() {
  return statsFrom(combinedSeries());
}

function curveFrom(series, base = 100) {
  let eq = base;
  return series.map((p) => ({ d: p.d, v: (eq *= 1 + p.r), prov: p.prov === true }));
}

function slicePeriod(points) {
  if (S.period === "all" || !points.length) return points;
  const last = new Date(points[points.length - 1].d);
  let from;
  if (S.period === "ytd") from = new Date(last.getFullYear(), 0, 1);
  else from = new Date(last.getFullYear() - Number(S.period), last.getMonth(), 1);
  const out = points.filter((p) => new Date(p.d) >= from);
  return out.length > 1 ? out : points;
}

/* ───────────── mes en curso (provisional) ───────────── */
function provInfo() {
  const p = (S.data && S.data.provisional) || null;
  if (!p) return {};
  const f = new Date(p.as_of + "T00:00:00");
  const dia = `${String(f.getDate()).padStart(2, "0")} ${monthES[f.getMonth()]}`;
  return { mes: p.month, anio: +p.month.slice(0, 4), ult: p.as_of, mesES: monthES[+p.month.slice(5, 7) - 1],
           sistemas: new Set(p.systems || []), tieneAbierto: (k) => (p.systems || []).indexOf(k) >= 0,
           texto: `${p.label} provisional · hasta el ${dia}`,
           nota: `${p.label} está en curso: es provisional hasta el cierre mensual `
               + `(datos hasta el ${dia})` };
}

function provCaption() {
  const p = provInfo();
  return !p.mes ? "" : `<p class="muted" style="font-size:11px;line-height:1.45;margin:9px 2px 0">
      * ${p.nota}. Las cifras del año en curso se recalculan cada día hasta el cierre mensual.</p>`;
}

/* ───────────── gráfico principal ───────────── */
const PLOT_LAYOUT = {
  paper_bgcolor: "rgba(0,0,0,0)", plot_bgcolor: "rgba(0,0,0,0)",
  font: { family: "Inter, system-ui, sans-serif", color: "#a9bdd4", size: 11.5 },
  margin: { l: 52, r: 14, t: 12, b: 34 },
  hovermode: "x unified",
  hoverlabel: { bgcolor: "rgba(8,16,28,.95)", bordercolor: "rgba(122,170,230,.35)", font: { color: "#eaf2fb", size: 12 } },
  xaxis: { gridcolor: "rgba(122,170,230,.07)", zeroline: false, showspikes: true, spikecolor: "rgba(122,170,230,.4)", spikethickness: 1, spikedash: "dot" },
  yaxis: { gridcolor: "rgba(122,170,230,.07)", zeroline: false, ticksuffix: "" },
  legend: { orientation: "h", y: 1.09, x: 0, font: { size: 11.5 } },
};
const PLOT_CONFIG = { displayModeBar: false, responsive: true };

function seriesCurve(key) {
  if (key === "combined") return curveFrom(combinedSeries());
  if (key === "spy") return (S.data.benchmark.curve || []).map((p) => ({ d: p.d, v: p.v, prov: p.prov === true }));
  return (S.data.systems[key].curve || []).map((p) => ({ d: p.d, v: p.v, prov: p.prov === true }));
}

function renderEquityChart() {
  const traces = [];
  const keys = ["marea", "pezvela", "meteoro", "combined", "spy"].filter((k) => S.visible[k]);
  const series = {};
  let commonStart = "0000";
  keys.forEach((k) => {
    const pts = slicePeriod(seriesCurve(k));
    series[k] = pts;
    if (pts.length) commonStart = pts[0].d > commonStart ? pts[0].d : commonStart;
  });
  keys.forEach((key) => {
    const raw = series[key];
    if (!raw || !raw.length) return;
    const pts = raw.filter((p) => p.d >= commonStart);
    if (pts.length < 2) return;
    const base = pts[0].v;
    const pv = provInfo(), ult = pts.length - 1;
    const abierto = !!(pv.mes && pts[ult] && pts[ult].prov === true);
    traces.push({
      x: pts.map((p) => p.d), y: pts.map((p) => (p.v / base) * 100),
      type: "scatter", mode: abierto ? "lines+markers" : "lines", name: LABELS[key],
      marker: { size: pts.map((p) => (p.prov === true ? 6 : 0)), symbol: "circle-open",
                color: COLORS[key], line: { width: 1.6, color: COLORS[key] } },
      customdata: pts.map((p) => (p.prov === true ? " · " + pv.texto : "")),
      line: {
        color: COLORS[key], width: key === "combined" ? 2.6 : 1.9,
        dash: key === "spy" ? "dot" : "solid",
      },
      hovertemplate: "%{y:.1f}%{customdata}<extra>" + LABELS[key] + "</extra>",
    });
  });
  const layout = JSON.parse(JSON.stringify(PLOT_LAYOUT));
  layout.yaxis.ticksuffix = "";
  const useLog = S.period === "all" || S.period === "5" || S.period === "3";
  if (useLog) {
    layout.yaxis.type = "log";
    layout.yaxis.tickformat = ",.0f";
    layout.yaxis.showminor = false;
    const tv = [20, 50, 100, 200, 500, 1000, 2000, 5000, 10000];
    layout.yaxis.tickvals = tv;
    layout.yaxis.ticktext = tv.map((v) => nf0.format(v));
  } else {
    layout.yaxis.rangemode = "tozero";
  }
  Plotly.react("chart-equity", traces, layout, PLOT_CONFIG);
}

/* ───────────── anual ───────────── */
function annualMatrix() {
  const years = new Set();
  ["marea", "pezvela", "meteoro", "combined", "spy"].forEach((k) => (S.data.systems[k] || S.data.benchmark).annual?.forEach((a) => years.add(a.year)));
  const yl = Array.from(years).sort();
  const map = (k) => {
    const src = k === "spy" ? S.data.benchmark : k === "combined" ? S.data.combined : S.data.systems[k];
    const m = new Map(); (src.annual || []).forEach((a) => m.set(a.year, a.ret)); return m;
  };
  const maps = { marea: map("marea"), pezvela: map("pezvela"), meteoro: map("meteoro"), combined: new Map(), spy: map("spy") };
  // combinado con los pesos actuales
  const bs = combinedSeries().reduce((acc, p) => {
    const y = new Date(p.d).getFullYear();
    acc[y] = (acc[y] || 1) * (1 + p.r); return acc;
  }, {});
  Object.entries(bs).forEach(([y, v]) => maps.combined.set(Number(y), v - 1));
  return { years: yl, maps };
}

function renderAnnual() {
  const { years, maps } = annualMatrix();
  const keys = ["marea", "pezvela", "meteoro", "combined", "spy"];
  const head = `<tr><th>Año</th>${keys.map((k) => `<th style="color:${COLORS[k]}">${LABELS[k]}</th>`).join("")}</tr>`;
  const fy = ["marea", "pezvela", "meteoro"].map((k) => maps[k].size ? Math.min(...Array.from(maps[k].keys())) : -Infinity);
  const firstYear = Math.max(...fy);
  const pv = provInfo();
  const rows = years.filter((y) => y >= firstYear).map((y) => `<tr>
      <td${keys.some((k) => y === pv.anio && pv.tieneAbierto(k)) ? ` title="${pv.nota}"` : ""}>${y}${keys.some((k) => y === pv.anio && pv.tieneAbierto(k)) ? `<span class="muted">*</span>` : ""}</td>
      ${keys.map((k) => { const v = maps[k].get(y); const ab = y === pv.anio && pv.tieneAbierto(k); return `<td class="${cls(v)}${ab ? " prov" : ""}" style="background:${v == null ? "transparent" : heatColor(v)}">${v == null ? "—" : pct(v, 1, true)}</td>`; }).join("")}
    </tr>`).join("");
  $("#annual-table").innerHTML = `<table><thead>${head}</thead><tbody>${rows}</tbody></table>` + provCaption();

  // resumen
  const stats = {};
  keys.forEach((k) => {
    const series = k === "combined" ? combinedSeries()
      : (k === "spy" ? S.data.benchmark.monthly : S.data.systems[k].monthly) || [];
    stats[k] = statsFrom(series.map((p) => ({ d: p.d, r: p.r, prov: p.prov === true })));
  });
  const defs = [
    ["Total", (s) => pct(s.total, 0, true)],
    ["Anual", (s) => pct(s.cagr, 1)],
    ["Volatilidad", (s) => pct(s.vol, 1)],
    ["Sharpe", (s) => num(s.sharpe)],
    ["Peor caída", (s) => pct(s.maxdd, 1)],
    ["YTD", (s) => pct(s.ytd, 1, true)],
  ];
  const short = { marea: "MAR", pezvela: "PEZ", meteoro: "MET", combined: "TRI", spy: "SPY" };
  $("#annual-mini").innerHTML = `<table style="font-size:10.8px"><thead><tr><th></th>${keys.map((k) => `<th style="color:${COLORS[k]};padding:7px 3px">${short[k]}</th>`).join("")}</tr></thead>
    <tbody>${defs.map(([lbl, fn]) => `<tr><td style="padding:7px 3px">${lbl}</td>${keys.map((k) => `<td class="${lbl === "Peor caída" ? "neg" : ""}" style="padding:7px 3px">${fn(stats[k] || {})}</td>`).join("")}</tr>`).join("")}</tbody></table>`;
}

/* ───────────── calendario ───────────── */
function renderCalendar() {
  const tabs = $("#cal-tabs");
  const keys = ["marea", "pezvela", "meteoro", "combined", "spy"];
  tabs.innerHTML = keys.map((k) => `<button class="tab ${S.calTab === k ? "on" : ""}" data-cal="${k}">${LABELS[k]}</button>`).join("");
  $$("[data-cal]").forEach((b) => b.onclick = () => { S.calTab = b.dataset.cal; renderCalendar(); });

  let cal;
  if (S.calTab === "combined") {
    cal = {};
    combinedSeries().forEach((p) => {
      const d = new Date(p.d), y = d.getFullYear();
      cal[y] = cal[y] || {};
      cal[y][monthES[d.getMonth()]] = (1 + (cal[y][monthES[d.getMonth()]] || 0)) * (1 + p.r) - 1;
    });
  } else {
    cal = (S.calTab === "spy" ? S.data.benchmark.calendar : S.data.systems[S.calTab].calendar) || {};
  }
  const pv = provInfo();
  const years = Object.keys(cal).map(Number).sort();
  const head = `<tr><th>Año</th>${monthES.map((m) => `<th>${m}</th>`).join("")}<th>Año</th></tr>`;
  const rows = years.map((y) => {
    const row = cal[y] || {};
    let acc = 1;
    const cells = monthES.map((m) => {
      const v = row[m];
      if (v == null) return `<td class="empty muted">·</td>`;
      acc *= 1 + v;
      const abierto = y === pv.anio && m === pv.mesES && pv.tieneAbierto(S.calTab);
      return `<td style="background:${heatColor(v, true)}" class="${cls(v)}${abierto ? " prov" : ""}"`
           + `${abierto ? ` title="${pv.nota}"` : ""}>${pct(v, 1, true)}</td>`;
    }).join("");
    const ya = row.Y != null ? row.Y : acc - 1;
    const añoAbierto = y === pv.anio && pv.tieneAbierto(S.calTab);
    return `<tr><td class="yr">${y}${y === pv.anio ? (pv.tieneAbierto(S.calTab) ? `<span class="muted">*</span>` : "") : ""}</td>${cells}`
         + `<td class="${cls(ya)}${añoAbierto ? " prov" : ""}" style="font-weight:700"${añoAbierto ? ` title="${pv.nota}"` : ""}>${pct(ya, 1, true)}</td></tr>`;
  }).join("");
  $("#calendar").innerHTML = `<table class="cal"><thead>${head}</thead><tbody>${rows}</tbody></table>` + provCaption();
}

/* ───────────── métricas ───────────── */
function renderMetrics() {
  const keys = ["marea", "pezvela", "meteoro", "combined", "spy"];
  const data = {};
  keys.forEach((k) => {
    if (k === "combined") data[k] = computeCombinedMetrics();
    else if (k === "spy") data[k] = S.data.benchmark.metrics;
    else data[k] = S.data.systems[k].metrics;
  });
  const cols = [
    ["Rentab. anual", (m) => pct(m.cagr, 1)],
    ["YTD", (m) => `<span class="${cls(m.ytd)}">${pct(m.ytd, 1, true)}</span>`],
    ["Volatilidad", (m) => pct(m.vol, 1)],
    ["Sharpe", (m) => num(m.sharpe)],
    ["Sortino", (m) => num(m.sortino)],
    ["Peor caída", (m) => `<span class="neg">${pct(m.maxdd, 1)}</span>`],
    ["DD actual", (m) => pct(m.current_dd, 1)],
    ["Meses +", (m) => (m.win_rate == null ? "—" : pct(m.win_rate, 0))],
    ["Mejor mes", (m) => `<span class="pos">${pct(m.best_month, 1, true)}</span>`],
    ["Peor mes", (m) => `<span class="neg">${pct(m.worst_month, 1, true)}</span>`],
    ["Desde", (m) => `<span class="muted">${m.start || "—"}</span>`],
  ];
  const head = `<tr><th>Sistema</th>${cols.map((c) => `<th>${c[0]}</th>`).join("")}</tr>`;
  const rows = keys.map((k) => {
    const m = data[k] || {};
    return `<tr>
      <td><span style="color:${COLORS[k]};font-weight:650">${LABELS[k]}</span></td>
      ${cols.map((c) => `<td>${c[1](m)}</td>`).join("")}
    </tr>`;
  }).join("");
  const pv = provInfo();
  const mm = (S.data.combined || {}).metrics || S.data.systems.marea.metrics || {};
  const ncier = mm.closed_months, fcier = mm.end;
  const nota = !pv.mes ? "" : `<p class="muted" style="margin:11px 2px 1px;font-size:11.5px;line-height:1.5">
      ${pv.nota}. <strong>YTD</strong>, <strong>Peor caída</strong> y <strong>DD actual</strong> lo incluyen
      (son cifras a hoy); CAGR, volatilidad, Sharpe, Sortino, «meses +» y mejor/peor mes se miden
      sobre ${ncier != null ? ncier + " " : "los "}meses cerrados${fcier ? " (hasta " + fcier + ")" : ""}.</p>`;
  $("#metrics-table").innerHTML = `<table class="metrics"><thead>${head}</thead><tbody>${rows}</tbody></table>` + nota;
  const box = $("#prov-note");
  if (box) box.innerHTML = pv.mes ? `<span class="muted"> ${pv.nota}; el punto con círculo vacío es ése.</span>` : "";
}

/* ───────────── correlación ───────────── */
function renderCorrelation() {
  const c = S.data.correlation;
  const labels = c.labels.map((l) => LABELS[l] || l);
  const grid = $("#corr-grid");
  grid.style.gridTemplateColumns = `90px repeat(${labels.length}, minmax(56px, 1fr))`;
  let html = `<div class="corr-head"></div>` + labels.map((l) => `<div class="corr-head">${l.split(" ")[0]}</div>`).join("");
  c.matrix.forEach((row, i) => {
    html += `<div class="corr-head" style="justify-content:flex-start">${labels[i]}</div>`;
    row.forEach((v, j) => {
      const self = i === j;
      const alpha = 0.08 + Math.max(0, Math.min(1, v)) * 0.5;
      const bg = self ? "rgba(120,170,230,.10)" : `rgba(53,208,230,${alpha})`;
      html += `<div class="corr-cell" style="background:${bg}">${self ? "—" : num(v)}</div>`;
    });
  });
  grid.innerHTML = html;
}

/* ───────────── drawdown ───────────── */
function renderDrawdown() {
  const traces = [];
  const keys = ["marea", "pezvela", "meteoro", "combined", "spy"].filter((k) => S.visible[k]);
  let commonStart = "0000";
  keys.forEach((k) => {
    const pts = slicePeriod(seriesCurve(k));
    if (pts.length) commonStart = pts[0].d > commonStart ? pts[0].d : commonStart;
  });
  keys.forEach((key) => {
    const pts = slicePeriod(seriesCurve(key)).filter((p) => p.d >= commonStart);
    if (!pts.length) return;
    let peak = -Infinity;
    const dd = pts.map((p) => { peak = Math.max(peak, p.v); return (p.v / peak - 1) * 100; });
    const abierto = pts[pts.length - 1] && pts[pts.length - 1].prov === true;
    traces.push({
      x: pts.map((p) => p.d), y: dd, type: "scatter", mode: abierto ? "lines+markers" : "lines", name: LABELS[key],
      marker: { size: pts.map((p) => (p.prov === true ? 6 : 0)), symbol: "circle-open",
                color: COLORS[key], line: { width: 1.6, color: COLORS[key] } },
      customdata: pts.map((p) => (p.prov === true ? " · " + provInfo().texto : "")),
      line: { color: COLORS[key], width: key === "spy" ? 1.4 : 1.6, dash: key === "spy" ? "dot" : "solid" },
      fill: key === "spy" ? "none" : "tozeroy", fillcolor: key === "spy" ? "rgba(0,0,0,0)" : hexRgba(COLORS[key], 0.13),
      hovertemplate: "%{y:.1f} %{customdata}<extra>" + LABELS[key] + "</extra>",
    });
  });
  const layout = JSON.parse(JSON.stringify(PLOT_LAYOUT));
  layout.margin = { l: 52, r: 14, t: 6, b: 30 };
  layout.legend = { orientation: "h", y: 1.14, x: 0, font: { size: 11 } };
  layout.yaxis.ticksuffix = " %";
  Plotly.react("chart-dd", traces, layout, PLOT_CONFIG);
}

/* ───────────── selector de pesos ───────────── */
function renderWeights() {
  const box = $("#sliders");
  if (!box.dataset.built) {
    box.innerHTML = ["marea", "pezvela", "meteoro"].map((k) => `
      <div class="slider-row">
        <span class="lbl" style="color:${COLORS[k]}">${LABELS[k]}</span>
        <input type="range" min="0" max="100" step="1" value="${S.weights[k]}" data-w="${k}">
        <span class="val" data-wv="${k}">—</span>
      </div>`).join("");
    box.dataset.built = "1";
    $$("[data-w]").forEach((inp) => {
      inp.addEventListener("input", () => {
        S.weights[inp.dataset.w] = Number(inp.value);
        updateWeightViews();
      });
    });
  }
  updateWeightViews();
  ensurePresetToolbar();          // sube los 5 botones aunque el index.html sea el viejo
}

function updateWeightViews() {
  const total = S.weights.marea + S.weights.pezvela + S.weights.meteoro || 1;
  ["marea", "pezvela", "meteoro"].forEach((k) => {
    const v = $("[data-wv='" + k + "']");
    if (v) v.textContent = pct(S.weights[k] / total, 0);
    const inp = $("[data-w='" + k + "']");
    if (inp && Number(inp.value) !== S.weights[k]) inp.value = S.weights[k];
  });
  $("#w-sum").textContent = (total === 100 ? "100 %" : `${total} → 100 %`);
  syncCapitalInputs();

  // exposición combinada
  const expo = {};
  const sysExp = {};
  ["marea", "pezvela", "meteoro"].forEach((k) => {
    const share = S.weights[k] / total;
    const w = S.data.systems[k].signal.provisional_weights || [];
    let sum = 0;
    w.forEach((p) => {
      expo[p.ticker] = expo[p.ticker] || { ticker: p.ticker, cls: p.class, weight: 0, systems: [] };
      expo[p.ticker].weight += p.weight * share;
      expo[p.ticker].systems.push(LABELS[k]);
      sum += p.weight;
    });
    sysExp[k] = share * Math.max(0, 1 - sum);
  });
  const liquidity = Object.values(sysExp).reduce((a, b) => a + b, 0);
  if (liquidity > 0.0005) expo.__CASH__ = { ticker: "Liquidez", cls: "cash", weight: liquidity, systems: ["—"] };

  const rows = Object.values(expo).sort((a, b) => b.weight - a.weight);
  const byClass = { equity: 0, bond: 0, commodity: 0, cash: 0, stock: 0 };
  rows.forEach((r) => { byClass[r.cls] = (byClass[r.cls] || 0) + r.weight; });

  // donut
  const svg = $("#donut"), R = 78, r0 = 52, cx = 100, cy = 100;
  let angle = -Math.PI / 2, paths = "";
  const order = ["equity", "stock", "bond", "commodity", "cash"];
  order.forEach((c) => {
    const v = byClass[c] || 0;
    if (v <= 0.0005) return;
    const a0 = angle, a1 = angle + v * Math.PI * 2;
    const large = a1 - a0 > Math.PI ? 1 : 0;
    const p = (rad, a) => [cx + rad * Math.cos(a), cy + rad * Math.sin(a)];
    const [x0, y0] = p(R, a0), [x1, y1] = p(R, a1), [x2, y2] = p(r0, a1), [x3, y3] = p(r0, a0);
    paths += `<path d="M${x0},${y0} A${R},${R} 0 ${large} 1 ${x1},${y1} L${x2},${y2} A${r0},${r0} 0 ${large} 0 ${x3},${y3} Z"
      fill="${CLASS_COLOR[c]}" opacity="0.88"><title>${CLASS_LABEL[c]}: ${pct(v, 1)}</title></path>`;
    angle = a1;
  });
  svg.innerHTML = paths || `<circle cx="100" cy="100" r="70" fill="none" stroke="rgba(122,170,230,.2)" stroke-width="20"/>`;
  $("#donut-legend").innerHTML = order.filter((c) => (byClass[c] || 0) > 0.0005)
    .sort((a, b) => byClass[b] - byClass[a])
    .map((c) => `<div><i style="background:${CLASS_COLOR[c]}"></i>${CLASS_LABEL[c]}<b>${pct(byClass[c], 1)}</b></div>`).join("");

  $("#exposure-table").innerHTML = `<table><thead><tr><th>Activo</th><th>Tipo</th><th>Peso</th><th>Importe</th><th>Vía</th></tr></thead><tbody>
    ${rows.filter((r) => r.weight > 0.002).map((r) => `<tr>
      <td><b class="tk">${r.ticker}</b></td>
      <td><span class="tag" style="color:${CLASS_COLOR[r.cls]};border-color:${CLASS_COLOR[r.cls]}55">${CLASS_LABEL[r.cls]}</span></td>
      <td><b>${pct(r.weight, 1)}</b></td>
      <td class="muted">${money(r.weight * S.capital)}</td>
      <td class="muted" style="font-size:11px">${Array.from(new Set(r.systems)).join(" · ")}</td>
    </tr>`).join("")}
  </tbody></table>`;

  // KPIs combinados
  const m = computeCombinedMetrics();
  $("#combo-kpis").style.gridTemplateColumns = "1fr 1fr";
  $("#combo-kpis").innerHTML = [
    ["YTD", pct(m.ytd, 1, true), cls(m.ytd)],
    ["Anual", pct(m.cagr, 1), "neu"],
    ["Sharpe", num(m.sharpe), "neu"],
    ["Volatilidad", pct(m.vol, 1), "neu"],
    ["Peor caída", pct(m.maxdd, 1), "neg"],
    ["Sortino", num(m.sortino), "neu"],
  ].map(([l, v, c]) => `<div class="kpi" style="padding:13px"><div class="kpi-label">${l}</div><div class="kpi-value ${c}" style="font-size:21px">${v}</div></div>`).join("");

  const cashWeight = rows.filter((r) => r.cls === "cash").reduce((a, b) => a + b.weight, 0);
  const top = rows.filter((r) => r.cls !== "cash")[0] || rows[0];
  const topSys = {};
  ["marea", "pezvela", "meteoro"].forEach((k) => {
    (S.data.systems[k].signal.provisional_weights || []).forEach((p) => {
      topSys[p.ticker] = (topSys[p.ticker] || new Set()).add(LABELS[k]);
    });
  });
  const shared = Object.entries(topSys).filter(([, v]) => v.size > 1).sort((a, b) => b[1].size - a[1].size).slice(0, 2);
  let note = `El activo con más peso es <b>${top ? top.ticker : "—"}</b> (${top ? pct(top.weight, 1) : "—"}). `;
  if (shared.length) note += `Coinciden varios sistemas en <b>${shared.map(([t, v]) => `${t} (${v.size})`).join("</b> y <b>")}</b>. `;
  note += `Liquidez total (incluye T-Bills) ${pct(cashWeight + liquidity, 1)}.`;
  $("#combo-note").innerHTML = note;

  renderEquityChart(); renderDrawdown(); renderAnnual(); renderCalendar(); renderMetrics(); renderKpis();
}

/* presets de reparto ─────────────────────────────────────────────────
   Tres botones, y hasta abajo una nota que dice qué se ha usado y por qué.

     · Equiponderado          33/33/34, sin mirar los datos
     · Máx. Sharpe            heurística de siempre: sharpe × 30, mínimo 1
     · Paridad de volatilidad w ∝ 1 / vol anualizada de la ventana común

   Qué se arregló: los presets que comparan sistemas medían la vol de cada uno
   en su propia ventana (aquí: MAREA 261 meses, VELA 130, METEORO 129). No era
   comparable y sesgaba el peso hacia el sistema con más historia. Ahora se
   calculan sobre la VENTANA COMÚN, como ya hacía el gráfico combinado. Y el
   botón se llamaba «Mín. volatilidad» cuando lo que calcula es paridad de
   volatilidad: el mismo término con el que METEORO dimensiona.

   Qué se quitó, y por si se echa de menos:
     · «Paridad de riesgo» (ERC, igual contribución de varianza). Con tres
       activos y correlaciones casi iguales entre pares (+0,50 / +0,56 / +0,46)
       cae en los mismos enteros que 1/vol: medido sobre el histórico real, 41
       de 41 ventanas idénticas, y forzando las series 1 pp de máximo. El
       diagnóstico sí se queda: la nota dice qué porcentaje del riesgo aporta
       cada sistema. Si algún día deja de estar en ~1/3 cada uno, esa es la
       señal de que 1/vol se queda corta y ERC volvería a tener sentido.
     · «Mín. varianza» (Markowitz long-only con cotas 0-100 %, Frank-Wolfe).
       Óptimo correcto pero inútil aquí: el vértice es 100 % MAREA, porque sin
       cotas harían falta cortos (114 % MAREA, −5,5 % VELA, −8,5 % METEORO)
       para bajar la varianza. Un botón que siempre dice "véndelo todo y mételo
       en MAREA" no es una decisión de reparto.
   ──────────────────────────────────────────────────────────────────── */
const PRESET_KEYS = ["marea", "pezvela", "meteoro"];
const PRESET_LIST = [
  ["equal", "Equiponderado", "Reparto fijo, sin mirar los datos."],
  ["sharpe", "Máx. Sharpe", "Pesos ∝ sharpe × 30 (mínimo 1). Heurística, no optimización."],
  ["volpar", "Paridad de volatilidad", "Pesos ∝ 1 / volatilidad anualizada. Es la antigua «Mín. volatilidad»."],
];

/* meses que tienen los tres sistemas, alineados por yyyy-mm */
function presetWindow() {
  const maps = {};
  PRESET_KEYS.forEach((k) => {
    const m = new Map();
    ((((S.data.systems || {})[k] || {}).monthly) || []).forEach((p) => m.set(String(p.d).slice(0, 7), p.r));
    maps[k] = m;
  });
  let months = null;
  PRESET_KEYS.forEach((k) => {
    const set = new Set(maps[k].keys());
    months = months ? months.filter((d) => set.has(d)) : Array.from(set);
  });
  months = (months || []).sort();
  return { maps, months };
}

/* covarianza anualizada (ddof=1) de la ventana común; vols y matriz indexadas igual */
function riskModel(months, maps) {
  const n = months.length;
  if (n < 12) return null;
  const R = PRESET_KEYS.map((k) => months.map((d) => Number(maps[k].get(d)) || 0));
  const mu = R.map((s) => s.reduce((a, b) => a + b, 0) / n);
  const cov = R.map((_, i) => R.map((__, j) => {
    let q = 0;
    for (let t = 0; t < n; t++) q += (R[i][t] - mu[i]) * (R[j][t] - mu[j]);
    return (q / (n - 1)) * 12;
  }));
  const vol = cov.map((row, i) => Math.sqrt(Math.max(row[i], 0)));
  return { cov, vol, n };
}

/* a enteros que sumen 100 (resto mayor: no se pierde 1 % por redondeo) */
function toPercents(raw) {
  // vector inválido (todo ceros, NaN): reparto igualitario pasado por el mismo
  // resto mayor, para que siga sumando 100 y no 99
  let tot = raw.reduce((a, b) => a + b, 0);
  if (!(tot > 0) || !isFinite(tot)) { raw = raw.map(() => 1); tot = raw.length; }
  const exact = raw.map((x) => (x / tot) * 100);
  const base = exact.map((x) => Math.floor(x));
  let left = 100 - base.reduce((a, b) => a + b, 0);
  const order = exact.map((x, i) => [x - base[i], i]).sort((a, b) => b[0] - a[0]);
  for (let t = 0; left > 0 && t < order.length; t++) { base[order[t][1]]++; left--; }
  return base;
}

/* contribución de cada sistema a la varianza de la mezcla: w_i · (Σw)_i */
function mvprod(cov, w) {
  return cov.map((row, i) => w[i] * row.reduce((a, b, j) => a + b * w[j], 0));
}

/* El index.html publicado puede traer otros botones (los 4 viejos, o los 5 de
   la versión intermedia): si el conjunto no coincide con PRESET_LIST se
   reconstruye la barra. Así, el arreglo basta con subir app.js. */
function ensurePresetToolbar() {
  let bar = null;
  try {
    const first = document.querySelector("[data-preset]");
    if (!first) return null;
    bar = first.parentElement;
    const tiene = Array.from(bar.querySelectorAll("[data-preset]")).map((b) => b.dataset.preset).join();
    const quiero = PRESET_LIST.map(([k]) => k).join();
    if (tiene !== quiero) {
      bar.style.flexWrap = "wrap";
      bar.innerHTML = PRESET_LIST.map(([kind, label, hint]) =>
        `<button class="btn ghost" data-preset="${kind}" title="${hint}">${label}</button>`).join("");
      bar.querySelectorAll("[data-preset]").forEach((b) => { b.onclick = () => applyPreset(b.dataset.preset); });
    }
    let note = document.getElementById("presets-note");
    if (!note) {
      note = document.createElement("p");
      note.className = "note";
      note.id = "presets-note";
      note.style.cssText = "margin:6px 2px 0;font-size:11.5px;opacity:.72";
      bar.parentElement.insertBefore(note, bar.nextSibling);
    }
    return note;
  } catch (e) { return null; }
}

function applyPreset(kind) {
  const keys = PRESET_KEYS;
  if (kind === "equal") {
    S.weights = { marea: 33, pezvela: 33, meteoro: 34 };
    const note = ensurePresetToolbar();
    if (note) note.textContent = "Reparto fijo: no usa el histórico de los sistemas.";
    renderWeights();
    return;
  }
  // alias del index.html publicado antes de este cambio: los dos botones de
  // riesgo venían a parar aquí, y aquí siguen viniendo
  if (kind === "minvol" || kind === "risk") kind = "volpar";
  const { maps, months } = presetWindow();
  const rm = riskModel(months, maps);
  if (!rm) {
    const note = ensurePresetToolbar();
    if (note) note.textContent = `Solo hay ${months.length} meses comunes entre los tres sistemas: hacen `
      + "falta 12 meses comunes para poder calcular estos presets. Ajusta los pesos a mano.";
    return;                                     // mejor no tocar los pesos que inventarlos
  }
  const idx = {};
  keys.forEach((k, i) => { idx[k] = i; });
  const series = {};
  keys.forEach((k) => { series[k] = statsFrom(months.map((d) => ({ d: `${d}-01`, r: Number(maps[k].get(d)) || 0 }))); });

  let raw;
  if (kind === "sharpe") raw = keys.map((k) => Math.max(1, Math.round((series[k].sharpe || 0.1) * 30)));
  else raw = keys.map((k) => 1 / Math.max(rm.vol[idx[k]], 0.02));   // volpar

  if (raw.some((x) => !isFinite(x) || x < 0)) {
    // series planas o meses repetidos: no tocar el reparto que hubiera —
    // inventar unos pesos "neutrales" sería peor que no calcular nada
    const note = ensurePresetToolbar();
    if (note) note.textContent = "Estos datos no definen la covarianza entre sistemas: no se puede "
      + "calcular este reparto. Se mantienen los pesos anteriores.";
    renderWeights();
    return;
  }
  const exact = raw.map((x) => (x / raw.reduce((a, b) => a + b, 0)) * 100);
  const parts = toPercents(raw);
  keys.forEach((k, i) => { S.weights[k] = parts[i]; });

  // el diagnóstico se calcula con los pesos EXACTOS del criterio (el entero de
  // la barra es solo redondeo para el slider; si no, los dos criterios de
  // riesgo parecerían idénticos cuando no lo son)
  const w = exact.map((x) => x / 100);
  let q = 0;
  for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) q += w[i] * rm.cov[i][j] * w[j];
  const rc = mvprod(rm.cov, w);
  const rcTot = rc.reduce((a, b) => a + b, 0);
  const found = PRESET_LIST.find(([k]) => k === kind) || [kind, kind, ""];
  const note = ensurePresetToolbar();
  if (note) {
    note.innerHTML = `<b>${found[1]}</b> con ${months.length} meses comunes (${months[0]} → ${months[months.length - 1]})`
      + " · vol: " + keys.map((k, i) => `<span style="color:${COLORS[k]}">${LABELS[k]} ${(rm.vol[i] * 100).toFixed(1)} %</span>`).join(" · ")
      + ` · exacto ${exact.map((x) => x.toFixed(2).replace(".", ",")).join(" / ")} %`
      + (rcTot > 0 ? ` · riesgo aportado ${rc.map((x) => Math.round((x / rcTot) * 100)).join("/")} %` : "")
      + ` · vol de la mezcla ${((Math.sqrt(Math.max(q, 0)) * 100)).toFixed(2)} %`
      + (kind === "sharpe" ? " · el sharpe no penaliza la correlación entre sistemas" : "");
  }
  renderWeights();
}

/* ───────────── radar ───────────── */
function renderRadar() {
  $$("[data-radar]").forEach((b) => {
    b.classList.toggle("on", b.dataset.radar === S.radar);
    b.onclick = () => { S.radar = b.dataset.radar; renderRadar(); };
  });
  const box = $("#radar-table");
  if (S.radar === "pezvela") {
    const ex = S.data.systems.pezvela.extra;
    const list = (ex.candidates || []).slice().sort((a, b) => b.rsc - a.rsc);
    box.innerHTML = `<div style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:12px">
        <span class="pill">Filtro mercado <b class="${ex.market_ok ? "pos" : "neg"}">${ex.market_ok ? "alcista" : "bajista"}</b></span>
        <span class="pill">SPY <b>${num(ex.spy_weekly)}</b> vs SMA40w <b>${num(ex.spy_sma40w)}</b></span>
        <span class="pill">Semana <b>${ex.week || "—"}</b></span>
        <span class="pill">Candidatos <b>${(ex.stats || {}).crosses ?? 0}</b></span>
      </div>
      <table><thead><tr><th>Valor</th><th>RSC</th><th>RSC prev.</th><th>Precio</th><th>SMA40w</th><th>Dist.</th><th>Calidad</th><th>Atlas</th></tr></thead><tbody>
      ${list.length ? list.map((r) => `<tr>
        <td><b class="tk">${r.ticker}</b></td>
        <td class="${r.rsc > 0 ? "pos" : "neg"}"><b>${num(r.rsc)}</b></td>
        <td class="muted">${num(r.rsc_prev)}</td>
        <td>${num(r.close)}</td>
        <td class="muted">${num(r.sma40w)}</td>
        <td class="${cls(r.dist_sma)}">${pct(r.dist_sma / 100, 1, true)}</td>
        <td>${r.quality == null ? '<span class="muted">—</span>' : r.quality_ok ? `<span class="badge ok">${r.quality}/6</span>` : `<span class="badge warn">${r.quality}/6</span>`}</td>
        <td>${r.atlas ? '<span class="badge ok">Atlas</span>' : '<span class="muted">—</span>'}</td>
      </tr>`).join("") : '<tr><td colspan="8" class="muted">Sin cruces esta semana</td></tr>'}
      </tbody></table>`;
  } else {
    const rk = S.data.systems.meteoro.signal.ranking || [];
    box.innerHTML = `<div style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:12px">
        <span class="pill">Régimen <b class="${S.data.systems.meteoro.signal.regime.ok ? "pos" : "neg"}">${S.data.systems.meteoro.signal.regime.ok ? "alcista" : "refugio"}</b></span>
        <span class="pill">Corte inercia <b>680</b></span>
        <span class="pill">R² &gt; <b>0,60</b> · RSI &lt; <b>85</b></span>
      </div>
      <table><thead><tr><th>Valor</th><th>Inercia</th><th>Score ajust.</th><th>Mansfield</th><th>RSI</th><th>R²</th><th>Vol. anual</th><th>Estado</th></tr></thead><tbody>
      ${rk.length ? rk.map((r) => `<tr>
        <td><b class="tk">${r.ticker}</b></td>
        <td class="${r.inercia >= 680 ? "pos" : "muted"}"><b>${num(r.inercia, 1)}</b></td>
        <td>${num(r.score_adj)}</td>
        <td class="${cls(r.mansfield)}">${num(r.mansfield)}</td>
        <td>${num(r.rsi, 1)}</td>
        <td class="${r.r2 != null && r.r2 >= 0.6 ? "pos" : "muted"}">${num(r.r2)}</td>
        <td class="muted">${r.vol == null ? "—" : pct(r.vol / 100, 1)}</td>
        <td>${r.passes && r.r2 != null && r.r2 >= 0.6 ? '<span class="badge ok">Apto</span>' : r.passes ? '<span class="badge warn">R² bajo</span>' : '<span class="badge off">Corte</span>'}</td>
      </tr>`).join("") : '<tr><td colspan="8" class="muted">Sin datos</td></tr>'}
      </tbody></table>`;
  }
}

/* ───────────── historial ───────────── */
function renderHistory() {
  $$("[data-hist]").forEach((b) => {
    b.classList.toggle("on", b.dataset.hist === S.hist);
    b.onclick = () => { S.hist = b.dataset.hist; renderHistory(); };
  });
  const rows = S.data.history[S.hist] || [];
  $("#history-table").innerHTML = `<table><thead><tr><th>Mes</th><th>Cartera</th><th>Compras</th><th>Ventas</th><th>Mes</th></tr></thead><tbody>
    ${rows.length ? rows.slice().reverse().map((r) => `<tr>
      <td style="text-transform:capitalize"><b>${r.label}</b></td>
      <td style="white-space:normal">${(r.portfolio || []).map((p) => `<span class="chip" style="padding:2px 7px;font-size:11px"><b class="tk">${p.ticker}</b><span class="w">${pct(p.weight, 0)}</span></span>`).join(" ")}</td>
      <td>${(r.buys || []).map((t) => `<span class="chip buy" style="padding:2px 7px;font-size:11px"><b class="tk">${t}</b></span>`).join(" ") || '<span class="muted">—</span>'}</td>
      <td>${(r.sells || []).map((t) => `<span class="chip sell" style="padding:2px 7px;font-size:11px"><b class="tk">${t}</b></span>`).join(" ") || '<span class="muted">—</span>'}</td>
      <td class="${cls(r.ret)}"><b>${r.ret == null ? "—" : pct(r.ret, 1, true)}</b></td>
    </tr>`).join("") : '<tr><td colspan="5" class="muted">Sin historial para este sistema</td></tr>'}
  </tbody></table>`;
}

/* ───────────── footer / estado ───────────── */
function renderFooter() {
  const h = S.data.data_health || {};
  const cov = (h.stock_coverage && h.stock_expected)
    ? ` · cobertura <b>${h.stock_coverage}/${h.stock_expected}</b>`
    : "";
  const covs = ["marea", "pezvela", "meteoro"].map((k) => {
    const c = (S.data.systems[k] || {}).extra?.coverage || {};
    const nom = LABELS[k];
    if (c.analyzed == null) return `${nom} —`;
    const cl = (c.pct ?? 0) >= 99.5 ? "pos" : (c.pct ?? 0) >= 95 ? "neu" : "neg";
    const skip = c.skipped
      ? `<span class="muted" title="${fmtInt(c.skipped)} sin un año de histórico (no analizables con RSC de 52 semanas)"> +${fmtInt(c.skipped)} s/h</span>`
      : "";
    return `${nom} <b class="${cl}">${fmtInt(c.analyzed)}/${fmtInt(c.expected)}</b>${skip}`;
  }).join(" · ");
  $("#what-analysed").innerHTML = `Análisis · ${covs}`;
  const shortTxt = h.stock_short
    ? ` · <b>${fmtInt(h.stock_short)}</b> sin un año de histórico`
    : "";
  const histTxt = h.stock_historical
    ? ` <span class="muted" title="Valores que ya no cotizan (opados, absorbidos o con sólo el último precio en Yahoo): no son un hueco de datos">(+${fmtInt(h.stock_historical)} históricos sin cotizar)</span>`
    : "";
  $("#health-block").innerHTML = `Último cierre cargado: <b>${fmtDate(h.last_data_date)}</b><br>
    ETFs: <b>${h.etf_tickers || 0}</b> · Acciones que cotizan: <b>${fmtInt(h.stock_expected)}</b>${cov}${shortTxt}${histTxt}<br>
    Última actualización: <b>${fmtDate((h.stock_updated_at || "").slice(0, 10))}</b> ·
    refresco incremental cada <b>${h.ttl_hours || 12} h</b> en lotes de ${h.batch_size || 100}.`;
  $("#foot-stamp").textContent = "Actualizado " + new Date(S.data.generated_at).toLocaleString("es-ES");
}

/* ───────────── controles ───────────── */
function bindControls() {
  $$("#period-seg button").forEach((b) => {
    b.classList.toggle("on", b.dataset.p === S.period);
    b.onclick = () => { S.period = b.dataset.p; $$("#period-seg button").forEach((x) => x.classList.toggle("on", x === b)); renderEquityChart(); renderDrawdown(); };
  });
  $$("[data-serie]").forEach((b) => {
    const k = b.dataset.serie;
    b.classList.toggle("on", !!S.visible[k]);
    b.onclick = () => { S.visible[k] = !S.visible[k]; b.classList.toggle("on", S.visible[k]); renderEquityChart(); renderDrawdown(); };
  });
  $$("[data-preset]").forEach((b) => { b.onclick = () => applyPreset(b.dataset.preset); });

  const btn = $("#btn-refresh");
  btn.onclick = async () => {
    btn.disabled = true;
    const original = btn.innerHTML;
    btn.innerHTML = "Actualizando…";
    await fetch("/api/refresh", { method: "POST" });
    const t0 = Date.now();
    while (Date.now() - t0 < 300000) {
      await new Promise((r) => setTimeout(r, 2500));
      const st = await (await fetch("/api/status", { cache: "no-store" })).json();
      btn.innerHTML = `${st.state.message || "…"} ${st.state.progress ? Math.round(st.state.progress * 100) + " %" : ""}`;
      if (st.job && st.job.at && Date.now() - new Date(st.job.at).getTime() < 300000 && !st.state.progress) {
        const r = await fetch("/api/dashboard", { cache: "no-store" });
        if (r.ok) { S.data = await r.json(); render(); break; }
      }
    }
    btn.disabled = false;
    btn.innerHTML = original;
  };
}

window.addEventListener("resize", () => { Plotly.Plots.resize($("#chart-equity")); Plotly.Plots.resize($("#chart-dd")); });
boot();
})();
