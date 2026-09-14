export const shorthands = undefined;

export const up = (pgm) => {
  pgm.createTable('expenses', {
    id: 'id',
    category: { type: 'text', notNull: true },
    description: { type: 'text', notNull: false },
    amount_amd: { type: 'integer', notNull: true },
    date: { type: 'date', notNull: true },
    created_at: { type: 'timestamptz', notNull: true, default: pgm.func('now()') },
  });

  pgm.addConstraint('expenses', 'expenses_amount_positive', {
    check: 'amount_amd > 0',
  });

  pgm.createIndex('expenses', 'date');
  pgm.createIndex('expenses', 'category');
};

export const down = (pgm) => {
  pgm.dropTable('expenses');
};
