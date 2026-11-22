/* =========================== MÓDULO TIENDA / MOSTRADOR ===========================
   Venta presencial en caja (canal "tienda"). Apagado por defecto: Config modulo_tienda = SI lo enciende.
   - La app de caja (cajero.js) la usa el personal con rol "cajero" (enlace de equipo, igual que el mozo).
   - Catálogo unificado: se usa la hoja Productos con columnas NUEVAS al final (sku, codigo_barras, unidad, vende_tienda,
     precio_tienda). Un producto se vende en tienda solo si vende_tienda = SI. Si precio_tienda está vacío se usa "precio".
     OJO: estas columnas NO se agregan a COLS.productos a propósito: el editor de la carta (guardarProducto) reescribe
     todas las columnas de COLS.productos y borraría estos datos. Aquí se crean solas, al final, cuando se necesitan.
   - Hojas nuevas: Ventas, VentasDetalle, CierresTienda.
   - El precio SIEMPRE se recalcula aquí con los precios de la hoja. La venta lleva un id del cliente (cid) y es idempotente.
   Config opcional: tienda_descuento_max_pct (vacío = sin tope), tienda_anular_cajero (NO = solo el administrador anula),
   tienda_metodos (por defecto Efectivo, Yape, Plin, Tarjeta; puede ser un subconjunto). */

var HOJA_VENTAS = 'Ventas', HOJA_VENTAS_DET = 'VentasDetalle', HOJA_CIERRES_T = 'CierresTienda';
var COLS_VENTAS = ['id', 'num_dia', 'cid', 'fecha', 'canal', 'cajero_id', 'cajero', 'subtotal', 'descuento', 'descuento_motivo', 'total',
  'efectivo', 'yape', 'plin', 'tarjeta', 'recibido', 'vuelto', 'pagos_json', 'items_json', 'estado', 'anulada_por', 'anulada_motivo',
  'anulada_fecha', 'firma', 'nota'];
var COLS_VENTAS_DET = ['venta', 'linea', 'fecha', 'producto_id', 'sku', 'nombre', 'unidad', 'cant', 'tam', 'precio_unit', 'subtotal'];
var COLS_CIERRES_T = ['id', 'fecha', 'cajero_id', 'cajero', 'ventas', 'anuladas', 'total', 'efectivo', 'yape', 'plin', 'tarjeta',
  'fondo', 'efectivo_esperado', 'efectivo_contado', 'diferencia', 'nota'];
var COLS_TIENDA_PROD = ['sku', 'codigo_barras', 'unidad', 'vende_tienda', 'precio_tienda'];
var UNIDADES_TIENDA = ['unid', 'kg', 'g', 'lt'];
var METODOS_TIENDA = ['Efectivo', 'Yape', 'Plin', 'Tarjeta'];

extRegistrar_('tienda');
var EXT_ACCIONES = EXT_ACCIONES || {};
EXT_ACCIONES['tienda'] = function (body) {
  var op = String(body && body.op || '');
  var u = extPersonal_(body, ['cajero']);
  var cfg = leerConfig_();
  if (op === 'productos') return tiendaProductos_(u, cfg);
  if (op === 'venta') return tiendaVenta_(u, body, cfg);
  if (op === 'historial') return tiendaHistorial_(cfg);
  if (op === 'anular') return tiendaAnularVenta_(String(body.id || ''), body.motivo, u.nombre, u.id, false, cfg);
  if (op === 'cierre') return tiendaCierre_(u, body, cfg);
  if (op === 'recoger') return tiendaRecoger_(cfg);
  if (op === 'entregar') return tiendaEntregar_(u, body, cfg);
  return { ok: false, error: 'Acción no válida.' };
};

