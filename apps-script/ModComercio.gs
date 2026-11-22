/* =========================== MÓDULO COMERCIO (pedido web) ===========================
   Se enciende con Config modulo_comercio = SI (Ajustes > Módulos). Apagado, no cambia nada.
   Qué agrega al pedido de la web:
   1. Catálogo por horario: productos y categorías con ventana horaria opcional (hoja "Horarios"). El cliente solo ve y pide lo disponible
      ahora y el servidor lo vuelve a validar al registrar el pedido (a la hora programada si el pedido es programado).
   2. QR de barra/mostrador: https://tu-sitio/?origen=barra marca el pedido con origen "barra" y lo pide como recojo en el local.
   3. Pedido programado: horas cada N minutos, anticipación mínima y cupo por franja (todo validado aquí).
   4. Aviso al cliente cuando la cocina está por cerrar (opcional).
   5. Botón "Déjanos tu reseña" (Config resena_url; vacío = no se muestra nada).
   6. Revocación de la sesión de mesa: si la cuenta de la mesa se cerró después de que el cliente abrió el QR, se rechaza su pedido.
   Claves de Config (todas opcionales): modulo_comercio, comercio_ventanas (SI), comercio_programado (SI), comercio_prog_intervalo_min (15),
   comercio_prog_anticipacion_min (30), comercio_prog_cupo (vacío = sin límite), comercio_barra (SI), comercio_mesa_revocar (SI),
   comercio_aviso_cocina_min (vacío = sin aviso), resena_url (vacío = sin botón).
   Datos nuevos: hoja "Horarios" (tipo, id, horas, dias, nota). El pedido usa la columna "origen" que ya existía.
   Gancho único en Code.gs: registrarPedido_ llama a comercioValidarPedido_ justo después de calcularPedido_ (ver LEEME). */
var HOJA_HORARIOS = 'Horarios';
var COLS_HORARIOS = ['tipo', 'id', 'horas', 'dias', 'nota'];
var CX_CLAVES = ['comercio_ventanas', 'comercio_programado', 'comercio_prog_intervalo_min', 'comercio_prog_anticipacion_min', 'comercio_prog_cupo',
  'comercio_barra', 'comercio_mesa_revocar', 'comercio_aviso_cocina_min', 'resena_url'];
var EXT_ACCIONES = EXT_ACCIONES || {};
var EXT_PUBLICO = EXT_PUBLICO || {};
var EXT_GET = EXT_GET || {};
extRegistrar_('comercio');

