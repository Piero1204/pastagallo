/* Pasta Gallo · pantalla de COCINA por áreas (rol "cocina" del personal). La carga mozo.js cuando el equipo vinculado tiene rol cocina.
   Expone window.PG_APP_COCINA.iniciar(ctx), con ctx = { api, token, mozo, contenedor, h, toast, salir, cfg }.
   - Tres áreas (Pizzas / Pastas, lasagnas y parrillas / Bebidas y ensaladas). Si la persona tiene áreas asignadas (👥 Personal) solo ve esas;
     si no tiene ninguna ve todas con pestañas.
   - Tarjetas por pedido y área en columnas Recibido / En preparación / Listo. Cada área avanza por separado; el pedido pasa a "Listo"
     en el servidor cuando todas sus áreas lo están. En cada tarjeta se ve qué otras áreas faltan.
   - Tiempo transcurrido con color (verde / ámbar / rojo según tiempo_tarde_min), hora programada destacada, observaciones y opciones.
   - Un aviso sonoro por pedido nuevo (se puede silenciar; se recuerda), pantalla siempre encendida (Wake Lock), modo oscuro / claro.
   - Tolera mala señal: los cambios de estado se guardan en el equipo y se reintentan solos (el servidor los acepta de forma idempotente).
   Las funciones puras viven en PG_COCINA_LIB (se prueban aparte). */
