import { index, integer, primaryKey, sqliteTable, text } from 'drizzle-orm/sqlite-core';

export const purchases = sqliteTable('purchases', {
  owner: text('owner').notNull(),
  edition: text('edition').notNull()
}, (table) => [primaryKey({ columns: [table.owner, table.edition] })]);

export const accounts = sqliteTable('accounts', {
  id: text('id').primaryKey(),
  username: text('username').notNull(),
  usernameKey: text('username_key').notNull().unique(),
  passwordHash: text('password_hash').notNull()
});

export const sessions = sqliteTable('account_sessions', {
  tokenHash: text('token_hash').primaryKey(),
  accountId: text('account_id').notNull().references(() => accounts.id, {onDelete:'cascade'}),
  expires: integer('expires').notNull()
}, table => [index('account_sessions_expiry').on(table.expires)]);

export const imports = sqliteTable('account_sites_imports', {
  sitesOwner: text('sites_owner').primaryKey(),
  accountId: text('account_id').notNull().unique().references(() => accounts.id, {onDelete:'cascade'})
});

export const authLimits = sqliteTable('account_auth_limits', {
  bucket: text('bucket').primaryKey(),
  expires: integer('expires').notNull(),
  attempts: integer('attempts').notNull()
}, table => [index('account_auth_limits_expiry').on(table.expires)]);
