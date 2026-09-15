export const shorthands = undefined;

// Single-row table holding everything the guest landing page shows about
// Mariam herself: her intro, her photo, how to reach her, and where the
// salon is. Same single-row shape as admin_user (id fixed at 1) so the
// admin UI can PUT it without worrying about creating vs updating.
export const up = (pgm) => {
  pgm.createTable('salon_profile', {
    id: { type: 'smallint', primaryKey: true, default: 1 },

    owner_name_en: { type: 'text', notNull: true, default: '' },
    owner_name_ru: { type: 'text', notNull: true, default: '' },
    owner_name_hy: { type: 'text', notNull: true, default: '' },

    tagline_en: { type: 'text', notNull: true, default: '' },
    tagline_ru: { type: 'text', notNull: true, default: '' },
    tagline_hy: { type: 'text', notNull: true, default: '' },

    about_en: { type: 'text', notNull: true, default: '' },
    about_ru: { type: 'text', notNull: true, default: '' },
    about_hy: { type: 'text', notNull: true, default: '' },

    address_en: { type: 'text', notNull: true, default: '' },
    address_ru: { type: 'text', notNull: true, default: '' },
    address_hy: { type: 'text', notNull: true, default: '' },
    map_url: { type: 'text', notNull: true, default: '' },

    phone: { type: 'text', notNull: true, default: '' },
    whatsapp: { type: 'text', notNull: true, default: '' },
    telegram: { type: 'text', notNull: true, default: '' },
    instagram: { type: 'text', notNull: true, default: '' },
    email: { type: 'text', notNull: true, default: '' },

    // The photo lives in the database rather than on disk: the API runs in a
    // container with no persistent volume, and it's one small image.
    photo_mime: { type: 'text', notNull: false },
    photo_data: { type: 'bytea', notNull: false },
    photo_updated_at: { type: 'timestamptz', notNull: false },

    updated_at: { type: 'timestamptz', notNull: true, default: pgm.func('now()') },
  });

  pgm.addConstraint('salon_profile', 'salon_profile_single_row', {
    check: 'id = 1',
  });

  pgm.sql(`
    INSERT INTO salon_profile (
      id,
      owner_name_en, owner_name_ru, owner_name_hy,
      tagline_en, tagline_ru, tagline_hy,
      about_en, about_ru, about_hy
    ) VALUES (
      1,
      'Mariam', 'Мариам', 'Մարիամ',
      'Waxing, sugaring & electrolysis, done gently.',
      'Депиляция воском и сахаром, электроэпиляция — бережно.',
      'Մոմադեպիլացիա, շաքարադեպիլացիա և էլեկտրաէպիլյացիա՝ նուրբ մոտեցմամբ։',
      '', '', ''
    )
  `);
};

export const down = (pgm) => {
  pgm.dropTable('salon_profile');
};
