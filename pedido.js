/* Pasta Gallo · ficha de producto, carrito y envío de pedidos (delivery, recojo y mesa).
   No necesitas editar este archivo: todo se configura desde el panel. */
(function () {
  "use strict";
  var C = window.CARTA, CFG = C.pedidos || {}, GRUPOS = C.opciones || {};
  /* "Yape" y "Plin" son UNA sola opción ("Yape o Plin": un solo QR, el de Plin, que se paga desde cualquiera de los dos).
     En la mesa no se ofrece transferencia. */
  var YP = "Yape o Plin";
  function unirMetodos(l, salon) {
    var r = [];
    (l || []).forEach(function (m) { m = /^(yape|plin)$/i.test(m) ? YP : m; if (salon && /^transf/i.test(m)) return; if (r.indexOf(m) < 0) r.push(m); });
    return r;
  }
  CFG.metodosPago = unirMetodos(CFG.metodosPago, false);
  CFG.metodosPagoMesa = unirMetodos(CFG.metodosPagoMesa, true);
  /* Lo que el servidor acepta hoy como "pago" (Config metodos_pago). Yape y Plin sueltos los acepta como "Yape o Plin". */
  var PAGOS_SERVIDOR = CFG.metodosPago.slice();
  /* Al cliente se le muestran por separado: "Yape" (QR de Yape), "Plin" (QR de Plin) y "Transferencia" (banco, cuenta y CCI),
     según los datos de cobro publicados (CARTA.pedidos.cobro). */
  function separarMetodos(l, conTransf) {
    var cb = CFG.cobro || {}, r = [];
    (l || []).forEach(function (m) {
      if (m === YP) { if (cb.Yape) r.push("Yape"); if (cb.Plin) r.push("Plin"); if (!cb.Yape && !cb.Plin) r.push(YP); }
      else if (!/^transf/i.test(m) || conTransf) r.push(m);
    });
    var tr = cb.Transferencia;
    if (conTransf && tr && (tr.numero || tr.cci) && !r.some(function (m) { return /^transf/i.test(m); })) r.push("Transferencia");
    return r.filter(function (m, i) { return r.indexOf(m) === i; });
  }
  /* Pago que viaja al servidor: si el método no está en su lista (p. ej. Transferencia aún no activada en Ajustes > Cobros),
     va vacío (el pago es opcional) y el método se anota en el pedido para que el local lo vea. */
  function pagoServidor(m) {
    if (!m) return "";
    if (PAGOS_SERVIDOR.indexOf(m) >= 0) return m;
    if (/^(yape|plin)$/i.test(m) && PAGOS_SERVIDOR.indexOf(YP) >= 0) return m;   // el servidor lo guarda como "Yape o Plin"
    return "";
  }
  CFG.metodosPago = separarMetodos(CFG.metodosPago, true);
  CFG.metodosPagoMesa = separarMetodos(CFG.metodosPagoMesa, false);
  var I = window.PG_I18N, t = I.t, tx = I.tx;
  var MODO = window.MODO === "mesa" ? "mesa" : "delivery";
  var params = new URLSearchParams(location.search);
  // QR nuevo: pastagallo.pages.dev/<código> (404.html ya preguntó al servidor qué mesa es → window.PG_MESA).
  // QR viejo (impreso): /mesa?m=5&c=xxxxxx, sigue sirviendo hasta que se desactive en el panel.
  var PGM = window.PG_MESA || null;
  var MESA = MODO === "mesa" ? String(PGM ? PGM.m : (params.get("m") || "")).slice(0, 6) : "";
  var CODIGO = MODO === "mesa" ? String(PGM ? PGM.c : (params.get("c") || "")).slice(0, 20) : "";
  var CLAVE = "pg-carrito-" + MODO + (MESA ? "-" + MESA : "");
  var carrito = [];
  var P, h; // utilidades de app.js

  function origen() { try { return sessionStorage.getItem("pg-origen") || ""; } catch (e) { return ""; } }
  /* Día de negocio (America/Lima): cambia a las 5:00 am, ya cerrado el local. Lo que quedó sin enviar en una mesa se borra solo al
     abrir la carta otro día de negocio, en cualquier celular (cada uno guarda su propio carrito y lo revisa al cargar). */
  function diaNegocio() { return P.ahoraLugar(new Date(Date.now() - 5 * 3600 * 1000)).fecha; }
  function guardar() { try { localStorage.setItem(CLAVE, JSON.stringify({ t: Date.now(), d: diaNegocio(), c: carrito })); } catch (e) {} }
  function cargar() {
    try {
      var o = JSON.parse(localStorage.getItem(CLAVE) || "null");
      var mismoDia = !o || MODO !== "mesa" || o.d === diaNegocio();
      if (o && Date.now() - o.t < 6 * 3600 * 1000 && Array.isArray(o.c) && mismoDia) carrito = o.c;
      else if (o) localStorage.removeItem(CLAVE);
    } catch (e) { carrito = []; }
    if (MODO === "mesa") {   // también las colas de otras mesas que quedaron en este celular
      try {
        for (var i = localStorage.length - 1; i >= 0; i--) {
          var k = localStorage.key(i); if (!k || k.indexOf("pg-carrito-mesa") !== 0 || k === CLAVE) continue;
          var x = JSON.parse(localStorage.getItem(k) || "null"); if (!x || x.d !== diaNegocio()) localStorage.removeItem(k);
        }
      } catch (e) {}
    }
  }

  /* Datos del cliente y su último pedido: se guardan SOLO en su propio celular (localStorage),
     para no tener que escribirlos otra vez. */
  var CLAVE_CLIENTE = "pg-cliente", CLAVE_ULTIMO = "pg-ultimo-pedido";
  var CAMPOS_CLIENTE = ["nombre", "telefono", "direccion", "referencia", "pago", "canal", "doc", "razon", "correo"];
  function leerJson(k) { try { return JSON.parse(localStorage.getItem(k) || "null"); } catch (e) { return null; } }
  function guardarJson(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} }
  function recordarCliente() {
    var o = {}; CAMPOS_CLIENTE.forEach(function (k) { if (esBarra() && (k === "canal" || k === "pago")) return; if (form[k]) o[k] = String(form[k]).slice(0, 200); });
    guardarJson(CLAVE_CLIENTE, o);
  }
  function cargarCliente() {
    var o = leerJson(CLAVE_CLIENTE) || {};
    var campos = MODO === "mesa" ? ["nombre", "telefono", "doc", "razon", "correo"] : CAMPOS_CLIENTE;
    campos.forEach(function (k) { if (o[k] && !form[k]) form[k] = o[k]; });
  }

  var productos = {}, seccionDe = {};
  C.secciones.forEach(function (s) {
    s.grupos.forEach(function (g) { g.items.forEach(function (it) { productos[it.id] = it; seccionDe[it.id] = s; }); });
  });
  var salsas = (C.salsas || []).filter(function (s) { return !s.agotado; });
  var salsaPorId = {}; salsas.forEach(function (s) { salsaPorId[s.id] = s; });

  /* ---------- costo de delivery (misma fórmula que calcularDelivery_ en apps-script/Code.gs) ---------- */
  var DEL_DEF = {
    local: { lat: -8.1278775, lng: -79.040603 }, factor_pista: 1.3, base: 4.5, por_km: 1.55, minimo: 5, maximo: 30, max_km: 14.5,
    zonas: [
      { nombre: 'La Merced', precio: 5, lat: -8.126, lng: -79.0393, radio_km: 0.5 }, { nombre: 'California', precio: 6, lat: -8.1309, lng: -79.0377, radio_km: 0.6 },
      { nombre: 'San Andrés', precio: 7, lat: -8.1124, lng: -79.034, radio_km: 0.8 }, { nombre: 'Golf', precio: 7, lat: -8.134, lng: -79.035, radio_km: 0.8 },
      { nombre: 'Santa María', precio: 10, lat: -8.1199, lng: -79.0222, radio_km: 0.9 }, { nombre: 'Las Quintanas', precio: 10, lat: -8.0994, lng: -79.0273, radio_km: 0.9 },
      { nombre: 'San Isidro', precio: 10, lat: -8.1019, lng: -79.0326, radio_km: 0.9 }, { nombre: 'El Bosque', precio: 10, lat: -8.1102, lng: -79.006, radio_km: 1.0 },
      { nombre: 'La Esperanza', precio: 20, lat: -8.083, lng: -79.041, radio_km: 1.5 }, { nombre: 'La Rinconada', precio: 15, lat: -8.0924, lng: -79.0052, radio_km: 1.0 },
      { nombre: 'El Milagro', precio: 20, lat: -8.0338, lng: -79.0632, radio_km: 1.5 }, { nombre: 'Covicorti', precio: 8, lat: -8.1129, lng: -79.0465, radio_km: 0.8 },
      { nombre: 'La Perla', precio: 8, lat: -8.128, lng: -79.0274, radio_km: 0.8 }, { nombre: 'Buenos Aires', precio: 8, lat: -8.1435, lng: -79.0562, radio_km: 0.9 },
      { nombre: 'Centro de Trujillo', precio: 8, lat: -8.1118, lng: -79.0287, radio_km: 0.8 }, { nombre: 'El Salvador', precio: 10, lat: -8.1027, lng: -79.0232, radio_km: 0.9 },
      { nombre: 'Tacora', precio: 12, lat: -8.095, lng: -79.05, radio_km: 1.0 }, { nombre: 'Huanchaco', precio: 30, lat: -8.08, lng: -79.1205, radio_km: 1.5 },
      { nombre: 'Ramón Castilla', precio: 20, lat: -8.0877, lng: -79.0109, radio_km: 1.0 }
    ]
  };
  function distanciaKm(a, b) {
    var rad = Math.PI / 180, dLat = (b.lat - a.lat) * rad, dLng = (b.lng - a.lng) * rad;
    var x = Math.sin(dLat / 2) * Math.sin(dLat / 2) + Math.cos(a.lat * rad) * Math.cos(b.lat * rad) * Math.sin(dLng / 2) * Math.sin(dLng / 2);
    return 2 * 6371 * Math.asin(Math.min(1, Math.sqrt(x)));
  }
  function calcularDelivery(tar, ent) {
    ent = ent || {}; tar = tar || {};
    var zonas = tar.zonas || [], nombre = String(ent.zona == null ? '' : ent.zona).trim();
    var fin = function (n) { return Math.ceil(Math.round(Number(n) * 1e6) / 1e6); };
    if (nombre) {
      var z = zonas.filter(function (x) { return String(x.nombre) === nombre; })[0];
      if (!z || !isFinite(Number(z.precio))) return { ok: false, error: 'Elige una zona de la lista.' };
      return { ok: true, costo: fin(z.precio), zona: String(z.nombre), km: null, metodo: 'zona' };
    }
    var lat = ent.lat == null || ent.lat === '' ? NaN : Number(ent.lat), lng = ent.lng == null || ent.lng === '' ? NaN : Number(ent.lng);
    if (!isFinite(lat) && !isFinite(lng)) return { ok: false, falta: true, error: 'Elige tu zona o usa tu ubicación.' };
    if (!isFinite(lat) || !isFinite(lng) || Math.abs(lat) > 90 || Math.abs(lng) > 180) return { ok: false, error: 'Ubicación no válida.' };
    var p = { lat: lat, lng: lng }, mejor = null, md = 0;
    zonas.forEach(function (x) {
      var zl = x.lat == null || x.lat === '' ? NaN : Number(x.lat), zg = x.lng == null || x.lng === '' ? NaN : Number(x.lng), rk = x.radio_km == null || x.radio_km === '' ? NaN : Number(x.radio_km);
      if (!isFinite(zl) || !isFinite(zg) || !isFinite(rk) || !isFinite(Number(x.precio))) return;
      var dz = distanciaKm({ lat: zl, lng: zg }, p);
      if (dz <= rk && (!mejor || dz < md)) { mejor = x; md = dz; }
    });
    var loc = tar.local || {}, ll = Number(loc.lat), lg = Number(loc.lng);
    var km = isFinite(ll) && isFinite(lg) && loc.lat != null && loc.lng != null ? distanciaKm({ lat: ll, lng: lg }, p) : null;
    if (mejor) return { ok: true, costo: fin(mejor.precio), zona: String(mejor.nombre), km: km, metodo: 'ubicacion-zona' };
    if (km == null) return { ok: false, error: 'No se pudo calcular el delivery por ubicación. Elige tu zona.' };
    var maxKm = Number(tar.max_km);
    if (maxKm > 0 && km > maxKm) return { ok: false, fuera: true, km: km, error: 'Estás fuera de nuestra zona de reparto.' };
    var num = function (v, def) { var n = Number(v); return v == null || v === '' || !isFinite(n) ? def : n; };
    var c = fin(num(tar.base, 0) + num(tar.por_km, 0) * km * num(tar.factor_pista, 1));
    var mn = num(tar.minimo, 0), mx = num(tar.maximo, 0);
    if (c < mn) c = mn;
    if (mx > 0 && c > mx) c = mx;
    return { ok: true, costo: fin(c), zona: '', km: km, metodo: 'distancia' };
  }
  function tarifas() { return CFG.deliveryTarifas && CFG.deliveryTarifas.zonas && CFG.deliveryTarifas.zonas.length ? CFG.deliveryTarifas : DEL_DEF; }
  /* Entrega automática: el cliente solo da su ubicación (GPS o dirección buscada en el mapa). Con las coordenadas se mira primero si caen en alguna
     zona de la lista (precio de la zona); si no, se aplica la fórmula por distancia. La zona es interna: no se muestra, solo viaja en el pedido. null si no es delivery. */
  function entregaActual() {
    if (MODO === "mesa" || form.canal !== "delivery") return null;
    return calcularDelivery(tarifas(), { lat: form.lat, lng: form.lng });
  }
  function costoDelivery() { var e = entregaActual(); return e && e.ok ? e.costo : 0; }
  function sumaPagar() { return total() + costoDelivery(); }

  /* ---------- reglas ---------- */
  function enExtra() { // cocina extra tras el cierre: solo llevar y delivery (misma regla que el servidor)
    var x = CFG.extraLlevarMin | 0; if (!x || MODO === "mesa") return false;
    var ah = P.ahoraLugar(new Date()), r = (C.horario.dias || {})[ah.dia]; if (!r) return false;
    var a = P.minutos(r[0]), c = P.minutos(r[1]), m = ah.min;
    if (c <= a) { c += 1440; if (m < a) m += 1440; }
    return m >= c && m < c + x;
  }
  function abiertoAhora() { return P.estadoActual().abierto || enExtra(); }
  /* QR de barra/mostrador (?origen=barra): la persona ya está en el local. Pedido inmediato para recoger: sin dirección, sin hora y sin bloqueo por horario. */
  function esBarra() { return MODO !== "mesa" && !!(window.PG_COMERCIO && PG_COMERCIO.barra && CFG.recojo); }
  /* Medios de pago de la barra: ninguno obligatorio ni preseleccionado (el cobro se hace o se confirma en caja) */
  function metodosBarra() {
    var mesa = CFG.metodosPagoMesa || [], cb = CFG.cobro || {}, r = [];
    var ok = function (m) { return !mesa.length || mesa.indexOf(m) >= 0; };
    if (ok("Efectivo")) r.push("Efectivo");
    if (cb.Yape || cb.Plin) { if (cb.Yape) r.push("Yape"); if (cb.Plin) r.push("Plin"); }
    else if ((CFG.metodosPago || []).indexOf(YP) >= 0 || mesa.indexOf(YP) >= 0) r.push(YP);
    if (cb.Transferencia) r.push("Transferencia");
    if (ok("Tarjeta")) r.push("Tarjeta");
    return r;
  }
  function celularBarra(v) { var d = String(v || "").replace(/\D/g, ""); if (/^519\d{8}$/.test(d)) d = d.slice(2); return /^9\d{8}$/.test(d) ? d : ""; }
  function mesaValida() { return MODO !== "mesa" || (MESA && CODIGO); }
  function activo() {
    if (!CFG.activos) return false;
    if (MODO === "mesa") return !!(CFG.api && CFG.mesaActivos && mesaValida());
    return true; // sin api, el delivery funciona solo por WhatsApp
  }
  function aceptaAhora() {
    if (!activo()) return false;
    if (esBarra() || abiertoAhora()) return true;
    return MODO === "delivery" && !!CFG.fueraHorario;
  }
  function motivoNoPedible(it, sec) {
    if (it.agotado) return t("agotado");
    if (window.PG_COMERCIO) { var mc = PG_COMERCIO.motivo(it, sec); if (mc) return mc; }   // módulo comercio: fuera de su horario
    if (it.promo && !it._hoy) return t("promoOtroDia", { c: it._cuando });
    if (it.promo && it._hora) return t("promoHora", { c: it._cuando });
    if (it.canal === "local" && MODO !== "mesa") return t("soloLocalTxt");
    if (it.canal === "delivery" && MODO === "mesa") return t("soloDeliveryTxt");
    if (it.p == null && !(it.t && it.t.length)) return t("consulta");
    /* Nostri Prodotti (tienda) se puede pedir en todos los canales, también desde la mesa (para llevar a casa) */
    if (activo() && MODO !== "mesa" && !sec.delivery && sec.id !== "tienda") return t("soloLocalTxt");   // secciones solo para el salón (cafetería, aperitivos…)
    if (!activo() || (MODO === "mesa" ? !(sec.mesa || sec.id === "tienda") : !sec.delivery)) return t("noPedible");
    return "";
  }
  function puedePedir(it, sec) {
    if (it.tipo === "salsa") return false;
    if (it.salsa && !salsas.length) return false;
    return !motivoNoPedible(it, sec);
  }
  function gruposDe(it, salsaId) {
    var ids = (it.op || []).slice();
    var s = salsaPorId[salsaId];
    if (s && s.op) s.op.forEach(function (g) { if (ids.indexOf(g) < 0) ids.push(g); });
    return ids.filter(function (g) { return GRUPOS[g]; });
  }
  function repreciar(l) {
    var it = productos[l.id]; if (!it || it.agotado) return null;
    var base;
    if (it.t) { var tt = it.t.filter(function (x) { return x[0] === l.tam; })[0]; if (!tt) return null; base = tt[1]; }
    else base = it.p;
    if (base == null) return null;
    if (l.mitad) { var m2 = productos[l.mitad]; var t2 = m2 && !m2.agotado && it.t && l.tam !== it.t[0][0] && m2.t ? m2.t.filter(function (x) { return x[0] === l.tam; })[0] : null; if (!t2) return null; base = Math.max(base, t2[1]); }
    var extra = 0, ok = true;
    if (l.salsa) { var s = salsaPorId[l.salsa]; if (!s) return null; extra += s.extra || 0; }
    Object.keys(l.ops || {}).forEach(function (gid) {
      var g = GRUPOS[gid]; if (!g) { ok = false; return; }
      (l.ops[gid] || []).forEach(function (nm) { var o = g.ops.filter(function (x) { return x.n === nm; })[0]; if (!o) ok = false; else extra += o.p || 0; });
    });
    if (!ok) return null;
    l.unit = Math.round((base + extra) * 100) / 100;
    return l;
  }
  /* Próxima franja en la que se puede entregar o recoger: hoy (desde dentro de 30 min) o el próximo día abierto.
     Misma regla que el servidor (proximaVentana_). */
  function hhmm(m) { m = ((m % 1440) + 1440) % 1440; return ("0" + Math.floor(m / 60)).slice(-2) + ":" + ("0" + (m % 60)).slice(-2); }
  function fmtHora(m) {
    m = ((m % 1440) + 1440) % 1440;
    var hh = Math.floor(m / 60), mi = ("0" + (m % 60)).slice(-2), suf = hh >= 12 ? "pm" : "am";
    return (hh % 12 || 12) + ":" + mi + " " + suf;
  }
  function sumarDiasIso(iso, n) {
    var p = iso.split("-"), d = new Date(Date.UTC(+p[0], +p[1] - 1, +p[2] + n));
    return d.getUTCFullYear() + "-" + ("0" + (d.getUTCMonth() + 1)).slice(-2) + "-" + ("0" + d.getUTCDate()).slice(-2);
  }
  /* Franja en la que se puede programar: horas de 18:30 a 23:00 (configurable) cada 15 min, con tiempo de preparación.
     Misma regla que el servidor (ventanasProgramadas_): la primera franja con horas libres, hoy o el próximo día abierto.
     "fecha" viaja al servidor para que "mañana 19:00" no se evalúe contra hoy. */
  function ventanaPedido() {
    var dias = (C.horario && C.horario.dias) || {};
    var ah = P.ahoraLugar(new Date()), pc = CFG.programado || {};
    var paso = pc.paso >= 5 && pc.paso <= 60 ? pc.paso : 15, prep = pc.prep >= 0 && pc.prep <= 240 ? pc.prep : 30;
    var xp = window.PG_COMERCIO && C.ext && C.ext.comercio && C.ext.comercio.prog;   // módulo comercio: intervalo y anticipación configurables
    if (xp) { paso = xp.paso || paso; if (xp.ant != null) prep = xp.ant; }
    var pd = P.minutos(pc.desde || "18:30"), ph = P.minutos(pc.hasta || "23:00");
    for (var i = 0; i <= 7; i++) {
      var d = (ah.dia + i) % 7, r = dias[d]; if (!r) continue;
      var a = P.minutos(r[0]), c = P.minutos(r[1]); if (c <= a) c += 1440;
      var desde = Math.ceil(Math.max(a, pd) / paso) * paso, hasta = Math.floor(Math.min(c, ph) / paso) * paso;
      if (i === 0) desde = Math.max(desde, Math.ceil((ah.min + prep) / paso) * paso);
      if (desde > hasta) continue;
      var etq = i === 0 ? t("hoy").toLowerCase() : i === 1 ? t("manana").trim().replace(/,$/, "").toLowerCase() : t("el") + t("dias")[d];
      return { dias: i, dia: d, a: a, c: c, desde: desde, hasta: hasta, paso: paso, fecha: sumarDiasIso(ah.fecha, i), etiqueta: etq.trim() };
    }
    return null;
  }
  function tieneOpciones(it) { return !!(it.t || it.salsa || (it.op && it.op.length)); }

  /* ---------- Tienda: presentaciones por paquete (solo "1/2 kg" = 500 g) o por peso en pasos de 1/4 kg (salsas: "1/2 kg" y "1/4 kg").
     Se decide por las presentaciones que trae el producto, no por su id; el resto (1 kg / 1/2 kg…) sigue con chips de tamaño. ---------- */
  function modoPres(it, sec) {
    sec = sec || (it && seccionDe[it.id]);
    if (!it || !it.t || !sec || sec.id !== "tienda") return "";
    var ts = it.t.map(function (x) { return x[0]; }), m = ts.indexOf("1/2 kg") >= 0;
    if (m && ts.length === 1) return "paq";
    if (m && ts.indexOf("1/4 kg") >= 0 && ts.indexOf("1 kg") < 0) return "peso";
    return "";
  }
  /* presentaciones de tienda en texto: "1/2 kg" → "500 g", "1 kg" → "1 kg" */
  function kgDe(tam) {
    var x = String(tam || "").trim().toLowerCase().replace(",", "."), m;
    if ((m = x.match(/^(\d+)\/(\d+)\s*kg$/))) return +m[1] / +m[2];
    if ((m = x.match(/^(\d+(?:\.\d+)?)\s*kg$/))) return +m[1];
    if ((m = x.match(/^(\d+(?:\.\d+)?)\s*g$/))) return +m[1] / 1000;
    return null;
  }
  function presTxt(tam) { var k = kgDe(tam); return k == null ? I.tam(tam) : k < 1 ? Math.round(k * 1000) + " g" : fmtKg(k) + " kg"; }
  function tamDefTienda(it) { if (!it || !it.t || !it.t.length) return ""; var ts = it.t.map(function (x) { return x[0]; }); return ts.indexOf("1/2 kg") >= 0 && ts.indexOf("1 kg") < 0 ? "1/2 kg" : ts[0]; }
  function precioDeTam(it, tam) { var x = it.t.filter(function (y) { return y[0] === tam; })[0]; return x ? x[1] : null; }
  function precioKg(it) { var p2 = precioDeTam(it, "1/2 kg"); return p2 == null ? null : p2 * 2; }
  function fmtKg(n) { var v = String(Math.round(n * 100) / 100); return I.lang === "en" ? v : v.replace(".", ","); }
  function fmtCuartos(q) { var e = Math.floor(q / 4), f = ["", "¼", "½", "¾"][q % 4]; return (e || !f ? String(e) : "") + f; }
  function partesCuartos(q) { return { m: Math.floor(q / 2), c: q % 2 }; }
  function descPartes(q) { var p = partesCuartos(q), r = []; if (p.m) r.push(p.m + " × ½"); if (p.c) r.push(p.c + " × ¼"); return r.join(" + "); }
  function lineasPeso(it, q) {
    var p = partesCuartos(q), r = [], p4 = precioDeTam(it, "1/4 kg"), p2 = precioDeTam(it, "1/2 kg");
    if (p.m) r.push({ tam: "1/2 kg", cant: p.m, unit: p2 });
    if (p.c) r.push({ tam: "1/4 kg", cant: p.c, unit: p4 });
    return r;
  }
  function cuartosDe(ls) { return ls.reduce(function (a, l) { return a + l.cant * (l.tam === "1/2 kg" ? 2 : 1); }, 0); }
  function paqTxt(n) { return n + " " + (n === 1 ? t("paqueteUno") : t("paquetesN")) + " · " + fmtKg(n * 0.5) + " kg"; }
  /* línea de peso: producto en modo "peso" cuyas líneas están en 1/2 kg o 1/4 kg; se agrupan por producto + nota + llevar */
  function grupoPeso(l) {
    var it = productos[l.id];
    if (!it || (l.tam !== "1/2 kg" && l.tam !== "1/4 kg") || modoPres(it) !== "peso") return "";
    return [l.id, l.nota, l.llevar ? "L" : ""].join("|");
  }

  /* ---------- dinero ---------- */
  function soles(n) { return "S/ " + Number(n).toFixed(2); }
  function total() { return carrito.reduce(function (a, l) { return a + l.unit * l.cant; }, 0); }
  function unidades() {
    var vistos = {};
    return carrito.reduce(function (a, l) { var g = grupoPeso(l); if (g) { if (vistos[g]) return a; vistos[g] = 1; return a + 1; } return a + l.cant; }, 0);
  }

  /* ---------- hoja (ventana inferior) ---------- */
  function boton(texto, cls, fn) { var b = h("button", cls, texto); b.type = "button"; b.addEventListener("click", fn); return b; }
  var capa, hoja, barra, barraTxt, barraTot, ultimoFoco;
  function abrirHoja(contenido, titulo, cls) {
    ultimoFoco = document.activeElement;
    hoja.textContent = "";
    hoja.className = "hoja" + (cls ? " " + cls : "");
    var cab = h("div", "hoja__cab");
    cab.appendChild(h("h2", null, titulo));
    var x = boton("×", "hoja__x", cerrarHoja); x.setAttribute("aria-label", t("cerrar"));
    cab.appendChild(x);
    hoja.appendChild(cab);
    hoja.appendChild(contenido);
    hoja.setAttribute("aria-label", titulo);
    hoja.scrollTop = 0;
    capa.classList.add("on");
    requestAnimationFrame(function () { hoja.classList.add("entra"); });
    document.body.classList.add("sin-scroll");
    setTimeout(function () { x.focus(); }, 60);
  }
  /* ---------- compartir el enlace de un producto (menú nativo del celular) ---------- */
  function enlaceProducto(it) {
    var base = location.origin + location.pathname.replace(/[^\/]*$/, "");
    return base + "?p=" + encodeURIComponent(it.id) + "&o=compartido";
  }
  function avisoBreve(texto) {
    var a = h("div", "aviso-copia", texto); document.body.appendChild(a);
    setTimeout(function () { a.classList.add("on"); }, 10);
    setTimeout(function () { a.classList.remove("on"); setTimeout(function () { a.remove(); }, 300); }, 2200);
  }
  function copiarTexto(txt) {
    if (navigator.clipboard && navigator.clipboard.writeText) return navigator.clipboard.writeText(txt);
    return new Promise(function (ok, mal) {
      var ta = h("textarea"); ta.value = txt; ta.setAttribute("readonly", ""); ta.style.position = "fixed"; ta.style.opacity = "0";
      document.body.appendChild(ta); ta.select();
      try { document.execCommand("copy") ? ok() : mal(); } catch (e) { mal(e); } ta.remove();
    });
  }
  function compartirProducto(it) {
    var url = enlaceProducto(it), nombre = tx(it, "n");
    var datos = { title: nombre + " · Pasta Gallo", text: nombre + " — Pasta Gallo", url: url };
    if (navigator.share) { navigator.share(datos).catch(function () {}); return; }
    copiarTexto(url).then(function () { avisoBreve(t("enlaceCopiado")); }, function () { window.prompt(t("copiaEnlace"), url); });
  }
  function botonCompartir(it) {
    var cab = hoja.querySelector(".hoja__cab"), x = cab && cab.querySelector(".hoja__x"); if (!x) return;
    var b = h("button", "hoja__x hoja__compartir"); b.type = "button";
    b.setAttribute("aria-label", t("compartir")); b.title = t("compartir");
    b.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3v12M7.5 7.5 12 3l4.5 4.5M5 12v7a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-7"/></svg>';
    b.addEventListener("click", function () { compartirProducto(it); });
    var grupo = h("div", "hoja__acc"); cab.insertBefore(grupo, x); grupo.appendChild(b); grupo.appendChild(x);
  }
  function cerrarHoja() {
    capa.classList.remove("on");
    document.body.classList.remove("sin-scroll");
    if (ultimoFoco && ultimoFoco.focus) ultimoFoco.focus();
  }

  function stepper(valor, min, max, alCambiar, fmt) {
    var w = h("div", "stepper" + (fmt ? " stepper--peso" : ""));
    var pon = function () { out.textContent = fmt ? fmt(valor) : valor; };
    var menos = boton("−", "", function () { if (valor > min) { valor--; pon(); alCambiar(valor); } });
    var mas = boton("+", "", function () { if (valor < max) { valor++; pon(); alCambiar(valor); } });
    menos.setAttribute("aria-label", t("quitarUno")); mas.setAttribute("aria-label", t("agregarUno"));
    var out = h("output", null, fmt ? fmt(valor) : String(valor)); out.setAttribute("aria-live", "polite");
    w.appendChild(menos); w.appendChild(out); w.appendChild(mas);
    return w;
  }

  function opcionesUI(nombre, opciones, multiple, alCambiar) {
    var w = h("div", "opciones"); w.setAttribute("role", multiple ? "group" : "radiogroup");
    opciones.forEach(function (o) {
      var l = h("label", "opcion");
      var r = h("input"); r.type = multiple ? "checkbox" : "radio"; r.name = nombre; r.value = o.valor;
      if (o.marcado) r.checked = true;
      r.addEventListener("change", function () {
        var marcados = Array.prototype.slice.call(w.querySelectorAll("input:checked")).map(function (x) { return x.value; });
        alCambiar(marcados);
      });
      l.appendChild(r);
      l.appendChild(h("span", "opcion__t", o.texto));
      if (o.extra) l.appendChild(h("span", "opcion__p", o.extra));
      w.appendChild(l);
    });
    return w;
  }

  /* Casillas excluyentes que se pueden dejar sin marcar (pago y comprobante: sin marcar = no se usa). alCambiar("") si no queda ninguna. */
  function opcionesOpc(nombre, opciones, alCambiar) {
    var w = h("div", "opciones"); w.setAttribute("role", "group");
    opciones.forEach(function (o) {
      var l = h("label", "opcion"), r = h("input"); r.type = "checkbox"; r.name = nombre; r.value = o.valor;
      if (o.marcado) r.checked = true;
      r.addEventListener("change", function () {
        if (r.checked) Array.prototype.forEach.call(w.querySelectorAll("input"), function (x) { if (x !== r) x.checked = false; });
        alCambiar(r.checked ? o.valor : "");
      });
      l.appendChild(r); l.appendChild(h("span", "opcion__t", o.texto));
      w.appendChild(l);
    });
    return w;
  }

  /* Selector de tamaño en segmentos (una sola fila: nombre + precio) */
  function segmentos(nombre, opciones, alCambiar) {
    var w = h("div", "seg"); w.setAttribute("role", "radiogroup");
    opciones.forEach(function (o) {
      var l = h("label", "seg__o"), r = h("input"); r.type = "radio"; r.name = nombre; r.value = o.valor;
      if (o.marcado) r.checked = true;
      r.addEventListener("change", function () { alCambiar([o.valor]); });
      l.appendChild(r); l.appendChild(h("span", "seg__t", o.texto));
      if (o.extra) l.appendChild(h("span", "seg__p", o.extra));
      w.appendChild(l);
    });
    return w;
  }
  function tarjeta(titulo) { var w = h("section", "tarj"); if (titulo) w.appendChild(h("h3", "hoja__sub", titulo)); return w; }

  /* ---------- ficha del producto (detalle + opciones): foto grande, tarjetas de opciones, botón fijo abajo ---------- */
  function abrirDetalle(it, sec, tamPre, opts) {
    opts = opts || {};
    if (window.PG_ANALITICA) PG_ANALITICA.ev("abrir_producto", it.id, sec ? sec.id : "");
    var c = h("div", "hoja__cuerpo");
    var esProd = sec && (sec.id === "italia" || (sec.id === "vini" && /^fotos\//.test(it.foto || "")));
    var fotoW = h("div", "detalle__fw" + (it.foto ? "" : " detalle__fw--vacia"));
    var im = h("img", "detalle__foto" + (it.foto && esProd ? " detalle__foto--producto" + (sec.id === "vini" ? " detalle__foto--botella" : "") : "")); im.alt = it.foto ? tx(it, "n") : "";
    if (it.foto) {
      im.src = it.foto;
      im.onerror = function () { im.onerror = null; im.src = "gallo-oro.png"; im.className = "detalle__foto detalle__foto--vacia"; im.alt = ""; fotoW.className = "detalle__fw detalle__fw--vacia"; };
    } else { im.src = "gallo-oro.png"; im.className = "detalle__foto detalle__foto--vacia"; }
    fotoW.appendChild(im); c.appendChild(fotoW);
    var sb = I.lang === "en" ? it.sub_en : it.sub;
    if (sb) c.appendChild(h("p", "detalle__sub", sb));
    var avDet = window.PG_COMERCIO && PG_COMERCIO.aviso ? PG_COMERCIO.aviso(it, sec) : "";
    if (avDet) c.appendChild(h("p", "hr-aviso", avDet));
    if (tx(it, "g")) c.appendChild(h("p", "detalle__g", tx(it, "g")));
    if (tx(it, "d")) c.appendChild(h("p", "hoja__desc", tx(it, "d")));
    var inc = I.lang === "en" && it.inc_en ? it.inc_en : it.inc;
    if (inc && inc.length) {
      c.appendChild(h("h3", "hoja__sub", t("incluye")));
      var ul = h("ul", "incluye"); inc.forEach(function (x) { ul.appendChild(h("li", null, x)); }); c.appendChild(ul);
      if (it._cuando) c.appendChild(h("p", "detalle__g", t("disponible") + it._cuando));
    }
    if (it.destacado === "tris" && P.diagramaTris) c.appendChild(P.diagramaTris());
    if (it.al && it.al.length) {
      var al = h("ul", "detalle__al");
      it.al.forEach(function (k) {
        if (!P.ICONOS[k]) return;
        var li = h("li"); li.appendChild(P.iconoSvg(k)); li.appendChild(document.createTextNode(I.alergeno(k, C))); al.appendChild(li);
      });
      c.appendChild(h("h3", "hoja__sub", t("alergenos"))); c.appendChild(al);
    }

    var motivo = motivoNoPedible(it, sec);
    var sinAbrir = !motivo && !aceptaAhora();
    if (motivo || sinAbrir || it.tipo === "salsa") {
      if (it.t) {
        var tb = h("div", "tam");
        it.t.forEach(function (x) { var d = h("div"); d.appendChild(h("span", null, I.tam(x[0]))); d.appendChild(P.precioEl(x[1])); tb.appendChild(d); });
        c.appendChild(tb);
      } else if (it.p != null) {
        var pr = h("div", "detalle__precio"); pr.appendChild(P.precioEl(it.p)); c.appendChild(pr);
      }
      if (it.tipo !== "salsa") c.appendChild(h("p", "detalle__aviso", motivo || (MODO === "mesa" ? t("cerradoMesa") : t("cerradoAviso"))));
      c.appendChild(boton(t("volver"), "btn-ped btn-ped--linea", cerrarHoja));
      abrirHoja(c, tx(it, "n"), "hoja--detalle"); botonCompartir(it);
      return;
    }

    var sel = { tam: it.t ? ((tamPre && it.t.some(function (x) { return x[0] === tamPre; })) ? tamPre : it.t[0][0]) : "", salsa: "", cant: 1, nota: "", ops: {}, mitad: "" };
    var err = h("p", "hoja__err"); err.setAttribute("role", "alert");
    var add;
    function precioUnit() {
      var base = it.t ? (it.t.filter(function (x) { return x[0] === sel.tam; })[0] || it.t[0])[1] : it.p;
      if (sel.mitad && productos[sel.mitad]) { var t2 = (productos[sel.mitad].t || []).filter(function (x) { return x[0] === sel.tam; })[0]; if (t2) base = Math.max(base, t2[1]); }
      var s = salsaPorId[sel.salsa];
      var extra = s ? s.extra : 0;
      gruposDe(it, sel.salsa).forEach(function (gid) {
        (sel.ops[gid] || []).forEach(function (nm) {
          var o = GRUPOS[gid].ops.filter(function (x) { return x.n === nm; })[0];
          if (o) extra += o.p;
        });
      });
      return base + extra;
    }
    function totalSel() {
      if (pres === "peso") return lineasPeso(it, sel.cuartos).reduce(function (a, l) { return a + l.unit * l.cant; }, 0);
      return precioUnit() * sel.cant;
    }
    function pintar() { add.textContent = t("agregar") + " · " + soles(totalSel()); err.textContent = ""; pintarPres(); }

    function bloqueGrupo(gid) {
      var g = GRUPOS[gid];
      // los adicionales de varias opciones (ej.: ingredientes extra) van plegados
      var plegable = g.tipo === "varias" && !g.req;
      var w = h(plegable ? "details" : "section", "grupo-op tarj" + (plegable ? " grupo-op--plegable" : ""));
      if (plegable) {
        var min = g.ops.reduce(function (m, o) { return o.p && (m == null || o.p < m) ? o.p : m; }, null);
        w.appendChild(h("summary", "hoja__sub", t("extrasOpc", { g: tx(g, "n").toLowerCase() }) + (min ? " · " + t("masPrecio") + Number(min).toFixed(2) : "")));
        if ((sel.ops[gid] || []).length) w.open = true;
      } else w.appendChild(h("h3", "hoja__sub", tx(g, "n")));
      w.appendChild(opcionesUI("g-" + gid, g.ops.map(function (o) {
        return { valor: o.n, texto: tx(o, "n"), extra: o.p ? t("masPrecio") + Number(o.p).toFixed(2) : "",
          marcado: (sel.ops[gid] || []).indexOf(o.n) >= 0 };
      }), g.tipo === "varias", function (v) { sel.ops[gid] = v; pintar(); }));
      return w;
    }

    var pres = modoPres(it, sec);
    /* tienda: elegir presentación (si hay 2) y la cantidad en paquetes o en kg */
    var tiendaP = !!(sec && sec.id === "tienda" && it.t && it.t.length && it.t.every(function (x) { return kgDe(x[0]) != null; }));
    if (tiendaP) { pres = ""; if (!tamPre) sel.tam = tamDefTienda(it); }
    var infoPres = h("p", "pres-info");
    function pintarPres() { infoPres.textContent = pres === "paq" ? paqTxt(sel.cant) : pres === "peso" ? t("pesoDesc", { a: fmtCuartos(sel.cuartos) + " kg", b: descPartes(sel.cuartos) }) : ""; }
    if (pres) {
      sel.tam = "1/2 kg"; sel.cuartos = 2;
      var tp = tarjeta(pres === "paq" ? t("tamano") : t("pesoTit"));
      var fila = h("div", "tam"), d1 = h("div");
      d1.appendChild(h("span", null, pres === "paq" ? t("paquete500") : t("porKilo")));
      d1.appendChild(P.precioEl(pres === "paq" ? precioDeTam(it, "1/2 kg") : precioKg(it)));
      fila.appendChild(d1); tp.appendChild(fila);
      if (pres === "peso") tp.appendChild(h("p", "hoja__ayuda", t("pesoNota")));
      tp.appendChild(infoPres);
      c.appendChild(tp);
    } else if (tiendaP) {
      if (it.t.length > 1) {
        var tpr = tarjeta(t("presentacion"));
        tpr.appendChild(segmentos("tam", it.t.map(function (x) { return { valor: x[0], texto: presTxt(x[0]), extra: soles(x[1]), marcado: x[0] === sel.tam }; }),
          function (v) { var kAnt = (kgDe(sel.tam) || 1) * sel.cant; sel.tam = v[0]; sel.cant = Math.max(1, Math.min(200, Math.round(kAnt / (kgDe(sel.tam) || 1)))); pintarCant(); pintar(); }));   // se mantiene el peso al cambiar de presentación
        c.appendChild(tpr);
      }
      var tc = tarjeta(t("cantidad")), qOut = h("output"), kgIn = h("input", "campo campo--kg"), qInfo = h("p", "pres-info");
      kgIn.type = "text"; kgIn.setAttribute("inputmode", "decimal"); kgIn.setAttribute("aria-label", t("pesoKg"));
      var fq = h("div", "cant-kg"), stq = h("div", "stepper");
      var qm = boton("−", "", function () { if (sel.cant > 1) { sel.cant--; pintarCant(); pintar(); } }), qp = boton("+", "", function () { if (sel.cant < 200) { sel.cant++; pintarCant(); pintar(); } });
      qm.setAttribute("aria-label", t("quitarUno")); qp.setAttribute("aria-label", t("agregarUno"));
      stq.appendChild(qm); stq.appendChild(qOut); stq.appendChild(qp);
      var lk = h("label", "kg-l"); lk.appendChild(kgIn); lk.appendChild(h("span", null, "kg"));
      fq.appendChild(stq); fq.appendChild(h("span", "cant-o", t("o"))); fq.appendChild(lk);
      kgIn.addEventListener("change", function () {
        var v = parseFloat(String(kgIn.value).replace(",", ".").replace(/[^\d.]/g, "")), k = kgDe(sel.tam) || 1;
        if (v > 0) { sel.cant = Math.max(1, Math.min(200, Math.round(v / k))); } pintarCant(); pintar();
      });
      kgIn.addEventListener("keydown", function (e) { if (e.key === "Enter") { e.preventDefault(); kgIn.blur(); } });
      tc.appendChild(fq); tc.appendChild(qInfo); c.appendChild(tc);
      var pintarCant = function () {
        var k = kgDe(sel.tam) || 0;
        qOut.textContent = String(sel.cant);
        if (document.activeElement !== kgIn) kgIn.value = fmtKg(sel.cant * k);
        qInfo.textContent = sel.cant + " × " + presTxt(sel.tam) + " = " + fmtKg(sel.cant * k) + " kg";
      };
      pintarCant();
    } else if (it.t) {
      var tt = tarjeta(t("tamano"));
      tt.appendChild(segmentos("tam", it.t.map(function (x) { return { valor: x[0], texto: I.tam(x[0]), extra: soles(x[1]), marcado: x[0] === sel.tam }; }),
        function (v) { sel.tam = v[0]; pintarMitad(); pintar(); }));
      c.appendChild(tt);
    }
    /* Mitad y mitad: pizzas Media y Famiglia pueden llevar 2 sabores; se cobra el precio del sabor más caro. */
    var zonaMitad = h("div");
    function pintarMitad() {
      zonaMitad.textContent = ""; zonaMitad.className = "";
      var puede = sec && sec.id === "pizze" && it.t && it.t.length > 1 && sel.tam !== it.t[0][0];
      if (!puede) { sel.mitad = ""; return; }
      var otras = [];
      sec.grupos.forEach(function (g) { g.items.forEach(function (o) {
        if (o.id === it.id || o.agotado || !o.t || o.tipo === "salsa" || !puedePedir(o, sec)) return;
        var tz = o.t.filter(function (x) { return x[0] === sel.tam; })[0]; if (tz) otras.push({ o: o, p: tz[1] });
      }); });
      if (!otras.length) { sel.mitad = ""; return; }
      if (!otras.some(function (x) { return x.o.id === sel.mitad; })) sel.mitad = "";
      var en = I.lang === "en";
      zonaMitad.className = "tarj";
      zonaMitad.appendChild(h("h3", "hoja__sub", en ? "Half & half" : "Mitad y mitad"));
      zonaMitad.appendChild(h("p", "hoja__ayuda", en ? "Pick a second flavour: you pay the price of the more expensive one." : "Elige un segundo sabor: se cobra el precio de la pizza más cara."));
      var lista = [{ valor: "", texto: en ? "One flavour only" : "Un solo sabor", extra: "", marcado: !sel.mitad }];
      otras.forEach(function (x) { lista.push({ valor: x.o.id, texto: tx(x.o, "n"), extra: soles(x.p), marcado: x.o.id === sel.mitad }); });
      zonaMitad.appendChild(opcionesUI("mitad", lista, false, function (v) { sel.mitad = v[0] || ""; pintar(); }));
    }
    c.appendChild(zonaMitad);
    pintarMitad();
    var zonaSalsa = h("div");
    if (it.salsa) {
      var ts = tarjeta(t("eligeSalsa"));
      if (/tris/.test(it.id)) ts.appendChild(h("p", "hoja__ayuda", t("salsaTris")));
      ts.appendChild(opcionesUI("salsa", salsas.map(function (s) {
        var sp = productos[s.id];
        return { valor: s.id, texto: sp ? tx(sp, "n") : s.n, extra: s.extra ? t("masPrecio") + Number(s.extra).toFixed(2) : "" };
      }), false, function (v) {
        // limpiar opciones de la salsa anterior
        Object.keys(sel.ops).forEach(function (g) { if ((it.op || []).indexOf(g) < 0) delete sel.ops[g]; });
        sel.salsa = v[0];
        zonaSalsa.textContent = "";
        var s = salsaPorId[sel.salsa];
        (s && s.op || []).forEach(function (gid) { if (GRUPOS[gid] && (it.op || []).indexOf(gid) < 0) zonaSalsa.appendChild(bloqueGrupo(gid)); });
        pintar();
      }));
      c.appendChild(ts);
      c.appendChild(zonaSalsa);
    }
    (it.op || []).forEach(function (gid) { if (GRUPOS[gid]) c.appendChild(bloqueGrupo(gid)); });

    if (MODO === "mesa") {   // pedir algo para llevar desde la mesa (ej.: una lasagna para casa, lista al irse)
      sel.llevar = !!(sec && sec.id === "tienda");
      c.appendChild(toggleLlevar(sel.llevar, function (v) { sel.llevar = v; }));
    }
    var tn = tarjeta(t("indicaciones"));
    var nota = h("input", "campo"); nota.type = "text"; nota.maxLength = 120; nota.placeholder = t("indicacionesPh");
    nota.addEventListener("input", function () { sel.nota = nota.value; });
    tn.appendChild(nota);
    c.appendChild(tn);
    c.appendChild(err);
    var pie = h("div", "hoja__pie");
    if (pres === "peso") pie.appendChild(stepper(2, 1, 40, function (v) { sel.cuartos = v; pintar(); }, fmtCuartos));
    else if (!tiendaP) pie.appendChild(stepper(1, 1, 20, function (v) { sel.cant = v; pintar(); }));
    add = boton("", "btn-ped", function () {
      if (it.salsa && !sel.salsa) { err.textContent = t("eligeSalsaErr"); return; }
      var falta = gruposDe(it, sel.salsa).filter(function (g) { return GRUPOS[g].req && !(sel.ops[g] || []).length; })[0];
      if (falta) { err.textContent = t("eligeAlgo", { g: tx(GRUPOS[falta], "n").toLowerCase() }); return; }
      if (pres === "peso") lineasPeso(it, sel.cuartos).forEach(function (x) { agregar(it, { tam: x.tam, salsa: "", cant: x.cant, nota: sel.nota, ops: {}, mitad: "", llevar: sel.llevar }, x.unit); });
      else agregar(it, sel, precioUnit());
      if (opts.reemplaza) quitarUnidad(opts.reemplaza);   // "llévate otro": el producto suelto se cambia por el pack de 2
      cerrarHoja();
      if (opts.volverCarrito) setTimeout(abrirCarrito, 80);
    });
    pie.appendChild(add);
    c.appendChild(pie);
    pintar();
    abrirHoja(c, tx(it, "n"), "hoja--detalle"); botonCompartir(it);
  }
  function toggleLlevar(on, alCambiar) {
    var l = h("label", "llevar-tg tarj");
    var i = h("input"); i.type = "checkbox"; i.checked = !!on; i.setAttribute("role", "switch");
    i.addEventListener("change", function () { alCambiar(i.checked); });
    var tx_ = h("span", "llevar-tg__t"); tx_.appendChild(h("b", null, t("paraLlevar"))); tx_.appendChild(h("small", null, t("paraLlevarSub")));
    l.appendChild(i); l.appendChild(h("span", "llevar-tg__ic", "🛍")); l.appendChild(tx_); l.appendChild(h("span", "llevar-tg__sw"));
    return l;
  }
  function quitarUnidad(key) {
    var i = -1; carrito.forEach(function (l, k) { if (l.key === key) i = k; });
    if (i < 0) return;
    if (carrito[i].cant > 1) carrito[i].cant--; else carrito.splice(i, 1);
    guardar(); pintarBarra();
  }

  function textoOpciones(it, sel, en) {
    var r = [];
    gruposDe(it, sel.salsa).forEach(function (gid) {
      var vals = sel.ops[gid] || []; if (!vals.length) return;
      var g = GRUPOS[gid];
      r.push((en ? tx(g, "n") : g.n) + ": " + vals.map(function (nm) {
        var o = g.ops.filter(function (x) { return x.n === nm; })[0];
        return (en && o ? tx(o, "n") : nm) + (o && o.p ? " (+" + soles(o.p) + ")" : "");
      }).join(", "));
    });
    return r;
  }

  function agregar(it, sel, unit) {
    if (MODO === "mesa" && sel.llevar == null && seccionDe[it.id] && seccionDe[it.id].id === "tienda") sel.llevar = true;
    var s = salsaPorId[sel.salsa];
    var ops = {};
    gruposDe(it, sel.salsa).forEach(function (g) { if ((sel.ops[g] || []).length) ops[g] = sel.ops[g].slice(); });
    var m2 = sel.mitad && productos[sel.mitad] ? productos[sel.mitad] : null;
    var opsTxt = textoOpciones(it, sel, true), opsEs = textoOpciones(it, sel, false);
    var key = [it.id, sel.tam, sel.salsa, JSON.stringify(ops), sel.nota, m2 ? m2.id : "", sel.llevar ? "L" : ""].join("|");
    var ex = carrito.filter(function (l) { return l.key === key; })[0];
    if (ex) ex.cant = Math.min(20, ex.cant + sel.cant);
    else carrito.push({ key: key, id: it.id, n: tx(it, "n") + (m2 ? t("con") + tx(m2, "n") : ""), nEs: it.n + (m2 ? " con " + m2.n : ""), tam: sel.tam, salsa: sel.salsa, llevar: !!sel.llevar,
      salsaN: s ? (productos[s.id] ? tx(productos[s.id], "n") : s.n) : "", salsaEs: s ? s.n : "",
      ops: ops, mitad: m2 ? m2.id : "", opsTxt: opsTxt, opsEs: opsEs,
      unit: unit, cant: sel.cant, nota: (sel.nota || "").trim(), alcohol: !!(seccionDe[it.id] && seccionDe[it.id].alcohol) });
    guardar(); pintarBarra(true);
    if (window.PG_ANALITICA) PG_ANALITICA.ev("agregar", it.id, seccionDe[it.id] ? seccionDe[it.id].id : "");
    var avH = window.PG_COMERCIO && PG_COMERCIO.aviso ? PG_COMERCIO.aviso(it, seccionDe[it.id]) : "";
    aviso(avH ? t("hrAgregado", { n: tx(it, "n"), a: avH }) : t("agregado", { n: tx(it, "n") }));
  }

  function clicAgregar(it, sec, tam) {
    if (!aceptaAhora()) { aviso(MODO === "mesa" ? t("cerradoMesa") : t("cerradoAviso")); return; }
    /* tarjeta con selector de tamaño (tienda: 1 kg / 1/2 kg / 1/4 kg): si solo falta el tamaño se agrega directo */
    var tt = tam && it.t ? it.t.filter(function (x) { return x[0] === tam; })[0] : null;
    if (tt && !it.salsa && !(it.op && it.op.length)) { agregar(it, { tam: tt[0], salsa: "", cant: 1, nota: "", ops: {} }, tt[1]); return; }
    if (tieneOpciones(it)) abrirDetalle(it, sec, tt ? tt[0] : "");
    else agregar(it, { tam: "", salsa: "", cant: 1, nota: "", ops: {} }, it.p);
  }

  /* ---------- aviso flotante ---------- */
  var toast, toastT;
  function aviso(txt) {
    toast.textContent = txt; toast.classList.add("on");
    clearTimeout(toastT); toastT = setTimeout(function () { toast.classList.remove("on"); }, txt.length > 60 ? 4200 : 2200);
  }

  /* ---------- barra del carrito ---------- */
  function pintarBarra(animar) {
    var n = unidades();
    barra.classList.toggle("on", n > 0);
    document.body.classList.toggle("con-carrito", n > 0);
    barraTxt.textContent = MODO === "mesa" ? t("verPedidoMesa", { n: n }) : t("verPedido") + n;
    barraTot.textContent = soles(total());
    pintarRepetir();
    if (animar) { barra.classList.remove("pulso"); void barra.offsetWidth; barra.classList.add("pulso"); }
  }

  /* ---------- carrito y formulario ---------- */
  var form = {}, refrescarResumen = null, pintarLlevarForm = null;
  function miniatura(it, cls) {
    var fw = h("span", cls + "__fw");
    var im = h("img", cls + "__img"); im.alt = ""; im.loading = "lazy";
    var vacia = function () { im.onerror = null; im.src = "gallo-oro.png"; im.className = cls + "__img " + cls + "__img--vacia"; };
    if (it && it.foto) { im.src = it.foto; im.onerror = vacia; } else vacia();
    fw.appendChild(im);
    return fw;
  }

  /* Resumen compacto con foto de lo ya enviado (pantallas de "pedido recibido"): misma miniatura del carrito. */
  function listaEnviada(items) {
    var ul = h("ul", "enviado");
    (items || []).forEach(function (l) {
      var li = h("li", "enviado__li");
      li.appendChild(miniatura(productos[l.id], "enviado"));
      var tt = h("span", "enviado__t", l.cant + " × " + nombreLinea(l));
      li.appendChild(tt); ul.appendChild(li);
    });
    return ul;
  }

  /* "Llévate otro": un producto suelto cuyo pack de 2 (ej.: "Wafer Tre Marie × 2") cuesta menos que dos sueltos.
     Se detecta con los datos de la carta: pack.pa (precio de antes) = 2 × precio del suelto, y pack.p es el precio real del pack.
     El precio de la segunda unidad = pack.p − suelto.p. Sin ese descuento no se muestra nada. */
  var PAREJAS = {};
  Object.keys(productos).forEach(function (pid) {
    var pk = productos[pid];
    if (pk.tipo === "salsa" || pk.t || pk.p == null || !(pk.pa > pk.p)) return;
    Object.keys(productos).forEach(function (sid) {
      var u = productos[sid];
      if (sid === pid || u.tipo === "salsa" || u.t || u.p == null || seccionDe[sid] !== seccionDe[pid]) return;
      if (Math.abs(pk.pa - 2 * u.p) < 0.015 && pk.p > u.p && pk.p < 2 * u.p && !PAREJAS[sid]) PAREJAS[sid] = pid;
    });
  });
  function ofertasOtro() {
    var r = [], vistos = {};
    carrito.forEach(function (l) {
      var pid = PAREJAS[l.id]; if (!pid || l.cant !== 1 || vistos[pid]) return;
      var u = productos[l.id], pk = productos[pid], sec = seccionDe[pid];
      if (!u || !pk || !puedePedir(pk, sec) || (window.PG_COMERCIO && PG_COMERCIO.fuera && PG_COMERCIO.fuera(pk, sec))) return;
      if (carrito.some(function (x) { return x.id === pid; })) return;
      vistos[pid] = 1;
      r.push({ linea: l, pack: pk, sec: sec, x: Math.round((pk.p - u.p) * 100) / 100, antes: pk.pa });
    });
    return r.slice(0, 2);
  }
  function aceptarOtro(o) {
    cerrarHoja();
    if (tieneOpciones(o.pack)) { setTimeout(function () { abrirDetalle(o.pack, o.sec, "", { reemplaza: o.linea.key, volverCarrito: true }); }, 80); return; }
    agregar(o.pack, { tam: "", salsa: "", cant: 1, nota: "", ops: {} }, o.pack.p);
    quitarUnidad(o.linea.key);
    setTimeout(abrirCarrito, 80);
  }

  /* ---------- carrito: hoja inferior con foto, resumen por líneas, extras y botón fijo ---------- */
  function abrirCarrito() {
    var c = h("div", "hoja__cuerpo carrito");
    if (!carrito.length) { c.appendChild(h("p", "hoja__desc", t("vacio"))); abrirHoja(c, t("tuPedido")); return; }
    var lista = h("ul", "lineas");
    var ofertas = h("div", "otros");
    function pintarOfertas() {
      ofertas.textContent = "";
      ofertasOtro().forEach(function (o) {
        var card = h("div", "otro");
        card.appendChild(miniatura(o.pack, "otro"));
        var tx_ = h("div", "otro__t");
        tx_.appendChild(h("strong", null, t("llevateOtro", { x: dinero2(o.x) })));
        tx_.appendChild(h("span", null, t("llevateOtroSub", { n: tx(o.pack, "n"), p: dinero2(o.pack.p), a: dinero2(o.antes) })));
        card.appendChild(tx_);
        card.appendChild(boton(t("agregarMas"), "otro__b", function () { aceptarOtro(o); }));
        ofertas.appendChild(card);
      });
    }
    function pintarLista() {
      lista.textContent = "";
      var vistosPeso = {};
      carrito.forEach(function (l, i) {
        var grp = grupoPeso(l);
        if (grp) { if (vistosPeso[grp]) return; vistosPeso[grp] = 1; }
        var ls = grp ? carrito.filter(function (x) { return grupoPeso(x) === grp; }) : [l];
        var li = h("li", "linea");
        li.appendChild(miniatura(productos[l.id], "linea"));
        var info = h("div", "linea__info");
        info.appendChild(h("strong", null, nombreCarrito(l, grp ? ls : null)));
        if (l.salsaN) info.appendChild(h("span", null, t("salsa") + l.salsaN));
        (l.opsTxt || []).forEach(function (o) { info.appendChild(h("span", null, o)); });
        if (l.nota) info.appendChild(h("span", null, t("nota") + l.nota));
        if (MODO === "mesa") {
          var lc = boton("🛍 " + t("paraLlevar"), "llevar-chip" + (l.llevar ? " on" : ""), function () {
            ls.slice().forEach(function (l) {
              l.llevar = !l.llevar; l.key = l.key.replace(/\|L?$/, "|" + (l.llevar ? "L" : ""));
              var otra = carrito.filter(function (x) { return x !== l && x.key === l.key; })[0];
              if (otra) { otra.cant = Math.min(20, otra.cant + l.cant); carrito.splice(carrito.indexOf(l), 1); }
            });
            guardar(); pintarLista(); if (pintarLlevarForm) pintarLlevarForm();
          });
          lc.setAttribute("aria-pressed", l.llevar ? "true" : "false");
          info.appendChild(lc);
        }
        var avL = window.PG_COMERCIO && PG_COMERCIO.aviso && productos[l.id] ? PG_COMERCIO.aviso(productos[l.id], seccionDe[l.id]) : "";
        if (avL) info.appendChild(h("span", "hr-aviso hr-aviso--linea", avL));
        li.appendChild(info);
        var acc = h("div", "linea__acc");
        acc.appendChild(h("span", "linea__p", soles(ls.reduce(function (a, x) { return a + x.unit * x.cant; }, 0))));
        var alCambiarLinea = function () { guardar(); pintarBarra(); if (!carrito.length) { cerrarHoja(); return; } pintarLista(); pintarOfertas(); if (refrescarResumen) refrescarResumen(); };
        if (grp) acc.appendChild(stepper(cuartosDe(ls), 0, 40, function (v) { fijarCuartos(ls, v); alCambiarLinea(); }, fmtCuartos));
        else acc.appendChild(stepper(l.cant, 0, 20, function (v) {
          if (v === 0) carrito.splice(i, 1); else l.cant = v;
          alCambiarLinea();
        }));
        li.appendChild(acc);
        lista.appendChild(li);
      });
    }
    c.appendChild(lista);
    pintarLista(); pintarOfertas();
    c.appendChild(ofertas);
    var sug = MODO === "mesa" ? sugerenciasMesa() : sugerencias();
    if (sug.length) {
      var sw = h("div", "sugiere");
      sw.appendChild(h("h3", "hoja__sub", MODO === "mesa" ? t("sugiereMesa") : t("sugiereTit")));
      if (MODO === "mesa") sw.appendChild(h("p", "sugiere__ayuda", t("sugiereMesaSub")));
      var fila = h("div", "sugiere__fila");
      sug.forEach(function (x) {
        var b = h("button", "sugiere__it"); b.type = "button";
        var fw = miniatura(x.it, "sugiere");
        fw.appendChild(h("span", "sugiere__mas", "+"));
        b.appendChild(fw);
        b.appendChild(h("span", "sugiere__n", tx(x.it, "n")));
        b.appendChild(h("span", "sugiere__p", x.it.t ? (I.lang === "en" ? "from " : "desde ") + soles(x.it.t[0][1]) : soles(x.it.p)));
        b.addEventListener("click", function () {
          if (tieneOpciones(x.it)) { cerrarHoja(); setTimeout(function () { abrirDetalle(x.it, x.sec, "", { volverCarrito: true }); }, 80); return; }
          agregar(x.it, { tam: "", salsa: "", cant: 1, nota: "", ops: {} }, x.it.p);
          if (MODO === "mesa") {   // mesa: un toque, sin cerrar la hoja; se repinta en el mismo lugar
            var y = hoja.scrollTop; abrirCarrito(); hoja.classList.add("rehecha"); hoja.scrollTop = y; aviso(t("agregadoX", { n: tx(x.it, "n") })); return;
          }
          cerrarHoja(); setTimeout(abrirCarrito, 80);
        });
        fila.appendChild(b);
      });
      sw.appendChild(fila);
      c.appendChild(sw);
    }
    if (window.PG_ANALITICA) PG_ANALITICA.ev("checkout", "", MODO);
    formulario(c);   // agrega el formulario y, al final, el resumen (subtotal, delivery, total) con el botón fijo abajo
    abrirHoja(c, MODO === "mesa" ? t("pedidoMesa") + MESA : t("tuPedido"), "hoja--carrito");
  }
  /* "Americana con Hawaiana · Mediana" (tamaño con su nombre para el cliente) */
  /* Reescribe las líneas de un producto por peso para que sumen q cuartos de kilo (máximo de 1/2 kg + resto en 1/4 kg). */
  function fijarCuartos(ls, q) {
    var base = ls[0], it = productos[base.id], p = partesCuartos(q);
    function poner(tam, cant) {
      var ex = ls.filter(function (x) { return x.tam === tam; })[0];
      if (ex) { if (cant > 0) ex.cant = cant; else carrito.splice(carrito.indexOf(ex), 1); return; }
      if (cant <= 0) return;
      var k = base.key.split("|"); k[1] = tam;
      var nl = {}; Object.keys(base).forEach(function (x) { nl[x] = base[x]; });
      nl.tam = tam; nl.cant = cant; nl.key = k.join("|"); nl.unit = precioDeTam(it, tam);
      carrito.splice(carrito.indexOf(base) + 1, 0, nl);
    }
    poner("1/2 kg", p.m); poner("1/4 kg", p.c);
  }
  /* Nombre de la línea del carrito: paquetes "Ravioli · 7 × 500 g (3,5 kg)"; peso "Salsa · 1¼ kg (2 × ½ + 1 × ¼)" */
  function nombreCarrito(l, ls) {
    if (ls) return (l.n || "") + " · " + fmtCuartos(cuartosDe(ls)) + " kg (" + descPartes(cuartosDe(ls)) + ")";
    if (modoPres(productos[l.id]) === "paq" && l.tam === "1/2 kg") return (l.n || "") + " · " + l.cant + " × 500 g (" + fmtKg(l.cant * 0.5) + " kg)";
    return nombreLinea(l);
  }
  function nombreLinea(l) {
    var n = l.n || "";
    if (l.mitad && productos[l.mitad] && productos[l.id] && n.indexOf(t("con").trim()) < 0) n = tx(productos[l.id], "n") + t("con") + tx(productos[l.mitad], "n");
    if (l.tam === "1/2 kg" && modoPres(productos[l.id]) === "paq") return n + " · 500 g";
    return n + (l.tam ? " · " + I.tam(l.tam) : "");
  }
  function dinero2(n) { n = Math.round(Number(n) * 100) / 100; return Number.isInteger(n) ? String(n) : n.toFixed(2); }

  /* "¿Le sumas algo?": bebida, postre o pan al ajo, solo si aún no están en el pedido y se pueden pedir ahora. */
  function sugerencias() {
    var enCarrito = function (pred) { return carrito.some(function (l) { var s = seccionDe[l.id]; return pred(l, s); }); };
    var pedible = function (id) { var it = productos[id], sec = seccionDe[id]; return it && sec && puedePedir(it, sec) && !(window.PG_COMERCIO && PG_COMERCIO.fuera && PG_COMERCIO.fuera(it, sec)) ? { it: it, sec: sec } : null; };
    var primeroDe = function (secId, ids) {
      for (var i = 0; i < ids.length; i++) { var x = pedible(ids[i]); if (x) return x; }
      var sec = C.secciones.filter(function (s) { return s.id === secId; })[0]; if (!sec) return null;
      for (var g = 0; g < sec.grupos.length; g++) for (var j = 0; j < sec.grupos[g].items.length; j++) {
        var y = pedible(sec.grupos[g].items[j].id); if (y && !tieneOpciones(y.it)) return y;
      }
      return null;
    };
    var r = [];
    var conPlato = enCarrito(function (l, s) { return s && (s.id === "pizze" || s.id === "pasta" || s.id === "lasagne" || s.id === "promociones"); });
    if (conPlato && !enCarrito(function (l) { return /pane-allaglio/.test(l.id); })) { var pa = pedible("antipasti-pane-allaglio"); if (pa) r.push(pa); }
    if (!enCarrito(function (l, s) { return s && (s.id === "caffe" || s.id === "caffetteria" || s.id === "aperitivi" || s.id === "vini") || /promociones/.test(l.id); })) {
      var be = primeroDe("caffe", ["caffe-bibita-gassata", "caffe-limonata", "caffe-maracuya"]); if (be) r.push(be);
    }
    if (!enCarrito(function (l, s) { return s && s.id === "dolci"; })) { var po = primeroDe("dolci", ["dolci-tiramisu"]); if (po) r.push(po); }
    return r.slice(0, 3);
  }

  /* Mesa: "¿Algo para tomar?" — hasta 4 bebidas y postres que aún no están en el pedido (primero los que se agregan de un toque). */
  function sugerenciasMesa() {
    var ya = {}; carrito.forEach(function (l) { ya[l.id] = 1; });
    var tieneDe = function (ids) { return carrito.some(function (l) { var s = seccionDe[l.id]; return s && ids.indexOf(s.id) >= 0; }); };
    var de = function (secIds, pref) {
      var r = [];
      var ok = function (id) {
        var it = productos[id], sec = seccionDe[id];
        if (!it || !sec || ya[id] || it.tipo === "salsa" || !puedePedir(it, sec)) return;
        if (window.PG_COMERCIO && PG_COMERCIO.fuera && PG_COMERCIO.fuera(it, sec)) return;
        if (r.some(function (x) { return x.it.id === id; })) return;
        r.push({ it: it, sec: sec });
      };
      pref.forEach(ok);
      C.secciones.forEach(function (s) { if (secIds.indexOf(s.id) >= 0) s.grupos.forEach(function (g) { g.items.forEach(function (i) { ok(i.id); }); }); });
      return r.sort(function (a, b) { return (tieneOpciones(a.it) ? 1 : 0) - (tieneOpciones(b.it) ? 1 : 0); });
    };
    var beb = tieneDe(["caffe", "aperitivi", "vini"]) ? [] : de(["caffe"], ["caffe-limonata", "caffe-maracuya", "caffe-bibita-gassata", "caffe-acqua"]);
    var pos = tieneDe(["dolci"]) ? [] : de(["dolci"], ["dolci-tiramisu"]);
    var r = beb.slice(0, 2).concat(pos.slice(0, 2));
    if (r.length < 4) r = r.concat(beb.slice(2, 2 + 4 - r.length));
    if (r.length < 4) r = r.concat(pos.slice(2, 2 + 4 - r.length));
    return r.slice(0, 4);
  }

  function campo(nombre, etiqueta, tipo, opc) {
    opc = opc || {};
    var w = h("label", "campo-w");
    w.appendChild(h("span", "campo-l", etiqueta));
    var i = tipo === "area" ? h("textarea", "campo") : h("input", "campo");
    if (tipo !== "area") i.type = tipo || "text";
    i.name = nombre; i.value = form[nombre] || ""; i.maxLength = opc.max || 120;
    if (opc.ph) i.placeholder = opc.ph;
    if (opc.auto) i.autocomplete = opc.auto;
    if (opc.modo) i.inputMode = opc.modo;
    i.addEventListener("input", function () { form[nombre] = i.value; });
    w.appendChild(i);
    return w;
  }

  function formulario(cont) {
    var f = h("form", "form"); f.noValidate = true; f.id = "form-pedido";
    var hp = h("input", "trampa"); hp.name = "web"; hp.tabIndex = -1; hp.autocomplete = "off"; hp.setAttribute("aria-hidden", "true");
    f.appendChild(hp);
    var zona = h("div"), cajaCobro = null;
    var pie = h("div", "pie-fijo");
    var resumen = h("div", "resumen"); resumen.setAttribute("aria-live", "polite");
    refrescarResumen = null;
    if (MODO === "mesa") {
      var zLlevar = h("div");
      pintarLlevarForm = function () {
        zLlevar.textContent = "";
        if (!carrito.some(function (l) { return l.llevar; })) { form.llevarHora = ""; return; }
        var w = h("label", "campo-w llevar-hora");
        w.appendChild(h("span", "campo-l", "🛍 " + t("llevarCuando")));
        var sl = h("select", "campo"); sl.name = "llevarHora";
        var ops = [{ v: "", x: t("llevarAlIrnos") }];
        var ah = P.ahoraLugar(new Date()), r = (C.horario.dias || {})[ah.dia];
        if (r) { var fin = P.minutos(r[1]); if (fin <= P.minutos(r[0])) fin += 1440; for (var m = Math.ceil((ah.min + 30) / 15) * 15; m <= fin; m += 15) ops.push({ v: hhmm(m), x: t("llevarHora", { h: hhmm(m) }) }); }
        if (!ops.some(function (o) { return o.v === form.llevarHora; })) form.llevarHora = "";
        ops.forEach(function (o) { var op = h("option", null, o.x); op.value = o.v; if (o.v === form.llevarHora) op.selected = true; sl.appendChild(op); });
        sl.addEventListener("change", function () { form.llevarHora = sl.value; });
        w.appendChild(sl); zLlevar.appendChild(w);
      };
      f.appendChild(zLlevar); pintarLlevarForm();
      f.appendChild(campo("nombre", t("aNombre"), "text", { max: 60, auto: "given-name" }));
      f.appendChild(campo("notas", t("comentCocina"), "area", { max: 300 }));
      // En la mesa el pago y el comprobante se piden al final, con "Pedir la cuenta"
      form.comprobante = "";
    } else if (esBarra()) {
      /* Barra: solo nombre y celular; el pago se muestra pero no es obligatorio (ni viene marcado) */
      form.canal = "recojo"; form.programado = ""; form.programadoFecha = ""; form.programadoTxt = "";
      f.appendChild(h("h3", "hoja__sub", t("tusDatos")));
      f.appendChild(campo("nombre", t("nombre"), "text", { max: 60, auto: "name" }));
      f.appendChild(campo("telefono", t("celular"), "tel", { max: 16, auto: "tel", modo: "tel", ph: "9XX XXX XXX" }));
      var metB = metodosBarra();
      if (metB.indexOf(form.pago) < 0) form.pago = "";
      if (metB.length) {
        f.appendChild(h("h3", "hoja__sub", t("comoPagar")));
        cajaCobro = h("div");
        f.appendChild(opcionesOpc("pago", metB.map(function (m) { return { valor: m, texto: m, marcado: form.pago === m }; }), function (v) { form.pago = v; pintarCobro(cajaCobro, form.pago, true); }));
        f.appendChild(cajaCobro);
        pintarCobro(cajaCobro, form.pago, true);
      }
      if (carrito.some(function (l) { return l.alcohol; })) {
        var lbB = h("label", "check");
        var ckB = h("input"); ckB.type = "checkbox"; ckB.checked = !!form.mayorEdad;
        ckB.addEventListener("change", function () { form.mayorEdad = ckB.checked; });
        lbB.appendChild(ckB); lbB.appendChild(h("span", null, t("mayor")));
        f.appendChild(lbB);
      }
    } else {
      if (!form.canal || !CFG.recojo) form.canal = "delivery";
      if (CFG.recojo) {
        f.appendChild(h("h3", "hoja__sub", t("comoLoQuieres")));
        f.appendChild(opcionesUI("canal", [
          { valor: "delivery", texto: t("delivery"), marcado: form.canal === "delivery" },
          { valor: "recojo", texto: t("recojo"), marcado: form.canal === "recojo" }
        ], false, function (v) { form.canal = v[0]; pintarZona(); pintarResumen(); }));
      }
      f.appendChild(h("h3", "hoja__sub", t("entregaTit")));
      f.appendChild(zona);
      f.appendChild(h("h3", "hoja__sub", t("tusDatos")));
      f.appendChild(campo("nombre", t("nombre"), "text", { max: 60, auto: "name" }));
      f.appendChild(campo("telefono", t("celular"), "tel", { max: 16, auto: "tel", modo: "tel", ph: "9XX XXX XXX" }));
      if (CFG.metodosPago && CFG.metodosPago.length) {
        var pagoObl = CFG.pagoObligatorio === true;   // por defecto el pago es opcional (Config pago_obligatorio)
        f.appendChild(h("h3", "hoja__sub", t("comoPagar")));
        if (CFG.metodosPago.indexOf(form.pago) < 0) form.pago = "";
        cajaCobro = h("div");
        var lisPago = CFG.metodosPago.map(function (m) { return { valor: m, texto: m, marcado: form.pago === m }; });
        var alPago = function (v) { form.pago = Array.isArray(v) ? v[0] : v; pintarCobro(cajaCobro, form.pago, true); };
        f.appendChild(pagoObl ? opcionesUI("pago", lisPago, false, alPago) : opcionesOpc("pago", lisPago, alPago));
        f.appendChild(cajaCobro);
        pintarCobro(cajaCobro, form.pago, true);
      }
      var vent = ventanaPedido();
      if (vent) {
        /* Dentro de horario: dos opciones, "Lo antes posible" o "Programar para más tarde" (y solo entonces el selector de hora,
           que NUNCA incluye "lo antes posible"). Fuera de horario: solo el selector de hora. */
        var abiertoYa = abiertoAhora();
        var horas = [{ valor: "", texto: t("eligeHora") }];
        for (var mm = vent.desde; mm <= vent.hasta; mm += (vent.paso || 15)) horas.push({ valor: hhmm(mm), texto: vent.etiqueta + " · " + fmtHora(mm) });
        if (window.PG_COMERCIO) horas = PG_COMERCIO.filtrarHoras(horas, vent);   // comercio: quita las franjas sin cupo
        if (form.programado && !horas.some(function (x) { return x.valor === form.programado; })) form.programado = "";
        form.programadoFecha = form.programado ? (vent.fecha || "") : "";
        var wh = h("label", "campo-w");
        wh.appendChild(h("span", "campo-l", t("paraHoraReq")));
        var sh = h("select", "campo"); sh.name = "programado"; sh.setAttribute("aria-label", t("paraHoraReq"));
        horas.forEach(function (x) { var o = h("option", null, x.texto); o.value = x.valor; if (!x.valor) { o.disabled = true; } if (x.valor === (form.programado || "")) o.selected = true; sh.appendChild(o); });
        sh.addEventListener("change", function () {
          form.programado = sh.value; form.programadoFecha = sh.value ? (vent.fecha || "") : "";
          form.programadoTxt = sh.value ? sh.options[sh.selectedIndex].text : "";
        });
        wh.appendChild(sh);
        if (abiertoYa) {
          if (form.cuando !== "prog") form.cuando = "ya";
          f.appendChild(h("h3", "hoja__sub", t("cuandoTit")));
          var wProg = h("div", "prog__cuerpo");
          var espTxt = function () { var c = window.PG_CARGA, m = c && c.espera ? Math.round(Number(c.espera[form.canal === "recojo" ? "recojo" : "delivery"])) : 0; return m > 0 ? " (~" + m + " min)" : ""; };
          var opsCuando = opcionesUI("cuando", [
            { valor: "ya", texto: t("loAntes") + espTxt(), marcado: form.cuando !== "prog" },
            { valor: "prog", texto: t("programarTit"), marcado: form.cuando === "prog" }
          ], false, function (v) {
            form.cuando = v[0];
            wProg.hidden = form.cuando !== "prog";
            if (form.cuando !== "prog") { sh.value = ""; form.programado = ""; form.programadoFecha = ""; form.programadoTxt = ""; }
            else if (!form.programado) { try { sh.focus({ preventScroll: true }); } catch (x) {} }
          });
          opsCuando.className += " cuando";
          f.appendChild(opsCuando);
          wProg.appendChild(wh); wProg.hidden = form.cuando !== "prog";
          f.appendChild(wProg);
        } else { form.cuando = "prog"; f.appendChild(wh); }
      }
      f.appendChild(campo("notas", t("comentarios"), "area", { max: 300 }));
      f.appendChild(bloqueComprobante());
      if (carrito.some(function (l) { return l.alcohol; })) {
        var lb = h("label", "check");
        var ck = h("input"); ck.type = "checkbox"; ck.checked = !!form.mayorEdad;
        ck.addEventListener("change", function () { form.mayorEdad = ck.checked; });
        lb.appendChild(ck); lb.appendChild(h("span", null, t("mayor")));
        f.appendChild(lb);
      }
    }
    function bloqueComprobante() {
      var w = h("div", "comp");
      var tipos = (CFG.comprobantes || []).filter(function (x) { return x === "Boleta" || x === "Factura"; });
      if (!tipos.length) return w;
      var datos = h("div");
      w.appendChild(h("h3", "hoja__sub", t("comprobante")));
      // Boleta y Factura sin ninguna marcada = sin comprobante
      w.appendChild(opcionesOpc("comp", tipos.map(function (x) {
        return { valor: x, texto: t(x === "Boleta" ? "boleta" : "factura"), marcado: form.comprobante === x };
      }), function (v) { form.comprobante = v; pintarDatos(); }));
      w.appendChild(datos);
      function pintarDatos() {
        datos.textContent = "";
        if (!form.comprobante) return;
        var fac = form.comprobante === "Factura";
        datos.appendChild(campo("doc", fac ? t("docFactura") : t("docBoleta"), "text", { max: 11, modo: "numeric", ph: fac ? "20XXXXXXXXX" : "" }));
        datos.appendChild(campo("razon", fac ? t("razonFactura") : t("razonBoleta"), "text", { max: 120, auto: fac ? "organization" : "name" }));
        datos.appendChild(campo("correo", t("correo"), "email", { max: 120, auto: "email" }));
        if (MODO === "mesa") datos.appendChild(campo("telefono", t("whatsappComp"), "tel", { max: 16, auto: "tel", modo: "tel", ph: "9XX XXX XXX" }));
      }
      pintarDatos();
      return w;
    }
    function pintarZona() {
      zona.textContent = "";
      if (MODO === "mesa" || form.canal !== "delivery") {
        if (form.canal === "recojo" && !esBarra()) zona.appendChild(h("p", "hoja__ayuda", t("recogeEn") + C.negocio.direccion + "."));
        return;
      }
      /* Entrega automática: el cliente da su ubicación (GPS o dirección buscada en el mapa) y el costo se calcula solo. */
      var ub = h("div", "ubic");
      var ubEst = h("p", "ubic__estado"); ubEst.setAttribute("aria-live", "polite");
      function estadoUbic(msg, mal) {
        if (msg) { ubEst.textContent = msg; ubEst.className = "ubic__estado" + (mal ? " ubic__estado--mal" : ""); return; }
        if (form.lat != null) { ubEst.textContent = t("ubicEncontrada"); ubEst.className = "ubic__estado ubic__estado--ok"; }
        else { ubEst.textContent = ""; ubEst.className = "ubic__estado"; }
      }
      function fijar(lat, lng, origen) {
        form.lat = Math.round(lat * 1e6) / 1e6; form.lng = Math.round(lng * 1e6) / 1e6;
        form.ubicacion = "https://maps.google.com/?q=" + form.lat.toFixed(6) + "," + form.lng.toFixed(6);
        form.ubicOrigen = origen; form.zona = "";
        estadoUbic(); pintarResumen(); if (typeof err !== "undefined" && err) err.textContent = "";
      }
      var ubGps = null;
      if (navigator.geolocation) {
        ubGps = boton("📍 " + t("ubicBtn"), "btn-ubic btn-ubic--main", function () {
          ubGps.disabled = true; estadoUbic(t("ubicBuscando"));
          navigator.geolocation.getCurrentPosition(function (pos) {   // solo con permiso del cliente
            ubGps.disabled = false; fijar(pos.coords.latitude, pos.coords.longitude, "gps");
            ubGps.textContent = "📍 " + t("ubicOtra");
          }, function () {
            ubGps.disabled = false; estadoUbic(t("ubicError"), true);
          }, { enableHighAccuracy: true, timeout: 15000, maximumAge: 60000 });
        });
        if (form.lat != null) ubGps.textContent = "📍 " + t("ubicOtra");
        ub.appendChild(ubGps);
      }
      zona.appendChild(ub);
      var wd = campo("direccion", t("direccion") + " *", "text", { max: 200, auto: "street-address" });
      wd.querySelector("input").addEventListener("input", function () {
        if (form.ubicOrigen === "osm") { form.lat = null; form.lng = null; form.ubicacion = ""; form.ubicOrigen = ""; estadoUbic(); pintarResumen(); }   // la dirección cambió: hay que volver a buscarla
      });
      zona.appendChild(wd);
      var mp = h("div", "ubic ubic--mapa");
      var bMapa = boton("🔎 " + t("buscarMapa"), "btn-ubic", function () {
        var dir = String(form.direccion || "").trim();
        if (dir.length < 5) { estadoUbic(t("mapaCorta"), true); return; }
        bMapa.disabled = true; estadoUbic(t("buscandoMapa"));
        /* Nominatim/OpenStreetMap: viewbox de Trujillo (Perú). Si el número exacto no está en el mapa, se reintenta solo con la calle. */
        var sufijo = /trujillo/i.test(dir) ? "" : ", Trujillo, Perú", sinNum = dir.replace(/\b(n[°ºo.]*\s*)?\d+[a-zA-Z]?\b/gi, " ").replace(/\s{2,}/g, " ").trim();
        var consultas = [dir + sufijo]; if (sinNum.length >= 4 && sinNum !== dir) consultas.push(sinNum + sufijo);
        var buscar = function (i) {
          var url = "https://nominatim.openstreetmap.org/search?format=json&limit=1&countrycodes=pe&accept-language=es&viewbox=-79.20,-7.95,-78.90,-8.25&q=" + encodeURIComponent(consultas[i]);
          return fetch(url).then(function (r) { if (!r.ok) throw new Error("http"); return r.json(); }).then(function (arr) {
            var r0 = arr && arr[0], la = r0 ? parseFloat(r0.lat) : NaN, lo = r0 ? parseFloat(r0.lon) : NaN;
            if (isFinite(la) && isFinite(lo)) return { la: la, lo: lo };
            return i + 1 < consultas.length ? buscar(i + 1) : null;
          });
        };
        buscar(0).then(function (r) {
          bMapa.disabled = false;
          if (!r) { form.lat = null; form.lng = null; form.ubicacion = ""; form.ubicOrigen = ""; estadoUbic(t("mapaNo"), true); pintarResumen(); return; }
          fijar(r.la, r.lo, "osm");
        }).catch(function () { bMapa.disabled = false; estadoUbic(t("mapaRed"), true); });
      });
      mp.appendChild(bMapa);
      zona.appendChild(mp);
      zona.appendChild(ubEst);
      estadoUbic();
      zona.appendChild(campo("referencia", t("referencia") + " *", "text", { max: 200, ph: t("referenciaPh") }));
    }
    /* Resumen fijo abajo: subtotal, delivery y total (el delivery se calcula solo con la ubicación) */
    function pintarResumen() {
      resumen.textContent = "";
      var cobro = cajaCobro;
      if (cobro) pintarCobro(cajaCobro, form.pago, true);
      var e = entregaActual();
      var fila = function (a, b, cls) { var d = h("div", cls); d.appendChild(h("span", null, a)); d.appendChild(h("span", null, b)); resumen.appendChild(d); };
      if (!e) { fila(t("total"), soles(total()), "resumen__t"); return; }
      fila(t("subtotal"), soles(total()));
      if (e.ok) {
        fila(t("entrega"), "S/ " + e.costo);
        fila(t("total"), soles(total() + e.costo), "resumen__t");
      } else if (e.fuera) {
        fila(t("entrega"), "—"); fila(t("total"), soles(total()), "resumen__t");
        resumen.appendChild(h("p", "hoja__err", t("fueraZona")));
      } else {
        fila(t("entrega"), "—"); fila(t("total"), soles(total()), "resumen__t");
        resumen.appendChild(h("p", "resumen__aviso", e.falta ? t("deliveryFalta") : e.error));
      }
    }
    refrescarResumen = pintarResumen;
    pie.appendChild(resumen);
    pintarZona(); pintarResumen();
    var err = h("p", "hoja__err"); err.setAttribute("role", "alert");
    pie.appendChild(err);
    f.addEventListener("input", function () { err.textContent = ""; });
    f.addEventListener("change", function () { err.textContent = ""; });
    var enviar = h("button", "btn-ped" + (MODO === "mesa" || esBarra() ? "" : " btn-ped--wa"), MODO === "mesa" ? t("enviarCocina") : t("enviarWaDirecto"));
    enviar.type = "submit"; enviar.setAttribute("form", "form-pedido");
    pie.appendChild(enviar);
    // Mesa: antes de mandar a cocina se confirma, porque ya no se puede cambiar
    var confirmar = h("div", "confirma");
    pie.appendChild(confirmar);
    function mandarCocina() {
      confirmar.textContent = ""; enviar.style.display = "";
      enviar.disabled = true; enviar.textContent = t("enviando");
      enviarPedido(hp.value).then(function (r) {
        enviar.disabled = false; enviar.textContent = t("enviarCocina");
        if (r && r.error) err.textContent = r.error;
      });
    }
    f.addEventListener("submit", function (ev) {
      ev.preventDefault();
      var e = validar();
      if (e) {
        err.textContent = e;
        if (avisoFuera && !esBarra()) {
          var bp = h("button", "btn-ped btn-ped--linea hr-prog", t("hrProgramar")); bp.type = "button";
          bp.addEventListener("click", function () {
            var rp = f.querySelector('input[name=cuando][value=prog]'); if (rp && !rp.checked) rp.click();
            var s0 = f.querySelector("select[name=programado]");
            if (s0) { if (s0.scrollIntoView) s0.scrollIntoView({ block: "center", behavior: "smooth" }); try { s0.focus({ preventScroll: true }); } catch (x) {} }
          });
          err.appendChild(document.createElement("br")); err.appendChild(bp);
        }
        return;
      }
      if (esBarra()) {
        enviar.disabled = true; enviar.textContent = t("enviando");
        enviarBarra(hp.value).then(function (r) {
          enviar.disabled = false; enviar.textContent = t("enviarWaDirecto");
          if (r && r.error) err.textContent = r.error;
        });
        return;
      }
      if (MODO !== "mesa") {
        if (form.captura) {
          enviar.disabled = true; enviar.textContent = t("subiendo");
          enviarConCaptura(hp.value).then(function (r) {
            enviar.disabled = false; enviar.textContent = t("enviarWaDirecto");
            if (r && r.error) err.textContent = r.error;
          });
          return;
        }
        enviarPorWhatsapp(hp.value); return;
      }
      enviar.style.display = "none"; confirmar.textContent = "";
      confirmar.appendChild(h("p", "confirma__t", t("confirmarCocina")));
      confirmar.appendChild(h("p", "hoja__ayuda", t("confirmarCocinaTxt", { n: unidades(), m: soles(total()) })));
      confirmar.appendChild(boton(t("siEnviar"), "btn-ped", mandarCocina));
      confirmar.appendChild(boton(t("revisar"), "btn-ped btn-ped--linea", function () {
        confirmar.textContent = ""; enviar.style.display = "";
        var ini = f.parentNode && f.parentNode.firstChild; if (ini && ini.scrollIntoView) ini.scrollIntoView({ block: "start", behavior: "smooth" });
      }));
      confirmar.scrollIntoView({ block: "nearest", behavior: "smooth" });
    });
    cont.appendChild(f); cont.appendChild(pie);
    return f;
  }

  /* ---------- cobro anticipado: QR, número y captura del pago ---------- */
  function cobroDe(m) {
    var c = CFG.cobro || {}, k = String(m || "").toLowerCase();
    if (/yape o plin/.test(k)) return c[YP] || (c.Plin && (c.Plin.qr || c.Plin.numero) ? c.Plin : c.Yape) || null;
    if (/^yape/.test(k)) return c.Yape || null;
    if (/^plin/.test(k)) return c.Plin || null;
    if (/^transf/.test(k)) return c.Transferencia || null;
    return null;
  }
  function filaCopiar(etq, valor) {
    var d = h("div", "cobro__fila");
    d.appendChild(h("span", null, etq));
    d.appendChild(h("b", null, valor));
    var b = boton(t("copiar"), "cobro__copiar", function () {
      var hecho = function () { b.textContent = t("copiado"); setTimeout(function () { b.textContent = t("copiar"); }, 1800); };
      try { navigator.clipboard.writeText(String(valor).replace(/\s/g, "")).then(hecho, hecho); } catch (e) { hecho(); }
    });
    d.appendChild(b);
    return d;
  }
  /* Cobro: solo lo esencial. Yape/Plin: QR + número (copiar). Transferencia: banco, titular, cuenta y CCI (copiar); en Perú no hay un QR
     estándar de transferencia, así que no se muestra ninguno. Con captura: "Adjunta tu captura". conCaptura = false en la mesa. */
  function pintarCobro(w, metodo, conCaptura) {
    w.textContent = ""; w.className = "";
    var c = cobroDe(metodo);
    if (!c) { if (conCaptura) form.captura = ""; return; }
    var transf = /^transf/i.test(metodo) || !!c.transf;
    w.className = "cobro" + (transf ? " cobro--transf" : "");
    if (conCaptura) {   // en mesa el monto es el de la cuenta (se muestra arriba), no el del carrito
      var monto = h("p", "cobro__monto");
      monto.appendChild(h("span", null, t("montoPagar") + " "));
      monto.appendChild(h("b", null, soles(sumaPagar())));   // productos + delivery
      var ent = entregaActual();
      if (ent && !ent.ok) monto.appendChild(h("span", "cobro__nota", " " + t("deliveryAparte")));
      w.appendChild(monto);
    }
    if (!transf && c.qr) { var q = h("img", "cobro__qr"); q.src = c.qr; q.alt = "QR " + metodo; q.onerror = function () { q.remove(); }; w.appendChild(q); }
    if (transf) {
      var mon = { PEN: "Soles", USD: "Dólares" }[String(c.moneda || "").toUpperCase()] || c.moneda;
      if (c.banco) w.appendChild(filaDato(t("bancoT"), [c.banco, mon].filter(Boolean).join(" · ")));
      if (c.titular) w.appendChild(filaDato(t("titularCorto"), c.titular));
      if (c.numero) w.appendChild(filaCopiar(t("cuentaNum"), c.numero));
      if (c.cci) w.appendChild(filaCopiar(t("cci"), c.cci));
    } else {
      if (c.numero) w.appendChild(filaCopiar(t("numeroA"), c.numero));
      if (c.titular) w.appendChild(filaDato(t("titularCorto"), c.titular));
    }
    if (c.texto) w.appendChild(h("p", "cobro__banco", c.texto));
    if (!conCaptura) return;
    var lb = h("label", "cobro__subir");
    var inp = h("input"); inp.type = "file"; inp.accept = "image/*";
    var txt = h("span", null, form.captura ? "✓ " + t("capturaLista") + " · " + t("cambiarCaptura") : "📎 " + t("adjuntaCaptura"));
    var prev = h("img", "cobro__prev"); prev.alt = ""; if (form.captura) prev.src = form.captura; else prev.style.display = "none";
    var est = h("span", "hoja__ayuda", "");
    inp.addEventListener("change", function () {
      var file = inp.files && inp.files[0]; if (!file) return;
      txt.textContent = t("enviando"); est.textContent = "";
      comprimirImagen(file).then(function (d) {
        form.captura = d; prev.src = d; prev.style.display = "";
        txt.textContent = "✓ " + t("capturaLista") + " · " + t("cambiarCaptura");
      }).catch(function () { form.captura = ""; prev.style.display = "none"; txt.textContent = "📎 " + t("adjuntaCaptura"); est.textContent = t("errCaptura"); });
    });
    lb.appendChild(inp); lb.appendChild(txt);
    w.appendChild(lb); w.appendChild(prev); w.appendChild(est);
  }
  function filaDato(etq, valor) {
    var d = h("div", "cobro__fila cobro__fila--dato");
    d.appendChild(h("span", null, etq)); d.appendChild(h("b", null, valor));
    return d;
  }
  // reduce la captura a JPEG liviano (el servidor acepta hasta ~300 KB)
  function comprimirImagen(file) {
    return new Promise(function (ok, ko) {
      var r = new FileReader();
      r.onerror = ko;
      r.onload = function () {
        var img = new Image();
        img.onerror = ko;
        img.onload = function () {
          var lado = 1000, calidad = 0.6, d = "";
          for (var i = 0; i < 6; i++) {
            var esc = Math.min(1, lado / Math.max(img.width, img.height));
            var cv = document.createElement("canvas"); cv.width = Math.round(img.width * esc); cv.height = Math.round(img.height * esc);
            var cx = cv.getContext("2d"); cx.fillStyle = "#fff"; cx.fillRect(0, 0, cv.width, cv.height); cx.drawImage(img, 0, 0, cv.width, cv.height);
            d = cv.toDataURL("image/jpeg", calidad);
            if (d.length < 200000) return ok(d);   // ~150 KB de imagen
            lado = Math.round(lado * 0.82); calidad = Math.max(0.45, calidad - 0.05);
          }
          ko(new Error("grande"));
        };
        img.src = r.result;
      };
      r.readAsDataURL(file);
    });
  }

  function rucValido(r) {
    if (!/^(10|15|16|17|20)\d{9}$/.test(r)) return false;
    var f = [5, 4, 3, 2, 7, 6, 5, 4, 3, 2], s = 0;
    for (var i = 0; i < 10; i++) s += Number(r.charAt(i)) * f[i];
    var d = 11 - (s % 11); if (d === 10) d = 0; if (d === 11) d = 1;
    return d === Number(r.charAt(10));
  }
  function validarComprobante() {
    if (!form.comprobante) return "";
    var doc = String(form.doc || "").replace(/\D/g, "");
    if (form.comprobante === "Factura") { if (!rucValido(doc)) return t("errRuc"); }
    else if (!(doc.length === 8 || (doc.length === 11 && rucValido(doc)))) return t("errDoc");
    if (!form.razon || form.razon.trim().length < 3) return t("errRazon");
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(String(form.correo || "").trim())) return t("errCorreo");
    if (String(form.telefono || "").replace(/\D/g, "").length < 9) return t("errWaComp");
    return "";
  }
  /* Módulo comercio (delivery/recojo): los productos con horario se pueden agregar siempre, pero el pedido debe caer en su horario.
     Inmediato: si hay productos fuera de horario ahora, se bloquea y se invita a programar. Programado: la hora elegida debe caer
     dentro del horario de cada producto (misma regla que el servidor, que además lo vuelve a validar). */
  var avisoFuera = false;
  function mensajeHorarioProductos() {
    avisoFuera = false;
    if (MODO === "mesa" || !window.PG_COMERCIO || !PG_COMERCIO.revisar) return "";
    var ents = carrito.map(function (l) { return { it: productos[l.id], sec: seccionDe[l.id] }; });
    var cuando = null;
    if (form.programado) {
      var vent = ventanaPedido(), fecha = form.programadoFecha || (vent && vent.fecha) || "";
      var pp = fecha.split("-"), dia = new Date(Date.UTC(+pp[0], +pp[1] - 1, +pp[2])).getUTCDay(), pm = P.minutos(form.programado);
      if (vent && fecha === vent.fecha && pm < vent.a && pm + 1440 <= vent.c) dia = (dia + 1) % 7;   // pasada la medianoche
      cuando = { dia: dia, min: pm };
    }
    var mal = PG_COMERCIO.revisar(ents, cuando);
    if (!mal.length) return "";
    var n = tx(mal[0].it, "n"), mas = mal.length - 1;
    if (!cuando) {
      avisoFuera = true;
      return mas > 0 ? t("hrBloqueoMas", { n: n, m: mas }) : t("hrBloqueo", { n: n, c: mal[0].solo });
    }
    return mas > 0 ? t("hrNoCuadraMas", { n: n, m: mas }) : t("hrNoCuadra", { n: n, c: mal[0].solo });
  }
  function validar() {
    if (!carrito.length) return t("vacio");
    if (MODO === "mesa") return "";
    if (esBarra()) {
      if (!form.nombre || form.nombre.trim().length < 2) return t("errNombre");
      if (!celularBarra(form.telefono)) return t("barraErrCel");
      if (window.PG_COMERCIO && PG_COMERCIO.revisar) {   // un producto fuera de su horario no se puede pedir ahora (no hay "programar" en barra)
        var malB = PG_COMERCIO.revisar(carrito.map(function (l) { return { it: productos[l.id], sec: seccionDe[l.id] }; }), null);
        if (malB.length) return t("barraNoDisp", { n: tx(malB[0].it, "n") });
      }
      if (carrito.some(function (l) { return l.alcohol; }) && !form.mayorEdad) return t("errMayor");
      return "";
    }
    if (!form.nombre || form.nombre.trim().length < 2) return t("errNombre");
    if (String(form.telefono || "").replace(/\D/g, "").length < 9) return t("errCel");
    if (form.canal === "delivery") {
      if (!form.direccion || form.direccion.trim().length < 5) return t("errDir");
      if (!form.referencia || form.referencia.trim().length < 3) return t("errRef");
      var en = entregaActual();
      if (en && en.fuera) return t("fueraZona");
      if (en && !en.ok) return en.falta ? t("errUbic") : en.error;
    }
    if (CFG.pagoObligatorio === true && CFG.metodosPago && CFG.metodosPago.length && !form.pago) return t("errPago");
    if (!abiertoAhora() && !form.programado) return t("errHora");
    if (abiertoAhora() && form.cuando === "prog" && !form.programado) return t("errEligeHora");
    var mf = mensajeHorarioProductos(); if (mf) return mf;
    if (carrito.some(function (l) { return l.alcohol; }) && !form.mayorEdad) return t("errMayor");
    return validarComprobante();
  }

  /* Zona de la lista en la que cae la ubicación (interna, no se muestra al cliente): viaja en el pedido con el mismo precio que calcula el servidor. */
  function zonaInterna() { var e = entregaActual(); return e && e.ok && e.zona ? e.zona : ""; }
  function notaLinea(l) {
    var n = (l.nota || "").trim();
    if (MODO === "mesa" && l.llevar) n = (t("llevarNota") + (form.llevarHora ? " " + form.llevarHora : "") + (n ? " · " + n : "")).slice(0, 120);
    return n;
  }
  function notasPedido() {
    var pre = [];
    if (MODO !== "mesa" && !esBarra() && form.pago && pagoServidor(form.pago) !== form.pago) pre.push("Pago: " + form.pago);
    if (MODO !== "mesa" && !esBarra() && /^(yape|plin)$/i.test(form.pago || "")) pre.push("Pago: " + form.pago);
    if (MODO === "mesa" && carrito.some(function (l) { return l.llevar; })) pre.push("PARA LLEVAR: " + (form.llevarHora ? "listo a las " + form.llevarHora : "listo al irse"));
    return (pre.concat(form.notas ? [form.notas] : [])).join(" · ").slice(0, 300);
  }
  function cuerpoPedido(trampa) {
    var cp = {
      canal: MODO === "mesa" ? "mesa" : form.canal, mesa: MESA, codigo: CODIGO, web: trampa || "", idioma: I.lang,
      nombre: form.nombre || "", telefono: form.telefono || "", direccion: form.canal === "delivery" ? (form.direccion || "") : "",
      referencia: form.canal === "delivery" ? (form.referencia || "") : "", pago: MODO === "mesa" ? "" : esBarra() ? (form.pago || "") : pagoServidor(form.pago),
      zona: zonaInterna(), lat: form.canal === "delivery" && form.lat != null ? form.lat : null, lng: form.canal === "delivery" && form.lng != null ? form.lng : null,
      programado: form.programado || "", programadoFecha: form.programado ? (form.programadoFecha || "") : "", notas: notasPedido(), mayorEdad: !!form.mayorEdad, origen: origen(), ref: form.ref || "",
      comprobante: form.comprobante || "", doc: form.comprobante ? String(form.doc || "").replace(/\D/g, "") : "",
      razon: form.comprobante ? (form.razon || "") : "", correo: form.comprobante ? String(form.correo || "").trim() : "",
      /* "Para llevar" desde la mesa: llevar:true (el servidor actual lo ignora) y la marca en la nota de la línea, que sí llega a cocina y comanda */
      items: carrito.map(function (l) { var it = { id: l.id, tam: l.tam, salsa: l.salsa, cant: l.cant, nota: notaLinea(l), ops: l.ops || {}, mitad: l.mitad || "" }; if (l.llevar) it.llevar = true; return it; })
    };
    return window.PG_COMERCIO ? PG_COMERCIO.cuerpo(cp) : cp;   // comercio: origen de barra y sesión de mesa
  }

  // El mensaje de WhatsApp siempre va en español: lo lee el equipo del restaurante.
  function mensajeWhatsapp(numero, totalServidor, detalle) {
    var L = [];
    L.push("Hola " + C.negocio.nombre + ", quiero confirmar mi pedido" + (numero ? " #" + numero : "") + (form.ref ? " (código " + form.ref + ")" : "") + ".");
    L.push(form.canal === "recojo" ? "*Recojo en el local*" : "*Delivery*");
    L.push("");
    if (detalle) L.push(detalle);
    else carrito.forEach(function (l) {
      L.push(l.cant + " × " + (l.nEs || l.n) + (l.tam ? " (" + (l.tam === "1/2 kg" && modoPres(productos[l.id]) === "paq" ? "500 g" : I.tam(l.tam)) + ")" : "") + " — " + soles(l.unit * l.cant));
      if (l.salsaEs) L.push("    Salsa: " + l.salsaEs);
      (l.opsEs || []).forEach(function (o) { L.push("    " + o); });
      if (l.nota) L.push("    Nota: " + l.nota);
    });
    L.push("");
    var ent = entregaActual(), prod = totalServidor != null ? totalServidor : total();
    if (ent && ent.ok) {
      L.push("Productos: " + soles(prod));
      L.push("Delivery: S/ " + ent.costo + (ent.zona ? " · zona " + ent.zona : ""));
      L.push("*Total: " + soles(prod + ent.costo) + "*");
    } else L.push("*Total productos: " + soles(prod) + "*" + (form.canal === "delivery" ? " (+ delivery)" : ""));
    L.push("Nombre: " + (form.nombre || ""));
    L.push("Celular: " + (form.telefono || ""));
    if (form.canal === "delivery") {
      L.push("Dirección: " + (form.direccion || ""));
      if (form.referencia) L.push("Referencia: " + form.referencia);
      if (form.ubicacion) L.push("Ubicación: " + form.ubicacion);
    }
    if (form.pago) L.push("Pago: " + form.pago + (cobroDe(form.pago) ? (form.capturaSubida ? " (ya subí la captura en la web)" : " (te envío la captura por aquí)") : ""));
    L.push("Para: " + (form.programado ? (form.programadoTxt || "las " + form.programado) : "lo antes posible"));
    if (form.notas) L.push("Comentarios: " + form.notas);
    if (form.comprobante) {
      L.push("");
      L.push("*" + form.comprobante + "*: " + String(form.doc || "").replace(/\D/g, "") + " · " + (form.razon || ""));
      L.push("Correo: " + String(form.correo || "").trim());
    }
    if (I.lang === "en") L.push("(Cliente en inglés)");
    return "https://wa.me/" + C.negocio.whatsapp + "?text=" + encodeURIComponent(L.join("\n"));
  }

  /* Delivery y recojo: en el mismo toque se abre WhatsApp con el pedido listo y, a la vez,
     el pedido se registra en el panel (con un código corto para encontrarlo). */
  function codigoCorto() {
    var a = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789", s = "";
    for (var i = 0; i < 4; i++) s += a.charAt(Math.floor(Math.random() * a.length));
    return s;
  }
  function enviarPorWhatsapp(trampa) {
    form.ref = codigoCorto();
    var url = mensajeWhatsapp(null, null, null);
    var cuerpo = cuerpoPedido(trampa);
    if (CFG.api) {
      try { fetch(CFG.api, { method: "POST", body: JSON.stringify(cuerpo), keepalive: true }).catch(function () {}); } catch (e) {}
    }
    var w = null;
    try { w = window.open(url, "_blank"); if (w) w.opener = null; } catch (e) {}
    var c = h("div", "hoja__cuerpo exito");
    c.appendChild(h("div", "exito__ic", "✓"));
    c.appendChild(h("h3", null, t("abriendoWa")));
    c.appendChild(listaEnviada(carrito));
    c.appendChild(h("p", null, t("soloEnviar", { d: form.canal === "delivery" ? t("conDelivery") : "" })));
    c.appendChild(h("p", "hoja__ayuda", t("codigoPedido") + form.ref));
    var a = h("a", "link-wa", t("noAbrio")); a.href = url; a.target = "_blank"; a.rel = "noopener";
    c.appendChild(a);
    if (window.PG_COMERCIO) PG_COMERCIO.resena(c, h);   // comercio: botón de reseña (solo si hay enlace)
    c.appendChild(boton(t("volver"), "btn-ped btn-ped--linea", cerrarHoja));
    recordarCliente();
    guardarJson(CLAVE_ULTIMO, { t: Date.now(), c: carrito });
    marcarPedido(); carrito = []; guardar(); pintarBarra();
    form.ref = ""; form.ubicacion = ""; form.lat = null; form.lng = null; form.zona = ""; form.ubicOrigen = "";
    pintarRepetir();
    abrirHoja(c, t("tuPedido"));
    if (!w) setTimeout(function () { location.href = url; }, 50);
  }

  /* Con captura: se espera a que el pedido (con la imagen) llegue al panel y recién se ofrece WhatsApp.
     Si falla la subida, se envía igual sin captura y se pide mandarla por WhatsApp. */
  function enviarConCaptura(trampa) {
    if (!CFG.api) { form.captura = ""; enviarPorWhatsapp(trampa); return Promise.resolve({}); }
    form.ref = codigoCorto();
    var cuerpo = cuerpoPedido(trampa); cuerpo.captura = form.captura;
    var ctrl = window.AbortController ? new AbortController() : null;
    var tm = setTimeout(function () { if (ctrl) ctrl.abort(); }, 40000);
    return fetch(CFG.api, { method: "POST", body: JSON.stringify(cuerpo), signal: ctrl ? ctrl.signal : undefined })
      .then(function (r) { return r.json(); })
      .then(function (r) {
        clearTimeout(tm);
        if (r && !r.ok && esGrande(r.error)) {   // el servidor no aceptó la imagen: el pedido se manda sin ella y la captura va por WhatsApp
          return fetch(CFG.api, { method: "POST", body: JSON.stringify(cuerpoPedido(trampa)) }).then(function (x) { return x.json(); })
            .then(function (r2) { if (r2 && r2.ok) r2.sinCaptura = true; return r2; }, function () { return { ok: false }; });
        }
        return r;
      })
      .then(function (r) {
        if (!r || !r.ok) { form.ref = ""; return { error: (r && r.error && !esGrande(r.error) ? r.error : "") || t("errEnvio") }; }
        form.capturaSubida = !r.sinCaptura;
        var url = mensajeWhatsapp(r.numero, r.total, null);
        var c = h("div", "hoja__cuerpo exito");
        c.appendChild(h("div", "exito__ic", "✓"));
        c.appendChild(h("h3", null, t("recibidoPago", { n: r.numero })));
        c.appendChild(h("p", null, r.sinCaptura ? t("capturaWa") : t("recibidoPagoTxt")));
        c.appendChild(listaEnviada(carrito));
        c.appendChild(h("p", "hoja__ayuda", t("codigoPedido") + form.ref));
        var a = h("a", "btn-ped btn-ped--wa", t("abrirWa")); a.href = url; a.target = "_blank"; a.rel = "noopener";
        c.appendChild(a);
        if (window.PG_COMERCIO) PG_COMERCIO.resena(c, h);   // comercio: botón de reseña (solo si hay enlace)
        c.appendChild(boton(t("volver"), "btn-ped btn-ped--linea", cerrarHoja));
        recordarCliente();
        guardarJson(CLAVE_ULTIMO, { t: Date.now(), c: carrito });
        marcarPedido(); carrito = []; guardar(); pintarBarra();
        form.ref = ""; form.ubicacion = ""; form.lat = null; form.lng = null; form.zona = ""; form.ubicOrigen = ""; form.captura = ""; form.capturaSubida = false;
        pintarRepetir();
        abrirHoja(c, t("tuPedido"));
        return {};
      })
      .catch(function () {
        clearTimeout(tm);
        // sin conexión estable: se manda el pedido sin la imagen y la captura va por WhatsApp
        form.captura = ""; form.capturaSubida = false; form.ref = "";
        enviarPorWhatsapp(trampa);
        return {};
      });
  }

  /* analítica: un evento "pedido" por producto enviado */
  function marcarPedido() {
    if (!window.PG_ANALITICA) return;
    carrito.forEach(function (l) { PG_ANALITICA.ev("pedido", l.id, seccionDe[l.id] ? seccionDe[l.id].id : ""); });
    PG_ANALITICA.enviar(false);
  }
  function esGrande(e) { return /demasiado grande|muy grande|too large/i.test(String(e || "")); }
  /* Barra: el pedido va directo al sistema (se imprime solo en el local). Sin WhatsApp, sin seguimiento, sin hora. */
  function enviarBarra(trampa) {
    if (!CFG.api) return Promise.resolve({ error: t("barraSinConexion") });
    form.ref = codigoCorto();
    var cuerpo = cuerpoPedido(trampa);
    cuerpo.canal = "recojo"; cuerpo.programado = ""; cuerpo.programadoFecha = ""; cuerpo.direccion = ""; cuerpo.referencia = "";
    cuerpo.telefono = celularBarra(form.telefono) || cuerpo.telefono;
    if (form.captura && cobroDe(form.pago)) cuerpo.captura = form.captura;
    var ctrl = window.AbortController ? new AbortController() : null;
    var tm = setTimeout(function () { if (ctrl) ctrl.abort(); }, 40000);
    return fetch(CFG.api, { method: "POST", body: JSON.stringify(cuerpo), signal: ctrl ? ctrl.signal : undefined })
      .then(function (r) { return r.json(); })
      .then(function (r) {
        if (r && !r.ok && esGrande(r.error) && cuerpo.captura) {
          delete cuerpo.captura;
          return fetch(CFG.api, { method: "POST", body: JSON.stringify(cuerpo) }).then(function (x) { return x.json(); }).then(function (r2) { if (r2 && r2.ok) r2.sinCaptura = true; return r2; });
        }
        return r;
      })
      .then(function (r) {
        clearTimeout(tm);
        if (!r || !r.ok) { form.ref = ""; return { error: (r && r.error && !esGrande(r.error) ? r.error : "") || t("barraSinConexion") }; }
        recordarCliente();
        exitoBarra(r);
        return {};
      })
      .catch(function () { clearTimeout(tm); form.ref = ""; return { error: t("barraSinConexion") }; });
  }
  function exitoBarra(r) {
    var c = h("div", "hoja__cuerpo exito");
    var nombre = String(form.nombre || "").trim().split(/\s+/)[0];
    var digital = /^(yape|plin|transf)/i.test(String(form.pago || ""));
    c.appendChild(h("div", "exito__ic", "✓"));
    c.appendChild(h("h3", null, t("barraListo", { n: nombre })));
    c.appendChild(h("p", null, t("barraPrep", { num: r && r.numero != null ? r.numero : "" })));
    c.appendChild(h("p", null, t(digital ? "barraCajaDig" : "barraCaja")));
    if (r && r.sinCaptura) c.appendChild(h("p", "hoja__ayuda", t("capturaWa")));
    if (window.PG_COMERCIO) PG_COMERCIO.resena(c, h);
    c.appendChild(boton(t("volver"), "btn-ped btn-ped--linea", cerrarHoja));
    marcarPedido(); carrito = []; guardar(); pintarBarra();
    form.ref = ""; form.pago = ""; form.captura = ""; form.capturaSubida = false; form.mayorEdad = false;
    abrirHoja(c, t("tuPedido"));
  }

  function enviarPedido(trampa) {
    var cuerpo = cuerpoPedido(trampa);
    if (!CFG.api) { exito(null, null, null, true); return Promise.resolve({}); }
    var ctrl = window.AbortController ? new AbortController() : null;
    var tm = setTimeout(function () { if (ctrl) ctrl.abort(); }, 25000);
    return fetch(CFG.api, { method: "POST", body: JSON.stringify(cuerpo), signal: ctrl ? ctrl.signal : undefined })
      .then(function (r) { return r.json(); })
      .then(function (r) {
        clearTimeout(tm);
        if (!r || !r.ok) return { error: (r && r.error) || t("errEnvio") };
        recordarCliente();
        exito(r.numero, r.total, r.detalle, false);
        return {};
      })
      .catch(function () {
        clearTimeout(tm);
        if (MODO === "mesa") return { error: t("errCocina") };
        exito(null, null, null, true);
        return {};
      });
  }

  function exito(numero, totalServidor, detalle, soloWhatsapp) {
    var c = h("div", "hoja__cuerpo exito");
    c.appendChild(h("div", "exito__ic", "✓"));
    if (MODO === "mesa") {
      c.appendChild(h("h3", null, t("enviadoMesa", { n: numero })));
      c.appendChild(h("p", null, t("mozoConfirma") + soles(totalServidor)));
      c.appendChild(listaEnviada(carrito));
      c.appendChild(boton(t("verCuenta"), "btn-ped btn-ped--linea", abrirCuenta));
      if (window.PG_COMERCIO) PG_COMERCIO.resena(c, h);   // comercio: botón de reseña (solo si hay enlace)
      c.appendChild(boton(t("volver"), "btn-ped", cerrarHoja));
    } else {
      var url = mensajeWhatsapp(numero, totalServidor, detalle);
      c.appendChild(h("h3", null, soloWhatsapp ? t("ultimoPaso") : t("recibido", { n: numero })));
      c.appendChild(h("p", null, soloWhatsapp ? t("envianosWa") : t("confirmaWa")));
      c.appendChild(listaEnviada(carrito));
      var a = h("a", "btn-ped btn-ped--wa", t("enviarWa")); a.href = url; a.target = "_blank"; a.rel = "noopener";
      c.appendChild(a);
      c.appendChild(h("p", "hoja__ayuda", t("respondemos", { d: form.canal === "delivery" ? t("conDelivery") : "" })));
      if (window.PG_COMERCIO) PG_COMERCIO.resena(c, h);   // comercio: botón de reseña (solo si hay enlace)
    }
    marcarPedido(); carrito = []; guardar(); pintarBarra();
    abrirHoja(c, MODO === "mesa" ? t("mesa") + MESA : t("tuPedido"));
  }

  /* ---------- cuenta de la mesa (lo pedido por todos los que escanearon el QR) ---------- */
  function leerCuenta() {
    // "cod" y no "c": Google responde error 400 si /exec recibe un parámetro "c" con letras
    return fetch(CFG.api + "?cuenta=1&m=" + encodeURIComponent(MESA) + "&cod=" + encodeURIComponent(CODIGO))
      .then(function (r) { return r.json(); });
  }
  function pintarCuenta(c, r) {
    if (!r || !r.ok) { c.appendChild(h("p", "hoja__err", (r && r.error) || t("errCocina"))); return false; }
    if (!r.pedidos.length) { c.appendChild(h("p", "hoja__desc", t("cuentaVacia"))); return false; }
    r.pedidos.forEach(function (p) {
      var b = h("div", "cuenta__ped");
      b.appendChild(h("strong", null, "#" + p.numero + " · " + p.hora));
      var ls = (p.lineas || []).filter(function (l) { return l && l.t; });
      if (MODO === "mesa" && ls.length) {   // mismo dato, en filas: producto a la izquierda, importe a la derecha
        var ul = h("ul", "cuenta__lin");
        ls.forEach(function (l) {
          var li = h("li"), tt = h("span", "cuenta__t", l.t);
          if (l.d) tt.appendChild(h("small", null, l.d));
          li.appendChild(tt); if (l.s) li.appendChild(h("span", "cuenta__s", soles(l.s)));
          ul.appendChild(li);
        });
        b.appendChild(ul);
      } else b.appendChild(h("pre", "cuenta__det", p.detalle));
      c.appendChild(b);
    });
    var tl = h("div", "total"); tl.appendChild(h("span", null, t("cuentaTotal"))); tl.appendChild(h("strong", null, soles(r.total)));
    c.appendChild(tl);
    return true;
  }
  /* esqueleto mientras carga la cuenta (filas grises que laten) */
  function esqueletoCuenta() {
    var w = h("div", "esq-cuenta"); w.setAttribute("aria-label", t("cargando")); w.setAttribute("role", "status");
    for (var i = 0; i < 4; i++) w.appendChild(h("span", "esq-fila"));
    return w;
  }
  /* botones grandes de la cuenta: pedir la cuenta (principal) y llamar al mozo */
  function accionesCuenta(conCuenta) {
    var w = h("div", "cuenta__acc");
    if (conCuenta) w.appendChild(boton("🧾 " + t("pedirCuenta"), "btn-ped", abrirPedirCuenta));
    var bm = h("button", "btn-ped btn-ped--linea"); bm.type = "button";
    var sp = h("span", null, "🙋 " + t("llamarMozo")); bm.appendChild(sp);
    bm.addEventListener("click", function () { llamarMozo(bm, sp); });
    w.appendChild(bm);
    return w;
  }
  function abrirCuenta() {
    var c = h("div", "hoja__cuerpo");
    c.appendChild(esqueletoCuenta());
    abrirHoja(c, t("cuentaMesa") + " · " + t("mesa") + MESA);
    if (!CFG.api) { c.textContent = ""; c.appendChild(h("p", "hoja__desc", t("cuentaVacia"))); return; }
    leerCuenta().then(function (r) {
      c.textContent = "";
      var hay = pintarCuenta(c, r);
      if (hay) c.appendChild(h("p", "hoja__ayuda", t("cuentaNota")));
      if (r && r.ok) c.appendChild(accionesCuenta(hay));
    }).catch(function () { c.textContent = ""; c.appendChild(h("p", "hoja__err", t("errCocina"))); });
  }

  /* ---------- llamar al mozo / pedir la cuenta ---------- */
  function enviarAviso(motivo, detalle, division) {
    if (!CFG.api) return Promise.resolve({ ok: false, error: t("errCocina") });
    return fetch(CFG.api, { method: "POST", body: JSON.stringify({ aviso: 1, motivo: motivo, detalle: detalle || "", mesa: MESA, codigo: CODIGO, division: division || [] }) })
      .then(function (r) { return r.json(); })
      .catch(function () { return { ok: false, error: t("errCocina") }; });
  }
  var mozoT = 0;
  function llamarMozo(btn, sp) {
    if (Date.now() - mozoT < 45000) { aviso(t("mozoYaAvisado")); return; }
    var el = sp || btn, txt = el.textContent; btn.disabled = true; el.textContent = t("enviando");
    enviarAviso("mozo").then(function (r) {
      btn.disabled = false;
      if (!r || !r.ok) { el.textContent = txt; aviso((r && r.error) || t("errCocina")); return; }
      mozoT = Date.now(); el.textContent = "✓ " + t("mozoEnCamino"); btn.classList.add("ok"); aviso(t("mozoAvisado"));
      setTimeout(function () { el.textContent = txt; btn.classList.remove("ok"); }, 45000);
    });
  }
  function abrirPedirCuenta() {
    var c = h("div", "hoja__cuerpo");
    var resumen = h("div"); resumen.appendChild(esqueletoCuenta());
    c.appendChild(resumen);
    var sel = { pago: "", comp: "" };
    var metodosMesa = CFG.metodosPagoMesa && CFG.metodosPagoMesa.length ? CFG.metodosPagoMesa : (CFG.metodosPago || []);
    if (metodosMesa.length) {
      c.appendChild(h("h3", "hoja__sub", t("comoPagar")));
      var cobroMesa = h("div");
      c.appendChild(opcionesUI("pagoCuenta", metodosMesa.map(function (m) { return { valor: m, texto: m }; }), false, function (v) { sel.pago = v[0]; pintarCobro(cobroMesa, sel.pago, false); }));
      c.appendChild(cobroMesa);
    }
    var tipos = (CFG.comprobantes || []).filter(function (x) { return x === "Boleta" || x === "Factura"; });
    if (tipos.length) {
      c.appendChild(h("h3", "hoja__sub", t("comprobante")));
      c.appendChild(opcionesUI("compCuenta", [{ valor: "", texto: t("sinComp"), marcado: true }].concat(tipos.map(function (x) {
        return { valor: x, texto: t(x === "Boleta" ? "boleta" : "factura") };
      })), false, function (v) { sel.comp = v[0]; }));
    }
    var zonaDiv = h("div"); c.appendChild(zonaDiv);
    var err = h("p", "hoja__err"); c.appendChild(err);
    var b = boton(t("pedirCuenta"), "btn-ped", function () {
      b.disabled = true; b.textContent = t("enviando");
      var div = sel.division ? sel.division() : [];
      var det = [sel.pago ? "Pago: " + sel.pago : "", sel.comp ? sel.comp : "", div.length > 1 ? "Dividir en " + div.length : ""].filter(Boolean).join(" · ");
      enviarAviso("cuenta", det, div).then(function (r) {
        b.disabled = false; b.textContent = t("pedirCuenta");
        if (!r || !r.ok) { err.textContent = (r && r.error) || t("errCocina"); return; }
        var ok = h("div", "hoja__cuerpo exito");
        ok.appendChild(h("div", "exito__ic", "✓"));
        ok.appendChild(h("h3", null, t("cuentaPedida")));
        ok.appendChild(h("p", null, sel.comp ? t("cuentaPedidaComp") : t("cuentaPedidaTxt")));
        if (div.length > 1) ok.appendChild(h("p", null, t("divNota") + " " + div.map(function (x, i) { return t("persona", { n: i + 1 }) + ": " + soles(x); }).join(" · ")));
        if (window.PG_COMERCIO) PG_COMERCIO.resena(ok, h);   // comercio: botón de reseña (solo si hay enlace)
        ok.appendChild(boton(t("volver"), "btn-ped", cerrarHoja));
        abrirHoja(ok, t("mesa") + MESA);
      });
    });
    c.appendChild(b);
    abrirHoja(c, t("pedirCuenta") + " · " + t("mesa") + MESA);
    if (!CFG.api) { resumen.textContent = ""; return; }
    leerCuenta().then(function (r) { resumen.textContent = ""; if (pintarCuenta(resumen, r)) dividirUI(zonaDiv, r, sel); })
      .catch(function () { resumen.textContent = ""; });
  }

  /* ---------- dividir la cuenta (desde el QR): partes iguales o cada uno lo suyo ----------
     Se manda al mozo como montos por persona; él ya ve los pagos separados al cobrar. */
  function repartir(cent, n) {   // reparte céntimos en n partes casi iguales
    var base = Math.floor(cent / n), resto = cent - base * n, r = [];
    for (var i = 0; i < n; i++) r.push(base + (i < resto ? 1 : 0));
    return r;
  }
  function dividirUI(w, r, sel) {
    var total = Math.round(r.total * 100);
    var lineas = [];
    r.pedidos.forEach(function (p) { (p.lineas || []).forEach(function (l) { lineas.push({ t: l.t, d: l.d, c: Math.round((l.s || 0) * 100), quien: 0 }); }); });
    var porLinea = lineas.length && lineas.every(function (l) { return l.c > 0; }) && Math.abs(lineas.reduce(function (a, l) { return a + l.c; }, 0) - total) <= 1;
    var modo = "", n = 2, cuerpo = h("div", "div");
    function montos() {
      if (modo === "iguales") return repartir(total, n);
      if (modo !== "cada") return [];
      var r2 = []; for (var i = 0; i < n; i++) r2.push(0);
      lineas.forEach(function (l) {
        if (l.quien > 0 && l.quien <= n) r2[l.quien - 1] += l.c;
        else repartir(l.c, n).forEach(function (x, i) { r2[i] += x; });
      });
      return r2;
    }
    sel.division = function () { return montos().map(function (x) { return x / 100; }); };
    function pintar() {
      cuerpo.textContent = "";
      if (!modo) return;
      var st = h("div", "div__step");
      st.appendChild(h("span", null, t("personas")));
      st.appendChild(boton("−", "div__b", function () { if (n > 2) { n--; pintar(); } }));
      st.appendChild(h("b", null, String(n)));
      st.appendChild(boton("+", "div__b", function () { if (n < 12) { n++; pintar(); } }));
      cuerpo.appendChild(st);
      if (modo === "cada") {
        cuerpo.appendChild(h("p", "hoja__ayuda", t("divAyuda")));
        lineas.forEach(function (l) {
          if (l.quien > n) l.quien = 0;
          var f = h("div", "div__lin");
          f.appendChild(h("span", "div__t", l.t));
          var ch = h("div", "div__chips");
          for (var i = 0; i <= n; i++) (function (k) {
            ch.appendChild(boton(k ? String(k) : t("compartido"), l.quien === k ? "on" : "", function () { l.quien = k; pintar(); }));
          })(i);
          f.appendChild(ch);
          cuerpo.appendChild(f);
        });
      }
      var res = h("div", "div__res");
      montos().forEach(function (x, i) { var d = h("div"); d.appendChild(h("span", null, t("persona", { n: i + 1 }))); d.appendChild(h("b", null, soles(x / 100))); res.appendChild(d); });
      cuerpo.appendChild(res);
    }
    var ops = [{ valor: "", texto: t("divNo"), marcado: true }, { valor: "iguales", texto: t("divIguales") }];
    if (porLinea) ops.push({ valor: "cada", texto: t("divCada") });
    w.appendChild(h("h3", "hoja__sub", t("dividir")));
    w.appendChild(opcionesUI("dividir", ops, false, function (v) { modo = v[0]; pintar(); }));
    w.appendChild(cuerpo);
  }

  /* ---------- repetir el último pedido (delivery) ---------- */
  var repetirEl, repetirFw;
  function ultimoPedido() {
    var o = leerJson(CLAVE_ULTIMO);
    return o && Array.isArray(o.c) && o.c.length && Date.now() - o.t < 120 * 864e5 ? o : null;
  }
  function pintarRepetir() {
    if (!repetirEl) return;
    var ver = MODO === "delivery" && !esBarra() && !carrito.length && !!ultimoPedido() && aceptaAhora();
    repetirEl.classList.toggle("on", ver);
    if (ver && repetirFw) { // miniatura del primer producto del último pedido
      var u = ultimoPedido(), l0 = u && u.c[0];
      repetirFw.textContent = ""; repetirFw.appendChild(miniatura(l0 ? productos[l0.id] : null, "repetir").firstChild);
    }
  }
  function repetirUltimo() {
    var o = ultimoPedido(); if (!o) return;
    var ok = [], faltan = 0;
    o.c.forEach(function (l) {
      var it = productos[l.id], sec = seccionDe[l.id];
      var n = it && sec && puedePedir(it, sec) ? repreciar(JSON.parse(JSON.stringify(l))) : null;
      if (n) { n.n = tx(it, "n"); ok.push(n); } else faltan++;
    });
    if (!ok.length) { aviso(t("repetirNada")); return; }
    carrito = ok; guardar(); pintarBarra(true); pintarRepetir();
    if (faltan) aviso(t("repetirParcial", { n: faltan }));
    abrirCarrito();
  }

  /* ---------- API para app.js ---------- */
  window.PG_PEDIDO = {
    modo: MODO, mesa: MESA,
    activo: function () { return activo(); },
    aceptaAhora: function () { return aceptaAhora(); },
    mesaValida: mesaValida,
    desdeProg: function () { var v = ventanaPedido(); return v ? fmtHora(v.desde) : ""; },
    puedePedir: puedePedir,
    modoPres: modoPres, precioKg: precioKg, presTxt: presTxt, kgDe: kgDe, tamDefTienda: tamDefTienda,
    abrirDetalle: function (it, sec, tam, opts) { abrirDetalle(it, sec, tam, opts); },
    boton: function (it, sec, tamFn) {
      var b = h("button", "agregar"); b.type = "button";
      b.appendChild(h("span", null, "+"));
      b.setAttribute("aria-label", t("agregarA", { n: tx(it, "n") }));
      b.addEventListener("click", function (ev) {
        ev.stopPropagation();
        b.classList.remove("pop"); void b.offsetWidth; b.classList.add("pop");
        clicAgregar(it, sec, tamFn ? tamFn() : "");
      });
      return b;
    },
    iniciar: function (utils) {
      P = utils; h = P.h;
      cargar();
      carrito = carrito.filter(function (l) { return !!repreciar(l); });
      cargarCliente();
      capa = h("div", "capa");
      hoja = h("div", "hoja"); hoja.setAttribute("role", "dialog"); hoja.setAttribute("aria-modal", "true");
      capa.appendChild(hoja);
      capa.addEventListener("click", function (e) { if (e.target === capa) cerrarHoja(); });
      document.addEventListener("keydown", function (e) { if (e.key === "Escape" && capa.classList.contains("on")) cerrarHoja(); });
      document.body.appendChild(capa);
      barra = h("button", "barra-ped"); barra.type = "button";
      barraTxt = h("span"); barraTot = h("strong");
      barra.appendChild(barraTxt); barra.appendChild(barraTot);
      barra.addEventListener("click", abrirCarrito);
      document.body.appendChild(barra);
      if (MODO === "mesa" && mesaValida()) {
        /* Barra inferior del cliente en la mesa: tres botones iguales, con ícono y texto */
        var acc = h("nav", "mesa-acc"); acc.setAttribute("aria-label", t("mesa") + MESA);
        var ICS = {
          mozo: "M12 3a4 4 0 1 1 0 8 4 4 0 0 1 0-8zM4.5 21a7.5 7.5 0 0 1 15 0M18.5 4.5l1.8-1.3M19.8 8h2",
          cuenta: "M6 2.8h12v18.4l-2-1.4-2 1.4-2-1.4-2 1.4-2-1.4-2 1.4zM9 7.5h6M9 11h6M9 14.5h4",
          lista: "M8 6h12M8 12h12M8 18h12M4 6h.01M4 12h.01M4 18h.01"
        };
        var bMesa = function (ic, txt, cls, fn) {
          var b = h("button", "mesa-acc__b" + (cls ? " " + cls : "")); b.type = "button";
          b.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="' + ICS[ic] + '"/></svg>';
          var sp = h("span", null, txt); b.appendChild(sp);
          b.addEventListener("click", function () { fn(b, sp); });
          return b;
        };
        acc.appendChild(bMesa("mozo", t("llamarMozo"), "", function (b, sp) { llamarMozo(b, sp); }));
        acc.appendChild(bMesa("cuenta", t("pedirCuenta"), "mesa-acc__b--pri", function () { abrirPedirCuenta(); }));
        acc.appendChild(bMesa("lista", t("loPedido"), "", function () { abrirCuenta(); }));
        document.body.appendChild(acc);
      }
      if (MODO === "delivery") {
        repetirEl = h("div", "repetir");
        var rb = boton("↺ " + t("repetir"), "repetir__b", repetirUltimo);
        var rx = boton("×", "repetir__x", function () { try { localStorage.removeItem(CLAVE_ULTIMO); } catch (e) {} pintarRepetir(); });
        rx.setAttribute("aria-label", t("repetirQuitar"));
        repetirFw = h("span", "repetir__fw"); repetirEl.appendChild(repetirFw);
        repetirEl.appendChild(rb); repetirEl.appendChild(rx);
        document.body.appendChild(repetirEl);
      }
      toast = h("div", "toast"); toast.setAttribute("role", "status"); document.body.appendChild(toast);
      pintarBarra();
      pintarRepetir();
      if (C.ext && C.ext.busqueda) { // módulo "búsqueda inteligente y voz" (modulo_busqueda = SI): sin la bandera, no se carga nada
        var sq = document.createElement("script"); sq.src = "busqueda.js"; sq.async = true;
        sq.onload = function () { if (window.PG_BUSQUEDA) window.PG_BUSQUEDA.iniciar({ carta: C, modo: MODO, dia: P.ahoraLugar(new Date()).dia, acepta: aceptaAhora,
          puedePedir: function (id) { return !!productos[id] && puedePedir(productos[id], seccionDe[id]); },
          agregar: function (l) { var it = productos[l.id], r = it && repreciar({ id: l.id, tam: l.tam || "", salsa: l.salsa || "", ops: l.ops || {}, mitad: l.mitad || "" }); if (!r) return false; agregar(it, { tam: r.tam, salsa: r.salsa, cant: l.cant, nota: l.nota || "", ops: r.ops, mitad: r.mitad }, r.unit); return true; } }); };
        document.head.appendChild(sq);
      }
    }
  };
})();
