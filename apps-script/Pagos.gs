/* =========================== VERIFICACIÓN AUTOMÁTICA DE PAGOS (Plin Interbank vía Gmail) ===========================
 * Los avisos de Plin de Interbank llegan a pastagallofatima@gmail.com; un filtro de Gmail los REENVÍA a la cuenta
 * dueña de este script (la que publica la web app), y aquí se leen con GmailApp.
 *
 * Flujo: el cliente paga con Yape/Plin y sube la captura → el pedido queda pago_estado "Por verificar" y NO se imprime.
 *  - La web consulta doPost { verificarPago: id, telefono } cada 8 s (≈3 min).
 *  - Además, un activador revisa cada 5 min los pedidos por verificar de las últimas 3 h (instalarRevisionPagos).
 *  - En el panel, el botón "🔎 Verificar con Gmail" hace lo mismo al instante.
 * Se acepta un aviso de Gmail si: tiene EXACTAMENTE el monto a pagar (productos + delivery; columnas total + costo_delivery), llegó entre pago_ventana_min (15) minutos
 * antes del pedido y ahora, y su número de operación (o el id del correo) no se usó antes para otro pedido.
 * Si coincide → pago_estado "Verificado" + estado "Confirmado" → el panel imprime la comanda de cocina.
 * Si no → sigue "Por verificar" (el local revisa la captura y confirma a mano). Nunca se imprime sin pago verificado.
 *
 * Config (hoja Config, opcional): pago_gmail_busqueda = consulta de Gmail (por defecto PAGO_BUSQUEDA_DEF),
 * pago_ventana_min = minutos antes del pedido que se aceptan (15).
 */
var HOJA_PAGOS_GMAIL = 'PagosGmail';
var COLS_PAGOS_GMAIL = ['clave', 'fecha_correo', 'monto', 'operacion', 'pedido', 'verificado', 'asunto'];
var PAGO_BUSQUEDA_DEF = '(from:interbank OR subject:plin) newer_than:2d';

/** doPost { verificarPago: id, telefono } → { ok, estado: 'verificado'|'pendiente'|'rechazado', num_dia } */
function verificarPagoPublico_(body) {
  var id = String(body.verificarPago || '').replace(/\D/g, '').slice(0, 12);
  var tel = String(body.telefono || '').replace(/\D/g, '').slice(-9);
  if (!id || tel.length < 9) return { ok: false, estado: 'rechazado', error: 'Datos incompletos.' };
  var cache = CacheService.getScriptCache();
  var n = Number(cache.get('verif:' + id) || 0);
  if (n > 80) return { ok: true, estado: 'pendiente' }; // tope de consultas por pedido
  cache.put('verif:' + id, String(n + 1), 3600);
  var p = pedidoPorId_(id);
  if (!p || String(p.telefono).replace(/\D/g, '').slice(-9) !== tel) return { ok: false, estado: 'rechazado', error: 'Pedido no encontrado.' };
  var res = { ok: true, estado: 'pendiente', num_dia: p.num_dia, total: Number(p.total) || 0, aCobrar: Math.round(((Number(p.total) || 0) + (Number(p.costo_delivery) || 0)) * 100) / 100 };
  if (String(p.estado) === 'Cancelado') { res.estado = 'rechazado'; return res; }
  var pe = String(p.pago_estado || '');
  if (pe === 'Verificado' || pe === 'Confirmado') { res.estado = 'verificado'; return res; }
  if (pe !== 'Por verificar' || /transfer/i.test(String(p.pago))) return res;
  if (cache.get('verifg:' + id)) return res; // Gmail como máximo cada 6 s por pedido
  cache.put('verifg:' + id, '1', 6);
  if (intentarVerificarPago_(id)) res.estado = 'verificado';
  return res;
}

/** Panel: "🔎 Verificar con Gmail". Devuelve true si quedó verificado. */
function verificarPagoPanel(sesion, numero) {
  exigirAdmin_(sesion);
  return intentarVerificarPago_(String(numero));
}

