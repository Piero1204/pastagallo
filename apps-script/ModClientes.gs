/* =========================== MÓDULO CLIENTES (Fase 7) ===========================
   Se enciende con Config modulo_clientes = SI (Ajustes > Módulos). Apagado, no hace nada.

   - Hoja "Clientes": se DERIVA de la hoja Pedidos (teléfono normalizado = clave). Nada se pide al cliente: solo se
     usan los pedidos que ya traen teléfono (delivery y recojo). Se puede reconstruir completa (idempotente) o
     actualizar solo lo que cambió. Las notas internas y etiquetas se conservan al reconstruir.
   - Privacidad: SOLO el administrador (panel). No se publica nada en menu-data.js. "Olvidar cliente" anonimiza.
   - Hoja "Opiniones": calificaciones de 1 a 5 estrellas con comentario. La API pública es idempotente por pedido y
     exige un token que solo se obtiene desde el panel (enlace para enviar por WhatsApp).
   Las funciones de este archivo sin guion bajo final las llama el panel (siempre con exigirAdmin_). */

var EXT_ACCIONES = EXT_ACCIONES || {};
extRegistrar_('clientes');

var HOJA_CLIENTES = 'Clientes', COLS_CLIENTES = ['telefono', 'nombre', 'primer_pedido', 'ultimo_pedido', 'pedidos', 'total_gastado',
  'ticket_promedio', 'notas', 'etiquetas', 'actualizado'];
var HOJA_OPINIONES = 'Opiniones', COLS_OPINIONES = ['pedido', 'fecha', 'num_dia', 'canal', 'estrellas', 'comentario', 'telefono'];

/* ---------- utilidades compartidas con ModFidelidad.gs y ModReportes.gs ---------- */
/** Exige administrador y que el módulo esté encendido. Devuelve el nombre corto del usuario. */
function modExigir_(sesion, modulo) {
  var q = exigirAdmin_(sesion);
  if (!moduloActivo_(null, modulo)) throw new Error('El módulo "' + modulo + '" no está activo. Enciéndelo en Ajustes → Módulos.');
  return String(q || 'panel').split('@')[0];
}

/** Teléfono → solo dígitos, sin 0 ni 51 de adelante. '' si no parece un teléfono (menos de 7 o más de 15 dígitos). */
function normalizarTelefono_(v) {
  if (v == null) return '';
  var d = (typeof v === 'number' ? String(Math.round(v)) : String(v)).replace(/\D/g, '').replace(/^0+/, '');
  if (d.length === 11 && d.indexOf('51') === 0) d = d.slice(2);
  return d.length >= 7 && d.length <= 15 ? d : '';
}
function telEnmascarado_(t) { t = String(t || ''); return t.length > 3 ? '****' + t.slice(-3) : t; }

function dosDig_(n) { return ('0' + n).slice(-2); }
function fechaCorta_(d, zona) { return d instanceof Date && !isNaN(d.getTime()) ? Utilities.formatDate(d, zona, 'yyyy-MM-dd') : ''; }
function numSeguro_(v) { var n = Number(v); return isFinite(n) ? n : 0; }
function r2_(x) { return Math.round(x * 100) / 100; }

/** Una fila de Pedidos → objeto simple con lo que necesitan clientes y reportes. */
function normPedido_(p, zona) {
  var f = p.fecha instanceof Date && !isNaN(p.fecha.getTime()) ? p.fecha : null;
  var items = [];
  try { var j = JSON.parse(String(p.items_json || '[]')); if (j instanceof Array) items = j; } catch (e) { items = []; }
  var act = p.actualizado instanceof Date && !isNaN(p.actualizado.getTime()) ? p.actualizado.getTime() : 0;
  var estado = String(p.estado == null ? '' : p.estado).trim();
  return {
    numero: String(p.numero), fila: p._fila, ts: f ? f.getTime() : 0,
    dia: f ? Utilities.formatDate(f, zona, 'yyyy-MM-dd') : '',
    hora: f ? Number(Utilities.formatDate(f, zona, 'HH')) : -1,
    canal: String(p.canal || '').trim().toLowerCase(), origen: String(p.origen || '').trim().toLowerCase(),
    estado: estado, cancelado: estado === 'Cancelado', cortesia: String(p.origen || '') === 'cortesia',
    total: numSeguro_(p.total), nombre: String(p.nombre == null ? '' : p.nombre).trim(),
    tel: normalizarTelefono_(p.telefono), pago: String(p.pago == null ? '' : p.pago).trim(),
    ajuste: p.ajuste === '' || p.ajuste == null ? 0 : numSeguro_(p.ajuste), ajusteMotivo: String(p.ajuste_motivo || ''),
    mozo: String(p.mozo || ''), items: items, act: act, num_dia: p.num_dia, detalle: String(p.detalle || '')
  };
}
function leerPedidosNorm_(zona) { return leerTabla_(HOJA.pedidos).map(function (p) { return normPedido_(p, zona); }); }