(function (root) {
  "use strict";

  /* =========================== LÓGICA PURA =========================== */
  var L = {};
  var ORDEN_EST = ["Recibido", "En preparación", "Listo"];
  /** Color del tiempo: verde (menos del 60 % del límite), ámbar (hasta el límite), rojo (pasado). */
  L.color = function (min, tarde) { tarde = tarde > 0 ? tarde : 30; return min >= tarde ? "rojo" : (min >= tarde * 0.6 ? "ambar" : "verde"); };
  /** Color de un pedido programado: según los minutos que faltan para su hora. */
  L.colorProg = function (faltanMin) { return faltanMin < 0 ? "rojo" : (faltanMin <= 15 ? "ambar" : "verde"); };
  L.minutos = function (desde, ahora) { return desde ? Math.max(0, Math.floor((ahora - desde) / 60000)) : 0; };
  L.tiempoTxt = function (min) { return min < 60 ? min + " min" : Math.floor(min / 60) + " h " + ("0" + (min % 60)).slice(-2) + " min"; };
  L.etiqueta = function (p) {
    if (p.canal === "mesa") return "MESA " + p.mesa;
    if (p.canal === "recojo") return (p.origen === "barra" ? "BARRA" : "RECOJO") + " #" + p.nd;
    return "DELIVERY #" + p.nd;
  };
  /** Siguiente estado de un área al tocar el botón grande. */
  L.siguiente = function (e) { return e === "Recibido" ? "En preparación" : (e === "En preparación" ? "Listo" : ""); };
  L.anterior = function (e) { return e === "Listo" ? "En preparación" : (e === "En preparación" ? "Recibido" : ""); };
  /** Tarjetas (una por pedido y área) para la pestaña elegida, repartidas en columnas y ordenadas (lo más viejo / lo más urgente primero). */
  L.tarjetas = function (pedidos, tab) {
    var cols = { "Recibido": [], "En preparación": [], "Listo": [] };
    (pedidos || []).forEach(function (p) {
      Object.keys(p.areas || {}).forEach(function (a) {
        if (tab !== "todas" && tab !== a) return;
        var x = p.areas[a];
        if (!cols[x.e]) return;
        cols[x.e].push({ key: p.n + "|" + a, p: p, area: a, x: x });
      });
    });
    ORDEN_EST.forEach(function (e) {
      cols[e].sort(function (a, b) { return e === "Listo" ? (b.x.l || 0) - (a.x.l || 0) : ((a.p.progMs || a.x.r || a.p.ts) - (b.p.progMs || b.x.r || b.p.ts)); });
    });
    return cols;
  };
  /** Pedidos nuevos (aún no vistos) con algo por recibir. vistos = { pedido: ts }. Devuelve los números nuevos. */
  L.nuevos = function (pedidos, vistos) {
    var n = [];
    (pedidos || []).forEach(function (p) {
      if (vistos[p.n]) return;
      var hay = Object.keys(p.areas || {}).some(function (a) { return p.areas[a].e === "Recibido"; });
      if (hay) n.push(p.n);
    });
    return n;
  };
  /** Aplica encima de los datos del servidor los cambios que aún no se confirmaron (para que no "salten" hacia atrás). */
  L.conPendientes = function (pedidos, pend, ahora) {
    (pedidos || []).forEach(function (p) {
      Object.keys(p.areas || {}).forEach(function (a) {
        var op = pend[p.n + "|" + a];
        if (op) L.aplicar(p, a, op.estado, ahora);
      });
    });
    return pedidos;
  };
  /** Cambia el estado de un área dentro de un pedido (vista optimista) y calcula los estados de las demás. */
  L.aplicar = function (p, a, estado, ahora) {
    var x = p.areas[a]; if (!x) return;
    x.e = estado; p.estados[a] = estado;
    if (estado === "Recibido") { x.p = 0; x.l = 0; }
    if (estado === "En preparación") { x.l = 0; if (!x.p) x.p = ahora; }
    if (estado === "Listo") { if (!x.p) x.p = ahora; x.l = ahora; }
  };
  root.PG_COCINA_LIB = L;
  root.PG_APP_COCINA = { iniciar: function (ctx) { iniciar(ctx); }, _lib: L };
  if (typeof document === "undefined") return;

  /* =========================== APP =========================== */
  var CSS = [
    ".ck{--bg:#faf6ec;--panel:#fff;--tx:#2a1b17;--tx2:#6f5f57;--ln:#dccdb0;--vino:#4a1519;--oro:#a9803f;--verde:#2f7a3a;--ambar:#c46a12;--rojo:#b6232a;--azul:#2d5f8a;position:fixed;inset:0;display:flex;flex-direction:column;background:var(--bg);color:var(--tx);font:16px/1.3 var(--sans,system-ui,sans-serif);z-index:5}",
    ".ck.oscuro{--bg:#15100e;--panel:#241c19;--tx:#f3ebdb;--tx2:#b3a393;--ln:#3b2f2a;--vino:#7a2b32;--oro:#d9b062;--verde:#4fb860;--ambar:#f0a040;--rojo:#ef5b61;--azul:#6aa5d8}",
    ".ck-top{display:flex;align-items:center;gap:8px;flex-wrap:wrap;padding:8px 10px;padding-top:max(8px,env(safe-area-inset-top));background:var(--vino);color:#efe6d3}",
    ".ck-top b{font-size:18px;margin-right:6px}",
    ".ck-tab,.ck-ic{min-height:44px;min-width:44px;padding:0 14px;border-radius:10px;background:rgba(255,255,255,.12);color:#efe6d3;font-weight:700;font-size:15px}",
    ".ck-tab.on{background:#efe6d3;color:#4a1519}",
    ".ck-esp{flex:1}",
    ".ck-est{font-size:13px;font-weight:700;padding:6px 10px;border-radius:999px;background:rgba(255,255,255,.14);white-space:nowrap}",
    ".ck-est.mal{background:var(--rojo);color:#fff}",
    ".ck-aviso{padding:10px 14px;font-weight:700;background:var(--ambar);color:#fff;text-align:center}",
    ".ck-aviso button{margin-left:10px;min-height:40px;padding:0 14px;border-radius:8px;background:#fff;color:#4a1519;font-weight:800}",
    ".ck-cols{flex:1;min-height:0;display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:10px;padding:10px;overflow:hidden}",
    ".ck-col{display:flex;flex-direction:column;min-height:0;background:rgba(127,100,60,.08);border-radius:12px}",
    ".ck-col>h2{font-size:17px;padding:10px 12px;display:flex;justify-content:space-between;align-items:center}",
    ".ck-col>h2 span{background:var(--vino);color:#efe6d3;border-radius:999px;padding:2px 11px;font-size:15px}",
    ".ck-lista{flex:1;overflow-y:auto;padding:0 8px 10px;display:grid;gap:10px;align-content:start;-webkit-overflow-scrolling:touch}",
    ".ck-vacio{padding:20px 10px;text-align:center;color:var(--tx2)}",
    ".oculto{display:none!important}",
    ".ck-card{background:var(--panel);border:1px solid var(--ln);border-left:8px solid var(--verde);border-radius:12px;padding:10px 12px;display:grid;gap:7px;box-shadow:0 1px 3px rgba(0,0,0,.12)}",
    ".ck-card.ambar{border-left-color:var(--ambar)}.ck-card.rojo{border-left-color:var(--rojo)}.ck-card.listo{border-left-color:var(--verde);opacity:.85}",
    ".ck-card.nuevo{animation:ckn 1s 6}@keyframes ckn{50%{box-shadow:0 0 0 5px var(--oro)}}",
    ".ck-cab{display:flex;gap:8px;align-items:baseline;flex-wrap:wrap}",
    ".ck-cab b{font-size:22px;font-weight:800}.ck-cab small{color:var(--tx2);font-size:14px}",
    ".ck-area{font-size:12px;font-weight:800;padding:2px 8px;border-radius:999px;background:var(--oro);color:#fff}",
    ".ck-t{margin-left:auto;font-weight:800;font-size:17px;padding:3px 10px;border-radius:8px;background:var(--verde);color:#fff;white-space:nowrap}",
    ".ck-t.ambar{background:var(--ambar)}.ck-t.rojo{background:var(--rojo)}.ck-t.listo{background:var(--tx2)}",
    ".ck-prog{font-size:19px;font-weight:800;padding:6px 10px;border-radius:8px;border:3px solid var(--verde);text-align:center}",
    ".ck-prog.ambar{border-color:var(--ambar)}.ck-prog.rojo{border-color:var(--rojo);color:var(--rojo)}",
    ".ck-it{font-size:19px;font-weight:700}.ck-it span{color:var(--oro);margin-right:6px}",
    ".ck-d{font-size:16px;color:var(--tx2);margin:1px 0 0 22px}.ck-d.nota{color:var(--rojo);font-weight:800}",
    ".ck-obs{padding:8px 10px;border-radius:8px;background:rgba(196,106,18,.15);border:1px dashed var(--ambar);font-weight:700;font-size:16px}",
    ".ck-otras{font-size:14px;color:var(--tx2);display:flex;gap:6px;flex-wrap:wrap}",
    ".ck-otras span{padding:2px 8px;border-radius:999px;border:1px solid var(--ln)}.ck-otras span.ok{background:var(--verde);color:#fff;border-color:var(--verde)}",
    ".ck-acc{display:flex;gap:8px}",
    ".ck-go{flex:1;min-height:56px;border-radius:12px;font-size:19px;font-weight:800;color:#fff;background:var(--azul)}",
    ".ck-go.listo{background:var(--verde)}",
    ".ck-mini{min-height:56px;min-width:56px;border-radius:12px;background:rgba(127,100,60,.15);color:var(--tx);font-size:18px;font-weight:700}",
    ".ck-pend{font-size:12px;color:var(--ambar);font-weight:700}",
    "@media (max-width:820px){.ck-cols{grid-template-columns:1fr;overflow-y:auto}.ck-col{min-height:auto}.ck-lista{overflow:visible}}"
  ].join("\n");

  function iniciar(ctx) {
    var h = ctx.h || function (tag, cls, txt) { var e = document.createElement(tag); if (cls) e.className = cls; if (txt != null) e.textContent = txt; return e; };
    var app = ctx.contenedor, toast = ctx.toast || function () {};
    function btn(txt, cls, fn) { var b = h("button", cls, txt); b.type = "button"; if (fn) b.addEventListener("click", fn); return b; }
    function leer(k, d) { try { var v = JSON.parse(localStorage.getItem(k) || "null"); return v == null ? d : v; } catch (e) { return d; } }
    function guardar(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} }
    var K = { tema: "pg-coc-tema", mute: "pg-coc-mute", vistos: "pg-coc-vistos", pend: "pg-coc-pend", dato: "pg-coc-dato", tab: "pg-coc-tab" };
    var S = { d: leer(K.dato, null), tab: leer(K.tab, "todas"), oscuro: leer(K.tema, "oscuro") === "oscuro", mute: leer(K.mute, false) === true,
      vistos: leer(K.vistos, {}), pend: leer(K.pend, {}), offline: false, ultimo: 0, skew: 0, primera: true, nuevos: {}, wake: null, audioOk: true, enVuelo: false, esperaMs: 6000 };
    var salido = false, tPoll = null, tTick = null, tFlush = null, ac = null;

    if (!document.getElementById("pg-coc-css")) { var st = document.createElement("style"); st.id = "pg-coc-css"; st.textContent = CSS; document.head.appendChild(st); }
    var raiz = h("div", "ck"), top = h("div", "ck-top"), aviso = h("div", "ck-aviso oculto"), cols = h("div", "ck-cols");
    app.innerHTML = ""; raiz.appendChild(top); raiz.appendChild(aviso); raiz.appendChild(cols); app.appendChild(raiz);
    var estadoEl = h("span", "ck-est", "Conectando…");
    var avisoSonido = h("div", "ck-aviso oculto");
    avisoSonido.appendChild(h("span", "", "Toca para activar el sonido de pedidos nuevos"));
    avisoSonido.appendChild(btn("🔔 Activar", "", function () { desbloquearAudio(); sonar(true); }));
    raiz.insertBefore(avisoSonido, cols);

    function ahora() { return Date.now() + S.skew; }
    function vivo() { return !salido && raiz.isConnected; }

    /* ---------- sonido ---------- */
    function desbloquearAudio() {
      try {
        var AC = root.AudioContext || root.webkitAudioContext; if (!AC) return;
        if (!ac) ac = new AC();
        if (ac.state === "suspended") ac.resume();
        S.audioOk = ac.state !== "suspended";
        avisoSonido.classList.toggle("oculto", S.audioOk || S.mute);
      } catch (e) {}
    }
    function sonar(prueba) {
      if (S.mute && !prueba) return;
      try {
        if (!ac) desbloquearAudio();
        if (!ac) return;
        var t0 = ac.currentTime;
        [[880, 0], [1175, 0.22], [880, 0.44]].forEach(function (n) {
          var o = ac.createOscillator(), g = ac.createGain();
          o.type = "sine"; o.frequency.value = n[0]; o.connect(g); g.connect(ac.destination);
          g.gain.setValueAtTime(0.0001, t0 + n[1]); g.gain.exponentialRampToValueAtTime(0.5, t0 + n[1] + 0.03); g.gain.exponentialRampToValueAtTime(0.0001, t0 + n[1] + 0.2);
          o.start(t0 + n[1]); o.stop(t0 + n[1] + 0.22);
        });
        if (navigator.vibrate) navigator.vibrate(180);
        setTimeout(function () { S.audioOk = ac.state === "running"; avisoSonido.classList.toggle("oculto", S.audioOk || S.mute); }, 300);
      } catch (e) {}
    }
    ["click", "touchstart", "keydown"].forEach(function (ev) { document.addEventListener(ev, function f() { desbloquearAudio(); if (ac && ac.state === "running") document.removeEventListener(ev, f); }, { passive: true }); });

    /* ---------- pantalla siempre encendida ---------- */
    function pedirWake() {
      try {
        if (!navigator.wakeLock || document.visibilityState !== "visible") return;
        navigator.wakeLock.request("screen").then(function (w) { S.wake = w; w.addEventListener("release", function () { S.wake = null; }); }).catch(function () {});
      } catch (e) {}
    }

    /* ---------- servidor ---------- */
    function llamar(o) { o.ext = "cocina"; o.t = ctx.token; return ctx.api(o); }
    function conectado(ok) {
      S.offline = !ok;
      estadoEl.className = "ck-est" + (ok ? "" : " mal");
      var np = Object.keys(S.pend).length;
      estadoEl.textContent = ok ? (np ? "Enviando " + np + "…" : "● En línea") : ("Sin conexión" + (np ? " · " + np + " por enviar" : "") + (S.ultimo ? " · datos de hace " + Math.max(1, Math.round((Date.now() - S.ultimo) / 60000)) + " min" : ""));
    }
    function recibir(r) {
      if (!r || !r.ok || !r.pedidos) return false;
      S.skew = r.ahora ? r.ahora - Date.now() : S.skew;
      S.ultimo = Date.now(); S.d = r;
      L.conPendientes(S.d.pedidos, S.pend, ahora());
      guardar(K.dato, r);
      var ids = (r.areas || []).map(function (a) { return a.id; });
      if (S.tab !== "todas" && ids.indexOf(S.tab) < 0) S.tab = "todas";
      if (ids.length === 1) S.tab = ids[0];
      avisarNuevos();
      return true;
    }
    function avisarNuevos() {
      var nuevos = L.nuevos(S.d.pedidos, S.vistos), n0 = ahora(), suena = false;
      nuevos.forEach(function (n) {
        S.vistos[n] = n0;
        var p = S.d.pedidos.filter(function (x) { return x.n === n; })[0];
        var reciente = p && n0 - (p.ts || n0) < 3 * 60000;
        if (!S.primera || reciente || !S.d.pedidos.length) { S.nuevos[n] = n0; suena = true; }
      });
      Object.keys(S.vistos).forEach(function (k) { if (n0 - S.vistos[k] > 86400000) delete S.vistos[k]; });
      guardar(K.vistos, S.vistos);
      S.primera = false;
      if (suena && nuevos.length) sonar(false);
    }
    function sondear() {
      if (!vivo()) return;
      clearTimeout(tPoll);
      if (S.enVuelo) { tPoll = setTimeout(sondear, 1000); return; }
      S.enVuelo = true;
      llamar({ accion: "cola" }).then(function (r) {
        S.enVuelo = false;
        if (!vivo()) return;
        if (r && r.ok === false) { conectado(false); estadoEl.textContent = r.error || "Error"; S.esperaMs = 15000; }
        else { recibir(r); conectado(true); S.esperaMs = 6000; pintar(); }
        tPoll = setTimeout(sondear, S.esperaMs);
      }).catch(function () {
        S.enVuelo = false;
        if (!vivo()) return;
        conectado(false); S.esperaMs = Math.min(30000, S.esperaMs * 1.6); pintar();
        tPoll = setTimeout(sondear, S.esperaMs);
      });
    }

    /* ---------- cambios de estado (cola local con reintentos) ---------- */
    function cambiar(p, area, estado) {
      var k = p.n + "|" + area;
      S.pend[k] = { pedido: p.n, area: area, estado: estado, t: Date.now() };
      guardar(K.pend, S.pend);
      L.aplicar(p, area, estado, ahora());
      delete S.nuevos[p.n];
      pintar(); conectado(!S.offline);
      vaciar();
    }
    function vaciar() {
      if (!vivo()) return;
      clearTimeout(tFlush);
      var ks = Object.keys(S.pend);
      if (!ks.length || S.enviando) return;
      var op = S.pend[ks[0]]; S.enviando = true;
      llamar({ accion: "estado", pedido: op.pedido, area: op.area, estado: op.estado }).then(function (r) {
        S.enviando = false;
        if (!vivo()) return;
        var actual = S.pend[op.pedido + "|" + op.area];
        if (actual && actual.estado === op.estado) delete S.pend[op.pedido + "|" + op.area];   // si mientras tanto lo volvieron a cambiar, se manda el nuevo valor
        guardar(K.pend, S.pend);
        if (r && r.ok === false) { toast(r.error || "No se pudo cambiar el estado.", "mal"); sondear(); }
        else if (r && r.ok) { recibir(r); conectado(true); pintar(); }
        if (Object.keys(S.pend).length) vaciar();
      }).catch(function () {
        S.enviando = false;
        if (!vivo()) return;
        conectado(false); pintar();
        tFlush = setTimeout(vaciar, 4000);   // sin señal: se reintenta solo
      });
    }

    /* ---------- pantalla ---------- */
    function areasVisibles() { return S.d && S.d.areas ? S.d.areas : []; }
    function nombreArea(id) { var t = (S.d && S.d.todas || []).filter(function (a) { return a.id === id; })[0]; return t ? t.nombre : id; }
    function pintarTop() {
      top.innerHTML = "";
      top.appendChild(h("b", "", "Cocina"));
      var as = areasVisibles();
      if (as.length > 1) {
        [{ id: "todas", nombre: "Todas" }].concat(as).forEach(function (a) {
          top.appendChild(btn(a.id === "todas" ? "Todas" : a.nombre, "ck-tab" + (S.tab === a.id ? " on" : ""), function () { S.tab = a.id; guardar(K.tab, S.tab); pintar(); }));
        });
      } else if (as.length === 1) top.appendChild(h("span", "ck-est", as[0].nombre));
      top.appendChild(h("span", "ck-esp"));
      top.appendChild(estadoEl);
      top.appendChild(btn(S.mute ? "🔕" : "🔔", "ck-ic", function () {
        S.mute = !S.mute; guardar(K.mute, S.mute);
        if (!S.mute) { desbloquearAudio(); sonar(true); }
        avisoSonido.classList.toggle("oculto", S.audioOk || S.mute);
        pintarTop();
      }));
      top.appendChild(btn(S.oscuro ? "☀" : "🌙", "ck-ic", function () { S.oscuro = !S.oscuro; guardar(K.tema, S.oscuro ? "oscuro" : "claro"); raiz.classList.toggle("oscuro", S.oscuro); pintarTop(); }));
      top.appendChild(btn("Salir", "ck-ic", function () { if (root.confirm("¿Salir de la pantalla de cocina en este equipo?")) { salido = true; clearTimeout(tPoll); clearTimeout(tTick); ctx.salir(); } }));
    }
    function tarjeta(c, e) {
      var p = c.p, x = c.x, a = c.area, listo = e === "Listo", n = ahora();
      var card = h("div", "ck-card" + (listo ? " listo" : "") + (S.nuevos[p.n] ? " nuevo" : ""));
      card.setAttribute("data-r", String((listo ? x.l : x.r) || p.ts || 0)); card.setAttribute("data-e", e);
      if (p.progMs) { card.setAttribute("data-prog", String(p.progMs)); card.setAttribute("data-progtxt", p.prog || ""); }
      var cab = h("div", "ck-cab");
      cab.appendChild(h("b", "", L.etiqueta(p)));
      if (p.canal !== "mesa" && p.nombre) cab.appendChild(h("small", "", p.nombre));
      else if (p.canal === "mesa" && p.mozo) cab.appendChild(h("small", "", "Atiende " + p.mozo));
      if (S.tab === "todas" && areasVisibles().length > 1) cab.appendChild(h("span", "ck-area", nombreArea(a)));
      var t = h("span", "ck-t"); t.setAttribute("data-t", "1"); cab.appendChild(t);
      card.appendChild(cab);
      if (p.prog) { var pr = h("div", "ck-prog"); pr.setAttribute("data-pr", "1"); card.appendChild(pr); }
      x.it.forEach(function (it) {
        var d = h("div", "ck-it"); d.appendChild(h("span", "", it.c + "×")); d.appendChild(document.createTextNode(it.n)); card.appendChild(d);
        (it.d || []).forEach(function (t2) { card.appendChild(h("div", "ck-d" + (/^Nota:/i.test(t2) ? " nota" : ""), t2)); });
      });
      if (p.notas) card.appendChild(h("div", "ck-obs", "📝 " + p.notas));
      var otras = (p.orden || []).filter(function (o) { return o !== a; });
      if (otras.length) {
        var o = h("div", "ck-otras"); o.appendChild(document.createTextNode("Otras áreas:"));
        otras.forEach(function (id) { var ok = p.estados[id] === "Listo"; o.appendChild(h("span", ok ? "ok" : "", (ok ? "✓ " : "falta ") + nombreArea(id).split(",")[0].split(" y ")[0] + (ok ? "" : " · " + p.estados[id]))); });
        card.appendChild(o);
      }
      var acc = h("div", "ck-acc"), sig = L.siguiente(e), ant = L.anterior(e);
      if (ant) acc.appendChild(btn("↩", "ck-mini", function () { cambiar(p, a, ant); }));
      if (sig) acc.appendChild(btn(sig === "Listo" ? "✓ LISTO" : "▶ EMPEZAR", "ck-go" + (sig === "Listo" ? " listo" : ""), function () { cambiar(p, a, sig); }));
      else acc.appendChild(h("div", "ck-go listo", "✓ Listo"));
      acc.lastChild.style.cssText += sig ? "" : ";display:flex;align-items:center;justify-content:center;opacity:.6";
      acc.appendChild(btn("🖨", "ck-mini", function () { reimprimir(p, a); }));
      card.appendChild(acc);
      if (S.pend[p.n + "|" + a]) card.appendChild(h("div", "ck-pend", "Por enviar al servidor…"));
      return card;
    }
    function reimprimir(p, a) {
      if (!root.confirm("¿Reimprimir la comanda de " + nombreArea(a) + " del pedido " + L.etiqueta(p) + "?")) return;
      llamar({ accion: "reimprimir", pedido: p.n, area: a }).then(function (r) {
        toast(r && r.ok ? (r.viva === false ? "Enviada a la cola: la impresora está apagada." : "Comanda enviada a imprimir.") : ((r && r.error) || "No se pudo reimprimir."), r && r.ok ? "ok" : "mal");
      }).catch(function () { toast("Sin conexión. Intenta de nuevo.", "mal"); });
    }
    function pintar() {
      if (!vivo()) return;
      raiz.classList.toggle("oscuro", S.oscuro);
      pintarTop();
      cols.innerHTML = "";
      if (!S.d) { cols.appendChild(h("p", "ck-vacio", S.offline ? "Sin conexión. Reintentando…" : "Cargando pedidos…")); return; }
      var cs = L.tarjetas(S.d.pedidos, S.tab);
      ORDEN_EST.forEach(function (e) {
        var col = h("div", "ck-col"), hd = h("h2", "", e); hd.appendChild(h("span", "", String(cs[e].length)));
        var lista = h("div", "ck-lista");
        if (!cs[e].length) lista.appendChild(h("p", "ck-vacio", e === "Recibido" ? "Sin pedidos nuevos" : "—"));
        cs[e].forEach(function (c) { lista.appendChild(tarjeta(c, e)); });
        col.appendChild(hd); col.appendChild(lista); cols.appendChild(col);
      });
      tick();
    }
    /* los tiempos se refrescan cada 15 s sin volver a pedir datos */
    function tick() {
      if (!vivo()) return;
      var n = ahora(), tarde = S.d && S.d.tarde || 30;
      Array.prototype.forEach.call(cols.querySelectorAll(".ck-card"), function (card) {
        var e = card.getAttribute("data-e"), r = Number(card.getAttribute("data-r")) || 0, t = card.querySelector("[data-t]"), prog = Number(card.getAttribute("data-prog")) || 0;
        var min = L.minutos(r, n), col = e === "Listo" ? "listo" : (prog ? L.colorProg(Math.round((prog - n) / 60000)) : L.color(min, tarde));
        if (t) { t.textContent = e === "Listo" ? "hace " + L.tiempoTxt(min) : L.tiempoTxt(min); t.className = "ck-t" + (col === "verde" ? "" : " " + col); }
        if (e !== "Listo") card.className = card.className.replace(/\b(ambar|rojo)\b/g, "").trim() + (col === "verde" ? "" : " " + col);
        var pr = card.querySelector("[data-pr]");
        if (pr && prog) {
          var f = Math.round((prog - n) / 60000), cp = L.colorProg(f);
          pr.textContent = "⏰ PARA LAS " + card.getAttribute("data-progtxt") + (e === "Listo" ? "" : (f < 0 ? " · atrasado " + L.tiempoTxt(-f) : " · faltan " + L.tiempoTxt(f)));
          pr.className = "ck-prog" + (cp === "verde" ? "" : " " + cp);
        }
      });
      clearTimeout(tTick); tTick = setTimeout(tick, 15000);
    }

    document.addEventListener("visibilitychange", function () { if (document.visibilityState === "visible") { pedirWake(); sondear(); vaciar(); } });
    root.addEventListener("online", function () { sondear(); vaciar(); });
    pintar(); conectado(true); estadoEl.textContent = S.d ? "Datos guardados…" : "Conectando…";
    pedirWake(); sondear(); vaciar();
  }
})(typeof window !== "undefined" ? window : this);
