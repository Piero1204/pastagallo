/* =========================== PANEL DEL MOZO ===========================
   Acceso por ENLACE DE EQUIPO (sin PIN):
   - En el panel principal → 🤵 Mozos se crea el mozo y se genera un enlace secreto: https://pastagallo.pages.dev/<código>
     (12 caracteres al azar; la web lo sirve con 404.html, así no existe ninguna ruta fija como /mozo).
   - El primer equipo que abre el enlace y toca "Vincular" queda vinculado: recibe una llave secreta que se guarda
     solo en ese navegador (en la hoja se guarda únicamente su huella SHA-256) y se anota la marca/modelo del equipo.
   - Nadie más puede usar ese enlace. "Desvincular" borra la llave y genera un código NUEVO (aunque sea el mismo mozo).
   - Lo que pide el mozo entra como pedido de MESA (se imprime solo en la PC del local) con su nombre.
   - Cobrar mesa: métodos (se puede dividir) + propina por método. Hoja "Cobros".
     · Propina en Yape / Plin / Tarjeta: entra a la cuenta del negocio → se le debe al mozo.
     · Efectivo: el mozo recibe el consumo (lo entrega a caja) y se queda con su propina.
   Todas las llamadas llegan por doPost con { mz: 'accion', t: llave, ... }.
   Config (opcional, hoja Config): mozo_minutos_antes (30) = cuánto antes de abrir cocina se puede entrar;
   mozo_minutos_despues (60) = cuánto queda abierto el panel después de que cierra la cocina (para cobrar). */

var HOJA_MOZOS = 'Mozos', HOJA_COBROS = 'Cobros';
var COLS_MOZOS = ['id', 'nombre', 'activo', 'codigo', 'llave', 'equipo', 'vinculado', 'ultimo_acceso', 'creado', 'dias', 'mesas', 'excepcion'];
var COLS_COBROS = ['id', 'fecha', 'mesa', 'mozo_id', 'mozo', 'consumo', 'metodo', 'monto', 'propina', 'pedidos', 'liquidado', 'notas', 'personas'];
var ALFABETO_CODIGO = 'abcdefghjkmnpqrstuvwxyz23456789'; // sin i, l, o, 0, 1 (se confunden)

function respuestaMozo_(body) {
  var a = String(body.mz || '');
  try {
    if (a === 'vincular') return vincularEquipo_(body);
    var mozo = mozoDeLlave_(body.t);
    if (!mozo) return { ok: false, sesion: false, error: 'Este equipo ya no está vinculado. Pide un enlace nuevo al administrador.' };
    if (a === 'estado') return estadoMozo_(mozo, String(body.v || ''));
    if (a === 'cuenta') return cuentaParaMozo_(texto_(body.mesa, 6));
    if (a === 'resumen') return resumenMozo_(mozo);
    if (a === 'metodo') return cambiarMetodoCobro_(String(body.id || ''), body.metodo, mozo.nombre, mozo.id);
    // el resto solo en su día de turno (el administrador puede habilitarlo "hoy" desde el panel)
    var cfg = leerConfig_(), t = turno_(cfg, momentoActual_(cfg));
    if (!t.trabajan.some(function (x) { return x.id === mozo.id; })) return { ok: false, error: 'Hoy no tienes turno. Si sí vienes, pide al administrador que te active hoy en el panel (🤵 Mozos).' };
    if (a === 'pedido') return pedidoMozo_(mozo, body);
    if (a === 'pedircuenta') { reclamarMesa_(texto_(body.mesa, 6), mozo); return avisoCuentaMozo_(texto_(body.mesa, 6), mozo.nombre, body.otra === true); }
    if (a === 'atender') { var av = leerTabla_(HOJA.avisos).filter(function (x) { return String(x.id) === String(body.id); })[0]; if (av) reclamarMesa_(celdaTexto_(av.mesa), mozo); atenderAvisoComo_(body.id, mozo.nombre); return { ok: true }; }
    if (a === 'cobrar') return cobrarMesa_(mozo, body);
    if (a === 'ocupar') { var ro = ocuparMesa_(mozo, texto_(body.mesa, 6), body.forzar === true, body.personas); if (ro.ok) cortesiaTrasPersonas_(texto_(body.mesa, 6), mozo.nombre); return ro; }
    if (a === 'personas') { reclamarMesa_(texto_(body.mesa, 6), mozo); var rp = personasMesa_(texto_(body.mesa, 6), body.personas); if (rp.ok) cortesiaTrasPersonas_(texto_(body.mesa, 6), mozo.nombre); return rp; }
    if (a === 'agotado') return marcarAgotado_(String(body.id || '').slice(0, 80), body.agotado !== false, mozo.nombre);
    if (a === 'pasar') return pasarMesa_(texto_(body.mesa, 6), String(body.a || ''), mozo.nombre);
    if (a === 'entregar') { var pe = pedidosRecientes_().filter(function (x) { return String(x.numero) === String(body.id); })[0]; if (pe) reclamarMesa_(celdaTexto_(pe.mesa), mozo); return entregarLineas_(body.id, body.lineas, body.valor !== false, mozo.nombre); }
    if (a === 'liberar') return liberarMesa_(texto_(body.mesa, 6), mozo.nombre);
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
    return { id: String(m.id), nombre: String(m.nombre), activo: esSi_(m.activo), codigo: String(m.codigo || ''),
      llave: String(m.llave || ''), equipo: String(m.equipo || ''),
      vinculado: m.vinculado instanceof Date ? m.vinculado.getTime() : 0,
      ultimo: m.ultimo_acceso instanceof Date ? m.ultimo_acceso.getTime() : 0, _fila: m._fila,
      dias: parsearDias_(m.dias), mesas: parsearMesas_(m.mesas), excepcion: celdaTexto_(m.excepcion) };
  });
}
function huella_(t) {
  return Utilities.base64EncodeWebSafe(Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, String(t), Utilities.Charset.UTF_8));
}
function codigoNuevo_(usados) {
  for (var intento = 0; intento < 20; intento++) {
    var b = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, Utilities.getUuid() + Utilities.getUuid(), Utilities.Charset.UTF_8);
    var c = '';
    for (var i = 0; i < 12; i++) c += ALFABETO_CODIGO.charAt(((b[i] % 256) + 256) % 256 % ALFABETO_CODIGO.length);
    if (/\d/.test(c) && /[a-z]/.test(c) && (usados || []).indexOf(c) < 0) return c;
  }
  throw new Error('No se pudo generar el código. Intenta de nuevo.');
}

/** Valida la llave del equipo. Devuelve { id, nombre } o null. */
function mozoDeLlave_(t) {
  t = String(t || '').slice(0, 100);
  if (t.length < 40) return null;
  var h = huella_(t), cache = CacheService.getScriptCache(), ck = 'mzl:' + h.slice(0, 40);
  var m = JSON.parse(cache.get(ck) || 'null');
  if (!m) {
    var f = leerMozos_().filter(function (x) { return x.llave && iguales_(x.llave, h); })[0];
    if (!f || !f.activo) return null;
    m = { id: f.id, nombre: f.nombre };
    cache.put(ck, JSON.stringify(m), 60);
    // último uso (como máximo una vez cada 10 minutos, para no escribir en cada consulta)
    if (Date.now() - f.ultimo > 600000) {
      try { var hm = hojaMozos_(), cab = asegurarColumnas_(hm, COLS_MOZOS); hm.getRange(f._fila, cab.indexOf('ultimo_acceso') + 1).setValue(new Date()); } catch (e) { /* no es crítico */ }
    }
  }
  return m;
}
function olvidarLlave_(huella) { if (huella) CacheService.getScriptCache().remove('mzl:' + huella.slice(0, 40)); }

