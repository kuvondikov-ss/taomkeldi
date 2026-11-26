// Menyu fayllarini yaratish: TEST narxlar va "Maxsus" masalliqlari (infografikadagi miqdorlar asosida).
const fs = require('fs');
process.chdir(require('path').join(__dirname, '..', '..'));
// i(nom_uz, nom_ru, birlik, standart, min, max, qadam, qadam_narxi)
const i = (name_uz, name_ru, unit, std, min, max, step, price) => ({ name_uz, name_ru, unit, std_qty: std, min_qty: min, max_qty: max, step, step_price: price });
const NOTE = 'TEST narxlar (2026-11-26): taxminiy, restoran tasdiqlagach panelda yoki shu faylda o‘zgartiring.';
const ketchup = i('Ketchup', 'Кетчуп', 'g', 30, 0, 60, 10, 300);
const mayo = i('Mayonez', 'Майонез', 'g', 30, 0, 60, 10, 300);
const onionRing = (std = 2, max = 6) => i('Piyoz', 'Лук', 'halqa', std, 0, max, 1, 300);
const tomatoRing = (std = 2) => i('Pomidor', 'Помидор', 'halqa', std, 0, 4, 1, 500);
const pickles = i('Tuzlangan bodring', 'Маринованный огурец', 'bo‘lak', 3, 0, 6, 1, 300);
const lettuce = i('Salat bargi', 'Лист салата', 'dona', 1, 0, 3, 1, 500);

