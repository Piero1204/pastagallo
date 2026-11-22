/* =========================== CATÁLOGO DE LA TIENDA (pasta fresca y salsas para llevar, por peso) ===========================
   Ejecutar UNA vez (o las veces que haga falta) desde el editor de Apps Script: crearCatalogoTienda().
   - Crea la sección "tienda" de la carta ("Tienda · Para llevar a casa": delivery SI, mesa NO, al final antes de Cargos Adicionales).
   - Crea/actualiza los productos "tienda-*" con sus tamaños por peso ("1 kg=38; 1/2 kg=19; 1/4 kg=9.5"), SKU y vende_tienda = SI.
   - Es idempotente: si ya existen no se duplican; solo se actualizan los precios (tamaños) si cambiaron. Lo demás (descripción, foto,
     disponibilidad, orden...) NO se pisa si el dueño ya lo editó.
   - Cada tamaño es un empaque: en la caja y en la web se elige "1 kg · S/ 38" y se cuentan empaques (por eso unidad = unid).
   - Las salsas de la tienda son productos normales (tipo "plato"), NO el tipo "salsa" de la carta (ese tipo es el acompañamiento de
     las pastas y no se puede pedir solo).
   - Deja la carta marcada para publicar (no publica a GitHub). */

var TIENDA_SECCION_ID = 'tienda';
var TIENDA_CATALOGO_ = [
  // [id, nombre, nombre_en, grupo, grupo_en, tamaños, sku, descripción, description, foto]
  ['tienda-ravioles-carne', 'Ravioles de carne', 'Beef ravioli', 'Pasta fresca', 'Fresh pasta', '1 kg=38; 1/2 kg=19', 'TIE-RAV-CAR',
    'Pasta fresca rellena de carne, lista para cocinar en casa.', 'Fresh pasta filled with beef, ready to cook at home.', 'fotos/pasta-ravioli-di-carne-1795062531153.jpg'],
  ['tienda-ravioles-queso', 'Ravioles de queso', 'Cheese ravioli', 'Pasta fresca', 'Fresh pasta', '1 kg=38; 1/2 kg=19', 'TIE-RAV-QUE',
    'Pasta fresca rellena de queso, lista para cocinar en casa.', 'Fresh pasta filled with cheese, ready to cook at home.', 'fotos/pasta-ravioli-di-formaggio-1795062570951.jpg'],
  ['tienda-fettuccini', 'Fettuccini', 'Fettuccini', 'Pasta fresca', 'Fresh pasta', '1 kg=20; 1/2 kg=10', 'TIE-FET',
    'Fettuccini fresco, hecho cada día.', 'Fresh fettuccini, made daily.', 'fotos/pasta-fettuccine-1794449529303.jpg'],
  ['tienda-spaghetti', 'Spaghetti', 'Spaghetti', 'Pasta fresca', 'Fresh pasta', '1 kg=20; 1/2 kg=10', 'TIE-SPA',
    'Spaghetti fresco, hecho cada día.', 'Fresh spaghetti, made daily.', ''],
  ['tienda-tortellini', 'Tortellini', 'Tortellini', 'Pasta fresca', 'Fresh pasta', '1 kg=38; 1/2 kg=19', 'TIE-TOR',
    'Tortellini fresco, listo para cocinar en casa.', 'Fresh tortellini, ready to cook at home.', ''],
  ['tienda-masa-lasagna', 'Masa de lasagna', 'Lasagna sheets', 'Pasta fresca', 'Fresh pasta', '1 kg=20; 1/2 kg=10', 'TIE-MLA',
    'Láminas de masa fresca para armar tu lasagna.', 'Fresh pasta sheets to build your own lasagna.', ''],
  ['tienda-lasagna-carne', 'Lasagna de carne', 'Beef lasagna', 'Lasagnas', 'Lasagnas', '1 kg=38; 1/2 kg=19', 'TIE-LAS-CAR',
    'Lasagna de carne al horno, lista para calentar.', 'Baked beef lasagna, ready to heat.', 'fotos/lasagne-lasagna-di-carne-1795062419715.jpg'],
  ['tienda-lasagna-espinaca', 'Lasagna de espinaca', 'Spinach lasagna', 'Lasagnas', 'Lasagnas', '1 kg=40; 1/2 kg=20', 'TIE-LAS-ESP',
    'Lasagna de espinaca al horno, lista para calentar.', 'Baked spinach lasagna, ready to heat.', ''],
  ['tienda-lasagna-champinones', 'Lasagna de champiñones', 'Mushroom lasagna', 'Lasagnas', 'Lasagnas', '1 kg=44; 1/2 kg=22', 'TIE-LAS-CHA',
    'Lasagna de champiñones al horno, lista para calentar.', 'Baked mushroom lasagna, ready to heat.', ''],
  ['tienda-salsa-carne', 'Salsa de carne', 'Meat sauce', 'Salsas', 'Sauces', '1 kg=38; 1/2 kg=19; 1/4 kg=9.5', 'TIE-SAL-CAR',
    'Salsa de carne para tus pastas.', 'Meat sauce for your pasta.', ''],
  ['tienda-salsa-tomate', 'Salsa de tomate', 'Tomato sauce', 'Salsas', 'Sauces', '1 kg=36; 1/2 kg=18; 1/4 kg=9', 'TIE-SAL-TOM',
    'Salsa de tomate casera para tus pastas.', 'Homemade tomato sauce for your pasta.', ''],
  ['tienda-salsa-alfredo', 'Salsa Alfredo', 'Alfredo sauce', 'Salsas', 'Sauces', '1 kg=38; 1/2 kg=19; 1/4 kg=9.5', 'TIE-SAL-ALF',
    'Salsa Alfredo cremada para tus pastas.', 'Creamy Alfredo sauce for your pasta.', ''],
  ['tienda-salsa-amatriciana', 'Salsa Amatricciana', 'Amatriciana sauce', 'Salsas', 'Sauces', '1 kg=48; 1/2 kg=24; 1/4 kg=12', 'TIE-SAL-AMA',
    'Salsa Amatricciana para tus pastas.', 'Amatriciana sauce for your pasta.', ''],
  ['tienda-salsa-pesto', 'Salsa Pesto', 'Pesto sauce', 'Salsas', 'Sauces', '1 kg=38; 1/2 kg=19; 1/4 kg=9.5', 'TIE-SAL-PES',
    'Salsa Pesto para tus pastas.', 'Pesto sauce for your pasta.', ''],
  ['tienda-salsa-champinones', 'Salsa de champiñones', 'Mushroom sauce', 'Salsas', 'Sauces', '1 kg=64; 1/2 kg=32; 1/4 kg=16', 'TIE-SAL-CHA',
    'Salsa de champiñones para tus pastas.', 'Mushroom sauce for your pasta.', '']
];