/** Activador (cada 5 min): revisa los pedidos por verificar de las últimas 3 horas. */
function revisarPagosPendientes() {
  var cacheRp = CacheService.getScriptCache();
  if (cacheRp.get('rev-pagos')) return; // tope: una revisión por minuto aunque la llamen desde fuera
  cacheRp.put('rev-pagos', '1', 60);
  var h = SpreadsheetApp.getActive().getSheetByName(HOJA.pedidos);
  var n = h.getLastRow(); if (n < 2) return;
  var cab = h.getRange(1, 1, 1, h.getLastColumn()).getValues()[0].map(String);
  var desde = Math.max(2, n - 149);
  var filas = h.getRange(desde, 1, n - desde + 1, cab.length).getValues();
  var iPe = cab.indexOf('pago_estado'), iF = cab.indexOf('fecha'), iE = cab.indexOf('estado'), iPago = cab.indexOf('pago');
  var limite = Date.now() - 3 * 3600 * 1000;
  filas.forEach(function (f) {
    if (String(f[iPe]) !== 'Por verificar' || String(f[iE]) === 'Cancelado' || /transfer/i.test(String(f[iPago]))) return;
    if (!(f[iF] instanceof Date) || f[iF].getTime() < limite) return;
    try { intentarVerificarPago_(String(f[0])); } catch (e) { console.error('revisarPagosPendientes', e); }
  });
}

/** Ejecutar UNA vez desde el editor: autoriza Gmail e instala la revisión automática cada 5 minutos. */
function instalarRevisionPagos() {
  exigirAdmin_(''); // solo editores del Sheets: crea/borra activadores
  ScriptApp.getProjectTriggers().forEach(function (t) { if (t.getHandlerFunction() === 'revisarPagosPendientes') ScriptApp.deleteTrigger(t); });
  ScriptApp.newTrigger('revisarPagosPendientes').timeBased().everyMinutes(5).create();
  GmailApp.search(PAGO_BUSQUEDA_DEF, 0, 1); // fuerza el permiso de Gmail
  return 'Listo: revisión de pagos instalada.';
}

/* ---------- núcleo ---------- */
function intentarVerificarPago_(id) {
  var ok = verificarPagoGmail_(id);
  if (ok) imprimirPedidoServidor_(id); // pago verificado: la comanda sale sola (fuera del bloqueo)
  return ok;
}
function verificarPagoGmail_(id) {
  var lock = LockService.getScriptLock();
  if (!lock.tryLock(15000)) return false;
  try {
    var p = pedidoPorId_(id);
    if (!p || String(p.pago_estado) !== 'Por verificar' || String(p.estado) === 'Cancelado') return false;
    // Monto a pagar = productos + delivery (columna total = solo productos; costo_delivery aparte). Pedidos sin delivery: igual que antes.
    var total = Math.round(((Number(p.total) || 0) + (Number(p.costo_delivery) || 0)) * 100) / 100;
    var fecha = p.fecha instanceof Date ? p.fecha : new Date(p.fecha);
    if (!(total > 0) || isNaN(fecha.getTime())) return false;
    var cfg = leerConfig_();
    var ventana = (num_(cfg.pago_ventana_min) || 15) * 60000;
    var desde = fecha.getTime() - ventana, hasta = Date.now() + 120000;
    var usados = clavesPagoUsadas_();
    var hilos = GmailApp.search(String(cfg.pago_gmail_busqueda || PAGO_BUSQUEDA_DEF), 0, 30);
    for (var i = 0; i < hilos.length; i++) {
      var msgs = hilos[i].getMessages();
      for (var j = msgs.length - 1; j >= 0; j--) {
        var m = msgs[j], t = m.getDate().getTime();
        if (t < desde || t > hasta) continue;
        var asunto = m.getSubject() || '';
        var texto = asunto + '\n' + (m.getPlainBody() || String(m.getBody() || '').replace(/<[^>]+>/g, ' '));
        if (!/plin|interbank/i.test(texto)) continue;
        if (!montosEnTexto_(texto).some(function (x) { return Math.abs(x - total) < 0.005; })) continue;
        var op = operacionEnTexto_(texto);
        var clave = op ? 'op:' + op : 'msg:' + m.getId();
        if (usados[clave] || usados['msg:' + m.getId()]) continue;
        registrarPagoUsado_(clave, m, total, op, id, asunto);
        marcarPagoVerificado_(p, op);
        return true;
      }
    }
    return false;
  } finally {
    lock.releaseLock();
  }
}