/* ---------- utilidades ---------- */
function tiendaR2_(x) { return Math.round(Number(x) * 100) / 100; }
function tiendaDia_(fecha, cfg) { return Utilities.formatDate(fecha, cfg.zona_horaria || 'America/Lima', 'yyyy-MM-dd'); }
function tiendaConfig_(cfg) {
  var max = num_(cfg.tienda_descuento_max_pct);
  var lista = String(cfg.tienda_metodos || '').split(/[,;]/).map(function (x) { return x.trim().toLowerCase(); }).filter(Boolean);
  var metodos = lista.length ? METODOS_TIENDA.filter(function (m) { return lista.indexOf(m.toLowerCase()) >= 0; }) : METODOS_TIENDA.slice();
  if (!metodos.length) metodos = METODOS_TIENDA.slice();
  return { descMax: max == null || max < 0 ? null : max, anularCajero: String(cfg.tienda_anular_cajero || '').trim().toUpperCase() !== 'NO', metodos: metodos };
}
function tiendaUnidad_(v) {
  var s = String(v == null ? '' : v).trim().toLowerCase();
  if (!s) return 'unid';
  var alias = { und: 'unid', unidad: 'unid', unidades: 'unid', u: 'unid', pza: 'unid', kilo: 'kg', kilos: 'kg', kgs: 'kg', gr: 'g', gramo: 'g', gramos: 'g',
    l: 'lt', lts: 'lt', litro: 'lt', litros: 'lt' };
  s = alias[s] || s;
  return UNIDADES_TIENDA.indexOf(s) >= 0 ? s : '';
}
/** Código escrito/leído: texto sin espacios. Las celdas numéricas pierden ceros a la izquierda, por eso se compara también sin ellos. */
function tiendaCodigo_(v) { return String(v == null ? '' : v).replace(/\s+/g, '').trim(); }
function tiendaSinCeros_(s) { return String(s).replace(/^0+(?=.)/, ''); }
function tiendaHoja_(nombre, cols) { var h = obtenerHoja_(SpreadsheetApp.getActive(), nombre, cols); return { h: h, cab: asegurarColumnas_(h, cols) }; }
function tiendaAgregar_(hh, obj) { hh.h.appendRow(hh.cab.map(function (c) { return protegerCelda_(obj[c] == null ? '' : obj[c]); })); }
function tiendaFechaMs_(v) { return v instanceof Date ? v.getTime() : 0; }
function tiendaAuditar_(quien, accion, det) { try { auditar_(quien, accion, det); } catch (e) { console.error(e); } }

/** Cantidad válida según la unidad: unid = entero 1-99; kg/lt = hasta 3 decimales (máx. 50); g = hasta 1 decimal (máx. 50000). */
function tiendaCantidad_(v, unidad, nombre) {
  var n = num_(v);
  if (n == null || !(n > 0)) throw extError_('Cantidad no válida en ' + nombre + '.');
  if (unidad === 'unid') {
    if (Math.floor(n) !== n || n > 99) throw extError_('Cantidad no válida en ' + nombre + ' (1 a 99 unidades).');
    return n;
  }
  if (unidad === 'g') { n = Math.round(n * 10) / 10; if (n < 1 || n > 50000) throw extError_('Peso no válido en ' + nombre + '.'); return n; }
  n = Math.round(n * 1000) / 1000;
  if (n < 0.001 || n > 50) throw extError_('Cantidad no válida en ' + nombre + ' (máximo 50).');
  return n;
}

/* ---------- catálogo de tienda ---------- */
/** Productos de la hoja que se pueden vender hoy en tienda (con el precio de tienda). Siempre lee la hoja: sin caché. */
function tiendaCatalogoLista_(cfg, soloVendibles) {
  var mom = momentoActual_(cfg), out = [];
  leerTabla_(HOJA.productos).forEach(function (p) {
    if (!String(p.id).trim()) return;
    if (!esSi_(p.vende_tienda)) return;
    if (String(p.tipo) === 'salsa' || esSi_(p.requiere_salsa)) return;
    var tams = parsearTamanos_(p.tamanos);
    var pt = num_(p.precio_tienda), precio = tams.length ? null : (pt != null && pt >= 0 ? pt : num_(p.precio));
    if (!tams.length && precio == null) return;   // "consultar": sin precio no se vende
    var vig = promoVigente_(p, mom);
    out.push({ id: String(p.id), sku: tiendaCodigo_(p.sku), barras: tiendaCodigo_(p.codigo_barras), nombre: String(p.nombre), unidad: tiendaUnidad_(p.unidad) || 'unid',
      precio: precio, tam: tams, agotado: !esSi_(p.disponible), fueraDeDia: !vig.ok, seccion: String(p.seccion || ''), _p: p, _vig: vig });
  });
  return out;
}
function tiendaProductos_(u, cfg) {
  asegurarColumnas_(SpreadsheetApp.getActive().getSheetByName(HOJA.productos), COLS.productos.concat(COLS_TIENDA_PROD));
  var tc = tiendaConfig_(cfg);
  var lista = tiendaCatalogoLista_(cfg).filter(function (x) { return !x.agotado && !x.fueraDeDia; }).map(function (x) {
    return { id: x.id, sku: x.sku, barras: x.barras, nombre: x.nombre, unidad: x.unidad, precio: x.precio, tam: x.tam, seccion: x.seccion };
  });
  return { ok: true, productos: lista, metodos: tc.metodos, descuentoMax: tc.descMax, anularCajero: tc.anularCajero,
    negocio: { nombre: String(cfg.nombre || 'Pasta Gallo'), direccion: String(cfg.direccion || ''), telefono: String(cfg.telefono || '') },
    cajero: u.nombre, hoy: tiendaDia_(new Date(), cfg) };
}

