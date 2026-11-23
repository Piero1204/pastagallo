/* Pasta Gallo · Finanzas (app estática). Habla con Apps Script: POST { ext:'finanzas', accion, token, ... }.
   La URL de la API sale de menu-data.js (CARTA.pedidos.api). Una sola llamada 'inicio' trae todo; se guarda en el
   navegador para pintar al instante y se actualiza por detrás. Sin librerías: gráficos en SVG. */
(function () {
  "use strict";
  var API = (window.CARTA && CARTA.pedidos && CARTA.pedidos.api) || "";
  var K_TOKEN = "pgfin:t", K_CACHE = "pgfin:c:", K_PER = "pgfin:per";
  var app = document.getElementById("app");
  var S = { token: leer(K_TOKEN), tab: "resumen", periodo: leerJson(K_PER) || { periodo: "mes" }, mes: "", datos: null, cargando: false, lineaPL: "total" };

  /* ---------- utilidades ---------- */
  function leer(k) { try { return localStorage.getItem(k) || ""; } catch (e) { return ""; } }
  function leerJson(k) { try { return JSON.parse(localStorage.getItem(k) || "null"); } catch (e) { return null; } }
  function guardar(k, v) { try { localStorage.setItem(k, typeof v === "string" ? v : JSON.stringify(v)); } catch (e) { /* lleno o privado */ } }
  function borrarCache() { try { Object.keys(localStorage).forEach(function (k) { if (k.indexOf("pgfin:") === 0) localStorage.removeItem(k); }); } catch (e) { /* idem */ } }
  function esc(s) { return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; }); }
  function n(v) { v = Number(v); return isFinite(v) ? v : 0; }
  function soles(v, dec) { v = n(v); var s = Math.abs(v).toLocaleString("es-PE", { minimumFractionDigits: dec === 0 ? 0 : 2, maximumFractionDigits: dec === 0 ? 0 : 2 }); return (v < 0 ? "−" : "") + "S/ " + s; }
  function corto(v) { v = n(v); var a = Math.abs(v); return a >= 1e6 ? (v / 1e6).toFixed(1) + " M" : a >= 1e4 ? Math.round(v / 1e3) + " mil" : a >= 1e3 ? (v / 1e3).toFixed(1) + " mil" : String(Math.round(v)); }
  function pct(v) { return v == null ? "—" : String(v).replace(".", ",") + "%"; }
  function hoyIso() { var d = new Date(); return d.getFullYear() + "-" + ("0" + (d.getMonth() + 1)).slice(-2) + "-" + ("0" + d.getDate()).slice(-2); }
  var MESES = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];
  function nombreMes(m, cortoM) { var p = String(m).split("-"), t = MESES[+p[1] - 1] || m; return cortoM ? t.slice(0, 3) : t + " " + p[0]; }
  function fechaCorta(iso) { if (!iso) return ""; var p = iso.split("-"); return +p[2] + " " + MESES[+p[1] - 1].slice(0, 3); }
  function mesSuma(m, k) { var p = m.split("-"), d = new Date(Date.UTC(+p[0], +p[1] - 1 + k, 1)); return d.toISOString().slice(0, 7); }
  function cid() { var a = new Uint8Array(12); (window.crypto || {}).getRandomValues ? crypto.getRandomValues(a) : a.forEach(function (_, i) { a[i] = Math.random() * 256; }); return "f" + Array.prototype.map.call(a, function (b) { return ("0" + b.toString(16)).slice(-2); }).join(""); }
  function variacion(v, invertir) {
    if (v == null) return '<span class="var nula">sin comparativo</span>';
    var sube = v >= 0, bueno = invertir ? !sube : sube;
    return '<span class="var ' + (v === 0 ? "nula" : bueno ? "" : "baja") + '">' + (v === 0 ? "=" : sube ? "▲" : "▼") + " " + pct(Math.abs(v)) + "</span>";
  }
  var ICO = {
    resumen: '<path d="M3 13h4v8H3zM10 8h4v13h-4zM17 3h4v18h-4z"/>',
    resultados: '<path d="M4 19V5M4 19h16M8 15l4-4 3 3 5-6"/>',
    gastos: '<path d="M4 6h16v12H4zM4 10h16M8 15h3"/>',
    caja: '<path d="M3 9l9-5 9 5M5 9v9M19 9v9M9 9v9M15 9v9M3 20h18"/>',
    cuentas: '<path d="M7 7h11l-3-3M17 17H6l3 3"/>',
    mas: '<circle cx="5" cy="12" r="1.6"/><circle cx="12" cy="12" r="1.6"/><circle cx="19" cy="12" r="1.6"/>',
    refrescar: '<path d="M20 11a8 8 0 1 0-2.3 5.7M20 5v6h-6"/>',
    mas2: '<path d="M12 5v14M5 12h14"/>',
    persona: '<circle cx="12" cy="8" r="4"/><path d="M4 21c1-4 4-6 8-6s7 2 8 6"/>',
    ajustes: '<path d="M4 7h10M18 7h2M4 17h4M12 17h8"/><circle cx="16" cy="7" r="2"/><circle cx="10" cy="17" r="2"/>',
    mapa: '<path d="M9 4L3 6v14l6-2 6 2 6-2V4l-6 2z M9 4v14M15 6v14"/>',
    bajar: '<path d="M12 4v11M7 10l5 5 5-5M5 20h14"/>',
    llave: '<circle cx="8" cy="15" r="4"/><path d="M11 12l9-9M16 7l3 3"/>',
    salir: '<path d="M15 4h4v16h-4M10 8l-4 4 4 4M6 12h10"/>',
    alerta: '<path d="M12 3l10 18H2z M12 10v5M12 18v.5"/>'
  };
  function ico(k) { return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + (ICO[k] || "") + "</svg>"; }
  var toastT;
  function toast(t, mal) {
    var x = document.querySelector(".toast"); if (x) x.remove();
    x = document.createElement("div"); x.className = "toast" + (mal ? " mal" : ""); x.setAttribute("role", "status"); x.textContent = t;
    document.body.appendChild(x); clearTimeout(toastT); toastT = setTimeout(function () { x.remove(); }, 3200);
  }

  /* ---------- API ---------- */
  function api(o) {
    if (!API) return Promise.reject(new Error("No se encontró la dirección del servidor (menu-data.js)."));
    o.ext = "finanzas"; if (S.token && !o.token) o.token = S.token;
    return fetch(API, { method: "POST", headers: { "Content-Type": "text/plain;charset=utf-8" }, body: JSON.stringify(o), redirect: "follow", credentials: "omit" })
      .then(function (r) { return r.json(); })
      .then(function (r) {
        if (r && r.sesion === false) { salir(true); throw new Error(r.error || "Tu sesión terminó."); }
        if (!r || !r.ok) throw new Error((r && r.error) || "No se pudo completar.");
        return r;
      });
  }
  function claveCache() { var p = S.periodo; return K_CACHE + [p.periodo, p.desde || "", p.hasta || "", S.mes || ""].join("|"); }
  function cargar(refrescar) {
    var cache = leerJson(claveCache());
    if (cache && !S.datos) { S.datos = cache; pintar(); }
    S.cargando = true; estado();
    var b = { accion: "inicio", periodo: S.periodo.periodo, desde: S.periodo.desde, hasta: S.periodo.hasta, mes: S.mes || undefined, refrescar: !!refrescar };
    return api(b).then(function (r) {
      S.datos = r; if (!S.mes) S.mes = r.pl.mes; guardar(claveCache(), r); S.cargando = false; pintar();
    }).catch(function (e) { S.cargando = false; estado(); if (S.token) toast(e.message, true); if (!S.datos) pintar(); });
  }
  function estado() {
    var el = document.getElementById("estado"), b = document.getElementById("btnRef");
    if (b) b.classList.toggle("girando", S.cargando);
    if (!el) return;
    if (S.cargando) el.textContent = S.datos ? "Actualizando…" : "Cargando…";
    else if (S.datos) { var g = new Date(S.datos.generado); el.textContent = "Actualizado " + ("0" + g.getHours()).slice(-2) + ":" + ("0" + g.getMinutes()).slice(-2) + (S.datos.cache ? " · copia de hace un momento" : ""); }
  }

  /* ---------- login ---------- */
  function pintarLogin(err) {
    app.innerHTML = '<div class="login"><form class="login-caja" id="fLogin" autocomplete="off">' +
      '<img src="favicon.png" alt=""><h1>Finanzas</h1><p>Pasta Gallo · solo para la familia</p>' +
      '<label class="campo"><span>Contraseña</span><input class="inp" id="clave" type="password" autocomplete="current-password" required></label>' +
      '<button class="btn full" id="bEntrar">Entrar</button><p class="msg-error" id="lErr" role="alert">' + esc(err || "") + "</p></form></div>";
    var f = document.getElementById("fLogin"), inp = document.getElementById("clave");
    setTimeout(function () { inp.focus(); }, 50);
    f.onsubmit = function (ev) {
      ev.preventDefault();
      var b = document.getElementById("bEntrar"); b.disabled = true; b.textContent = "Entrando…";
      api({ accion: "login", clave: inp.value, token: "-" }).then(function (r) {
        S.token = r.token; guardar(K_TOKEN, r.token); S.datos = null; iniciar();
      }).catch(function (e) { b.disabled = false; b.textContent = "Entrar"; document.getElementById("lErr").textContent = e.message; inp.select(); });
    };
  }
  function salir(vencida) {
    var t = S.token; S.token = ""; S.datos = null; borrarCache();
    if (t && !vencida) api({ accion: "salir", token: t }).catch(function () {});
    pintarLogin(vencida ? "Tu sesión terminó. Vuelve a entrar." : "");
  }

  /* ---------- estructura ---------- */
  var TABS = [["resumen", "Resumen"], ["resultados", "Resultados"], ["gastos", "Gastos"], ["caja", "Caja"], ["cuentas", "Pagar/cobrar"], ["mas", "Más"]];
  var PERIODOS = [["hoy", "Hoy"], ["ayer", "Ayer"], ["semana", "Semana"], ["mes", "Mes"], ["mes_pasado", "Mes pasado"], ["anio", "Año"], ["rango", "Rango…"]];
  function iniciar() {
    app.innerHTML = '<header class="top"><div class="top-fila"><h1 id="titulo"><small>Pasta Gallo · Finanzas</small><span id="tituloTab">Resumen</span></h1>' +
      '<button class="icono-btn" id="btnRef" aria-label="Actualizar">' + ico("refrescar") + "</button></div>" +
      '<div class="chips" id="chips" role="tablist" aria-label="Periodo"></div><div class="estado-linea" id="estado"></div></header>' +
      '<main id="main"></main><nav class="nav" id="nav" aria-label="Secciones"></nav>';
    document.getElementById("btnRef").onclick = function () { cargar(true); };
    var nav = document.getElementById("nav");
    nav.innerHTML = TABS.map(function (t) { return '<button data-t="' + t[0] + '" aria-label="' + t[1] + '">' + ico(t[0]) + "<span>" + t[1] + "</span></button>"; }).join("");
    nav.onclick = function (ev) { var b = ev.target.closest("button"); if (!b) return; S.tab = b.getAttribute("data-t"); window.scrollTo(0, 0); pintar(); };
    var ch = document.getElementById("chips");
    ch.onclick = function (ev) {
      var b = ev.target.closest("button"); if (!b) return;
      var p = b.getAttribute("data-p");
      if (p === "rango") { abrirRango(); return; }
      S.periodo = { periodo: p }; guardar(K_PER, S.periodo); S.datos = null; cargar();
    };
    pintar(); cargar();
  }
  function pintarChips() {
    var ch = document.getElementById("chips"); if (!ch) return;
    var mostrar = S.tab === "resumen" || S.tab === "caja" || S.tab === "mas";
    ch.classList.toggle("oculto", !mostrar);
    ch.innerHTML = PERIODOS.map(function (p) {
      var on = S.periodo.periodo === p[0], et = p[0] === "rango" && on ? fechaCorta(S.periodo.desde) + " – " + fechaCorta(S.periodo.hasta) : p[1];
      return '<button class="chip' + (on ? " on" : "") + '" data-p="' + p[0] + '" role="tab" aria-selected="' + on + '">' + esc(et) + "</button>";
    }).join("");
  }
  function pintar() {
    if (!S.token) { pintarLogin(); return; }
    var main = document.getElementById("main"); if (!main) { iniciar(); return; }
    Array.prototype.forEach.call(document.querySelectorAll("#nav button"), function (b) { var on = b.getAttribute("data-t") === S.tab; b.classList.toggle("on", on); if (on) b.setAttribute("aria-current", "page"); else b.removeAttribute("aria-current"); });
    document.getElementById("tituloTab").textContent = (TABS.filter(function (t) { return t[0] === S.tab; })[0] || [0, ""])[1];
    pintarChips(); estado();
    var fab = document.querySelector(".fab"); if (fab) fab.remove();
    if (!S.datos) { main.innerHTML = '<div class="esqueleto"></div><div class="esqueleto"></div><div class="esqueleto" style="height:200px"></div>'; return; }
    var f = { resumen: vResumen, resultados: vResultados, gastos: vGastos, caja: vCaja, cuentas: vCuentas, mas: vMas }[S.tab] || vResumen;
    main.innerHTML = f(S.datos);
    if (S.tab === "gastos") ponerFab();
    enlazar(main);
  }

  /* ---------- gráficos SVG ---------- */
  function gBarras(serie, alto) {
    alto = alto || 150; if (!serie.length) return "";
    var W = 340, H = alto, pad = 18, max = Math.max.apply(null, serie.map(function (x) { return n(x.v); }).concat([1]));
    var bw = (W - 8) / serie.length, out = "";
    serie.forEach(function (x, i) {
      var h = Math.max(n(x.v) > 0 ? 2 : 0, (H - pad - 6) * n(x.v) / max), y = H - pad - h;
      out += '<rect x="' + (4 + i * bw + bw * 0.15).toFixed(1) + '" y="' + y.toFixed(1) + '" width="' + Math.max(1, bw * 0.7).toFixed(1) + '" height="' + h.toFixed(1) + '" rx="2" fill="' + (i === serie.length - 1 ? "#4a1519" : "#c9a45c") + '"><title>' + esc(x.k) + ": " + soles(x.v) + "</title></rect>";
    });
    var et = function (i) { var k = serie[i].k; return k.length === 7 ? nombreMes(k, true) : fechaCorta(k); };
    out += '<text x="4" y="' + (H - 3) + '" font-size="10" fill="#8a776d">' + esc(et(0)) + '</text><text x="' + (W - 4) + '" y="' + (H - 3) + '" font-size="10" fill="#8a776d" text-anchor="end">' + esc(et(serie.length - 1)) + "</text>";
    out += '<text x="4" y="11" font-size="10" fill="#8a776d">máx ' + esc(soles(max, 0)) + "</text>";
    return '<div class="grafico"><svg viewBox="0 0 ' + W + " " + H + '" role="img" aria-label="Ventas por día">' + out + "</svg></div>";
  }
  function gResultado12(serie) {
    if (!serie || !serie.length) return "";
    var W = 340, H = 170, top = 14, bot = 22, vals = [];
    serie.forEach(function (x) { vals.push(n(x.ventas), n(x.resultado)); });
    var max = Math.max.apply(null, vals.concat([1])), min = Math.min.apply(null, vals.concat([0]));
    var y = function (v) { return top + (H - top - bot) * (max - v) / (max - min || 1); }, bw = (W - 8) / serie.length, out = "";
    out += '<line x1="0" x2="' + W + '" y1="' + y(0).toFixed(1) + '" y2="' + y(0).toFixed(1) + '" stroke="#e6dac0"/>';
    serie.forEach(function (x, i) {
      var cx = 4 + i * bw, yv = y(n(x.ventas));
      out += '<rect x="' + (cx + bw * 0.12).toFixed(1) + '" y="' + yv.toFixed(1) + '" width="' + (bw * 0.76).toFixed(1) + '" height="' + Math.max(0, y(0) - yv).toFixed(1) + '" rx="3" fill="#e6dac0"><title>' + esc(nombreMes(x.mes)) + " ventas " + soles(x.ventas) + "</title></rect>";
      out += '<text x="' + (cx + bw / 2).toFixed(1) + '" y="' + (H - 6) + '" font-size="9.5" fill="#8a776d" text-anchor="middle">' + esc(nombreMes(x.mes, true)) + "</text>";
    });
    var pts = serie.map(function (x, i) { return (4 + i * bw + bw / 2).toFixed(1) + "," + y(n(x.resultado)).toFixed(1); });
    out += '<polyline points="' + pts.join(" ") + '" fill="none" stroke="#4a1519" stroke-width="2.2"/>';
    serie.forEach(function (x, i) { out += '<circle cx="' + (4 + i * bw + bw / 2).toFixed(1) + '" cy="' + y(n(x.resultado)).toFixed(1) + '" r="3.2" fill="' + (n(x.resultado) < 0 ? "#b6232a" : "#2f7a3a") + '"><title>' + esc(nombreMes(x.mes)) + " resultado " + soles(x.resultado) + "</title></circle>"; });
    return '<div class="grafico"><svg viewBox="0 0 ' + W + " " + H + '" role="img" aria-label="Ventas y resultado de 12 meses">' + out + '</svg></div><div class="leyenda"><span><i style="background:#e6dac0"></i>Ventas</span><span><i style="background:#4a1519"></i>Resultado operativo</span></div>';
  }
  var COL_LINEA = { restaurante: "#4a1519", tienda: "#a9803f", mayoristas: "#3b4128", importados: "#b6232a", general: "#8a776d" };
  function gApilada(items, total) {
    if (!(total > 0)) return "";
    var x = 0, out = "";
    items.forEach(function (it) { var w = 340 * n(it.v) / total; if (w <= 0) return; out += '<rect x="' + x.toFixed(1) + '" y="0" width="' + w.toFixed(1) + '" height="18" fill="' + it.c + '"><title>' + esc(it.k) + "</title></rect>"; x += w; });
    return '<div class="grafico"><svg viewBox="0 0 340 18" preserveAspectRatio="none" style="height:18px;border-radius:9px" role="img" aria-label="Reparto">' + out + "</svg></div>";
  }
  function filasBarras(items, total, fmt) {
    if (!items.length) return '<div class="vacio">Sin datos en este periodo.</div>';
    var max = Math.max.apply(null, items.map(function (x) { return n(x.v); }).concat([1]));
    return items.map(function (x) {
      return '<div class="fila" style="display:block"><div style="display:flex;justify-content:space-between;gap:8px"><span class="t1">' + esc(x.k) + (x.extra || "") + '</span><span class="der num">' + (fmt ? fmt(x.v) : soles(x.v)) +
        (total ? ' <small style="color:var(--tinta-3)">' + pct(Math.round(n(x.v) / total * 1000) / 10) + "</small>" : "") + "</span></div>" +
        '<div class="barra"><i style="width:' + Math.max(0, n(x.v) / max * 100).toFixed(1) + "%;background:" + (x.c || "var(--oro)") + '"></i></div></div>';
    }).join("");
  }

  /* ---------- Resumen ---------- */
  function vResumen(d) {
    var r = d.resumen, a = r.actual, per = d.periodo, h = "";
    var mostrar = d.alertas.filter(function (x) { return x.nivel !== "info"; }).slice(0, 3);
    h += '<div class="grid-kpi">';
    h += '<div class="kpi grande"><div class="et">Ventas · ' + esc(per.etiqueta) + '</div><div class="v num">' + soles(a.bruto) + '</div><div class="s">' + variacion(r.var.ventas) + " vs periodo anterior" +
      (r.varAnio ? " · " + variacion(r.varAnio.ventas) + " vs año pasado" : "") + "<br>Netas sin IGV " + soles(a.neto) + "</div></div>";
    var res = r.resultado;
    h += '<div class="kpi"><div class="et">Resultado</div><div class="v num ' + (res.resultado < 0 ? "neg" : "pos") + '">' + soles(res.resultado, 0) + '</div><div class="s">' + (res.resultadoPct == null ? "—" : pct(res.resultadoPct) + " de la venta") + (res.costoEstimado ? " · estimado" : "") + "</div></div>";
    h += '<div class="kpi"><div class="et">Ticket promedio</div><div class="v num">' + soles(a.ticket) + '</div><div class="s">' + variacion(r.var.ticket) + " · " + a.tickets + " ventas</div></div>";
    var sal = d.caja.saldos;
    h += '<div class="kpi"><div class="et">Caja</div><div class="v num">' + (sal ? soles(n(sal.chica) + n(sal.grande), 0) : "—") + '</div><div class="s">' + (sal ? "Chica " + soles(sal.chica, 0) + " · Grande " + soles(sal.grande, 0) : "Sin datos de caja") + "</div></div>";
    h += '<div class="kpi"><div class="et">Por pagar / cobrar</div><div class="v num" style="font-size:20px"><span class="neg">' + soles(d.cuentas.totalPagar, 0) + '</span> / <span class="pos">' + soles(d.cuentas.totalCobrar, 0) + '</span></div><div class="s">' + (d.cuentas.vencidoPagar > 0 ? '<span class="neg">' + soles(d.cuentas.vencidoPagar, 0) + " vencido</span>" : "Nada vencido") + "</div></div>";
    h += "</div>";
    if (mostrar.length) h += mostrar.map(alertaHtml).join("") + (d.alertas.length > mostrar.length ? '<button class="btn sec chico" data-ir="alertas">Ver todas las alertas (' + d.alertas.length + ")</button>" : "");
    var pm = r.proyeccionMes;
    h += '<h2 class="seccion-t">Proyección de ' + esc(nombreMes(pm.mes).split(" ")[0]) + "<small>día " + pm.diasTranscurridos + " de " + pm.diasMes + "</small></h2>";
    h += '<div class="tarjeta"><div class="fila"><div class="izq"><div class="t1">Vendido a la fecha</div></div><div class="der">' + soles(pm.aLaFecha) + '</div></div><div class="fila"><div class="izq"><div class="t1">Cierre proyectado</div><div class="t2">Mes pasado: ' + soles(pm.mesAnterior) + '</div></div><div class="der"><b>' + soles(pm.proyectado) + "</b><br>" + variacion(pm.var) + "</div></div>" +
      '<div class="barra" style="height:10px;margin-top:10px"><i style="width:' + Math.min(100, pm.proyectado > 0 ? pm.aLaFecha / pm.proyectado * 100 : 0).toFixed(1) + '%"></i></div></div>';
    h += '<h2 class="seccion-t">Ventas por día<small>' + esc(per.desde === per.hasta ? fechaCorta(per.desde) : fechaCorta(per.desde) + " – " + fechaCorta(per.hasta)) + "</small></h2>";
    h += '<div class="tarjeta">' + (r.serie.length > 1 ? gBarras(r.serie) : '<div class="fila"><div class="izq t1">Total del día</div><div class="der"><b>' + soles(a.bruto) + "</b></div></div>") + "</div>";
    h += '<div class="cols"><div><h2 class="seccion-t">Por línea de negocio</h2><div class="tarjeta">' +
      gApilada(r.porLinea.map(function (x) { return { k: x.nombre, v: x.bruto, c: COL_LINEA[x.k] }; }), a.bruto) +
      filasBarras(r.porLinea.map(function (x) { return { k: x.nombre, v: x.bruto, c: COL_LINEA[x.k], extra: " " + variacion(x.var) }; }), a.bruto) + "</div></div>";
    h += '<div><h2 class="seccion-t">Por canal</h2><div class="tarjeta">' + filasBarras(r.porCanal.map(function (x) { return { k: x.nombre, v: x.ventas, extra: ' <small style="color:var(--tinta-3)">' + x.n + "</small>" }; }), a.bruto) + "</div></div></div>";
    h += '<h2 class="seccion-t">Por método de pago<small>cobrado ' + soles(r.cobrado, 0) + "</small></h2><div class=\"tarjeta\">" +
      filasBarras(r.porMetodo.map(function (x) { return { k: x.k, v: x.monto, c: x.k === "Efectivo" ? "#3b4128" : x.k === "Tarjeta" ? "#4a1519" : "#a9803f" }; }), r.cobrado) +
      '<p class="nota">Salón: según lo cobrado (sin propinas). Delivery y para llevar: el método elegido en el pedido. Tienda: lo registrado en la caja.' + (a.desc > 0 ? " Descuentos dados: " + soles(a.desc) + "." : "") + "</p></div>";
    return h;
  }
  function alertaHtml(x) { return '<div class="alerta ' + esc(x.nivel) + '" role="note"><div><b>' + esc(x.titulo) + "</b><span>" + esc(x.texto) + "</span></div></div>"; }

  /* ---------- Resultados (P&L) ---------- */
  function vResultados(d) {
    var pl = d.pl, h = "", lin = pl.lineas, sel = S.lineaPL;
    h += '<div class="mes-nav"><button data-mes="-1" aria-label="Mes anterior">‹</button><b>' + esc(nombreMes(pl.mes)) + '</b><button data-mes="1" aria-label="Mes siguiente"' + (pl.enCurso ? " disabled style=\"opacity:.35\"" : "") + ">›</button></div>";
    if (pl.enCurso) h += '<p class="nota" style="margin-top:-6px">Mes en curso: a la fecha (día ' + pl.diasTranscurridos + " de " + pl.diasMes + "). La planilla y los gastos fijos se cuentan por los días transcurridos.</p>";
    var t = pl.total;
    h += '<div class="grid-kpi"><div class="kpi grande"><div class="et">Resultado operativo</div><div class="v num ' + (t.resultado < 0 ? "neg" : "") + '">' + soles(t.resultado) + '</div><div class="s">' + pct(t.resultadoPct) + " de la venta neta · ventas " + soles(t.ingresosBrutos, 0) + (t.costoEstimado ? " · costo en parte ESTIMADO" : "") + "</div></div>";
    h += '<div class="kpi"><div class="et">Margen bruto</div><div class="v num">' + pct(t.margenPct) + '</div><div class="s">' + soles(t.margen, 0) + "</div></div>";
    h += '<div class="kpi"><div class="et">Food cost</div><div class="v num ' + (t.costoPct > d.indicadores.umbrales.food ? "neg" : "") + '">' + pct(t.costoPct) + '</div><div class="s">Prime cost ' + pct(t.primePct) + "</div></div></div>";
    if (pl.proyeccion) {
      var p = pl.proyeccion;
      h += '<div class="tarjeta"><div class="fila"><div class="izq"><div class="t1">Proyección de cierre del mes</div><div class="t2">Ventas ' + soles(p.ventasConIgv, 0) + " · " + esc(p.metodo) + '</div></div><div class="der"><b class="' + (p.resultado < 0 ? "neg" : "pos") + '">' + soles(p.resultado, 0) + "</b><br><small>" + pct(p.resultadoPct) + "</small></div></div></div>";
    }
    h += '<div class="lineas-tabs" role="tablist">' + [["total", "Total"]].concat(lin.filter(function (x) { return x.linea !== "general"; }).map(function (x) { return [x.linea, x.nombre.split(" (")[0]]; }))
      .map(function (x) { return '<button data-lpl="' + x[0] + '" class="' + (sel === x[0] ? "on" : "") + '">' + esc(x[1]) + "</button>"; }).join("") + "</div>";
    var L = sel === "total" ? null : lin.filter(function (x) { return x.linea === sel; })[0];
    var x = L || { ingresosBrutos: t.ingresosBrutos, ingresos: t.ingresos, costo: t.costo, margen: t.margen, planilla: t.planilla, fijos: t.fijos, variables: t.variables, comisiones: t.comisiones, reparto: t.reparto, resultado: t.resultado, costoEstimado: t.costoEstimado, margenPct: t.margenPct, resultadoPct: t.resultadoPct };
    var fila = function (k, v, cls, extra) { return '<tr class="' + (cls || "") + '"><td>' + k + (extra || "") + "</td><td>" + soles(v) + "</td></tr>"; };
    h += '<div class="tarjeta"><table class="pl">';
    h += fila("Ventas (con IGV)", x.ingresosBrutos, "sub") + fila("Ingresos netos (sin IGV)", x.ingresos, "tot");
    h += fila("(−) Costo de ventas", -x.costo, "", x.costoEstimado ? ' <span class="etiqueta aviso">estimado</span>' : (L && L.cobertura != null ? ' <span class="etiqueta ok">receta</span>' : ""));
    h += fila("= Margen bruto", x.margen, "tot", ' <small style="color:var(--tinta-3)">' + pct(x.margenPct) + "</small>");
    h += fila("(−) Planilla", -x.planilla) + fila("(−) Gastos fijos", -x.fijos) + fila("(−) Gastos variables", -x.variables) + fila("(−) Comisiones de cobro", -x.comisiones);
    if (x.reparto) h += fila("(−) Reparto / delivery", -x.reparto);
    if (L) { h += fila("= Contribución de la línea", L.contribucion, "tot") + fila("(−) Gastos generales prorrateados", -L.prorrateo, "sub"); }
    h += '<tr class="res"><td>Resultado operativo</td><td class="' + (x.resultado < 0 ? "neg" : "pos") + '">' + soles(x.resultado) + "</td></tr></table>";
    if (L && L.cobertura != null) h += '<p class="nota">Costo con receta en el ' + pct(L.cobertura) + " de las ventas de esta línea; el resto con % estimado.</p>";
    h += "</div>";
    if (sel === "total") {
      var gen = lin.filter(function (y) { return y.linea === "general"; })[0];
      h += '<h2 class="seccion-t">Por línea</h2><div class="tarjeta"><div class="tabla-scroll"><table class="tabla"><tr><th>Línea (S/)</th><th>Ingresos</th><th>Margen</th><th>Resultado</th></tr>' +
        lin.filter(function (y) { return y.linea !== "general"; }).map(function (y) { return "<tr><td>" + esc(y.nombre.split(" (")[0].replace(" y otros locales", "")) + "</td><td>" + corto(y.ingresos) + "</td><td>" + pct(y.margenPct) + '</td><td class="' + (y.resultado < 0 ? "neg" : "") + '">' + corto(y.resultado) + "</td></tr>"; }).join("") +
        "</table></div>" + (gen ? '<p class="nota">Gastos generales (sin línea): ' + soles(-gen.contribucion, 0) + ", repartidos según las ventas de cada línea.</p>" : "") + "</div>";
    }
    var ind = d.indicadores, e = pl.equilibrio || {};
    h += '<h2 class="seccion-t">Punto de equilibrio</h2><div class="tarjeta">';
    if (e.ventasConIgv != null) {
      var avance = t.ingresosBrutos / e.ventasConIgv * 100 * (pl.enCurso ? pl.diasMes / pl.diasTranscurridos : 1);
      h += '<div class="fila"><div class="izq"><div class="t1">Ventas necesarias al mes</div><div class="t2">Fijos ' + soles(e.fijos, 0) + " ÷ margen de contribución " + pct(e.mcPct) + '</div></div><div class="der"><b>' + soles(e.ventasConIgv, 0) + "</b></div></div>";
      h += '<div class="fila"><div class="izq"><div class="t1">Por día de atención</div><div class="t2">' + ind.diasAbiertosMes + ' días al mes · hoy se vende ≈ ' + soles(ind.ventasDiaActual, 0) + '/día</div></div><div class="der"><b>' + soles(ind.ventasDiaNecesarias, 0) + "</b></div></div>";
      h += '<div class="barra" style="height:10px;margin-top:8px"><i style="width:' + Math.min(100, avance).toFixed(1) + "%;background:" + (avance >= 100 ? "var(--verde)" : "var(--ambar)") + '"></i></div><p class="nota">' + (avance >= 100 ? "Por encima del equilibrio." : "Al ritmo actual se llega al " + Math.round(avance) + "% del equilibrio.") + "</p>";
    } else h += '<div class="vacio">Falta información (ventas o margen positivo) para calcularlo.</div>';
    h += "</div>";
    h += '<h2 class="seccion-t">12 meses</h2><div class="tarjeta">' + gResultado12(d.serie12) + "</div>";
    h += '<h2 class="seccion-t">Impuestos estimados<small>no es declaración</small></h2><div class="tarjeta">' +
      '<div class="fila"><div class="izq t1">IGV de ventas</div><div class="der">' + soles(pl.igv.ventas) + "</div></div>" +
      '<div class="fila"><div class="izq t1">(−) IGV de compras (crédito estimado)</div><div class="der">' + soles(-pl.igv.compras) + "</div></div>" +
      '<div class="fila"><div class="izq t1"><b>IGV por pagar estimado</b></div><div class="der"><b>' + soles(pl.igv.porPagar) + "</b></div></div>" +
      '<div class="fila"><div class="izq t1">Pago a cuenta de renta estimado</div><div class="der">' + soles(pl.renta) + '</div></div><p class="nota">Tasas editables en Más → Supuestos. Validar con el contador.</p></div>';
    if (pl.gastosCategoria && pl.gastosCategoria.length) h += '<h2 class="seccion-t">Gastos por categoría</h2><div class="tarjeta">' + filasBarras(pl.gastosCategoria.map(function (g) { return { k: g.k, v: g.total }; })) + "</div>";
    h += '<div class="tarjeta"><div class="fila"><div class="izq"><div class="t1">Compras del mes</div><div class="t2">Inventario ' + soles(pl.compras.inventario, 0) + " · suministros " + soles(pl.compras.suministros, 0) + '</div></div><div class="der">' + soles(pl.compras.total, 0) + "</div></div>" +
      '<p class="nota">Método de costo: ' + esc({ mixto: "receta cuando existe, si no % estimado", estimado: "% estimado por línea", compras: "compras de inventario del periodo" }[pl.metodoCosto] || pl.metodoCosto) + ".</p></div>";
    return h;
  }

  /* ---------- Gastos ---------- */
  function vGastos(d) {
    var g = d.gastos, h = "";
    h += '<div class="mes-nav"><button data-mes="-1" aria-label="Mes anterior">‹</button><b>' + esc(nombreMes(g.mes)) + '</b><button data-mes="1" aria-label="Mes siguiente">›</button></div>';
    h += '<div class="grid-kpi"><div class="kpi grande"><div class="et">Gastos del mes</div><div class="v num">' + soles(g.totales.total) + '</div><div class="s">Fijos ' + soles(g.totales.fijo, 0) + " · Variables " + soles(g.totales.variable, 0) + (g.totales.porPagar ? " · por pagar " + soles(g.totales.porPagar, 0) : "") + "</div></div></div>";
    if (g.porCategoria.length) h += '<div class="tarjeta">' + filasBarras(g.porCategoria.map(function (x) { return { k: x.k, v: x.monto }; }), g.totales.total) + "</div>";
    h += '<h2 class="seccion-t">Movimientos<small>' + g.lista.length + "</small></h2><div class=\"tarjeta\">";
    if (!g.lista.length) h += '<div class="vacio">Aún no hay gastos este mes. Toca «Registrar gasto».</div>';
    h += g.lista.map(function (x) {
      return '<div class="gasto"><div class="ic" aria-hidden="true">' + esc(x.categoria.charAt(0)) + '</div><div class="izq">' +
        '<div style="display:flex;justify-content:space-between;gap:8px"><span class="t1">' + esc(x.subcategoria || x.categoria) + '</span><b class="num" style="flex:none">' + soles(x.monto) + "</b></div>" +
        '<div class="t2">' + esc(fechaCorta(x.fecha) + " · " + x.categoria + " · " + x.tipo + " · " + (d.catalogos.lineaNombre[x.linea] || x.linea).split(" (")[0] + " · " + x.metodo + (x.proveedor ? " · " + x.proveedor : "")) +
        (x.recurrente || x.plantilla ? ' <span class="etiqueta">mensual</span>' : "") + (x.pagado ? "" : ' <span class="etiqueta mal">por pagar</span>') + "</div>" +
        '<div class="acc"><button class="btn sec chico" data-ed="' + esc(x.id) + '">Editar</button>' + (x.pagado ? "" : '<button class="btn sec chico" data-pag="' + esc(x.id) + '">Pagado</button>') +
        '<button class="btn peligro chico" data-del="' + esc(x.id) + '">Eliminar</button></div></div></div>';
    }).join("") + "</div>";
    if (g.recurrentes.length) h += '<h2 class="seccion-t">Gastos fijos mensuales<small>se copian solos cada mes</small></h2><div class="tarjeta">' + g.recurrentes.map(function (x) {
      return '<div class="fila"><div class="izq"><div class="t1">' + esc(x.subcategoria || x.categoria) + '</div><div class="t2">Día ' + x.dia + " de cada mes</div></div><div class=\"der\">" + soles(x.monto) + "</div></div>"; }).join("") + "</div>";
    return h;
  }
  function ponerFab() {
    var b = document.createElement("button"); b.className = "fab"; b.innerHTML = ico("mas2") + "Registrar gasto"; b.onclick = function () { formGasto(null); };
    document.body.appendChild(b);
  }
  function hoja(titulo, cuerpo, alAbrir) {
    var v = document.createElement("div"); v.className = "velo";
    v.innerHTML = '<div class="hoja" role="dialog" aria-modal="true" aria-label="' + esc(titulo) + '"><div class="asa"></div><h2>' + esc(titulo) + "</h2>" + cuerpo + "</div>";
    v.addEventListener("click", function (ev) { if (ev.target === v) cerrar(); });
    function cerrar() { v.remove(); document.removeEventListener("keydown", tecla); }
    function tecla(ev) { if (ev.key === "Escape") cerrar(); }
    document.addEventListener("keydown", tecla);
    document.body.appendChild(v);
    if (alAbrir) alAbrir(v.querySelector(".hoja"), cerrar);
    var f = v.querySelector("input,select,textarea"); if (f) setTimeout(function () { f.focus(); }, 60);
    return cerrar;
  }
  function opciones(lista, sel, nombres) { return lista.map(function (x) { return '<option value="' + esc(x) + '"' + (x === sel ? " selected" : "") + ">" + esc(nombres ? nombres[x] || x : x) + "</option>"; }).join(""); }
  function formGasto(g) {
    var d = S.datos, cat = d.catalogos, nuevo = !g;
    g = g || { fecha: hoyIso(), categoria: "Servicios", subcategoria: "", tipo: "", linea: "general", monto: "", metodo: "Efectivo", pagado: true, recurrente: false, proveedor: "", comprobante: "", notas: "", vence: "" };
    var cats = Object.keys(cat.categorias), miCid = cid();
    var cuerpo = '<form id="fG"><div class="cats" id="gCats">' + cats.map(function (c) { return '<button type="button" data-c="' + esc(c) + '" class="' + (c === g.categoria ? "on" : "") + '">' + esc(c) + "</button>"; }).join("") + "</div>" +
      '<label class="campo"><span>Concepto</span><select class="inp" id="gSub"></select></label>' +
      '<div class="dos"><label class="campo"><span>Monto (S/)</span><input class="inp num" id="gMonto" inputmode="decimal" required value="' + esc(g.monto) + '" placeholder="0.00"></label>' +
      '<label class="campo"><span>Fecha</span><input class="inp" id="gFecha" type="date" required value="' + esc(g.fecha) + '"></label></div>' +
      '<label class="campo"><span>Tipo</span><div class="seg" id="gTipo"><button type="button" data-v="fijo">Fijo</button><button type="button" data-v="variable">Variable</button></div></label>' +
      '<div class="dos"><label class="campo"><span>Línea de negocio</span><select class="inp" id="gLinea">' + opciones(cat.lineas, g.linea, cat.lineaNombre) + "</select></label>" +
      '<label class="campo"><span>Pagado con</span><select class="inp" id="gMetodo">' + opciones(cat.metodos, g.metodo) + "</select></label></div>" +
      '<label class="check"><input type="checkbox" id="gPagado"' + (g.pagado ? " checked" : "") + "> Ya está pagado</label>" +
      '<label class="campo" id="gVenceC"><span>Vence</span><input class="inp" id="gVence" type="date" value="' + esc(g.vence || "") + '"></label>' +
      '<label class="check"><input type="checkbox" id="gRec"' + (g.recurrente ? " checked" : "") + "> Se repite todos los meses (alquiler, luz, contador…)</label>" +
      '<div class="dos"><label class="campo"><span>Proveedor</span><input class="inp" id="gProv" maxlength="60" value="' + esc(g.proveedor) + '"></label>' +
      '<label class="campo"><span>N.º comprobante</span><input class="inp" id="gComp" maxlength="40" value="' + esc(g.comprobante) + '"></label></div>' +
      '<label class="campo"><span>Notas</span><textarea class="inp" id="gNotas" maxlength="200">' + esc(g.notas) + "</textarea></label>" +
      '<p class="msg-error" id="gErr" role="alert"></p><div class="hoja-acc"><button type="button" class="btn sec" id="gCancel">Cancelar</button><button class="btn" id="gOk">' + (nuevo ? "Guardar gasto" : "Guardar cambios") + "</button></div></form>";
    hoja(nuevo ? "Registrar gasto" : "Editar gasto", cuerpo, function (H, cerrar) {
      var catSel = g.categoria, tipo = g.tipo || "";
      function subs() {
        var l = (cat.categorias[catSel] || []).slice(); if (g.subcategoria && l.indexOf(g.subcategoria) < 0 && catSel === g.categoria) l.unshift(g.subcategoria);
        H.querySelector("#gSub").innerHTML = opciones(l, g.subcategoria);
        if (!tipo || nuevo) { tipo = ["Local", "Servicios", "Administración", "Financieros"].indexOf(catSel) >= 0 ? "fijo" : "variable"; marcarTipo(); }
      }
      function marcarTipo() { Array.prototype.forEach.call(H.querySelectorAll("#gTipo button"), function (b) { b.classList.toggle("on", b.getAttribute("data-v") === tipo); }); }
      function venceVis() { H.querySelector("#gVenceC").classList.toggle("oculto", H.querySelector("#gPagado").checked); }
      H.querySelector("#gCats").onclick = function (ev) { var b = ev.target.closest("button"); if (!b) return; catSel = b.getAttribute("data-c"); Array.prototype.forEach.call(H.querySelectorAll("#gCats button"), function (x) { x.classList.toggle("on", x === b); }); subs(); };
      H.querySelector("#gTipo").onclick = function (ev) { var b = ev.target.closest("button"); if (!b) return; tipo = b.getAttribute("data-v"); marcarTipo(); };
      H.querySelector("#gPagado").onchange = venceVis;
      H.querySelector("#gMetodo").onchange = function () { if (this.value === "Crédito") { H.querySelector("#gPagado").checked = false; venceVis(); } };
      H.querySelector("#gCancel").onclick = cerrar;
      subs(); if (g.tipo) { tipo = g.tipo; marcarTipo(); } venceVis();
      H.querySelector("#fG").onsubmit = function (ev) {
        ev.preventDefault();
        var monto = Number(String(H.querySelector("#gMonto").value).replace(",", "."));
        if (!(monto > 0)) { H.querySelector("#gErr").textContent = "Escribe el monto."; return; }
        var b = H.querySelector("#gOk"); b.disabled = true; b.textContent = "Guardando…";
        var datos = { id: g.id || undefined, cid: nuevo ? miCid : undefined, fecha: H.querySelector("#gFecha").value, categoria: catSel, subcategoria: H.querySelector("#gSub").value, tipo: tipo,
          linea: H.querySelector("#gLinea").value, monto: monto, metodo: H.querySelector("#gMetodo").value, pagado: H.querySelector("#gPagado").checked, vence: H.querySelector("#gPagado").checked ? "" : H.querySelector("#gVence").value,
          recurrente: H.querySelector("#gRec").checked, proveedor: H.querySelector("#gProv").value, comprobante: H.querySelector("#gComp").value, notas: H.querySelector("#gNotas").value };
        api({ accion: "gastoGuardar", gasto: datos }).then(function (r) {
          cerrar(); toast(r.duplicado ? "Ese gasto ya estaba registrado." : "Gasto guardado."); S.mes = datos.fecha.slice(0, 7); cargar(true);
        }).catch(function (e) { b.disabled = false; b.textContent = "Guardar"; H.querySelector("#gErr").textContent = e.message; });
      };
    });
  }

  /* ---------- Caja y bancos ---------- */
  function vCaja(d) {
    var c = d.caja, h = "", s = c.saldos;
    h += '<div class="grid-kpi"><div class="kpi"><div class="et">Caja chica</div><div class="v num ' + (s && s.chica < 0 ? "neg" : "") + '">' + (s ? soles(s.chica) : "—") + '</div><div class="s">' + (s ? (s.abierta ? "Abierta" : "Cerrada") : "Sin datos") + '</div></div><div class="kpi"><div class="et">Caja grande</div><div class="v num">' + (s ? soles(s.grande) : "—") + '</div><div class="s">Efectivo guardado</div></div></div>';
    h += '<h2 class="seccion-t">Conciliación digital<small>' + esc(fechaCorta(c.desde) + " – " + fechaCorta(c.hasta)) + "</small></h2>";
    h += '<p class="nota" style="margin-top:-4px">Escribe lo que realmente llegó (app de Yape/Plin, banco o POS). Diferencia de más de S/ 0.50 queda marcada.</p><div class="tarjeta">';
    if (!c.conciliacion.length) h += '<div class="vacio">No hay cobros digitales en este periodo.</div>';
    var lc = S.concTodo ? c.conciliacion.slice(0, 120) : c.conciliacion.slice(0, 10);
    h += lc.map(function (x) {
      var et = x.estado === "Conciliado" ? "ok" : x.estado === "Con diferencia" ? "mal" : "aviso";
      return '<div class="conc"><div><div class="t1"><b>' + esc(fechaCorta(x.dia)) + "</b> · " + esc(x.metodo) + '</div><div class="t2" style="font-size:12px;color:var(--tinta-3)">Esperado ' + soles(x.esperado) + (x.diferencia != null && x.diferencia !== 0 ? ' · dif. <span class="' + (x.diferencia < 0 ? "neg" : "pos") + '">' + soles(x.diferencia) + "</span>" : "") + '</div></div><span class="etiqueta ' + et + '">' + esc(x.estado) + "</span>" +
        '<div class="in"><input class="inp num" inputmode="decimal" placeholder="Recibido S/" aria-label="Recibido ' + esc(x.metodo + " " + x.dia) + '" value="' + (x.recibido == null ? "" : esc(x.recibido)) + '" data-rec="' + esc(x.id) + '"><button class="btn chico" data-conc="' + esc(x.id) + '">Guardar</button>' +
        (x.recibido == null ? '<button class="btn sec chico" data-igual="' + esc(x.id) + '" data-esp="' + esc(x.esperado) + '">Igual</button>' : "") + "</div></div>";
    }).join("") + (c.conciliacion.length > lc.length ? '<button class="btn sec full" style="margin-top:10px" data-conctodo="1">Ver los ' + c.conciliacion.length + " registros</button>" : "") + "</div>";
    h += '<h2 class="seccion-t">Cobros digitales por día</h2><div class="tarjeta"><div class="tabla-scroll"><table class="tabla"><tr><th>Día (S/)</th><th>Yape/Plin</th><th>Transf.</th><th>Tarjeta</th><th>Total</th></tr>' +
      c.digital.slice(0, 31).map(function (x) { var m = x.metodos; return "<tr><td>" + esc(fechaCorta(x.dia)) + "</td><td>" + corto(n(m.Yape) + n(m.Plin) + n(m["Yape o Plin"])) + "</td><td>" + corto(m.Transferencia || 0) + "</td><td>" + corto(m.Tarjeta || 0) + "</td><td><b>" + corto(x.total) + "</b></td></tr>"; }).join("") +
      "</table></div></div>";
    h += '<h2 class="seccion-t">Flujo de caja<small>12 meses</small></h2><div class="tarjeta">' + gResultado12(c.flujo.map(function (f) { return { mes: f.mes, ventas: f.entradas, resultado: f.neto }; })).replace("Resultado operativo", "Flujo neto").replace(">Ventas<", ">Entradas<") +
      '<div class="tabla-scroll"><table class="tabla"><tr><th>Mes (S/)</th><th>Entradas</th><th>Salidas</th><th>Neto</th><th>Acum.</th></tr>' +
      c.flujo.slice().reverse().map(function (f) { return '<tr title="Compras ' + soles(f.compras, 0) + " · gastos " + soles(f.gastos + f.cajaMenores, 0) + " · planilla " + soles(f.planilla, 0) + '"><td>' + esc(nombreMes(f.mes, true) + " " + f.mes.slice(2, 4)) + "</td><td>" + corto(f.entradas) + "</td><td>" + corto(f.salidas) + '</td><td class="' + (f.neto < 0 ? "neg" : "pos") + '">' + corto(f.neto) + "</td><td>" + corto(f.acumulado) + "</td></tr>"; }).join("") +
      '</table></div><p class="nota">Entradas = lo cobrado (efectivo + digital). Salidas = compras pagadas + gastos pagados + planilla + gastos menores de caja.</p></div>';
    h += '<h2 class="seccion-t">Cierres de caja<small>' + c.cierresConDiferencia + " con diferencia</small></h2><div class=\"tarjeta\">" +
      (c.cierres.length ? c.cierres.slice(0, 20).map(function (x) { return '<div class="fila"><div class="izq"><div class="t1">' + esc(fechaCorta(x.dia) + " · " + x.caja) + '</div><div class="t2">Esperado ' + soles(x.esperado) + " · contado " + soles(x.contado) + (x.responsable ? " · " + esc(x.responsable) : "") + '</div></div><div class="der ' + (Math.abs(x.diferencia) >= 1 ? (x.diferencia < 0 ? "neg" : "pos") : "") + '">' + soles(x.diferencia) + "</div></div>"; }).join("") : '<div class="vacio">Sin cierres en este periodo.</div>') + "</div>";
    return h;
  }

  /* ---------- Pagar / cobrar ---------- */
  function vCuentas(d) {
    var c = d.cuentas, h = "";
    h += '<div class="grid-kpi"><div class="kpi"><div class="et">Por pagar</div><div class="v num neg">' + soles(c.totalPagar, 0) + '</div><div class="s">' + (c.vencidoPagar ? soles(c.vencidoPagar, 0) + " vencido" : "nada vencido") + '</div></div><div class="kpi"><div class="et">Por cobrar</div><div class="v num pos">' + soles(c.totalCobrar, 0) + '</div><div class="s">' + c.cobrar.length + " cuentas</div></div></div>";
    var tramos = function (l) { return l.length ? '<div class="leyenda" style="margin:0 0 8px">' + l.map(function (t) { return "<span><b>" + esc(t.k) + "</b> " + soles(t.monto, 0) + "</span>"; }).join("") + "</div>" : ""; };
    h += '<h2 class="seccion-t">Por pagar</h2><div class="tarjeta">' + tramos(c.tramosPagar) + (c.pagar.length ? c.pagar.map(function (x) {
      return '<div class="fila"><div class="izq"><div class="t1">' + esc(x.concepto) + '</div><div class="t2">' + esc(x.tipo + " " + x.id + " · " + fechaCorta(x.dia)) + (x.vence ? " · vence " + esc(fechaCorta(x.vence)) : "") + " " +
        (x.diasVencido > 0 ? '<span class="etiqueta mal">' + x.diasVencido + " días vencido</span>" : '<span class="etiqueta">' + esc(x.tramo) + "</span>") + '</div></div><div class="der"><b>' + soles(x.saldo) + "</b>" +
        (x.tipo === "Gasto" ? '<br><button class="btn sec chico" style="margin-top:4px" data-pag="' + esc(x.id) + '">Pagado</button>' : "") + "</div></div>";
    }).join("") : '<div class="vacio">No hay deudas pendientes.</div>') + "</div>";
    if (c.proveedores.length) h += '<div class="tarjeta">' + filasBarras(c.proveedores.map(function (p) { return { k: p.k, v: p.saldo, c: "#b6232a" }; })) + '<p class="nota">Las compras a crédito se pagan desde el panel de administración (Compras).</p></div>';
    h += '<h2 class="seccion-t">Por cobrar</h2><div class="tarjeta">' + tramos(c.tramosCobrar) + (c.cobrar.length ? c.cobrar.map(function (x) {
      return '<div class="fila"><div class="izq"><div class="t1">' + esc(x.concepto) + '</div><div class="t2">' + esc(x.tipo + " · " + x.estado + (x.dia ? " · " + fechaCorta(x.dia) : "")) + " · cobrado " + soles(x.cobrado, 0) + " de " + soles(x.total, 0) + '</div></div><div class="der"><b>' + soles(x.saldo) + "</b><br><small>" + esc(x.tramo) + "</small></div></div>";
    }).join("") : '<div class="vacio">Nadie nos debe.</div>') + "</div>";
    if (c.porVerificar.length) h += '<h2 class="seccion-t">Pagos por verificar<small>' + soles(c.porVerificarTotal, 0) + "</small></h2><div class=\"tarjeta\">" + c.porVerificar.map(function (x) {
      return '<div class="fila"><div class="izq"><div class="t1">Pedido ' + esc(x.numero) + '</div><div class="t2">' + esc(fechaCorta(x.dia) + " · " + x.metodo) + '</div></div><div class="der">' + soles(x.monto) + "</div></div>"; }).join("") + "</div>";
    return h;
  }

  /* ---------- Más ---------- */
  function vMas(d) {
    var h = "";
    var item = function (k, ic, t, s) { return '<button class="mas-item" data-mas="' + k + '">' + ico(ic) + "<div><b>" + t + "</b><span>" + s + "</span></div></button>"; };
    h += '<h2 class="seccion-t">Alertas<small>' + d.alertas.length + "</small></h2>" + (d.alertas.length ? d.alertas.map(alertaHtml).join("") : '<div class="tarjeta vacio">Todo en orden.</div>');
    var ind = d.indicadores;
    h += '<h2 class="seccion-t">Indicadores<small>' + esc(nombreMes(ind.mes)) + "</small></h2><div class=\"grid-kpi\">" +
      [["Food cost", pct(ind.foodCostPct), "límite " + ind.umbrales.food + "%"], ["Prime cost", pct(ind.primeCostPct), "costo + planilla"], ["Planilla", pct(ind.planillaPct), "de la venta neta"], ["Margen bruto", pct(ind.margenBrutoPct), "mes pasado " + pct(ind.margenBrutoPctAnterior)]]
        .map(function (x) { return '<div class="kpi"><div class="et">' + x[0] + '</div><div class="v num">' + x[1] + '</div><div class="s">' + x[2] + "</div></div>"; }).join("") + "</div>";
    h += '<div class="tarjeta"><div class="tabla-scroll"><table class="tabla"><tr><th>Línea</th><th>Margen</th><th>Mes ant.</th><th>Costo</th><th>Receta</th></tr>' + ind.porLinea.map(function (l) {
      return "<tr><td>" + esc(l.nombre.split(" (")[0]) + "</td><td>" + pct(l.margenPct) + "</td><td>" + pct(l.margenPctAnterior) + "</td><td>" + pct(l.costoPct) + "</td><td>" + pct(l.cobertura) + "</td></tr>"; }).join("") + "</table></div></div>";
    h += '<h2 class="seccion-t">Administrar</h2>';
    h += item("personal", "persona", "Personal y planilla", "Costo mensual: " + soles(d.personal.total, 0) + " · " + d.personal.personas.length + " personas");
    h += item("supuestos", "ajustes", "Supuestos", (d.revisado ? "Revisados" : "Por revisar") + " · IGV, % de costo, comisiones, beneficios");
    h += item("lineas", "mapa", "Líneas de negocio", "Qué sección o producto va a cada línea");
    h += item("exportar", "bajar", "Exportar para el contador", "CSV de ventas, resultados, gastos, compras, planilla…");
    h += item("clave", "llave", "Cambiar contraseña", "Cierra las demás sesiones");
    h += item("salir", "salir", "Cerrar sesión", "Borra los datos guardados en este teléfono");
    return h;
  }
  function vPersonal() {
    var d = S.datos, P = d.personal, cat = d.catalogos;
    var cuerpo = '<p class="nota" style="margin-top:-8px">' + esc(nombreMes(d.pl.mes)) + " · " + (P.fuente === "Turnos" ? "Calculado con Turnos × pago por hora (agrega personas para afinar)." : "Mensual/semanal: monto fijo. Diario y por hora: días u horas reales de Turnos si la persona está vinculada.") + "</p>" +
      '<div class="tarjeta">' + (P.personas.length ? P.personas.map(function (p) {
        return '<div class="fila"><div class="izq"><div class="t1">' + esc(p.persona) + '</div><div class="t2">' + esc((p.cargo ? p.cargo + " · " : "") + (cat.lineaNombre[p.linea] || p.linea).split(" (")[0] + " · " + p.modalidad + " " + soles(p.monto) + (p.modalidad === "hora" || p.modalidad === "diario" ? " × " + p.cantidad + (p.modalidad === "hora" ? " h" : " días") + (p.fuente === "turnos" ? " (turnos)" : " (estimado)") : "") + (p.beneficios ? " + beneficios " + p.beneficiosPct + "%" : "")) +
          "</div>" + (String(p.id).indexOf("T-") === 0 ? "" : '<div class="acc" style="display:flex;gap:6px;margin-top:6px"><button class="btn sec chico" data-ped="' + esc(p.id) + '">Editar</button><button class="btn peligro chico" data-pbaja="' + esc(p.id) + '">Quitar</button></div>') + '</div><div class="der"><b>' + soles(p.total, 0) + "</b></div></div>";
      }).join("") : '<div class="vacio">Sin personas registradas.</div>') + '<div class="fila"><div class="izq t1"><b>Total del mes</b></div><div class="der"><b>' + soles(P.total) + "</b></div></div></div>" +
      '<button class="btn full" id="pNueva">Agregar persona</button>';
    hoja("Personal y planilla", cuerpo, function (H, cerrar) {
      H.querySelector("#pNueva").onclick = function () { cerrar(); formPersona(null); };
      H.onclick = function (ev) {
        var b = ev.target.closest("button"); if (!b) return;
        var id = b.getAttribute("data-ped") || b.getAttribute("data-pbaja"); if (!id) return;
        var p = P.personas.filter(function (x) { return x.id === id; })[0];
        if (b.hasAttribute("data-ped")) { cerrar(); formPersona(p); return; }
        if (!confirm("¿Quitar a " + p.persona + " de la planilla?")) return;
        api({ accion: "personalBaja", id: id }).then(function () { cerrar(); toast("Listo."); cargar(true); }).catch(function (e) { toast(e.message, true); });
      };
    });
  }
  function formPersona(p) {
    var d = S.datos, cat = d.catalogos; p = p || { persona: "", cargo: "", linea: "restaurante", modalidad: "mensual", monto: "", beneficiosPct: "", horas_mes: "", dias_mes: "", persona_id: "", desde: "", hasta: "", notas: "" };
    var eq = d.personasEquipo || [];
    var cuerpo = '<form id="fP"><label class="campo"><span>Nombre</span><input class="inp" id="pN" required maxlength="60" value="' + esc(p.persona) + '"></label>' +
      '<div class="dos"><label class="campo"><span>Cargo</span><input class="inp" id="pC" maxlength="40" value="' + esc(p.cargo) + '"></label><label class="campo"><span>Línea</span><select class="inp" id="pL">' + opciones(cat.lineas, p.linea, cat.lineaNombre) + "</select></label></div>" +
      '<div class="dos"><label class="campo"><span>Se le paga</span><select class="inp" id="pM">' + opciones(cat.modalidades, p.modalidad, { mensual: "Mensual", semanal: "Semanal", diario: "Por día", hora: "Por hora" }) + '</select></label><label class="campo"><span>Monto (S/)</span><input class="inp num" id="pMo" inputmode="decimal" required value="' + esc(p.monto) + '"></label></div>' +
      '<label class="campo"><span>Vincular con el equipo (horas reales de Turnos)</span><select class="inp" id="pE"><option value="">— Sin vincular —</option>' + eq.map(function (m) { return '<option value="' + esc(m.id) + '"' + (m.id === p.persona_id ? " selected" : "") + ">" + esc(m.nombre + " (" + m.rol + ")") + "</option>"; }).join("") + "</select></label>" +
      '<div class="dos"><label class="campo"><span>Horas al mes (si no hay turnos)</span><input class="inp num" id="pH" inputmode="decimal" value="' + esc(p.horas_mes || "") + '"></label><label class="campo"><span>Días al mes (si no hay turnos)</span><input class="inp num" id="pD" inputmode="numeric" value="' + esc(p.dias_mes || "") + '"></label></div>' +
      '<label class="campo"><span>Beneficios y aportes % (vacío = el general)</span><input class="inp num" id="pB" inputmode="decimal" value="' + esc(p.beneficiosPct === "" || p.beneficiosPct == null ? "" : p.beneficiosPct) + '"></label>' +
      '<div class="dos"><label class="campo"><span>Desde</span><input class="inp" type="date" id="pDe" value="' + esc(p.desde || "") + '"></label><label class="campo"><span>Hasta</span><input class="inp" type="date" id="pHa" value="' + esc(p.hasta || "") + '"></label></div>' +
      '<p class="msg-error" id="pErr" role="alert"></p><div class="hoja-acc"><button type="button" class="btn sec" id="pX">Cancelar</button><button class="btn" id="pOk">Guardar</button></div></form>';
    hoja(p.id ? "Editar persona" : "Agregar persona", cuerpo, function (H, cerrar) {
      H.querySelector("#pX").onclick = cerrar;
      H.querySelector("#fP").onsubmit = function (ev) {
        ev.preventDefault(); var b = H.querySelector("#pOk"); b.disabled = true;
        var v = function (id) { return H.querySelector(id).value; };
        api({ accion: "personalGuardar", persona: { id: p.id, persona: v("#pN"), cargo: v("#pC"), linea: v("#pL"), modalidad: v("#pM"), monto: v("#pMo").replace(",", "."), persona_id: v("#pE"),
          horas_mes: v("#pH"), dias_mes: v("#pD"), beneficios_pct: v("#pB").replace(",", "."), desde: v("#pDe"), hasta: v("#pHa") } })
          .then(function () { cerrar(); toast("Guardado."); cargar(true); })
          .catch(function (e) { b.disabled = false; H.querySelector("#pErr").textContent = e.message; });
      };
    });
  }
  function vSupuestos() {
    var d = S.datos;
    var nombres = { revisado: "Supuestos revisados (SI/NO)", costo_metodo: "Método de costo (mixto/estimado/compras)" };
    var cuerpo = '<p class="nota" style="margin-top:-8px">Cambia un valor y toca Guardar. Los marcados REFERENCIA son del sector: pon tus números reales.</p>' + d.supuestos.map(function (s) {
      return '<div class="tarjeta" style="padding:12px"><label class="campo" style="margin:0"><span>' + esc(nombres[s.clave] || s.clave.replace(/_/g, " ")) + '</span><div style="display:flex;gap:8px"><input class="inp" data-sup="' + esc(s.clave) + '" value="' + esc(s.valor) + '"><button type="button" class="btn chico" data-gsup="' + esc(s.clave) + '">Guardar</button></div></label><p class="nota">' + esc(s.notas) + "</p></div>";
    }).join("");
    hoja("Supuestos", cuerpo, function (H) {
      H.onclick = function (ev) {
        var b = ev.target.closest("[data-gsup]"); if (!b) return; var k = b.getAttribute("data-gsup"), inp = H.querySelector('[data-sup="' + k + '"]');
        b.disabled = true;
        api({ accion: "supuestoGuardar", clave: k, valor: inp.value.replace(",", ".") }).then(function () { b.disabled = false; toast("Guardado. Recalculando…"); cargar(true); }).catch(function (e) { b.disabled = false; toast(e.message, true); });
      };
    });
  }
  function vLineas() {
    var d = S.datos, cat = d.catalogos, ls = cat.lineas.filter(function (l) { return l !== "general"; });
    var cuerpo = '<p class="nota" style="margin-top:-8px">Cada sección de la carta (y los encargos) suma a una línea. Para un producto puntual (p. ej. un importado dentro de Tienda), agrégalo abajo con su código.</p><div class="tarjeta">' +
      d.lineasMapa.map(function (r, i) { return '<div class="fila"><div class="izq"><div class="t1">' + esc(r.clave) + '</div><div class="t2">' + esc(r.tipo) + '</div></div><select class="inp" style="width:56%;min-height:40px" data-lin="' + i + '">' + opciones(ls, r.linea, cat.lineaNombre) + "</select></div>"; }).join("") + "</div>" +
      '<div class="tarjeta"><b>Producto puntual</b><div class="dos" style="margin-top:8px"><input class="inp" id="lpId" placeholder="Código del producto"><select class="inp" id="lpL">' + opciones(ls, "importados", cat.lineaNombre) + '</select></div><button type="button" class="btn full" style="margin-top:10px" id="lpOk">Agregar</button></div>';
    hoja("Líneas de negocio", cuerpo, function (H, cerrar) {
      H.onchange = function (ev) {
        var s = ev.target.closest("[data-lin]"); if (!s) return; var r = d.lineasMapa[+s.getAttribute("data-lin")];
        api({ accion: "lineaGuardar", tipo: r.tipo, clave: r.clave, linea: s.value }).then(function () { toast("Guardado. Recalculando…"); cargar(true); }).catch(function (e) { toast(e.message, true); });
      };
      H.querySelector("#lpOk").onclick = function () {
        api({ accion: "lineaGuardar", tipo: "producto", clave: H.querySelector("#lpId").value, linea: H.querySelector("#lpL").value }).then(function () { cerrar(); toast("Agregado."); cargar(true); }).catch(function (e) { toast(e.message, true); });
      };
    });
  }
  var TABLAS = [["ventas_dia", "Ventas por día", "del periodo elegido"], ["resultados", "Estado de resultados", "del mes de Resultados"], ["gastos", "Gastos", "del periodo"], ["compras", "Compras", "del periodo"],
    ["planilla", "Planilla", "del mes"], ["flujo", "Flujo de caja", "12 meses"], ["por_pagar", "Cuentas por pagar", "hoy"], ["por_cobrar", "Cuentas por cobrar", "hoy"], ["conciliacion", "Conciliación digital", "del periodo"]];
  function vExportar() {
    var cuerpo = '<p class="nota" style="margin-top:-8px">Archivos CSV que abren en Excel. Periodo: ' + esc(S.datos.periodo.etiqueta) + " · mes: " + esc(nombreMes(S.datos.pl.mes)) + ".</p>" +
      TABLAS.map(function (t) { return '<button class="mas-item" data-csv="' + t[0] + '">' + ico("bajar") + "<div><b>" + t[1] + "</b><span>" + t[2] + "</span></div></button>"; }).join("");
    hoja("Exportar", cuerpo, function (H) {
      H.onclick = function (ev) {
        var b = ev.target.closest("[data-csv]"); if (!b) return; b.disabled = true;
        var p = S.periodo;
        api({ accion: "exportar", tabla: b.getAttribute("data-csv"), periodo: p.periodo, desde: p.desde, hasta: p.hasta, mes: S.datos.pl.mes }).then(function (r) {
          b.disabled = false;
          var url = URL.createObjectURL(new Blob([r.csv], { type: "text/csv;charset=utf-8" })), a = document.createElement("a");
          a.href = url; a.download = r.nombre; document.body.appendChild(a); a.click(); a.remove(); setTimeout(function () { URL.revokeObjectURL(url); }, 2000);
        }).catch(function (e) { b.disabled = false; toast(e.message, true); });
      };
    });
  }
  function vClave() {
    var cuerpo = '<form id="fC"><label class="campo"><span>Contraseña actual</span><input class="inp" type="password" id="cA" required autocomplete="current-password"></label>' +
      '<label class="campo"><span>Nueva (mínimo 10 caracteres)</span><input class="inp" type="password" id="cN" required minlength="10" autocomplete="new-password"></label>' +
      '<label class="campo"><span>Repite la nueva</span><input class="inp" type="password" id="cR" required minlength="10" autocomplete="new-password"></label>' +
      '<p class="msg-error" id="cErr" role="alert"></p><div class="hoja-acc"><button class="btn" id="cOk">Cambiar</button></div></form>';
    hoja("Cambiar contraseña", cuerpo, function (H, cerrar) {
      H.querySelector("#fC").onsubmit = function (ev) {
        ev.preventDefault(); var e = H.querySelector("#cErr");
        if (H.querySelector("#cN").value !== H.querySelector("#cR").value) { e.textContent = "Las contraseñas nuevas no coinciden."; return; }
        api({ accion: "cambiarClave", actual: H.querySelector("#cA").value, nueva: H.querySelector("#cN").value }).then(function (r) {
          S.token = r.token; guardar(K_TOKEN, r.token); cerrar(); toast("Contraseña cambiada.");
        }).catch(function (x) { e.textContent = x.message; });
      };
    });
  }
  function abrirRango() {
    var p = S.periodo, h0 = hoyIso();
    var cuerpo = '<form id="fR"><div class="dos"><label class="campo"><span>Desde</span><input class="inp" type="date" id="rD" required value="' + esc(p.desde || h0.slice(0, 8) + "01") + '" max="' + h0 + '"></label><label class="campo"><span>Hasta</span><input class="inp" type="date" id="rH" required value="' + esc(p.hasta || h0) + '" max="' + h0 + '"></label></div><div class="hoja-acc"><button class="btn">Ver</button></div></form>';
    hoja("Elegir fechas", cuerpo, function (H, cerrar) {
      H.querySelector("#fR").onsubmit = function (ev) { ev.preventDefault(); S.periodo = { periodo: "rango", desde: H.querySelector("#rD").value, hasta: H.querySelector("#rH").value }; guardar(K_PER, S.periodo); cerrar(); S.datos = null; cargar(); };
    });
  }

  /* ---------- eventos del contenido ---------- */
  function enlazar(main) {
    main.onclick = function (ev) {
      var b = ev.target.closest("button"); if (!b) return;
      if (b.hasAttribute("data-mes")) {
        var m = mesSuma(S.mes || S.datos.pl.mes, +b.getAttribute("data-mes")); if (m > hoyIso().slice(0, 7)) return;
        S.mes = m; cargar(); return;
      }
      if (b.hasAttribute("data-conctodo")) { S.concTodo = true; pintar(); return; }
      if (b.hasAttribute("data-lpl")) { S.lineaPL = b.getAttribute("data-lpl"); pintar(); return; }
      if (b.hasAttribute("data-ir")) { S.tab = "mas"; pintar(); window.scrollTo(0, 0); return; }
      if (b.hasAttribute("data-ed")) { var g = S.datos.gastos.lista.filter(function (x) { return x.id === b.getAttribute("data-ed"); })[0]; if (g) formGasto(g); return; }
      if (b.hasAttribute("data-pag")) { b.disabled = true; api({ accion: "gastoPagado", id: b.getAttribute("data-pag") }).then(function () { toast("Marcado como pagado."); cargar(true); }).catch(function (e) { b.disabled = false; toast(e.message, true); }); return; }
      if (b.hasAttribute("data-del")) {
        if (!confirm("¿Eliminar este gasto? Si se repite cada mes, dejará de repetirse.")) return;
        api({ accion: "gastoEliminar", id: b.getAttribute("data-del") }).then(function () { toast("Gasto eliminado."); cargar(true); }).catch(function (e) { toast(e.message, true); }); return;
      }
      if (b.hasAttribute("data-igual")) { var inp0 = main.querySelector('[data-rec="' + b.getAttribute("data-igual") + '"]'); inp0.value = b.getAttribute("data-esp"); }
      if (b.hasAttribute("data-conc") || b.hasAttribute("data-igual")) {
        var id = b.getAttribute("data-conc") || b.getAttribute("data-igual"), inp = main.querySelector('[data-rec="' + id + '"]'), pr = id.split("|");
        b.disabled = true;
        api({ accion: "conciliar", dia: pr[0], metodo: pr[1], recibido: inp.value.replace(",", ".") }).then(function (r) { toast(r.estado + "."); cargar(true); }).catch(function (e) { b.disabled = false; toast(e.message, true); });
        return;
      }
      var mas = b.getAttribute("data-mas");
      if (mas === "personal") vPersonal(); else if (mas === "supuestos") vSupuestos(); else if (mas === "lineas") vLineas(); else if (mas === "exportar") vExportar(); else if (mas === "clave") vClave();
      else if (mas === "salir") { if (confirm("¿Cerrar sesión en este teléfono?")) salir(false); }
    };
  }

  /* renovar la sesión si la app queda abierta mucho rato */
  setInterval(function () { if (S.token && document.visibilityState === "visible") api({ accion: "renovar" }).catch(function () {}); }, 3 * 3600 * 1000);
  document.addEventListener("visibilitychange", function () { if (document.visibilityState === "visible" && S.token && S.datos && Date.now() - Date.parse(S.datos.generado) > 5 * 60000) cargar(); });

  if (!API) { app.innerHTML = '<div class="login"><div class="login-caja"><h1>Finanzas</h1><p>No se pudo leer la dirección del servidor. Recarga la página.</p></div></div>'; return; }
  if (S.token) iniciar(); else pintarLogin();
})();
