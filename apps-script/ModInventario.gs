/* =====================================================================
   PASTA GALLO · MÓDULO INVENTARIO E INSUMOS  (Config: modulo_inventario = SI)
   Hojas nuevas: Insumos, Recetas, Movimientos. Solo administración (panel); el personal con enlace
   (cocina/cajero) únicamente puede LEER las alertas de stock bajo.
   - Stock = columna "stock" de Insumos; cada cambio queda en Movimientos (entrada, salida, merma, ajuste)
     con motivo, usuario, fecha y saldo resultante. El stock puede quedar NEGATIVO: solo se avisa, nunca se bloquea.
   - Descuento automático al confirmarse un pedido: bandera Config inventario_descuento_auto (SI/NO, apagada por defecto).
     Idempotente por número de pedido e insumo (clave "ped:<n>:<insumo>"). Si un pedido se cancela después,
     se devuelve lo descontado ("rev:<n>:<insumo>"). Solo cuentan pedidos creados desde que se encendió la bandera.
     Las RECETAS las carga el dueño en la hoja/pantalla Recetas: aquí no hay ninguna inventada.
   - Los helpers inv* (invEscribir_, invTxt_...) también los usa ModEncargos.gs.
   ===================================================================== */
extRegistrar_('inventario');

var INV_H = { insumos: 'Insumos', recetas: 'Recetas', movs: 'Movimientos' };
var INV_COLS = {
  insumos: ['id', 'nombre', 'unidad', 'stock', 'minimo', 'costo', 'activo', 'notas', 'actualizado'],
  recetas: ['producto_id', 'producto', 'tamano', 'insumo_id', 'cantidad', 'notas'],
  movs: ['id', 'fecha', 'insumo_id', 'insumo', 'tipo', 'cantidad', 'saldo', 'motivo', 'usuario', 'ref']
};
var INV_TEXTO = { insumos: ['id', 'nombre', 'unidad', 'activo', 'notas'], recetas: ['producto_id', 'producto', 'tamano', 'insumo_id', 'notas'],
  movs: ['id', 'insumo_id', 'insumo', 'tipo', 'motivo', 'usuario', 'ref'] };
var INV_TIPOS = ['entrada', 'salida', 'merma', 'ajuste'];
var INV_ESTADOS_CONFIRMADO = ['Confirmado', 'En preparación', 'Listo', 'En camino', 'Entregado'];

/* ---------- utilidades (compartidas con ModEncargos.gs) ---------- */
function invTxt_(v, max) { return String(v == null ? '' : v).replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, max || 100); }
function invR_(n) { return Math.round(n * 10000) / 10000; }
function invNorm_(s) { return String(s == null ? '' : s).toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/\s+/g, ' ').trim(); }
function invHoja_(clave) {
  var h = obtenerHoja_(SpreadsheetApp.getActive(), INV_H[clave], INV_COLS[clave]);
  asegurarColumnas_(h, INV_COLS[clave]);
  return h;
}
/** Añade una fila (primero el id —texto con letra—, luego el resto celda a celda). Las columnas de texto se guardan con formato '@'
 *  (teléfonos, guías, claves, fechas): Sheets no las convierte en números ni interpreta fórmulas. Devuelve el número de fila. */