/* ---------- venta nueva (idempotente) ---------- */
function tiendaVenta_(u, body, cfg) {
  if (JSON.stringify(body).length > 20000) throw extError_('La venta es demasiado grande.');
  var cid = String(body.cid || '');
  if (!/^[A-Za-z][A-Za-z0-9_-]{7,47}$/.test(cid)) throw extError_('Falta el identificador de la venta. Actualiza la página e intenta de nuevo.');
  var items = Array.isArray(body.items) ? body.items : [];
  if (!items.length) throw extError_('La venta está vacía.');
  if (items.length > 60) throw extError_('La venta tiene demasiadas líneas.');
  var tc = tiendaConfig_(cfg);
  var lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    var vh = tiendaHoja_(HOJA_VENTAS, COLS_VENTAS);
    var recientes = leerTablaReciente_(HOJA_VENTAS, 1500);
    var previa = recientes.filter(function (v) { return String(v.cid) === cid; })[0];

    // 1. líneas con precios de la hoja
    var cat = {};
    tiendaCatalogoLista_(cfg).forEach(function (x) { cat[x.id] = x; });
    var lineas = [], sub = 0;
    items.forEach(function (it) {
      it = it || {};
      var p = cat[String(it.id)];
      if (!p) throw extError_('Un producto ya no se vende en tienda. Actualiza la lista de productos.');
      if (p.agotado) throw extError_(p.nombre + ' está agotado.');
      if (!p._vig.ok) throw extError_(p._vig.error);
      var cant = tiendaCantidad_(it.cant, p.unidad, p.nombre), unit = p.precio, tam = '';
      if (p.tam.length) {
        var t = p.tam.filter(function (x) { return x[0] === String(it.tam); })[0];
        if (!t) throw extError_('Elige el tamaño de ' + p.nombre + '.');
        unit = t[1]; tam = t[0];
      }
      var s = tiendaR2_(unit * cant);
      sub += s;
      lineas.push({ id: p.id, sku: p.sku, nombre: p.nombre, unidad: p.unidad, cant: cant, tam: tam, unit: unit, subtotal: s });
    });
    sub = tiendaR2_(sub);
    if (sub > 100000) throw extError_('El total es demasiado alto.');

    // 2. descuento (misma cuenta que los ajustes de pedidos), siempre con motivo
    var total = sub, desc = 0, descMotivo = '', descCfg = { tipo: '', valor: '' };
    var d = body.descuento;
    if (d && typeof d === 'object' && String(d.tipo || '')) {
      var tipo = String(d.tipo);
      if (['desc_pct', 'desc_monto', 'precio_final'].indexOf(tipo) < 0) throw extError_('Tipo de descuento no válido.');
      descMotivo = texto_(d.motivo, 120);
      if (descMotivo.length < 3) throw extError_('Escribe el motivo del descuento.');
      var r;
      try { r = calcularAjuste_(sub, tipo, d.valor); } catch (e) { throw extError_(String(e && e.message || 'Descuento no válido.')); }
      if (r.final > sub + 0.004) throw extError_('Un descuento no puede subir el precio.');
      desc = tiendaR2_(sub - r.final); total = r.final;
      if (tc.descMax != null && sub > 0 && desc / sub * 100 > tc.descMax + 0.0001) throw extError_('El descuento pasa del máximo permitido (' + tc.descMax + ' %).');
      descCfg = { tipo: tipo, valor: String(d.valor) };
    }
    if (!(total > 0)) throw extError_('El total debe ser mayor que cero.');

    // 3. pagos (mixto): lo que no es efectivo debe ser exacto; el efectivo puede pasar y se da vuelto
    var pagosIn = Array.isArray(body.pagos) ? body.pagos : [];
    if (!pagosIn.length || pagosIn.length > 8) throw extError_('Indica cómo paga el cliente.');
    var porMetodo = { Efectivo: 0, Yape: 0, Plin: 0, Tarjeta: 0 };
    pagosIn.forEach(function (pg) {
      pg = pg || {};
      var m = tc.metodos.filter(function (x) { return x.toLowerCase() === String(pg.metodo || '').trim().toLowerCase(); })[0];
      if (!m) throw extError_('Método de pago no válido.');
      var mo = num_(pg.monto);
      if (mo == null || !(mo > 0) || mo > 200000) throw extError_('Monto de pago no válido.');
      porMetodo[m] = tiendaR2_(porMetodo[m] + mo);
    });
    var noEf = tiendaR2_(porMetodo.Yape + porMetodo.Plin + porMetodo.Tarjeta);
    var resto = tiendaR2_(total - noEf), efEntregado = porMetodo.Efectivo, efNeto = 0, vuelto = 0;
    if (resto < -0.004) throw extError_('Yape, Plin y tarjeta suman más que el total (' + soles_(total) + ').');
    if (resto > 0.004) {
      if (efEntregado < resto - 0.004) throw extError_('Falta cobrar ' + soles_(tiendaR2_(resto - efEntregado)) + '.');
      efNeto = resto; vuelto = tiendaR2_(efEntregado - resto);
    } else if (efEntregado > 0) throw extError_('El total ya está cubierto sin efectivo. Quita el efectivo.');
    var pagos = [];
    if (efNeto > 0) pagos.push({ metodo: 'Efectivo', monto: efNeto });
    ['Yape', 'Plin', 'Tarjeta'].forEach(function (m) { if (porMetodo[m] > 0) pagos.push({ metodo: m, monto: porMetodo[m] }); });

    // 4. idempotencia: mismo cid = misma venta (si los datos cambiaron, no se mezcla)
    var firma = lineas.map(function (l) { return l.id + '|' + l.tam + '|' + l.cant; }).join(',') + '#' + descCfg.tipo + ':' + descCfg.valor + '#' +
      pagos.map(function (p) { return p.metodo + ':' + p.monto; }).join(',') + '#' + efEntregado;
    if (previa) {
      if (String(previa.firma) !== firma) throw extError_('Esta venta ya se registró con otros datos. Revisa el historial del día antes de repetirla.');
      return { ok: true, repetida: true, venta: tiendaPublica_(previa, cfg) };
    }

    // 5. guardar
    var ahora = new Date(), dia = tiendaDia_(ahora, cfg), n = 0;
    recientes.forEach(function (v) { if (v.fecha instanceof Date && tiendaDia_(v.fecha, cfg) === dia) n = Math.max(n, Number(v.num_dia) || 0); });
    n += 1;
    var id = 'T-' + dia.replace(/-/g, '') + '-' + ('00' + n).slice(-3);
    var fila = { id: id, num_dia: n, cid: cid, fecha: ahora, canal: 'tienda', cajero_id: u.id, cajero: u.nombre, subtotal: sub, descuento: desc,
      descuento_motivo: descMotivo, total: total, efectivo: efNeto, yape: porMetodo.Yape, plin: porMetodo.Plin, tarjeta: porMetodo.Tarjeta,
      recibido: efEntregado, vuelto: vuelto, pagos_json: JSON.stringify(pagos), items_json: JSON.stringify(lineas), estado: 'Vigente', firma: firma,
      nota: texto_(body.nota, 200) };
    tiendaAgregar_(vh, fila);
    var dh = tiendaHoja_(HOJA_VENTAS_DET, COLS_VENTAS_DET);
    lineas.forEach(function (l, i) {
      tiendaAgregar_(dh, { venta: id, linea: i + 1, fecha: ahora, producto_id: l.id, sku: l.sku, nombre: l.nombre, unidad: l.unidad, cant: l.cant,
        tam: l.tam, precio_unit: l.unit, subtotal: l.subtotal });
    });
    tiendaAuditar_(u.nombre, 'tienda_venta', id + ' · ' + soles_(total) + (desc ? ' · desc ' + soles_(desc) + ' (' + descMotivo + ')' : '') + ' · ' +
      pagos.map(function (p) { return p.metodo + ' ' + p.monto; }).join(', '));
    PropertiesService.getScriptProperties().setProperty('TIENDA_VERSION', String(Date.now()));
    return { ok: true, repetida: false, venta: tiendaPublica_(fila, cfg) };
  } finally {
    lock.releaseLock();
  }
}

