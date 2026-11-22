/* =========================== MÓDULO: BÚSQUEDA INTELIGENTE Y PEDIDO POR VOZ ===========================
   Casi todo vive en el navegador (busqueda.js). El servidor solo hace UNA cosa: cuando Config modulo_busqueda = SI,
   publica la bandera CARTA.ext.busqueda = { activo: true } en menu-data.js; pedido.js ve esa bandera y carga busqueda.js.
   Apagado (valor por defecto) no publica nada y la web se comporta exactamente igual que antes.
   No hay hojas ni columnas nuevas, ni acciones POST: el pedido final sigue yendo por registrarPedido_ con precios recalculados
   en el servidor, así que nada de lo que interprete el navegador se confía tal cual. */
extRegistrar_('busqueda');
EXT_PUBLICO['busqueda'] = function (cfg) { return { activo: true }; };