/** Primer uso del enlace: vincula ESTE equipo. Solo funciona una vez por código. */
function vincularEquipo_(body) {
  var cache = CacheService.getScriptCache();
  var fallos = Number(cache.get('mzv-fallos') || 0);
  if (fallos >= 20) return { ok: false, error: 'Demasiados intentos. Espera 15 minutos.' };
  var codigo = String(body.codigo || '').toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 20);
  var equipo = texto_(body.equipo, 120) || 'Equipo sin identificar';
  var lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    var m = codigo.length === 12 ? leerMozos_().filter(function (x) { return x.codigo === codigo; })[0] : null;
    if (!m || !m.activo) {
      cache.put('mzv-fallos', String(fallos + 1), 900);
      Utilities.sleep(800);
      return { ok: false, error: 'Este enlace no es válido o ya fue reemplazado. Pide uno nuevo al administrador.' };
    }
    if (m.llave) return { ok: false, error: 'Este enlace ya está vinculado a otro equipo (' + m.equipo + '). Si es un error, el administrador debe desvincularlo y darte un enlace nuevo.' };
    var t = Utilities.getUuid().replace(/-/g, '') + Utilities.getUuid().replace(/-/g, '') + Utilities.getUuid().replace(/-/g, '');
    var h = hojaMozos_(), cab = asegurarColumnas_(h, COLS_MOZOS);
    h.getRange(m._fila, cab.indexOf('llave') + 1).setValue(huella_(t));
    h.getRange(m._fila, cab.indexOf('equipo') + 1).setValue(protegerCelda_(equipo));
    h.getRange(m._fila, cab.indexOf('vinculado') + 1).setValue(new Date());
    h.getRange(m._fila, cab.indexOf('ultimo_acceso') + 1).setValue(new Date());
    return { ok: true, t: t, mozo: { id: m.id, nombre: m.nombre } };
  } finally {
    lock.releaseLock();
  }
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
      return { panel: true, atras: i, cocina: ahora >= a && ahora < c, abre: r[0], cierra: r[1],
        cocinaEn: ahora < a ? a - ahora : 0, cierraEn: Math.max(0, c - ahora), localEn: Math.max(0, c + despues - ahora),
        local: hhmm_(c + despues) };
    }
  }
  var hoy = horarioDe_(cfg, momento.dia);
  return { panel: false, atras: 0, cocina: false, abre: hoy ? hoy[0] : '', cierra: hoy ? hoy[1] : '', cierraEn: 0, localEn: 0, local: '' };
}
function hhmm_(m) { m = ((m % 1440) + 1440) % 1440; return ('0' + Math.floor(m / 60)).slice(-2) + ':' + ('0' + (m % 60)).slice(-2); }

/* ---------- estado (mesas, avisos, horario) ---------- */
function estadoMozo_(mozo, version) {
  var props = PropertiesService.getScriptProperties();
  var cfg = leerConfig_(), momento = momentoActual_(cfg);
  var v = props.getProperty('PEDIDOS_VERSION') || '';
  var vent = ventanaMozo_(cfg, momento), t = turno_(cfg, momento, vent);
  var agot = []; try { agot = idsAgotados_(); } catch (e) { /* no crítico */ }
  var base = { ok: true, mozo: mozo, ahora: Date.now(), horario: vent, v: v, agotados: agot,
    turno: { trabaja: t.trabajan.some(function (x) { return x.id === mozo.id; }), dia: t.dn.dia,
      mozos: t.trabajan.map(function (x) { return { id: x.id, nombre: x.nombre }; }) } };
  if (version && version === v) { base.igual = true; return base; }
  var d = salonDatos_(cfg, t);
  base.mesas = d.mesas; base.avisos = d.avisos;
  base.metodos = metodosLista_(cfg.metodos_pago_mesa || 'Yape o Plin, Efectivo, Tarjeta', true);
  base.comprobantes = listaComprobantes_(cfg);
  return base;
}

function cuentaParaMozo_(mesa) {
  var cfg = leerConfig_(), zona = cfg.zona_horaria || 'America/Lima';
  var m = leerTabla_(HOJA.mesas).filter(function (x) { return String(x.mesa) === String(mesa); })[0];
  if (!m) return { ok: false, error: 'Mesa no encontrada.' };
  var c = cuentaMesa_(mesa, m, pedidosRecientes_(), zona);
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
  var metodos = metodosLista_(cfg.metodos_pago_mesa || 'Yape o Plin, Efectivo, Tarjeta', true);
  var pagos = (Array.isArray(body.pagos) ? body.pagos : []).slice(0, 6).map(function (p) {
    var met = texto_(p && p.metodo, 30); if (/^(yape|plin)$/i.test(met)) met = YAPE_PLIN;
    return { metodo: met, monto: Math.round((num_(p && p.monto) || 0) * 100) / 100,
      propina: Math.round((num_(p && p.propina) || 0) * 100) / 100 };
  }).filter(function (p) { return p.monto > 0 || p.propina > 0; });
  if (!pagos.length) return { ok: false, error: 'Indica cómo pagó la mesa.' };
  for (var i = 0; i < pagos.length; i++) {
    if (metodos.indexOf(pagos[i].metodo) < 0) return { ok: false, error: 'Método de pago no válido: ' + pagos[i].metodo };
    if (pagos[i].monto < 0 || pagos[i].propina < 0 || pagos[i].propina > 500 || pagos[i].monto > 20000) return { ok: false, error: 'Revisa los montos.' };
  }
  // comprobante pedido al cobrar (opcional): { tipo:'Boleta'|'Factura', doc, razon, correo }
  var comp = null;
  if (body.comp && body.comp.tipo) {
    comp = { tipo: texto_(body.comp.tipo, 10), doc: String(body.comp.doc || '').replace(/\D/g, '').slice(0, 11),
      razon: texto_(body.comp.razon, 120), correo: texto_(body.comp.correo, 80) };
    if (listaComprobantes_(cfg).indexOf(comp.tipo) < 0) return { ok: false, error: 'Ese tipo de comprobante no está disponible.' };
    if (comp.tipo === 'Factura' || comp.doc) {
      var errDoc = validarDocumento_(comp.tipo, comp.doc);
      if (errDoc) return { ok: false, error: errDoc };
    }
    if (comp.tipo === 'Factura' && comp.razon.length < 3) return { ok: false, error: 'Para factura escribe la razón social.' };
    if (comp.correo && !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(comp.correo)) return { ok: false, error: 'El correo no es válido.' };
  }
  var lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    var hm = SpreadsheetApp.getActive().getSheetByName(HOJA.mesas);
    var cabM = asegurarColumnas_(hm, COLS.mesas);
    var m = leerTabla_(HOJA.mesas).filter(function (x) { return String(x.mesa) === mesa; })[0];
    if (!m) return { ok: false, error: 'Mesa no encontrada.' };
    var c = cuentaMesa_(mesa, m, pedidosRecientes_(), zona);
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
        notas: texto_(body.notas, 120), personas: k === 0 ? (num_(m.personas) && mesaValida_(m, zona) ? num_(m.personas) : '') : '' };
      h.appendRow(cab.map(function (col) { return protegerCelda_(fila[col] == null ? '' : fila[col]); }));
    });
    if (comp) anotarComprobanteMesa_(c, comp);
    // cerrar la cuenta (la mesa queda libre; lo que faltaba marcar como entregado se marca solo)
    cerrarCuentaDeMesa_(m, mozo.nombre);
    var propinas = pagos.reduce(function (a, p) { return a + p.propina; }, 0);
    return { ok: true, mesa: mesa, total: c.total, propina: Math.round(propinas * 100) / 100 };
  } finally {
    lock.releaseLock();
  }
}

/** Deja el comprobante pedido en el primer pedido de la cuenta ("Pendiente") y marca los demás como "Incluido:<n°>".
 *  El panel (Comprobantes) suma la cuenta completa al emitirlo. */