/** Fila de Ventas → objeto para el recibo y las listas (sin Fechas: se envían en milisegundos). */
function tiendaPublica_(v, cfg) {
  var f = v.fecha instanceof Date ? v.fecha : new Date(Number(v.fecha) || 0);
  var items = [], pagos = [];
  try { items = JSON.parse(String(v.items_json || '[]')); } catch (e) { items = []; }
  try { pagos = JSON.parse(String(v.pagos_json || '[]')); } catch (e) { pagos = []; }
  return { id: String(v.id), numero: Number(v.num_dia) || 0, fecha: f.getTime(), hora: Utilities.formatDate(f, cfg.zona_horaria || 'America/Lima', 'HH:mm'),
    cajero: String(v.cajero || ''), lineas: items, subtotal: Number(v.subtotal) || 0, descuento: Number(v.descuento) || 0, motivo: String(v.descuento_motivo || ''),
    total: Number(v.total) || 0, pagos: pagos, recibido: Number(v.recibido) || 0, vuelto: Number(v.vuelto) || 0, estado: String(v.estado || 'Vigente'),
    anuladaMotivo: String(v.anulada_motivo || ''), nota: String(v.nota || '') };
}

/* ---------- historial y totales ---------- */
function tiendaVentasDelDia_(dia, cfg, todas) {
  var filas = todas ? leerTabla_(HOJA_VENTAS) : leerTablaReciente_(HOJA_VENTAS, 1500);
  return filas.filter(function (v) { return v.fecha instanceof Date && tiendaDia_(v.fecha, cfg) === dia; });
}
function tiendaTotales_(filas) {
  var t = { ventas: 0, anuladas: 0, total: 0, efectivo: 0, yape: 0, plin: 0, tarjeta: 0, descuentos: 0 };
  filas.forEach(function (v) {
    if (String(v.estado) === 'Anulada') { t.anuladas++; return; }
    t.ventas++; t.total += Number(v.total) || 0; t.descuentos += Number(v.descuento) || 0;
    ['efectivo', 'yape', 'plin', 'tarjeta'].forEach(function (k) { t[k] += Number(v[k]) || 0; });
  });
  Object.keys(t).forEach(function (k) { t[k] = tiendaR2_(t[k]); });
  return t;
}
function tiendaHistorial_(cfg) {
  var dia = tiendaDia_(new Date(), cfg), filas = tiendaVentasDelDia_(dia, cfg, false);
  return { ok: true, dia: dia, totales: tiendaTotales_(filas), ventas: filas.map(function (v) { return tiendaPublica_(v, cfg); }).reverse() };
}