function invAgregar_(h, cab, obj, textoCols) {
  var idc = cab[0];
  h.appendRow([obj[idc]]);
  var fila = h.getLastRow();
  h.getRange(fila, 1).setNumberFormat('@').setValue(obj[idc]);
  invEscribir_(h, cab, obj, textoCols, fila, true);
  return fila;
}
/** Escribe solo las claves presentes en obj en la fila indicada. */
function invEscribir_(h, cab, obj, textoCols, fila, omitirPrimera) {
  cab.forEach(function (c, j) {
    if (omitirPrimera && j === 0) return;
    if (!Object.prototype.hasOwnProperty.call(obj, c)) return;
    var cel = h.getRange(fila, j + 1);
    if (textoCols.indexOf(c) >= 0) cel.setNumberFormat('@');
    cel.setValue(obj[c] == null ? '' : obj[c]);
  });
}
function invSiguienteId_(filas, prefijo) {
  var max = 0, re = new RegExp('^' + prefijo + '(\\d+)$');
  filas.forEach(function (r) { var m = re.exec(String(r.id)); if (m && Number(m[1]) > max) max = Number(m[1]); });
  return prefijo + (max + 1);
}
/** Exige administrador Y módulo encendido (los paneles llaman a estas funciones directo, sin pasar por el despachador). */
function invAdmin_(sesion, modulo) {
  var email = exigirAdmin_(sesion);
  if (!moduloActivo_(null, modulo || 'inventario')) throw extError_('Este módulo no está activo.');
  return String(email || '').split('@')[0].slice(0, 40) || 'admin';
}
function invUsuario_(sesion) { return invAdmin_(sesion, 'inventario'); }
function invFechaTxt_(d) { return d instanceof Date ? fmt_(d, 'yyyy-MM-dd HH:mm') : String(d || ''); }

function invEstadoStock_(stock, minimo) {
  if (stock < 0) return 'negativo';
  if (minimo > 0 && stock <= minimo) return 'bajo';
  return 'ok';
}
function invLeerInsumos_() {
  return leerTabla_(INV_H.insumos).map(function (r) {
    var st = num_(r.stock), mi = num_(r.minimo), co = num_(r.costo);
    st = st == null ? 0 : st; mi = mi == null ? 0 : mi;
    return { _fila: r._fila, id: String(r.id), nombre: String(r.nombre), unidad: String(r.unidad), stock: st, minimo: mi, costo: co,
      activo: String(r.activo === '' ? 'SI' : r.activo).toUpperCase() !== 'NO', notas: String(r.notas || ''),
      actualizado: invFechaTxt_(r.actualizado), estado: invEstadoStock_(st, mi) };
  });
}
function invAlertas_() {
  return invLeerInsumos_().filter(function (i) { return i.activo && i.estado !== 'ok'; })
    .map(function (i) { return { id: i.id, nombre: i.nombre, unidad: i.unidad, stock: i.stock, minimo: i.minimo, estado: i.estado }; });
}

/** Movimiento de stock. NO toma el bloqueo: quien lo llama ya lo tiene. Idempotente si ref ya existe (refs = mapa de claves vistas). */
function invMover_(ins, tipo, cantidad, motivo, usuario, ref, refs) {
  if (ref && refs && Object.prototype.hasOwnProperty.call(refs, ref)) return { duplicado: true };
  var delta = tipo === 'entrada' ? cantidad : (tipo === 'ajuste' ? cantidad : -cantidad);   // en "ajuste" la cantidad ya viene con signo
  var nuevo = invR_(ins.stock + delta), ahora = new Date();
  var hi = invHoja_('insumos'), cabI = asegurarColumnas_(hi, INV_COLS.insumos);
  invEscribir_(hi, cabI, { stock: nuevo, actualizado: ahora }, INV_TEXTO.insumos, ins._fila);
  var hm = invHoja_('movs'), cabM = asegurarColumnas_(hm, INV_COLS.movs);
  var mov = { id: 'M' + (hm.getLastRow() + 1), fecha: ahora, insumo_id: ins.id, insumo: ins.nombre, tipo: tipo, cantidad: invR_(delta), saldo: nuevo,
    motivo: invTxt_(motivo, 160), usuario: invTxt_(usuario, 40), ref: ref || '' };
  invAgregar_(hm, cabM, mov, INV_TEXTO.movs);
  if (ref && refs) refs[ref] = invR_(delta);
  ins.stock = nuevo; ins.estado = invEstadoStock_(nuevo, ins.minimo);
  return { duplicado: false, delta: invR_(delta), saldo: nuevo, estado: ins.estado };
}
/** Mapa ref -> cantidad (con signo) de los movimientos que tienen clave de idempotencia. */
function invMapaRefs_() {
  var h = SpreadsheetApp.getActive().getSheetByName(INV_H.movs), mapa = {};
  if (!h || h.getLastRow() < 2) return mapa;
  var cab = h.getRange(1, 1, 1, h.getLastColumn()).getValues()[0].map(String), cR = cab.indexOf('ref') + 1, cC = cab.indexOf('cantidad') + 1;
  if (!cR || !cC) return mapa;
  var n = h.getLastRow() - 1, refs = h.getRange(2, cR, n, 1).getValues(), cants = h.getRange(2, cC, n, 1).getValues();
  for (var i = 0; i < n; i++) if (refs[i][0] !== '') mapa[String(refs[i][0])] = Number(cants[i][0]) || 0;
  return mapa;
}

