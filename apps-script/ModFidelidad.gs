/* =========================== FIDELIDAD (opcional) ===========================
   Se enciende con Config modulo_fidelidad = SI (además de modulo_clientes, que guarda a los clientes).
   Regla: Config fidelidad_soles_por_punto = cuántos soles gastados dan 1 punto (ej.: 10). VACÍA = apagado.
   Puntos ganados = parte entera de (total gastado ÷ regla), con los pedidos no cancelados que ya están en la hoja Clientes.
   Saldo = ganados − canjeados ± ajustes. No hay premios ni equivalencias inventadas: quien canjea escribe qué entregó
   (el motivo) y queda en la hoja "Puntos" y en "Auditoría". Si el dueño cambia la regla, el saldo se recalcula con la nueva.
   El cajero lo usa por EXT 'fidelidad' (acciones 'saldo' y 'canjear', con la llave del equipo); el admin, desde el panel. */

var EXT_ACCIONES = EXT_ACCIONES || {};
var HOJA_PUNTOS = 'Puntos', COLS_PUNTOS = ['id', 'fecha', 'telefono', 'tipo', 'puntos', 'motivo', 'usuario', 'rid'];

function fidelidadRegla_(cfg) {
  var v = Number(String(cfg.fidelidad_soles_por_punto == null ? '' : cfg.fidelidad_soles_por_punto).replace(',', '.'));
  return isFinite(v) && v > 0 ? v : 0;
}
function fidelidadMovs_(tel, zona) {
  return leerTabla_(HOJA_PUNTOS).filter(function (m) { return normalizarTelefono_(m.telefono) === tel; })
    .map(function (m) { return { id: String(m.id), fecha: fechaCorta_(m.fecha, zona), ts: m.fecha instanceof Date ? m.fecha.getTime() : 0, tipo: String(m.tipo), puntos: numSeguro_(m.puntos), motivo: String(m.motivo || ''), usuario: String(m.usuario || ''), rid: String(m.rid || '') }; })
    .sort(function (a, b) { return b.ts - a.ts; });
}
function fidelidadSaldoDe_(c, regla, movs) {
  var ganados = regla && c ? Math.floor((c.total || 0) / regla + 1e-9) : 0, canj = 0, aj = 0;
  movs.forEach(function (m) { if (m.tipo === 'canje') canj += m.puntos; else if (m.tipo === 'ajuste') aj += m.puntos; });
  return { ganados: ganados, canjeados: canj, ajustes: aj, saldo: ganados - canj + aj };
}
function fidelidadResumen_(tel, cfg, c, zona) {
  var regla = fidelidadRegla_(cfg), movs = fidelidadMovs_(tel, zona), s = fidelidadSaldoDe_(c, regla, movs);
  return { regla: regla, ganados: s.ganados, canjeados: s.canjeados, ajustes: s.ajustes, saldo: s.saldo, movimientos: movs.slice(0, 30) };
}

/** Registra un canje o ajuste. Idempotente por rid. usuario = quién lo hace. Devuelve el saldo nuevo. */
function fidelidadMover_(tipo, tel, puntos, motivo, rid, usuario) {
  tel = normalizarTelefono_(tel);
  if (!tel) throw extError_('Teléfono no válido.');
  puntos = Number(puntos);
  if (!isFinite(puntos) || Math.floor(puntos) !== puntos) throw extError_('Los puntos deben ser un número entero.');
  if (tipo === 'canje' && puntos < 1) throw extError_('Escribe cuántos puntos se canjean (mínimo 1).');
  if (tipo === 'ajuste' && (puntos === 0 || Math.abs(puntos) > 100000)) throw extError_('El ajuste debe ser distinto de cero.');
  if (tipo === 'canje' && puntos > 100000) throw extError_('Cantidad de puntos no válida.');
  motivo = String(motivo || '').replace(/[\u0000-\u001f]/g, ' ').trim().slice(0, 120);
  if (motivo.length < 3) throw extError_(tipo === 'canje' ? 'Escribe qué se entregó a cambio.' : 'Escribe el motivo del ajuste.');
  rid = String(rid || '').replace(/[^A-Za-z0-9_-]/g, '').slice(0, 40);
  if (rid.length < 6) throw extError_('Falta el identificador de la operación. Vuelve a intentar.');
  var cfg = leerConfig_(), zona = cfg.zona_horaria || 'America/Lima', regla = fidelidadRegla_(cfg);
  if (!regla) throw extError_('La fidelidad está apagada: falta definir cuántos soles dan 1 punto.');
  clientesAlDia_();   // fuera del bloqueo de abajo (el de Apps Script no se puede anidar)
  var lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    var c = clientesLeerMapa_()[tel];
    if (!c) throw extError_('No hay un cliente con ese teléfono (solo cuentan los pedidos con teléfono).');
    var movs = fidelidadMovs_(tel, zona);
    var igual = movs.filter(function (m) { return m.rid === rid; })[0];
    if (igual) return { saldo: fidelidadSaldoDe_(c, regla, movs).saldo, repetido: true };
    var s = fidelidadSaldoDe_(c, regla, movs);
    if (tipo === 'canje' && puntos > s.saldo) throw extError_('El cliente tiene ' + s.saldo + ' puntos: no alcanza para canjear ' + puntos + '.');
    if (tipo === 'ajuste' && s.saldo + puntos < 0) throw extError_('El saldo no puede quedar negativo.');
    var ss = SpreadsheetApp.getActive(), h = obtenerHoja_(ss, HOJA_PUNTOS, COLS_PUNTOS), cab = asegurarColumnas_(h, COLS_PUNTOS);
    var f = { id: Utilities.getUuid().slice(0, 8), fecha: new Date(), telefono: tel, tipo: tipo, puntos: puntos, motivo: motivo, usuario: usuario, rid: rid };
    var fila = h.getLastRow() + 1;
    h.getRange(fila, cab.indexOf('telefono') + 1, 1, 1).setNumberFormat('@');
    h.getRange(fila, 1, 1, cab.length).setValues([cab.map(function (k) { return f[k] == null ? '' : protegerCelda_(f[k]); })]);
    auditar_(usuario, tipo === 'canje' ? 'Canje de puntos' : 'Ajuste de puntos', telEnmascarado_(tel) + ' · ' + puntos + ' pts · ' + motivo);
    return { saldo: s.saldo - (tipo === 'canje' ? puntos : -puntos) };
  } finally { lock.releaseLock(); }
}

