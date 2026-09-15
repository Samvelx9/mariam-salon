export const shorthands = undefined;

// Services become *zones* (Bikini, Full leg, Underarm…) grouped under a
// category — the treatment Mariam offers (waxing / sugaring / electrolysis).
// The guest picks a category on the landing page and then sees the price
// list for that category's zones.
const SEED_CATEGORIES = [
  {
    slug: 'waxing',
    name_en: 'Waxing',
    name_ru: 'Депиляция воском',
    name_hy: 'Մոմադեպիլացիա',
    description_en: 'Warm wax hair removal for face and body.',
    description_ru: 'Удаление волос тёплым воском — лицо и тело.',
    description_hy: 'Մազերի հեռացում տաք մոմով՝ դեմք և մարմին։',
    sort_order: 1,
  },
  {
    slug: 'sugaring',
    name_en: 'Sugaring',
    name_ru: 'Шугаринг',
    name_hy: 'Շաքարադեպիլացիա',
    description_en: 'Gentle sugar paste — ideal for sensitive skin.',
    description_ru: 'Мягкая сахарная паста — идеально для чувствительной кожи.',
    description_hy: 'Նուրբ շաքարային մածուկ՝ իդեալական զգայուն մաշկի համար։',
    sort_order: 2,
  },
  {
    slug: 'electrolysis',
    name_en: 'Electrolysis',
    name_ru: 'Электроэпиляция',
    name_hy: 'Էլեկտրաէպիլյացիա',
    description_en: 'Permanent hair removal, treated hair by hair.',
    description_ru: 'Перманентное удаление волос — волосок за волоском.',
    description_hy: 'Մազերի մշտական հեռացում՝ մազ առ մազ։',
    sort_order: 3,
  },
];

const sqlString = (value) => `'${value.replace(/'/g, "''")}'`;

export const up = (pgm) => {
  pgm.createTable('service_categories', {
    id: 'id',
    slug: { type: 'text', notNull: true, unique: true },
    name_en: { type: 'text', notNull: true },
    name_ru: { type: 'text', notNull: true },
    name_hy: { type: 'text', notNull: true },
    description_en: { type: 'text', notNull: true, default: '' },
    description_ru: { type: 'text', notNull: true, default: '' },
    description_hy: { type: 'text', notNull: true, default: '' },
    sort_order: { type: 'integer', notNull: true, default: 0 },
    is_active: { type: 'boolean', notNull: true, default: true },
    created_at: { type: 'timestamptz', notNull: true, default: pgm.func('now()') },
  });

  for (const category of SEED_CATEGORIES) {
    pgm.sql(
      `INSERT INTO service_categories
         (slug, name_en, name_ru, name_hy, description_en, description_ru, description_hy, sort_order)
       VALUES (
         ${sqlString(category.slug)},
         ${sqlString(category.name_en)},
         ${sqlString(category.name_ru)},
         ${sqlString(category.name_hy)},
         ${sqlString(category.description_en)},
         ${sqlString(category.description_ru)},
         ${sqlString(category.description_hy)},
         ${category.sort_order}
       )`
    );
  }

  pgm.addColumns('services', {
    category_id: {
      type: 'integer',
      notNull: false,
      references: 'service_categories',
      onDelete: 'RESTRICT',
    },
    sort_order: { type: 'integer', notNull: true, default: 0 },
  });

  // Existing rows predate categories — file each one by what its slug/name
  // says, defaulting to waxing. Mariam can re-file any of them in the admin.
  pgm.sql(`
    UPDATE services s SET category_id = c.id
    FROM service_categories c
    WHERE c.slug = CASE
      WHEN s.slug ILIKE '%sugar%' OR s.name_en ILIKE '%sugar%' THEN 'sugaring'
      WHEN s.slug ILIKE '%electro%' OR s.name_en ILIKE '%electro%' THEN 'electrolysis'
      ELSE 'waxing'
    END
  `);
  pgm.sql('UPDATE services SET sort_order = id WHERE sort_order = 0');

  pgm.alterColumn('services', 'category_id', { notNull: true });
  pgm.createIndex('services', 'category_id');
};

export const down = (pgm) => {
  pgm.dropColumns('services', ['category_id', 'sort_order']);
  pgm.dropTable('service_categories');
};
