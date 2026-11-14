/* Service worker del panel del mozo: permite instalarlo como app y abrirlo aunque la señal falle un momento.
   Siempre intenta primero la red (precios y disponibilidad al día); solo usa la copia guardada si no hay conexión.
   Nunca toca los pedidos (van a script.google.com con POST). */
var CACHE = "pg-mozo-v5";
self.addEventListener("install", function (e) {
  e.waitUntil(caches.open(CACHE).then(function (c) { return c.addAll(["/mozo.css", "/mozo.js", "/menu-data.js", "/mozo-192.png"]); }).catch(function () {}));
  self.skipWaiting();
});
self.addEventListener("activate", function (e) {
  e.waitUntil(caches.keys().then(function (ks) { return Promise.all(ks.filter(function (k) { return k !== CACHE; }).map(function (k) { return caches.delete(k); })); }));
  self.clients.claim();
});
self.addEventListener("fetch", function (e) {
  var r = e.request;
  if (r.method !== "GET" || new URL(r.url).origin !== location.origin) return;
  // fotos: primero la copia guardada (ahorra datos); el resto: primero la red
  if (new URL(r.url).pathname.indexOf("/fotos/") === 0) {
    e.respondWith(caches.match(r).then(function (hit) {
      return hit || fetch(r).then(function (res) { if (res.ok) { var c2 = res.clone(); caches.open(CACHE).then(function (c) { c.put(r, c2); }); } return res; });
    }));
    return;
  }
  // app del mozo y carta: abre al instante con la copia guardada y la renueva por detrás (la próxima vez sale la nueva)
  var ruta = new URL(r.url).pathname;
  if (["/mozo.js", "/mozo.css", "/menu-data.js"].indexOf(ruta) >= 0) {
    e.respondWith(caches.open(CACHE).then(function (c) {
      return c.match(r, { ignoreSearch: true }).then(function (hit) {
        var red = fetch(r).then(function (res) { if (res.ok) c.put(r, res.clone()); return res; });
        if (hit) { e.waitUntil(red.catch(function () {})); return hit; }
        return red;
      });
    }));
    return;
  }
  e.respondWith(fetch(r).then(function (res) {
    if (res.ok && res.type === "basic") { var copia = res.clone(); caches.open(CACHE).then(function (c) { c.put(r, copia); }); }
    return res;
  }).catch(function () { return caches.match(r, { ignoreSearch: true }); }));
});