/* ---------- registro de clientes ---------- */
/** Suma por teléfono. claves = objeto {tel:true} para limitar, o null para todos. Ignora cancelados, cortesías y pedidos sin teléfono. */
function clientesAgregar_(pn, claves) {
  var m = {};
  pn.forEach(function (p) {
    if (!p.tel || p.cancelado || p.cortesia) return;
    if (claves && !claves[p.tel]) return;
    var a = m[p.tel] || (m[p.tel] = { telefono: p.tel, nombre: '', _nts: -1, primer: 0, ultimo: 0, pedidos: 0, total: 0 });
    a.pedidos++; a.total += p.total;
    if (p.ts) { if (!a.primer || p.ts < a.primer) a.primer = p.ts; if (p.ts > a.ultimo) a.ultimo = p.ts; }
    if (p.nombre && p.ts >= a._nts) { a.nombre = p.nombre; a._nts = p.ts; }
  });
  Object.keys(m).forEach(function (k) { m[k].total = r2_(m[k].total); });
  return m;
}

function clientesLeerMapa_() {
  var m = {};
  leerTabla_(HOJA_CLIENTES).forEach(function (r) {
    var t = normalizarTelefono_(r.telefono);
    if (t) m[t] = { telefono: t, nombre: String(r.nombre || ''), primer: r.primer_pedido instanceof Date ? r.primer_pedido.getTime() : 0,
      ultimo: r.ultimo_pedido instanceof Date ? r.ultimo_pedido.getTime() : 0, pedidos: numSeguro_(r.pedidos), total: numSeguro_(r.total_gastado),
      notas: String(r.notas || ''), etiquetas: String(r.etiquetas || '') };
  });
  return m;
}

/** Escribe todo el mapa en la hoja Clientes (orden fijo: último pedido más reciente primero). */
function clientesEscribirMapa_(map) {
  var ss = SpreadsheetApp.getActive();
  var h = obtenerHoja_(ss, HOJA_CLIENTES, COLS_CLIENTES), cab = asegurarColumnas_(h, COLS_CLIENTES);
  var viejas = Math.max(h.getLastRow() - 1, 0);
  var lista = Object.keys(map).map(function (k) { return map[k]; }).sort(function (a, b) { return (b.ultimo - a.ultimo) || (a.telefono < b.telefono ? -1 : 1); });
  var ahora = new Date();
  var filas = lista.map(function (c) {
    var o = { telefono: c.telefono, nombre: protegerCelda_(c.nombre || ''), primer_pedido: c.primer ? new Date(c.primer) : '', ultimo_pedido: c.ultimo ? new Date(c.ultimo) : '',
      pedidos: c.pedidos, total_gastado: c.total, ticket_promedio: c.pedidos ? r2_(c.total / c.pedidos) : 0,
      notas: protegerCelda_(c.notas || ''), etiquetas: protegerCelda_(c.etiquetas || ''), actualizado: ahora };
    return cab.map(function (col) { return o[col] == null ? '' : o[col]; });
  });
  var total = Math.max(filas.length, viejas);
  if (!total) return 0;
  while (filas.length < total) filas.push(cab.map(function () { return ''; }));   // borra lo que sobre de antes (sin clearContent)
  h.getRange(2, cab.indexOf('telefono') + 1, total, 1).setNumberFormat('@');      // el teléfono SIEMPRE como texto
  h.getRange(2, 1, total, cab.length).setValues(filas);
  return lista.length;
}

