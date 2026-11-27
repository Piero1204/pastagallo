/* Pasta Gallo · PANEL LOCAL (computadora del local) — https://pastagallo.pages.dev/<código>?app=local
   Lo carga mozo.js cuando el equipo vinculado tiene rol "local". Es la MISMA app del mozo (mismo API "mz", misma carta con fotos,
   mismos cobros, juntar/mover/dividir, para llevar y delivery) con layout de escritorio y módulos extra:
     «Todos»  tablero completo: indicadores del día, pedidos por estado con acciones rápidas, promoción del día, no disponibles,
              comprobantes por emitir, impresora, reparto, mapa del salón, mapa de delivery e historial del día.
     «Para llevar / Delivery»  pedidos en curso, repartidores y mapa.      «Salón»  plano y por servir.
     «Cuentas»  lo cobrado del día (mesas, para llevar/delivery y tienda): cambiar pago, editar, eliminar/anular y recuperar.
     «Comprobantes»  pendientes, cobrado sin comprobante y comprobante nuevo con líneas libres.
     «Tienda»  vender (misma interfaz de la caja, en verde oliva) y registrar compras (sin totales de caja).
     «Clientes»  búsqueda por nombre o celular, historial y dirección para un delivery manual.
   Solo se piden al servidor los datos de la pestaña abierta; se refrescan solos con el sondeo barato del núcleo.
   Atajos: / buscar · n nuevo pedido · 1-7 pestañas · Esc cerrar.  El servidor valida todo (ModLocal.gs: mz "l_…" solo para el rol local). */
