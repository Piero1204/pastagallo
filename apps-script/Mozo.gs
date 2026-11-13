/* =========================== PANEL DEL MOZO ===========================
   Web: https://pastagallo.pages.dev/mozo (instalable en tablet y celular).
   - Cada mozo entra con su nombre + PIN (4 a 6 dígitos). El equipo recuerda la sesión 30 días.
   - Desactivar a un mozo o cambiarle el PIN cierra sus sesiones al instante.
   - Lo que pide el mozo entra como pedido de MESA (se imprime solo en la PC del local) con su nombre.
   - Cobrar mesa: métodos (se puede dividir) + propina por método. Hoja "Cobros".
     · Propina en Yape / Plin / Tarjeta: entra a la cuenta del negocio → se le debe al mozo.
     · Efectivo: el mozo recibe el consumo (lo entrega a caja) y se queda con su propina.
   Todas las llamadas llegan por doPost con { mz: 'accion', t: token, ... }.
   Config (opcional, hoja Config): mozo_minutos_antes (30) = cuánto antes de abrir cocina se puede entrar;
   mozo_minutos_despues (60) = cuánto queda abierto el panel después de que cierra la cocina (para cobrar). */

var HOJA_MOZOS = 'Mozos', HOJA_COBROS = 'Cobros';
var COLS_MOZOS = ['id', 'nombre', 'pin', 'activo', 'gen', 'creado', 'ultimo_acceso'];
var COLS_COBROS = ['id', 'fecha', 'mesa', 'mozo_id', 'mozo', 'consumo', 'metodo', 'monto', 'propina', 'pedidos', 'liquidado', 'notas'];
var MOZO_DIAS_SESION = 30;

function respuestaMozo_(body) {
  var a = String(body.mz || '');
  try {
    if (a === 'lista') return { ok: true, mozos: mozosActivos_().map(function (m) { return { id: m.id, nombre: m.nombre }; }) };
    if (a === 'login') return loginMozo_(body);
    var mozo = mozoDeToken_(body.t);
    if (!mozo) return { ok: false, sesion: false, error: 'Tu sesión terminó. Vuelve a entrar con tu PIN.' };
    if (a === 'estado') return estadoMozo_(mozo, String(body.v || ''));
    if (a === 'pedido') return pedidoMozo_(mozo, body);
    if (a === 'cuenta') return cuentaParaMozo_(texto_(body.mesa, 6));
    if (a === 'atender') { atenderAvisoComo_(body.id, mozo.nombre); return { ok: true }; }
    if (a === 'cobrar') return cobrarMesa_(mozo, body);
    if (a === 'salir') { borrarToken_(body.t); return { ok: true }; }
    return { ok: false, error: 'Acción no válida.' };
  } catch (err) {
    console.error(err);
    return { ok: false, error: String(err && err.message || err) };
  }
}

/* ---------- mozos ---------- */
function hojaMozos_() { return obtenerHoja_(SpreadsheetApp.getActive(), HOJA_MOZOS, COLS_MOZOS); }
function leerMozos_() {
  if (!SpreadsheetApp.getActive().getSheetByName(HOJA_MOZOS)) return [];
  return leerTabla_(HOJA_MOZOS).filter(function (m) { return String(m.id).trim(); }).map(function (m) {
    return { id: String(m.id), nombre: String(m.nombre), pin: String(m.pin || ''), activo: esSi_(m.activo),
      gen: String(m.gen || '0'), ultimo: m.ultimo_acceso instanceof Date ? m.ultimo_acceso.getTime() : 0, _fila: m._fila };
  });
}
function mozosActivos_() { return leerMozos_().filter(function (m) { return m.activo && m.pin; }); }

function claveToken_(t) {
  var b = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, String(t), Utilities.Charset.UTF_8);
  return 'MZ_' + Utilities.base64EncodeWebSafe(b).slice(0, 32);
}
function borrarToken_(t) { if (t) PropertiesService.getScriptProperties().deleteProperty(claveToken_(String(t).slice(0, 80))); }

/** Valida el token del equipo. Devuelve { id, nombre } o null. */
function mozoDeToken_(t) {
  t = String(t || '').slice(0, 80);
  if (t.length < 40) return null;
  var props = PropertiesService.getScriptProperties();
  var k = claveToken_(t), v = props.getProperty(k);
  if (!v) return null;
  var o = JSON.parse(v);
  if (o.exp < Date.now()) { props.deleteProperty(k); return null; }
  var cache = CacheService.getScriptCache(), ck = 'mz:' + o.id;
  var m = JSON.parse(cache.get(ck) || 'null');
  if (!m) {
    m = leerMozos_().filter(function (x) { return x.id === o.id; })[0] || null;
    if (m) { m = { id: m.id, nombre: m.nombre, activo: m.activo, gen: m.gen }; cache.put(ck, JSON.stringify(m), 60); }
  }
  if (!m || !m.activo || m.gen !== o.g) { props.deleteProperty(k); return null; }
  return { id: m.id, nombre: m.nombre };
}