function anotarComprobanteMesa_(c, comp) {
  var h = SpreadsheetApp.getActive().getSheetByName(HOJA.pedidos), cab = asegurarColumnas_(h, COLS.pedidos);
  var col = function (k) { return cab.indexOf(k) + 1; };
  var ids = c.pedidos.map(function (p) { return p.id; });
  var filas = pedidosRecientes_().filter(function (p) { return ids.indexOf(Number(p.numero)) >= 0; });
  if (!filas.length) return;
  var principal = filas[0].numero;
  filas.forEach(function (p, i) {
    h.getRange(p._fila, col('comprobante')).setValue(comp.tipo);
    h.getRange(p._fila, col('doc')).setValue(comp.doc ? "'" + comp.doc : '');
    h.getRange(p._fila, col('razon')).setValue(protegerCelda_(comp.razon));
    h.getRange(p._fila, col('correo')).setValue(protegerCelda_(comp.correo));
    h.getRange(p._fila, col('comp_estado')).setValue(i === 0 ? 'Pendiente' : 'Incluido:' + principal);
  });
}

/* =========================== SALÓN: TURNOS, MESAS ASIGNADAS Y ESTADOS ===========================
   Turno: cada mozo tiene sus días (columna "dias": "mar, mie, jue…"; vacío = todos). El administrador puede
   habilitarlo o quitarlo SOLO HOY (columna "excepcion" = "AAAA-MM-DD:si|no").
   Mesas asignadas (columna "mesas": "1-6, 9"): son una sugerencia, no un bloqueo.
   · Si hoy trabaja un solo mozo, todas las mesas son suyas.
   · Una mesa libre "pertenece" a su mozo asignado (o a nadie); cuando un mozo la sienta o le toma el pedido, pasa a ser suya.
   · Los pedidos desde el QR de una mesa libre se asignan a su mozo por defecto.
   · Otro mozo puede igual tomar pedido en esa mesa (se le pregunta) o pasarla a su nombre.
   Mesa "ocupada" = tiene cuenta abierta o alguien la sentó (ocupada_desde ≥ inicio de la cuenta). Al cobrar o
   cerrar la cuenta, la mesa queda libre sola. */
function parsearMesas_(v) {
  var r = [];
  String(v == null ? '' : v).split(/[\s,;]+/).forEach(function (x) {
    x = x.trim(); if (!x) return;
    var rg = x.match(/^(\d{1,3})-(\d{1,3})$/);
    if (rg) { for (var i = +rg[1]; i <= +rg[2] && i - rg[1] < 80; i++) if (r.indexOf(String(i)) < 0) r.push(String(i)); }
    else if (r.indexOf(x.slice(0, 6)) < 0) r.push(x.slice(0, 6));
  });
  return r;
}
/** Día "de trabajo": pasada la medianoche con el panel abierto sigue siendo el día anterior. */
function diaNegocio_(cfg, momento, vent) {
  vent = vent || ventanaMozo_(cfg, momento);
  var atras = vent.atras || 0, zona = cfg.zona_horaria || 'America/Lima';
  return { dia: (momento.dia + 7 - atras) % 7, iso: Utilities.formatDate(new Date(Date.now() - atras * 86400000), zona, 'yyyy-MM-dd') };
}
function trabajaHoy_(m, dn) {
  if (!m.activo) return false;
  var ex = String(m.excepcion || '').split(':');
  if (ex[0] === dn.iso && (ex[1] === 'si' || ex[1] === 'no')) return ex[1] === 'si';
  return m.dias == null || m.dias.indexOf(dn.dia) >= 0;
}
function turno_(cfg, momento, vent) {
  var dn = diaNegocio_(cfg, momento, vent), todos = leerMozos_();
  return { dn: dn, todos: todos, trabajan: todos.filter(function (m) { return trabajaHoy_(m, dn); }) };
}
function duenoDefecto_(mesa, t) {
  if (t.trabajan.length === 1) return t.trabajan[0];
  return t.trabajan.filter(function (m) { return m.mesas.indexOf(String(mesa)) >= 0; })[0] || null;
}
function mozoCorto_(m) { return m ? { id: m.id, nombre: m.nombre } : null; }

/** Líneas del pedido para marcar "entregado" (texto corto + detalle). */
function lineasCortas_(json) {
  var l = [];
  try { l = JSON.parse(String(json || '[]')) || []; } catch (e) { l = []; }
  return l.map(function (x) {
    var d = [];
    if (x.salsa) d.push('Salsa ' + x.salsa);
    (x.opciones || []).forEach(function (o) { d.push(o.v.join(', ')); });
    if (x.nota) d.push('→ ' + x.nota);
    return { t: (x.cant || 1) + ' × ' + x.nombre + (x.tam ? ' (' + x.tam + ')' : ''), d: d.join(' · '), s: Number(x.subtotal) || 0 };
  });
}
function indicesEntregados_(v, n) {
  var r = [];
  String(v == null ? '' : v).split(',').forEach(function (x) { var i = parseInt(x, 10); if (i >= 0 && i < n && r.indexOf(i) < 0) r.push(i); });
  return r.sort(function (a, b) { return a - b; });
}
function mesaValida_(m, zona) {   // ¿la mesa está sentada/atendida en la cuenta actual?
  return m.ocupada_desde instanceof Date && m.ocupada_desde.getTime() >= inicioCuenta_(m, zona) ? m.ocupada_desde.getTime() : 0;
}

/** Estado completo del salón (lo usan el mozo y el panel). */
function salonDatos_(cfg, t) {
  var zona = cfg.zona_horaria || 'America/Lima';
  t = t || turno_(cfg, momentoActual_(cfg));
  var porId = {}; t.todos.forEach(function (m) { porId[m.id] = m; });
  var minSin = num_(cfg.mozo_alerta_sin_pedido); if (minSin == null) minSin = 15;
  var minListo = num_(cfg.mozo_alerta_listo); if (minListo == null) minListo = 10;
  var peds = pedidosRecientes_();
  var mesas = leerTabla_(HOJA.mesas).filter(function (m) { return String(m.mesa).trim(); }).map(function (m) {
    var mesa = celdaTexto_(m.mesa), c = cuentaMesa_(mesa, m, peds, zona), sent = mesaValida_(m, zona);
    var ocupada = c.pedidos.length > 0 || !!sent;
    var def = duenoDefecto_(mesa, t);
    var at = ocupada ? (sent && String(m.atiende_id || '') ? porId[String(m.atiende_id)] || null : (sent ? null : def)) : null;
    var porServir = 0, listos = 0;
    c.pedidos.forEach(function (p) { porServir += p.falta; if (p.falta && p.estado === 'Listo') listos++; });
    var estado = !ocupada ? 'libre' : !c.pedidos.length ? 'sentada' : listos ? 'listo' : porServir ? 'cocina' : 'servida';
    // mesa olvidada: sentada sin pedido, o con un pedido "Listo" que nadie lleva
    var alerta = null, ahoraMs = Date.now();
    if (estado === 'sentada' && minSin > 0 && ahoraMs - sent >= minSin * 60000) alerta = { tipo: 'sinpedido', min: Math.floor((ahoraMs - sent) / 60000) };
    if (minListo > 0) c.pedidos.forEach(function (p) {
      if (p.estado === 'Listo' && p.falta && ahoraMs - p.act >= minListo * 60000) {
        var mm = Math.floor((ahoraMs - p.act) / 60000);
        if (!alerta || alerta.tipo !== 'listo' || mm > alerta.min) alerta = { tipo: 'listo', min: mm, numero: p.numero };
      }
    });
    return { mesa: mesa, activa: esSi_(m.activa), total: c.total, n: c.pedidos.length,
      desde: c.pedidos.length ? c.pedidos[0].hora : (sent ? Utilities.formatDate(new Date(sent), zona, 'HH:mm') : ''),
      ts: sent || (c.pedidos.length ? c.pedidos[0].ts : 0), ultimo: c.pedidos.length ? c.pedidos[c.pedidos.length - 1].ts : 0,
      x: num_(m.x), y: num_(m.y), forma: celdaTexto_(m.forma),
      estado: estado, porServir: porServir, listos: listos, alerta: alerta,
      personas: ocupada && sent ? (num_(m.personas) || 0) : 0,
      atiende: mozoCorto_(at), zona: mozoCorto_(def), pedidos: c.pedidos };
  });
  var duenos = {}; mesas.forEach(function (m) { duenos[m.mesa] = m.atiende || m.zona; });
  var avisos = avisosPendientes_(zona).map(function (a) { var d = duenos[a.mesa]; a.para = d ? d.id : ''; a.paraNombre = d ? d.nombre : ''; return a; });
  return { mesas: mesas, avisos: avisos, dia: t.dn.dia, alertas: { sinPedido: minSin, listo: minListo },
    mozos: t.todos.filter(function (m) { return m.activo; }).map(function (m) {
      return { id: m.id, nombre: m.nombre, trabaja: t.trabajan.indexOf(m) >= 0, mesas: m.mesas };
    }) };
}

