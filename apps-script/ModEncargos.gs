/* =====================================================================
   PASTA GALLO · ENCARGOS, MAYORISTAS, ENVÍOS Y PRODUCCIÓN  (Config: modulo_encargos = SI)
   Hojas nuevas: Encargos, Mayoristas, Envios. Solo administración (panel).
   - Encargo / catering: cliente, contacto, fecha y hora de entrega, ítems LIBRES con precio acordado, adelanto, saldo
     (= total − adelanto, siempre recalculado en el servidor), estado y notas.
     Estados: Cotizado → Confirmado → En preparación → Listo → Entregado (o Cancelado desde cualquiera que no sea final).
   - Mayoristas: descuento % por cliente y lista de precios propios. No toca los precios públicos de la carta.
     Un ítem cuyo nombre está en la lista del mayorista conserva ese precio (queda fuera del descuento %); el resto recibe el %.
   - Envíos interprovinciales (solo Perú): agencia, guía/clave (texto), destino, costo, estado y seguimiento manual.
   - Producción por día: suma lo prometido (encargos Confirmado/En preparación/Listo + pedidos programados de HOY) por producto
     y, si el dueño cargó recetas, los insumos necesarios frente al stock.
   Usa los helpers inv* de ModInventario.gs.
   ===================================================================== */
extRegistrar_('encargos');

var ENC_H = { enc: 'Encargos', may: 'Mayoristas', env: 'Envios' };
var ENC_COLS = {
  enc: ['id', 'creado', 'tipo', 'cliente', 'contacto', 'mayorista_id', 'entrega_fecha', 'entrega_hora', 'lugar', 'items_json', 'subtotal',
    'descuento_pct', 'total', 'adelanto', 'saldo', 'estado', 'notas', 'creado_por', 'actualizado', 'historial'],
  may: ['id', 'nombre', 'contacto', 'descuento_pct', 'precios_json', 'activo', 'notas'],
  env: ['id', 'creado', 'encargo_id', 'cliente', 'contacto', 'agencia', 'guia', 'clave', 'departamento', 'destino', 'costo', 'estado',
    'seguimiento', 'actualizado', 'historial', 'creado_por']
};
var ENC_TEXTO = {
  enc: ['id', 'tipo', 'cliente', 'contacto', 'mayorista_id', 'entrega_fecha', 'entrega_hora', 'lugar', 'items_json', 'estado', 'notas', 'creado_por', 'historial'],
  may: ['id', 'nombre', 'contacto', 'precios_json', 'activo', 'notas'],
  env: ['id', 'encargo_id', 'cliente', 'contacto', 'agencia', 'guia', 'clave', 'departamento', 'destino', 'estado', 'seguimiento', 'historial', 'creado_por']
};
var ENC_ESTADOS = ['Cotizado', 'Confirmado', 'En preparación', 'Listo', 'Entregado', 'Cancelado'];
var ENC_FINALES = ['Entregado', 'Cancelado'];
var ENC_PRODUCE = ['Confirmado', 'En preparación', 'Listo'];
var ENC_TIPOS = ['Encargo', 'Catering'];
var ENV_ESTADOS = ['Preparando', 'Despachado', 'En tránsito', 'En agencia de destino', 'Entregado', 'Incidencia'];
var ENV_DEPARTAMENTOS = ['Amazonas', 'Áncash', 'Apurímac', 'Arequipa', 'Ayacucho', 'Cajamarca', 'Callao', 'Cusco', 'Huancavelica', 'Huánuco', 'Ica', 'Junín',
  'La Libertad', 'Lambayeque', 'Lima', 'Loreto', 'Madre de Dios', 'Moquegua', 'Pasco', 'Piura', 'Puno', 'San Martín', 'Tacna', 'Tumbes', 'Ucayali'];

