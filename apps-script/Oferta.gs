/* =====================================================================
   PASTA GALLO · OFERTA DEL DÍA (20-nov-2026, falta de luz)
   - "ofertaHoy20nov": rebaja S/ 5 a pizzas (cada tamaño), pastas y parrillas; guarda el precio
     anterior en precio_antes (la web lo muestra tachado con su %) y marca destacado = "hoy".
     Pone como agotados las lasagnas, el Tris di Pasta, la Limonada y la Maracuyá.
     Avisa en la sección Pizze que hoy son precocidas.
   - Todo lo anterior queda guardado en la hoja "oferta_guardada".
   - "ofertaRestaurar": deja todo como estaba. Se ejecuta SOLA en cuanto pasa la medianoche
     (la primera visita a la web o el primer pedido del día siguiente la dispara) o a mano desde el editor.
   - Los precios del servidor salen de la misma hoja, así que web y pedidos siempre coinciden.
   ===================================================================== */
var OFERTA_ = {
  fecha: '2026-11-20',
  rebaja: 5,
  secciones: ['pizze', 'pasta', 'parrillas'],
  sinRebaja: ['pasta-tris-di-pasta'],
  agotarSecciones: ['lasagne'],
  agotarIds: ['pasta-tris-di-pasta', 'caffe-limonata', 'caffe-maracuya'],
  hoja: 'oferta_guardada',
  avisoPizza: '⚠ Hoy nuestras pizzas son precocidas por la falta de luz. Gracias por tu comprensión.',
  avisoPizza_en: '⚠ Today our pizzas are pre-baked because of the power outage. Thank you for understanding.'
};

function ofertaHoy20nov() {
  exigirAdmin_('');
  var O = OFERTA_, ss = SpreadsheetApp.getActive();
  if (ss.getSheetByName(O.hoja)) throw new Error('La oferta ya está aplicada. Para quitarla ejecuta ofertaRestaurar.');
  var hp = ss.getSheetByName(HOJA.productos), cab = asegurarColumnas_(hp, COLS.productos);
  var cP = cab.indexOf('precio') + 1, cT = cab.indexOf('tamanos') + 1, cA = cab.indexOf('precio_antes') + 1,
      cD = cab.indexOf('destacado') + 1, cV = cab.indexOf('disponible') + 1;
  var g = ss.insertSheet(O.hoja);
  g.appendRow(['tipo', 'id', 'precio', 'tamanos', 'precio_antes', 'destacado', 'disponible', 'intro', 'intro_en']);
  var n = { rebaja: 0, agotados: 0 };
  leerTabla_(HOJA.productos).forEach(function (p) {
    var id = String(p.id), sec = String(p.seccion);
    var agotar = O.agotarSecciones.indexOf(sec) >= 0 || O.agotarIds.indexOf(id) >= 0;
    var rebajar = O.secciones.indexOf(sec) >= 0 && String(p.tipo) !== 'salsa' && O.sinRebaja.indexOf(id) < 0 && esSi_(p.visible);
    if (!agotar && !rebajar) return;
    g.appendRow(['producto', id, p.precio, p.tamanos, p.precio_antes, p.destacado, p.disponible, '', '']);
    if (agotar && esSi_(p.disponible)) { hp.getRange(p._fila, cV).setValue('NO'); n.agotados++; }
    if (!rebajar) return;
    var tams = parsearTamanos_(p.tamanos);
    if (tams.length) {
      if (tams.some(function (t) { return t[1] - O.rebaja <= 0; })) return;
      hp.getRange(p._fila, cA).setValue(tams.map(function (t) { return t[0] + '=' + t[1]; }).join('; '));
      hp.getRange(p._fila, cT).setValue(tams.map(function (t) { return t[0] + '=' + (Math.round((t[1] - O.rebaja) * 100) / 100); }).join('; '));
    } else {
      var pr = num_(p.precio);
      if (pr == null || pr - O.rebaja <= 0) return;
      hp.getRange(p._fila, cA).setValue(pr);
      hp.getRange(p._fila, cP).setValue(Math.round((pr - O.rebaja) * 100) / 100);
    }
    hp.getRange(p._fila, cD).setValue('hoy');
    n.rebaja++;
  });
  // aviso en la sección de pizzas
  var hs = ss.getSheetByName(HOJA.secciones), cs = asegurarColumnas_(hs, COLS.secciones);
  leerTabla_(HOJA.secciones).forEach(function (s) {
    if (String(s.id) !== 'pizze') return;
    g.appendRow(['seccion', 'pizze', '', '', '', '', '', s.intro, s.intro_en]);
    hs.getRange(s._fila, cs.indexOf('intro') + 1).setValue(O.avisoPizza);
    hs.getRange(s._fila, cs.indexOf('intro_en') + 1).setValue(O.avisoPizza_en);
  });
  PropertiesService.getScriptProperties().setProperty('OFERTA_FECHA', O.fecha);
  limpiarCache_(); marcarPendiente_();
  var r = publicarCarta('');
  return 'Oferta aplicada: ' + n.rebaja + ' productos con rebaja, ' + n.agotados + ' agotados. ' + r.mensaje;
}

