/* =====================================================================
   PASTA GALLO · Servidor (Google Apps Script, ligado al Google Sheets)

   Qué hace este archivo:
   1. Recibe los pedidos de la web (doPost) y los guarda en la hoja "Pedidos".
      El precio SIEMPRE se recalcula aquí con los precios de la hoja: nadie
      puede cambiar un precio desde su navegador.
   2. Abre el panel interno (menú "Pasta Gallo" → "Abrir panel"). Solo los
      editores de este Google Sheets pueden abrirlo.
   3. Publica la carta en la web (crea menu-data.js en GitHub).

   No compartas este Google Sheets con "Cualquier persona con el enlace".
   ===================================================================== */

var HOJA = { config: 'Config', secciones: 'Secciones', productos: 'Productos', pedidos: 'Pedidos', mesas: 'Mesas', opciones: 'Opciones' };
var COLS = {
  secciones: ['id', 'orden', 'titulo', 'subtitulo', 'intro', 'pie', 'alcohol', 'delivery', 'mesa', 'visible',
    'titulo_en', 'subtitulo_en', 'intro_en', 'pie_en'],
  productos: ['id', 'seccion', 'grupo', 'grupo_nota', 'orden', 'nombre', 'glosa', 'descripcion', 'precio', 'tamanos',
    'tipo', 'recargo', 'requiere_salsa', 'disponible', 'visible', 'destacado', 'alergenos', 'foto',
    'canal', 'precio_antes', 'opciones', 'nombre_en', 'glosa_en', 'descripcion_en',
    'incluye', 'incluye_en', 'promo_dias', 'promo_desde', 'promo_hasta', 'promo_horas', 'promo_excluir', 'promo_extra'],
  pedidos: ['numero', 'fecha', 'canal', 'mesa', 'nombre', 'telefono', 'direccion', 'referencia', 'pago', 'programado',
    'detalle', 'total', 'estado', 'notas', 'items_json', 'actualizado', 'historial', 'origen'],
  mesas: ['mesa', 'codigo', 'activa', 'link'],
  opciones: ['grupo', 'nombre', 'nombre_en', 'tipo', 'obligatorio', 'opcion', 'opcion_en', 'precio', 'orden', 'activo']
};
var CANALES = ['todos', 'local', 'delivery'];
var ESTADOS = ['Nuevo', 'Confirmado', 'En preparación', 'Listo', 'En camino', 'Entregado', 'Cancelado'];
var ALERGENOS = { gluten: 'Gluten', lacteos: 'Lácteos', huevo: 'Huevo', pescado: 'Pescado', mariscos: 'Mariscos',
  frutosSecos: 'Frutos secos', mani: 'Maní', soya: 'Soya', sulfitos: 'Sulfitos' };
/* Columnas de promoción: si el panel no las envía (editor general de la carta), se conservan las que ya había. */
var COLS_PROMO = ['incluye', 'incluye_en', 'promo_dias', 'promo_desde', 'promo_hasta', 'promo_horas', 'promo_excluir', 'promo_extra'];
var DIAS_CORTOS = ['dom', 'lun', 'mar', 'mie', 'jue', 'vie', 'sab'];
var DIAS_CFG = ['horario_domingo', 'horario_lunes', 'horario_martes', 'horario_miercoles', 'horario_jueves', 'horario_viernes', 'horario_sabado'];

/* =========================== MENÚ DEL SHEETS =========================== */
function onOpen() {
  SpreadsheetApp.getUi().createMenu('🍝 Pasta Gallo')
    .addItem('Abrir panel', 'abrirPanel')
    .addItem('Publicar carta en la web', 'menuPublicar')
    .addSeparator()
    .addItem('Instalar / reparar hojas', 'instalar')
    .addToUi();
}

function abrirPanel() {
  exigirAdmin_('');
  var t = HtmlService.createTemplateFromFile('Panel');
  t.modoWeb = false;
  var html = t.evaluate().setWidth(1360).setHeight(860).setTitle('Panel · Pasta Gallo');
  SpreadsheetApp.getUi().showModalDialog(html, 'Panel · Pasta Gallo');
}

function menuPublicar() {
  var r = publicarCarta('');
  SpreadsheetApp.getUi().alert('Carta publicada', r.mensaje, SpreadsheetApp.getUi().ButtonSet.OK);
}

/* =========================== INSTALADOR =========================== */
function instalar() {
  var ss = SpreadsheetApp.getActive();
  if (ss.getSheetByName(HOJA.config)) exigirAdmin_('');
  var D = DATOS_INICIALES;

  // Config
  var hc = obtenerHoja_(ss, HOJA.config, ['clave', 'valor', 'ayuda']);
  var existentes = hc.getLastRow() > 1 ? hc.getRange(2, 1, hc.getLastRow() - 1, 1).getValues().map(function (r) { return r[0]; }) : [];
  var nuevas = D.config.filter(function (r) { return existentes.indexOf(r[0]) < 0; });
  if (nuevas.length) hc.getRange(hc.getLastRow() + 1, 1, nuevas.length, 3).setValues(nuevas);
  hc.setColumnWidth(1, 210).setColumnWidth(2, 420).setColumnWidth(3, 420);
  hc.getRange('B:B').setWrap(true);

  var hs = obtenerHoja_(ss, HOJA.secciones, COLS.secciones);
  if (hs.getLastRow() < 2) hs.getRange(2, 1, D.secciones.length, COLS.secciones.length).setValues(D.secciones);
  var hp = obtenerHoja_(ss, HOJA.productos, COLS.productos);
  if (hp.getLastRow() < 2) hp.getRange(2, 1, D.productos.length, COLS.productos.length).setValues(D.productos);
  hp.setColumnWidth(6, 230).setColumnWidth(8, 380);

  var hd = obtenerHoja_(ss, HOJA.pedidos, COLS.pedidos);
  hd.getRange('B:B').setNumberFormat('dd/mm/yyyy hh:mm');
  hd.getRange('L:L').setNumberFormat('"S/ "#,##0.00');
  var regla = SpreadsheetApp.newDataValidation().requireValueInList(ESTADOS, true).build();
  hd.getRange('M2:M').setDataValidation(regla);

  var ho = obtenerHoja_(ss, HOJA.opciones, COLS.opciones);
  if (ho.getLastRow() < 2 && D.opciones && D.opciones.length) ho.getRange(2, 1, D.opciones.length, COLS.opciones.length).setValues(D.opciones);

  var hm = obtenerHoja_(ss, HOJA.mesas, COLS.mesas);
  if (hm.getLastRow() < 2) {
    var filas = [];
    for (var i = 1; i <= 10; i++) filas.push([i, codigoMesa_(), 'SI', '']);
    hm.getRange(2, 1, filas.length, 4).setValues(filas);
  }

  formatearHojas_();

  // URL de la API (si ya existe una implementación)
  try {
    var url = ScriptApp.getService().getUrl();
    if (url && /\/exec$/.test(url) && !leerConfig_().api_url) guardarClave_('api_url', url);
  } catch (e) { /* aún no hay implementación */ }

  actualizarLinksMesas_();
  try {
    SpreadsheetApp.getUi().alert('Listo', 'Hojas instaladas. Ahora abre el menú "🍝 Pasta Gallo" → "Abrir panel".', SpreadsheetApp.getUi().ButtonSet.OK);
  } catch (e) { /* ejecutado desde el editor */ }
}

/** Validaciones (listas SI/NO, canal, tipo) según las columnas reales de cada hoja. */
function formatearHojas_() {
  var ss = SpreadsheetApp.getActive();
  var si = SpreadsheetApp.newDataValidation().requireValueInList(['SI', 'NO'], true).build();
  function validar(nombre, cols, regla) {
    var h = ss.getSheetByName(nombre); if (!h || h.getLastColumn() < 1) return;
    var cab = h.getRange(1, 1, 1, h.getLastColumn()).getValues()[0];
    cols.forEach(function (c) { var i = cab.indexOf(c); if (i >= 0) h.getRange(2, i + 1, Math.max(h.getMaxRows() - 1, 1), 1).setDataValidation(regla); });
  }
  validar(HOJA.secciones, ['alcohol', 'delivery', 'mesa', 'visible'], si);
  validar(HOJA.productos, ['requiere_salsa', 'disponible', 'visible'], si);
  validar(HOJA.productos, ['canal'], SpreadsheetApp.newDataValidation().requireValueInList(CANALES, true).build());
  validar(HOJA.productos, ['tipo'], SpreadsheetApp.newDataValidation().requireValueInList(['plato', 'salsa'], true).build());
  validar(HOJA.mesas, ['activa'], si);
  validar(HOJA.opciones, ['obligatorio', 'activo'], si);
  validar(HOJA.opciones, ['tipo'], SpreadsheetApp.newDataValidation().requireValueInList(['una', 'varias'], true).build());
}

/** Reescribe una hoja completa a partir de objetos, conservando columnas extra que ya existan. */
function escribirTabla_(nombre, cols, objs) {
  var ss = SpreadsheetApp.getActive();
  var h = obtenerHoja_(ss, nombre, cols);
  var cab = h.getRange(1, 1, 1, Math.max(h.getLastColumn(), 1)).getValues()[0].map(function (c) { return String(c).trim(); }).filter(Boolean);
  cols.forEach(function (c) { if (cab.indexOf(c) < 0) cab.push(c); });
  h.getRange(1, 1, 1, cab.length).setValues([cab]).setFontWeight('bold').setBackground('#4a1519').setFontColor('#efe6d3');
  if (h.getLastRow() > 1) h.getRange(2, 1, h.getLastRow() - 1, Math.max(h.getLastColumn(), cab.length)).clearContent();
  if (objs.length) {
    var filas = objs.map(function (o) { return cab.map(function (c) { return o[c] == null ? '' : o[c]; }); });
    h.getRange(2, 1, filas.length, cab.length).setValues(filas);
  }
  limpiarCache_();
}

