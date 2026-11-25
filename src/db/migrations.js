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
