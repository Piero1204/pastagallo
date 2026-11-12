/* =====================================================================
   PASTA GALLO · Actualización v2 de la carta (11-nov-2026)
   Se ejecuta UNA vez con la función "actualizarV2" (desde el editor de
   Apps Script). Se puede repetir sin problema: solo pone los valores de abajo.
   - Corrige salsas (Amatriciana, Carbonara, Funghi, Lomo Saltado, Puttanesca con atún)
   - Fuentes de ravioli de ricotta y de carne, Ravioli di Ricotta, Tortellini di Carne, Raviolini
   - Precios nuevos (especialidades +10, lasagne +2, lomo fino +10, copa de vino +2, postres)
   - Opciones: término, picante, salsa, temperatura, sabor, vino, ingredientes extra
   - Productos solo para el local / solo delivery, promociones y textos en inglés
   ===================================================================== */

var MIGRACION_V2 = {
  config: [
    ['minutos_alerta', 45, 'Minutos para marcar un pedido como atrasado en el panel'],
    ['historia_eyebrow_en', 'Our story', ''],
    ['historia_titulo_en', 'Welcome to Our Home', ''],
    ['historia_texto_en', 'Since 1997, in the heart of Trujillo, a pizzeria was born that brought not only authentic Italian flavour but also a story of love and dedication. It all began when Mr. Pietro Gallo, an Italian passionate about his culture and cuisine, met Mrs. Edit Varela. Together they built a family and gave life to this corner full of tradition, flavour and warmth.\n\nOver the years, Pietro\'s expert hand and his family\'s effort turned this place into a true tribute to Italian cooking. Although Mr. Pietro passed away on February 9, 2024, his legacy is more alive than ever in every pizza, every pasta and every sauce we proudly serve.\n\nToday his family carries on this beautiful project, honouring his memory and sharing with you the authentic taste of Italy, keeping intact the essence he left us.', ''],
    ['texto_delivery_en', 'The delivery fee depends on your area; we will confirm it by WhatsApp.', ''],
    ['horario_texto_en', 'Tuesday to Sunday · 6:00 pm – 11:00 pm', 'Horario en inglés'],
    ['cerrado_texto_en', 'Closed on Mondays', '']
  ],

  seccionesNuevas: [
    { id: 'promociones', orden: 0, titulo: 'Offerte', subtitulo: 'Promociones de la casa', intro: '', pie: '', alcohol: 'NO',
      delivery: 'SI', mesa: 'SI', visible: 'SI', titulo_en: 'Offerte', subtitulo_en: 'House offers', intro_en: '', pie_en: '' }
  ],

  secciones: {
    antipasti: { subtitulo_en: 'To open the table', intro_en: 'Small beginnings to awaken the appetite.' },
    pizze: { pie: 'Puedes agregar ingredientes adicionales al pedir · S/ 4.00 c/u', subtitulo_en: 'Our house pizzas',
      intro_en: 'Every pizza comes in three sizes, for you or for the whole table.', pie_en: 'Add extra toppings when ordering · S/ 4.00 each' },
    pasta: { subtitulo_en: 'Choose your pasta, choose your sauce',
      intro_en: 'Every pasta comes with the sauce of your choice. You will find all our sauces at the end of this section.',
      pie_en: 'Extras for your pasta: ask your waiter for the price' },
    lasagne: { subtitulo_en: 'Layers to enjoy slowly' },
    parrillas: { titulo_en: 'Grill', subtitulo_en: 'For meat lovers', intro: 'Todas nuestras parrillas vienen con su porción de papas fritas.',
      intro_en: 'All our grill dishes come with a portion of French fries.' },
    dolci: { intro: 'Postres sujetos a disponibilidad. Pregunta a tu mozo cuáles tenemos hoy.', subtitulo_en: 'A sweet ending',
      intro_en: 'Desserts subject to availability. Ask your waiter what we have today.' },
    caffe: { subtitulo_en: 'Coffee, tea and soft drinks' },
    aperitivi: { subtitulo_en: 'House cocktails' },
    vini: { subtitulo_en: 'Wines, beers and spirits' },
    italia: { subtitulo_en: 'Original flavours imported from Italy', intro_en: 'Biscuits, sweets and delicacies brought straight from Italy.' }
  },

  productos: {
    'antipasti-pane-allaglio': { glosa_en: 'garlic bread', descripcion_en: 'Golden, fragrant garlic bread, the perfect companion to any pasta.' },
    'antipasti-pane-allaglio-con-formaggio': { glosa_en: 'garlic bread with cheese', descripcion_en: 'Our garlic bread, now with cheese.' },
    'antipasti-bruschetta-ai-funghi': { glosa_en: 'mushroom bruschetta', descripcion_en: 'Toasted bread topped with mushrooms, rustic and full of flavour.' },
    'antipasti-bruschetta-alla-siciliana': { glosa_en: 'Sicilian-style bruschetta', descripcion_en: 'Toasted bread in the Sicilian style, with the sunny taste of the Mediterranean.' },
    'antipasti-prosciutto-crudo': { glosa_en: '100 grams', descripcion_en: 'Italian-style cured ham, served in thin slices. 100-gram portion.' },
    'antipasti-affettato-misto': { glosa_en: 'mixed cold cuts', descripcion_en: 'A selection of thinly sliced cured meats and cold cuts, to enjoy at your own pace.' },
    'antipasti-piqueo-allitaliana': { glosa_en: 'Italian-style sharing platter', descripcion_en: 'Our Italian-style platter: a variety of bites to share at the table.' },
    'antipasti-insalata-italiana': { glosa_en: 'Italian salad', descripcion_en: 'A fresh salad for a light start.' },
    'antipasti-insalata-caprese': { glosa_en: 'Caprese salad', descripcion_en: 'Born on the island of Capri, it brings together the colours of the Italian flag.' },
    'antipasti-frittata-di-cipolla': { glosa_en: 'onion omelette', descripcion_en: 'Homemade onion omelette, simple and comforting.' },
    'antipasti-frittata-mista': { glosa_en: 'mixed omelette', descripcion_en: 'A more generous mixed omelette with more flavours.' },
    'antipasti-crespelle-agli-asparagi': { glosa_en: 'asparagus crêpes', descripcion_en: 'Delicate crêpes filled with asparagus, the Italian way.' },

    'pizze-napoletana': { opciones: 'extras-pizza', descripcion_en: 'Mozzarella and olives: our house pizza at its purest.' },
    'pizze-americana': { opciones: 'extras-pizza', descripcion_en: 'Ham and mozzarella, the balance that never fails.' },
    'pizze-arrabbiata': { opciones: 'extras-pizza', descripcion_en: 'Pepperoni, bell pepper, ham and olives. Bold, just as its name promises.' },
    'pizze-speciale': { opciones: 'extras-pizza', descripcion_en: 'Beef, bacon, mushrooms and olives, for those who want more flavour in every slice.' },
    'pizze-tentazione': { opciones: 'extras-pizza', descripcion_en: 'Chorizo, bacon, mushrooms and olives. Hard to resist.' },
    'pizze-hawaiana': { opciones: 'extras-pizza', descripcion_en: 'Ham, pineapple and peach: sweet and savoury in perfect harmony.' },
    'pizze-vegetariana': { opciones: 'extras-pizza', descripcion_en: 'Mushrooms, artichoke, bell pepper, onion and olives: a whole garden on the dough.' },
    'pizze-ghiottona': { opciones: 'extras-pizza', glosa_en: 'the greedy one', descripcion_en: 'Ham, chorizo, bacon and olives, for a hearty appetite.' },
    'pizze-campagnola': { opciones: 'extras-pizza', glosa_en: 'country style', descripcion_en: 'Beef, ham and olives, with a rustic country flavour.' },
    'pizze-primavera': { opciones: 'extras-pizza', descripcion_en: 'Pineapple, chicken and olives: fresh and light like the season it is named after.' },
    'pizze-quattro-stagioni': { opciones: 'extras-pizza', glosa_en: 'four seasons', descripcion_en: 'Ham, mushrooms, artichokes, tomato and tuna: a different season in every bite.' },
    'pizze-piemontese': { opciones: 'extras-pizza', descripcion_en: 'Prosciutto crudo and parmesan: elegant and with few ingredients.' },
    'pizze-quattro-formaggi': { opciones: 'extras-pizza', glosa_en: 'four cheeses', descripcion_en: 'A pizza for cheese lovers: blue cheese, mozzarella, parmesan and more.' },
    'pizze-la-peruanita': { opciones: 'extras-pizza', descripcion_en: 'Our Peruvian twist: lomo saltado on a pizza.' },
    'pizze-abbuffata': { opciones: 'extras-pizza', glosa_en: 'a feast', descripcion_en: 'Salami, ham, chorizo and bacon. «Abbuffata» means feast: come hungry.' },
    'pizze-la-chama': { opciones: 'extras-pizza', descripcion_en: 'Bell pepper, Peruvian corn, ham, chorizo and olives: colourful and full of flavour.' },

    'pasta-fonte-di-ravioli': { nombre: 'Fonte di Ravioli di Ricotta', glosa: 'fuente de ravioles de ricotta',
      descripcion: 'Una fuente generosa de ravioles rellenos de ricotta, servida con la salsa de tu elección.',
      glosa_en: 'platter of ricotta ravioli', descripcion_en: 'A generous platter of ricotta-filled ravioli, served with the sauce of your choice.' },
    'pasta-fonte-di-fettuccine': { opciones: 'fettuccine-tipo', descripcion: 'Una fuente generosa de fettuccine, clásicos o verdes (de espinaca), servida con la salsa de tu elección.',
      glosa_en: 'platter of fettuccine', descripcion_en: 'A generous platter of fettuccine, classic or green (spinach), served with the sauce of your choice.' },
    'pasta-tris-di-pasta': { glosa_en: 'three pastas on one plate',
      descripcion_en: 'A long plate with three pastas: fettuccine on the right, beef lasagna in the centre and raviolini on the left. You choose one sauce for the fettuccine and the raviolini; the lasagna does not take it.' },
    'pasta-fettuccine-allalfredo-con-lomo': { precio: 65, opciones: 'termino',
      descripcion: 'Fettuccine bañados en la cremosa salsa Alfredo y coronados con lomo, en el término que prefieras.',
      descripcion_en: 'Fettuccine in creamy Alfredo sauce topped with beef tenderloin, cooked to your liking.' },
    'pasta-spaghetti-alla-huancaina-con-lomo': { precio: 70, opciones: 'picante',
      descripcion: 'Dos mundos en un plato: spaghetti italianos con la cremosa salsa huancaína peruana y lomo. Elige tu nivel de picante.',
      glosa_en: 'spaghetti with huancaína sauce and beef', descripcion_en: 'Two worlds on one plate: Italian spaghetti with creamy Peruvian huancaína sauce and beef tenderloin. Choose your spice level.' },
    'pasta-spaghetti-ai-gamberoni': { nombre: 'Spaghetti ai Gamberi', precio: 70, opciones: 'salsa-gamberi, picante',
      descripcion: 'Spaghetti con langostinos en salsa roja (de tomate) o blanca (bechamel), a tu elección, con el nivel de picante que prefieras.',
      glosa_en: 'spaghetti with prawns', descripcion_en: 'Spaghetti with prawns in red (tomato) or white (béchamel) sauce, your choice, with the spice level you prefer.' },
    'pasta-fettuccine': { opciones: 'fettuccine-tipo', descripcion: 'Cintas largas y planas, ideales para las salsas cremosas. Clásicos o verdes (de espinaca).',
      descripcion_en: 'Long, flat ribbons, ideal for creamy sauces. Classic or green (spinach).' },
    'pasta-pappardelle': { descripcion_en: 'Wide ribbons from the Tuscan tradition, made for hearty sauces.' },
    'pasta-spaghetti': { descripcion_en: 'The classic of classics, always welcome.' },
    'pasta-conchiglie': { glosa_en: 'shells', descripcion_en: 'Shell-shaped pasta that holds the sauce in every bite.' },
    'pasta-gomiti': { glosa_en: 'elbows', descripcion_en: 'Little pasta elbows: simple, charming and much loved.' },
    'pasta-maccheroni': { glosa_en: 'macaroni', descripcion_en: 'Short pasta tubes that embrace the sauce.' },
    'pasta-ravioli-di-carne': { glosa_en: 'beef ravioli', descripcion_en: 'Beef-filled ravioli, with the sauce of your choice.' },
    'pasta-ravioli-di-formaggio': { nombre: 'Ravioli di Ricotta', glosa: 'ravioles de ricotta',
      descripcion: 'Ravioles rellenos de ricotta, suaves y cremosos.', glosa_en: 'ricotta ravioli', descripcion_en: 'Ricotta-filled ravioli, soft and creamy.' },
    'pasta-tortellini': { nombre: 'Tortellini di Carne', glosa: 'tortellini de carne', orden: 147,
      descripcion: 'Pequeños anillos de pasta rellenos de carne, con el mismo relleno de nuestros ravioli di carne. Tradición de Emilia-Romaña.',
      glosa_en: 'beef tortellini', descripcion_en: 'Little rings of pasta filled with beef, the same filling as our beef ravioli. A tradition from Emilia-Romagna.' },
    'pasta-gnocchi-di-patate': { glosa_en: 'potato gnocchi', descripcion_en: 'Soft potato gnocchi, light as a cloud.' },

    'salsa-puttanesca': { opciones: 'picante', descripcion: 'Salsa de tomate con atún, intensa y con carácter. Por naturaleza es picante: elige tu nivel.',
      descripcion_en: 'Tomato sauce with tuna, intense and full of character. Naturally spicy: choose your level.' },
    'salsa-aglio-olio-e-peperoncino': { opciones: 'picante', descripcion: 'Ajo dorado en aceite con peperoncino. Sencilla y aromática; por naturaleza es picante: elige tu nivel.',
      glosa_en: 'garlic, oil and chilli', descripcion_en: 'Golden garlic in oil with peperoncino. Simple and aromatic; naturally spicy: choose your level.' },
    'salsa-ragu-di-carne': { glosa_en: 'meat sauce', descripcion_en: 'Ragù-style meat sauce: rich and hearty.' },
    'salsa-alfredo': { descripcion_en: 'Creamy and smooth, with butter and parmesan cheese.' },
    'salsa-gorgonzola': { descripcion_en: 'Creamy gorgonzola cheese sauce, intense and elegant.' },
    'salsa-rosata': { glosa_en: 'pink sauce', descripcion_en: 'Tomato and cream meet in a smooth, rosy sauce.' },
    'salsa-pesto': { descripcion_en: 'Basil, cheese and olive oil, Genoa style. Fresh and aromatic.' },
    'salsa-quattro-formaggi': { glosa_en: 'four cheeses', descripcion_en: 'Four cheeses melted into a creamy, irresistible sauce.' },
    'salsa-marchigiana-e-pomodoro': { nombre: 'Amatriciana', glosa: 'salsa amatriciana', opciones: 'picante',
      descripcion: 'La clásica salsa de tomate de Amatrice, sabrosa y de naturaleza picante: elige tu nivel.',
      glosa_en: 'amatriciana sauce', descripcion_en: 'The classic tomato sauce from Amatrice, flavourful and naturally spicy: choose your level.' },
    'salsa-salsa-al-lomo': { nombre: 'Lomo Saltado', glosa: 'al estilo lomo saltado',
      descripcion: 'Como un lomo saltado sobre tu pasta: trozos de lomo salteados al sillao (salsa de soya).',
      glosa_en: 'Peruvian stir-fried beef', descripcion_en: 'Like a Peruvian lomo saltado over your pasta: beef strips stir-fried with soy sauce.' },
    'salsa-funghi-e-cardonada': { nombre: 'Funghi', glosa: 'salsa de champiñones', recargo: 8,
      descripcion: 'Salsa bechamel con champiñones, ajo y perejil.', glosa_en: 'mushroom sauce', descripcion_en: 'Béchamel sauce with mushrooms, garlic and parsley.' },

    'lasagne-lasagna-di-spinaci': { precio: 36, glosa_en: 'spinach lasagna', descripcion_en: 'Layers of pasta and spinach, baked until golden.' },
    'lasagne-lasagna-di-carne': { precio: 34, glosa_en: 'beef lasagna', descripcion_en: 'The classic: layers of pasta and beef, gratinated and comforting.' },
    'lasagne-lasagna-agli-asparagi': { precio: 38, glosa_en: 'asparagus lasagna', descripcion_en: 'Layers of pasta with asparagus, delicate and gratinated.' },

    'parrillas-parrilla-mixta': { glosa: 'Con ensalada y papas fritas', descripcion: 'Una selección de churrasco, chuleta, pollo y chorizo, para probar un poco de todo.',
      nombre_en: 'Mixed Grill', glosa_en: 'With salad and French fries', descripcion_en: 'A selection of steak, pork chop, chicken and chorizo, to try a little of everything.' },
    'parrillas-lomo-fino-a-la-plancha': { precio: 70, opciones: 'termino', glosa: 'Con ensalada y papas fritas',
      descripcion: 'Lomo fino de 350 gramos, sellado a la plancha y servido en el término que prefieras.',
      nombre_en: 'Griddled Beef Tenderloin', glosa_en: 'With salad and French fries', descripcion_en: '350 grams of beef tenderloin, seared on the griddle and cooked to your liking.' },
    'parrillas-churrasco-o-chuleta': { glosa: 'Con ensalada y papas fritas', descripcion: 'A tu elección: churrasco o chuleta.',
      nombre_en: 'Steak or Pork Chop', glosa_en: 'With salad and French fries', descripcion_en: 'Your choice: steak or pork chop.' },
    'parrillas-milanesa-de-pollo': { glosa: 'Con papas fritas', descripcion: 'Pollo apanado, dorado y crocante.',
      nombre_en: 'Chicken Milanese', glosa_en: 'With French fries', descripcion_en: 'Breaded chicken, golden and crispy.' },
    'parrillas-porcion-de-chorizo': { glosa: 'Con papas fritas', descripcion: 'Incluye 3 chorizos.',
      nombre_en: 'Chorizo Portion', glosa_en: 'With French fries', descripcion_en: 'Includes 3 chorizo sausages.' },

    'dolci-tiramisu': { precio: 12, descripcion_en: 'Italy\'s most famous dessert: layers of sponge, coffee and smooth mascarpone cream.' },
    'dolci-torta-al-cioccolato': { precio: 12, glosa_en: 'chocolate cake', descripcion_en: 'A fluffy cake for chocolate lovers.' },
    'dolci-biscotti-con-gocce-di-cioccolato': { precio: 6, nombre: 'Biscotto con Gocce di Cioccolato', glosa: 'galleta con chispas de chocolate',
      descripcion: 'Galleta con chispas de chocolate, ideal con un buen café.', glosa_en: 'chocolate chip cookie', descripcion_en: 'Chocolate chip cookie, perfect with a good coffee.' },
    'dolci-biscotto-al-cioccolato': { precio: 6, glosa_en: 'chocolate cookie', descripcion_en: 'An intense chocolate cookie for that final craving.' },
    'dolci-biscotto-red-velvet': { precio: 6, glosa_en: 'red velvet cookie', descripcion_en: 'Ruby colour and a soft cocoa taste: elegant to the last bite.' },

    'caffe-caffe': { glosa_en: 'coffee', descripcion_en: 'House coffee, to go with the after-dinner chat.' },
    'caffe-espresso': { glosa_en: 'espresso', descripcion_en: 'The Italian classic: short, intense, in one sip.' },
    'caffe-cappuccino': { descripcion_en: 'Espresso with milk and foam, the favourite of Italian mornings.' },
    'caffe-cioccolata-calda': { glosa_en: 'hot chocolate', descripcion_en: 'Thick, comforting hot chocolate.' },
    'caffe-te': { glosa_en: 'tea', descripcion_en: 'A hot infusion to end the meal calmly.' },
    'caffe-limonata': { opciones: 'temp-limonada', descripcion: 'Fresca y cítrica. Helada, a temperatura ambiente o frozen.',
      glosa_en: 'lemonade', descripcion_en: 'Fresh and citrusy. Iced, at room temperature or frozen.' },
    'caffe-maracuya': { opciones: 'temp-limonada', descripcion: 'El sabor tropical y vibrante del maracuyá. Helada, a temperatura ambiente o frozen.',
      glosa_en: 'passion fruit juice', descripcion_en: 'The vibrant tropical taste of passion fruit. Iced, at room temperature or frozen.' },
    'caffe-bibita-gassata': { opciones: 'sabor-gaseosa, temp-bebida', descripcion: 'Inca Kola, Coca-Cola, Fanta o Sprite, helada o sin helar. Elige el tamaño.',
      glosa_en: 'soft drink', descripcion_en: 'Inca Kola, Coca-Cola, Fanta or Sprite, chilled or not. Choose your size.' },
    'caffe-acqua': { opciones: 'temp-bebida', glosa: 'agua sin gas', descripcion: 'Agua sin gas, helada o sin helar.',
      glosa_en: 'still water', descripcion_en: 'Still water, chilled or not.' },
    'caffe-ghiaccio': { canal: 'local', glosa_en: 'ice', descripcion_en: 'Extra ice for your drink.' },

    'aperitivi-pina-colada': { descripcion_en: 'Tropical and creamy: rum, coconut cream and pineapple juice.' },
    'aperitivi-pisco-sour': { descripcion_en: 'The Peruvian classic: pisco, egg white, lime juice and simple syrup.' },
    'aperitivi-dont-worry-be-happy': { descripcion_en: 'Vodka, coconut cream and orange juice. With that name, nothing more to say.' },
    'aperitivi-chilcano': { descripcion_en: 'Light and bubbly: pisco, simple syrup, lime juice and ginger ale.' },
    'aperitivi-bob-dylan': { descripcion_en: 'Cifrut, Schweppes and Jägermeister.' },
    'aperitivi-orgasmo': { descripcion_en: 'Baileys and amaretto, smooth and sweet.' },
    'aperitivi-algarrobina': { descripcion_en: 'A northern Peruvian classic: algarrobina syrup, pisco, milk and cream.' },
    'aperitivi-baileys-colada': { descripcion_en: 'Baileys, coconut cream and milk: smooth and very creamy.' },

    'vini-calice-di-vino': { precio: 14, opciones: 'vino-copa', descripcion: 'Copa de vino Frontera: Cabernet Sauvignon o Borgoña.',
      glosa_en: 'glass of wine', descripcion_en: 'A glass of Frontera wine: Cabernet Sauvignon or Borgoña.' },
    'vini-birra-cusquena': { glosa_en: 'beer' },
    'vini-birra-pilsen': { glosa_en: 'beer' },
    'vini-sangria': { glosa_en: 'sangria' },
    'vini-tabernero-gran-tinto': { glosa: 'tinto semiseco · Perú',
      descripcion: 'Tinto semiseco peruano de uva Malbec del valle de Chincha: dulce, frutal y muy fácil de beber.',
      glosa_en: 'off-dry red · Peru', descripcion_en: 'Off-dry Peruvian red from Malbec grapes of the Chincha Valley: sweet, fruity and very easy to drink.' },
    'vini-tabernero-borgona': { glosa: 'tinto semiseco · Perú',
      descripcion: 'Semiseco del valle de Chincha, con aromas de cereza confitada y un toque de regaliz. Taninos muy suaves: ideal para acompañar platos con algo de picante.',
      glosa_en: 'off-dry red · Peru', descripcion_en: 'Off-dry red from the Chincha Valley, with candied cherry aromas and a hint of liquorice. Very soft tannins: great with slightly spicy dishes.' },
    'vini-gran-blanco': { glosa_en: 'white' },
    'vini-frontera': { glosa: 'tinto · Chile',
      descripcion: 'De Viña Concha y Toro. En su versión Cabernet Sauvignon: fruta negra madura con toques de vainilla, café y chocolate; suave y de final largo.',
      glosa_en: 'red · Chile', descripcion_en: 'From Concha y Toro. In its Cabernet Sauvignon version: ripe black fruit with hints of vanilla, coffee and chocolate; smooth with a long finish.' },
    'vini-tacama-seco': { glosa: 'seco · Perú', descripcion: 'De Viña Tacama, en el valle de Ica, una de las bodegas con más historia del Perú.',
      glosa_en: 'dry · Peru', descripcion_en: 'From Viña Tacama in the Ica Valley, one of Peru\'s most historic wineries.' },
    'vini-tacama-semiseco': { glosa: 'semiseco · Perú', descripcion: 'De Viña Tacama, en el valle de Ica: un toque más dulce y amable.',
      glosa_en: 'off-dry · Peru', descripcion_en: 'From Viña Tacama in the Ica Valley: a touch sweeter and gentler.' },
    'vini-casillero-del-diablo': { glosa: 'tinto · Chile',
      descripcion: 'De Viña Concha y Toro. En Cabernet Sauvignon: cereza, grosella y ciruela negra con un toque de vainilla de barrica; taninos elegantes y final largo.',
      glosa_en: 'red · Chile', descripcion_en: 'From Concha y Toro. As Cabernet Sauvignon: cherry, redcurrant and black plum with a touch of oak vanilla; elegant tannins and a long finish.' },
    'vini-spumante-brut-tabernero': { glosa: 'espumante brut · Perú', descripcion: 'Espumante peruano brut (seco), fresco y burbujeante, ideal para brindar.',
      glosa_en: 'brut sparkling · Peru', descripcion_en: 'Peruvian brut (dry) sparkling wine, fresh and bubbly, perfect for a toast.' }
  },

  productosNuevos: [
    { id: 'pasta-fonte-di-ravioli-di-carne', seccion: 'pasta', grupo: 'Piatti Grandi', grupo_nota: 'Platos grandes de la casa', orden: 15,
      nombre: 'Fonte di Ravioli di Carne', glosa: 'fuente de ravioles de carne', precio: 60, tipo: 'plato', requiere_salsa: 'SI',
      descripcion: 'Una fuente generosa de ravioles rellenos de carne, servida con la salsa de tu elección.',
      glosa_en: 'platter of beef ravioli', descripcion_en: 'A generous platter of beef-filled ravioli, served with the sauce of your choice.' },
    { id: 'pasta-raviolini', seccion: 'pasta', grupo: 'Ripieni e Gnocchi', grupo_nota: 'Pastas rellenas y ñoquis', orden: 145,
      nombre: 'Raviolini', glosa: 'ravioles pequeños', precio: '', tipo: 'plato', requiere_salsa: 'SI',
      descripcion: 'Como nuestros ravioli, pero en tamaño pequeño: más bocados en cada plato.',
      glosa_en: 'small ravioli', descripcion_en: 'Like our ravioli, but smaller: more bites on every plate.' },
    { id: 'salsa-carbonara', seccion: 'pasta', grupo: 'Le Salse',
      grupo_nota: 'Cada pasta lleva la salsa de tu elección. Las salsas marcadas tienen un adicional de S/ 8.00.', orden: 275,
      nombre: 'Carbonara', glosa: '', tipo: 'salsa', recargo: 8, requiere_salsa: 'NO',
      descripcion: 'La clásica romana, cremosa, a base de yema de huevo y queso parmesano.',
      glosa_en: '', descripcion_en: 'The Roman classic, creamy, made with egg yolk and parmesan cheese.' },
    { id: 'caffe-acqua-frizzante', seccion: 'caffe', grupo: '', grupo_nota: '', orden: 95, nombre: 'Acqua Frizzante', glosa: 'agua con gas',
      precio: '', tipo: 'plato', requiere_salsa: 'NO', opciones: 'temp-bebida', descripcion: 'Agua con gas, helada o sin helar.',
      glosa_en: 'sparkling water', descripcion_en: 'Sparkling water, chilled or not.' }
  ],

  // grupo, nombre, nombre_en, tipo (una|varias), obligatorio, opcion, opcion_en, precio, orden, activo
  opciones: (function () {
    var f = [];
    function g(id, n, ne, tipo, req, ops, activo) {
      ops.forEach(function (o, i) { f.push([id, n, ne, tipo, req, o[0], o[1], o[2] || '', (i + 1) * 10, activo || 'SI']); });
    }
    g('termino', 'Término de la carne', 'Doneness', 'una', 'SI',
      [['Término medio', 'Medium'], ['Tres cuartos', 'Medium well'], ['Bien cocido', 'Well done']]);
    g('picante', 'Nivel de picante', 'Spice level', 'una', 'SI',
      [['1 · Suave', '1 · Mild'], ['2 · Medio', '2 · Medium'], ['3 · Picante', '3 · Hot']]);
    g('salsa-gamberi', 'Salsa', 'Sauce', 'una', 'SI',
      [['Salsa roja (tomate)', 'Red sauce (tomato)'], ['Salsa blanca (bechamel)', 'White sauce (béchamel)']]);
    g('fettuccine-tipo', 'Tipo de fettuccine', 'Fettuccine type', 'una', 'SI',
      [['Clásico', 'Classic'], ['Verde (de espinaca)', 'Green (spinach)']]);
    g('temp-limonada', 'Temperatura', 'Temperature', 'una', 'SI',
      [['Helada', 'Iced'], ['Temperatura ambiente', 'Room temperature'], ['Frozen', 'Frozen']]);
    g('temp-bebida', 'Temperatura', 'Temperature', 'una', 'SI', [['Helada', 'Chilled'], ['Sin helar', 'Not chilled']]);
    g('sabor-gaseosa', 'Sabor', 'Flavour', 'una', 'SI', [['Inca Kola', 'Inca Kola'], ['Coca-Cola', 'Coca-Cola'], ['Fanta', 'Fanta'], ['Sprite', 'Sprite']]);
    g('vino-copa', 'Vino', 'Wine', 'una', 'SI', [['Frontera Cabernet Sauvignon', 'Frontera Cabernet Sauvignon'], ['Frontera Borgoña', 'Frontera Borgoña']]);
    g('extras-pizza', 'Ingredientes adicionales', 'Extra toppings', 'varias', 'NO', [
      ['Mozzarella extra', 'Extra mozzarella', 4], ['Jamón', 'Ham', 4], ['Pepperoni', 'Pepperoni', 4], ['Tocino', 'Bacon', 4],
      ['Chorizo', 'Chorizo', 4], ['Salame', 'Salami', 4], ['Carne', 'Beef', 4], ['Pollo', 'Chicken', 4], ['Champiñones', 'Mushrooms', 4],
      ['Aceitunas', 'Olives', 4], ['Piña', 'Pineapple', 4], ['Durazno', 'Peach', 4], ['Pimiento', 'Bell pepper', 4], ['Cebolla', 'Onion', 4],
      ['Alcachofa', 'Artichoke', 4], ['Choclo', 'Peruvian corn', 4], ['Atún', 'Tuna', 4], ['Tomate', 'Tomato', 4]]);
    g('extras-pasta', 'Agregados para tu pasta', 'Pasta extras', 'varias', 'NO', [
      ['Queso parmesano extra', 'Extra parmesan', ''], ['Champiñones', 'Mushrooms', ''], ['Jamón', 'Ham', ''], ['Tocino', 'Bacon', '']], 'NO');
    return f;
  })()
};

