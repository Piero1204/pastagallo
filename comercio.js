/* Pasta Gallo · módulo Comercio (lado cliente). Solo se carga si la carta trae CARTA.ext.comercio (módulo encendido en el panel).
   Lo que hace: catálogo por horario (ordena y avisa; no oculta), QR de barra (?origen=barra), horas programadas configurables con cupo, aviso de cierre de cocina,
   botón de reseña y sesión de mesa. pedido.js lo consulta por window.PG_COMERCIO en pocos puntos; si este archivo no está, todo sigue igual. */
(function () {
  "use strict";
  var C = window.CARTA, X = C && C.ext && C.ext.comercio;
  if (!X) return;
  var MODO = window.MODO === "mesa" ? "mesa" : "delivery";
  var API = (C.pedidos && C.pedidos.api) || "";
  var params = new URLSearchParams(location.search);
  var PGM = window.PG_MESA || null;
  var MESA = MODO === "mesa" ? String(PGM ? PGM.m : (params.get("m") || "")).slice(0, 6) : "";
  var CODIGO = MODO === "mesa" ? String(PGM ? PGM.c : (params.get("c") || "")).slice(0, 20) : "";

  /* ---------- hora del local ---------- */
  var MAPA_DIA = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
  function ahora(fecha) {
    var f = fecha || new Date();
    try {
      var fm = new Intl.DateTimeFormat("en-US", { timeZone: (C.horario && C.horario.zona) || "America/Lima", weekday: "short", hour: "2-digit", minute: "2-digit", hourCycle: "h23", year: "numeric", month: "2-digit", day: "2-digit" });
      var o = {}; fm.formatToParts(f).forEach(function (x) { o[x.type] = x.value; });
      return { dia: MAPA_DIA[o.weekday], min: (+o.hour % 24) * 60 + (+o.minute), fecha: o.year + "-" + o.month + "-" + o.day };
    } catch (e) {
      var p2 = function (n) { return ("0" + n).slice(-2); };
      return { dia: f.getDay(), min: f.getHours() * 60 + f.getMinutes(), fecha: f.getFullYear() + "-" + p2(f.getMonth() + 1) + "-" + p2(f.getDate()) };
    }
  }
  function minutos(hhmm) { var p = String(hhmm).split(":"); return (+p[0]) * 60 + (+p[1]); }
  function hhmm(m) { m = ((m % 1440) + 1440) % 1440; return ("0" + Math.floor(m / 60)).slice(-2) + ":" + ("0" + (m % 60)).slice(-2); }
  function fmt12(m) { m = ((m % 1440) + 1440) % 1440; var h = Math.floor(m / 60), mm = ("0" + (m % 60)).slice(-2); return (h % 12 || 12) + ":" + mm + " " + (h >= 12 ? "pm" : "am"); }
  function sumaDias(iso, n) {
    var p = iso.split("-"), d = new Date(Date.UTC(+p[0], +p[1] - 1, +p[2] + n)), p2 = function (x) { return ("0" + x).slice(-2); };
    return d.getUTCFullYear() + "-" + p2(d.getUTCMonth() + 1) + "-" + p2(d.getUTCDate());
  }
  var NOMBRE_DIA = ["dom", "lun", "mar", "mié", "jue", "vie", "sáb"];

  /* ---------- catálogo por horario (misma regla que el servidor) ---------- */
  /* reg = { h: [["12:00","16:00"], ...], d: [días] | ausente }. Un rango que cruza la medianoche (22:00-02:00) es del día en que EMPIEZA. */
  /* Una regla puede ser un objeto {h,d} o un ARRAY de objetos (la tienda tiene horario distinto por día): cumplir cualquiera = disponible. */
  function disponibleReg(reg, dia, min) {
    if (!reg) return true;
    if (Array.isArray(reg)) { if (!reg.length) return true; for (var k = 0; k < reg.length; k++) if (disponibleReg(reg[k], dia, min)) return true; return false; }
    var h = reg.h || [], d = reg.d;
    var diaOk = function (x) { return !d || d.indexOf(x) >= 0; };
    if (!h.length) return diaOk(dia);
    for (var i = 0; i < h.length; i++) {
      var a = minutos(h[i][0]), b = minutos(h[i][1]);
      if (b > a) { if (min >= a && min < b && diaOk(dia)) return true; }
      else if ((min >= a && diaOk(dia)) || (min < b && diaOk((dia + 6) % 7))) return true;
    }
    return false;
  }
  function tr(k, v, def) { try { var r = window.PG_I18N && window.PG_I18N.t(k, v); if (r && r !== k) return r; } catch (e) {} return def; }
  var EN = !!(window.PG_I18N && window.PG_I18N.lang === "en");
  function cuando(reg) {
    if (Array.isArray(reg)) return reg.map(cuando).join(EN ? "; " : "; ");
    var t = (reg.h && reg.h.length)
      ? (EN ? "from " : "de ") + reg.h.map(function (x) { return fmt12(minutos(x[0])) + (EN ? " to " : " a ") + fmt12(minutos(x[1])); }).join(EN ? " and from " : " y de ")
      : (EN ? "all day" : "todo el día");
    if (reg.d) t += " (" + reg.d.map(function (x) { return EN ? ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"][x] : NOMBRE_DIA[x]; }).join(", ") + ")";
    return t;
  }
  function disponible(id, secId, dia, min) {
    return disponibleReg((X.p || {})[id], dia, min) && disponibleReg((X.s || {})[secId], dia, min);
  }
  /** Reglas de horario que aplican a un producto (la suya y la de su sección). */
  function regsDe(it, sec) {
    var r = [], rp = (X.p || {})[it.id], rs = sec && (X.s || {})[sec.id];
    if (rp) r.push(rp); if (rs) r.push(rs);
    return r;
  }
  function fuera(it, sec) {
    if (!it || it.tipo === "salsa") return false;
    var ah = ahora();
    return !disponible(it.id, sec && sec.id, ah.dia, ah.min);
  }
  /** Próximo inicio de una regla: { dias: 0..7, min: minutos | null (todo el día), dia } o null. */
  function proxima(reg, dia, min) {
    if (Array.isArray(reg)) {
      var mejorR = null;
      reg.forEach(function (r) {
        var p = proxima(r, dia, min); if (!p) return;
        if (!mejorR || p.dias < mejorR.dias || (p.dias === mejorR.dias && (p.min == null ? -1 : p.min) < (mejorR.min == null ? -1 : mejorR.min))) mejorR = p;
      });
      return mejorR;
    }
    var h = reg.h || [];
    for (var i = 0; i <= 7; i++) {
      var d = (dia + i) % 7;
      if (reg.d && reg.d.indexOf(d) < 0) continue;
      if (!h.length) { if (i > 0) return { dias: i, min: null, dia: d }; continue; }
      var mejor = null;
      h.forEach(function (x) { var a = minutos(x[0]); if ((i > 0 || a > min) && (mejor == null || a < mejor)) mejor = a; });
      if (mejor != null) return { dias: i, min: mejor, dia: d };
    }
    return null;
  }
  /** "Disponible a partir de las 6:00 pm" / "Disponible mañana desde las 6:00 pm" / "Disponible el jueves desde las 6:00 pm". */
  function textoDesde(reg) {
    var ah = ahora(), p = proxima(reg, ah.dia, ah.min);
    if (!p) return tr("hrNo", null, "No disponible por ahora");
    var dias = tr("dias", null, null) || ["domingo", "lunes", "martes", "miércoles", "jueves", "viernes", "sábado"];
    var hh = p.min == null ? "" : fmt12(p.min);
    if (p.dias === 0) return tr("hrHoy", { h: hh }, "Disponible a partir de las " + hh);
    if (p.dias === 1) return hh ? tr("hrManana", { h: hh }, "Disponible mañana desde las " + hh) : tr("hrMananaSin", null, "Disponible mañana");
    return hh ? tr("hrDia", { d: dias[p.dia], h: hh }, "Disponible el " + dias[p.dia] + " desde las " + hh) : tr("hrDiaSin", { d: dias[p.dia] }, "Disponible el " + dias[p.dia]);
  }
  /** Aviso para la tarjeta ("" si se puede pedir ahora). */
  function aviso(it, sec) {
    if (!fuera(it, sec)) return "";
    var ah = ahora(), r = regsDe(it, sec).filter(function (x) { return !disponibleReg(x, ah.dia, ah.min); })[0];
    return r ? textoDesde(r) : "";
  }
  /** Aviso para la TARJETA del producto: solo si el producto tiene un horario propio que DIFIERE del de su sección
      (si toda la sección comparte horario, el aviso va solo en la cabecera de la sección). */
  function avisoProd(it, sec) {
    if (!it || it.tipo === "salsa") return "";
    var rp = (X.p || {})[it.id], rs = sec && (X.s || {})[sec.id];
    if (!rp) return "";
    if (rs && JSON.stringify(rp) === JSON.stringify(rs)) return "";
    var ah = ahora();
    return disponibleReg(rp, ah.dia, ah.min) ? "" : textoDesde(rp);
  }
  /** Aviso para la cabecera de la sección: su propio horario, o el del primer producto si todos están fuera de hora. */
  function avisoSec(sec) {
    var ah = ahora(), rs = (X.s || {})[sec.id];
    if (rs && !disponibleReg(rs, ah.dia, ah.min)) return textoDesde(rs);
    var its = [];
    (sec.grupos || []).forEach(function (g) { (g.items || []).forEach(function (i) { if (i.tipo !== "salsa") its.push(i); }); });
    if (!its.length || !its.every(function (i) { return fuera(i, sec); })) return "";
    return aviso(its[0], sec);
  }
  /** Reparto de la carta: en delivery se conserva TODO (el cliente puede programar), lo disponible ahora va primero y lo demás
      después en su orden original. En mesa se quita lo que no se puede pedir ahora (se pide en el momento). */
  function filtrarCarta() {
    if (!X.p && !X.s) return;
    var ah = ahora();
    if (MODO === "mesa") {
      C.secciones = (C.secciones || []).filter(function (s) {
        s.grupos = (s.grupos || []).filter(function (g) {
          g.items = (g.items || []).filter(function (it) { return it.tipo === "salsa" || disponible(it.id, s.id, ah.dia, ah.min); });
          return g.items.length;
        });
        return s.grupos.length;
      });
      return;
    }
    var particion = function (arr, ok) { return arr.filter(ok).concat(arr.filter(function (x) { return !ok(x); })); };
    (C.secciones || []).forEach(function (s) {
      (s.grupos || []).forEach(function (g) { g.items = particion(g.items || [], function (it) { return it.tipo === "salsa" || disponible(it.id, s.id, ah.dia, ah.min); }); });
    });
    var ahoraSec = function (s) {
      if (!disponibleReg((X.s || {})[s.id], ah.dia, ah.min)) return false;
      var hay = false, algo = false;
      (s.grupos || []).forEach(function (g) { (g.items || []).forEach(function (it) { if (it.tipo === "salsa") return; hay = true; if (disponible(it.id, s.id, ah.dia, ah.min)) algo = true; }); });
      return !hay || algo;
    };
    C.secciones = particion(C.secciones || [], ahoraSec);
  }
  /** Productos del pedido que no se pueden pedir para esa hora. cuando = null (ahora) o { dia, min }. Devuelve [{ it, sec, solo }]. */
  function revisar(entradas, cuandoPed) {
    var ah = cuandoPed || ahora(), mal = [], vistos = {};
    (entradas || []).forEach(function (e) {
      if (!e || !e.it || e.it.tipo === "salsa" || vistos[e.it.id]) return;
      if (disponible(e.it.id, e.sec && e.sec.id, ah.dia, ah.min)) return;
      vistos[e.it.id] = 1;
      var r = regsDe(e.it, e.sec).filter(function (x) { return !disponibleReg(x, ah.dia, ah.min); })[0];
      mal.push({ it: e.it, sec: e.sec, solo: r ? cuando(r) : "", desde: r ? textoDesde(r) : "" });
    });
    return mal;
  }
  /** Solo en mesa: mensaje si el producto no se puede pedir ahora; "" si sí. En delivery nunca bloquea (se valida al enviar). */
  function motivo(it, sec) {
    if (MODO !== "mesa" || !it || it.tipo === "salsa") return "";
    var ah = ahora(), rp = (X.p || {})[it.id], rs = sec && (X.s || {})[sec.id];
    if (rp && !disponibleReg(rp, ah.dia, ah.min)) return (EN ? "Only " : "Solo ") + cuando(rp);
    if (rs && !disponibleReg(rs, ah.dia, ah.min)) return (EN ? "Not available now: " : "No disponible ahora: ") + cuando(rs);
    return "";
  }

  /* ---------- QR de barra ---------- */
  var BARRA = false;
  if (X.barra && MODO !== "mesa") {
    var o = (params.get("origen") || "").toLowerCase();
    try { if (o === "barra") sessionStorage.setItem("pg-origen", "barra"); BARRA = sessionStorage.getItem("pg-origen") === "barra"; } catch (e) { BARRA = o === "barra"; }
  }

  /* ---------- horas programadas (intervalo, anticipación y cupo configurables) ---------- */
  var cupos = {};   // fecha -> { t, usados }
  function ventana(tr) {
    if (!X.prog || !C.horario) return null;
    var dias = C.horario.dias || {}, ah = ahora(), paso = X.prog.paso || 15, ant = X.prog.ant;
    if (ant == null) ant = 30;
    for (var i = 0; i <= 7; i++) {
      var d = (ah.dia + i) % 7, r = dias[d]; if (!r) continue;
      var a = minutos(r[0]), c = minutos(r[1]); if (c <= a) c += 1440;
      var hasta = Math.floor((c - paso) / paso) * paso, desde = Math.ceil(a / paso) * paso;
      if (i === 0) {
        var ya = ah.min; if (c > 1440 && ya < a) ya += 1440;
        if (ya >= c - paso) continue;
        desde = Math.max(desde, Math.ceil((ya + ant) / paso) * paso);
      }
      if (desde > hasta) continue;
      var etq = i === 0 ? tr("hoy").toLowerCase() : i === 1 ? tr("manana").trim().replace(/,$/, "").toLowerCase() : tr("el") + tr("dias")[d];
      return { dias: i, dia: d, a: a, c: c, desde: desde, hasta: hasta, etiqueta: etq.trim(), paso: paso, fecha: sumaDias(ah.fecha, i) };
    }
    return null;
  }
  function cuposDe(fecha, cb) {
    var k = cupos[fecha];
    if (k && Date.now() - k.t < 20000) { if (cb) cb(k.usados); return k.usados; }
    if (!API || !(X.prog && X.prog.cupo > 0)) return null;
    try {
      fetch(API + "?ext=comercio&q=cupos&f=" + encodeURIComponent(fecha)).then(function (r) { return r.json(); }).then(function (r) {
        if (r && r.ok) { cupos[fecha] = { t: Date.now(), usados: r.usados || {} }; if (cb) cb(r.usados || {}); }
      }).catch(function () {});
    } catch (e) {}
    return k ? k.usados : null;
  }
  function llena(usados, valor) { return !!(usados && X.prog && X.prog.cupo > 0 && (usados[valor] || 0) >= X.prog.cupo); }
  /** Quita las horas que ya no tienen cupo. Si aún no se sabe, las quita en cuanto llegue la respuesta del servidor. */
  function filtrarHoras(horas, vent) {
    if (!vent || !vent.fecha || !(X.prog && X.prog.cupo > 0)) return horas;
    var u = cuposDe(vent.fecha, function (usados) {
      var s = document.querySelector("select[name=programado]"); if (!s) return;
      [].slice.call(s.options).forEach(function (op) { if (op.value && !op.selected && llena(usados, op.value)) op.parentNode.removeChild(op); });
    });
    return horas.filter(function (x, i) { return i === 0 || !llena(u, x.valor); });
  }

  /* ---------- sesión de mesa (revocación al cerrarse la cuenta) ---------- */
  var CLAVE_SES = "pg-cx-ses-" + MESA;
  function sesion() { try { return sessionStorage.getItem(CLAVE_SES) || ""; } catch (e) { return ""; } }
  function iniciarSesionMesa() {
    if (MODO !== "mesa" || !X.mesaRevocar || !API || !MESA || !CODIGO) return;
    var s = sesion();
    fetch(API + "?ext=comercio&q=sesion&m=" + encodeURIComponent(MESA) + "&cod=" + encodeURIComponent(CODIGO) + (s ? "&s=" + encodeURIComponent(s) : ""))
      .then(function (r) { return r.json(); }).then(function (r) {
        if (r && r.ok && (!s || r.cerrada)) { try { sessionStorage.setItem(CLAVE_SES, String(r.t)); } catch (e) {} }
      }).catch(function () {});
  }

  /* ---------- aviso de cierre de cocina ---------- */
  function minutosParaCerrar() {
    var ah = ahora(), r = C.horario && C.horario.dias && C.horario.dias[ah.dia]; if (!r) return null;
    var a = minutos(r[0]), c = minutos(r[1]);
    if (c <= a) return ah.min >= a ? c + 1440 - ah.min : ah.min < c ? c - ah.min : null;
    return ah.min >= a && ah.min < c ? c - ah.min : null;
  }
  var franjaAviso = null, cerradoAviso = false;
  function pintarAviso() {
    if (!X.avisoCocina || cerradoAviso) return;
    var m = minutosParaCerrar();
    var ver = m != null && m <= X.avisoCocina;
    if (!ver) { if (franjaAviso) franjaAviso.style.display = "none"; return; }
    var ah = ahora(), cierraA = fmt12(ah.min + m);
    if (!franjaAviso) {
      franjaAviso = document.createElement("div");
      franjaAviso.setAttribute("role", "status"); franjaAviso.setAttribute("aria-live", "polite");
      franjaAviso.style.cssText = "background:#a9803f;color:#fff;text-align:center;font:600 14px/1.4 system-ui,sans-serif;padding:8px 36px 8px 12px;position:relative";
      var x = document.createElement("button"); x.type = "button"; x.textContent = "×"; x.setAttribute("aria-label", "Cerrar aviso");
      x.style.cssText = "position:absolute;right:6px;top:2px;background:none;border:0;color:#fff;font-size:24px;line-height:1;padding:4px 10px;cursor:pointer";
      x.addEventListener("click", function () { cerradoAviso = true; franjaAviso.style.display = "none"; });
      franjaAviso.appendChild(document.createElement("span")); franjaAviso.appendChild(x);
      document.body.insertBefore(franjaAviso, document.body.firstChild);
    }
    franjaAviso.firstChild.textContent = "La cocina cierra a las " + cierraA + ". Haz tu pedido pronto.";
    franjaAviso.style.display = "";
  }
  function pintarBarra() {
    if (!BARRA) return;
    var b = document.createElement("div");
    b.setAttribute("role", "note");
    b.style.cssText = "background:#4a1519;color:#efe6d3;text-align:center;font:600 14px/1.4 system-ui,sans-serif;padding:8px 12px";
    b.textContent = "Pedido en barra: lo recoges en el local";
    document.body.insertBefore(b, document.body.firstChild);
  }
  /* En barra la persona ya está en el local: no hay avisos de cierre ni franja de "pedido en barra" (app.js pinta su propia barra de estado) */
  function listo() { if (BARRA) return; pintarBarra(); pintarAviso(); if (X.avisoCocina) setInterval(pintarAviso, 60000); }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", listo); else listo();

  /* ---------- reseña ---------- */
  function resena(contenedor, h) {
    if (!X.resena || !/^https:\/\//i.test(X.resena) || !contenedor) return;
    var a = (h || function (t, c, txt) { var e = document.createElement(t); if (c) e.className = c; if (txt) e.textContent = txt; return e; })("a", "btn-ped btn-ped--linea", "⭐ Déjanos tu reseña");
    a.href = X.resena; a.target = "_blank"; a.rel = "noopener";
    contenedor.appendChild(a);
  }

  /* ---------- datos que pedido.js agrega al pedido ---------- */
  function cuerpo(c) {
    if (BARRA) { c.origen = "barra"; c.canal = "recojo"; }
    if (MODO === "mesa") { var s = sesion(); if (s) c.sesionMesa = Number(s); }
    return c;
  }

  filtrarCarta();
  iniciarSesionMesa();
  window.PG_COMERCIO = {
    barra: BARRA, motivo: motivo, fuera: fuera, aviso: aviso, avisoProd: avisoProd, avisoSec: avisoSec, revisar: revisar, cuando: cuando, ventana: ventana, filtrarHoras: filtrarHoras, cuerpo: cuerpo, resena: resena,
    _t: { disponibleReg: disponibleReg, ahora: ahora, ventana: ventana, minutosParaCerrar: minutosParaCerrar, filtrarCarta: filtrarCarta, llena: llena, disponible: disponible }
  };
})();