/* ---------- recetas ---------- */
function invIndiceRecetas_() {
  var idx = {};
  leerTabla_(INV_H.recetas).forEach(function (r) {
    var c = num_(r.cantidad); if (c == null || c <= 0) return;
    var k = String(r.producto_id) + '|' + String(r.tamano || '');
    (idx[k] = idx[k] || []).push({ insumo_id: String(r.insumo_id), cantidad: c });
  });
  return idx;
}
function invRecetaDe_(idx, pid, tam) {
  return idx[String(pid) + '|' + String(tam || '')] || idx[String(pid) + '|'] || [];
}

/* ---------- descuento automático (idempotente, nunca bloquea una venta) ---------- */
/** Revisa los pedidos recientes: descuenta los confirmados y devuelve los cancelados. Devuelve un resumen; NUNCA lanza error. */
function invProcesarPedidos_(soloNumero) {
  var res = { activo: false, descontados: 0, devueltos: 0, movimientos: 0, alertas: [] };
  try {
    var cfg = leerConfig_();
    if (!moduloActivo_(cfg, 'inventario') || !esSi_(cfg.inventario_descuento_auto)) return res;
    res.activo = true;
    var props = PropertiesService.getScriptProperties(), desde = Number(props.getProperty('INV_DESDE') || 0);
    if (!desde) { desde = Date.now(); props.setProperty('INV_DESDE', String(desde)); }
    var lock = LockService.getScriptLock();
    lock.waitLock(20000);
    try {
      var idx = invIndiceRecetas_(), refs = invMapaRefs_(), tocados = {};
      var insumos = {}; invLeerInsumos_().forEach(function (i) { insumos[i.id] = i; });
      pedidosRecientes_().forEach(function (p) {
        try {
          if (soloNumero != null && String(p.numero) !== String(soloNumero)) return;
          if (!(p.fecha instanceof Date) || p.fecha.getTime() < desde) return;
          var est = String(p.estado), conf = INV_ESTADOS_CONFIRMADO.indexOf(est) >= 0, canc = est === 'Cancelado';
          if (!conf && !canc) return;
          var lineas = []; try { lineas = JSON.parse(String(p.items_json || '[]')); } catch (e) { lineas = []; }
          var necesita = {};
          lineas.forEach(function (l) {
            var cant = Number(l && l.cant) || 0; if (cant <= 0) return;
            invRecetaDe_(idx, l.id, l.tam).forEach(function (r) { necesita[r.insumo_id] = (necesita[r.insumo_id] || 0) + r.cantidad * cant; });
          });
          Object.keys(necesita).forEach(function (iid) {
            var ins = insumos[iid]; if (!ins) return;
            var kDesc = 'ped:' + p.numero + ':' + iid, kRev = 'rev:' + p.numero + ':' + iid;
            if (conf) {
              var r = invMover_(ins, 'salida', invR_(necesita[iid]), 'Pedido #' + p.numero + ' (automático)', 'auto', kDesc, refs);
              if (!r.duplicado) { res.movimientos++; tocados[iid] = true; }
            } else if (canc && Object.prototype.hasOwnProperty.call(refs, kDesc) && !Object.prototype.hasOwnProperty.call(refs, kRev)) {
              var back = invMover_(ins, 'entrada', invR_(Math.abs(refs[kDesc])), 'Pedido #' + p.numero + ' cancelado (se devuelve)', 'auto', kRev, refs);
              if (!back.duplicado) { res.movimientos++; res.devueltos++; tocados[iid] = true; }
            }
          });
          if (conf && Object.keys(necesita).length) res.descontados++;
        } catch (e) { console.error('inventario pedido', e); }
      });
      Object.keys(tocados).forEach(function (iid) { var i = insumos[iid]; if (i && i.estado !== 'ok') res.alertas.push({ id: i.id, nombre: i.nombre, unidad: i.unidad, stock: i.stock, minimo: i.minimo, estado: i.estado }); });
    } finally { lock.releaseLock(); }
  } catch (e) { console.error('inventario descuento', e); }
  return res;
}
/** Para quien confirme pedidos en otro lugar del sistema: invAlConfirmarPedido_(numero) descuenta ese pedido (idempotente, no lanza error). */
function invAlConfirmarPedido_(numero) { return invProcesarPedidos_(numero); }