function obtenerHoja_(ss, nombre, cabecera) {
  var h = ss.getSheetByName(nombre);
  if (!h) h = ss.insertSheet(nombre);
  if (h.getLastRow() === 0) {
    h.getRange(1, 1, 1, cabecera.length).setValues([cabecera]).setFontWeight('bold')
      .setBackground('#4a1519').setFontColor('#efe6d3');
    h.setFrozenRows(1);
  }
  return h;
}

/** Agrega al final de la cabecera las columnas que falten. Devuelve la cabecera completa. */
function asegurarColumnas_(h, cols) {
  var n = Math.max(h.getLastColumn(), 1);
  var cab = h.getRange(1, 1, 1, n).getValues()[0].map(function (c) { return String(c).trim(); });
  while (cab.length && !cab[cab.length - 1]) cab.pop();
  var faltan = cols.filter(function (c) { return cab.indexOf(c) < 0; });
  if (faltan.length) {
    h.getRange(1, cab.length + 1, 1, faltan.length).setValues([faltan]).setFontWeight('bold').setBackground('#4a1519').setFontColor('#efe6d3');
    cab = cab.concat(faltan);
  }
  return cab;
}

/* =========================== LECTURA DE DATOS =========================== */
function leerConfig_() {
  var h = SpreadsheetApp.getActive().getSheetByName(HOJA.config);
  var o = {};
  if (!h || h.getLastRow() < 2) return o;
  h.getRange(2, 1, h.getLastRow() - 1, 2).getValues().forEach(function (r) {
    if (r[0]) o[String(r[0]).trim()] = typeof r[1] === 'string' ? r[1].trim() : r[1];
  });
  return o;
}

function guardarClave_(clave, valor) {
  var h = SpreadsheetApp.getActive().getSheetByName(HOJA.config);
  var n = h.getLastRow();
  var claves = n > 1 ? h.getRange(2, 1, n - 1, 1).getValues() : [];
  for (var i = 0; i < claves.length; i++) {
    if (claves[i][0] === clave) { h.getRange(i + 2, 2).setValue(valor); return; }
  }
  h.appendRow([clave, valor, '']);
}

function leerTabla_(nombre) {
  var h = SpreadsheetApp.getActive().getSheetByName(nombre);
  if (!h || h.getLastRow() < 2) return [];
  var v = h.getDataRange().getValues();
  var cab = v.shift().map(function (c) { return String(c).trim(); });
  return v.filter(function (r) { return r.join('') !== ''; }).map(function (r, i) {
    var o = { _fila: i + 2 };
    cab.forEach(function (c, j) { o[c] = r[j]; });
    return o;
  });
}

function leerCatalogo_() {
  var cache = CacheService.getScriptCache();
  var c = cache.get('catalogo');
  if (c) return JSON.parse(c);
  var cat = {
    secciones: leerTabla_(HOJA.secciones),
    productos: leerTabla_(HOJA.productos),
    opciones: leerTabla_(HOJA.opciones),
    mesas: leerTabla_(HOJA.mesas).map(function (m) { return { mesa: String(m.mesa), codigo: String(m.codigo), activa: m.activa }; })
  };
  try { cache.put('catalogo', JSON.stringify(cat), 120); } catch (e) { /* demasiado grande: sin caché */ }
  return cat;
}
function limpiarCache_() { CacheService.getScriptCache().remove('catalogo'); }

/* =========================== LÓGICA PURA (sin Google) =========================== */
function esSi_(v) { return String(v).trim().toUpperCase() === 'SI' || v === true; }
function num_(v) { var n = Number(String(v).replace(',', '.')); return isFinite(n) && String(v).trim() !== '' ? n : null; }
function soles_(n) { return 'S/ ' + Number(n).toFixed(2); }
function texto_(v, max) { return String(v == null ? '' : v).replace(/[\u0000-\u001f\u007f<>]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, max); }

function parsearTamanos_(t) {
  if (!t) return [];
  return String(t).split(/[;|\n]/).map(function (x) {
    var p = x.split('=');
    if (p.length < 2) return null;
    var precio = num_(p[1]);
    return precio == null ? null : [p[0].trim(), precio];
  }).filter(Boolean);
}

function listaIds_(v) { return String(v || '').split(',').map(function (x) { return x.trim(); }).filter(Boolean); }

/** Agrupa las filas de la hoja Opciones: { grupo: { n, n_en, tipo, req, ops:[{n, n_en, p}] } } (solo activas). */
function gruposOpciones_(filas) {
  var g = {};
  (filas || []).slice().sort(function (a, b) { return (num_(a.orden) || 0) - (num_(b.orden) || 0); }).forEach(function (f) {
    var id = String(f.grupo || '').trim();
    if (!id || !esSi_(f.activo) || !String(f.opcion || '').trim()) return;
    if (!g[id]) g[id] = { n: String(f.nombre || id), n_en: String(f.nombre_en || ''), tipo: f.tipo === 'varias' ? 'varias' : 'una', req: esSi_(f.obligatorio), ops: [] };
    g[id].ops.push({ n: String(f.opcion).trim(), n_en: String(f.opcion_en || ''), p: num_(f.precio) || 0 });
  });
  return g;
}

function horarioDe_(cfg, dia) {
  var v = String(cfg[DIAS_CFG[dia]] || '').trim().toLowerCase();
  var m = v.match(/^(\d{1,2}):(\d{2})\s*-\s*(\d{1,2}):(\d{2})$/);
  if (!m) return null;
  var p = function (a) { return ('0' + a).slice(-2); };
  return [p(m[1]) + ':' + m[2], p(m[3]) + ':' + m[4]];
}

function minutos_(hhmm) { var p = hhmm.split(':'); return (+p[0]) * 60 + (+p[1]); }

/* =========================== PROMOCIONES (lógica pura) ===========================
   Cada promoción es un producto (normalmente de la sección "promociones") con su calendario:
   - promo_dias:    días de la semana, ej. "mar, mie, jue". Vacío = todos los días.
   - promo_desde / promo_hasta: rango de fechas (AAAA-MM-DD). Vacío = sin límite.
   - promo_horas:   franja horaria opcional, ej. "18:00-21:00".
   - promo_excluir: fechas en que NO va aunque sea su día (feriados, días sin stock).
   - promo_extra:   fechas en que SÍ va aunque no sea su día (ej. un lunes feriado).
   El interruptor "visible" es el que la activa o la apaga por completo. */

/** "mar, miércoles, 4" → [2, 3, 4]. Vacío → null (= todos los días). */
function parsearDias_(v) {
  var txt = String(v == null ? '' : v).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').trim();
  if (!txt || txt === 'todos') return null;
  var r = [];
  txt.split(/[\s,;|\/]+/).forEach(function (x) {
    if (!x) return;
    var i = /^[0-6]$/.test(x) ? Number(x) : DIAS_CORTOS.indexOf(x.slice(0, 3));
    if (i >= 0 && r.indexOf(i) < 0) r.push(i);
  });
  return r.sort();
}
function diasTexto_(lista) { return lista == null ? '' : lista.map(function (d) { return DIAS_CORTOS[d]; }).join(', '); }

/** Celda → "AAAA-MM-DD" (acepta fechas de Sheets o texto). '' si no es válida. */
function fechaIso_(v) {
  if (v instanceof Date) {
    if (typeof Utilities !== 'undefined') {
      var tz = 'America/Lima';
      try { tz = SpreadsheetApp.getActive().getSpreadsheetTimeZone() || tz; } catch (e) { /* sin hoja */ }
      return Utilities.formatDate(v, tz, 'yyyy-MM-dd');
    }
    return v.getFullYear() + '-' + ('0' + (v.getMonth() + 1)).slice(-2) + '-' + ('0' + v.getDate()).slice(-2);
  }
  var s = String(v == null ? '' : v).trim();
  var m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/) || s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (!m) return '';
  var a = m[1].length === 4 ? [m[1], m[2], m[3]] : [m[3], m[2], m[1]];
  return a[0] + '-' + ('0' + a[1]).slice(-2) + '-' + ('0' + a[2]).slice(-2);
}
function listaFechas_(v) {
  if (v instanceof Date) return [fechaIso_(v)];
  var r = [];
  String(v == null ? '' : v).split(/[,;\n]+/).forEach(function (x) { var f = fechaIso_(x); if (f && r.indexOf(f) < 0) r.push(f); });
  return r.sort();
}
function horasPromo_(v) {
  var m = String(v == null ? '' : v).trim().match(/^(\d{1,2}):(\d{2})\s*-\s*(\d{1,2}):(\d{2})$/);
  if (!m) return null;
  return [('0' + m[1]).slice(-2) + ':' + m[2], ('0' + m[3]).slice(-2) + ':' + m[4]];
}
/** ¿El producto tiene algún dato de calendario? */
function tieneCalendario_(p) {
  return COLS_PROMO.slice(2).some(function (c) { return String(p[c] == null ? '' : p[c]).trim() !== '' || p[c] instanceof Date; });
}
/** Día de la semana (0 = domingo) de una fecha "AAAA-MM-DD", sin depender de la zona horaria. */
function diaDeFecha_(iso) {
  var p = iso.split('-');
  return new Date(Date.UTC(+p[0], +p[1] - 1, +p[2])).getUTCDay();
}
/**
 * ¿La promoción va en esta fecha? (no mira la hora). Devuelve true/false.
 * Es la misma regla que usan la web (app.js) y el panel (calendario).
 */