/** Reconstruye (completo = true: desde cero, idempotente) o actualiza solo lo que cambió desde la última vez. */
function clientesSync_(completo) {
  var lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    var cfg = leerConfig_(), zona = cfg.zona_horaria || 'America/Lima';
    var props = PropertiesService.getScriptProperties();
    var st = null; try { st = JSON.parse(props.getProperty('CLIENTES_SYNC') || 'null'); } catch (e) { st = null; }
    var pn = leerPedidosNorm_(zona);
    var existentes = clientesLeerMapa_();
    var maxNum = 0; pn.forEach(function (p) { var n = Number(p.numero); if (n > maxNum) maxNum = n; });
    var full = !!completo || !st || pn.length < st.filas;   // si hay menos pedidos que antes (se eliminaron), reconstruye todo
    var mapa = {}, afectados = 0;
    if (full) {
      var agg = clientesAgregar_(pn, null);
      Object.keys(agg).forEach(function (k) {
        var a = agg[k], e = existentes[k] || {};
        mapa[k] = { telefono: k, nombre: a.nombre || e.nombre || '', primer: a.primer, ultimo: a.ultimo, pedidos: a.pedidos, total: a.total, notas: e.notas || '', etiquetas: e.etiquetas || '' };
      });
      Object.keys(existentes).forEach(function (k) {   // sin pedidos válidos pero con notas: se conserva (en cero)
        var e = existentes[k];
        if (!mapa[k] && (e.notas || e.etiquetas)) mapa[k] = { telefono: k, nombre: e.nombre, primer: 0, ultimo: 0, pedidos: 0, total: 0, notas: e.notas, etiquetas: e.etiquetas };
      });
      afectados = Object.keys(mapa).length;
    } else {
      var tocados = {};
      pn.forEach(function (p) { if (p.tel && (Number(p.numero) > st.maxNumero || (p.act && p.act >= st.ms - 120000))) tocados[p.tel] = true; });
      Object.keys(existentes).forEach(function (k) { mapa[k] = existentes[k]; });
      var nuevos = clientesAgregar_(pn, tocados);
      Object.keys(tocados).forEach(function (k) {
        var a = nuevos[k], e = existentes[k] || {};
        if (a) mapa[k] = { telefono: k, nombre: a.nombre || e.nombre || '', primer: a.primer, ultimo: a.ultimo, pedidos: a.pedidos, total: a.total, notas: e.notas || '', etiquetas: e.etiquetas || '' };
        else if (e.notas || e.etiquetas) mapa[k] = { telefono: k, nombre: e.nombre, primer: 0, ultimo: 0, pedidos: 0, total: 0, notas: e.notas, etiquetas: e.etiquetas };
        else delete mapa[k];
        afectados++;
      });
    }
    var n = clientesEscribirMapa_(mapa);
    props.setProperty('CLIENTES_SYNC', JSON.stringify({ ms: Date.now(), maxNumero: maxNum, filas: pn.length, v: props.getProperty('PEDIDOS_VERSION') || '' }));
    return { ok: true, completo: full, clientes: n, afectados: afectados };
  } finally {
    lock.releaseLock();
  }
}
/** Solo actualiza si entraron o cambiaron pedidos desde la última vez (para no leer de más al abrir la pantalla). */
function clientesAlDia_() {
  var props = PropertiesService.getScriptProperties(), st = null;
  try { st = JSON.parse(props.getProperty('CLIENTES_SYNC') || 'null'); } catch (e) { st = null; }
  if (st && st.v && st.v === (props.getProperty('PEDIDOS_VERSION') || '')) return { ok: true, omitido: true };
  return clientesSync_(false);
}

function clienteDeFila_(c, zona) {
  return { telefono: c.telefono, nombre: c.nombre, primer: c.primer ? Utilities.formatDate(new Date(c.primer), zona, 'yyyy-MM-dd') : '',
    ultimo: c.ultimo ? Utilities.formatDate(new Date(c.ultimo), zona, 'yyyy-MM-dd') : '', pedidos: c.pedidos, total: c.total,
    ticket: c.pedidos ? r2_(c.total / c.pedidos) : 0, notas: c.notas, etiquetas: c.etiquetas };
}

