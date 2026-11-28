/* Pasta Gallo · panel del mozo (https://pastagallo.pages.dev/<código secreto de 12 letras>)
   - El enlace se vincula a UN equipo (llave guardada en este navegador).
   - Mesas en vivo con estado automático: libre · sentada · en cocina · listo para servir · servida (comiendo) ·
     llama · pide la cuenta. Cada mesa muestra qué mozo la atiende (las asignadas son sugerencia, no bloqueo).
   - "Por servir": lo que falta llevar a cada mesa; se marca plato por plato (o "todo entregado").
   - Tomar pedido → se registra como pedido de mesa y se imprime solo en la PC del local.
   - Cobrar mesa con uno o varios métodos y la propina de cada uno; pagos parciales (queda saldo) y dividir la cuenta por ítems, partes iguales o personas.
   - Juntar mesas (una sola cuenta) y separarlas, cambiar un pedido de mesa, pedidos para llevar/barra sin mesa, editar un pedido ya enviado.
   - Pedido rápido por texto o voz (busqueda.js, mismo módulo de la carta) con revisión antes de agregar.
   La carta (productos, precios, fotos, disponibilidad) sale de menu-data.js, la misma de la web. */
(function () {
  "use strict";
  var C = window.CARTA || {}, API = (C.pedidos || {}).api || "", GRUPOS = C.opciones || {};
  var app = document.getElementById("app");
  var K = { t: "pg-mozo-t", mozo: "pg-mozo", carros: "pg-mozo-carros", fotos: "pg-mozo-fotos", ultimo: "pg-mozo-ultimo", alertas: "pg-mozo-alertas", vistaM: "pg-mozo-vistam", filtro: "pg-mozo-filtro", mapa: "pg-mozo-mapa", div: "pg-mozo-div",
    pest: "pg-mozo-pest", mapaDel: "pg-mozo-mapadel", carrosDia: "pg-mozo-carros-dia", filtroT: "pg-mozo-filtrot" };

  /* ---------- utilidades ---------- */
  function h(tag, cls, txt) { var e = document.createElement(tag); if (cls) e.className = cls; if (txt != null) e.textContent = txt; return e; }
  function btn(txt, cls, fn) { var b = h("button", cls, txt); b.type = "button"; if (fn) b.addEventListener("click", fn); return b; }
  function soles(n) { return "S/ " + Number(n || 0).toFixed(2); }
  function norm(s) { return String(s || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, ""); }
  function leer(k, d) { try { var v = JSON.parse(localStorage.getItem(k) || "null"); return v == null ? d : v; } catch (e) { return d; } }
  function guardar(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} }
  function r2(n) { return Math.round(n * 100) / 100; }
  function uid() { return "c" + Date.now().toString(36) + Math.random().toString(36).slice(2, 8); }
  var tT;
  function toast(t, tipo) {
    var x = document.querySelector(".toast") || document.body.appendChild(h("div", "toast"));
    x.textContent = t; x.className = "toast on" + (tipo ? " " + tipo : "");
    clearTimeout(tT); tT = setTimeout(function () { x.className = "toast"; }, tipo === "mal" ? 6000 : 2600);
  }
  function api(o) {
    if (!API) return Promise.reject(new Error("Falta el enlace del sistema (api) en la carta publicada."));
    return fetch(API, { method: "POST", body: JSON.stringify(o) }).then(function (r) { return r.json(); }).then(function (r) {
      if (r && r.sesion === false) { salir(); throw new Error(r.error); }
      return r;
    });
  }

  /* ---------- marca de la app de tienda (rol cajero) y del panel local (rol local): nombre, tema, íconos y manifest propios ---------- */
  var tiendaModo = false, localModo = false, instalarEv = null;
  function ponerLink(rel, href) {
    var l = document.querySelector('link[rel="' + rel + '"]');
    if (!l) { l = document.createElement("link"); l.rel = rel; document.head.appendChild(l); }
    l.href = href;
  }
  function ponerMeta(nombre, valor) {
    var m = document.querySelector('meta[name="' + nombre + '"]');
    if (!m) { m = document.createElement("meta"); m.name = nombre; document.head.appendChild(m); }
    m.content = valor;
  }
  function aplicarMarcaTienda() {
    if (tiendaModo) return;
    tiendaModo = true;
    document.documentElement.classList.add("tienda");
    document.title = "Pasta Gallo · Tienda";
    ponerLink("manifest", "/tienda.webmanifest"); ponerLink("apple-touch-icon", "/tienda-192.png");
    ponerMeta("theme-color", "#4b5a24"); ponerMeta("apple-mobile-web-app-title", "PG Tienda");
  }
  /* Panel LOCAL (computadora del local): misma app con layout de escritorio (local.js + local.css) y su propio "PG Local" instalable */
  function aplicarMarcaLocal() {
    if (localModo) return;
    localModo = true;
    document.documentElement.classList.add("local");
    document.title = "Pasta Gallo · Local";
    ponerLink("manifest", "/local.webmanifest"); ponerLink("apple-touch-icon", "/local-192.png");
    ponerMeta("theme-color", "#4a1519"); ponerMeta("apple-mobile-web-app-title", "PG Local");
  }
  window.addEventListener("beforeinstallprompt", function (e) {
    if (!tiendaModo && !localModo) return;            // el mozo conserva el aviso normal del navegador
    e.preventDefault(); instalarEv = e;
    document.dispatchEvent(new Event("pg-instalable"));
  });
  window.addEventListener("appinstalled", function () { instalarEv = null; document.dispatchEvent(new Event("pg-instalable")); });
  if (/[?&]app=tienda\b/.test(location.search) || (leer("pg-mozo", null) || {}).rol === "cajero") aplicarMarcaTienda();
  else if (/[?&]app=local\b/.test(location.search) || (leer("pg-mozo", null) || {}).rol === "local") aplicarMarcaLocal();

  /* ---------- estado ---------- */
  var S = { t: leer(K.t, ""), mozo: leer(K.mozo, null), mesas: [], avisos: [], metodos: ["Yape", "Plin", "Efectivo", "Tarjeta"],
    horario: null, turno: null, v: "", desfase: 0, recibido: 0, vista: "mesas", mesa: null, cuenta: null, q: "", enviando: false,
    vistaM: leer(K.vistaM, "grid"), filtro: leer(K.filtro, "todas"), mapa: leer(K.mapa, false) === true,
    pest: leer(K.pest, ""), pestElegida: false, externos: [], metodosExt: null, diaIso: "", filtroT: leer(K.filtroT, "todo"), mapaDel: leer(K.mapaDel, false) === true };
  function yo() { return S.mozo ? S.mozo.id : ""; }
  /* computadora del local: ve y opera TODO (como supervisor); nunca "ajena", nunca se queda con una mesa */
  var LOCAL = null;
  function esLocalRol() { return !!(S.mozo && String(S.mozo.rol || "").toLowerCase() === "local"); }
  function variosMozos() { return !!(S.turno && S.turno.mozos && S.turno.mozos.length > 1); }
  function mesaDe(n) { return S.mesas.filter(function (x) { return String(x.mesa) === String(n); })[0] || null; }
  /* mesas del salón (sin las "para llevar", que van aparte) y rótulo de una mesa */
  function mesasSalon() { return S.mesas.filter(function (m) { return m.activa && !m.llevar; }); }
  function etiquetaMesa(n) {
    if (n === LL) return "🥡 Nuevo para llevar";
    if (n === DL) return "🛵 Nuevo delivery";
    var m = mesaDe(n); return m && m.llevar ? "🥡 Llevar" + (m.etiqueta ? " · " + m.etiqueta : "") : "Mesa " + n;
  }
  /* Pedidos SIN mesa: "para llevar" y "delivery" se arman con la misma carta en un carrito propio (LL / DL) y al final se piden los datos del cliente.
     Se registran como pedidos normales (canal recojo / delivery): nunca ocupan una mesa ni salen en el salón. */
  var LL = "_LL", DL = "_DL";
  function esPseudo(n) { return n === LL || n === DL; }
  function modoActual() { return S.mesa === LL ? "llevar" : S.mesa === DL ? "delivery" : "mesa"; }
  function duenio(m) { return m ? (m.atiende || (m.estado === "libre" ? m.zona : null)) : null; }
  function esMia(m) { if (esLocalRol()) return true; var d = duenio(m); return !d || d.id === yo(); }
  function cuentaDeMesa(m) { return { mesa: m.mesa, pedidos: m.pedidos || [], total: m.total, pagado: m.pagado || 0, saldo: m.saldo, pagos: m.pagos || [], pagadoItems: m.pagadoItems || [], unidas: m.unidas || [] }; }
  function minDesde(ts) { return ts ? Math.max(0, Math.floor((Date.now() + S.desfase - ts) / 60000)) : 0; }
  var carros = leer(K.carros, {});
  var fotos = leer(K.fotos, true);
  function carro() { return S.mesa ? (carros[S.mesa] = carros[S.mesa] || []) : []; }
  function guardarCarros() { Object.keys(carros).forEach(function (m) { if (!carros[m].length) delete carros[m]; }); guardar(K.carros, carros); if (!leer(K.carrosDia, "")) guardar(K.carrosDia, diaActual()); }
  /* Platos sin enviar (carrito de cada mesa en este equipo): valen solo durante el DÍA DE NEGOCIO (hora de Lima; pasada la medianoche con el
     local abierto sigue siendo el mismo día). Al cambiar de día se descartan solos en todos los equipos (cada uno al abrir o al sondear). */
  function diaActual() {
    if (S && S.diaIso) return S.diaIso;
    return new Date(Date.now() + ((S && S.desfase) || 0) - 5 * 3600000 - 6 * 3600000).toISOString().slice(0, 10);   // sin servidor: Lima, y el día cambia a las 06:00
  }
  function revisarDiaCarros(dia) {
    var antes = leer(K.carrosDia, "");
    if (antes && antes !== dia) {
      var habia = Object.keys(carros).some(function (k) { return Array.isArray(carros[k]) && carros[k].length; });
      carros = {}; guardar(K.carros, carros);
      if (habia) toast("Se limpiaron los platos sin enviar del día anterior.", "ok");
    }
    if (antes !== dia) guardar(K.carrosDia, dia);
  }

  /* ---------- catálogo (solo lo que se puede pedir en mesa) ---------- */
  var SECS = [], PROD = {}, SALSAS_TODAS = (C.salsas || []).slice(), SALSAS = SALSAS_TODAS.filter(function (s) { return !s.agotado; }), SALSA = {};
  SALSAS_TODAS.forEach(function (s) { SALSA[s.id] = s; });
  /* agotados en vivo (el servidor manda la lista en cada sondeo; la carta publicada tarda 1-2 min) */
  var firmaAgot = null;
  function aplicarAgotados(lista) {
    var f = (lista || []).slice().sort().join(",");
    if (f === firmaAgot) return false;
    firmaAgot = f;
    Object.keys(PROD).forEach(function (k) { PROD[k].agotado = lista.indexOf(k) >= 0; });
    SALSAS_TODAS.forEach(function (x) { x.agotado = lista.indexOf(x.id) >= 0; });
    SALSAS = SALSAS_TODAS.filter(function (x) { return !x.agotado; });
    return true;
  }
  /* Todo lo del personal va en ESPAÑOL: títulos de sección, nombre del plato (el de la carta en español) y tamaños Personal / Mediana / Familiar.
     Se incluyen las secciones de mesa, las de delivery/llevar y la TIENDA (productos que no pasan por cocina: también se venden en mesa).
     Qué se puede pedir depende de dónde: mesa, para llevar o delivery (permitido()). */
  var SEC_ES = { promociones: "Promociones", antipasti: "Entradas", italia: "Productos de Italia", pizze: "Pizzas", pasta: "Pastas", lasagne: "Lasañas",
    parrillas: "Parrillas", dolci: "Postres", caffetteria: "Cafetería", caffe: "Bebidas", aperitivi: "Aperitivos", vini: "Vinos", tienda: "Tienda · para llevar a casa" };
  var TAM_ES = { personale: "Personal", media: "Mediana", famiglia: "Familiar" };
  function tamEs(t) { return TAM_ES[String(t || "").toLowerCase()] || t || ""; }
  function nombreEs(it) {
    if (!it) return "";
    var g = String(it.g || "").trim(), sid = it._sec && it._sec.id;
    if (g && ["antipasti", "pasta", "lasagne", "dolci", "caffetteria", "caffe"].indexOf(sid) >= 0 && !/^\d|^(con|para|al estilo)\b| en un plato/i.test(g)) return g.charAt(0).toUpperCase() + g.slice(1);
    return it.n;
  }
  (C.secciones || []).forEach(function (s) {
    if (!s.mesa && !s.delivery && s.id !== "tienda") return;
    var grupos = [];
    (s.grupos || []).forEach(function (g) {
      var items = (g.items || []).filter(function (it) { return it.tipo !== "salsa"; });
      items.forEach(function (it) { PROD[it.id] = it; it._sec = s; });
      if (items.length) grupos.push({ titulo: g.titulo || "", items: items });
    });
    if (grupos.length) SECS.push({ id: s.id, titulo: SEC_ES[s.id] || s.titulo, grupos: grupos, sec: s });
  });
  // orden para el personal: Productos de Italia y Tienda al final del bloque del restaurante, promociones arriba (solo se ven en llevar/delivery)
  function permitido(it) {
    if (!it) return false;
    if (it._cargo) return modoActual() === "mesa";
    var s = it._sec || {}, canal = String(it.canal || "todos").toLowerCase();
    if (modoActual() === "mesa") return (!!s.mesa || s.id === "tienda") && canal !== "delivery";
    return !!s.delivery && canal !== "local" && canal !== "interno";
  }
  /* Cargos adicionales (caja, taper, corcho, roturas…): solo para el mozo, vienen del servidor en "estado".
     No están en menu-data.js, así que nunca salen en la carta pública. Se guarda el último recibido.
     Se muestran como la ÚLTIMA categoría de la carta (solo en mesa): SECS siempre termina con la sección "cargos" si hay cargos. */
  /* Datos de cobro (número, titular y QR de Yape y de Plin): vienen en "estado" y las respuestas "igual" no los traen, así que se guarda el último. */
  var K_COBRO = "pg-mozo-cobro", COBRO = leer(K_COBRO, {}) || {};
  function urlPago(u) { u = String(u || ""); return !u ? "" : /^(https?:|data:)/.test(u) ? u : "https://pastagallo.pages.dev/" + u.replace(/^\//, ""); }
  var K_CARGOS = "pg-mozo-cargos", CARGOS = [], CARGO = {}, SEC_CARGOS = { id: "cargos", titulo: "Cargos Adicionales" };
  function aplicarCargos(lista) {
    CARGOS = []; CARGO = {};
    (Array.isArray(lista) ? lista : []).forEach(function (x) {
      if (!x || !x.id || !x.n) return;
      var it = { id: x.id, n: x.n, t: (x.t && x.t.length) ? x.t : null, p: x.p, _cargo: true, _sec: SEC_CARGOS };
      if (!it.t && it.p == null) return;
      CARGOS.push(it); CARGO[it.id] = it;
    });
    SECS = SECS.filter(function (s) { return s.id !== "cargos"; });
    if (CARGOS.length) SECS.push({ id: "cargos", titulo: SEC_CARGOS.titulo, grupos: [{ titulo: "", items: CARGOS }], sec: SEC_CARGOS });
  }
  aplicarCargos(leer(K_CARGOS, []));
  function prodDe(id) { return PROD[id] || CARGO[id]; }
  function motivoNo(it) {
    if (it.agotado) return "Agotado";
    if (it.p == null && !(it.t && it.t.length)) return "Consultar";
    if (it.salsa && !SALSAS.length) return "Sin salsas";
    return "";
  }
  function conOpciones(it) { return !!(it.t || it.salsa || (it.op && it.op.some(function (g) { return GRUPOS[g]; }))); }
  function gruposDe(it, salsaId) {
    var ids = (it.op || []).slice(), s = SALSA[salsaId];
    if (s && s.op) s.op.forEach(function (g) { if (ids.indexOf(g) < 0) ids.push(g); });
    return ids.filter(function (g) { return GRUPOS[g]; });
  }
  function precioDe(it, sel) {
    var base = it.t ? ((it.t.filter(function (x) { return x[0] === sel.tam; })[0] || it.t[0])[1]) : it.p;
    if (sel.mitad && PROD[sel.mitad]) { var t2 = (PROD[sel.mitad].t || []).filter(function (x) { return x[0] === sel.tam; })[0]; if (t2) base = Math.max(base, t2[1]); }
    var extra = sel.salsa && SALSA[sel.salsa] ? SALSA[sel.salsa].extra || 0 : 0;
    gruposDe(it, sel.salsa).forEach(function (g) {
      (sel.ops[g] || []).forEach(function (nm) { var o = GRUPOS[g].ops.filter(function (x) { return x.n === nm; })[0]; if (o) extra += o.p || 0; });
    });
    return r2(base + extra);
  }
  /* Tienda: presentaciones por paquete (solo "1/2 kg" = 500 g) o por peso en pasos de 1/4 kg (salsas con "1/2 kg" y "1/4 kg").
     Se decide por las presentaciones del producto, no por su id; el resto sigue con chips de tamaño. Al servidor siempre van líneas {id, tam, cant}. */
  function modoPres(it) {
    if (!it || !it.t || !it._sec || it._sec.id !== "tienda") return "";
    var ts = it.t.map(function (x) { return x[0]; }), m = ts.indexOf("1/2 kg") >= 0;
    if (m && ts.length === 1) return "paq";
    if (m && ts.indexOf("1/4 kg") >= 0 && ts.indexOf("1 kg") < 0) return "peso";
    return "";
  }
  function precioTam(it, tam) { var x = it.t.filter(function (y) { return y[0] === tam; })[0]; return x ? x[1] : 0; }
  function fmtKg(n) { return String(Math.round(n * 100) / 100).replace(".", ","); }
  function fmtCuartos(q) { var e = Math.floor(q / 4), f = ["", "¼", "½", "¾"][q % 4]; return (e || !f ? String(e) : "") + f; }
  function descPartes(q) { var m = Math.floor(q / 2), c = q % 2, r = []; if (m) r.push(m + " × ½"); if (c) r.push(c + " × ¼"); return r.join(" + "); }
  function lineasPeso(it, q) {
    var r = [], m = Math.floor(q / 2), c = q % 2;
    if (m) r.push({ tam: "1/2 kg", cant: m, unit: precioTam(it, "1/2 kg") });
    if (c) r.push({ tam: "1/4 kg", cant: c, unit: precioTam(it, "1/4 kg") });
    return r;
  }
  function cuartosDe(ls) { return ls.reduce(function (a, l) { return a + l.cant * (l.tam === "1/2 kg" ? 2 : 1); }, 0); }
  var NOTA_PESO = "Si no hay de ½, se entrega en ¼.";
  function grupoPeso(l) {
    var it = PROD[l.id];
    return it && (l.tam === "1/2 kg" || l.tam === "1/4 kg") && modoPres(it) === "peso" ? [l.id, l.nota].join("|") : "";
  }
  /* líneas del carro agrupadas: las de un producto por peso (1/2 kg + 1/4 kg) se muestran como una sola */
  function agrupar(c) {
    var r = [], vistos = {};
    c.forEach(function (l) {
      var g = grupoPeso(l);
      if (!g) { r.push({ l: l, ls: [l], g: "" }); return; }
      if (vistos[g]) return; vistos[g] = 1;
      r.push({ l: l, ls: c.filter(function (x) { return grupoPeso(x) === g; }), g: g });
    });
    return r;
  }
  function sufijoLinea(l, ls, grp) {
    if (grp) return " · " + fmtCuartos(cuartosDe(ls)) + " kg (" + descPartes(cuartosDe(ls)) + ")";
    if (l.tam === "1/2 kg" && modoPres(PROD[l.id]) === "paq") return " · " + l.cant + " × 500 g (" + fmtKg(l.cant * 0.5) + " kg)";
    return l.tam ? " " + tamEs(l.tam) : "";
  }
  function fijarCuartos(c, ls, q) {
    var base = ls[0], it = PROD[base.id], m = Math.floor(q / 2), r = q % 2;
    function poner(tam, cant) {
      var ex = ls.filter(function (x) { return x.tam === tam; })[0];
      if (ex) { if (cant > 0) ex.cant = cant; else c.splice(c.indexOf(ex), 1); return; }
      if (cant <= 0) return;
      var nl = {}; Object.keys(base).forEach(function (k) { nl[k] = base[k]; });
      nl.tam = tam; nl.cant = cant; nl.unit = precioTam(it, tam);
      c.splice(c.indexOf(base) + 1, 0, nl);
    }
    poner("1/2 kg", m); poner("1/4 kg", r);
  }
  /* Stepper de la línea del carro (los dos lugares donde se arma: mesa y llevar/delivery). */
  function stepLinea(c, l, ls, grp, refrescar) {
    var st = h("div", "st"), out = h("output", null, grp ? fmtCuartos(cuartosDe(ls)) : String(l.cant));
    st.appendChild(btn("−", "", function () {
      if (grp) fijarCuartos(c, ls, cuartosDe(ls) - 1); else if (l.cant > 1) l.cant--; else c.splice(c.indexOf(l), 1);
      guardarCarros(); refrescarTarjeta(l.id); refrescar();
    }));
    st.appendChild(out);
    st.appendChild(btn("+", "", function () {
      if (grp) { if (cuartosDe(ls) < 40) fijarCuartos(c, ls, cuartosDe(ls) + 1); } else if (l.cant < 30) l.cant++;
      guardarCarros(); refrescarTarjeta(l.id); refrescar();
    }));
    return st;
  }
  function precioTxt(it) {
    var pm = modoPres(it);
    if (pm === "paq") return soles(precioTam(it, "1/2 kg")) + " · paquete 500 g";
    if (pm === "peso") return soles(precioTam(it, "1/2 kg") * 2) + " / kg";
    return it.t ? "desde " + soles(Math.min.apply(null, it.t.map(function (x) { return x[1]; }))) : soles(it.p);
  }
  function cantDe(id) { return carro().reduce(function (a, l) { return a + (l.id === id ? l.cant : 0); }, 0); }
  function cantTxt(it) {
    var q = cantDe(it.id); if (!q) return "";
    if (modoPres(it) === "peso") return fmtCuartos(cuartosDe(carro().filter(function (l) { return l.id === it.id; }))) + " kg";
    if (modoPres(it) === "paq") return "×" + q + " · " + fmtKg(q * 0.5) + " kg";
    return "×" + q;
  }
  function totalCarro() { return r2(carro().reduce(function (a, l) { return a + l.unit * l.cant; }, 0)); }
  function unidades() { return agrupar(carro()).reduce(function (a, g) { return a + (g.g ? 1 : g.l.cant); }, 0); }

  /* ---------- sonido y vibración ---------- */
  var ctx = null;
  function audio() {
    if (!ctx) { try { ctx = new (window.AudioContext || window.webkitAudioContext)(); } catch (e) { return null; } }
    if (ctx.state === "suspended") ctx.resume();
    return ctx;
  }
  function pitar(veces, tono) {
    var a = audio(); if (navigator.vibrate) navigator.vibrate([200, 100, 200]);
    if (!a || a.state !== "running") { avisoSonido(); return; }
    for (var i = 0; i < (veces || 2); i++) {
      var o = a.createOscillator(), g = a.createGain(), t0 = a.currentTime + i * 0.35;
      o.frequency.value = tono || 880; o.type = "sine";
      g.gain.setValueAtTime(0.0001, t0); g.gain.exponentialRampToValueAtTime(0.5, t0 + 0.02); g.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.28);
      o.connect(g); g.connect(a.destination); o.start(t0); o.stop(t0 + 0.3);
    }
  }
  function avisoSonido() {
    if (document.querySelector(".sonido")) return;
    var b = btn("🔔 Toca aquí para activar el sonido", "sonido", function () { audio(); b.remove(); });
    document.body.appendChild(b);
  }
  document.addEventListener("pointerdown", function () { audio(); var s = document.querySelector(".sonido"); if (s) s.remove(); }, { once: false, passive: true });

  /* pantalla siempre encendida mientras el panel está abierto (tablet) */
  var wake = null;
  function mantenerPantalla() {
    if (!("wakeLock" in navigator) || wake || document.hidden) return;
    navigator.wakeLock.request("screen").then(function (w) { wake = w; w.addEventListener("release", function () { wake = null; }); }).catch(function () {});
  }

  /* ---------- ventanas ---------- */
  var capa = h("div", "capa"); document.body.appendChild(capa);
  capa.addEventListener("click", function (e) { if (e.target === capa) cerrarModal(); });
  function abrirModal(titulo, cuerpo, pie) {
    capa.textContent = "";
    var m = h("div", "modal"), cab = h("div", "modal__cab");
    cab.appendChild(h("h2", null, titulo)); cab.appendChild(btn("×", "", cerrarModal));
    m.appendChild(cab);
    var c = h("div", "modal__cuerpo"); (cuerpo || []).forEach(function (x) { if (x) c.appendChild(x); }); m.appendChild(c);
    if (pie) { var p = h("div", "modal__pie"); pie.forEach(function (x) { if (x) p.appendChild(x); }); m.appendChild(p); }
    capa.appendChild(m); capa.classList.add("on");
    return m;
  }
  function cerrarModal() {
    capa.classList.remove("on"); capa.textContent = ""; modalPedido = false; salonAbierto = null;
    if (S.redibujar) { S.redibujar = false; setTimeout(function () { if (!capa.classList.contains("on")) refrescar(); }, 0); }
  }

  /* =========================== VINCULAR ESTE EQUIPO ===========================
     El enlace /<código> solo sirve UNA vez: el primer equipo que toca "Vincular" recibe una llave secreta
     que queda guardada solo en este navegador. Si se borra (o el administrador desvincula), hace falta un enlace nuevo. */
  var CODIGO = (location.pathname.match(/^\/([a-z2-9]{12})\/?$/) || [])[1] || "";
  var esIOS = /iPhone|iPad|iPod/.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
  var instalada = (window.matchMedia && matchMedia("(display-mode: standalone)").matches) || navigator.standalone === true;
  var MARCAS = [[/^SM-|^GT-|Galaxy/i, "Samsung"], [/^Redmi|^M2\d|^2\d{3}|Xiaomi|POCO/i, "Xiaomi"], [/^moto|XT\d/i, "Motorola"], [/^Pixel/i, "Google"],
    [/^CPH|OPPO/i, "OPPO"], [/^RMX|realme/i, "realme"], [/^V\d{4}|vivo/i, "vivo"], [/HUAWEI|^[A-Z]{3}-L\d/i, "Huawei"], [/^Infinix|^X6\d{2}/i, "Infinix"], [/^TECNO/i, "Tecno"], [/^LM-|LG/i, "LG"], [/^Nokia|^TA-/i, "Nokia"], [/^HONOR|^[A-Z]{3}-NX\d/i, "Honor"]];
  function describirEquipo() {
    var ua = navigator.userAgent, nav = /Edg\//.test(ua) ? "Edge" : /SamsungBrowser/.test(ua) ? "Samsung Internet" : /CriOS|Chrome\//.test(ua) ? "Chrome" : /Firefox|FxiOS/.test(ua) ? "Firefox" : /Safari/.test(ua) ? "Safari" : "navegador";
    var base;
    if (esIOS) {
      var v = (ua.match(/OS (\d+)[_.](\d+)/) || []);
      base = (/iPad/.test(ua) || !/iPhone|iPod/.test(ua) ? "Apple iPad" : "Apple iPhone") + (v[1] ? " · iOS " + v[1] + "." + v[2] : "");
    } else if (/Android/.test(ua)) {
      var mod = (ua.match(/Android [\d.]+; ([^;)]+)/) || [])[1] || "";
      base = "Android" + (mod && mod !== "K" ? " · " + mod : "") + " · Android " + ((ua.match(/Android ([\d.]+)/) || [])[1] || "");
    } else if (/Windows/.test(ua)) base = "PC Windows";
    else if (/Mac OS X/.test(ua)) base = "Mac";
    else base = navigator.platform || "Equipo";
    var desc = base + " · " + nav + (instalada ? " (app)" : "");
    if (!(navigator.userAgentData && navigator.userAgentData.getHighEntropyValues)) return Promise.resolve(desc);
    return navigator.userAgentData.getHighEntropyValues(["model", "platform", "platformVersion"]).then(function (d) {
      if (!d.model) return desc;
      var marca = ""; MARCAS.forEach(function (x) { if (!marca && x[0].test(d.model)) marca = x[1]; });
      return (marca ? marca + " " : "") + d.model + " · " + d.platform + " " + String(d.platformVersion || "").split(".")[0] + " · " + nav + (instalada ? " (app)" : "");
    }).catch(function () { return desc; });
  }
  function pantallaLogin(msg) {
    app.textContent = ""; detenerSondeo();
    var w = h("div", "login");
    var img = h("img"); img.src = "/gallo-oro.png"; img.alt = ""; w.appendChild(img);
    app.appendChild(w);
    if (!CODIGO) {
      w.appendChild(h("h1", null, "Equipo no vinculado"));
      w.appendChild(h("p", null, msg || "Para usar el panel del salón, abre el enlace que te dio el administrador."));
      return;
    }
    w.appendChild(h("h1", null, "Vincular este equipo"));
    if (msg) w.appendChild(h("p", "err", msg));
    var info = h("p", null, "Detectando el equipo…"); w.appendChild(info);
    var err = h("p", "err");
    if (esIOS && !instalada) {
      info.textContent = "En iPhone o iPad, primero instálalo: toca Compartir (□↑) → “Agregar a inicio”. Luego ábrelo desde el ícono nuevo y vincúlalo ahí.";
      w.appendChild(h("p", null, "Si lo vinculas aquí en Safari, el ícono de inicio no quedará vinculado y necesitarás un enlace nuevo."));
      w.appendChild(btn("Vincular aquí de todas formas", "link", function () { this.remove(); paso(); }));
      w.appendChild(err);
      return;
    }
    paso();
    function paso() {
      describirEquipo().then(function (eq) {
        info.textContent = "Equipo detectado: " + eq + ". Este enlace solo funciona en UN equipo: si lo vinculas aquí, no servirá en otro.";
        var b = btn("Vincular este equipo", "btn prim", function () {
          b.disabled = true; b.textContent = "Vinculando…"; err.textContent = ""; audio();
          api({ mz: "vincular", codigo: CODIGO, equipo: eq }).then(function (r) {
            if (!r.ok) { err.textContent = r.error; b.remove(); return; }
            S.t = r.t; S.mozo = r.mozo; guardar(K.t, r.t); guardar(K.mozo, r.mozo); guardar("pg-mozo-equipo", eq);
            if (r.mozo.rol && r.mozo.rol !== "mozo") { location.reload(); return; }   // cajero, repartidor o cocina: se carga su app
            iniciar(); toast("✓ Equipo vinculado a " + r.mozo.nombre, "ok");
          }).catch(function () { b.disabled = false; b.textContent = "Vincular este equipo"; err.textContent = "Sin conexión. Intenta de nuevo."; });
        });
        b.style.minWidth = "260px";
        w.appendChild(b); w.appendChild(err);
      });
    }
  }
  function salir() {
    S.t = ""; S.mozo = null; guardar(K.t, ""); guardar(K.mozo, null);
    cerrarModal(); pantallaLogin("Este equipo fue desvinculado por el administrador. Pide un enlace nuevo.");
  }

  /* =========================== SONDEO (cada 5 s con la app a la vista; en segundo plano se pausa) ===========================
     Barato: se manda la versión de los pedidos (v); si nada cambió el servidor responde "igual" sin leer las hojas. */
  var timer = null, avisosVistos = {}, ultimoPitido = 0, listosVistos = null, olvVistas = {}, ultimoOlv = 0, igualesSeguidos = 0;
  function textoAlerta(m) {
    var a = m.alerta; if (!a) return "";
    return a.tipo === "listo" ? "Mesa " + m.mesa + ": pedido #" + a.numero + " listo hace " + a.min + " min sin entregar" : "Mesa " + m.mesa + ": " + a.min + " min sentados sin pedir";
  }
  function detenerSondeo() { clearTimeout(timer); timer = null; }
  function sondear() {
    detenerSondeo();
    if (!S.t) return;
    api({ mz: "estado", t: S.t, v: S.v }).then(function (r) {
      if (!r.ok) throw new Error(r.error);
      S.desfase = r.ahora - Date.now(); S.recibido = Date.now();
      S.horario = r.horario; S.mozo = r.mozo || S.mozo; S.turno = r.turno || S.turno;
      if (r.diaIso) { S.diaIso = r.diaIso; revisarDiaCarros(r.diaIso); }
      if (r.igual) igualesSeguidos++;
      else {
        igualesSeguidos = 0;
        S.v = r.v; S.mesas = r.mesas || []; S.avisos = r.avisos || [];
        S.externos = r.externos || []; if (r.metodosExt && r.metodosExt.length) S.metodosExt = r.metodosExt;
        if (!S.pestElegida) elegirPestInicial();
        aplicarPendientesSalon();
        if (r.metodos && r.metodos.length) S.metodos = r.metodos;
        if (r.comprobantes) S.comprobantes = r.comprobantes;
        if (r.cobro && typeof r.cobro === "object") { COBRO = r.cobro; guardar(K_COBRO, COBRO); }
        if (r.cargos) {
          var antes = JSON.stringify(CARGOS);
          aplicarCargos(r.cargos); guardar(K_CARGOS, r.cargos);
          if (antes !== JSON.stringify(CARGOS) && document.querySelector(".prods") && !capa.classList.contains("on") && !S.q) { pintarChipsSecs(); pintarProductos(); }
        }
        if (S.mesa) { var mm = mesaDe(S.mesa); S.cuenta = mm ? cuentaDeMesa(mm) : S.cuenta; }
        // copia local: al volver a abrir la app se ve el salón al instante (luego se actualiza)
        guardar(K_CACHE, { mozo: yo(), ts: Date.now(), desfase: S.desfase, mesas: S.mesas, avisos: S.avisos, metodos: S.metodos,
          comprobantes: S.comprobantes || null, horario: S.horario, turno: S.turno, externos: S.externos, metodosExt: S.metodosExt, diaIso: S.diaIso });
      }
      if (r.agotados && aplicarAgotados(r.agotados) && document.querySelector(".prods") && !capa.classList.contains("on")) pintarProductos();
      revisarAlertas();
      if (LOCAL && LOCAL.alSondear) { try { LOCAL.alSondear(r); } catch (e) { console.error(e); } }
      refrescar();
      if (salonAbierto) pintarSalonModal();
    }).catch(function (e) { if (S.t) toast("Sin conexión: reintentando…", "mal"); }).then(function () {
      // cambios visibles en 5 s; si el salón lleva rato sin cambios, cada 8 s (al tocar algo vuelve a 5 s). En segundo plano no se consulta:
      // al volver a la app (visibilitychange) se consulta al instante.
      if (S.t && !document.hidden) timer = setTimeout(sondear, igualesSeguidos >= 6 && !capa.classList.contains("on") ? 8000 : 5000);
    });
  }
  document.addEventListener("visibilitychange", function () {
    if (document.hidden) { detenerSondeo(); return; }
    if (S.t) { igualesSeguidos = 0; sondear(); mantenerPantalla(); }
    if (swReg) try { swReg.update(); } catch (e) {}
  });
  document.addEventListener("pointerdown", function () { igualesSeguidos = 0; }, { passive: true });

  function minutosACierre() { return S.horario ? S.horario.cierraEn - (Date.now() - S.recibido) / 60000 : 0; }
  function revisarAlertas() {
    // mesas que llaman: suena al llegar un aviso nuevo y repite cada 30 s mientras haya pendientes
    // solo suenan las de MIS mesas (o sin mozo); si nadie atiende en 2 minutos, suena para todos
    var paraMi = S.avisos.filter(function (a) { return !a.silencioso && (esLocalRol() || !a.para || a.para === yo() || Date.now() + S.desfase - a.ts > 120000) && !(S.mozo && a.detalle === "Pedida por " + S.mozo.nombre); });
    var nuevos = paraMi.filter(function (a) { return !avisosVistos[a.id]; });
    paraMi.forEach(function (a) { avisosVistos[a.id] = true; });
    if (nuevos.length || (paraMi.length && Date.now() - ultimoPitido > 30000)) { pitar(3, 988); ultimoPitido = Date.now(); }
    // pedidos que la cocina marcó "Listo" en mis mesas
    var listos = [];
    S.mesas.forEach(function (m) {
      if (!esMia(m)) return;
      (m.pedidos || []).forEach(function (p) { if (p.estado === "Listo" && p.falta) listos.push({ k: p.id, m: m.mesa, n: p.numero }); });
    });
    if (listosVistos) {
      var nl = listos.filter(function (x) { return !listosVistos[x.k]; });
      if (nl.length) { pitar(2, 1320); toast("🔔 Mesa " + nl[0].m + ": pedido #" + nl[0].n + " listo para servir", "ok"); }
    } else listosVistos = {};
    listos.forEach(function (x) { listosVistos[x.k] = true; });
    // mesas olvidadas (solo las mías): suena al aparecer y repite cada 2 minutos
    var olv = S.mesas.filter(function (m) { return m.alerta && esMia(m); });
    var nuevasOlv = olv.filter(function (m) { var k = m.mesa + m.alerta.tipo + (m.alerta.numero || ""); if (olvVistas[k]) return false; olvVistas[k] = true; return true; });
    if (nuevasOlv.length || (olv.length && Date.now() - ultimoOlv > 120000)) { if (olv.length) { pitar(3, 740); ultimoOlv = Date.now(); } }
    // cierre de cocina: un aviso a los 30 y otro a los 15 minutos (una vez por día)
    var hz = S.horario; if (!hz || !hz.cocina) return;
    var hoy = new Date(Date.now() + S.desfase - 5 * 3600000).toISOString().slice(0, 10), hechas = leer(K.alertas, {});
    if (hechas.dia !== hoy) hechas = { dia: hoy };
    [30, 15].forEach(function (m) {
      if (hz.cierraEn <= m && hz.cierraEn > m - 10 && !hechas[m]) {
        hechas[m] = true; pitar(4, 660);
        toast("⏰ La cocina cierra en " + Math.round(hz.cierraEn) + " minutos (" + hz.cierra + "). Avisa a tus mesas.", "mal");
      }
    });
    guardar(K.alertas, hechas);
  }

  /* =========================== PINTAR =========================== */
  var K_CACHE = "pg-mozo-cache";
  function usarCopiaLocal() {
    var c = leer(K_CACHE, null);
    if (!c || c.mozo !== yo() || Date.now() - c.ts > 6 * 3600000 || S.mesas.length) return;
    S.mesas = c.mesas || []; S.avisos = c.avisos || []; S.desfase = c.desfase || 0; S.recibido = c.ts;
    if (c.metodos && c.metodos.length) S.metodos = c.metodos;
    if (c.comprobantes) S.comprobantes = c.comprobantes;
    S.horario = c.horario || null; S.turno = c.turno || S.turno;
    S.externos = c.externos || []; S.metodosExt = c.metodosExt || null; S.diaIso = c.diaIso || "";
  }
  function iniciar() {
    usarCopiaLocal();
    if (S.diaIso) revisarDiaCarros(S.diaIso);   // con la copia local del último día visto; el sondeo confirma el día real del servidor
    else if (leer(K.carrosDia, "") && Date.now() - ((leer(K_CACHE, null) || {}).ts || 0) > 20 * 3600000) revisarDiaCarros(diaActual());
    if (S.recibido) elegirPestInicial();
    app.textContent = "";
    if (fotos === false) document.body.classList.add("sinfotos");
    mantenerPantalla();
    pintar(); sondear();
  }
  var modalPedido = false;
  function pintar() {
    if (!S.t) return;
    var scrollProds = (document.querySelector(".prods") || {}).scrollTop, scrollWin = window.scrollY;
    app.textContent = "";
    document.body.classList.toggle("en-carta", S.vista === "carta" && !!S.mesa);   // el botón de pedido rápido (micrófono) solo se ve dentro de una mesa
    app.appendChild(barraSuperior());
    var av = barraAvisos(); app.appendChild(av);
    var main = h("main"); app.appendChild(main);
    var hz = S.horario;
    if (LOCAL) {   // panel local: no depende del horario de cocina ni del turno (tienda, comprobantes y cobros a cualquier hora)
      if (S.vista === "carta" && S.mesa) main.appendChild(vistaCarta());
      else { if (!S.pestElegida) elegirPestInicial(); LOCAL.pintar(main); ultimaFirmaPest = LOCAL.firma(); }
      LOCAL.despues(main);
    }
    else if (hz && !hz.panel) main.appendChild(vistaCerrado());
    else if (S.turno && !S.turno.trabaja) main.appendChild(vistaSinTurno());
    else {
      var mp = mapaSalon(); if (mp) main.appendChild(mp);   // mapa desplegable del salón: en todas las vistas
      main.appendChild(S.vista === "carta" && S.mesa ? vistaCarta() : vistaPrincipal());
    }
    // altura de los avisos (y del mapa) para que no tapen el contenido
    requestAnimationFrame(function () { document.documentElement.style.setProperty("--avisos", av.offsetHeight + "px"); medirMapa(); });
    var p = document.querySelector(".prods"); if (p && scrollProds) p.scrollTop = scrollProds;
    if (scrollWin) window.scrollTo(0, scrollWin);
  }
  /* En la carta solo se actualizan la hora, los avisos y (si cambió) la cuenta: así no se pierde lo que el mozo
     está escribiendo ni dónde estaba de la carta. En la vista de mesas se redibuja todo. */
  var ultimaCocina = null, ultimaMesaN = "";
  function firmaMesa(m) { return m ? [m.n, m.total, m.saldo, m.pagado, m.porServir, m.estado, m.atiende ? m.atiende.id : "", m.personas, (m.unidas || []).join("+"), m.alerta ? m.alerta.tipo + m.alerta.min : "",
    (m.pedidos || []).map(function (p) { return p.id + p.estado + p.falta + (p.lineas || []).length; }).join(",")].join("|") : "-"; }
  function refrescar() {
    var carta = document.querySelector(".carta");
    if (!(S.vista === "carta" && S.mesa && carta && S.horario && (S.horario.panel || LOCAL) && !(S.turno && !S.turno.trabaja))) {
      // no redibujar mientras escribe en un campo o hay una ventana abierta (se redibuja al cerrarla)
      var ae = document.activeElement;
      if (capa.classList.contains("on") || (ae && /INPUT|TEXTAREA|SELECT/.test(ae.tagName))) { S.redibujar = true; return; }
      if (LOCAL && S.vista === "mesas") {   // panel local: solo se repinta si cambió lo que muestra la pestaña actual
        var fl = LOCAL.firma();
        if (fl === ultimaFirmaPest) { parcheCabecera(); return; }
        pintar(); return;
      }
      if (S.vista === "mesas" && S.pest !== "mesas" && document.querySelector("main > .pest")) {   // «Todos» y «Para llevar»: solo si cambió algo
        var f = firmaPest();
        if (f === ultimaFirmaPest) { parcheCabecera(); return; }
        ultimaFirmaPest = f; pintar(); return;
      }
      if (parchearSalon()) return;   // solo se repinta lo que cambió (mesas, por servir, avisos, mapa)
      ultimaCocina = null; pintar(); return;
    }
    var nuevo = barraSuperior(), hv = document.querySelector(".top .top__hora"), hn = nuevo.querySelector(".top__hora");
    if (hv && hn) hv.replaceWith(hn); else if (hn) { var yo = document.querySelector(".top .top__yo"); if (yo) yo.parentNode.insertBefore(hn, yo); }
    var av = document.querySelector(".avisos"), avn = barraAvisos();
    if (av) { av.replaceWith(avn); document.documentElement.style.setProperty("--avisos", avn.offsetHeight + "px"); }
    var mpv = document.querySelector("main > .mapa"), mpn = mapaSalon();
    if (mpv && mpn) { mpv.replaceWith(mpn); medirMapa(); }
    var m = S.mesas.filter(function (x) { return String(x.mesa) === String(S.mesa); })[0];
    var firma = firmaMesa(m);
    var escribiendo = document.activeElement && document.activeElement.closest && document.activeElement.closest(".orden");
    if (firma !== ultimaMesaN && !escribiendo) pintarOrden();
    else if (ultimaCocina !== null && ultimaCocina !== S.horario.cocina && !escribiendo) pintarOrden();
    ultimaMesaN = firma; ultimaCocina = S.horario.cocina;
  }

  var ultimaFirmaPest = "";
  function firmaPest() { return [S.pest, S.v, S.filtroT, S.mapaDel, S.horario && S.horario.cocina, S.avisos.length].join("|"); }
  function parcheCabecera() {
    var nb = barraSuperior(), hv = document.querySelector(".top .top__hora"), hn = nb.querySelector(".top__hora");
    if (hv && hn && hv.outerHTML !== hn.outerHTML) hv.replaceWith(hn);
    var av = document.querySelector(".avisos"), avn = barraAvisos();
    if (av && av.outerHTML !== avn.outerHTML) { av.replaceWith(avn); document.documentElement.style.setProperty("--avisos", avn.offsetHeight + "px"); }
    var mpv = document.querySelector("main > .mapa"), mpn = mapaSalon();
    if (mpv && mpn && mpv.outerHTML !== mpn.outerHTML) { mpv.replaceWith(mpn); medirMapa(); }
  }
  /* Repintado parcial de la vista de mesas: se arma la vista nueva en memoria y solo se reemplazan las piezas cuyo HTML cambió.
     Si cambió la estructura (otras mesas visibles, otro orden, aparece/desaparece una sección) devuelve false y se repinta todo. */
  function parchearSalon() {
    if (S.vista !== "mesas" || !S.recibido || S.pest !== "mesas") return false;
    var main = document.querySelector("main"), salon = main && main.querySelector(":scope > .salon");
    var hz = S.horario;
    if (!salon || (hz && !hz.panel) || (S.turno && !S.turno.trabaja)) return false;
    var nuevo = vistaMesas();
    if (nuevo.dataset.estr !== salon.dataset.estr) return false;
    function cambiar(v, n) { if (v && n && v.outerHTML !== n.outerHTML) v.replaceWith(n); }
    cambiar(salon.querySelector(".salon__cab"), nuevo.querySelector(".salon__cab"));
    var gv = salon.querySelector(".mesas, .plano"), gn = nuevo.querySelector(".mesas, .plano");
    if (gv && gn) [].slice.call(gn.children).forEach(function (n) {
      var v = n.dataset.k && gv.querySelector('[data-k="' + n.dataset.k.replace(/"/g, "") + '"]');
      if (v) cambiar(v, n);
    });
    cambiar(salon.querySelector(".llevar-sec"), nuevo.querySelector(".llevar-sec"));
    cambiar(salon.querySelector(".servir"), nuevo.querySelector(".servir"));
    var nb = barraSuperior(), hv = document.querySelector(".top .top__hora"), hn = nb.querySelector(".top__hora");
    if (hv && hn) hv.replaceWith(hn);
    var av = document.querySelector(".avisos"), avn = barraAvisos();
    if (av && av.outerHTML !== avn.outerHTML) { av.replaceWith(avn); document.documentElement.style.setProperty("--avisos", avn.offsetHeight + "px"); }
    var mpv = document.querySelector("main > .mapa"), mpn = mapaSalon();
    if (mpv && mpn && mpv.outerHTML !== mpn.outerHTML) { mpv.replaceWith(mpn); medirMapa(); }
    return true;
  }

  function barraSuperior() {
    var t = h("header", "top"), hz = S.horario;
    if (S.vista === "carta" && S.mesa) {
      t.appendChild(btn("‹", "top__volver", function () { if (esPseudo(S.mesa)) { S.pest = "llevar"; } S.vista = "mesas"; S.q = ""; pintar(); window.scrollTo(0, 0); }));
      var m = btn("", "top__mesa", function () { if (!esPseudo(S.mesa)) elegirMesa(); });
      m.appendChild(document.createTextNode(etiquetaMesa(S.mesa))); if (!esPseudo(S.mesa)) m.appendChild(h("small", null, "▾"));
      t.appendChild(m);
      t.appendChild(btn("☰", "top__cats", menuCategorias));
      var bus = h("input", "top__bus"); bus.type = "search"; bus.placeholder = "Buscar plato…"; bus.value = S.q;
      bus.addEventListener("input", function () { S.q = bus.value; pintarProductos(); });
      t.appendChild(bus);
    } else {
      t.appendChild(h("b", "top__marca", "🍝 Pasta Gallo")); t.appendChild(h("span", "esp"));
    }
    if (hz && hz.panel) {
      var min = minutosACierre(), txt, cls = "top__hora";
      if (hz.cocina) { txt = "Cocina hasta " + hz.cierra; if (min <= 30) { txt = "Cocina cierra en " + Math.max(1, Math.round(min)) + " min"; cls += min <= 15 ? " urge" : " aviso"; } }
      else if (hz.cocinaEn) txt = "Cocina abre " + hz.abre;
      else txt = "Cocina cerrada";
      t.appendChild(h("span", cls, txt));
    }
    if (LOCAL && LOCAL.top) LOCAL.top(t);
    t.appendChild(btn(S.mozo ? S.mozo.nombre : "Menú", "top__yo", menuYo));
    return t;
  }

  function barraAvisos() {
    var w = h("div", "avisos"), hz = S.horario;
    S.avisos.filter(function (a) { return !a.silencioso; }).sort(function (a, b) { return a.ts - b.ts; }).forEach(function (a) {   // la cuenta que pidió un mozo no genera alerta
      var otro = a.para && a.para !== yo();
      var d = h("div", "av" + (a.motivo === "cuenta" ? " cuenta" : "") + (otro ? " otro" : ""));
      d.appendChild(h("span", null, (a.motivo === "cuenta" ? "🧾 " : "🙋 ") + "Mesa " + a.mesa + " · " + (a.motivo === "cuenta" ? "Cuenta" : "Llama") + (a.detalle ? " (" + a.detalle + ")" : "") + " · " + a.hora + (otro ? " · de " + a.paraNombre : "")));
      if (a.division && a.division.length > 1) d.firstChild.textContent += " · dividir en " + a.division.length;
      if (a.motivo === "cuenta") d.appendChild(btn("Cobrar", "", function () { abrirMesa(a.mesa, function () { cobrar(a.detalle, false, a.division); }); }));
      d.appendChild(btn("✓ Atendido", a.motivo === "cuenta" ? "sec" : "", function () { atender(a); }));
      w.appendChild(d);
    });
    S.mesas.filter(function (m) { return m.alerta && esMia(m); }).forEach(function (m) {
      var d = h("div", "av olvido");
      d.appendChild(h("span", null, "⏰ " + textoAlerta(m)));
      d.appendChild(btn("Ver", "", function () { tocarMesa(m); }));
      w.appendChild(d);
    });
    if (hz && hz.panel && !hz.cocina && !hz.cocinaEn) {
      w.appendChild(h("div", "av cerrada", "Cocina cerrada. Puedes cobrar mesas hasta las " + (hz.local || "") + "."));
    } else if (hz && hz.cocina && minutosACierre() <= 30) {
      var m = Math.max(1, Math.round(minutosACierre()));
      w.appendChild(h("div", "av cocina", "⏰ Cocina cierra en " + m + " min (" + hz.cierra + "): pregunta a tus mesas si desean algo más."));
    }
    return w;
  }
  function atender(a) {
    S.avisos = S.avisos.filter(function (x) { return x.id !== a.id; }); pintar();
    api({ mz: "atender", t: S.t, id: a.id }).then(function () { S.v = ""; }).catch(function () { toast("No se pudo marcar como atendido.", "mal"); });
  }

  function menuYo() {
    var c = h("div", "menu-yo");
    c.appendChild(btn((fotos === false ? "📷 Mostrar fotos de los platos" : "📷 Ocultar fotos (más rápido)"), "", function () {
      fotos = fotos === false; guardar(K.fotos, fotos); document.body.classList.toggle("sinfotos", fotos === false); cerrarModal();
    }));
    c.appendChild(btn("🚫 Marcar agotados", "", function () { cerrarModal(); ventanaAgotados(); }));
    c.appendChild(btn("📊 Mi turno de hoy (cobros y propinas)", "", miTurno));
    c.appendChild(btn("🔔 Probar sonido", "", function () { audio(); pitar(2); }));
    c.appendChild(btn("🔄 Actualizar ahora", "", function () { cerrarModal(); S.v = ""; sondear(); }));
    c.appendChild(h("p", "vacio", "📱 Este equipo: " + (leer("pg-mozo-equipo", "") || "vinculado") + ". Para usarlo con otro mozo, el administrador debe desvincularlo."));
    abrirModal(S.mozo ? "🤵 " + S.mozo.nombre : "Menú", [c]);
  }

  /* ---------- cerrado ---------- */
  function vistaCerrado() {
    var w = h("div", "cerrado"), hz = S.horario || {};
    w.appendChild(h("h2", null, "Cerrado"));
    w.appendChild(h("p", null, hz.abre ? "Hoy la cocina atiende de " + hz.abre + " a " + hz.cierra + "." : "Hoy no hay atención."));
    var abiertas = S.mesas.filter(function (m) { return m.n; });
    if (abiertas.length) {
      w.appendChild(h("p", null, "Quedan mesas con cuenta abierta:"));
      var f = h("div", "fila");
      abiertas.forEach(function (m) { f.appendChild(btn("Cobrar mesa " + m.mesa + " · " + soles(m.total), "btn azul", function () { abrirMesa(m.mesa, function () { cobrar(); }); })); });
      w.appendChild(f);
    }
    return w;
  }

  /* ---------- sin turno hoy ---------- */
  function vistaSinTurno() {
    var w = h("div", "cerrado");
    w.appendChild(h("h2", null, "Hoy no tienes turno"));
    w.appendChild(h("p", null, "Este panel solo se puede usar en tus días de trabajo. Si hoy sí vienes, pide al administrador que te active hoy (panel → 🤵 Mozos → “Hoy sí viene”)."));
    if (S.turno && S.turno.mozos && S.turno.mozos.length) w.appendChild(h("p", null, "Hoy atiende: " + S.turno.mozos.map(function (m) { return m.nombre; }).join(", ") + "."));
    return w;
  }
  function miTurno() {
    var c = h("div", "turno"); c.appendChild(h("p", "vacio", "Cargando…"));
    abrirModal("📊 Mi turno de hoy", [c]);
    api({ mz: "resumen", t: S.t }).then(function (r) {
      c.textContent = "";
      if (!r.ok) { c.appendChild(h("p", "err", r.error || "No se pudo leer.")); return; }
      var g = h("div", "kpis");
      [["Mesas cobradas", String(r.mesas)], ["Ventas", soles(r.ventas)], ["Propinas", soles(r.propinaTotal)]].forEach(function (k) {
        var d = h("div", "kpi"); d.appendChild(h("b", null, k[1])); d.appendChild(h("span", null, k[0])); g.appendChild(d);
      });
      c.appendChild(g);
      var met = Object.keys(r.porMetodo);
      if (met.length) {
        c.appendChild(h("div", "lbl", "Por método"));
        met.forEach(function (m) { var f = h("div", "fila-t"); f.appendChild(h("span", null, m)); f.appendChild(h("span", null, soles(r.porMetodo[m]) + (r.propinas[m] ? " · propina " + soles(r.propinas[m]) : ""))); c.appendChild(f); });
      } else c.appendChild(h("p", "vacio", "Todavía no cobraste mesas hoy."));
      if (r.efectivoPorEntregar > 0.009) c.appendChild(h("p", "aviso-ef", "💵 Efectivo por entregar a caja: " + soles(r.efectivoPorEntregar)));
      if (r.cobros && r.cobros.length) {
        c.appendChild(h("div", "lbl", "Mis cobros de hoy · toca ✏️ si pagaron con otro método"));
        r.cobros.forEach(function (x) {
          var f = h("div", "fila-t cobro-h");
          f.appendChild(h("span", null, x.hora + " · Mesa " + x.mesa));
          f.appendChild(h("span", null, x.metodo + " · " + soles(x.monto) + (x.propina ? " + " + soles(x.propina) : "")));
          if (!x.liquidado) f.appendChild(btn("✏️", "btn peq", function () { cambiarMetodo(x, r.metodos || S.metodos); }));
          c.appendChild(f);
        });
      }
      c.appendChild(h("p", "vacio", "Las propinas por Yape, Plin y tarjeta te las paga el negocio; la de efectivo ya la tienes."));
    }).catch(function () { c.textContent = ""; c.appendChild(h("p", "err", "Sin conexión.")); });
  }

  function cambiarMetodo(x, metodos) {
    var g = h("div", "metodos-c");
    metodos.forEach(function (mt) {
      g.appendChild(btn(mt, "btn" + (mt === x.metodo ? " prim" : ""), function () {
        if (mt === x.metodo) { cerrarModal(); return; }
        g.querySelectorAll("button").forEach(function (b) { b.disabled = true; });
        api({ mz: "metodo", t: S.t, id: x.id, metodo: mt }).then(function (r) {
          if (!r.ok) { toast(r.error || "No se pudo cambiar.", "mal"); g.querySelectorAll("button").forEach(function (b) { b.disabled = false; }); return; }
          toast("✓ Mesa " + x.mesa + ": " + x.metodo + " → " + mt, "ok"); miTurno();
        }).catch(function () { toast("Sin conexión: no se cambió.", "mal"); g.querySelectorAll("button").forEach(function (b) { b.disabled = false; }); });
      }));
    });
    abrirModal("✏️ Método de pago · Mesa " + x.mesa, [h("p", "vacio", x.hora + " · " + soles(x.monto) + (x.propina ? " + propina " + soles(x.propina) : "") + " · ahora: " + x.metodo), g]);
  }

  /* ---------- mesas ---------- */
  var TXT_ESTADO = { libre: "Libre", sentada: "Sentados · sin pedido", cocina: "En cocina", listo: "🔔 Listo para servir", servida: "Servida", llama: "🙋 Llama", cuenta: "🧾 Cuenta solicitada", unida: "🔗 Unida" };
  function estadoMesa(m) {
    if (m.estado === "unida") return "unida";
    var av = S.avisos.filter(function (a) { return String(a.mesa) === String(m.mesa); });
    if (av.some(function (a) { return a.motivo === "mozo"; })) return "llama";
    if (av.some(function (a) { return a.motivo === "cuenta"; })) return "cuenta";
    return m.estado || (m.n ? "cocina" : "libre");
  }
  function botonMesa(m, cls) {
    var e = estadoMesa(m), d = duenio(m), mia = esMia(m);
    var b = btn("", "mesa " + e + (mia ? "" : " ajena") + (d && d.id === yo() && m.estado !== "libre" ? " suya" : "") + (m.alerta ? " olvidada" : "") + (cls ? " " + cls : ""), function () { tocarMesa(m); });
    b.dataset.k = m.mesa;
    b.appendChild(h("b", null, (cls ? "" : m.llevar ? "🥡 " : "Mesa ") + (m.llevar ? (m.etiqueta || m.mesa) : m.mesa)));
    if (cls) { if (m.forma) b.classList.add("f-" + m.forma); return b; }
    var lin = e === "unida" ? "🔗 Unida a la mesa " + m.unidaA : (TXT_ESTADO[e] || "");
    if (m.estado !== "libre" && e !== "unida") lin += (lin ? " · " : "") + minDesde(m.ts) + " min";
    b.appendChild(h("span", "s", lin));
    if (m.unidas && m.unidas.length) b.appendChild(h("span", "uni", "🔗 + mesa " + m.unidas.join(", ")));
    if (m.n) b.appendChild(h("span", "t", soles(m.total) + (m.porServir ? " · faltan " + m.porServir : "")));
    if (m.pagado > 0.009 && m.n) b.appendChild(h("span", "pag", "Pagado " + soles(m.pagado) + " · saldo " + soles(m.saldo)));
    if (m.personas) b.appendChild(h("span", "pers", "👥 " + m.personas));
    if (m.alerta) b.appendChild(h("span", "olv", "⏰ " + m.alerta.min + " min"));
    if (variosMozos() || (d && d.id !== yo())) {
      if (m.atiende) b.appendChild(h("span", "who" + (mia ? " yo" : ""), "🤵 " + (m.atiende.id === yo() ? "Tú" : m.atiende.nombre)));
      else if (m.estado !== "libre") b.appendChild(h("span", "who", "Sin mozo"));
      else if (m.zona) b.appendChild(h("span", "who zona", m.zona.id === yo() ? "Tu zona" : "Zona de " + m.zona.nombre));
    }
    var borr = (carros[m.mesa] || []).reduce(function (a, l) { return a + l.cant; }, 0);
    if (borr) b.appendChild(h("span", "borr", borr + " sin enviar"));
    return b;
  }
  /* orden del salón: primero MIS mesas ocupadas, luego las de otros mozos y al final las libres (solo cuando hay varios mozos) */
  function ordenarMesas(lista) {
    if (!variosMozos()) return lista;
    function rango(m) { return m.estado === "libre" ? 2 : (esMia(m) ? 0 : 1); }
    return lista.map(function (m, i) { return { m: m, i: i }; }).sort(function (a, b) { return (rango(a.m) - rango(b.m)) || (a.i - b.i); }).map(function (x) { return x.m; });
  }
  function vistaMesas() {
    var w = h("div", "salon");
    var activas = mesasSalon();
    if (!S.recibido) { w.appendChild(h("p", "vacio", "Cargando mesas…")); return w; }
    if (!activas.length) { w.appendChild(h("p", "vacio", "No hay mesas activas. Agrégalas en el panel principal → Mesas y QR.")); return w; }
    var solo = S.filtro === "mias" && variosMozos() && !esLocalRol();
    var ver = ordenarMesas(activas.filter(function (m) { return !solo || (duenio(m) && duenio(m).id === yo()) || (!duenio(m)); }));
    var ocup = activas.filter(function (m) { return m.estado !== "libre" && m.estado !== "unida"; }).length;
    var cab = h("div", "salon__cab");
    cab.appendChild(h("div", "titulo", ocup + " de " + activas.length + " ocupadas"));
    cab.appendChild(h("span", "esp"));
    if (variosMozos() && !esLocalRol()) cab.appendChild(segmento([["mias", "Solo mis mesas"], ["todas", "Todas"]], S.filtro === "mias" ? "mias" : "todas", function (v) { S.filtro = v; guardar(K.filtro, v); pintar(); }));
    var hayPlano = activas.some(function (m) { return m.x != null && m.y != null; });
    if (hayPlano) cab.appendChild(segmento([["grid", "▦"], ["plano", "🗺 Plano"]], S.vistaM, function (v) { S.vistaM = v; guardar(K.vistaM, v); pintar(); }));
    w.appendChild(cab);
    var cuerpo = h("div", "salon__cuerpo");
    if (hayPlano && S.vistaM === "plano") cuerpo.appendChild(plano(activas));
    else {
      var g = h("div", "mesas");
      ver.forEach(function (m) { g.appendChild(botonMesa(m)); });
      cuerpo.appendChild(g);
    }
    var ll = null;   // lo "para llevar" ya no está en el salón: tiene su propia pestaña
    var ps = porServir();
    if (ps) cuerpo.appendChild(ps);
    w.appendChild(cuerpo);
    // estructura: si cambia (otras mesas, otro orden, otra sección) se repinta todo; si no, solo lo que cambió (parchearSalon)
    w.dataset.estr = [S.filtro, S.vistaM, ver.map(function (m) { return m.mesa; }).join(","), ll ? ll.dataset.ids : "-", ps ? "s" : "-"].join("|");
    return w;
  }
  /* pedidos para llevar / barra (sin mesa): se abren con el nombre del cliente y se cobran como cualquier cuenta */
  function seccionLlevar(solo) {
    var abiertos = S.mesas.filter(function (m) { return m.activa && m.llevar && m.estado !== "libre" && (!solo || !duenio(m) || duenio(m).id === yo()); });
    abiertos.sort(function (a, b) { return (esMia(b) - esMia(a)) || (a.ts - b.ts); });
    var w = h("section", "llevar-sec");
    w.dataset.ids = abiertos.map(function (m) { return m.mesa; }).join(",") || "0";
    var cab = h("div", "llevar-sec__cab");
    cab.appendChild(h("h3", null, "🥡 Para llevar / barra" + (abiertos.length ? " · " + abiertos.length : "")));
    cab.appendChild(h("span", "esp"));
    cab.appendChild(btn("➕ Nuevo para llevar", "btn peq", nuevoLlevar));
    w.appendChild(cab);
    if (!abiertos.length) { w.appendChild(h("p", "vacio", "Sin pedidos para llevar. Úsalo para clientes sin mesa: barra, recojo en el local o delivery propio.")); return w; }
    var g = h("div", "mesas llevar");
    abiertos.forEach(function (m) { g.appendChild(botonMesa(m)); });
    w.appendChild(g);
    return w;
  }
  function nuevoLlevar() {
    var inp = h("input", "campo"); inp.maxLength = 30; inp.placeholder = "Nombre del cliente (opcional)";
    var ok = btn("Abrir pedido", "btn prim", function () {
      ok.disabled = true; ok.textContent = "Abriendo…";
      api({ mz: "llevar", t: S.t, nombre: inp.value }).then(function (r) {
        if (!r.ok) { ok.disabled = false; ok.textContent = "Abrir pedido"; toast(r.error || "No se pudo abrir.", "mal"); return; }
        cerrarModal();
        var mm = mesaDe(r.mesa);
        if (!mm) { S.mesas.push({ mesa: r.mesa, activa: true, llevar: true, etiqueta: inp.value.trim(), estado: "sentada", total: 0, n: 0, ts: Date.now() + S.desfase, atiende: S.mozo, pedidos: [], porServir: 0, unidas: [], pagos: [] }); }
        S.v = ""; abrirMesa(r.mesa); sondear();
      }).catch(function () { ok.disabled = false; ok.textContent = "Abrir pedido"; toast("Sin conexión.", "mal"); });
    });
    abrirModal("🥡 Pedido para llevar", [h("p", "vacio", "Para clientes sin mesa. En cocina sale marcado «PARA LLEVAR» con el nombre."), inp], [ok]);
    setTimeout(function () { inp.focus(); }, 50);
  }
  function segmento(ops, val, fn) {
    var s = h("div", "seg");
    ops.forEach(function (o) { s.appendChild(btn(o[1], o[0] === val ? "on" : "", function () { fn(o[0]); })); });
    return s;
  }
  /* plano del salón (se arma en el panel principal → Salón → ✏️ Acomodar plano) */
  function plano(activas) {
    var p = h("div", "plano");
    activas.forEach(function (m, i) {
      var x = m.x != null ? m.x : 7 + (i % 8) * 12.3, y = m.y != null ? m.y : 14 + Math.floor(i / 8) * 26;
      var b = botonMesa(m, "pm");
      b.style.left = x + "%"; b.style.top = y + "%";
      var e = estadoMesa(m), d = m.atiende;
      if (m.estado !== "libre") b.appendChild(h("small", null, (d ? (d.id === yo() ? "Tú" : d.nombre.split(" ")[0]) : "—") + (m.porServir ? " · " + m.porServir : "")));
      p.appendChild(b);
    });
    return p;
  }

  /* ---------- mapa del salón desplegable (en todas las vistas del mozo y en la caja de tienda) ----------
     Cerrado por defecto; recuerda si el mozo lo dejó abierto. Muestra cada mesa con su estado (libre / ocupada / llama /
     cuenta solicitada…), resalta las del mozo conectado y al tocar una abre su pedido. Reutiliza botonMesa() y plano(). */
  function miniMesa(m) {
    var e = estadoMesa(m), d = duenio(m), suya = d && d.id === yo() && m.estado !== "libre";
    var b = btn("", "mesa mini " + e + (esMia(m) ? "" : " ajena") + (suya ? " suya" : "") + (m.alerta ? " olvidada" : "") + (String(S.mesa) === String(m.mesa) && S.vista === "carta" ? " actual" : ""), function () { tocarMesa(m); });
    b.setAttribute("aria-label", "Mesa " + m.mesa + ": " + (TXT_ESTADO[e] || e).replace(/[^\wÁ-ú ·]/g, "").trim() + (suya ? " (tuya)" : ""));
    b.appendChild(h("b", null, m.mesa));
    var ic = e === "llama" ? "🙋" : e === "cuenta" ? "🧾" : e === "listo" ? "🔔" : e === "unida" ? "🔗" : e === "libre" ? "" : m.porServir ? String(m.porServir) : "●";
    if (ic) b.appendChild(h("small", null, ic));
    return b;
  }
  function mapaSalon() {
    var activas = mesasSalon();
    if (!S.recibido || !activas.length) return null;
    var w = h("section", "mapa" + (S.mapa ? " abierto" : ""));
    var ocup = activas.filter(function (m) { return m.estado !== "libre"; }).length;
    var llaman = activas.filter(function (m) { return estadoMesa(m) === "llama"; }).length, cuentas = activas.filter(function (m) { return estadoMesa(m) === "cuenta"; }).length;
    var propias = activas.filter(function (m) { var d = duenio(m); return d && d.id === yo() && m.estado !== "libre"; }).length;
    var cab = btn("", "mapa__cab", function () {
      S.mapa = !S.mapa; guardar(K.mapa, S.mapa);
      var nuevo = mapaSalon(); if (nuevo) { w.replaceWith(nuevo); medirMapa(); }
    });
    cab.setAttribute("aria-expanded", S.mapa ? "true" : "false");
    cab.appendChild(h("span", "mapa__t", "🗺 Salón · " + ocup + " de " + activas.length + " ocupadas"));
    if (llaman) cab.appendChild(h("span", "mapa__b llama", "🙋 " + llaman));
    if (cuentas) cab.appendChild(h("span", "mapa__b cuenta", "🧾 " + cuentas));
    if (propias) cab.appendChild(h("span", "mapa__b suya", "🤵 " + propias + (propias === 1 ? " mía" : " mías")));
    cab.appendChild(h("span", "esp"));
    cab.appendChild(h("span", "mapa__f", S.mapa ? "▴" : "▾"));
    w.appendChild(cab);
    if (!S.mapa) return w;
    var cuerpo = h("div", "mapa__cuerpo");
    var hayPlano = activas.some(function (m) { return m.x != null && m.y != null; });
    if (hayPlano) cuerpo.appendChild(plano(activas));
    else { var g = h("div", "mapa__mesas"); activas.forEach(function (m) { g.appendChild(miniMesa(m)); }); cuerpo.appendChild(g); }
    var lg = h("div", "mapa__leyenda");
    [["libre", "Libre"], ["cocina", "Ocupada"], ["cuenta", "Cuenta solicitada"], ["llama", "Llama"], ["suya", "Tuya"]].forEach(function (x) { lg.appendChild(h("span", "lg " + x[0], x[1])); });
    cuerpo.appendChild(lg);
    w.appendChild(cuerpo);
    return w;
  }
  function medirMapa() { var m = document.querySelector("main > .mapa"); document.documentElement.style.setProperty("--mapa", (m ? m.offsetHeight : 0) + "px"); }
  /* Para otras apps del equipo (caja de tienda): monta el mapa en `cont` y lo mantiene al día. opc.onMesa(mesa, estado) = qué hacer al tocar una mesa. */
  function mapaExterno(cont, opc) {
    S.alTocarMesa = (opc && opc.onMesa) || null;
    var caja = h("div", "mapa-ext"); cont.appendChild(caja);
    var parar = false;
    function pedir() {
      if (parar || !caja.isConnected) return;
      api({ mz: "estado", t: S.t, v: "" }).then(function (r) {
        if (!r.ok) return;
        S.desfase = r.ahora - Date.now(); S.recibido = Date.now(); S.mozo = r.mozo || S.mozo; S.mesas = r.mesas || []; S.avisos = r.avisos || []; S.turno = r.turno || S.turno;
        var mp = mapaSalon(); caja.textContent = ""; if (mp) caja.appendChild(mp);
      }).catch(function () {}).then(function () { if (!parar) setTimeout(pedir, document.hidden ? 60000 : 20000); });
    }
    setTimeout(pedir, 0);   // el contenedor se agrega a la página justo después
    return { actualizar: pedir, detener: function () { parar = true; } };
  }

  /* ---------- por servir: lo que falta llevar a la mesa (se marca plato por plato) ---------- */
  function porServir() {
    var items = [];
    S.mesas.forEach(function (m) {
      if (variosMozos() && S.filtro === "mias" && !esMia(m)) return;
      (m.pedidos || []).forEach(function (p) { if (p.falta) items.push({ m: m, p: p }); });
    });
    if (!items.length) return null;
    items.sort(function (a, b) { return (variosMozos() ? esMia(b.m) - esMia(a.m) : 0) || ((b.p.estado === "Listo") - (a.p.estado === "Listo")) || (a.p.ts - b.p.ts); });   // primero lo mío
    var w = h("section", "servir");
    var n = items.reduce(function (a, x) { return a + x.p.falta; }, 0);
    w.appendChild(h("h3", null, "🍽 Por servir · " + n + (n === 1 ? " plato" : " platos")));
    items.forEach(function (x) { w.appendChild(tarjetaServir(x.m, x.p, true)); });
    return w;
  }
  /* un pedido con sus líneas: tocar una línea = entregada (o deshacer) */
  function tarjetaServir(m, p, conMesa) {
    var ajena = conMesa && variosMozos() && !esMia(m);
    var d = h("div", "srv" + (p.estado === "Listo" && p.falta ? " listo" : "") + (!p.falta ? " hecho" : "") + (ajena ? " ajena" : ""));
    var cab = h("div", "srv__cab");
    if (conMesa) cab.appendChild(btn(m.llevar ? "🥡 " + (m.etiqueta || m.mesa) : "Mesa " + m.mesa, "srv__mesa", function () { tocarMesa(m); }));
    cab.appendChild(h("span", null, "#" + p.numero + " · " + p.hora + " · " + (p.mozo ? "🤵 " + p.mozo : "📱 QR") + (p.de ? " · mesa " + p.de : "")));
    if (ajena) cab.appendChild(h("span", "srv__resp", "Responsable: " + (m.atiende ? m.atiende.nombre : "sin mozo")));
    cab.appendChild(h("span", "esp"));
    cab.appendChild(h("span", "srv__est e-" + norm(p.estado).replace(/\s/g, ""), p.falta ? (p.estado === "Listo" ? "🔔 Listo" : p.estado) : "✓ Entregado"));
    d.appendChild(cab);
    (p.lineas || []).forEach(function (l, i) {
      var hecho = (p.entregado || []).indexOf(i) >= 0;
      var b = btn("", "srv__l" + (hecho ? " ok" : ""), function () { entregar(p, [i], !hecho); });
      b.appendChild(h("i", null, hecho ? "✓" : ""));
      var tx = h("span"); tx.appendChild(document.createTextNode(l.e || l.t)); if (l.d) tx.appendChild(h("small", null, l.d));
      b.appendChild(tx);
      d.appendChild(b);
    });
    if (p.falta > 1) d.appendChild(btn("✓ Todo entregado", "btn peq ok", function () { entregar(p, "todo", true); }));
    if (!conMesa && p.id) {   // dentro de la cuenta de una mesa: cambiar de mesa y editar lo enviado
      var ac = h("div", "srv__acc");
      ac.appendChild(btn("↔ Cambiar de mesa", "btn peq", function () { cambiarPedidoDeMesa(p); }));
      ac.appendChild(btn("✎ Editar pedido", "btn peq", function () { editarPedido(p); }));
      d.appendChild(ac);
    }
    return d;
  }
  /* Entregas: se marcan AL INSTANTE en pantalla y se envían en cola al servidor (en orden y con reintentos).
     Mientras el servidor no las confirme, lo que llega del sondeo no las deshace. */
  var colaEnt = [], enviandoEnt = false, pendEnt = {};   // pendEnt[id pedido] = { ent: [índices], hasta: ms }
  function ajustarPedido(p, ent) {
    p.entregado = ent.slice(); p.falta = (p.lineas || []).length - p.entregado.length;
    if (!p.falta) p.estado = "Entregado"; else if (p.estado === "Entregado") p.estado = "Listo";
  }
  function ajustarMesa(m) {
    if (!m || !m.pedidos) return;
    m.porServir = m.pedidos.reduce(function (a, q) { return a + (q.falta || 0); }, 0);
    if (!m.porServir && (m.estado === "listo" || m.estado === "cocina")) m.estado = "servida";
    else if (m.porServir && m.estado === "servida") m.estado = m.pedidos.some(function (q) { return q.falta && q.estado === "Listo"; }) ? "listo" : "cocina";
    if (m.alerta && m.alerta.tipo === "listo" && !m.porServir) m.alerta = null;
  }
  function firmaEnt(a) { return a.slice().sort(function (x, y) { return x - y; }).join(","); }
  /* aplica lo marcado y aún no confirmado sobre lo que llegó del servidor */
  function aplicarPendientes(pedidos) {
    var ahora = Date.now(), cambio = false;
    (pedidos || []).forEach(function (p) {
      var x = pendEnt[p.id]; if (!x) return;
      var enCola = colaEnt.some(function (c) { return c.id === p.id; });
      if (!enCola && (ahora > x.hasta || firmaEnt(p.entregado || []) === firmaEnt(x.ent))) { delete pendEnt[p.id]; return; }
      ajustarPedido(p, x.ent); cambio = true;
    });
    return cambio;
  }
  function aplicarPendientesSalon() { S.mesas.forEach(function (m) { if (aplicarPendientes(m.pedidos)) ajustarMesa(m); }); }
  function entregar(p, lineas, valor) {
    var idx = lineas === "todo" ? (p.lineas || []).map(function (x, i) { return i; }) : lineas;
    var ent = (p.entregado || []).slice();
    idx.forEach(function (i) { var k = ent.indexOf(i); if (valor && k < 0) ent.push(i); else if (!valor && k >= 0) ent.splice(k, 1); });
    ajustarPedido(p, ent);
    pendEnt[p.id] = { ent: ent.slice(), hasta: Date.now() + 120000 };
    S.mesas.forEach(function (m) { if (m.pedidos && m.pedidos.some(function (q) { return q === p || q.id === p.id; })) {
      m.pedidos.forEach(function (q) { if (q !== p && q.id === p.id) ajustarPedido(q, ent); }); ajustarMesa(m); } });
    if (navigator.vibrate) navigator.vibrate(30);
    if (S.vista === "carta") pintarOrden(); else pintar();
    colaEnt.push({ id: p.id, lineas: idx, valor: valor, intentos: 0 });
    enviarEntregas();
  }
  function enviarEntregas() {
    if (enviandoEnt || !colaEnt.length || !S.t) return;
    enviandoEnt = true;
    var x = colaEnt[0];
    api({ mz: "entregar", t: S.t, id: x.id, lineas: x.lineas, valor: x.valor }).then(function (r) {
      colaEnt.shift();
      if (!r.ok) { delete pendEnt[x.id]; toast(r.error || "No se pudo marcar.", "mal"); }
    }).catch(function () {
      x.intentos++;
      if (x.intentos >= 6) { colaEnt.shift(); delete pendEnt[x.id]; toast("Sin conexión: no se guardó lo entregado. Vuelve a marcarlo.", "mal"); return; }
      return new Promise(function (ok) { setTimeout(ok, 1500 * x.intentos); });
    }).then(function () {
      enviandoEnt = false;
      if (colaEnt.length) enviarEntregas(); else { S.v = ""; sondear(); }
    });
  }

  /* tocar una mesa: si la atiende otro mozo, se pregunta (no se bloquea) */
  function tocarMesa(m) {
    if (S.alTocarMesa) { S.alTocarMesa(m, estadoMesa(m)); return; }   // app de tienda: solo mira la mesa
    if (salonAbierto) { salonAbierto = null; cerrarModal(); }
    if (m.unidaA) { var mp = mesaDe(m.unidaA); if (mp) { tocarMesa(mp); return; } }
    var d = m.atiende;
    if (m.estado !== "libre" && d && d.id !== yo() && !esLocalRol()) {
      var c = h("div", "menu-yo");
      c.appendChild(h("p", null, "La mesa " + m.mesa + " la atiende " + d.nombre + "."));
      c.appendChild(btn("👀 Ver / agregar pedido (sigue siendo de " + d.nombre + ")", "", function () { cerrarModal(); abrirMesa(m.mesa); }));
      c.appendChild(btn("🔁 Pasar la mesa a mí", "", function () { cerrarModal(); ocupar(m.mesa, true, function () { abrirMesa(m.mesa); }); }));
      abrirModal("Mesa " + m.mesa, [c]);
      return;
    }
    abrirMesa(m.mesa);
  }
  /* ¿cuántas personas? (para el ticket por persona). fn(n) con n = 0 si se omite */
  function pedirPersonas(mesa, fn, conOmitir) {
    var g = h("div", "mesasel"), mm = mesaDe(mesa), sillas = mm && Number(mm.sillas) > 0 ? Math.floor(Number(mm.sillas)) : 0;
    // máximo = sillas de la mesa (si el servidor lo manda); si no, el de siempre (botones 1–12 y hasta 60 en "Más…")
    var tope = sillas || 12, maxMas = sillas || 60;
    for (var i = 1; i <= tope; i++) (function (n) { g.appendChild(btn(String(n), "", function () { cerrarModal(); fn(n); })); })(i);
    if (!sillas) g.appendChild(btn("Más…", "", function () { var n = parseInt(prompt("¿Cuántas personas?", "14"), 10); if (n > 0 && n <= maxMas) { cerrarModal(); fn(n); } }));
    abrirModal("👥 ¿Cuántas personas en la mesa " + mesa + "?" + (sillas ? " (máx. " + sillas + ")" : ""), [g], conOmitir ? [btn("Omitir", "btn", function () { cerrarModal(); fn(0); })] : null);
  }
  function guardarPersonas(mesa, n) {
    var m = mesaDe(mesa); if (m) { m.personas = n; if (m.estado === "libre") { m.estado = "sentada"; m.atiende = m.atiende || S.mozo; } }
    api({ mz: "personas", t: S.t, mesa: mesa, personas: n }).then(function (r) { if (!r.ok) toast(r.error || "No se pudo guardar.", "mal"); S.v = ""; sondear(); })
      .catch(function () { toast("Sin conexión.", "mal"); });
    if (S.vista === "carta") pintarOrden(); else pintar();
  }
  function sentar(mesa) { pedirPersonas(mesa, function (n) { ocupar(mesa, false, null, n); }, true); }
  function ocupar(mesa, forzar, luego, personas) {
    api({ mz: "ocupar", t: S.t, mesa: mesa, forzar: !!forzar, personas: personas || 0 }).then(function (r) {
      if (!r.ok) {
        if (r.ocupadaPor && confirm(r.error + " ¿Pasarla a tu nombre?")) return ocupar(mesa, true, luego, personas);
        if (!r.ocupadaPor) toast(r.error || "No se pudo.", "mal");
        return;
      }
      var mm = mesaDe(mesa);
      if (mm) { if (mm.estado === "libre") { mm.estado = "sentada"; mm.ts = Date.now() + S.desfase; } mm.atiende = S.mozo; if (personas) mm.personas = personas; }
      if (S.vista === "carta") pintarOrden(); else pintar();
      toast("✓ Mesa " + mesa + " a tu nombre", "ok"); S.v = ""; sondear(); if (luego) luego();
    }).catch(function () { toast("Sin conexión.", "mal"); });
  }
  function pasarA() {
    var mesa = S.mesa, c = h("div", "menu-yo");
    (S.turno && S.turno.mozos || []).forEach(function (mz) {
      if (mz.id === yo()) return;
      c.appendChild(btn("🤵 " + mz.nombre, "", function () {
        cerrarModal();
        api({ mz: "pasar", t: S.t, mesa: mesa, a: mz.id }).then(function (r) {
          if (!r.ok) { toast(r.error || "No se pudo.", "mal"); return; }
          toast("Mesa " + mesa + " pasada a " + mz.nombre, "ok"); S.v = ""; sondear();
        }).catch(function () { toast("Sin conexión.", "mal"); });
      }));
    });
    if (!c.childNodes.length) c.appendChild(h("p", "vacio", "Hoy no hay otro mozo de turno."));
    abrirModal("Pasar la mesa " + mesa + " a…", [c]);
  }
  function liberar() {
    var mesa = S.mesa;
    if (!confirm("¿Liberar la mesa " + mesa + "? (los clientes se fueron sin pedir)")) return;
    api({ mz: "liberar", t: S.t, mesa: mesa }).then(function (r) {
      if (!r.ok) { toast(r.error || "No se pudo.", "mal"); return; }
      toast("Mesa " + mesa + " libre", "ok"); S.vista = "mesas"; S.v = ""; pintar(); sondear();
    }).catch(function () { toast("Sin conexión.", "mal"); });
  }
  /* ---------- juntar / separar mesas, cambiar un pedido de mesa, editar un pedido enviado ---------- */
  function juntarMesasUI() {
    var mesa = S.mesa, elegidas = [], g = h("div", "mesasel juntar"), ok;
    var cand = mesasSalon().filter(function (x) { return x.mesa !== mesa && !x.unidaA && !(x.unidas && x.unidas.length) && !(x.pagos && x.pagos.length); });
    if (!cand.length) { toast("No hay otras mesas disponibles para unir.", "mal"); return; }
    cand.forEach(function (x) {
      var b = btn("", "", function () {
        var i = elegidas.indexOf(x.mesa); if (i >= 0) elegidas.splice(i, 1); else elegidas.push(x.mesa);
        b.classList.toggle("on", i < 0); ok.disabled = !elegidas.length;
        ok.textContent = elegidas.length ? "🔗 Juntar mesa " + elegidas.join(", ") + " con la " + mesa : "Elige las mesas";
      });
      b.appendChild(h("b", null, x.mesa)); b.appendChild(h("small", null, x.estado === "libre" ? "libre" : soles(x.total)));
      g.appendChild(b);
    });
    ok = btn("Elige las mesas", "btn prim", function () {
      ok.disabled = true; ok.textContent = "Juntando…";
      api({ mz: "juntar", t: S.t, mesa: mesa, mesas: elegidas }).then(function (r) {
        if (!r.ok) { ok.disabled = false; ok.textContent = "Reintentar"; toast(r.error || "No se pudo juntar.", "mal"); return; }
        cerrarModal(); toast("🔗 Mesas unidas: una sola cuenta en la mesa " + mesa, "ok"); S.v = ""; sondear(); cargarCuenta();
      }).catch(function () { ok.disabled = false; ok.textContent = "Reintentar"; toast("Sin conexión.", "mal"); });
    });
    ok.disabled = true;
    abrirModal("🔗 Juntar mesas con la mesa " + mesa, [h("p", "vacio", "Las mesas que elijas pasan a una sola cuenta, la de la mesa " + mesa + ". Sus pedidos no se pierden y se pueden separar después."), g], [ok]);
  }
  function separarMesasUI() {
    var m = mesaDe(S.mesa);
    if (!m || !(m.unidas && m.unidas.length)) return;
    if (m.pagos && m.pagos.length) { toast("Hay pagos parciales: termina de cobrar la cuenta antes de separar.", "mal"); return; }
    if (!confirm("¿Separar la mesa " + S.mesa + " de la(s) mesa(s) " + m.unidas.join(", ") + "? Cada pedido vuelve a la mesa donde se tomó.")) return;
    api({ mz: "separar", t: S.t, mesa: S.mesa }).then(function (r) {
      if (!r.ok) { toast(r.error || "No se pudo separar.", "mal"); return; }
      toast("✂ Mesas separadas", "ok"); S.v = ""; sondear(); cargarCuenta();
    }).catch(function () { toast("Sin conexión.", "mal"); });
  }
  function cambiarPedidoDeMesa(p) {
    var actual = String(p.de || S.mesa), g = h("div", "mesasel");
    S.mesas.filter(function (x) { return x.activa && !x.unidaA && x.mesa !== actual; }).sort(function (a, b) { return (a.estado === "libre") - (b.estado === "libre"); }).forEach(function (x) {
      var b = btn("", x.llevar ? "ll" : "", function () {
        g.querySelectorAll("button").forEach(function (y) { y.disabled = true; });
        api({ mz: "moverpedido", t: S.t, id: p.id, a: x.mesa }).then(function (r) {
          if (!r.ok) { toast(r.error || "No se pudo mover el pedido.", "mal"); g.querySelectorAll("button").forEach(function (y) { y.disabled = false; }); return; }
          cerrarModal();
          toast("↔ Pedido #" + p.numero + " pasó a " + etiquetaMesa(r.mesa).toLowerCase() + (r.impreso ? " · 🖨 cocina avisada" : ""), "ok");
          S.v = ""; sondear(); cargarCuenta();
        }).catch(function () { toast("Sin conexión: no se movió.", "mal"); g.querySelectorAll("button").forEach(function (y) { y.disabled = false; }); });
      });
      b.appendChild(h("b", null, x.llevar ? "🥡 " + (x.etiqueta || x.mesa) : x.mesa)); b.appendChild(h("small", null, x.estado === "libre" ? "libre" : soles(x.total)));
      g.appendChild(b);
    });
    abrirModal("↔ Pedido #" + p.numero + " · ¿a qué mesa pasa?", [h("p", "vacio", "Está en la " + etiquetaMesa(actual).toLowerCase() + ". Cocina recibe un aviso del cambio."), g]);
  }
  var ESTADOS_COCINA = { "Nuevo": 1, "Confirmado": 1, "En preparación": 1, "Listo": 1 };
  function editarPedido(p) {
    api({ mz: "pedidoeditar", t: S.t, id: p.id }).then(function (r) {
      if (!r.ok) { toast(r.error || "No se pudo abrir el pedido.", "mal"); return; }
      var cid = uid();
      function ops2(o) { var x = {}; Object.keys(o || {}).sort().forEach(function (g) { if ((o[g] || []).length) x[g] = (o[g] || []).slice().sort(); }); return JSON.stringify(x); }
      var E = r.lineas.map(function (l) {
        return { i: l.i, id: l.id, n: l.n, cant: l.cant, cant0: l.cant, tam: l.tam, salsa: l.salsa, mitad: l.mitad, ops: JSON.parse(JSON.stringify(l.ops || {})), nota: l.nota || "", unit: l.unit,
          entregada: l.entregada, noEditable: l.noEditable, cortesia: l.cortesia, b: { tam: l.tam, salsa: l.salsa, mitad: l.mitad, ops: ops2(l.ops), nota: l.nota || "" } };
      });
      function cfgCambio(e) { return e.tam !== e.b.tam || e.salsa !== e.b.salsa || e.mitad !== e.b.mitad || ops2(e.ops) !== e.b.ops; }
      function cambio(e) { return e.cant !== e.cant0 || cfgCambio(e) || e.nota !== e.b.nota; }
      function precio(e) { var it = prodDe(e.id); return cfgCambio(e) && it ? precioDe(it, e) : e.unit; }
      function estimado() { return r2(E.reduce(function (a, e) { return a + precio(e) * e.cant; }, 0)); }
      var cuerpo, pie, guardar, total;
      function dibujar() {
        var y = capa.querySelector(".modal__cuerpo"); y = y ? y.scrollTop : 0;
        cuerpo = [];
        cuerpo.push(h("p", "vacio", "Pedido #" + r.numero + " · " + etiquetaMesa(r.mesa) + " · " + r.estado + (r.mozo ? " · 🤵 " + r.mozo : "") +
          (ESTADOS_COCINA[r.estado] ? ". Cocina ya lo tiene: al guardar se le avisa con una comanda marcada MODIFICADO." : "")));
        if (r.conPagos) cuerpo.push(h("p", "aviso-ef", "La cuenta ya tiene pagos parciales: el total no puede quedar por debajo de lo ya pagado."));
        E.forEach(function (e) {
          var it = prodDe(e.id), d = h("div", "linea edl" + (e.cant === 0 ? " fuera" : cambio(e) ? " cambio" : "")), tx = h("div", "d");
          tx.appendChild(document.createTextNode((nombreEs(prodDe(e.id)) || e.n) + (e.tam ? " " + tamEs(e.tam) : "")));
          var det = [];
          if (e.mitad && PROD[e.mitad]) det.push("½ " + e.n + " + ½ " + PROD[e.mitad].n);
          if (e.salsa && SALSA[e.salsa]) det.push("Salsa " + SALSA[e.salsa].n);
          Object.keys(e.ops || {}).forEach(function (g) { if ((e.ops[g] || []).length) det.push(e.ops[g].join(", ")); });
          if (det.length) tx.appendChild(h("small", null, det.join(" · ")));
          if (e.entregada) tx.appendChild(h("small", "ent", "✓ ya entregada"));
          d.appendChild(tx); d.appendChild(h("span", "pr", soles(precio(e) * e.cant)));
          var st = h("div", "st"), out = h("output", null, String(e.cant));
          if (!e.cortesia) {
            var menos = btn("−", "", function () { if (e.cant > 0) { e.cant--; dibujar(); } }); menos.disabled = e.entregada && e.cant <= e.cant0;
            st.appendChild(menos); st.appendChild(out);
            st.appendChild(btn("+", "", function () { if (e.cant < 30) { e.cant++; dibujar(); } }));
            if (it && !e.noEditable && !e.entregada && conOpciones(it)) st.appendChild(btn("✎ Cambiar", "nota", function () {
              fichaOpciones(it, { tam: e.tam, salsa: e.salsa, ops: e.ops, nota: e.nota, cant: e.cant, mitad: e.mitad }, function (sel) { e.tam = sel.tam || ""; e.salsa = sel.salsa || ""; e.mitad = sel.mitad || ""; e.ops = sel.ops || {}; e.nota = sel.nota || ""; e.cant = sel.cant; dibujar(); });
            }));
          } else st.appendChild(h("small", null, "cortesía"));
          d.appendChild(st);
          if (!e.cortesia && !e.entregada) {
            var nt = h("input", "campo edl__nota"); nt.maxLength = 120; nt.placeholder = "Nota para cocina"; nt.value = e.nota;
            nt.addEventListener("input", function () { e.nota = nt.value.trim(); actualizarPie(); });
            d.appendChild(nt);
          }
          cuerpo.push(d);
        });
        cuerpo.push(h("p", "vacio", "Para agregar platos nuevos, cierra esta ventana y tócalos en la carta."));
        total = h("div", "tot"); cuerpo.push(total);
        guardar = btn("Guardar cambios", "btn prim", enviarCambios);
        abrirModal("✎ Editar pedido #" + r.numero, cuerpo, [btn("Cancelar", "btn", cerrarModal), guardar]);
        var c2 = capa.querySelector(".modal__cuerpo"); if (c2) c2.scrollTop = y;
        actualizarPie();
      }
      function actualizarPie() {
        var n = E.filter(cambio).length;
        total.textContent = ""; total.appendChild(h("span", null, "Total estimado")); total.appendChild(h("span", null, soles(estimado())));
        guardar.disabled = !n; guardar.textContent = n ? "Guardar " + n + (n === 1 ? " cambio" : " cambios") : "Sin cambios";
      }
      function enviarCambios() {
        if (ESTADOS_COCINA[r.estado] && !confirm("Cocina ya tiene el pedido #" + r.numero + " (" + r.estado + "). Se le avisará del cambio con una comanda marcada MODIFICADO. ¿Guardar?")) return;
        guardar.disabled = true; guardar.textContent = "Guardando…";
        api({ mz: "editarpedido", t: S.t, id: r.id, cid: cid, lineas: E.map(function (e) { return { i: e.i, cant: e.cant, tam: e.tam, salsa: e.salsa, mitad: e.mitad, ops: e.ops, nota: e.nota }; }) }).then(function (x) {
          if (!x.ok) { toast(x.error || "No se pudo guardar.", "mal"); actualizarPie(); return; }
          cerrarModal();
          if (x.sinCambios) { toast("Sin cambios.", "ok"); return; }
          toast("✎ Pedido #" + x.numero + " modificado (" + x.resumen + ")" + (x.impreso ? " · 🖨 cocina avisada" : " · ⚠ avisa a cocina: no se pudo imprimir"), x.impreso ? "ok" : "mal");
          if (x.cuenta && String(x.cuenta.mesa) === String(S.mesa)) { S.cuenta = x.cuenta; aplicarPendientes(S.cuenta.pedidos); pintarOrden(); }
          S.v = ""; sondear();
        }).catch(function () { toast("Sin conexión: el cambio NO se guardó. Vuelve a intentar.", "mal"); actualizarPie(); });
      }
      dibujar();
    }).catch(function () { toast("Sin conexión.", "mal"); });
  }

  /* Botón "Mesa N ▾": abre el SALÓN EN VIVO (estados, totales, quién atiende) para cambiar de mesa rápido.
     Se actualiza solo con cada sondeo mientras está abierto. */
  var salonAbierto = null;
  function cuerpoSalon() {
    var w = h("div", "salon salon--modal"), activas = mesasSalon();
    if (!activas.length) { w.appendChild(h("p", "vacio", "No hay mesas activas.")); return w; }
    var ocup = activas.filter(function (m) { return m.estado !== "libre"; }).length;
    var cab = h("div", "salon__cab");
    cab.appendChild(h("div", "titulo", ocup + " de " + activas.length + " ocupadas"));
    cab.appendChild(h("span", "esp"));
    var hayPlano = activas.some(function (m) { return m.x != null && m.y != null; });
    if (hayPlano) cab.appendChild(segmento([["grid", "▦"], ["plano", "🗺 Plano"]], S.vistaM, function (v) { S.vistaM = v; guardar(K.vistaM, v); pintarSalonModal(); }));
    w.appendChild(cab);
    if (hayPlano && S.vistaM === "plano") w.appendChild(plano(activas));
    else {
      var g = h("div", "mesas");
      // primero las ocupadas (lo que más se usa), luego las libres
      activas.slice().sort(function (a, b) { return (a.estado === "libre") - (b.estado === "libre"); })
        .forEach(function (m) { g.appendChild(botonMesa(m)); });
      w.appendChild(g);
    }
    w.querySelectorAll(".mesa").forEach(function (b) { if (b.querySelector("b") && new RegExp("(^|\\s)" + S.mesa + "$").test(b.querySelector("b").textContent)) b.classList.add("actual"); });
    return w;
  }
  function pintarSalonModal() {
    if (!salonAbierto || !salonAbierto.isConnected) { salonAbierto = null; return; }
    var c = salonAbierto.querySelector(".modal__cuerpo"), y = c.scrollTop;
    c.textContent = ""; c.appendChild(cuerpoSalon()); c.scrollTop = y;
  }
  function elegirMesa() {
    salonAbierto = abrirModal("🍝 Salón en vivo", [cuerpoSalon()]);
    salonAbierto.classList.add("modal--salon");
  }
  function abrirMesa(mesa, luego) {
    ultimaCocina = null;
    if (esPseudo(mesa)) { S.mesa = mesa; S.vista = "carta"; S.q = ""; S.cuenta = { pedidos: [], total: 0 }; ultimaMesaN = "-"; pintar(); window.scrollTo(0, 0); return Promise.resolve(); }
    var mu = mesaDe(mesa);
    if (mu && mu.unidaA) { toast("La mesa " + mesa + " está unida a la mesa " + mu.unidaA + ": se abre la cuenta de la mesa " + mu.unidaA + ".", "ok"); mesa = mu.unidaA; }
    S.mesa = String(mesa); S.vista = "carta"; S.q = "";
    var m = mesaDe(mesa); ultimaMesaN = firmaMesa(m); S.cuenta = m ? cuentaDeMesa(m) : null;
    pintar(); window.scrollTo(0, 0);
    if (S.cuenta) { if (luego) setTimeout(luego, 0); return Promise.resolve(); }
    return cargarCuenta().then(function () { if (luego) luego(); });
  }
  function cargarCuenta() {
    var mesa = S.mesa;
    if (esPseudo(mesa)) return Promise.resolve();
    return api({ mz: "cuenta", t: S.t, mesa: mesa }).then(function (r) {
      if (mesa !== S.mesa) return;
      S.cuenta = r.ok ? r : { pedidos: [], total: 0 };
      aplicarPendientes(S.cuenta.pedidos);
      var ae = document.activeElement;
      if (!(ae && ae.closest && ae.closest(".orden textarea"))) pintarOrden();
    }).catch(function () { toast("No se pudo leer la cuenta de la mesa.", "mal"); });
  }
  /* ☰ categorías: saltar directo a una sección sin deslizar */
  function menuCategorias() {
    var g = h("div", "cats");
    secsVisibles().forEach(function (s) {
      var n = s.grupos.reduce(function (a, gr) { return a + gr.items.filter(permitido).length; }, 0);
      var b = btn("", "", function () { cerrarModal(); irSeccion(s.id); });
      b.appendChild(document.createTextNode(s.titulo)); b.appendChild(h("small", null, n + (n === 1 ? " plato" : " platos")));
      g.appendChild(b);
    });
    abrirModal("Categorías", [g], [btn("🚫 Agotados", "btn", function () { cerrarModal(); ventanaAgotados(); })]);
  }
  function irSeccion(id) {
    var prods = document.querySelector(".prods"), secs = document.querySelector(".secs");
    S.q = ""; var bus = document.querySelector(".top__bus"); if (bus && bus.value) { bus.value = ""; pintarProductos(); }
    var d = document.getElementById("s-" + id); if (!d || !prods) return;
    if (getComputedStyle(prods).overflowY === "auto") prods.scrollTop = d.offsetTop - 2;
    else window.scrollTo(0, d.getBoundingClientRect().top + window.scrollY - (secs ? secs.getBoundingClientRect().bottom : 60) - 4);
    marcarSec(id);
  }

  /* ---------- búsqueda tolerante y pedido rápido por texto o voz ----------
     Reutiliza busqueda.js (el mismo módulo de la carta del cliente, sin copiar código): errores de ortografía, sinónimos español/italiano y
     varios platos en una frase ("dos pizzas hawaianas medianas y una inca kola"), con vista editable ANTES de agregar. Se carga solo en la carta de
     una mesa y solo si el módulo está encendido (CARTA.ext.busqueda); si no carga, la búsqueda sigue siendo la sencilla de siempre. */
  var motorBus = null, busCargando = false;
  function cargarBusqueda() {
    if (busCargando || !(C.ext && C.ext.busqueda)) return;
    busCargando = true;
    var sq = document.createElement("script"); sq.src = "/busqueda.js"; sq.async = true;
    sq.onload = function () {
      var B = window.PG_BUSQUEDA; if (!B) return;
      var dia = S.turno ? S.turno.dia : undefined;
      try { motorBus = B.crear(C, { modo: "mesa", dia: dia }); } catch (e) { motorBus = null; }
      try {
        B.iniciar({ carta: C, modo: "mesa", dia: dia, acepta: function () { return !!(S.horario && S.horario.cocina); },
          puedePedir: function (id) { return !!PROD[id] && permitido(PROD[id]) && !motivoNo(PROD[id]); }, agregar: agregarDeBusqueda });
      } catch (e) { /* sin pedido rápido: queda la búsqueda */ }
      if (document.querySelector(".prods") && S.q) pintarProductos();
    };
    sq.onerror = function () { busCargando = false; };
    document.head.appendChild(sq);
  }
  function agregarDeBusqueda(l) {
    var it = PROD[l.id];
    if (!it || motivoNo(it) || !S.mesa || !permitido(it)) return false;
    var tam = l.tam || (it.t ? it.t[0][0] : "");
    if (it.t && !it.t.some(function (x) { return x[0] === tam; })) return false;
    agregar(it, { tam: tam, salsa: l.salsa || "", ops: l.ops || {}, nota: l.nota || "", cant: l.cant || 1, mitad: l.mitad || "" });
    return true;
  }
  function buscarCargos(q) { return CARGOS.filter(function (it) { return permitido(it) && norm(it.n + " Cargos Adicionales").indexOf(q) >= 0; }); }
  function buscarPlatos(q) {
    var res = null;
    if (motorBus) { try { res = motorBus.buscar(S.q, 40).map(function (r) { return PROD[r.id]; }).filter(permitido); } catch (e) { res = null; } }
    if (res && res.length) return res.concat(buscarCargos(q));
    return Object.keys(PROD).map(function (k) { return PROD[k]; }).filter(function (it) { return permitido(it) && norm(it.n + " " + (it.g || "") + " " + it._sec.titulo + " " + (SEC_ES[it._sec.id] || "")).indexOf(q) >= 0; }).concat(buscarCargos(q));
  }

  /* ---------- carta ---------- */
  var obs = null;
  function vistaCarta() {
    cargarBusqueda();
    var w = h("div", "carta"), secs = h("nav", "secs"), prods = h("section", "prods"), orden = h("aside", "orden");
    pintarChipsSecs(secs);
    w.appendChild(secs); w.appendChild(prods); w.appendChild(orden);
    setTimeout(function () { pintarProductos(); pintarOrden(); }, 0);
    var barra = h("div", "barra-ped"); barra.id = "barraPed"; w.appendChild(barra);
    return w;
  }
  function pintarChipsSecs(secs) {
    secs = secs || document.querySelector(".secs"); if (!secs) return;
    secs.textContent = "";
    secsVisibles().forEach(function (s) {
      secs.appendChild(btn(s.titulo, "", function () { irSeccion(s.id); }));
      secs.lastChild.dataset.s = s.id;
    });
  }
  function secsVisibles() { return SECS.filter(function (s) { return s.grupos.some(function (gr) { return gr.items.some(permitido); }); }); }
  function marcarSec(id) {
    document.querySelectorAll(".secs button").forEach(function (b) {
      var on = b.dataset.s === id; b.classList.toggle("on", on);
      if (on && b.scrollIntoView && getComputedStyle(b.parentNode).overflowX === "auto") b.parentNode.scrollLeft = b.offsetLeft - 40;
    });
  }
  function tarjeta(it) {
    var no = motivoNo(it), b = btn("", "prod" + (no ? " no" : ""), function () {
      if (it.agotado) { if (confirm(it.n + " está agotado. ¿Volvió a haber? (marcar disponible)")) cambiarAgotado(it, false); return; }
      if (no) { toast(it.n + ": " + no.toLowerCase(), "mal"); return; } tocarProducto(it, b);
    });
    if (it.foto) { var f = h("div", "ft"), u = String(it.foto); if (!/^(https?:|data:|\/)/.test(u)) u = "/" + u; f.style.backgroundImage = "url('" + u.replace(/'/g, "%27") + "')"; b.appendChild(f); }
    var tx = h("div", "tx");
    var nes = nombreEs(it);
    tx.appendChild(h("span", "n", nes));
    if (nes !== it.n) tx.appendChild(h("span", "g", it.n)); else if (it.g) tx.appendChild(h("span", "g", it.g));
    if (it._sec && it._sec.id === "tienda") tx.appendChild(h("span", "tag-t", "Tienda · no va a cocina"));
    if (conOpciones(it) && !no) tx.appendChild(h("span", "op", modoPres(it) === "peso" ? "elige peso" : modoPres(it) === "paq" ? "elige paquetes" : it.t ? "elige tamaño" : it.salsa ? "elige salsa" : "opciones"));
    tx.appendChild(h("span", "p", no || precioTxt(it)));
    b.appendChild(tx);
    var q = cantTxt(it); if (q) b.appendChild(h("span", "q", q));
    b.dataset.id = it.id;
    return b;
  }
  function pintarProductos() {
    var prods = document.querySelector(".prods"); if (!prods) return;
    prods.textContent = "";
    var q = norm(S.q).trim();
    if (q) {
      var res = buscarPlatos(q);
      prods.appendChild(h("div", "sec-h", res.length + " resultado" + (res.length === 1 ? "" : "s")));
      var g = h("div", "grid"); res.forEach(function (it) { g.appendChild(tarjeta(it)); }); prods.appendChild(g);
      if (!res.length) prods.appendChild(h("p", "vacio", "No hay platos con “" + S.q + "”."));
      return;
    }
    if (obs) obs.disconnect();
    obs = "IntersectionObserver" in window ? new IntersectionObserver(function (es) {
      es.forEach(function (e) { if (e.isIntersecting) marcarSec(e.target.dataset.s); });
    }, { root: getComputedStyle(prods).overflowY === "auto" ? prods : null, rootMargin: "0px 0px -75% 0px" }) : null;
    secsVisibles().forEach(function (s) {
      var sec = h("div"); sec.id = "s-" + s.id; sec.dataset.s = s.id;
      sec.appendChild(h("div", "sec-h", s.titulo));
      var grs = s.grupos.map(function (gr) { return { titulo: gr.titulo, items: gr.items.filter(permitido) }; }).filter(function (gr) { return gr.items.length; });
      grs.forEach(function (gr) {
        if (gr.titulo && grs.length > 1) sec.appendChild(h("div", "sub-h", gr.titulo));
        var g = h("div", "grid"); gr.items.forEach(function (it) { g.appendChild(tarjeta(it)); }); sec.appendChild(g);
      });
      prods.appendChild(sec);
      if (obs) obs.observe(sec);
    });
  }
  function refrescarTarjeta(id) {
    document.querySelectorAll('.prod[data-id="' + id + '"]').forEach(function (b) {
      var q = b.querySelector(".q"), n = cantTxt(prodDe(id) || { id: id });
      if (n) { if (!q) { q = h("span", "q"); b.appendChild(q); } q.textContent = n; } else if (q) q.remove();
      b.classList.remove("flash"); void b.offsetWidth; b.classList.add("flash");
    });
  }

  /* ---------- agregar al pedido ---------- */
  function tocarProducto(it, b) {
    if (S.horario && !S.horario.cocina && modoActual() === "mesa" && !(it._sec && it._sec.id === "tienda")) { toast(S.horario.cocinaEn ? "La cocina todavía no abre (" + S.horario.abre + ")." : "La cocina ya cerró.", "mal"); return; }
    if (!conOpciones(it)) { agregar(it, { tam: "", salsa: "", ops: {}, nota: "", cant: 1 }); return; }
    fichaOpciones(it);
  }
  function igualLinea(a, b) { return a.id === b.id && a.tam === b.tam && a.salsa === b.salsa && a.nota === b.nota && (a.mitad || "") === (b.mitad || "") && JSON.stringify(a.ops) === JSON.stringify(b.ops); }
  function agregar(it, sel) {
    var l = { id: it.id, n: it.n, tam: sel.tam || "", salsa: sel.salsa || "", ops: sel.ops || {}, nota: sel.nota || "", cant: sel.cant || 1, mitad: sel.mitad || "", unit: precioDe(it, sel) };
    var c = carro(), igual = c.filter(function (x) { return igualLinea(x, l); })[0];
    if (igual) igual.cant = Math.min(30, igual.cant + l.cant); else c.push(l);
    guardarCarros(); refrescarTarjeta(it.id); pintarOrden();
    if (window.innerWidth <= 860) toast("+" + l.cant + " " + nombreEs(it), "ok");
  }
  function chips(opciones, multiple, elegidas, alCambiar) {
    var w = h("div", "chips");
    opciones.forEach(function (o) {
      var b = btn("", elegidas.indexOf(o.v) >= 0 ? "on" : "", function () {
        var i = elegidas.indexOf(o.v);
        if (multiple) { if (i >= 0) elegidas.splice(i, 1); else elegidas.push(o.v); }
        else { elegidas.length = 0; elegidas.push(o.v); }
        w.querySelectorAll("button").forEach(function (x) { x.classList.toggle("on", elegidas.indexOf(x.dataset.v) >= 0); });
        alCambiar(elegidas.slice());
      });
      b.dataset.v = o.v; b.appendChild(document.createTextNode(o.t)); if (o.s) b.appendChild(h("small", null, o.s));
      w.appendChild(b);
    });
    return w;
  }
  function fichaOpciones(it, linea, alGuardar) {
    var sel = linea ? { tam: linea.tam, salsa: linea.salsa, ops: JSON.parse(JSON.stringify(linea.ops || {})), nota: linea.nota, cant: linea.cant, mitad: linea.mitad || "" }
      : { tam: it.t ? it.t[0][0] : "", salsa: "", ops: {}, nota: "", cant: 1, mitad: "" };
    var pres = linea || alGuardar ? (alGuardar && modoPres(it) === "paq" ? "paq" : "") : modoPres(it);
    if (pres) { sel.tam = "1/2 kg"; sel.cuartos = 2; }
    var infoPres = h("p", "pres-info");
    var cuerpo = [], err = h("p", "err"), add, zonaSalsa = h("div");
    zonaSalsa.style.display = "flex"; zonaSalsa.style.flexDirection = "column"; zonaSalsa.style.gap = "12px";
    function totalSel() { return pres === "peso" ? lineasPeso(it, sel.cuartos).reduce(function (a, x) { return a + x.unit * x.cant; }, 0) : precioDe(it, sel) * sel.cant; }
    function pintarBoton() {
      add.textContent = (linea ? "Guardar" : "Agregar") + " · " + soles(totalSel()); err.textContent = "";
      infoPres.textContent = pres === "paq" ? sel.cant + (sel.cant === 1 ? " paquete" : " paquetes") + " · " + fmtKg(sel.cant * 0.5) + " kg" : pres === "peso" ? fmtCuartos(sel.cuartos) + " kg (" + descPartes(sel.cuartos) + ")" : "";
    }
    function bloque(gid) {
      var g = GRUPOS[gid], w = h("div"); w.style.display = "flex"; w.style.flexDirection = "column"; w.style.gap = "8px";
      w.appendChild(h("div", "lbl" + (g.req ? " req" : ""), g.n));
      var eleg = (sel.ops[gid] = sel.ops[gid] || []);
      w.appendChild(chips(g.ops.map(function (o) { return { v: o.n, t: o.n, s: o.p ? "+ " + soles(o.p) : "" }; }), g.tipo === "varias", eleg, function () { pintarBoton(); }));
      return w;
    }
    if (pres) {
      cuerpo.push(h("div", "lbl", pres === "paq" ? "Paquete de 500 g · " + soles(precioTam(it, "1/2 kg")) : "Peso (de ¼ en ¼ kg) · " + soles(precioTam(it, "1/2 kg") * 2) + " el kg"));
      cuerpo.push(infoPres);
      if (pres === "peso") cuerpo.push(h("small", "pres-nota", NOTA_PESO));
    } else if (it.t) {
      cuerpo.push(h("div", "lbl", "Tamaño"));
      var et = [sel.tam];
      cuerpo.push(chips(it.t.map(function (x) { return { v: x[0], t: tamEs(x[0]), s: soles(x[1]) }; }), false, et, function (v) { sel.tam = v[0]; pintarMitad(); pintarBoton(); }));
    }
    /* Mitad y mitad: en Media y Famiglia se puede elegir un 2.º sabor; se cobra el precio de la más cara */
    var zonaMitad = h("div");
    zonaMitad.style.display = "flex"; zonaMitad.style.flexDirection = "column"; zonaMitad.style.gap = "8px";
    function pintarMitad() {
      zonaMitad.textContent = "";
      var puede = it._sec && it._sec.id === "pizze" && it.t && it.t.length > 1 && sel.tam !== it.t[0][0];
      if (!puede) { sel.mitad = ""; return; }
      var otras = Object.keys(PROD).map(function (k) { return PROD[k]; }).filter(function (o) {
        return o.id !== it.id && o._sec && o._sec.id === "pizze" && !o.agotado && o.t && o.t.some(function (x) { return x[0] === sel.tam; });
      });
      if (!otras.some(function (o) { return o.id === sel.mitad; })) sel.mitad = "";
      zonaMitad.appendChild(h("div", "lbl", "Mitad y mitad (opcional) · se cobra la más cara"));
      var em = [sel.mitad || ""];
      zonaMitad.appendChild(chips([{ v: "", t: "Un solo sabor" }].concat(otras.map(function (o) {
        return { v: o.id, t: o.n, s: soles(o.t.filter(function (x) { return x[0] === sel.tam; })[0][1]) };
      })), false, em, function (v) { sel.mitad = v[0] || ""; pintarBoton(); }));
    }
    cuerpo.push(zonaMitad); pintarMitad();
    function pintarSalsa() {
      zonaSalsa.textContent = "";
      var s = SALSA[sel.salsa];
      (s && s.op || []).forEach(function (gid) { if (GRUPOS[gid] && (it.op || []).indexOf(gid) < 0) zonaSalsa.appendChild(bloque(gid)); });
    }
    if (it.salsa) {
      cuerpo.push(h("div", "lbl req", "Salsa"));
      var es = sel.salsa ? [sel.salsa] : [];
      cuerpo.push(chips(SALSAS.map(function (s) { var sp = PROD[s.id]; return { v: s.id, t: s.n || (sp && sp.n), s: s.extra ? "+ " + soles(s.extra) : "" }; }), false, es, function (v) {
        Object.keys(sel.ops).forEach(function (g) { if ((it.op || []).indexOf(g) < 0) delete sel.ops[g]; });
        sel.salsa = v[0]; pintarSalsa(); pintarBoton();
      }));
      cuerpo.push(zonaSalsa); pintarSalsa();
    }
    (it.op || []).forEach(function (gid) { if (GRUPOS[gid]) cuerpo.push(bloque(gid)); });
    cuerpo.push(h("div", "lbl", it._cargo ? "Nota (opcional)" : "Indicación para cocina (opcional)"));
    var nota = h("input", "campo"); nota.maxLength = 120; nota.placeholder = "Ej.: sin cebolla, bien cocido…"; nota.value = sel.nota || "";
    nota.addEventListener("input", function () { sel.nota = nota.value.trim(); });
    cuerpo.push(nota); cuerpo.push(err);
    var step = h("div", "step"), out = h("output", null, pres === "peso" ? fmtCuartos(sel.cuartos) : String(sel.cant));
    step.appendChild(btn("−", "", function () {
      if (pres === "peso") { if (sel.cuartos > 1) { sel.cuartos--; out.textContent = fmtCuartos(sel.cuartos); pintarBoton(); } }
      else if (sel.cant > 1) { sel.cant--; out.textContent = sel.cant; pintarBoton(); }
    }));
    step.appendChild(out);
    step.appendChild(btn("+", "", function () {
      if (pres === "peso") { if (sel.cuartos < 40) { sel.cuartos++; out.textContent = fmtCuartos(sel.cuartos); pintarBoton(); } }
      else if (sel.cant < 30) { sel.cant++; out.textContent = sel.cant; pintarBoton(); }
    }));
    if (pres === "peso") step.classList.add("step--peso");
    add = btn("", "btn prim", function () {
      if (it.salsa && !sel.salsa) { err.textContent = "Elige la salsa."; return; }
      var falta = gruposDe(it, sel.salsa).filter(function (g) { return GRUPOS[g].req && !(sel.ops[g] || []).length; })[0];
      if (falta) { err.textContent = "Elige " + GRUPOS[falta].n.toLowerCase() + "."; return; }
      Object.keys(sel.ops).forEach(function (g) { if (!(sel.ops[g] || []).length) delete sel.ops[g]; });
      if (alGuardar) { alGuardar(sel); return; }   // edición de un pedido ya enviado: devuelve la selección sin tocar el carro
      var volverAlPedido = modalPedido;
      if (linea) {
        var c = carro(), i = c.indexOf(linea);
        if (i >= 0) c.splice(i, 1);
      }
      cerrarModal();
      if (pres === "peso") lineasPeso(it, sel.cuartos).forEach(function (x) { agregar(it, { tam: x.tam, salsa: "", ops: {}, nota: sel.nota, cant: x.cant, mitad: "" }); });
      else agregar(it, sel);
      if (volverAlPedido) abrirPedidoCelular();
    });
    pintarBoton();
    if (!linea && !it._cargo) cuerpo.push(btn("🚫 Marcar " + it.n + " como agotado", "link-agot", function () { cerrarModal(); cambiarAgotado(it, true); }));
    abrirModal(it.n + (it.g ? " · " + it.g : ""), cuerpo, [step, add]);
  }

  /* ---------- agotados: se marcan desde aquí y se aplican al instante (mozo, QR, delivery) ---------- */
  function ventanaAgotados() {
    var bus = h("input", "campo"); bus.type = "search"; bus.placeholder = "Buscar plato o salsa…";
    var lista = h("div", "agot");
    var todos = Object.keys(PROD).map(function (k) { return PROD[k]; }).concat(SALSAS_TODAS.map(function (x) { return { id: x.id, n: "Salsa " + (x.n || (PROD[x.id] || {}).n || x.id), _salsa: x }; }));
    function estaAgot(it) { return it._salsa ? !!it._salsa.agotado : !!it.agotado; }
    function pintarL() {
      lista.textContent = "";
      var q = norm(bus.value).trim();
      var ver = todos.filter(function (it) { return !q || norm(it.n + " " + (it.g || "")).indexOf(q) >= 0; })
        .sort(function (a, b) { return (estaAgot(b) - estaAgot(a)); });
      ver.slice(0, 80).forEach(function (it) {
        var ag = estaAgot(it);
        var f = btn("", "agot__f" + (ag ? " on" : ""), function () { cambiarAgotado(it, !ag, pintarL); });
        f.appendChild(h("span", null, it.n + (it.g ? " · " + it.g : "")));
        f.appendChild(h("b", null, ag ? "🚫 Agotado" : "Disponible"));
        lista.appendChild(f);
      });
    }
    bus.addEventListener("input", pintarL); pintarL();
    abrirModal("🚫 Agotados", [h("p", "vacio", "Toca para marcar o desmarcar. Se aplica al instante en tu panel, en los pedidos por QR y en delivery."), bus, lista]);
  }
  function cambiarAgotado(it, agotado, luego) {
    if (agotado && !confirm("¿Marcar " + it.n + " como AGOTADO? Nadie podrá pedirlo (mesa, QR ni delivery) hasta que lo desmarques.")) return;
    if (it._salsa) it._salsa.agotado = agotado; else it.agotado = agotado;
    SALSAS = SALSAS_TODAS.filter(function (x) { return !x.agotado; });
    firmaAgot = null;
    if (luego) luego();
    if (document.querySelector(".prods")) pintarProductos();
    api({ mz: "agotado", t: S.t, id: it.id, agotado: agotado }).then(function (r) {
      if (!r.ok) { toast(r.error || "No se pudo guardar.", "mal"); return; }
      toast((agotado ? "🚫 " + it.n + " agotado" : "✓ " + it.n + " disponible otra vez"), "ok"); S.v = "";
    }).catch(function () { toast("Sin conexión: no se guardó.", "mal"); });
  }

  /* ---------- columna del pedido ---------- */
  function contenidoOrden() {
    if (esPseudo(S.mesa)) return ordenExterna();
    var w = h("div", "orden"), cab = h("div", "orden__cab"), m = mesaDe(S.mesa);
    cab.appendChild(h("h2", null, etiquetaMesa(S.mesa)));
    if (m) cab.appendChild(h("span", "orden__est e-" + estadoMesa(m), TXT_ESTADO[estadoMesa(m)] + (m.atiende ? " · 🤵 " + (m.atiende.id === yo() ? "tú" : m.atiende.nombre) : "")));
    if (S.cuenta && S.cuenta.pedidos.length) cab.appendChild(btn("💳 Cobrar", "btn azul peq", function () { cobrar(); }));
    w.appendChild(cab);
    if (m && m.unidas && m.unidas.length) {
      var un = h("div", "unidas-aviso"); un.appendChild(h("span", null, "🔗 Cuenta unida con la mesa " + m.unidas.join(", ") + " (una sola cuenta)."));
      un.appendChild(btn("✂ Separar mesas", "btn peq", separarMesasUI)); w.appendChild(un);
    }
    // acciones de la mesa
    var acc = h("div", "orden__acc");
    if (m && m.estado === "libre" && !m.llevar) acc.appendChild(btn("🪑 Sentar clientes", "btn peq", function () { sentar(S.mesa); }));
    if (m && m.estado !== "libre" && !m.llevar) acc.appendChild(btn("👥 " + (m.personas ? m.personas + " personas" : "¿Cuántos son?"), "btn peq", function () { var me = S.mesa; pedirPersonas(me, function (n) { guardarPersonas(me, n); }); }));
    if (m && m.alerta) acc.appendChild(h("div", "olvido-txt", "⏰ " + textoAlerta(m)));
    if (m && m.estado !== "libre" && (!m.atiende || m.atiende.id !== yo()) && !esLocalRol()) acc.appendChild(btn("🔁 Pasar a mí", "btn peq", function () { ocupar(S.mesa, true); }));
    if (m && m.estado !== "libre" && ((m.atiende && m.atiende.id === yo() && variosMozos()) || esLocalRol())) acc.appendChild(btn(esLocalRol() ? "🤵 Asignar mozo" : "🔁 Pasar a otro mozo", "btn peq", pasarA));
    if (m && m.estado === "sentada") acc.appendChild(btn(m.llevar ? "🆓 Cancelar pedido para llevar" : "🆓 Liberar mesa", "btn peq", liberar));
    if (m && !m.llevar && !(m.pagos && m.pagos.length) && (!m.unidas || !m.unidas.length)) acc.appendChild(btn("🔗 Juntar mesas", "btn peq", juntarMesasUI));
    if (acc.childNodes.length) w.appendChild(acc);
    var lista = h("div", "orden__lista"), c = carro();
    if (!c.length) lista.appendChild(h("p", "vacio", "Toca los platos para agregarlos al pedido."));
    else lista.appendChild(h("div", "lbl", "Por enviar a cocina"));
    agrupar(c).forEach(function (gr) {
      var l = gr.l, ls = gr.ls, grp = gr.g;
      var it = prodDe(l.id), d = h("div", "linea"), tx = h("div", "d");
      tx.appendChild(document.createTextNode((l.mitad && PROD[l.mitad] ? (nombreEs(it) || l.n) + " con " + nombreEs(PROD[l.mitad]) : (nombreEs(it) || l.n)) + sufijoLinea(l, ls, grp)));
      if (grp) tx.appendChild(h("small", null, NOTA_PESO));
      var det = [];
      if (l.salsa && SALSA[l.salsa]) det.push("Salsa " + SALSA[l.salsa].n);
      Object.keys(l.ops || {}).forEach(function (g) { if ((l.ops[g] || []).length) det.push(l.ops[g].join(", ")); });
      if (det.length) tx.appendChild(h("small", null, det.join(" · ")));
      if (l.nota) tx.appendChild(h("em", null, "→ " + l.nota));
      d.appendChild(tx); d.appendChild(h("span", "pr", soles(ls.reduce(function (a, x) { return a + x.unit * x.cant; }, 0))));
      var st = stepLinea(c, l, ls, grp, pintarOrden), conCambiar = conOpciones(it || {}) && !modoPres(it);
      st.appendChild(btn(conCambiar ? "✎ Cambiar" : "✎ Nota", "nota", function () {
        if (it && conCambiar) { fichaOpciones(it, l); return; }
        var n = prompt("Indicación para cocina:", l.nota || ""); if (n == null) return;
        ls.forEach(function (x) { x.nota = n.trim().slice(0, 120); }); guardarCarros(); pintarOrden();
      }));
      st.appendChild(btn("🗑", "x", function () { ls.forEach(function (x) { c.splice(c.indexOf(x), 1); }); guardarCarros(); refrescarTarjeta(l.id); pintarOrden(); }));
      d.appendChild(st);
      lista.appendChild(d);
    });
    // lo que ya se envió (por el mozo o desde el QR)
    var cu = h("div", "cuenta");
    if (!S.cuenta) cu.appendChild(h("p", "vacio", "Cargando cuenta…"));
    else if (S.cuenta.pedidos.length) {
      var t3 = h("h3"); t3.appendChild(h("span", null, "Ya enviado")); t3.appendChild(h("span", null, soles(S.cuenta.total))); cu.appendChild(t3);
      if (S.cuenta.pagado > 0.009) {
        var pg = h("div", "pagos-prev");
        pg.appendChild(h("b", null, "💵 Pagado " + soles(S.cuenta.pagado) + " · saldo " + soles(S.cuenta.saldo)));
        (S.cuenta.pagos || []).forEach(function (x) { pg.appendChild(h("small", null, (x.etiqueta || "Pago") + " · " + x.metodo + " " + soles(x.monto) + (x.propina ? " + propina " + soles(x.propina) : "") + (x.hora ? " · " + x.hora : ""))); });
        cu.appendChild(pg);
      }
      S.cuenta.pedidos.forEach(function (p) {
        if (p.lineas) { cu.appendChild(tarjetaServir(mesaDe(S.mesa) || { mesa: S.mesa }, p, false)); return; }
        var d = h("div", "ped");
        d.appendChild(h("div", "m", "#" + p.numero + " · " + p.hora + " · " + (p.mozo ? "🤵 " + p.mozo : "📱 desde el QR") + " · " + p.estado));
        d.appendChild(h("pre", null, p.detalle.replace(/ — S\/ [\d.]+/g, "")));
        cu.appendChild(d);
      });
    } else cu.appendChild(h("p", "vacio", "La mesa todavía no tiene pedidos."));
    lista.appendChild(cu);
    w.appendChild(lista);

    var pie = h("div", "orden__pie");
    if (c.length) {
      var notas = h("textarea", "notas"); notas.placeholder = "Comentario para cocina (opcional)"; notas.maxLength = 200;
      notas.value = (carros["_n" + S.mesa] || ""); notas.addEventListener("input", function () { carros["_n" + S.mesa] = notas.value; guardar(K.carros, carros); });
      pie.appendChild(notas);
      var cocina = S.horario && S.horario.cocina;
      var env = btn(S.enviando ? "Enviando…" : (cocina ? "Enviar a cocina · " + soles(totalCarro()) : "Cocina cerrada"), "btn prim", enviar);
      env.disabled = S.enviando || !cocina;
      pie.appendChild(env);
    } else if (S.cuenta && S.cuenta.pedidos.length) {
      var sal = S.cuenta.saldo != null ? S.cuenta.saldo : S.cuenta.total;
      pie.appendChild(btn((S.cuenta.pagado > 0.009 ? "💳 Cobrar saldo · " + soles(sal) : "💳 Cobrar mesa · " + soles(S.cuenta.total)), "btn azul", function () { cobrar(); }));
      pie.appendChild(btn("✂ Dividir cuenta", "btn peq", dividirCuenta));
    }
    w.appendChild(pie);
    return w;
  }
  function pintarOrden() {
    var o = document.querySelector(".carta > .orden");
    if (o) o.replaceWith(contenidoOrden());
    var b = document.getElementById("barraPed");
    if (b) {
      b.textContent = "";
      var n = unidades();
      if (n) b.appendChild(btn("Ver pedido (" + n + ") · " + soles(totalCarro()), "btn cta", abrirPedidoCelular));
      if (n && esPseudo(S.mesa)) b.appendChild(btn("Continuar ›", "btn azul", function () { formExterno(S.mesa === DL ? "delivery" : "recojo"); }));
      else if (n) { /* nada más */ }
      else if (esPseudo(S.mesa)) b.appendChild(btn(etiquetaMesa(S.mesa) + " · toca los productos", "btn cta", abrirPedidoCelular));
      else if (S.cuenta && S.cuenta.pedidos.length) {
        b.appendChild(btn("Cuenta · " + soles(S.cuenta.total), "btn cta", abrirPedidoCelular));
        b.appendChild(btn("💳 Cobrar", "btn azul", function () { cobrar(); }));
      } else b.appendChild(btn(etiquetaMesa(S.mesa) + " · sin pedidos", "btn cta", abrirPedidoCelular));
    }
    if (modalPedido) { var m = capa.querySelector(".modal .orden"); if (m) m.replaceWith(contenidoOrden()); }
  }
  function abrirPedidoCelular() {
    var m = abrirModal("Pedido · " + etiquetaMesa(S.mesa), [contenidoOrden()]);
    m.querySelector(".modal__cuerpo").style.padding = "0";
    modalPedido = true;
  }

  var omitidas = {}, personasPend = {};
  function enviar() {
    var c = carro(); if (!c.length || S.enviando) return;
    if (esPseudo(S.mesa)) { formExterno(S.mesa === DL ? "delivery" : "recojo"); return; }
    var mesa = S.mesa, mm0 = mesaDe(mesa);
    // primer pedido de la mesa: preguntar cuántas personas son (se puede omitir)
    if (mm0 && !mm0.llevar && !mm0.personas && !mm0.n && !omitidas[mesa]) {
      // las personas viajan dentro del mismo pedido (así el servidor agrega el pan al ajo de cortesía sin falta)
      pedirPersonas(mesa, function (n) { if (n) { mm0.personas = n; personasPend[mesa] = n; } else omitidas[mesa] = true; enviar(); }, true);
      return;
    }
    S.enviando = true; pintarOrden();
    var cuerpo = { mz: "pedido", t: S.t, mesa: mesa, notas: carros["_n" + mesa] || "", personas: personasPend[mesa] || 0,
      items: c.map(function (l) { return { id: l.id, tam: l.tam, salsa: l.salsa, cant: l.cant, nota: l.nota, ops: l.ops || {}, mitad: l.mitad || "" }; }) };
    api(cuerpo).then(function (r) {
      S.enviando = false;
      if (!r.ok) { toast(r.error || "No se pudo enviar.", "mal"); pintarOrden(); return; }
      carros[mesa] = []; delete carros["_n" + mesa]; guardarCarros(); delete personasPend[mesa];
      if (r.cuenta && mesa === S.mesa) S.cuenta = r.cuenta;
      // al instante: la mesa queda ocupada (a mi nombre si estaba libre); el sondeo trae el estado real
      var mm = mesaDe(mesa);
      if (mm && r.cuenta) {
        if (mm.estado === "libre" || mm.estado === "sentada") { mm.estado = "cocina"; if (!mm.atiende) mm.atiende = S.mozo; if (!mm.ts) mm.ts = Date.now() + S.desfase; }
        mm.pedidos = r.cuenta.pedidos; mm.total = r.cuenta.total; mm.n = r.cuenta.pedidos.length;
        mm.porServir = r.cuenta.pedidos.reduce(function (a, q) { return a + (q.falta || 0); }, 0);
      }
      S.v = "";
      toast("✓ Pedido #" + r.numero + " enviado a cocina (mesa " + mesa + ")", "ok");
      if (modalPedido) cerrarModal();
      pintar(); sondear();
    }).catch(function () {
      S.enviando = false; pintarOrden();
      toast("Sin conexión: el pedido NO se envió. Vuelve a intentar.", "mal");
    });
  }

  /* ---------- cobrar la mesa ----------
     · Un cobro puede ser total (cierra la cuenta) o PARCIAL: si lo pagado es menos que el saldo, queda registrado con su método real y la cuenta sigue abierta con su saldo.
     · Pago mixto: "Pagar con otro método" agrega una línea (efectivo + Yape + tarjeta…), cada una con su monto y su propina.
     · Dividir la cuenta (por ítems, partes iguales o personas): cada parte se cobra aparte con esta misma ventana (parte = { modo, etiqueta, monto, items }).
     · Cada ventana trae su clave (cid): si se reintenta por mala señal, el servidor no registra el cobro dos veces. */
  function cobrar(sugerido, reintento, division, parte, luego) {
    if (!division) { var avc = S.avisos.filter(function (a) { return a.motivo === "cuenta" && String(a.mesa) === String(S.mesa) && a.division && a.division.length > 1; })[0]; if (avc) { division = avc.division; sugerido = sugerido || avc.detalle; } }
    if (!S.cuenta) { if (!reintento) cargarCuenta().then(function () { cobrar(sugerido, true, division, parte, luego); }); return; }
    if (!S.cuenta.pedidos.length) { toast("La mesa " + S.mesa + " no tiene cuenta abierta.", "mal"); return; }
    if (!reintento && carro().length && !confirm("Hay platos sin enviar a cocina en esta mesa. ¿Cobrar igual? (no se incluyen en la cuenta)")) return;
    var total = S.cuenta.total, saldo = S.cuenta.saldo != null ? S.cuenta.saldo : total, pagadoAntes = S.cuenta.pagado || 0, metodos = S.metodos, cid = uid();
    var objetivo = parte ? Math.min(parte.monto, saldo) : saldo;   // lo que se cobra en esta ventana
    var inicial = metodos.filter(function (m) { return sugerido && norm(sugerido).indexOf(norm(m)) >= 0; })[0] || "";
    var pagos = [{ metodo: inicial, monto: objetivo, propina: 0 }];
    var divOk = !parte && !pagadoAntes && division && division.length > 1 && Math.abs(division.reduce(function (a, x) { return a + x; }, 0) - total) < 0.05;
    if (divOk) pagos = division.map(function (x, i) { return { metodo: inicial, monto: i === division.length - 1 ? r2(total - division.slice(0, -1).reduce(function (a, y) { return a + y; }, 0)) : x, propina: 0 }; });
    var zona = h("div"), resumen = h("div", "resumen"), err = h("p", "err"), ok;
    zona.style.display = "flex"; zona.style.flexDirection = "column"; zona.style.gap = "10px";
    function suma() { return r2(pagos.reduce(function (a, p) { return a + (Number(p.monto) || 0); }, 0)); }
    function restante() { return r2(objetivo - suma()); }
    /* ¿qué pasaría al registrar? "total" = cierra la cuenta; "parcial" = queda saldo; "" = montos no válidos todavía */
    function modo() {
      var s = suma();
      if (s <= 0.009) return "";
      if (Math.abs(s - saldo) < 0.01) return "total";
      if (parte) return Math.abs(s - objetivo) < 0.01 ? "parcial" : "";
      return s < saldo ? "parcial" : "";
    }
    function pintarPagos() {
      zona.textContent = "";
      pagos.forEach(function (p, i) {
        var w = h("div", "pago");
        if (pagos.length > 1) {
          var tt = h("div", "fila"); tt.appendChild(h("b", null, "Pago " + (i + 1))); tt.appendChild(h("span", "esp"));
          tt.appendChild(btn("Quitar", "btn peq", function () { pagos.splice(i, 1); if (pagos.length === 1) pagos[0].monto = objetivo; pintarPagos(); }));
          w.appendChild(tt);
        }
        var em = p.metodo ? [p.metodo] : [], extra = h("div", "pago__extra");
        w.appendChild(chips(metodos.map(function (m) { return { v: m, t: m }; }), false, em, function (v) { p.metodo = v[0]; err.textContent = ""; pintarExtra(); }));
        w.appendChild(extra);
        // Yape / Plin: sin QR en el panel del mozo. Efectivo: calcular el vuelto.
        function pintarExtra() {
          extra.textContent = "";
          if (/^(yape|plin)$/i.test(p.metodo)) {
            var dp = COBRO[/^yape$/i.test(p.metodo) ? "Yape" : "Plin"] || {};
            if (!localModo && dp.qr) { var q = h("img", "qrpago"); q.src = urlPago(dp.qr); q.alt = "QR " + p.metodo; extra.appendChild(q); }   // el panel del local no muestra QR
            extra.appendChild(h("p", "vacio", (!localModo && dp.qr ? "Muestra este QR al cliente. " : "") + "Registra el cobro cuando veas que llegó el pago."));
          } else if (/efectivo/i.test(p.metodo)) {
            var f = h("div", "fila"), inp = h("input", "campo"), out = h("b", "vuelto");
            inp.type = "number"; inp.inputMode = "decimal"; inp.placeholder = "Paga con… (opcional)";
            inp.addEventListener("input", function () {
              var v = Number(inp.value) || 0, debe = (Number(p.monto) || 0) + (Number(p.propina) || 0);
              out.textContent = v ? (v >= debe ? "Vuelto " + soles(v - debe) : "Faltan " + soles(debe - v)) : "";
            });
            f.appendChild(h("label", null, "Recibe")); f.appendChild(inp); f.appendChild(out); extra.appendChild(f);
          }
        }
        pintarExtra();
        var f1 = h("div", "fila"), lab1 = h("label", null, "Monto"), mo = h("input", "campo");
        mo.type = "number"; mo.inputMode = "decimal"; mo.step = "0.01"; mo.min = "0"; mo.value = p.monto;
        mo.addEventListener("input", function () { p.monto = Number(mo.value) || 0; pintarResumen(); });
        f1.appendChild(lab1); f1.appendChild(mo); w.appendChild(f1);
        var f2 = h("div", "fila"), lab2 = h("label", null, "Propina"), pr = h("input", "campo");
        pr.type = "number"; pr.inputMode = "decimal"; pr.step = "0.5"; pr.min = "0"; pr.placeholder = "0"; pr.value = p.propina || "";
        pr.addEventListener("input", function () { p.propina = Number(pr.value) || 0; pintarResumen(); });
        f2.appendChild(lab2); f2.appendChild(pr); w.appendChild(f2);
        var rap = h("div", "chips");
        [["Sin propina", 0], ["S/ 2", 2], ["S/ 5", 5], ["S/ 10", 10], ["10%", -10]].forEach(function (x) {
          rap.appendChild(btn(x[0], "", function () { p.propina = x[1] < 0 ? r2((Number(p.monto) || 0) * 0.1) : x[1]; pr.value = p.propina || ""; pintarResumen(); }));
        });
        w.appendChild(rap);
        zona.appendChild(w);
      });
      zona.appendChild(btn("➕ Pago mixto: agregar otro método de pago", "btn peq", function () {
        var falta = restante(); if (falta <= 0 && pagos.length) { pagos[pagos.length - 1].monto = r2(pagos[pagos.length - 1].monto / 2); falta = restante(); }
        pagos.push({ metodo: "", monto: Math.max(0, falta), propina: 0 }); pintarPagos();
      }));
      pintarResumen();
    }
    function pintarResumen() {
      var m = modo(), falta = restante(), prop = r2(pagos.reduce(function (a, p) { return a + (Number(p.propina) || 0); }, 0));
      resumen.className = "resumen " + (m ? "ok" : "mal");
      resumen.textContent = "";
      var txt = m === "total" ? "✓ " + (pagadoAntes || parte ? "Con esto la cuenta queda pagada" : "Cuenta completa")
        : m === "parcial" ? "Pago parcial: quedará un saldo de " + soles(r2(saldo - suma()))
        : falta > 0 ? "Falta " + soles(falta) + (parte ? " de esta parte" : " (o registra solo un pago parcial)") : "Sobra " + soles(-falta);
      resumen.appendChild(h("span", null, txt));
      resumen.appendChild(h("span", null, prop ? "Propina " + soles(prop) : ""));
      if (ok) { ok.textContent = m === "parcial" ? "💵 Registrar pago parcial" : "✓ Registrar cobro"; }
      compDiv.style.display = m === "parcial" ? "none" : "";
    }
    /* comprobante: Sin comprobante / Boleta / Factura (solo los tipos habilitados en el panel; se pide al cerrar la cuenta) */
    var comp = { tipo: "", doc: "", razon: "", correo: "" }, compDiv = h("div", "pago");
    function pintarComp() {
      compDiv.textContent = "";
      var tipos = S.comprobantes || ["Boleta", "Factura"];
      if (!tipos.length) return;
      compDiv.appendChild(h("b", null, "🧾 Comprobante"));
      compDiv.appendChild(chips([{ v: "", t: "Sin comprobante" }].concat(tipos.map(function (t) { return { v: t, t: t }; })), false, [comp.tipo], function (v) { comp.tipo = v[0] || ""; err.textContent = ""; pintarComp(); }));
      if (!comp.tipo) return;
      function campo(rot, k, ph, tipo, modo2) {
        var f = h("div", "fila"), i = h("input", "campo");
        i.type = tipo || "text"; i.placeholder = ph; i.value = comp[k]; if (modo2) i.inputMode = modo2;
        i.addEventListener("input", function () { comp[k] = i.value; });
        f.appendChild(h("label", null, rot)); f.appendChild(i); compDiv.appendChild(f);
      }
      campo(comp.tipo === "Factura" ? "RUC" : "DNI (opcional)", "doc", comp.tipo === "Factura" ? "11 dígitos" : "8 dígitos", "text", "numeric");
      campo(comp.tipo === "Factura" ? "Razón social" : "Nombre (opcional)", "razon", "");
      campo("Correo (opcional)", "correo", "cliente@correo.com", "email");
    }
    pintarComp();
    var cab = h("div", "tot"); cab.appendChild(h("span", null, "Total de la cuenta")); cab.appendChild(h("span", null, soles(total)));
    var cabs = [cab];
    if (pagadoAntes > 0.009) {
      var c2 = h("div", "tot sub"); c2.appendChild(h("span", null, "Ya pagado (" + ((S.cuenta.pagos || []).length) + " pago" + ((S.cuenta.pagos || []).length === 1 ? "" : "s") + ")")); c2.appendChild(h("span", null, "− " + soles(pagadoAntes))); cabs.push(c2);
      var c3 = h("div", "tot"); c3.appendChild(h("span", null, "Saldo por cobrar")); c3.appendChild(h("span", null, soles(saldo))); cabs.push(c3);
    }
    if (parte) { var c4 = h("div", "tot parte"); c4.appendChild(h("span", null, "Parte: " + (parte.etiqueta || "")));  c4.appendChild(h("span", null, soles(objetivo))); cabs.push(c4); }
    var notaDiv = division && division.length > 1 && !parte ? h("p", "aviso-ef", divOk ? "👥 El cliente pidió dividir la cuenta en " + division.length + ": " + division.map(soles).join(" · ") + ". Ya está separada abajo; elige el método de cada uno."
      : "👥 El cliente pidió dividir en " + division.length + ", pero la cuenta cambió desde entonces. Divide a mano.") : null;
    var dividirB = !parte && S.cuenta.pedidos.length ? btn("✂ Dividir la cuenta (por ítems, partes iguales o personas)", "btn peq", function () { cerrarModal(); dividirCuenta(); }) : null;
    var enviando = false;
    ok = btn("✓ Registrar cobro", "btn azul", function () {
      var m = modo();
      if (enviando) return;
      if (pagos.some(function (p) { return !p.metodo && (Number(p.monto) || 0) > 0; })) { err.textContent = "Elige el método de cada pago."; return; }
      if (!m) { err.textContent = parte ? "Los montos deben sumar " + soles(objetivo) + " (la parte de " + (parte.etiqueta || "esta persona") + ")." : "Los montos deben sumar " + soles(saldo) + " (o menos, para un pago parcial)."; return; }
      if (m === "total" && comp.tipo === "Factura" && (!/^\d{11}$/.test(comp.doc.replace(/\D/g, "")) || comp.razon.trim().length < 3)) { err.textContent = "Para factura escribe el RUC (11 dígitos) y la razón social."; return; }
      if (m === "total" && comp.tipo === "Boleta" && comp.doc && !/^(\d{8}|\d{11})$/.test(comp.doc.replace(/\D/g, ""))) { err.textContent = "El DNI tiene 8 dígitos."; return; }
      var envio = pagos.filter(function (p) { return (Number(p.monto) || 0) > 0 || (Number(p.propina) || 0) > 0; });
      enviando = true; ok.disabled = true; ok.textContent = "Registrando…";
      api({ mz: m === "parcial" ? "cobrarparcial" : "cobrar", t: S.t, mesa: S.mesa, total: total, pagos: envio, cid: cid, comp: m === "total" && comp.tipo ? comp : null,
        parte: parte ? { modo: parte.modo, etiqueta: parte.etiqueta, items: parte.items || [], k: parte.k || 0, n: parte.n || 0 } : (m === "parcial" ? { modo: "persona", etiqueta: "Pago parcial" } : null) }).then(function (r) {
        enviando = false;
        if (!r.ok) {
          ok.disabled = false; pintarResumen(); err.textContent = r.error || "No se pudo registrar.";
          if (r.cambio && r.cuenta) { S.cuenta = r.cuenta; cerrarModal(); pintarOrden(); toast(r.error, "mal"); }
          return;
        }
        cerrarModal();
        if (r.repetido) { toast("Ese cobro ya estaba registrado.", "ok"); S.v = ""; sondear(); cargarCuenta(); return; }
        if (r.parcial) {
          toast("✓ Pago parcial de " + soles(suma()) + " registrado · saldo " + soles(r.saldo), "ok");
          S.cuenta.pagado = r.pagado; S.cuenta.saldo = r.saldo;
          S.cuenta.pagos = (S.cuenta.pagos || []).concat(envio.map(function (p) { return { etiqueta: parte ? parte.etiqueta : "Pago parcial", modo: parte ? parte.modo : "persona", k: parte && parte.k || 0, n: parte && parte.n || 0, metodo: p.metodo, monto: p.monto, propina: p.propina || 0 }; }));
          S.cuenta.pagadoItems = (S.cuenta.pagadoItems || []).concat(parte && parte.items || []);
          S.v = ""; sondear();
          if (luego) luego(); else pintarOrden();
          return;
        }
        toast("✓ Mesa " + r.mesa + " cobrada" + (comp.tipo ? " · " + comp.tipo + " por emitir" : "") + (r.propina ? " · propina " + soles(r.propina) : ""), "ok");
        delete divEstado[S.mesa];
        S.cuenta = { pedidos: [], total: 0 }; S.vista = "mesas"; S.v = ""; pintar(); sondear();
      }).catch(function () { enviando = false; ok.disabled = false; pintarResumen(); err.textContent = "Sin conexión. Intenta de nuevo (no se cobrará dos veces)."; });
    });
    pintarPagos();
    abrirModal((parte ? "💳 Cobrar parte · " : "💳 Cobrar ") + etiquetaMesa(S.mesa), cabs.concat([notaDiv, dividirB, zona, compDiv, resumen, err]), [ok]);
    pintarResumen();
  }

  /* ---------- dividir la cuenta ----------
     Tres formas: por ítems (cada persona se asigna sus platos), partes iguales (N partes) y por persona (monto libre por persona).
     Cada parte se cobra con la ventana de cobro (con su método, mixto si hace falta); queda un saldo hasta que se paga todo y la mesa se cierra sola.
     Lo ya pagado viene del servidor (pagos y platos pagados), así se ve igual desde cualquier equipo. */
  var divEstado = {};
  function dividirCuenta() {
    if (!S.cuenta || !S.cuenta.pedidos.length) { toast("La mesa no tiene cuenta abierta.", "mal"); return; }
    var mesa = S.mesa, D = divEstado[mesa] = divEstado[mesa] || { modo: "iguales", n: 2, personas: [{ n: "Persona 1", m: 0 }, { n: "Persona 2", m: 0 }], asign: {} };
    var cont = h("div", "dividir");
    function lineas() {
      var r = [];
      S.cuenta.pedidos.forEach(function (p) { (p.lineas || []).forEach(function (l, i) { r.push({ k: p.id + ":" + i, t: l.t, d: l.d, s: Number(l.s) || 0, ped: p.numero }); }); });
      return r;
    }
    function pagosDe(modo, f) { return (S.cuenta.pagos || []).filter(function (x) { return x.modo === modo && f(x); }); }
    function saldo() { return S.cuenta.saldo != null ? S.cuenta.saldo : S.cuenta.total; }
    function metodosTxt(arr) { var m = []; arr.forEach(function (x) { if (m.indexOf(x.metodo) < 0) m.push(x.metodo); }); return m.join(" + "); }
    function filaParte(titulo, sub, monto, pagada, metodosYa, alCobrar, extra) {
      var f = h("div", "dv__fila" + (pagada ? " pagada" : ""));
      var tx = h("div", "dv__tx"); tx.appendChild(h("b", null, titulo)); if (sub) tx.appendChild(h("small", null, sub)); f.appendChild(tx);
      if (extra) f.appendChild(extra);
      f.appendChild(h("span", "dv__m", soles(monto)));
      if (pagada) f.appendChild(h("span", "dv__ok", "✓ Pagada" + (metodosYa ? " · " + metodosYa : "")));
      else { var b = btn("Cobrar", "btn peq azul", alCobrar); b.disabled = monto <= 0.009; f.appendChild(b); }
      return f;
    }
    function pintar2() {
      cont.textContent = "";
      var total = S.cuenta.total, sal = saldo();
      var res = h("div", "tot"); res.appendChild(h("span", null, "Total " + soles(total) + (S.cuenta.pagado > 0.009 ? " · pagado " + soles(S.cuenta.pagado) : ""))); res.appendChild(h("b", null, "Saldo " + soles(sal)));
      cont.appendChild(res);
      cont.appendChild(segmento([["iguales", "Partes iguales"], ["items", "Por ítems"], ["persona", "Por persona"]], D.modo, function (v) { D.modo = v; pintar2(); }));
      var cuerpo = h("div", "dv__cuerpo"); cont.appendChild(cuerpo);
      if (D.modo === "iguales") {
        var step = h("div", "step"), out = h("output", null, String(D.n));
        var yaN = (S.cuenta.pagos || []).filter(function (x) { return x.modo === "iguales" && x.n; })[0];
        if (yaN) D.n = yaN.n;
        out.textContent = String(D.n);
        if (!yaN) {
          step.appendChild(btn("−", "", function () { if (D.n > 2) { D.n--; pintar2(); } }));
          step.appendChild(out);
          step.appendChild(btn("+", "", function () { if (D.n < 12) { D.n++; pintar2(); } }));
          var sw = h("div", "dv__n"); sw.appendChild(h("span", null, "¿Entre cuántos?")); sw.appendChild(step); cuerpo.appendChild(sw);
        } else cuerpo.appendChild(h("p", "vacio", "Dividida en " + D.n + " partes iguales."));
        var base = Math.floor(total / D.n * 100) / 100, ult = r2(total - base * (D.n - 1));
        for (var i = 1; i <= D.n; i++) (function (k) {
          var monto = k === D.n ? ult : base, ya = pagosDe("iguales", function (x) { return x.k === k; });
          cuerpo.appendChild(filaParte("Parte " + k + " de " + D.n, "", Math.min(monto, sal), ya.length > 0, metodosTxt(ya),
            function () { cobrarParte({ modo: "iguales", etiqueta: "Parte " + k + " de " + D.n, monto: monto, k: k, n: D.n }); }));
        })(i);
      } else if (D.modo === "persona") {
        D.personas.forEach(function (p, i) {
          var ya = pagosDe("persona", function (x) { return x.etiqueta === p.n; });
          var inp = h("input", "campo"); inp.value = p.n; inp.maxLength = 30; inp.setAttribute("aria-label", "Nombre");
          inp.addEventListener("change", function () { p.n = inp.value.trim() || "Persona " + (i + 1); });
          var mo = h("input", "campo dv__in"); mo.type = "number"; mo.inputMode = "decimal"; mo.step = "0.01"; mo.min = "0"; mo.value = p.m || ""; mo.placeholder = "S/";
          mo.addEventListener("change", function () { p.m = Math.max(0, Number(mo.value) || 0); pintar2(); });
          var f = h("div", "dv__fila" + (ya.length ? " pagada" : "")); f.appendChild(inp); f.appendChild(mo);
          if (ya.length) f.appendChild(h("span", "dv__ok", "✓ Pagada · " + metodosTxt(ya)));
          else {
            var b = btn("Cobrar", "btn peq azul", function () { p.n = inp.value.trim() || p.n; p.m = Number(mo.value) || 0; cobrarParte({ modo: "persona", etiqueta: p.n, monto: p.m }); });
            b.disabled = !(Number(p.m) > 0.009); f.appendChild(b);
            f.appendChild(btn("×", "btn peq", function () { D.personas.splice(i, 1); pintar2(); }));
          }
          cuerpo.appendChild(f);
        });
        var f2 = h("div", "fila");
        f2.appendChild(btn("➕ Agregar persona", "btn peq", function () { D.personas.push({ n: "Persona " + (D.personas.length + 1), m: 0 }); pintar2(); }));
        f2.appendChild(btn("⚖ Repartir el saldo en partes iguales", "btn peq", function () {
          var pend = D.personas.filter(function (p) { return !pagosDe("persona", function (x) { return x.etiqueta === p.n; }).length; });
          if (!pend.length) return;
          var b2 = Math.floor(sal / pend.length * 100) / 100; pend.forEach(function (p, i) { p.m = i === pend.length - 1 ? r2(sal - b2 * (pend.length - 1)) : b2; }); pintar2();
        }));
        cuerpo.appendChild(f2);
        var asig = r2(D.personas.reduce(function (a, p) { return a + (pagosDe("persona", function (x) { return x.etiqueta === p.n; }).length ? 0 : Number(p.m) || 0); }, 0));
        cuerpo.appendChild(h("p", asig - sal > 0.009 ? "err" : "vacio", asig - sal > 0.009 ? "Los montos superan el saldo (" + soles(sal) + ")." : "Sin asignar: " + soles(r2(sal - asig))));
      } else {
        var pagadasK = S.cuenta.pagadoItems || [], todas = lineas();
        var pf = h("div", "dv__pers");
        D.personas.forEach(function (p, i) {
          var inp = h("input", "campo"); inp.value = p.n; inp.maxLength = 30; inp.setAttribute("aria-label", "Nombre");
          inp.addEventListener("change", function () { var viejo = p.n; p.n = inp.value.trim() || viejo; pintar2(); });
          pf.appendChild(inp);
        });
        pf.appendChild(btn("➕", "btn peq", function () { D.personas.push({ n: "Persona " + (D.personas.length + 1), m: 0 }); pintar2(); }));
        if (D.personas.length > 1) pf.appendChild(btn("➖", "btn peq", function () { var q = D.personas.pop(); Object.keys(D.asign).forEach(function (k) { if (D.asign[k] === q.n) delete D.asign[k]; }); pintar2(); }));
        cuerpo.appendChild(pf);
        cuerpo.appendChild(h("p", "vacio", "Elige a quién se le cobra cada plato."));
        todas.forEach(function (l) {
          var pagado = pagadasK.indexOf(l.k) >= 0, f = h("div", "dv__fila dv__item" + (pagado ? " pagada" : ""));
          var tx = h("div", "dv__tx"); tx.appendChild(h("b", null, l.t)); if (l.d) tx.appendChild(h("small", null, l.d)); f.appendChild(tx);
          f.appendChild(h("span", "dv__m", soles(l.s)));
          if (pagado) f.appendChild(h("span", "dv__ok", "✓ Pagado"));
          else {
            var sel = h("select", "dv__sel"); sel.setAttribute("aria-label", "Asignar a");
            var o0 = h("option", null, "— sin asignar —"); o0.value = ""; sel.appendChild(o0);
            D.personas.forEach(function (p) { var o = h("option", null, p.n); o.value = p.n; sel.appendChild(o); });
            sel.value = D.asign[l.k] || "";
            sel.addEventListener("change", function () { if (sel.value) D.asign[l.k] = sel.value; else delete D.asign[l.k]; pintar2(); });
            f.appendChild(sel);
          }
          cuerpo.appendChild(f);
        });
        var sinAsignar = todas.filter(function (l) { return pagadasK.indexOf(l.k) < 0 && !D.asign[l.k]; });
        D.personas.forEach(function (p) {
          var mias = todas.filter(function (l) { return pagadasK.indexOf(l.k) < 0 && D.asign[l.k] === p.n; });
          var ya = pagosDe("items", function (x) { return x.etiqueta === p.n; });
          var monto = r2(mias.reduce(function (a, l) { return a + l.s; }, 0));
          var resto = todas.filter(function (l) { return pagadasK.indexOf(l.k) < 0 && D.asign[l.k] !== p.n; });
          if (!resto.length && mias.length) monto = sal;   // la última persona paga el saldo exacto (incluye descuentos o ajustes)
          if (ya.length && !mias.length) cuerpo.appendChild(filaParte(p.n, "", ya.reduce(function (a, x) { return a + x.monto; }, 0), true, metodosTxt(ya), null));
          else cuerpo.appendChild(filaParte(p.n, mias.length + (mias.length === 1 ? " plato" : " platos"), Math.min(monto, sal), false, "", function () {
            cobrarParte({ modo: "items", etiqueta: p.n, monto: monto, items: mias.map(function (l) { return l.k; }) });
          }));
        });
        if (sinAsignar.length) cuerpo.appendChild(h("p", "vacio", sinAsignar.length + (sinAsignar.length === 1 ? " plato sin asignar." : " platos sin asignar.")));
      }
    }
    function cobrarParte(parte) {
      if (parte.monto > saldo() + 0.009) parte.monto = saldo();
      cobrar(null, true, null, parte, function () { if (S.cuenta && S.cuenta.pedidos.length) dividirCuenta(); });
    }
    pintar2();
    abrirModal("✂ Dividir cuenta · " + etiquetaMesa(mesa), [cont], [btn("Cerrar", "btn", cerrarModal), btn("💳 Cobrar todo el saldo", "btn azul", function () { cerrarModal(); cobrar(null, true); })]);
  }

  /* =========================== PESTAÑAS: «Todos» · «Mesas» · «Para llevar y delivery» ===========================
     · «Todos»: tablero con los pedidos en orden de salida (mesa, para llevar, delivery), filtros rápidos y el mapa de reparto desplegable.
       Es la pestaña inicial SOLO si tiene algo; si no, se abre «Mesas» (nunca una vista vacía).
     · El mapa del salón desplegable está arriba en todas las pestañas (cerrado por defecto; recuerda si se dejó abierto). */
  function hayPedidosActivos() { return itemsTodos("todo").length > 0; }
  function elegirPestInicial() {
    S.pestElegida = true;
    if (LOCAL) { if (!LOCAL.tabValida(S.pest)) S.pest = "todos"; return; }
    var g = S.pest;
    if (g === "todos" || !g) S.pest = hayPedidosActivos() ? "todos" : "mesas";
    else if (g === "llevar") S.pest = "llevar";
    else S.pest = "mesas";
  }
  function irPest(p) { S.pest = p; guardar(K.pest, p); S.vista = "mesas"; pintar(); window.scrollTo(0, 0); }
  function barraPest() {
    var w = h("div", "pest");
    var tabs = h("div", "pest__tabs"), nT = itemsTodos("todo").length, nL = S.externos.length + legadoLlevar().length;
    [["todos", "Todos", nT], ["mesas", "Mesas", 0], ["llevar", window.innerWidth >= 480 ? "Llevar y delivery" : "Llevar/Delivery", nL]].forEach(function (x) {
      var b = btn("", "pest__tab" + (S.pest === x[0] ? " on" : ""), function () { irPest(x[0]); });
      b.appendChild(document.createTextNode(x[1])); if (x[2]) b.appendChild(h("span", "pest__n", String(x[2])));
      b.setAttribute("aria-pressed", S.pest === x[0] ? "true" : "false");
      tabs.appendChild(b);
    });
    w.appendChild(tabs);
    var acc = h("div", "pest__acc");
    acc.appendChild(btn("＋ Para llevar", "btn grande llevar", function () { nuevoExterno(LL); }));
    acc.appendChild(btn("＋ Delivery", "btn grande deliv", function () { nuevoExterno(DL); }));
    w.appendChild(acc);
    return w;
  }
  function vistaPrincipal() {
    var w = h("div", "principal");
    if (!S.recibido) { w.appendChild(h("p", "vacio", "Cargando…")); return w; }
    if (!S.pestElegida) elegirPestInicial();
    var cont = document.createDocumentFragment();
    cont.appendChild(barraPest());
    if (S.pest === "todos") cont.appendChild(vistaTodos());
    else if (S.pest === "llevar") cont.appendChild(vistaLlevar());
    else cont.appendChild(vistaMesas());
    w.appendChild(cont);
    ultimaFirmaPest = firmaPest();
    return w.childNodes.length === 1 ? w.firstChild : w;
  }
  /* nuevo pedido sin mesa: abre la carta con su propio carrito */
  function nuevoExterno(cual) { S.pest = "llevar"; abrirMesa(cual); }

  /* ---------- «Todos»: pedidos en orden de salida ---------- */
  function horaMin(hhmm) { var m = String(hhmm || "").match(/^(\d{1,2}):(\d{2})/); return m ? (+m[1]) * 60 + (+m[2]) : null; }
  function tsSalida(x) {   // pedido programado: su hora; si no, la hora en que se pidió
    if (x.prog) { var hm = horaMin(x.prog); if (hm != null) { var d = new Date(Date.now() + S.desfase - 5 * 3600000); d.setUTCHours(0, 0, 0, 0); var t = d.getTime() + 5 * 3600000 + hm * 60000; if (x.ts && x.ts > t + 3600000) t += 86400000; return t;   /* hora anterior a cuando se pidió = es para el día siguiente */ } }
    return x.ts || 0;
  }
  function legadoLlevar() { return S.mesas.filter(function (m) { return m.activa && m.llevar && m.n; }); }   // viejos "Llev" con pedidos (hasta cobrarlos)
  function itemsTodos(filtro) {
    var r = [];
    if (filtro !== "llevar" && filtro !== "delivery") S.mesas.forEach(function (m) {
      if (!m.activa || m.unidaA) return;
      (m.pedidos || []).forEach(function (p) {
        if (!p.falta) return;
        var resp = m.atiende ? m.atiende.nombre : (p.mozo || "");
        r.push({ tipo: m.llevar ? "llevar" : "mesa", ts: p.ts, hora: p.hora, prog: "", et: m.llevar ? "🥡 " + (m.etiqueta || "Para llevar") : "Mesa " + m.mesa,
          estado: p.estado, resp: resp, mio: esMia(m), total: p.total, n: p.numero, abrir: function () { tocarMesa(m); }, lineas: p.lineas });
      });
    });
    S.externos.forEach(function (x) {
      var tipo = x.canal === "delivery" ? "delivery" : "llevar";
      if (filtro === "mesa" || (filtro === "llevar" && tipo !== "llevar") || (filtro === "delivery" && tipo !== "delivery")) return;
      if (x.estado === "Entregado" && x.pagado) return;
      r.push({ tipo: tipo, ts: x.ts, hora: x.hora, prog: x.prog, et: (tipo === "delivery" ? "🛵 " : "🥡 ") + x.nombre, tipoTxt: tipo === "delivery" ? "Delivery" : "Para llevar",
        estado: x.estado, resp: x.mozo || (x.origen === "web" || !x.origen ? "Web" : ""), mio: !x.mozo || (S.mozo && x.mozo === S.mozo.nombre), total: x.aCobrar,
        n: x.n, abrir: function () { detalleExt(x); }, ext: x });
    });
    if (filtro === "mios") r = r.filter(function (x) { return x.mio; });
    r.forEach(function (x) { x.sal = tsSalida(x); });
    return r.sort(function (a, b) { return a.sal - b.sal; });
  }
  var CLS_EST = { "Nuevo": "nuevo", "Confirmado": "conf", "En preparación": "prep", "Listo": "listo", "En camino": "camino", "Entregado": "ent" };
  function filaPedido(x) {
    var f = btn("", "fp t-" + x.tipo + " e-" + (CLS_EST[x.estado] || "otro") + (x.mio ? "" : " ajena"), x.abrir);
    var hr = h("div", "fp__h"); hr.appendChild(h("b", null, x.prog || x.hora)); hr.appendChild(h("small", null, x.prog ? "programado" : "pedido"));
    f.appendChild(hr);
    var tx = h("div", "fp__tx"); tx.appendChild(h("b", null, x.et));
    var sub = (x.tipoTxt ? x.tipoTxt + " · " : "") + "#" + x.n + (x.resp ? " · 🤵 " + x.resp : "");
    if (x.lineas && x.lineas.length) sub += " · " + x.lineas.map(function (l) { return (l.e || l.t).replace(/^1 × /, ""); }).slice(0, 2).join(", ") + (x.lineas.length > 2 ? "…" : "");
    tx.appendChild(h("small", null, sub)); f.appendChild(tx);
    var d = h("div", "fp__d"); d.appendChild(h("span", "chip e-" + (CLS_EST[x.estado] || "otro"), x.estado === "Listo" ? "🔔 Listo" : x.estado));
    d.appendChild(h("small", null, soles(x.total) + (x.ext ? (x.ext.pagado ? " · pagado" : " · por cobrar") : ""))); f.appendChild(d);
    return f;
  }
  function vistaTodos() {
    var w = h("div", "todos");
    var fil = [["todo", "Todo"], ["mesa", "Mesas"], ["llevar", "Llevar"], ["delivery", "Delivery"], ["mios", "Míos"]];
    var cab = h("div", "todos__cab"); cab.appendChild(segmento(fil, S.filtroT, function (v) { S.filtroT = v; guardar(K.filtroT, v); pintar(); }));
    w.appendChild(cab);
    var items = itemsTodos(S.filtroT);
    var lista = h("div", "fps");
    if (!items.length) lista.appendChild(h("p", "vacio", S.filtroT === "todo" ? "No hay pedidos en curso. Abre una mesa o usa ＋ Para llevar / ＋ Delivery." : "Nada en este filtro."));
    items.forEach(function (x) { lista.appendChild(filaPedido(x)); });
    w.appendChild(lista);
    var dels = S.externos.filter(function (x) { return x.canal === "delivery"; });
    if (dels.length) w.appendChild(mapaDelivery(dels));
    return w;
  }

  /* ---------- «Para llevar y delivery» ---------- */
  function vistaLlevar() {
    var w = h("div", "llevar-v");
    var ext = S.externos.slice().sort(function (a, b) { return tsSalida(a) - tsSalida(b); });
    var lle = ext.filter(function (x) { return x.canal !== "delivery"; }), del = ext.filter(function (x) { return x.canal === "delivery"; });
    var viejos = legadoLlevar();
    function bloque(tit, lista, vacio) {
      var s = h("section", "ext-sec"); s.appendChild(h("h3", null, tit + (lista.length ? " · " + lista.length : "")));
      if (!lista.length) s.appendChild(h("p", "vacio", vacio));
      lista.forEach(function (x) { s.appendChild(tarjetaExt(x)); });
      return s;
    }
    w.appendChild(bloque("🥡 Para llevar", lle, "Sin pedidos para llevar. Usa ＋ Para llevar: primero eliges los productos y al final el nombre del cliente."));
    if (viejos.length) { var g = h("div", "mesas llevar"); viejos.forEach(function (m) { g.appendChild(botonMesa(m)); }); var sv = h("section", "ext-sec"); sv.appendChild(h("h3", null, "🥡 Para llevar (sistema anterior)")); sv.appendChild(g); w.appendChild(sv); }
    if (del.length) w.appendChild(mapaDelivery(del));
    w.appendChild(bloque("🛵 Delivery", del, "Sin deliveries en curso. Usa ＋ Delivery para un cliente que llama o escribe."));
    return w;
  }
  function mapsUrl(x) { return x.lat != null && x.lng != null ? "https://www.google.com/maps/dir/?api=1&destination=" + x.lat + "," + x.lng : "https://www.google.com/maps/search/?api=1&query=" + encodeURIComponent((x.dir || "") + " Trujillo"); }
  function tarjetaExt(x) {
    var d = h("article", "ext t-" + (x.canal === "delivery" ? "delivery" : "llevar") + " e-" + (CLS_EST[x.estado] || "otro"));
    var cab = h("div", "ext__cab");
    cab.appendChild(h("b", null, (x.canal === "delivery" ? "🛵 Delivery · " : "🥡 Para llevar · ") + x.nombre));
    cab.appendChild(h("span", "chip e-" + (CLS_EST[x.estado] || "otro"), x.estado));
    d.appendChild(cab);
    d.appendChild(h("small", "ext__meta", "#" + x.n + " · " + x.hora + (x.prog ? " · ⏰ para las " + x.prog : "") + (x.mozo ? " · 🤵 " + x.mozo : " · web") + (x.tel ? " · 📞 " + x.tel : "")));
    if (x.canal === "delivery") d.appendChild(h("small", "ext__dir", "📍 " + (x.dir || "sin dirección") + (x.ref ? " · " + x.ref : "") + (x.zona ? " · " + x.zona : "")));
    var ul = h("ul", "ext__l"); (x.lineas || []).forEach(function (l) { ul.appendChild(h("li", null, (l.e || l.t) + (l.d ? " · " + l.d : ""))); }); d.appendChild(ul);
    var pie = h("div", "ext__pie");
    pie.appendChild(h("b", null, soles(x.aCobrar) + (x.costo ? " (incl. delivery " + soles(x.costo) + ")" : "")));
    pie.appendChild(h("span", "chip " + (x.pagado ? "pag" : "porc"), x.pagado ? "✓ Pagado" : "Por cobrar" + (x.pago ? " · " + x.pago : "")));
    d.appendChild(pie);
    var acc = h("div", "ext__acc");
    if (!x.pagado) acc.appendChild(btn("💳 Cobrar " + soles(x.aCobrar), "btn azul peq", function () { cobrarExt(x); }));
    if (x.canal !== "delivery" && x.estado !== "Entregado") acc.appendChild(btn("✓ Se lo llevó", "btn peq", function () { entregarExtUI(x); }));
    if (x.canal === "delivery") { var a = h("a", "btn peq", "🗺 Ruta"); a.href = mapsUrl(x); a.target = "_blank"; a.rel = "noopener"; acc.appendChild(a); }
    if (x.tel) { var t = h("a", "btn peq", "📞 Llamar"); t.href = "tel:" + x.tel; acc.appendChild(t); }
    d.appendChild(acc);
    return d;
  }
  function detalleExt(x) { var c = tarjetaExt(x); abrirModal((x.canal === "delivery" ? "🛵 Delivery #" : "🥡 Para llevar #") + x.n, [c]); }
  function entregarExtUI(x) {
    if (!x.pagado && !confirm("Este pedido todavía no está cobrado. ¿Marcarlo como entregado igual?")) return;
    api({ mz: "entregarext", t: S.t, id: x.id }).then(function (r) {
      if (!r.ok) { toast(r.error || "No se pudo marcar.", "mal"); return; }
      x.estado = "Entregado"; toast("✓ Pedido #" + x.n + " entregado", "ok"); cerrarModal(); S.v = ""; sondear();
    }).catch(function () { toast("Sin conexión.", "mal"); });
  }
  /* cobro de un pedido sin mesa: uno o varios métodos (pago mixto) y propina por método */
  function cobrarExt(x) {
    var metodos = metodosCanal(x.canal), cid = uid(), pagos = [{ metodo: /efectivo|tarjeta|transf|yape|plin/i.test(x.pago || "") ? (metodos.filter(function (m) { return norm(x.pago).indexOf(norm(m).split(" ")[0]) >= 0; })[0] || "") : "", monto: x.aCobrar, propina: 0 }];
    var zona = h("div", "metodos-c"), res = h("div", "tot"), err = h("p", "err"), ok;
    function suma() { return r2(pagos.reduce(function (a, p) { return a + (Number(p.monto) || 0); }, 0)); }
    function pintarP() {
      zona.textContent = "";
      pagos.forEach(function (p, i) {
        var w = h("div", "pago");
        if (pagos.length > 1) { var tt = h("div", "fila"); tt.appendChild(h("b", null, "Pago " + (i + 1))); tt.appendChild(h("span", "esp")); tt.appendChild(btn("Quitar", "btn peq", function () { pagos.splice(i, 1); pagos[0].monto = r2(x.aCobrar - suma() + (Number(pagos[0].monto) || 0)); pintarP(); })); w.appendChild(tt); }
        var em = [p.metodo];
        w.appendChild(chips(metodos.map(function (m) { return { v: m, t: m }; }), false, em, function (v) { p.metodo = v[0]; err.textContent = ""; }));
        var f = h("div", "fila"); f.appendChild(h("label", null, "Monto"));
        var mo = h("input", "campo"); mo.type = "number"; mo.inputMode = "decimal"; mo.step = "0.10"; mo.value = p.monto;
        mo.addEventListener("input", function () { p.monto = Number(mo.value) || 0; resumen(); }); f.appendChild(mo); w.appendChild(f);
        var f2 = h("div", "fila"); f2.appendChild(h("label", null, "Propina"));
        var pr = h("input", "campo"); pr.type = "number"; pr.inputMode = "decimal"; pr.step = "0.10"; pr.placeholder = "0"; pr.value = p.propina || "";
        pr.addEventListener("input", function () { p.propina = Number(pr.value) || 0; }); f2.appendChild(pr); w.appendChild(f2);
        zona.appendChild(w);
      });
      zona.appendChild(btn("➕ Pago mixto: agregar otro método", "btn peq", function () { var falta = r2(x.aCobrar - suma()); pagos.push({ metodo: "", monto: falta > 0 ? falta : 0, propina: 0 }); pintarP(); }));
      resumen();
    }
    function resumen() { var f = r2(x.aCobrar - suma()); res.textContent = Math.abs(f) > 0.009 ? (f > 0 ? "Falta " + soles(f) : "Sobra " + soles(-f)) : "✓ Cuadra: " + soles(x.aCobrar); res.className = "tot" + (Math.abs(f) > 0.009 ? " mal" : ""); }
    ok = btn("✓ Registrar cobro", "btn azul", function () {
      if (pagos.some(function (p) { return !p.metodo && (Number(p.monto) || 0) > 0; })) { err.textContent = "Elige el método de cada pago."; return; }
      if (Math.abs(suma() - x.aCobrar) > 0.009) { err.textContent = "Los pagos deben sumar " + soles(x.aCobrar) + "."; return; }
      ok.disabled = true; ok.textContent = "Registrando…";
      api({ mz: "cobrarext", t: S.t, id: x.id, cid: cid, pagos: pagos.filter(function (p) { return (Number(p.monto) || 0) > 0 || (Number(p.propina) || 0) > 0; }) }).then(function (r) {
        if (!r.ok) { ok.disabled = false; ok.textContent = "✓ Registrar cobro"; err.textContent = r.error || "No se pudo cobrar."; return; }
        x.pagado = true; cerrarModal(); toast("✓ Cobrado " + soles(x.aCobrar) + " · pedido #" + x.n, "ok"); S.v = ""; sondear(); if (S.vista === "mesas") pintar();
      }).catch(function () { ok.disabled = false; ok.textContent = "✓ Registrar cobro"; err.textContent = "Sin conexión. Intenta de nuevo (no se cobrará dos veces)."; });
    });
    pintarP();
    abrirModal("💳 Cobrar · " + (x.canal === "delivery" ? "Delivery " : "Para llevar ") + x.nombre + " · " + soles(x.aCobrar), [zona, res, err], [btn("Cancelar", "btn", cerrarModal), ok]);
  }

  /* ---------- mapa de reparto (Leaflet + OpenStreetMap), desplegable y recordado ---------- */
  var LF = { cargando: false, listo: false, falla: false, mapa: null, capa: null, div: null, cola: [] };
  function cargarLeaflet(fn) {
    if (LF.listo) { fn(); return; } LF.cola.push(fn);
    if (LF.cargando) return; LF.cargando = true;
    var l = document.createElement("link"); l.rel = "stylesheet"; l.href = "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.min.css"; document.head.appendChild(l);
    var sc = document.createElement("script"); sc.src = "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.min.js";
    sc.onload = function () { LF.listo = !!window.L; LF.falla = !LF.listo; var c = LF.cola; LF.cola = []; c.forEach(function (f) { f(); }); };
    sc.onerror = function () { LF.falla = true; LF.cargando = false; var c = LF.cola; LF.cola = []; c.forEach(function (f) { f(); }); };
    document.head.appendChild(sc);
  }
  function mapaDelivery(lista) {
    var conC = lista.filter(function (x) { return x.lat != null && x.lng != null; }), sinC = lista.filter(function (x) { return x.lat == null || x.lng == null; });
    var w = h("section", "mapa mapa-del" + (S.mapaDel ? " abierto" : ""));
    var cab = btn("", "mapa__cab", function () { S.mapaDel = !S.mapaDel; guardar(K.mapaDel, S.mapaDel); var n = mapaDelivery(lista); w.replaceWith(n); ultimaFirmaPest = firmaPest(); });
    cab.setAttribute("aria-expanded", S.mapaDel ? "true" : "false");
    cab.appendChild(h("span", "mapa__t", "🛵 Mapa de reparto · " + lista.length + (lista.length === 1 ? " delivery" : " deliveries")));
    if (sinC.length) cab.appendChild(h("span", "mapa__b", sinC.length + " sin ubicación"));
    cab.appendChild(h("span", "esp")); cab.appendChild(h("span", "mapa__f", S.mapaDel ? "▴" : "▾"));
    w.appendChild(cab);
    if (!S.mapaDel) return w;
    var cuerpo = h("div", "mapa__cuerpo");
    if (!LF.div) { LF.div = h("div", "mapa-lf"); }
    if (conC.length && !LF.falla) cuerpo.appendChild(LF.div);
    var ls = h("ol", "mapa-del__l");
    lista.forEach(function (x) {
      var li = h("li"); var b = btn("", "", function () { detalleExt(x); });
      b.appendChild(h("b", null, "#" + x.n + " " + x.nombre)); b.appendChild(h("small", null, (x.dir || "") + (x.lat == null ? " · sin ubicación" : "") + " · " + x.estado));
      li.appendChild(b); ls.appendChild(li);
    });
    cuerpo.appendChild(ls);
    w.appendChild(cuerpo);
    if (conC.length) cargarLeaflet(function () {
      if (LF.falla) { if (LF.div.parentNode) LF.div.remove(); return; }
      setTimeout(function () { pintarPuntos(conC); }, 0);
    });
    return w;
  }
  function pintarPuntos(conC) {
    var L = window.L; if (!L || !LF.div.isConnected) return;
    var loc = ((C.pedidos || {}).deliveryTarifas || {}).local || { lat: -8.1278775, lng: -79.040603 };
    if (!LF.mapa) {
      LF.mapa = L.map(LF.div, { zoomControl: true, attributionControl: true, scrollWheelZoom: false });
      L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", { maxZoom: 19, attribution: "© OpenStreetMap" }).addTo(LF.mapa);
      LF.capa = L.layerGroup().addTo(LF.mapa);
    }
    LF.capa.clearLayers();
    var pts = [[loc.lat, loc.lng]];
    L.circleMarker([loc.lat, loc.lng], { radius: 9, color: "#4a1519", fillColor: "#a9803f", fillOpacity: 1, weight: 3 }).bindTooltip("Pasta Gallo", { permanent: false }).addTo(LF.capa);
    conC.forEach(function (x) {
      pts.push([x.lat, x.lng]);
      var col = x.estado === "En camino" ? "#2d5f8a" : x.estado === "Listo" ? "#2f7a3a" : "#b6232a";
      L.circleMarker([x.lat, x.lng], { radius: 11, color: "#fff", weight: 2, fillColor: col, fillOpacity: 0.95 })
        .bindTooltip("#" + x.n, { permanent: true, direction: "top", className: "lf-num" })
        .bindPopup("<b>#" + x.n + " " + escHtml(x.nombre) + "</b><br>" + escHtml(x.dir || "") + "<br>" + escHtml(x.estado) + " · " + soles(x.aCobrar)).addTo(LF.capa);
    });
    LF.mapa.invalidateSize();
    LF.mapa.fitBounds(pts, { padding: [28, 28], maxZoom: 15 });
  }
  function escHtml(t) { return String(t == null ? "" : t).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; }); }

  /* ---------- datos del cliente al confirmar un pedido para llevar / delivery ---------- */
  function coordsDeTexto(t) {
    t = String(t || "");
    var m = t.match(/@(-?\d+\.\d+),\s*(-?\d+\.\d+)/) || t.match(/!3d(-?\d+\.\d+)!4d(-?\d+\.\d+)/) ||
      t.match(/[?&](?:q|query|ll|destination|center)=(-?\d+\.\d+)(?:,|%2C)\s*(-?\d+\.\d+)/) || t.match(/(-?\d{1,2}\.\d{3,})\s*,\s*(-?\d{1,3}\.\d{3,})/);
    if (!m) return null;
    var la = Number(m[1]), lo = Number(m[2]);
    return isFinite(la) && isFinite(lo) && Math.abs(la) <= 90 && Math.abs(lo) <= 180 ? { lat: la, lng: lo } : null;
  }
  function distKm(a, b) {
    var rad = Math.PI / 180, dLat = (b.lat - a.lat) * rad, dLng = (b.lng - a.lng) * rad;
    var x = Math.sin(dLat / 2) * Math.sin(dLat / 2) + Math.cos(a.lat * rad) * Math.cos(b.lat * rad) * Math.sin(dLng / 2) * Math.sin(dLng / 2);
    return 2 * 6371 * Math.asin(Math.min(1, Math.sqrt(x)));
  }
  /** Misma fórmula que calcularDelivery_ (Code.gs) con las tarifas publicadas en la carta; el servidor recalcula al registrar. */
  function costoDelivery(zonaNom, c) {
    var tar = (C.pedidos || {}).deliveryTarifas || {}, zonas = tar.zonas || [], fin = function (n) { return Math.ceil(Math.round(Number(n) * 1e6) / 1e6); };
    if (zonaNom) { var z = zonas.filter(function (x) { return String(x.nombre) === zonaNom; })[0]; return z ? { ok: true, costo: fin(z.precio), zona: z.nombre } : { ok: false, error: "Zona no válida" }; }
    if (!c) return { ok: false, falta: true };
    var mejor = null, md = 0;
    zonas.forEach(function (x) { var d = distKm({ lat: Number(x.lat), lng: Number(x.lng) }, c); if (d <= Number(x.radio_km) && (!mejor || d < md)) { mejor = x; md = d; } });
    var loc = tar.local || {}, km = loc.lat != null ? distKm({ lat: Number(loc.lat), lng: Number(loc.lng) }, c) : null;
    if (mejor) return { ok: true, costo: fin(mejor.precio), zona: mejor.nombre, km: km };
    if (km == null) return { ok: false, error: "Sin tarifas" };
    if (Number(tar.max_km) > 0 && km > Number(tar.max_km)) return { ok: false, fuera: true, km: km, error: "Fuera de la zona de reparto (" + km.toFixed(1) + " km)" };
    var cc = fin(Number(tar.base || 0) + Number(tar.por_km || 0) * km * Number(tar.factor_pista || 1));
    if (cc < Number(tar.minimo || 0)) cc = Number(tar.minimo); if (Number(tar.maximo) > 0 && cc > Number(tar.maximo)) cc = Number(tar.maximo);
    return { ok: true, costo: fin(cc), zona: "", km: km };
  }
  /* métodos de pago por canal: el delivery se paga por adelantado (sin efectivo ni tarjeta); el recojo, con todos */
  var MET_DELIVERY = ["Yape", "Plin", "Transferencia"], MET_RECOJO = ["Efectivo", "Yape", "Plin", "Tarjeta", "Transferencia"];
  function metodosCanal(canal) { return (canal === "delivery" ? MET_DELIVERY : MET_RECOJO).slice(); }
  function rucValido(r) {
    if (!/^(10|15|16|17|20)\d{9}$/.test(r)) return false;
    var f = [5, 4, 3, 2, 7, 6, 5, 4, 3, 2], s = 0;
    for (var i = 0; i < 10; i++) s += Number(r.charAt(i)) * f[i];
    var d = 11 - (s % 11); if (d === 10) d = 0; if (d === 11) d = 1;
    return d === Number(r.charAt(10));
  }
  /** Mismas reglas que la web (pedido.js): factura = RUC válido; boleta = DNI (8) o RUC válido; nombre o razón social; correo válido. */
  function validarCompExt(tipo, doc, razon, correo) {
    if (!tipo) return "";
    doc = String(doc || "").replace(/\D/g, "");
    if (tipo === "Factura") { if (!rucValido(doc)) return "El RUC no es válido (11 dígitos, empieza con 10, 15, 16, 17 o 20)."; }
    else if (!(doc.length === 8 || (doc.length === 11 && rucValido(doc)))) return "Para la boleta escribe el DNI (8 dígitos) o un RUC válido.";
    if (String(razon || "").trim().length < 3) return tipo === "Factura" ? "Escribe la razón social." : "Escribe el nombre para la boleta.";
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(String(correo || "").trim())) return "Escribe un correo válido para enviar el comprobante.";
    return "";
  }
  var K_CLI = "pg-mozo-cliext";
  function formExterno(tipo) {
    var c = carro(); if (!c.length) { toast("Agrega al menos un producto.", "mal"); return; }
    var del = tipo === "delivery", cid = uid(), sub = totalCarro(), borr = leer(K_CLI, {})[tipo] || {};
    var cuerpo = [], err = h("p", "err"), ok, st = { c: null, r: null, prog: !!borr.prog };
    function campo(rot, el, nota) { var w = h("label", "campo-l"); w.appendChild(h("span", null, rot)); w.appendChild(el); if (nota) w.appendChild(h("small", null, nota)); return w; }
    function inp(ph, tipoI, max) { var i = h("input", "campo"); i.placeholder = ph || ""; if (tipoI) i.type = tipoI; if (max) i.maxLength = max; return i; }
    var fNom = inp("Nombre del cliente", "text", 60), fCel = inp(del ? "9 dígitos (obligatorio)" : "Opcional", "tel", 11);
    fCel.inputMode = "numeric";
    cuerpo.push(campo("Nombre *", fNom)); cuerpo.push(campo("Celular" + (del ? " *" : ""), fCel));
    // hora: ahora o programado
    var fHora = inp("", "time"); fHora.step = 900;
    var zh = h("div", "hora-z");
    var segH = segmento([["ahora", "Lo antes posible"], ["prog", "Programar hora"]], st.prog ? "prog" : "ahora", function (v) { st.prog = v === "prog"; segH.querySelectorAll("button").forEach(function (b, i) { b.classList.toggle("on", (i === 1) === st.prog); }); fHora.style.display = st.prog ? "" : "none"; });
    fHora.style.display = st.prog ? "" : "none";
    zh.appendChild(segH); zh.appendChild(fHora); cuerpo.push(campo("Hora", zh));
    var fDir, fRef, fUbi, fZona, fCosto, info = h("p", "del-info"), tot = h("div", "tot");
    if (del) {
      fDir = inp("Calle, número, urbanización", "text", 200); fRef = inp("Frente a…, color de la casa…", "text", 200);
      fUbi = inp("Pega el enlace de Google Maps o -8.11, -79.02", "text", 400);
      fZona = h("select", "campo"); [["", "— por ubicación —"]].concat((((C.pedidos || {}).deliveryTarifas || {}).zonas || []).map(function (z) { return [z.nombre, z.nombre + " · " + soles(z.precio)]; }))
        .forEach(function (o) { var op = h("option", null, o[1]); op.value = o[0]; fZona.appendChild(op); });
      fCosto = inp("Solo si no hay ubicación o quieres otro costo", "number"); fCosto.inputMode = "decimal"; fCosto.step = "0.5"; fCosto.min = "0"; fCosto.max = "200";
      cuerpo.push(campo("Dirección *", fDir)); cuerpo.push(campo("Referencia", fRef));
      cuerpo.push(campo("Ubicación", fUbi, "Con ubicación el costo sale solo (misma tarifa que la web)."));
      cuerpo.push(campo("Zona (opcional)", fZona)); cuerpo.push(campo("Costo de delivery manual (S/)", fCosto));
      cuerpo.push(info);
      [fUbi, fZona, fCosto].forEach(function (x) { x.addEventListener("input", recalc); x.addEventListener("change", recalc); });
    }
    var metodos = metodosCanal(tipo), pago = [""];
    cuerpo.push(h("div", "lbl", "Método de pago (opcional)"));
    cuerpo.push(chips([{ v: "", t: "Por definir" }].concat(metodos.map(function (m) { return { v: m, t: m }; })), false, pago, function () {}));
    // comprobante (igual que en la web): sin comprobante, boleta o factura con documento, nombre o razón social y correo
    var comp = { tipo: "" }, fDoc = inp("", "text", 11), fRaz = inp("", "text", 120), fMail = inp("correo@ejemplo.com", "email", 120), zComp = h("div", "comp-z");
    fDoc.inputMode = "numeric";
    fDoc.addEventListener("input", function () { var v = fDoc.value.replace(/\D/g, "").slice(0, 11); if (v !== fDoc.value) fDoc.value = v; });
    function pintarComp() {
      zComp.textContent = ""; if (!comp.tipo) return;
      var fac = comp.tipo === "Factura";
      fDoc.placeholder = fac ? "RUC (11 dígitos)" : "DNI (8) o RUC (11)"; fRaz.placeholder = fac ? "Razón social" : "Nombre completo";
      zComp.appendChild(campo(fac ? "RUC *" : "DNI o RUC *", fDoc)); zComp.appendChild(campo(fac ? "Razón social *" : "Nombre *", fRaz)); zComp.appendChild(campo("Correo *", fMail, "Ahí le llega el comprobante."));
    }
    cuerpo.push(h("div", "lbl", "Comprobante"));
    var segC = segmento([["", "Sin comprobante"], ["Boleta", "Boleta"], ["Factura", "Factura"]], "", function (v) { comp.tipo = v; segC.querySelectorAll("button").forEach(function (b, i) { b.classList.toggle("on", ["", "Boleta", "Factura"][i] === v); }); if (v && !fRaz.value.trim() && v === "Boleta") fRaz.value = fNom.value.trim(); pintarComp(); });
    segC.classList.add("comp-seg"); cuerpo.push(segC); cuerpo.push(zComp);
    var fNota = inp("Comentario (opcional)", "text", 200); cuerpo.push(campo("Comentario para cocina", fNota));
    cuerpo.push(tot); cuerpo.push(err);
    function costo() { if (!del) return 0; if (fCosto.value.trim() !== "") return Number(fCosto.value) || 0; return st.r && st.r.ok ? st.r.costo : 0; }
    function recalc() {
      if (del) {
        st.c = coordsDeTexto(fUbi.value); st.r = costoDelivery(fZona.value, st.c);
        var man = fCosto.value.trim() !== "";
        info.textContent = (st.c ? "📍 " + st.c.lat.toFixed(5) + ", " + st.c.lng.toFixed(5) + " · " : fUbi.value.trim() ? "⚠ No encontré coordenadas en ese texto (los enlaces cortos maps.app.goo.gl no las traen: ábrelo y copia las coordenadas). " : "") +
          (st.r.ok ? "Delivery " + soles(st.r.costo) + (st.r.zona ? " (" + st.r.zona + ")" : "") + (st.r.km != null ? " · " + st.r.km.toFixed(1) + " km" : "") + (man ? " · se usará el costo manual" : "")
            : st.r.falta ? (man ? "Costo manual " + soles(fCosto.value) : "Sin ubicación ni zona: no hay costo automático. Escribe el costo manual o déjalo para confirmar después.") : (st.r.error || "") + (man ? " · costo manual " + soles(fCosto.value) : ""));
        info.className = "del-info" + (st.r.fuera ? " mal" : "");
      }
      var cd = costo();
      tot.textContent = "Productos " + soles(sub) + (del ? " + delivery " + soles(cd) + " = " + soles(sub + cd) : "");
    }
    fNom.value = ""; recalc();
    // datos del cliente ya conocidos (panel local → Clientes → "Nuevo delivery"): se rellenan y se recalcula el costo
    var pre = S.preCli && S.preCli.tipo === tipo ? S.preCli : null; S.preCli = null;
    if (pre) {
      fNom.value = pre.nombre || ""; fCel.value = pre.tel || "";
      if (del) { fDir.value = pre.dir || ""; fRef.value = pre.ref || ""; if (pre.lat != null && pre.lng != null) fUbi.value = pre.lat + ", " + pre.lng; recalc(); }
    }
    if (LOCAL && LOCAL.ayudaCliente) LOCAL.ayudaCliente({ nom: fNom, cel: fCel, dir: fDir, ref: fRef, ubi: fUbi, del: del, recalc: recalc });
    ok = btn(del ? "✓ Registrar delivery" : "✓ Registrar para llevar", "btn prim", function () {
      err.textContent = "";
      var nom = fNom.value.trim(), cel = fCel.value.replace(/\D/g, "").replace(/^51(?=9\d{8}$)/, "");
      if (nom.length < 2) { err.textContent = "Escribe el nombre del cliente."; fNom.focus(); return; }
      if ((del || cel) && !/^9\d{8}$/.test(cel)) { err.textContent = "El celular debe tener 9 dígitos y empezar con 9."; fCel.focus(); return; }
      if (st.prog && !/^\d{2}:\d{2}$/.test(fHora.value)) { err.textContent = "Elige la hora programada."; return; }
      if (del && fDir.value.trim().length < 5) { err.textContent = "Escribe la dirección de entrega."; fDir.focus(); return; }
      if (del && st.r && st.r.fuera && fCosto.value.trim() === "") { err.textContent = st.r.error + ": escribe un costo manual si igual lo llevan."; return; }
      var eComp = validarCompExt(comp.tipo, fDoc.value, fRaz.value, fMail.value); if (eComp) { err.textContent = eComp; try { err.scrollIntoView({ block: "nearest" }); } catch (e) {} return; }
      var body = { mz: "externo", t: S.t, tipo: tipo, cid: cid, nombre: nom, telefono: cel, pago: pago[0] || "", programado: st.prog ? fHora.value : "", notas: fNota.value.trim(),
        items: c.map(function (l) { return { id: l.id, tam: l.tam, salsa: l.salsa, cant: l.cant, nota: l.nota, ops: l.ops || {}, mitad: l.mitad || "" }; }) };
      if (comp.tipo) { body.comprobante = comp.tipo; body.doc = fDoc.value.replace(/\D/g, ""); body.razon = fRaz.value.trim(); body.correo = fMail.value.trim(); }
      if (del) {
        body.direccion = fDir.value.trim(); body.referencia = fRef.value.trim(); body.zona = fZona.value;
        if (st.c) { body.lat = st.c.lat; body.lng = st.c.lng; }
        if (fCosto.value.trim() !== "") { body.costoManual = Number(fCosto.value); body.costoForzado = true; }
      }
      ok.disabled = true; ok.textContent = "Registrando…";
      api(body).then(function (r) {
        if (!r.ok) { ok.disabled = false; ok.textContent = del ? "✓ Registrar delivery" : "✓ Registrar para llevar"; err.textContent = r.error || "No se pudo registrar."; return; }
        var clave = S.mesa; carros[clave] = []; delete carros["_n" + clave]; guardarCarros();
        var g = leer(K_CLI, {}); g[tipo] = { prog: st.prog }; guardar(K_CLI, g);
        modalPedido = false; cerrarModal();
        toast("✓ " + (del ? "Delivery" : "Para llevar") + " #" + r.numero + " registrado · " + soles(r.aCobrar != null ? r.aCobrar : r.total) + " (se imprime en el local)", "ok");
        S.externos.push({ id: r.id, n: r.numero, hora: "ahora", ts: Date.now() + S.desfase, canal: del ? "delivery" : "recojo", nombre: nom, tel: cel, estado: "Confirmado", prog: body.programado,
          lat: body.lat == null ? null : body.lat, lng: body.lng == null ? null : body.lng, dir: body.direccion || "", ref: body.referencia || "", total: r.total, costo: r.costoDelivery, aCobrar: r.aCobrar != null ? r.aCobrar : r.total,
          mozo: S.mozo ? S.mozo.nombre : "", origen: "mozo", pago: body.pago, pagado: false, zona: "", lineas: c.map(function (l) { return { e: l.cant + " × " + nombreEs(prodDe(l.id)) + (l.tam ? " " + tamEs(l.tam) : "") }; }) });
        S.pest = "llevar"; guardar(K.pest, "llevar"); S.vista = "mesas"; S.mesa = null; S.v = ""; pintar(); window.scrollTo(0, 0); sondear();
      }).catch(function () { ok.disabled = false; ok.textContent = del ? "✓ Registrar delivery" : "✓ Registrar para llevar"; err.textContent = "Sin conexión. Vuelve a intentar (no se duplicará)."; });
    });
    abrirModal(del ? "🛵 Datos del delivery" : "🥡 ¿A nombre de quién?", cuerpo, [btn("‹ Volver", "btn", cerrarModal), ok]);
    setTimeout(function () { fNom.focus(); }, 60);
  }
  /* pedido armado para llevar / delivery: columna derecha (o ventana en el celular) */
  function ordenExterna() {
    var w = h("div", "orden"), cab = h("div", "orden__cab"), del = S.mesa === DL;
    cab.appendChild(h("h2", null, etiquetaMesa(S.mesa))); w.appendChild(cab);
    var lista = h("div", "orden__lista"), c = carro();
    lista.appendChild(h("p", "vacio", del ? "1) Toca los productos · 2) Continuar: datos del cliente, dirección y ubicación (el costo del delivery sale solo)." : "1) Toca los productos · 2) Continuar: nombre del cliente (y hora si es para más tarde). No ocupa mesa."));
    agrupar(c).forEach(function (gr) {
      var l = gr.l, ls = gr.ls, grp = gr.g;
      var it = prodDe(l.id), d = h("div", "linea"), tx = h("div", "d");
      tx.appendChild(document.createTextNode((l.mitad && PROD[l.mitad] ? nombreEs(it) + " con " + nombreEs(PROD[l.mitad]) : nombreEs(it) || l.n) + sufijoLinea(l, ls, grp)));
      if (grp) tx.appendChild(h("small", null, NOTA_PESO));
      if (l.nota) tx.appendChild(h("em", null, "→ " + l.nota));
      d.appendChild(tx); d.appendChild(h("span", "pr", soles(ls.reduce(function (a, x) { return a + x.unit * x.cant; }, 0))));
      var st = stepLinea(c, l, ls, grp, pintarOrden);
      st.appendChild(btn("🗑", "x", function () { ls.forEach(function (x) { c.splice(c.indexOf(x), 1); }); guardarCarros(); refrescarTarjeta(l.id); pintarOrden(); }));
      d.appendChild(st); lista.appendChild(d);
    });
    w.appendChild(lista);
    var pie = h("div", "orden__pie");
    if (c.length) pie.appendChild(btn("Continuar · " + soles(totalCarro()) + " ›", "btn prim", function () { formExterno(del ? "delivery" : "recojo"); }));
    w.appendChild(pie);
    return w;
  }

  /* ---------- enlace de ADMINISTRACIÓN: no es un panel de mozo (no tiene turno): lleva al panel de administración ---------- */
  function esAdmin() { var r = norm(S.mozo && S.mozo.rol || ""); return /^admin/.test(r); }
  function pantallaAdmin() {
    app.textContent = "";
    var w = h("div", "login");
    w.appendChild(h("h1", null, "Hola, " + (S.mozo ? S.mozo.nombre : "") + " 👋"));
    w.appendChild(h("p", null, "Este enlace es de ADMINISTRACIÓN: tu trabajo está en el panel de administración (pedidos, salón, carta, personal, reportes)."));
    var a = h("a", "btn prim", "Abrir el panel de administración"); a.href = API; a.style.maxWidth = "360px"; a.style.width = "100%"; w.appendChild(a);
    w.appendChild(h("p", null, "Si también atiendes mesas, pide que te creen además un enlace con rol Mozo."));
    app.appendChild(w);
  }

  /* =========================== ARRANQUE =========================== */
  /* Service worker: la app y la carta se piden SIEMPRE primero a la red (la copia guardada solo sin conexión). Cuando se publica una versión
     nueva, el service worker nuevo toma el control y la app se recarga UNA vez sola (si hay una ventana abierta, espera a que se cierre). */
  var swReg = null, swRecargar = false;
  function recargarSiLibre() {
    if (!swRecargar) return;
    var ae = document.activeElement;
    if (capa.classList.contains("on") || S.enviando || (ae && /INPUT|TEXTAREA|SELECT/.test(ae.tagName))) { setTimeout(recargarSiLibre, 3000); return; }
    swRecargar = false; location.reload();
  }
  if ("serviceWorker" in navigator && (location.protocol === "https:" || /^(localhost|127\.0\.0\.1)$/.test(location.hostname))) {
    var habiaControl = !!navigator.serviceWorker.controller;
    navigator.serviceWorker.register("/mozo-sw.js", { scope: "/" }).then(function (r) { swReg = r; try { r.update(); } catch (e) {} }).catch(function () {});
    navigator.serviceWorker.addEventListener("controllerchange", function () {
      if (!habiaControl) { habiaControl = true; return; }   // primera instalación: lo que se cargó ya vino de la red
      if (window.__pgRecargado) return; window.__pgRecargado = true;
      swRecargar = true; recargarSiLibre();
    });
  }
  if (!SECS.length) { app.appendChild(h("p", "vacio", "No se pudo cargar la carta. Revisa la conexión y vuelve a abrir.")); return; }
  /* Roles distintos de mozo (cajero, repartidor, cocina): su app vive en /<rol>.js y recibe el control.
     Debe definir window.PG_APP_<ROL> = { iniciar(ctx) } con ctx = { api, token, mozo, contenedor, h, toast, salir, cfg }. */
  var ROLES_EXT = ["cajero", "repartidor", "cocina"];
  function rolExt() { var r = S.mozo && String(S.mozo.rol || "").toLowerCase(); return ROLES_EXT.indexOf(r) >= 0 ? r : ""; }
  function cargarRolExt(rol) {
    if (rol === "cajero") aplicarMarcaTienda();
    var sc = document.createElement("script"); sc.src = "/" + rol + ".js";
    sc.onload = function () {
      var a = window["PG_APP_" + rol.toUpperCase()];
      if (a && a.iniciar) a.iniciar({ api: api, token: S.t, mozo: S.mozo, contenedor: app, h: h, toast: toast, salir: salir, cfg: C, mapaSalon: mapaExterno,
        instalar: { disponible: function () { return !!instalarEv; }, pedir: function () { var e = instalarEv; if (!e) return Promise.resolve(false); e.prompt(); return e.userChoice.then(function (c) { instalarEv = null; return c && c.outcome === "accepted"; }); }, ios: esIOS, instalada: instalada } });
      else app.appendChild(h("p", "vacio", "Este módulo todavía no está disponible. Avisa al administrador."));
    };
    sc.onerror = function () { app.appendChild(h("p", "vacio", "No se pudo cargar el módulo de " + rol + ". Revisa la conexión y vuelve a abrir el enlace.")); };
    document.head.appendChild(sc);
  }
  /* Panel LOCAL (rol local): se carga local.js (layout de escritorio y módulos extra) y recibe el núcleo de esta app; si no carga, queda el panel del mozo. */
  function interno() {
    return { S: S, C: C, API: API, api: api, h: h, btn: btn, soles: soles, norm: norm, leer: leer, guardar: guardar, r2: r2, uid: uid, toast: toast, abrirModal: abrirModal, cerrarModal: cerrarModal,
      capa: capa, pintar: pintar, refrescar: refrescar, sondear: sondear, abrirMesa: abrirMesa, nuevoExterno: nuevoExterno, tocarMesa: tocarMesa, cobrarExt: cobrarExt,
      entregarExtUI: entregarExtUI, detalleExt: detalleExt, tarjetaExt: tarjetaExt, cargarLeaflet: cargarLeaflet, escHtml: escHtml, mapsUrl: mapsUrl, mapaSalon: mapaSalon,
      medirMapa: medirMapa, vistaMesas: vistaMesas, botonMesa: botonMesa, estadoMesa: estadoMesa, mesasSalon: mesasSalon, porServir: porServir, entregar: entregar,
      PROD: PROD, SALSAS_TODAS: SALSAS_TODAS, nombreEs: nombreEs, tamEs: tamEs, cambiarAgotado: cambiarAgotado, ventanaAgotados: ventanaAgotados, segmento: segmento,
      chips: chips, minDesde: minDesde, tsSalida: tsSalida, CLS_EST: CLS_EST, LL: LL, DL: DL, pitar: pitar, audio: audio, menuYo: menuYo, cobrar: cobrar,
      esPseudo: esPseudo, mesaDe: mesaDe, legadoLlevar: legadoLlevar, K: K, metodosCanal: metodosCanal, rucValido: rucValido, validarCompExt: validarCompExt, instalar: { disponible: function () { return !!instalarEv; },
        pedir: function () { var e = instalarEv; if (!e) return Promise.resolve(false); e.prompt(); return e.userChoice.then(function (c) { instalarEv = null; return c && c.outcome === "accepted"; }); }, instalada: instalada } };
  }
  function cargarLocal() {
    aplicarMarcaLocal();
    if (!document.querySelector('link[href="/local.css"]')) { var l = document.createElement("link"); l.rel = "stylesheet"; l.href = "/local.css"; document.head.appendChild(l); }
    var sc = document.createElement("script"); sc.src = "/local.js";
    sc.onload = function () {
      var LM = window.PG_LOCAL;
      if (LM && LM.iniciar) { try { LOCAL = LM.iniciar(interno()); } catch (e) { console.error(e); LOCAL = null; } }
      iniciar();
    };
    sc.onerror = function () { toast("No se pudo cargar el panel local: se abre el panel del salón.", "mal"); iniciar(); };
    document.head.appendChild(sc);
  }
  if (S.t && S.mozo) { if (esAdmin()) pantallaAdmin(); else if (rolExt()) cargarRolExt(rolExt()); else if (esLocalRol()) cargarLocal(); else iniciar(); } else pantallaLogin();
})();
