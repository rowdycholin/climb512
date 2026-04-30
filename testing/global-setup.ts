import type { FullConfig } from "@playwright/test";
import { cleanupPlaywrightUsers } from "./db-cleanup";

export default async function globalSetup(_config: FullConfig) {
  cleanupPlaywrightUsers();
}
