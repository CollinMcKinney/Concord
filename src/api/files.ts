import * as files from "../files.ts";
import type { FileCategory, FileMeta } from "../files.ts";

/**
 * Lists all files across all categories.
 */
export async function listFiles(): Promise<Record<FileCategory, FileMeta[]>> {
  return files.listAllFiles();
}

/**
 * Uploads a file to disk from base64-encoded data.
 */
export async function uploadFile(
  _sessionToken: string,
  category: FileCategory,
  name: string,
  base64Data: string,
  mimeType?: string
): Promise<FileMeta> {
  // Validate category name format
  if (!/^[a-z0-9_-]+$/.test(category)) {
    throw new Error("Invalid category name. Use only lowercase letters, numbers, dashes, and underscores.");
  }

  // Validate and decode base64 data
  const buffer = Buffer.from(base64Data, "base64");
  if (buffer.length === 0) {
    throw new Error("Invalid or empty file data");
  }

  return await files.uploadFile(category, name, buffer, mimeType);
}

/**
 * Deletes a file from disk and cache.
 */
export async function deleteFile(
  category: FileCategory,
  name: string
): Promise<boolean> {
  // Validate category
  const validCategories: FileCategory[] = await files.getCategories();
  if (!validCategories.includes(category)) {
    throw new Error(`Invalid category. Must be one of: ${validCategories.join(", ")}`);
  }

  return await files.deleteFile(category, name);
}

/**
 * Lists all file categories.
 */
export async function getCategories(): Promise<FileCategory[]> {
  return files.getCategories();
}

/**
 * Creates a new file category.
 */
export async function createCategory(name: string): Promise<FileCategory> {
  return files.createCategory(name);
}

/**
 * Deletes a file category.
 */
export async function deleteCategory(name: string): Promise<boolean> {
  return files.deleteCategory(name);
}

/**
 * Gets the list of allowed MIME types for file uploads.
 */
export async function getAllowedMimeTypes(): Promise<string[]> {
  return files.getAllowedMimeTypes();
}

/**
 * Sets the list of allowed MIME types for file uploads (ROOT only).
 * Note: ROOT check is handled by permission system, not here.
 */
export async function setAllowedMimeTypes(...mimeTypes: string[]): Promise<void> {
  return files.setAllowedMimeTypes(mimeTypes);
}