const starburger = {
  _izoh: NOTE,
  restaurant: {
    name: 'Starburger', description: 'Burgerlar, hot dog, pitsa, qarsildoq tovuq, shaurma va kartoshka fri.', status: 'active', cuisines: ['Fast food', 'Pitsa'],
    cover: 'assets/menus/starburger/cover.webp',
    profile: { address_text: 'Jizzax shahri', lat: 40.1158, lon: 67.8422, delivery_base: 8000, delivery_base_m: 2000, delivery_per_km: 2000, delivery_radius_m: 10000 },
  },
  categories: [
    { name_uz: 'Burgerlar va hot dog', name_ru: 'Бургеры и хот-доги', items: [
      { name_uz: 'Klassik burger', name_ru: 'Классический бургер', portion: 'Ø 10–12 sm', price: 32000, cook_style: 'griddle', image: 'assets/menus/starburger/burger.webp',
        description_uz: 'Mol go‘shti kotleti, cheddar pishlog‘i, salat, pomidor, qizil piyoz, sous.', description_ru: 'Говяжья котлета, чеддер, салат, помидор, красный лук, соус.',
        ingredients: [i('Kotlet', 'Котлета', 'dona', 1, 1, 3, 1, 12000), i('Pishloq', 'Сыр', 'bo‘lak', 1, 0, 3, 1, 3000), lettuce, tomatoRing(2), onionRing(2, 4), pickles, ketchup, mayo] },
      { name_uz: 'Hot dog', name_ru: 'Хот-дог', portion: '15–18 sm', price: 18000, cook_style: 'griddle', image: 'assets/menus/starburger/hotdog.webp',
        description_uz: 'Grilda pishgan sosiska, tuzlangan bodring, ketchup va xantal.', description_ru: 'Сосиска на гриле, маринованный огурец, кетчуп и горчица.',
        ingredients: [i('Sosiska', 'Сосиска', 'dona', 1, 1, 2, 1, 8000), lettuce, tomatoRing(2), onionRing(2, 4), pickles, ketchup, i('Xantal', 'Горчица', 'g', 30, 0, 60, 10, 300)] },
    ] },
    { name_uz: 'Pitsa', name_ru: 'Пицца', items: [
      { name_uz: 'Pitsa «Konstruktor»', name_ru: 'Пицца «Конструктор»', portion: 'Ø 30 sm', price: 75000, cook_style: 'oven', image: 'assets/menus/starburger/pitsa-konstruktor.webp',
        description_uz: 'Masalliqlarni o‘zingiz tanlang: sous, pishloq, kolbasa, qo‘ziqorin, zaytun, qalampir, pomidor, piyoz.', description_ru: 'Соберите сами: соус, сыр, колбаса, грибы, оливки, перец, помидор, лук.',
        ingredients: [i('Pomidor sousi', 'Томатный соус', 'g', 100, 80, 140, 20, 1000), i('Pishloq', 'Сыр', 'g', 170, 150, 250, 10, 1500), i('Kolbasa (pepperoni)', 'Пепперони', 'bo‘lak', 10, 0, 16, 1, 1500),
          i('Qo‘ziqorin', 'Грибы', 'dona', 6, 0, 10, 1, 1000), i('Zaytun', 'Оливки', 'g', 20, 0, 40, 10, 2000), i('Bolgar qalampiri', 'Болгарский перец', 'bo‘lak', 6, 0, 10, 1, 500),
          i('Pomidor', 'Помидор', 'halqa', 4, 0, 8, 1, 500), onionRing(3, 6)] },
      { name_uz: 'Pepperoni pitsa — 1 bo‘lak', name_ru: 'Пицца пепперони — 1 кусок', portion: '1 bo‘lak', price: 14000, cook_style: 'oven', image: 'assets/menus/starburger/pitsa-bolak.webp',
        ingredients: [i('Pishloq', 'Сыр', 'g', 40, 20, 80, 10, 1500), i('Pepperoni', 'Пепперони', 'bo‘lak', 4, 2, 8, 1, 1500)] },
      { name_uz: 'Pepperoni pitsa — 2 bo‘lak', name_ru: 'Пицца пепперони — 2 куска', portion: '2 bo‘lak', price: 26000, cook_style: 'oven', image: 'assets/menus/starburger/pitsa-2-bolak.webp',
        ingredients: [i('Pishloq', 'Сыр', 'g', 80, 40, 160, 10, 1500), i('Pepperoni', 'Пепперони', 'bo‘lak', 8, 4, 14, 1, 1500)] },
    ] },
    { name_uz: 'Tovuq va shaurma', name_ru: 'Курица и шаурма', items: [
      { name_uz: 'Qarsildoq tovuq — 1 dona', name_ru: 'Хрустящая курица — 1 шт', portion: '1 dona', price: 12000, cook_style: 'fryer', image: 'assets/menus/starburger/tovuq-1.webp',
        ingredients: [i('Sous', 'Соус', 'g', 30, 0, 60, 10, 500)] },
      { name_uz: 'Qarsildoq tovuq — 4 dona', name_ru: 'Хрустящая курица — 4 шт', portion: '4 dona', price: 42000, cook_style: 'fryer', image: 'assets/menus/starburger/tovuq-4.webp',
        ingredients: [i('Sous', 'Соус', 'g', 60, 0, 120, 10, 500)] },
      { name_uz: 'Shaurma (tovuqli)', name_ru: 'Шаурма с курицей', portion: 'Ø 30–35 sm lavash', price: 28000, cook_style: 'wrap', image: 'assets/menus/starburger/shaurma.webp',
        description_uz: 'Tovuq go‘shti, karam, sabzi, bodring, pomidor, piyoz, oq sous va ketchup.', description_ru: 'Курица, капуста, морковь, огурец, помидор, лук, белый соус и кетчуп.',
        ingredients: [i('Tovuq go‘shti', 'Курица', 'g', 170, 150, 250, 10, 1200), i('Karam', 'Капуста', 'g', 60, 0, 100, 10, 200), i('Sabzi', 'Морковь', 'g', 60, 0, 100, 10, 200),
          i('Bodring', 'Огурец', 'g', 60, 0, 100, 10, 300), i('Pomidor', 'Помидор', 'g', 60, 0, 100, 10, 300), i('Piyoz', 'Лук', 'g', 40, 0, 60, 10, 200),
          i('Oq sous', 'Белый соус', 'g', 40, 0, 80, 10, 300), i('Ketchup', 'Кетчуп', 'g', 40, 0, 80, 10, 300)] },
      { name_uz: 'Achchiq shaurma', name_ru: 'Острая шаурма', portion: 'Ø 30–35 sm lavash', price: 30000, cook_style: 'wrap', image: 'assets/menus/starburger/shaurma-achchiq.webp',
        description_uz: 'Tovuq go‘shti, qizil piyoz, bodring, pomidor, achchiq va oq sous.', description_ru: 'Курица, красный лук, огурец, помидор, острый и белый соус.',
        ingredients: [i('Tovuq go‘shti', 'Курица', 'g', 170, 150, 250, 10, 1200), i('Achchiq sous', 'Острый соус', 'g', 40, 0, 80, 10, 300), i('Oq sous', 'Белый соус', 'g', 30, 0, 80, 10, 300),
          i('Piyoz', 'Лук', 'g', 40, 0, 60, 10, 200), i('Bodring', 'Огурец', 'g', 60, 0, 100, 10, 300), i('Pomidor', 'Помидор', 'g', 60, 0, 100, 10, 300)] },
    ] },
    { name_uz: 'Garnir', name_ru: 'Гарниры', items: [
      { name_uz: 'Kartoshka fri', name_ru: 'Картофель фри', portion: '150 g', price: 15000, cook_style: 'fryer', image: 'assets/menus/starburger/fri.webp',
        ingredients: [i('Kartoshka', 'Картофель', 'g', 150, 100, 300, 50, 4000), ketchup, mayo] },
    ] },
  ],
};