/** Aplica la actualización v2 sobre las tablas (objetos). Función pura: se prueba fuera de Google. */
function aplicarMigracionV2_(t, M) {
  M = M || MIGRACION_V2;
  var porId = {};
  t.productos.forEach(function (p) { porId[String(p.id)] = p; });
  Object.keys(M.productos).forEach(function (id) {
    var p = porId[id];
    if (!p) return;
    Object.keys(M.productos[id]).forEach(function (k) { p[k] = M.productos[id][k]; });
  });
  M.productosNuevos.forEach(function (n) {
    if (porId[n.id]) return;
    var p = { canal: 'todos', disponible: 'SI', visible: 'SI', destacado: '', alergenos: '', foto: '', recargo: '', tamanos: '', precio_antes: '', opciones: '', nombre_en: '' };
    Object.keys(n).forEach(function (k) { p[k] = n[k]; });
    t.productos.push(p);
    porId[n.id] = p;
  });
  t.productos.forEach(function (p) { if (!p.canal) p.canal = 'todos'; });

  var secPorId = {};
  t.secciones.forEach(function (s) { secPorId[String(s.id)] = s; });
  M.seccionesNuevas.forEach(function (n) {
    if (secPorId[n.id]) return;
    var s = {}; Object.keys(n).forEach(function (k) { s[k] = n[k]; });
    t.secciones.unshift(s); secPorId[n.id] = s;
  });
  Object.keys(M.secciones).forEach(function (id) {
    var s = secPorId[id]; if (!s) return;
    Object.keys(M.secciones[id]).forEach(function (k) { s[k] = M.secciones[id][k]; });
  });

  var existentes = {};
  t.opciones.forEach(function (o) { existentes[o.grupo] = true; });
  M.opciones.forEach(function (r) {
    if (existentes[r[0]]) return;
    var o = {}; COLS.opciones.forEach(function (c, i) { o[c] = r[i]; });
    t.opciones.push(o);
  });
  M.opciones.forEach(function (r) { existentes[r[0]] = true; });

  M.config.forEach(function (r) { if (!(r[0] in t.config)) t.config[r[0]] = { valor: r[1], ayuda: r[2], nuevo: true }; });
  return t;
}