/* ---------- servidor: acciones por enlace del equipo (solo lectura) ---------- */
EXT_ACCIONES['inventario'] = function (body) {
  extPersonal_(body, ['cocina', 'cajero']);
  if (String(body.accion) === 'alertas') return { ok: true, alertas: invAlertas_() };
  throw extError_('Acción no válida.');
};

/* ---------- funciones del panel (solo administración) ---------- */
function inventarioListar(sesion) {
  invAdmin_(sesion);
  var proc = invProcesarPedidos_();
  var cfg = leerConfig_(), ins = invLeerInsumos_();
  return { insumos: ins.map(function (i) { delete i._fila; return i; }), alertas: ins.filter(function (i) { return i.activo && i.estado !== 'ok'; }).length,
    descuentoAuto: esSi_(cfg.inventario_descuento_auto), proceso: proc, movimientos: inventarioUltimos_(40) };
}
function inventarioUltimos_(n, insumoId) {
  var filas = leerTabla_(INV_H.movs);
  if (insumoId) filas = filas.filter(function (m) { return String(m.insumo_id) === String(insumoId); });
  return filas.slice(-n).reverse().map(function (m) {
    return { id: String(m.id), fecha: invFechaTxt_(m.fecha), insumo_id: String(m.insumo_id), insumo: String(m.insumo), tipo: String(m.tipo),
      cantidad: Number(m.cantidad) || 0, saldo: Number(m.saldo) || 0, motivo: String(m.motivo || ''), usuario: String(m.usuario || '') };
  });
}
function inventarioMovimientos(sesion, insumoId) { invAdmin_(sesion); return inventarioUltimos_(100, insumoId); }

