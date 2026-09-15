export const shorthands = undefined;

// Mariam's real price list, from her printed "sugar/wax" sheet: one set of
// twelve zones priced identically whether they're done with sugar paste or
// with wax, so the same twelve rows are seeded under both treatments.
//
// The sheet carries no durations — those are working estimates (see the
// README) and Mariam can adjust any of them under Admin → Services.
//
// Electrolysis is deliberately left with no zones: she hasn't given prices for
// it, and a treatment with no services is hidden from the landing page rather
// than shown with invented numbers.
const ZONES = [
  { slug: 'face', en: 'Full face', ru: 'Лицо полностью', hy: 'Դեմքն ամբողջությամբ', minutes: 30, price: 5000 },
  { slug: 'upper-lip', en: 'Upper lip', ru: 'Усики', hy: 'Վերին շրթունք', minutes: 15, price: 2000 },
  { slug: 'underarms', en: 'Underarms', ru: 'Подмышки', hy: 'Անութներ', minutes: 15, price: 4000 },
  { slug: 'arms-to-elbow', en: 'Arms to the elbow', ru: 'Руки до локтя', hy: 'Ձեռքեր՝ մինչև արմունկ', minutes: 20, price: 4000 },
  { slug: 'full-arms', en: 'Full arms', ru: 'Руки полностью', hy: 'Ձեռքերն ամբողջությամբ', minutes: 30, price: 6000 },
  { slug: 'stomach', en: 'Stomach', ru: 'Живот', hy: 'Որովայն', minutes: 15, price: 4000 },
  { slug: 'full-back', en: 'Full back', ru: 'Спина полностью', hy: 'Մեջքն ամբողջությամբ', minutes: 30, price: 5000 },
  { slug: 'buttocks', en: 'Buttocks', ru: 'Ягодицы', hy: 'Հետույք', minutes: 15, price: 3000 },
  { slug: 'deep-bikini', en: 'Deep bikini', ru: 'Бикини глубокое', hy: 'Խորը բիկինի', minutes: 45, price: 8000 },
  { slug: 'classic-bikini', en: 'Classic bikini', ru: 'Бикини классическое', hy: 'Դասական բիկինի', minutes: 30, price: 6000 },
  { slug: 'full-legs', en: 'Full legs', ru: 'Ноги полностью', hy: 'Ոտքերն ամբողջությամբ', minutes: 60, price: 10000 },
  { slug: 'legs-to-knee', en: 'Legs to the knee', ru: 'Ноги до колена', hy: 'Ոտքեր՝ մինչև ծունկ', minutes: 30, price: 5000 },
];

// The five rows seeded with the services table plus the four sample zones added
// with the treatments — all invented placeholders, all replaced here.
const PLACEHOLDER_SLUGS = [
  'brazilian',
  'fullleg',
  'underarm',
  'brows',
  'sugaring',
  'sugaring-fullleg',
  'sugaring-underarm',
  'electro-lip',
  'electro-chin',
];

const sqlString = (value) => `'${value.replace(/'/g, "''")}'`;
const slugList = PLACEHOLDER_SLUGS.map(sqlString).join(', ');

export const up = (pgm) => {
  // Every booking against a placeholder service is QA noise from the test runs
  // — the site has never taken a real one. They have to go before the services
  // they point at can be deleted (the FK is ON DELETE RESTRICT).
  pgm.sql(`
    DELETE FROM bookings
    WHERE service_id IN (SELECT id FROM services WHERE slug IN (${slugList}))
  `);
  pgm.sql(`DELETE FROM services WHERE slug IN (${slugList})`);

  for (const treatment of ['waxing', 'sugaring']) {
    ZONES.forEach((zone, index) => {
      pgm.sql(`
        INSERT INTO services
          (slug, category_id, name_en, name_ru, name_hy, duration_minutes, price_amd, sort_order)
        SELECT
          ${sqlString(`${treatment}-${zone.slug}`)},
          c.id,
          ${sqlString(zone.en)},
          ${sqlString(zone.ru)},
          ${sqlString(zone.hy)},
          ${zone.minutes},
          ${zone.price},
          ${index + 1}
        FROM service_categories c
        WHERE c.slug = ${sqlString(treatment)}
      `);
    });
  }
};

// Irreversible by design: the placeholder rows this replaced were invented
// sample data, and the bookings against them were QA noise. Rolling back just
// clears the real price list again.
export const down = (pgm) => {
  const newSlugs = ['waxing', 'sugaring']
    .flatMap((treatment) => ZONES.map((zone) => sqlString(`${treatment}-${zone.slug}`)))
    .join(', ');
  pgm.sql(`DELETE FROM bookings WHERE service_id IN (SELECT id FROM services WHERE slug IN (${newSlugs}))`);
  pgm.sql(`DELETE FROM services WHERE slug IN (${newSlugs})`);
};
