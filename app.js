/* Pasta Gallo · lógica de la carta. No necesitas editar este archivo. */
(function () {
  "use strict";
  var C = window.CARTA;
  var N = C.negocio;
  var PED = window.PG_PEDIDO || null;
  var COM = (PED && PED.modo === "mesa") ? null : (window.PG_COMERCIO || null);   // módulo comercio: horarios por producto/sección (avisos y orden)
  var I = window.PG_I18N, t = I.t, tx = I.tx;
  /* Si la carta ya tiene su link propio, el link viejo de GitHub Pages redirige allí. */
  if (N.sitioUrl && /\.github\.io$/.test(location.hostname) && N.sitioUrl.indexOf(location.hostname) < 0) {
    var dest = N.sitioUrl + location.pathname.replace(/^\/[^\/]+/, "").replace(/\.html$/, "") + location.search;
    location.replace(dest); return;
  }
  document.documentElement.classList.add("js");

  /* ---------- utilidades ---------- */
  function h(tag, cls, txt) {
    var e = document.createElement(tag);
    if (cls) e.className = cls;
    if (txt != null) e.textContent = txt;
    return e;
  }
  function q(sel, ctx) { return (ctx || document).querySelector(sel); }
  function norm(s) {
    return String(s || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[’']/g, "");
  }
  function dinero(n) {
    var v = Number(n);
    return Number.isInteger(v) ? v.toFixed(0) : v.toFixed(2);
  }
  /* % de rebaja respecto al precio de antes (oferta del día) */
  function pctEl(antes, ahora) {
    var p = Math.round((antes - ahora) / antes * 100);
    return p > 0 ? h("span", "pct", "\u2212" + p + "%") : null;
  }
  function precioEl(n) {
    var s = h("span", "precio");
    s.appendChild(h("small", null, "S/"));
    s.appendChild(document.createTextNode(dinero(n)));
    return s;
  }
  var ROMANOS = ["I", "II", "III", "IV", "V", "VI", "VII", "VIII", "IX", "X", "XI", "XII", "XIII", "XIV"];
  var NS = "http://www.w3.org/2000/svg";

  var WA_PATH = "M12.04 2a9.9 9.9 0 0 0-8.5 14.9L2 22l5.25-1.5A9.9 9.9 0 1 0 12.04 2zm5.8 14.1c-.25.7-1.45 1.35-2 1.4-.5.07-1.1.1-1.8-.12a16 16 0 0 1-1.6-.6c-2.8-1.2-4.6-4-4.75-4.2-.13-.2-1.1-1.5-1.1-2.8s.7-2 .95-2.3a1 1 0 0 1 .72-.34h.5c.17 0 .4-.06.62.48.25.57.8 1.95.87 2.1.07.13.1.3 0 .5-.1.2-.15.32-.3.5l-.45.5c-.15.15-.3.3-.13.6.17.3.75 1.25 1.6 2 1.1.98 2 1.28 2.3 1.43.3.14.47.12.65-.07.17-.2.75-.87.95-1.17.2-.3.4-.25.67-.15.28.1 1.75.83 2.05.98.3.15.5.22.57.35.07.12.07.7-.18 1.4z";
  function waSvg() {
    var s = document.createElementNS(NS, "svg");
    s.setAttribute("viewBox", "0 0 24 24"); s.setAttribute("aria-hidden", "true");
    var p = document.createElementNS(NS, "path"); p.setAttribute("d", WA_PATH); s.appendChild(p);
    return s;
  }
  function ornamento() {
    var d = h("div", "orn");
    d.setAttribute("aria-hidden", "true");
    var s = document.createElementNS(NS, "svg");
    s.setAttribute("viewBox", "0 0 24 24");
    var p = document.createElementNS(NS, "path");
    p.setAttribute("d", "M12 1l3 8 8 3-8 3-3 8-3-8-8-3 8-3z");
    s.appendChild(p); d.appendChild(s);
    return d;
  }

  /* ---------- iconos de alérgenos ---------- */
  var ICONOS = {
    gluten: "M12 21V9M12 9c-2.2-.8-3.2-2.6-3.2-4.8 2.2 0 3.2 1.6 3.2 3.4M12 9c2.2-.8 3.2-2.6 3.2-4.8-2.2 0-3.2 1.6-3.2 3.4M12 14c-2.2-.8-3.2-2.6-3.2-4.8M12 14c2.2-.8 3.2-2.6 3.2-4.8M12 19c-2.2-.8-3.2-2.6-3.2-4.8M12 19c2.2-.8 3.2-2.6 3.2-4.8",
    lacteos: "M7 4h10l-1.4 16.2a1 1 0 0 1-1 .8H9.4a1 1 0 0 1-1-.8zM7.6 9.5h8.8",
    huevo: "M12 3c3.6 0 6 5.2 6 9.4a6 6 0 0 1-12 0C6 8.2 8.4 3 12 3z",
    pescado: "M3 12c3-5 9-6 13-2l5-3v10l-5-3c-4 4-10 3-13-2zM8 11.6h.01",
    mariscos: "M5 15c0-5 4-9 9.5-9C17.5 6 19 7.5 19 9.5S17.2 12 15 12c-2 0-3 1-3 3 0 3-2.2 5-5 5M9 6.5l-3-2M7 9l-3.2-.6",
    frutosSecos: "M12 3c4 2 6.2 6 6.2 10a6.2 6.2 0 0 1-12.4 0C5.8 9 8 5 12 3zM12 3v18",
    mani: "M9.5 3.5c-3 0-4 3-3 5 .9 1.3.9 2.2 0 3.5-1.2 2 0 5 3 5.8 2.8.8 4-1 4.8-2.8.6-1.2 1.4-1.2 2.4-2 1.6-1.6.6-4.6-2.4-5.6-1.6-.6-3-3.9-4.8-3.9z",
    soya: "M4 15c0-6.4 6-11 16-11 0 10-5 16-11 16-3 0-5-2-5-5zM9 15l6-6",
    sulfitos: "M7 3.5h10c0 6-2 9-5 9s-5-3-5-9zM12 12.5V20M8 21h8"
  };
  function iconoSvg(clave) {
    var s = document.createElementNS(NS, "svg");
    s.setAttribute("viewBox", "0 0 24 24"); s.setAttribute("aria-hidden", "true");
    var p = document.createElementNS(NS, "path"); p.setAttribute("d", ICONOS[clave] || ""); s.appendChild(p);
    return s;
  }

  /* ---------- horario ---------- */
  function minutos(hhmm) { var p = hhmm.split(":"); return (+p[0]) * 60 + (+p[1]); }
  function fmt12(hhmm) {
    var p = hhmm.split(":"), hh = +p[0], mm = p[1], suf = hh >= 12 ? "pm" : "am";
    hh = hh % 12 || 12;
    return hh + ":" + mm + " " + suf;
  }
  var MAPA_DIA = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
  function ahoraLugar(fecha) {
    try {
      var f = new Intl.DateTimeFormat("en-US", { timeZone: C.horario.zona, weekday: "short", hour: "2-digit", minute: "2-digit", hourCycle: "h23", year: "numeric", month: "2-digit", day: "2-digit" });
      var o = {}; f.formatToParts(fecha).forEach(function (x) { o[x.type] = x.value; });
      return { dia: MAPA_DIA[o.weekday], min: (+o.hour % 24) * 60 + (+o.minute), fecha: o.year + "-" + o.month + "-" + o.day };
    } catch (e) {
      var p2 = function (n) { return ("0" + n).slice(-2); };
      return { dia: fecha.getDay(), min: fecha.getHours() * 60 + fecha.getMinutes(), fecha: fecha.getFullYear() + "-" + p2(fecha.getMonth() + 1) + "-" + p2(fecha.getDate()) };
    }
  }
  function estadoActual(fecha) {
    var ah = ahoraLugar(fecha || new Date());
    var hoy = C.horario.dias[ah.dia];
    if (hoy && ah.min >= minutos(hoy[0]) && ah.min < minutos(hoy[1])) {
      return { abierto: true, cierra: fmt12(hoy[1]) };
    }
    /* "corto": versión breve para la barra superior (en 375 px no debe desbordarse) */
    if (hoy && ah.min < minutos(hoy[0])) {
      return { abierto: false, cuando: t("hoyA") + fmt12(hoy[0]), corto: t("hoyCorto") + fmt12(hoy[0]), hoy: true, abre: fmt12(hoy[0]) };
    }
    for (var i = 1; i <= 7; i++) {
      var d = (ah.dia + i) % 7, r = C.horario.dias[d];
      if (r) return { abierto: false, cuando: (i === 1 ? t("manana") : t("el")) + t("dias")[d] + t("aLas") + fmt12(r[0]),
        corto: (i === 1 ? t("mananaCorto") : t("dias")[d]) + " " + fmt12(r[0]), abre: fmt12(r[0]) };
    }
    return { abierto: false, cuando: t("pronto"), corto: t("pronto") };
  }

  /* ---------- horario de la tienda (Nostri Prodotti) ----------
     Sale de CARTA.ext.comercio.s.tienda (hoja Horarios del panel). Si aún no está publicado, se usa el horario que fijó el local
     (mar–sáb 10:00–23:00 · dom 16:00–23:00), solo para MOSTRARLO: la disponibilidad para pedir sigue la regla del servidor. */
  var TIENDA_DEF = [{ d: [2, 3, 4, 5, 6], h: [["10:00", "23:00"]] }, { d: [0], h: [["16:00", "23:00"]] }];
  function horarioTienda() {
    var rt = C.ext && C.ext.comercio && C.ext.comercio.s && C.ext.comercio.s.tienda;
    var regs = rt ? (Array.isArray(rt) ? rt : [rt]) : TIENDA_DEF;
    return regs.filter(function (r) { return r && r.h && r.h.length; });
  }
  function tiendaAbiertaAhora() {
    var ah = ahoraLugar(new Date());
    return horarioTienda().some(function (r) {
      if (r.d && r.d.length && r.d.indexOf(ah.dia) < 0) return false;
      return r.h.some(function (x) { var a = minutos(x[0]), b = minutos(x[1]); if (b <= a) b += 1440; return ah.min >= a && ah.min < b; });
    });
  }

  /* ---------- promociones con calendario (misma regla que el servidor) ---------- */
  function sumarDias(iso, n) {
    var p = iso.split("-"), d = new Date(Date.UTC(+p[0], +p[1] - 1, +p[2] + n));
    return d.getUTCFullYear() + "-" + ("0" + (d.getUTCMonth() + 1)).slice(-2) + "-" + ("0" + d.getUTCDate()).slice(-2);
  }
  function diaDe(iso) { var p = iso.split("-"); return new Date(Date.UTC(+p[0], +p[1] - 1, +p[2])).getUTCDay(); }
  function promoEnFecha(pr, iso) {
    if (pr.desde && iso < pr.desde) return false;
    if (pr.hasta && iso > pr.hasta) return false;
    if (pr.excluir && pr.excluir.indexOf(iso) >= 0) return false;
    if (pr.extra && pr.extra.indexOf(iso) >= 0) return true;
    return !pr.dias || pr.dias.indexOf(diaDe(iso)) >= 0;
  }
  /** Texto de los días: "martes, miércoles y jueves" / "viernes a domingo" */
  function diasTexto(dias) {
    var nombres = t("dias"), orden = [1, 2, 3, 4, 5, 6, 0];
    var l = orden.filter(function (d) { return dias.indexOf(d) >= 0; });
    var seguidos = l.length > 2 && l.every(function (d, i) { return i === 0 || orden.indexOf(d) === orden.indexOf(l[i - 1]) + 1; });
    if (seguidos) return nombres[l[0]] + t("a") + nombres[l[l.length - 1]];
    return l.map(function (d) { return nombres[d]; }).join(", ").replace(/, ([^,]*)$/, t("y") + "$1");
  }
  /** Marca cada promo: _hoy (va hoy), _prox (próxima fecha en 14 días), _hora (fuera de su franja ahora). */
  function evaluarPromos() {
    var ah = ahoraLugar(new Date());
    C.secciones.forEach(function (s) {
      s.grupos.forEach(function (g) {
        g.items.forEach(function (it) {
          var pr = it.promo; if (!pr) return;
          it._hoy = promoEnFecha(pr, ah.fecha);
          it._prox = null; it._hora = false;
          if (it._hoy && pr.horas) it._hora = ah.min < minutos(pr.horas[0]) || ah.min >= minutos(pr.horas[1]);
          if (!it._hoy) for (var i = 1; i <= 14; i++) { var f = sumarDias(ah.fecha, i); if (promoEnFecha(pr, f)) { it._prox = f; break; } }
          var cuando = pr.dias && pr.dias.length && pr.dias.length < 7 ? diasTexto(pr.dias) : t("todosDias");
          if (pr.horas) cuando += t("deA", { a: fmt12(pr.horas[0]), b: fmt12(pr.horas[1]) });
          it._cuando = cuando;
          it._oculto = !it._hoy && !it._prox; // vencida o muy lejana: no se muestra
        });
      });
    });
    return ah;
  }

  var estadoBarra, bienvenida, fab, fabTxt, buscadorEl;
  /* La tienda ahora es "Nostri Prodotti": una sección más de la carta (id interno "tienda") */
  function tituloSec(s) { return s.id === "tienda" ? t("tiendaTit") : tx(s, "titulo"); }
  function subSec(s) { return s.id === "tienda" ? t("tiendaSub") : tx(s, "subtitulo"); }
  /* Alto de lo que queda pegado arriba (barra de estado + barra de secciones): offset para saltar a una sección */
  function barraAlto() { var e = q(".estado"), n = q("#nav"); return (e ? e.offsetHeight : 0) + (n ? n.offsetHeight : 0) + 6; }
  function irSeccion(id) {
    var el = id && document.getElementById(id); if (!el) return false;
    window.scrollTo({ top: Math.max(0, el.getBoundingClientRect().top + window.pageYOffset - barraAlto()), behavior: "instant" });
    return true;
  }
  function waUrl() {
    return "https://wa.me/" + N.whatsapp + "?text=" + encodeURIComponent(N.mensajeWhatsapp);
  }
  function pintarEstado() {
    var e = estadoActual();
    if (COM && COM.barra && PED && PED.activo()) {   // QR de barra: sin horario ni "cerrado"; la persona ya está en el local
      estadoBarra.className = "estado abierto"; estadoBarra.textContent = "";
      estadoBarra.appendChild(h("i")); estadoBarra.appendChild(h("span", null, t("barraEstado")));
      ajustarEstado();
      if (!bienvenida) return;
      bienvenida.textContent = "";
      bienvenida.appendChild(h("h1", null, t("barraTitulo")));
      bienvenida.appendChild(h("p", null, t("barraTexto")));
      if (fabTxt) fabTxt.textContent = t("pedirAhora");
      return;
    }
    var esMesa = PED && PED.modo === "mesa";
    var tiendaYa = !e.abierto && !esMesa && tiendaAbiertaAhora();
    estadoBarra.className = "estado " + (e.abierto || tiendaYa ? "abierto" : "cerrado");
    estadoBarra.textContent = "";
    estadoBarra.appendChild(h("i"));
    if (esMesa && PED.mesa) estadoBarra.appendChild(h("span", "estado__mesa", t("mesa") + PED.mesa));
    if (e.abierto) {
      var s = h("span"); s.appendChild(document.createTextNode(t("abierto"))); s.appendChild(h("b", null, e.cierra));
      estadoBarra.appendChild(s);
    } else if (tiendaYa) {   // restaurante cerrado pero la tienda (Nostri Prodotti) atiende
      var s3 = h("span"); s3.appendChild(h("b", null, t("tiendaAbiertaEst")));
      s3.appendChild(document.createTextNode(e.hoy ? t("restDesde", { h: e.abre }) : t("restDia", { c: e.corto })));
      estadoBarra.appendChild(s3);
    } else {
      var s2 = h("span"); s2.appendChild(document.createTextNode(t("cerrado"))); s2.appendChild(h("b", null, e.corto || e.cuando));
      /* pedidos programados: desde qué hora se puede dejar el pedido (sin explicar la ventana de atención) */
      var dp = PED && PED.modo === "delivery" && PED.aceptaAhora && PED.aceptaAhora() && PED.desdeProg ? PED.desdeProg() : "";
      if (dp) s2.appendChild(document.createTextNode(t("pedidosDesde", { h: dp })));
      estadoBarra.appendChild(s2);
    }
    ajustarEstado();
    var conCarrito = PED && PED.activo();
    if (!bienvenida) return;   // mesa: sin portada, se entra directo a la carta
    bienvenida.textContent = "";
    var titulo = t("bienvenido"), texto;
    if (e.abierto) {
      texto = conCarrito ? t("abiertoCarrito", { h: e.cierra }) : t("abiertoSin", { h: e.cierra });
    } else if (tiendaYa) {
      texto = t("tiendaAbiertaTxt", { c: e.cuando }) + (conCarrito && PED.aceptaAhora() ? t("programar") : "");
    } else {
      texto = t("cerradoTxt", { c: e.cuando }) + (conCarrito && PED.aceptaAhora() ? t("programar") : t("recorre"));
    }
    bienvenida.appendChild(h("h1", null, titulo));
    bienvenida.appendChild(h("p", null, texto));
    var pedir = q("#btn-pedir");
    if (pedir && !conCarrito) pedir.lastChild.textContent = e.abierto ? t("realizarPedido") : t("escribenos");
    if (fabTxt) fabTxt.textContent = e.abierto ? t("pedirAhora") : t("consultasWa");
  }

  /* La barra superior puede ocupar 2 líneas en pantallas angostas: su alto real mueve la barra de secciones pegada debajo */
  function ajustarEstado() {
    if (!estadoBarra) return;
    requestAnimationFrame(function () { document.documentElement.style.setProperty("--estado-h", (estadoBarra.offsetHeight || 34) + "px"); });
  }

  function botonIdioma(cls) {
    var b = h("button", cls, t("idioma")); b.type = "button"; b.setAttribute("aria-label", t("idiomaAria")); b.lang = I.lang === "en" ? "es" : "en";
    b.addEventListener("click", I.cambiar);
    return b;
  }

  /* ---------- portada ---------- */
  function portada() {
    var enBarra = !!(COM && COM.barra && PED && PED.activo());
    var compacta = (PED && PED.modo === "mesa") || enBarra;
    var s = h("header", "portada" + (compacta ? " portada--compacta" : "")); s.id = "inicio";
    s.appendChild(h("div", "marco"));
    s.appendChild(botonIdioma("idioma idioma--portada"));
    var in_ = h("div", "portada__in");
    in_.appendChild(h("div", "saludo", "Benvenuti"));
    var g = h("img", "gallo"); g.src = "gallo-oro.png"; g.alt = ""; g.width = 112; in_.appendChild(g);
    var m = h("img", "marca"); m.src = "wordmark-crema.png"; m.alt = N.nombre; in_.appendChild(m);
    in_.appendChild(h("div", "desde", N.desde));
    var tri = h("div", "tricolor"); tri.setAttribute("aria-hidden", "true");
    tri.appendChild(h("span")); tri.appendChild(h("span")); tri.appendChild(h("span")); in_.appendChild(tri);
    bienvenida = h("div", "bienvenida"); in_.appendChild(bienvenida);
    var ac = h("div", "acciones");
    if (PED && PED.activo()) {
      var b1 = h("a", "btn btn--oro", PED.modo === "mesa" ? t("verCartaPedir") : enBarra ? t("verCarta") : t("hacerPedido")); b1.href = "#carta-inicio";
      ac.appendChild(b1);
      if (PED.modo !== "mesa" && !enBarra) {
        var b2 = h("a", "btn btn--linea"); b2.href = waUrl(); b2.target = "_blank"; b2.rel = "noopener";
        b2.appendChild(waSvg()); b2.appendChild(document.createTextNode(t("consultasWa"))); ac.appendChild(b2);
      }
    } else {
      var a1 = h("a", "btn btn--oro"); a1.id = "btn-pedir"; a1.href = waUrl(); a1.target = "_blank"; a1.rel = "noopener";
      a1.appendChild(waSvg()); a1.appendChild(document.createTextNode(t("realizarPedido")));
      var a2 = h("a", "btn btn--linea", t("verCarta")); a2.href = "#carta-inicio";
      ac.appendChild(a1); ac.appendChild(a2);
    }
    in_.appendChild(ac);
    if (C.historia && C.historia.parrafos && C.historia.parrafos.length) {
      var lh = h("a", "link-historia", t("nuestraHistoria") + " →"); lh.href = "#historia"; in_.appendChild(lh);
    }
    s.appendChild(in_);
    if (!compacta) {
      var bj = h("a", "bajar"); bj.href = "#carta-inicio"; bj.setAttribute("aria-label", t("verCarta"));
      bj.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 9l6 6 6-6"/></svg>';
      s.appendChild(bj);
    }
    return s;
  }

  /* ---------- historia ---------- */
  function historia() {
    var s = h("section", "pagina historia rev"); s.id = "historia";
    s.appendChild(h("div", "marco2"));
    var i = h("div", "pagina__in");
    i.appendChild(h("div", "eyebrow", tx(C.historia, "eyebrow")));
    i.appendChild(h("h2", null, tx(C.historia, "titulo")));
    i.appendChild(ornamento());
    var ps = I.lang === "en" && C.historia.parrafos_en && C.historia.parrafos_en.length ? C.historia.parrafos_en : C.historia.parrafos;
    ps.forEach(function (p) { i.appendChild(h("p", null, p)); });
    i.appendChild(h("div", "firma", t("familia")));
    s.appendChild(i);
    return s;
  }

  /* ---------- diagrama Tris di Pasta ---------- */
  function diagramaTris() {
    var w = h("div", "plato"); w.setAttribute("role", "img");
    w.setAttribute("aria-label", "Plato largo: raviolini a la izquierda, lasagna de carne al centro y fettuccine a la derecha");
    var s = document.createElementNS(NS, "svg"); s.setAttribute("viewBox", "0 0 300 96");
    function el(n, a) { var e = document.createElementNS(NS, n); for (var k in a) e.setAttribute(k, a[k]); return e; }
    s.appendChild(el("ellipse", { cx: 150, cy: 48, rx: 146, ry: 44, fill: "#f7f1e3", stroke: "#a9803f", "stroke-width": 1.4 }));
    s.appendChild(el("ellipse", { cx: 150, cy: 48, rx: 136, ry: 36, fill: "none", stroke: "#a9803f", "stroke-width": .6, opacity: .7 }));
    s.appendChild(el("line", { x1: 103, y1: 18, x2: 103, y2: 78, stroke: "#a9803f", "stroke-width": .8, "stroke-dasharray": "2 3" }));
    s.appendChild(el("line", { x1: 197, y1: 18, x2: 197, y2: 78, stroke: "#a9803f", "stroke-width": .8, "stroke-dasharray": "2 3" }));
    function txt(x, l1, l2) {
      var t1 = el("text", { x: x, y: l2 ? 45 : 51 }); t1.textContent = l1; s.appendChild(t1);
      if (l2) { var t2 = el("text", { x: x, y: 57 }); t2.textContent = l2; s.appendChild(t2); }
    }
    txt(62, "Raviolini"); txt(150, "Lasagna", "di Carne"); txt(238, "Fettuccine");
    w.appendChild(s);
    return w;
  }

  /* ---------- plato ---------- */
  function plato(it, sec) {
    var a = h("article", "it rev" + (it.agotado ? " it--agotado" : "") + (it.promo ? " it--promo" + (it._hoy ? " it--hoy" : " it--otrodia") : ""));
    a.id = "p-" + it.id;
    if (it.promo) {
      var bd = h("div", "promo-dia");
      if (it._hoy) { bd.appendChild(h("b", null, t("hoy"))); bd.appendChild(document.createTextNode(" · " + it._cuando)); }
      else bd.appendChild(document.createTextNode(it._cuando));
      a.appendChild(bd);
    }
    if (it.destacado === "tris") a.className += " it--dest";
    /* horario: la tarjeta se atenúa si no se puede pedir ahora, pero el aviso "Disponible a partir de…" va en la cabecera de la sección;
       en el producto solo si su horario propio difiere del de su sección */
    var fueraAhora = COM && COM.aviso && it.tipo !== "salsa" && !it.agotado ? COM.aviso(it, sec) : "";
    var avHr = fueraAhora && COM.avisoProd ? COM.avisoProd(it, sec) : fueraAhora;
    if (fueraAhora) a.className += " it--fuera";
    var tieneFoto = !!it.foto;
    var esTienda = !!(sec && sec.id === "tienda");
    /* selector de tamaño como chips: tienda, o cualquier producto cuyos tamaños son pesos (1 kg, 1/2 kg, 1/4 kg) */
    var conChips = !!(it.t && it.t.length > 1 && (esTienda || it.t.every(function (x) { return /(^|\s)(kg|g|gr)\b/i.test(x[0]); })));
    var conFw = tieneFoto || esTienda;
    a.className += conFw ? " fcon" : " it--sinfoto";
    var top = h("div", "it__top");
    /* etiqueta solo si el dato ya existe en la carta */
    if (it.nuevo) top.appendChild(h("span", "tag tag--nuevo", t("nuevo")));
    else if (it.popular) top.appendChild(h("span", "tag tag--popular", t("popular")));
    top.appendChild(h("h4", "it__n", tx(it, "n")));
    var subEs = I.lang === "en" ? it.sub_en : it.sub;   // subtítulo en español bajo el nombre italiano (en inglés solo si hay traducción)
    if (subEs) top.appendChild(h("span", "it__sub", subEs));
    var tamSel = it.t && it.t.length ? it.t[0][0] : "", cajaPrecio = null;
    function pintarPrecioTam() {
      cajaPrecio.textContent = "";
      var x = it.t.filter(function (y) { return y[0] === tamSel; })[0] || it.t[0];
      var ant = it.ta && it.ta.filter(function (y) { return y[0] === x[0]; })[0];
      if (ant && ant[1] > x[1]) {
        var pt = precioEl(ant[1]); pt.className += " precio--antes"; pt.title = t("antes"); cajaPrecio.appendChild(pt);
        var pc3 = pctEl(ant[1], x[1]); if (pc3) cajaPrecio.appendChild(pc3);
      }
      cajaPrecio.appendChild(precioEl(x[1]));
    }
    if (conChips) { cajaPrecio = h("span", "it__sel"); pintarPrecioTam(); top.appendChild(cajaPrecio); }
    if (it.p != null && !it.t) {
      top.appendChild(h("span", "it__pts"));
      if (it.pa != null && it.pa > it.p) {
        var pa = precioEl(it.pa); pa.className += " precio--antes"; pa.title = t("antes"); top.appendChild(pa);
        var pc = pctEl(it.pa, it.p); if (pc) top.appendChild(pc);
      }
      top.appendChild(precioEl(it.p));
    }
    a.appendChild(top);
    if (avHr) { var hr = h("span", "hr-tag", avHr); hr.setAttribute("title", avHr); a.appendChild(hr); }
    if (it.destacado === "hoy" && !it.agotado) a.appendChild(h("span", "hoy-tag", t("soloHoy")));
    if (tx(it, "g")) a.appendChild(h("p", "it__g", tx(it, "g")));
    if (tx(it, "d")) a.appendChild(h("p", "it__d", tx(it, "d")));
    var inc = I.lang === "en" && it.inc_en ? it.inc_en : it.inc;
    if (inc && inc.length) {
      var ul = h("ul", "incluye");
      inc.forEach(function (x) { ul.appendChild(h("li", null, x)); });
      a.appendChild(ul);
    }
    if (it.promo && !it._hoy && it._prox) {
      var dp = diaDe(it._prox), ah = ahoraLugar(new Date());
      a.appendChild(h("p", "promo-prox", t("vuelve") + (it._prox === sumarDias(ah.fecha, 1) ? t("mananaCorto") : t("el") + t("dias")[dp])));
    }
    if (it.canal === "local") a.appendChild(h("span", "etq", t("soloLocal")));
    if (it.canal === "delivery" && !it.promo) a.appendChild(h("span", "etq", t("soloDelivery")));
    if (it.extra) a.appendChild(h("span", "mas", t("adicional") + dinero(it.extra)));
    if (conChips) {
      var cw = h("div", "tam-chips"); cw.setAttribute("role", "radiogroup"); cw.setAttribute("aria-label", t("tamElige"));
      it.t.forEach(function (x) {
        var c = h("button", "tam-chip" + (x[0] === tamSel ? " on" : ""), I.tam(x[0])); c.type = "button";
        c.setAttribute("role", "radio"); c.setAttribute("aria-checked", x[0] === tamSel ? "true" : "false");
        c.addEventListener("click", function (ev) {
          ev.stopPropagation(); tamSel = x[0];
          Array.prototype.forEach.call(cw.children, function (o) { var on = o === c; o.classList.toggle("on", on); o.setAttribute("aria-checked", on ? "true" : "false"); });
          pintarPrecioTam();
        });
        cw.appendChild(c);
      });
      a.appendChild(cw);
    } else if (it.t) {
      var tb = h("div", "tam");
      it.t.forEach(function (x) {
        var c = h("div"); c.appendChild(h("span", null, I.tam(x[0])));
        var ant = it.ta && it.ta.filter(function (y) { return y[0] === x[0]; })[0];
        if (ant && ant[1] > x[1]) {
          var pt = precioEl(ant[1]); pt.className += " precio--antes"; pt.title = t("antes"); c.appendChild(pt);
          var pc2 = pctEl(ant[1], x[1]); if (pc2) c.appendChild(pc2);
        }
        c.appendChild(precioEl(x[1])); tb.appendChild(c);
      });
      a.appendChild(tb);
    }
    if (it.al && it.al.length) {
      var al = h("div", "alg");
      it.al.forEach(function (k) {
        if (!ICONOS[k]) return;
        var sp = h("span"); sp.title = I.alergeno(k, C); sp.setAttribute("aria-label", t("contiene") + I.alergeno(k, C));
        sp.appendChild(iconoSvg(k)); al.appendChild(sp);
      });
      a.appendChild(al);
    }
    if (it.agotado && it.tipo !== "salsa") a.appendChild(h("span", "agotado", t("agotado")));
    else if (it.agotado) a.appendChild(h("span", "agotado", t("noDisponible")));
    var btnAdd = PED && PED.puedePedir(it, sec) ? PED.boton(it, sec, conChips ? function () { return tamSel; } : null) : null;
    if (PED && it.tipo !== "salsa") {
      a.className += " it--clic"; a.tabIndex = 0; a.setAttribute("role", "button");
      a.setAttribute("aria-label", t("verDetalle") + tx(it, "n"));
      var abrir = function (ev) { if (ev.target.closest(".agregar, .tam-chips")) return; PED.abrirDetalle(it, sec); };
      a.addEventListener("click", abrir);
      a.addEventListener("keydown", function (ev) { if ((ev.key === "Enter" || ev.key === " ") && ev.target === a) { ev.preventDefault(); PED.abrirDetalle(it, sec); } });
    }
    if (conFw) {
      var fw = h("div", "it__fw");
      var im = h("img", "foto" + (sec && (sec.id === "italia" || (sec.id === "vini" && /^fotos\//.test(it.foto))) ? " foto--producto" + (sec.id === "vini" ? " foto--botella" : "") : "")); im.alt = tx(it, "n"); im.loading = "lazy";
      /* sin foto (o foto rota): placeholder de marca, el gallo sobre fondo crema */
      var vacia = function () { im.onerror = null; im.src = "gallo-oro.png"; im.className = "foto foto--vacia"; im.alt = ""; fw.className += " it__fw--vacia"; };
      if (tieneFoto) { im.src = it.foto; im.onerror = vacia; } else vacia();
      fw.appendChild(im);
      if (btnAdd) fw.appendChild(btnAdd);
      a.appendChild(fw);
    } else if (btnAdd) a.appendChild(btnAdd);
    a.setAttribute("data-q", norm([it.n, it.sub, it.g, it.d, it.n_en, it.sub_en, it.g_en, it.d_en].join(" ")));
    return a;
  }

  /* ---------- secciones ---------- */
  var seccionesVisibles = [];
  var hayAlergenos = false;

  /* Enlace directo a una sección: /?s=pizze (y /#pizze abre lo mismo) */
  function enlaceSeccion(id) { return location.origin + location.pathname.replace(/[^\/]*$/, "") + "?s=" + encodeURIComponent(id); }
  function avisoBreve(texto) {
    var a = h("div", "aviso-copia", texto); document.body.appendChild(a);
    setTimeout(function () { a.classList.add("on"); }, 10);
    setTimeout(function () { a.classList.remove("on"); setTimeout(function () { a.remove(); }, 300); }, 2000);
  }
  function copiarEnlaceSec(id) {
    var url = enlaceSeccion(id), ok = function () { avisoBreve(t("enlaceCopiadoSec")); };
    if (navigator.clipboard && navigator.clipboard.writeText) { navigator.clipboard.writeText(url).then(ok, function () { window.prompt(t("copiaEnlace"), url); }); return; }
    var ta = h("textarea"); ta.value = url; ta.setAttribute("readonly", ""); ta.style.cssText = "position:fixed;opacity:0";
    document.body.appendChild(ta); ta.select();
    try { document.execCommand("copy") ? ok() : window.prompt(t("copiaEnlace"), url); } catch (e) { window.prompt(t("copiaEnlace"), url); }
    ta.remove();
  }
  function botonEnlace(id) {
    var b = h("button", "sec__copiar"); b.type = "button"; b.setAttribute("aria-label", t("copiarEnlace")); b.title = t("copiarEnlace");
    var sv = document.createElementNS(NS, "svg"); sv.setAttribute("viewBox", "0 0 24 24"); sv.setAttribute("aria-hidden", "true");
    var p1 = document.createElementNS(NS, "path"); p1.setAttribute("d", "M10 14a4.5 4.5 0 0 0 6.4 0l3-3a4.5 4.5 0 0 0-6.4-6.4l-1 1M14 10a4.5 4.5 0 0 0-6.4 0l-3 3a4.5 4.5 0 0 0 6.4 6.4l1-1");
    sv.appendChild(p1); b.appendChild(sv);
    b.addEventListener("click", function () { copiarEnlaceSec(id); });
    return b;
  }

  /** Promociones de otros días: plegadas bajo un control discreto, agrupadas por el día en que vuelven. */
  function promosOtrosDias(otros, sec) {
    var w = h("div", "promo-otros-w");
    var b = h("button", "promo-mas", t("masPromos")); b.type = "button"; b.setAttribute("aria-expanded", "false");
    var box = h("div", "promo-otros");
    var ah = ahoraLugar(new Date()), manana = sumarDias(ah.fecha, 1), fechas = [], porFecha = {};
    otros.forEach(function (it) { var f = it._prox || "9999"; if (!porFecha[f]) { porFecha[f] = []; fechas.push(f); } porFecha[f].push(it); });
    fechas.sort();
    fechas.forEach(function (f) {
      var nom = f === "9999" ? "" : t("dias")[diaDe(f)];
      box.appendChild(h("h3", "promo-otros__dia", (f === manana ? t("manana2") + " · " : "") + nom.charAt(0).toUpperCase() + nom.slice(1)));
      porFecha[f].forEach(function (it) { box.appendChild(plato(it, sec)); });
    });
    b.addEventListener("click", function () {
      var ab = !box.classList.contains("abierto");
      box.classList.toggle("abierto", ab); b.setAttribute("aria-expanded", ab ? "true" : "false");
      b.textContent = ab ? t("menosPromos") : t("masPromos");
      if (ab) box.querySelectorAll(".rev").forEach(function (x) { x.classList.add("ya"); });
    });
    w.appendChild(b); w.appendChild(box);
    return w;
  }

  function seccion(sec, idx) {
    var modo = PED ? PED.modo : "delivery";
    var grupos = sec.grupos.filter(function (g) {
      g.items = (g.items || []).filter(function (i) {
        if (i.oculto || i._oculto) return false;
        if (i.canal === "local" && modo !== "mesa") return false;
        if (i.canal === "delivery" && modo === "mesa") return false;
        return true;
      });
      // promociones: primero las de hoy, luego por la fecha más cercana
      g.items.sort(function (x, y) {
        if (!x.promo || !y.promo) return 0;
        if (x._hoy !== y._hoy) return x._hoy ? -1 : 1;
        return String(x._prox || "").localeCompare(String(y._prox || ""));
      });
      return g.items.length;
    });
    if (!grupos.length) return null;
    seccionesVisibles.push(sec);
    sec._fuera = COM && COM.avisoSec ? COM.avisoSec(sec) : "";
    var n = seccionesVisibles.length;
    var esPromo = sec.id === "promociones";
    var s = h("section", "sec " + (esPromo ? "sec--promo" : (n % 2 ? "sec--a" : "sec--b"))); s.id = sec.id;
    var cab = h("header", "sec__cab anim");
    cab.appendChild(h("div", "m"));
    if (modo !== "mesa") cab.appendChild(botonEnlace(sec.id));
    var c = h("div");
    c.appendChild(h("div", "num", ROMANOS[n - 1] || String(n)));
    c.appendChild(h("h2", null, tituloSec(sec)));
    c.appendChild(h("div", "sub", subSec(sec)));
    c.appendChild(ornamento());
    /* "Disponible a partir de…": una sola vez, en la cabecera de la sección */
    if (sec._fuera) { s.className += " sec--fuera"; c.appendChild(h("div", "hr-sec", sec._fuera)); }
    if (tx(sec, "intro")) c.appendChild(h("p", "intro" + (tx(sec, "intro").charAt(0) === "⚠" ? " intro--aviso" : ""), tx(sec, "intro")));
    cab.appendChild(c); s.appendChild(cab);

    var cuerpo = h("div", "sec__cuerpo");
    var otros = [];
    grupos.forEach(function (g) {
      var items = g.items;
      if (esPromo) { otros = otros.concat(items.filter(function (i) { return !i._hoy; })); items = items.filter(function (i) { return i._hoy; }); }
      if (!items.length) return;
      var gr = h("div", "grupo");
      if (g.titulo) {
        var gc = h("div", "grupo__cab anim");
        gc.appendChild(h("h3", null, g.titulo));
        if (g.nota) gc.appendChild(h("p", null, g.nota));
        gc.appendChild(ornamento());
        gr.appendChild(gc);
      }
      items.forEach(function (it) { if (it.al && it.al.length) hayAlergenos = true; gr.appendChild(plato(it, sec)); });
      cuerpo.appendChild(gr);
    });
    if (esPromo) {
      /* por defecto solo las promociones de HOY; el resto, plegado */
      if (!cuerpo.firstChild && otros.length) cuerpo.appendChild(h("p", "promo-vacio", t("sinPromosHoy")));
      if (otros.length) cuerpo.appendChild(promosOtrosDias(otros, sec));
    }
    if (tx(sec, "pie")) cuerpo.appendChild(h("div", "pie", tx(sec, "pie")));
    if (sec.alcohol) cuerpo.appendChild(h("p", "aviso18", t("alcohol")));
    s.appendChild(cuerpo);
    return s;
  }

  function leyenda() {
    var d = h("div", "leyenda");
    d.appendChild(h("h3", null, t("alergenos")));
    var ul = h("ul");
    Object.keys(C.alergenos).forEach(function (k) {
      var li = h("li"); li.appendChild(iconoSvg(k)); li.appendChild(document.createTextNode(I.alergeno(k, C))); ul.appendChild(li);
    });
    d.appendChild(ul);
    return d;
  }

  /* ---------- navegación ---------- */
  function navegacion() {
    var nav = h("nav", "nav"); nav.id = "nav"; nav.setAttribute("aria-label", t("seccionesAria"));
    var in_ = h("div", "nav__in");
    var ch = h("div", "chips"); ch.id = "chips";
    seccionesVisibles.forEach(function (s) {
      var a = h("a", "chip" + (s._fuera ? " chip--fuera" : ""), tituloSec(s)); a.href = "#" + s.id; a.setAttribute("data-id", s.id);
      if (s._fuera) a.title = s._fuera;
      ch.appendChild(a);
    });
    /* menú hamburguesa: todas las secciones a la vista */
    var hb = h("button", "hamb"); hb.type = "button"; hb.setAttribute("aria-label", t("menuSecciones"));
    hb.setAttribute("aria-expanded", "false"); hb.setAttribute("aria-controls", "menu-sec");
    hb.innerHTML = '<span></span><span></span><span></span>';
    var menu = h("div", "menu-sec"); menu.id = "menu-sec";
    var ul = h("ul");
    seccionesVisibles.forEach(function (s) {
      var li = h("li"), a = h("a", s._fuera ? "menu-fuera" : null, tituloSec(s)); a.href = "#" + s.id;
      a.addEventListener("click", function (ev) {
        ev.preventDefault(); cerrarMenu();
        var chip = ch.querySelector('[data-id="' + s.id + '"]'); if (chip) chip.click();
      });
      li.appendChild(a); ul.appendChild(li);
    });
    menu.appendChild(ul);
    function cerrarMenu() { menu.classList.remove("abierto"); hb.classList.remove("on"); hb.setAttribute("aria-expanded", "false"); }
    hb.addEventListener("click", function () {
      var ab = !menu.classList.contains("abierto");
      menu.classList.toggle("abierto", ab); hb.classList.toggle("on", ab); hb.setAttribute("aria-expanded", ab ? "true" : "false");
      if (ab) { var on = q(".chip.on"); menu.querySelectorAll("a").forEach(function (x) { x.classList.toggle("on", !!on && x.getAttribute("href") === "#" + on.getAttribute("data-id")); }); }
    });
    document.addEventListener("click", function (ev) { if (!nav.contains(ev.target)) cerrarMenu(); });
    document.addEventListener("keydown", function (ev) { if (ev.key === "Escape") cerrarMenu(); });
    in_.appendChild(hb);
    in_.appendChild(ch);
    in_.appendChild(botonIdioma("idioma"));
    nav.appendChild(in_);
    nav.appendChild(menu);
    /* buscador siempre visible arriba de la carta */
    var b = h("div", "buscador"); b.id = "busca";
    var sv = document.createElementNS(NS, "svg"); sv.setAttribute("viewBox", "0 0 24 24"); sv.setAttribute("aria-hidden", "true"); sv.setAttribute("class", "buscador__ic");
    var c1 = document.createElementNS(NS, "circle"); c1.setAttribute("cx", 11); c1.setAttribute("cy", 11); c1.setAttribute("r", 6.5);
    var l1 = document.createElementNS(NS, "path"); l1.setAttribute("d", "M16 16l5 5"); sv.appendChild(c1); sv.appendChild(l1);
    b.appendChild(sv);
    var inp = h("input"); inp.type = "search"; inp.id = "q"; inp.placeholder = t("buscar"); inp.setAttribute("aria-label", t("buscarAria")); inp.autocomplete = "off";
    b.appendChild(inp);
    var cl = h("button", "buscador__x", "\u00d7"); cl.type = "button"; cl.setAttribute("aria-label", t("buscarAria"));
    cl.addEventListener("click", function () { inp.value = ""; cl.classList.remove("hay"); filtrar(""); inp.focus(); });
    b.appendChild(cl);
    inp.addEventListener("input", function () { cl.classList.toggle("hay", !!inp.value); filtrar(inp.value); });
    buscadorEl = b;
    return nav;
  }

  function coincide(texto, consulta) {
    var palabras = texto.split(/[^a-z0-9]+/);
    return consulta.split(/\s+/).filter(Boolean).every(function (t) {
      return palabras.some(function (w) { return w.indexOf(t) === 0; });
    });
  }
  function filtrar(valor) {
    var c = norm(valor).trim();
    document.body.classList.toggle("buscando", !!c);
    var total = 0;
    document.querySelectorAll("#vista-carta .sec").forEach(function (sec) {
      var vis = 0;
      sec.querySelectorAll(".grupo").forEach(function (g) {
        var gv = 0;
        g.querySelectorAll(".it").forEach(function (it) {
          var ok = !c || coincide(it.getAttribute("data-q"), c);
          it.classList.toggle("oculto", !ok);
          if (ok) { gv++; it.classList.add("ya"); }
        });
        g.classList.toggle("oculto", !gv); vis += gv;
      });
      var pie = sec.querySelector(".pie"); if (pie) pie.classList.toggle("oculto", !!c);
      var av = sec.querySelector(".aviso18"); if (av) av.classList.toggle("oculto", !!c);
      sec.classList.toggle("oculto", !vis); total += vis;
    });
    var v = q("#vacio"); v.classList.toggle("hay", !!c && total === 0);
    if (c) window.scrollTo({ top: Math.max(0, q("#busca").offsetTop - 42), behavior: "auto" });
  }

  /* ---------- horario (derivado de los datos; sin "lunes cerrado") ---------- */
  /* Horario en dos tarjetas (restaurante y tienda), formato 24 h como lo escribe el local: "Martes a domingo" / "18:00 – 23:00". */
  function rango24(a, b) { return a + " \u2013 " + (b === "00:00" || b === "24:00" ? "24:00" : b); }
  function gruposDias(regsPorDia) {   // [{d:[...], r:[a,b]}] -> grupos de días seguidos con el mismo rango
    var orden = [1, 2, 3, 4, 5, 6, 0], grupos = [];
    orden.forEach(function (d) {
      var r = regsPorDia[d]; if (!r) return;
      var k = r[0] + "|" + r[1], g = grupos[grupos.length - 1];
      if (g && g.k === k && orden.indexOf(g.dias[g.dias.length - 1]) === orden.indexOf(d) - 1) g.dias.push(d); else grupos.push({ k: k, dias: [d], r: r });
    });
    return grupos.map(function (g) {
      var dt = g.dias.length === 1 ? t("dias")[g.dias[0]] : diasTexto(g.dias);
      return { dias: dt.charAt(0).toUpperCase() + dt.slice(1), horas: rango24(g.r[0], g.r[1]) };
    });
  }
  function bloqueHorario() {
    var b = h("div", "horario"); b.appendChild(h("h3", null, t("horario")));
    var cards = h("div", "horario__cards");
    function tarjetaH(etq, filas) {
      var c = h("div", "horario__c"); c.appendChild(h("span", "horario__etq", etq));
      filas.forEach(function (f) { c.appendChild(h("p", "horario__l", f)); });
      cards.appendChild(c);
    }
    var rest = C.horario && C.horario.dias ? gruposDias(C.horario.dias) : [];
    if (rest.length === 1) tarjetaH(t("horRest"), [rest[0].dias, rest[0].horas]);
    else if (rest.length) tarjetaH(t("horRest"), rest.map(function (g) { return g.dias + " \u00b7 " + g.horas; }));
    else tarjetaH(t("horRest"), [tx(N, "horarioTexto")]);
    var porDia = {};
    horarioTienda().forEach(function (r) { (r.d && r.d.length ? r.d : [0, 1, 2, 3, 4, 5, 6]).forEach(function (d) { if (!porDia[d]) porDia[d] = r.h[0]; }); });
    var ti = gruposDias(porDia);
    if (ti.length) tarjetaH(t("horTienda"), ti.map(function (g) { return g.dias + " \u00b7 " + g.horas; }));
    b.appendChild(cards);
    return b;
  }

  /* ---------- gracias ---------- */
  function gracias() {
    var s = h("footer", "gracias rev"); s.id = "gracias";
    s.appendChild(h("div", "marco2"));
    var i = h("div", "pagina__in");
    i.appendChild(h("div", "gr", "Grazie"));
    i.appendChild(h("h2", null, t("grazie")));
    i.appendChild(ornamento());
    i.appendChild(h("p", null, t("graciasTxt")));
    var d = h("div", "datos");
    function dato(t, x) { var b = h("div"); b.appendChild(h("h3", null, t)); b.appendChild(h("p", null, x)); return b; }
    d.appendChild(dato(t("donde"), N.direccion));
    d.appendChild(bloqueHorario());
    var rb = h("div"); rb.appendChild(h("h3", null, t("siguenos")));
    var rd = h("div", "redes");
    function red(t, u) { var a = h("a", null, t); a.href = u; a.target = "_blank"; a.rel = "noopener"; rd.appendChild(a); }
    if (N.instagram) red("Instagram", "https://instagram.com/" + N.instagram);
    if (N.tiktok) red("TikTok", "https://www.tiktok.com/@" + N.tiktok);
    if (N.facebookUrl) red("Facebook", N.facebookUrl);
    rb.appendChild(rd); d.appendChild(rb);
    i.appendChild(d);
    var a = h("a", "btn btn--oro"); a.href = waUrl(); a.target = "_blank"; a.rel = "noopener";
    a.appendChild(waSvg()); a.appendChild(document.createTextNode(t("escribenos"))); i.appendChild(a);
    var lg = h("img", "logo-fin"); lg.src = "wordmark-crema.png"; lg.alt = N.nombre; i.appendChild(lg);
    /* Califícanos en Google: enlace de reseña publicado por el panel (Config resena_url); sin enlace no se muestra */
    var rs = C.ext && C.ext.comercio && C.ext.comercio.resena;
    if (rs && /^https:\/\//i.test(rs)) {
      var gr = h("a", "btn-resena"); gr.href = rs; gr.target = "_blank"; gr.rel = "noopener";
      gr.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 2.8l2.8 5.8 6.3.9-4.6 4.4 1.1 6.3L12 17.2l-5.6 3 1.1-6.3L2.9 9.5l6.3-.9z"/></svg>';
      gr.appendChild(document.createTextNode(t("califica")));
      i.appendChild(gr);
    }
    i.appendChild(h("div", "copia", N.desde));
    s.appendChild(i);
    return s;
  }

  /* ---------- construcción ---------- */
  function construir() {
    evaluarPromos();
    window.PG = { h: h, estadoActual: estadoActual, ahoraLugar: ahoraLugar, minutos: minutos, dinero: dinero, waUrl: waUrl, precioEl: precioEl, iconoSvg: iconoSvg, ICONOS: ICONOS, diagramaTris: diagramaTris };
    if (PED) { PED.iniciar(window.PG); document.body.classList.add("modo-" + PED.modo); }
    var app = q("#app");
    estadoBarra = h("div", "estado"); estadoBarra.setAttribute("role", "status");
    document.body.insertBefore(estadoBarra, app);

    var secs = [];
    ordenarSecciones().forEach(function (s, i) { var e = seccion(s, i); if (e) secs.push(e); });

    var vCarta = h("div"); vCarta.id = "vista-carta";
    var enMesa = PED && PED.modo === "mesa";
    /* Mesa: sin portada; el QR abre directo en la carta (la mesa se ve, discreta, en la barra superior) */
    if (!enMesa) vCarta.appendChild(portada());
    else if (!PED.mesaValida()) { var av = h("p", "mesa-aviso", t("mesaSinQr")); vCarta.appendChild(av); }
    var nav = navegacion();
    var anc = h("span"); anc.id = "carta-inicio"; anc.style.cssText = "display:block;position:relative;top:-42px"; vCarta.appendChild(anc);
    vCarta.appendChild(buscadorEl);
    espera = h("p", "espera"); espera.setAttribute("role", "status"); espera.hidden = true; vCarta.appendChild(espera);
    vCarta.appendChild(nav);
    secs.forEach(function (s) { vCarta.appendChild(s); });
    var cuerpoFinal = secs.length ? secs[secs.length - 1].querySelector(".sec__cuerpo") : null;
    if (hayAlergenos && cuerpoFinal) cuerpoFinal.appendChild(leyenda());
    var vacio = h("p", "vacio", t("noEncontrado")); vacio.id = "vacio"; vCarta.appendChild(vacio);
    if (C.historia && C.historia.parrafos && C.historia.parrafos.length) vCarta.appendChild(historia());
    app.appendChild(vCarta);
    app.appendChild(gracias());

    var f = h("a", "fab"); f.href = waUrl(); f.target = "_blank"; f.rel = "noopener";
    f.appendChild(waSvg()); fabTxt = h("span", null, t("pedirAhora")); f.appendChild(fabTxt);
    if (COM && COM.barra) f.style.display = "none";   // barra: nada de WhatsApp flotante, se pide aquí
    document.body.appendChild(f); fab = f;

    pintarEstado();
    setInterval(pintarEstado, 60000);

    /* ancla de la carta: salto exacto bajo la barra */
    document.querySelectorAll('a[href^="#"]').forEach(function (a) {
      a.addEventListener("click", function (ev) {
        var id = a.getAttribute("href").slice(1), el = document.getElementById(id);
        if (!el) return;
        ev.preventDefault();
        var y = el.getBoundingClientRect().top + window.pageYOffset - (id === "carta-inicio" ? 0 : barraAlto());
        window.scrollTo({ top: y, behavior: matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth" });
      });
    });

    /* chip activo + botón flotante */
    var chips = document.querySelectorAll(".chip");
    if ("IntersectionObserver" in window) {
      var io = new IntersectionObserver(function (es) {
        es.forEach(function (e) {
          if (e.isIntersecting) {
            chips.forEach(function (c) { c.classList.toggle("on", c.getAttribute("data-id") === e.target.id); });
            var on = q(".chip.on"); if (on) { var box = q("#chips"); box.scrollTo({ left: on.offsetLeft - box.clientWidth / 2 + on.clientWidth / 2, behavior: "smooth" }); }
          }
        });
      }, { rootMargin: "-40% 0px -55% 0px" });
      document.querySelectorAll(".sec").forEach(function (s) { io.observe(s); });

      var rv = new IntersectionObserver(function (es) {
        var k = 0;
        es.forEach(function (e) {
          if (!e.isIntersecting) return;
          /* los que entran juntos aparecen en cascada (máx. 0.32 s de espera) */
          e.target.style.transitionDelay = Math.min(k++ * 70, 320) + "ms";
          e.target.classList.add("ya"); rv.unobserve(e.target);
          setTimeout(function () { e.target.style.transitionDelay = ""; }, 1400);
        });
      }, { rootMargin: "0px 0px -6% 0px" });
      document.querySelectorAll(".rev, .anim").forEach(function (x) { rv.observe(x); });

      var pt = new IntersectionObserver(function (es) {
        es.forEach(function (e) { fab.classList.toggle("ver", !e.isIntersecting); });
      });
      if (q("#inicio")) pt.observe(q("#inicio")); else fab.classList.add("ver");
    } else {
      document.querySelectorAll(".rev, .anim").forEach(function (x) { x.classList.add("ya"); });
      fab.classList.add("ver");
    }
  }

  /* ---------- tiempo estimado (carga de cocina) ----------
     POST { ext:"carga", accion:"estado" } -> { ok, espera:{ delivery, recojo, mesa }, alta, mensaje }. Al cargar y cada 2 min.
     Solo se muestra con la cocina atendiendo; si la acción falla o no existe, no se muestra nada. */
  var espera = null;
  window.PG_CARGA = null;
  function canalEspera() {
    if (PED && PED.modo === "mesa") return "mesa";
    if (COM && COM.barra) return "recojo";
    return "delivery";
  }
  function pintarEspera() {
    if (!espera) return;
    var c = window.PG_CARGA, m = c && c.espera ? Math.round(Number(c.espera[canalEspera()])) : 0;
    var ver = m > 0 && estadoActual().abierto && PED && PED.activo();
    espera.hidden = !ver; espera.textContent = "";
    if (!ver) return;
    espera.className = "espera" + (c.alta ? " espera--alta" : "");
    espera.appendChild(h("i", null, c.alta ? "!" : ""));
    espera.appendChild(h("span", null, t(c.alta ? "esperaAlta" : "esperaNormal", { m: m })));
  }
  function consultarCarga() {
    var api = (C.pedidos || {}).api; if (!api || !window.fetch) return;
    try {
      fetch(api, { method: "POST", body: JSON.stringify({ ext: "carga", accion: "estado" }) })
        .then(function (r) { return r.json(); })
        .then(function (r) {
          if (!r || r.ok !== true || !r.espera || typeof r.espera !== "object") { window.PG_CARGA = null; pintarEspera(); return; }
          window.PG_CARGA = { espera: r.espera, alta: r.alta === true };
          pintarEspera();
          document.dispatchEvent(new Event("pg-carga"));
        }).catch(function () {});
    } catch (e) {}
  }

  /* ---------- analítica propia (anónima) ----------
     Eventos: visita, vista_seccion, vista_producto (≥50 % visible 1 s, una vez por producto y sesión), abrir_producto, agregar, checkout, pedido.
     Se envían en lotes cada 20 s y al ocultar la página: { ext:"analitica", accion:"ev", sid, ev:[{ t, id, s, ts }] }. Sin datos personales. */
  var AN = (function () {
    var api = (C.pedidos || {}).api, cola = [], sid = "", vistos = {};
    try { sid = sessionStorage.getItem("pg-sid") || ""; } catch (e) {}
    if (!sid) { sid = (Date.now().toString(36) + Math.random().toString(36).slice(2, 10)).slice(0, 20); try { sessionStorage.setItem("pg-sid", sid); } catch (e) {} }
    try { vistos = JSON.parse(sessionStorage.getItem("pg-an-v") || "{}") || {}; } catch (e) { vistos = {}; }
    function ev(tipo, id, s) {
      if (!api) return;
      cola.push({ t: tipo, id: String(id || "").slice(0, 60), s: String(s || "").slice(0, 40), ts: Date.now() });
      if (cola.length > 200) cola.splice(0, cola.length - 200);
    }
    function una(tipo, id, s) {   // una sola vez por sesión
      var k = tipo + ":" + id; if (vistos[k]) return; vistos[k] = 1;
      try { sessionStorage.setItem("pg-an-v", JSON.stringify(vistos)); } catch (e) {}
      ev(tipo, id, s);
    }
    function enviar(salida) {
      if (!api || !cola.length) return;
      var lote = cola.splice(0, 100), cuerpo = JSON.stringify({ ext: "analitica", accion: "ev", sid: sid, ev: lote });
      try {
        if (salida && navigator.sendBeacon && navigator.sendBeacon(api, cuerpo)) return;
        fetch(api, { method: "POST", body: cuerpo, keepalive: true }).catch(function () {});
      } catch (e) {}
    }
    if (api) {
      setInterval(function () { enviar(false); }, 20000);
      document.addEventListener("visibilitychange", function () { if (document.visibilityState === "hidden") enviar(true); });
      window.addEventListener("pagehide", function () { enviar(true); });
    }
    return { ev: ev, una: una, enviar: enviar };
  })();
  window.PG_ANALITICA = AN;
  function observarVistas() {
    var modo = PED ? PED.modo : "delivery";
    AN.una("visita", modo + (COM && COM.barra ? "-barra" : ""), "");
    if (!("IntersectionObserver" in window)) return;
    var timers = new WeakMap();
    var io = new IntersectionObserver(function (es) {
      es.forEach(function (e) {
        var el = e.target, id = el.id.replace(/^p-/, ""), s = el.closest(".sec") ? el.closest(".sec").id : "";
        if (e.isIntersecting && e.intersectionRatio >= 0.5) {
          if (!timers.get(el)) timers.set(el, setTimeout(function () { AN.una("vista_producto", id, s); io.unobserve(el); }, 1000));
        } else if (timers.get(el)) { clearTimeout(timers.get(el)); timers.delete(el); }
      });
    }, { threshold: [0, 0.5] });
    document.querySelectorAll("#vista-carta .it[id^='p-']").forEach(function (x) { io.observe(x); });
    var ios = new IntersectionObserver(function (es) {
      es.forEach(function (e) { var id = e.target.parentNode.id; if (e.isIntersecting && id) { AN.una("vista_seccion", id, id); ios.unobserve(e.target); } });
    }, { threshold: 0.5 });
    document.querySelectorAll("#vista-carta .sec > .sec__cab").forEach(function (x) { ios.observe(x); });
  }

  /* Orden de las secciones (pedido de Piero, 22-nov):
     - Bloque restaurante SIEMPRE junto y en este orden: Antipasti, Pizze, Pasta, Lasagne, Parrillas, Dolci, Caffetteria, Bevande (caffe), Aperitivi, Vini.
     - Horario del restaurante: Promociones, Prodotti d'Italia, bloque, Nostri Prodotti (tienda) al final.
     - Fuera de ese horario: Prodotti d'Italia, Nostri Prodotti, bloque (visible, con su "Disponible a partir de…"); promociones primero si
       se pueden pedir ahora, si no van con el bloque (justo antes de Antipasti).
     - Mesa: Prodotti d'Italia, bloque, tienda. Barra: tienda primero y lo demás igual. */
  var BLOQUE = ["antipasti", "pizze", "pasta", "lasagne", "parrillas", "dolci", "caffetteria", "caffe", "aperitivi", "vini"];
  function ordenarSecciones() {
    var por = {}, otras = [];
    C.secciones.forEach(function (x) { if (x.id === "promociones" || x.id === "italia" || x.id === "tienda" || BLOQUE.indexOf(x.id) >= 0) por[x.id] = x; else otras.push(x); });
    var bloque = BLOQUE.filter(function (id) { return por[id]; }).map(function (id) { return por[id]; }).concat(otras);
    var promo = por.promociones ? [por.promociones] : [], italia = por.italia ? [por.italia] : [], tienda = por.tienda ? [por.tienda] : [];
    var abierto = estadoActual().abierto, lista;
    if (PED && PED.modo === "mesa") lista = italia.concat(promo, bloque, tienda);
    else if (abierto) lista = promo.concat(italia, bloque, tienda);
    else {
      var promoYa = promo.length && COM && COM.avisoSec ? !COM.avisoSec(promo[0]) : false;
      lista = promoYa ? promo.concat(italia, tienda, bloque) : italia.concat(tienda, promo, bloque);
    }
    if (COM && COM.barra && tienda.length) lista = tienda.concat(lista.filter(function (x) { return x !== tienda[0]; }));   // barra: Nostri Prodotti primero
    return lista;
  }

  /* Enlace directo a un producto o combo (para historias de Instagram): ?p=ID&o=ig */
  function abrirEnlace() {
    var params = new URLSearchParams(location.search);
    var o = (params.get("o") || params.get("utm_source") || "").toLowerCase().replace(/[^a-z0-9_-]/g, "").slice(0, 30);
    if (o) { try { sessionStorage.setItem("pg-origen", o); } catch (e) {} }
    var id = params.get("p"); if (!id) return;
    var art = document.getElementById("p-" + id); if (!art) return;
    var otros = art.closest(".promo-otros"); if (otros) { otros.classList.add("abierto"); var bm = otros.parentNode.querySelector(".promo-mas"); if (bm) { bm.setAttribute("aria-expanded", "true"); bm.textContent = t("menosPromos"); } }
    var it = null, sec = null;
    C.secciones.forEach(function (s) { s.grupos.forEach(function (g) { g.items.forEach(function (i) { if (i.id === id) { it = i; sec = s; } }); }); });
    setTimeout(function () {
      art.classList.add("ya", "it--enlace");
      window.scrollTo({ top: art.getBoundingClientRect().top + window.pageYOffset - 120, behavior: "auto" });
      if (it && PED) PED.abrirDetalle(it, sec);
    }, 250);
  }
  /* Agotados en vivo: el local puede marcar un plato como agotado (panel o celular del mozo) y la carta publicada
     tarda 1-2 minutos en actualizarse; aquí se pregunta al sistema y se marca al instante. */
  function agotadosEnVivo() {
    var api = (C.pedidos || {}).api; if (!api || !window.fetch) return;
    fetch(api + "?estado=1").then(function (r) { return r.json(); }).then(function (r) {
      if (!r || !r.ok || !Array.isArray(r.agotados)) return;
      var lista = r.agotados;
      (C.salsas || []).forEach(function (x) { x.agotado = lista.indexOf(x.id) >= 0; });
      C.secciones.forEach(function (s) { s.grupos.forEach(function (g) { g.items.forEach(function (it) {
        var ag = lista.indexOf(it.id) >= 0; if (!!it.agotado === ag) return;
        it.agotado = ag;
        var art = document.getElementById("p-" + it.id); if (!art) return;
        art.classList.toggle("it--agotado", ag);
        var b = art.querySelector(":scope > .agotado");
        if (ag && !b) art.appendChild(h("span", "agotado", t(it.tipo === "salsa" ? "noDisponible" : "agotado")));
        if (!ag && b) b.remove();
      }); }); });
    }).catch(function () {});
  }
  /* Enlace a una sección: /?s=pizze y /#pizze abren la misma página y bajan solos a esa sección (bajo la barra pegajosa).
     Como las fotos cargan después y mueven el alto de la página, se reajusta unos segundos, salvo que la persona ya haya movido la pantalla. */
  function entrarASeccion() {
    var id = new URLSearchParams(location.search).get("s") || decodeURIComponent(location.hash.slice(1) || "");
    id = String(id || "").replace(/[^a-zA-Z0-9_-]/g, "");
    if (!id || id.indexOf("p-") === 0 || !document.getElementById(id)) return;
    var quieto = true;
    ["wheel", "touchstart", "keydown", "mousedown"].forEach(function (ev) { window.addEventListener(ev, function () { quieto = false; }, { once: true, passive: true }); });
    var ir = function () { if (quieto) irSeccion(id); };
    ir(); setTimeout(ir, 250); setTimeout(ir, 800);
    window.addEventListener("load", function () { setTimeout(ir, 60); });
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(ir);
    setTimeout(function () { quieto = false; }, 3500);
  }
  function iniciar() {
    construir();
    window.addEventListener("hashchange", function () { var id = location.hash.slice(1); if (id && id.indexOf("p-") !== 0) irSeccion(id); });
    entrarASeccion();
    abrirEnlace(); agotadosEnVivo();
    observarVistas();
    consultarCarga(); setInterval(consultarCarga, 120000); setInterval(pintarEspera, 60000);
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", iniciar); else iniciar();
})();
