export const shorthands = undefined;

export const up = (pgm) => {
  pgm.createTable('admin_user', {
    id: { type: 'smallint', primaryKey: true, default: 1 },
    username: { type: 'text', notNull: true, unique: true },
    password_hash: { type: 'text', notNull: true },
    created_at: { type: 'timestamptz', notNull: true, default: pgm.func('now()') },
  });

  pgm.addConstraint('admin_user', 'admin_user_single_row', {
    check: 'id = 1',
  });
};

export const down = (pgm) => {
  pgm.dropTable('admin_user');
};
