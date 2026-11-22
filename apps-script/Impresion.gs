/* =========================== IMPRESIÓN DIRECTA (ESC/POS) ===========================
 * En la computadora del local corre C:\PastaGallo\Impresora\ImpresoraPastaGallo.ps1.
 * Cada 2 s pregunta aquí (doGet ?imp=cola&k=CLAVE) si hay tickets, los imprime en la
 * SAT Q22UE en modo RAW (ESC/POS: el papel sale solo hasta donde hay contenido y CORTA)
 * y confirma los que imprimió (&ids=...).
 * El panel encola con encolarImpresion(). Si el programa local no responde hace más de
 * 20 s, el panel imprime como antes (Chrome --kiosk-printing), así nunca se pierde una comanda.
 * Vincular: en el panel "🔗 Vincular impresora" abre 5 minutos para que el programa local
 * registre su clave (?imp=registrar&k=CLAVE). Solo una impresora vinculada a la vez.
 */
var IMP_TTL = 21600; // 6 h

function impresoraViva_() {
  return Date.now() - Number(CacheService.getScriptCache().get('imp-latido') || 0) < 20000;
}
function leerColaImp_(cache) {
  try { return JSON.parse(cache.get('imp-cola') || '[]'); } catch (e) { return []; }
}

/** Panel: estado de la impresora directa. */
function estadoImpresora(sesion) {
  exigirAdmin_(sesion);
  return { viva: impresoraViva_(), auto: impresionAuto_(), vinculada: !!PropertiesService.getScriptProperties().getProperty('IMP_CLAVE') };
}

/** Impresión automática: un solo ajuste para todo el panel (todas las ventanas y equipos). */
function impresionAuto_() { return PropertiesService.getScriptProperties().getProperty('IMP_AUTO') !== '0'; }
function ponerImpresionAuto(sesion, activa) {
  exigirAdmin_(sesion);
  PropertiesService.getScriptProperties().setProperty('IMP_AUTO', activa ? '1' : '0');
  return impresionAuto_();
}

/** Panel: permite vincular el programa local durante 5 minutos. */
function vincularImpresora(sesion) {
  exigirAdmin_(sesion);
  CacheService.getScriptCache().put('imp-vincular', '1', 300);
  return { ok: true };
}

/** Panel: pone un ticket en la cola. job = { k: clave anti-duplicado (opcional), auto, n: nombre, l: [[estilo, texto], ...] }.
 *  Devuelve { viva:false } si el programa local no está activo (el panel imprime por Chrome). */
function encolarImpresion(sesion, job) {
  exigirAdmin_(sesion);
  if (job && job.auto && !impresionAuto_()) return { ok: true, omitido: true }; // impresión automática apagada
  var clave = String(job && job.k || '').slice(0, 120);
  // si el servidor ya lo mandó a imprimir (pedido nuevo), no se repite ni se imprime por Chrome
  if (clave && CacheService.getScriptCache().get('imp-k:' + clave)) return { ok: true, viva: true, duplicado: true };
  if (!impresoraViva_()) return { ok: false, viva: false };
  var lineas = (job && job.l || []).slice(0, 400).map(function (x) {
    return [String(x[0] || 'n').slice(0, 8), String(x[1] == null ? '' : x[1]).replace(/[\u0000-\u0009\u000b-\u001f\u007f]/g, ' ').slice(0, 2000)];
  });
  var r = ponerEnCola_(clave, String(job && job.n || '').slice(0, 60), lineas);
  r.viva = true;
  return r;
}

/** Cola compartida (panel y servidor). Con clave: nunca se encola dos veces lo mismo (6 h). */
function ponerEnCola_(clave, nombre, lineas) {
  var cache = CacheService.getScriptCache();
  var lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    if (clave && cache.get('imp-k:' + clave)) return { ok: true, duplicado: true };
    var cola = leerColaImp_(cache);
    var id = Utilities.getUuid().replace(/-/g, '').slice(0, 12);
    cola.push({ id: id, t: Date.now(), n: nombre, l: lineas });
    cache.put('imp-cola', JSON.stringify(cola), IMP_TTL);
    if (clave) cache.put('imp-k:' + clave, '1', IMP_TTL);
    return { ok: true, id: id };
  } finally {
    lock.releaseLock();
  }
}

