/* =========================== MÓDULO REPARTO (delivery propio) ===========================
   Se enciende con Config: modulo_reparto = SI. Apagado no hace nada (el despachador de Ext.gs ni lo llama).

   Qué hace:
   - Repartidores = personal con rol "repartidor" de la hoja Mozos (enlace secreto). Sus datos extra (vehículo, estado) van
     en la hoja nueva "Reparto_Perfil". No se toca la hoja Mozos.
   - Cada pedido de delivery tiene una fila en la hoja nueva "Reparto" (quién lo lleva, tiempos, cobro, ETA, token de seguimiento).
   - Despacho SECUENCIAL: se ofrece el pedido (cuando está "Listo") al siguiente repartidor disponible por turno; si no lo acepta
     en reparto_aceptacion_seg segundos pasa al siguiente. Todas las escrituras van con LockService: nunca hay doble asignación.
     No hay disparadores de tiempo: las ofertas vencidas se reasignan cuando alguien consulta (la app del repartidor y el panel
     consultan cada pocos segundos).
   - ETA simple: reparto_eta_base_min + (minutos de la zona, o km x reparto_eta_min_por_km). Todo en Config; vacío = sin ETA.
   - Seguimiento del cliente por token (solo estado, ETA y nombre de pila del repartidor) y calificación 1-5 (un envío por token).

   Config (todas opcionales; el dueño las decide):
     reparto_modo (oferta | libre | manual; por defecto oferta), reparto_aceptacion_seg (90), reparto_max_activos (1),
     reparto_max_vueltas (2), reparto_visto_min (5), reparto_eta_base_min, reparto_eta_min_por_km,
     reparto_zonas ("Centro=15; Alto Trujillo=30"), reparto_seguimiento_horas (48)

   Estados de la fila Reparto: Preparando > Pendiente > Ofrecido > Asignado > En camino > Entregado | Cancelado.
   Estados del pedido que se actualizan desde aquí: Listo > En camino > Entregado (mismo historial que el panel). */
var EXT_ACCIONES = EXT_ACCIONES || {};
var EXT_PUBLICO = EXT_PUBLICO || {};
var EXT_GET = EXT_GET || {};
extRegistrar_('reparto');

var HOJA_REPARTO = 'Reparto', HOJA_REP_PERFIL = 'Reparto_Perfil';
var COLS_REPARTO = ['numero', 'token', 'estado', 'repartidor_id', 'repartidor', 'ofrecido_a', 'oferta_hasta', 'rechazados', 'vueltas',
  'creado', 'asignado', 'en_camino', 'entregado', 'zona', 'km', 'eta_min', 'eta_hasta', 'cobro_monto', 'cobro_recibido', 'cobro_vuelto',
  'cobro_hora', 'problema', 'problema_hora', 'calificacion', 'comentario', 'calificado', 'asignado_por'];
var COLS_REP_PERFIL = ['id', 'nombre', 'vehiculo', 'estado', 'actualizado', 'ultimo_turno', 'visto'];
var REP_ESTADOS_PERFIL = ['disponible', 'en ruta', 'descanso'];
var REP_PROBLEMAS = ['El cliente no responde', 'Dirección incorrecta o no la encuentro', 'El cliente rechazó el pedido', 'Otro'];
var REP_CLAVES_CFG = ['reparto_modo', 'reparto_aceptacion_seg', 'reparto_max_activos', 'reparto_max_vueltas', 'reparto_visto_min',
  'reparto_eta_base_min', 'reparto_eta_min_por_km', 'reparto_zonas', 'reparto_seguimiento_horas'];

/* ---------- configuración ---------- */
function repEntero_(v, def, min, max) {
  var n = num_(v);
  if (n === null) return def;
  n = Math.floor(n);
  return n < min ? min : n > max ? max : n;
}
function repCfg_(cfg) {
  cfg = cfg || leerConfig_();
  var modo = String(cfg.reparto_modo || 'oferta').trim().toLowerCase();
  if (['oferta', 'libre', 'manual'].indexOf(modo) < 0) modo = 'oferta';
  var base = num_(cfg.reparto_eta_base_min), porKm = num_(cfg.reparto_eta_min_por_km);
  return { modo: modo, seg: repEntero_(cfg.reparto_aceptacion_seg, 90, 15, 600), maxActivos: repEntero_(cfg.reparto_max_activos, 1, 1, 5),
    vueltas: repEntero_(cfg.reparto_max_vueltas, 2, 1, 5), vistoMin: repEntero_(cfg.reparto_visto_min, 5, 1, 120),
    etaBase: base !== null && base >= 0 && base <= 600 ? base : null, etaKm: porKm !== null && porKm >= 0 && porKm <= 60 ? porKm : null,
    zonas: repZonas_(cfg.reparto_zonas), horas: repEntero_(cfg.reparto_seguimiento_horas, 48, 1, 720),
    zona: cfg.zona_horaria || 'America/Lima' };
}
function repNorm_(s) { return String(s == null ? '' : s).toLowerCase().replace(/[áàä]/g, 'a').replace(/[éèë]/g, 'e').replace(/[íìï]/g, 'i').replace(/[óòö]/g, 'o').replace(/[úùü]/g, 'u').replace(/\s+/g, ' ').trim(); }
/** "Centro=15; Alto Trujillo=30" → [{n:'Centro', min:15}, ...] */
function repZonas_(txt) {
  var out = [];
  String(txt == null ? '' : txt).split(/[;\n]/).forEach(function (p) {
    var i = p.lastIndexOf('='); if (i < 1) return;
    var n = texto_(p.slice(0, i), 40), m = num_(p.slice(i + 1));
    if (n && m !== null && m >= 0 && m <= 600) out.push({ n: n, min: m });
  });
  return out;
}
/** ETA en minutos = base + (zona | km x por_km). null si no hay nada configurado. */
function repEta_(rc, zonaNombre, km) {
  var extra = null;
  if (zonaNombre) { var z = rc.zonas.filter(function (x) { return repNorm_(x.n) === repNorm_(zonaNombre); })[0]; if (z) extra = z.min; }
  if (extra === null && km !== '' && km != null && rc.etaKm !== null) { var k = num_(km); if (k !== null && k >= 0) extra = k * rc.etaKm; }
  if (rc.etaBase === null && extra === null) return null;
  return Math.round((rc.etaBase || 0) + (extra || 0));
}
function repZonaDe_(rc, p) {
  var t = repNorm_((p.direccion || '') + ' ' + (p.referencia || ''));
  var z = rc.zonas.filter(function (x) { return t.indexOf(repNorm_(x.n)) >= 0; })[0];
  return z ? z.n : '';
}