function loginMozo_(body) {
  var cache = CacheService.getScriptCache();
  var id = texto_(body.id, 20), pin = String(body.pin || '').replace(/\D/g, '');
  var kGlobal = 'mzf', kMozo = 'mzf:' + id;
  if (Number(cache.get(kGlobal) || 0) >= 20 || Number(cache.get(kMozo) || 0) >= 5) {
    return { ok: false, error: 'Demasiados intentos. Espera 15 minutos.' };
  }
  var m = mozosActivos_().filter(function (x) { return x.id === id; })[0];
  var partes = m ? m.pin.split(':') : null;
  if (!m || partes.length !== 2 || !iguales_(hashClave_(pin, partes[0]), partes[1])) {
    cache.put(kGlobal, String(Number(cache.get(kGlobal) || 0) + 1), 900);
    cache.put(kMozo, String(Number(cache.get(kMozo) || 0) + 1), 900);
    Utilities.sleep(1200);
    return { ok: false, error: 'PIN incorrecto.' };
  }
  cache.remove(kMozo);
  var props = PropertiesService.getScriptProperties();
  limpiarTokens_(props);
  var t = Utilities.getUuid().replace(/-/g, '') + Utilities.getUuid().replace(/-/g, '');
  props.setProperty(claveToken_(t), JSON.stringify({ id: m.id, g: m.gen, exp: Date.now() + MOZO_DIAS_SESION * 86400000 }));
  try {
    var h = hojaMozos_(), cab = asegurarColumnas_(h, COLS_MOZOS);
    h.getRange(m._fila, cab.indexOf('ultimo_acceso') + 1).setValue(new Date());
  } catch (e) { /* no es crítico */ }
  return { ok: true, t: t, mozo: { id: m.id, nombre: m.nombre } };
}

function limpiarTokens_(props) {
  var todo = props.getProperties(), ahora = Date.now();
  Object.keys(todo).forEach(function (k) {
    if (k.indexOf('MZ_') !== 0) return;
    try { if (JSON.parse(todo[k]).exp < ahora) props.deleteProperty(k); } catch (e) { props.deleteProperty(k); }
  });
}

/* ---------- horario del panel ----------
   La cocina recibe pedidos dentro del horario de la carta (ej. 18:00–23:00).
   El panel se puede abrir un rato antes y queda abierto después para cobrar (local abierto hasta 00:00). */
function ventanaMozo_(cfg, momento) {
  var antes = num_(cfg.mozo_minutos_antes); if (antes == null) antes = 30;
  var despues = num_(cfg.mozo_minutos_despues); if (despues == null) despues = 60;
  // hoy y ayer (por si el panel sigue abierto pasada la medianoche)
  for (var i = 0; i < 2; i++) {
    var dia = (momento.dia + 7 - i) % 7, r = horarioDe_(cfg, dia);
    if (!r) continue;
    var a = minutos_(r[0]), c = minutos_(r[1]);
    if (c <= a) c += 1440;
    var ahora = momento.min + i * 1440;
    if (ahora >= a - antes && ahora < c + despues) {
      return { panel: true, cocina: ahora >= a && ahora < c, abre: r[0], cierra: r[1],
        cocinaEn: ahora < a ? a - ahora : 0, cierraEn: Math.max(0, c - ahora), localEn: Math.max(0, c + despues - ahora),
        local: hhmm_(c + despues) };
    }
  }
  var hoy = horarioDe_(cfg, momento.dia);
  return { panel: false, cocina: false, abre: hoy ? hoy[0] : '', cierra: hoy ? hoy[1] : '', cierraEn: 0, localEn: 0, local: '' };
}
function hhmm_(m) { m = ((m % 1440) + 1440) % 1440; return ('0' + Math.floor(m / 60)).slice(-2) + ':' + ('0' + (m % 60)).slice(-2); }