/* ---------- funciones del panel (solo administrador) ---------- */
function clientesEstado(sesion) {
  modExigir_(sesion, 'clientes');
  var cfg = leerConfig_();
  var st = null; try { st = JSON.parse(PropertiesService.getScriptProperties().getProperty('CLIENTES_SYNC') || 'null'); } catch (e) { st = null; }
  return { ok: true, sincronizado: !!st, ultimaSync: st ? st.ms : 0, fidelidad: esSi_(cfg.modulo_fidelidad),
    reglaFidelidad: String(cfg.fidelidad_soles_por_punto == null ? '' : cfg.fidelidad_soles_por_punto) };
}
function clientesActualizar(sesion, completo) {
  var q = modExigir_(sesion, 'clientes');
  var r = clientesSync_(completo === true);
  if (completo === true) auditar_(q, 'Reconstruyó clientes', r.clientes + ' clientes');
  return r;
}
function clientesBuscar(sesion, texto) {
  modExigir_(sesion, 'clientes');
  clientesAlDia_();
  var zona = leerConfig_().zona_horaria || 'America/Lima';
  var t = String(texto || '').trim().toLowerCase().slice(0, 60), td = t.replace(/\D/g, '');
  var mapa = clientesLeerMapa_(), lista = Object.keys(mapa).map(function (k) { return mapa[k]; });
  lista = lista.filter(function (c) {
    if (!t) return true;
    return (td.length >= 3 && c.telefono.indexOf(td) >= 0) || c.nombre.toLowerCase().indexOf(t) >= 0 || c.etiquetas.toLowerCase().indexOf(t) >= 0 || c.notas.toLowerCase().indexOf(t) >= 0;
  }).sort(function (a, b) { return (b.ultimo - a.ultimo) || (a.telefono < b.telefono ? -1 : 1); });
  return { ok: true, total: lista.length, clientes: lista.slice(0, 60).map(function (c) { return clienteDeFila_(c, zona); }) };
}
function clientesFicha(sesion, telefono) {
  modExigir_(sesion, 'clientes');
  var tel = normalizarTelefono_(telefono);
  if (!tel) throw new Error('Teléfono no válido.');
  var cfg = leerConfig_(), zona = cfg.zona_horaria || 'America/Lima';
  var c = clientesLeerMapa_()[tel];
  if (!c) throw new Error('No se encontró ese cliente.');
  var peds = leerPedidosNorm_(zona).filter(function (p) { return p.tel === tel; }).sort(function (a, b) { return b.ts - a.ts; });
  var ficha = { ok: true, cliente: clienteDeFila_(c, zona),
    pedidos: peds.slice(0, 30).map(function (p) { return { numero: p.numero, num_dia: p.num_dia, fecha: p.dia, canal: p.canal, estado: p.estado, total: p.total, detalle: p.detalle }; }),
    opiniones: opinionesDe_(tel, zona) };
  if (esSi_(cfg.modulo_fidelidad)) ficha.fidelidad = fidelidadResumen_(tel, cfg, c, zona);
  return ficha;
}
function clientesGuardarNota(sesion, telefono, notas, etiquetas) {
  var q = modExigir_(sesion, 'clientes');
  var tel = normalizarTelefono_(telefono);
  if (!tel) throw new Error('Teléfono no válido.');
  var tags = String(etiquetas || '').split(',').map(function (x) { return x.trim().slice(0, 24); }).filter(function (x) { return x; });
  var vistos = {}; tags = tags.filter(function (x) { var k = x.toLowerCase(); if (vistos[k]) return false; vistos[k] = true; return true; }).slice(0, 10);
  var lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    var mapa = clientesLeerMapa_();
    if (!mapa[tel]) throw new Error('No se encontró ese cliente.');
    mapa[tel].notas = String(notas || '').replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, ' ').trim().slice(0, 500);
    mapa[tel].etiquetas = tags.join(', ');
    clientesEscribirMapa_(mapa);
  } finally { lock.releaseLock(); }
  return { ok: true };
}

/** Anonimiza al cliente: borra su fila, quita nombre, teléfono, dirección, referencia, correo y documento de sus pedidos
 *  (los pedidos y los totales de ventas se conservan) y vacía su teléfono y comentario en Opiniones y Puntos. No se puede deshacer. */