function promoEnFecha_(p, iso) {
  var desde = fechaIso_(p.promo_desde), hasta = fechaIso_(p.promo_hasta);
  if (desde && iso < desde) return false;
  if (hasta && iso > hasta) return false;
  if (listaFechas_(p.promo_excluir).indexOf(iso) >= 0) return false;
  if (listaFechas_(p.promo_extra).indexOf(iso) >= 0) return true;
  var dias = parsearDias_(p.promo_dias);
  return dias == null || dias.indexOf(diaDeFecha_(iso)) >= 0;
}
/** Texto corto de cuándo va una promoción, para mensajes de error. */
function cuandoPromo_(p) {
  var n = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'];
  var d = parsearDias_(p.promo_dias);
  if (d) d = [1, 2, 3, 4, 5, 6, 0].filter(function (x) { return d.indexOf(x) >= 0; }); // de lunes a domingo
  var txt = d == null ? 'todos los días' : (d.length === 1 ? 'los ' + n[d[0]] : d.map(function (x) { return n[x]; }).join(', ').replace(/, ([^,]*)$/, ' y $1'));
  var h = horasPromo_(p.promo_horas);
  return txt + (h ? ' de ' + h[0] + ' a ' + h[1] : '');
}
/** momento = { dia, min, fecha: 'AAAA-MM-DD' } → { ok, error } */
function promoVigente_(p, momento) {
  if (!tieneCalendario_(p)) return { ok: true };
  var nombre = String(p.nombre || 'Esta promoción');
  if (!momento.fecha || !promoEnFecha_(p, momento.fecha)) return { ok: false, error: nombre + ' no está disponible hoy. Va ' + cuandoPromo_(p) + '.' };
  var h = horasPromo_(p.promo_horas);
  if (h && (momento.min < minutos_(h[0]) || momento.min >= minutos_(h[1]))) return { ok: false, error: nombre + ' solo se puede pedir de ' + h[0] + ' a ' + h[1] + '.' };
  return { ok: true };
}

/** momento = { dia: 0-6 (0 = domingo), min: minutos desde medianoche } */
function estaAbierto_(cfg, momento) {
  var r = horarioDe_(cfg, momento.dia);
  if (!r) return false;
  var a = minutos_(r[0]), c = minutos_(r[1]);
  if (c <= a) return momento.min >= a || momento.min < c; // cierra pasada la medianoche
  return momento.min >= a && momento.min < c;
}

/**
 * Valida un pedido y calcula su total con los precios de la hoja.
 * Devuelve { ok:false, error } o { ok:true, canal, cliente, lineas, total, detalle, ... }
 */
function calcularPedido_(body, cat, cfg, momento) {
  if (!body || typeof body !== 'object') return { ok: false, error: 'Pedido vacío.' };
  if (!esSi_(cfg.pedidos_activos)) return { ok: false, error: 'Por ahora no estamos recibiendo pedidos por la web. Escríbenos por WhatsApp.' };

  var canal = String(body.canal || '');
  if (['delivery', 'recojo', 'mesa'].indexOf(canal) < 0) return { ok: false, error: 'Elige delivery, recojo o mesa.' };
  if (canal === 'recojo' && !esSi_(cfg.recojo_activo)) return { ok: false, error: 'El recojo en local no está disponible.' };

  var abierto = estaAbierto_(cfg, momento);
  var programado = texto_(body.programado, 20);
  if (programado && !/^\d{1,2}:\d{2}$/.test(programado)) programado = '';

  var mesa = '';
  if (canal === 'mesa') {
    if (!esSi_(cfg.pedidos_mesa_activos)) return { ok: false, error: 'Los pedidos desde la mesa no están activos. Llama a tu mozo.' };
    if (!abierto) return { ok: false, error: 'El restaurante está cerrado en este momento.' };
    mesa = texto_(body.mesa, 6);
    var cod = texto_(body.codigo, 20);
    var m = (cat.mesas || []).filter(function (x) { return String(x.mesa) === mesa; })[0];
    if (!m || !esSi_(m.activa) || String(m.codigo) !== cod) return { ok: false, error: 'Este código QR no es válido. Pide ayuda a tu mozo.' };
    programado = '';
  } else if (!abierto) {
    if (!esSi_(cfg.pedidos_fuera_de_horario)) return { ok: false, error: 'En este momento estamos cerrados. Revisa nuestro horario.' };
    if (!programado) return { ok: false, error: 'Estamos cerrados: indica a qué hora quieres tu pedido.' };
  }

  var cliente = {
    nombre: texto_(body.nombre, 60),
    telefono: String(body.telefono || '').replace(/[^\d+]/g, '').slice(0, 16),
    direccion: texto_(body.direccion, 200),
    referencia: texto_(body.referencia, 200),
    pago: texto_(body.pago, 40),
    notas: texto_(body.notas, 300)
  };
  if (canal !== 'mesa') {
    if (cliente.nombre.length < 2) return { ok: false, error: 'Escribe tu nombre.' };
    if (cliente.telefono.replace(/\D/g, '').length < 9) return { ok: false, error: 'Escribe un número de celular válido.' };
    var pagos = String(cfg.metodos_pago || '').split(',').map(function (s) { return s.trim(); }).filter(Boolean);
    if (pagos.length && pagos.indexOf(cliente.pago) < 0) return { ok: false, error: 'Elige un método de pago.' };
  }
  if (canal === 'delivery' && cliente.direccion.length < 5) return { ok: false, error: 'Escribe la dirección de entrega.' };

  var items = Array.isArray(body.items) ? body.items : [];
  if (!items.length) return { ok: false, error: 'Tu pedido está vacío.' };
  if (items.length > 40) return { ok: false, error: 'El pedido tiene demasiadas líneas.' };

  var prod = {}, sec = {};
  (cat.productos || []).forEach(function (p) { prod[String(p.id)] = p; });
  (cat.secciones || []).forEach(function (s) { sec[String(s.id)] = s; });

  var lineas = [], total = 0, hayAlcohol = false;
  for (var i = 0; i < items.length; i++) {
    var it = items[i] || {};
    var p = prod[String(it.id)];
    if (!p || p.tipo === 'salsa' || !esSi_(p.visible)) return { ok: false, error: 'Un producto de tu pedido ya no está en la carta. Actualiza la página.' };
    var s = sec[String(p.seccion)];
    if (!s || !esSi_(s.visible)) return { ok: false, error: 'Un producto de tu pedido ya no está en la carta.' };
    if (!esSi_(p.disponible)) return { ok: false, error: p.nombre + ' está agotado por hoy.' };
    var vig = promoVigente_(p, { dia: momento.dia, fecha: momento.fecha, min: programado ? minutos_(programado) : momento.min });
    if (!vig.ok) return { ok: false, error: vig.error };
    var canalSec = canal === 'mesa' ? s.mesa : s.delivery;
    if (!esSi_(canalSec)) return { ok: false, error: p.nombre + ' no está disponible para este tipo de pedido.' };
    var canalProd = String(p.canal || 'todos').trim().toLowerCase();
    if (canalProd === 'local' && canal !== 'mesa') return { ok: false, error: p.nombre + ' solo está disponible en el local.' };
    if (canalProd === 'delivery' && canal === 'mesa') return { ok: false, error: p.nombre + ' solo está disponible para delivery o recojo.' };

    var cant = Math.floor(Number(it.cant));
    if (!(cant >= 1 && cant <= 20)) return { ok: false, error: 'Cantidad no válida.' };

    var precio = null, tam = '';
    var tams = parsearTamanos_(p.tamanos);
    if (tams.length) {
      var t = tams.filter(function (x) { return x[0] === String(it.tam); })[0];
      if (!t) return { ok: false, error: 'Elige el tamaño de ' + p.nombre + '.' };
      precio = t[1]; tam = t[0];
    } else {
      precio = num_(p.precio);
    }
    if (precio == null) return { ok: false, error: p.nombre + ' se consulta con el mozo y no se puede pedir por la web.' };

    var salsa = null, recargo = 0, sp = null;
    if (esSi_(p.requiere_salsa)) {
      sp = prod[String(it.salsa)];
      if (!sp || sp.tipo !== 'salsa' || !esSi_(sp.visible)) return { ok: false, error: 'Elige la salsa de ' + p.nombre + '.' };
      if (!esSi_(sp.disponible)) return { ok: false, error: 'La salsa ' + sp.nombre + ' está agotada por hoy.' };
      salsa = sp.nombre; recargo = num_(sp.recargo) || 0;
    }
    if (esSi_(s.alcohol)) hayAlcohol = true;

    // Opciones (término, picante, extras...): del plato y de su salsa
    var grupos = gruposOpciones_(cat.opciones);
    var permitidos = listaIds_(p.opciones).concat(sp ? listaIds_(sp.opciones) : []);
    var elegidas = it.ops && typeof it.ops === 'object' ? it.ops : {};
    var extraOps = 0, opsTxt = [];
    for (var gi = 0; gi < permitidos.length; gi++) {
      var gid = permitidos[gi], grp = grupos[gid];
      if (!grp || opsTxt.some(function (x) { return x.id === gid; })) continue;
      var pedidas = Array.isArray(elegidas[gid]) ? elegidas[gid] : (elegidas[gid] ? [elegidas[gid]] : []);
      var validas = [];
      pedidas.slice(0, 30).forEach(function (nm) {
        var o = grp.ops.filter(function (x) { return x.n === String(nm); })[0];
        if (o && validas.indexOf(o) < 0) validas.push(o);
      });
      if (grp.tipo === 'una') validas = validas.slice(0, 1);
      if (grp.req && !validas.length) return { ok: false, error: 'Elige ' + grp.n.toLowerCase() + ' para ' + p.nombre + '.' };
      validas.forEach(function (o) { extraOps += o.p; });
      if (validas.length) opsTxt.push({ id: gid, g: grp.n, v: validas.map(function (o) { return o.n + (o.p ? ' (+' + soles_(o.p) + ')' : ''); }) });
    }
    var unit = precio + recargo + extraOps;
    var sub = Math.round(unit * cant * 100) / 100;
    total += sub;
    lineas.push({ id: String(p.id), nombre: String(p.nombre), tam: tam, salsa: salsa, recargo: recargo, cant: cant,
      unit: unit, subtotal: sub, nota: texto_(it.nota, 120), seccion: String(p.seccion),
      opciones: opsTxt.map(function (x) { return { g: x.g, v: x.v }; }) });
  }
  if (hayAlcohol && canal !== 'mesa' && body.mayorEdad !== true) {
    return { ok: false, error: 'Confirma que eres mayor de 18 años para pedir bebidas alcohólicas.' };
  }
  total = Math.round(total * 100) / 100;

  var detalle = lineas.map(function (l) {
    var t = l.cant + ' × ' + l.nombre + (l.tam ? ' (' + l.tam + ')' : '') + ' — ' + soles_(l.subtotal);
    if (l.salsa) t += '\n    Salsa: ' + l.salsa + (l.recargo ? ' (+' + soles_(l.recargo) + ')' : '');
    (l.opciones || []).forEach(function (o) { t += '\n    ' + o.g + ': ' + o.v.join(', '); });
    if (l.nota) t += '\n    Nota: ' + l.nota;
    return t;
  }).join('\n');

  var origen = String(body.origen || '').toLowerCase().replace(/[^a-z0-9_-]/g, '').slice(0, 30);
  return { ok: true, canal: canal, mesa: mesa, programado: programado, cliente: cliente, lineas: lineas,
    total: total, detalle: detalle, abierto: abierto, origen: origen };
}

