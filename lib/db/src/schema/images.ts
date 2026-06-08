import { pgTable, text, serial, timestamp, integer, doublePrecision, jsonb } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const libraryImagesTable = pgTable("library_images", {
  id: serial("id").primaryKey(),
  filename: text("filename").notNull(),
  originalName: text("original_name").notNull(),
  faceCount: integer("face_count").notNull().default(0),
  uploadedAt: timestamp("uploaded_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertLibraryImageSchema = createInsertSchema(libraryImagesTable).omit({
  id: true,
  uploadedAt: true,
});
export type InsertLibraryImage = z.infer<typeof insertLibraryImageSchema>;
export type LibraryImage = typeof libraryImagesTable.$inferSelect;

export const faceEmbeddingsTable = pgTable("face_embeddings", {
  id: serial("id").primaryKey(),
  imageId: integer("image_id").notNull().references(() => libraryImagesTable.id, { onDelete: "cascade" }),
  embedding: jsonb("embedding").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertFaceEmbeddingSchema = createInsertSchema(faceEmbeddingsTable).omit({
  id: true,
  createdAt: true,
});
export type InsertFaceEmbedding = z.infer<typeof insertFaceEmbeddingSchema>;
export type FaceEmbedding = typeof faceEmbeddingsTable.$inferSelect;
