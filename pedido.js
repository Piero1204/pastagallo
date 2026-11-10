/* Pasta Gallo · carrito y envío de pedidos (delivery, recojo y mesa).
   No necesitas editar este archivo: todo se configura desde el panel. */
(function () {
  "use strict";
  var C = window.CARTA, CFG = C.pedidos || {};
  var MODO = window.MODO === "mesa" ? "mesa" : "delivery";
  var params = new URLSearchParams(location.search);
  var MESA = MODO === "mesa" ? (params.get("m") || "").slice(0, 6) : "";
  var CODIGO = MODO === "mesa" ? (params.get("c") || "").slice(0, 20) : "";
  var CLAVE = "pg-carrito-" + MODO + (MESA ? "-" + MESA : "");
  var carrito = [];
  var P; // utilidades de app.js (window.PG)

  function guardar() { try { localStorage.setItem(CLAVE, JSON.stringify({ t: Date.now(), c: carrito })); } catch (e) {} }
  function cargar() {
    try {
      var o = JSON.parse(localStorage.getItem(CLAVE) || "null");
      if (o && Date.now() - o.t < 6 * 3600 * 1000 && Array.isArray(o.c)) carrito = o.c;
    } catch (e) { carrito = []; }
  }

  var productos = {}, seccionDe = {};
  C.secciones.forEach(function (s) {
    s.grupos.forEach(function (g) { g.items.forEach(function (it) { productos[it.id] = it; seccionDe[it.id] = s; }); });
  });
  var salsas = (C.salsas || []).filter(function (s) { return !s.agotado; });

  /* ---------- reglas ---------- */
  function abiertoAhora() { return P.estadoActual().abierto; }
  function mesaValida() { return MODO !== "mesa" || (MESA && CODIGO); }
  function activo() {
    if (!CFG.activos) return false;
    if (MODO === "mesa") return !!(CFG.api && CFG.mesaActivos && mesaValida());
    return true; // sin api, el delivery funciona solo por WhatsApp
  }
  function aceptaAhora() {
    if (!activo()) return false;
    if (abiertoAhora()) return true;
    return MODO === "delivery" && !!CFG.fueraHorario;
  }
  function puedePedir(it, sec) {
    if (!activo() || it.tipo === "salsa" || it.agotado) return false;
    if (MODO === "mesa" ? !sec.mesa : !sec.delivery) return false;
    if (it.p == null && !(it.t && it.t.length)) return false;
    if (it.salsa && !salsas.length) return false;
    return true;
  }

  /* ---------- dinero ---------- */
  function soles(n) { return "S/ " + Number(n).toFixed(2); }
  function total() { return carrito.reduce(function (a, l) { return a + l.unit * l.cant; }, 0); }
  function unidades() { return carrito.reduce(function (a, l) { return a + l.cant; }, 0); }

  /* ---------- elementos ---------- */
  var h; // = P.h
  function boton(texto, cls, fn) { var b = h("button", cls, texto); b.type = "button"; b.addEventListener("click", fn); return b; }

  var capa, hoja, barra, barraTxt, barraTot, ultimoFoco;
  function abrirHoja(contenido, titulo) {
    ultimoFoco = document.activeElement;
    hoja.textContent = "";
    var cab = h("div", "hoja__cab");
    cab.appendChild(h("h2", null, titulo));
    var x = boton("×", "hoja__x", cerrarHoja); x.setAttribute("aria-label", "Cerrar");
    cab.appendChild(x);
    hoja.appendChild(cab);
    hoja.appendChild(contenido);
    hoja.setAttribute("aria-label", titulo);
    capa.classList.add("on");
    document.body.classList.add("sin-scroll");
    setTimeout(function () { var f = hoja.querySelector("input,button:not(.hoja__x),select,textarea"); (f || x).focus(); }, 60);
  }
  function cerrarHoja() {
    capa.classList.remove("on");
    document.body.classList.remove("sin-scroll");
    if (ultimoFoco && ultimoFoco.focus) ultimoFoco.focus();
  }

  function stepper(valor, min, max, alCambiar) {
    var w = h("div", "stepper");
    var menos = boton("−", "", function () { if (valor > min) { valor--; out.textContent = valor; alCambiar(valor); } });
    var mas = boton("+", "", function () { if (valor < max) { valor++; out.textContent = valor; alCambiar(valor); } });
    menos.setAttribute("aria-label", "Quitar uno"); mas.setAttribute("aria-label", "Agregar uno");
    var out = h("output", null, String(valor)); out.setAttribute("aria-live", "polite");
    w.appendChild(menos); w.appendChild(out); w.appendChild(mas);
    return w;
  }

  function radios(nombre, opciones, alCambiar) {
    var w = h("div", "opciones"); w.setAttribute("role", "radiogroup");
    opciones.forEach(function (o, i) {
      var l = h("label", "opcion");
      var r = h("input"); r.type = "radio"; r.name = nombre; r.value = o.valor;
      if (o.marcado) r.checked = true;
      r.addEventListener("change", function () { alCambiar(o.valor); });
      l.appendChild(r);
      var t = h("span", "opcion__t", o.texto); l.appendChild(t);
      if (o.extra) l.appendChild(h("span", "opcion__p", o.extra));
      w.appendChild(l);
    });
    return w;
  }

  /* ---------- elegir opciones de un plato ---------- */
  function abrirOpciones(it) {
    var sel = { tam: it.t ? it.t[0][0] : "", salsa: "", cant: 1, nota: "" };
    var c = h("div", "hoja__cuerpo");
    if (it.d) c.appendChild(h("p", "hoja__desc", it.d));
    function precioUnit() {
      var base = it.t ? (it.t.filter(function (x) { return x[0] === sel.tam; })[0] || it.t[0])[1] : it.p;
      var s = salsas.filter(function (x) { return x.id === sel.salsa; })[0];
      return base + (s ? s.extra : 0);
    }
    if (it.t) {
      c.appendChild(h("h3", "hoja__sub", "Tamaño"));
      c.appendChild(radios("tam", it.t.map(function (x, i) { return { valor: x[0], texto: x[0], extra: soles(x[1]), marcado: i === 0 }; }),
        function (v) { sel.tam = v; pintar(); }));
    }
    if (it.salsa) {
      c.appendChild(h("h3", "hoja__sub", "Elige tu salsa"));
      if (it.id && /tris/.test(it.id)) c.appendChild(h("p", "hoja__ayuda", "La salsa acompaña al fettuccine y a los raviolini."));
      c.appendChild(radios("salsa", salsas.map(function (s) { return { valor: s.id, texto: s.n, extra: s.extra ? "+ " + soles(s.extra) : "" }; }),
        function (v) { sel.salsa = v; err.textContent = ""; pintar(); }));
    }
    c.appendChild(h("h3", "hoja__sub", "Indicaciones (opcional)"));
    var nota = h("input", "campo"); nota.type = "text"; nota.maxLength = 120; nota.placeholder = "Ej.: sin aceitunas, bien cocida…";
    nota.addEventListener("input", function () { sel.nota = nota.value; });
    c.appendChild(nota);
    var pie = h("div", "hoja__pie");
    pie.appendChild(stepper(1, 1, 20, function (v) { sel.cant = v; pintar(); }));
    var add = boton("", "btn-ped", function () {
      if (it.salsa && !sel.salsa) { err.textContent = "Elige una salsa para continuar."; return; }
      agregar(it, sel, precioUnit());
      cerrarHoja();
    });
    pie.appendChild(add);
    var err = h("p", "hoja__err"); err.setAttribute("role", "alert");
    c.appendChild(err);
    c.appendChild(pie);
    function pintar() { add.textContent = "Agregar · " + soles(precioUnit() * sel.cant); }
    pintar();
    abrirHoja(c, it.n);
  }

  function agregar(it, sel, unit) {
    var s = salsas.filter(function (x) { return x.id === sel.salsa; })[0];
    var key = [it.id, sel.tam, sel.salsa, sel.nota].join("|");
    var ex = carrito.filter(function (l) { return l.key === key; })[0];
    if (ex) ex.cant = Math.min(20, ex.cant + sel.cant);
    else carrito.push({ key: key, id: it.id, n: it.n, tam: sel.tam, salsa: sel.salsa, salsaN: s ? s.n : "", unit: unit,
      cant: sel.cant, nota: sel.nota.trim(), alcohol: !!seccionDe[it.id].alcohol });
    guardar(); pintarBarra(true);
    aviso(it.n + " agregado al pedido");
  }

  function clicAgregar(it) {
    if (!aceptaAhora()) { aviso(MODO === "mesa" ? "El restaurante está cerrado en este momento." : "Estamos cerrados. Vuelve en nuestro horario."); return; }
    if (it.t || it.salsa) abrirOpciones(it);
    else agregar(it, { tam: "", salsa: "", cant: 1, nota: "" }, it.p);
  }

  /* ---------- aviso flotante ---------- */
  var toast, toastT;
  function aviso(t) {
    toast.textContent = t; toast.classList.add("on");
    clearTimeout(toastT); toastT = setTimeout(function () { toast.classList.remove("on"); }, 2200);
  }

  /* ---------- barra del carrito ---------- */
  function pintarBarra(animar) {
    var n = unidades();
    barra.classList.toggle("on", n > 0);
    document.body.classList.toggle("con-carrito", n > 0);
    barraTxt.textContent = "Ver mi pedido · " + n + (n === 1 ? " producto" : " productos");
    barraTot.textContent = soles(total());
    if (animar) { barra.classList.remove("pulso"); void barra.offsetWidth; barra.classList.add("pulso"); }
  }

  /* ---------- carrito y formulario ---------- */
  var form = {};
  function abrirCarrito() {
    var c = h("div", "hoja__cuerpo");
    if (!carrito.length) { c.appendChild(h("p", "hoja__desc", "Tu pedido está vacío.")); abrirHoja(c, "Tu pedido"); return; }
    var lista = h("ul", "lineas");
    function pintarLista() {
      lista.textContent = "";
      carrito.forEach(function (l, i) {
        var li = h("li", "linea");
        var info = h("div", "linea__info");
        info.appendChild(h("strong", null, l.n + (l.tam ? " · " + l.tam : "")));
        if (l.salsaN) info.appendChild(h("span", null, "Salsa: " + l.salsaN));
        if (l.nota) info.appendChild(h("span", null, "Nota: " + l.nota));
        info.appendChild(h("span", "linea__p", soles(l.unit * l.cant)));
        li.appendChild(info);
        li.appendChild(stepper(l.cant, 0, 20, function (v) {
          if (v === 0) carrito.splice(i, 1); else l.cant = v;
          guardar(); pintarBarra(); if (!carrito.length) { cerrarHoja(); return; } pintarLista();
        }));
        lista.appendChild(li);
      });
      tot.textContent = soles(total());
    }
    var tot = h("strong");
    c.appendChild(lista);
    var tl = h("div", "total"); tl.appendChild(h("span", null, MODO === "mesa" ? "Total" : "Total productos")); tl.appendChild(tot);
    c.appendChild(tl);
    pintarLista();
    c.appendChild(formulario());
    abrirHoja(c, MODO === "mesa" ? "Pedido · Mesa " + MESA : "Tu pedido");
  }

  function campo(nombre, etiqueta, tipo, opc) {
    opc = opc || {};
    var w = h("label", "campo-w");
    w.appendChild(h("span", "campo-l", etiqueta));
    var i = tipo === "area" ? h("textarea", "campo") : h("input", "campo");
    if (tipo !== "area") i.type = tipo || "text";
    i.name = nombre; i.value = form[nombre] || ""; i.maxLength = opc.max || 120;
    if (opc.ph) i.placeholder = opc.ph;
    if (opc.auto) i.autocomplete = opc.auto;
    if (opc.modo) i.inputMode = opc.modo;
    i.addEventListener("input", function () { form[nombre] = i.value; });
    w.appendChild(i);
    return w;
  }

  function formulario() {
    var f = h("form", "form"); f.noValidate = true;
    var hp = h("input", "trampa"); hp.name = "web"; hp.tabIndex = -1; hp.autocomplete = "off"; hp.setAttribute("aria-hidden", "true");
    f.appendChild(hp);
    var zona = h("div");
    if (MODO === "mesa") {
      f.appendChild(campo("nombre", "¿A nombre de quién? (opcional)", "text", { max: 60, auto: "given-name" }));
      f.appendChild(campo("notas", "Comentarios para la cocina (opcional)", "area", { max: 300 }));
    } else {
      if (!form.canal) form.canal = "delivery";
      if (!CFG.recojo) form.canal = "delivery";
      if (CFG.recojo) {
        f.appendChild(h("h3", "hoja__sub", "¿Cómo lo quieres?"));
        f.appendChild(radios("canal", [
          { valor: "delivery", texto: "Delivery a domicilio", marcado: form.canal === "delivery" },
          { valor: "recojo", texto: "Recojo en el local", marcado: form.canal === "recojo" }
        ], function (v) { form.canal = v; pintarZona(); }));
      }
      f.appendChild(zona);
      f.appendChild(campo("nombre", "Nombre", "text", { max: 60, auto: "name" }));
      f.appendChild(campo("telefono", "Celular", "tel", { max: 16, auto: "tel", modo: "tel", ph: "9XX XXX XXX" }));
      if (CFG.metodosPago && CFG.metodosPago.length) {
        f.appendChild(h("h3", "hoja__sub", "¿Cómo vas a pagar?"));
        f.appendChild(radios("pago", CFG.metodosPago.map(function (m) { return { valor: m, texto: m, marcado: form.pago === m }; }),
          function (v) { form.pago = v; }));
      }
      if (!abiertoAhora() || form.programado) {
        f.appendChild(campo("programado", abiertoAhora() ? "¿Para qué hora? (opcional)" : "¿Para qué hora lo quieres?", "time", {}));
      }
      f.appendChild(campo("notas", "Comentarios (opcional)", "area", { max: 300 }));
      if (carrito.some(function (l) { return l.alcohol; })) {
        var lb = h("label", "check");
        var ck = h("input"); ck.type = "checkbox"; ck.checked = !!form.mayorEdad;
        ck.addEventListener("change", function () { form.mayorEdad = ck.checked; });
        lb.appendChild(ck); lb.appendChild(h("span", null, "Confirmo que soy mayor de 18 años (tu pedido incluye alcohol)."));
        f.appendChild(lb);
      }
    }
    function pintarZona() {
      zona.textContent = "";
      if (MODO === "mesa" || form.canal !== "delivery") {
        if (form.canal === "recojo") zona.appendChild(h("p", "hoja__ayuda", "Recógelo en " + C.negocio.direccion + "."));
        return;
      }
      zona.appendChild(campo("direccion", "Dirección de entrega", "text", { max: 200, auto: "street-address" }));
      zona.appendChild(campo("referencia", "Referencia (opcional)", "text", { max: 200, ph: "Ej.: frente al parque, puerta verde" }));
      if (CFG.textoDelivery) zona.appendChild(h("p", "hoja__ayuda", CFG.textoDelivery));
    }
    pintarZona();
    var err = h("p", "hoja__err"); err.setAttribute("role", "alert");
    f.appendChild(err);
    f.addEventListener("input", function () { err.textContent = ""; });
    f.addEventListener("change", function () { err.textContent = ""; });
    var enviar = h("button", "btn-ped", MODO === "mesa" ? "Enviar pedido a cocina" : "Enviar pedido");
    enviar.type = "submit";
    f.appendChild(enviar);
    f.addEventListener("submit", function (ev) {
      ev.preventDefault();
      var e = validar();
      if (e) { err.textContent = e; return; }
      err.textContent = "";
      enviar.disabled = true; enviar.textContent = "Enviando…";
      enviarPedido(hp.value).then(function (r) {
        enviar.disabled = false; enviar.textContent = MODO === "mesa" ? "Enviar pedido a cocina" : "Enviar pedido";
        if (r && r.error) err.textContent = r.error;
      });
    });
    return f;
  }

  function validar() {
    if (!carrito.length) return "Tu pedido está vacío.";
    if (MODO === "mesa") return "";
    if (!form.nombre || form.nombre.trim().length < 2) return "Escribe tu nombre.";
    if (String(form.telefono || "").replace(/\D/g, "").length < 9) return "Escribe un número de celular válido.";
    if (form.canal === "delivery" && (!form.direccion || form.direccion.trim().length < 5)) return "Escribe la dirección de entrega.";
    if (CFG.metodosPago && CFG.metodosPago.length && !form.pago) return "Elige cómo vas a pagar.";
    if (!abiertoAhora() && !form.programado) return "Estamos cerrados: indica a qué hora quieres tu pedido.";
    if (carrito.some(function (l) { return l.alcohol; }) && !form.mayorEdad) return "Confirma que eres mayor de 18 años.";
    return "";
  }

  function cuerpoPedido(trampa) {
    return {
      canal: MODO === "mesa" ? "mesa" : form.canal, mesa: MESA, codigo: CODIGO, web: trampa || "",
      nombre: form.nombre || "", telefono: form.telefono || "", direccion: form.canal === "delivery" ? (form.direccion || "") : "",
      referencia: form.canal === "delivery" ? (form.referencia || "") : "", pago: form.pago || "",
      programado: form.programado || "", notas: form.notas || "", mayorEdad: !!form.mayorEdad,
      items: carrito.map(function (l) { return { id: l.id, tam: l.tam, salsa: l.salsa, cant: l.cant, nota: l.nota }; })
    };
  }

  function mensajeWhatsapp(numero, totalServidor, detalle) {
    var L = [];
    L.push("Hola " + C.negocio.nombre + ", quiero confirmar mi pedido" + (numero ? " #" + numero : "") + ".");
    L.push(form.canal === "recojo" ? "*Recojo en el local*" : "*Delivery*");
    L.push("");
    if (detalle) L.push(detalle);
    else carrito.forEach(function (l) {
      L.push(l.cant + " × " + l.n + (l.tam ? " (" + l.tam + ")" : "") + " — " + soles(l.unit * l.cant));
      if (l.salsaN) L.push("    Salsa: " + l.salsaN);
      if (l.nota) L.push("    Nota: " + l.nota);
    });
    L.push("");
    L.push("*Total productos: " + soles(totalServidor != null ? totalServidor : total()) + "*" + (form.canal === "delivery" ? " (+ delivery)" : ""));
    L.push("Nombre: " + (form.nombre || ""));
    L.push("Celular: " + (form.telefono || ""));
    if (form.canal === "delivery") {
      L.push("Dirección: " + (form.direccion || ""));
      if (form.referencia) L.push("Referencia: " + form.referencia);
    }
    if (form.pago) L.push("Pago: " + form.pago);
    L.push("Para: " + (form.programado ? "las " + form.programado : "lo antes posible"));
    if (form.notas) L.push("Comentarios: " + form.notas);
    return "https://wa.me/" + C.negocio.whatsapp + "?text=" + encodeURIComponent(L.join("\n"));
  }

  function enviarPedido(trampa) {
    var cuerpo = cuerpoPedido(trampa);
    if (!CFG.api) { // sin servidor: solo WhatsApp (delivery)
      exito(null, null, null, true);
      return Promise.resolve({});
    }
    var ctrl = window.AbortController ? new AbortController() : null;
    var t = setTimeout(function () { if (ctrl) ctrl.abort(); }, 25000);
    return fetch(CFG.api, { method: "POST", body: JSON.stringify(cuerpo), signal: ctrl ? ctrl.signal : undefined })
      .then(function (r) { return r.json(); })
      .then(function (r) {
        clearTimeout(t);
        if (!r || !r.ok) return { error: (r && r.error) || "No pudimos enviar tu pedido. Intenta de nuevo." };
        exito(r.numero, r.total, r.detalle, false);
        return {};
      })
      .catch(function () {
        clearTimeout(t);
        if (MODO === "mesa") return { error: "No hay conexión con la cocina. Intenta de nuevo o llama a tu mozo." };
        exito(null, null, null, true);
        return {};
      });
  }

  function exito(numero, totalServidor, detalle, soloWhatsapp) {
    var c = h("div", "hoja__cuerpo exito");
    c.appendChild(h("div", "exito__ic", "✓"));
    if (MODO === "mesa") {
      c.appendChild(h("h3", null, "¡Pedido #" + numero + " enviado!"));
      c.appendChild(h("p", null, "Tu mozo lo confirmará en unos minutos. Total: " + soles(totalServidor)));
      c.appendChild(boton("Volver a la carta", "btn-ped", cerrarHoja));
    } else {
      var url = mensajeWhatsapp(numero, totalServidor, detalle);
      c.appendChild(h("h3", null, soloWhatsapp ? "Último paso" : "¡Pedido #" + numero + " recibido!"));
      c.appendChild(h("p", null, soloWhatsapp
        ? "Envíanos tu pedido por WhatsApp para confirmarlo."
        : "Para confirmarlo, envíanos el detalle por WhatsApp. Ya está listo, solo pulsa enviar."));
      var a = h("a", "btn-ped btn-ped--wa", "Enviar por WhatsApp"); a.href = url; a.target = "_blank"; a.rel = "noopener";
      c.appendChild(a);
      c.appendChild(h("p", "hoja__ayuda", "Te responderemos para confirmar el total" + (form.canal === "delivery" ? " con el delivery" : "") + " y el tiempo de entrega."));
    }
    carrito = []; guardar(); pintarBarra();
    abrirHoja(c, MODO === "mesa" ? "Mesa " + MESA : "Tu pedido");
  }

  /* ---------- API para app.js ---------- */
  window.PG_PEDIDO = {
    modo: MODO, mesa: MESA,
    activo: function () { return activo(); },
    aceptaAhora: function () { return aceptaAhora(); },
    mesaValida: mesaValida,
    puedePedir: puedePedir,
    boton: function (it) {
      var b = h("button", "agregar"); b.type = "button";
      b.appendChild(h("span", null, "+")); b.appendChild(document.createTextNode(" Agregar"));
      b.setAttribute("aria-label", "Agregar " + it.n + " al pedido");
      b.addEventListener("click", function () { clicAgregar(it); });
      return b;
    },
    iniciar: function (utils) {
      P = utils; h = P.h;
      cargar();
      // limpia del carrito productos que ya no existen o cambiaron
      carrito = carrito.filter(function (l) { var it = productos[l.id]; return it && !it.agotado; });
      capa = h("div", "capa");
      hoja = h("div", "hoja"); hoja.setAttribute("role", "dialog"); hoja.setAttribute("aria-modal", "true");
      capa.appendChild(hoja);
      capa.addEventListener("click", function (e) { if (e.target === capa) cerrarHoja(); });
      document.addEventListener("keydown", function (e) { if (e.key === "Escape" && capa.classList.contains("on")) cerrarHoja(); });
      document.body.appendChild(capa);
      barra = h("button", "barra-ped"); barra.type = "button";
      barraTxt = h("span"); barraTot = h("strong");
      barra.appendChild(barraTxt); barra.appendChild(barraTot);
      barra.addEventListener("click", abrirCarrito);
      document.body.appendChild(barra);
      toast = h("div", "toast"); toast.setAttribute("role", "status"); document.body.appendChild(toast);
      pintarBarra();
    }
  };
})();