/* ---------- anular (con motivo) ---------- */
function tiendaAnularVenta_(id, motivo, quien, quienId, esAdmin, cfg) {
  id = String(id || '').slice(0, 40);
  motivo = texto_(motivo, 120);
  if (!id) throw extError_('Falta la venta.');
  if (motivo.length < 3) throw extError_('Escribe el motivo de la anulación.');
  var tc = tiendaConfig_(cfg);
  if (!esAdmin && !tc.anularCajero) throw extError_('Solo el administrador puede anular ventas. Avísale desde el panel.');
  var lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    var hh = tiendaHoja_(HOJA_VENTAS, COLS_VENTAS);
    var v = (esAdmin ? leerTabla_(HOJA_VENTAS) : leerTablaReciente_(HOJA_VENTAS, 1500)).filter(function (x) { return String(x.id) === id; })[0];
    if (!v) throw extError_('No se encontró la venta ' + id + '.');
    if (String(v.estado) === 'Anulada') return { ok: true, yaAnulada: true, venta: tiendaPublica_(v, cfg) };
    var ahora = new Date();
    if (!esAdmin && !(v.fecha instanceof Date && tiendaDia_(v.fecha, cfg) === tiendaDia_(ahora, cfg))) {
      throw extError_('Esta venta es de otro día: pídele al administrador que la anule desde el panel.');
    }
    var poner = function (k, val) { hh.h.getRange(v._fila, hh.cab.indexOf(k) + 1).setValue(val); };
    poner('estado', 'Anulada'); poner('anulada_por', quien); poner('anulada_motivo', protegerCelda_(motivo)); poner('anulada_fecha', ahora);
    v.estado = 'Anulada'; v.anulada_motivo = motivo;
    tiendaAuditar_(quien, 'tienda_anular', id + ' · ' + soles_(Number(v.total) || 0) + ' · ' + motivo + (esAdmin ? ' (administrador)' : ' (caja)'));
    PropertiesService.getScriptProperties().setProperty('TIENDA_VERSION', String(Date.now()));
    return { ok: true, venta: tiendaPublica_(v, cfg) };
  } finally {
    lock.releaseLock();
  }
}

