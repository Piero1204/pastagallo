/* Pasta Gallo · lógica de la carta. No necesitas editar este archivo. */
(function () {
  "use strict";
  var C = window.CARTA;
  var N = C.negocio;
  var PED = window.PG_PEDIDO || null;
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
    if (hoy && ah.min < minutos(hoy[0])) {
      return { abierto: false, cuando: t("hoyA") + fmt12(hoy[0]) };
    }
    for (var i = 1; i <= 7; i++) {
      var d = (ah.dia + i) % 7, r = C.horario.dias[d];
      if (r) return { abierto: false, cuando: (i === 1 ? t("manana") : t("el")) + t("dias")[d] + t("aLas") + fmt12(r[0]) };
    }
    return { abierto: false, cuando: t("pronto") };
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

  var estadoBarra, bienvenida, fab, fabTxt;
  function waUrl() {
    return "https://wa.me/" + N.whatsapp + "?text=" + encodeURIComponent(N.mensajeWhatsapp);
  }
  function pintarEstado() {
    var e = estadoActual();
    estadoBarra.className = "estado " + (e.abierto ? "abierto" : "cerrado");
    estadoBarra.textContent = "";
    estadoBarra.appendChild(h("i"));
    if (PED && PED.modo === "mesa" && PED.mesa) estadoBarra.appendChild(h("span", "estado__mesa", t("mesa") + PED.mesa));
    if (e.abierto) {
      var s = h("span"); s.appendChild(document.createTextNode(t("abierto"))); s.appendChild(h("b", null, e.cierra));
      estadoBarra.appendChild(s);
    } else {
      var s2 = h("span"); s2.appendChild(document.createTextNode(t("cerrado"))); s2.appendChild(h("b", null, e.cuando.replace(t("aLas"), " · ")));
      estadoBarra.appendChild(s2);
    }
    bienvenida.textContent = "";
    var conCarrito = PED && PED.activo();
    var titulo = t("bienvenido"), texto;
    if (PED && PED.modo === "mesa") {
      if (!PED.mesaValida()) texto = t("mesaSinQr");
      else if (!e.abierto) { titulo = t("mesa") + PED.mesa; texto = t("mesaCerrado", { c: e.cuando }); }
      else if (!conCarrito) { titulo = t("mesa") + PED.mesa; texto = t("mesaSinPedidos"); }
      else { titulo = t("bienvenidoMesa") + PED.mesa; texto = t("mesaAbierto"); }
    } else if (e.abierto) {
      texto = conCarrito ? t("abiertoCarrito", { h: e.cierra }) : t("abiertoSin", { h: e.cierra });
    } else {
      texto = t("cerradoTxt", { c: e.cuando }) + (conCarrito && PED.aceptaAhora() ? t("programar") : t("recorre"));
    }
    bienvenida.appendChild(h("h1", null, titulo));
    bienvenida.appendChild(h("p", null, texto));
    var pedir = q("#btn-pedir");
    if (pedir && !conCarrito) pedir.lastChild.textContent = e.abierto ? t("realizarPedido") : t("escribenos");
    if (fabTxt) fabTxt.textContent = e.abierto ? t("pedirAhora") : "WhatsApp";
  }

  function botonIdioma(cls) {
    var b = h("button", cls, t("idioma")); b.type = "button"; b.setAttribute("aria-label", t("idiomaAria")); b.lang = I.lang === "en" ? "es" : "en";
    b.addEventListener("click", I.cambiar);
    return b;
  }

  /* ---------- portada ---------- */
  function portada() {
    var compacta = PED && PED.modo === "mesa";
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
      var b1 = h("a", "btn btn--oro", PED.modo === "mesa" ? t("verCartaPedir") : t("hacerPedido")); b1.href = "#carta-inicio";
      ac.appendChild(b1);
      if (PED.modo !== "mesa") {
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
    var tieneFoto = !!it.foto;
    if (tieneFoto) a.className += " fcon";
    var top = h("div", "it__top");
    top.appendChild(h("h4", "it__n", tx(it, "n")));
    if (it.p != null && !it.t) {
      top.appendChild(h("span", "it__pts"));
      if (it.pa != null && it.pa > it.p) { var pa = precioEl(it.pa); pa.className += " precio--antes"; pa.title = t("antes"); top.appendChild(pa); }
      top.appendChild(precioEl(it.p));
    }
    a.appendChild(top);
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
    if (it.t) {
      var tb = h("div", "tam");
      it.t.forEach(function (x) {
        var c = h("div"); c.appendChild(h("span", null, x[0])); c.appendChild(precioEl(x[1])); tb.appendChild(c);
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
    if (PED && PED.puedePedir(it, sec)) a.appendChild(PED.boton(it, sec));
    if (PED && it.tipo !== "salsa") {
      a.className += " it--clic"; a.tabIndex = 0; a.setAttribute("role", "button");
      a.setAttribute("aria-label", t("verDetalle") + tx(it, "n"));
      var abrir = function (ev) { if (ev.target.closest(".agregar")) return; PED.abrirDetalle(it, sec); };
      a.addEventListener("click", abrir);
      a.addEventListener("keydown", function (ev) { if ((ev.key === "Enter" || ev.key === " ") && ev.target === a) { ev.preventDefault(); PED.abrirDetalle(it, sec); } });
    }
    if (tieneFoto) {
      var im = h("img", "foto" + (sec && (sec.id === "italia" || (sec.id === "vini" && /^fotos\//.test(it.foto))) ? " foto--producto" + (sec.id === "vini" ? " foto--botella" : "") : "")); im.src = it.foto; im.alt = tx(it, "n"); im.loading = "lazy";
      im.onerror = function () { a.className = a.className.replace(" fcon", ""); im.remove(); };
      a.appendChild(im);
    }
    a.setAttribute("data-q", norm([it.n, it.g, it.d, it.n_en, it.g_en, it.d_en].join(" ")));
    return a;
  }

  /* ---------- secciones ---------- */
  var seccionesVisibles = [];
  var hayAlergenos = false;

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
    var n = seccionesVisibles.length;
    var s = h("section", "sec " + (sec.id === "promociones" ? "sec--promo" : (n % 2 ? "sec--a" : "sec--b"))); s.id = sec.id;
    var cab = h("header", "sec__cab");
    cab.appendChild(h("div", "m"));
    var c = h("div");
    c.appendChild(h("div", "num", ROMANOS[n - 1] || String(n)));
    c.appendChild(h("h2", null, tx(sec, "titulo")));
    c.appendChild(h("div", "sub", tx(sec, "subtitulo")));
    c.appendChild(ornamento());
    if (tx(sec, "intro")) c.appendChild(h("p", "intro", tx(sec, "intro")));
    if (sec.id === "promociones") { var sem = semanaPromos(grupos); if (sem) c.appendChild(sem); }
    cab.appendChild(c); s.appendChild(cab);

    var cuerpo = h("div", "sec__cuerpo");
    grupos.forEach(function (g) {
      var gr = h("div", "grupo");
      if (g.titulo) {
        var gc = h("div", "grupo__cab");
        gc.appendChild(h("h3", null, g.titulo));
        if (g.nota) gc.appendChild(h("p", null, g.nota));
        gc.appendChild(ornamento());
        gr.appendChild(gc);
      }
      g.items.forEach(function (it) { if (it.al && it.al.length) hayAlergenos = true; gr.appendChild(plato(it, sec)); });
      cuerpo.appendChild(gr);
    });
    if (tx(sec, "pie")) cuerpo.appendChild(h("div", "pie", tx(sec, "pie")));
    if (sec.alcohol) cuerpo.appendChild(h("p", "aviso18", t("alcohol")));
    s.appendChild(cuerpo);
    return s;
  }

  /** Tira "la semana": qué combo va cada día (solo días con atención y con alguna promo). */
  function semanaPromos(grupos) {
    var items = []; grupos.forEach(function (g) { g.items.forEach(function (i) { if (i.promo) items.push(i); }); });
    if (items.length < 2) return null;
    var ah = ahoraLugar(new Date()), w = h("div", "semana"), hay = 0;
    for (var k = 0; k < 7; k++) {
      var f = sumarDias(ah.fecha, k), d = diaDe(f);
      if (!C.horario.dias[d]) continue;
      var deDia = items.filter(function (i) { return promoEnFecha(i.promo, f); });
      if (!deDia.length) continue;
      var col = h("a", "semana__d" + (k === 0 ? " hoy" : ""));
      col.href = "#p-" + deDia[0].id;
      col.appendChild(h("span", "semana__n", k === 0 ? t("hoy") : t("dias")[d].slice(0, 3)));
      col.appendChild(h("span", "semana__p", deDia.map(function (i) { return tx(i, "n"); }).join(" · ")));
      w.appendChild(col); hay++;
    }
    return hay ? w : null;
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
      var a = h("a", "chip", tx(s, "titulo")); a.href = "#" + s.id; a.setAttribute("data-id", s.id); ch.appendChild(a);
    });
    in_.appendChild(ch);
    var lupa = h("button", "lupa"); lupa.type = "button"; lupa.setAttribute("aria-label", t("buscarAria"));
    var sv = document.createElementNS(NS, "svg"); sv.setAttribute("viewBox", "0 0 24 24");
    var c1 = document.createElementNS(NS, "circle"); c1.setAttribute("cx", 11); c1.setAttribute("cy", 11); c1.setAttribute("r", 6.5);
    var l1 = document.createElementNS(NS, "path"); l1.setAttribute("d", "M16 16l5 5"); sv.appendChild(c1); sv.appendChild(l1);
    lupa.appendChild(sv); in_.appendChild(lupa);
    in_.appendChild(botonIdioma("idioma"));
    nav.appendChild(in_);
    var b = h("div", "busca"); b.id = "busca";
    var inp = h("input"); inp.type = "search"; inp.id = "q"; inp.placeholder = t("buscar"); inp.setAttribute("aria-label", t("buscar")); inp.autocomplete = "off";
    b.appendChild(inp); nav.appendChild(b);
    lupa.addEventListener("click", function () {
      b.classList.toggle("abierta");
      if (b.classList.contains("abierta")) inp.focus(); else { inp.value = ""; filtrar(""); }
    });
    inp.addEventListener("input", function () { filtrar(inp.value); });
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
    document.querySelectorAll(".sec").forEach(function (sec) {
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
    if (c) window.scrollTo({ top: q("#nav").offsetTop - 34, behavior: "auto" });
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
    d.appendChild(dato(t("horario"), tx(N, "horarioTexto") + (tx(N, "cerradoTexto") ? " · " + tx(N, "cerradoTexto") : "")));
    d.appendChild(dato(t("reservas"), N.telefono));
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
    i.appendChild(h("div", "copia", N.desde + t("carino")));
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
    C.secciones.forEach(function (s, i) { var e = seccion(s, i); if (e) secs.push(e); });

    app.appendChild(portada());
    var nav = navegacion(); app.appendChild(nav);
    var anc = h("span"); anc.id = "carta-inicio"; anc.style.cssText = "display:block;position:relative;top:-84px"; app.appendChild(anc);
    secs.forEach(function (s) { app.appendChild(s); });
    var cuerpoFinal = secs.length ? secs[secs.length - 1].querySelector(".sec__cuerpo") : null;
    if (hayAlergenos && cuerpoFinal) cuerpoFinal.appendChild(leyenda());
    var vacio = h("p", "vacio", t("noEncontrado")); vacio.id = "vacio"; app.appendChild(vacio);
    if (C.historia && C.historia.parrafos && C.historia.parrafos.length) app.appendChild(historia());
    app.appendChild(gracias());

    var f = h("a", "fab"); f.href = waUrl(); f.target = "_blank"; f.rel = "noopener";
    f.appendChild(waSvg()); fabTxt = h("span", null, t("pedirAhora")); f.appendChild(fabTxt);
    document.body.appendChild(f); fab = f;

    pintarEstado();
    setInterval(pintarEstado, 60000);

    /* ancla de la carta: salto exacto bajo la barra */
    document.querySelectorAll('a[href^="#"]').forEach(function (a) {
      a.addEventListener("click", function (ev) {
        var id = a.getAttribute("href").slice(1), el = document.getElementById(id);
        if (!el) return;
        ev.preventDefault();
        var off = id === "carta-inicio" ? 0 : 76;
        var y = el.getBoundingClientRect().top + window.pageYOffset - (id === "carta-inicio" ? 0 : off);
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
        es.forEach(function (e) { if (e.isIntersecting) { e.target.classList.add("ya"); rv.unobserve(e.target); } });
      }, { rootMargin: "0px 0px -6% 0px" });
      document.querySelectorAll(".rev").forEach(function (x) { rv.observe(x); });

      var pt = new IntersectionObserver(function (es) {
        es.forEach(function (e) { fab.classList.toggle("ver", !e.isIntersecting); });
      });
      pt.observe(q("#inicio"));
    } else {
      document.querySelectorAll(".rev").forEach(function (x) { x.classList.add("ya"); });
      fab.classList.add("ver");
    }
  }

  /* Enlace directo a un producto o combo (para historias de Instagram): ?p=ID&o=ig */
  function abrirEnlace() {
    var params = new URLSearchParams(location.search);
    var o = (params.get("o") || params.get("utm_source") || "").toLowerCase().replace(/[^a-z0-9_-]/g, "").slice(0, 30);
    if (o) { try { sessionStorage.setItem("pg-origen", o); } catch (e) {} }
    var id = params.get("p"); if (!id) return;
    var art = document.getElementById("p-" + id); if (!art) return;
    var it = null, sec = null;
    C.secciones.forEach(function (s) { s.grupos.forEach(function (g) { g.items.forEach(function (i) { if (i.id === id) { it = i; sec = s; } }); }); });
    setTimeout(function () {
      art.classList.add("ya", "it--enlace");
      window.scrollTo({ top: art.getBoundingClientRect().top + window.pageYOffset - 120, behavior: "auto" });
      if (it && PED) PED.abrirDetalle(it, sec);
    }, 250);
  }
  function iniciar() { construir(); abrirEnlace(); }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", iniciar); else iniciar();
})();