/** SERVIDOR: imprime solo el pedido (ticket de COCINA, y comanda completa si es delivery/recojo) sin depender
 *  de que el panel esté abierto. Se llama al registrar un pedido (web, QR, mozo "Enviar a cocina") y al
 *  confirmar/verificar un pago. NUNCA imprime un pago "Por verificar" ni con la impresión automática apagada.
 *  Si el programa local no está activo no hace nada: lo imprime el panel por Chrome (respaldo). */
function imprimirPedidoServidor_(id) {
  try {
    if (!impresionAuto_() || !impresoraViva_()) return false;
    var fila = pedidoPorId_(id); if (!fila) return false;
    var p = pedidoAObjeto_(fila, leerConfig_().zona_horaria || 'America/Lima');
    if (p.pagoEstado === 'Por verificar' || p.estado === 'Cancelado') return false;
    var nombre = (p.canal === 'mesa' ? 'Mesa ' + p.mesa : '#' + p.nd);
    if ((p.cocina || []).length) ponerEnCola_('auto-cocina-' + p.numero, 'Cocina ' + nombre, lineasTicketServidor_('cocina', p));
    else CacheService.getScriptCache().put('imp-k:auto-cocina-' + p.numero, '1', IMP_TTL); // solo Cargos Adicionales: nada para cocina
    if (p.canal !== 'mesa') ponerEnCola_('auto-comanda-' + p.numero, 'Comanda ' + nombre, lineasTicketServidor_('comanda', p));
    return true;
  } catch (e) {
    console.error('imprimirPedidoServidor_', e);
    return false;
  }
}

/** Mismo ticket que arma el panel (lineasTicket en Panel.html), pero en el servidor. */
function lineasTicketServidor_(tipo, p) {
  var L = [], a = function (s, t) { if (t != null && String(t).trim() !== '') L.push([s, String(t)]); };
  var nro = p.nd || p.numero, soles = function (n) { return 'S/ ' + Number(n || 0).toFixed(2); };
  if (tipo === 'cocina') {
    a('mesa', p.canal === 'mesa' ? 'MESA ' + p.mesa : (p.canal === 'recojo' ? 'RECOJO' : 'DELIVERY') + ' #' + nro);
    if (p.mozo) a('gc', 'Moza: ' + p.mozo);
    a('c', (p.hora || '') + (p.canal === 'mesa' ? ' #' + nro : ''));
    if (p.programado) a('gc', '>> PARA LAS ' + p.programado + ' <<');
    var lista = p.cocina || [];
    if (!lista.length) { L.push(['hr', '']); a('g', p.detalle); }
    var orden = ['ENTRADAS', 'PIZZAS', 'PASTAS', 'PARRILLAS', 'PROMOCIONES', 'POSTRES', 'PRODUCTOS ITALIANOS', 'BEBIDAS', 'OTROS'];
    orden.concat(lista.map(function (x) { return x.s; }).filter(function (s, i, arr) { return orden.indexOf(s) < 0 && arr.indexOf(s) === i; })).forEach(function (sec) {
      var items = lista.filter(function (x) { return x.s === sec; });
      if (!items.length) return;
      a('sec', sec);
      items.forEach(function (x) { a('it', x.c + ' ' + String(x.n).toUpperCase()); (x.d || []).forEach(function (t) { a('d', '· ' + t); }); });
    });
    if (p.notas) { L.push(['hr', '']); a('g', 'COMENTARIOS:'); a('it', p.notas); }
  } else {
    a('pc', 'PASTA GALLO');
    a('h1', p.canal === 'mesa' ? 'MESA ' + p.mesa : (p.canal === 'recojo' ? 'RECOJO' : 'DELIVERY'));
    a('h2', 'Pedido #' + nro + (p.ref ? ' · ' + p.ref : ''));
    a('c', p.fecha);
    if (p.programado) a('gc', '>> PARA LAS ' + p.programado + ' <<');
    L.push(['hr', '']); a('n', p.detalle); L.push(['hr', '']);
    if (p.notas) { a('g', 'COMENTARIOS:'); a('n', p.notas); L.push(['hr', '']); }
    if (p.nombre) a('n', 'Cliente: ' + p.nombre);
    if (p.telefono) a('n', 'Cel: ' + p.telefono);
    if (p.direccion) a('n', 'Dir: ' + p.direccion + (p.referencia ? ' (' + p.referencia + ')' : ''));
    if (p.pago) a('n', 'Pago: ' + p.pago + (p.pagoEstado === 'Verificado' ? ' (verificado)' : p.pagoEstado === 'Confirmado' ? ' (confirmado)' : ''));
    if (p.mozo) a('g', 'Mozo: ' + p.mozo);
    if (p.comprobante) { L.push(['hr', '']); a('g', String(p.comprobante).toUpperCase() + ': ' + p.doc); a('n', p.razon); a('p', p.correo); }
    if (p.canal === 'delivery' && p.costoDelivery != null) {
      a('n', 'Productos ' + soles(p.total)); a('n', 'Delivery' + (p.zonaDelivery ? ' (' + p.zonaDelivery + ')' : '') + ' ' + soles(p.costoDelivery));
      a('tot', 'TOTAL ' + soles(p.aCobrar != null ? p.aCobrar : (Number(p.total) || 0) + p.costoDelivery));
    } else a('tot', 'TOTAL ' + soles(p.total) + (p.canal === 'delivery' ? ' + deliv.' : ''));
  }
  return L;
}

