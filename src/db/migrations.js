// Migratsiyalar: faqat qo'shiladi, hech qachon o'zgartirilmaydi yoki o'chirilmaydi.
// Yangi ustun/jadval kerak bo'lsa — yangi raqamli migratsiya qo'shing (CREATE/ALTER ... ADD).
//
// Kelishuvlar:
// - Barcha pul qiymatlari INTEGER, butun so'mda (float ishlatilmaydi).
// - Vaqt INTEGER, Unix millisekund (Date.now()).
// - Masofa INTEGER, metrda.
// - users.id = Telegram user id.

const migrations = [
  {
    id: 1,
    name: 'initial_schema',
    sql: `
      CREATE TABLE users (
        id            INTEGER PRIMARY KEY,           -- Telegram user id
        first_name    TEXT NOT NULL DEFAULT '',
        last_name     TEXT,
        username      TEXT,
        phone         TEXT,
        lang          TEXT CHECK (lang IN ('uz','ru')),  -- NULL: hali tanlanmagan
        tg_lang       TEXT,                          -- Telegram'dagi language_code
        is_platform_admin INTEGER NOT NULL DEFAULT 0, -- faqat AUTO_ADMIN bootstrap (test) uchun
        is_blocked    INTEGER NOT NULL DEFAULT 0,
        created_at    INTEGER NOT NULL,
        updated_at    INTEGER NOT NULL
      );

      CREATE TABLE restaurants (
        id                 INTEGER PRIMARY KEY,
        name               TEXT NOT NULL,
        description        TEXT,
        phone              TEXT,
        address_text       TEXT,
        lat                REAL,
        lon                REAL,
        status             TEXT NOT NULL DEFAULT 'pending'
                           CHECK (status IN ('pending','active','blocked','rejected')),
        status_reason      TEXT,
        is_open            INTEGER NOT NULL DEFAULT 1,  -- 0 = pauza
        work_hours         TEXT,                        -- JSON
        delivery_radius_m  INTEGER NOT NULL DEFAULT 5000 CHECK (delivery_radius_m >= 0),
        delivery_base      INTEGER NOT NULL DEFAULT 0 CHECK (delivery_base >= 0),
        delivery_base_m    INTEGER NOT NULL DEFAULT 0 CHECK (delivery_base_m >= 0),
        delivery_per_km    INTEGER NOT NULL DEFAULT 0 CHECK (delivery_per_km >= 0),
        min_order          INTEGER NOT NULL DEFAULT 0 CHECK (min_order >= 0),
        free_delivery_from INTEGER CHECK (free_delivery_from IS NULL OR free_delivery_from >= 0),
        pickup_enabled     INTEGER NOT NULL DEFAULT 0,
        pay_cash           INTEGER NOT NULL DEFAULT 1,
        pay_card_transfer  INTEGER NOT NULL DEFAULT 0,
        pay_online         INTEGER NOT NULL DEFAULT 0,
        card_number        TEXT,   -- faqat egasi o'zgartiradi; menejerga maskalanadi
        card_holder        TEXT,
        auto_dispatch      INTEGER NOT NULL DEFAULT 1,
        group_chat_id      INTEGER,
        group_thread_id    INTEGER,
        logo_path          TEXT,
        cover_path         TEXT,
        created_by         INTEGER REFERENCES users(id),
        created_at         INTEGER NOT NULL,
        updated_at         INTEGER NOT NULL
      );

      CREATE TABLE staff (
        id            INTEGER PRIMARY KEY,
        restaurant_id INTEGER NOT NULL REFERENCES restaurants(id),
        user_id       INTEGER NOT NULL REFERENCES users(id),
        role          TEXT NOT NULL CHECK (role IN ('owner','manager')),
        status        TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','revoked')),
        invited_by    INTEGER REFERENCES users(id),
        created_at    INTEGER NOT NULL,
        updated_at    INTEGER NOT NULL,
        UNIQUE (restaurant_id, user_id)
      );

      CREATE TABLE couriers (
        id            INTEGER PRIMARY KEY,
        restaurant_id INTEGER NOT NULL REFERENCES restaurants(id),
        user_id       INTEGER REFERENCES users(id),  -- taklif qabul qilinguncha NULL
        name          TEXT NOT NULL,
        phone         TEXT,
        transport     TEXT,
        status        TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','revoked')),
        is_online     INTEGER NOT NULL DEFAULT 0,
        last_lat      REAL,
        last_lon      REAL,
        last_location_at INTEGER,
        created_at    INTEGER NOT NULL,
        updated_at    INTEGER NOT NULL,
        UNIQUE (restaurant_id, user_id)
      );

      CREATE TABLE cuisines (
        id      INTEGER PRIMARY KEY,
        slug    TEXT NOT NULL UNIQUE,
        name_uz TEXT NOT NULL,
        name_ru TEXT NOT NULL,
        sort    INTEGER NOT NULL DEFAULT 0
      );

      CREATE TABLE restaurant_cuisines (
        restaurant_id INTEGER NOT NULL REFERENCES restaurants(id),
        cuisine_id    INTEGER NOT NULL REFERENCES cuisines(id),
        PRIMARY KEY (restaurant_id, cuisine_id)
      );

      CREATE TABLE menu_categories (
        id            INTEGER PRIMARY KEY,
        restaurant_id INTEGER NOT NULL REFERENCES restaurants(id),
        name_uz       TEXT NOT NULL,
        name_ru       TEXT,
        sort          INTEGER NOT NULL DEFAULT 0,
        is_active     INTEGER NOT NULL DEFAULT 1,
        created_at    INTEGER NOT NULL,
        updated_at    INTEGER NOT NULL
      );

      CREATE TABLE products (
        id             INTEGER PRIMARY KEY,
        restaurant_id  INTEGER NOT NULL REFERENCES restaurants(id),
        category_id    INTEGER REFERENCES menu_categories(id),
        name_uz        TEXT NOT NULL,
        name_ru        TEXT,
        description_uz TEXT,
        description_ru TEXT,
        portion        TEXT,
        price          INTEGER NOT NULL CHECK (price >= 0),
        old_price      INTEGER CHECK (old_price IS NULL OR old_price >= 0),
        image_path     TEXT,
        is_available   INTEGER NOT NULL DEFAULT 1,  -- 0 = stop-list
        is_popular     INTEGER NOT NULL DEFAULT 0,
        is_deleted     INTEGER NOT NULL DEFAULT 0,
        sort           INTEGER NOT NULL DEFAULT 0,
        created_at     INTEGER NOT NULL,
        updated_at     INTEGER NOT NULL
      );

      CREATE TABLE addresses (
        id         INTEGER PRIMARY KEY,
        user_id    INTEGER NOT NULL REFERENCES users(id),
        label      TEXT,
        text       TEXT NOT NULL,
        lat        REAL NOT NULL,
        lon        REAL NOT NULL,
        entrance   TEXT,
        floor      TEXT,
        apartment  TEXT,
        comment    TEXT,
        is_default INTEGER NOT NULL DEFAULT 0,
        is_deleted INTEGER NOT NULL DEFAULT 0,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL
      );

      CREATE TABLE favorites (
        user_id       INTEGER NOT NULL REFERENCES users(id),
        restaurant_id INTEGER NOT NULL REFERENCES restaurants(id),
        created_at    INTEGER NOT NULL,
        PRIMARY KEY (user_id, restaurant_id)
      );

      CREATE TABLE orders (
        id              INTEGER PRIMARY KEY,
        restaurant_id   INTEGER NOT NULL REFERENCES restaurants(id),
        customer_id     INTEGER NOT NULL REFERENCES users(id),
        courier_id      INTEGER REFERENCES couriers(id),
        type            TEXT NOT NULL DEFAULT 'delivery' CHECK (type IN ('delivery','pickup')),
        status          TEXT NOT NULL CHECK (status IN
                          ('pending_payment','new','accepted','ready','on_way','delivered','cancelled')),
        payment_method  TEXT NOT NULL CHECK (payment_method IN ('cash','card_transfer','online')),
        payment_status  TEXT NOT NULL DEFAULT 'unpaid' CHECK (payment_status IN
                          ('unpaid','claimed','paid','refund_requested','refunded')),
        items_total     INTEGER NOT NULL CHECK (items_total >= 0),
        delivery_fee    INTEGER NOT NULL DEFAULT 0 CHECK (delivery_fee >= 0),
        total           INTEGER NOT NULL CHECK (total >= 0),
        customer_name   TEXT,
        customer_phone  TEXT,
        address_text    TEXT,
        address_lat     REAL,
        address_lon     REAL,
        address_details TEXT,   -- JSON: podyezd, qavat, xonadon, izoh
        comment         TEXT,
        prep_minutes    INTEGER,
        cancel_reason   TEXT,
        idempotency_key TEXT,
        created_at      INTEGER NOT NULL,
        updated_at      INTEGER NOT NULL,
        UNIQUE (customer_id, idempotency_key)
      );

      CREATE TABLE order_items (
        id         INTEGER PRIMARY KEY,
        order_id   INTEGER NOT NULL REFERENCES orders(id),
        product_id INTEGER REFERENCES products(id),
        name       TEXT NOT NULL,              -- snapshot
        price      INTEGER NOT NULL CHECK (price >= 0),   -- snapshot, bitta dona narxi
        qty        INTEGER NOT NULL CHECK (qty > 0),
        line_total INTEGER NOT NULL CHECK (line_total >= 0)
      );

      CREATE TABLE order_events (
        id          INTEGER PRIMARY KEY,
        order_id    INTEGER NOT NULL REFERENCES orders(id),
        actor_id    INTEGER REFERENCES users(id),   -- NULL = tizim
        actor_role  TEXT,
        type        TEXT NOT NULL,
        from_status TEXT,
        to_status   TEXT,
        data        TEXT,                          -- JSON
        created_at  INTEGER NOT NULL
      );

      CREATE TABLE order_messages (
        id         INTEGER PRIMARY KEY,
        order_id   INTEGER NOT NULL REFERENCES orders(id),
        kind       TEXT NOT NULL,                  -- group_main, customer, courier_offer ...
        chat_id    INTEGER NOT NULL,
        thread_id  INTEGER,
        message_id INTEGER NOT NULL,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL,
        UNIQUE (order_id, kind, chat_id)
      );

      CREATE INDEX idx_staff_user        ON staff(user_id);
      CREATE INDEX idx_couriers_user     ON couriers(user_id);
      CREATE INDEX idx_products_rest     ON products(restaurant_id, category_id);
      CREATE INDEX idx_categories_rest   ON menu_categories(restaurant_id);
      CREATE INDEX idx_addresses_user    ON addresses(user_id);
      CREATE INDEX idx_orders_customer   ON orders(customer_id, created_at);
      CREATE INDEX idx_orders_restaurant ON orders(restaurant_id, status, created_at);
      CREATE INDEX idx_orders_courier    ON orders(courier_id, status);
      CREATE INDEX idx_order_items_order ON order_items(order_id);
      CREATE INDEX idx_order_events_order ON order_events(order_id, created_at);
    `,
  },
  {
    id: 2,
    name: 'invites_and_applications',
    sql: `
      -- Bir martalik taklif havolalari. Token o'zi saqlanmaydi, faqat SHA-256 xeshi.
      CREATE TABLE invites (
        id            INTEGER PRIMARY KEY,
        token_hash    TEXT NOT NULL UNIQUE,
        kind          TEXT NOT NULL CHECK (kind IN ('owner','manager','courier')),
        restaurant_id INTEGER NOT NULL REFERENCES restaurants(id),
        courier_id    INTEGER REFERENCES couriers(id),   -- kind='courier' bo'lsa
        created_by    INTEGER REFERENCES users(id),
        created_at    INTEGER NOT NULL,
        expires_at    INTEGER NOT NULL,
        used_by       INTEGER REFERENCES users(id),
        used_at       INTEGER,
        revoked_at    INTEGER
      );
      CREATE INDEX idx_invites_restaurant ON invites(restaurant_id, kind);

      -- Restoran arizasi (bot orqali): ariza beruvchi tasdiqlangach egasi bo'ladi (10-bosqich).
      ALTER TABLE restaurants ADD COLUMN applicant_id INTEGER REFERENCES users(id);
    `,
  },
  {
    id: 3,
    name: 'home_cuisines_rating',
    sql: `
      -- Reyting: faqat haqiqiy baholardan (15-bosqich). count = 0 bo'lsa reyting ko'rsatilmaydi.
      ALTER TABLE restaurants ADD COLUMN rating_sum INTEGER NOT NULL DEFAULT 0;
      ALTER TABLE restaurants ADD COLUMN rating_count INTEGER NOT NULL DEFAULT 0;
      -- Taxminiy tayyorlash vaqti (daqiqa) — yetkazish vaqti bahosi uchun.
      ALTER TABLE restaurants ADD COLUMN prep_minutes INTEGER NOT NULL DEFAULT 20 CHECK (prep_minutes BETWEEN 5 AND 180);

      INSERT OR IGNORE INTO cuisines (slug, name_uz, name_ru, sort) VALUES
        ('milliy',    'Milliy taomlar',    'Национальная кухня', 10),
        ('shashlik',  'Shashlik',          'Шашлык',             20),
        ('somsa',     'Somsa va non',      'Самса и выпечка',    30),
        ('fastfood',  'Fast food',         'Фастфуд',            40),
        ('pitsa',     'Pitsa',             'Пицца',              50),
        ('yevropa',   'Yevropa taomlari',  'Европейская кухня',  60),
        ('turk',      'Turk taomlari',     'Турецкая кухня',     70),
        ('sushi',     'Sushi',             'Суши',               80),
        ('shirinlik', 'Shirinliklar',      'Десерты',            90),
        ('kofe',      'Kofe va choy',      'Кофе и чай',        100),
        ('ichimlik',  'Ichimliklar',       'Напитки',           110);
    `,
  },
  {
    id: 4,
    name: 'checkout',
    sql: `
      -- Buyurtma qabul qiluvchining saqlangan ismi (telefon — users.phone).
      ALTER TABLE users ADD COLUMN contact_name TEXT;
      CREATE INDEX idx_orders_status ON orders(status, updated_at);
    `,
  },
  {
    id: 5,
    name: 'payments',
    sql: `
      ALTER TABLE orders ADD COLUMN payment_claimed_at INTEGER;   -- mijoz "To'ladim" bosgan vaqt
      ALTER TABLE orders ADD COLUMN paid_at INTEGER;              -- to'lov tasdiqlangan vaqt
      ALTER TABLE orders ADD COLUMN refunded_at INTEGER;
      ALTER TABLE orders ADD COLUMN invoice_nonce TEXT;           -- onlayn to'lov payload'i uchun tasodifiy qism

      -- Onlayn to'lov hodisalari. telegram_payment_charge_id UNIQUE — bir to'lov ikki marta hisoblanmaydi.
      CREATE TABLE payments (
        id                         INTEGER PRIMARY KEY,
        order_id                   INTEGER NOT NULL REFERENCES orders(id),
        provider                   TEXT NOT NULL,
        telegram_payment_charge_id TEXT NOT NULL UNIQUE,
        provider_payment_charge_id TEXT,
        amount                     INTEGER NOT NULL,   -- eng kichik birlikda (UZS uchun tiyin)
        currency                   TEXT NOT NULL,
        outcome                    TEXT NOT NULL,      -- applied | late_refund_requested
        created_at                 INTEGER NOT NULL
      );
      CREATE INDEX idx_payments_order ON payments(order_id);
    `,
  },
  {
    id: 6,
    name: 'platform',
    sql: `
      -- Faqat demo/sinov restoranlari. "Demo ma'lumotni o'chirish" faqat shularga tegadi.
      ALTER TABLE restaurants ADD COLUMN is_demo INTEGER NOT NULL DEFAULT 0;
      -- Restoran holati o'zgarishlari (kim, qachon, nima, sabab).
      CREATE TABLE restaurant_events (
        id            INTEGER PRIMARY KEY,
        restaurant_id INTEGER NOT NULL REFERENCES restaurants(id),
        actor_id      INTEGER REFERENCES users(id),
        type          TEXT NOT NULL,
        from_status   TEXT,
        to_status     TEXT,
        reason        TEXT,
        created_at    INTEGER NOT NULL
      );
      CREATE INDEX idx_restaurant_events ON restaurant_events(restaurant_id, created_at);
    `,
  },
];

export function migrate(db) {
  db.exec(`CREATE TABLE IF NOT EXISTS schema_migrations (
    id INTEGER PRIMARY KEY, name TEXT NOT NULL, applied_at INTEGER NOT NULL
  )`);
  const applied = new Set(db.prepare('SELECT id FROM schema_migrations').all().map((r) => r.id));
  for (const m of migrations) {
    if (applied.has(m.id)) continue;
    db.exec('BEGIN IMMEDIATE');
    try {
      db.exec(m.sql);
      db.prepare('INSERT INTO schema_migrations (id, name, applied_at) VALUES (?, ?, ?)')
        .run(m.id, m.name, Date.now());
      db.exec('COMMIT');
    } catch (e) {
      db.exec('ROLLBACK');
      throw new Error(`Migratsiya ${m.id} (${m.name}) bajarilmadi: ${e.message}`);
    }
  }
}

export const latestMigrationId = migrations[migrations.length - 1].id;