/** Construye el objeto CARTA que usa la web (menu-data.js). */
function construirCarta_(cfg, secciones, productos, opciones) {
  var dias = {};
  for (var d = 0; d < 7; d++) dias[d] = horarioDe_(cfg, d);
  var orden = function (a, b) { return (num_(a.orden) || 0) - (num_(b.orden) || 0); };
  var visibles = productos.filter(function (p) { return esSi_(p.visible) && p.nombre; });

  var grupos = gruposOpciones_(opciones);
  var opsDe = function (p) { return listaIds_(p.opciones).filter(function (g) { return grupos[g]; }); };
  var salsas = visibles.filter(function (p) { return p.tipo === 'salsa'; }).sort(orden).map(function (p) {
    var o = { id: String(p.id), n: String(p.nombre), extra: num_(p.recargo) || 0, agotado: !esSi_(p.disponible) };
    if (opsDe(p).length) o.op = opsDe(p);
    return o;
  });

  var secs = secciones.filter(function (s) { return esSi_(s.visible); }).sort(orden).map(function (s) {
    var lista = [], idx = {};
    visibles.filter(function (p) { return String(p.seccion) === String(s.id); }).sort(orden).forEach(function (p) {
      var g = String(p.grupo || '');
      if (!(g in idx)) { idx[g] = lista.length; lista.push({ titulo: g, nota: String(p.grupo_nota || ''), items: [] }); }
      var it = { id: String(p.id), n: String(p.nombre) };
      if (p.glosa) it.g = String(p.glosa);
      if (p.descripcion) it.d = String(p.descripcion);
      var tams = parsearTamanos_(p.tamanos);
      if (tams.length) it.t = tams; else if (num_(p.precio) != null) it.p = num_(p.precio);
      if (num_(p.recargo)) it.extra = num_(p.recargo);
      if (p.tipo === 'salsa') it.tipo = 'salsa';
      if (esSi_(p.requiere_salsa)) it.salsa = true;
      if (!esSi_(p.disponible)) it.agotado = true;
      if (p.destacado) it.destacado = String(p.destacado);
      var al = String(p.alergenos || '').split(',').map(function (x) { return x.trim(); }).filter(function (x) { return ALERGENOS[x]; });
      if (al.length) it.al = al;
      if (p.foto) it.foto = String(p.foto);
      var cn = String(p.canal || 'todos').trim().toLowerCase();
      if (cn === 'local' || cn === 'delivery') it.canal = cn;
      if (num_(p.precio_antes) != null) it.pa = num_(p.precio_antes);
      if (opsDe(p).length) it.op = opsDe(p);
      if (p.nombre_en) it.n_en = String(p.nombre_en);
      if (p.glosa_en) it.g_en = String(p.glosa_en);
      if (p.descripcion_en) it.d_en = String(p.descripcion_en);
      var inc = String(p.incluye || '').split(/\n|;/).map(function (x) { return x.trim(); }).filter(Boolean);
      if (inc.length) it.inc = inc;
      var incEn = String(p.incluye_en || '').split(/\n|;/).map(function (x) { return x.trim(); }).filter(Boolean);
      if (incEn.length) it.inc_en = incEn;
      if (tieneCalendario_(p)) {
        var pr = {}, dd = parsearDias_(p.promo_dias), hh = horasPromo_(p.promo_horas);
        if (dd != null) pr.dias = dd;
        if (fechaIso_(p.promo_desde)) pr.desde = fechaIso_(p.promo_desde);
        if (fechaIso_(p.promo_hasta)) pr.hasta = fechaIso_(p.promo_hasta);
        if (hh) pr.horas = hh;
        if (listaFechas_(p.promo_excluir).length) pr.excluir = listaFechas_(p.promo_excluir);
        if (listaFechas_(p.promo_extra).length) pr.extra = listaFechas_(p.promo_extra);
        it.promo = pr;
      }
      lista[idx[g]].items.push(it);
    });
    return { id: String(s.id), titulo: String(s.titulo), subtitulo: String(s.subtitulo || ''), intro: String(s.intro || ''),
      pie: String(s.pie || ''), alcohol: esSi_(s.alcohol), delivery: esSi_(s.delivery), mesa: esSi_(s.mesa), grupos: lista,
      titulo_en: String(s.titulo_en || ''), subtitulo_en: String(s.subtitulo_en || ''), intro_en: String(s.intro_en || ''), pie_en: String(s.pie_en || '') };
  });

  return {
    negocio: {
      nombre: cfg.nombre || 'Pasta Gallo', desde: cfg.desde || '', direccion: cfg.direccion || '',
      telefono: String(cfg.telefono || ''), whatsapp: String(cfg.whatsapp || ''), mensajeWhatsapp: cfg.mensaje_whatsapp || '',
      instagram: cfg.instagram || '', tiktok: cfg.tiktok || '', facebookUrl: cfg.facebook_url || '',
      horarioTexto: cfg.horario_texto || '', cerradoTexto: cfg.cerrado_texto || '',
      sitioUrl: String(cfg.sitio_url || '').replace(/\/+$/, ''),
      horarioTexto_en: cfg.horario_texto_en || '', cerradoTexto_en: cfg.cerrado_texto_en || ''
    },
    horario: { zona: cfg.zona_horaria || 'America/Lima', dias: dias },
    historia: {
      eyebrow: cfg.historia_eyebrow || '', titulo: cfg.historia_titulo || '',
      parrafos: String(cfg.historia_texto || '').split(/\n\s*\n/).map(function (x) { return x.trim(); }).filter(Boolean),
      eyebrow_en: cfg.historia_eyebrow_en || '', titulo_en: cfg.historia_titulo_en || '',
      parrafos_en: String(cfg.historia_texto_en || '').split(/\n\s*\n/).map(function (x) { return x.trim(); }).filter(Boolean)
    },
    alergenos: ALERGENOS,
    pedidos: {
      api: cfg.api_url || '', activos: esSi_(cfg.pedidos_activos), fueraHorario: esSi_(cfg.pedidos_fuera_de_horario),
      mesaActivos: esSi_(cfg.pedidos_mesa_activos), recojo: esSi_(cfg.recojo_activo),
      metodosPago: String(cfg.metodos_pago || '').split(',').map(function (x) { return x.trim(); }).filter(Boolean),
      textoDelivery: cfg.texto_delivery || '', textoDelivery_en: cfg.texto_delivery_en || ''
    },
    opciones: grupos,
    salsas: salsas,
    secciones: secs
  };
}

/** Métricas del dashboard a partir de las filas de Pedidos (objetos). */
function calcularDashboard_(pedidos, desde, hasta, zonaFmt) {
  var validos = pedidos.filter(function (p) { return p.fecha >= desde && p.fecha < hasta; });
  var cancel = validos.filter(function (p) { return p.estado === 'Cancelado'; }).length;
  var ok = validos.filter(function (p) { return p.estado !== 'Cancelado'; });
  var ventas = 0, porDia = {}, porHora = {}, porCanal = {}, porProd = {}, tiempos = [];
  var porSemana = [0, 1, 2, 3, 4, 5, 6].map(function () { return { pedidos: 0, ventas: 0 }; });
  var porPromo = {}, porOrigen = {}, conPromo = { pedidos: 0, ventas: 0 }, sinPromo = { pedidos: 0, ventas: 0 };
  ok.forEach(function (p) {
    var t = Number(p.total) || 0; ventas += t;
    if (p.estado === 'Entregado' && p.actualizado instanceof Date && p.fecha instanceof Date) {
      var mins = (p.actualizado.getTime() - p.fecha.getTime()) / 60000;
      if (mins > 0 && mins < 600) tiempos.push(mins);
    }
    var dia = zonaFmt(p.fecha, 'yyyy-MM-dd'), hora = zonaFmt(p.fecha, 'HH');
    porDia[dia] = (porDia[dia] || 0) + t;
    porHora[hora] = (porHora[hora] || 0) + 1;
    var c = p.canal === 'mesa' ? 'Mesa' : p.canal === 'recojo' ? 'Recojo' : 'Delivery';
    if (!porCanal[c]) porCanal[c] = { pedidos: 0, ventas: 0 };
    porCanal[c].pedidos++; porCanal[c].ventas += t;
    var items = []; try { items = JSON.parse(p.items_json || '[]'); } catch (e) { items = []; }
    var hayPromo = false;
    items.forEach(function (l) {
      var k = l.nombre + (l.tam ? ' (' + l.tam + ')' : '');
      if (!porProd[k]) porProd[k] = { nombre: k, cant: 0, ventas: 0 };
      porProd[k].cant += l.cant; porProd[k].ventas += l.subtotal;
      if (l.seccion === 'promociones') {
        hayPromo = true;
        if (!porPromo[l.nombre]) porPromo[l.nombre] = { nombre: l.nombre, cant: 0, ventas: 0 };
        porPromo[l.nombre].cant += l.cant; porPromo[l.nombre].ventas += l.subtotal;
      }
    });
    var grupo = hayPromo ? conPromo : sinPromo; grupo.pedidos++; grupo.ventas += t;
    var ds = Number(zonaFmt(p.fecha, 'u')) % 7; porSemana[ds].pedidos++; porSemana[ds].ventas += t;
    var o = String(p.origen || '').trim() || 'directo';
    if (!porOrigen[o]) porOrigen[o] = { pedidos: 0, ventas: 0 };
    porOrigen[o].pedidos++; porOrigen[o].ventas += t;
  });
  var r2 = function (n) { return Math.round(n * 100) / 100; };
  [conPromo, sinPromo].forEach(function (g) { g.ventas = r2(g.ventas); g.ticket = g.pedidos ? r2(g.ventas / g.pedidos) : 0; });
  var top = Object.keys(porProd).map(function (k) { return porProd[k]; })
    .sort(function (a, b) { return b.cant - a.cant || b.ventas - a.ventas; }).slice(0, 10);
  return {
    ventas: Math.round(ventas * 100) / 100, pedidos: ok.length, cancelados: cancel,
    ticket: ok.length ? Math.round(ventas / ok.length * 100) / 100 : 0,
    porDia: porDia, porHora: porHora, porCanal: porCanal, top: top,
    porSemana: porSemana.map(function (x) { return { pedidos: x.pedidos, ventas: r2(x.ventas) }; }),
    promos: Object.keys(porPromo).map(function (k) { return porPromo[k]; }).sort(function (a, b) { return b.cant - a.cant; }),
    conPromo: conPromo, sinPromo: sinPromo, porOrigen: porOrigen,
    tiempoProm: tiempos.length ? Math.round(tiempos.reduce(function (a, b) { return a + b; }, 0) / tiempos.length) : null
  };
}