/* ---------- hojas ---------- */
function repHoja_() { return obtenerHoja_(SpreadsheetApp.getActive(), HOJA_REPARTO, COLS_REPARTO); }
function repHojaPerfil_() { return obtenerHoja_(SpreadsheetApp.getActive(), HOJA_REP_PERFIL, COLS_REP_PERFIL); }
function repMs_(v) { return v instanceof Date ? v.getTime() : (typeof v === 'number' && v > 1e11 ? v : 0); }
function repS_(v) { return v == null ? '' : String(v); }
function repLista_(v) { var s = repS_(v); return s ? s.split(',').filter(Boolean) : []; }
function repFilas_() { repHoja_(); return leerTablaReciente_(HOJA_REPARTO, 500); }
function repPerfiles_() { repHojaPerfil_(); return leerTabla_(HOJA_REP_PERFIL); }
/** Escribe solo las columnas indicadas de una fila (y actualiza el objeto en memoria). */
function repEscribir_(h, cab, f, cambios) {
  Object.keys(cambios).forEach(function (c) {
    var i = cab.indexOf(c); if (i < 0) return;
    var v = cambios[c];
    h.getRange(f._fila, i + 1).setValue(typeof v === 'string' ? protegerCelda_(v) : v);
    f[c] = v;
  });
}
function repToken_(usados) {
  var A = 'abcdefghjkmnpqrstuvwxyz23456789';
  for (var intento = 0; intento < 20; intento++) {
    var b = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, Utilities.getUuid() + Utilities.getUuid() + Date.now(), Utilities.Charset.UTF_8), c = '';
    for (var i = 0; i < 20; i++) c += A.charAt((((b[i] % 256) + 256) % 256) % A.length);
    if (/\d/.test(c) && /[a-z]/.test(c) && usados.indexOf(c) < 0) return c;
  }
  throw new Error('No se pudo generar el enlace de seguimiento.');
}
function repBumpVersion_() { PropertiesService.getScriptProperties().setProperty('PEDIDOS_VERSION', String(Date.now())); }

/* ---------- pedido (hoja Pedidos) ---------- */
function repPedidosDelivery_() {
  var m = {};
  leerTablaReciente_(HOJA.pedidos, 400).forEach(function (p) { if (celdaTexto_(p.canal) === 'delivery') m[String(p.numero)] = p; });
  return m;
}
function repNombrePila_(n) { return texto_(String(n || '').split(' ')[0], 20); }
/** Cambia el estado del pedido (mismo formato de historial que el panel). Llamar con el candado tomado. */
function repEstadoPedidoL_(numero, estado, quien) {
  var h = SpreadsheetApp.getActive().getSheetByName(HOJA.pedidos), n = h.getLastRow();
  var nums = h.getRange(2, 1, n - 1, 1).getValues();
  for (var i = nums.length - 1; i >= 0; i--) {
    if (String(nums[i][0]) !== String(numero)) continue;
    var fila = i + 2, cEst = COLS.pedidos.indexOf('estado') + 1, cAct = COLS.pedidos.indexOf('actualizado') + 1, cHis = COLS.pedidos.indexOf('historial') + 1;
    if (String(h.getRange(fila, cEst).getValue() || '') === estado) return;
    var ahora = new Date(), his = String(h.getRange(fila, cHis).getValue() || '');
    h.getRange(fila, cEst).setValue(estado);
    h.getRange(fila, cAct).setValue(ahora);
    h.getRange(fila, cHis).setValue((his ? his + ' · ' : '') + estado + ' ' + fmt_(ahora, 'HH:mm') + ' (' + quien + ')');
    repBumpVersion_();
    return;
  }
  throw extError_('No se encontró el pedido #' + numero + '.');
}
function repNotaPedidoL_(numero, texto) {
  var h = SpreadsheetApp.getActive().getSheetByName(HOJA.pedidos), n = h.getLastRow();
  var nums = h.getRange(2, 1, n - 1, 1).getValues();
  for (var i = nums.length - 1; i >= 0; i--) {
    if (String(nums[i][0]) !== String(numero)) continue;
    var cHis = COLS.pedidos.indexOf('historial') + 1, his = String(h.getRange(i + 2, cHis).getValue() || '');
    h.getRange(i + 2, cHis).setValue((his ? his + ' · ' : '') + texto + ' ' + fmt_(new Date(), 'HH:mm'));
    return;
  }
}