/* ---------- estado (mesas, avisos, horario) ---------- */
function estadoMozo_(mozo, version) {
  var props = PropertiesService.getScriptProperties();
  var cfg = leerConfig_(), momento = momentoActual_(cfg), zona = cfg.zona_horaria || 'America/Lima';
  var v = props.getProperty('PEDIDOS_VERSION') || '';
  var base = { ok: true, mozo: mozo, ahora: Date.now(), horario: ventanaMozo_(cfg, momento), v: v };
  if (version && version === v) { base.igual = true; return base; }
  var peds = leerTabla_(HOJA.pedidos);
  base.mesas = leerTabla_(HOJA.mesas).filter(function (m) { return String(m.mesa).trim(); }).map(function (m) {
    var c = cuentaMesa_(m.mesa, m, peds, zona);
    return { mesa: String(m.mesa), activa: esSi_(m.activa), total: c.total, n: c.pedidos.length,
      desde: c.pedidos.length ? c.pedidos[0].hora : '' };
  });
  base.avisos = avisosPendientes_(zona);
  base.metodos = String(cfg.metodos_pago_mesa || 'Yape, Plin, Efectivo, Tarjeta').split(',').map(function (s) { return s.trim(); }).filter(Boolean);
  return base;
}

function cuentaParaMozo_(mesa) {
  var cfg = leerConfig_(), zona = cfg.zona_horaria || 'America/Lima';
  var m = leerTabla_(HOJA.mesas).filter(function (x) { return String(x.mesa) === String(mesa); })[0];
  if (!m) return { ok: false, error: 'Mesa no encontrada.' };
  var c = cuentaMesa_(mesa, m, leerTabla_(HOJA.pedidos), zona);
  c.ok = true;
  return c;
}

/* ---------- tomar pedido ---------- */
function pedidoMozo_(mozo, body) {
  var mesa = texto_(body.mesa, 6);
  var m = leerTabla_(HOJA.mesas).filter(function (x) { return String(x.mesa) === mesa; })[0];
  if (!m || !esSi_(m.activa)) return { ok: false, error: 'Esa mesa no existe o está desactivada.' };
  var limpio = { canal: 'mesa', mesa: mesa, items: body.items, notas: body.notas, origen: 'mozo' };
  var r = registrarPedido_(limpio, mozo);
  if (r && r.ok) r.cuenta = cuentaParaMozo_(mesa);
  return r;
}

function atenderAvisoComo_(id, quien) {
  var h = SpreadsheetApp.getActive().getSheetByName(HOJA.avisos);
  if (!h) return;
  var cab = asegurarColumnas_(h, COLS.avisos);
  leerTabla_(HOJA.avisos).forEach(function (a) {
    if (String(a.id) === String(id) && a.estado === 'Pendiente') {
      h.getRange(a._fila, cab.indexOf('estado') + 1).setValue('Atendido');
      h.getRange(a._fila, cab.indexOf('atendido') + 1).setValue(Utilities.formatDate(new Date(), 'America/Lima', 'HH:mm') + ' ' + String(quien || ''));
    }
  });
  PropertiesService.getScriptProperties().setProperty('PEDIDOS_VERSION', String(Date.now()));
}

/* ---------- cobrar la mesa ----------
   body.pagos = [{ metodo, monto, propina }]; body.total = total que vio el mozo (si cambió, se avisa). */