/* =========================== API PÚBLICA (web) =========================== */
function doGet(e) {
  if (!(e && e.parameter && e.parameter.estado)) {
    var t = HtmlService.createTemplateFromFile('Panel');
    t.modoWeb = true;
    return t.evaluate().setTitle('Panel · Pasta Gallo')
      .addMetaTag('viewport', 'width=device-width, initial-scale=1');
  }
  var cfg = leerConfig_();
  var momento = momentoActual_(cfg);
  return json_({ ok: true, servicio: 'Pasta Gallo', abierto: estaAbierto_(cfg, momento), pedidos: esSi_(cfg.pedidos_activos) });
}

function doPost(e) {
  var res;
  try {
    var body = JSON.parse(e && e.postData && e.postData.contents || '{}');
    res = registrarPedido_(body);
  } catch (err) {
    console.error(err);
    res = { ok: false, error: 'No pudimos registrar tu pedido. Intenta de nuevo o escríbenos por WhatsApp.' };
  }
  return json_(res);
}

function json_(o) {
  return ContentService.createTextOutput(JSON.stringify(o)).setMimeType(ContentService.MimeType.JSON);
}

function momentoActual_(cfg) {
  var zona = cfg.zona_horaria || 'America/Lima';
  var ahora = new Date();
  var u = Number(Utilities.formatDate(ahora, zona, 'u')); // 1 = lunes ... 7 = domingo
  var hm = Utilities.formatDate(ahora, zona, 'HH:mm');
  return { dia: u % 7, min: minutos_(hm), fecha: Utilities.formatDate(ahora, zona, 'yyyy-MM-dd') };
}

function registrarPedido_(body) {
  if (body && body.web) return { ok: true, numero: 0 }; // trampa para robots
  if (JSON.stringify(body).length > 20000) return { ok: false, error: 'Pedido demasiado grande.' };

  var cache = CacheService.getScriptCache();
  var minuto = 'min:' + Math.floor(Date.now() / 60000);
  var cuenta = Number(cache.get(minuto) || 0);
  if (cuenta >= 25) return { ok: false, error: 'Estamos recibiendo muchos pedidos. Intenta en un minuto.' };
  cache.put(minuto, String(cuenta + 1), 120);

  var cfg = leerConfig_();
  var cat = leerCatalogo_();
  var r = calcularPedido_(body, cat, cfg, momentoActual_(cfg));
  if (!r.ok) return r;

  if (r.canal !== 'mesa') {
    var kt = 'tel:' + r.cliente.telefono;
    var nt = Number(cache.get(kt) || 0);
    if (nt >= 4) return { ok: false, error: 'Ya recibimos varios pedidos de este número. Escríbenos por WhatsApp.' };
    cache.put(kt, String(nt + 1), 900);
  } else {
    var km = 'mesa:' + r.mesa;
    var nm = Number(cache.get(km) || 0);
    if (nm >= 8) return { ok: false, error: 'Tu mesa envió varios pedidos seguidos. Llama a tu mozo.' };
    cache.put(km, String(nm + 1), 600);
  }

  var lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    var props = PropertiesService.getScriptProperties();
    var numero = Number(props.getProperty('ULTIMO_PEDIDO') || 0) + 1;
    props.setProperty('ULTIMO_PEDIDO', String(numero));
    var ahora = new Date();
    var fila = {
      numero: numero, fecha: ahora, canal: r.canal, mesa: r.mesa, nombre: r.cliente.nombre,
      telefono: r.cliente.telefono, direccion: r.cliente.direccion, referencia: r.cliente.referencia,
      pago: r.cliente.pago, programado: r.programado ? "'" + r.programado : '', detalle: r.detalle, total: r.total, estado: 'Nuevo',
      notas: r.cliente.notas, items_json: JSON.stringify(r.lineas), actualizado: ahora, historial: 'Nuevo ' + fmt_(ahora, 'HH:mm'),
      origen: r.origen
    };
    var h = SpreadsheetApp.getActive().getSheetByName(HOJA.pedidos);
    var cab = asegurarColumnas_(h, COLS.pedidos);
    h.appendRow(cab.map(function (c) { return protegerCelda_(fila[c] == null ? '' : fila[c]); }));
    props.setProperty('PEDIDOS_VERSION', String(Date.now()));
  } finally {
    lock.releaseLock();
  }
  return { ok: true, numero: numero, total: r.total, detalle: r.detalle, lineas: r.lineas };
}

/** Evita que un texto escrito por el cliente se interprete como fórmula en el Sheets. */
function protegerCelda_(v) {
  if (typeof v === 'string' && /^[=+\-@]/.test(v)) return "'" + v;
  return v;
}

function fmt_(fecha, patron) {
  var cfg = leerConfig_();
  return Utilities.formatDate(fecha, cfg.zona_horaria || 'America/Lima', patron);
}

/* =========================== SEGURIDAD DEL PANEL =========================== */
/**
 * Dos formas de entrar al panel:
 * 1) Desde el Google Sheets (menú): se verifica la cuenta de Google (debe ser editor).
 * 2) Desde el link de la aplicación web: se necesita la contraseña del panel. Al entrar
 *    se crea una sesión temporal (6 horas) que se guarda solo en el servidor.
 */
function exigirAdmin_(sesion) {
  if (sesion) {
    var v = CacheService.getScriptCache().get('ses:' + String(sesion).slice(0, 80));
    var gen = PropertiesService.getScriptProperties().getProperty('PANEL_GEN') || '0';
    if (v) {
      var o = JSON.parse(v);
      if (o.g === gen) return o.n;
    }
    throw new Error('SESION_VENCIDA');
  }
  var email = String(Session.getActiveUser().getEmail() || '').toLowerCase();
  if (!email) throw new Error('No pudimos identificar tu cuenta de Google. Abre el panel desde el menú del Google Sheets.');
  var ss = SpreadsheetApp.getActive();
  var permitidos = ss.getEditors().map(function (u) { return String(u.getEmail()).toLowerCase(); });
  try { permitidos.push(String(ss.getOwner().getEmail()).toLowerCase()); } catch (e) { /* sin dueño visible */ }
  String(leerConfig_().admins || '').split(',').forEach(function (x) { if (x.trim()) permitidos.push(x.trim().toLowerCase()); });
  if (permitidos.indexOf(email) < 0) throw new Error('Tu cuenta (' + email + ') no tiene permiso para usar el panel.');
  return email;
}

/* =========================== FUNCIONES DEL PANEL =========================== */
function panelInicio(sesion) {
  var email = exigirAdmin_(sesion);
  var cfg = leerConfig_();
  var props = PropertiesService.getScriptProperties();
  return {
    usuario: email, estados: ESTADOS, alergenos: ALERGENOS,
    sitio: cfg.sitio_url || '', repo: cfg.github_repo || '', rama: cfg.github_rama || 'main',
    api: cfg.api_url || '', tokenListo: !!props.getProperty('GITHUB_TOKEN'),
    pendientes: props.getProperty('CAMBIOS_PENDIENTES') === 'SI', claveLista: !!props.getProperty('PANEL_CLAVE'),
    ultimaPublicacion: props.getProperty('ULTIMA_PUBLICACION') || '',
    abierto: estaAbierto_(cfg, momentoActual_(cfg)),
    minutosAlerta: num_(cfg.minutos_alerta) || 45, ahora: Date.now(),
    horario: [0, 1, 2, 3, 4, 5, 6].map(function (d) { return horarioDe_(cfg, d); }),
    hoy: Utilities.formatDate(new Date(), cfg.zona_horaria || 'America/Lima', 'yyyy-MM-dd')
  };
}

/** Convierte cualquier celda a texto. Sheets transforma "20:30" en una fecha, y google.script.run
 *  no puede enviar fechas al panel (devuelve null): por eso todo se pasa a texto. */
function celdaTexto_(v, formato) {
  if (v instanceof Date) {
    var tz = SpreadsheetApp.getActive().getSpreadsheetTimeZone() || 'America/Lima';
    return Utilities.formatDate(v, tz, formato || 'HH:mm');
  }
  return v == null ? '' : String(v);
}

function pedidoAObjeto_(p, zona) {
  return {
    numero: p.numero, fecha: p.fecha instanceof Date ? Utilities.formatDate(p.fecha, zona, 'dd/MM HH:mm') : String(p.fecha),
    hora: p.fecha instanceof Date ? Utilities.formatDate(p.fecha, zona, 'HH:mm') : '',
    dia: p.fecha instanceof Date ? Utilities.formatDate(p.fecha, zona, 'yyyy-MM-dd') : '',
    canal: celdaTexto_(p.canal), mesa: celdaTexto_(p.mesa), nombre: celdaTexto_(p.nombre), telefono: celdaTexto_(p.telefono),
    direccion: celdaTexto_(p.direccion), referencia: celdaTexto_(p.referencia), pago: celdaTexto_(p.pago),
    programado: celdaTexto_(p.programado), detalle: celdaTexto_(p.detalle), total: Number(p.total) || 0,
    estado: celdaTexto_(p.estado), notas: celdaTexto_(p.notas), historial: celdaTexto_(p.historial),
    ts: p.fecha instanceof Date ? p.fecha.getTime() : 0,
    act: p.actualizado instanceof Date ? p.actualizado.getTime() : 0
  };
}