function filaMesa_(mesa) { return leerTabla_(HOJA.mesas).filter(function (x) { return String(x.mesa) === String(mesa); })[0]; }
function setMesa_(m, campos) {
  var h = SpreadsheetApp.getActive().getSheetByName(HOJA.mesas), cab = asegurarColumnas_(h, COLS.mesas);
  Object.keys(campos).forEach(function (k) { h.getRange(m._fila, cab.indexOf(k) + 1).setValue(campos[k]); });
}
function nuevaVersion_() { PropertiesService.getScriptProperties().setProperty('PEDIDOS_VERSION', String(Date.now())); }

/** Al registrar un pedido de mesa (ya dentro del bloqueo de registrarPedido_): si la mesa estaba libre,
 *  queda a nombre del mozo que pidió o, si vino del QR, de su mozo asignado. */
function asignarMesaAlPedir_(mesa, mozo, cfg) {
  var m = filaMesa_(mesa), zona = cfg.zona_horaria || 'America/Lima';
  if (!m) return;
  if (mesaValida_(m, zona)) {
    // la mesa ya estaba abierta: el mozo que toma el pedido pasa a ser quien la atiende
    if (mozo && String(m.atiende_id || '') !== String(mozo.id)) setMesa_(m, { atiende_id: mozo.id });
    return;
  }
  var duenio = mozo || duenoDefecto_(mesa, turno_(cfg, momentoActual_(cfg)));
  setMesa_(m, { atiende_id: duenio ? duenio.id : '', ocupada_desde: new Date() });
}

/** Si la mesa está abierta y nadie la atiende, queda a nombre del mozo que hizo algo en ella. */
function reclamarMesa_(mesa, mozo) {
  if (!mesa || !mozo) return;
  try {
    var cfg = leerConfig_(), zona = cfg.zona_horaria || 'America/Lima', m = filaMesa_(mesa);
    if (!m || String(m.atiende_id || '')) return;
    var sent = mesaValida_(m, zona);
    if (!sent) {
      var c = cuentaMesa_(mesa, m, pedidosRecientes_(), zona);
      if (!c.pedidos.length) return;
      sent = c.pedidos[0].ts;
    }
    setMesa_(m, { atiende_id: mozo.id, ocupada_desde: new Date(sent) });
    nuevaVersion_();
  } catch (e) { console.error(e); }
}

/** Sentar clientes / tomar la mesa. Si la atiende otro mozo y no se fuerza, se avisa (no se bloquea). */
function ocuparMesa_(mozo, mesa, forzar, personas) {
  var cfg = leerConfig_(), zona = cfg.zona_horaria || 'America/Lima';
  var lock = LockService.getScriptLock(); lock.waitLock(20000);
  try {
    var m = filaMesa_(mesa);
    if (!m || !esSi_(m.activa)) return { ok: false, error: 'Esa mesa no existe o está desactivada.' };
    var sent = mesaValida_(m, zona), actual = String(m.atiende_id || '');
    if (!sent) {
      var c = cuentaMesa_(mesa, m, pedidosRecientes_(), zona);
      if (c.pedidos.length) { sent = c.pedidos[0].ts; }  // cuenta abierta sin dueño (QR sin mozo asignado)
    }
    if (sent && actual && actual !== mozo.id && !forzar) {
      var otro = leerMozos_().filter(function (x) { return x.id === actual; })[0];
      return { ok: false, ocupadaPor: otro ? otro.nombre : 'otro mozo', error: 'La mesa ' + mesa + ' la atiende ' + (otro ? otro.nombre : 'otro mozo') + '.' };
    }
    var campos = { atiende_id: mozo.id, ocupada_desde: sent ? new Date(sent) : new Date() };
    var np = Math.floor(num_(personas) || 0);
    if (np >= 1 && np <= 60) campos.personas = np; else if (!sent) campos.personas = '';
    setMesa_(m, campos);
    nuevaVersion_();
    return { ok: true };
  } finally { lock.releaseLock(); }
}
/** Pasar la mesa a otro mozo (a = id; '' = sin mozo). */
function pasarMesa_(mesa, a, quien) {
  var cfg = leerConfig_(), zona = cfg.zona_horaria || 'America/Lima';
  var lock = LockService.getScriptLock(); lock.waitLock(20000);
  try {
    var m = filaMesa_(mesa); if (!m) return { ok: false, error: 'Mesa no encontrada.' };
    var dest = a ? leerMozos_().filter(function (x) { return x.id === a && x.activo; })[0] : null;
    if (a && !dest) return { ok: false, error: 'Ese mozo no existe o está desactivado.' };
    var sent = mesaValida_(m, zona);
    if (!sent) {
      var c = cuentaMesa_(mesa, m, pedidosRecientes_(), zona);
      if (!c.pedidos.length) return { ok: false, error: 'La mesa ' + mesa + ' está libre.' };
      sent = c.pedidos[0].ts;
    }
    setMesa_(m, { atiende_id: dest ? dest.id : '', ocupada_desde: new Date(sent) });
    nuevaVersion_();
    return { ok: true, a: dest ? dest.nombre : '' };
  } finally { lock.releaseLock(); }
}
/** Liberar una mesa que se sentó pero no pidió nada (si tiene pedidos, hay que cobrarla). */
function liberarMesa_(mesa, quien) {
  var cfg = leerConfig_(), zona = cfg.zona_horaria || 'America/Lima';
  var lock = LockService.getScriptLock(); lock.waitLock(20000);
  try {
    var m = filaMesa_(mesa); if (!m) return { ok: false, error: 'Mesa no encontrada.' };
    var c = cuentaMesa_(mesa, m, pedidosRecientes_(), zona);
    if (c.pedidos.length) return { ok: false, error: 'La mesa ' + mesa + ' tiene pedidos (' + soles_(c.total) + '): cóbrala para liberarla.' };
    cerrarCuentaDeMesa_(m, quien);
    return { ok: true };
  } finally { lock.releaseLock(); }
}

/** Cierra la cuenta de la mesa: queda libre, sus avisos atendidos y sus pedidos pendientes pasan a "Entregado". */
function cerrarCuentaDeMesa_(m, quien) {
  var cfg = leerConfig_(), zona = cfg.zona_horaria || 'America/Lima', mesa = String(m.mesa);
  var c = cuentaMesa_(mesa, m, pedidosRecientes_(), zona);
  var ids = c.pedidos.filter(function (p) { return p.estado !== 'Entregado'; }).map(function (p) { return p.id; });
  if (ids.length) marcarEntregados_(ids, quien, null, true);
  setMesa_(m, { abierta_desde: new Date(Date.now() + 1000), atiende_id: '', personas: '', cortesia: '' });
  leerTabla_(HOJA.avisos).forEach(function (a) {
    if (String(a.mesa) === mesa && a.estado === 'Pendiente') atenderAvisoComo_(a.id, quien);
  });
  nuevaVersion_();
}

/** Marca líneas como entregadas (o no). ids = números internos; lineas = [índices] o 'todo'.
 *  Si todas las líneas están entregadas, el pedido pasa a "Entregado" (sale de la lista de cocina). */
