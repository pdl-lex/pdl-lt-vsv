/** Pfad der Demo-Bundles für Tests (`src/test/fixtures/`). */
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));

export function fixturePath(name: string): string {
  return resolve(here, "fixtures", name);
}
