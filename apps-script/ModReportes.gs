/* =========================== REPORTES AVANZADOS ===========================
   Se enciende con Config modulo_reportes = SI. Solo LEE Pedidos, Ajustes y Cobros (nunca los cambia); todo se calcula aquí
   en el servidor y solo el administrador puede pedirlo.
   Reglas de conteo (las mismas del Dashboard): no cuentan los pedidos cancelados ni las cortesías. Ventas = total del
   pedido ya con su ajuste (descuento o recargo). Fecha y hora en America/Lima (Config zona_horaria).
   Canales: mesa, delivery, recojo y tienda (canal o origen "tienda"). En métodos de pago, el SALÓN sale de la hoja Cobros
   (lo que el mozo cobró) y delivery/recojo de lo que el cliente eligió al pedir.

   REPORTE MENSUAL POR CORREO (opcional, nunca automático):
   - Config reporte_correos = correos separados por coma (vacío = no se envía nada). Se guarda desde el panel (Reportes).
   - "Enviar reporte de prueba" lo manda ahora. "Activar envío mensual" instala UN activador de Apps Script (día 1 de cada mes,
     ~8 am) que manda el mes anterior. "Quitar envío mensual" lo borra.
   - Permisos de Google que pide al autorizar: enviar correo como tú (MailApp: script.send_mail) y administrar activadores
     (script.scriptapp). El PDF adjunto se genera con Utilities.newBlob(html).getAs('application/pdf'); si Google no lo logra
     el correo sale igual, solo con el resumen en el cuerpo. */

var EXT_ACCIONES = EXT_ACCIONES || {};
extRegistrar_('reportes');

var NOMBRES_AJUSTE_ = { desc_monto: 'Descuento en soles', desc_pct: 'Descuento en %', rec_monto: 'Recargo en soles', rec_pct: 'Recargo en %', precio_final: 'Precio final fijado' };

function lunesDe_(dia) {
  var p = dia.split('-'), d = new Date(Date.UTC(Number(p[0]), Number(p[1]) - 1, Number(p[2])));
  d.setUTCDate(d.getUTCDate() - ((d.getUTCDay() + 6) % 7));
  return d.toISOString().slice(0, 10);
}
function canalReporte_(p) {
  if (p.canal === 'tienda' || p.origen === 'tienda') return 'tienda';
  return p.canal === 'mesa' || p.canal === 'delivery' || p.canal === 'recojo' ? p.canal : (p.canal || 'otro');
}
function etiquetaPago_(s) {
  s = String(s == null ? '' : s).trim().toLowerCase();
  return s ? s.charAt(0).toUpperCase() + s.slice(1) : 'Sin indicar';
}
function sumaGrupo_(mapa, clave, monto) {
  var g = mapa[clave] || (mapa[clave] = { k: clave, pedidos: 0, ventas: 0 });
  g.pedidos++; g.ventas += monto;
}
function listaGrupo_(mapa, ordenar) {
  var l = Object.keys(mapa).map(function (k) { var g = mapa[k]; g.ventas = r2_(g.ventas); g.ticket = g.pedidos ? r2_(g.ventas / g.pedidos) : 0; return g; });
  return l.sort(ordenar || function (a, b) { return a.k < b.k ? -1 : a.k > b.k ? 1 : 0; });
}