/** Ejecuta la actualización v2 en este Google Sheets. */
function actualizarV2() {
  exigirAdmin_('');
  var ss = SpreadsheetApp.getActive();
  var t = {
    productos: leerTabla_(HOJA.productos),
    secciones: leerTabla_(HOJA.secciones),
    opciones: ss.getSheetByName(HOJA.opciones) ? leerTabla_(HOJA.opciones) : [],
    config: leerConfig_()
  };
  aplicarMigracionV2_(t);
  escribirTabla_(HOJA.productos, COLS.productos, t.productos);
  escribirTabla_(HOJA.secciones, COLS.secciones, t.secciones);
  escribirTabla_(HOJA.opciones, COLS.opciones, t.opciones);
  MIGRACION_V2.config.forEach(function (r) {
    var c = t.config[r[0]];
    if (c && c.nuevo) ss.getSheetByName(HOJA.config).appendRow([r[0], r[1], r[2]]);
  });
  formatearHojas_();
  marcarPendiente_();
  PropertiesService.getScriptProperties().setProperty('MIGRACION_V2', new Date().toISOString());
  return 'Actualización v2 aplicada: ' + t.productos.length + ' productos, ' + t.opciones.length + ' opciones.';
}

/* =====================================================================
   PASTA GALLO · Actualización v3 (11-nov-2026) — función "actualizarV3"
   - Alérgenos referenciales de cada producto (según la receta típica; confirmar con cocina)
   - Fotos referenciales (Unsplash, licencia gratuita) donde aún no hay foto propia
   - Prodotti d'Italia: 3 wafers y 3 galletas Tre Marie, 2 productos Caffarel
   - Se eliminan las cervezas; la sección queda como "Vini"
   - Café, té y chocolate caliente pasan a su propia sección "Caffetteria" (solo en el local)
   Se puede repetir sin problema. NUNCA reemplaza una foto que ya esté subida.
   ===================================================================== */