function clientesOlvidar(sesion, telefono, confirmar) {
  var q = modExigir_(sesion, 'clientes');
  var tel = normalizarTelefono_(telefono);
  if (!tel) throw new Error('Teléfono no válido.');
  if (confirmar !== true) throw new Error('Falta confirmar: olvidar un cliente no se puede deshacer.');
  var lock = LockService.getScriptLock();
  lock.waitLock(30000);
  var nPed = 0;
  try {
    var ss = SpreadsheetApp.getActive();
    var hp = ss.getSheetByName(HOJA.pedidos);
    if (hp) {
      var cab = asegurarColumnas_(hp, COLS.pedidos);
      var campos = ['nombre', 'telefono', 'direccion', 'referencia', 'correo', 'doc', 'razon'];
      leerTabla_(HOJA.pedidos).forEach(function (p) {
        if (normalizarTelefono_(p.telefono) !== tel) return;
        var rng = hp.getRange(p._fila, 1, 1, cab.length), v = rng.getValues()[0];
        campos.forEach(function (c) { var i = cab.indexOf(c); if (i >= 0) v[i] = c === 'nombre' ? 'Cliente olvidado' : ''; });
        rng.setValues([v]); nPed++;
      });
    }
    var mapa = clientesLeerMapa_();
    if (mapa[tel]) { delete mapa[tel]; clientesEscribirMapa_(mapa); }
    [[HOJA_OPINIONES, 'telefono', 'comentario'], ['Puntos', 'telefono', 'motivo']].forEach(function (par) {
      var h = ss.getSheetByName(par[0]); if (!h || h.getLastRow() < 2) return;
      var ca = asegurarColumnas_(h, par[0] === HOJA_OPINIONES ? COLS_OPINIONES : COLS_PUNTOS);
      leerTabla_(par[0]).forEach(function (r) {
        if (normalizarTelefono_(r.telefono) !== tel) return;
        h.getRange(r._fila, ca.indexOf(par[1]) + 1).setNumberFormat('@').setValue('olvidado');
        if (par[0] === HOJA_OPINIONES) h.getRange(r._fila, ca.indexOf(par[2]) + 1).setValue('');
      });
    });
    PropertiesService.getScriptProperties().setProperty('PEDIDOS_VERSION', String(Date.now()));
    auditar_(q, 'Olvidó cliente', telEnmascarado_(tel) + ' · ' + nPed + ' pedidos anonimizados');
  } finally { lock.releaseLock(); }
  return { ok: true, pedidos: nPed };
}

function csvCelda_(v) {
  if (v instanceof Date) v = v.toISOString().slice(0, 16).replace('T', ' ');
  var s = v == null ? '' : String(v);
  if (/^[=+\-@\t\r]/.test(s) && !/^-?\d+([.,]\d+)?$/.test(s)) s = "'" + s;   // que Excel no lo tome como fórmula
  return /[",\n\r;]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
}
function csvFilas_(filas) { return filas.map(function (f) { return f.map(csvCelda_).join(','); }).join('\r\n'); }

/** CSV con todo lo que hay de UN cliente (para entregárselo si lo pide). */
function clientesExportarCsv(sesion, telefono) {
  var q = modExigir_(sesion, 'clientes');
  var tel = normalizarTelefono_(telefono);
  var f = clientesFicha(sesion, tel);
  var c = f.cliente, filas = [['Datos del cliente'], ['telefono', 'nombre', 'primer_pedido', 'ultimo_pedido', 'pedidos', 'total_gastado', 'ticket_promedio', 'notas', 'etiquetas'],
    [c.telefono, c.nombre, c.primer, c.ultimo, c.pedidos, c.total, c.ticket, c.notas, c.etiquetas], [], ['Pedidos'], ['numero', 'fecha', 'canal', 'estado', 'total', 'detalle']];
  f.pedidos.forEach(function (p) { filas.push([p.num_dia || p.numero, p.fecha, p.canal, p.estado, p.total, p.detalle]); });
  filas.push([], ['Opiniones'], ['fecha', 'estrellas', 'comentario']);
  f.opiniones.forEach(function (o) { filas.push([o.fecha, o.estrellas, o.comentario]); });
  if (f.fidelidad) { filas.push([], ['Puntos'], ['fecha', 'tipo', 'puntos', 'motivo']); f.fidelidad.movimientos.forEach(function (m) { filas.push([m.fecha, m.tipo, m.puntos, m.motivo]); }); }
  auditar_(q, 'Exportó datos de cliente', telEnmascarado_(tel));
  return { ok: true, nombre: 'cliente-' + tel + '.csv', csv: '﻿' + csvFilas_(filas) };
}

/* ---------- opiniones ---------- */
function opinionToken_(id) {
  var props = PropertiesService.getScriptProperties();
  var sec = props.getProperty('CLIENTES_SECRETO');
  if (!sec) { sec = Utilities.getUuid() + Utilities.getUuid(); props.setProperty('CLIENTES_SECRETO', sec); }
  var d = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, sec + ':' + String(id), Utilities.Charset.UTF_8), out = '';
  for (var i = 0; i < 9; i++) out += ('0' + ((d[i] + 256) % 256).toString(16)).slice(-2);
  return out;   // 18 caracteres
}
function opinionesDe_(tel, zona) {
  return leerTabla_(HOJA_OPINIONES).filter(function (o) { return normalizarTelefono_(o.telefono) === tel; })
    .map(function (o) { return { pedido: String(o.pedido), fecha: fechaCorta_(o.fecha, zona), estrellas: numSeguro_(o.estrellas), comentario: String(o.comentario || '') }; });
}