/* ---------- utilidades ---------- */
function encUsuario_(sesion) { return invAdmin_(sesion, 'encargos'); }
function encR2_(n) { return Math.round(n * 100) / 100; }
function encHoja_(k) { var h = obtenerHoja_(SpreadsheetApp.getActive(), ENC_H[k], ENC_COLS[k]); asegurarColumnas_(h, ENC_COLS[k]); return h; }
function encFechaOk_(s) {
  var m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(s || '')); if (!m) return false;
  var d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  return d.getFullYear() === Number(m[1]) && d.getMonth() === Number(m[2]) - 1 && d.getDate() === Number(m[3]);
}
function encHoraNorm_(s) {
  s = String(s == null ? '' : s).trim(); if (!s) return '';
  var m = /^(\d{1,2}):(\d{2})$/.exec(s);
  if (!m || Number(m[1]) > 23 || Number(m[2]) > 59) throw extError_('La hora debe ser como 14:30.');
  return ('0' + m[1]).slice(-2) + ':' + m[2];
}
function encContactoOk_(s) {
  s = invTxt_(s, 30);
  if (s && !/^[0-9+\-\s()]{6,30}$/.test(s)) throw extError_('El contacto debe ser un teléfono (solo números, +, espacios o guiones).');
  return s;
}
function encHoy_() { return fmt_(new Date(), 'yyyy-MM-dd'); }
function encTxtCelda_(v) { return v instanceof Date ? fmt_(v, 'yyyy-MM-dd') : String(v == null ? '' : v); }
function encJson_(s, def) { try { var x = JSON.parse(String(s || '')); return x == null ? def : x; } catch (e) { return def; } }

function encSalida_(r) {
  return { id: String(r.id), creado: invFechaTxt_(r.creado), tipo: String(r.tipo || 'Encargo'), cliente: String(r.cliente), contacto: String(r.contacto || ''),
    mayorista_id: String(r.mayorista_id || ''), entrega_fecha: encTxtCelda_(r.entrega_fecha), entrega_hora: encTxtCelda_(r.entrega_hora), lugar: String(r.lugar || ''),
    items: encJson_(r.items_json, []), subtotal: Number(r.subtotal) || 0, descuento_pct: Number(r.descuento_pct) || 0, total: Number(r.total) || 0,
    adelanto: Number(r.adelanto) || 0, saldo: Number(r.saldo) || 0, estado: String(r.estado), notas: String(r.notas || ''), historial: String(r.historial || '') };
}
function encLeer_() { return leerTabla_(ENC_H.enc); }
function encBuscar_(id) { return encLeer_().filter(function (r) { return String(r.id) === String(id); })[0]; }
function encMayoristas_() {
  return leerTabla_(ENC_H.may).map(function (r) {
    var d = num_(r.descuento_pct);
    return { _fila: r._fila, id: String(r.id), nombre: String(r.nombre), contacto: String(r.contacto || ''), descuento_pct: d == null ? 0 : d,
      precios: encJson_(r.precios_json, []), activo: String(r.activo === '' ? 'SI' : r.activo).toUpperCase() !== 'NO', notas: String(r.notas || '') };
  });
}
function encHistorial_(prev, texto, usuario) {
  return (prev ? String(prev) + ' · ' : '') + texto + ' ' + fmt_(new Date(), 'dd/MM HH:mm') + ' (' + usuario + ')';
}
function encProductosIdx_() {
  var porId = {}, porNombre = {};
  leerTabla_(HOJA.productos).forEach(function (p) { porId[String(p.id)] = p; porNombre[invNorm_(p.nombre)] = p; });
  return { porId: porId, porNombre: porNombre };
}