function inventarioGuardarInsumo(sesion, d) {
  var usuario = invUsuario_(sesion);
  d = d || {};
  var nombre = invTxt_(d.nombre, 80), unidad = invTxt_(d.unidad, 12);
  if (!nombre) throw extError_('Escribe el nombre del insumo.');
  if (!unidad) throw extError_('Escribe la unidad (kg, g, L, ml, unid...).');
  var minimo = d.minimo === '' || d.minimo == null ? 0 : num_(d.minimo);
  if (minimo == null || minimo < 0 || minimo > 1000000) throw extError_('El mínimo debe ser un número igual o mayor que 0.');
  var costo = d.costo === '' || d.costo == null ? '' : num_(d.costo);
  if (costo !== '' && (costo == null || costo < 0 || costo > 1000000)) throw extError_('El costo debe ser un número igual o mayor que 0 (o déjalo vacío).');
  var activo = String(d.activo).toUpperCase() === 'NO' || d.activo === false ? 'NO' : 'SI';
  var lock = LockService.getScriptLock(); lock.waitLock(20000);
  try {
    var h = invHoja_('insumos'), cab = asegurarColumnas_(h, INV_COLS.insumos), todos = invLeerInsumos_();
    var dup = todos.filter(function (i) { return invNorm_(i.nombre) === invNorm_(nombre) && i.id !== String(d.id || ''); });
    if (dup.length) throw extError_('Ya existe un insumo llamado "' + dup[0].nombre + '".');
    if (d.id) {
      var ex = todos.filter(function (i) { return i.id === String(d.id); })[0];
      if (!ex) throw extError_('No se encontró el insumo.');
      invEscribir_(h, cab, { nombre: nombre, unidad: unidad, minimo: minimo, costo: costo, activo: activo, notas: invTxt_(d.notas, 200), actualizado: new Date() }, INV_TEXTO.insumos, ex._fila);
      return { ok: true, id: ex.id };
    }
    var stock0 = d.stock === '' || d.stock == null ? 0 : num_(d.stock);
    if (stock0 == null || stock0 < 0 || stock0 > 100000000) throw extError_('El stock inicial debe ser un número igual o mayor que 0.');
    var id = invSiguienteId_(todos, 'I');
    invAgregar_(h, cab, { id: id, nombre: nombre, unidad: unidad, stock: 0, minimo: minimo, costo: costo, activo: activo, notas: invTxt_(d.notas, 200), actualizado: new Date() }, INV_TEXTO.insumos);
    if (stock0 > 0) {
      var ins = invLeerInsumos_().filter(function (i) { return i.id === id; })[0];
      invMover_(ins, 'entrada', stock0, 'Stock inicial', usuario, '', null);
    }
    return { ok: true, id: id };
  } finally { lock.releaseLock(); }
}

/** d = { insumo_id, tipo: entrada|salida|merma|ajuste, cantidad, motivo }. En "ajuste", cantidad = lo CONTADO (stock real). */
function inventarioMovimiento(sesion, d) {
  var usuario = invUsuario_(sesion);
  d = d || {};
  var tipo = String(d.tipo || '').toLowerCase();
  if (INV_TIPOS.indexOf(tipo) < 0) throw extError_('Tipo de movimiento no válido.');
  var cant = num_(d.cantidad);
  if (cant == null || cant > 100000000 || (tipo === 'ajuste' ? cant < 0 : cant <= 0)) throw extError_(tipo === 'ajuste' ? 'Escribe lo que contaste (0 o más).' : 'La cantidad debe ser mayor que 0.');
  var motivo = invTxt_(d.motivo, 160);
  if ((tipo === 'merma' || tipo === 'ajuste') && !motivo) throw extError_('Escribe el motivo (' + tipo + ').');
  var lock = LockService.getScriptLock(); lock.waitLock(20000);
  try {
    var ins = invLeerInsumos_().filter(function (i) { return i.id === String(d.insumo_id); })[0];
    if (!ins) throw extError_('No se encontró el insumo.');
    var valor = tipo === 'ajuste' ? invR_(cant - ins.stock) : cant;
    if (tipo === 'ajuste' && valor === 0) return { ok: true, sinCambio: true, saldo: ins.stock, estado: ins.estado, nombre: ins.nombre, unidad: ins.unidad };
    var r = invMover_(ins, tipo, valor, motivo, usuario, '', null);
    var alerta = ins.estado === 'negativo' ? 'Stock NEGATIVO en ' + ins.nombre + ': revisa el conteo.' : (ins.estado === 'bajo' ? 'Stock bajo en ' + ins.nombre + ' (mínimo ' + ins.minimo + ' ' + ins.unidad + ').' : '');
    return { ok: true, delta: r.delta, saldo: r.saldo, estado: r.estado, alerta: alerta, nombre: ins.nombre, unidad: ins.unidad };
  } finally { lock.releaseLock(); }
}