/* ---------- perfiles de repartidor ---------- */
function repRepartidores_() {   // personal activo, con enlace vinculado, rol repartidor
  return leerMozos_().filter(function (m) { return m.activo && m.rol === 'repartidor'; });
}
/** Devuelve (y crea si no existe) el perfil. Llamar con el candado tomado. */
function repPerfilL_(id, nombre) {
  var h = repHojaPerfil_(), cab = asegurarColumnas_(h, COLS_REP_PERFIL);
  var p = repPerfiles_().filter(function (x) { return String(x.id) === String(id); })[0];
  if (!p) {
    var f = { id: String(id), nombre: nombre || '', vehiculo: '', estado: 'disponible', actualizado: new Date(), ultimo_turno: '', visto: '' };
    h.appendRow(cab.map(function (c) { return protegerCelda_(f[c] == null ? '' : f[c]); }));
    p = repPerfiles_().filter(function (x) { return String(x.id) === String(id); })[0];
  }
  return p;
}
function repActivos_(filas, id) {
  return filas.filter(function (f) { return String(f.repartidor_id) === String(id) && (f.estado === 'Asignado' || f.estado === 'En camino'); }).length;
}
/** Repartidores que pueden recibir un pedido ahora (disponibles, vistos hace poco, con cupo, sin otra oferta pendiente). */
function repElegibles_(rc, filas, perfiles, ahora) {
  var rs = repRepartidores_();
  return rs.filter(function (m) {
    if (!m.llave) return false;
    var p = perfiles.filter(function (x) { return String(x.id) === m.id; })[0];
    if (!p || String(p.estado) === 'descanso') return false;
    if (!repMs_(p.visto) || ahora - repMs_(p.visto) > rc.vistoMin * 60000) return false;
    if (repActivos_(filas, m.id) >= rc.maxActivos) return false;
    if (filas.some(function (f) { return f.estado === 'Ofrecido' && String(f.ofrecido_a) === m.id; })) return false;
    return true;
  }).sort(function (a, b) {
    var pa = perfiles.filter(function (x) { return String(x.id) === a.id; })[0], pb = perfiles.filter(function (x) { return String(x.id) === b.id; })[0];
    var ta = repMs_(pa && pa.ultimo_turno), tb = repMs_(pb && pb.ultimo_turno);
    return ta !== tb ? ta - tb : (a.id < b.id ? -1 : 1);
  });
}

/* ---------- sincronización + despacho (con el candado tomado) ---------- */
/** Crea filas para pedidos de delivery nuevos, sigue al pedido (Listo/Cancelado/Entregado) y gestiona ofertas vencidas. */
function repAvanzarL_(rc) {
  var h = repHoja_(), cab = asegurarColumnas_(h, COLS_REPARTO), ahora = Date.now(), cambio = false;
  var filas = repFilas_(), peds = repPedidosDelivery_();
  var porNum = {}; filas.forEach(function (f) { porNum[String(f.numero)] = f; });
  var tokens = filas.map(function (f) { return String(f.token); });
  // 1) pedidos nuevos
  Object.keys(peds).forEach(function (k) {
    var p = peds[k], est = celdaTexto_(p.estado);
    if (porNum[k] || ['Nuevo', 'Confirmado', 'En preparación', 'Listo', 'En camino'].indexOf(est) < 0) return;
    var fecha = p.fecha instanceof Date ? p.fecha : new Date(), zona = repZonaDe_(rc, p), eta = celdaTexto_(p.programado) ? null : repEta_(rc, zona, '');
    var f = { numero: p.numero, token: repToken_(tokens), estado: est === 'Listo' ? 'Pendiente' : est === 'En camino' ? 'En camino' : 'Preparando',
      repartidor_id: '', repartidor: '', ofrecido_a: '', oferta_hasta: '', rechazados: '', vueltas: 0, creado: new Date(),
      asignado: '', en_camino: est === 'En camino' ? new Date() : '', entregado: '', zona: zona, km: '', eta_min: eta === null ? '' : eta,
      eta_hasta: eta === null ? '' : new Date(fecha.getTime() + eta * 60000), cobro_monto: '', cobro_recibido: '', cobro_vuelto: '', cobro_hora: '',
      problema: '', problema_hora: '', calificacion: '', comentario: '', calificado: '', asignado_por: '' };
    tokens.push(f.token);
    h.appendRow(cab.map(function (c) { return protegerCelda_(f[c] == null ? '' : f[c]); }));
    cambio = true;
  });
  if (cambio) { filas = repFilas_(); porNum = {}; filas.forEach(function (f) { porNum[String(f.numero)] = f; }); }
  // 2) seguir al pedido
  filas.forEach(function (f) {
    var p = peds[String(f.numero)]; if (!p) return;
    var est = celdaTexto_(p.estado);
    if (f.estado === 'Entregado' || f.estado === 'Cancelado') return;
    if (est === 'Cancelado') { repEscribir_(h, cab, f, { estado: 'Cancelado', ofrecido_a: '', oferta_hasta: '' }); cambio = true; }
    else if (est === 'Entregado') { repEscribir_(h, cab, f, { estado: 'Entregado', entregado: new Date(), ofrecido_a: '', oferta_hasta: '' }); cambio = true; }
    else if (est === 'En camino' && f.estado !== 'En camino') { repEscribir_(h, cab, f, { estado: 'En camino', en_camino: new Date(), ofrecido_a: '', oferta_hasta: '' }); cambio = true; }
    else if (est === 'Listo' && f.estado === 'Preparando') { repEscribir_(h, cab, f, { estado: 'Pendiente' }); cambio = true; }
    else if (['Nuevo', 'Confirmado', 'En preparación'].indexOf(est) >= 0 && (f.estado === 'Pendiente' || f.estado === 'Ofrecido')) {
      repEscribir_(h, cab, f, { estado: 'Preparando', ofrecido_a: '', oferta_hasta: '' }); cambio = true;   // el pedido volvió a cocina
    }
  });
  // 3) ofertas vencidas → siguiente
  filas.forEach(function (f) {
    if (f.estado === 'Ofrecido' && repMs_(f.oferta_hasta) <= ahora) {
      repEscribir_(h, cab, f, { estado: 'Pendiente', rechazados: repLista_(f.rechazados).concat([repS_(f.ofrecido_a)]).join(','), ofrecido_a: '', oferta_hasta: '' }); cambio = true;
    }
  });
  // 4) ofrecer los pendientes (el más antiguo primero)
  if (rc.modo === 'oferta') {
    var perfiles = repPerfiles_(), hp = repHojaPerfil_(), cabP = asegurarColumnas_(hp, COLS_REP_PERFIL);
    filas.filter(function (f) { return f.estado === 'Pendiente' && Number(f.vueltas) < rc.vueltas; })
      .sort(function (a, b) { return repMs_(a.creado) - repMs_(b.creado); }).forEach(function (f) {
        var el = repElegibles_(rc, filas, perfiles, ahora);
        if (!el.length) return;                                    // nadie disponible: sigue pendiente
        var rech = repLista_(f.rechazados), cand = el.filter(function (m) { return rech.indexOf(m.id) < 0; });
        if (!cand.length) {                                        // todos dijeron que no / no contestaron: otra vuelta o libre para todos
          var v = Number(f.vueltas) + 1;
          if (v >= rc.vueltas) { repEscribir_(h, cab, f, { vueltas: v }); cambio = true; return; }
          repEscribir_(h, cab, f, { vueltas: v, rechazados: '' }); cambio = true; cand = el;
        }
        var m = cand[0], pf = perfiles.filter(function (x) { return String(x.id) === m.id; })[0];
        repEscribir_(h, cab, f, { estado: 'Ofrecido', ofrecido_a: m.id, oferta_hasta: new Date(ahora + rc.seg * 1000) });
        repEscribir_(hp, cabP, pf, { ultimo_turno: new Date(ahora) });   // el turno rota al ofrecer
        cambio = true;
      });
  }
  if (cambio) repBumpVersion_();
  return repFilas_();
}
/** ¿Este pedido pendiente lo puede tomar cualquiera? (modo libre, o ya se agotaron las vueltas de oferta) */
function repLibre_(rc, f) { return f.estado === 'Pendiente' && (rc.modo === 'libre' || (rc.modo === 'oferta' && Number(f.vueltas) >= rc.vueltas)); }

