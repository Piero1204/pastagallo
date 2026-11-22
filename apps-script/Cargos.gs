/* =========================== CARGOS ADICIONALES (solo mozo y panel) ===========================
 * Cajas, tapers, bolsas, derecho de corcho, roturas, etc. Son productos de la sección "cargos" con canal = interno:
 *  - NO salen en la carta de la web ni se pueden pedir desde la web o el QR de la mesa (construirCarta_ / calcularPedido_).
 *  - Sí se pueden agregar desde el panel del mozo (lista en estadoMozo_ → cargos) y desde el panel (✏️ Editar pedido).
 *  - No van en el ticket de COCINA (cocinaDe_), sí en la cuenta/comanda completa.
 * Para cambiar precios o agregar cargos: hoja Productos, sección "cargos", canal "interno".
 * Ejecutar UNA vez crearCargosAdicionales() desde el editor para crearlos.
 */
var SECCION_CARGOS = 'cargos';
var CARGOS_ADICIONALES_ = [
  { id: 'cargo-caja-pizza', n: 'Caja de pizza', t: 'Personal=3; Mediana=4; Familiar=5' },
  { id: 'cargo-taper', n: 'Taper', t: 'Pequeño=2; Mediano=3; Grande=4' },
  { id: 'cargo-bolsa-papel', n: 'Bolsa de papel', t: 'Pequeña=0.5; Mediana=1; Grande=2' },
  { id: 'cargo-corcho', n: 'Derecho de corcho', p: 10 },
  { id: 'cargo-cumpleanos', n: 'Servicio de cumpleaños', p: 5 },
  { id: 'cargo-limpieza', n: 'Limpieza extraordinaria', p: 5 },
  { id: 'cargo-vaso-roto', n: 'Vaso roto', p: 5 },
  { id: 'cargo-plato-roto', n: 'Plato roto', p: 5 },
  { id: 'cargo-jarra-rota', n: 'Jarra rota', p: 10 },
  { id: 'cargo-cubierto-roto', n: 'Cubierto roto', p: 2 }
];

function esCargo_(id) { return String(id || '').indexOf('cargo-') === 0; }

/** Ejecutar una vez desde el editor: crea la sección y los cargos que falten (no toca los que ya existen). */
function crearCargosAdicionales() {
  exigirAdmin_(''); // solo editores del Sheets
  var ss = SpreadsheetApp.getActive();
  var hs = ss.getSheetByName(HOJA.secciones), cabS = asegurarColumnas_(hs, COLS.secciones);
  var haySec = leerTabla_(HOJA.secciones).some(function (s) { return String(s.id) === SECCION_CARGOS; });
  if (!haySec) {
    var fs = { id: SECCION_CARGOS, orden: 999, titulo: 'Cargos Adicionales', subtitulo: 'Solo mozo y panel: no sale en la carta',
      alcohol: 'NO', delivery: 'NO', mesa: 'SI', visible: 'SI' };
    hs.appendRow(cabS.map(function (c) { return fs[c] == null ? '' : fs[c]; }));
  }
  var hp = ss.getSheetByName(HOJA.productos), cabP = asegurarColumnas_(hp, COLS.productos);
  var ya = {}; leerTabla_(HOJA.productos).forEach(function (p) { ya[String(p.id)] = true; });
  var nuevos = 0;
  CARGOS_ADICIONALES_.forEach(function (c, i) {
    if (ya[c.id]) return;
    var f = { id: c.id, seccion: SECCION_CARGOS, orden: (i + 1) * 10, nombre: c.n, precio: c.p == null ? '' : c.p, tamanos: c.t || '',
      disponible: 'SI', visible: 'SI', canal: 'interno' };
    hp.appendRow(cabP.map(function (col) { return f[col] == null ? '' : f[col]; }));
    nuevos++;
  });
  limpiarCache_();
  console.log('Cargos Adicionales: sección ' + (haySec ? 'ya existía' : 'creada') + ', ' + nuevos + ' cargo(s) nuevo(s).');
  return nuevos;
}

/** Lista para el panel del mozo: [{ id, n, t: [[tamaño, precio]...], p }] */
function cargosAdicionales_() {
  return (leerCatalogo_().productos || []).filter(function (x) {
    return String(x.seccion) === SECCION_CARGOS && esSi_(x.visible) && esSi_(x.disponible);
  }).sort(function (a, b) { return (num_(a.orden) || 0) - (num_(b.orden) || 0); }).map(function (x) {
    return { id: String(x.id), n: String(x.nombre), t: parsearTamanos_(x.tamanos), p: num_(x.precio) };
  });
}