EXT_ACCIONES['clientes'] = function (body) {
  var a = String(body.accion || '');
  if (a !== 'opinar') return { ok: false, error: 'Acción no válida.' };
  if (body.web) return { ok: true };   // trampa para robots
  var cache = CacheService.getScriptCache();
  var minuto = 'opmin:' + Math.floor(Date.now() / 60000), nm = Number(cache.get(minuto) || 0);
  if (nm >= 30) throw extError_('Estamos recibiendo muchas opiniones. Intenta en un minuto.');
  cache.put(minuto, String(nm + 1), 120);
  var id = String(body.p == null ? '' : body.p).replace(/\D/g, '').slice(0, 12), k = String(body.k || '').slice(0, 40);
  if (!id || !k) throw extError_('Este enlace no es válido.');
  var kp = 'opid:' + id, np = Number(cache.get(kp) || 0);
  if (np >= 8) throw extError_('Ya recibimos tu opinión. ¡Gracias!');
  cache.put(kp, String(np + 1), 600);
  var esp = opinionToken_(id), dif = esp.length ^ k.length;
  for (var i = 0; i < esp.length; i++) dif |= esp.charCodeAt(i) ^ (k.charCodeAt(i) || 0);
  if (dif !== 0) throw extError_('Este enlace no es válido.');
  var estr = Math.round(Number(body.estrellas));
  if (!(estr >= 1 && estr <= 5)) throw extError_('Elige de 1 a 5 estrellas.');
  var com = String(body.comentario == null ? '' : body.comentario).replace(/[\u0000-\u001f]/g, ' ').trim().slice(0, 500);
  var lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    var ss = SpreadsheetApp.getActive(), cfg = leerConfig_(), zona = cfg.zona_horaria || 'America/Lima';
    var h = obtenerHoja_(ss, HOJA_OPINIONES, COLS_OPINIONES), cab = asegurarColumnas_(h, COLS_OPINIONES);
    if (leerTabla_(HOJA_OPINIONES).some(function (o) { return String(o.pedido) === id; })) return { ok: true, repetido: true };   // idempotente: la primera opinión manda
    var p = leerPedidosNorm_(zona).filter(function (x) { return x.numero === id; })[0];
    if (!p || p.cancelado) throw extError_('Este enlace no es válido.');
    var f = { pedido: id, fecha: new Date(), num_dia: p.num_dia, canal: p.canal, estrellas: estr, comentario: com, telefono: p.tel };
    h.getRange(h.getLastRow() + 1, 1, 1, cab.length).setValues([cab.map(function (c) { return f[c] == null ? '' : protegerCelda_(f[c]); })]);
    h.getRange(h.getLastRow(), cab.indexOf('telefono') + 1).setNumberFormat('@').setValue(p.tel);
  } finally { lock.releaseLock(); }
  return { ok: true };
};

function opinionesListar(sesion) {
  modExigir_(sesion, 'clientes');
  var zona = leerConfig_().zona_horaria || 'America/Lima';
  var l = leerTabla_(HOJA_OPINIONES).map(function (o) {
    return { pedido: String(o.pedido), num_dia: o.num_dia, fecha: fechaCorta_(o.fecha, zona), ts: o.fecha instanceof Date ? o.fecha.getTime() : 0, canal: String(o.canal || ''),
      estrellas: numSeguro_(o.estrellas), comentario: String(o.comentario || '') };
  }).sort(function (a, b) { return b.ts - a.ts; });
  var dist = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 }, suma = 0;
  l.forEach(function (o) { if (dist[o.estrellas] != null) { dist[o.estrellas]++; suma += o.estrellas; } });
  return { ok: true, total: l.length, promedio: l.length ? r2_(suma / l.length) : 0, distribucion: dist, ultimas: l.slice(0, 100) };
}
function opinionEnlace(sesion, numero) {
  modExigir_(sesion, 'clientes');
  var cfg = leerConfig_(), id = String(numero == null ? '' : numero).replace(/\D/g, '');
  var p = leerPedidosNorm_(cfg.zona_horaria || 'America/Lima').filter(function (x) { return x.numero === id; })[0];
  if (!p) throw new Error('No se encontró el pedido.');
  var base = String(cfg.sitio_url || '').replace(/\/+$/, '');
  if (!base) throw new Error('Falta el "Link público de la carta" en Ajustes.');
  return { ok: true, url: base + '/opinion.html?p=' + id + '&k=' + opinionToken_(id) };
}