const meat = (name_uz, name_ru, std = 250) => i(name_uz, name_ru, 'g', std, 150, 400, 50, 6000);
const fat = (std = 30) => i('Dumba yog‘i', 'Курдючный жир', 'g', std, 0, 90, 10, 1000);
const eshonbobo = JSON.parse(fs.readFileSync('scripts/menus/eshonbobo.json', 'utf8'));
eshonbobo._izoh = NOTE;
const E = {
  'Osh': { price: 35000, cook_style: 'pot', ingredients: [i('Go‘sht', 'Мясо', 'g', 80, 50, 200, 10, 1500), i('No‘xat', 'Нут', 'g', 20, 0, 40, 10, 300), i('Sarimsoq', 'Чеснок', 'dona', 1, 0, 2, 1, 1000), i('Qazi', 'Казы', 'g', 0, 0, 100, 25, 5000)] },
  'Mol go‘shti shashlik': { price: 30000, cook_style: 'grill', ingredients: [meat('Mol go‘shti', 'Говядина'), fat(30), onionRing(2, 6)] },
  'Tovuq shashlik': { price: 22000, cook_style: 'grill', ingredients: [i('Tovuq go‘shti', 'Курица', 'g', 250, 150, 400, 50, 4000), onionRing(2, 6)] },
  'Qo‘y qovurg‘a shashlik': { price: 38000, cook_style: 'grill', ingredients: [i('Qovurg‘a', 'Рёбрышки', 'dona', 3, 2, 5, 1, 12000), fat(0), onionRing(2, 6)] },
  'Sabzavotli mol go‘shti shashlik': { price: 32000, cook_style: 'grill', ingredients: [meat('Mol go‘shti', 'Говядина', 200), i('Bolgar qalampiri', 'Болгарский перец', 'bo‘lak', 3, 0, 6, 1, 500), onionRing(3, 6)] },
  'Qiyma kabob': { price: 26000, cook_style: 'grill', ingredients: [i('Qiyma', 'Фарш', 'g', 200, 150, 300, 50, 5000), fat(20)] },
  'Qo‘ziqorin shashlik': { price: 18000, cook_style: 'grill', ingredients: [i('Qo‘ziqorin', 'Шампиньоны', 'dona', 6, 4, 10, 1, 1500)] },
  'Sabzavotli shashlik': { price: 15000, cook_style: 'grill', ingredients: [i('Pomidor', 'Помидор', 'dona', 1, 0, 3, 1, 1000), i('Qovoqcha', 'Кабачок', 'bo‘lak', 1, 0, 3, 1, 1000),
    i('Bolgar qalampiri', 'Болгарский перец', 'bo‘lak', 2, 0, 4, 1, 800), i('Baqlajon', 'Баклажан', 'bo‘lak', 1, 0, 3, 1, 1000), i('Piyoz', 'Лук', 'bo‘lak', 1, 0, 3, 1, 500)] },
};
for (const c of eshonbobo.categories) for (const it of c.items) Object.assign(it, E[it.name_uz] || {});

const yapona = JSON.parse(fs.readFileSync('scripts/menus/yaponamama.json', 'utf8'));
yapona._izoh = NOTE;
Object.assign(yapona.categories[0].items[0], { price: 180000, cook_style: 'sushi',
  ingredients: [i('Soya sousi', 'Соевый соус', 'ml', 30, 0, 90, 30, 2000), i('Vasabi', 'Васаби', 'g', 10, 0, 30, 10, 2000), i('Zanjabil', 'Имбирь', 'g', 20, 0, 60, 20, 2000)] });