/* ---------- cierre simple del día ---------- */
function tiendaCierre_(u, body, cfg) {
  var dia = tiendaDia_(new Date(), cfg), filas = tiendaVentasDelDia_(dia, cfg, false), t = tiendaTotales_(filas);
  var fondo = body.fondo === '' || body.fondo == null ? 0 : num_(body.fondo);
  var contado = body.contado === '' || body.contado == null ? null : num_(body.contado);
  if (fondo == null || fondo < 0 || (body.contado !== '' && body.contado != null && (contado == null || contado < 0))) throw extError_('Escribe montos válidos.');
  var esperado = tiendaR2_(fondo + t.efectivo), dif = contado == null ? '' : tiendaR2_(contado - esperado);
  var res = { ok: true, dia: dia, totales: t, fondo: fondo, efectivoEsperado: esperado, contado: contado, diferencia: dif, guardado: false };
  if (body.confirmar !== true) return res;
  var lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    var ch = tiendaHoja_(HOJA_CIERRES_T, COLS_CIERRES_T);
    var cid = 'C-' + dia.replace(/-/g, '') + '-' + ('0' + (leerTabla_(HOJA_CIERRES_T).filter(function (c) { return c.fecha instanceof Date && tiendaDia_(c.fecha, cfg) === dia; }).length + 1)).slice(-2);
    tiendaAgregar_(ch, { id: cid, fecha: new Date(), cajero_id: u.id, cajero: u.nombre, ventas: t.ventas, anuladas: t.anuladas, total: t.total,
      efectivo: t.efectivo, yape: t.yape, plin: t.plin, tarjeta: t.tarjeta, fondo: fondo, efectivo_esperado: esperado,
      efectivo_contado: contado == null ? '' : contado, diferencia: dif, nota: texto_(body.nota, 200) });
    tiendaAuditar_(u.nombre, 'tienda_cierre', cid + ' · ventas ' + t.ventas + ' · total ' + soles_(t.total) + (dif === '' ? '' : ' · diferencia ' + soles_(dif)));
    res.guardado = true; res.id = cid;
    return res;
  } finally {
    lock.releaseLock();
  }
}