/** Valida y calcula ítems + totales. may = mayorista (o null). Devuelve { items, subtotal, desc, total }. */
function encCalcular_(items, may) {
  if (!Array.isArray(items) || !items.length) throw extError_('Agrega al menos un ítem.');
  if (items.length > 60) throw extError_('Demasiados ítems (máximo 60).');
  var lista = {}; if (may) may.precios.forEach(function (p) { var pr = num_(p && p.precio); if (pr != null && p && p.n) lista[invNorm_(p.n)] = pr; });
  var pidx = encProductosIdx_(), subtotal = 0, conDesc = 0, out = items.map(function (it) {
    var n = invTxt_(it && it.n, 80); if (!n) throw extError_('Un ítem no tiene nombre.');
    var cant = num_(it.cant);
    if (cant == null || cant <= 0 || cant > 9999) throw extError_('La cantidad de "' + n + '" debe ser mayor que 0.');
    cant = encR2_(cant);
    var esp = Object.prototype.hasOwnProperty.call(lista, invNorm_(n)), pr = num_(it.precio);
    if (pr == null) { if (!esp) throw extError_('Falta el precio acordado de "' + n + '".'); pr = lista[invNorm_(n)]; }
    if (pr < 0 || pr > 99999) throw extError_('El precio de "' + n + '" no es válido.');
    pr = encR2_(pr);
    var pid = invTxt_(it.pid, 60);
    if (pid && !pidx.porId[pid]) pid = '';
    if (!pid && pidx.porNombre[invNorm_(n)]) pid = String(pidx.porNombre[invNorm_(n)].id);
    var sub = encR2_(cant * pr); subtotal += sub; if (!esp) conDesc += sub;
    return { n: n, cant: cant, precio: pr, pid: pid, esp: esp };
  });
  var pct = may ? may.descuento_pct : 0, desc = encR2_(conDesc * pct / 100);
  return { items: out, subtotal: encR2_(subtotal), desc: pct, descMonto: desc, total: encR2_(subtotal - desc) };
}

/* ---------- panel: encargos ---------- */
/** opts = { estado: 'activos' (por defecto) | 'todos' | un estado, desde, hasta } */
function encargosListar(sesion, opts) {
  encUsuario_(sesion);
  opts = opts || {};
  var filtro = String(opts.estado || 'activos');
  var rows = encLeer_().map(encSalida_).filter(function (e) {
    if (filtro === 'activos' && ENC_FINALES.indexOf(e.estado) >= 0) return false;
    if (filtro !== 'activos' && filtro !== 'todos' && e.estado !== filtro) return false;
    if (opts.desde && e.entrega_fecha < String(opts.desde)) return false;
    if (opts.hasta && e.entrega_fecha > String(opts.hasta)) return false;
    return true;
  });
  rows.sort(function (a, b) { return (a.entrega_fecha + ' ' + (a.entrega_hora || '99:99')) < (b.entrega_fecha + ' ' + (b.entrega_hora || '99:99')) ? -1 : 1; });
  var prods = leerTabla_(HOJA.productos).map(function (p) { return { id: String(p.id), nombre: String(p.nombre) }; });
  return { encargos: rows.slice(0, 500), mayoristas: encMayoristas_().map(function (m) { delete m._fila; return m; }), productos: prods, hoy: encHoy_(),
    estados: ENC_ESTADOS, tipos: ENC_TIPOS };
}