function repConLock_(fn) {
  var lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try { return fn(); } finally { lock.releaseLock(); }
}

/* ---------- vistas (lo que sale al repartidor, al admin y al cliente) ---------- */
function repCobroDe_(p) {
  var total = Number(p.total) || 0;
  var pagado = celdaTexto_(p.pago_estado) === 'Confirmado' || /^(yape|plin|transf|tarjeta)/i.test(celdaTexto_(p.pago));
  return pagado ? 0 : total;
}
function repVistaRep_(f, p, rc, completo) {
  var o = { numero: f.numero, nd: p ? (Number(p.num_dia) || p.numero) : f.numero, estado: f.estado, zona: repS_(f.zona),
    direccion: p ? celdaTexto_(p.direccion) : '', referencia: p ? celdaTexto_(p.referencia) : '',
    cliente: p ? (completo ? celdaTexto_(p.nombre) : repNombrePila_(celdaTexto_(p.nombre))) : '', total: p ? Number(p.total) || 0 : 0,
    pago: p ? celdaTexto_(p.pago) : '', detalle: p && completo ? celdaTexto_(p.detalle).slice(0, 400) : '',
    notas: p && completo ? celdaTexto_(p.notas).slice(0, 200) : '', ofertaHasta: repMs_(f.oferta_hasta), etaHasta: repMs_(f.eta_hasta),
    cobrar: p ? repCobroDe_(p) : 0, cobrado: !!repMs_(f.cobro_hora), recibido: f.cobro_recibido === '' ? null : Number(f.cobro_recibido), vuelto: f.cobro_vuelto === '' ? null : Number(f.cobro_vuelto),
    problema: repS_(f.problema), programado: p ? celdaTexto_(p.programado) : '' };
  if (completo) o.telefono = p ? celdaTexto_(p.telefono).replace(/[^\d+]/g, '') : '';
  return o;
}
function repVistaAdmin_(f, p, rc, cfg, ahora) {
  var o = repVistaRep_(f, p, rc, true);
  o.cliente = p ? celdaTexto_(p.nombre) : ''; o.repartidor = repS_(f.repartidor); o.repartidorId = repS_(f.repartidor_id); o.ofrecidoA = repS_(f.ofrecido_a);
  o.creado = repMs_(f.creado); o.asignado = repMs_(f.asignado); o.enCamino = repMs_(f.en_camino); o.entregado = repMs_(f.entregado);
  o.pedidoTs = p && p.fecha instanceof Date ? p.fecha.getTime() : 0; o.estadoPedido = p ? celdaTexto_(p.estado) : '';
  o.km = f.km === '' ? '' : Number(f.km); o.etaMin = f.eta_min === '' ? null : Number(f.eta_min); o.vueltas = Number(f.vueltas) || 0;
  o.atrasado = !!(o.etaHasta && ahora > o.etaHasta && ['Entregado', 'Cancelado'].indexOf(f.estado) < 0);
  o.minAtraso = o.atrasado ? Math.floor((ahora - o.etaHasta) / 60000) : 0;
  o.calificacion = f.calificacion === '' ? null : Number(f.calificacion); o.comentario = repS_(f.comentario);
  o.cobroRecibido = o.recibido; o.problemaHora = repMs_(f.problema_hora); o.asignadoPor = repS_(f.asignado_por);
  o.libre = repLibre_(rc, f); o.token = repS_(f.token);
  var sitio = String(cfg.sitio_url || '').replace(/\/+$/, '');
  o.enlace = sitio ? sitio + '/seguimiento.html?t=' + f.token : '';
  return o;
}
var REP_TEXTO_CLIENTE = { Preparando: 'Estamos preparando tu pedido.', Pendiente: 'Tu pedido está listo y saldrá en breve.', Ofrecido: 'Tu pedido está listo y saldrá en breve.',
  Asignado: 'Tu repartidor está por recoger tu pedido.', 'En camino': 'Tu pedido va en camino.', Entregado: '¡Pedido entregado! Buen provecho.', Cancelado: 'Este pedido fue cancelado.' };