/** doGet ?imp=registrar|cola : lo llama solo el programa de la computadora del local. */
function apiImpresora_(p) {
  var k = String(p.k || '');
  if (!/^[a-f0-9]{32,64}$/.test(k)) return { ok: false, error: 'clave' };
  var props = PropertiesService.getScriptProperties();
  var cache = CacheService.getScriptCache();
  if (p.imp === 'registrar') {
    if (props.getProperty('IMP_CLAVE') === k) return { ok: true };
    if (!cache.get('imp-vincular')) return { ok: false, error: 'esperando' };
    props.setProperty('IMP_CLAVE', k);
    cache.remove('imp-vincular');
    return { ok: true };
  }
  if (props.getProperty('IMP_CLAVE') !== k) return { ok: false, error: 'clave' };
  cache.put('imp-latido', String(Date.now()), IMP_TTL);
  var cola = leerColaImp_(cache);
  if (p.ids && cola.length) {
    var lock = LockService.getScriptLock();
    lock.waitLock(10000);
    try {
      var listos = String(p.ids).split(',');
      cola = leerColaImp_(cache).filter(function (j) { return listos.indexOf(j.id) < 0; });
      cache.put('imp-cola', JSON.stringify(cola), IMP_TTL);
    } finally {
      lock.releaseLock();
    }
  }
  return { ok: true, trabajos: cola };
}

/** Prueba desde el editor: imprime (marcado PRUEBA) el ticket de cocina del último pedido, armado por el servidor. */
function probarImpresionServidor() {
  exigirAdmin_(''); // solo editores del Sheets (esta función es visible para el panel web)
  var h = SpreadsheetApp.getActive().getSheetByName(HOJA.pedidos);
  var id = h.getRange(h.getLastRow(), 1).getValue();
  var p = pedidoAObjeto_(pedidoPorId_(id), leerConfig_().zona_horaria || 'America/Lima');
  var r = ponerEnCola_('', 'PRUEBA servidor', [['pc', '*** PRUEBA (servidor) ***']].concat(lineasTicketServidor_('cocina', p)));
  console.log('pedido ' + id + ' viva=' + impresoraViva_() + ' auto=' + impresionAuto_() + ' ' + JSON.stringify(r));
  return r;
}