/** Cálculo puro (sin leer hojas): datos = { pn, cobros, ajustes }. desde/hasta = 'yyyy-MM-dd' (incluidos). */
function reporteAgregar_(datos, desde, hasta, zona) {
  var enRango = function (dia) { return dia && dia >= desde && dia <= hasta; };
  var validos = datos.pn.filter(function (p) { return !p.cancelado && !p.cortesia; });
  // primer pedido de cada cliente en toda la historia (para nuevos vs recurrentes)
  var primero = {};
  validos.forEach(function (p) { if (p.tel && p.ts && (!primero[p.tel] || p.ts < primero[p.tel])) primero[p.tel] = p.ts; });
  var primerDia = {};
  validos.forEach(function (p) { if (p.tel && p.ts && p.ts === primero[p.tel]) primerDia[p.tel] = p.dia; });

  var pr = validos.filter(function (p) { return enRango(p.dia); });
  var res = { desde: desde, hasta: hasta, pedidos: pr.length, ventas: 0, ticket: 0 };
  var dias = {}, semanas = {}, meses = {}, canales = {}, horas = {}, pagos = {}, prods = {};
  var aj = { pedidos: 0, descuentos: 0, recargos: 0, neto: 0, porTipo: {}, porMotivo: {} };
  var nuevos = { clientes: {}, pedidos: 0, ventas: 0 }, recur = { clientes: {}, pedidos: 0, ventas: 0 }, sinTel = { pedidos: 0, ventas: 0 };
  for (var h = 0; h < 24; h++) horas[h] = { k: (h < 10 ? '0' : '') + h + ':00', pedidos: 0, ventas: 0 };

  var ultimoAjuste = {};
  (datos.ajustes || []).forEach(function (a) {
    var f = a.fecha instanceof Date ? a.fecha.getTime() : 0, id = String(a.pedido);
    if (!ultimoAjuste[id] || f >= ultimoAjuste[id].f) ultimoAjuste[id] = { f: f, tipo: String(a.tipo || '') };
  });

  pr.forEach(function (p) {
    res.ventas += p.total;
    sumaGrupo_(dias, p.dia, p.total);
    sumaGrupo_(semanas, lunesDe_(p.dia), p.total);
    sumaGrupo_(meses, p.dia.slice(0, 7), p.total);
    sumaGrupo_(canales, canalReporte_(p), p.total);
    if (p.hora >= 0 && p.hora < 24) { horas[p.hora].pedidos++; horas[p.hora].ventas += p.total; }
    if (canalReporte_(p) !== 'mesa') sumaGrupo_(pagos, etiquetaPago_(p.pago), p.total);
    p.items.forEach(function (it) {
      var n = String(it && it.nombre || '').trim(); if (!n) return;
      var g = prods[n] || (prods[n] = { k: n, unidades: 0, ventas: 0 });
      g.unidades += numSeguro_(it.cant); g.ventas += numSeguro_(it.subtotal);
    });
    if (p.ajuste) {
      aj.pedidos++; aj.neto += p.ajuste;
      if (p.ajuste < 0) aj.descuentos += -p.ajuste; else aj.recargos += p.ajuste;
      var t = ultimoAjuste[p.numero] ? ultimoAjuste[p.numero].tipo : '', tn = NOMBRES_AJUSTE_[t] || 'Otro';
      var gt = aj.porTipo[tn] || (aj.porTipo[tn] = { k: tn, pedidos: 0, ventas: 0 }); gt.pedidos++; gt.ventas += p.ajuste;
      var mo = (p.ajusteMotivo || 'Sin motivo').trim().toLowerCase();
      var gm = aj.porMotivo[mo] || (aj.porMotivo[mo] = { k: mo, pedidos: 0, ventas: 0 }); gm.pedidos++; gm.ventas += p.ajuste;
    }
    if (!p.tel) { sinTel.pedidos++; sinTel.ventas += p.total; }
    else {
      var bolsa = enRango(primerDia[p.tel]) ? nuevos : recur;
      bolsa.clientes[p.tel] = true; bolsa.pedidos++; bolsa.ventas += p.total;
    }
  });
  // cobros del salón (por método)
  (datos.cobros || []).forEach(function (c) {
    var f = c.fecha instanceof Date && !isNaN(c.fecha.getTime()) ? Utilities.formatDate(c.fecha, zona, 'yyyy-MM-dd') : '';
    if (!enRango(f)) return;
    var g = pagos[etiquetaPago_(c.metodo)] || (pagos[etiquetaPago_(c.metodo)] = { k: etiquetaPago_(c.metodo), pedidos: 0, ventas: 0 });
    g.pedidos++; g.ventas += numSeguro_(c.monto);
  });
  var canc = datos.pn.filter(function (p) { return p.cancelado && enRango(p.dia); });
  res.ventas = r2_(res.ventas); res.ticket = res.pedidos ? r2_(res.ventas / res.pedidos) : 0;
  res.porDia = listaGrupo_(dias); res.porSemana = listaGrupo_(semanas); res.porMes = listaGrupo_(meses);
  res.porCanal = listaGrupo_(canales, function (a, b) { return b.ventas - a.ventas; });
  res.porHora = Object.keys(horas).map(function (k) { var g = horas[k]; g.ventas = r2_(g.ventas); return g; });
  res.porPago = listaGrupo_(pagos, function (a, b) { return b.ventas - a.ventas; });
  var lp = Object.keys(prods).map(function (k) { var g = prods[k]; g.ventas = r2_(g.ventas); return g; });
  res.productos = lp.sort(function (a, b) { return (b.unidades - a.unidades) || (b.ventas - a.ventas) || (a.k < b.k ? -1 : 1); });
  res.top = res.productos.slice(0, 10);
  res.bottom = res.productos.slice().reverse().slice(0, 10);
  res.ajustes = { pedidos: aj.pedidos, descuentos: r2_(aj.descuentos), recargos: r2_(aj.recargos), neto: r2_(aj.neto),
    porTipo: listaGrupo_(aj.porTipo), porMotivo: listaGrupo_(aj.porMotivo, function (a, b) { return b.pedidos - a.pedidos; }).slice(0, 10) };
  res.cancelados = { pedidos: canc.length, monto: r2_(canc.reduce(function (s, p) { return s + p.total; }, 0)) };
  res.clientes = { nuevos: Object.keys(nuevos.clientes).length, pedidosNuevos: nuevos.pedidos, ventasNuevos: r2_(nuevos.ventas),
    recurrentes: Object.keys(recur.clientes).length, pedidosRecurrentes: recur.pedidos, ventasRecurrentes: r2_(recur.ventas),
    pedidosSinTelefono: sinTel.pedidos, ventasSinTelefono: r2_(sinTel.ventas) };
  return res;
}