/** Desde el editor (a mano). */
function ofertaRestaurar() { exigirAdmin_(''); return ofertaRestaurar_(); }

function ofertaRestaurar_() {
  var props = PropertiesService.getScriptProperties();
  props.deleteProperty('OFERTA_FECHA'); // primero, para que dos visitas a la vez no la repitan
  var ss = SpreadsheetApp.getActive(), g = ss.getSheetByName(OFERTA_.hoja);
  if (!g) return 'No hay oferta que quitar.';
  var hp = ss.getSheetByName(HOJA.productos), cab = asegurarColumnas_(hp, COLS.productos);
  var col = function (c) { return cab.indexOf(c) + 1; };
  var guard = {}, secs = {};
  g.getDataRange().getValues().slice(1).forEach(function (r) {
    if (r[0] === 'producto') guard[String(r[1])] = { precio: r[2], tamanos: r[3], precio_antes: r[4], destacado: r[5], disponible: r[6] };
    else if (r[0] === 'seccion') secs[String(r[1])] = { intro: r[7], intro_en: r[8] };
  });
  var n = 0;
  leerTabla_(HOJA.productos).forEach(function (p) {
    var x = guard[String(p.id)]; if (!x) return;
    ['precio', 'tamanos', 'precio_antes', 'destacado', 'disponible'].forEach(function (c) {
      if (String(p[c]) !== String(x[c])) { hp.getRange(p._fila, col(c)).setValue(x[c]); n++; }
    });
  });
  var hs = ss.getSheetByName(HOJA.secciones), cs = asegurarColumnas_(hs, COLS.secciones);
  leerTabla_(HOJA.secciones).forEach(function (s) {
    var x = secs[String(s.id)]; if (!x) return;
    hs.getRange(s._fila, cs.indexOf('intro') + 1).setValue(x.intro);
    hs.getRange(s._fila, cs.indexOf('intro_en') + 1).setValue(x.intro_en);
  });
  ss.deleteSheet(g);
  limpiarCache_(); marcarPendiente_();
  var r = publicarCarta_('oferta');
  return 'Oferta quitada (' + n + ' valores). ' + r.mensaje;
}

/** Se llama al abrir la web y al recibir un pedido: si la oferta era de un día anterior, la quita. */
function ofertaVencida_() {
  try {
    var f = PropertiesService.getScriptProperties().getProperty('OFERTA_FECHA');
    if (!f) return;
    var cfg = leerConfig_();
    var hoy = Utilities.formatDate(new Date(), cfg.zona_horaria || 'America/Lima', 'yyyy-MM-dd');
    if (f < hoy) ofertaRestaurar_();
  } catch (err) { /* no debe frenar la carta ni los pedidos */ }
}