/** Lista de pedidos para el panel. modo = 'activos' | 'hoy' | 'todos' (últimos 300). */
function listarPedidos(sesion, modo) {
  exigirAdmin_(sesion);
  var cfg = leerConfig_(), zona = cfg.zona_horaria || 'America/Lima';
  var hoy = Utilities.formatDate(new Date(), zona, 'yyyy-MM-dd');
  var filas = leerTabla_(HOJA.pedidos).map(function (p) { return pedidoAObjeto_(p, zona); });
  var activos = ['Nuevo', 'Confirmado', 'En preparación', 'Listo', 'En camino'];
  if (modo === 'activos') filas = filas.filter(function (p) { return activos.indexOf(p.estado) >= 0; });
  else if (modo === 'hoy') filas = filas.filter(function (p) { return p.dia === hoy; });
  filas = filas.slice(-300).reverse();
  return { pedidos: filas, version: PropertiesService.getScriptProperties().getProperty('PEDIDOS_VERSION') || '' };
}

function versionPedidos(sesion) {
  exigirAdmin_(sesion);
  return PropertiesService.getScriptProperties().getProperty('PEDIDOS_VERSION') || '';
}

function cambiarEstado(sesion, numero, estado) {
  var email = exigirAdmin_(sesion);
  if (ESTADOS.indexOf(estado) < 0) throw new Error('Estado no válido.');
  var h = SpreadsheetApp.getActive().getSheetByName(HOJA.pedidos);
  var n = h.getLastRow();
  if (n < 2) throw new Error('No hay pedidos.');
  var nums = h.getRange(2, 1, n - 1, 1).getValues();
  for (var i = nums.length - 1; i >= 0; i--) {
    if (String(nums[i][0]) === String(numero)) {
      var fila = i + 2;
      var cEst = COLS.pedidos.indexOf('estado') + 1, cAct = COLS.pedidos.indexOf('actualizado') + 1, cHis = COLS.pedidos.indexOf('historial') + 1;
      var ahora = new Date();
      h.getRange(fila, cEst).setValue(estado);
      h.getRange(fila, cAct).setValue(ahora);
      var his = String(h.getRange(fila, cHis).getValue() || '');
      h.getRange(fila, cHis).setValue((his ? his + ' · ' : '') + estado + ' ' + fmt_(ahora, 'HH:mm') + ' (' + email.split('@')[0] + ')');
      PropertiesService.getScriptProperties().setProperty('PEDIDOS_VERSION', String(Date.now()));
      return true;
    }
  }
  throw new Error('No se encontró el pedido #' + numero);
}

function dashboard(sesion, periodo) {
  exigirAdmin_(sesion);
  var cfg = leerConfig_(), zona = cfg.zona_horaria || 'America/Lima';
  var ahora = new Date();
  var hoyStr = Utilities.formatDate(ahora, zona, 'yyyy-MM-dd');
  var inicioHoy = Utilities.parseDate(hoyStr + ' 00:00', zona, 'yyyy-MM-dd HH:mm');
  var dias = { hoy: 1, '7': 7, '30': 30, '90': 90 }[periodo] || 7;
  var desde = new Date(inicioHoy.getTime() - (dias - 1) * 86400000);
  if (periodo === 'mes') desde = Utilities.parseDate(hoyStr.slice(0, 8) + '01 00:00', zona, 'yyyy-MM-dd HH:mm');
  var hasta = new Date(inicioHoy.getTime() + 86400000);
  var pedidos = leerTabla_(HOJA.pedidos).filter(function (p) { return p.fecha instanceof Date; });
  var r = calcularDashboard_(pedidos, desde, hasta, function (f, pat) { return Utilities.formatDate(f, zona, pat); });
  var lista = [];
  for (var t = desde.getTime(); t < hasta.getTime(); t += 86400000) {
    var k = Utilities.formatDate(new Date(t + 3600000 * 12), zona, 'yyyy-MM-dd');
    if (lista.indexOf(k) < 0) lista.push(k);
  }
  r.dias = lista.map(function (k) { return [k, Math.round((r.porDia[k] || 0) * 100) / 100]; });
  return r;
}

/* ---------- carta ---------- */
function listarCarta(sesion) {
  exigirAdmin_(sesion);
  var productos = leerTabla_(HOJA.productos).map(function (p) {
    // google.script.run no puede enviar fechas: se pasan a texto
    p.promo_desde = fechaIso_(p.promo_desde); p.promo_hasta = fechaIso_(p.promo_hasta);
    p.promo_excluir = listaFechas_(p.promo_excluir).join(', '); p.promo_extra = listaFechas_(p.promo_extra).join(', ');
    p.promo_horas = (horasPromo_(celdaTexto_(p.promo_horas)) || []).join('-');
    Object.keys(p).forEach(function (k) { if (p[k] instanceof Date) p[k] = celdaTexto_(p[k], 'yyyy-MM-dd HH:mm'); });
    return p;
  });
  return { secciones: leerTabla_(HOJA.secciones), productos: productos };
}

function guardarProducto(sesion, p) {
  exigirAdmin_(sesion);
  if (!p || !String(p.nombre || '').trim()) throw new Error('El producto necesita un nombre.');
  var secs = leerTabla_(HOJA.secciones).map(function (s) { return String(s.id); });
  if (secs.indexOf(String(p.seccion)) < 0) throw new Error('Elige una sección válida.');
  if (String(p.precio).trim() !== '' && num_(p.precio) == null) throw new Error('El precio debe ser un número (ej.: 32 o 32.50).');
  if (String(p.recargo || '').trim() !== '' && num_(p.recargo) == null) throw new Error('El recargo debe ser un número.');
  if (p.tamanos && !parsearTamanos_(p.tamanos).length) throw new Error('Tamaños: usa el formato Personale=22; Media=33; Famiglia=50');
  if (String(p.precio_antes || '').trim() !== '' && num_(p.precio_antes) == null) throw new Error('El precio anterior debe ser un número.');
  p.canal = String(p.canal || 'todos').trim().toLowerCase();
  if (CANALES.indexOf(p.canal) < 0) throw new Error('Canal no válido.');
  var gruposValidos = gruposOpciones_(leerTabla_(HOJA.opciones));
  p.opciones = listaIds_(p.opciones).filter(function (g) { return gruposValidos[g]; }).join(', ');
  normalizarPromo_(p);
  var h = SpreadsheetApp.getActive().getSheetByName(HOJA.productos);
  asegurarColumnas_(h, COLS.productos);
  var datos = leerTabla_(HOJA.productos);
  if (!p.id) {
    var base = String(p.seccion) + '-' + String(p.nombre).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
      .replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
    var id = base, k = 2;
    while (datos.some(function (d) { return String(d.id) === id; })) id = base + '-' + (k++);
    p.id = id;
  }
  var limpio = {};
  COLS.productos.forEach(function (c) {
    if (COLS_PROMO.indexOf(c) >= 0 && !(c in p)) return; // no vino del panel: se conserva lo que había
    var v = p[c] == null ? '' : p[c];
    if (typeof v === 'string') v = v.trim();
    if (['requiere_salsa', 'disponible', 'visible'].indexOf(c) >= 0) v = esSi_(v) ? 'SI' : 'NO';
    if (c === 'precio' || c === 'recargo' || c === 'orden' || c === 'precio_antes') v = v === '' ? '' : num_(v);
    limpio[c] = v;
  });
  if (!limpio.tipo) limpio.tipo = 'plato';
  var cab = h.getRange(1, 1, 1, h.getLastColumn()).getValues()[0].map(function (c) { return String(c).trim(); });
  var ex = datos.filter(function (d) { return String(d.id) === String(p.id); })[0];
  var fila = cab.map(function (c) { return c in limpio ? limpio[c] : (ex && c in ex ? ex[c] : ''); });
  if (ex) h.getRange(ex._fila, 1, 1, fila.length).setValues([fila]);
  else h.appendRow(fila);
  autoPublicar_(sesion);
  return limpio;
}

/** Valida y deja en formato estándar los campos de promoción que vengan en p (los que no vengan no se tocan). */
function normalizarPromo_(p) {
  if ('promo_dias' in p) {
    var d = parsearDias_(p.promo_dias);
    if (String(p.promo_dias || '').trim() && String(p.promo_dias).trim().toLowerCase() !== 'todos' && (!d || !d.length)) throw new Error('Días no válidos. Usa por ejemplo: mar, mie, jue');
    p.promo_dias = diasTexto_(d);
  }
  ['promo_desde', 'promo_hasta'].forEach(function (c) {
    if (!(c in p)) return;
    var v = String(p[c] || '').trim();
    if (v && !fechaIso_(v)) throw new Error('Fecha no válida (' + v + '). Usa AAAA-MM-DD, por ejemplo 2026-12-24.');
    p[c] = v ? "'" + fechaIso_(v) : '';
  });
  if (p.promo_desde && p.promo_hasta && p.promo_desde > p.promo_hasta) throw new Error('La fecha "desde" es posterior a la fecha "hasta".');
  if ('promo_horas' in p) {
    var hv = String(p.promo_horas || '').trim();
    if (hv && !horasPromo_(hv)) throw new Error('Horario de la promoción no válido. Usa 18:00-21:00 o déjalo vacío.');
    p.promo_horas = hv ? "'" + horasPromo_(hv).join('-') : '';
  }
  ['promo_excluir', 'promo_extra'].forEach(function (c) {
    if (!(c in p)) return;
    var bruto = String(p[c] || '').split(/[,;\n]+/).map(function (x) { return x.trim(); }).filter(Boolean);
    bruto.forEach(function (x) { if (!fechaIso_(x)) throw new Error('Fecha no válida en la lista (' + x + '). Usa AAAA-MM-DD.'); });
    p[c] = listaFechas_(bruto.join(',')).join(', ');
    if (p[c] && p[c].indexOf(',') < 0) p[c] = "'" + p[c]; // una sola fecha: que Sheets no la convierta
  });
  ['incluye', 'incluye_en'].forEach(function (c) {
    if (c in p) p[c] = String(p[c] || '').split(/\n|;/).map(function (x) { return x.trim(); }).filter(Boolean).join('\n');
  });
}