function reporteDatos_(zona) {
  return { pn: leerPedidosNorm_(zona), cobros: leerTabla_(HOJA_COBROS), ajustes: leerTabla_(HOJA_AJUSTES) };
}
function fechaValida_(s) {
  s = String(s || '');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  var d = new Date(s + 'T00:00:00Z');
  return !isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s;
}
function diasEntre_(a, b) { return Math.round((new Date(b + 'T00:00:00Z').getTime() - new Date(a + 'T00:00:00Z').getTime()) / 86400000); }
function reporteRango_(desde, hasta, zona) {
  var hoy = Utilities.formatDate(new Date(), zona, 'yyyy-MM-dd');
  hasta = fechaValida_(hasta) ? String(hasta) : hoy;
  desde = fechaValida_(desde) ? String(desde) : new Date(new Date(hasta + 'T00:00:00Z').getTime() - 29 * 86400000).toISOString().slice(0, 10);
  if (desde > hasta) throw new Error('La fecha "desde" no puede ser después de "hasta".');
  if (diasEntre_(desde, hasta) > 366) throw new Error('El rango máximo es de un año (366 días).');
  return { desde: desde, hasta: hasta };
}

/* ---------- panel ---------- */
function reporteVentas(sesion, desde, hasta) {
  modExigir_(sesion, 'reportes');
  var zona = leerConfig_().zona_horaria || 'America/Lima', rg = reporteRango_(desde, hasta, zona);
  var r = reporteAgregar_(reporteDatos_(zona), rg.desde, rg.hasta, zona);
  r.ok = true;
  return r;
}