/* ---------- recetas (las carga el dueño) ---------- */
function inventarioRecetas(sesion) {
  invAdmin_(sesion);
  var prods = leerTabla_(HOJA.productos).filter(function (p) { return String(p.id) !== ''; }).map(function (p) {
    var tams = []; try { tams = parsearTamanos_(p.tamanos).map(function (t) { return String(t[0]); }); } catch (e) { tams = []; }
    return { id: String(p.id), nombre: String(p.nombre), tamanos: tams };
  });
  var recetas = {};
  leerTabla_(INV_H.recetas).forEach(function (r) {
    var k = String(r.producto_id) + '|' + String(r.tamano || '');
    (recetas[k] = recetas[k] || { producto_id: String(r.producto_id), tamano: String(r.tamano || ''), lineas: [] }).lineas.push({ insumo_id: String(r.insumo_id), cantidad: num_(r.cantidad) || 0 });
  });
  return { productos: prods, recetas: Object.keys(recetas).map(function (k) { return recetas[k]; }),
    insumos: invLeerInsumos_().filter(function (i) { return i.activo; }).map(function (i) { return { id: i.id, nombre: i.nombre, unidad: i.unidad }; }) };
}
/** d = { producto_id, tamano, lineas: [{insumo_id, cantidad}] }. Reemplaza la receta de ese producto/tamaño; lineas vacío = borrar receta. */
function inventarioGuardarReceta(sesion, d) {
  invUsuario_(sesion);
  d = d || {};
  var pid = invTxt_(d.producto_id, 60), tam = invTxt_(d.tamano, 40);
  var prod = leerTabla_(HOJA.productos).filter(function (p) { return String(p.id) === pid; })[0];
  if (!prod) throw extError_('Elige un producto de la carta.');
  var lineas = Array.isArray(d.lineas) ? d.lineas : [];
  if (lineas.length > 40) throw extError_('Demasiados insumos en una receta (máximo 40).');
  var lock = LockService.getScriptLock(); lock.waitLock(20000);
  try {
    var insumos = {}; invLeerInsumos_().forEach(function (i) { insumos[i.id] = i; });
    var vistos = {}, limpias = lineas.map(function (l) {
      var id = String(l && l.insumo_id || ''), c = num_(l && l.cantidad);
      if (!insumos[id]) throw extError_('Un insumo de la receta ya no existe.');
      if (vistos[id]) throw extError_('"' + insumos[id].nombre + '" está repetido en la receta.');
      if (c == null || c <= 0 || c > 1000000) throw extError_('La cantidad de "' + insumos[id].nombre + '" debe ser mayor que 0.');
      vistos[id] = true; return { insumo_id: id, cantidad: invR_(c) };
    });
    var h = invHoja_('recetas'), cab = asegurarColumnas_(h, INV_COLS.recetas);
    var filas = leerTabla_(INV_H.recetas).filter(function (r) { return String(r.producto_id) === pid && String(r.tamano || '') === tam; }).map(function (r) { return r._fila; });
    filas.sort(function (a, b) { return b - a; }).forEach(function (f) { h.deleteRow(f); });
    limpias.forEach(function (l) {
      invAgregar_(h, cab, { producto_id: pid, producto: String(prod.nombre), tamano: tam, insumo_id: l.insumo_id, cantidad: l.cantidad, notas: '' }, INV_TEXTO.recetas);
    });
    return { ok: true, lineas: limpias.length };
  } finally { lock.releaseLock(); }
}

function inventarioConfig(sesion, d) {
  var usuario = invUsuario_(sesion);
  var on = !!(d && d.descuentoAuto);
  var antes = esSi_(leerConfig_().inventario_descuento_auto);
  guardarClave_('inventario_descuento_auto', on ? 'SI' : 'NO');
  if (on && !antes) PropertiesService.getScriptProperties().setProperty('INV_DESDE', String(Date.now()));   // solo pedidos desde ahora
  try { auditar_(usuario, 'Inventario', 'Descuento automático: ' + (on ? 'SI' : 'NO')); } catch (e) { /* la auditoría nunca debe frenar el cambio */ }
  return { ok: true, descuentoAuto: on };
}
function inventarioProcesar(sesion) { invAdmin_(sesion); return invProcesarPedidos_(); }