/** Montos tipo "S/ 1,234.50", "S/. 25", "S/25,00", "Monto: 25.00". */
function montosEnTexto_(texto) {
  var r = [], re = /(?:S\/\.?|PEN|soles|monto|importe)\s*:?\s*(?:S\/\.?\s*)?([0-9][0-9.,]*)/gi, m;
  while ((m = re.exec(texto)) !== null) {
    var s = m[1].replace(/[.,]+$/, ''), d = s.match(/[.,](\d{1,2})$/);
    s = d ? s.slice(0, -d[0].length).replace(/[.,]/g, '') + '.' + d[1] : s.replace(/[.,]/g, '');
    var v = Number(s);
    if (isFinite(v) && v > 0) r.push(Math.round(v * 100) / 100);
  }
  return r;
}
function operacionEnTexto_(texto) {
  var m = texto.match(/(?:n[°º.o]*\s*(?:de\s*)?operaci[oó]n|c[oó]digo\s*(?:de\s*)?operaci[oó]n|operaci[oó]n|nro\.?\s*de\s*operaci[oó]n)\s*[:#]?\s*(\d{4,})/i);
  return m ? m[1] : '';
}

/* ---------- hoja de pedidos y registro de avisos usados ---------- */
function pedidoPorId_(id) {
  var h = SpreadsheetApp.getActive().getSheetByName(HOJA.pedidos);
  var n = h.getLastRow(); if (n < 2) return null;
  var cab = h.getRange(1, 1, 1, h.getLastColumn()).getValues()[0].map(String);
  var desde = Math.max(2, n - 799);
  var nums = h.getRange(desde, 1, n - desde + 1, 1).getValues();
  for (var i = nums.length - 1; i >= 0; i--) {
    if (String(nums[i][0]) !== String(id)) continue;
    var fila = desde + i, v = h.getRange(fila, 1, 1, cab.length).getValues()[0], o = { _fila: fila, _cab: cab, _hoja: h };
    cab.forEach(function (c, j) { o[c] = v[j]; });
    return o;
  }
  return null;
}
function marcarPagoVerificado_(p, op) {
  var h = p._hoja, cab = p._cab, ahora = new Date();
  var col = function (c) { return cab.indexOf(c) + 1; };
  h.getRange(p._fila, col('pago_estado')).setValue('Verificado');
  if (String(p.estado) === 'Nuevo') h.getRange(p._fila, col('estado')).setValue('Confirmado');
  if (col('actualizado')) h.getRange(p._fila, col('actualizado')).setValue(ahora);
  if (col('historial')) {
    var his = String(p.historial || '');
    h.getRange(p._fila, col('historial')).setValue((his ? his + ' · ' : '') + 'Pago verificado por Gmail' + (op ? ' (op. ' + op + ')' : '') +
      (String(p.estado) === 'Nuevo' ? ' · Confirmado' : '') + ' ' + fmt_(ahora, 'HH:mm'));
  }
  PropertiesService.getScriptProperties().setProperty('PEDIDOS_VERSION', String(Date.now()));
}
function hojaPagosGmail_() {
  var ss = SpreadsheetApp.getActive();
  var h = obtenerHoja_(ss, HOJA_PAGOS_GMAIL, COLS_PAGOS_GMAIL);
  asegurarColumnas_(h, COLS_PAGOS_GMAIL);
  return h;
}
function clavesPagoUsadas_() {
  var h = hojaPagosGmail_(), n = h.getLastRow(), r = {};
  if (n < 2) return r;
  h.getRange(Math.max(2, n - 1999), 1, Math.min(n - 1, 2000), 1).getValues().forEach(function (f) { if (f[0]) r[String(f[0])] = true; });
  return r;
}
function registrarPagoUsado_(clave, m, monto, op, id, asunto) {
  var h = hojaPagosGmail_();
  h.appendRow([clave, m.getDate(), monto, op ? "'" + op : '', id, new Date(), String(asunto).slice(0, 120)]);
  if (clave.indexOf('msg:') !== 0) h.appendRow(['msg:' + m.getId(), m.getDate(), monto, op ? "'" + op : '', id, new Date(), '(id del correo)']);
}