/** Tablas listas para CSV / correo: { nombre: [[encabezados], [fila]...] }. */
function reporteTablas_(r) {
  var g = function (l, t) { return [[t, 'pedidos', 'ventas', 'ticket_promedio']].concat(l.map(function (x) { return [x.k, x.pedidos, x.ventas, x.ticket]; })); };
  var cp = function (l, t) { return [[t, 'unidades', 'ventas']].concat(l.map(function (x) { return [x.k, x.unidades, x.ventas]; })); };
  var c = r.clientes;
  return {
    resumen: [['dato', 'valor'], ['desde', r.desde], ['hasta', r.hasta], ['pedidos', r.pedidos], ['ventas', r.ventas], ['ticket_promedio', r.ticket],
      ['cancelados_pedidos', r.cancelados.pedidos], ['cancelados_monto', r.cancelados.monto]],
    dias: g(r.porDia, 'dia'), semanas: g(r.porSemana, 'semana_desde_lunes'), meses: g(r.porMes, 'mes'), canales: g(r.porCanal, 'canal'),
    horas: g(r.porHora.filter(function (x) { return x.pedidos; }), 'hora'), pagos: g(r.porPago, 'metodo'),
    productos: cp(r.productos, 'producto'),
    ajustes: [['dato', 'valor'], ['pedidos_con_ajuste', r.ajustes.pedidos], ['descuentos', r.ajustes.descuentos], ['recargos', r.ajustes.recargos], ['neto', r.ajustes.neto]]
      .concat(r.ajustes.porTipo.map(function (x) { return ['tipo: ' + x.k, x.pedidos + ' pedidos', x.ventas]; }))
      .concat(r.ajustes.porMotivo.map(function (x) { return ['motivo: ' + x.k, x.pedidos + ' pedidos', x.ventas]; })),
    clientes: [['grupo', 'clientes', 'pedidos', 'ventas'], ['nuevos', c.nuevos, c.pedidosNuevos, c.ventasNuevos], ['recurrentes', c.recurrentes, c.pedidosRecurrentes, c.ventasRecurrentes],
      ['sin_telefono', '', c.pedidosSinTelefono, c.ventasSinTelefono]]
  };
}
var SECCIONES_CSV_ = ['resumen', 'dias', 'semanas', 'meses', 'canales', 'horas', 'pagos', 'productos', 'ajustes', 'clientes'];
function reporteCsv(sesion, desde, hasta, seccion) {
  modExigir_(sesion, 'reportes');
  var zona = leerConfig_().zona_horaria || 'America/Lima', rg = reporteRango_(desde, hasta, zona);
  var t = reporteTablas_(reporteAgregar_(reporteDatos_(zona), rg.desde, rg.hasta, zona));
  seccion = String(seccion || 'todo');
  var lista = seccion === 'todo' ? SECCIONES_CSV_ : SECCIONES_CSV_.indexOf(seccion) >= 0 ? [seccion] : null;
  if (!lista) throw new Error('Sección no válida.');
  var filas = [];
  lista.forEach(function (s) { if (lista.length > 1) { filas.push([s.toUpperCase()]); } t[s].forEach(function (f) { filas.push(f); }); if (lista.length > 1) filas.push([]); });
  return { ok: true, nombre: 'reporte-' + seccion + '-' + rg.desde + '_' + rg.hasta + '.csv', csv: '﻿' + csvFilas_(filas) };
}