/* ---------- entregas por recoger (pedidos web "recojo" listos) ---------- */
function tiendaRecoger_(cfg) {
  var lista = pedidosRecientes_().filter(function (p) { return String(p.canal) === 'recojo' && String(p.estado) === 'Listo'; }).map(function (p) {
    return { numero: String(p.numero), numDia: Number(p.num_dia) || 0, nombre: String(p.nombre || ''), telefono: String(p.telefono || ''), total: Number(p.total) || 0,
      pago: String(p.pago || ''), pagoEstado: String(p.pago_estado || ''), detalle: String(p.detalle || ''), notas: String(p.notas || ''),
      programado: celdaTexto_(p.programado), fecha: tiendaFechaMs_(p.fecha) };
  });
  var enCocina = pedidosRecientes_().filter(function (p) { return String(p.canal) === 'recojo' && ['Nuevo', 'Confirmado', 'En preparación'].indexOf(String(p.estado)) >= 0; }).length;
  return { ok: true, pedidos: lista, enCocina: enCocina };
}
function tiendaEntregar_(u, body, cfg) {
  var numero = String(body.numero || '').slice(0, 20);
  if (!numero) throw extError_('Falta el pedido.');
  var lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    var h = SpreadsheetApp.getActive().getSheetByName(HOJA.pedidos), cab = asegurarColumnas_(h, COLS.pedidos);
    var p = leerTablaReciente_(HOJA.pedidos, 1200).filter(function (x) { return String(x.numero) === numero; })[0];
    if (!p || String(p.canal) !== 'recojo') throw extError_('No se encontró ese pedido para recoger.');
    if (String(p.estado) === 'Entregado') return { ok: true, yaEntregado: true };
    if (String(p.estado) !== 'Listo') throw extError_('El pedido #' + numero + ' está "' + p.estado + '": solo se entrega cuando está Listo.');
    var ahora = new Date();
    var poner = function (k, v) { h.getRange(p._fila, cab.indexOf(k) + 1).setValue(v); };
    poner('estado', 'Entregado'); poner('actualizado', ahora);
    var his = String(p.historial || '');
    poner('historial', (his ? his + ' · ' : '') + 'Entregado ' + fmt_(ahora, 'HH:mm') + ' (caja: ' + u.nombre + ')');
    PropertiesService.getScriptProperties().setProperty('PEDIDOS_VERSION', String(Date.now()));
    tiendaAuditar_(u.nombre, 'tienda_entrega', 'Pedido #' + numero + ' entregado en caja');
    return { ok: true };
  } finally {
    lock.releaseLock();
  }
}

