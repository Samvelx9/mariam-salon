export const shorthands = undefined;

// Mariam's full depilation price list, replacing the twelve-zone extract seeded
// in `real-price-list`. Same rule as before: one set of zones priced and timed
// identically whether they're done with sugar paste or with wax, so every row
// is seeded under both treatments. Electrolysis still has no zones of its own.
//
// Unlike the first pass, the durations here are hers, off the sheet — several
// are much shorter than the estimates we had been carrying (an upper lip is
// five minutes, not fifteen), which is what made the old calendar over-reserve.
//
// The sheet's КОМПЛЕКСЫ section is deliberately not seeded row by row: five of
// its six packages are the exact sum of their zones, and the guest already
// picks several zones in one visit, so listing them again would only let
// someone book underarms twice. "Полная депиляция тела" is the one package
// priced below the sum of its parts, so it stays as its own row.
const ZONES = [
  { slug: 'upper-lip', en: 'Upper lip', ru: 'Верхняя губа', hy: 'Վերին շրթունք', minutes: 5, price: 2000 },
  { slug: 'chin', en: 'Chin', ru: 'Подбородок', hy: 'Կզակ', minutes: 5, price: 2000 },
  { slug: 'sideburns', en: 'Sideburns', ru: 'Бакенбарды', hy: 'Այտամորուք', minutes: 7, price: 2000 },
  { slug: 'nose', en: 'Nose', ru: 'Нос', hy: 'Քիթ', minutes: 5, price: 2000 },
  { slug: 'face', en: 'Full face', ru: 'Всё лицо', hy: 'Դեմքն ամբողջությամբ', minutes: 15, price: 5000 },
  { slug: 'underarms', en: 'Underarms', ru: 'Подмышки', hy: 'Անութներ', minutes: 7, price: 4000 },
  { slug: 'arms-to-elbow', en: 'Arms to the elbow', ru: 'Руки до локтя', hy: 'Ձեռքեր՝ մինչև արմունկ', minutes: 15, price: 4000 },
  { slug: 'full-arms', en: 'Full arms', ru: 'Руки полностью', hy: 'Ձեռքերն ամբողջությամբ', minutes: 20, price: 6000 },
  { slug: 'legs-to-knee', en: 'Legs to the knee', ru: 'Ноги до колена', hy: 'Ոտքեր՝ մինչև ծունկ', minutes: 20, price: 5000 },
  { slug: 'thighs', en: 'Thighs', ru: 'Бёдра', hy: 'Ազդրեր', minutes: 15, price: 5000 },
  { slug: 'full-legs', en: 'Full legs', ru: 'Ноги полностью', hy: 'Ոտքերն ամբողջությամբ', minutes: 40, price: 10000 },
  { slug: 'stomach', en: 'Stomach', ru: 'Живот', hy: 'Որովայն', minutes: 15, price: 3000 },
  { slug: 'belly-line', en: 'Belly line', ru: 'Белая линия живота', hy: 'Որովայնի սպիտակ գիծ', minutes: 5, price: 2000 },
  { slug: 'lower-back', en: 'Lower back', ru: 'Поясница', hy: 'Գոտկատեղ', minutes: 10, price: 3000 },
  { slug: 'full-back', en: 'Full back', ru: 'Спина полностью', hy: 'Մեջքն ամբողջությամբ', minutes: 15, price: 6000 },
  { slug: 'chest', en: 'Chest', ru: 'Грудь', hy: 'Կրծքավանդակ', minutes: 10, price: 4000 },
  { slug: 'chest-stomach', en: 'Chest and stomach', ru: 'Грудь + живот', hy: 'Կրծքավանդակ և որովայն', minutes: 15, price: 6000 },
  { slug: 'shoulders', en: 'Shoulders', ru: 'Плечи', hy: 'Ուսեր', minutes: 10, price: 2000 },
  { slug: 'buttocks', en: 'Buttocks', ru: 'Ягодицы', hy: 'Հետույք', minutes: 15, price: 3000 },
  { slug: 'classic-bikini', en: 'Classic bikini', ru: 'Бикини классическое', hy: 'Դասական բիկինի', minutes: 15, price: 6000 },
  { slug: 'deep-bikini', en: 'Deep bikini', ru: 'Бикини глубокое', hy: 'Խորը բիկինի', minutes: 30, price: 8000 },
  { slug: 'full-body', en: 'Full body', ru: 'Полная депиляция тела', hy: 'Ամբողջ մարմին', minutes: 120, price: 25000 },
];

// What `real-price-list` left in the table, so `down` can put it back rather
// than leaving the two treatments empty.
const PREVIOUS = {
  face: { minutes: 30, price: 5000 },
  'upper-lip': { minutes: 15, price: 2000 },
  underarms: { minutes: 15, price: 4000 },
  'arms-to-elbow': { minutes: 20, price: 4000 },
  'full-arms': { minutes: 30, price: 6000 },
  stomach: { minutes: 15, price: 4000 },
  'full-back': { minutes: 30, price: 5000 },
  buttocks: { minutes: 15, price: 3000 },
  'deep-bikini': { minutes: 45, price: 8000 },
  'classic-bikini': { minutes: 30, price: 6000 },
  'full-legs': { minutes: 60, price: 10000 },
  'legs-to-knee': { minutes: 30, price: 5000 },
};

const TREATMENTS = ['waxing', 'sugaring'];
const sqlString = (value) => `'${value.replace(/'/g, "''")}'`;

export const up = (pgm) => {
  for (const treatment of TREATMENTS) {
    ZONES.forEach((zone, index) => {
      // The twelve zones already in the table keep their ids so the bookings
      // pointing at them stay pointing at them; the ten new ones are inserted.
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
        ON CONFLICT (slug) DO UPDATE SET
          name_en = EXCLUDED.name_en,
          name_ru = EXCLUDED.name_ru,
          name_hy = EXCLUDED.name_hy,
          duration_minutes = EXCLUDED.duration_minutes,
          price_amd = EXCLUDED.price_amd,
          sort_order = EXCLUDED.sort_order
      `);
    });
  }
};

export const down = (pgm) => {
  const added = ZONES.filter((zone) => !PREVIOUS[zone.slug]);
  const addedSlugs = TREATMENTS.flatMap((treatment) =>
    added.map((zone) => sqlString(`${treatment}-${zone.slug}`))
  ).join(', ');

  pgm.sql(`DELETE FROM booking_items WHERE service_id IN (SELECT id FROM services WHERE slug IN (${addedSlugs}))`);
  // A booking stripped of every zone has nothing left to show, so it goes too.
  pgm.sql(`DELETE FROM bookings WHERE id NOT IN (SELECT booking_id FROM booking_items)`);
  pgm.sql(`DELETE FROM services WHERE slug IN (${addedSlugs})`);

  // The surviving twelve go back to the figures and the ordering they had.
  const previousOrder = [
    'face', 'upper-lip', 'underarms', 'arms-to-elbow', 'full-arms', 'stomach',
    'full-back', 'buttocks', 'deep-bikini', 'classic-bikini', 'full-legs', 'legs-to-knee',
  ];
  for (const treatment of TREATMENTS) {
    previousOrder.forEach((slug, index) => {
      const { minutes, price } = PREVIOUS[slug];
      pgm.sql(`
        UPDATE services
           SET duration_minutes = ${minutes}, price_amd = ${price}, sort_order = ${index + 1}
         WHERE slug = ${sqlString(`${treatment}-${slug}`)}
      `);
    });
  }
};