/** Activa o desactiva UNA promoción en UNA fecha (desde el calendario del panel). */
function cambiarFechaPromo(sesion, id, fecha, activar) {
  exigirAdmin_(sesion);
  var iso = fechaIso_(fecha);
  if (!iso) throw new Error('Fecha no válida.');
  var p = leerTabla_(HOJA.productos).filter(function (d) { return String(d.id) === String(id); })[0];
  if (!p) throw new Error('Promoción no encontrada.');
  var exc = listaFechas_(p.promo_excluir), ext = listaFechas_(p.promo_extra);
  var sinQuitar = function (l) { return l.filter(function (x) { return x !== iso; }); };
  exc = sinQuitar(exc); ext = sinQuitar(ext);
  var base = { promo_dias: p.promo_dias, promo_desde: p.promo_desde, promo_hasta: p.promo_hasta, promo_excluir: exc.join(','), promo_extra: ext.join(',') };
  var porDefecto = promoEnFecha_(base, iso);
  if (activar && !porDefecto) {
    var d = fechaIso_(p.promo_desde), ha = fechaIso_(p.promo_hasta);
    if ((d && iso < d) || (ha && iso > ha)) throw new Error('Esa fecha está fuera del rango de la promoción (' + (d || '…') + ' a ' + (ha || '…') + '). Cambia el rango en "Editar".');
    ext.push(iso);
  }
  if (!activar && porDefecto) exc.push(iso);
  var h = SpreadsheetApp.getActive().getSheetByName(HOJA.productos);
  var cab = asegurarColumnas_(h, COLS.productos);
  var fmt = function (l) { l = l.sort(); return l.length === 1 ? "'" + l[0] : l.join(', '); };
  h.getRange(p._fila, cab.indexOf('promo_excluir') + 1).setValue(fmt(exc));
  h.getRange(p._fila, cab.indexOf('promo_extra') + 1).setValue(fmt(ext));
  autoPublicar_(sesion);
  return { promo_excluir: exc.sort().join(', '), promo_extra: ext.sort().join(', ') };
}

function cambiarCampoProducto(sesion, id, campo, valor) {
  exigirAdmin_(sesion);
  if (['disponible', 'visible'].indexOf(campo) < 0) throw new Error('Campo no permitido.');
  var p = leerTabla_(HOJA.productos).filter(function (d) { return String(d.id) === String(id); })[0];
  if (!p) throw new Error('Producto no encontrado.');
  var h = SpreadsheetApp.getActive().getSheetByName(HOJA.productos);
  var col = h.getRange(1, 1, 1, h.getLastColumn()).getValues()[0].map(String).indexOf(campo) + 1;
  h.getRange(p._fila, col).setValue(valor ? 'SI' : 'NO');
  autoPublicar_(sesion);
  return true;
}

/** Guardar = publicar: tras cada cambio del panel se sube la carta a la web.
 *  Si GitHub aún no está conectado, el cambio queda pendiente (no da error).
 *  Si la publicación falla, el cambio YA está guardado en la hoja y se avisa para reintentar. */
function autoPublicar_(sesion) {
  marcarPendiente_();
  if (!PropertiesService.getScriptProperties().getProperty('GITHUB_TOKEN')) return false;
  try { publicarCarta(sesion); return true; }
  catch (e) {
    throw new Error('Se guardó en la hoja, pero no se pudo publicar en la web (' + (e && e.message || e) + '). Pulsa "Reintentar publicación".');
  }
}

function marcarPendiente_() {
  limpiarCache_();
  PropertiesService.getScriptProperties().setProperty('CAMBIOS_PENDIENTES', 'SI');
}

/* ---------- ajustes ---------- */
var CLAVES_EDITABLES = ['nombre', 'desde', 'direccion', 'telefono', 'whatsapp', 'mensaje_whatsapp', 'instagram', 'tiktok',
  'facebook_url', 'horario_texto', 'cerrado_texto', 'horario_lunes', 'horario_martes', 'horario_miercoles', 'horario_jueves',
  'horario_viernes', 'horario_sabado', 'horario_domingo', 'historia_eyebrow', 'historia_titulo', 'historia_texto',
  'pedidos_activos', 'pedidos_fuera_de_horario', 'pedidos_mesa_activos', 'metodos_pago', 'recojo_activo', 'texto_delivery',
  'api_url', 'sitio_url', 'github_repo', 'github_rama', 'admins', 'minutos_alerta',
  'historia_eyebrow_en', 'historia_titulo_en', 'historia_texto_en', 'texto_delivery_en', 'horario_texto_en', 'cerrado_texto_en'];

function leerAjustes(sesion) {
  exigirAdmin_(sesion);
  var cfg = leerConfig_(), o = {};
  CLAVES_EDITABLES.forEach(function (k) { o[k] = cfg[k] == null ? '' : String(cfg[k]); });
  return o;
}

function guardarAjustes(sesion, o) {
  exigirAdmin_(sesion);
  Object.keys(o || {}).forEach(function (k) {
    if (CLAVES_EDITABLES.indexOf(k) < 0) return;
    var v = String(o[k] == null ? '' : o[k]).trim();
    if (/^horario_(lunes|martes|miercoles|jueves|viernes|sabado|domingo)$/.test(k) && v && v.toLowerCase() !== 'cerrado'
      && !/^\d{1,2}:\d{2}\s*-\s*\d{1,2}:\d{2}$/.test(v)) throw new Error('Horario no válido en ' + k + '. Usa 18:00-23:00 o cerrado.');
    if (k === 'whatsapp') v = v.replace(/\D/g, '');
    if (k === 'minutos_alerta' && !(Number(v) >= 5 && Number(v) <= 240)) throw new Error('Los minutos de alerta deben estar entre 5 y 240.');
    guardarClave_(k, v);
  });
  actualizarLinksMesas_();
  autoPublicar_(sesion);
  return true;
}

function guardarTokenGithub(sesion, token) {
  exigirAdmin_(sesion);
  token = String(token || '').trim();
  if (!token) { PropertiesService.getScriptProperties().deleteProperty('GITHUB_TOKEN'); return { ok: true, mensaje: 'Token borrado.' }; }
  var cfg = leerConfig_();
  var r = UrlFetchApp.fetch('https://api.github.com/repos/' + cfg.github_repo, {
    headers: { Authorization: 'Bearer ' + token, Accept: 'application/vnd.github+json' }, muteHttpExceptions: true
  });
  if (r.getResponseCode() !== 200) throw new Error('GitHub rechazó el token (código ' + r.getResponseCode() + '). Revisa que tenga acceso al repositorio ' + cfg.github_repo + '.');
  var perm = JSON.parse(r.getContentText()).permissions || {};
  if (perm.push === false) throw new Error('El token puede leer pero no escribir. Dale permiso "Contents: Read and write".');
  PropertiesService.getScriptProperties().setProperty('GITHUB_TOKEN', token);
  return { ok: true, mensaje: 'Token guardado y verificado.' };
}