function cobrarMesa_(mozo, body) {
  var mesa = texto_(body.mesa, 6);
  var cfg = leerConfig_(), zona = cfg.zona_horaria || 'America/Lima';
  var metodos = String(cfg.metodos_pago_mesa || 'Yape, Plin, Efectivo, Tarjeta').split(',').map(function (s) { return s.trim(); }).filter(Boolean);
  var pagos = (Array.isArray(body.pagos) ? body.pagos : []).slice(0, 6).map(function (p) {
    return { metodo: texto_(p && p.metodo, 30), monto: Math.round((num_(p && p.monto) || 0) * 100) / 100,
      propina: Math.round((num_(p && p.propina) || 0) * 100) / 100 };
  }).filter(function (p) { return p.monto > 0 || p.propina > 0; });
  if (!pagos.length) return { ok: false, error: 'Indica cómo pagó la mesa.' };
  for (var i = 0; i < pagos.length; i++) {
    if (metodos.indexOf(pagos[i].metodo) < 0) return { ok: false, error: 'Método de pago no válido: ' + pagos[i].metodo };
    if (pagos[i].monto < 0 || pagos[i].propina < 0 || pagos[i].propina > 500 || pagos[i].monto > 20000) return { ok: false, error: 'Revisa los montos.' };
  }
  var lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    var hm = SpreadsheetApp.getActive().getSheetByName(HOJA.mesas);
    var cabM = asegurarColumnas_(hm, COLS.mesas);
    var m = leerTabla_(HOJA.mesas).filter(function (x) { return String(x.mesa) === mesa; })[0];
    if (!m) return { ok: false, error: 'Mesa no encontrada.' };
    var c = cuentaMesa_(mesa, m, leerTabla_(HOJA.pedidos), zona);
    if (!c.pedidos.length) return { ok: false, error: 'La mesa ' + mesa + ' no tiene cuenta abierta.' };
    if (Math.abs(c.total - (num_(body.total) || 0)) > 0.009) {
      return { ok: false, cambio: true, cuenta: c, error: 'La cuenta cambió (llegó otro pedido). Revisa el nuevo total: S/ ' + c.total.toFixed(2) };
    }
    var pagado = Math.round(pagos.reduce(function (a, p) { return a + p.monto; }, 0) * 100) / 100;
    if (Math.abs(pagado - c.total) > 0.009) {
      return { ok: false, error: 'Los pagos suman S/ ' + pagado.toFixed(2) + ' y la cuenta es S/ ' + c.total.toFixed(2) + '.' };
    }
    var h = obtenerHoja_(SpreadsheetApp.getActive(), HOJA_COBROS, COLS_COBROS);
    var cab = asegurarColumnas_(h, COLS_COBROS);
    var ahora = new Date(), id = Utilities.getUuid().slice(0, 8);
    var nums = c.pedidos.map(function (p) { return p.numero; }).join(', ');
    pagos.forEach(function (p, k) {
      var fila = { id: id + (pagos.length > 1 ? '-' + (k + 1) : ''), fecha: ahora, mesa: mesa, mozo_id: mozo.id, mozo: mozo.nombre,
        consumo: k === 0 ? c.total : 0, metodo: p.metodo, monto: p.monto, propina: p.propina, pedidos: nums, liquidado: '',
        notas: texto_(body.notas, 120) };
      h.appendRow(cab.map(function (col) { return protegerCelda_(fila[col] == null ? '' : fila[col]); }));
    });
    // cerrar la cuenta de la mesa (los pedidos siguientes abren una cuenta nueva)
    hm.getRange(m._fila, cabM.indexOf('abierta_desde') + 1).setValue(new Date(ahora.getTime() + 1000));
    // avisos de esa mesa quedan atendidos
    leerTabla_(HOJA.avisos).forEach(function (a) {
      if (String(a.mesa) === mesa && a.estado === 'Pendiente') atenderAvisoComo_(a.id, mozo.nombre);
    });
    PropertiesService.getScriptProperties().setProperty('PEDIDOS_VERSION', String(Date.now()));
    var propinas = pagos.reduce(function (a, p) { return a + p.propina; }, 0);
    return { ok: true, mesa: mesa, total: c.total, propina: Math.round(propinas * 100) / 100 };
  } finally {
    lock.releaseLock();
  }
}

/* =========================== DESDE EL PANEL PRINCIPAL =========================== */
function listarMozos(sesion) {
  exigirAdmin_(sesion);
  return leerMozos_().map(function (m) { return { id: m.id, nombre: m.nombre, activo: m.activo, tienePin: !!m.pin, ultimo: m.ultimo }; });
}

/** o = { id (vacío = nuevo), nombre, pin (vacío = no cambiar), activo } */
function guardarMozo(sesion, o) {
  exigirAdmin_(sesion);
  var nombre = texto_(o && o.nombre, 30);
  if (nombre.length < 2) throw new Error('Escribe el nombre del mozo.');
  var pin = String(o.pin || '').trim();
  if (pin && !/^\d{4,6}$/.test(pin)) throw new Error('El PIN debe tener de 4 a 6 números.');
  var lista = leerMozos_();
  var m = o.id ? lista.filter(function (x) { return x.id === String(o.id); })[0] : null;
  if (!m && !pin) throw new Error('Un mozo nuevo necesita un PIN.');
  if (lista.some(function (x) { return x.nombre.toLowerCase() === nombre.toLowerCase() && (!m || x.id !== m.id); })) throw new Error('Ya hay un mozo con ese nombre.');
  if (pin && lista.some(function (x) { return x.activo && x.pin && (!m || x.id !== m.id) && iguales_(hashClave_(pin, x.pin.split(':')[0]), x.pin.split(':')[1] || ''); })) {
    throw new Error('Ese PIN ya lo usa otro mozo. Elige otro.');
  }
  var h = hojaMozos_(), cab = asegurarColumnas_(h, COLS_MOZOS);
  var activo = o.activo !== false;
  var hashPin = '';
  if (pin) { var sal = Utilities.getUuid(); hashPin = sal + ':' + hashClave_(pin, sal); }
  if (m) {
    var cambiaAcceso = !!pin || (m.activo && !activo);
    h.getRange(m._fila, cab.indexOf('nombre') + 1).setValue(protegerCelda_(nombre));
    h.getRange(m._fila, cab.indexOf('activo') + 1).setValue(activo ? 'SI' : 'NO');
    if (pin) h.getRange(m._fila, cab.indexOf('pin') + 1).setValue(hashPin);
    if (cambiaAcceso) h.getRange(m._fila, cab.indexOf('gen') + 1).setValue(String(Number(m.gen || 0) + 1));
    CacheService.getScriptCache().remove('mz:' + m.id);
  } else {
    var fila = { id: Utilities.getUuid().slice(0, 6), nombre: nombre, pin: hashPin, activo: activo ? 'SI' : 'NO', gen: '1', creado: new Date(), ultimo_acceso: '' };
    h.appendRow(cab.map(function (c) { return c === 'pin' ? fila[c] : protegerCelda_(fila[c] == null ? '' : fila[c]); }));
  }
  return listarMozos(sesion);
}