/** d = { id?, tipo, cliente, contacto, mayorista_id?, entrega_fecha, entrega_hora?, lugar?, items:[{n,cant,precio?,pid?}], adelanto?, notas? } */
function encargoGuardar(sesion, d) {
  var usuario = encUsuario_(sesion);
  d = d || {};
  var cliente = invTxt_(d.cliente, 80); if (!cliente) throw extError_('Escribe el nombre del cliente.');
  var contacto = encContactoOk_(d.contacto);
  var tipo = ENC_TIPOS.indexOf(String(d.tipo)) >= 0 ? String(d.tipo) : 'Encargo';
  var fecha = String(d.entrega_fecha || '').trim();
  if (!encFechaOk_(fecha)) throw extError_('Elige la fecha de entrega.');
  var hora = encHoraNorm_(d.entrega_hora);
  var adelanto = d.adelanto === '' || d.adelanto == null ? 0 : num_(d.adelanto);
  if (adelanto == null || adelanto < 0 || adelanto > 9999999) throw extError_('El adelanto debe ser un número igual o mayor que 0.');
  adelanto = encR2_(adelanto);
  var lock = LockService.getScriptLock(); lock.waitLock(20000);
  try {
    var may = null;
    if (d.mayorista_id) {
      may = encMayoristas_().filter(function (m) { return m.id === String(d.mayorista_id); })[0];
      if (!may) throw extError_('No se encontró el mayorista.');
    }
    var c = encCalcular_(d.items, may);
    if (adelanto > c.total) throw extError_('El adelanto (' + adelanto.toFixed(2) + ') no puede ser mayor que el total (' + c.total.toFixed(2) + ').');
    var h = encHoja_('enc'), cab = asegurarColumnas_(h, ENC_COLS.enc), ahora = new Date();
    var campos = { tipo: tipo, cliente: cliente, contacto: contacto, mayorista_id: may ? may.id : '', entrega_fecha: fecha, entrega_hora: hora,
      lugar: invTxt_(d.lugar, 140), items_json: JSON.stringify(c.items), subtotal: c.subtotal, descuento_pct: c.desc, total: c.total, adelanto: adelanto,
      saldo: encR2_(c.total - adelanto), notas: invTxt_(d.notas, 400), actualizado: ahora };
    if (d.id) {
      var ex = encBuscar_(d.id);
      if (!ex) throw extError_('No se encontró el encargo.');
      if (ENC_FINALES.indexOf(String(ex.estado)) >= 0) throw extError_('Un encargo ' + String(ex.estado).toLowerCase() + ' ya no se puede editar.');
      campos.historial = encHistorial_(ex.historial, 'Editado', usuario);
      invEscribir_(h, cab, campos, ENC_TEXTO.enc, ex._fila);
      return { ok: true, encargo: encSalida_(encBuscar_(d.id)) };
    }
    if (fecha < encHoy_()) throw extError_('La fecha de entrega ya pasó.');
    var id = invSiguienteId_(encLeer_(), 'E');
    campos.id = id; campos.creado = ahora; campos.estado = 'Cotizado'; campos.creado_por = usuario; campos.historial = encHistorial_('', 'Cotizado', usuario);
    invAgregar_(h, cab, campos, ENC_TEXTO.enc);
    return { ok: true, encargo: encSalida_(encBuscar_(id)) };
  } finally { lock.releaseLock(); }
}

/** Cambia el estado. Solo hacia adelante (o Cancelado); Entregado y Cancelado son finales. esperado = estado que veía el panel (opcional). */
function encargoEstado(sesion, id, estado, esperado) {
  var usuario = encUsuario_(sesion);
  estado = String(estado || '');
  if (ENC_ESTADOS.indexOf(estado) < 0) throw extError_('Estado no válido.');
  var lock = LockService.getScriptLock(); lock.waitLock(20000);
  try {
    var ex = encBuscar_(id); if (!ex) throw extError_('No se encontró el encargo.');
    var actual = String(ex.estado);
    if (esperado && String(esperado) !== actual) throw extError_('El encargo ya estaba en "' + actual + '" (otro equipo lo cambió).');
    if (actual === estado) return { ok: true, encargo: encSalida_(ex) };
    if (ENC_FINALES.indexOf(actual) >= 0) throw extError_('Un encargo ' + actual.toLowerCase() + ' ya no cambia de estado.');
    if (estado !== 'Cancelado' && ENC_ESTADOS.indexOf(estado) < ENC_ESTADOS.indexOf(actual)) throw extError_('No se puede volver a "' + estado + '".');
    var h = encHoja_('enc'), cab = asegurarColumnas_(h, ENC_COLS.enc);
    invEscribir_(h, cab, { estado: estado, actualizado: new Date(), historial: encHistorial_(ex.historial, estado, usuario) }, ENC_TEXTO.enc, ex._fila);
    var sal = encSalida_(encBuscar_(id));
    return { ok: true, encargo: sal, aviso: estado === 'Entregado' && sal.saldo > 0 ? 'Entregado con saldo pendiente de S/ ' + sal.saldo.toFixed(2) + '.' : '' };
  } finally { lock.releaseLock(); }
}