var U_ = function (id) { return 'https://images.unsplash.com/photo-' + id + '?w=700&q=70&auto=format&fit=crop'; };
var MIGRACION_V3 = {
  eliminar: ['vini-birra-cusquena', 'vini-birra-pilsen'],
  alergenos: {
    'antipasti-pane-allaglio': 'gluten, lacteos', 'antipasti-pane-allaglio-con-formaggio': 'gluten, lacteos',
    'antipasti-bruschetta-ai-funghi': 'gluten', 'antipasti-bruschetta-alla-siciliana': 'gluten',
    'antipasti-insalata-caprese': 'lacteos', 'antipasti-frittata-di-cipolla': 'huevo', 'antipasti-frittata-mista': 'huevo',
    'antipasti-crespelle-agli-asparagi': 'gluten, huevo, lacteos',
    'pizze-napoletana': 'gluten, lacteos', 'pizze-americana': 'gluten, lacteos', 'pizze-arrabbiata': 'gluten, lacteos',
    'pizze-speciale': 'gluten, lacteos', 'pizze-tentazione': 'gluten, lacteos', 'pizze-hawaiana': 'gluten, lacteos',
    'pizze-vegetariana': 'gluten, lacteos', 'pizze-ghiottona': 'gluten, lacteos', 'pizze-campagnola': 'gluten, lacteos',
    'pizze-primavera': 'gluten, lacteos', 'pizze-quattro-stagioni': 'gluten, lacteos, pescado', 'pizze-piemontese': 'gluten, lacteos',
    'pizze-quattro-formaggi': 'gluten, lacteos', 'pizze-la-peruanita': 'gluten, lacteos, soya', 'pizze-abbuffata': 'gluten, lacteos',
    'pizze-la-chama': 'gluten, lacteos',
    'pasta-fonte-di-ravioli': 'gluten, huevo, lacteos', 'pasta-fonte-di-ravioli-di-carne': 'gluten, huevo',
    'pasta-fonte-di-fettuccine': 'gluten', 'pasta-tris-di-pasta': 'gluten, huevo, lacteos',
    'pasta-fettuccine-allalfredo-con-lomo': 'gluten, lacteos', 'pasta-spaghetti-alla-huancaina-con-lomo': 'gluten, lacteos',
    'pasta-spaghetti-ai-gamberoni': 'gluten, mariscos', 'pasta-fettuccine': 'gluten', 'pasta-pappardelle': 'gluten',
    'pasta-spaghetti': 'gluten', 'pasta-conchiglie': 'gluten', 'pasta-gomiti': 'gluten', 'pasta-maccheroni': 'gluten',
    'pasta-ravioli-di-carne': 'gluten, huevo', 'pasta-ravioli-di-formaggio': 'gluten, huevo, lacteos', 'pasta-raviolini': 'gluten, huevo',
    'pasta-tortellini': 'gluten, huevo', 'pasta-gnocchi-di-patate': 'gluten',
    'salsa-puttanesca': 'pescado', 'salsa-alfredo': 'lacteos', 'salsa-gorgonzola': 'lacteos', 'salsa-rosata': 'lacteos',
    'salsa-pesto': 'lacteos, frutosSecos', 'salsa-quattro-formaggi': 'lacteos', 'salsa-salsa-al-lomo': 'soya',
    'salsa-funghi-e-cardonada': 'gluten, lacteos', 'salsa-carbonara': 'huevo, lacteos',
    'lasagne-lasagna-di-spinaci': 'gluten, huevo, lacteos', 'lasagne-lasagna-di-carne': 'gluten, huevo, lacteos',
    'lasagne-lasagna-agli-asparagi': 'gluten, huevo, lacteos', 'parrillas-milanesa-de-pollo': 'gluten, huevo',
    'dolci-tiramisu': 'gluten, huevo, lacteos', 'dolci-torta-al-cioccolato': 'gluten, huevo, lacteos',
    'dolci-biscotti-con-gocce-di-cioccolato': 'gluten, huevo, lacteos', 'dolci-biscotto-al-cioccolato': 'gluten, huevo, lacteos',
    'dolci-biscotto-red-velvet': 'gluten, huevo, lacteos',
    'caffe-cappuccino': 'lacteos', 'caffe-cioccolata-calda': 'lacteos',
    'aperitivi-pisco-sour': 'huevo', 'aperitivi-orgasmo': 'lacteos', 'aperitivi-algarrobina': 'huevo, lacteos', 'aperitivi-baileys-colada': 'lacteos',
    'vini-calice-di-vino': 'sulfitos', 'vini-sangria': 'sulfitos', 'vini-tabernero-gran-tinto': 'sulfitos', 'vini-tabernero-borgona': 'sulfitos',
    'vini-gran-blanco': 'sulfitos', 'vini-frontera': 'sulfitos', 'vini-tacama-seco': 'sulfitos', 'vini-tacama-semiseco': 'sulfitos',
    'vini-casillero-del-diablo': 'sulfitos', 'vini-spumante-brut-tabernero': 'sulfitos', 'vini-patrillo': 'sulfitos', 'vini-prisionero': 'sulfitos',
    'italia-wafer-mandorlato-tre-marie': 'gluten, lacteos, frutosSecos, soya'
  },
  fotos: {
    'antipasti-pane-allaglio': '1587676353811-1708ddf47031', 'antipasti-pane-allaglio-con-formaggio': '1619535860434-ba1d8fa12536',
    'antipasti-bruschetta-ai-funghi': '1732188356856-b85a4d62dec0', 'antipasti-bruschetta-alla-siciliana': '1630230596944-6373069c837d',
    'antipasti-prosciutto-crudo': '1598989519542-077da0f51c09', 'antipasti-affettato-misto': '1781714534211-3236a60d9ce4',
    'antipasti-piqueo-allitaliana': '1637370988123-41bd9a6bcd48', 'antipasti-insalata-italiana': '1746211108786-ca20c8f80ecd',
    'antipasti-insalata-caprese': '1769458313937-b5ad8f84942e', 'antipasti-frittata-di-cipolla': '1668283653825-37b80f055b05',
    'antipasti-frittata-mista': '1510693206972-df098062cb71', 'antipasti-crespelle-agli-asparagi': '1777891258086-52a41e4477f6',
    'pizze-napoletana': '1700760933900-320bf1158d71', 'pizze-americana': '1717883235373-ef10b2a745a3',
    'pizze-arrabbiata': '1777891257674-36c5532e6654', 'pizze-speciale': '1677175183792-e6a9b8b14305',
    'pizze-tentazione': '1672856398893-2fb52d807874', 'pizze-hawaiana': '1778449726826-8b0c92e4624e',
    'pizze-vegetariana': '1625401514458-6c8a5e7d55da', 'pizze-ghiottona': '1588014164218-d9ecba01aaff',
    'pizze-campagnola': '1642789736327-14d9c36496d7', 'pizze-primavera': '1565299624946-b28f40a0ae38',
    'pizze-quattro-stagioni': '1573821663912-569905455b1c', 'pizze-piemontese': '1716237387757-db2149bf02d0',
    'pizze-quattro-formaggi': '1655070249064-2556803629b6', 'pizze-la-peruanita': '1622880833523-7cf1c0bd4296',
    'pizze-abbuffata': '1541745537411-b8046dc6d66c', 'pizze-la-chama': '1615719413546-198b25453f85',
    'pasta-fonte-di-ravioli': '1659813952313-eb81e5b3fbdd', 'pasta-fonte-di-ravioli-di-carne': '1778850620699-79ba3ff60bf0',
    'pasta-fonte-di-fettuccine': '1627207644206-a2040d60ecad', 'pasta-tris-di-pasta': '1616299915952-04c803388e5f',
    'pasta-fettuccine-allalfredo-con-lomo': '1791202978575-21e01ab3a6e5', 'pasta-spaghetti-alla-huancaina-con-lomo': '1581228258201-fe6e5861d1f6',
    'pasta-spaghetti-ai-gamberoni': '1563379926898-05f4575a45d8', 'pasta-fettuccine': '1664214649076-7b17006db5b5',
    'pasta-pappardelle': '1601751911508-fd69ffc08fa2', 'pasta-spaghetti': '1627042633145-b780d842ba45',
    'pasta-conchiglie': '1606503854923-95e45999ae2f', 'pasta-gomiti': '1708184528301-b0dad28dded5',
    'pasta-maccheroni': '1707870678076-40ba56a65ece', 'pasta-ravioli-di-carne': '1594610352113-ad218529cfb7',
    'pasta-ravioli-di-formaggio': '1628885363743-fbf9c98d4196', 'pasta-raviolini': '1665761543682-6305ccc5398b',
    'pasta-tortellini': '1628885405379-5d58de03edb0',
    'lasagne-lasagna-di-spinaci': '1633436374961-09b92742047b', 'lasagne-lasagna-di-carne': '1709429790175-b02bb1b19207',
    'lasagne-lasagna-agli-asparagi': '1762631883229-95cfb6a063ad',
    'parrillas-parrilla-mixta': '1702827487086-9ab8a573d825', 'parrillas-lomo-fino-a-la-plancha': '1600891964092-4316c288032e',
    'parrillas-churrasco-o-chuleta': '1662499754738-e0d6ac84f308', 'parrillas-milanesa-de-pollo': '1682970078535-cd0cf994ee96',
    'parrillas-porcion-de-chorizo': '1750461325551-02b7ea57625a',
    'dolci-tiramisu': '1631206753348-db44968fd440', 'dolci-torta-al-cioccolato': '1615796701805-2094ac54bbf9',
    'dolci-biscotti-con-gocce-di-cioccolato': '1782852232674-64bc7f102866', 'dolci-biscotto-al-cioccolato': '1582623201359-74e936ed48c4',
    'dolci-biscotto-red-velvet': '1593675418918-08817c2d8682',
    'caffe-caffe': '1497515114629-f71d768fd07c', 'caffe-espresso': '1579992357154-faf4bde95b3d',
    'caffe-cappuccino': '1506372023823-741c83b836fe', 'caffe-cioccolata-calda': '1542990253-0d0f5be5f0ed',
    'caffe-te': '1595434091143-b375ced5fe5c', 'caffe-limonata': '1575596510825-f748919a2bf7',
    'caffe-maracuya': '1546751706-81c567470489', 'caffe-bibita-gassata': '1618183507099-4fa269f9b0ee',
    'caffe-acqua': '1548839140-29a749e1cf4d', 'caffe-acqua-frizzante': '1775390722213-2830af4dde60',
    'caffe-ghiaccio': '1782179186180-357225891bb0',
    'aperitivi-pina-colada': '1617728273800-1e615ab03037', 'aperitivi-pisco-sour': '1632995561510-38616ed64ff6',
    'aperitivi-dont-worry-be-happy': '1762883469122-c15463bbce28', 'aperitivi-chilcano': '1609951651556-5334e2706168',
    'aperitivi-bob-dylan': '1500217052183-bc01eee1a74e', 'aperitivi-orgasmo': '1767065703431-704a051e4c83',
    'aperitivi-algarrobina': '1696594935685-1ad6ba69e83e', 'aperitivi-baileys-colada': '1607446045710-d5a8fd9bc1db',
    'vini-calice-di-vino': '1553361371-9b22f78e8b1d', 'vini-sangria': '1682423228933-0e8b8fc4f92a',
    'vini-tabernero-gran-tinto': '1767510533093-ffb6421a002d', 'vini-tabernero-borgona': '1474722883778-792e7990302f',
    'vini-gran-blanco': '1585553616435-2dc0a54e271d', 'vini-frontera': '1630369160812-26c7604cbd8c',
    'vini-tacama-seco': '1786384243745-c6d779c13e7d', 'vini-tacama-semiseco': '1765033670193-be9fc10ccd8a',
    'vini-casillero-del-diablo': '1764874299343-e55d7af327cd', 'vini-spumante-brut-tabernero': '1706106591925-8818b8bf7fc0',
    'vini-patrillo': '1578911373434-0cb395d2cbfb', 'vini-prisionero': '1611575189074-9dfbbceb258a',
    'italia-wafer-nocciolato-tre-marie': '1612739406198-71fc29b3c1c9', 'italia-wafer-stracciatella-tre-marie': '1772986234414-ada1a1cef8e4',
    'italia-wafer-gianduia-nera-tre-marie': '1772985427174-e140b55944a5', 'italia-gianduia-classica-caffarel': '1571091799989-e88304d6aed3',
    'italia-gianduia-assortito-caffarel': '1548741487-18d363dc4469', 'italia-cioccolato-in-pezzi-tre-marie': '1583743089695-4b816a340f82',
    'italia-caramello-salato-tre-marie': '1706167754899-36a714b5dc66', 'italia-cacao-gocce-tre-marie': '1590080874088-eec64895b423'
  },
  // café, té y chocolate caliente: nueva sección y solo en el local
  caffetteria: ['caffe-caffe', 'caffe-espresso', 'caffe-cappuccino', 'caffe-cioccolata-calda', 'caffe-te'],
  productos: {
    'italia-wafer-mandorlato-tre-marie': { orden: 10 }
  },
  secciones: {
    vini: { titulo: 'Vini', titulo_en: 'Wines', subtitulo_en: 'The perfect pairing' },
    caffe: { titulo: 'Bevande', subtitulo: 'Refrescos, gaseosas y agua', intro: '', titulo_en: 'Drinks', subtitulo_en: 'Soft drinks and water', intro_en: '' }
  },
  seccionNueva: { id: 'caffetteria', titulo: 'Caffetteria', subtitulo: 'Café, té y chocolate caliente',
    intro: 'Se preparan al momento y se sirven solo en el local.', pie: '', alcohol: 'NO', delivery: 'SI', mesa: 'SI', visible: 'SI',
    titulo_en: 'Caffetteria', subtitulo_en: 'Coffee, tea and hot chocolate', intro_en: 'Freshly made and served only at the restaurant.', pie_en: '' },
  productosNuevos: [
    { id: 'italia-wafer-nocciolato-tre-marie', seccion: 'italia', grupo: 'Tre Marie', orden: 20, nombre: 'Wafer Nocciolato Tre Marie',
      glosa: 'Wafer con crema de avellanas', precio: 17.9, tipo: 'plato', alergenos: 'gluten, lacteos, frutosSecos, soya',
      descripcion: 'De la línea «Ancora Uno» de Tre Marie, antigua marca de la tradición pastelera milanesa: finas láminas de barquillo dorado y crujiente, rellenas de una suave crema de avellanas. El acompañante perfecto para un café.',
      nombre_en: 'Wafer Nocciolato Tre Marie', glosa_en: 'Hazelnut cream wafers',
      descripcion_en: 'From Tre Marie’s «Ancora Uno» line, a historic brand of Milanese pastry tradition: thin, crisp golden wafers filled with a smooth hazelnut cream. The perfect companion for a coffee.' },
    { id: 'italia-wafer-stracciatella-tre-marie', seccion: 'italia', grupo: 'Tre Marie', orden: 30, nombre: 'Wafer Stracciatella Tre Marie',
      glosa: 'Wafer con crema de leche y chocolate', precio: 17.9, tipo: 'plato', alergenos: 'gluten, lacteos, frutosSecos, soya',
      descripcion: 'Inspirados en el clásico helado italiano: capas de barquillo crujiente rellenas de crema de leche con trocitos de chocolate extra amargo. Elaborados sin grasas hidrogenadas.',
      nombre_en: 'Wafer Stracciatella Tre Marie', glosa_en: 'Milk cream and chocolate wafers',
      descripcion_en: 'Inspired by the classic Italian gelato: crisp wafer layers filled with milk cream and pieces of extra dark chocolate. Made without hydrogenated fats.' },
    { id: 'italia-wafer-gianduia-nera-tre-marie', seccion: 'italia', grupo: 'Tre Marie', orden: 40, nombre: 'Wafer Gianduia Nera Tre Marie',
      glosa: 'Wafer con crema gianduia oscura', precio: 17.9, tipo: 'plato', alergenos: 'gluten, lacteos, frutosSecos, soya',
      descripcion: 'Barquillo crujiente relleno de crema gianduia —la tradicional unión piamontesa de cacao y avellanas— en su versión oscura, de sabor intenso.',
      nombre_en: 'Wafer Gianduia Nera Tre Marie', glosa_en: 'Dark gianduia cream wafers',
      descripcion_en: 'Crisp wafers filled with gianduia cream —the traditional Piedmontese blend of cocoa and hazelnuts— in its dark, intense version.' },
    { id: 'italia-cioccolato-in-pezzi-tre-marie', seccion: 'italia', grupo: 'Tre Marie', orden: 50, nombre: 'Cioccolato in Pezzi Tre Marie',
      glosa: 'Galletas con trozos de chocolate', precio: 28.9, tipo: 'plato', alergenos: 'gluten, huevo, lacteos, soya, frutosSecos',
      descripcion: 'Frollini, las galletas de masa quebrada de la tradición italiana, con generosos trozos de chocolate. Para el desayuno, la merienda o el café.',
      nombre_en: 'Cioccolato in Pezzi Tre Marie', glosa_en: 'Chocolate chunk biscuits',
      descripcion_en: 'Frollini, the traditional Italian shortbread biscuits, with generous chunks of chocolate. For breakfast, an afternoon snack or with coffee.' },
    { id: 'italia-caramello-salato-tre-marie', seccion: 'italia', grupo: 'Tre Marie', orden: 60, nombre: 'Caramello Salato e Cioccolato Tre Marie',
      glosa: 'Galletas con caramelo salado y chocolate', precio: 28.9, tipo: 'plato', alergenos: 'gluten, huevo, lacteos, soya, frutosSecos',
      descripcion: 'Galletas de masa quebrada con caramelo salado y chispas de chocolate, hechas con trigo 100 % italiano. Un contraste dulce y salado irresistible.',
      nombre_en: 'Caramello Salato e Cioccolato Tre Marie', glosa_en: 'Salted caramel and chocolate biscuits',
      descripcion_en: 'Shortbread biscuits with salted caramel and chocolate chips, made with 100% Italian wheat. An irresistible sweet-and-salty contrast.' },
    { id: 'italia-cacao-gocce-tre-marie', seccion: 'italia', grupo: 'Tre Marie', orden: 70, nombre: 'Cacao con Gocce di Cioccolato Tre Marie',
      glosa: 'Galletas de cacao con chispas de chocolate', precio: 28.9, tipo: 'plato', alergenos: 'gluten, huevo, lacteos, soya, frutosSecos',
      descripcion: 'Galletas de cacao con chispas de chocolate extra amargo, hechas con trigo 100 % italiano, mantequilla y huevos de gallinas criadas en libertad.',
      nombre_en: 'Cacao con Gocce di Cioccolato Tre Marie', glosa_en: 'Cocoa biscuits with chocolate chips',
      descripcion_en: 'Cocoa biscuits with extra dark chocolate chips, made with 100% Italian wheat, butter and free-range eggs.' },
    { id: 'italia-gianduia-classica-caffarel', seccion: 'italia', grupo: 'Caffarel', orden: 110, nombre: 'Gianduia Classica Caffarel',
      glosa: 'Barra de chocolate gianduia', precio: 27.9, tipo: 'plato', alergenos: 'frutosSecos, lacteos, soya',
      descripcion: 'De Caffarel, la histórica chocolatería de Turín que creó el gianduiotto en 1865. Chocolate gianduia clásico: cacao y avellanas del Piamonte, cremoso y aterciopelado.',
      nombre_en: 'Gianduia Classica Caffarel', glosa_en: 'Gianduia chocolate bar',
      descripcion_en: 'From Caffarel, the historic Turin chocolate maker that created the gianduiotto in 1865. Classic gianduia chocolate: cocoa and Piedmont hazelnuts, creamy and velvety.' },
    { id: 'italia-gianduia-assortito-caffarel', seccion: 'italia', grupo: 'Caffarel', orden: 120, nombre: 'Gianduia Assortito Caffarel',
      glosa: 'Caja surtida de gianduiotti', precio: 215.9, tipo: 'plato', alergenos: 'frutosSecos, lacteos, soya',
      descripcion: 'Caja surtida de gianduiotti, el célebre bombón turinés de chocolate y avellanas Piemonte IGP, en versiones de chocolate con leche y oscuro. Un regalo a la altura de cualquier ocasión.',
      nombre_en: 'Gianduia Assortito Caffarel', glosa_en: 'Assorted gianduiotti box',
      descripcion_en: 'An assorted box of gianduiotti, the famous Turin chocolate made with Piemonte IGP hazelnuts, in milk and dark chocolate. A gift worthy of any occasion.' }
  ]
};