// Taomkeldi (yashirin restoran): TEST narxlar va asosiy taomlarga masalliqlar.
const tk = JSON.parse(fs.readFileSync('scripts/menus/taomkeldi.json', 'utf8'));
tk._izoh = NOTE;
const T = {
  'To‘y oshi': [38000, 'pot', [i('Go‘sht', 'Мясо', 'g', 80, 50, 200, 10, 1500), i('Qazi', 'Казы', 'g', 0, 0, 100, 25, 5000), i('Bedana tuxum', 'Перепелиное яйцо', 'dona', 0, 0, 4, 1, 1000)]],
  'Choyxona oshi': [32000, 'pot', [i('Go‘sht', 'Мясо', 'g', 70, 50, 200, 10, 1500), i('No‘xat', 'Нут', 'g', 20, 0, 40, 10, 300)]],
  'Lag‘mon': [28000, 'pot', [i('Go‘sht', 'Мясо', 'g', 80, 50, 160, 10, 1500), i('Achchiq qalampir', 'Острый перец', 'dona', 0, 0, 2, 1, 0)]],
  'Qovurma lag‘mon': [32000, 'pan', [i('Go‘sht', 'Мясо', 'g', 100, 60, 200, 10, 1500), i('Tuxum', 'Яйцо', 'dona', 0, 0, 2, 1, 2000)]],
  'Manti': [30000, 'pot', [i('Manti', 'Манты', 'dona', 5, 3, 10, 1, 6000), i('Qaymoq', 'Сметана', 'g', 30, 0, 60, 30, 2000)]],
  'Chuchvara': [26000, 'pot', [i('Qaymoq', 'Сметана', 'g', 30, 0, 60, 30, 2000)]],
  'Mastava': [24000, 'pot', [i('Go‘sht', 'Мясо', 'g', 60, 40, 120, 10, 1500), i('Qatiq', 'Катык', 'g', 30, 0, 60, 30, 1000)]],
  'Sho‘rva': [30000, 'pot', [i('Go‘sht', 'Мясо', 'g', 150, 100, 250, 50, 6000)]],
  'Norin': [28000, 'pot', [i('Qazi', 'Казы', 'g', 50, 0, 100, 25, 5000)]],
  'Dimlama': [34000, 'pot', [i('Go‘sht', 'Мясо', 'g', 120, 80, 200, 20, 3000)]],
  'Qozon kabob': [45000, 'pan', [i('Go‘sht', 'Мясо', 'g', 250, 200, 400, 50, 7000), i('Kartoshka', 'Картофель', 'g', 150, 0, 250, 50, 1500)]],
  'Mol go‘shti shashlik': [30000, 'grill', [meat('Mol go‘shti', 'Говядина'), fat(30), onionRing(2, 6)]],
  'Qo‘y go‘shti shashlik': [34000, 'grill', [meat('Qo‘y go‘shti', 'Баранина'), fat(30), onionRing(2, 6)]],
  'Tovuq shashlik': [22000, 'grill', [i('Tovuq go‘shti', 'Курица', 'g', 250, 150, 400, 50, 4000), onionRing(2, 6)]],
  'Jigar shashlik': [20000, 'grill', [i('Jigar', 'Печень', 'g', 200, 150, 300, 50, 4000), fat(30)]],
  'Qiyma kabob': [26000, 'grill', [i('Qiyma', 'Фарш', 'g', 200, 150, 300, 50, 5000), fat(20)]],
  'Tandir somsa': [9000, 'oven', [i('Go‘sht', 'Мясо', 'g', 60, 40, 100, 20, 2500)]],
  'Qovoqli somsa': [7000, 'oven', []],
  'Patir non': [8000, 'oven', []],
  'Tandir non': [4000, 'oven', []],
  'Achchiq-chuchuk': [12000, 'pan', [i('Achchiq qalampir', 'Острый перец', 'dona', 1, 0, 3, 1, 0)]],
  'Toshkent salati': [22000, 'pan', [i('Go‘sht', 'Мясо', 'g', 60, 40, 120, 20, 2500), i('Tuxum', 'Яйцо', 'dona', 1, 0, 2, 1, 2000)]],
  'Sabzavotli salat': [14000, 'pan', []],
  'Ko‘k choy': [5000, 'pot', [i('Shakar', 'Сахар', 'dona', 0, 0, 4, 1, 0), i('Limon', 'Лимон', 'bo‘lak', 0, 0, 2, 1, 1000)]],
  'Qora choy': [5000, 'pot', [i('Shakar', 'Сахар', 'dona', 0, 0, 4, 1, 0), i('Limon', 'Лимон', 'bo‘lak', 0, 0, 2, 1, 1000)]],
  'Limonli choy': [8000, 'pot', [i('Shakar', 'Сахар', 'dona', 0, 0, 4, 1, 0)]],
  'Kompot': [12000, 'pot', []],
  'Ayron': [8000, 'pan', []],
  'Mineral suv': [5000, 'pan', []],
};
for (const c of tk.categories) for (const it of c.items) {
  const d = T[it.name_uz];
  if (!d) throw new Error(`taomkeldi: ${it.name_uz}`);
  Object.assign(it, { price: d[0], cook_style: d[1], ...(d[2].length ? { ingredients: d[2] } : {}) });
}

const w = (f, o) => fs.writeFileSync(`scripts/menus/${f}.json`, JSON.stringify(o, null, 2) + '\n');
w('starburger', starburger); w('eshonbobo', eshonbobo); w('yaponamama', yapona); w('taomkeldi', tk);
console.log('ok');
