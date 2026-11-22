/* =========================== BASE DE MÓDULOS ===========================
   Cada módulo nuevo (tienda, repartidores, inventario…) vive en sus propios archivos y se ENCIENDE desde Ajustes > Módulos
   (clave Config modulo_<nombre> = SI). Apagado, no cambia nada de lo anterior.

   Cómo se conecta un módulo (ejemplo: "inventario", archivo Inventario.gs):
     EXT_ACCIONES['inventario'] = function (body) { ... return { ok: true, ... }; };   // lo llama doPost con { ext: 'inventario', ... }
     EXT_PUBLICO['inventario']  = function (cfg) { return { ... }; };                  // datos públicos que van a la carta (CARTA.ext.inventario)
     EXT_GET['inventario']      = function (params) { ... };                           // lectura pública por GET ?ext=inventario (opcional)
   Personal con enlace (cajero, repartidor, cocina): body.t = llave del equipo; se valida con extPersonal_(body, ['cajero']).
   Pantallas del panel de administración: archivos HTML ExtInventarioNav / ExtInventarioViews / ExtInventarioJs (el nombre con
   la inicial en mayúscula). Se incluyen solos mientras el módulo esté activo. Funciones que llama el panel: nombres globales
   SIN guion bajo final, con la sesión como primer argumento y exigirAdmin_(sesion) adentro.
   Errores que el usuario debe leer: throw extError_('mensaje'). Cualquier otro error se registra y devuelve un mensaje genérico. */
var EXT_ACCIONES = EXT_ACCIONES || {};
var EXT_PUBLICO = EXT_PUBLICO || {};
var EXT_GET = EXT_GET || {};
var EXT_MODULOS = EXT_MODULOS || [];   // nombres en minúscula; cada módulo se agrega con extRegistrar_('nombre')
var ROLES_PERSONAL = ['mozo', 'cajero', 'repartidor', 'cocina'];

function extRegistrar_(nombre) { if (EXT_MODULOS.indexOf(nombre) < 0) EXT_MODULOS.push(nombre); }
function extError_(msg) { var e = new Error(msg); e.userError = true; return e; }
function moduloActivo_(cfg, nombre) { return esSi_((cfg || leerConfig_())['modulo_' + nombre]); }
function validarRol_(r) {
  r = String(r == null ? '' : r).trim().toLowerCase();
  if (ROLES_PERSONAL.indexOf(r) < 0) throw new Error('Rol no válido. Usa mozo, cajero, repartidor o cocina.');
  return r;
}
function rolDe_(mozo) { var r = String(mozo && mozo.rol || 'mozo').toLowerCase(); return ROLES_PERSONAL.indexOf(r) >= 0 ? r : 'mozo'; }

/** Valida la llave del equipo (body.t) y el rol. Devuelve { id, nombre, rol } o lanza un error que el usuario puede leer. */
function extPersonal_(body, rolesPermitidos) {
  var m = mozoDeLlave_(body && body.t);
  if (!m) { var e = extError_('Este equipo ya no está vinculado. Pide un enlace nuevo al administrador.'); e.sesion = false; throw e; }
  var rol = rolDe_(m);
  if (rolesPermitidos && rolesPermitidos.indexOf(rol) < 0) throw extError_('Tu rol (' + rol + ') no tiene permiso para esto.');
  return { id: m.id, nombre: m.nombre, rol: rol };
}

function despacharExt_(body) {
  var nombre = String(body && body.ext || '').toLowerCase();
  var fn = EXT_ACCIONES[nombre];
  if (!fn) return { ok: false, error: 'Acción no válida.' };
  if (!moduloActivo_(null, nombre)) return { ok: false, error: 'Este módulo no está activo.' };
  try { return fn(body) || { ok: false, error: 'Sin respuesta.' }; }
  catch (err) {
    var r = { ok: false, error: err && err.userError ? err.message : 'No se pudo completar. Intenta de nuevo.' };
    if (err && err.sesion === false) r.sesion = false;
    if (!(err && err.userError)) console.error(err);
    return r;
  }
}
function despacharExtGet_(p) {
  var nombre = String(p && p.ext || '').toLowerCase();
  var fn = EXT_GET[nombre];
  if (!fn || !moduloActivo_(null, nombre)) return { ok: false, error: 'No disponible.' };
  try { return fn(p) || { ok: false }; } catch (err) { if (!(err && err.userError)) console.error(err); return { ok: false, error: err && err.userError ? err.message : 'No disponible.' }; }
}
/** Lo que cada módulo ACTIVO publica en la carta (CARTA.ext.<módulo>). */
function extPublico_(cfg) {
  var out = {};
  Object.keys(EXT_PUBLICO).forEach(function (k) {
    if (!moduloActivo_(cfg, k)) return;
    try { out[k] = EXT_PUBLICO[k](cfg); } catch (e) { console.error(e); }
  });
  return out;
}
/** Une las partes HTML ('nav', 'views' o 'js') de los módulos activos para el panel de administración. */
function extIncluir_(parte) {
  var cfg = leerConfig_(), out = '';
  var cap = { nav: 'Nav', views: 'Views', js: 'Js' }[parte];
  if (!cap) return '';
  EXT_MODULOS.forEach(function (m) {
    if (!moduloActivo_(cfg, m)) return;
    try { out += HtmlService.createHtmlOutputFromFile('Ext' + m.charAt(0).toUpperCase() + m.slice(1) + cap).getContent() + '\n'; } catch (e) { /* el módulo no tiene esa parte */ }
  });
  return out;
}