function aplicarMigracionV3_(t, M) {
  M = M || MIGRACION_V3;
  var fuera = {}; M.eliminar.forEach(function (id) { fuera[id] = true; });
  t.productos = t.productos.filter(function (p) { return !fuera[String(p.id)]; });
  var porId = {}; t.productos.forEach(function (p) { porId[String(p.id)] = p; });
  M.productosNuevos.forEach(function (n) {
    if (porId[n.id]) return;
    var p = { canal: 'todos', disponible: 'SI', visible: 'SI', destacado: '', alergenos: '', foto: '', recargo: '', tamanos: '',
      precio_antes: '', opciones: '', grupo_nota: '', requiere_salsa: 'NO' };
    Object.keys(n).forEach(function (k) { p[k] = n[k]; });
    t.productos.push(p); porId[n.id] = p;
  });
  Object.keys(M.productos).forEach(function (id) { var p = porId[id]; if (p) Object.keys(M.productos[id]).forEach(function (k) { p[k] = M.productos[id][k]; }); });
  Object.keys(M.alergenos).forEach(function (id) { var p = porId[id]; if (p && !String(p.alergenos || '').trim()) p.alergenos = M.alergenos[id]; });
  Object.keys(M.fotos).forEach(function (id) { var p = porId[id]; if (p && !String(p.foto || '').trim()) p.foto = U_(M.fotos[id]); });
  M.caffetteria.forEach(function (id) { var p = porId[id]; if (p) { p.seccion = 'caffetteria'; p.canal = 'local'; } });

  var secPorId = {}; t.secciones.forEach(function (s) { secPorId[String(s.id)] = s; });
  Object.keys(M.secciones).forEach(function (id) { var s = secPorId[id]; if (s) Object.keys(M.secciones[id]).forEach(function (k) { s[k] = M.secciones[id][k]; }); });
  if (!secPorId[M.seccionNueva.id]) {
    var base = secPorId.caffe ? Number(secPorId.caffe.orden) || 7 : 7;
    var s = {}; Object.keys(M.seccionNueva).forEach(function (k) { s[k] = M.seccionNueva[k]; });
    s.orden = base - 0.5;
    t.secciones.push(s);
  }
  return t;
}

/** Ejecuta la actualización v3 en este Google Sheets y publica la carta. */
function actualizarV3() {
  exigirAdmin_('');
  var t = { productos: leerTabla_(HOJA.productos), secciones: leerTabla_(HOJA.secciones) };
  aplicarMigracionV3_(t);
  escribirTabla_(HOJA.productos, COLS.productos, t.productos);
  escribirTabla_(HOJA.secciones, COLS.secciones, t.secciones);
  formatearHojas_();
  marcarPendiente_();
  PropertiesService.getScriptProperties().setProperty('MIGRACION_V3', new Date().toISOString());
  var r = publicarCarta('');
  return 'Actualización v3 aplicada: ' + t.productos.length + ' productos. ' + r.mensaje;
}