/* ---------- lógica pura (sin Google) ---------- */
function cxHHMM_(v) {
  if (v instanceof Date) return ('0' + v.getHours()).slice(-2) + ':' + ('0' + v.getMinutes()).slice(-2);
  var m = String(v == null ? '' : v).replace(/^'/, '').trim().match(/^(\d{1,2}):(\d{2})/);
  return m ? ('0' + m[1]).slice(-2) + ':' + m[2] : '';
}
/** "12:00-16:00, 19:00-23:00" → [[720,960],[1140,1380]]. Lanza Error si hay un rango mal escrito. Vacío → []. */
function cxRangos_(txt) {
  var r = [];
  String(txt == null ? '' : txt).split(/[,;\n]+/).forEach(function (x) {
    x = x.trim(); if (!x) return;
    var m = x.match(/^(\d{1,2}):(\d{2})\s*-\s*(\d{1,2}):(\d{2})$/);
    if (!m || +m[1] > 23 || +m[3] > 23 || +m[2] > 59 || +m[4] > 59) throw new Error('Horario no válido: "' + x + '". Usa por ejemplo 12:00-16:00 (puedes poner varios separados por coma).');
    var a = (+m[1]) * 60 + (+m[2]), b = (+m[3]) * 60 + (+m[4]);
    if (a === b) throw new Error('El horario "' + x + '" empieza y termina a la misma hora.');
    r.push([a, b]);
  });
  return r;
}
function cxMinTxt_(m) { m = ((m % 1440) + 1440) % 1440; return ('0' + Math.floor(m / 60)).slice(-2) + ':' + ('0' + (m % 60)).slice(-2); }
function cxRangosTxt_(rangos) { return rangos.map(function (x) { return cxMinTxt_(x[0]) + '-' + cxMinTxt_(x[1]); }).join(', '); }
/** reg = { h: [[a,b],...], d: [días]|null }. Un rango que cruza la medianoche (22:00-02:00) pertenece al día en que EMPIEZA. */
function cxDisponible_(reg, dia, min) {
  if (!reg) return true;
  var h = reg.h || [], d = reg.d;
  var diaOk = function (x) { return d == null || d.indexOf(x) >= 0; };
  if (!h.length) return diaOk(dia);
  for (var i = 0; i < h.length; i++) {
    var a = h[i][0], b = h[i][1];
    if (b > a) { if (min >= a && min < b && diaOk(dia)) return true; }
    else if ((min >= a && diaOk(dia)) || (min < b && diaOk((dia + 6) % 7))) return true;
  }
  return false;
}
function cxCuando_(reg) {
  var t = (reg.h && reg.h.length) ? 'de ' + reg.h.map(function (x) { return cxMinTxt_(x[0]) + ' a ' + cxMinTxt_(x[1]); }).join(' y de ') : 'todo el día';
  if (reg.d != null) t += ' (' + (typeof diasTexto_ === 'function' ? diasTexto_(reg.d) : reg.d.join(', ')) + ')';
  return t;
}
function cxSumaDias_(iso, n) {
  var p = iso.split('-'), d = new Date(Date.UTC(+p[0], +p[1] - 1, +p[2] + n));
  return d.getUTCFullYear() + '-' + ('0' + (d.getUTCMonth() + 1)).slice(-2) + '-' + ('0' + d.getUTCDate()).slice(-2);
}
/** Fecha (AAAA-MM-DD) para la que es un pedido ya registrado, según su fecha de registro y el aviso "PARA ..." de sus notas. */
function cxFechaDestino_(isoRegistro, notas) {
  var m = String(notas || '').match(/^PARA (MAÑANA )?(DOMINGO|LUNES|MARTES|MIÉRCOLES|JUEVES|VIERNES|SÁBADO) \d{1,2}:\d{2}\. /);
  if (!m) return isoRegistro;
  if (m[1]) return cxSumaDias_(isoRegistro, 1);
  var dn = DIAS_LARGOS.map(function (x) { return x.toUpperCase(); }).indexOf(m[2]);
  for (var i = 1; i <= 7; i++) if (diaDeFecha_(cxSumaDias_(isoRegistro, i)) === dn) return cxSumaDias_(isoRegistro, i);
  return isoRegistro;
}
function cxNum_(v, def, min, max) {
  var n = num_(v);
  if (n == null) return def;
  n = Math.floor(n);
  return n < min ? min : n > max ? max : n;
}
function cxPrograma_(cfg) {
  var on = String(cfg.comercio_programado == null || cfg.comercio_programado === '' ? 'SI' : cfg.comercio_programado).toUpperCase() !== 'NO';
  var cupo = cxNum_(cfg.comercio_prog_cupo, 0, 0, 500);
  return { on: on, paso: cxNum_(cfg.comercio_prog_intervalo_min, 15, 5, 120), ant: cxNum_(cfg.comercio_prog_anticipacion_min, 30, 0, 720), cupo: cupo };
}
function cxFlag_(cfg, clave) { return String(cfg[clave] == null || cfg[clave] === '' ? 'SI' : cfg[clave]).toUpperCase() !== 'NO'; }
function cxUrlResena_(v) { v = String(v == null ? '' : v).trim(); return /^https:\/\/[^\s<>"']{4,300}$/i.test(v) ? v : ''; }

/* ---------- datos ---------- */
/** { 'producto|id': reg, 'seccion|id': reg } desde la hoja Horarios (filas con errores se ignoran). */
function cxLeerVentanas_() {
  var out = {};
  leerTabla_(HOJA_HORARIOS).forEach(function (f) {
    var tipo = String(f.tipo || '').trim().toLowerCase();
    if (tipo !== 'producto' && tipo !== 'seccion') return;
    var id = String(f.id == null ? '' : f.id).trim(); if (!id) return;
    var h = [], d = null;
    try { h = cxRangos_(f.horas); } catch (e) { return; }
    d = parsearDias_(f.dias);
    if (!h.length && d == null) return;
    out[tipo + '|' + id] = { h: h, d: d };
  });
  return out;
}
/** Productos/categorías ya cobrados por el cuerpo del pedido: devuelve texto de error o ''. */
function cxMirarVentanas_(body, r, vent, dia, min) {
  if (!Object.keys(vent).length) return '';
  var cat = leerCatalogo_(), nom = {};
  (cat.productos || []).forEach(function (p) { nom[String(p.id)] = String(p.nombre); });
  var ids = [];
  (r.lineas || []).forEach(function (l) { ids.push({ id: String(l.id), sec: String(l.seccion) }); });
  var pr = {}; (cat.productos || []).forEach(function (p) { pr[String(p.id)] = p; });
  (Array.isArray(body.items) ? body.items : []).forEach(function (it) {
    var mi = it && it.mitad ? String(it.mitad) : ''; if (mi && pr[mi]) ids.push({ id: mi, sec: String(pr[mi].seccion) });
  });
  for (var i = 0; i < ids.length; i++) {
    var x = ids[i], rp = vent['producto|' + x.id], rs = vent['seccion|' + x.sec];
    var n = nom[x.id] || 'Un producto de tu pedido';
    if (rp && !cxDisponible_(rp, dia, min)) return n + ' solo se puede pedir ' + cxCuando_(rp) + '.';
    if (rs && !cxDisponible_(rs, dia, min)) return n + ' no está disponible en este horario (su categoría va ' + cxCuando_(rs) + ').';
  }
  return '';
}

/** Pedidos ya registrados por franja para una fecha destino: { 'HH:MM': cantidad }. */
function cxUsados_(isoDestino, cfg) {
  var zona = cfg.zona_horaria || 'America/Lima', out = {};
  pedidosRecientes_().forEach(function (p) {
    if (String(p.canal) === 'mesa' || String(p.estado) === 'Cancelado' || String(p.origen || '') === 'cortesia') return;
    var hh = cxHHMM_(p.programado); if (!hh || !(p.fecha instanceof Date)) return;
    var reg = Utilities.formatDate(p.fecha, zona, 'yyyy-MM-dd');
    if (cxFechaDestino_(reg, p.notas) !== isoDestino) return;
    out[hh] = (out[hh] || 0) + 1;
  });
  return out;
}

/* ---------- gancho de registrarPedido_ ---------- */
/** Devuelve null si todo está bien, o { ok:false, error }. Solo pedidos del público (no del mozo). Módulo apagado: null y sin efectos. */
function comercioValidarPedido_(body, r, cfg) {
  if (!moduloActivo_(cfg, 'comercio')) return null;
  var momento = momentoActual_(cfg), dia = momento.dia, min = momento.min, hora = '', v = null;

  // programado: horas con intervalo, anticipación y cupo (solo delivery/recojo)
  var pg = cxPrograma_(cfg);
  if (r.programado && r.canal !== 'mesa') {
    v = proximaVentana_(cfg, momento);
    if (v) {
      var pm = minutos_(r.programado);
      if (pm < v.a && pm + 1440 <= v.c) pm += 1440;
      dia = v.dia; min = pm >= 1440 ? pm - 1440 : pm; if (pm >= 1440) dia = (v.dia + 1) % 7;
      hora = cxMinTxt_(pm);
      if (pg.on) {
        if (pm % pg.paso !== 0) return { ok: false, error: 'Elige una hora de la lista: las horas disponibles van cada ' + pg.paso + ' minutos.' };
        if (pm > v.c - pg.paso) return { ok: false, error: 'La última hora para pedir es ' + cxMinTxt_(v.c - pg.paso) + '. Elige una anterior.' };
        var ahoraS = momento.min; if (v.dias === 0 && v.c > 1440 && ahoraS < v.a) ahoraS += 1440;
        if (v.dias === 0 && pm < ahoraS + pg.ant) return { ok: false, error: 'Elige una hora con al menos ' + pg.ant + ' minutos de anticipación.' };
      }
    }
  }

  // catálogo por horario (a la hora programada si la hay; si no, ahora)
  if (cxFlag_(cfg, 'comercio_ventanas')) {
    var er = cxMirarVentanas_(body, r, cxLeerVentanas_(), dia, min);
    if (er) return { ok: false, error: er };
  }

  // QR de barra: pedido de recojo en el local
  if (String(r.origen) === 'barra') {
    if (!cxFlag_(cfg, 'comercio_barra')) r.origen = '';
    else if (r.canal !== 'recojo') return { ok: false, error: 'Los pedidos del QR de barra son para recojo en el local.' };
  }

  // sesión de la mesa: la cuenta no debe haberse cerrado después de abrir el QR
  if (r.canal === 'mesa' && cxFlag_(cfg, 'comercio_mesa_revocar')) {
    var m = filaMesa_(r.mesa);
    if (!m || !esSi_(m.activa)) return { ok: false, error: 'Esta mesa ya no está disponible. Pide ayuda a tu mozo.' };
    if (cxMesaCerrada_(m, body.sesionMesa)) return { ok: false, error: 'La cuenta de esta mesa ya se cerró. Recarga la página o vuelve a escanear el QR para hacer un pedido nuevo.' };
  }

  // cupo por franja (con el pedido ya validado; la reserva evita que dos clientes tomen el último cupo a la vez)
  if (hora && pg.on && pg.cupo > 0) {
    var lock = LockService.getScriptLock();
    lock.waitLock(10000);
    try {
      var iso = cxSumaDias_(momento.fecha, v.dias), usados = cxUsados_(iso, cfg)[hora] || 0;
      var cache = CacheService.getScriptCache(), kr = 'cxr:' + iso + ':' + hora, ahora = Date.now(), res = null;
      try { res = JSON.parse(cache.get(kr) || 'null'); } catch (e) { res = null; }
      // reserva de los últimos 10 s: cuenta los pedidos que aún no llegan a la hoja, sin contar dos veces los que ya llegaron
      var efectivo = Math.max(usados, res && ahora - res.t < 10000 ? res.n : 0);
      if (efectivo >= pg.cupo) return { ok: false, error: 'Esa hora ya está completa. Elige otra hora.' };
      cache.put(kr, JSON.stringify({ n: efectivo + 1, t: ahora }), 30);
    } finally { lock.releaseLock(); }
  }
  return null;
}
/** ¿La cuenta de la mesa se cerró después de que el cliente abrió su sesión? (sesion = hora del servidor, en ms, que recibió el cliente) */
function cxMesaCerrada_(m, sesion) {
  var s = Number(sesion);
  if (!(s > 0) || !(m.abierta_desde instanceof Date)) return false;
  return m.abierta_desde.getTime() > Math.min(s, Date.now()) + 2000;
}

/* ---------- lectura pública ---------- */
EXT_PUBLICO['comercio'] = function (cfg) {
  var o = { v: 1 };
  if (cxFlag_(cfg, 'comercio_ventanas')) {
    var p = {}, s = {}, vent = cxLeerVentanas_();
    Object.keys(vent).forEach(function (k) {
      var i = k.indexOf('|'), reg = { h: vent[k].h.map(function (x) { return [cxMinTxt_(x[0]), cxMinTxt_(x[1])]; }) };
      if (vent[k].d != null) reg.d = vent[k].d;
      (k.slice(0, i) === 'producto' ? p : s)[k.slice(i + 1)] = reg;
    });
    if (Object.keys(p).length) o.p = p;
    if (Object.keys(s).length) o.s = s;
  }
  var pg = cxPrograma_(cfg);
  if (pg.on) o.prog = { paso: pg.paso, ant: pg.ant, cupo: pg.cupo };
  if (cxFlag_(cfg, 'comercio_barra')) o.barra = true;
  if (cxFlag_(cfg, 'comercio_mesa_revocar')) o.mesaRevocar = true;
  var av = cxNum_(cfg.comercio_aviso_cocina_min, 0, 0, 180); if (av > 0) o.avisoCocina = av;
  var rs = cxUrlResena_(cfg.resena_url); if (rs) o.resena = rs;
  return o;
};

/** GET ?ext=comercio&q=sesion&m=5&cod=XXXX[&s=ms]  → hora del servidor y si la cuenta se cerró desde "s".
 *  GET ?ext=comercio&q=cupos&f=AAAA-MM-DD         → pedidos ya tomados por franja ese día. */
EXT_GET['comercio'] = function (p) {
  var cfg = leerConfig_(), cache = CacheService.getScriptCache(), q = String(p.q || '');
  if (q === 'sesion') {
    var mesa = texto_(p.m, 6), kf = 'cxs:' + mesa, n = Number(cache.get(kf) || 0);
    if (n >= 120) throw extError_('Demasiados intentos. Espera un minuto.');
    cache.put(kf, String(n + 1), 60);
    var cat = leerCatalogo_();
    var mm = (cat.mesas || []).filter(function (x) { return String(x.mesa) === mesa; })[0];
    if (!mm || !esSi_(mm.activa) || !codigoMesaOk_(mm, texto_(p.cod, 20))) throw extError_('Este código QR no es válido. Pide ayuda a tu mozo.');
    var fila = filaMesa_(mesa);
    return { ok: true, t: Date.now(), cerrada: !!(fila && cxMesaCerrada_(fila, p.s)) };
  }
  if (q === 'cupos') {
    var f = String(p.f || ''); if (!/^\d{4}-\d{2}-\d{2}$/.test(f)) throw extError_('Fecha no válida.');
    var kc = 'cxc:' + f, c = cache.get(kc), usados;
    if (c) usados = JSON.parse(c); else { usados = cxUsados_(f, cfg); cache.put(kc, JSON.stringify(usados), 20); }
    return { ok: true, usados: usados };
  }
  throw extError_('No disponible.');
};
/** Acción POST { ext:'comercio' }: reservada (el módulo no recibe pedidos por aquí). */
EXT_ACCIONES['comercio'] = function (body) { throw extError_('Acción no válida.'); };

/* ---------- panel de administración (funciones que llama el panel) ---------- */
function comercioLeer(sesion) {
  exigirAdmin_(sesion);
  var cfg = leerConfig_(), c = {};
  CX_CLAVES.forEach(function (k) { c[k] = cfg[k] == null ? '' : String(cfg[k]); });
  var vent = cxLeerVentanas_(), crudo = {};
  leerTabla_(HOJA_HORARIOS).forEach(function (f) { crudo[String(f.tipo || '').trim().toLowerCase() + '|' + String(f.id == null ? '' : f.id).trim()] = { horas: String(f.horas || ''), dias: String(f.dias || '') }; });
  var cat = leerCatalogo_(), filas = [], tit = {};
  (cat.secciones || []).forEach(function (s) {
    tit[String(s.id)] = String(s.titulo || s.id);
    var k = 'seccion|' + s.id;
    filas.push({ tipo: 'seccion', id: String(s.id), nombre: String(s.titulo || s.id), horas: (crudo[k] || {}).horas || '', dias: (crudo[k] || {}).dias || '' });
  });
  (cat.productos || []).forEach(function (p) {
    if (p.tipo === 'salsa') return;
    var k = 'producto|' + p.id;
    filas.push({ tipo: 'producto', id: String(p.id), nombre: String(p.nombre), seccion: tit[String(p.seccion)] || String(p.seccion), horas: (crudo[k] || {}).horas || '', dias: (crudo[k] || {}).dias || '' });
  });
  return { cfg: c, filas: filas, base: String(cfg.sitio_url || '').replace(/\/+$/, '') };
}

function comercioGuardarConfig(sesion, o) {
  var quien = String(exigirAdmin_(sesion) || 'panel').split('@')[0];
  o = o || {};
  var clean = {};
  CX_CLAVES.forEach(function (k) {
    if (!(k in o)) return;
    var v = String(o[k] == null ? '' : o[k]).trim();
    if (k === 'comercio_prog_intervalo_min' && v && !(Number(v) >= 5 && Number(v) <= 120)) throw new Error('El intervalo de horas va de 5 a 120 minutos.');
    if (k === 'comercio_prog_anticipacion_min' && v && !(Number(v) >= 0 && Number(v) <= 720)) throw new Error('La anticipación mínima va de 0 a 720 minutos.');
    if (k === 'comercio_prog_cupo' && v && !(Number(v) >= 1 && Number(v) <= 500)) throw new Error('El cupo por franja va de 1 a 500 pedidos (vacío = sin límite).');
    if (k === 'comercio_aviso_cocina_min' && v && !(Number(v) >= 1 && Number(v) <= 180)) throw new Error('El aviso de cierre va de 1 a 180 minutos (vacío = sin aviso).');
    if (k === 'resena_url' && v && !cxUrlResena_(v)) throw new Error('El enlace de reseña debe empezar con https://');
    if (/^comercio_(ventanas|programado|barra|mesa_revocar)$/.test(k)) v = /^(no|n|0|false)$/i.test(v) ? 'NO' : 'SI';
    if (/_min$|_cupo$/.test(k) && v) v = String(Math.floor(Number(v)));
    clean[k] = v;
  });
  Object.keys(clean).forEach(function (k) { guardarClave_(k, clean[k]); });
  if (Object.keys(clean).length) auditar_(quien, 'Ajustes de comercio', Object.keys(clean).join(', '));
  autoPublicar_(sesion);
  return true;
}

/** lista = [{ tipo:'producto'|'seccion', id, horas, dias }]: reemplaza lo de esas filas (horas y días vacíos = sin restricción). */
function comercioGuardarVentanas(sesion, lista) {
  var quien = String(exigirAdmin_(sesion) || 'panel').split('@')[0];
  if (!Array.isArray(lista) || lista.length > 600) throw new Error('Lista no válida.');
  var cat = leerCatalogo_(), pids = {}, sids = {};
  (cat.productos || []).forEach(function (p) { pids[String(p.id)] = 1; });
  (cat.secciones || []).forEach(function (s) { sids[String(s.id)] = 1; });
  var nuevas = {};
  lista.forEach(function (x) {
    var tipo = String(x && x.tipo || ''), id = String(x && x.id || '');
    if (tipo !== 'producto' && tipo !== 'seccion') throw new Error('Tipo no válido.');
    if (!(tipo === 'producto' ? pids[id] : sids[id])) throw new Error('No existe ' + (tipo === 'producto' ? 'el producto ' : 'la categoría ') + id + '.');
    var h = cxRangos_(x.horas), dtxt = String(x.dias == null ? '' : x.dias).trim();
    var d = parsearDias_(dtxt);
    if (dtxt && dtxt.toLowerCase() !== 'todos' && (!d || !d.length)) throw new Error('Días no válidos en ' + id + '. Usa por ejemplo: lun, mar, mie');
    nuevas[tipo + '|' + id] = { tipo: tipo, id: id, horas: cxRangosTxt_(h), dias: diasTexto_(d) };
  });
  var lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    var hoja = obtenerHoja_(SpreadsheetApp.getActive(), HOJA_HORARIOS, COLS_HORARIOS);
    var cab = asegurarColumnas_(hoja, COLS_HORARIOS), existentes = leerTabla_(HOJA_HORARIOS), visto = {};
    existentes.forEach(function (f) {
      var k = String(f.tipo || '').trim().toLowerCase() + '|' + String(f.id == null ? '' : f.id).trim();
      if (!(k in nuevas)) return;
      visto[k] = 1;
      var n = nuevas[k];
      hoja.getRange(f._fila, cab.indexOf('horas') + 1).setNumberFormat('@').setValue(n.horas);
      hoja.getRange(f._fila, cab.indexOf('dias') + 1).setNumberFormat('@').setValue(n.dias);
    });
    Object.keys(nuevas).forEach(function (k) {
      var n = nuevas[k];
      if (visto[k] || (!n.horas && !n.dias)) return;
      hoja.appendRow(cab.map(function (c) { return c === 'tipo' ? n.tipo : c === 'id' ? n.id : c === 'horas' ? n.horas : c === 'dias' ? n.dias : ''; }));
    });
  } finally { lock.releaseLock(); }
  auditar_(quien, 'Horarios de la carta', Object.keys(nuevas).length + ' filas revisadas');
  autoPublicar_(sesion);
  return true;
}

/** Enlace y QR (SVG) del mostrador/barra. */
function comercioQrBarra(sesion) {
  exigirAdmin_(sesion);
  var base = String(leerConfig_().sitio_url || '').replace(/\/+$/, '');
  if (!base) throw new Error('Falta la dirección de la web: llena "sitio_url" en Ajustes.');
  var url = base + '/?origen=barra';
  return { url: url, svg: qrSvg_(url, 6) };
}