function marcarEntregados_(ids, quien, lineas, valor) {
  var h = SpreadsheetApp.getActive().getSheetByName(HOJA.pedidos), cab = asegurarColumnas_(h, COLS.pedidos);
  var col = function (c) { return cab.indexOf(c) + 1; };
  var ahora = new Date(), n = 0;
  pedidosRecientes_().forEach(function (p) {
    if (ids.indexOf(Number(p.numero)) < 0 || p.canal !== 'mesa' || p.estado === 'Cancelado') return;
    var total = lineasCortas_(p.items_json).length;
    var ent = p.estado === 'Entregado' ? Array.apply(null, Array(total)).map(function (x, i) { return i; }) : indicesEntregados_(p.entregado, total);
    var lista = lineas === 'todo' || lineas == null ? Array.apply(null, Array(total)).map(function (x, i) { return i; }) : lineas;
    lista.forEach(function (i) {
      i = Number(i); if (!(i >= 0 && i < total)) return;
      var k = ent.indexOf(i);
      if (valor && k < 0) ent.push(i); else if (!valor && k >= 0) ent.splice(k, 1);
    });
    ent.sort(function (a, b) { return a - b; });
    h.getRange(p._fila, col('entregado')).setValue(ent.join(','));
    var nuevo = null;
    if (ent.length >= total && p.estado !== 'Entregado') nuevo = 'Entregado';
    else if (ent.length < total && p.estado === 'Entregado') nuevo = 'Listo';
    if (nuevo) {
      h.getRange(p._fila, col('estado')).setValue(nuevo);
      h.getRange(p._fila, col('actualizado')).setValue(ahora);
      h.getRange(p._fila, col('historial')).setValue((String(p.historial || '') ? String(p.historial) + ' · ' : '') + nuevo + ' ' + fmt_(ahora, 'HH:mm') + ' (' + String(quien || '') + ')');
    }
    n++;
  });
  return n;
}
function entregarLineas_(id, lineas, valor, quien) {
  id = Number(id);
  if (!(id > 0)) return { ok: false, error: 'Pedido no válido.' };
  if (lineas !== 'todo') lineas = (Array.isArray(lineas) ? lineas : []).slice(0, 60).map(Number);
  var lock = LockService.getScriptLock(); lock.waitLock(20000);
  try {
    if (!marcarEntregados_([id], quien, lineas, valor)) return { ok: false, error: 'No se encontró el pedido.' };
    nuevaVersion_();
    return { ok: true };
  } finally { lock.releaseLock(); }
}

/** Resumen del turno del mozo (hoy): mesas cobradas, ventas y propinas por método. */
function resumenMozo_(mozo) {
  var cfg = leerConfig_(), zona = cfg.zona_horaria || 'America/Lima', dn = diaNegocio_(cfg, momentoActual_(cfg));
  var r = { ok: true, dia: dn.iso, mesas: 0, ventas: 0, propinas: {}, propinaTotal: 0, porMetodo: {}, efectivoPorEntregar: 0, cobros: [] };
  if (!SpreadsheetApp.getActive().getSheetByName(HOJA_COBROS)) return r;
  var ini = Utilities.parseDate(dn.iso + ' 06:00:00', zona, 'yyyy-MM-dd HH:mm:ss').getTime();
  leerTabla_(HOJA_COBROS).forEach(function (c) {
    if (String(c.mozo_id) !== mozo.id || !(c.fecha instanceof Date)) return;
    var monto = Number(c.monto) || 0, prop = Number(c.propina) || 0, met = String(c.metodo);
    if (/efectivo/i.test(met) && !String(c.liquidado || '')) r.efectivoPorEntregar += monto;
    if (c.fecha.getTime() < ini || c.fecha.getTime() > ini + 86400000) return;
    if (Number(c.consumo)) r.mesas++;
    r.ventas += monto; r.porMetodo[met] = (r.porMetodo[met] || 0) + monto;
    if (prop) { r.propinas[met] = (r.propinas[met] || 0) + prop; r.propinaTotal += prop; }
    r.cobros.push({ id: String(c.id), hora: Utilities.formatDate(c.fecha, zona, 'HH:mm'), mesa: celdaTexto_(c.mesa), metodo: met,
      monto: monto, propina: prop, liquidado: !!String(c.liquidado || '') });
  });
  r.cobros.reverse();
  r.metodos = metodosLista_(cfg.metodos_pago_mesa || 'Yape o Plin, Efectivo, Tarjeta', true);
  return r;
}

/** Cambiar el método de pago de un cobro ya registrado (la mesa ya se cerró y el cliente pagó distinto).
 *  El mozo solo puede cambiar sus cobros del día que aún no se liquidaron; el panel (mozoId vacío) puede cambiar cualquiera.
 *  Queda anotado en "notas" qué método tenía antes, quién lo cambió y cuándo. */
function cambiarMetodoCobro_(id, metodo, quien, mozoId) {
  var cfg = leerConfig_(), zona = cfg.zona_horaria || 'America/Lima';
  var met = texto_(metodo, 30); if (/^(yape|plin)$/i.test(met)) met = YAPE_PLIN;
  if (metodosLista_(cfg.metodos_pago_mesa || 'Yape o Plin, Efectivo, Tarjeta', true).indexOf(met) < 0) return { ok: false, error: 'Método de pago no válido.' };
  var lock = LockService.getScriptLock(); lock.waitLock(20000);
  try {
    var h = SpreadsheetApp.getActive().getSheetByName(HOJA_COBROS);
    if (!h) return { ok: false, error: 'No hay cobros.' };
    var cab = asegurarColumnas_(h, COLS_COBROS);
    var c = leerTabla_(HOJA_COBROS).filter(function (x) { return String(x.id) === id; })[0];
    if (!c) return { ok: false, error: 'No encontré ese cobro.' };
    var antes = String(c.metodo);
    if (antes === met) return { ok: true, igual: true };
    if (mozoId) {
      if (String(c.mozo_id) !== String(mozoId)) return { ok: false, error: 'Ese cobro es de otro mozo.' };
      if (String(c.liquidado || '')) return { ok: false, error: 'Ese cobro ya se liquidó: pide al administrador que lo cambie desde el panel.' };
      if (!(c.fecha instanceof Date) || Date.now() - c.fecha.getTime() > 36 * 3600000) return { ok: false, error: 'Solo puedes cambiar los cobros de hoy. Pide al administrador que lo cambie.' };
    }
    var nota = String(c.notas || ''), marca = 'Antes ' + antes + ' (cambió ' + String(quien || '').slice(0, 40) + ' ' + Utilities.formatDate(new Date(), zona, 'dd/MM HH:mm') + ')';
    h.getRange(c._fila, cab.indexOf('metodo') + 1).setValue(met);
    h.getRange(c._fila, cab.indexOf('notas') + 1).setValue(protegerCelda_((nota ? nota + ' · ' : '') + marca));
    return { ok: true, antes: antes, metodo: met, liquidado: !!String(c.liquidado || '') };
  } finally { lock.releaseLock(); }
}
/** Panel: cambiar el método de un cobro (cualquiera, también los ya liquidados). */
function cambiarMetodoCobro(sesion, id, metodo) {
  var quien = exigirAdmin_(sesion);
  var r = cambiarMetodoCobro_(String(id || ''), metodo, quien || 'panel', '');
  if (!r.ok) throw new Error(r.error);
  return r;
}

/** Número de personas de la mesa (para el ticket por persona). Si la mesa estaba libre, queda sentada. */
function personasMesa_(mesa, personas) {
  var n = Math.floor(num_(personas) || 0);
  if (!(n >= 1 && n <= 60)) return { ok: false, error: 'Número de personas no válido.' };
  var cfg = leerConfig_(), zona = cfg.zona_horaria || 'America/Lima';
  var lock = LockService.getScriptLock(); lock.waitLock(20000);
  try {
    var m = filaMesa_(mesa); if (!m) return { ok: false, error: 'Mesa no encontrada.' };
    var campos = { personas: n };
    if (!mesaValida_(m, zona)) {
      var c = cuentaMesa_(mesa, m, pedidosRecientes_(), zona);
      campos.ocupada_desde = c.pedidos.length ? new Date(c.pedidos[0].ts) : new Date();
    }
    setMesa_(m, campos);
    nuevaVersion_();
    return { ok: true };
  } finally { lock.releaseLock(); }
}

/** Agotado / disponible desde el panel del mozo. Se aplica al instante en los pedidos (servidor), en la app del mozo
 *  y en la web (que consulta /exec?estado=1 al abrir); la carta publicada se actualiza en 1-2 minutos. */
