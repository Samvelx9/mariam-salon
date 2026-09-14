export const shorthands = undefined;

const SEED_SERVICES = [
  {
    slug: 'brazilian',
    name_en: 'Brazilian Wax',
    name_ru: 'Бразильская депиляция воском',
    name_hy: 'Բրազիլական մոմադեպիլացիա',
    duration_minutes: 30,
    price_amd: 12000,
  },
  {
    slug: 'fullleg',
    name_en: 'Full Leg Wax',
    name_ru: 'Депиляция ног воском',
    name_hy: 'Ոտքերի մոմադեպիլացիա',
    duration_minutes: 45,
    price_amd: 15000,
  },
  {
    slug: 'underarm',
    name_en: 'Underarm Wax',
    name_ru: 'Депиляция подмышек воском',
    name_hy: 'Անութների մոմադեպիլացիա',
    duration_minutes: 15,
    price_amd: 5000,
  },
  {
    slug: 'brows',
    name_en: 'Eyebrow Shaping',
    name_ru: 'Коррекция бровей',
    name_hy: 'Հոնքերի ձևավորում',
    duration_minutes: 15,
    price_amd: 4000,
  },
  {
    slug: 'sugaring',
    name_en: 'Sugaring — Bikini',
    name_ru: 'Шугаринг бикини',
    name_hy: 'Շաքարադեպիլացիա՝ բիկինի',
    duration_minutes: 30,
    price_amd: 10000,
  },
];

const sqlString = (value) => `'${value.replace(/'/g, "''")}'`;

export const up = (pgm) => {
  pgm.createTable('services', {
    id: 'id',
    slug: { type: 'text', notNull: true, unique: true },
    name_en: { type: 'text', notNull: true },
    name_ru: { type: 'text', notNull: true },
    name_hy: { type: 'text', notNull: true },
    duration_minutes: { type: 'integer', notNull: true },
    price_amd: { type: 'integer', notNull: true },
    is_active: { type: 'boolean', notNull: true, default: true },
    created_at: { type: 'timestamptz', notNull: true, default: pgm.func('now()') },
  });

  pgm.addConstraint('services', 'services_duration_positive', {
    check: 'duration_minutes > 0',
  });
  pgm.addConstraint('services', 'services_price_non_negative', {
    check: 'price_amd >= 0',
  });

  for (const service of SEED_SERVICES) {
    pgm.sql(
      `INSERT INTO services (slug, name_en, name_ru, name_hy, duration_minutes, price_amd)
       VALUES (
         ${sqlString(service.slug)},
         ${sqlString(service.name_en)},
         ${sqlString(service.name_ru)},
         ${sqlString(service.name_hy)},
         ${service.duration_minutes},
         ${service.price_amd}
       )`
    );
  }
};

export const down = (pgm) => {
  pgm.dropTable('services');
};
