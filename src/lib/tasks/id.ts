import { randomBytes } from "crypto";

// Generates a URL-safe random ID compatible with Prisma cuid() format
export function createId(): string {
  return `c${randomBytes(11).toString("base64url")}`;
}