function marcarAgotado_(id, agotado, quien) {
  var lock = LockService.getScriptLock(); lock.waitLock(20000);
  try {
    var h = SpreadsheetApp.getActive().getSheetByName(HOJA.productos), cab = asegurarColumnas_(h, COLS.productos);
    var p = leerTabla_(HOJA.productos).filter(function (d) { return String(d.id) === id; })[0];
    if (!p || !esSi_(p.visible)) return { ok: false, error: 'Producto no encontrado.' };
    h.getRange(p._fila, cab.indexOf('disponible') + 1).setValue(agotado ? 'NO' : 'SI');
    limpiarCache_();
    nuevaVersion_();
  } finally { lock.releaseLock(); }
  var publicado = false;
  try {
    marcarPendiente_();
    if (PropertiesService.getScriptProperties().getProperty('GITHUB_TOKEN')) { publicarCarta_('mozo ' + quien); publicado = true; }
  } catch (e) { console.error(e); }
  return { ok: true, publicado: publicado };
}
function agotadoPanel(sesion, id, agotado) {
  var quien = exigirAdmin_(sesion);
  var r = marcarAgotado_(String(id || ''), agotado !== false, String(quien).split('@')[0]);
  if (!r.ok) throw new Error(r.error);
  return r;
}
function personasPanel(sesion, mesa, n) {
  exigirAdmin_(sesion);
  var r = personasMesa_(texto_(mesa, 6), n);
  if (!r.ok) throw new Error(r.error);
  cortesiaTrasPersonas_(texto_(mesa, 6), 'panel');
  return r;
}

/** Ranking de mozos y ticket por persona (Dashboard), a partir de la hoja Cobros. */
function rankingMozos_(desde, hasta) {
  var r = { mozos: [], mesas: 0, ventas: 0, personas: 0, ventasConPersonas: 0, propinas: 0 };
  if (!SpreadsheetApp.getActive().getSheetByName(HOJA_COBROS)) return r;
  var por = {};
  leerTabla_(HOJA_COBROS).forEach(function (c) {
    if (!(c.fecha instanceof Date) || c.fecha < desde || c.fecha >= hasta) return;
    var k = String(c.mozo_id || c.mozo);
    var x = por[k] = por[k] || { nombre: String(c.mozo || '—'), ventas: 0, mesas: 0, personas: 0, propinas: 0, ventasConPersonas: 0 };
    var monto = Number(c.monto) || 0, consumo = Number(c.consumo) || 0, pers = Number(c.personas) || 0;
    x.ventas += monto; x.propinas += Number(c.propina) || 0;
    if (consumo) { x.mesas++; if (pers) { x.personas += pers; x.ventasConPersonas += consumo; } }
  });
  var r2 = function (n) { return Math.round(n * 100) / 100; };
  r.mozos = Object.keys(por).map(function (k) {
    var x = por[k];
    r.mesas += x.mesas; r.ventas += x.ventas; r.personas += x.personas; r.ventasConPersonas += x.ventasConPersonas; r.propinas += x.propinas;
    return { nombre: x.nombre, ventas: r2(x.ventas), mesas: x.mesas, personas: x.personas, propinas: r2(x.propinas),
      ticketMesa: x.mesas ? r2(x.ventas / x.mesas) : 0, ticketPersona: x.personas ? r2(x.ventasConPersonas / x.personas) : 0,
      propinaPct: x.ventas ? Math.round(x.propinas / x.ventas * 1000) / 10 : 0 };
  }).sort(function (a, b) { return b.ventas - a.ventas; });
  r.ventas = r2(r.ventas); r.propinas = r2(r.propinas);
  r.ticketPersona = r.personas ? r2(r.ventasConPersonas / r.personas) : 0;
  return r;
}

/* =========================== DESDE EL PANEL PRINCIPAL =========================== */
function linkMozo_(cfg, codigo) { return String(cfg.sitio_url || 'https://pastagallo.pages.dev').replace(/\/+$/, '') + '/' + codigo; }
function listarMozos(sesion) {
  exigirAdmin_(sesion);
  var cfg = leerConfig_(), dn = diaNegocio_(cfg, momentoActual_(cfg));
  return leerMozos_().map(function (m) {
    var ex = String(m.excepcion || '').split(':');
    return { id: m.id, nombre: m.nombre, activo: m.activo, link: m.activo && m.codigo ? linkMozo_(cfg, m.codigo) : '',
      vinculado: !!m.llave, equipo: m.llave ? m.equipo : '', desde: m.vinculado, ultimo: m.ultimo,
      dias: m.dias, mesas: m.mesas.join(', '), trabajaHoy: trabajaHoy_(m, dn), hoyForzado: ex[0] === dn.iso ? ex[1] : '', diaHoy: dn.dia,
      autoconfirmar: String(cfg.mesa_autoconfirmar || 'SI').toUpperCase() !== 'NO',
      alertaSinPedido: num_(cfg.mozo_alerta_sin_pedido) == null ? 15 : num_(cfg.mozo_alerta_sin_pedido),
      alertaListo: num_(cfg.mozo_alerta_listo) == null ? 10 : num_(cfg.mozo_alerta_listo) };
  });
}

/** o = { id (vacío = nuevo), nombre, activo }. Un mozo nuevo recibe su enlace al crearse. */
function guardarMozo(sesion, o) {
  exigirAdmin_(sesion);
  var nombre = texto_(o && o.nombre, 30);
  if (nombre.length < 2) throw new Error('Escribe el nombre del mozo.');
  var lista = leerMozos_();
  var m = o.id ? lista.filter(function (x) { return x.id === String(o.id); })[0] : null;
  if (lista.some(function (x) { return x.nombre.toLowerCase() === nombre.toLowerCase() && (!m || x.id !== m.id); })) throw new Error('Ya hay un mozo con ese nombre.');
  var activo = o.activo !== false;
  var h = hojaMozos_(), cab = asegurarColumnas_(h, COLS_MOZOS);
  var usados = lista.map(function (x) { return x.codigo; });
  var dias = o.dias === undefined ? undefined : (Array.isArray(o.dias) && o.dias.length && o.dias.length < 7
    ? diasTexto_(o.dias.map(Number).filter(function (d) { return d >= 0 && d <= 6; }).sort()) : '');
  var mesasTxt = o.mesas === undefined ? undefined : parsearMesas_(texto_(o.mesas, 200)).join(', ');
  if (m) {
    if (dias !== undefined) h.getRange(m._fila, cab.indexOf('dias') + 1).setValue(dias);
    if (mesasTxt !== undefined) h.getRange(m._fila, cab.indexOf('mesas') + 1).setValue("'" + mesasTxt);
    h.getRange(m._fila, cab.indexOf('nombre') + 1).setValue(protegerCelda_(nombre));
    h.getRange(m._fila, cab.indexOf('activo') + 1).setValue(activo ? 'SI' : 'NO');
    if (m.activo !== activo) {
      // desactivar o reactivar = equipo desvinculado y código nuevo (el enlace anterior deja de servir)
      olvidarLlave_(m.llave);
      ['llave', 'equipo', 'vinculado'].forEach(function (c) { h.getRange(m._fila, cab.indexOf(c) + 1).setValue(''); });
      h.getRange(m._fila, cab.indexOf('codigo') + 1).setValue(codigoNuevo_(usados));
    }
    olvidarLlave_(m.llave);
  } else {
    var fila = { id: Utilities.getUuid().slice(0, 6), nombre: nombre, activo: activo ? 'SI' : 'NO', codigo: codigoNuevo_(usados),
      llave: '', equipo: '', vinculado: '', ultimo_acceso: '', creado: new Date(), dias: dias || '', mesas: mesasTxt ? "'" + mesasTxt : '', excepcion: '' };
    h.appendRow(cab.map(function (c) { return protegerCelda_(fila[c] == null ? '' : fila[c]); }));
  }
  return listarMozos(sesion);
}