/* =====================================================================
   PASTA GALLO · Actualización v4: PROMOCIONES CON CALENDARIO (11-nov-2026)
   Se ejecuta UNA vez con la función "actualizarV4". Se puede repetir:
   - No borra nada. Si un combo ya existe, NO lo pisa (respeta lo que editaste en el panel).
   - Agrega columnas nuevas a Productos (incluye, días, fechas, horas) y a Pedidos (origen).
   - Crea los grupos "Sabor de pizza" de cada combo (si no existen).
   - Carga los 4 combos actuales con el plan de la dueña:
       martes a jueves → Combo Personale, Combo Alfredo y Combo per Due
       viernes a domingo → Combo Famiglia
   ===================================================================== */
var MIGRACION_V4 = {
  seccion: { id: 'promociones', delivery: 'SI', mesa: 'NO', visible: 'SI', titulo: 'Offerte', subtitulo: 'Combos de la casa',
    intro: 'Para llevar: delivery o recojo en el local. Cada combo tiene sus días.',
    subtitulo_en: 'House combos', intro_en: 'For delivery or pick-up. Each combo has its own days.' },

  grupos: [
    { id: 'combo-pizza-personal', nombre: 'Sabor de pizza', nombre_en: 'Pizza flavour', ops: ['Hawaiana', 'Americana'] },
    { id: 'combo-pizza-mediana', nombre: 'Sabor de pizza mediana', nombre_en: 'Medium pizza flavour',
      ops: ['Americana', 'Hawaiana', 'Napoletana', 'Arrabbiata', 'Speciale', 'Tentazione', 'Vegetariana', 'Ghiottona', 'Campagnola', 'Primavera'] },
    { id: 'combo-pizza-familiar', nombre: 'Sabor de pizza familiar', nombre_en: 'Family pizza flavour',
      ops: ['Americana', 'Hawaiana', 'Napoletana', 'Arrabbiata', 'Speciale', 'Tentazione', 'Vegetariana', 'Ghiottona', 'Campagnola',
        'Quattro Stagioni', 'Piemontese', 'Abbuffata', 'La Chama'] }
  ],

  // componentes: de dónde se copian alérgenos (referenciales) y la foto referencial
  combos: [
    { id: 'promociones-combo-personale', orden: 10, nombre: 'Combo Personale', precio: 25,
      glosa: 'pizza personal + pan al ajo + Pepsi', glosa_en: 'personal pizza + garlic bread + Pepsi',
      descripcion: 'Tu pizza personal, Hawaiana o Americana, con dos porciones de pan al ajo y una Pepsi helada.',
      descripcion_en: 'Your personal pizza, Hawaiian or Americana, with two portions of garlic bread and a cold Pepsi.',
      incluye: 'Pizza personal Hawaiana o Americana\n2 porciones de pan al ajo\nPepsi de ½ litro',
      incluye_en: 'Personal Hawaiian or Americana pizza\n2 portions of garlic bread\n½-litre Pepsi',
      opciones: 'combo-pizza-personal, temp-bebida', promo_dias: 'mar, mie, jue',
      componentes: ['pizze-hawaiana', 'antipasti-pane-allaglio'], fotoDe: 'pizze-hawaiana' },
    { id: 'promociones-combo-alfredo', orden: 20, nombre: 'Combo Alfredo', precio: 35,
      glosa: 'fettuccine + pan al ajo + Pepsi', glosa_en: 'fettuccine + garlic bread + Pepsi',
      descripcion: 'Una porción de fettuccine all’Alfredo, cremosos y generosos, con tres porciones de pan al ajo y una Pepsi.',
      descripcion_en: 'A portion of creamy fettuccine Alfredo with three portions of garlic bread and a Pepsi.',
      incluye: 'Fettuccine all’Alfredo\n3 porciones de pan al ajo\nPepsi de ½ litro',
      incluye_en: 'Fettuccine Alfredo\n3 portions of garlic bread\n½-litre Pepsi',
      opciones: 'temp-bebida', promo_dias: 'mar, mie, jue',
      componentes: ['pasta-fettuccine', 'salsa-alfredo', 'antipasti-pane-allaglio'], fotoDe: 'pasta-fettuccine' },
    { id: 'promociones-combo-per-due', orden: 30, nombre: 'Combo per Due', precio: 60,
      glosa: 'pizza mediana + fettuccine + pan al ajo + Pepsi', glosa_en: 'medium pizza + fettuccine + garlic bread + Pepsi',
      descripcion: 'Para compartir entre dos: una pizza mediana a elección y un plato de fettuccine all’Alfredo, con pan al ajo y Pepsi.',
      descripcion_en: 'To share between two: a medium pizza of your choice and a plate of fettuccine Alfredo, with garlic bread and Pepsi.',
      incluye: 'Pizza mediana a elección\nFettuccine all’Alfredo\n2 porciones de pan al ajo\nPepsi de ½ litro',
      incluye_en: 'Medium pizza of your choice\nFettuccine Alfredo\n2 portions of garlic bread\n½-litre Pepsi',
      opciones: 'combo-pizza-mediana, temp-bebida', promo_dias: 'mar, mie, jue',
      componentes: ['pizze-americana', 'pasta-fettuccine', 'salsa-alfredo', 'antipasti-pane-allaglio'], fotoDe: 'pizze-americana' },
    { id: 'promociones-combo-famiglia', orden: 40, nombre: 'Combo Famiglia', precio: 65,
      glosa: 'pizza familiar + pan al ajo + Pepsi 1.5 L', glosa_en: 'family pizza + garlic bread + 1.5 L Pepsi',
      descripcion: 'La mesa del fin de semana: una pizza familiar a elección, cuatro porciones de pan al ajo y una Pepsi de litro y medio.',
      descripcion_en: 'The weekend table: a family-size pizza of your choice, four portions of garlic bread and a 1.5-litre Pepsi.',
      incluye: 'Pizza familiar a elección\n4 porciones de pan al ajo\nPepsi de 1.5 litros',
      incluye_en: 'Family-size pizza of your choice\n4 portions of garlic bread\n1.5-litre Pepsi',
      opciones: 'combo-pizza-familiar, temp-bebida', promo_dias: 'vie, sab, dom',
      componentes: ['pizze-arrabbiata', 'antipasti-pane-allaglio'], fotoDe: 'pizze-arrabbiata' }
  ]
};

/** Lógica pura de la v4 (se puede probar sin Google). t = { productos, secciones, opciones } */
function aplicarMigracionV4_(t, M) {
  M = M || MIGRACION_V4;
  var porId = {}; t.productos.forEach(function (p) { porId[String(p.id)] = p; });
  var creados = [];
  M.combos.forEach(function (c) {
    if (porId[c.id]) return; // ya existe: no se pisa
    var al = [];
    c.componentes.forEach(function (id) {
      var x = porId[id]; if (!x) return;
      String(x.alergenos || '').split(',').forEach(function (a) { a = a.trim(); if (a && al.indexOf(a) < 0) al.push(a); });
    });
    var p = { id: c.id, seccion: 'promociones', grupo: '', grupo_nota: '', orden: c.orden, nombre: c.nombre, glosa: c.glosa,
      descripcion: c.descripcion, precio: c.precio, tamanos: '', tipo: 'plato', recargo: '', requiere_salsa: 'NO',
      disponible: 'SI', visible: 'SI', destacado: '', alergenos: al.join(', '), foto: porId[c.fotoDe] ? porId[c.fotoDe].foto || '' : '',
      canal: 'delivery', precio_antes: '', opciones: c.opciones, nombre_en: '', glosa_en: c.glosa_en, descripcion_en: c.descripcion_en,
      incluye: c.incluye, incluye_en: c.incluye_en, promo_dias: c.promo_dias, promo_desde: '', promo_hasta: '', promo_horas: '',
      promo_excluir: '', promo_extra: '' };
    t.productos.push(p); porId[c.id] = p; creados.push(c.nombre);
  });
  var sec = t.secciones.filter(function (s) { return String(s.id) === M.seccion.id; })[0];
  if (!sec) { sec = { orden: 0, pie: '', alcohol: 'NO', titulo_en: 'Offerte', pie_en: '' }; t.secciones.push(sec); }
  Object.keys(M.seccion).forEach(function (k) { sec[k] = M.seccion[k]; });

  var existentes = {}; t.opciones.forEach(function (o) { existentes[String(o.grupo)] = true; });
  M.grupos.forEach(function (g) {
    if (existentes[g.id]) return;
    g.ops.forEach(function (op, i) {
      t.opciones.push({ grupo: g.id, nombre: g.nombre, nombre_en: g.nombre_en, tipo: 'una', obligatorio: 'SI', opcion: op, opcion_en: '',
        precio: 0, orden: (i + 1) * 10, activo: 'SI' });
    });
  });
  return { t: t, creados: creados };
}

function actualizarV4() {
  exigirAdmin_('');
  var ss = SpreadsheetApp.getActive();
  asegurarColumnas_(ss.getSheetByName(HOJA.productos), COLS.productos);
  asegurarColumnas_(ss.getSheetByName(HOJA.pedidos), COLS.pedidos);
  var t = { productos: leerTabla_(HOJA.productos), secciones: leerTabla_(HOJA.secciones), opciones: leerTabla_(HOJA.opciones) };
  var r = aplicarMigracionV4_(t);
  escribirTabla_(HOJA.productos, COLS.productos, t.productos);
  escribirTabla_(HOJA.secciones, COLS.secciones, t.secciones);
  escribirTabla_(HOJA.opciones, COLS.opciones, t.opciones);
  formatearHojas_();
  marcarPendiente_();
  PropertiesService.getScriptProperties().setProperty('MIGRACION_V4', new Date().toISOString());
  var pub = publicarCarta('');
  return 'Actualización v4 aplicada. Combos nuevos: ' + (r.creados.join(', ') || 'ninguno (ya existían)') + '. ' + pub.mensaje;
}

/* =====================================================================
   PASTA GALLO · Ajuste v4b de los combos (11-nov-2026)
   Función "actualizarV4b". Se puede repetir.
   - 1 porción de pan al ajo = 2 rebanadas: se aclara en "Qué incluye".
   - Fettuccine clásico o verde (verde sujeto a disponibilidad) en Combo Alfredo y Combo per Due.
   - Fotos REFERENCIALES de los combos (Unsplash, licencia gratuita) copiadas al repositorio
     (carpeta fotos/). Solo se ponen si el combo no tiene una foto subida desde el panel.
   ===================================================================== */
var MIGRACION_V4B = {
  fotos: {
    'promociones-combo-personale': 'photo-1778449038133-2219a23a6bcd',
    'promociones-combo-alfredo': 'photo-1645112411341-6c4fd023714a',
    'promociones-combo-per-due': 'photo-1552580715-4d9bc27f1e2f',
    'promociones-combo-famiglia': 'photo-1600628421060-939639517883'
  },
  incluye: {
    'promociones-combo-personale': ['Pizza personal Hawaiana o Americana\n2 porciones de pan al ajo (4 rebanadas)\nPepsi de ½ litro',
      'Personal Hawaiian or Americana pizza\n2 portions of garlic bread (4 slices)\n½-litre Pepsi'],
    'promociones-combo-alfredo': ['Fettuccine all’Alfredo, clásico o verde\n3 porciones de pan al ajo (6 rebanadas)\nPepsi de ½ litro',
      'Fettuccine Alfredo, classic or green\n3 portions of garlic bread (6 slices)\n½-litre Pepsi'],
    'promociones-combo-per-due': ['Pizza mediana a elección\nFettuccine all’Alfredo, clásico o verde\n2 porciones de pan al ajo (4 rebanadas)\nPepsi de ½ litro',
      'Medium pizza of your choice\nFettuccine Alfredo, classic or green\n2 portions of garlic bread (4 slices)\n½-litre Pepsi'],
    'promociones-combo-famiglia': ['Pizza familiar a elección\n4 porciones de pan al ajo (8 rebanadas)\nPepsi de 1.5 litros',
      'Family-size pizza of your choice\n4 portions of garlic bread (8 slices)\n1.5-litre Pepsi']
  },
  fettuccine: ['promociones-combo-alfredo', 'promociones-combo-per-due']
};

