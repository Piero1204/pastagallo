/* Service worker del panel del mozo / tienda: permite instalarlo como app y abrirlo aunque la señal falle un momento.
   RED PRIMERO para todo (la app, la carta y los precios siempre al día): la copia guardada SOLO se usa si no hay conexión
   o si la red tarda más de 1,5 s (antes 4 s, y la página misma esperaba a la red sin límite): con señal floja la app abre
   igual al instante con lo guardado, y la red sigue de fondo para dejar la copia al día en la próxima apertura.
   Al publicar una versión nueva de este archivo, toma el control de inmediato (skipWaiting + clients.claim) y la app se recarga sola una vez.
   Nunca toca los pedidos (van a script.google.com con POST). */
var CACHE = "pg-mozo-v13";
var APP = ["/mozo.js", "/mozo.css", "/local.js", "/local.css", "/cajero.js", "/tienda-codigos.js", "/caja.js", "/busqueda.js", "/cocina.js", "/menu-data.js"];
self.addEventListener("install", function (e) {
  // cada archivo por separado: si uno falla, los demás igual se guardan
  e.waitUntil(caches.open(CACHE).then(function (c) {
    return Promise.all(APP.concat(["/mozo-192.png", "/tienda-192.png", "/local-192.png"]).map(function (u) { return fetch(u, { cache: "no-cache" }).then(function (r) { if (r.ok) return c.put(u, r); }).catch(function () {}); }));
  }).catch(function () {}));
  self.skipWaiting();
});
self.addEventListener("activate", function (e) {
  e.waitUntil(caches.keys().then(function (ks) { return Promise.all(ks.filter(function (k) { return k !== CACHE; }).map(function (k) { return caches.delete(k); })); })
    .then(function () { return self.clients.claim(); }));
});
self.addEventListener("message", function (e) { if (e.data === "saltar") self.skipWaiting(); });
/* red con límite de tiempo: si en `ms` no respondió y hay copia, se usa la copia (y la red sigue para actualizarla) */
var ESPERA = 1500;
function redPrimero(r, ms, clave) {
  return caches.open(CACHE).then(function (c) {
    // una navegación no admite opciones en fetch(); el resto se pide sin la caché HTTP del navegador
    var red = (r.mode === "navigate" ? fetch(r) : fetch(r, { cache: "no-cache" })).then(function (res) {
      // el enlace secreto del mozo es la página 404 de Cloudflare (estado 404): también se guarda, es el armazón de la app
      if (res && (res.ok || (r.mode === "navigate" && res.status === 404)) && res.type === "basic") c.put(clave || r, res.clone());
      return res;
    });
    var porTiempo = new Promise(function (ok) { setTimeout(ok, ms); }).then(function () { return c.match(clave || r, { ignoreSearch: true }); });
    return Promise.race([red.catch(function () { return null; }), porTiempo.then(function (hit) { return hit || red; })]).then(function (res) {
      if (res) return res;
      return c.match(clave || r, { ignoreSearch: true }).then(function (hit) { return hit || red; });
    });
  });
}
self.addEventListener("fetch", function (e) {
  var r = e.request;
  if (r.method !== "GET" || new URL(r.url).origin !== location.origin) return;
  var ruta = new URL(r.url).pathname;
  // fotos y fuentes: primero la copia guardada (ahorra datos; cambian de nombre cuando cambian)
  if (ruta.indexOf("/fotos/") === 0 || ruta.indexOf("/fuentes/") === 0) {
    e.respondWith(caches.match(r).then(function (hit) {
      return hit || fetch(r).then(function (res) { if (res.ok) { var c2 = res.clone(); caches.open(CACHE).then(function (c) { c.put(r, c2); }); } return res; });
    }));
    return;
  }
  // app del mozo y carta: la versión publicada (red primero, 1,5 s); si la red no responde a tiempo, la copia
  if (APP.indexOf(ruta) >= 0) { e.respondWith(redPrimero(r, ESPERA, ruta)); return; }
  // páginas (el enlace secreto del mozo): igual, red primero con 1,5 s de límite
  if (r.mode === "navigate") { e.respondWith(redPrimero(r, ESPERA)); return; }
  // lo demás: red primero; sin conexión, la copia
  e.respondWith(fetch(r).then(function (res) {
    if (res.ok && res.type === "basic") { var copia = res.clone(); caches.open(CACHE).then(function (c) { c.put(r, copia); }); }
    return res;
  }).catch(function () { return caches.match(r, { ignoreSearch: true }); }));
});