/** Desvincula el equipo del mozo y genera un enlace NUEVO. El enlace y el equipo anteriores dejan de funcionar al instante. */
function nuevoEnlaceMozo(sesion, id) {
  exigirAdmin_(sesion);
  var lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    var lista = leerMozos_(), m = lista.filter(function (x) { return x.id === String(id); })[0];
    if (!m) throw new Error('Mozo no encontrado.');
    var h = hojaMozos_(), cab = asegurarColumnas_(h, COLS_MOZOS);
    olvidarLlave_(m.llave);
    ['llave', 'equipo', 'vinculado'].forEach(function (c) { h.getRange(m._fila, cab.indexOf(c) + 1).setValue(''); });
    h.getRange(m._fila, cab.indexOf('codigo') + 1).setValue(codigoNuevo_(lista.map(function (x) { return x.codigo; })));
  } finally {
    lock.releaseLock();
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
      metodo: metodo, monto: monto, propina: prop, liquidado: liq, notas: celdaTexto_(c.notas) });
  });
  return { mozos: Object.keys(porMozo).map(function (k) { return porMozo[k]; }), cobros: cobros.reverse().slice(0, 300),
    metodos: metodosLista_(cfg.metodos_pago_mesa || 'Yape o Plin, Efectivo, Tarjeta', true) };
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

/** Hoy sí / hoy no / según sus días (valor 'si' | 'no' | ''). */
function turnoHoyMozo(sesion, id, valor) {
  exigirAdmin_(sesion);
  var cfg = leerConfig_(), dn = diaNegocio_(cfg, momentoActual_(cfg));
  var m = leerMozos_().filter(function (x) { return x.id === String(id); })[0];
  if (!m) throw new Error('Mozo no encontrado.');
  var h = hojaMozos_(), cab = asegurarColumnas_(h, COLS_MOZOS);
  h.getRange(m._fila, cab.indexOf('excepcion') + 1).setValue(valor === 'si' || valor === 'no' ? dn.iso + ':' + valor : '');
  nuevaVersion_();
  return listarMozos(sesion);
}
function reglasSalon(sesion, o) {
  exigirAdmin_(sesion);
  if (o && o.autoconfirmar != null) guardarClave_('mesa_autoconfirmar', o.autoconfirmar ? 'SI' : 'NO');
  ['mozo_alerta_sin_pedido', 'mozo_alerta_listo'].forEach(function (k) {
    if (o && o[k] != null) { var n = Math.floor(num_(o[k]) || 0); guardarClave_(k, Math.max(0, Math.min(120, n))); }
  });
  return listarMozos(sesion);
}
/** Plano del salón: [{ mesa, x, y, forma }] (x e y en % del plano). */
function guardarPlano(sesion, lista) {
  exigirAdmin_(sesion);
  var h = SpreadsheetApp.getActive().getSheetByName(HOJA.mesas), cab = asegurarColumnas_(h, COLS.mesas);
  var filas = {}; leerTabla_(HOJA.mesas).forEach(function (m) { filas[String(m.mesa)] = m._fila; });
  (Array.isArray(lista) ? lista : []).slice(0, 200).forEach(function (o) {
    var f = filas[String(o && o.mesa)]; if (!f) return;
    var x = Math.max(0, Math.min(100, Math.round((num_(o.x) || 0) * 10) / 10)), y = Math.max(0, Math.min(100, Math.round((num_(o.y) || 0) * 10) / 10));
    h.getRange(f, cab.indexOf('x') + 1).setValue(x);
    h.getRange(f, cab.indexOf('y') + 1).setValue(y);
    if (o.forma != null) h.getRange(f, cab.indexOf('forma') + 1).setValue(['redonda', 'cuadrada', 'larga', 'barra'].indexOf(o.forma) >= 0 ? o.forma : '');
  });
  nuevaVersion_();
  return true;
}
function pasarMesaPanel(sesion, mesa, mozoId) {
  var quien = exigirAdmin_(sesion);
  var r = pasarMesa_(texto_(mesa, 6), String(mozoId || ''), quien);
  if (!r.ok) throw new Error(r.error);
  return r;
}
function entregarPanel(sesion, id, lineas, valor) {
  var quien = exigirAdmin_(sesion);
  var r = entregarLineas_(id, lineas, valor !== false, String(quien || '').split('@')[0]);
  if (!r.ok) throw new Error(r.error);
  return r;
}


/* =========================== PAN AL AJO DE CORTESÍA ===========================
   Cortesía de la casa: 1 pan al ajo por persona, una sola vez por cuenta de mesa. Va como línea de S/ 0
   ("Pan al ajo (cortesía)"), aparte de los panes que se pidan, y sale en el ticket de cocina:
   · si ya se sabe cuántas personas son, va dentro del primer pedido de la mesa;
   · si las personas se indican (o aumentan) cuando la mesa ya tiene pedidos, sale un pedido aparte solo con la cortesía.
   Columna "cortesia" de Mesas = "<inicio de la cuenta>|<panes ya enviados>". */
var CORTESIA_ID_ = 'cortesia-pan-ajo', CORTESIA_NOMBRE_ = 'Pan al ajo (cortesía)';
function cortesiaEnviada_(m, zona) {
  var x = String(m.cortesia == null ? '' : m.cortesia).split('|');
  return x[0] === String(inicioCuenta_(m, zona)) ? Math.floor(Number(x[1]) || 0) : 0;
}
function cortesiaPendiente_(m, zona) {
  var pers = Math.floor(num_(m.personas) || 0);
  if (!pers || !mesaValida_(m, zona)) return 0;   // "personas" solo vale para la cuenta actual
  return Math.max(0, pers - cortesiaEnviada_(m, zona));
}
function agregarCortesia_(r, n) {
  r.lineas.push({ id: CORTESIA_ID_, nombre: CORTESIA_NOMBRE_, tam: '', salsa: null, recargo: 0, cant: n, unit: 0, subtotal: 0,
    nota: '', seccion: 'antipasti', opciones: [], cortesia: true });
  r.detalle = detalleDe_(r.lineas);
}
function anotarCortesia_(m, zona) {
  setMesa_(m, { cortesia: String(inicioCuenta_(m, zona)) + '|' + Math.floor(num_(m.personas) || 0) });
}
/** Después de indicar las personas: si la mesa ya tiene pedidos, envía a cocina un pedido solo con la cortesía que falta. */
function cortesiaTrasPersonas_(mesa, quien) {
  try {
    var cfg = leerConfig_(), zona = cfg.zona_horaria || 'America/Lima';
    var lock = LockService.getScriptLock(); lock.waitLock(20000);
    try {
      var m = filaMesa_(mesa); if (!m) return;
      var n = cortesiaPendiente_(m, zona); if (!n) return;
      var c = cuentaMesa_(mesa, m, pedidosRecientes_(), zona);
      if (!c.pedidos.length) return;   // todavía sin pedidos: la cortesía irá dentro del primero
      var r = { lineas: [], detalle: '' }; agregarCortesia_(r, n);
      var props = PropertiesService.getScriptProperties();
      var numero = Number(props.getProperty('ULTIMO_PEDIDO') || 0) + 1;
      props.setProperty('ULTIMO_PEDIDO', String(numero));
      var ahora = new Date(), numDia = siguienteNumeroDia_(ahora, cfg);
      var fila = { numero: numero, fecha: ahora, canal: 'mesa', mesa: String(mesa), detalle: r.detalle, total: 0, estado: 'En preparación',
        notas: Math.floor(num_(m.personas)) + ' persona(s) en la mesa', items_json: JSON.stringify(r.lineas), actualizado: ahora,
        historial: 'Cortesía ' + fmt_(ahora, 'HH:mm') + ' (' + String(quien || '') + ')', origen: 'cortesia', num_dia: numDia, entregado: '',
        mozo: quien && quien !== 'panel' ? quien : '' };
      var h = SpreadsheetApp.getActive().getSheetByName(HOJA.pedidos), cab = asegurarColumnas_(h, COLS.pedidos);
      h.appendRow(cab.map(function (k) { return protegerCelda_(fila[k] == null ? '' : fila[k]); }));
      anotarCortesia_(m, zona);
      nuevaVersion_();
    } finally { lock.releaseLock(); }
  } catch (e) { console.error(e); }
}