/** Suma un pago al adelanto (nunca más que el total). */
function encargoPago(sesion, id, monto) {
  var usuario = encUsuario_(sesion);
  var m = num_(monto);
  if (m == null || m <= 0 || m > 9999999) throw extError_('El monto debe ser mayor que 0.');
  var lock = LockService.getScriptLock(); lock.waitLock(20000);
  try {
    var ex = encBuscar_(id); if (!ex) throw extError_('No se encontró el encargo.');
    if (String(ex.estado) === 'Cancelado') throw extError_('El encargo está cancelado.');
    var total = Number(ex.total) || 0, nuevo = encR2_((Number(ex.adelanto) || 0) + m);
    if (nuevo > total + 0.001) throw extError_('El pago supera el saldo (' + encR2_(total - (Number(ex.adelanto) || 0)).toFixed(2) + ').');
    var h = encHoja_('enc'), cab = asegurarColumnas_(h, ENC_COLS.enc);
    invEscribir_(h, cab, { adelanto: nuevo, saldo: encR2_(total - nuevo), actualizado: new Date(), historial: encHistorial_(ex.historial, 'Pago S/ ' + encR2_(m).toFixed(2), usuario) }, ENC_TEXTO.enc, ex._fila);
    return { ok: true, encargo: encSalida_(encBuscar_(id)) };
  } finally { lock.releaseLock(); }
}

/* ---------- panel: mayoristas ---------- */
/** d = { id?, nombre, contacto, descuento_pct, precios:[{n,precio}], activo, notas } */
function mayoristaGuardar(sesion, d) {
  encUsuario_(sesion);
  d = d || {};
  var nombre = invTxt_(d.nombre, 80); if (!nombre) throw extError_('Escribe el nombre del cliente mayorista.');
  var pct = d.descuento_pct === '' || d.descuento_pct == null ? 0 : num_(d.descuento_pct);
  if (pct == null || pct < 0 || pct > 100) throw extError_('El descuento debe estar entre 0 y 100.');
  var precios = Array.isArray(d.precios) ? d.precios : [];
  if (precios.length > 100) throw extError_('Demasiados precios (máximo 100).');
  var vistos = {}, lista = precios.filter(function (p) { return p && (invTxt_(p.n, 80) || p.precio !== '' && p.precio != null); }).map(function (p) {
    var n = invTxt_(p.n, 80), pr = num_(p.precio);
    if (!n) throw extError_('Un precio no tiene producto.');
    if (pr == null || pr < 0 || pr > 99999) throw extError_('El precio de "' + n + '" no es válido.');
    if (vistos[invNorm_(n)]) throw extError_('"' + n + '" está repetido en la lista de precios.');
    vistos[invNorm_(n)] = true; return { n: n, precio: encR2_(pr) };
  });
  var activo = String(d.activo).toUpperCase() === 'NO' || d.activo === false ? 'NO' : 'SI';
  var lock = LockService.getScriptLock(); lock.waitLock(20000);
  try {
    var h = encHoja_('may'), cab = asegurarColumnas_(h, ENC_COLS.may), todos = encMayoristas_();
    var dup = todos.filter(function (m) { return invNorm_(m.nombre) === invNorm_(nombre) && m.id !== String(d.id || ''); });
    if (dup.length) throw extError_('Ya existe un mayorista llamado "' + dup[0].nombre + '".');
    var campos = { nombre: nombre, contacto: encContactoOk_(d.contacto), descuento_pct: pct, precios_json: JSON.stringify(lista), activo: activo, notas: invTxt_(d.notas, 300) };
    if (d.id) {
      var ex = todos.filter(function (m) { return m.id === String(d.id); })[0];
      if (!ex) throw extError_('No se encontró el mayorista.');
      invEscribir_(h, cab, campos, ENC_TEXTO.may, ex._fila);
      return { ok: true, id: ex.id };
    }
    campos.id = invSiguienteId_(todos, 'M');
    invAgregar_(h, cab, campos, ENC_TEXTO.may);
    return { ok: true, id: campos.id };
  } finally { lock.releaseLock(); }
}