/* =========================== PANEL DE ADMINISTRACIÓN (funciones globales) =========================== */
function tiendaCatalogo(sesion) {
  exigirAdmin_(sesion);
  var h = SpreadsheetApp.getActive().getSheetByName(HOJA.productos);
  asegurarColumnas_(h, COLS.productos.concat(COLS_TIENDA_PROD));
  var secs = {};
  leerTabla_(HOJA.secciones).forEach(function (s) { secs[String(s.id)] = String(s.titulo || s.id); });
  return leerTabla_(HOJA.productos).filter(function (p) { return String(p.id).trim() && String(p.tipo) !== 'salsa'; }).map(function (p) {
    var tams = parsearTamanos_(p.tamanos);
    return { id: String(p.id), nombre: String(p.nombre), seccion: secs[String(p.seccion)] || String(p.seccion), precio: p.precio === '' ? '' : Number(p.precio),
      tamanos: tams.map(function (t) { return t[0] + '=' + t[1]; }).join('; '), disponible: esSi_(p.disponible),
      sku: tiendaCodigo_(p.sku), codigo_barras: tiendaCodigo_(p.codigo_barras), unidad: tiendaUnidad_(p.unidad) || 'unid', vende_tienda: esSi_(p.vende_tienda),
      precio_tienda: p.precio_tienda === '' || p.precio_tienda == null ? '' : Number(p.precio_tienda) };
  });
}
function tiendaGuardarProducto(sesion, id, datos) {
  var quien = String(exigirAdmin_(sesion) || '').split('@')[0];
  datos = datos || {};
  var h = SpreadsheetApp.getActive().getSheetByName(HOJA.productos), cab = asegurarColumnas_(h, COLS.productos.concat(COLS_TIENDA_PROD));
  var todos = leerTabla_(HOJA.productos), p = todos.filter(function (x) { return String(x.id) === String(id); })[0];
  if (!p) throw new Error('Producto no encontrado.');
  var sku = tiendaCodigo_(datos.sku).slice(0, 40), barras = tiendaCodigo_(datos.codigo_barras).slice(0, 40);
  if (/[<>]/.test(sku + barras)) throw new Error('El SKU y el código de barras no pueden llevar < ni >.');
  var unidad = tiendaUnidad_(datos.unidad);
  if (!unidad) throw new Error('Unidad no válida. Usa unid, kg, g o lt.');
  var pt = String(datos.precio_tienda == null ? '' : datos.precio_tienda).trim(), ptn = pt === '' ? '' : num_(pt);
  if (ptn !== '' && (ptn == null || ptn < 0)) throw new Error('El precio de tienda debe ser un número (ej.: 12.50) o quedar vacío.');
  var vende = datos.vende_tienda === true || esSi_(datos.vende_tienda);
  todos.forEach(function (x) {
    if (String(x.id) === String(id)) return;
    if (sku && tiendaCodigo_(x.sku).toLowerCase() === sku.toLowerCase()) throw new Error('El SKU "' + sku + '" ya lo usa ' + x.nombre + '.');
    if (barras && tiendaSinCeros_(tiendaCodigo_(x.codigo_barras)) === tiendaSinCeros_(barras)) throw new Error('El código de barras ya lo usa ' + x.nombre + '.');
  });
  if (vende && ptn === '' && num_(p.precio) == null && !parsearTamanos_(p.tamanos).length) throw new Error('Este producto no tiene precio: ponle uno antes de venderlo en tienda.');
  var poner = function (k, v, texto) {
    var c = h.getRange(p._fila, cab.indexOf(k) + 1);
    if (texto) c.setNumberFormat('@');
    c.setValue(v);
  };
  poner('sku', sku, true); poner('codigo_barras', barras, true); poner('unidad', unidad, true);
  poner('vende_tienda', vende ? 'SI' : 'NO'); poner('precio_tienda', ptn);
  limpiarCache_();
  tiendaAuditar_(quien, 'tienda_producto', String(p.nombre) + ' · sku ' + (sku || '-') + ' · barras ' + (barras || '-') + ' · ' + unidad + ' · tienda ' + (vende ? 'SI' : 'NO') + (ptn === '' ? '' : ' · S/ ' + ptn));
  return { ok: true };
}
function tiendaReporte(sesion, dia) {
  exigirAdmin_(sesion);
  var cfg = leerConfig_();
  dia = String(dia || '').trim() || tiendaDia_(new Date(), cfg);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dia)) throw new Error('Fecha no válida.');
  var filas = tiendaVentasDelDia_(dia, cfg, true), t = tiendaTotales_(filas), por = {};
  filas.forEach(function (v) {
    if (String(v.estado) === 'Anulada') return;
    var items = []; try { items = JSON.parse(String(v.items_json || '[]')); } catch (e) { items = []; }
    items.forEach(function (l) {
      var k = l.id + '|' + l.tam, x = por[k] = por[k] || { nombre: l.nombre + (l.tam ? ' (' + l.tam + ')' : ''), unidad: l.unidad, cant: 0, monto: 0 };
      x.cant = Math.round((x.cant + Number(l.cant)) * 1000) / 1000; x.monto = tiendaR2_(x.monto + Number(l.subtotal));
    });
  });
  var cierres = leerTabla_(HOJA_CIERRES_T).filter(function (c) { return c.fecha instanceof Date && tiendaDia_(c.fecha, cfg) === dia; }).map(function (c) {
    return { id: String(c.id), cajero: String(c.cajero), total: Number(c.total) || 0, esperado: Number(c.efectivo_esperado) || 0,
      contado: c.efectivo_contado === '' ? '' : Number(c.efectivo_contado), diferencia: c.diferencia === '' ? '' : Number(c.diferencia) };
  });
  return { dia: dia, totales: t, productos: Object.keys(por).map(function (k) { return por[k]; }).sort(function (a, b) { return b.monto - a.monto; }),
    ventas: filas.map(function (v) { return tiendaPublica_(v, cfg); }).reverse(), cierres: cierres };
}
function tiendaAnular(sesion, id, motivo) {
  var quien = String(exigirAdmin_(sesion) || '').split('@')[0];
  try { return tiendaAnularVenta_(id, motivo, quien, '', true, leerConfig_()); }
  catch (e) { throw new Error(e && e.userError ? e.message : String(e && e.message || e)); }
}