(function () {
  "use strict";
  var MZ = null, S = null, h = null, btn = null, soles = null;

  var TABS = [
    ["todos", "Todos", "M4 4h7v7H4zM13 4h7v7h-7zM4 13h7v7H4zM13 13h7v7h-7z"],
    ["llevar", "Llevar y delivery", "M5 8h14l-1 12H6zM9 8V6a3 3 0 0 1 6 0v2"],
    ["salon", "Salón", "M4 9h16M6 9v9M18 9v9M8 5h8l2 4H6z"],
    ["cuentas", "Cuentas", "M3 7h18v12H3zM3 11h18M7 15h4M16 4l2 3M8 4L6 7"],
    ["comp", "Comprobantes", "M6 3h12v18l-3-2-3 2-3-2-3 2zM9 8h6M9 12h6M9 16h4"],
    ["tienda", "Tienda", "M4 9l1-5h14l1 5M4 9h16v11H4zM9 20v-6h6v6"],
    ["clientes", "Clientes", "M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM2 21a7 7 0 0 1 14 0M17 11a3 3 0 1 0 0-6M22 21a6 6 0 0 0-5-6"]
  ];
  var NOMBRE_TAB = {}; TABS.forEach(function (t) { NOMBRE_TAB[t[0]] = t[1]; });
  var K = { abiertos: "pg-local-abiertos", respaldo: "pg-local-respaldo", vistos: "pg-local-vistos", tiendaSub: "pg-local-tiendasub" };
  var T = null, pidiendoT = false, tPedido = 0, abierto = Date.now(), CARGA = null, cargaTs = 0;
  var COMP = null, pidiendoC = false;
  var CLI = { q: "", res: null, ficha: null, ts: 0, buscando: false };
  var AB = {};   // secciones desplegables abiertas (se recuerdan)
  var TV = { lista: null, ts: 0, pidiendo: false };   // ventas de tienda de hoy (bloque «Tienda» de «Todos»)
  var CU = { dia: "", datos: null, ts: 0, pidiendo: false, err: "" };   // pestaña «Cuentas»

  function svg(d, cls) {
    var ns = "http://www.w3.org/2000/svg", s = document.createElementNS(ns, "svg"), p = document.createElementNS(ns, "path");
    s.setAttribute("viewBox", "0 0 24 24"); s.setAttribute("aria-hidden", "true"); if (cls) s.setAttribute("class", cls);
    p.setAttribute("d", d); s.appendChild(p); return s;
  }
  function llamar(o) { o.t = S.t; return MZ.api(o); }
  function minDesde(ts) { return MZ.minDesde(ts); }
  function haceTxt(ts) { var m = minDesde(ts); return m >= 60 ? Math.floor(m / 60) + " h " + (m % 60) + " min" : m + " min"; }
  function guardarAb() { MZ.guardar(K.abiertos, AB); }
  function diaLima() { return new Date(Date.now() + S.desfase - 5 * 3600000); }
  function horaLima() { return diaLima().getUTCHours(); }
  /* orden de los bloques por la hora de Lima: de 18:00 a 23:59 manda el restaurante; el resto del día, la tienda */
  function ordenBloques() { return horaLima() >= 18 ? ["salon", "llevar", "tienda"] : ["tienda", "salon", "llevar"]; }
  /* acciones nuevas del servidor: { ok, r } o { ok:false, error }. Devuelve r (o el objeto si no trae r). */
  function accion(o) {
    return llamar(o).then(function (x) {
      if (!x || !x.ok) { var e = new Error((x && x.error) || "No se pudo."); e.srv = true; throw e; }
      return x.r !== undefined ? x.r : x;
    });
  }
  function errTxt(e) { return e && e.srv ? e.message : "Sin conexión: no se guardó. Intenta de nuevo."; }
  /* {ok, r:{…}} → {ok, …} (para módulos que esperan la respuesta plana) */
  function plano(x) {
    if (!x || !x.ok || !x.r || typeof x.r !== "object" || Array.isArray(x.r)) return x;
    var o = {}; Object.keys(x.r).forEach(function (k) { o[k] = x.r[k]; }); Object.keys(x).forEach(function (k) { if (k !== "r" && o[k] === undefined) o[k] = x[k]; });
    o.ok = true; return o;
  }
  function trasCambio() { S.v = ""; MZ.sondear(); TV.ts = 0; CU.ts = 0; if (S.pest === "cuentas") pedirCuentas(true); if (S.pest === "todos") pedirTVentas(true); pedirTablero(true); }

  /* =========================== DATOS EXTRA (tablero) =========================== */
  function pedirTablero(forzar) {
    if (pidiendoT || !S.t) return;
    if (!forzar && T && Date.now() - tPedido < 12000) return;
    pidiendoT = true; tPedido = Date.now();
    llamar({ mz: "l_tablero" }).then(function (r) {
      if (!r || !r.ok) return;
      T = r; T.recibido = Date.now();
      revisarImpresion();
      MZ.refrescar();
    }).catch(function () {}).then(function () { pidiendoT = false; });
    // tiempo de espera estimado (acción pública del módulo de carga, si existe en el servidor)
    if (Date.now() - cargaTs > 60000 && MZ.API) {
      cargaTs = Date.now();
      fetch(MZ.API, { method: "POST", body: JSON.stringify({ ext: "carga", accion: "estado" }) }).then(function (x) { return x.json(); })
        .then(function (r) { CARGA = r && r.ok ? r : null; }).catch(function () { CARGA = null; });
    }
  }
  var vUltimo = "";
  function alSondear(r) {
    if (!r.igual || !T || Date.now() - tPedido > 30000 || S.v !== vUltimo) { vUltimo = S.v; pedirTablero(!r.igual); }
    // solo la pestaña abierta pide sus datos extra (las demás se cargan al abrirlas)
    if (S.vista !== "carta") {
      if (S.pest === "todos") pedirTVentas(!r.igual && Date.now() - TV.ts > 8000);
      if (S.pest === "cuentas" && CU.datos && (!CU.dia || CU.dia === CU.datos.hoy) && Date.now() - CU.ts > (r.igual ? 60000 : 12000)) pedirCuentas(true);
    }
    alarmaNuevos();
  }

  /* pedidos nuevos (web, sin aceptar): suenan al llegar y cada 30 s hasta que alguien los acepte */
  var vistos = MZ_leerVistos(), ultimaAlarma = 0;
  function MZ_leerVistos() { try { return JSON.parse(localStorage.getItem(K.vistos) || "{}") || {}; } catch (e) { return {}; } }
  function alarmaNuevos() {
    var nuevos = (S.externos || []).filter(function (x) { return x.estado === "Nuevo" && !x.acep; });
    var frescos = nuevos.filter(function (x) { return !vistos[x.id]; });
    if (frescos.length) {
      frescos.forEach(function (x) { vistos[x.id] = Date.now(); });
      var ks = Object.keys(vistos); if (ks.length > 300) ks.slice(0, ks.length - 300).forEach(function (k) { delete vistos[k]; });
      try { localStorage.setItem(K.vistos, JSON.stringify(vistos)); } catch (e) {}
      MZ.toast("🔔 Pedido nuevo #" + frescos[0].n + " · " + (frescos[0].canal === "delivery" ? "Delivery" : "Para llevar") + " · " + frescos[0].nombre, "ok");
    }
    if (nuevos.length && (frescos.length || Date.now() - ultimaAlarma > 30000)) { MZ.pitar(3, 1046); ultimaAlarma = Date.now(); }
  }

  /* =========================== ESTRUCTURA =========================== */
  function tabValida(t) { return !!NOMBRE_TAB[t]; }
  function irTab(t) {
    S.pest = t; MZ.guardar(MZ.K.pest, t); S.vista = "mesas"; S.mesa = null;
    if (t === "comp") pedirComp();
    if (t === "cuentas") pedirCuentas(!CU.datos || Date.now() - CU.ts > 10000);
    if (t === "todos") pedirTVentas(false);
    MZ.pintar(); window.scrollTo(0, 0);
  }
  function cuentaTab(t) {
    if (t === "todos") return activos().filter(function (x) { return x.col === "nuevo"; }).length;
    if (t === "llevar") return (S.externos || []).filter(function (x) { return !(x.estado === "Entregado" && x.pagado); }).length;
    if (t === "salon") return MZ.mesasSalon().filter(function (m) { var e = MZ.estadoMesa(m); return e === "llama" || e === "cuenta"; }).length;
    if (t === "comp") return T ? T.comp || 0 : 0;
    return 0;
  }
  function riel() {
    var r = h("nav", "lc-riel"); r.setAttribute("aria-label", "Secciones");
    TABS.forEach(function (t, i) {
      var b = btn("", "lc-riel__b" + (S.vista !== "carta" && S.pest === t[0] ? " on" : ""), function () { irTab(t[0]); });
      b.title = t[1] + " (" + (i + 1) + ")";
      b.appendChild(svg(t[2], "lc-ic")); b.appendChild(h("span", null, t[1]));
      var n = cuentaTab(t[0]); if (n) b.appendChild(h("i", "lc-badge" + (t[0] === "todos" ? " rojo" : ""), String(n)));
      r.appendChild(b);
    });
    return r;
  }
  function despues(main) {
    var v = document.querySelector(".lc-riel"); if (v) v.remove();
    document.body.appendChild(riel());
    document.body.classList.toggle("lc-en-carta", S.vista === "carta" && !!S.mesa);
    document.body.classList.toggle("lc-tab-tienda", S.vista !== "carta" && S.pest === "tienda");
  }
  /* barra superior: impresora + nuevo pedido */
  function top(t) {
    var marca = t.querySelector(".top__marca");
    if (marca) { marca.textContent = ""; marca.appendChild(h("span", "lc-marca", "Pasta Gallo")); marca.appendChild(h("small", "lc-marca__s", "Panel del local")); }
    var imp = T && T.imp, c = imp && imp.cola || {}, pend = (c.pend || 0) + (c.fall || 0);
    var est = !imp ? "…" : imp.viva ? "Impresora conectada" : respaldoOn() ? "Impresión por Chrome" : "Impresora sin programa";
    var b = btn("", "lc-imp " + (!imp ? "" : imp.viva ? "ok" : "mal") + (c.fall ? " fall" : ""), ventanaImpresora);
    b.appendChild(h("i", "lc-dot")); b.appendChild(h("span", null, est));
    if (pend) b.appendChild(h("b", null, pend + " pend."));
    b.title = "Estado de la impresora del local (programa de la computadora). Toca para ver la cola e imprimir pendientes.";
    t.appendChild(b);
    if (S.vista !== "carta") t.appendChild(btn("＋ Nuevo pedido", "lc-nuevo", menuNuevo));
  }
  function menuNuevo() {
    var c = h("div", "lc-nuevos");
    function op(ic, t, s, fn) { var b = btn("", "lc-nuevos__b", function () { MZ.cerrarModal(); fn(); }); b.appendChild(h("b", null, ic + " " + t)); b.appendChild(h("small", null, s)); c.appendChild(b); }
    op("🥡", "Para llevar", "Cliente que se acerca o llama para recoger", function () { MZ.nuevoExterno(MZ.LL); });
    op("🛵", "Delivery", "Cliente que llama o escribe por WhatsApp", function () { MZ.nuevoExterno(MZ.DL); });
    op("🍽", "Mesa", "Abrir o agregar a una mesa del salón", function () { irTab("salon"); });
    op("🛍", "Venta de tienda", "Productos de tienda (mostrador)", function () { S.tiendaSub = "vender"; irTab("tienda"); });
    MZ.abrirModal("Nuevo pedido", [c]);
  }

  /* =========================== PINTAR (según pestaña) =========================== */
  function pintar(main) {
    var tab = tabValida(S.pest) ? S.pest : "todos";
    var w = h("div", "lc-vista lc-v-" + tab);
    var cab = h("header", "lc-cab"); cab.appendChild(h("h1", null, NOMBRE_TAB[tab]));
    var sub = subtitulo(tab); if (sub) cab.appendChild(h("p", null, sub));
    cab.appendChild(h("span", "esp"));
    accionesCab(tab, cab);
    w.appendChild(cab);
    if (!S.recibido) { w.appendChild(h("p", "vacio", "Cargando el local…")); main.appendChild(w); return; }
    if (tab === "todos") vistaTodos(w);
    else if (tab === "llevar") vistaLlevar(w);
    else if (tab === "salon") vistaSalon(w);
    else if (tab === "cuentas") vistaCuentas(w);
    else if (tab === "comp") vistaComp(w);
    else if (tab === "tienda") vistaTienda(w);
    else vistaClientes(w);
    main.appendChild(w);
  }
  function subtitulo(tab) {
    var d = diaLima(), dias = ["domingo", "lunes", "martes", "miércoles", "jueves", "viernes", "sábado"], meses = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "setiembre", "octubre", "noviembre", "diciembre"];
    if (tab === "todos") return dias[d.getUTCDay()].replace(/^./, function (c) { return c.toUpperCase(); }) + " " + d.getUTCDate() + " de " + meses[d.getUTCMonth()] + (S.horario && S.horario.abre ? " · cocina " + S.horario.abre + "–" + S.horario.cierra : "");
    if (tab === "llevar") return "Pedidos sin mesa: recojo en el local y delivery (web, teléfono y WhatsApp)";
    if (tab === "salon") return "Mesas en vivo, por servir y cuentas";
    if (tab === "cuentas") return "Lo cobrado del día: cambiar el pago, editar, eliminar o anular";
    if (tab === "comp") return "Boletas y facturas por emitir y comprobantes nuevos";
    if (tab === "tienda") return "Venta de mostrador y compras · sin totales de caja";
    return "Busca por nombre o celular";
  }
  function accionesCab(tab, cab) {
    if (tab === "todos" || tab === "llevar") {
      cab.appendChild(btn("🥡 Para llevar", "btn peq lc-b", function () { MZ.nuevoExterno(MZ.LL); }));
      cab.appendChild(btn("🛵 Delivery", "btn peq lc-b vino", function () { MZ.nuevoExterno(MZ.DL); }));
    }
    if (tab === "salon") cab.appendChild(btn("🚫 No disponibles", "btn peq lc-b", ventanaNoDisp));
    if (tab === "comp") cab.appendChild(btn("＋ Nuevo comprobante", "btn peq lc-b vino", function () { if (!COMP) { pedirComp(true); MZ.toast("Cargando comprobantes… vuelve a tocar en un momento.", "ok"); return; } formComp({ nuevo: true, tit: "Nuevo", total: 0, cli: {} }); }));
    if (tab === "cuentas") {
      var fe = h("input", "campo lc-fecha"); fe.type = "date"; fe.value = CU.dia || (CU.datos && CU.datos.dia) || diaLima().toISOString().slice(0, 10);
      fe.setAttribute("aria-label", "Día"); fe.max = diaLima().toISOString().slice(0, 10);
      fe.addEventListener("change", function () { CU.dia = fe.value === diaLima().toISOString().slice(0, 10) ? "" : fe.value; CU.datos = null; fe.blur(); pedirCuentas(true); MZ.pintar(); });
      cab.appendChild(fe);
      cab.appendChild(btn("🔄 Actualizar", "btn peq lc-b", function () { pedirCuentas(true); }));
    }
  }
  /* la pestaña se repinta SOLO si cambió lo que muestra (así escribir o vender no se interrumpe) */
  function firma() {
    var tab = S.pest, min = Math.floor(Date.now() / 60000), imp = T && T.imp, c = imp && imp.cola || {};
    var base = [tab, S.vista, T ? [T.comp, imp ? imp.viva : "", c.pend, c.fall].join("/") : 0, (S.avisos || []).length, S.horario && S.horario.cocina];
    if (tab === "todos") return base.concat([T ? T.recibido : 0, S.v, JSON.stringify(AB), min, CARGA ? CARGA.min : "", firmaAgotados(), TV.ts]).join("|");
    if (tab === "llevar") return base.concat([T ? T.recibido : 0, S.v, AB.mapaLl, min]).join("|");
    if (tab === "salon") return base.concat([S.v, S.vistaM, min]).join("|");
    if (tab === "cuentas") return base.concat([CU.ts, CU.dia, CU.err]).join("|");
    if (tab === "comp") return base.concat([COMP ? COMP.ts : 0]).join("|");
    if (tab === "tienda") return base.concat([S.tiendaSub || "", INS ? INS.ts : 0]).join("|");
    return base.concat([CLI.ts]).join("|");
  }
  function firmaAgotados() { return Object.keys(MZ.PROD).filter(function (k) { return MZ.PROD[k].agotado; }).join(","); }

  /* =========================== «TODOS» =========================== */
  var COL = { nuevo: "Por atender", cocina: "En cocina", listo: "Listos", camino: "En camino" };
  function colDe(estado, ext) {
    if (estado === "Nuevo") return "nuevo";
    if (estado === "Confirmado" || estado === "En preparación") return "cocina";
    if (estado === "Listo" || (estado === "Entregado" && ext && !ext.pagado)) return "listo";
    if (estado === "En camino") return "camino";
    return "cocina";
  }
  /* todo lo que está en curso: pedidos de mesa con platos por servir y pedidos sin mesa (no entregados, o entregados sin cobrar) */
  function activos() {
    var r = [];
    (S.mesas || []).forEach(function (m) {
      if (!m.activa || m.unidaA) return;
      (m.pedidos || []).forEach(function (p) {
        if (!p.falta) return;
        r.push({ k: "m" + p.id, tipo: m.llevar ? "llevar" : "mesa", m: m, p: p, ts: p.ts, sal: p.ts, hora: p.hora, n: p.numero, estado: p.estado, col: colDe(p.estado),
          titulo: m.llevar ? "🥡 " + (m.etiqueta || "Para llevar") : "Mesa " + m.mesa, resp: m.atiende ? m.atiende.nombre : (p.mozo || ""), lineas: p.lineas || [], total: p.total });
      });
    });
    (S.externos || []).forEach(function (x) {
      if (x.estado === "Entregado" && x.pagado) return;
      r.push({ k: "e" + x.id, tipo: x.canal === "delivery" ? "delivery" : "llevar", x: x, ts: x.ts, sal: MZ.tsSalida(x), hora: x.hora, n: x.n, estado: x.estado, col: colDe(x.estado, x),
        titulo: (x.canal === "delivery" ? "🛵 " : "🥡 ") + x.nombre, resp: x.mozo || (x.origen === "web" || !x.origen ? "Web" : ""), lineas: x.lineas || [], total: x.aCobrar });
    });
    return r.sort(function (a, b) { return a.sal - b.sal; });
  }
  function vistaTodos(w) {
    var acts = activos();
    if (!TV.lista) pedirTVentas(false);
    w.appendChild(kpis(acts));
    var g = h("div", "lc-grid"), izq = h("div", "lc-main"), der = h("aside", "lc-aside");
    // bloques por canal, en el orden que toca a esta hora: salón, para llevar y delivery, tienda
    var mesa = acts.filter(function (x) { return x.tipo === "mesa" || (x.tipo === "llevar" && !x.x); }), ext = acts.filter(function (x) { return !!x.x; });
    ordenBloques().forEach(function (b) {
      if (b === "salon") izq.appendChild(bloqueSalonTodos(mesa));
      else if (b === "llevar") izq.appendChild(bloqueLlevarTodos(ext));
      else izq.appendChild(bloqueTiendaTodos());
    });
    // desplegables: salón, mapa de delivery, historial
    var mp = MZ.mapaSalon(); if (mp) { mp.classList.add("lc-plegable"); izq.appendChild(mp); }
    izq.appendChild(mapaDelivery("mapaTodos", "🛵 Mapa de delivery del día"));
    izq.appendChild(historial());
    der.appendChild(cardPromo());
    der.appendChild(cardNoDisp());
    der.appendChild(cardComp());
    der.appendChild(cardImpresora());
    var rp = cardReparto(); if (rp) der.appendChild(rp);
    g.appendChild(izq); g.appendChild(der); w.appendChild(g);
  }
  function cabBloque(ic, tit, n, extra) {
    var c = h("div", "lc-blq__cab"); c.appendChild(h("h2", null, ic + " " + tit)); c.appendChild(h("span", "lc-n", String(n)));
    c.appendChild(h("span", "esp")); if (extra) c.appendChild(extra); return c;
  }
  function bloqueSalonTodos(items) {
    var s = h("section", "lc-blq lc-blq--salon"); s.dataset.bloque = "salon";
    s.appendChild(cabBloque("🍽", "Salón", items.length, btn("Ver salón ›", "lc-link", function () { irTab("salon"); })));
    var gr = h("div", "lc-blq__grid");
    if (!items.length) gr.appendChild(h("p", "lc-col__vacio", "Ningún plato por servir en el salón."));
    items.forEach(function (x) { gr.appendChild(tarjeta(x)); });
    s.appendChild(gr); return s;
  }
  function bloqueTiendaTodos() {
    var s = h("section", "lc-blq lc-blq--tienda"); s.dataset.bloque = "tienda";
    var l = (TV.lista || []).filter(function (v) { return v.estado !== "Anulada"; }), tot = l.reduce(function (a, v) { return a + (Number(v.total) || 0); }, 0);
    var nv = btn("＋ Venta", "lc-a ok", function () { S.tiendaSub = "vender"; MZ.guardar(K.tiendaSub, "vender"); irTab("tienda"); });
    s.appendChild(cabBloque("🛍", "Tienda · hoy", l.length, nv));
    if (!TV.lista) { s.appendChild(h("p", "lc-col__vacio", "Cargando ventas de tienda…")); return s; }
    if (!l.length) { s.appendChild(h("p", "lc-col__vacio", "Todavía no hay ventas de tienda hoy.")); return s; }
    var ul = h("div", "lc-tv");
    l.slice().reverse().slice(0, 12).forEach(function (v) {
      var f = h("div", "lc-tv__f");
      f.appendChild(h("b", null, "N° " + (v.numero || v.id) + " · " + (v.hora || "")));
      f.appendChild(h("span", null, txtLineas(v.lineas)));
      f.appendChild(h("small", null, txtPagos(v.pagos) + (v.cajero ? " · " + v.cajero : "")));
      f.appendChild(h("b", "lc-tv__m", soles(v.total)));
      ul.appendChild(f);
    });
    s.appendChild(ul);
    s.appendChild(h("p", "lc-nota", (l.length > 12 ? "Últimas 12 de " + l.length + " · " : "") + "Total de tienda hoy " + soles(tot) + " · el detalle está en 💰 Cuentas"));
    return s;
  }
  function pedirTVentas(forzar) {
    if (TV.pidiendo || !S.t) return; if (!forzar && TV.lista && Date.now() - TV.ts < 20000) return;
    TV.pidiendo = true;
    accion({ mz: "l_tventas" }).then(function (r) { TV.lista = Array.isArray(r) ? r : (r && (r.ventas || r.lista)) || []; TV.ts = Date.now(); MZ.refrescar(); })
      .catch(function () { if (!TV.lista) { TV.lista = []; TV.ts = Date.now(); MZ.refrescar(); } }).then(function () { TV.pidiendo = false; });
  }
  function txtLineas(ls) {
    return (ls || []).map(function (l) { return typeof l === "string" ? l : l.t || ((l.cant != null ? l.cant + " × " : "") + (l.nombre || l.n || l.descripcion || "") + (l.tam ? " " + l.tam : "")); }).join(" · ");
  }
  function txtPagos(ps) {
    if (typeof ps === "string") return ps;
    return (ps || []).map(function (p) { return typeof p === "string" ? p : (p.metodo || "") + (p.monto != null ? " " + soles(p.monto) : "") + (Number(p.propina) ? " (+ propina " + soles(p.propina) + ")" : ""); }).join(" + ");
  }
  /* para llevar y delivery: tablero por estado (en orden de salida) */
  function bloqueLlevarTodos(acts) {
    var s = h("section", "lc-blq lc-blq--llevar"); s.dataset.bloque = "llevar";
    s.appendChild(cabBloque("🥡", "Para llevar y delivery", acts.length));
    var board = h("div", "lc-board");
    ["nuevo", "cocina", "listo", "camino"].forEach(function (c) {
      var items = acts.filter(function (x) { return x.col === c; });
      if (c === "camino" && !items.length && !acts.some(function (x) { return x.tipo === "delivery"; })) return;
      var col = h("div", "lc-col lc-col--" + c), ch = h("div", "lc-col__cab");
      ch.appendChild(h("b", null, COL[c])); ch.appendChild(h("span", "lc-n", String(items.length)));
      col.appendChild(ch);
      if (!items.length) col.appendChild(h("p", "lc-col__vacio", c === "nuevo" ? "Nada por atender ✓" : c === "cocina" ? "Cocina sin pedidos" : c === "listo" ? "Nada listo por entregar" : "Ningún delivery en ruta"));
      items.forEach(function (x) { col.appendChild(tarjeta(x)); });
      board.appendChild(col);
    });
    board.classList.add("n" + board.childNodes.length);
    s.appendChild(board);
    return s;
  }
  function kpis(acts) {
    var k = T && T.kpi, w = h("section", "lc-kpis");
    function card(tit, val, sub, cls, title) {
      var d = h("div", "lc-kpi" + (cls ? " " + cls : "")); d.appendChild(h("span", "lc-kpi__t", tit)); d.appendChild(h("b", "lc-kpi__v", val));
      if (sub) { var s = h("span", "lc-kpi__s"); if (sub.nodeType) s.appendChild(sub); else s.textContent = sub; d.appendChild(s); }
      if (title) d.title = title; w.appendChild(d);
    }
    function pct(p) {
      if (p == null) return h("span", "lc-pct", "sin datos de la semana pasada");
      var s = h("span", "lc-pct " + (p >= 0 ? "sube" : "baja"), (p >= 0 ? "▲ +" : "▼ ") + p.toFixed(1).replace(".0", "") + "%");
      var f = document.createDocumentFragment(); f.appendChild(s); f.appendChild(document.createTextNode(" vs " + diaSemana(-7) + " pasado")); return f;
    }
    var activas = MZ.mesasSalon(), ocup = activas.filter(function (m) { return m.estado !== "libre" && m.estado !== "unida"; }).length;
    var cuentas = activas.filter(function (m) { return MZ.estadoMesa(m) === "cuenta"; }).length;
    var nM = acts.filter(function (x) { return x.tipo === "mesa"; }).length, nL = acts.filter(function (x) { return x.tipo === "llevar"; }).length, nD = acts.filter(function (x) { return x.tipo === "delivery"; }).length;
    card("Ventas de hoy", k ? soles(k.hoy.ventas) : "…", k ? pct(k.pct) : "", "grande", "Restaurante (mesa, para llevar y delivery), sin cancelados. Comparado con el mismo día de la semana pasada hasta esta hora.");
    card("Pedidos hoy", k ? String(k.hoy.pedidos) : "…", k ? pct(k.pctPedidos) : "");
    card("Ticket promedio", k ? soles(k.hoy.ticket) : "…", k ? k.hoy.cuentas + (k.hoy.cuentas === 1 ? " cuenta" : " cuentas") : "");
    card("Mesas activas", ocup + " / " + activas.length, cuentas ? "🧾 " + cuentas + " piden la cuenta" : (ocup ? "ocupadas ahora" : "salón libre"));
    card("En curso", String(nM + nL + nD), "Mesa " + nM + " · Llevar " + nL + " · Delivery " + nD);
    var enCocina = acts.filter(function (x) { return x.col === "cocina"; }).length;
    var esp = CARGA && CARGA.min != null ? "~" + CARGA.min + " min" : enCocina ? "~" + Math.min(60, 15 + enCocina * 4) + " min" : "Sin espera";
    card("Espera estimada", esp, CARGA && CARGA.texto ? CARGA.texto : enCocina + (enCocina === 1 ? " pedido en cocina" : " pedidos en cocina"), enCocina >= 8 ? "alerta" : "",
      CARGA ? "Cálculo del servidor (carga de cocina)." : "Estimado simple: 15 min + 4 min por pedido en cocina (máx. 60).");
    return w;
  }
  function diaSemana(desplaz) { var d = diaLima(); return ["domingo", "lunes", "martes", "miércoles", "jueves", "viernes", "sábado"][(d.getUTCDay() + 70 + desplaz) % 7]; }

  /* tarjeta de un pedido en el tablero, con acciones rápidas */
  function tarjeta(x) {
    var e = x.x, cls = "lc-t t-" + x.tipo + " c-" + x.col + (e && e.pe === "Por verificar" ? " porpagar" : "") + (e && x.estado === "Nuevo" && !e.acep ? " sinacep" : "");
    var d = h("article", cls);
    var cab = h("div", "lc-t__cab");
    var tt = btn("", "lc-t__tit", function () { if (e) MZ.detalleExt(e); else MZ.tocarMesa(x.m); });
    tt.appendChild(h("b", null, x.titulo)); tt.appendChild(h("small", null, "#" + x.n + " · " + (e && e.prog ? "⏰ " + e.prog : x.hora) + " · hace " + haceTxt(x.ts)));
    cab.appendChild(tt);
    cab.appendChild(h("span", "lc-chip e-" + (MZ.CLS_EST[x.estado] || "otro"), x.estado === "Entregado" ? "Entregado" : x.estado === "Listo" ? "🔔 Listo" : x.estado));
    d.appendChild(cab);
    var ul = h("ul", "lc-t__l");
    x.lineas.slice(0, 4).forEach(function (l) { ul.appendChild(h("li", null, (l.e || l.t) + (l.d ? " · " + l.d : ""))); });
    if (x.lineas.length > 4) ul.appendChild(h("li", "mas", "+ " + (x.lineas.length - 4) + " más"));
    d.appendChild(ul);
    var meta = h("div", "lc-t__meta");
    meta.appendChild(h("b", null, soles(x.total)));
    if (e) meta.appendChild(h("span", "lc-pago " + (e.pagado ? "ok" : e.pe === "Por verificar" ? "verif" : "porc"), e.pagado ? "✓ Pagado" + (e.pago ? " · " + e.pago : "") : e.pe === "Por verificar" ? "Pago por confirmar · " + e.pago : "Por cobrar" + (e.pago ? " · " + e.pago : "")));
    if (x.resp) meta.appendChild(h("span", "lc-resp", (e && !e.mozo ? "🌐 " : "🤵 ") + x.resp));
    if (e && e.canal === "delivery") { var rep = repDe(e.id); if (rep) meta.appendChild(h("span", "lc-resp", "🛵 " + rep)); }
    d.appendChild(meta);
    d.appendChild(acciones(x));
    return d;
  }
  function repDe(id) { var f = T && T.reparto && (T.reparto.filas || []).filter(function (r) { return r.numero === id; })[0]; return f && f.repartidor ? f.repartidor : ""; }
  function acciones(x) {
    var a = h("div", "lc-t__acc"), e = x.x;
    if (!e) {   // pedido de mesa
      a.appendChild(btn("Abrir mesa", "lc-a", function () { MZ.tocarMesa(x.m); }));
      if (x.estado === "Listo") a.appendChild(btn("✓ Servido", "lc-a ok", function () { MZ.entregar(x.p, "todo", true); }));
      a.appendChild(btn("✎", "lc-a ic", function () { editarPedidoLocal(x.p.id, "Mesa " + x.m.mesa + " · #" + x.n); }, "Editar pedido"));
      a.appendChild(btn("🗑", "lc-a ic", function () { eliminarPedido(x.p.id, "#" + x.n + " de la mesa " + x.m.mesa, x.total); }, "Eliminar pedido"));
      a.appendChild(btn("🖨", "lc-a ic", function () { reimprimir(x.p.id, ["cocina"]); }, "Reimprimir comanda de cocina"));
      return a;
    }
    if (e.pe === "Por verificar") {
      if (e.cap) a.appendChild(btn("🧾 Captura", "lc-a", function () { verCaptura(e); }));
      a.appendChild(btn("✓ Confirmar pago", "lc-a ok", function () { confirmarPago(e); }));
      if (e.estado === "Nuevo" && !e.acep) a.appendChild(btn("Aceptar", "lc-a", function () { aceptar(e); }));
    } else if (e.estado === "Nuevo") a.appendChild(btn("✓ Aceptar y confirmar", "lc-a ok", function () { estado(e, "Confirmado"); }));
    if (e.estado === "Confirmado") a.appendChild(btn("▶ En preparación", "lc-a", function () { estado(e, "En preparación"); }));
    if (e.estado === "En preparación" || e.estado === "Confirmado") a.appendChild(btn("✓ Listo", "lc-a ok", function () { estado(e, "Listo"); }));
    if (e.estado === "Listo" && e.canal === "delivery") a.appendChild(btn("🛵 En camino", "lc-a vino", function () { estado(e, "En camino"); }));
    if ((e.estado === "Listo" && e.canal !== "delivery") || e.estado === "En camino") a.appendChild(btn("✓ Entregado", "lc-a ok", function () { entregado(e); }));
    if (!e.pagado && e.pe !== "Por verificar") a.appendChild(btn("💳 Cobrar", "lc-a azul", function () { MZ.cobrarExt(e); }));
    if (e.canal === "delivery" && T && T.reparto && (T.reparto.repartidores || []).length && ["Entregado", "En camino"].indexOf(e.estado) === -1) a.appendChild(btn("Asignar", "lc-a", function () { asignar(e); }));
    a.appendChild(btn("Pago", "lc-a", function () { cambiarPagoPedido({ numero: e.id, nro: e.n, canal: e.canal, nombre: e.nombre, pago: e.pago, total: e.aCobrar }); }, "Cambiar el método de pago"));
    a.appendChild(btn("✎", "lc-a ic", function () { editarPedidoLocal(e.id, "#" + e.n + " " + e.nombre); }, "Editar pedido"));
    a.appendChild(btn("🗑", "lc-a ic", function () { eliminarPedido(e.id, "#" + e.n + " de " + e.nombre, e.aCobrar); }, "Eliminar pedido"));
    a.appendChild(btn("🖨", "lc-a ic", function () { reimprimir(e.id); }, "Reimprimir"));
    return a;
  }
  function btnIc(b, t) { b.title = t; b.setAttribute("aria-label", t); return b; }
  function estado(e, nuevo) {
    var antes = e.estado;
    if (nuevo === "Entregado" && !e.pagado && !confirm("El pedido #" + e.n + " todavía no está cobrado. ¿Marcarlo como entregado igual?")) return;
    e.estado = nuevo; MZ.refrescar(); MZ.pintar();
    llamar({ mz: "l_estado", id: e.id, estado: nuevo, esperado: antes }).then(function (r) {
      if (!r.ok) { e.estado = antes; MZ.toast(r.error || "No se pudo cambiar.", "mal"); }
      else MZ.toast("#" + e.n + " → " + nuevo, "ok");
      S.v = ""; MZ.sondear();
    }).catch(function () { e.estado = antes; MZ.toast("Sin conexión: no se cambió.", "mal"); MZ.pintar(); });
  }
  function entregado(e) { estado(e, "Entregado"); }
  function aceptar(e) {
    e.acep = "ahora"; MZ.pintar();
    llamar({ mz: "l_aceptar", id: e.id }).then(function (r) { if (!r.ok) MZ.toast(r.error || "No se pudo.", "mal"); S.v = ""; MZ.sondear(); }).catch(function () { MZ.toast("Sin conexión.", "mal"); });
  }
  function confirmarPago(e) {
    if (!confirm("¿Ya verificaste en " + (e.pago || "la app") + " que llegó " + soles(e.aCobrar) + " del pedido #" + e.n + " (" + e.nombre + ")?")) return;
    llamar({ mz: "l_pago", id: e.id }).then(function (r) {
      if (!r.ok) { MZ.toast(r.error || "No se pudo confirmar.", "mal"); return; }
      e.pe = "Confirmado"; e.pagado = true; if (e.estado === "Nuevo") e.estado = "Confirmado";
      MZ.toast("✓ Pago confirmado · #" + e.n, "ok"); S.v = ""; MZ.sondear(); MZ.pintar();
    }).catch(function () { MZ.toast("Sin conexión.", "mal"); });
  }
  function verCaptura(e) {
    var c = h("div", "lc-captura"); c.appendChild(h("p", "vacio", "Cargando la captura…"));
    MZ.abrirModal("🧾 Captura de pago · #" + e.n + " · " + soles(e.aCobrar), [c], [btn("Cerrar", "btn", MZ.cerrarModal), btn("✓ Confirmar pago", "btn prim", function () { MZ.cerrarModal(); confirmarPago(e); })]);
    llamar({ mz: "l_captura", id: e.id }).then(function (r) {
      c.textContent = "";
      if (!r.ok) { c.appendChild(h("p", "err", r.error || "No se pudo leer.")); return; }
      var img = h("img"); img.alt = "Captura del pago"; img.src = /^data:image\//.test(r.img) ? r.img : "data:image/jpeg;base64," + r.img; c.appendChild(img);
    }).catch(function () { c.textContent = "Sin conexión."; });
  }
  function reimprimir(id, tipos) {
    llamar({ mz: "l_reimp", id: id, tipos: tipos || null }).then(function (r) {
      if (!r || r.ok === false) { MZ.toast((r && r.error) || "No se pudo reimprimir.", "mal"); return; }
      MZ.toast(r.viva ? "🖨 Reimprimiendo #" + id + "…" : "🖨 En cola: sale cuando la impresora del local esté conectada", "ok"); pedirTablero(true);
    }).catch(function () { MZ.toast("Sin conexión.", "mal"); });
  }
  function asignar(e) {
    var reps = (T && T.reparto && T.reparto.repartidores) || [], c = h("div", "lc-reps");
    reps.forEach(function (r) {
      var b = btn("", "lc-rep" + (r.enLinea ? " linea" : ""), function () {
        c.querySelectorAll("button").forEach(function (y) { y.disabled = true; });
        llamar({ mz: "l_asignar", id: e.id, rep: r.id }).then(function (x) {
          if (!x.ok) { MZ.toast(x.error || "No se pudo asignar.", "mal"); c.querySelectorAll("button").forEach(function (y) { y.disabled = false; }); return; }
          MZ.cerrarModal(); MZ.toast("🛵 #" + e.n + " asignado a " + r.nombre, "ok"); pedirTablero(true);
        }).catch(function () { MZ.toast("Sin conexión.", "mal"); });
      });
      b.appendChild(h("i", "lc-dot")); b.appendChild(h("b", null, r.nombre)); b.appendChild(h("small", null, (r.enLinea ? r.estado : "sin conexión") + (r.activos ? " · " + r.activos + " en curso" : "")));
      c.appendChild(b);
    });
    var actual = (T.reparto.filas || []).filter(function (f) { return f.numero === e.id; })[0];
    var pie = [btn("Cerrar", "btn", MZ.cerrarModal)];
    if (actual && (actual.estado === "Asignado" || actual.estado === "Ofrecido")) pie.unshift(btn("Liberar", "btn", function () {
      llamar({ mz: "l_liberar", id: e.id }).then(function (x) { MZ.toast(x.ok ? "Liberado: se ofrece de nuevo" : x.error, x.ok ? "ok" : "mal"); MZ.cerrarModal(); pedirTablero(true); });
    }));
    MZ.abrirModal("🛵 Asignar repartidor · #" + e.n + " " + e.nombre, [h("p", "vacio", actual && actual.repartidor ? "Ahora: " + actual.repartidor + " (" + actual.estado + ")" : "Sin repartidor asignado."), c], pie);
  }

  /* ---------- columna derecha de «Todos» ---------- */
  function caja(tit, cls) { var d = h("section", "lc-card" + (cls ? " " + cls : "")); d.appendChild(h("h3", null, tit)); return d; }
  function promoEnFecha(pr, iso) {
    if (pr.desde && iso < pr.desde) return false;
    if (pr.hasta && iso > pr.hasta) return false;
    if (pr.excluir && pr.excluir.indexOf(iso) >= 0) return false;
    if (pr.extra && pr.extra.indexOf(iso) >= 0) return true;
    var p = iso.split("-"); return !pr.dias || pr.dias.indexOf(new Date(Date.UTC(+p[0], +p[1] - 1, +p[2])).getUTCDay()) >= 0;
  }
  function promosHoy() {
    var iso = diaLima().toISOString().slice(0, 10), out = [];
    (MZ.C.secciones || []).forEach(function (s) {
      (s.grupos || []).forEach(function (g) { (g.items || []).forEach(function (it) {
        if ((it.promo && promoEnFecha(it.promo, iso)) || (it.destacado === "hoy" && !it.agotado)) out.push(it);
      }); });
    });
    return out;
  }
  function proximaPromo() {
    var base = diaLima(), dias = ["domingo", "lunes", "martes", "miércoles", "jueves", "viernes", "sábado"];
    for (var i = 1; i <= 14; i++) {
      var d = new Date(base.getTime() + i * 86400000), iso = d.toISOString().slice(0, 10), hit = null;
      (MZ.C.secciones || []).forEach(function (s) { (s.grupos || []).forEach(function (g) { (g.items || []).forEach(function (it) { if (!hit && it.promo && promoEnFecha(it.promo, iso)) hit = it; }); }); });
      if (hit) return { it: hit, dia: i === 1 ? "mañana" : dias[d.getUTCDay()] };
    }
    return null;
  }
  function fotoUrl(it) { var u = String(it.foto || ""); if (!u) return ""; return /^(https?:|data:|\/)/.test(u) ? u : "/" + u; }
  function cardPromo() {
    var d = caja("⭐ Promoción de hoy", "lc-promo"), ps = promosHoy();
    if (!ps.length) {
      d.appendChild(h("p", "lc-vacio", "Hoy no hay promoción activa."));
      var px = proximaPromo(); if (px) d.appendChild(h("p", "lc-nota", "Próxima: " + px.dia + " · " + px.it.n + (px.it.p != null ? " (" + soles(px.it.p) + ")" : "")));
      return d;
    }
    ps.slice(0, 3).forEach(function (it) {
      var f = h("div", "lc-promo__i");
      var fu = fotoUrl(it); if (fu) { var ft = h("div", "lc-promo__f"); ft.style.backgroundImage = "url('" + fu.replace(/'/g, "%27") + "')"; f.appendChild(ft); }
      var tx = h("div", "lc-promo__tx"); tx.appendChild(h("b", null, it.n)); if (it.g) tx.appendChild(h("small", null, it.g));
      tx.appendChild(h("span", "lc-promo__p", it.p != null ? soles(it.p) + (it.pa ? " · antes " + soles(it.pa) : "") : ""));
      if (it.agotado) tx.appendChild(h("span", "lc-agot", "No disponible"));
      f.appendChild(tx); d.appendChild(f);
    });
    return d;
  }
  function noDisponibles() {
    var r = Object.keys(MZ.PROD).map(function (k) { return MZ.PROD[k]; }).filter(function (it) { return it.agotado; });
    (MZ.SALSAS_TODAS || []).forEach(function (x) { if (x.agotado) r.push({ id: x.id, n: "Salsa " + (x.n || x.id), _salsa: x }); });
    return r;
  }
  function cambiarDisp(it, disponible, luego) {
    if (!disponible && !confirm("¿Marcar «" + (MZ.nombreEs(it) || it.n) + "» como NO disponible hoy? No se podrá pedir (mesa, QR, web ni delivery) hasta reactivarlo.")) return;
    if (it._salsa) it._salsa.agotado = !disponible; else it.agotado = !disponible;
    if (luego) luego();
    MZ.refrescar(); MZ.pintar();
    llamar({ mz: "l_disp", id: it.id, disponible: disponible }).then(function (r) {
      if (!r.ok) { MZ.toast(r.error || "No se pudo guardar.", "mal"); if (it._salsa) it._salsa.agotado = disponible; else it.agotado = disponible; MZ.pintar(); return; }
      MZ.toast(disponible ? "✓ " + (MZ.nombreEs(it) || it.n) + " disponible otra vez" : "🚫 " + (MZ.nombreEs(it) || it.n) + " no disponible hoy", "ok"); S.v = "";
    }).catch(function () { MZ.toast("Sin conexión: no se guardó.", "mal"); });
  }
  function cardNoDisp() {
    var d = caja("🚫 No disponibles hoy", "lc-nodisp"), l = noDisponibles();
    if (!l.length) d.appendChild(h("p", "lc-vacio", "Toda la carta disponible."));
    l.slice(0, 12).forEach(function (it) {
      var f = h("div", "lc-nd"); f.appendChild(h("span", null, MZ.nombreEs(it) || it.n));
      f.appendChild(btn("Reactivar", "lc-a ok", function () { cambiarDisp(it, true); })); d.appendChild(f);
    });
    if (l.length > 12) d.appendChild(h("p", "lc-vacio", "+ " + (l.length - 12) + " más"));
    d.appendChild(btn("＋ Marcar no disponible", "lc-link", ventanaNoDisp));
    return d;
  }
  function ventanaNoDisp() {
    var bus = h("input", "campo"); bus.type = "search"; bus.placeholder = "Buscar plato o producto…";
    var lista = h("div", "agot");
    var todos = Object.keys(MZ.PROD).map(function (k) { return MZ.PROD[k]; }).concat((MZ.SALSAS_TODAS || []).map(function (x) { return { id: x.id, n: "Salsa " + (x.n || x.id), _salsa: x }; }));
    function ag(it) { return it._salsa ? !!it._salsa.agotado : !!it.agotado; }
    function pintarL() {
      lista.textContent = "";
      var q = MZ.norm(bus.value).trim();
      todos.filter(function (it) { return !q || MZ.norm((MZ.nombreEs(it) || "") + " " + it.n + " " + (it.g || "")).indexOf(q) >= 0; })
        .sort(function (a, b) { return ag(b) - ag(a); }).slice(0, 80).forEach(function (it) {
          var a = ag(it), f = btn("", "agot__f" + (a ? " on" : ""), function () { cambiarDisp(it, a, pintarL); });
          f.appendChild(h("span", null, (MZ.nombreEs(it) || it.n) + (it._sec ? " · " + (it._sec.id === "tienda" ? "Tienda" : it._sec.titulo || "") : "")));
          f.appendChild(h("b", null, a ? "🚫 No disponible · reactivar" : "Disponible")); lista.appendChild(f);
        });
    }
    bus.addEventListener("input", pintarL); pintarL();
    MZ.abrirModal("🚫 Disponibilidad de hoy", [h("p", "vacio", "Se aplica al instante en el salón, el QR de mesa, la web y el delivery. Queda registrado quién lo cambió."), bus, lista]);
    setTimeout(function () { bus.focus(); }, 60);
  }
  function cardComp() {
    var d = caja("🧾 Comprobantes por emitir", "lc-compc"), n = T ? T.comp || 0 : 0;
    var f = h("div", "lc-big"); f.appendChild(h("b", n ? "rojo" : "", String(n))); f.appendChild(h("span", null, n === 1 ? "pedido pidió boleta o factura" : "pedidos pidieron boleta o factura"));
    d.appendChild(f);
    d.appendChild(btn("Ir a comprobantes ›", "lc-link", function () { irTab("comp"); }));
    return d;
  }
  function cardImpresora() {
    var d = caja("🖨 Impresora del local", "lc-impc"), imp = T && T.imp;
    if (!imp) { d.appendChild(h("p", "lc-vacio", "Consultando…")); return d; }
    var c = imp.cola || {};
    var est = h("p", "lc-imp-est " + (imp.viva ? "ok" : "mal"));
    est.appendChild(h("i", "lc-dot"));
    est.appendChild(document.createTextNode(imp.viva ? "Conectada · último latido hace " + (imp.haceSeg || 0) + " s" : imp.latido ? "Sin señal del programa (hace " + haceTxt(imp.latido) + ")" : "Programa local no conectado"));
    d.appendChild(est);
    var l = h("div", "lc-imp-n");
    [["Pendientes", c.pend || 0], ["Con error", c.fall || 0], ["Programados", c.prog || 0]].forEach(function (x) { var s = h("div"); s.appendChild(h("b", x[0] === "Con error" && x[1] ? "rojo" : "", String(x[1]))); s.appendChild(h("small", null, x[0])); l.appendChild(s); });
    d.appendChild(l);
    if (!imp.viva) d.appendChild(h("p", "lc-nota", respaldoOn() ? "Respaldo activo: esta computadora imprime por Chrome lo pendiente." : "Respaldo por Chrome apagado en este equipo."));
    if (!imp.auto) d.appendChild(h("p", "lc-nota", "La impresión automática está apagada (Administración)."));
    d.appendChild(btn("🖨 Imprimir pendientes", "btn peq lc-b", imprimirPendientes));
    return d;
  }
  function cardReparto() {
    var rp = T && T.reparto; if (!rp || !(rp.repartidores || []).length) return null;
    var d = caja("🛵 Repartidores", "lc-repc");
    rp.repartidores.forEach(function (r) {
      var f = h("div", "lc-repf" + (r.enLinea ? " linea" : "")); f.appendChild(h("i", "lc-dot"));
      f.appendChild(h("b", null, r.nombre)); f.appendChild(h("small", null, !r.vinculado ? "sin enlace" : r.enLinea ? (r.activos ? "en ruta · " + r.activos : r.estado || "disponible") : "sin conexión"));
      d.appendChild(f);
    });
    var sin = (rp.filas || []).filter(function (f) { return !f.repartidor && ["Pendiente", "Ofrecido"].indexOf(f.estado) >= 0; }).length;
    if (sin) d.appendChild(h("p", "lc-nota rojo", sin + (sin === 1 ? " delivery listo sin repartidor" : " deliveries listos sin repartidor")));
    return d;
  }
  function historial() {
    var d = h("details", "lc-hist lc-plegable"); if (AB.hist) d.open = true;
    d.addEventListener("toggle", function () { AB.hist = d.open; guardarAb(); });
    var l = (T && T.hist) || [], tot = l.reduce(function (a, x) { return a + (x.total || 0); }, 0);
    var sm = h("summary"); sm.appendChild(h("span", null, "📜 Historial del día · " + l.length + (l.length === 1 ? " entregado o cobrado" : " entregados o cobrados"))); d.appendChild(sm);
    if (!l.length) { d.appendChild(h("p", "lc-vacio", "Todavía no hay pedidos entregados ni cuentas cobradas hoy.")); return d; }
    var tb = h("table", "lc-tabla"), th = h("tr");
    ["Hora", "Tipo", "Cliente / mesa", "Pago", "Estado", "Total"].forEach(function (t) { th.appendChild(h("th", null, t)); }); tb.appendChild(th);
    l.forEach(function (x) {
      var tr = h("tr");
      tr.appendChild(h("td", null, x.hora));
      tr.appendChild(h("td", null, x.tipo === "mesa" ? "🍽 Mesa" : x.tipo === "delivery" ? "🛵 Delivery" : "🥡 Llevar"));
      tr.appendChild(h("td", null, x.tipo === "mesa" ? "Mesa " + x.mesa + (x.mozo ? " · " + x.mozo : "") : "#" + x.n + " " + (x.nombre || "")));
      tr.appendChild(h("td", null, x.pago || (x.pagado ? "Pagado" : "—")));
      tr.appendChild(h("td", null, x.estado + (x.tipo !== "mesa" && !x.pagado && x.estado !== "Cancelado" ? " · por cobrar" : "")));
      tr.appendChild(h("td", "num", soles(x.total)));
      tb.appendChild(tr);
    });
    d.appendChild(tb);
    d.appendChild(h("p", "lc-nota", "Suma de lo listado: " + soles(tot)));
    return d;
  }

  /* ---------- mapa de delivery: activos (color por estado) y entregados hoy (gris) ---------- */
  var MAPAS = {};
  function puntosDelivery(conEntregados) {
    var act = (S.externos || []).filter(function (x) { return x.canal === "delivery" && x.lat != null && x.lng != null && !(x.estado === "Entregado" && x.pagado); })
      .map(function (x) { return { lat: x.lat, lng: x.lng, n: x.n, nombre: x.nombre, estado: x.estado, dir: x.dir, total: x.aCobrar, x: x }; });
    var ent = conEntregados ? ((T && T.hist) || []).filter(function (x) { return x.tipo === "delivery" && x.lat != null && x.lng != null; })
      .map(function (x) { return { lat: x.lat, lng: x.lng, n: x.n, nombre: x.nombre, estado: "Entregado", total: x.total, ent: true }; }) : [];
    return act.concat(ent);
  }
  function mapaDelivery(clave, titulo, siempre) {
    var abiertoM = siempre || !!AB[clave], pts = puntosDelivery(true);
    var nAct = pts.filter(function (p) { return !p.ent; }).length, nEnt = pts.length - nAct;
    var sinUbi = (S.externos || []).filter(function (x) { return x.canal === "delivery" && (x.lat == null || x.lng == null) && x.estado !== "Entregado"; }).length;
    var w = h("section", "mapa mapa-del lc-plegable" + (abiertoM ? " abierto" : ""));
    if (!siempre) {
      var cab = btn("", "mapa__cab", function () { AB[clave] = !AB[clave]; guardarAb(); MZ.pintar(); });
      cab.setAttribute("aria-expanded", abiertoM ? "true" : "false");
      cab.appendChild(h("span", "mapa__t", titulo + " · " + nAct + " en curso · " + nEnt + " entregados"));
      if (sinUbi) cab.appendChild(h("span", "mapa__b", sinUbi + " sin ubicación"));
      cab.appendChild(h("span", "esp")); cab.appendChild(h("span", "mapa__f", abiertoM ? "▴" : "▾"));
      w.appendChild(cab);
    }
    if (!abiertoM) return w;
    var M = MAPAS[clave] || (MAPAS[clave] = { div: h("div", "mapa-lf lc-lf"), mapa: null, capa: null });
    var cuerpo = h("div", "mapa__cuerpo"); cuerpo.appendChild(M.div);
    var lg = h("div", "mapa__leyenda");
    [["nuevo", "Por atender"], ["prep", "En cocina"], ["listo", "Listo"], ["camino", "En camino"], ["ent", "Entregado"]].forEach(function (x) { lg.appendChild(h("span", "lg lc-lg-" + x[0], x[1])); });
    cuerpo.appendChild(lg); w.appendChild(cuerpo);
    MZ.cargarLeaflet(function () { setTimeout(function () { pintarMapa(M, pts); }, 0); });
    return w;
  }
  var COLOR = { "Nuevo": "#b6232a", "Confirmado": "#2d5f8a", "En preparación": "#2d5f8a", "Listo": "#2f7a3a", "En camino": "#6b3fa0", "Entregado": "#9a8f86" };
  function pintarMapa(M, pts) {
    var L = window.L; if (!L || !M.div.isConnected) return;
    var loc = ((MZ.C.pedidos || {}).deliveryTarifas || {}).local || { lat: -8.1278775, lng: -79.040603 };
    if (!M.mapa) {
      M.mapa = L.map(M.div, { zoomControl: true, attributionControl: true, scrollWheelZoom: true });
      L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", { maxZoom: 19, attribution: "© OpenStreetMap" }).addTo(M.mapa);
      M.capa = L.layerGroup().addTo(M.mapa);
    }
    M.capa.clearLayers();
    var b = [[loc.lat, loc.lng]];
    L.circleMarker([loc.lat, loc.lng], { radius: 10, color: "#4a1519", fillColor: "#a9803f", fillOpacity: 1, weight: 3 }).bindTooltip("Pasta Gallo").addTo(M.capa);
    pts.forEach(function (p) {
      b.push([p.lat, p.lng]);
      var mk = L.circleMarker([p.lat, p.lng], { radius: p.ent ? 7 : 12, color: "#fff", weight: 2, fillColor: COLOR[p.estado] || "#b6232a", fillOpacity: p.ent ? 0.75 : 0.95 })
        .bindPopup("<b>#" + p.n + " " + MZ.escHtml(p.nombre) + "</b><br>" + MZ.escHtml(p.dir || "") + "<br>" + MZ.escHtml(p.estado) + " · " + soles(p.total));
      if (!p.ent) mk.bindTooltip("#" + p.n, { permanent: true, direction: "top", className: "lf-num" });
      mk.addTo(M.capa);
    });
    M.mapa.invalidateSize();
    M.mapa.fitBounds(b, { padding: [30, 30], maxZoom: 15 });
  }

  /* =========================== «PARA LLEVAR / DELIVERY» =========================== */
  function vistaLlevar(w) {
    var ext = (S.externos || []).slice().sort(function (a, b) { return MZ.tsSalida(a) - MZ.tsSalida(b); });
    var lle = ext.filter(function (x) { return x.canal !== "delivery"; }), del = ext.filter(function (x) { return x.canal === "delivery"; });
    var g = h("div", "lc-ll");
    function bloque(tit, lista, vacio, tipo) {
      var s = h("section", "lc-ll__col"), c = h("div", "lc-col__cab"); c.appendChild(h("b", null, tit)); c.appendChild(h("span", "lc-n", String(lista.length))); s.appendChild(c);
      if (!lista.length) s.appendChild(h("p", "lc-col__vacio", vacio));
      lista.forEach(function (x) { s.appendChild(tarjeta({ k: "e" + x.id, tipo: tipo, x: x, ts: x.ts, sal: MZ.tsSalida(x), hora: x.hora, n: x.n, estado: x.estado, col: colDe(x.estado, x),
        titulo: (tipo === "delivery" ? "🛵 " : "🥡 ") + x.nombre, resp: x.mozo || (x.origen === "web" || !x.origen ? "Web" : ""), lineas: x.lineas || [], total: x.aCobrar })); });
      return s;
    }
    g.appendChild(bloque("🥡 Para llevar / recojo", lle, "Sin pedidos para llevar. Usa «🥡 Para llevar»: primero los productos, al final el nombre del cliente.", "llevar"));
    g.appendChild(bloque("🛵 Delivery", del, "Sin deliveries en curso.", "delivery"));
    var der = h("aside", "lc-ll__der");
    der.appendChild(mapaDelivery("mapaLl", "Mapa", true));
    var rp = cardReparto(); if (rp) der.appendChild(rp);
    else der.appendChild((function () { var d = caja("🛵 Reparto"); d.appendChild(h("p", "lc-vacio", T && T.reparto ? "No hay repartidores con enlace. Se crean en Administración → Personal (rol repartidor)." : "Cargando…")); return d; })());
    var viejos = MZ.legadoLlevar();
    if (viejos.length) { var sv = caja("🥡 Para llevar (sistema anterior)"); var gm = h("div", "mesas llevar"); viejos.forEach(function (m) { gm.appendChild(MZ.botonMesa(m)); }); sv.appendChild(gm); der.appendChild(sv); }
    g.appendChild(der);
    w.appendChild(g);
  }

  /* =========================== «SALÓN» =========================== */
  function vistaSalon(w) {
    var v = MZ.vistaMesas(); v.classList.add("lc-salon"); w.appendChild(v);
  }

  /* =========================== «COMPROBANTES» =========================== */
  function pedirComp(forzar) {
    if (pidiendoC) return; if (!forzar && COMP && Date.now() - COMP.ts < 20000) return;
    pidiendoC = true;
    llamar({ mz: "l_comp" }).then(function (r) { if (r && r.ok) { COMP = r; COMP.ts = Date.now(); if (T) T.comp = r.pendientes.length; } else MZ.toast((r && r.error) || "No se pudo leer.", "mal"); })
      .catch(function () { MZ.toast("Sin conexión.", "mal"); }).then(function () { pidiendoC = false; MZ.refrescar(); });
  }
  function vistaComp(w) {
    if (!COMP) { pedirComp(); w.appendChild(h("p", "vacio", "Cargando comprobantes…")); return; }
    var su = COMP.sunat || { modo: "apagado" }, elec = (su.modo === "beta" || su.modo === "produccion") && COMP.emitir;
    var aviso = h("p", "lc-banda " + (elec ? (su.modo === "beta" ? "prueba" : "ok") : ""), elec ? (su.modo === "beta" ? "SUNAT en MODO PRUEBA: lo emitido no tiene validez tributaria." : "Facturación electrónica activa: se emite directo en SUNAT desde aquí.")
      : "Emisión en SOL: copia el detalle, emítelo en SOL y registra aquí la serie y el número.");
    w.appendChild(aviso);
    var g = h("div", "lc-comp");
    var a = h("section", "lc-card"); a.appendChild(h("h3", null, "Pidieron comprobante · " + COMP.pendientes.length));
    if (!COMP.pendientes.length) a.appendChild(h("p", "lc-vacio", "Ningún pedido pendiente de comprobante ✓"));
    COMP.pendientes.forEach(function (p) { a.appendChild(filaComp({ ref: { numero: p.numero }, tit: (p.canal === "mesa" ? "Mesa " + p.mesa : p.canal === "delivery" ? "🛵 Delivery" : "🥡 Llevar") + " · #" + p.nd + " · " + (p.nombre || ""),
      sub: p.comprobante + (p.doc ? " · " + p.doc : "") + (p.razon ? " · " + p.razon : "") + " · " + p.dia + " " + p.hora, total: p.total, pedido: String(p.numero), cli: p, tipo: p.comprobante })); });
    var b = h("section", "lc-card"); b.appendChild(h("h3", null, "Cobrado hoy · " + COMP.cobrados.length));
    if (!COMP.cobrados.length) b.appendChild(h("p", "lc-vacio", "Todavía no hay cobros hoy."));
    COMP.cobrados.forEach(function (c) { b.appendChild(filaComp({ ref: c.tipo === "mesa" ? { mesa: c.mesa } : { numero: c.numero }, tit: (c.tipo === "mesa" ? "🍽 Mesa " + c.mesa : "#" + c.numero + " " + (c.nombre || "")),
      sub: c.hora + " · " + c.metodos.join(" + "), total: c.total, pedido: c.tipo === "mesa" ? "Mesa " + c.mesa : String(c.numero), emitido: c.emitido, cli: { nombre: c.nombre } })); });
    g.appendChild(a); g.appendChild(b); w.appendChild(g);
  }
  function filaComp(o) {
    var f = h("div", "lc-cf" + (o.emitido ? " hecho" : ""));
    var t = h("div", "lc-cf__t"); t.appendChild(h("b", null, o.tit)); t.appendChild(h("small", null, o.sub)); f.appendChild(t);
    f.appendChild(h("b", "lc-cf__m", soles(o.total)));
    if (o.emitido) f.appendChild(h("span", "lc-chip e-ent", "✓ " + o.emitido));
    else f.appendChild(btn("Emitir " + (o.tipo === "Factura" ? "factura" : "boleta / factura"), "lc-a ok", function () { formComp(o); }));
    return f;
  }
  function valorUnit(cant, precio, tasa) {
    var obj = Math.round(cant * precio * 100), t = tasa / 100;
    for (var dec = 2; dec <= 10; dec++) { var v = Number((precio / (1 + t)).toFixed(dec)); if (Math.round(cant * v * (1 + t) * 100 + 1e-6) === obj) return v.toFixed(dec); }
    return (precio / (1 + t)).toFixed(10);
  }
  /* emitir (o registrar) una boleta o factura: de un pedido pendiente, de un cobro del día o NUEVA con líneas libres.
     Las líneas se pueden traer de un pedido (n.º) o de una mesa con «Cargar líneas». */
  function formComp(o) {
    var su = (COMP && COMP.sunat) || { modo: "apagado" }, elec = (su.modo === "beta" || su.modo === "produccion") && COMP.emitir, tR = Number(su.tasaRestaurante) || 10.5;
    var cli = o.cli || {}, L = o.nuevo ? [{ descripcion: "", cantidad: 1, precio: 0, tasa: tR }] : [{ descripcion: "POR CONSUMO", cantidad: 1, precio: Number(o.total) || 0, tasa: tR }];
    var cuerpo = h("div", "lc-fcomp"), err = h("p", "err"), lineasBox = h("div", "lc-lineas"), totEl = h("b", "lc-lin-tot");
    function campo(rot, el) { var w = h("label", "campo-l"); w.appendChild(h("span", null, rot)); w.appendChild(el); return w; }
    function inp(v, ph, tipo) { var i = h("input", "campo"); i.value = v == null ? "" : v; i.placeholder = ph || ""; if (tipo) i.type = tipo; return i; }
    var tipo = h("select", "campo"); [["Boleta", "Boleta de venta"], ["Factura", "Factura"]].forEach(function (x) { var op = h("option", null, x[1]); op.value = x[0]; tipo.appendChild(op); });
    tipo.value = o.tipo === "Factura" ? "Factura" : "Boleta";
    var doc = inp(cli.doc, "DNI (8) o RUC (11)"), razon = inp(cli.razon || cli.nombre, "Nombre o razón social"), dir = inp(cli.direccion, "Dirección (opcional)"), correo = inp(cli.correo, "correo@ejemplo.com", "email"), wa = inp(cli.telefono, "9 dígitos", "tel");
    doc.inputMode = "numeric";
    doc.addEventListener("input", function () { var v = doc.value.replace(/\D/g, "").slice(0, 11); if (v !== doc.value) doc.value = v; });
    // cargar líneas de un pedido o de una mesa (sirve sobre todo para el comprobante nuevo)
    if (o.nuevo) {
      var refP = inp("", "N.º de pedido", "number"), refM = inp("", "Mesa"), bCar = btn("⤓ Cargar líneas", "lc-a", function () {
        var ref = refP.value.trim() ? { numero: Number(refP.value) } : refM.value.trim() ? { mesa: refM.value.trim() } : null;
        if (!ref) { err.textContent = "Escribe el número de pedido o la mesa."; return; }
        err.textContent = ""; bCar.disabled = true; bCar.textContent = "Cargando…";
        cargarDatos(ref, true).then(function (ok) { bCar.disabled = false; bCar.textContent = "⤓ Cargar líneas"; if (ok) o.pedido = ref.numero ? String(ref.numero) : "Mesa " + ref.mesa; });
      });
      var gc = h("div", "lc-cargar"); gc.appendChild(h("span", "lbl", "Traer de un pedido:")); gc.appendChild(refP); gc.appendChild(h("span", null, "o")); gc.appendChild(refM); gc.appendChild(bCar);
      cuerpo.appendChild(gc);
    }
    var g1 = h("div", "lc-f2"); g1.appendChild(campo("Tipo", tipo)); g1.appendChild(campo("DNI o RUC", doc)); cuerpo.appendChild(g1);
    var g0 = h("div", "lc-f2"); g0.appendChild(campo("Nombre o razón social", razon)); g0.appendChild(campo("Dirección", dir)); cuerpo.appendChild(g0);
    var g2 = h("div", "lc-f2"); g2.appendChild(campo("Correo (opcional)", correo)); g2.appendChild(campo("WhatsApp (opcional)", wa)); cuerpo.appendChild(g2);
    var serie, numero;
    if (!elec) {
      var sug = (COMP.series || []).filter(function (s) { return s.tipo === tipo.value; })[0] || {};
      serie = inp(sug.serie || "", "Ej.: EB01"); numero = inp(sug.siguiente || "", "Número que dio SUNAT", "number");
      var g3 = h("div", "lc-f2"); g3.appendChild(campo("Serie (de SOL)", serie)); g3.appendChild(campo("Número", numero)); cuerpo.appendChild(g3);
      tipo.addEventListener("change", function () { var x = (COMP.series || []).filter(function (s2) { return s2.tipo === tipo.value; })[0] || {}; serie.value = x.serie || ""; numero.value = x.siguiente || ""; });
    }
    cuerpo.appendChild(h("div", "lbl", "Detalle (precios con IGV)"));
    cuerpo.appendChild(lineasBox);
    function total() { return MZ.r2(L.reduce(function (a, l) { return a + (l.cantidad || 0) * (l.precio || 0); }, 0)); }
    function vu(l) { return "v.u. sin IGV " + (l.cantidad > 0 && l.precio > 0 ? valorUnit(l.cantidad, l.precio, l.tasa) : "—"); }
    function pintarL() {
      lineasBox.textContent = "";
      var cab = h("div", "lc-lin lc-lin--cab"); ["Cant.", "Descripción", "Precio", "IGV", "", ""].forEach(function (t) { cab.appendChild(h("span", null, t)); }); lineasBox.appendChild(cab);
      L.forEach(function (l, i) {
        var f = h("div", "lc-lin"), d = inp(l.descripcion, "Descripción"), c = inp(l.cantidad, "Cant.", "number"), p = inp(l.precio || "", "Precio", "number"), sm = h("small", null, vu(l));
        c.min = "0"; c.step = "1"; p.min = "0"; p.step = "0.10"; c.inputMode = "decimal"; p.inputMode = "decimal";
        var t = h("select", "campo"); [10.5, 18].concat([10.5, 18].indexOf(Number(l.tasa)) < 0 ? [Number(l.tasa)] : []).forEach(function (x) { var op = h("option", null, String(x).replace(".", ",") + " %"); op.value = String(x); t.appendChild(op); }); t.value = String(l.tasa);
        t.setAttribute("aria-label", "IGV");
        function vivo() { sm.textContent = vu(l); totEl.textContent = "Total " + soles(total()); }
        d.addEventListener("input", function () { l.descripcion = d.value; });
        c.addEventListener("input", function () { l.cantidad = Number(c.value) || 0; vivo(); });
        p.addEventListener("input", function () { l.precio = Number(p.value) || 0; vivo(); });
        t.addEventListener("change", function () { l.tasa = Number(t.value); vivo(); });
        d.classList.add("lc-lin__d"); c.classList.add("lc-lin__c"); p.classList.add("lc-lin__p"); t.classList.add("lc-lin__t");
        f.appendChild(c); f.appendChild(d); f.appendChild(p); f.appendChild(t); f.appendChild(sm);
        f.appendChild(btn("✕", "lc-a ic lc-lin__x", function () { L.splice(i, 1); if (!L.length) L.push({ descripcion: "", cantidad: 1, precio: 0, tasa: tR }); pintarL(); }, "Quitar línea"));
        lineasBox.appendChild(f);
      });
      var pie = h("div", "lc-lin-pie");
      pie.appendChild(btn("＋ Línea", "lc-a", function () { L.push({ descripcion: "", cantidad: 1, precio: 0, tasa: tR }); pintarL(); var ds = lineasBox.querySelectorAll(".lc-lin__d"); if (ds.length) ds[ds.length - 1].focus(); }));
      pie.appendChild(btn("Todo en «POR CONSUMO»", "lc-a", function () { L = [{ descripcion: "POR CONSUMO", cantidad: 1, precio: total(), tasa: tR }]; pintarL(); }));
      pie.appendChild(h("span", "esp")); totEl.textContent = "Total " + soles(total()); pie.appendChild(totEl);
      lineasBox.appendChild(pie);
    }
    pintarL();
    // detalle real del pedido o de la mesa (datosEmision del servidor)
    function cargarDatos(ref, avisar) {
      return llamar({ mz: "l_compdatos", ref: ref }).then(function (r) {
        var d = r && r.ok && (r.r || r);
        if (!d || !d.lineas || !d.lineas.length) { if (avisar) err.textContent = (r && r.error) || "Ese pedido no tiene líneas para el comprobante."; return false; }
        L = d.lineas.map(function (l) { return { descripcion: l.descripcion, cantidad: Number(l.cantidad), precio: Number(l.precio), tasa: Number(l.tasa) || tR }; }); pintarL();
        var c = d.cliente || {}; if (c.doc && !doc.value) doc.value = c.doc; if (c.razon && !razon.value) razon.value = c.razon; if (c.correo && !correo.value) correo.value = c.correo; if (c.direccion && !dir.value) dir.value = c.direccion;
        if (c.tipo === "Factura" || c.tipo === "Boleta") tipo.value = c.tipo;
        if (avisar) MZ.toast("Líneas cargadas (" + L.length + ")", "ok");
        return true;
      }).catch(function () { if (avisar) err.textContent = "Sin conexión: no se pudieron cargar las líneas."; return false; });
    }
    if (COMP.datos && o.ref) cargarDatos(o.ref, false);
    cuerpo.appendChild(err);
    function datos() {
      return { tipo: tipo.value, doc: doc.value.replace(/\D/g, ""), razon: razon.value.trim(), direccion: dir.value.trim(), correo: correo.value.trim(), whatsapp: wa.value.replace(/\D/g, ""), pedido: o.pedido || "",
        serie: serie ? serie.value : "", numero: numero ? numero.value : "",
        items: L.filter(function (l) { return String(l.descripcion || "").trim() && l.cantidad > 0 && l.precio > 0; }).map(function (l) { return { descripcion: String(l.descripcion).trim(), cantidad: l.cantidad, precio: l.precio, tasa: l.tasa }; }),
        detalle: L.map(function (l) { return l.cantidad + " x " + String(l.descripcion).toUpperCase() + " · v.u. sin IGV " + valorUnit(l.cantidad, l.precio, l.tasa) + " · IGV " + l.tasa + "%"; }).join("\n") };
    }
    function validar(d) {
      if (!d.items.length) return "Agrega al menos una línea con descripción, cantidad y precio.";
      if (L.some(function (l) { return (l.cantidad > 0 || l.precio > 0) && !String(l.descripcion || "").trim(); })) return "Hay una línea sin descripción.";
      var tot = d.items.reduce(function (a, l) { return a + l.cantidad * l.precio; }, 0);
      if (d.tipo === "Factura") {
        if (!/^\d{11}$/.test(d.doc) || ["10", "15", "16", "17", "20"].indexOf(d.doc.slice(0, 2)) < 0) return "Para factura escribe un RUC válido (11 dígitos, empieza con 10, 15, 16, 17 o 20).";
        if (d.razon.length < 3) return "Escribe la razón social.";
      } else {
        if (d.doc && d.doc.length !== 8 && d.doc.length !== 11) return "El DNI tiene 8 dígitos y el RUC 11.";
        if (!d.doc && tot >= 700) return "Desde S/ 700 la boleta lleva DNI.";
      }
      if (d.correo && !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(d.correo)) return "El correo no es válido.";
      if (d.whatsapp && !/^9\d{8}$/.test(d.whatsapp.replace(/^51(?=9\d{8}$)/, ""))) return "El WhatsApp debe tener 9 dígitos y empezar con 9.";
      if (!elec && (!/^[A-Za-z0-9]{4}$/.test(d.serie) || !(Number(d.numero) > 0))) return "Escribe la serie (4 caracteres) y el número que te dio SOL.";
      return "";
    }
    var copiar = btn("📋 Copiar detalle para SOL", "btn", function () {
      var d = datos(), txt = d.tipo.toUpperCase() + (d.doc ? " · " + d.doc : "") + (d.razon ? " · " + d.razon : "") + "\n" + d.detalle;
      try { navigator.clipboard.writeText(txt).then(function () { MZ.toast("Detalle copiado", "ok"); }); } catch (e) { MZ.toast("No se pudo copiar.", "mal"); }
    });
    var ok = btn(elec ? (su.modo === "beta" ? "Emitir PRUEBA en SUNAT" : "Emitir en SUNAT") : "Registrar comprobante", "btn prim", function () {
      var d = datos(), v = validar(d); err.textContent = v; if (v) return;
      var tot = d.items.reduce(function (a, l) { return a + l.cantidad * l.precio; }, 0);
      if (elec && !confirm("¿Emitir " + d.tipo.toUpperCase() + " por " + soles(tot) + "?" + (su.modo === "produccion" ? "\n\nSe envía a SUNAT y no se puede deshacer (solo anular con nota de crédito)." : ""))) return;
      ok.disabled = true; ok.textContent = elec ? "Enviando a SUNAT…" : "Guardando…";
      if (elec) { delete d.serie; delete d.numero; }
      llamar({ mz: elec ? "l_emitir" : "l_registrar", datos: d }).then(function (r) {
        if (!r.ok) { ok.disabled = false; ok.textContent = "Reintentar"; err.textContent = r.error || "No se pudo."; return; }
        MZ.cerrarModal();
        var x = r.r && typeof r.r === "object" ? r.r : r, c = x.comprobante || x;
        MZ.toast("✓ " + (c.tipo || d.tipo) + " " + (c.codigo || c.numero || "") + " " + (elec ? "emitida" : "registrada"), "ok");
        if (x.html) imprimirHtml(x.html);
        pedirComp(true); pedirTablero(true);
      }).catch(function () { ok.disabled = false; ok.textContent = "Reintentar"; err.textContent = "Sin conexión. Revisa antes de reintentar que no se haya emitido."; });
    });
    var pie = [btn("Cancelar", "btn", MZ.cerrarModal)]; if (!elec) pie.push(copiar); pie.push(ok);
    var m = MZ.abrirModal(o.nuevo ? "🧾 Nuevo comprobante" : (elec ? "Emitir " : "Registrar ") + "boleta / factura · " + o.tit, [cuerpo], pie); m.classList.add("lc-modal-ancho");
  }
  function imprimirHtml(html) {
    var fr = h("iframe"); fr.style.cssText = "position:fixed;width:0;height:0;border:0"; document.body.appendChild(fr);
    var d = fr.contentDocument; d.open(); d.write(html); d.close();
    setTimeout(function () { try { fr.contentWindow.focus(); fr.contentWindow.print(); } catch (e) {} setTimeout(function () { fr.remove(); }, 3000); }, 300);
  }

  /* =========================== «CUENTAS» (lo cobrado del día) =========================== */
  var MET_MESA = ["Efectivo", "Yape", "Plin", "Tarjeta"], MET_TIENDA = ["Efectivo", "Yape", "Plin", "Tarjeta"];
  function metodosPedido(canal) { return MZ.metodosCanal ? MZ.metodosCanal(canal === "delivery" ? "delivery" : "recojo") : canal === "delivery" ? ["Yape", "Plin", "Transferencia"] : ["Efectivo", "Yape", "Plin", "Tarjeta", "Transferencia"]; }
  function pedirCuentas(forzar) {
    if (CU.pidiendo || !S.t) return; if (!forzar && CU.datos && Date.now() - CU.ts < 10000) return;
    CU.pidiendo = true;
    var dia = CU.dia;
    accion({ mz: "l_cuentas", dia: dia }).then(function (r) { if (dia !== CU.dia) return; CU.datos = r || {}; CU.err = ""; CU.ts = Date.now(); })
      .catch(function (e) { CU.err = errTxt(e).replace(/: no se guardó.*$/, "."); CU.ts = Date.now(); })
      .then(function () { CU.pidiendo = false; MZ.refrescar(); });
  }
  function sumar(l, f) { return l.reduce(function (a, x) { return a + (Number(f(x)) || 0); }, 0); }
  function vistaCuentas(w) {
    if (!CU.datos) {
      if (!CU.pidiendo) pedirCuentas(true);
      w.appendChild(h("p", "vacio", CU.err ? CU.err : "Cargando las cuentas del día…"));
      if (CU.err) w.appendChild(btn("Reintentar", "btn", function () { pedirCuentas(true); }));
      return;
    }
    var d = CU.datos, esHoy = !d.hoy || d.dia === d.hoy;
    if (!esHoy) w.appendChild(h("p", "lc-banda", "Estás viendo el " + fechaTxt(d.dia) + ". Para volver a hoy, elige la fecha de hoy."));
    if (CU.err) w.appendChild(h("p", "lc-banda", "⚠ " + CU.err));
    var mesas = d.cuentas || [], peds = d.pedidos || [], vts = d.ventas || [];
    var pedOk = peds.filter(function (p) { return p.estado !== "Cancelado"; }), vtOk = vts.filter(function (v) { return v.estado !== "Anulada"; });
    var g = h("div", "lc-cu");
    ordenBloques().forEach(function (b) {
      if (b === "salon") g.appendChild(bloqueCu("salon", "🍽 Mesas", sumar(mesas, function (c) { return c.consumo; }), mesas, filaMesa, "Ninguna mesa cobrada " + (esHoy ? "hoy" : "ese día") + "."));
      else if (b === "llevar") g.appendChild(bloqueCu("llevar", "🥡 Para llevar y delivery", sumar(pedOk, function (p) { return p.total; }), pedOk, filaPedidoCu, "Ningún pedido para llevar ni delivery."));
      else g.appendChild(bloqueCu("tienda", "🛍 Tienda", sumar(vtOk, function (v) { return v.total; }), vtOk, filaVenta, "Ninguna venta de tienda."));
    });
    var tot = sumar(mesas, function (c) { return c.consumo; }) + sumar(pedOk, function (p) { return p.total; }) + sumar(vtOk, function (v) { return v.total; });
    var res = h("p", "lc-cu__tot"); res.appendChild(h("span", null, "Total del día (sin propinas)")); res.appendChild(h("b", null, soles(tot))); g.appendChild(res);
    // eliminados y anulados (se ven atenuados; lo de la papelera se puede recuperar)
    var pap = d.papelera || [], anul = vts.filter(function (v) { return v.estado === "Anulada"; }), canc = peds.filter(function (p) { return p.estado === "Cancelado"; });
    var e = h("section", "lc-card lc-cu__blq lc-cu--elim"); e.dataset.bloque = "eliminados";
    var ec = h("div", "lc-cu__cab"); ec.appendChild(h("h3", null, "🗑 Eliminados y anulados · " + (pap.length + anul.length + canc.length))); e.appendChild(ec);
    if (!pap.length && !anul.length && !canc.length) e.appendChild(h("p", "lc-vacio", "Nada eliminado ni anulado."));
    pap.forEach(function (x) {
      var f = filaCu("🗑 " + (x.tipo || "Eliminado") + " · " + (x.fecha || ""), (x.resumen || "") + (x.quien ? " · eliminó " + x.quien : ""), null);
      f.querySelector(".lc-cu__acc").appendChild(btn("↺ Recuperar", "lc-a ok", function () { recuperar(x); }));
      e.appendChild(f);
    });
    anul.forEach(function (v) { e.appendChild(filaCu("🛍 Venta N° " + (v.numero || v.id) + " · " + (v.hora || "") + " · ANULADA", txtLineas(v.lineas) + (v.nota ? " · " + v.nota : ""), v.total)); });
    canc.forEach(function (p) { e.appendChild(filaCu((p.canal === "delivery" ? "🛵" : "🥡") + " #" + (p.nro || p.numero) + " " + (p.nombre || "") + " · CANCELADO", txtLineas(p.lineas), p.total)); });
    g.appendChild(e);
    w.appendChild(g);
  }
  function fechaTxt(iso) { var p = String(iso || "").split("-"); return p.length === 3 ? p[2] + "/" + p[1] + "/" + p[0] : iso; }
  function bloqueCu(clave, tit, total, lista, fila, vacio) {
    var s = h("section", "lc-card lc-cu__blq"); s.dataset.bloque = clave;
    var c = h("div", "lc-cu__cab"); c.appendChild(h("h3", null, tit + " · " + lista.length)); c.appendChild(h("span", "esp")); c.appendChild(h("b", "lc-cu__st", soles(total))); s.appendChild(c);
    if (!lista.length) s.appendChild(h("p", "lc-vacio", vacio));
    lista.forEach(function (x) { s.appendChild(fila(x)); });
    return s;
  }
  function filaCu(tit, sub, monto) {
    var f = h("div", "lc-cu__f"), t = h("div", "lc-cu__t");
    t.appendChild(h("b", null, tit)); if (sub) t.appendChild(h("small", null, sub)); f.appendChild(t);
    f.appendChild(h("b", "lc-cu__m", monto == null ? "" : soles(monto)));
    f.appendChild(h("div", "lc-cu__acc"));
    return f;
  }
  function filaMesa(c) {
    var f = filaCu("🍽 Mesa " + c.mesa + " · " + (c.hora || ""), [c.mozo ? "🤵 " + c.mozo : "", c.personas ? "👥 " + c.personas : "", txtPagos(c.pagos)].filter(Boolean).join(" · "), c.consumo);
    var a = f.querySelector(".lc-cu__acc");
    a.appendChild(btn("💳 Cambiar pago", "lc-a", function () { cambiarPagoMesa(c); }));
    a.appendChild(btn("🗑 Eliminar", "lc-a mal", function () { eliminarCobro(c); }));
    return f;
  }
  function filaPedidoCu(p) {
    var f = filaCu((p.canal === "delivery" ? "🛵 Delivery" : "🥡 Para llevar") + " #" + (p.nro || p.numero) + " · " + (p.nombre || "") + " · " + (p.hora || ""),
      [txtLineas(p.lineas), (p.pago || "sin método") + (p.pagoEstado ? " (" + p.pagoEstado + ")" : ""), p.estado, p.comp ? "🧾 " + p.comp + (p.compEstado ? " " + p.compEstado : "") : ""].filter(Boolean).join(" · "), p.total);
    var a = f.querySelector(".lc-cu__acc");
    a.appendChild(btn("💳 Cambiar pago", "lc-a", function () { cambiarPagoPedido(p); }));
    a.appendChild(btn("✎ Editar", "lc-a", function () { editarPedidoLocal(p.numero, "#" + (p.nro || p.numero) + " " + (p.nombre || "")); }));
    a.appendChild(btn("🗑 Eliminar", "lc-a mal", function () { eliminarPedido(p.numero, "#" + (p.nro || p.numero) + " de " + (p.nombre || "cliente"), p.total); }));
    return f;
  }
  function filaVenta(v) {
    var f = filaCu("🛍 Venta N° " + (v.numero || v.id) + " · " + (v.hora || ""), [txtLineas(v.lineas), txtPagos(v.pagos), v.cajero ? "🧑 " + v.cajero : "", v.nota || ""].filter(Boolean).join(" · "), v.total);
    var a = f.querySelector(".lc-cu__acc");
    a.appendChild(btn("💳 Cambiar pago", "lc-a", function () { cambiarPagoVenta(v); }));
    a.appendChild(btn("⊘ Anular", "lc-a mal", function () { anularVenta(v); }));
    return f;
  }
  /* cambio de método: botones grandes, sin montos */
  function elegirMetodo(titulo, nota, metodos, actual, enviar) {
    var g = h("div", "lc-mets"), err = h("p", "err");
    metodos.forEach(function (m) {
      var b = btn(m, "lc-met" + (actual && String(actual).toLowerCase().indexOf(m.toLowerCase()) >= 0 ? " on" : ""), function () {
        g.querySelectorAll("button").forEach(function (y) { y.disabled = true; }); b.classList.add("enviando"); err.textContent = "";
        enviar(m).then(function () { MZ.cerrarModal(); MZ.toast("✓ Pago cambiado a " + m, "ok"); trasCambio(); })
          .catch(function (e) { err.textContent = errTxt(e); g.querySelectorAll("button").forEach(function (y) { y.disabled = false; }); b.classList.remove("enviando"); });
      });
      g.appendChild(b);
    });
    MZ.abrirModal(titulo, [h("p", "vacio", nota), g, err], [btn("Cancelar", "btn", MZ.cerrarModal)]);
  }
  function cambiarPagoPedido(p) {
    elegirMetodo("💳 Pago del pedido #" + (p.nro || p.numero) + " · " + soles(p.total), "Ahora: " + (p.pago || "sin método") + (p.canal === "delivery" ? ". El delivery se paga solo con Yape, Plin o transferencia." : ""),
      metodosPedido(p.canal), p.pago, function (m) { return accion({ mz: "l_ppago", id: p.numero, metodo: m }); });
  }
  function cambiarPagoVenta(v) {
    var mets = (CU.datos && CU.datos.metodosTienda && CU.datos.metodosTienda.length ? CU.datos.metodosTienda : MET_TIENDA);
    elegirMetodo("💳 Pago de la venta N° " + (v.numero || v.id) + " · " + soles(v.total), "Ahora: " + (txtPagos(v.pagos) || "—"), mets, (v.pagos && v.pagos[0] && v.pagos[0].metodo) || "",
      function (m) { return accion({ mz: "l_tpago", id: v.id, metodo: m }); });
  }
  function cambiarPagoMesa(c) {
    var mets = (CU.datos && CU.datos.metodos && CU.datos.metodos.length ? CU.datos.metodos : MET_MESA), pagos = c.pagos || [];
    function enviar(lista) { return accion({ mz: "l_cobro", cuenta: c.cuenta, datos: { pagos: lista, mozoId: c.mozo_id || "", personas: c.personas || 0 } }); }
    if (pagos.length <= 1) {
      var prop = pagos[0] ? Number(pagos[0].propina) || 0 : 0;
      elegirMetodo("💳 Pago de la mesa " + c.mesa + " · " + soles(c.consumo), "Ahora: " + (txtPagos(pagos) || "—") + ". Se cambia el método; el monto y la propina quedan igual.", mets, pagos[0] && pagos[0].metodo,
        function (m) { return enviar([{ metodo: m, monto: c.consumo, propina: prop }]); });
      return;
    }
    // varios pagos: editor (deben sumar el consumo)
    var L = pagos.map(function (p) { return { metodo: p.metodo, monto: Number(p.monto) || 0, propina: Number(p.propina) || 0 }; });
    var zona = h("div", "lc-pagos"), res = h("div", "tot"), err = h("p", "err"), ok;
    function suma() { return MZ.r2(sumar(L, function (p) { return p.monto; })); }
    function resumen() {
      var f = MZ.r2(c.consumo - suma());
      res.textContent = Math.abs(f) > 0.009 ? (f > 0 ? "Falta " + soles(f) : "Sobra " + soles(-f)) : "✓ Cuadra: " + soles(c.consumo);
      res.className = "tot" + (Math.abs(f) > 0.009 ? " mal" : "");
      if (ok) ok.disabled = Math.abs(f) > 0.009 || L.some(function (p) { return !p.metodo; });
    }
    function pintarP() {
      zona.textContent = "";
      L.forEach(function (p, i) {
        var w2 = h("div", "lc-pg"), cab = h("div", "lc-pg__cab"); cab.appendChild(h("b", null, "Pago " + (i + 1)));
        cab.appendChild(h("span", "esp"));
        if (L.length > 1) cab.appendChild(btn("Quitar", "lc-a", function () { L.splice(i, 1); pintarP(); }));
        w2.appendChild(cab);
        var g2 = h("div", "lc-mets chico");
        mets.forEach(function (m) { g2.appendChild(btn(m, "lc-met" + (p.metodo === m ? " on" : ""), function () { p.metodo = m; g2.querySelectorAll("button").forEach(function (y) { y.classList.toggle("on", y.textContent === m); }); resumen(); })); });
        w2.appendChild(g2);
        var f2 = h("div", "lc-f2");
        var mo = h("input", "campo"); mo.type = "number"; mo.step = "0.10"; mo.min = "0"; mo.inputMode = "decimal"; mo.value = p.monto; mo.addEventListener("input", function () { p.monto = Number(mo.value) || 0; resumen(); });
        var pr = h("input", "campo"); pr.type = "number"; pr.step = "0.10"; pr.min = "0"; pr.inputMode = "decimal"; pr.value = p.propina || ""; pr.placeholder = "0"; pr.addEventListener("input", function () { p.propina = Number(pr.value) || 0; });
        var l1 = h("label", "campo-l"); l1.appendChild(h("span", null, "Monto")); l1.appendChild(mo); f2.appendChild(l1);
        var l2 = h("label", "campo-l"); l2.appendChild(h("span", null, "Propina")); l2.appendChild(pr); f2.appendChild(l2);
        w2.appendChild(f2); zona.appendChild(w2);
      });
      zona.appendChild(btn("＋ Agregar otro pago", "lc-a", function () { var f = MZ.r2(c.consumo - suma()); L.push({ metodo: "", monto: f > 0 ? f : 0, propina: 0 }); pintarP(); }));
      resumen();
    }
    ok = btn("Guardar pagos", "btn prim", function () {
      ok.disabled = true; ok.textContent = "Guardando…"; err.textContent = "";
      enviar(L.filter(function (p) { return p.monto > 0 || p.propina > 0; })).then(function () { MZ.cerrarModal(); MZ.toast("✓ Pagos de la mesa " + c.mesa + " actualizados", "ok"); trasCambio(); })
        .catch(function (e) { ok.disabled = false; ok.textContent = "Guardar pagos"; err.textContent = errTxt(e); });
    });
    pintarP();
    MZ.abrirModal("💳 Pagos de la mesa " + c.mesa + " · consumo " + soles(c.consumo), [h("p", "vacio", "Los pagos deben sumar el consumo. La propina va aparte."), zona, res, err], [btn("Cancelar", "btn", MZ.cerrarModal), ok]);
  }
  function eliminarCobro(c) {
    if (!confirm("¿Eliminar el cobro de la mesa " + c.mesa + " (" + soles(c.consumo) + ", " + (c.hora || "") + ")?" + (c.reabrible ? "\n\nLa cuenta vuelve a quedar abierta para cobrarla de nuevo." : "") + "\n\nQueda en «Eliminados» y se puede recuperar.")) return;
    accion({ mz: "l_elimcobro", cuenta: c.cuenta }).then(function () { MZ.toast("🗑 Cobro de la mesa " + c.mesa + " eliminado", "ok"); trasCambio(); }).catch(function (e) { MZ.toast(errTxt(e), "mal"); });
  }
  function eliminarPedido(id, txt, total) {
    if (!confirm("¿Eliminar el pedido " + txt + (total != null ? " (" + soles(total) + ")" : "") + "?\n\nSe quita de cocina, de la caja y de los reportes. Queda en «Eliminados» de 💰 Cuentas y se puede recuperar.")) return;
    accion({ mz: "l_elimped", id: id }).then(function () {
      MZ.toast("🗑 Pedido " + txt + " eliminado", "ok");
      S.externos = (S.externos || []).filter(function (x) { return x.id !== id; }); MZ.pintar(); trasCambio();
    }).catch(function (e) { MZ.toast(errTxt(e), "mal"); });
  }
  function anularVenta(v) {
    var mot = h("input", "campo"); mot.placeholder = "Motivo (obligatorio)"; mot.maxLength = 120;
    var err = h("p", "err"), ok;
    ok = btn("⊘ Anular venta", "btn rojo", function () {
      if (mot.value.trim().length < 3) { err.textContent = "Escribe el motivo de la anulación."; mot.focus(); return; }
      if (!confirm("¿Anular la venta N° " + (v.numero || v.id) + " por " + soles(v.total) + "? No se puede deshacer.")) return;
      ok.disabled = true; ok.textContent = "Anulando…";
      accion({ mz: "l_tanular", id: v.id, motivo: mot.value.trim() }).then(function () { MZ.cerrarModal(); MZ.toast("⊘ Venta N° " + (v.numero || v.id) + " anulada", "ok"); trasCambio(); })
        .catch(function (e) { ok.disabled = false; ok.textContent = "⊘ Anular venta"; err.textContent = errTxt(e); });
    });
    MZ.abrirModal("⊘ Anular venta N° " + (v.numero || v.id) + " · " + soles(v.total), [h("p", "vacio", txtLineas(v.lineas) + " · " + txtPagos(v.pagos)), mot, err], [btn("Volver", "btn", MZ.cerrarModal), ok]);
    setTimeout(function () { mot.focus(); }, 60);
  }
  function recuperar(x) {
    if (!confirm("¿Recuperar «" + (x.resumen || x.tipo || "registro") + "»? Vuelve a quedar como antes de eliminarlo.")) return;
    accion({ mz: "l_restaurar", id: x.id }).then(function () { MZ.toast("↺ Recuperado", "ok"); trasCambio(); }).catch(function (e) { MZ.toast(errTxt(e), "mal"); });
  }
  /* editar un pedido (mesa, para llevar o delivery): cantidades por línea (0 = quitar) y productos nuevos */
  function editarPedidoLocal(id, titulo) {
    MZ.abrirModal("✎ Editar pedido " + titulo, [h("p", "vacio", "Cargando el pedido…")], [btn("Cerrar", "btn", MZ.cerrarModal)]);
    accion({ mz: "l_pedidoed", id: id }).then(function (r) {
      r = r || {};
      var E = (r.lineas || []).map(function (l) { var c = Number(l.cant != null ? l.cant : l.cantidad) || 0; return { t: l.t || l.e || ((l.n || l.nombre || l.descripcion || "") + (l.tam ? " " + l.tam : "")), cant: c, cant0: c, unit: Number(l.unit != null ? l.unit : l.precio) || 0, fija: !!(l.entregada || l.noEditable) }; });
      var cat = (r.catalogo && r.catalogo.length ? r.catalogo : Object.keys(MZ.PROD).map(function (k) { return MZ.PROD[k]; })).map(function (c) {
        var t = c.t || c.tam || []; if (!Array.isArray(t)) t = [];
        return { id: c.id, n: c.nombre || MZ.nombreEs(c) || c.n || c.id, t: t, p: c.p != null ? c.p : c.precio, salsa: !!c.salsa, agotado: !!c.agotado, g: c.g || c.grupo || "" };
      }).filter(function (c) { return c.id && !c.agotado; });
      var N = [], cuerpo = h("div", "lc-ed"), bus = h("input", "campo"), res = h("div", "lc-ed__res"), tot = h("div", "tot"), err = h("p", "err"), ok;
      bus.type = "search"; bus.placeholder = "＋ Agregar producto: escribe para buscar…"; bus.classList.add("lc-ed__bus");
      var salsas = (MZ.SALSAS_TODAS || []).filter(function (x) { return !x.agotado; });
      function estimado() { return MZ.r2(sumar(E, function (e) { return e.unit * e.cant; }) + sumar(N, function (n) { return n.unit * n.cant; })); }
      function hayCambio() { return N.length || E.some(function (e) { return e.cant !== e.cant0; }); }
      function pie() { tot.textContent = ""; tot.appendChild(h("span", null, "Total estimado")); tot.appendChild(h("span", null, soles(estimado()))); if (ok) { ok.disabled = !hayCambio(); } }
      function step(o, min, fn) {
        var st = h("div", "lc-st"), out = h("output", null, String(o.cant));
        var m = btn("−", "", function () { if (o.cant > min) { o.cant--; fn(); } }); m.disabled = o.cant <= min; m.setAttribute("aria-label", "Uno menos");
        st.appendChild(m); st.appendChild(out); st.appendChild(btn("+", "", function () { if (o.cant < 99) { o.cant++; fn(); } }));
        return st;
      }
      function dibujar() {
        cuerpo.textContent = "";
        if (r.estado) cuerpo.appendChild(h("p", "vacio", "Estado: " + r.estado + ". Si cocina ya lo tiene, se le avisa del cambio."));
        E.forEach(function (e) {
          var f = h("div", "lc-ed__l" + (e.cant === 0 ? " fuera" : e.cant !== e.cant0 ? " cambio" : ""));
          f.appendChild(h("span", "lc-ed__n", e.t + (e.cant === 0 ? " · se quita" : "")));
          f.appendChild(h("b", null, soles(e.unit * e.cant)));
          if (e.fija) f.appendChild(h("small", null, "ya entregada")); else f.appendChild(step(e, 0, dibujar));
          cuerpo.appendChild(f);
        });
        N.forEach(function (n, i) {
          var f = h("div", "lc-ed__l nuevo");
          f.appendChild(h("span", "lc-ed__n", "＋ " + n.nombre));
          f.appendChild(h("b", null, soles(n.unit * n.cant)));
          f.appendChild(step(n, 1, dibujar));
          var x = h("div", "lc-ed__op");
          if (n.tams.length) { var sel = h("select", "campo"); n.tams.forEach(function (t) { var o = h("option", null, MZ.tamEs(t[0]) + " · " + soles(t[1])); o.value = t[0]; sel.appendChild(o); }); sel.value = n.tam; sel.addEventListener("change", function () { n.tam = sel.value; n.unit = (n.tams.filter(function (t) { return t[0] === n.tam; })[0] || [0, 0])[1]; dibujar(); }); x.appendChild(sel); }
          if (n.pideSalsa && salsas.length) { var ss = h("select", "campo"); [{ id: "", n: "Salsa…" }].concat(salsas).forEach(function (sx) { var o = h("option", null, sx.id ? "Salsa " + (sx.n || sx.id) : sx.n); o.value = sx.id; ss.appendChild(o); }); ss.value = n.salsa; ss.addEventListener("change", function () { n.salsa = ss.value; }); x.appendChild(ss); }
          var nt = h("input", "campo"); nt.placeholder = "Nota para cocina"; nt.maxLength = 120; nt.value = n.nota; nt.addEventListener("input", function () { n.nota = nt.value; }); x.appendChild(nt);
          x.appendChild(btn("✕", "lc-a ic", function () { N.splice(i, 1); dibujar(); }, "Quitar"));
          f.appendChild(x); cuerpo.appendChild(f);
        });
        pie();
      }
      function buscar() {
        res.textContent = ""; var q = MZ.norm(bus.value).trim(); if (q.length < 2) return;
        cat.filter(function (c) { return MZ.norm(c.n + " " + c.g).indexOf(q) >= 0; }).slice(0, 8).forEach(function (c) {
          var pr = c.t.length ? c.t[0][1] : Number(c.p) || 0;
          res.appendChild(btn(c.n + " · " + (c.t.length > 1 ? "desde " : "") + soles(pr), "lc-ed__r", function () {
            N.push({ id: c.id, nombre: c.n, tams: c.t, tam: c.t.length ? c.t[0][0] : "", unit: pr, salsa: "", pideSalsa: c.salsa, cant: 1, nota: "" });
            bus.value = ""; res.textContent = ""; dibujar();
          }));
        });
        if (!res.childNodes.length) res.appendChild(h("p", "lc-vacio", "Sin productos con «" + bus.value + "»."));
      }
      bus.addEventListener("input", buscar);
      ok = btn("Guardar cambios", "btn prim", function () {
        if (N.some(function (n) { return n.pideSalsa && salsas.length && !n.salsa; })) { err.textContent = "Elige la salsa de los productos nuevos."; return; }
        var quita = E.filter(function (e) { return e.cant === 0 && e.cant0 > 0; }).length;
        if (quita && !confirm("Se quita" + (quita === 1 ? " 1 línea" : "n " + quita + " líneas") + " del pedido. ¿Guardar?")) return;
        ok.disabled = true; ok.textContent = "Guardando…"; err.textContent = "";
        accion({ mz: "l_editar", id: id, cambios: { cant: E.map(function (e) { return e.cant; }), nuevos: N.map(function (n) { return { id: n.id, tam: n.tam, salsa: n.salsa, cant: n.cant, nota: n.nota.trim(), ops: {} }; }) } })
          .then(function () { MZ.cerrarModal(); MZ.toast("✎ Pedido " + titulo + " modificado", "ok"); trasCambio(); })
          .catch(function (e) { ok.disabled = false; ok.textContent = "Guardar cambios"; err.textContent = errTxt(e); });
      });
      dibujar();
      var m = MZ.abrirModal("✎ Editar pedido " + titulo, [cuerpo, bus, res, tot, err], [btn("Cancelar", "btn", MZ.cerrarModal), ok]); m.classList.add("lc-modal-ancho");
      pie();
    }).catch(function (e) { MZ.cerrarModal(); MZ.toast(e && e.srv ? e.message : "Sin conexión: no se pudo abrir el pedido.", "mal"); });
  }

  /* =========================== IMPRESIÓN (indicador, pendientes y respaldo por Chrome) =========================== */
  function respaldoOn() { return MZ.leer(K.respaldo, true) !== false && !/Android|iPhone|iPad/i.test(navigator.userAgent); }
  function ventanaImpresora() {
    var imp = T && T.imp, c = (imp && imp.cola) || {}, cuerpo = h("div", "lc-impv");
    cuerpo.appendChild(cardImpresora());
    var chk = h("label", "lc-chk"), cb = h("input"); cb.type = "checkbox"; cb.checked = respaldoOn();
    cb.addEventListener("change", function () { MZ.guardar(K.respaldo, cb.checked); MZ.toast(cb.checked ? "Respaldo por Chrome activado en este equipo" : "Respaldo por Chrome desactivado", "ok"); });
    chk.appendChild(cb); chk.appendChild(h("span", null, "Si el programa de impresión no responde, imprimir por Chrome desde esta computadora (respaldo)."));
    cuerpo.appendChild(chk);
    cuerpo.appendChild(h("p", "lc-nota", "La impresión automática la hace el servidor con el programa de la computadora del local. Este panel solo muestra su estado y, si el programa se cae, imprime lo pendiente para que no se pierda ninguna comanda."));
    MZ.abrirModal("🖨 Impresora del local", [cuerpo], [btn("Cerrar", "btn", MZ.cerrarModal)]);
  }
  function imprimirPendientes() {
    var imp = T && T.imp;
    if (imp && !imp.viva && respaldoOn()) { tomarCola(true); return; }
    llamar({ mz: "l_imppend" }).then(function (r) {
      if (!r.ok) { MZ.toast(r.error || "No se pudo.", "mal"); return; }
      if (T) T.imp = r.imp;
      MZ.toast(r.reactivadas ? "Reintentando " + r.reactivadas + " ticket(s)…" : "No hay tickets pendientes", "ok"); MZ.pintar();
    }).catch(function () { MZ.toast("Sin conexión.", "mal"); });
  }
  var tomando = false;
  function revisarImpresion() {
    var imp = T && T.imp, c = imp && imp.cola || {};
    if (!imp || imp.viva || !imp.auto || !(c.pend > 0) || Date.now() - abierto < 25000 || !respaldoOn()) return;
    tomarCola(false);
  }
  function tomarCola(manual) {
    if (tomando) return; tomando = true;
    llamar({ mz: "l_cola" }).then(function (r) {
      if (!r || !r.ok) { if (manual) MZ.toast((r && r.error) || "No se pudo.", "mal"); return; }
      if (r.viva) { if (manual) imprimirPendientes(); return; }
      if (!r.trabajos.length) { if (manual) MZ.toast("No hay tickets pendientes", "ok"); return; }
      imprimirTickets(r.trabajos);
      llamar({ mz: "l_colaok", ids: r.trabajos.map(function (t) { return t.id; }) }).catch(function () {});
      MZ.toast("🖨 Imprimiendo " + r.trabajos.length + " ticket(s) por Chrome (respaldo)", "ok");
      setTimeout(function () { pedirTablero(true); }, 5000);
    }).catch(function () {}).then(function () { tomando = false; });
  }
  /* Tickets en líneas [estilo, texto] (mismo formato del programa ESC/POS, 48 columnas) → HTML de 72 mm */
  var EST = { mesa: "font:900 30px/1.1 monospace;text-align:center", h1: "font:800 20px/1.2 monospace", sec: "font:800 18px/1.2 monospace;margin-top:6px", it: "font:800 18px/1.25 monospace", tot: "font:900 20px/1.2 monospace",
    h2: "font:800 16px/1.2 monospace", g: "font:800 15px/1.2 monospace", gc: "font:800 15px/1.2 monospace;text-align:center", d: "font:700 14px/1.25 monospace", c: "font:13px/1.25 monospace;text-align:center",
    n: "font:13px/1.25 monospace", p: "font:11px/1.25 monospace", pc: "font:11px/1.25 monospace;text-align:center" };
  function ticketHtml(t) {
    return '<div style="page-break-after:always;width:72mm;padding:0 1mm;white-space:pre-wrap;word-break:break-word">' + (t.l || []).map(function (x) {
      if (x[0] === "hr") return '<div style="border-top:1px dashed #000;margin:4px 0"></div>';
      return '<div style="' + (EST[x[0]] || EST.n) + '">' + MZ.escHtml(x[1]) + "</div>";
    }).join("") + "</div>";
  }
  function imprimirTickets(ts) {
    imprimirHtml('<!doctype html><html><head><meta charset="utf-8"><title>Tickets</title><style>@page{size:80mm auto;margin:2mm}body{margin:0;color:#000}</style></head><body>' + ts.map(ticketHtml).join("") + "</body></html>");
  }

  /* =========================== «TIENDA» (vender sin totales de caja + compras) =========================== */
  var tiendaNodo = null, tiendaApp = null, INS = null;
  function vistaTienda(w) {
    var sub = S.tiendaSub || MZ.leer(K.tiendaSub, "vender");
    var seg = MZ.segmento([["vender", "🛍 Vender"], ["compra", "📦 Registrar compra"]], sub, function (v) { S.tiendaSub = v; MZ.guardar(K.tiendaSub, v); MZ.pintar(); });
    seg.classList.add("lc-seg"); w.querySelector(".lc-cab").appendChild(seg);
    if (sub === "compra") { vistaCompra(w); return; }
    if (!tiendaNodo) {
      tiendaNodo = h("div", "lc-tienda");
      var arrancar = function () {
        var A = window.PG_APP_CAJERO;
        if (!A || !A.iniciar) { tiendaNodo.appendChild(h("p", "vacio", "No se pudo cargar la tienda.")); return; }
        tiendaApp = A.iniciar({ api: MZ.api, token: S.t, mozo: S.mozo, contenedor: tiendaNodo, h: h, toast: MZ.toast, salir: function () {}, cfg: MZ.C, restringido: true, instalar: MZ.instalar,
          llamarTienda: llamarTienda });
      };
      if (window.PG_APP_CAJERO) arrancar();
      else { var sc = document.createElement("script"); sc.src = "/cajero.js"; sc.onload = arrancar; sc.onerror = function () { tiendaNodo.appendChild(h("p", "vacio", "No se pudo cargar la tienda. Revisa la conexión.")); }; document.head.appendChild(sc); }
    }
    w.appendChild(tiendaNodo);
  }
  /* la caja de tienda (cajero.js, modo restringido) habla con el servidor por aquí:
     productos → mz l_tdatos (productos con foto y categoría en español, métodos y SUNAT); venta → mz l_tienda op venta.
     Las respuestas {ok, r} se aplanan a lo que espera la caja. */
  function llamarTienda(o) {
    if (o.op === "productos") return llamar({ mz: "l_tdatos" }).then(function (x) {
      x = plano(x); if (!x || !x.ok) return x || { ok: false, error: "No se pudo cargar la tienda." };
      if (Array.isArray(x.r)) x.productos = x.r;
      if (x.sunat) TSUNAT = x.sunat;
      return x;
    });
    var b = {}; Object.keys(o).forEach(function (k) { if (k !== "ext") b[k] = o[k]; });
    b.mz = "l_tienda"; b.t = S.t;
    return MZ.api(b).then(function (x) {
      x = plano(x);
      if (x && x.ok && o.op === "venta") {
        if (!x.venta && (x.id || x.numero)) x = { ok: true, venta: x, comprobantes: x.comprobantes, compError: x.compError, repetida: x.repetida };
        TV.ts = 0; CU.ts = 0;   // la venta aparece en «Todos» y en «Cuentas» al abrirlas
      }
      return x;
    });
  }
  var TSUNAT = null;
  function vistaCompra(w) {
    if (!INS) {
      INS = { ts: 0, insumos: [], proveedores: [], metodos: [] };
      llamar({ mz: "l_insumos" }).then(function (r) { if (r && r.ok) { INS = r; INS.ts = Date.now(); MZ.refrescar(); } }).catch(function () {});
    }
    var C = S.compra || (S.compra = { proveedor: "", metodo: "Efectivo", caja: "chica", comprobante: "", notas: "", items: [{ nombre: "", cantidad: "", unidad: "", subtotal: "" }], ref: MZ.uid() });
    var f = h("section", "lc-card lc-compra");
    f.appendChild(h("h3", null, "Compra recibida (proveedor, productos y pago)"));
    var dl = h("datalist"); dl.id = "lc-ins"; INS.insumos.forEach(function (i) { var o = h("option"); o.value = i.nombre; dl.appendChild(o); }); f.appendChild(dl);
    var dp = h("datalist"); dp.id = "lc-prov"; INS.proveedores.forEach(function (p) { var o = h("option"); o.value = p.nombre; dp.appendChild(o); }); f.appendChild(dp);
    function campo(rot, el) { var w2 = h("label", "campo-l"); w2.appendChild(h("span", null, rot)); w2.appendChild(el); return w2; }
    var prov = h("input", "campo"); prov.setAttribute("list", "lc-prov"); prov.value = C.proveedor; prov.placeholder = "Nombre del proveedor"; prov.addEventListener("input", function () { C.proveedor = prov.value; });
    var comp = h("input", "campo"); comp.value = C.comprobante; comp.placeholder = "Ej.: F001-123 (opcional)"; comp.addEventListener("input", function () { C.comprobante = comp.value; });
    var g = h("div", "lc-f2"); g.appendChild(campo("Proveedor", prov)); g.appendChild(campo("Factura / boleta del proveedor", comp)); f.appendChild(g);
    f.appendChild(h("div", "lbl", "Productos o insumos"));
    var tb = h("div", "lc-items");
    C.items.forEach(function (it, i) {
      var r = h("div", "lc-it");
      var n = h("input", "campo"); n.setAttribute("list", "lc-ins"); n.placeholder = "Producto o insumo"; n.value = it.nombre;
      n.addEventListener("input", function () { it.nombre = n.value; var x = INS.insumos.filter(function (y) { return y.nombre === n.value; })[0]; if (x && !it.unidad) { it.unidad = x.unidad; u.value = x.unidad; } });
      var c = h("input", "campo"); c.type = "number"; c.step = "0.001"; c.min = "0"; c.placeholder = "Cantidad"; c.value = it.cantidad; c.addEventListener("input", function () { it.cantidad = c.value; });
      var u = h("select", "campo"); ["", "unid", "kg", "g", "lt", "ml", "paquete", "caja"].forEach(function (x) { var o = h("option", null, x || "unidad…"); o.value = x; u.appendChild(o); }); u.value = it.unidad || ""; u.addEventListener("change", function () { it.unidad = u.value; });
      var s = h("input", "campo"); s.type = "number"; s.step = "0.01"; s.min = "0"; s.placeholder = "Costo total S/"; s.value = it.subtotal; s.addEventListener("input", function () { it.subtotal = s.value; });
      r.appendChild(n); r.appendChild(c); r.appendChild(u); r.appendChild(s);
      r.appendChild(btn("✕", "lc-a ic", function () { C.items.splice(i, 1); if (!C.items.length) C.items.push({ nombre: "", cantidad: "", unidad: "", subtotal: "" }); MZ.pintar(); }));
      tb.appendChild(r);
    });
    f.appendChild(tb);
    f.appendChild(btn("＋ Agregar producto", "lc-a", function () { C.items.push({ nombre: "", cantidad: "", unidad: "", subtotal: "" }); MZ.pintar(); }));
    var mets = (INS.metodos && INS.metodos.length ? INS.metodos : ["Efectivo", "Yape", "Plin", "Transferencia", "Tarjeta", "Crédito"]).map(function (m) { return { v: m, t: m }; });
    var em = [C.metodo];
    f.appendChild(h("div", "lbl", "Cómo se pagó"));
    f.appendChild(MZ.chips(mets, false, em, function (v) { C.metodo = v[0]; MZ.pintar(); }));
    if (C.metodo === "Efectivo") {
      var ec = [C.caja];
      f.appendChild(h("div", "lbl", "¿De qué caja sale el efectivo?"));
      f.appendChild(MZ.chips([{ v: "chica", t: "Caja chica" }, { v: "grande", t: "Caja grande" }, { v: "ninguna", t: "No sale de caja" }], false, ec, function (v) { C.caja = v[0]; }));
    }
    var err = h("p", "err");
    var tot = C.items.reduce(function (a, x) { return a + (Number(x.subtotal) || 0); }, 0);
    var pie = h("div", "lc-lin-pie"); pie.appendChild(h("b", null, "Total de la compra " + soles(tot))); pie.appendChild(h("span", "esp"));
    var ok = btn("✓ Registrar compra", "btn prim", function () {
      err.textContent = "";
      var items = C.items.filter(function (x) { return String(x.nombre).trim(); }).map(function (x) {
        var ins = INS.insumos.filter(function (y) { return y.nombre === x.nombre; })[0];
        return { insumo_id: ins ? ins.id : "", nombre: x.nombre.trim(), cantidad: Number(x.cantidad), unidad: x.unidad || (ins ? ins.unidad : "unid"), subtotal: Number(x.subtotal) };
      });
      if (!items.length) { err.textContent = "Agrega al menos un producto."; return; }
      if (items.some(function (x) { return !(x.cantidad > 0) || !(x.subtotal > 0); })) { err.textContent = "Cada producto necesita cantidad y costo."; return; }
      if (C.metodo === "Crédito" && !C.proveedor.trim()) { err.textContent = "Una compra a crédito necesita proveedor."; return; }
      ok.disabled = true; ok.textContent = "Registrando…";
      llamar({ mz: "l_compra", datos: { proveedor: C.proveedor, metodo: C.metodo, caja_origen: C.metodo === "Efectivo" ? C.caja : "ninguna", comprobante: C.comprobante, items: items, ref: C.ref } }).then(function (r) {
        if (!r.ok) { ok.disabled = false; ok.textContent = "✓ Registrar compra"; err.textContent = r.error || "No se pudo."; return; }
        MZ.toast("✓ Compra " + r.id + " registrada" + (r.duplicado ? " (ya estaba)" : ""), "ok");
        if (r.alertas && r.alertas.length) setTimeout(function () { MZ.toast(r.alertas[0], "mal"); }, 2700);
        S.compra = null; MZ.pintar();
      }).catch(function () { ok.disabled = false; ok.textContent = "✓ Registrar compra"; err.textContent = "Sin conexión. Reintenta: no se duplica."; });
    });
    pie.appendChild(ok); f.appendChild(err); f.appendChild(pie);
    f.appendChild(h("p", "lc-nota", "Si el producto es un insumo del inventario, su stock sube solo. Los saldos de caja y los costos se ven en Administración."));
    w.appendChild(f);
  }

  /* =========================== «CLIENTES» =========================== */
  var tBus = null;
  function buscarCli(q) {
    CLI.q = q; clearTimeout(tBus);
    if (q.trim().length < 2) { CLI.res = null; CLI.ts = Date.now(); pintarCliRes(); return; }
    tBus = setTimeout(function () {
      CLI.buscando = true; pintarCliRes();
      llamar({ mz: "l_clientes", q: q }).then(function (r) { if (CLI.q !== q) return; CLI.res = r && r.ok ? r.clientes : []; }).catch(function () { CLI.res = []; MZ.toast("Sin conexión.", "mal"); })
        .then(function () { CLI.buscando = false; CLI.ts = Date.now(); pintarCliRes(); });
    }, 280);
  }
  function vistaClientes(w) {
    var g = h("div", "lc-cli");
    var izq = h("section", "lc-card lc-cli__izq");
    var bus = h("input", "campo lc-bus"); bus.type = "search"; bus.placeholder = "Nombre o celular del cliente…"; bus.value = CLI.q; bus.id = "lc-bus-cli";
    bus.addEventListener("input", function () { buscarCli(bus.value); });
    izq.appendChild(bus);
    var res = h("div", "lc-cli__res"); res.id = "lc-cli-res"; izq.appendChild(res);
    var der = h("section", "lc-card lc-cli__ficha"); der.id = "lc-cli-ficha";
    g.appendChild(izq); g.appendChild(der); w.appendChild(g);
    setTimeout(function () { pintarCliRes(); pintarFicha(); if (!CLI.ficha) bus.focus(); }, 0);
  }
  function pintarCliRes() {
    var res = document.getElementById("lc-cli-res"); if (!res) return;
    res.textContent = "";
    if (CLI.buscando) { res.appendChild(h("p", "lc-vacio", "Buscando…")); return; }
    if (!CLI.res) { res.appendChild(h("p", "lc-vacio", "Escribe al menos 2 letras del nombre o 3 números del celular. Sirve para repetir un delivery: trae su última dirección y ubicación.")); return; }
    if (!CLI.res.length) { res.appendChild(h("p", "lc-vacio", "Sin clientes con «" + CLI.q + "».")); return; }
    CLI.res.forEach(function (c) {
      var b = btn("", "lc-clif" + (CLI.ficha && CLI.ficha.cliente.tel === c.tel ? " on" : ""), function () { abrirFicha(c); });
      b.appendChild(h("b", null, c.nombre || "Sin nombre")); b.appendChild(h("small", null, "📞 " + c.tel + " · " + c.pedidos + (c.pedidos === 1 ? " pedido" : " pedidos") + " · último " + c.ultimo));
      if (c.dir) b.appendChild(h("small", null, "📍 " + c.dir));
      res.appendChild(b);
    });
  }
  function abrirFicha(c) {
    CLI.ficha = { cliente: c, historial: null }; pintarCliRes(); pintarFicha();
    llamar({ mz: "l_cliente", tel: c.tel }).then(function (r) { if (r && r.ok && CLI.ficha && CLI.ficha.cliente.tel === c.tel) { CLI.ficha = r; pintarFicha(); } }).catch(function () {});
  }
  function pintarFicha() {
    var d = document.getElementById("lc-cli-ficha"); if (!d) return;
    d.textContent = "";
    if (!CLI.ficha) { d.appendChild(h("h3", null, "Ficha del cliente")); d.appendChild(h("p", "lc-vacio", "Elige un cliente de la lista para ver su historial y crear un pedido con sus datos.")); return; }
    var c = CLI.ficha.cliente;
    d.appendChild(h("h2", "lc-cli__nom", c.nombre || "Cliente"));
    var datos = h("div", "lc-cli__datos");
    datos.appendChild(h("span", null, "📞 " + c.tel)); datos.appendChild(h("span", null, c.pedidos + (c.pedidos === 1 ? " pedido" : " pedidos") + " · último " + c.ultimo));
    if (c.dir) datos.appendChild(h("span", null, "📍 " + c.dir + (c.ref ? " · " + c.ref : "") + (c.zona ? " · " + c.zona : "")));
    if (c.suele && c.suele.length) datos.appendChild(h("span", null, "⭐ Suele pedir: " + c.suele.join(", ")));
    d.appendChild(datos);
    var acc = h("div", "lc-cli__acc");
    acc.appendChild(btn("🛵 Nuevo delivery", "btn prim", function () { S.preCli = { tipo: "delivery", nombre: c.nombre, tel: c.tel, dir: c.dir, ref: c.ref, lat: c.lat, lng: c.lng }; MZ.nuevoExterno(MZ.DL); MZ.toast("Elige los productos: sus datos ya van en el formulario.", "ok"); }));
    acc.appendChild(btn("🥡 Para llevar", "btn", function () { S.preCli = { tipo: "recojo", nombre: c.nombre, tel: c.tel }; MZ.nuevoExterno(MZ.LL); }));
    var t = h("a", "btn", "📞 Llamar"); t.href = "tel:" + c.tel; acc.appendChild(t);
    var wa = h("a", "btn", "WhatsApp"); wa.href = "https://wa.me/51" + c.tel; wa.target = "_blank"; wa.rel = "noopener"; acc.appendChild(wa);
    if (c.lat != null) { var m = h("a", "btn", "🗺 Ubicación"); m.href = MZ.mapsUrl({ lat: c.lat, lng: c.lng }); m.target = "_blank"; m.rel = "noopener"; acc.appendChild(m); }
    d.appendChild(acc);
    d.appendChild(h("h3", null, "Últimos pedidos"));
    if (!CLI.ficha.historial) { d.appendChild(h("p", "lc-vacio", "Cargando…")); return; }
    CLI.ficha.historial.forEach(function (p) {
      var f = h("div", "lc-hp"); f.appendChild(h("b", null, p.fecha + " · " + (p.canal === "delivery" ? "🛵 Delivery" : p.canal === "mesa" ? "🍽 Mesa" : "🥡 Llevar") + " · #" + p.n + " · " + p.estado));
      f.appendChild(h("small", null, String(p.detalle || "").replace(/ — S\/ [\d.]+/g, "").replace(/\n/g, " · "))); f.appendChild(h("span", "lc-hp__m", soles(p.total))); d.appendChild(f);
    });
  }
  /* en el formulario de delivery / para llevar: al escribir el celular, ofrece los datos del cliente conocido */
  function ayudaCliente(f) {
    var caja2 = h("div", "lc-sug"); f.cel.parentNode.appendChild(caja2);
    var t2 = null;
    f.cel.addEventListener("input", function () {
      clearTimeout(t2); caja2.textContent = "";
      var d = f.cel.value.replace(/\D/g, "").replace(/^51(?=9\d{8}$)/, ""); if (d.length !== 9) return;
      t2 = setTimeout(function () {
        llamar({ mz: "l_clientes", q: d }).then(function (r) {
          var c = r && r.ok && r.clientes.filter(function (x) { return x.tel === d; })[0]; if (!c) return;
          caja2.textContent = "";
          var b = btn("", "lc-sug__b", function () {
            if (!f.nom.value.trim()) f.nom.value = c.nombre || "";
            if (f.del && f.dir && !f.dir.value.trim()) { f.dir.value = c.dir || ""; f.ref.value = c.ref || ""; if (c.lat != null) f.ubi.value = c.lat + ", " + c.lng; }
            f.recalc(); caja2.textContent = ""; MZ.toast("Datos de " + (c.nombre || "cliente") + " cargados", "ok");
          });
          b.appendChild(h("b", null, "↺ Usar datos de " + (c.nombre || "este cliente"))); if (c.dir) b.appendChild(h("small", null, c.dir));
          caja2.appendChild(b);
        }).catch(function () {});
      }, 250);
    });
  }

  /* =========================== ATAJOS DE TECLADO =========================== */
  document.addEventListener("keydown", function (e) {
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    var ae = document.activeElement, escribiendo = ae && (/INPUT|TEXTAREA|SELECT/.test(ae.tagName) || ae.isContentEditable);
    if (e.key === "Escape") { if (MZ.capa.classList.contains("on")) { MZ.cerrarModal(); e.preventDefault(); } else if (escribiendo) ae.blur(); return; }
    if (escribiendo || MZ.capa.classList.contains("on")) return;
    if (e.key === "/") {
      e.preventDefault();
      var b = document.querySelector(".top__bus") || document.getElementById("lc-bus-cli") || document.querySelector(".cj-bus input");
      if (b) { b.focus(); b.select(); } else irTab("clientes");
      return;
    }
    if (e.key === "n" || e.key === "N") { e.preventDefault(); menuNuevo(); return; }
    if (/^[1-7]$/.test(e.key) && S.vista !== "carta" && TABS[+e.key - 1]) { e.preventDefault(); irTab(TABS[+e.key - 1][0]); }
  });

  window.PG_LOCAL = {
    iniciar: function (nucleo) {
      MZ = nucleo; S = MZ.S; h = MZ.h; btn = MZ.btn; soles = MZ.soles;
      // un botón con 4.º argumento = texto de ayuda (accesible)
      var btn0 = btn; btn = function (t, c, fn, tip) { var b = btn0(t, c, fn); if (tip) btnIc(b, tip); return b; };
      AB = MZ.leer(K.abiertos, {}) || {};
      S.filtro = "todas";
      document.documentElement.classList.add("local");
      pedirTablero(true);
      setInterval(function () { if (!document.hidden) pedirTablero(false); }, 30000);
      return { pintar: pintar, despues: despues, firma: firma, top: top, alSondear: alSondear, tabValida: tabValida, ayudaCliente: ayudaCliente };
    }
  };
})();