function actualizarV4b() {
  exigirAdmin_('');
  var M = MIGRACION_V4B;
  var productos = leerTabla_(HOJA.productos);
  var porId = {}; productos.forEach(function (p) { porId[String(p.id)] = p; });
  var hechas = [];
  Object.keys(M.fotos).forEach(function (id) {
    var p = porId[id]; if (!p) return;
    var f = String(p.foto || '');
    if (f && f.indexOf('fotos/ref-') !== 0 && f.indexOf('images.unsplash.com') < 0) return; // ya tiene foto propia
    var ruta = 'fotos/ref-' + id.replace('promociones-', '') + '.jpg';
    var r = UrlFetchApp.fetch('https://images.unsplash.com/' + M.fotos[id] + '?w=1200&h=900&fit=crop&crop=entropy&q=72&fm=jpg', { muteHttpExceptions: true });
    if (r.getResponseCode() !== 200) return;
    githubPut_(ruta, Utilities.base64Encode(r.getBlob().getBytes()), 'Foto referencial (Unsplash) de ' + p.nombre);
    p.foto = ruta; hechas.push(p.nombre);
  });
  Object.keys(M.incluye).forEach(function (id) { var p = porId[id]; if (p) { p.incluye = M.incluye[id][0]; p.incluye_en = M.incluye[id][1]; } });
  M.fettuccine.forEach(function (id) {
    var p = porId[id]; if (!p) return;
    var ops = listaIds_(p.opciones);
    if (ops.indexOf('fettuccine-tipo') < 0) { ops.splice(ops.indexOf('temp-bebida') >= 0 ? ops.indexOf('temp-bebida') : ops.length, 0, 'fettuccine-tipo'); p.opciones = ops.join(', '); }
    var nota = ' El fettuccine verde está sujeto a disponibilidad.', notaEn = ' Green fettuccine is subject to availability.';
    if (String(p.descripcion || '').indexOf('sujeto a disponibilidad') < 0) p.descripcion = String(p.descripcion || '').trim() + nota;
    if (String(p.descripcion_en || '').indexOf('availability') < 0) p.descripcion_en = String(p.descripcion_en || '').trim() + notaEn;
  });
  escribirTabla_(HOJA.productos, COLS.productos, productos);
  marcarPendiente_();
  var pub = publicarCarta('');
  return 'v4b aplicada. Fotos referenciales: ' + (hechas.join(', ') || 'ninguna (ya tenían foto propia)') + '. ' + pub.mensaje;
}

/* =====================================================================
   PASTA GALLO · Fotos reales (se puede repetir cada vez que lleguen fotos nuevas)
   Función "actualizarFotosReales": pone en la hoja Productos la foto indicada
   (ya subida al repositorio en fotos/) y publica la carta.
   ===================================================================== */
var FOTOS_REALES = {
  'promociones-combo-alfredo': 'fotos/real-fettuccine-alfredo.jpg',
  'pasta-fettuccine': 'fotos/real-fettuccine-alfredo.jpg',
  'antipasti-pane-allaglio': 'fotos/real-pane-allaglio.jpg'
};

function actualizarFotosReales() {
  exigirAdmin_('');
  var h = SpreadsheetApp.getActive().getSheetByName(HOJA.productos);
  var col = asegurarColumnas_(h, COLS.productos).indexOf('foto') + 1;
  var hechas = [];
  leerTabla_(HOJA.productos).forEach(function (p) {
    var ruta = FOTOS_REALES[String(p.id)];
    if (ruta && String(p.foto) !== ruta) { h.getRange(p._fila, col).setValue(ruta); hechas.push(p.nombre); }
  });
  marcarPendiente_();
  var pub = publicarCarta('');
  return 'Fotos reales puestas en: ' + (hechas.join(', ') || 'ninguno (ya estaban)') + '. ' + pub.mensaje;
}

/* =====================================================================
   PASTA GALLO · Actualización v5 (11-nov-2026, noche) — función "actualizarV5"
   - Precios: pizzas +2 (cada tamaño), fuentes de ravioli 65, fuente de fettuccine +5,
     tris +2, resto de pastas +2, milanesa y churrasco +2
   - Pollo a la plancha (S/ 30)
   - Carta de vinos según la lista de la casa (11-nov-2026)
   - Comprobantes (boleta / factura) y cuenta abierta por mesa
   Los aumentos se aplican UNA sola vez (queda marcado); repetir la función no vuelve a subir precios.
   ===================================================================== */
var MIGRACION_V5 = {
  fotoPollo: 'https://images.unsplash.com/photo-1670398564097-0762e1b30b3a?w=700&q=70&auto=format&fit=crop',
  pizzasMas: 2,
  pastaFijos: { 'pasta-fonte-di-ravioli': 65, 'pasta-fonte-di-ravioli-di-carne': 65 },
  pastaMas: { 'pasta-fonte-di-fettuccine': 5 },
  pastaResto: 2,
  parrillasMas: { 'parrillas-milanesa-de-pollo': 2, 'parrillas-churrasco-o-chuleta': 2 },
  productosNuevos: [
    { id: 'parrillas-pollo-a-la-plancha', seccion: 'parrillas', grupo: '', orden: 35, nombre: 'Pollo a la Plancha', glosa: '',
      precio: 30, tipo: 'plato', alergenos: '', nombre_en: 'Grilled Chicken', foto: 'FOTO_POLLO' },
    { id: 'vini-ca-bianca', seccion: 'vini', grupo: 'Vini Italiani', orden: 110, nombre: "Ca' Bianca", glosa: 'Piamonte · Italia',
      precio: 80, tipo: 'plato', alergenos: 'sulfitos', glosa_en: 'Piedmont · Italy',
      descripcion: "Vino del Piamonte elaborado por Tenimenti Ca' Bianca.", descripcion_en: "A Piedmont wine by Tenimenti Ca' Bianca." },
    { id: 'vini-cavicchioli', seccion: 'vini', grupo: 'Vini Italiani', orden: 120, nombre: 'Cavicchioli', glosa: 'Emilia-Romaña · Italia',
      precio: 60, tipo: 'plato', alergenos: 'sulfitos', glosa_en: 'Emilia-Romagna · Italy',
      descripcion: 'De la casa Cavicchioli, fundada en 1928 en Emilia-Romaña y conocida por sus Lambruscos.',
      descripcion_en: 'From Cavicchioli, founded in 1928 in Emilia-Romagna and known for its Lambruscos.' },
    { id: 'vini-victoria', seccion: 'vini', grupo: 'Vini Italiani', orden: 130, nombre: 'Victoria', glosa: 'Italia',
      precio: 150, tipo: 'plato', alergenos: 'sulfitos', glosa_en: 'Italy' },
    { id: 'vini-tabernero-tuyo', seccion: 'vini', grupo: 'Vini Sudamericani', orden: 210, nombre: 'Tabernero Tuyo', glosa: 'Perú',
      precio: 38, tipo: 'plato', alergenos: 'sulfitos', glosa_en: 'Peru' },
    { id: 'vini-tabernero-moscato', seccion: 'vini', grupo: 'Vini Sudamericani', orden: 220, nombre: 'Tabernero Moscato', glosa: 'Perú',
      precio: 38, tipo: 'plato', alergenos: 'sulfitos', glosa_en: 'Peru' },
    { id: 'vini-frontera-malbec', seccion: 'vini', grupo: 'Vini Sudamericani', orden: 260, nombre: 'Frontera Malbec', glosa: 'tinto · Chile',
      precio: 38, tipo: 'plato', alergenos: 'sulfitos', glosa_en: 'red · Chile',
      descripcion: 'Malbec chileno de la línea Frontera de Concha y Toro.', descripcion_en: 'Chilean Malbec from Concha y Toro’s Frontera line.' }
  ],
  // productos existentes de la lista de vinos
  vinos: {
    'vini-prisionero': { grupo: 'Vini Italiani', orden: 140, precio: 130, glosa: 'Italia', glosa_en: 'Italy' },
    'vini-patrillo': { grupo: 'Vini Italiani', orden: 150, precio: 150, glosa: 'Italia', glosa_en: 'Italy' },
    'vini-tabernero-borgona': { grupo: 'Vini Sudamericani', orden: 230, precio: 40 },
    'vini-tacama-seco': { grupo: 'Vini Sudamericani', orden: 240, precio: 45 },
    'vini-frontera': { grupo: 'Vini Sudamericani', orden: 250, precio: 40, nombre: 'Frontera Cabernet Sauvignon', glosa: 'tinto · Chile' }
  },
  // no están en la lista de la casa: se ocultan (se pueden volver a mostrar desde el panel)
  ocultar: ['vini-tabernero-gran-tinto', 'vini-gran-blanco', 'vini-tacama-semiseco', 'vini-casillero-del-diablo', 'vini-spumante-brut-tabernero'],
  config: [['comprobantes', 'Boleta, Factura', 'Comprobantes que el cliente puede pedir (Boleta, Factura). En Nuevo RUS solo Boleta.']]
};

function sumarTamanos_(t, n) {
  return String(t || '').split(';').map(function (x) {
    var p = x.split('='); if (p.length < 2) return x.trim();
    var v = Number(String(p[1]).trim()); return p[0].trim() + '=' + (isNaN(v) ? p[1].trim() : Math.round((v + n) * 100) / 100);
  }).filter(Boolean).join('; ');
}

function aplicarMigracionV5_(t, M, conPrecios) {
  M = M || MIGRACION_V5;
  var porId = {}; t.productos.forEach(function (p) { porId[String(p.id)] = p; });
  var mas = function (p, n) { var v = Number(p.precio); if (p.precio !== '' && !isNaN(v)) p.precio = Math.round((v + n) * 100) / 100; };
  if (conPrecios) {
    t.productos.forEach(function (p) {
      var id = String(p.id);
      if (p.seccion === 'pizze' && p.tamanos) p.tamanos = sumarTamanos_(p.tamanos, M.pizzasMas);
      if (p.seccion === 'pasta' && p.tipo !== 'salsa') {
        if (M.pastaFijos[id] != null) p.precio = M.pastaFijos[id];
        else if (M.pastaMas[id] != null) mas(p, M.pastaMas[id]);
        else mas(p, M.pastaResto);
      }
      if (M.parrillasMas[id] != null) mas(p, M.parrillasMas[id]);
    });
  }
  M.productosNuevos.forEach(function (n) {
    if (porId[n.id]) return;
    var p = { canal: 'todos', disponible: 'SI', visible: 'SI', destacado: '', alergenos: '', foto: '', recargo: '', tamanos: '',
      precio_antes: '', opciones: '', grupo_nota: '', requiere_salsa: 'NO', descripcion: '', descripcion_en: '', glosa_en: '', nombre_en: '' };
    Object.keys(n).forEach(function (k) { p[k] = n[k]; });
    if (p.foto === 'FOTO_POLLO') p.foto = M.fotoPollo || '';
    t.productos.push(p); porId[n.id] = p;
  });
  Object.keys(M.vinos).forEach(function (id) { var p = porId[id]; if (p) Object.keys(M.vinos[id]).forEach(function (k) { p[k] = M.vinos[id][k]; }); });
  M.ocultar.forEach(function (id) { if (porId[id]) porId[id].visible = 'NO'; });
  ['vini-calice-di-vino', 'vini-sangria'].forEach(function (id) { if (porId[id]) porId[id].grupo = ''; });
  return t;
}