/* ---------- API del repartidor ---------- */
function repLimitar_(clave, max, seg) {
  var c = CacheService.getScriptCache(), n = Number(c.get(clave) || 0);
  if (n >= max) return false;
  c.put(clave, String(n + 1), seg);
  return true;
}
function repEstado_(yo, rc) {
  return repConLock_(function () {
    var perfil = repPerfilL_(yo.id, yo.nombre), hp = repHojaPerfil_(), cabP = asegurarColumnas_(hp, COLS_REP_PERFIL), ahora = Date.now();
    if (ahora - repMs_(perfil.visto) > 60000) repEscribir_(hp, cabP, perfil, { visto: new Date(ahora), nombre: yo.nombre });
    var filas = repAvanzarL_(rc), peds = repPedidosDelivery_(), mios = [], ofrecidos = [], libres = [];
    filas.forEach(function (f) {
      var p = peds[String(f.numero)]; if (!p) return;
      if (String(f.repartidor_id) === yo.id && (f.estado === 'Asignado' || f.estado === 'En camino')) mios.push(repVistaRep_(f, p, rc, true));
      else if (f.estado === 'Ofrecido' && String(f.ofrecido_a) === yo.id) ofrecidos.push(repVistaRep_(f, p, rc, false));
      else if (repLibre_(rc, f) && (repLista_(f.rechazados).indexOf(yo.id) < 0 || Number(f.vueltas) >= rc.vueltas)) libres.push(repVistaRep_(f, p, rc, false));
    });
    var activos = repActivos_(filas, yo.id);
    var estadoPerfil = String(perfil.estado) === 'descanso' ? 'descanso' : (filas.some(function (f) { return String(f.repartidor_id) === yo.id && f.estado === 'En camino'; }) ? 'en ruta' : 'disponible');
    return { ok: true, ahora: ahora, perfil: { estado: estadoPerfil, vehiculo: repS_(perfil.vehiculo) }, mios: mios, ofrecidos: ofrecidos,
      libres: activos >= rc.maxActivos ? [] : libres, modo: rc.modo, aceptacionSeg: rc.seg, maxActivos: rc.maxActivos, nombre: yo.nombre };
  });
}
function repAccion_(yo, rc, body) {
  var a = String(body.accion || ''), numero = String(body.numero == null ? '' : body.numero).slice(0, 20);
  var rid = String(body.rid || '').replace(/[^A-Za-z0-9_-]/g, '').slice(0, 40), cache = CacheService.getScriptCache(), ck = rid ? 'rep:rid:' + yo.id + ':' + rid : '';
  if (ck) { var previa = cache.get(ck); if (previa) return JSON.parse(previa); }
  var r = repConLock_(function () {
    var h = repHoja_(), cab = asegurarColumnas_(h, COLS_REPARTO), hp = repHojaPerfil_(), cabP = asegurarColumnas_(hp, COLS_REP_PERFIL);
    var perfil = repPerfilL_(yo.id, yo.nombre), ahora = Date.now();
    if (a === 'disponibilidad') {
      var nuevo = String(body.estado || '');
      if (nuevo !== 'disponible' && nuevo !== 'descanso') throw extError_('Estado no válido.');
      var filasD = repAvanzarL_(rc);
      if (nuevo === 'descanso') {
        if (repActivos_(filasD, yo.id)) throw extError_('Termina tus entregas antes de pasar a descanso.');
        filasD.forEach(function (f) { if (f.estado === 'Ofrecido' && String(f.ofrecido_a) === yo.id) repEscribir_(h, cab, f, { estado: 'Pendiente', ofrecido_a: '', oferta_hasta: '', rechazados: repLista_(f.rechazados).concat([yo.id]).join(',') }); });
      }
      repEscribir_(hp, cabP, perfil, { estado: nuevo, actualizado: new Date(ahora), visto: new Date(ahora) });
      repAvanzarL_(rc); repBumpVersion_();
      return { ok: true };
    }
    var filas = repAvanzarL_(rc), f = filas.filter(function (x) { return String(x.numero) === numero; })[0];
    if (!f) throw extError_('No se encontró ese pedido de delivery.');
    var p = repPedidosDelivery_()[numero];
    if (!p) throw extError_('No se encontró ese pedido de delivery.');
    var mio = String(f.repartidor_id) === yo.id;
    if (f.estado === 'Cancelado') throw extError_('Este pedido fue cancelado.');
    if (a === 'aceptar') {
      if (f.estado === 'Asignado' && mio) return { ok: true, repetido: true };
      var ofrecidoAMi = f.estado === 'Ofrecido' && String(f.ofrecido_a) === yo.id;
      if (f.estado === 'Ofrecido' && !ofrecidoAMi) throw extError_('Este pedido se ofreció a otro repartidor.');
      if (f.estado !== 'Pendiente' && !ofrecidoAMi) throw extError_(f.estado === 'Preparando' ? 'Este pedido aún no está listo.' : 'Este pedido ya lo tomó otro repartidor.');
      if (f.estado === 'Pendiente' && !repLibre_(rc, f)) throw extError_(rc.modo === 'manual' ? 'En este momento el administrador asigna los pedidos.' : 'Espera: el pedido se ofrece por turnos.');
      if (String(perfil.estado) === 'descanso') throw extError_('Estás en descanso. Pasa a disponible para tomar pedidos.');
      if (repActivos_(filas, yo.id) >= rc.maxActivos) throw extError_('Ya llevas el máximo de pedidos a la vez (' + rc.maxActivos + ').');
      repEscribir_(h, cab, f, { estado: 'Asignado', repartidor_id: yo.id, repartidor: yo.nombre, ofrecido_a: '', oferta_hasta: '', asignado: new Date(ahora), asignado_por: 'repartidor' });
      repBumpVersion_();
      return { ok: true };
    }
    if (a === 'rechazar') {
      if (!(f.estado === 'Ofrecido' && String(f.ofrecido_a) === yo.id)) { if (f.estado === 'Pendiente' || f.estado === 'Ofrecido') return { ok: true, repetido: true }; throw extError_('Este pedido ya no está ofrecido a ti.'); }
      repEscribir_(h, cab, f, { estado: 'Pendiente', rechazados: repLista_(f.rechazados).concat([yo.id]).join(','), ofrecido_a: '', oferta_hasta: '' });
      repAvanzarL_(rc); return { ok: true };
    }
    if (a === 'soltar') {
      if (f.estado === 'Pendiente') return { ok: true, repetido: true };
      if (!mio || f.estado !== 'Asignado') throw extError_('Solo puedes soltar un pedido que tienes asignado y aún no sale.');
      repEscribir_(h, cab, f, { estado: 'Pendiente', repartidor_id: '', repartidor: '', asignado: '', rechazados: repLista_(f.rechazados).concat([yo.id]).join(',') });
      repAvanzarL_(rc); return { ok: true };
    }
    if (!mio) throw extError_('Este pedido no está asignado a ti.');
    if (a === 'salir') {
      if (f.estado === 'En camino') return { ok: true, repetido: true };
      if (f.estado !== 'Asignado') throw extError_('Primero toma el pedido.');
      repEstadoPedidoL_(numero, 'En camino', yo.nombre);
      repEscribir_(h, cab, f, { estado: 'En camino', en_camino: new Date(ahora) });
      repEscribir_(hp, cabP, perfil, { estado: 'en ruta', actualizado: new Date(ahora) });
      return { ok: true };
    }
    if (a === 'cobrar') {
      if (f.estado !== 'En camino') throw extError_('Marca "En camino" antes de cobrar.');
      if (repMs_(f.cobro_hora)) return { ok: true, repetido: true, recibido: Number(f.cobro_recibido), vuelto: Number(f.cobro_vuelto) };
      var due = repCobroDe_(p);
      if (body.yaPagado === true) {
        repEscribir_(h, cab, f, { cobro_monto: 0, cobro_recibido: 0, cobro_vuelto: 0, cobro_hora: new Date(ahora) });
        repNotaPedidoL_(numero, 'Repartidor ' + yo.nombre + ': sin cobro (ya estaba pagado)');
        return { ok: true, recibido: 0, vuelto: 0 };
      }
      var rec = num_(body.recibido);
      if (rec === null || rec < 0 || rec > 100000) throw extError_('Escribe cuánto te entregó el cliente.');
      if (rec < due) throw extError_('Lo recibido (S/ ' + rec.toFixed(2) + ') es menos que el total (S/ ' + due.toFixed(2) + ').');
      var vuelto = Math.round((rec - due) * 100) / 100;
      repEscribir_(h, cab, f, { cobro_monto: due, cobro_recibido: Math.round(rec * 100) / 100, cobro_vuelto: vuelto, cobro_hora: new Date(ahora) });
      repNotaPedidoL_(numero, 'Cobro en efectivo S/ ' + due.toFixed(2) + ' (recibido ' + rec.toFixed(2) + ', vuelto ' + vuelto.toFixed(2) + ') por ' + yo.nombre);
      return { ok: true, recibido: rec, vuelto: vuelto };
    }
    if (a === 'entregar') {
      if (f.estado === 'Entregado') return { ok: true, repetido: true };
      if (f.estado !== 'En camino') throw extError_('Marca "En camino" antes de entregar.');
      if (repCobroDe_(p) > 0 && !repMs_(f.cobro_hora)) throw extError_('Registra el cobro antes de marcar como entregado.');
      repEstadoPedidoL_(numero, 'Entregado', yo.nombre);
      repEscribir_(h, cab, f, { estado: 'Entregado', entregado: new Date(ahora) });
      var filas2 = repFilas_();
      if (String(perfil.estado) === 'en ruta' && !filas2.some(function (x) { return String(x.repartidor_id) === yo.id && x.estado === 'En camino'; })) repEscribir_(hp, cabP, perfil, { estado: 'disponible', actualizado: new Date(ahora) });
      return { ok: true };
    }
    if (a === 'problema') {
      if (f.estado !== 'Asignado' && f.estado !== 'En camino') throw extError_('Solo puedes reportar problemas de un pedido que llevas.');
      var tipo = String(body.tipo || ''), nota = texto_(body.nota, 200);
      if (REP_PROBLEMAS.indexOf(tipo) < 0) throw extError_('Elige el tipo de problema.');
      repEscribir_(h, cab, f, { problema: tipo + (nota ? ': ' + nota : ''), problema_hora: new Date(ahora) });
      repNotaPedidoL_(numero, 'Problema de reparto (' + yo.nombre + '): ' + tipo + (nota ? ': ' + nota : ''));
      repBumpVersion_();
      return { ok: true };
    }
    throw extError_('Acción no válida.');
  });
  if (ck && r && r.ok) { try { cache.put(ck, JSON.stringify(r), 600); } catch (e) { /* sin caché */ } }
  return r;
}