/* ---------- reporte mensual por correo ---------- */
function esc_(s) { return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); }
function parseCorreos_(txt) {
  var vistos = {}, out = [];
  String(txt == null ? '' : txt).split(/[,;\s]+/).forEach(function (x) {
    x = x.trim().toLowerCase();
    if (x && /^[^\s@,;<>"]+@[^\s@,;<>"]+\.[^\s@,;<>"]{2,}$/.test(x) && !vistos[x]) { vistos[x] = true; out.push(x); }
  });
  return out;
}
function reporteHtml_(r, titulo, extra) {
  var sol = function (n) { return 'S/ ' + Number(n || 0).toFixed(2); };
  var tabla = function (enc, filas) {
    return '<table style="border-collapse:collapse;width:100%;margin:6px 0 16px;font-size:13px"><tr>' + enc.map(function (e) { return '<th style="text-align:left;background:#f4ede0;padding:5px 8px;border-bottom:1px solid #d8cdb4">' + esc_(e) + '</th>'; }).join('') + '</tr>' +
      (filas.length ? filas.map(function (f) { return '<tr>' + f.map(function (c) { return '<td style="padding:5px 8px;border-bottom:1px solid #eee4d0">' + esc_(c) + '</td>'; }).join('') + '</tr>'; }).join('') : '<tr><td colspan="' + enc.length + '" style="padding:5px 8px;color:#888">Sin datos</td></tr>') + '</table>';
  };
  var c = r.clientes, h = '<div style="font-family:Georgia,serif;color:#2b1d1a;max-width:720px;margin:auto">' +
    '<h1 style="color:#4a1519;font-size:22px;margin-bottom:2px">' + esc_(titulo) + '</h1><p style="color:#777;margin-top:0">' + esc_(r.desde) + ' al ' + esc_(r.hasta) + '</p>' +
    '<p style="font-size:16px"><b>' + sol(r.ventas) + '</b> en ventas · <b>' + r.pedidos + '</b> pedidos · ticket promedio <b>' + sol(r.ticket) + '</b><br>' +
    'Cancelados: ' + r.cancelados.pedidos + ' (' + sol(r.cancelados.monto) + ')</p>';
  h += '<h3>Por canal</h3>' + tabla(['Canal', 'Pedidos', 'Ventas'], r.porCanal.map(function (x) { return [x.k, x.pedidos, sol(x.ventas)]; }));
  h += '<h3>Método de pago</h3>' + tabla(['Método', 'Cobros', 'Monto'], r.porPago.map(function (x) { return [x.k, x.pedidos, sol(x.ventas)]; }));
  h += '<h3>Más vendidos</h3>' + tabla(['Producto', 'Unidades', 'Ventas'], r.top.map(function (x) { return [x.k, x.unidades, sol(x.ventas)]; }));
  h += '<h3>Menos vendidos</h3>' + tabla(['Producto', 'Unidades', 'Ventas'], r.bottom.map(function (x) { return [x.k, x.unidades, sol(x.ventas)]; }));
  h += '<h3>Descuentos y ajustes</h3><p>' + r.ajustes.pedidos + ' pedidos con ajuste · descuentos ' + sol(r.ajustes.descuentos) + ' · recargos ' + sol(r.ajustes.recargos) + '</p>';
  h += '<h3>Clientes</h3>' + tabla(['Grupo', 'Clientes', 'Pedidos', 'Ventas'], [['Nuevos', c.nuevos, c.pedidosNuevos, sol(c.ventasNuevos)], ['Recurrentes', c.recurrentes, c.pedidosRecurrentes, sol(c.ventasRecurrentes)], ['Sin teléfono', '', c.pedidosSinTelefono, sol(c.ventasSinTelefono)]]);
  if (extra) h += extra;
  return h + '<p style="color:#999;font-size:11px">Generado por el panel de Pasta Gallo.</p></div>';
}
function mesRango_(anio, mes) {
  var ult = new Date(Date.UTC(anio, mes, 0)).getUTCDate(), m = dosDig_(mes);
  return { desde: anio + '-' + m + '-01', hasta: anio + '-' + m + '-' + dosDig_(ult), etiqueta: anio + '-' + m };
}
var MESES_ES_ = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];

/** Arma y envía el reporte del mes (anio, mes 1..12) a los correos de Config reporte_correos. */
function reporteMensualEnviar_(anio, mes) {
  var cfg = leerConfig_(), zona = cfg.zona_horaria || 'America/Lima';
  var correos = parseCorreos_(cfg.reporte_correos).slice(0, 10);
  if (!correos.length) throw extError_('Primero escribe al menos un correo válido para el reporte.');
  var rg = mesRango_(anio, mes), r = reporteAgregar_(reporteDatos_(zona), rg.desde, rg.hasta, zona);
  var extra = '';
  if (moduloActivo_(cfg, 'clientes')) {
    var ops = leerTabla_(HOJA_OPINIONES).filter(function (o) { return o.fecha instanceof Date && fechaCorta_(o.fecha, zona) >= rg.desde && fechaCorta_(o.fecha, zona) <= rg.hasta; });
    if (ops.length) extra = '<h3>Opiniones del mes</h3><p>' + ops.length + ' opiniones · promedio ' + r2_(ops.reduce(function (s, o) { return s + numSeguro_(o.estrellas); }, 0) / ops.length) + ' de 5</p>';
  }
  var titulo = String(cfg.nombre || 'Pasta Gallo') + ' · Reporte de ' + MESES_ES_[mes - 1] + ' ' + anio;
  var html = reporteHtml_(r, titulo, extra), adj = [];
  try { adj.push(Utilities.newBlob(html, 'text/html', 'reporte.html').getAs('application/pdf').setName('reporte-' + rg.etiqueta + '.pdf')); }
  catch (e) { console.error('PDF del reporte no disponible', e); }
  MailApp.sendEmail({ to: correos.join(','), subject: titulo, htmlBody: html, attachments: adj, name: String(cfg.nombre || 'Pasta Gallo') });
  return { correos: correos.length, pdf: adj.length > 0, mes: rg.etiqueta, ventas: r.ventas, pedidos: r.pedidos };
}
function mesAnterior_(zona) {
  var hoy = Utilities.formatDate(new Date(), zona, 'yyyy-MM-dd').split('-'), a = Number(hoy[0]), m = Number(hoy[1]) - 1;
  if (m < 1) { m = 12; a--; }
  return { anio: a, mes: m };
}
/** La llama el activador mensual (nombre fijo: Apps Script la busca por texto). No hace nada si el módulo o los correos están apagados. */
function reporteMensualAutomatico() {
  var cfg = leerConfig_();
  if (!moduloActivo_(cfg, 'reportes') || !parseCorreos_(cfg.reporte_correos).length) return;
  var zona = cfg.zona_horaria || 'America/Lima', pm = mesAnterior_(zona), clave = pm.anio + '-' + dosDig_(pm.mes);
  var props = PropertiesService.getScriptProperties();
  if (props.getProperty('REPORTE_ULTIMO') === clave) return;   // ya se envió ese mes
  try { reporteMensualEnviar_(pm.anio, pm.mes); props.setProperty('REPORTE_ULTIMO', clave); auditar_('activador', 'Reporte mensual enviado', clave); }
  catch (e) { console.error(e); try { auditar_('activador', 'Reporte mensual falló', String(e && e.message || e).slice(0, 100)); } catch (e2) { /* sin más */ } }
}
function activadorReporte_() {
  return ScriptApp.getProjectTriggers().filter(function (t) { return t.getHandlerFunction && t.getHandlerFunction() === 'reporteMensualAutomatico'; });
}
function reporteMensualEstado(sesion) {
  modExigir_(sesion, 'reportes');
  var cfg = leerConfig_();
  return { ok: true, correos: String(cfg.reporte_correos == null ? '' : cfg.reporte_correos), instalado: activadorReporte_().length > 0,
    ultimo: PropertiesService.getScriptProperties().getProperty('REPORTE_ULTIMO') || '' };
}
function reporteMensualGuardarCorreos(sesion, texto) {
  var q = modExigir_(sesion, 'reportes');
  var partes = String(texto == null ? '' : texto).split(/[,;\s]+/).filter(function (x) { return x.trim(); });
  var buenos = parseCorreos_(texto);
  if (partes.some(function (x) { return !parseCorreos_(x).length; })) throw new Error('Hay un correo que no es válido. Revisa que estén separados por comas.');
  if (buenos.length > 10) throw new Error('Máximo 10 correos.');
  guardarClave_('reporte_correos', buenos.join(', '));
  auditar_(q, 'Cambió correos del reporte', buenos.length + ' correos');
  return { ok: true, correos: buenos.join(', ') };
}
/** Envío inmediato (acción explícita del administrador). mesTexto = 'yyyy-MM' (vacío = mes anterior). */
function reporteMensualPrueba(sesion, mesTexto) {
  var q = modExigir_(sesion, 'reportes'), zona = leerConfig_().zona_horaria || 'America/Lima', pm = mesAnterior_(zona);
  var m = /^(\d{4})-(\d{2})$/.exec(String(mesTexto || ''));
  var anio = m ? Number(m[1]) : pm.anio, mes = m ? Number(m[2]) : pm.mes;
  if (mes < 1 || mes > 12 || anio < 2020 || anio > 2100) throw new Error('Mes no válido.');
  var r = reporteMensualEnviar_(anio, mes);
  auditar_(q, 'Envió reporte mensual', r.mes + ' a ' + r.correos + ' correo(s)');
  return { ok: true, enviado: r };
}
function reporteMensualInstalar(sesion) {
  var q = modExigir_(sesion, 'reportes');
  if (!parseCorreos_(leerConfig_().reporte_correos).length) throw new Error('Primero guarda al menos un correo para el reporte.');
  if (!activadorReporte_().length) ScriptApp.newTrigger('reporteMensualAutomatico').timeBased().onMonthDay(1).atHour(8).create();
  auditar_(q, 'Activó envío mensual del reporte', 'día 1 de cada mes');
  return { ok: true, instalado: true };
}
function reporteMensualQuitar(sesion) {
  var q = modExigir_(sesion, 'reportes');
  activadorReporte_().forEach(function (t) { ScriptApp.deleteTrigger(t); });
  auditar_(q, 'Quitó envío mensual del reporte', '');
  return { ok: true, instalado: false };
}
