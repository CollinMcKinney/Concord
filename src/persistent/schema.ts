import { pgTable, uuid, text, integer, timestamp, jsonb, boolean } from 'drizzle-orm/pg-core';
import { relations } from 'drizzle-orm';

/**
 * Users table - stores account information
 */
export const users = pgTable('users', {
  id: uuid('id').primaryKey().defaultRandom(),
  osrsName: text('osrs_name').unique(),
  discName: text('disc_name').unique(),
  forumName: text('forum_name').unique(),
  role: integer('role').notNull().default(0),
  hashedPass: text('hashed_pass').notNull().default(''),
  createdAt: timestamp('created_at').defaultNow(),
});

/**
 * Files table - stores file metadata
 */
export const files = pgTable('files', {
  id: uuid('id').primaryKey(),
  category: text('category').notNull(),
  name: text('name').notNull(),
  mimeType: text('mime_type').notNull(),
  size: integer('size').notNull(),
  uploadedAt: timestamp('uploaded_at').defaultNow(),
});

/**
 * Config table - stores server configuration
 */
export const config = pgTable('config', {
  key: text('key').primaryKey(),
  value: jsonb('value').notNull().default({}),
});

// Relations
export const usersRelations = relations(users, ({ many }) => ({
  // One user has many files (if we add owner tracking)
}));

export const filesRelations = relations(files, ({ one }) => ({
  // Each file belongs to a category (future enhancement)
}));

// Export type inference helpers
export type User = typeof users.$inferSelect;
export type NewUser = typeof users.$inferInsert;

export type File = typeof files.$inferSelect;
export type NewFile = typeof files.$inferInsert;

export type Config = typeof config.$inferSelect;
export type NewConfig = typeof config.$inferInsert;