/* =========================== EDITAR UN PEDIDO DE MESA (panel) ===========================
   Para corregir errores: cambiar cantidades, quitar líneas o agregar productos. Solo pedidos de la cuenta ABIERTA
   (si ya se cobró no se toca) y sin boleta/factura emitida. Lo agregado se precia en el servidor como un pedido normal. */
function pedidoEditable_(numero, zona) {
  var p = pedidosRecientes_().filter(function (x) { return String(x.numero) === String(numero); })[0];
  if (!p) throw new Error('Pedido no encontrado (o es muy antiguo).');
  if (p.canal !== 'mesa') throw new Error('Desde aquí solo se editan pedidos de mesa.');
  if (p.estado === 'Cancelado') throw new Error('El pedido está cancelado.');
  if (celdaTexto_(p.comp_estado) === 'Emitido') throw new Error('Este pedido ya tiene boleta o factura emitida: no se puede editar.');
  var m = filaMesa_(p.mesa);
  if (!m || !(p.fecha instanceof Date) || p.fecha.getTime() < inicioCuenta_(m, zona)) throw new Error('La cuenta de la mesa ' + p.mesa + ' ya se cerró (se cobró): este pedido ya no se puede editar.');
  return p;
}
function pedidoParaEditar(sesion, numero) {
  exigirAdmin_(sesion);
  var cfg = leerConfig_(), zona = cfg.zona_horaria || 'America/Lima';
  var p = pedidoEditable_(numero, zona);
  var lineas = []; try { lineas = JSON.parse(String(p.items_json || '[]')) || []; } catch (e) { lineas = []; }
  var cat = leerCatalogo_(), sec = {};
  (cat.secciones || []).forEach(function (s) { sec[String(s.id)] = s; });
  var productos = (cat.productos || []).filter(function (x) {
    var s = sec[String(x.seccion)];
    return x.tipo !== 'salsa' && esSi_(x.visible) && esSi_(x.disponible) && s && esSi_(s.visible) && esSi_(s.mesa) &&
      String(x.canal || 'todos').trim().toLowerCase() !== 'delivery' && (parsearTamanos_(x.tamanos).length || num_(x.precio) != null);
  }).map(function (x) {
    return { id: String(x.id), n: String(x.nombre), sec: String(x.seccion), secN: String((sec[String(x.seccion)] || {}).titulo || x.seccion),
      t: parsearTamanos_(x.tamanos), p: num_(x.precio), salsa: esSi_(x.requiere_salsa), ops: listaIds_(x.opciones) };
  });
  var salsas = (cat.productos || []).filter(function (x) { return x.tipo === 'salsa' && esSi_(x.visible) && esSi_(x.disponible); })
    .map(function (x) { return { id: String(x.id), n: String(x.nombre), extra: num_(x.recargo) || 0, ops: listaIds_(x.opciones) }; });
  return { numero: Number(p.numero), num_dia: Number(p.num_dia) || Number(p.numero), mesa: String(p.mesa), estado: String(p.estado),
    entregado: p.estado === 'Entregado' ? lineas.map(function (x, i) { return i; }) : indicesEntregados_(p.entregado, lineas.length),
    lineas: lineas.map(function (l) {
      return { n: String(l.nombre), tam: l.tam || '', salsa: l.salsa || '', cant: Number(l.cant) || 1, unit: Number(l.unit) || 0,
        d: (l.opciones || []).map(function (o) { return o.g + ': ' + (o.v || []).join(', '); }).concat(l.nota ? ['Nota: ' + l.nota] : []).join(' · '),
        cortesia: !!l.cortesia };
    }),
    catalogo: { productos: productos, salsas: salsas, grupos: gruposOpciones_(cat.opciones) } };
}
/** cambios = { cant: [nueva cantidad por línea existente, 0 = quitar], nuevos: [{ id, tam, salsa, cant, nota, ops, mitad }] } */
function editarPedidoMesa(sesion, numero, cambios) {
  var quien = String(exigirAdmin_(sesion) || 'panel').split('@')[0];
  cambios = cambios || {};
  var cfg = leerConfig_(), zona = cfg.zona_horaria || 'America/Lima';
  var lock = LockService.getScriptLock(); lock.waitLock(20000);
  try {
    var p = pedidoEditable_(numero, zona);
    var lineas = []; try { lineas = JSON.parse(String(p.items_json || '[]')) || []; } catch (e) { lineas = []; }
    var cant = Array.isArray(cambios.cant) ? cambios.cant : [];
    if (cant.length !== lineas.length) throw new Error('El pedido cambió mientras lo editabas. Ciérralo y vuelve a abrirlo.');
    var entAntes = p.estado === 'Entregado' ? lineas.map(function (x, i) { return i; }) : indicesEntregados_(p.entregado, lineas.length);
    var out = [], ent = [], quitados = [], agregados = [];
    lineas.forEach(function (l, i) {
      var n = Math.floor(Number(cant[i]));
      if (!(n >= 0 && n <= 50)) n = Number(l.cant) || 1;
      var antes = Number(l.cant) || 1;
      if (n < antes) quitados.push(copiaLinea_(l, antes - n));
      if (n > antes) agregados.push(copiaLinea_(l, n - antes));
      if (!n) return;
      var nl = copiaLinea_(l, n);
      if (entAntes.indexOf(i) >= 0 && n <= antes) ent.push(out.length);   // si se aumentó, falta llevar lo nuevo
      out.push(nl);
    });
    var nuevos = Array.isArray(cambios.nuevos) ? cambios.nuevos.slice(0, 20) : [];
    if (nuevos.length) {
      var r = calcularPedido_({ canal: 'mesa', mesa: String(p.mesa), items: nuevos }, leerCatalogo_(), cfg, momentoActual_(cfg), true, true);
      if (!r.ok) throw new Error(r.error);
      r.lineas.forEach(function (l) { out.push(l); agregados.push(l); });
    }
    if (!quitados.length && !agregados.length) return { ok: true, sinCambios: true };
    if (!out.length) throw new Error('El pedido quedaría vacío: mejor cancélalo (botón Cancelar).');
    var total = Math.round(out.reduce(function (a, l) { return a + (Number(l.subtotal) || 0); }, 0) * 100) / 100;
    var est = String(p.estado);
    if (ent.length === out.length) est = 'Entregado';
    else if (est === 'Entregado' || est === 'Listo') est = 'En preparación';   // se agregó algo: vuelve a cocina
    var ahora = new Date();
    var resumen = agregados.map(function (l) { return '+' + l.cant + ' ' + l.nombre; }).concat(quitados.map(function (l) { return '−' + l.cant + ' ' + l.nombre; })).join(', ');
    var h = SpreadsheetApp.getActive().getSheetByName(HOJA.pedidos), cab = asegurarColumnas_(h, COLS.pedidos);
    var set = function (k, v) { h.getRange(p._fila, cab.indexOf(k) + 1).setValue(v); };
    set('items_json', JSON.stringify(out)); set('total', total); set('detalle', protegerCelda_(detalleDe_(out)));
    set('entregado', ent.join(',')); set('estado', est); set('actualizado', ahora);
    set('historial', protegerCelda_(String(p.historial || '') + ' · Editado ' + fmt_(ahora, 'HH:mm') + ' (' + quien + '): ' + resumen).slice(0, 2000));
    nuevaVersion_();
    return { ok: true, numero: Number(p.numero), num_dia: Number(p.num_dia) || Number(p.numero), mesa: String(p.mesa), mozo: celdaTexto_(p.mozo),
      total: total, resumen: resumen, agregados: cocinaDe_(JSON.stringify(agregados)), quitados: cocinaDe_(JSON.stringify(quitados)) };
  } finally { lock.releaseLock(); }
}
function copiaLinea_(l, n) {
  var c = JSON.parse(JSON.stringify(l));
  c.cant = n; c.subtotal = Math.round((Number(c.unit) || 0) * n * 100) / 100;
  return c;
}