/* ---------- publicar en GitHub ---------- */
function githubPut_(ruta, base64, mensaje) {
  var cfg = leerConfig_();
  var token = PropertiesService.getScriptProperties().getProperty('GITHUB_TOKEN');
  if (!token) throw new Error('Falta conectar GitHub. Ve a Ajustes → GitHub y pega el token.');
  var rama = cfg.github_rama || 'main';
  var url = 'https://api.github.com/repos/' + cfg.github_repo + '/contents/' + ruta.split('/').map(encodeURIComponent).join('/');
  var h = { Authorization: 'Bearer ' + token, Accept: 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28' };
  var g = UrlFetchApp.fetch(url + '?ref=' + encodeURIComponent(rama), { headers: h, muteHttpExceptions: true });
  var cuerpo = { message: mensaje, content: base64, branch: rama };
  if (g.getResponseCode() === 200) cuerpo.sha = JSON.parse(g.getContentText()).sha;
  var r = UrlFetchApp.fetch(url, { method: 'put', headers: h, contentType: 'application/json',
    payload: JSON.stringify(cuerpo), muteHttpExceptions: true });
  if (r.getResponseCode() >= 300) {
    var msg = ''; try { msg = JSON.parse(r.getContentText()).message; } catch (e) { msg = r.getContentText().slice(0, 200); }
    throw new Error('GitHub respondió ' + r.getResponseCode() + ': ' + msg);
  }
  return JSON.parse(r.getContentText());
}

function publicarCarta(sesion) {
  var email = exigirAdmin_(sesion);
  var cfg = leerConfig_();
  var carta = construirCarta_(cfg, leerTabla_(HOJA.secciones), leerTabla_(HOJA.productos), leerTabla_(HOJA.opciones));
  var zona = cfg.zona_horaria || 'America/Lima';
  var props = PropertiesService.getScriptProperties();
  // Si la carta no cambió desde la última publicación no se sube nada (ahorra despliegues de Cloudflare)
  var huella = Utilities.base64Encode(Utilities.computeDigest(Utilities.DigestAlgorithm.MD5, JSON.stringify(carta), Utilities.Charset.UTF_8));
  if (huella === props.getProperty('HUELLA_PUBLICADA')) {
    props.setProperty('CAMBIOS_PENDIENTES', 'NO');
    limpiarCache_();
    return { ok: true, sinCambios: true, mensaje: 'La web ya estaba al día.' };
  }
  carta.publicado = Utilities.formatDate(new Date(), zona, "yyyy-MM-dd'T'HH:mm:ssXXX");
  var js = '/* ARCHIVO GENERADO desde el Google Sheets de Pasta Gallo (' + carta.publicado + ').\n' +
    '   No lo edites a mano: cambia los datos en el panel (se publica solo al guardar). */\n' +
    'window.CARTA = ' + JSON.stringify(carta, null, 1) + ';\n';
  githubPut_('menu-data.js', Utilities.base64Encode(js, Utilities.Charset.UTF_8), 'Carta publicada desde el panel por ' + email.split('@')[0]);
  props.setProperty('HUELLA_PUBLICADA', huella);
  props.setProperty('CAMBIOS_PENDIENTES', 'NO');
  props.setProperty('ULTIMA_PUBLICACION', Utilities.formatDate(new Date(), zona, 'dd/MM/yyyy HH:mm'));
  limpiarCache_();
  return { ok: true, mensaje: 'Listo. La web se actualizará en 1 o 2 minutos.' };
}

/* ---------- fotos ---------- */
function subirFoto(sesion, id, base64) {
  exigirAdmin_(sesion);
  base64 = String(base64 || '').replace(/^data:image\/\w+;base64,/, '');
  if (!base64 || base64.length > 2500000) throw new Error('La foto es demasiado grande.');
  var p = leerTabla_(HOJA.productos).filter(function (d) { return String(d.id) === String(id); })[0];
  if (!p) throw new Error('Producto no encontrado.');
  var ruta = 'fotos/' + String(id).replace(/[^a-z0-9-]/g, '') + '-' + Date.now() + '.jpg';
  githubPut_(ruta, base64, 'Foto de ' + p.nombre);
  SpreadsheetApp.getActive().getSheetByName(HOJA.productos).getRange(p._fila, COLS.productos.indexOf('foto') + 1).setValue(ruta);
  autoPublicar_(sesion);
  return ruta;
}

/* ---------- mesas ---------- */
function codigoMesa_() {
  var a = 'abcdefghjkmnpqrstuvwxyz23456789', s = '';
  for (var i = 0; i < 6; i++) s += a.charAt(Math.floor(Math.random() * a.length));
  return s;
}

function linkMesa_(cfg, mesa, codigo) {
  var base = String(cfg.sitio_url || '').replace(/\/+$/, '');
  return base ? base + '/mesa?m=' + encodeURIComponent(mesa) + '&c=' + encodeURIComponent(codigo) : '';
}

function actualizarLinksMesas_() {
  var cfg = leerConfig_();
  var h = SpreadsheetApp.getActive().getSheetByName(HOJA.mesas);
  if (!h || h.getLastRow() < 2) return;
  var v = h.getRange(2, 1, h.getLastRow() - 1, 4).getValues();
  v.forEach(function (r) { r[3] = r[0] ? linkMesa_(cfg, r[0], r[1]) : ''; });
  h.getRange(2, 1, v.length, 4).setValues(v);
  limpiarCache_();
}

function listarMesas(sesion) {
  exigirAdmin_(sesion);
  actualizarLinksMesas_();
  return leerTabla_(HOJA.mesas).map(function (m) { return { mesa: String(m.mesa), codigo: String(m.codigo), activa: esSi_(m.activa), link: m.link }; });
}

function nuevaMesa(sesion, nombre) {
  exigirAdmin_(sesion);
  nombre = texto_(nombre, 6);
  if (!nombre) throw new Error('Escribe el número o nombre de la mesa (máx. 6 caracteres).');
  if (leerTabla_(HOJA.mesas).some(function (m) { return String(m.mesa) === nombre; })) throw new Error('Esa mesa ya existe.');
  SpreadsheetApp.getActive().getSheetByName(HOJA.mesas).appendRow([nombre, codigoMesa_(), 'SI', '']);
  return listarMesas(sesion);
}

function cambiarCodigoMesa(sesion, nombre) {
  exigirAdmin_(sesion);
  var m = leerTabla_(HOJA.mesas).filter(function (x) { return String(x.mesa) === String(nombre); })[0];
  if (!m) throw new Error('Mesa no encontrada.');
  SpreadsheetApp.getActive().getSheetByName(HOJA.mesas).getRange(m._fila, 2).setValue(codigoMesa_());
  return listarMesas(sesion);
}

function activarMesa(sesion, nombre, activa) {
  exigirAdmin_(sesion);
  var m = leerTabla_(HOJA.mesas).filter(function (x) { return String(x.mesa) === String(nombre); })[0];
  if (!m) throw new Error('Mesa no encontrada.');
  SpreadsheetApp.getActive().getSheetByName(HOJA.mesas).getRange(m._fila, 3).setValue(activa ? 'SI' : 'NO');
  return listarMesas(sesion);
}

/* =========================== ACCESO POR CONTRASEÑA (panel web) =========================== */
function hashClave_(clave, sal) {
  var b = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, sal + '|' + clave, Utilities.Charset.UTF_8);
  for (var i = 0; i < 300; i++) b = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, b.concat(Utilities.newBlob(sal).getBytes()));
  return Utilities.base64Encode(b);
}

function iguales_(a, b) {
  if (a.length !== b.length) return false;
  var r = 0;
  for (var i = 0; i < a.length; i++) r |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return r === 0;
}

/** Inicia sesión en el panel web. Devuelve un código de sesión válido por 6 horas. */
function iniciarSesion(clave, nombre) {
  var cache = CacheService.getScriptCache();
  var fallos = Number(cache.get('login-fallos') || 0);
  if (fallos >= 8) throw new Error('Demasiados intentos fallidos. Espera 15 minutos.');
  var props = PropertiesService.getScriptProperties();
  var guardada = props.getProperty('PANEL_CLAVE');
  if (!guardada) throw new Error('Todavía no hay contraseña. Créala desde el Google Sheets: menú Pasta Gallo → Abrir panel → Ajustes.');
  var partes = guardada.split(':');
  if (!iguales_(hashClave_(String(clave || ''), partes[0]), partes[1])) {
    cache.put('login-fallos', String(fallos + 1), 900);
    Utilities.sleep(1500);
    throw new Error('Contraseña incorrecta.');
  }
  var token = Utilities.getUuid() + Utilities.getUuid().replace(/-/g, '');
  var n = texto_(nombre, 30) || 'Panel';
  cache.put('ses:' + token, JSON.stringify({ n: n, g: props.getProperty('PANEL_GEN') || '0' }), 21600);
  return { sesion: token, nombre: n };
}

function cerrarSesion(sesion) {
  if (sesion) CacheService.getScriptCache().remove('ses:' + String(sesion).slice(0, 80));
  return true;
}

/** Crea o cambia la contraseña del panel web. Cierra todas las sesiones abiertas. */
function cambiarClavePanel(sesion, nueva) {
  exigirAdmin_(sesion);
  nueva = String(nueva || '');
  if (nueva.length < 10) throw new Error('La contraseña debe tener al menos 10 caracteres.');
  var sal = Utilities.getUuid();
  var props = PropertiesService.getScriptProperties();
  props.setProperty('PANEL_CLAVE', sal + ':' + hashClave_(nueva, sal));
  props.setProperty('PANEL_GEN', String(Number(props.getProperty('PANEL_GEN') || 0) + 1));
  return { ok: true, mensaje: 'Contraseña guardada. Las sesiones abiertas se cerraron.' };
}

/* ---------- opciones y adicionales ---------- */
function listarOpciones(sesion) {
  exigirAdmin_(sesion);
  var g = {}, orden = [];
  leerTabla_(HOJA.opciones).forEach(function (f) {
    var id = String(f.grupo || '').trim(); if (!id) return;
    if (!g[id]) { g[id] = { id: id, nombre: String(f.nombre || ''), nombre_en: String(f.nombre_en || ''), tipo: f.tipo === 'varias' ? 'varias' : 'una', obligatorio: esSi_(f.obligatorio), ops: [] }; orden.push(id); }
    g[id].ops.push({ opcion: String(f.opcion || ''), opcion_en: String(f.opcion_en || ''), precio: f.precio === '' ? '' : num_(f.precio), activo: esSi_(f.activo) });
  });
  var uso = {};
  leerTabla_(HOJA.productos).forEach(function (p) { listaIds_(p.opciones).forEach(function (id) { (uso[id] = uso[id] || []).push(String(p.nombre)); }); });
  return orden.map(function (id) { g[id].usadoEn = uso[id] || []; return g[id]; });
}

/** Guarda un grupo completo (reemplaza sus filas). grupo = { id, nombre, nombre_en, tipo, obligatorio, ops:[{opcion, opcion_en, precio, activo}] } */
function guardarGrupoOpciones(sesion, grupo) {
  exigirAdmin_(sesion);
  var id = String(grupo && grupo.id || '').toLowerCase().trim().replace(/[^a-z0-9-]+/g, '-').replace(/^-|-$/g, '');
  if (!id) throw new Error('El grupo necesita un código (ej.: extras-pizza).');
  if (!String(grupo.nombre || '').trim()) throw new Error('El grupo necesita un nombre.');
  var ops = (grupo.ops || []).filter(function (o) { return String(o.opcion || '').trim(); });
  if (!ops.length) throw new Error('Agrega al menos una opción.');
  ops.forEach(function (o) { if (String(o.precio).trim() !== '' && num_(o.precio) == null) throw new Error('Precio no válido en "' + o.opcion + '".'); });
  var filas = leerTabla_(HOJA.opciones).filter(function (f) { return String(f.grupo) !== id; });
  ops.forEach(function (o, i) {
    filas.push({ grupo: id, nombre: String(grupo.nombre).trim(), nombre_en: String(grupo.nombre_en || '').trim(), tipo: grupo.tipo === 'varias' ? 'varias' : 'una',
      obligatorio: grupo.obligatorio ? 'SI' : 'NO', opcion: String(o.opcion).trim(), opcion_en: String(o.opcion_en || '').trim(),
      precio: String(o.precio).trim() === '' ? '' : num_(o.precio), orden: (i + 1) * 10, activo: o.activo === false ? 'NO' : 'SI' });
  });
  escribirTabla_(HOJA.opciones, COLS.opciones, filas);
  autoPublicar_(sesion);
  return listarOpciones(sesion);
}

function eliminarGrupoOpciones(sesion, id) {
  exigirAdmin_(sesion);
  escribirTabla_(HOJA.opciones, COLS.opciones, leerTabla_(HOJA.opciones).filter(function (f) { return String(f.grupo) !== String(id); }));
  autoPublicar_(sesion);
  return listarOpciones(sesion);
}