/* ---------- cajero (equipo con enlace) ---------- */
EXT_ACCIONES['fidelidad'] = function (body) {
  var q = extPersonal_(body, ['cajero']);
  var a = String(body.accion || ''), cfg = leerConfig_();
  if (!moduloActivo_(cfg, 'clientes')) throw extError_('El módulo de clientes no está activo.');
  var regla = fidelidadRegla_(cfg);
  if (!regla) throw extError_('La fidelidad no está configurada.');
  var tel = normalizarTelefono_(body.tel);
  if (a === 'saldo') {
    if (!tel) throw extError_('Escribe el teléfono del cliente.');
    clientesAlDia_();
    var c = clientesLeerMapa_()[tel];
    if (!c) return { ok: true, existe: false };
    var zona = cfg.zona_horaria || 'America/Lima', s = fidelidadSaldoDe_(c, regla, fidelidadMovs_(tel, zona));
    return { ok: true, existe: true, nombre: String(c.nombre || '').split(' ')[0], saldo: s.saldo, regla: regla };
  }
  if (a === 'canjear') {
    var r = fidelidadMover_('canje', tel, body.puntos, body.motivo, body.rid, 'cajero:' + q.nombre);
    return { ok: true, saldo: r.saldo, repetido: !!r.repetido };
  }
  return { ok: false, error: 'Acción no válida.' };
};

/* ---------- panel (solo administrador) ---------- */
function fidelidadModulo(sesion, activar) {
  var q = modExigir_(sesion, 'clientes');
  guardarClave_('modulo_fidelidad', activar === true ? 'SI' : 'NO');
  auditar_(q, activar === true ? 'Encendió fidelidad' : 'Apagó fidelidad', '');
  return { ok: true, activa: activar === true };
}
function fidelidadGuardarRegla(sesion, valor) {
  var q = modExigir_(sesion, 'clientes');
  var v = String(valor == null ? '' : valor).trim().replace(',', '.');
  if (v !== '' && !(Number(v) > 0 && Number(v) <= 100000)) throw new Error('Escribe un número mayor que cero (soles por punto) o déjalo vacío para apagar.');
  guardarClave_('fidelidad_soles_por_punto', v);
  auditar_(q, 'Cambió regla de fidelidad', v === '' ? '(vacío = apagado)' : '1 punto por S/ ' + v);
  return { ok: true, regla: v };
}
function fidelidadCanjear(sesion, telefono, puntos, motivo, rid) {
  var q = modExigir_(sesion, 'fidelidad');
  var r = fidelidadMover_('canje', telefono, puntos, motivo, rid, 'admin:' + q);
  return { ok: true, saldo: r.saldo, repetido: !!r.repetido };
}
function fidelidadAjustar(sesion, telefono, puntos, motivo, rid) {
  var q = modExigir_(sesion, 'fidelidad');
  var r = fidelidadMover_('ajuste', telefono, puntos, motivo, rid, 'admin:' + q);
  return { ok: true, saldo: r.saldo, repetido: !!r.repetido };
}
