import { primaryKey, sqliteTable, text } from 'drizzle-orm/sqlite-core';

export const purchases = sqliteTable('purchases', {
  owner: text('owner').notNull(),
  edition: text('edition').notNull()
}, (table) => [primaryKey({ columns: [table.owner, table.edition] })]);