/* ---------- seguimiento público y calificación ---------- */
function repBuscarToken_(tk) {
  tk = String(tk == null ? '' : tk).toLowerCase().replace(/[^a-z0-9]/g, '');
  var cache = CacheService.getScriptCache();
  if (Number(cache.get('rep-tk-fallos') || 0) >= 40) throw extError_('Demasiados intentos. Espera unos minutos.');
  var f = tk.length === 20 ? repFilas_().filter(function (x) { return iguales_(String(x.token), tk); })[0] : null;
  if (!f) { cache.put('rep-tk-fallos', String(Number(cache.get('rep-tk-fallos') || 0) + 1), 900); throw extError_('Este enlace de seguimiento no es válido.'); }
  var rc = repCfg_(), ref = repMs_(f.entregado) || repMs_(f.creado);
  if (Date.now() - ref > rc.horas * 3600000) throw extError_('Este enlace de seguimiento ya venció.');
  return f;
}
function repSeguir_(tk) {
  var f = repBuscarToken_(tk), rc = repCfg_(), p = repPedidosDelivery_()[String(f.numero)], ahora = Date.now();
  var estado = f.estado, eta = repMs_(f.eta_hasta);
  var texto = REP_TEXTO_CLIENTE[estado] || '';
  if (estado === 'Preparando' && p && celdaTexto_(p.estado) === 'Nuevo') texto = 'Recibimos tu pedido.';
  if (['Asignado', 'En camino'].indexOf(estado) >= 0 && f.repartidor) texto = (estado === 'En camino' ? 'Tu pedido va en camino con ' : 'Tu repartidor ' ) + repNombrePila_(f.repartidor) + (estado === 'En camino' ? '.' : ' está por recoger tu pedido.');
  var r = { ok: true, nd: p ? (Number(p.num_dia) || p.numero) : f.numero, estado: estado, texto: texto,
    paso: { Preparando: 1, Pendiente: 2, Ofrecido: 2, Asignado: 2, 'En camino': 3, Entregado: 4, Cancelado: 0 }[estado] || 0,
    repartidor: ['Asignado', 'En camino'].indexOf(estado) >= 0 ? repNombrePila_(f.repartidor) : '',
    programado: p ? celdaTexto_(p.programado) : '',
    puedeCalificar: estado === 'Entregado' && !repMs_(f.calificado), calificado: !!repMs_(f.calificado) };
  if (eta && ['Entregado', 'Cancelado'].indexOf(estado) < 0) {
    r.etaMin = Math.max(0, Math.ceil((eta - ahora) / 60000));
    r.etaHora = Utilities.formatDate(new Date(eta), rc.zona, 'HH:mm');
    r.retraso = ahora > eta;
  }
  return r;
}
function repCalificar_(body) {
  var est = Math.floor(Number(body.estrellas)), com = texto_(body.comentario, 300);
  if (!(est >= 1 && est <= 5)) throw extError_('Elige de 1 a 5 estrellas.');
  if (String(body.web || '').trim()) return { ok: true };   // trampa para bots (campo oculto): se ignora en silencio
  return repConLock_(function () {
    var f = repBuscarToken_(body.tk);
    if (f.estado !== 'Entregado') throw extError_('Podrás opinar cuando recibas tu pedido.');
    if (repMs_(f.calificado)) throw extError_('Ya enviaste tu opinión de este pedido. ¡Gracias!');
    var h = repHoja_(), cab = asegurarColumnas_(h, COLS_REPARTO);
    repEscribir_(h, cab, f, { calificacion: est, comentario: com, calificado: new Date() });
    return { ok: true };
  });
}