/* ---------- panel: envíos interprovinciales (Perú, seguimiento manual) ---------- */
function envioSalida_(r) {
  return { id: String(r.id), creado: invFechaTxt_(r.creado), encargo_id: String(r.encargo_id || ''), cliente: String(r.cliente), contacto: String(r.contacto || ''),
    agencia: String(r.agencia), guia: String(r.guia || ''), clave: String(r.clave || ''), departamento: String(r.departamento), destino: String(r.destino || ''),
    costo: num_(r.costo) == null ? 0 : num_(r.costo), estado: String(r.estado), seguimiento: String(r.seguimiento || ''), historial: String(r.historial || '') };
}
function enviosListar(sesion) {
  encUsuario_(sesion);
  var rows = leerTabla_(ENC_H.env).map(envioSalida_).reverse().slice(0, 300);
  return { envios: rows, estados: ENV_ESTADOS, departamentos: ENV_DEPARTAMENTOS };
}
/** d = { id?, encargo_id?, cliente, contacto, agencia, guia, clave, departamento, destino, costo, estado?, seguimiento? } */
function envioGuardar(sesion, d) {
  var usuario = encUsuario_(sesion);
  d = d || {};
  var cliente = invTxt_(d.cliente, 80), agencia = invTxt_(d.agencia, 60), destino = invTxt_(d.destino, 120);
  if (!cliente) throw extError_('Escribe el nombre de quien recibe.');
  if (!agencia) throw extError_('Escribe la agencia (Olva, Shalom, Marvisur...).');
  var dep = ENV_DEPARTAMENTOS.filter(function (x) { return invNorm_(x) === invNorm_(d.departamento); })[0];
  if (!dep) throw extError_('Elige el departamento de destino (solo envíos dentro del Perú).');
  if (!destino) throw extError_('Escribe la ciudad o agencia de destino.');
  var costo = d.costo === '' || d.costo == null ? 0 : num_(d.costo);
  if (costo == null || costo < 0 || costo > 99999) throw extError_('El costo debe ser un número igual o mayor que 0.');
  var estado = d.estado ? String(d.estado) : '';
  if (estado && ENV_ESTADOS.indexOf(estado) < 0) throw extError_('Estado de envío no válido.');
  var encId = invTxt_(d.encargo_id, 20);
  var lock = LockService.getScriptLock(); lock.waitLock(20000);
  try {
    if (encId && !encBuscar_(encId)) throw extError_('No se encontró el encargo vinculado.');
    var h = encHoja_('env'), cab = asegurarColumnas_(h, ENC_COLS.env), todos = leerTabla_(ENC_H.env);
    var campos = { encargo_id: encId, cliente: cliente, contacto: encContactoOk_(d.contacto), agencia: agencia, guia: invTxt_(d.guia, 40), clave: invTxt_(d.clave, 40),
      departamento: dep, destino: destino, costo: encR2_(costo), seguimiento: invTxt_(d.seguimiento, 300), actualizado: new Date() };
    if (d.id) {
      var ex = todos.filter(function (r) { return String(r.id) === String(d.id); })[0];
      if (!ex) throw extError_('No se encontró el envío.');
      if (estado && estado !== String(ex.estado)) { campos.estado = estado; campos.historial = encHistorial_(ex.historial, estado, usuario); }
      invEscribir_(h, cab, campos, ENC_TEXTO.env, ex._fila);
      return { ok: true, envio: envioSalida_(leerTabla_(ENC_H.env).filter(function (r) { return String(r.id) === String(d.id); })[0]) };
    }
    var id = invSiguienteId_(todos, 'V');
    campos.id = id; campos.creado = new Date(); campos.estado = estado || 'Preparando'; campos.creado_por = usuario; campos.historial = encHistorial_('', campos.estado, usuario);
    invAgregar_(h, cab, campos, ENC_TEXTO.env);
    return { ok: true, envio: envioSalida_(leerTabla_(ENC_H.env).filter(function (r) { return String(r.id) === id; })[0]) };
  } finally { lock.releaseLock(); }
}