function actualizarV5() {
  exigirAdmin_('');
  var props = PropertiesService.getScriptProperties();
  var conPrecios = !props.getProperty('MIGRACION_V4_PRECIOS');
  var t = { productos: leerTabla_(HOJA.productos) };
  aplicarMigracionV5_(t, MIGRACION_V5, conPrecios);
  escribirTabla_(HOJA.productos, COLS.productos, t.productos);
  if (conPrecios) props.setProperty('MIGRACION_V4_PRECIOS', new Date().toISOString());
  var cfg = leerConfig_();
  MIGRACION_V5.config.forEach(function (c) { if (cfg[c[0]] === undefined) SpreadsheetApp.getActive().getSheetByName(HOJA.config).appendRow(c); });
  asegurarColumnas_(SpreadsheetApp.getActive().getSheetByName(HOJA.pedidos), COLS.pedidos);
  asegurarColumnas_(SpreadsheetApp.getActive().getSheetByName(HOJA.mesas), COLS.mesas);
  formatearHojas_();
  limpiarCache_();
  marcarPendiente_();
  var r = publicarCarta('');
  return 'Actualización v5 aplicada' + (conPrecios ? ' (con precios nuevos)' : ' (precios ya estaban actualizados)') + '. ' + r.mensaje;
}

/* =====================================================================
   PASTA GALLO · Actualización v6 (12-nov-2026) — función "actualizarV6"
   - Fotos referenciales SOLO donde no hay foto (no toca las fotos reales ya subidas)
   - Lasagne +S/ 2 (una sola vez), Raviolini = precio de los ravioli, Acqua Frizzante = precio del agua
   - Pollo a la plancha: con papas fritas y ensalada · Tabernero Tuyo: rosé
   - Alérgenos: solo AGREGA los evidentes que faltaban (nunca quita ninguno)
   - Hojas nuevas: Avisos (llamar al mozo / pedir la cuenta) y Comprobantes
   Se puede ejecutar más de una vez sin duplicar cambios.
   ===================================================================== */
var U6_ = function (id) { return 'https://images.unsplash.com/' + id + '?w=700&q=70&auto=format&fit=crop'; };
var MIGRACION_V6 = {
  fotos: {
    'pasta-gnocchi-di-patate': U6_('photo-1579349443343-73da56a71a20'),
    'salsa-puttanesca': U6_('photo-1597131628347-c769fc631754'),
    'salsa-aglio-olio-e-peperoncino': U6_('photo-1516685018646-549198525c1b'),
    'salsa-ragu-di-carne': U6_('photo-1785396347369-b5e70e3f3af3'),
    'salsa-alfredo': U6_('photo-1781086917723-dbe2d7ef85dc'),
    'salsa-gorgonzola': U6_('photo-1645112411341-6c4fd023714a'),
    'salsa-rosata': U6_('photo-1626028937210-754d2118d5f7'),
    'salsa-pesto': U6_('photo-1616299908398-9af1134ad522'),
    'salsa-quattro-formaggi': U6_('photo-1667499989723-c4ab9549d63c'),
    'salsa-marchigiana-e-pomodoro': U6_('photo-1627286400579-027de47e9e73'),
    'salsa-salsa-al-lomo': U6_('photo-1611270629569-8b357cb88da9'),
    'salsa-funghi-e-cardonada': U6_('photo-1597692493647-35763cb92183'),
    'salsa-carbonara': U6_('photo-1633337474564-1d9478ca4e2e'),
    'vini-ca-bianca': U6_('photo-1769140243164-b677642e9279'),
    'vini-cavicchioli': U6_('photo-1602800268804-4a850d622360'),
    'vini-victoria': U6_('photo-1641759756543-20168fcab299'),
    'vini-tabernero-tuyo': U6_('photo-1771583102699-f79a6c6d08c8'),
    'vini-tabernero-moscato': U6_('photo-1597905722448-a1df7c00000a'),
    'vini-frontera-malbec': U6_('photo-1606767351797-1664b860ae5a')
  },
  lasagneMas: 2,
  campos: {
    'parrillas-pollo-a-la-plancha': { glosa: 'Con papas fritas y ensalada', glosa_en: 'With French fries and salad',
      descripcion: 'Pollo a la plancha, servido con papas fritas y ensalada.', descripcion_en: 'Grilled chicken, served with French fries and salad.' },
    'vini-tabernero-tuyo': { glosa: 'rosé · Perú', glosa_en: 'rosé · Peru' }
  },
  alergenosMas: {
    'antipasti-pane-allaglio': ['gluten', 'lacteos'],
    'antipasti-pane-allaglio-con-formaggio': ['huevo'],
    'pasta-fonte-di-fettuccine': ['huevo'],
    'pasta-fettuccine-allalfredo-con-lomo': ['huevo'],
    'pasta-pappardelle': ['huevo'],
    'pasta-spaghetti-ai-gamberoni': ['lacteos']
  },
  ocultar: ['vini-barbera', 'vini-tabernero-gran-tinto', 'vini-gran-blanco', 'vini-tacama-semiseco', 'vini-casillero-del-diablo', 'vini-spumante-brut-tabernero']
};

function actualizarV6() {
  exigirAdmin_('');
  var M = MIGRACION_V6, props = PropertiesService.getScriptProperties();
  var ss = SpreadsheetApp.getActive(), h = ss.getSheetByName(HOJA.productos);
  var cab = asegurarColumnas_(h, COLS.productos);
  var col = function (c) { return cab.indexOf(c) + 1; };
  var filas = leerTabla_(HOJA.productos), porId = {};
  filas.forEach(function (p) { porId[String(p.id)] = p; });
  var hecho = [];
  var poner = function (p, c, v) { h.getRange(p._fila, col(c)).setValue(v); p[c] = v; };

  // fotos: solo si está vacía
  Object.keys(M.fotos).forEach(function (id) { var p = porId[id]; if (p && !String(p.foto || '').trim()) { poner(p, 'foto', M.fotos[id]); hecho.push('foto ' + p.nombre); } });

  // precios (una sola vez)
  if (!props.getProperty('MIGRACION_V6_PRECIOS')) {
    filas.forEach(function (p) {
      if (String(p.seccion) === 'lasagne' && p.precio !== '' && !isNaN(Number(p.precio))) { poner(p, 'precio', Math.round((Number(p.precio) + M.lasagneMas) * 100) / 100); hecho.push(p.nombre + ' +2'); }
    });
    props.setProperty('MIGRACION_V6_PRECIOS', new Date().toISOString());
  }
  var rav = porId['pasta-raviolini'], ravC = porId['pasta-ravioli-di-carne'];
  if (rav && ravC && String(rav.precio).trim() === '' && !String(rav.tamanos || '').trim()) { poner(rav, 'precio', ravC.precio); hecho.push('Raviolini ' + ravC.precio); }
  var fr = porId['caffe-acqua-frizzante'], ag = porId['caffe-acqua'];
  if (fr && ag && String(fr.precio).trim() === '' && !String(fr.tamanos || '').trim()) { poner(fr, 'precio', ag.precio); hecho.push('Acqua Frizzante ' + ag.precio); }

  // textos
  Object.keys(M.campos).forEach(function (id) { var p = porId[id]; if (!p) return; Object.keys(M.campos[id]).forEach(function (c) { if (String(p[c]) !== M.campos[id][c]) poner(p, c, M.campos[id][c]); }); });

  // alérgenos: solo agregar
  Object.keys(M.alergenosMas).forEach(function (id) {
    var p = porId[id]; if (!p) return;
    var lista = String(p.alergenos || '').split(',').map(function (x) { return x.trim(); }).filter(Boolean);
    var antes = lista.length;
    M.alergenosMas[id].forEach(function (a) { if (lista.indexOf(a) < 0) lista.push(a); });
    if (lista.length !== antes) { poner(p, 'alergenos', lista.join(', ')); hecho.push('alérgenos ' + p.nombre); }
  });

  M.ocultar.forEach(function (id) { var p = porId[id]; if (p && String(p.visible).toUpperCase() !== 'NO') poner(p, 'visible', 'NO'); });

  // hojas nuevas
  asegurarColumnas_(obtenerHoja_(ss, HOJA.avisos, COLS.avisos), COLS.avisos);
  asegurarColumnas_(obtenerHoja_(ss, HOJA.comprobantes, COLS.comprobantes), COLS.comprobantes);
  asegurarColumnas_(ss.getSheetByName(HOJA.pedidos), COLS.pedidos);

  limpiarCache_();
  marcarPendiente_();
  var r = publicarCarta('');
  return 'v6 aplicada: ' + (hecho.join(', ') || 'sin cambios') + '. ' + r.mensaje;
}

/* =====================================================================
   Fotos de productos preparadas fuera (fondo blanco). Para usarla se pega TEMPORALMENTE
   arriba de esta función:  var FOTOS_TMP = { 'id-del-producto': 'base64 del JPG', ... };
   se ejecuta "importarFotosTmp" y luego se borra FOTOS_TMP.
   ===================================================================== */
function importarFotosTmp() {
  exigirAdmin_('');
  if (typeof FOTOS_TMP === 'undefined') return 'No hay FOTOS_TMP.';
  var h = SpreadsheetApp.getActive().getSheetByName(HOJA.productos);
  var col = asegurarColumnas_(h, COLS.productos).indexOf('foto') + 1;
  var porId = {}; leerTabla_(HOJA.productos).forEach(function (p) { porId[String(p.id)] = p; });
  var hechas = [];
  Object.keys(FOTOS_TMP).forEach(function (id) {
    var p = porId[id]; if (!p) return;
    var ruta = 'fotos/' + id.replace(/[^a-z0-9-]/g, '') + '-' + Date.now() + '.jpg';
    githubPut_(ruta, String(FOTOS_TMP[id]).replace(/^data:image\/\w+;base64,/, ''), 'Foto de ' + p.nombre);
    h.getRange(p._fila, col).setValue(ruta); hechas.push(p.nombre);
  });
  limpiarCache_(); marcarPendiente_();
  return 'Fotos: ' + hechas.join(', ') + '. ' + publicarCarta('').mensaje;
}

/* =====================================================================
   PASTA GALLO · v4c: nombres de trattoria para las promociones (12-nov-2026)
   Función "actualizarV4c". Se puede repetir.
   - Sección "Offerte" → "Le Proposte della Casa".
   - Combo Personale → Pizza per Uno · Combo Alfredo → Alfredo della Casa
     Combo per Due → Cena per Due · Combo Famiglia → La Tavolata
   - Los enlaces de las historias (?p=promociones-combo-…) siguen funcionando: los id no cambian.
   - Además deja fijas en la hoja las fotos reales de FOTOS_REALES.
   ===================================================================== */
var MIGRACION_V4C = {
  seccion: { titulo: 'Le Proposte della Casa', titulo_en: 'Le Proposte della Casa',
    subtitulo: 'Para llevar · cada día, su propuesta', subtitulo_en: 'To take away · every day has its own',
    intro: 'Delivery o recojo en el local.', intro_en: 'Delivery or pick-up.' },
  nombres: {
    'promociones-combo-personale': 'Pizza per Uno',
    'promociones-combo-alfredo': 'Alfredo della Casa',
    'promociones-combo-per-due': 'Cena per Due',
    'promociones-combo-famiglia': 'La Tavolata'
  }
};

function actualizarV4c() {
  exigirAdmin_('');
  var M = MIGRACION_V4C, ss = SpreadsheetApp.getActive();
  var productos = leerTabla_(HOJA.productos);
  productos.forEach(function (p) {
    if (M.nombres[p.id]) p.nombre = M.nombres[p.id];
    if (FOTOS_REALES[p.id]) p.foto = FOTOS_REALES[p.id];
  });
  escribirTabla_(HOJA.productos, COLS.productos, productos);
  var secciones = leerTabla_(HOJA.secciones);
  secciones.forEach(function (s) { if (String(s.id) === 'promociones') Object.keys(M.seccion).forEach(function (k) { s[k] = M.seccion[k]; }); });
  escribirTabla_(HOJA.secciones, COLS.secciones, secciones);
  marcarPendiente_();
  var pub = publicarCarta('');
  return 'v4c aplicada (nombres de trattoria y fotos reales). ' + pub.mensaje;
}