/* ---------- registro en el despachador ---------- */
EXT_ACCIONES['reparto'] = function (body) {
  var a = String(body.accion || '');
  if (a === 'seguir') return repSeguir_(body.tk);
  if (a === 'calificar') return repCalificar_(body);
  var yo = extPersonal_(body, ['repartidor']), rc = repCfg_();
  if (a === 'estado') return repEstado_(yo, rc);
  if (['aceptar', 'rechazar', 'soltar', 'salir', 'cobrar', 'entregar', 'problema', 'disponibilidad'].indexOf(a) >= 0) return repAccion_(yo, rc, body);
  return { ok: false, error: 'Acción no válida.' };
};
EXT_GET['reparto'] = function (p) { return repSeguir_(p.tk); };

/* ---------- panel de administración (llamadas del panel: sin guion bajo final) ---------- */
function repartoPanel(sesion) {
  exigirAdmin_(sesion);
  var cfg = leerConfig_(), rc = repCfg_(cfg), ahora = Date.now();
  var filas = repConLock_(function () { return repAvanzarL_(rc); }), peds = repPedidosDelivery_(), perfiles = repPerfiles_();
  var hoy = Utilities.formatDate(new Date(), rc.zona, 'yyyy-MM-dd');
  var activas = filas.filter(function (f) { return ['Entregado', 'Cancelado'].indexOf(f.estado) < 0; });
  var lista = activas.map(function (f) { return repVistaAdmin_(f, peds[String(f.numero)], rc, cfg, ahora); })
    .sort(function (a, b) { return a.pedidoTs - b.pedidoTs; });
  var entregadasHoy = filas.filter(function (f) { return f.estado === 'Entregado' && repMs_(f.entregado) && Utilities.formatDate(new Date(repMs_(f.entregado)), rc.zona, 'yyyy-MM-dd') === hoy; });
  var reps = repRepartidores_().map(function (m) {
    var pf = perfiles.filter(function (x) { return String(x.id) === m.id; })[0], mias = filas.filter(function (f) { return String(f.repartidor_id) === m.id; });
    var hoyM = entregadasHoy.filter(function (f) { return String(f.repartidor_id) === m.id; });
    var efectivo = 0; hoyM.forEach(function (f) { efectivo += Number(f.cobro_monto) || 0; });
    var visto = pf ? repMs_(pf.visto) : 0, calis = mias.filter(function (f) { return f.calificacion !== ''; });
    var promedio = calis.length ? Math.round(calis.reduce(function (s, f) { return s + Number(f.calificacion); }, 0) / calis.length * 10) / 10 : null;
    return { id: m.id, nombre: m.nombre, vinculado: !!m.llave, vehiculo: pf ? repS_(pf.vehiculo) : '', estado: pf ? repS_(pf.estado) : 'sin conexión',
      activos: repActivos_(filas, m.id), entregasHoy: hoyM.length, efectivoHoy: Math.round(efectivo * 100) / 100,
      visto: visto, enLinea: !!visto && ahora - visto <= rc.vistoMin * 60000, promedio: promedio, calificaciones: calis.length };
  });
  var opiniones = filas.filter(function (f) { return f.calificacion !== ''; }).slice(-10).reverse().map(function (f) {
    var p = peds[String(f.numero)]; return { nd: p ? (Number(p.num_dia) || p.numero) : f.numero, estrellas: Number(f.calificacion), comentario: repS_(f.comentario), repartidor: repS_(f.repartidor) };
  });
  var cfgVista = {}; REP_CLAVES_CFG.forEach(function (k) { cfgVista[k] = cfg[k] == null ? '' : String(cfg[k]); });
  return { ahora: ahora, filas: lista, repartidores: reps, opiniones: opiniones, config: cfgVista, modo: rc.modo, aceptacionSeg: rc.seg, zonas: rc.zonas.map(function (z) { return z.n; }),
    entregadasHoy: entregadasHoy.length, sitio: String(cfg.sitio_url || '') };
}
/** Asignación manual del administrador (sobrescribe ofertas y asignaciones; un pedido "En camino" no se reasigna). */
function repartoAsignar(sesion, numero, repId) {
  var email = exigirAdmin_(sesion), rc = repCfg_();
  return repConLock_(function () {
    var h = repHoja_(), cab = asegurarColumnas_(h, COLS_REPARTO), filas = repAvanzarL_(rc);
    var f = filas.filter(function (x) { return String(x.numero) === String(numero); })[0];
    if (!f) throw new Error('No se encontró ese pedido de delivery.');
    if (['Pendiente', 'Ofrecido', 'Asignado'].indexOf(f.estado) < 0) throw new Error('Este pedido está "' + f.estado + '": ya no se puede asignar.');
    var m = repRepartidores_().filter(function (x) { return x.id === String(repId); })[0];
    if (!m) throw new Error('Ese repartidor no existe o está desactivado.');
    repEscribir_(h, cab, f, { estado: 'Asignado', repartidor_id: m.id, repartidor: m.nombre, ofrecido_a: '', oferta_hasta: '', asignado: new Date(), asignado_por: email.split('@')[0] });
    repPerfilL_(m.id, m.nombre); repBumpVersion_();
    auditar_(email, 'Reparto: asignar', 'Pedido #' + numero + ' → ' + m.nombre);
    return { ok: true };
  });
}
/** Devuelve el pedido a "Pendiente" (vuelve a ofrecerse según el modo). */
function repartoLiberar(sesion, numero) {
  var email = exigirAdmin_(sesion), rc = repCfg_();
  return repConLock_(function () {
    var h = repHoja_(), cab = asegurarColumnas_(h, COLS_REPARTO), filas = repAvanzarL_(rc);
    var f = filas.filter(function (x) { return String(x.numero) === String(numero); })[0];
    if (!f) throw new Error('No se encontró ese pedido de delivery.');
    if (['Ofrecido', 'Asignado'].indexOf(f.estado) < 0) throw new Error('Este pedido está "' + f.estado + '": no hay nada que liberar.');
    repEscribir_(h, cab, f, { estado: 'Pendiente', repartidor_id: '', repartidor: '', asignado: '', ofrecido_a: '', oferta_hasta: '', rechazados: repLista_(f.rechazados).concat(f.repartidor_id ? [repS_(f.repartidor_id)] : []).join(',') });
    repAvanzarL_(rc); auditar_(email, 'Reparto: liberar', 'Pedido #' + numero);
    return { ok: true };
  });
}
/** Zona, km y/o ETA de un pedido. Si no se da ETA explícito se recalcula con la configuración. */
function repartoAjustar(sesion, numero, o) {
  exigirAdmin_(sesion); o = o || {};
  var rc = repCfg_();
  return repConLock_(function () {
    var h = repHoja_(), cab = asegurarColumnas_(h, COLS_REPARTO), f = repFilas_().filter(function (x) { return String(x.numero) === String(numero); })[0];
    if (!f) throw new Error('No se encontró ese pedido de delivery.');
    if (['Entregado', 'Cancelado'].indexOf(f.estado) >= 0) throw new Error('Este pedido ya terminó.');
    var cambios = {}, p = repPedidosDelivery_()[String(numero)];
    if (o.zona !== undefined) cambios.zona = texto_(o.zona, 40);
    if (o.km !== undefined) { var k = o.km === '' || o.km === null ? '' : num_(o.km); if (k !== '' && (k === null || k < 0 || k > 200)) throw new Error('Distancia no válida (km).'); cambios.km = k; }
    var eta;
    if (o.etaMin !== undefined && o.etaMin !== '' && o.etaMin !== null) { eta = num_(o.etaMin); if (eta === null || eta < 0 || eta > 600) throw new Error('ETA no válido (minutos).'); eta = Math.round(eta); }
    else eta = repEta_(rc, cambios.zona !== undefined ? cambios.zona : repS_(f.zona), cambios.km !== undefined ? cambios.km : f.km);
    cambios.eta_min = eta === null ? '' : eta;
    var base = p && p.fecha instanceof Date ? p.fecha.getTime() : repMs_(f.creado);
    cambios.eta_hasta = eta === null ? '' : new Date(base + eta * 60000);
    repEscribir_(h, cab, f, cambios); repBumpVersion_();
    return { ok: true };
  });
}
function repartoResolver(sesion, numero) {
  exigirAdmin_(sesion);
  return repConLock_(function () {
    var h = repHoja_(), cab = asegurarColumnas_(h, COLS_REPARTO), f = repFilas_().filter(function (x) { return String(x.numero) === String(numero); })[0];
    if (!f) throw new Error('No se encontró ese pedido de delivery.');
    repEscribir_(h, cab, f, { problema: '', problema_hora: '' });
    return { ok: true };
  });
}
function repartoPerfil(sesion, id, vehiculo, estado) {
  exigirAdmin_(sesion);
  var m = repRepartidores_().filter(function (x) { return x.id === String(id); })[0];
  if (!m) throw new Error('Ese repartidor no existe o está desactivado.');
  if (estado && REP_ESTADOS_PERFIL.indexOf(estado) < 0) throw new Error('Estado no válido.');
  return repConLock_(function () {
    var hp = repHojaPerfil_(), cabP = asegurarColumnas_(hp, COLS_REP_PERFIL), pf = repPerfilL_(m.id, m.nombre), c = { nombre: m.nombre, actualizado: new Date() };
    if (vehiculo !== undefined && vehiculo !== null) c.vehiculo = texto_(vehiculo, 40);
    if (estado) c.estado = estado;
    repEscribir_(hp, cabP, pf, c);
    return { ok: true };
  });
}
/** Guarda las claves reparto_* de Config (solo esas, con validación). */
function repartoConfig(sesion, o) {
  var email = exigirAdmin_(sesion); o = o || {};
  var cambios = [];
  REP_CLAVES_CFG.forEach(function (k) {
    if (o[k] === undefined) return;
    var v = texto_(o[k], 400);
    if (k === 'reparto_modo' && v && ['oferta', 'libre', 'manual'].indexOf(v) < 0) throw new Error('Modo no válido.');
    if (['reparto_aceptacion_seg', 'reparto_max_activos', 'reparto_max_vueltas', 'reparto_visto_min', 'reparto_eta_base_min', 'reparto_eta_min_por_km', 'reparto_seguimiento_horas'].indexOf(k) >= 0 && v !== '') {
      var n = num_(v); if (n === null || n < 0 || n > 10000) throw new Error('Número no válido en ' + k + '.');
    }
    if (k === 'reparto_zonas' && v && !repZonas_(v).length) throw new Error('Las zonas se escriben así: Centro=15; Alto Trujillo=30');
    guardarClave_(k, v); cambios.push(k + '=' + v);
  });
  if (cambios.length) auditar_(email, 'Reparto: ajustes', cambios.join(' | ').slice(0, 400));
  return { ok: true };
}
