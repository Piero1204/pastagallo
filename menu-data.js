/* =====================================================================
   PASTA GALLO · DATOS DE LA CARTA
   Este es el ÚNICO archivo que debes editar para cambiar textos,
   precios, horarios o agregar platos. Guárdalo y súbelo a GitHub
   reemplazando el anterior.

   REGLAS RÁPIDAS
   - Precio: p: 22        (sin "S/"). Si no hay precio, borra p o pon null.
   - Varios tamaños: t: [["Personale", 22], ["Media", 33], ["Famiglia", 50]]
   - Un plato se oculta poniendo oculto: true
   - Una sección sin platos NO se muestra en la carta.
   - Alérgenos: al: ["gluten","lacteos"]  (solo después de confirmarlos
     con cocina). Claves válidas: gluten, lacteos, huevo, pescado,
     mariscos, frutosSecos, mani, soya, sulfitos
   - Foto: foto: "napoletana.jpg"  (sube la foto junto a index.html)
   - Cuida las comillas ", las comas , y los corchetes [ ].
   ===================================================================== */

window.CARTA = {

  /* ---------- DATOS DEL NEGOCIO ---------- */
  negocio: {
    nombre: "Pasta Gallo",
    desde: "Desde 1997",
    direccion: "Av. Fátima 149, La Merced, Trujillo",
    telefono: "948 323 337",
    whatsapp: "51948323337",
    mensajeWhatsapp: "Hola Pasta Gallo, quisiera hacer un pedido.",
    instagram: "pasta_gallo_",
    tiktok: "pastagallotrattoria",
    facebookNombre: "Pizzeria Pasta Gallo",
    facebookUrl: "",
    horarioTexto: "Martes a domingo · 6:00 pm – 11:00 pm",
    cerradoTexto: "Lunes cerrado"
  },

  /* ---------- HORARIO (el sitio detecta si estás abierto) ----------
     Días: 0 = domingo, 1 = lunes, 2 = martes ... 6 = sábado
     Formato 24 horas ["abre", "cierra"]. null = cerrado todo el día. */
  horario: {
    zona: "America/Lima",
    dias: {
      0: ["18:00", "23:00"],
      1: null,
      2: ["18:00", "23:00"],
      3: ["18:00", "23:00"],
      4: ["18:00", "23:00"],
      5: ["18:00", "23:00"],
      6: ["18:00", "23:00"]
    }
  },

  /* ---------- NUESTRA HISTORIA ---------- */
  historia: {
    eyebrow: "Nuestra historia",
    titulo: "Bienvenidos a Nuestra Casa",
    parrafos: [
      "Desde 1997, en el corazón de Trujillo, nació una pizzería que no solo trajo consigo el auténtico sabor italiano, sino también una historia de amor y dedicación. Todo comenzó cuando el señor Pietro Gallo, un apasionado italiano enamorado de su cultura y gastronomía, conoció a la señora Edit Varela. Juntos formaron una familia y dieron vida a este rincón lleno de tradición, sabor y calidez.",
      "A lo largo de los años, la mano experta de Pietro y el esfuerzo de su familia convirtieron este lugar en un verdadero homenaje a la cocina italiana. Aunque el señor Pietro partió el 9 de febrero de 2024, su legado sigue más vivo que nunca en cada pizza, cada pasta y cada salsa que servimos con orgullo.",
      "Hoy, su familia continúa este hermoso proyecto, honrando su memoria y compartiendo con ustedes el auténtico sabor de Italia, manteniendo intacta la esencia que él nos dejó."
    ]
  },

  /* ---------- ALÉRGENOS (iconos) ---------- */
  alergenos: {
    gluten: "Gluten",
    lacteos: "Lácteos",
    huevo: "Huevo",
    pescado: "Pescado",
    mariscos: "Mariscos",
    frutosSecos: "Frutos secos",
    mani: "Maní",
    soya: "Soya",
    sulfitos: "Sulfitos"
  },

  /* ---------- SECCIONES DE LA CARTA (en el orden en que aparecen) ---------- */
  secciones: [

    /* ============ I · ANTIPASTI ============ */
    {
      id: "antipasti", titulo: "Antipasti", subtitulo: "Para abrir la mesa",
      intro: "Pequeños comienzos para ir despertando el apetito.",
      grupos: [{
        items: [
          { n: "Pane all’Aglio", g: "pan al ajo", d: "Pan dorado y aromático con ajo, el compañero perfecto de cualquier pasta.", p: 5 },
          { n: "Pane all’Aglio con Formaggio", g: "pan al ajo con queso", d: "Nuestro pan al ajo, ahora con queso.", p: 6 },
          { n: "Bruschetta ai Funghi", g: "bruschetta de champiñones", d: "Pan tostado coronado con funghi, rústico y lleno de sabor.", p: 20 },
          { n: "Bruschetta alla Siciliana", g: "bruschetta a la siciliana", d: "Pan tostado al estilo de Sicilia, con el sabor soleado del Mediterráneo.", p: 18 },
          { n: "Prosciutto Crudo", g: "100 gramos", d: "Jamón curado al estilo italiano, servido en finas láminas. Porción de 100 gramos.", p: 30 },
          { n: "Affettato Misto", g: "fiambres mixtos", d: "Una selección de embutidos y fiambres cortados finos, para picar sin apuro.", p: 25 },
          { n: "Piqueo all’Italiana", g: "piqueo a la italiana", d: "Nuestro piqueo de estilo italiano: variedad de bocados para compartir en la mesa.", p: 30 },
          { n: "Insalata Italiana", g: "ensalada italiana", d: "Una ensalada fresca para empezar ligero.", p: 20 },
          { n: "Insalata Caprese", g: "ensalada caprese", d: "Nacida en la isla de Capri, reúne los colores de la bandera italiana.", p: 20 },
          { n: "Frittata di Cipolla", g: "tortilla de cebolla", d: "Tortilla casera de cebolla, sencilla y reconfortante.", p: 15 },
          { n: "Frittata Mista", g: "tortilla mixta", d: "Una tortilla mixta, más generosa y con más sabores.", p: 22 },
          { n: "Crespelle agli Asparagi", g: "crepes de espárragos", d: "Delicadas crepes rellenas de espárragos, a la manera italiana.", p: 20 }
        ]
      }]
    },

    /* ============ II · PIZZE ============ */
    {
      id: "pizze", titulo: "Pizze", subtitulo: "Nuestras pizzas de la casa",
      intro: "Cada pizza se elige en tres tamaños, para ti o para toda la mesa.",
      grupos: [{
        items: [
          { n: "Napoletana", d: "Mozzarella y aceitunas: la pizza de la casa en su versión más pura.", t: [["Personale", 22], ["Media", 33], ["Famiglia", 50]] },
          { n: "Americana", d: "Jamón y mozzarella, el equilibrio que nunca falla.", t: [["Personale", 25], ["Media", 35], ["Famiglia", 55]] },
          { n: "Arrabbiata", d: "Pepperoni, pimentón, jamón y aceitunas. Con carácter, como su nombre promete.", t: [["Personale", 30], ["Media", 40], ["Famiglia", 60]] },
          { n: "Speciale", d: "Carne, tocino, champiñones y aceitunas, para quien busca más sabor en cada porción.", t: [["Personale", 30], ["Media", 40], ["Famiglia", 60]] },
          { n: "Tentazione", d: "Chorizo, tocino, champiñones y aceitunas. Difícil resistirse.", t: [["Personale", 30], ["Media", 40], ["Famiglia", 60]] },
          { n: "Hawaiana", d: "Jamón, piña y durazno: dulce y salado en perfecta armonía.", t: [["Personale", 32], ["Media", 42], ["Famiglia", 62]] },
          { n: "Vegetariana", d: "Champiñones, alcachofa, pimiento, cebolla y aceitunas: un huerto entero sobre la masa.", t: [["Personale", 30], ["Media", 40], ["Famiglia", 60]] },
          { n: "Ghiottona", g: "la golosa", d: "Jamón, chorizo, tocino y aceitunas, para los de buen apetito.", t: [["Personale", 30], ["Media", 40], ["Famiglia", 60]] },
          { n: "Campagnola", g: "al estilo del campo", d: "Carne, jamón y aceitunas, con sabor rústico y campestre.", t: [["Personale", 32], ["Media", 42], ["Famiglia", 62]] },
          { n: "Primavera", d: "Piña, pollo y aceitunas: fresca y ligera como la estación que le da nombre.", t: [["Personale", 32], ["Media", 42], ["Famiglia", 65]] },
          { n: "Quattro Stagioni", g: "cuatro estaciones", d: "Jamón, champiñones, alcachofas, tomate y atún: una estación distinta en cada bocado.", t: [["Personale", 35], ["Media", 45], ["Famiglia", 66]] },
          { n: "Piemontese", d: "Prosciutto crudo y parmesano: elegante y de pocos ingredientes.", t: [["Personale", 35], ["Media", 45], ["Famiglia", 66]] },
          { n: "Quattro Formaggi", g: "cuatro quesos", d: "Una pizza para los amantes del queso: queso azul, mozzarella, parmesano y más.", t: [["Personale", 35], ["Media", 45], ["Famiglia", 70]] },
          { n: "La Peruanita", d: "Nuestro guiño peruano: lomo saltado sobre la pizza.", t: [["Personale", 32], ["Media", 45], ["Famiglia", 75]] },
          { n: "Abbuffata", g: "un banquete", d: "Salame, jamón, chorizo y tocino. «Abbuffata» significa banquete: ven con hambre.", t: [["Personale", 35], ["Media", 45], ["Famiglia", 70]] },
          { n: "La Chama", d: "Pimiento, choclo, jamón, chorizo y aceitunas: colorida y de mucho sabor.", t: [["Personale", 35], ["Media", 45], ["Famiglia", 70]] }
        ]
      }],
      pie: "Ingrediente adicional · S/ 4.00"
    },

    /* ============ III · PASTA ============ */
    {
      id: "pasta", titulo: "Pasta", subtitulo: "Elige tu pasta, elige tu salsa",
      intro: "Cada pasta se acompaña con la salsa que prefieras. Al final de esta sección encontrarás todas nuestras salsas.",
      grupos: [
        {
          titulo: "Piatti Grandi", nota: "Platos grandes de la casa",
          items: [
            { n: "Fonte di Ravioli", g: "fuente de ravioles", d: "Una fuente generosa de ravioles, servida con la salsa de tu elección.", p: 60 },
            { n: "Fonte di Fettuccine", g: "fuente de fettuccine", d: "Una fuente generosa de fettuccine, servida con la salsa de tu elección.", p: 50 },
            { n: "Tris di Pasta", g: "tres pastas en un plato", destacado: "tris",
              d: "Un plato largo que reúne tres pastas: fettuccine a la derecha, lasagna de carne al centro y raviolini a la izquierda. Se elige una sola salsa, que acompañará al fettuccine y a los raviolini; la lasagna no la lleva.", p: 34 }
          ]
        },
        {
          titulo: "Le Nostre Specialità", nota: "Especialidades de la casa",
          items: [
            { n: "Fettuccine all’Alfredo con Lomo", d: "Fettuccine bañados en la cremosa salsa Alfredo y coronados con lomo.", p: 55 },
            { n: "Spaghetti alla Huancaina con Lomo", g: "spaghetti a la huancaína con lomo", d: "Dos mundos en un plato: spaghetti italianos con la cremosa salsa huancaína peruana y lomo.", p: 60 },
            { n: "Spaghetti ai Gamberoni", g: "spaghetti con langostinos", d: "Spaghetti con langostinos: un homenaje al mar en la mesa.", p: 60 }
          ]
        },
        {
          titulo: "Pasta a Tu Gusto", nota: "Elige tu pasta y acompáñala con una de nuestras salsas",
          items: [
            { n: "Fettuccine", d: "Cintas largas y planas, ideales para las salsas cremosas.", p: 30 },
            { n: "Pappardelle", d: "Anchas cintas de tradición toscana, hechas para salsas con carácter.", p: 30 },
            { n: "Spaghetti", d: "El clásico entre los clásicos, siempre bienvenido.", p: 30 },
            { n: "Conchiglie", g: "conchitas", d: "Pasta en forma de concha que guarda la salsa en cada bocado.", p: 30 },
            { n: "Gomiti", g: "coditos", d: "Pequeños codos de pasta: sencillos, simpáticos y muy queridos.", p: 30 },
            { n: "Maccheroni", g: "macarrones", d: "Tubos cortos de pasta que abrazan la salsa.", p: 30 }
          ]
        },
        {
          titulo: "Ripieni e Gnocchi", nota: "Pastas rellenas y ñoquis",
          items: [
            { n: "Ravioli di Carne", g: "ravioles de carne", d: "Ravioles rellenos de carne, con la salsa de tu elección.", p: 32 },
            { n: "Ravioli di Formaggio", g: "ravioles de queso", d: "Ravioles rellenos de queso, suaves y cremosos.", p: 32 },
            { n: "Gnocchi di Patate", g: "ñoquis de papa", d: "Suaves ñoquis de papa, tiernos como una nube.", p: 30 },
            { n: "Tortellini", d: "Pasta rellena en forma de pequeño anillo, nacida en Emilia-Romaña.", p: 32 }
          ]
        },
        {
          titulo: "Le Salse", nota: "Cada pasta lleva la salsa de tu elección. Las salsas marcadas tienen un adicional de S/ 8.00.",
          items: [
            { n: "Puttanesca", d: "Intensa y sabrosa, de tomate, aceitunas y alcaparras. Una clásica napolitana." },
            { n: "Aglio, Olio e Peperoncino", g: "ajo, aceite y ají", d: "Ajo dorado en aceite con un toque de peperoncino. Sencilla, aromática y con un punto picante." },
            { n: "Ragù di Carne", g: "salsa de carne", d: "Salsa de carne al estilo ragú: sabrosa y contundente." },
            { n: "Alfredo", d: "Cremosa y suave, con mantequilla y queso parmesano." },
            { n: "Gorgonzola", d: "Salsa cremosa de queso gorgonzola, de sabor intenso y elegante." },
            { n: "Rosata", g: "rosada", d: "Tomate y crema se encuentran en una salsa suave y color de rosa." },
            { n: "Pesto", d: "Albahaca, queso y aceite de oliva, al estilo de Génova. Fresca y aromática." },
            { n: "Quattro Formaggi", g: "cuatro quesos", d: "Cuatro quesos fundidos en una salsa cremosa e irresistible.", extra: 8 },
            { n: "Marchigiana e Pomodoro", g: "marchigiana y tomate", d: "Salsa de tomate al estilo de Las Marcas, región del centro de Italia.", extra: 8 },
            { n: "Salsa al Lomo", g: "con trozos de lomo", d: "Una salsa contundente con lomo, para quienes quieren más.", extra: 8 },
            { n: "Funghi e Cardonada", g: "champiñones y cardonada", d: "Champiñones en una salsa de la casa, con sabor profundo.", extra: 8 }
          ]
        }
      ],
      pie: "Agregados a tu pasta: consulta el precio con tu mozo"
    },

    /* ============ IV · LASAGNE ============ */
    {
      id: "lasagne", titulo: "Lasagne", subtitulo: "Capas que se disfrutan despacio",
      grupos: [{
        items: [
          { n: "Lasagna di Spinaci", g: "lasagna de espinaca", d: "Capas de pasta y espinaca, gratinada hasta quedar dorada.", p: 34 },
          { n: "Lasagna di Carne", g: "lasagna de carne", d: "La clásica de siempre: capas de pasta y carne, gratinada y reconfortante.", p: 32 },
          { n: "Lasagna agli Asparagi", g: "lasagna de espárragos", d: "Capas de pasta con espárragos, delicada y gratinada.", p: 36 }
        ]
      }]
    },

    /* ============ V · PARRILLAS (en español) ============ */
    {
      id: "parrillas", titulo: "Parrillas", subtitulo: "Para quienes prefieren la carne",
      grupos: [{
        items: [
          { n: "Parrilla Mixta", d: "Una selección de churrasco, chuleta, pollo y chorizo, ideal para quien quiere probar un poco de todo.", p: 60 },
          { n: "Lomo Fino a la Plancha", d: "Lomo fino de 350 gramos, sellado a la plancha. Se acompaña con ensalada y papas fritas.", p: 60 },
          { n: "Churrasco o Chuleta", d: "A tu elección: churrasco o chuleta. Se acompaña con ensalada y papas fritas.", p: 38 },
          { n: "Milanesa de Pollo", d: "Pollo apanado, dorado y crocante. Se acompaña con papas fritas.", p: 30 },
          { n: "Porción de Chorizo", d: "Incluye 3 chorizos y papas fritas.", p: 22 }
        ]
      }]
    },

    /* ============ VI · DOLCI ============ */
    {
      id: "dolci", titulo: "Dolci", subtitulo: "Para cerrar con dulzura",
      intro: "Postres sujetos a disponibilidad. Consulta con tu mozo cuáles tenemos hoy y su precio.",
      grupos: [{
        items: [
          { n: "Tiramisù", d: "El postre italiano más célebre: capas de bizcocho, café y suave crema de mascarpone." },
          { n: "Torta al Cioccolato", g: "torta de chocolate", d: "Una torta esponjosa para los amantes del chocolate." },
          { n: "Biscotti con Gocce di Cioccolato", g: "galletas con chispas de chocolate", d: "Galletas con chispas de chocolate, ideales con un buen café." },
          { n: "Biscotto al Cioccolato", g: "galleta de chocolate", d: "Una galleta de chocolate intenso, para el antojo del final." },
          { n: "Biscotto Red Velvet", g: "galleta red velvet", d: "Color rubí y sabor suave a cacao: elegante hasta el último bocado." }
        ]
      }]
    },

    /* ============ VII · CAFFÈ E BEVANDE ============ */
    {
      id: "caffe", titulo: "Caffè e Bevande", subtitulo: "Café, infusiones y refrescos",
      grupos: [{
        items: [
          { n: "Caffè", g: "café", d: "Café de la casa, para acompañar la sobremesa.", p: 10 },
          { n: "Espresso", g: "café express", d: "El clásico italiano: corto, intenso y de un solo trago.", p: 12 },
          { n: "Cappuccino", d: "Espresso con leche y espuma, el favorito de las mañanas italianas.", p: 18 },
          { n: "Cioccolata Calda", g: "chocolate caliente", d: "Chocolate caliente, espeso y reconfortante.", p: 12 },
          { n: "Tè", g: "té", d: "Infusión caliente para cerrar la comida con calma.", p: 4 },
          { n: "Limonata", g: "limonada", d: "Fresca y cítrica, la más refrescante de la carta.", p: 18 },
          { n: "Maracuyá", g: "refresco de maracuyá", d: "El sabor tropical y vibrante del maracuyá.", p: 18 },
          { n: "Bibita Gassata", g: "gaseosa", d: "Elige el tamaño que prefieras.", t: [["Personal", 3.5], ["Mediana", 4.5], ["1 litro", 8], ["1½ litros", 15]] },
          { n: "Acqua", g: "agua", d: "Agua para acompañar la comida.", p: 3.5 },
          { n: "Ghiaccio", g: "hielo", d: "Hielo adicional para tu bebida.", p: 3 }
        ]
      }]
    },

    /* ============ VIII · APERITIVI ============ */
    {
      id: "aperitivi", titulo: "Aperitivi", subtitulo: "Cócteles de la casa", alcohol: true,
      grupos: [{
        items: [
          { n: "Piña Colada", d: "Tropical y cremosa: ron, crema de coco y jugo de piña.", p: 20 },
          { n: "Pisco Sour", d: "El clásico peruano: pisco, clara de huevo, jugo de limón y jarabe de goma.", p: 20 },
          { n: "Don’t Worry Be Happy", d: "Vodka, crema de coco y jugo de naranja. Con ese nombre, no hay más que decir.", p: 20 },
          { n: "Chilcano", d: "Ligero y burbujeante: pisco, jarabe de goma, jugo de limón y ginger ale.", p: 20 },
          { n: "Bob Dylan", d: "Cifrut, Schweppes y Jägermeister.", p: 20 },
          { n: "Orgasmo", d: "Baileys y amaretto, suave y dulce.", p: 20 },
          { n: "Algarrobina", d: "Un clásico norteño: algarrobina, pisco, leche y crema de leche.", p: 20 },
          { n: "Baileys Colada", d: "Baileys, crema de coco y leche: suave y muy cremoso.", p: 20 }
        ]
      }]
    },

    /* ============ IX · VINI E BIRRE ============ */
    {
      id: "vini", titulo: "Vini e Birre", subtitulo: "Vinos, cervezas y licores", alcohol: true,
      grupos: [
        {
          items: [
            { n: "Calice di Vino", g: "copa de vino", d: "Copa de vino a elección.", p: 12 },
            { n: "Birra Cusqueña", g: "cerveza", p: 14 },
            { n: "Birra Pilsen", g: "cerveza", p: 14 },
            { n: "Sangria", g: "sangría", p: 55 }
          ]
        },
        {
          titulo: "I Nostri Vini", nota: "Vinos y espumantes",
          items: [
            { n: "Tabernero Gran Tinto", g: "tinto", p: 48 },
            { n: "Tabernero Borgoña", p: 45 },
            { n: "Gran Blanco", g: "blanco", p: 50 },
            { n: "Frontera", p: 48 },
            { n: "Tacama Seco", g: "seco", p: 55 },
            { n: "Tacama Semiseco", g: "semiseco", p: 55 },
            { n: "Casillero del Diablo", p: 60 },
            { n: "Spumante Brut Tabernero", g: "espumante brut", p: 65 },
            { n: "Patrillo", p: 120 },
            { n: "Prisionero", p: 100 }
          ]
        },
        {
          titulo: "Originali d’Italia", nota: "Vinos importados desde Italia",
          items: [
            /* Aquí irán los vinos italianos. Ejemplo:
               { n: "Nombre del vino", g: "tipo", d: "descripción", p: 90 },  */
          ]
        }
      ]
    },

    /* ============ X · PRODOTTI D'ITALIA (oculto hasta tener productos) ============ */
    {
      id: "italia", titulo: "Prodotti d’Italia", subtitulo: "Sabores originales importados desde Italia",
      intro: "Galletas, dulces y delicias traídas directamente de Italia.",
      grupos: [{
        items: [
          /* Ejemplos de lo que irá aquí (agrega nombre, descripción y precio reales):
             { n: "Tre Marie", d: "...", p: 0 },
             { n: "Crema di Gianduja", d: "...", p: 0 },
             { n: "Biscotti d’Italia", d: "...", p: 0 },  */
        ]
      }]
    }
  ]
};