/** Reporte por mozo entre dos fechas (yyyy-MM-dd, incluidas). */
function reporteMozos(sesion, desde, hasta) {
  exigirAdmin_(sesion);
  var cfg = leerConfig_(), zona = cfg.zona_horaria || 'America/Lima';
  if (!SpreadsheetApp.getActive().getSheetByName(HOJA_COBROS)) return { mozos: [], cobros: [] };
  var porMozo = {}, cobros = [];
  leerTabla_(HOJA_COBROS).forEach(function (c) {
    if (!(c.fecha instanceof Date)) return;
    var dia = Utilities.formatDate(c.fecha, zona, 'yyyy-MM-dd');
    var liq = String(c.liquidado || '');
    var metodo = String(c.metodo), monto = Number(c.monto) || 0, prop = Number(c.propina) || 0;
    var efectivo = /efectivo/i.test(metodo);
    var r = porMozo[c.mozo_id] = porMozo[c.mozo_id] || { id: String(c.mozo_id), nombre: String(c.mozo), ventas: 0, mesas: 0,
      porMetodo: {}, propinas: {}, propinaTotal: 0, efectivoPorEntregar: 0, propinasPorPagar: 0, pendientesIds: [] };
    // pendientes: se muestran aunque sean de días anteriores
    if (!liq && ((efectivo && monto) || (!efectivo && prop))) {
      if (efectivo) r.efectivoPorEntregar += monto; else r.propinasPorPagar += prop;
      r.pendientesIds.push(String(c.id));
    }
    if (dia < desde || dia > hasta) return;
    r.ventas += monto; if (Number(c.consumo)) r.mesas++;
    r.porMetodo[metodo] = (r.porMetodo[metodo] || 0) + monto;
    if (prop) { r.propinas[metodo] = (r.propinas[metodo] || 0) + prop; r.propinaTotal += prop; }
    cobros.push({ id: String(c.id), fecha: Utilities.formatDate(c.fecha, zona, 'dd/MM HH:mm'), mesa: celdaTexto_(c.mesa), mozo: String(c.mozo),
      metodo: metodo, monto: monto, propina: prop, liquidado: liq });
  });
  return { mozos: Object.keys(porMozo).map(function (k) { return porMozo[k]; }), cobros: cobros.reverse().slice(0, 300) };
}

/** Marca como entregado/pagado todo lo pendiente de un mozo (efectivo a caja y propinas digitales al mozo). */
function liquidarMozo(sesion, mozoId) {
  var quien = exigirAdmin_(sesion);
  var h = SpreadsheetApp.getActive().getSheetByName(HOJA_COBROS);
  if (!h) return true;
  var cab = asegurarColumnas_(h, COLS_COBROS), col = cab.indexOf('liquidado') + 1;
  var marca = Utilities.formatDate(new Date(), 'America/Lima', 'dd/MM HH:mm') + ' ' + String(quien || '');
  leerTabla_(HOJA_COBROS).forEach(function (c) {
    if (String(c.mozo_id) !== String(mozoId) || String(c.liquidado || '')) return;
    var efectivo = /efectivo/i.test(String(c.metodo));
    if ((efectivo && Number(c.monto)) || (!efectivo && Number(c.propina))) h.getRange(c._fila, col).setValue(marca);
  });
  return true;
}