// En el ticket de cocina la tienda sale como un bloque propio (Code.gs ya está cargado: va antes en el orden alfabético).
if (typeof SECCION_COCINA_ !== 'undefined') SECCION_COCINA_[TIENDA_SECCION_ID] = 'TIENDA (EMPACAR)';

/** Ejecutar desde el editor: crea la sección y los productos de la tienda que falten y actualiza los precios que hayan cambiado. */
function crearCatalogoTienda() {
  exigirAdmin_('');
  var ss = SpreadsheetApp.getActive();
  var lock = LockService.getScriptLock();
  lock.waitLock(30000);
  var res = { seccion: 'existia', creados: 0, actualizados: 0 };
  try {
    // 1. sección (al final, antes de Cargos Adicionales; si existe no se toca)
    var hs = ss.getSheetByName(HOJA.secciones), cabS = asegurarColumnas_(hs, COLS.secciones);
    var secs = leerTabla_(HOJA.secciones);
    if (!secs.some(function (s) { return String(s.id) === TIENDA_SECCION_ID; })) {
      var maxOrden = 0;
      secs.forEach(function (s) {
        if (String(s.id) === SECCION_CARGOS) return;
        var o = num_(s.orden); if (o != null && o > maxOrden) maxOrden = o;
      });
      var fs = { id: TIENDA_SECCION_ID, orden: maxOrden + 10, titulo: 'Tienda · Para llevar a casa',
        subtitulo: 'Pasta fresca y salsas por peso, listas para cocinar en casa.', alcohol: 'NO', delivery: 'SI', mesa: 'NO', visible: 'SI',
        titulo_en: 'Shop · To take home', subtitulo_en: 'Fresh pasta and sauces by weight, ready to cook at home.' };
      hs.appendRow(cabS.map(function (c) { return fs[c] == null ? '' : fs[c]; }));
      res.seccion = 'creada';
    }

    // 2. productos
    var hp = ss.getSheetByName(HOJA.productos);
    var cab = asegurarColumnas_(hp, COLS.productos.concat(COLS_TIENDA_PROD));
    var existentes = {}; leerTabla_(HOJA.productos).forEach(function (p) { existentes[String(p.id)] = p; });
    TIENDA_CATALOGO_.forEach(function (d, i) {
      var ex = existentes[d[0]];
      if (ex) {
        var actual = parsearTamanos_(ex.tamanos).map(function (t) { return t[0] + '=' + t[1]; }).join('; ');
        var nuevo = parsearTamanos_(d[5]).map(function (t) { return t[0] + '=' + t[1]; }).join('; ');
        if (actual !== nuevo) { hp.getRange(ex._fila, cab.indexOf('tamanos') + 1).setValue(d[5]); res.actualizados++; }
        return;
      }
      var f = { id: d[0], seccion: TIENDA_SECCION_ID, grupo: d[3], orden: (i + 1) * 10, nombre: d[1], descripcion: d[7], tamanos: d[5],
        tipo: 'plato', requiere_salsa: 'NO', disponible: 'SI', visible: 'SI', foto: d[9], canal: 'todos', nombre_en: d[2], descripcion_en: d[8],
        sku: d[6], unidad: 'unid', vende_tienda: 'SI' };
      hp.appendRow(cab.map(function (c) { return f[c] == null ? '' : f[c]; }));
      res.creados++;
    });
  } finally {
    lock.releaseLock();
  }
  marcarPendiente_();   // limpia la caché y deja la carta "pendiente de publicar" (no publica a GitHub)
  console.log('Catálogo de tienda: sección ' + res.seccion + ', ' + res.creados + ' producto(s) creado(s), ' + res.actualizados + ' con precio actualizado.');
  return res;
}
