/* Pasta Gallo · panel del mozo (https://pastagallo.pages.dev/<código secreto de 12 letras>)
   - El enlace se vincula a UN equipo (llave guardada en este navegador).
   - Mesas en vivo con estado automático: libre · sentada · en cocina · listo para servir · servida (comiendo) ·
     llama · pide la cuenta. Cada mesa muestra qué mozo la atiende (las asignadas son sugerencia, no bloqueo).
   - "Por servir": lo que falta llevar a cada mesa; se marca plato por plato (o "todo entregado").
   - Tomar pedido → se registra como pedido de mesa y se imprime solo en la PC del local.
   - Cobrar mesa con uno o varios métodos y la propina de cada uno.
   La carta (productos, precios, fotos, disponibilidad) sale de menu-data.js, la misma de la web. */
(function () {
  "use strict";
  var C = window.CARTA || {}, API = (C.pedidos || {}).api || "", GRUPOS = C.opciones || {};
  var app = document.getElementById("app");
  var K = { t: "pg-mozo-t", mozo: "pg-mozo", carros: "pg-mozo-carros", fotos: "pg-mozo-fotos", ultimo: "pg-mozo-ultimo", alertas: "pg-mozo-alertas", vistaM: "pg-mozo-vistam", filtro: "pg-mozo-filtro" };
  var YP = "Yape o Plin";
  function unirMetodos(l) { var r = []; (l || []).forEach(function (m) { m = /^(yape|plin)$/i.test(m) ? YP : m; if (/^transf/i.test(m)) return; if (r.indexOf(m) < 0) r.push(m); }); return r; }
  function cobroYP() { var c = (C.pedidos || {}).cobro || {}; return c[YP] || (c.Plin && (c.Plin.qr || c.Plin.numero) ? c.Plin : c.Yape) || null; }

  /* ---------- utilidades ---------- */
  function h(tag, cls, txt) { var e = document.createElement(tag); if (cls) e.className = cls; if (txt != null) e.textContent = txt; return e; }
  function btn(txt, cls, fn) { var b = h("button", cls, txt); b.type = "button"; if (fn) b.addEventListener("click", fn); return b; }
  function soles(n) { return "S/ " + Number(n || 0).toFixed(2); }
  function norm(s) { return String(s || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, ""); }
  function leer(k, d) { try { var v = JSON.parse(localStorage.getItem(k) || "null"); return v == null ? d : v; } catch (e) { return d; } }
  function guardar(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} }
  function r2(n) { return Math.round(n * 100) / 100; }
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

  /* ---------- estado ---------- */
  var S = { t: leer(K.t, ""), mozo: leer(K.mozo, null), mesas: [], avisos: [], metodos: [YP, "Efectivo", "Tarjeta"],
    horario: null, turno: null, v: "", desfase: 0, recibido: 0, vista: "mesas", mesa: null, cuenta: null, q: "", enviando: false,
    vistaM: leer(K.vistaM, "grid"), filtro: leer(K.filtro, "todas") };
  function yo() { return S.mozo ? S.mozo.id : ""; }
  function variosMozos() { return !!(S.turno && S.turno.mozos && S.turno.mozos.length > 1); }
  function mesaDe(n) { return S.mesas.filter(function (x) { return String(x.mesa) === String(n); })[0] || null; }
  function duenio(m) { return m ? (m.atiende || (m.estado === "libre" ? m.zona : null)) : null; }
  function esMia(m) { var d = duenio(m); return !d || d.id === yo(); }
  function minDesde(ts) { return ts ? Math.max(0, Math.floor((Date.now() + S.desfase - ts) / 60000)) : 0; }
  var carros = leer(K.carros, {});
  var fotos = leer(K.fotos, true);
  function carro() { return S.mesa ? (carros[S.mesa] = carros[S.mesa] || []) : []; }
  function guardarCarros() { Object.keys(carros).forEach(function (m) { if (!carros[m].length) delete carros[m]; }); guardar(K.carros, carros); }

  /* ---------- catálogo (solo lo que se puede pedir en mesa) ---------- */
  var SECS = [], PROD = {}, SALSAS = (C.salsas || []).filter(function (s) { return !s.agotado; }), SALSA = {};
  SALSAS.forEach(function (s) { SALSA[s.id] = s; });
  (C.secciones || []).forEach(function (s) {
    if (!s.mesa) return;
    var grupos = [];
    (s.grupos || []).forEach(function (g) {
      var items = (g.items || []).filter(function (it) { return it.tipo !== "salsa" && it.canal !== "delivery"; });
      items.forEach(function (it) { PROD[it.id] = it; it._sec = s; });
      if (items.length) grupos.push({ titulo: g.titulo || "", items: items });
    });
    if (grupos.length) SECS.push({ id: s.id, titulo: s.titulo, grupos: grupos });
  });
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
    var extra = sel.salsa && SALSA[sel.salsa] ? SALSA[sel.salsa].extra || 0 : 0;
    gruposDe(it, sel.salsa).forEach(function (g) {
      (sel.ops[g] || []).forEach(function (nm) { var o = GRUPOS[g].ops.filter(function (x) { return x.n === nm; })[0]; if (o) extra += o.p || 0; });
    });
    return r2(base + extra);
  }
  function precioTxt(it) { return it.t ? "desde " + soles(Math.min.apply(null, it.t.map(function (x) { return x[1]; }))) : soles(it.p); }
  function cantDe(id) { return carro().reduce(function (a, l) { return a + (l.id === id ? l.cant : 0); }, 0); }
  function totalCarro() { return r2(carro().reduce(function (a, l) { return a + l.unit * l.cant; }, 0)); }
  function unidades() { return carro().reduce(function (a, l) { return a + l.cant; }, 0); }

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
    capa.classList.remove("on"); capa.textContent = ""; modalPedido = false;
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

  /* =========================== SONDEO (cada 12 s) =========================== */
  var timer = null, avisosVistos = {}, ultimoPitido = 0, listosVistos = null;
  function detenerSondeo() { clearTimeout(timer); timer = null; }
  function sondear() {
    detenerSondeo();
    if (!S.t) return;
    api({ mz: "estado", t: S.t, v: S.v }).then(function (r) {
      if (!r.ok) throw new Error(r.error);
      S.desfase = r.ahora - Date.now(); S.recibido = Date.now();
      S.horario = r.horario; S.mozo = r.mozo || S.mozo; S.turno = r.turno || S.turno;
      if (!r.igual) {
        S.v = r.v; S.mesas = r.mesas || []; S.avisos = r.avisos || [];
        if (r.metodos && r.metodos.length) S.metodos = unirMetodos(r.metodos);
        if (S.mesa) { var mm = mesaDe(S.mesa); S.cuenta = mm ? { mesa: mm.mesa, pedidos: mm.pedidos || [], total: mm.total } : S.cuenta; }
      }
      revisarAlertas();
      refrescar();
    }).catch(function (e) { if (S.t) toast("Sin conexión: reintentando…", "mal"); }).then(function () {
      if (S.t) timer = setTimeout(sondear, document.hidden ? 30000 : 12000);
    });
  }
  document.addEventListener("visibilitychange", function () { if (!document.hidden && S.t) { sondear(); mantenerPantalla(); } });

  function minutosACierre() { return S.horario ? S.horario.cierraEn - (Date.now() - S.recibido) / 60000 : 0; }
  function revisarAlertas() {
    // mesas que llaman: suena al llegar un aviso nuevo y repite cada 30 s mientras haya pendientes
    // solo suenan las de MIS mesas (o sin mozo); si nadie atiende en 2 minutos, suena para todos
    var paraMi = S.avisos.filter(function (a) { return !a.para || a.para === yo() || Date.now() + S.desfase - a.ts > 120000; });
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
  function iniciar() {
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
    app.appendChild(barraSuperior());
    var av = barraAvisos(); app.appendChild(av);
    var main = h("main"); app.appendChild(main);
    var hz = S.horario;
    if (hz && !hz.panel) main.appendChild(vistaCerrado());
    else if (S.turno && !S.turno.trabaja) main.appendChild(vistaSinTurno());
    else if (S.vista === "carta" && S.mesa) main.appendChild(vistaCarta());
    else main.appendChild(vistaMesas());
    // altura de los avisos para que no tapen el contenido
    requestAnimationFrame(function () { document.documentElement.style.setProperty("--avisos", av.offsetHeight + "px"); });
    var p = document.querySelector(".prods"); if (p && scrollProds) p.scrollTop = scrollProds;
    if (scrollWin) window.scrollTo(0, scrollWin);
  }
  /* En la carta solo se actualizan la hora, los avisos y (si cambió) la cuenta: así no se pierde lo que el mozo
     está escribiendo ni dónde estaba de la carta. En la vista de mesas se redibuja todo. */
  var ultimaCocina = null, ultimaMesaN = "";
  function refrescar() {
    var carta = document.querySelector(".carta");
    if (!(S.vista === "carta" && S.mesa && carta && S.horario && S.horario.panel && !(S.turno && !S.turno.trabaja))) {
      // no redibujar mientras escribe en un campo o hay una ventana abierta (se redibuja al cerrarla)
      var ae = document.activeElement;
      if (capa.classList.contains("on") || (ae && /INPUT|TEXTAREA/.test(ae.tagName))) { S.redibujar = true; return; }
      ultimaCocina = null; pintar(); return;
    }
    var nuevo = barraSuperior(), hv = document.querySelector(".top .top__hora"), hn = nuevo.querySelector(".top__hora");
    if (hv && hn) hv.replaceWith(hn); else if (hn) { var yo = document.querySelector(".top .top__yo"); if (yo) yo.parentNode.insertBefore(hn, yo); }
    var av = document.querySelector(".avisos"), avn = barraAvisos();
    if (av) { av.replaceWith(avn); document.documentElement.style.setProperty("--avisos", avn.offsetHeight + "px"); }
    var m = S.mesas.filter(function (x) { return String(x.mesa) === String(S.mesa); })[0];
    var firma = m ? m.n + "|" + m.total + "|" + m.porServir + "|" + m.estado + "|" + (m.atiende ? m.atiende.id : "") : "";
    var escribiendo = document.activeElement && document.activeElement.closest && document.activeElement.closest(".orden");
    if (firma !== ultimaMesaN && ultimaMesaN !== "" && !escribiendo) pintarOrden();
    else if (ultimaCocina !== null && ultimaCocina !== S.horario.cocina && !escribiendo) pintarOrden();
    ultimaMesaN = firma; ultimaCocina = S.horario.cocina;
  }

  function barraSuperior() {
    var t = h("header", "top"), hz = S.horario;
    if (S.vista === "carta" && S.mesa) {
      t.appendChild(btn("‹", "top__volver", function () { S.vista = "mesas"; S.q = ""; pintar(); window.scrollTo(0, 0); }));
      var m = btn("", "top__mesa", function () { elegirMesa(); });
      m.appendChild(document.createTextNode("Mesa " + S.mesa)); m.appendChild(h("small", null, "▾"));
      t.appendChild(m);
      t.appendChild(btn("☰", "top__cats", menuCategorias));
      var bus = h("input", "top__bus"); bus.type = "search"; bus.placeholder = "Buscar plato…"; bus.value = S.q;
      bus.addEventListener("input", function () { S.q = bus.value; pintarProductos(); });
      t.appendChild(bus);
    } else {
      t.appendChild(h("b", null, "🍝 Salón")); t.appendChild(h("span", "esp"));
    }
    if (hz && hz.panel) {
      var min = minutosACierre(), txt, cls = "top__hora";
      if (hz.cocina) { txt = "Cocina hasta " + hz.cierra; if (min <= 30) { txt = "Cocina cierra en " + Math.max(1, Math.round(min)) + " min"; cls += min <= 15 ? " urge" : " aviso"; } }
      else if (hz.cocinaEn) txt = "Cocina abre " + hz.abre;
      else txt = "Cocina cerrada";
      t.appendChild(h("span", cls, txt));
    }
    t.appendChild(btn(S.mozo ? S.mozo.nombre : "Menú", "top__yo", menuYo));
    return t;
  }

  function barraAvisos() {
    var w = h("div", "avisos"), hz = S.horario;
    S.avisos.slice().sort(function (a, b) { return a.ts - b.ts; }).forEach(function (a) {
      var otro = a.para && a.para !== yo();
      var d = h("div", "av" + (a.motivo === "cuenta" ? " cuenta" : "") + (otro ? " otro" : ""));
      d.appendChild(h("span", null, (a.motivo === "cuenta" ? "🧾 " : "🙋 ") + "Mesa " + a.mesa + " · " + (a.motivo === "cuenta" ? "Cuenta" : "Llama") + (a.detalle ? " (" + a.detalle + ")" : "") + " · " + a.hora + (otro ? " · de " + a.paraNombre : "")));
      if (a.motivo === "cuenta") d.appendChild(btn("Cobrar", "", function () { abrirMesa(a.mesa, function () { cobrar(a.detalle); }); }));
      d.appendChild(btn("✓ Atendido", a.motivo === "cuenta" ? "sec" : "", function () { atender(a); }));
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
      c.appendChild(h("p", "vacio", "Las propinas por Yape o Plin y tarjeta te las paga el negocio; la de efectivo ya la tienes."));
    }).catch(function () { c.textContent = ""; c.appendChild(h("p", "err", "Sin conexión.")); });
  }

  /* ---------- mesas ---------- */
  var TXT_ESTADO = { libre: "Libre", sentada: "Sentados · sin pedido", cocina: "En cocina", listo: "🔔 Listo para servir", servida: "Servida", llama: "🙋 Llama", cuenta: "🧾 Pide la cuenta" };
  function estadoMesa(m) {
    var av = S.avisos.filter(function (a) { return String(a.mesa) === String(m.mesa); });
    if (av.some(function (a) { return a.motivo === "mozo"; })) return "llama";
    if (av.some(function (a) { return a.motivo === "cuenta"; })) return "cuenta";
    return m.estado || (m.n ? "cocina" : "libre");
  }
  function botonMesa(m, cls) {
    var e = estadoMesa(m), d = duenio(m), mia = esMia(m);
    var b = btn("", "mesa " + e + (mia ? "" : " ajena") + (cls ? " " + cls : ""), function () { tocarMesa(m); });
    b.appendChild(h("b", null, (cls ? "" : "Mesa ") + m.mesa));
    if (cls) { if (m.forma) b.classList.add("f-" + m.forma); return b; }
    var lin = TXT_ESTADO[e] || "";
    if (m.estado !== "libre") lin += (lin ? " · " : "") + minDesde(m.ts) + " min";
    b.appendChild(h("span", "s", lin));
    if (m.n) b.appendChild(h("span", "t", soles(m.total) + (m.porServir ? " · faltan " + m.porServir : "")));
    if (variosMozos() || (d && d.id !== yo())) {
      if (m.atiende) b.appendChild(h("span", "who" + (mia ? " yo" : ""), "🤵 " + (m.atiende.id === yo() ? "Tú" : m.atiende.nombre)));
      else if (m.estado !== "libre") b.appendChild(h("span", "who", "Sin mozo"));
      else if (m.zona) b.appendChild(h("span", "who zona", m.zona.id === yo() ? "Tu zona" : "Zona de " + m.zona.nombre));
    }
    var borr = (carros[m.mesa] || []).reduce(function (a, l) { return a + l.cant; }, 0);
    if (borr) b.appendChild(h("span", "borr", borr + " sin enviar"));
    return b;
  }
  function vistaMesas() {
    var w = h("div", "salon");
    var activas = S.mesas.filter(function (m) { return m.activa; });
    if (!S.recibido) { w.appendChild(h("p", "vacio", "Cargando mesas…")); return w; }
    if (!activas.length) { w.appendChild(h("p", "vacio", "No hay mesas activas. Agrégalas en el panel principal → Mesas y QR.")); return w; }
    var ver = activas.filter(function (m) { return S.filtro !== "mias" || !variosMozos() || (duenio(m) && duenio(m).id === yo()) || (!duenio(m)); });
    var ocup = activas.filter(function (m) { return m.estado !== "libre"; }).length;
    var cab = h("div", "salon__cab");
    cab.appendChild(h("div", "titulo", ocup + " de " + activas.length + " ocupadas"));
    cab.appendChild(h("span", "esp"));
    if (variosMozos()) cab.appendChild(segmento([["mias", "Mis mesas"], ["todas", "Todas"]], S.filtro, function (v) { S.filtro = v; guardar(K.filtro, v); pintar(); }));
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
    var ps = porServir();
    if (ps) cuerpo.appendChild(ps);
    w.appendChild(cuerpo);
    return w;
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

  /* ---------- por servir: lo que falta llevar a la mesa (se marca plato por plato) ---------- */
  function porServir() {
    var items = [];
    S.mesas.forEach(function (m) {
      if (variosMozos() && S.filtro === "mias" && !esMia(m)) return;
      (m.pedidos || []).forEach(function (p) { if (p.falta) items.push({ m: m, p: p }); });
    });
    if (!items.length) return null;
    items.sort(function (a, b) { return ((b.p.estado === "Listo") - (a.p.estado === "Listo")) || (a.p.ts - b.p.ts); });
    var w = h("section", "servir");
    var n = items.reduce(function (a, x) { return a + x.p.falta; }, 0);
    w.appendChild(h("h3", null, "🍽 Por servir · " + n + (n === 1 ? " plato" : " platos")));
    items.forEach(function (x) { w.appendChild(tarjetaServir(x.m, x.p, true)); });
    return w;
  }
  /* un pedido con sus líneas: tocar una línea = entregada (o deshacer) */
  function tarjetaServir(m, p, conMesa) {
    var d = h("div", "srv" + (p.estado === "Listo" && p.falta ? " listo" : "") + (!p.falta ? " hecho" : ""));
    var cab = h("div", "srv__cab");
    if (conMesa) cab.appendChild(btn("Mesa " + m.mesa, "srv__mesa", function () { tocarMesa(m); }));
    cab.appendChild(h("span", null, "#" + p.numero + " · " + p.hora + " · " + (p.mozo ? "🤵 " + p.mozo : "📱 QR")));
    cab.appendChild(h("span", "esp"));
    cab.appendChild(h("span", "srv__est e-" + norm(p.estado).replace(/\s/g, ""), p.falta ? (p.estado === "Listo" ? "🔔 Listo" : p.estado) : "✓ Entregado"));
    d.appendChild(cab);
    (p.lineas || []).forEach(function (l, i) {
      var hecho = (p.entregado || []).indexOf(i) >= 0;
      var b = btn("", "srv__l" + (hecho ? " ok" : ""), function () { entregar(p, [i], !hecho); });
      b.appendChild(h("i", null, hecho ? "✓" : ""));
      var tx = h("span"); tx.appendChild(document.createTextNode(l.t)); if (l.d) tx.appendChild(h("small", null, l.d));
      b.appendChild(tx);
      d.appendChild(b);
    });
    if (p.falta > 1) d.appendChild(btn("✓ Todo entregado", "btn peq ok", function () { entregar(p, "todo", true); }));
    return d;
  }
  function entregar(p, lineas, valor) {
    // al instante en pantalla; el servidor confirma en el siguiente sondeo
    var ent = (p.entregado || []).slice();
    (lineas === "todo" ? p.lineas.map(function (x, i) { return i; }) : lineas).forEach(function (i) {
      var k = ent.indexOf(i); if (valor && k < 0) ent.push(i); else if (!valor && k >= 0) ent.splice(k, 1);
    });
    p.entregado = ent; p.falta = p.lineas.length - ent.length;
    if (!p.falta) p.estado = "Entregado"; else if (p.estado === "Entregado") p.estado = "Listo";
    S.mesas.forEach(function (m) { if (m.pedidos && m.pedidos.indexOf(p) >= 0) m.porServir = m.pedidos.reduce(function (a, q) { return a + q.falta; }, 0); });
    if (navigator.vibrate) navigator.vibrate(30);
    if (S.vista === "carta") pintarOrden(); else pintar();
    api({ mz: "entregar", t: S.t, id: p.id, lineas: lineas, valor: valor }).then(function (r) {
      if (!r.ok) toast(r.error || "No se pudo marcar.", "mal");
      S.v = ""; sondear();
    }).catch(function () { toast("Sin conexión: no se marcó. Vuelve a intentar.", "mal"); S.v = ""; });
  }

  /* tocar una mesa: si la atiende otro mozo, se pregunta (no se bloquea) */
  function tocarMesa(m) {
    var d = m.atiende;
    if (m.estado !== "libre" && d && d.id !== yo()) {
      var c = h("div", "menu-yo");
      c.appendChild(h("p", null, "La mesa " + m.mesa + " la atiende " + d.nombre + "."));
      c.appendChild(btn("👀 Ver / agregar pedido (sigue siendo de " + d.nombre + ")", "", function () { cerrarModal(); abrirMesa(m.mesa); }));
      c.appendChild(btn("🔁 Pasar la mesa a mí", "", function () { cerrarModal(); ocupar(m.mesa, true, function () { abrirMesa(m.mesa); }); }));
      abrirModal("Mesa " + m.mesa, [c]);
      return;
    }
    abrirMesa(m.mesa);
  }
  function ocupar(mesa, forzar, luego) {
    api({ mz: "ocupar", t: S.t, mesa: mesa, forzar: !!forzar }).then(function (r) {
      if (!r.ok) {
        if (r.ocupadaPor && confirm(r.error + " ¿Pasarla a tu nombre?")) return ocupar(mesa, true, luego);
        if (!r.ocupadaPor) toast(r.error || "No se pudo.", "mal");
        return;
      }
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
  function elegirMesa() {
    var g = h("div", "mesasel");
    S.mesas.filter(function (m) { return m.activa; }).forEach(function (m) {
      g.appendChild(btn(m.mesa, (m.estado !== "libre" ? "ocupada" : "") + (esMia(m) ? "" : " ajena") + (String(m.mesa) === String(S.mesa) ? " on" : ""), function () { cerrarModal(); tocarMesa(m); }));
    });
    abrirModal("Elige la mesa", [g]);
  }
  function abrirMesa(mesa, luego) {
    ultimaMesaN = ""; ultimaCocina = null;
    S.mesa = String(mesa); S.vista = "carta"; S.q = "";
    var m = mesaDe(mesa); S.cuenta = m ? { mesa: m.mesa, pedidos: m.pedidos || [], total: m.total } : null;
    pintar(); window.scrollTo(0, 0);
    if (S.cuenta) { if (luego) setTimeout(luego, 0); return Promise.resolve(); }
    return cargarCuenta().then(function () { if (luego) luego(); });
  }
  function cargarCuenta() {
    var mesa = S.mesa;
    return api({ mz: "cuenta", t: S.t, mesa: mesa }).then(function (r) {
      if (mesa !== S.mesa) return;
      S.cuenta = r.ok ? r : { pedidos: [], total: 0 };
      var ae = document.activeElement;
      if (!(ae && ae.closest && ae.closest(".orden textarea"))) pintarOrden();
    }).catch(function () { toast("No se pudo leer la cuenta de la mesa.", "mal"); });
  }
  /* ☰ categorías: saltar directo a una sección sin deslizar */
  function menuCategorias() {
    var g = h("div", "cats");
    SECS.forEach(function (s) {
      var n = s.grupos.reduce(function (a, gr) { return a + gr.items.length; }, 0);
      var b = btn("", "", function () { cerrarModal(); irSeccion(s.id); });
      b.appendChild(document.createTextNode(s.titulo)); b.appendChild(h("small", null, n + (n === 1 ? " plato" : " platos")));
      g.appendChild(b);
    });
    abrirModal("Categorías", [g]);
  }
  function irSeccion(id) {
    var prods = document.querySelector(".prods"), secs = document.querySelector(".secs");
    S.q = ""; var bus = document.querySelector(".top__bus"); if (bus && bus.value) { bus.value = ""; pintarProductos(); }
    var d = document.getElementById("s-" + id); if (!d || !prods) return;
    if (getComputedStyle(prods).overflowY === "auto") prods.scrollTop = d.offsetTop - 2;
    else window.scrollTo(0, d.getBoundingClientRect().top + window.scrollY - (secs ? secs.getBoundingClientRect().bottom : 60) - 4);
    marcarSec(id);
  }

  /* ---------- carta ---------- */
  var obs = null;
  function vistaCarta() {
    var w = h("div", "carta"), secs = h("nav", "secs"), prods = h("section", "prods"), orden = h("aside", "orden");
    SECS.forEach(function (s) {
      secs.appendChild(btn(s.titulo, "", function () { irSeccion(s.id); }));
      secs.lastChild.dataset.s = s.id;
    });
    w.appendChild(secs); w.appendChild(prods); w.appendChild(orden);
    setTimeout(function () { pintarProductos(); pintarOrden(); }, 0);
    var barra = h("div", "barra-ped"); barra.id = "barraPed"; w.appendChild(barra);
    return w;
  }
  function marcarSec(id) {
    document.querySelectorAll(".secs button").forEach(function (b) {
      var on = b.dataset.s === id; b.classList.toggle("on", on);
      if (on && b.scrollIntoView && getComputedStyle(b.parentNode).overflowX === "auto") b.parentNode.scrollLeft = b.offsetLeft - 40;
    });
  }
  function tarjeta(it) {
    var no = motivoNo(it), b = btn("", "prod" + (no ? " no" : ""), function () { if (no) { toast(it.n + ": " + no.toLowerCase(), "mal"); return; } tocarProducto(it, b); });
    if (it.foto) { var f = h("div", "ft"), u = String(it.foto); if (!/^(https?:|data:|\/)/.test(u)) u = "/" + u; f.style.backgroundImage = "url('" + u.replace(/'/g, "%27") + "')"; b.appendChild(f); }
    var tx = h("div", "tx");
    tx.appendChild(h("span", "n", it.n));
    if (it.g) tx.appendChild(h("span", "g", it.g));
    if (conOpciones(it) && !no) tx.appendChild(h("span", "op", it.t ? "elige tamaño" : it.salsa ? "elige salsa" : "opciones"));
    tx.appendChild(h("span", "p", no || precioTxt(it)));
    b.appendChild(tx);
    var q = cantDe(it.id); if (q) b.appendChild(h("span", "q", "×" + q));
    b.dataset.id = it.id;
    return b;
  }
  function pintarProductos() {
    var prods = document.querySelector(".prods"); if (!prods) return;
    prods.textContent = "";
    var q = norm(S.q).trim();
    if (q) {
      var res = Object.keys(PROD).map(function (k) { return PROD[k]; }).filter(function (it) { return norm(it.n + " " + (it.g || "") + " " + it._sec.titulo).indexOf(q) >= 0; });
      prods.appendChild(h("div", "sec-h", res.length + " resultado" + (res.length === 1 ? "" : "s")));
      var g = h("div", "grid"); res.forEach(function (it) { g.appendChild(tarjeta(it)); }); prods.appendChild(g);
      if (!res.length) prods.appendChild(h("p", "vacio", "No hay platos con “" + S.q + "”."));
      return;
    }
    if (obs) obs.disconnect();
    obs = "IntersectionObserver" in window ? new IntersectionObserver(function (es) {
      es.forEach(function (e) { if (e.isIntersecting) marcarSec(e.target.dataset.s); });
    }, { root: getComputedStyle(prods).overflowY === "auto" ? prods : null, rootMargin: "0px 0px -75% 0px" }) : null;
    SECS.forEach(function (s) {
      var sec = h("div"); sec.id = "s-" + s.id; sec.dataset.s = s.id;
      sec.appendChild(h("div", "sec-h", s.titulo));
      s.grupos.forEach(function (gr) {
        if (gr.titulo && s.grupos.length > 1) sec.appendChild(h("div", "sub-h", gr.titulo));
        var g = h("div", "grid"); gr.items.forEach(function (it) { g.appendChild(tarjeta(it)); }); sec.appendChild(g);
      });
      prods.appendChild(sec);
      if (obs) obs.observe(sec);
    });
  }
  function refrescarTarjeta(id) {
    document.querySelectorAll('.prod[data-id="' + id + '"]').forEach(function (b) {
      var q = b.querySelector(".q"), n = cantDe(id);
      if (n) { if (!q) { q = h("span", "q"); b.appendChild(q); } q.textContent = "×" + n; } else if (q) q.remove();
      b.classList.remove("flash"); void b.offsetWidth; b.classList.add("flash");
    });
  }

  /* ---------- agregar al pedido ---------- */
  function tocarProducto(it, b) {
    if (S.horario && !S.horario.cocina) { toast(S.horario.cocinaEn ? "La cocina todavía no abre (" + S.horario.abre + ")." : "La cocina ya cerró.", "mal"); return; }
    if (!conOpciones(it)) { agregar(it, { tam: "", salsa: "", ops: {}, nota: "", cant: 1 }); return; }
    fichaOpciones(it);
  }
  function igualLinea(a, b) { return a.id === b.id && a.tam === b.tam && a.salsa === b.salsa && a.nota === b.nota && JSON.stringify(a.ops) === JSON.stringify(b.ops); }
  function agregar(it, sel) {
    var l = { id: it.id, n: it.n, tam: sel.tam || "", salsa: sel.salsa || "", ops: sel.ops || {}, nota: sel.nota || "", cant: sel.cant || 1, unit: precioDe(it, sel) };
    var c = carro(), igual = c.filter(function (x) { return igualLinea(x, l); })[0];
    if (igual) igual.cant = Math.min(30, igual.cant + l.cant); else c.push(l);
    guardarCarros(); refrescarTarjeta(it.id); pintarOrden();
    if (window.innerWidth <= 860) toast("+" + l.cant + " " + it.n, "ok");
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
  function fichaOpciones(it, linea) {
    var sel = linea ? { tam: linea.tam, salsa: linea.salsa, ops: JSON.parse(JSON.stringify(linea.ops || {})), nota: linea.nota, cant: linea.cant }
      : { tam: it.t ? it.t[0][0] : "", salsa: "", ops: {}, nota: "", cant: 1 };
    var cuerpo = [], err = h("p", "err"), add, zonaSalsa = h("div");
    zonaSalsa.style.display = "flex"; zonaSalsa.style.flexDirection = "column"; zonaSalsa.style.gap = "12px";
    function pintarBoton() { add.textContent = (linea ? "Guardar" : "Agregar") + " · " + soles(precioDe(it, sel) * sel.cant); err.textContent = ""; }
    function bloque(gid) {
      var g = GRUPOS[gid], w = h("div"); w.style.display = "flex"; w.style.flexDirection = "column"; w.style.gap = "8px";
      w.appendChild(h("div", "lbl" + (g.req ? " req" : ""), g.n));
      var eleg = (sel.ops[gid] = sel.ops[gid] || []);
      w.appendChild(chips(g.ops.map(function (o) { return { v: o.n, t: o.n, s: o.p ? "+ " + soles(o.p) : "" }; }), g.tipo === "varias", eleg, function () { pintarBoton(); }));
      return w;
    }
    if (it.t) {
      cuerpo.push(h("div", "lbl", "Tamaño"));
      var et = [sel.tam];
      cuerpo.push(chips(it.t.map(function (x) { return { v: x[0], t: x[0], s: soles(x[1]) }; }), false, et, function (v) { sel.tam = v[0]; pintarBoton(); }));
    }
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
    cuerpo.push(h("div", "lbl", "Indicación para cocina (opcional)"));
    var nota = h("input", "campo"); nota.maxLength = 120; nota.placeholder = "Ej.: sin cebolla, bien cocido…"; nota.value = sel.nota || "";
    nota.addEventListener("input", function () { sel.nota = nota.value.trim(); });
    cuerpo.push(nota); cuerpo.push(err);
    var step = h("div", "step"), out = h("output", null, String(sel.cant));
    step.appendChild(btn("−", "", function () { if (sel.cant > 1) { sel.cant--; out.textContent = sel.cant; pintarBoton(); } }));
    step.appendChild(out);
    step.appendChild(btn("+", "", function () { if (sel.cant < 30) { sel.cant++; out.textContent = sel.cant; pintarBoton(); } }));
    add = btn("", "btn prim", function () {
      if (it.salsa && !sel.salsa) { err.textContent = "Elige la salsa."; return; }
      var falta = gruposDe(it, sel.salsa).filter(function (g) { return GRUPOS[g].req && !(sel.ops[g] || []).length; })[0];
      if (falta) { err.textContent = "Elige " + GRUPOS[falta].n.toLowerCase() + "."; return; }
      Object.keys(sel.ops).forEach(function (g) { if (!(sel.ops[g] || []).length) delete sel.ops[g]; });
      var volverAlPedido = modalPedido;
      if (linea) {
        var c = carro(), i = c.indexOf(linea);
        if (i >= 0) c.splice(i, 1);
      }
      cerrarModal();
      agregar(it, sel);
      if (volverAlPedido) abrirPedidoCelular();
    });
    pintarBoton();
    abrirModal(it.n + (it.g ? " · " + it.g : ""), cuerpo, [step, add]);
  }

  /* ---------- columna del pedido ---------- */
  function contenidoOrden() {
    var w = h("div", "orden"), cab = h("div", "orden__cab"), m = mesaDe(S.mesa);
    cab.appendChild(h("h2", null, "Mesa " + S.mesa));
    if (m) cab.appendChild(h("span", "orden__est e-" + estadoMesa(m), TXT_ESTADO[estadoMesa(m)] + (m.atiende ? " · 🤵 " + (m.atiende.id === yo() ? "tú" : m.atiende.nombre) : "")));
    if (S.cuenta && S.cuenta.pedidos.length) cab.appendChild(btn("💳 Cobrar", "btn azul peq", function () { cobrar(); }));
    w.appendChild(cab);
    // acciones de la mesa
    var acc = h("div", "orden__acc");
    if (m && m.estado === "libre") acc.appendChild(btn("🪑 Sentar clientes", "btn peq", function () { ocupar(S.mesa, false); }));
    if (m && m.estado !== "libre" && (!m.atiende || m.atiende.id !== yo())) acc.appendChild(btn("🔁 Pasar a mí", "btn peq", function () { ocupar(S.mesa, true); }));
    if (m && m.estado !== "libre" && m.atiende && m.atiende.id === yo() && variosMozos()) acc.appendChild(btn("🔁 Pasar a otro mozo", "btn peq", pasarA));
    if (m && m.estado === "sentada") acc.appendChild(btn("🆓 Liberar mesa", "btn peq", liberar));
    if (acc.childNodes.length) w.appendChild(acc);
    var lista = h("div", "orden__lista"), c = carro();
    if (!c.length) lista.appendChild(h("p", "vacio", "Toca los platos para agregarlos al pedido."));
    else lista.appendChild(h("div", "lbl", "Por enviar a cocina"));
    c.forEach(function (l) {
      var it = PROD[l.id], d = h("div", "linea"), tx = h("div", "d");
      tx.appendChild(document.createTextNode(l.n + (l.tam ? " (" + l.tam + ")" : "")));
      var det = [];
      if (l.salsa && SALSA[l.salsa]) det.push("Salsa " + SALSA[l.salsa].n);
      Object.keys(l.ops || {}).forEach(function (g) { if ((l.ops[g] || []).length) det.push(l.ops[g].join(", ")); });
      if (det.length) tx.appendChild(h("small", null, det.join(" · ")));
      if (l.nota) tx.appendChild(h("em", null, "→ " + l.nota));
      d.appendChild(tx); d.appendChild(h("span", "pr", soles(l.unit * l.cant)));
      var st = h("div", "st"), out = h("output", null, String(l.cant));
      st.appendChild(btn("−", "", function () { if (l.cant > 1) l.cant--; else c.splice(c.indexOf(l), 1); guardarCarros(); refrescarTarjeta(l.id); pintarOrden(); }));
      st.appendChild(out);
      st.appendChild(btn("+", "", function () { if (l.cant < 30) l.cant++; guardarCarros(); refrescarTarjeta(l.id); pintarOrden(); }));
      st.appendChild(btn(conOpciones(it || {}) ? "✎ Cambiar" : "✎ Nota", "nota", function () {
        if (it && conOpciones(it)) { fichaOpciones(it, l); return; }
        var n = prompt("Indicación para cocina:", l.nota || ""); if (n == null) return;
        l.nota = n.trim().slice(0, 120); guardarCarros(); pintarOrden();
      }));
      st.appendChild(btn("🗑", "x", function () { c.splice(c.indexOf(l), 1); guardarCarros(); refrescarTarjeta(l.id); pintarOrden(); }));
      d.appendChild(st);
      lista.appendChild(d);
    });
    // lo que ya se envió (por el mozo o desde el QR)
    var cu = h("div", "cuenta");
    if (!S.cuenta) cu.appendChild(h("p", "vacio", "Cargando cuenta…"));
    else if (S.cuenta.pedidos.length) {
      var t3 = h("h3"); t3.appendChild(h("span", null, "Ya enviado")); t3.appendChild(h("span", null, soles(S.cuenta.total))); cu.appendChild(t3);
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
      pie.appendChild(btn("💳 Cobrar mesa · " + soles(S.cuenta.total), "btn azul", function () { cobrar(); }));
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
      else if (S.cuenta && S.cuenta.pedidos.length) {
        b.appendChild(btn("Cuenta · " + soles(S.cuenta.total), "btn cta", abrirPedidoCelular));
        b.appendChild(btn("💳 Cobrar", "btn azul", function () { cobrar(); }));
      } else b.appendChild(btn("Mesa " + S.mesa + " · sin pedidos", "btn cta", abrirPedidoCelular));
    }
    if (modalPedido) { var m = capa.querySelector(".modal .orden"); if (m) m.replaceWith(contenidoOrden()); }
  }
  function abrirPedidoCelular() {
    var m = abrirModal("Pedido · Mesa " + S.mesa, [contenidoOrden()]);
    m.querySelector(".modal__cuerpo").style.padding = "0";
    modalPedido = true;
  }

  function enviar() {
    var c = carro(); if (!c.length || S.enviando) return;
    var mesa = S.mesa;
    S.enviando = true; pintarOrden();
    var cuerpo = { mz: "pedido", t: S.t, mesa: mesa, notas: carros["_n" + mesa] || "",
      items: c.map(function (l) { return { id: l.id, tam: l.tam, salsa: l.salsa, cant: l.cant, nota: l.nota, ops: l.ops || {} }; }) };
    api(cuerpo).then(function (r) {
      S.enviando = false;
      if (!r.ok) { toast(r.error || "No se pudo enviar.", "mal"); pintarOrden(); return; }
      carros[mesa] = []; delete carros["_n" + mesa]; guardarCarros();
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

  /* ---------- cobrar la mesa ---------- */
  function cobrar(sugerido, reintento) {
    if (!S.cuenta) { if (!reintento) cargarCuenta().then(function () { cobrar(sugerido, true); }); return; }
    if (!S.cuenta.pedidos.length) { toast("La mesa " + S.mesa + " no tiene cuenta abierta.", "mal"); return; }
    if (carro().length && !confirm("Hay platos sin enviar a cocina en esta mesa. ¿Cobrar igual? (no se incluyen en la cuenta)")) return;
    var total = S.cuenta.total, metodos = S.metodos;
    var inicial = metodos.filter(function (m) { return sugerido && norm(sugerido).indexOf(norm(m)) >= 0; })[0] || "";
    if (!inicial && /yape|plin/i.test(sugerido || "") && metodos.indexOf(YP) >= 0) inicial = YP;
    var pagos = [{ metodo: inicial, monto: total, propina: 0 }];
    var zona = h("div"), resumen = h("div", "resumen"), err = h("p", "err");
    zona.style.display = "flex"; zona.style.flexDirection = "column"; zona.style.gap = "10px";
    function restante() { return r2(total - pagos.reduce(function (a, p) { return a + (Number(p.monto) || 0); }, 0)); }
    function pintarPagos() {
      zona.textContent = "";
      pagos.forEach(function (p, i) {
        var w = h("div", "pago");
        if (pagos.length > 1) {
          var tt = h("div", "fila"); tt.appendChild(h("b", null, "Pago " + (i + 1))); tt.appendChild(h("span", "esp"));
          tt.appendChild(btn("Quitar", "btn peq", function () { pagos.splice(i, 1); if (pagos.length === 1) pagos[0].monto = total; pintarPagos(); }));
          w.appendChild(tt);
        }
        var em = p.metodo ? [p.metodo] : [], extra = h("div", "pago__extra");
        w.appendChild(chips(metodos.map(function (m) { return { v: m, t: m, s: m === YP ? "⚡ recomendado" : "" }; }), false, em, function (v) { p.metodo = v[0]; err.textContent = ""; pintarExtra(); }));
        w.appendChild(extra);
        // Yape o Plin: el cliente escanea el QR de Plin desde Yape o Plin. Efectivo: calcular el vuelto.
        function pintarExtra() {
          extra.textContent = "";
          if (p.metodo === YP) {
            var c = cobroYP();
            if (c && c.qr) { var q = h("img", "qrpago"); q.src = /^(https?:|data:|\/)/.test(c.qr) ? c.qr : "/" + c.qr; q.alt = "QR Yape o Plin"; extra.appendChild(q); }
            extra.appendChild(h("p", "vacio", (c && c.qr ? "Muestra este QR al cliente: lo puede escanear con Yape o con Plin." : "Falta subir el QR de Plin en el panel (Ajustes).") +
              (c && c.numero ? " Número: " + c.numero + (c.titular ? " (" + c.titular + ")" : "") + "." : "") + " Registra el cobro cuando veas que llegó el pago."));
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
      zona.appendChild(btn("➕ Dividir: agregar otro método de pago", "btn peq", function () {
        var falta = restante(); if (falta <= 0 && pagos.length) { pagos[pagos.length - 1].monto = r2(pagos[pagos.length - 1].monto / 2); falta = restante(); }
        pagos.push({ metodo: "", monto: Math.max(0, falta), propina: 0 }); pintarPagos();
      }));
      pintarResumen();
    }
    function pintarResumen() {
      var falta = restante(), prop = r2(pagos.reduce(function (a, p) { return a + (Number(p.propina) || 0); }, 0));
      resumen.className = "resumen " + (Math.abs(falta) < 0.01 ? "ok" : "mal");
      resumen.textContent = "";
      resumen.appendChild(h("span", null, Math.abs(falta) < 0.01 ? "✓ Cuenta completa" : falta > 0 ? "Falta " + soles(falta) : "Sobra " + soles(-falta)));
      resumen.appendChild(h("span", null, prop ? "Propina " + soles(prop) : ""));
    }
    var cab = h("div", "tot"); cab.appendChild(h("span", null, "Total de la mesa")); cab.appendChild(h("span", null, soles(total)));
    var ok = btn("✓ Registrar cobro", "btn azul", function () {
      if (pagos.some(function (p) { return !p.metodo; })) { err.textContent = "Elige el método de cada pago."; return; }
      if (Math.abs(restante()) >= 0.01) { err.textContent = "Los montos deben sumar " + soles(total) + "."; return; }
      ok.disabled = true; ok.textContent = "Registrando…";
      api({ mz: "cobrar", t: S.t, mesa: S.mesa, total: total, pagos: pagos }).then(function (r) {
        if (!r.ok) {
          ok.disabled = false; ok.textContent = "✓ Registrar cobro"; err.textContent = r.error || "No se pudo registrar.";
          if (r.cambio && r.cuenta) { S.cuenta = r.cuenta; cerrarModal(); pintarOrden(); toast(r.error, "mal"); }
          return;
        }
        cerrarModal();
        toast("✓ Mesa " + r.mesa + " cobrada" + (r.propina ? " · propina " + soles(r.propina) : ""), "ok");
        S.cuenta = { pedidos: [], total: 0 }; S.vista = "mesas"; S.v = ""; pintar(); sondear();
      }).catch(function () { ok.disabled = false; ok.textContent = "✓ Registrar cobro"; err.textContent = "Sin conexión. Intenta de nuevo."; });
    });
    pintarPagos();
    abrirModal("💳 Cobrar mesa " + S.mesa, [cab, zona, resumen, err], [ok]);
  }

  /* =========================== ARRANQUE =========================== */
  if ("serviceWorker" in navigator && location.protocol === "https:") {
    navigator.serviceWorker.register("/mozo-sw.js", { scope: "/" }).catch(function () {});
  }
  if (!SECS.length) { app.appendChild(h("p", "vacio", "No se pudo cargar la carta. Revisa la conexión y vuelve a abrir.")); return; }
  if (S.t && S.mozo) iniciar(); else pantallaLogin();
})();