/* ---------- panel: programación de producción ---------- */
/** Suma lo prometido para una fecha (yyyy-MM-dd): encargos Confirmado/En preparación/Listo + pedidos programados de hoy. */
function produccionDia(sesion, fecha) {
  encUsuario_(sesion);
  fecha = String(fecha || encHoy_());
  if (!encFechaOk_(fecha)) throw extError_('Fecha no válida.');
  var tot = {}, orden = [], sinConfirmar = 0, necesidad = {}, idx = invIndiceRecetas_(), pidx = encProductosIdx_();
  function sumar(etiqueta, cant, fuente, pid, tam) {
    var k = invNorm_(etiqueta);
    if (!tot[k]) { tot[k] = { nombre: etiqueta, cantidad: 0, fuentes: [] }; orden.push(k); }
    tot[k].cantidad = encR2_(tot[k].cantidad + cant);
    if (tot[k].fuentes.indexOf(fuente) < 0) tot[k].fuentes.push(fuente);
    if (pid) invRecetaDe_(idx, pid, tam).forEach(function (r) { necesidad[r.insumo_id] = (necesidad[r.insumo_id] || 0) + r.cantidad * cant; });
  }
  var nEnc = 0;
  encLeer_().forEach(function (r) {
    if (encTxtCelda_(r.entrega_fecha) !== fecha) return;
    var est = String(r.estado);
    if (est === 'Cotizado') { sinConfirmar++; return; }
    if (ENC_PRODUCE.indexOf(est) < 0) return;
    nEnc++;
    encJson_(r.items_json, []).forEach(function (it) { sumar(String(it.n), Number(it.cant) || 0, 'Encargo ' + r.id, it.pid, ''); });
  });
  var nPed = 0;
  if (fecha === encHoy_()) {
    pedidosRecientes_().forEach(function (p) {
      if (!(p.fecha instanceof Date) || fmt_(p.fecha, 'yyyy-MM-dd') !== fecha || !String(p.programado || '').replace(/'/g, '').trim()) return;
      if (['Nuevo', 'Confirmado', 'En preparación', 'Listo'].indexOf(String(p.estado)) < 0) return;
      nPed++;
      encJson_(p.items_json, []).forEach(function (l) {
        var et = String(l.nombre) + (l.tam ? ' (' + l.tam + ')' : '');
        sumar(et, Number(l.cant) || 0, 'Pedido #' + p.numero, l.id, l.tam);
      });
    });
  }
  var insumos = {}; invLeerInsumos_().forEach(function (i) { insumos[i.id] = i; });
  return { fecha: fecha, encargos: nEnc, pedidosProgramados: nPed, sinConfirmar: sinConfirmar,
    productos: orden.map(function (k) { return tot[k]; }).sort(function (a, b) { return a.nombre < b.nombre ? -1 : 1; }),
    insumos: Object.keys(necesidad).filter(function (i) { return insumos[i]; }).map(function (i) {
      var n = invR_(necesidad[i]); return { id: i, nombre: insumos[i].nombre, unidad: insumos[i].unidad, necesario: n, stock: insumos[i].stock, falta: invR_(Math.max(0, n - insumos[i].stock)) };
    }) };
}
