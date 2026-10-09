/**
 * Laden von Bundles: eine langsamere, früher angeforderte Antwort darf ein
 * später gewähltes Bundle nicht überschreiben.
 */
import { describe, it, expect, vi } from "vitest";
import { readFileSync } from "node:fs";
import { fixturePath } from "../test/fixtures";
import { validateBundle } from "../types/schema";
import type { LoadedBundle } from "../data/loader";

const pending = new Map<string, (b: LoadedBundle) => void>();

vi.mock("../data/loader", () => ({
  loadFromApi: (id: string) => new Promise<LoadedBundle>((resolve) => pending.set(id, resolve)),
  loadFromFile: vi.fn(),
  pickBundleFile: vi.fn(),
}));

const { useViz } = await import("./store");

function loaded(id: string): LoadedBundle {
  const raw = JSON.parse(readFileSync(fixturePath("generic_demo.json"), "utf-8"));
  return { bundle: validateBundle(raw), source: { kind: "api", id } };
}

describe("openApiBundle", () => {
  it("setzt nur das zuletzt angeforderte Bundle ein", async () => {
    const first = useViz.getState().openApiBundle("alt");
    const second = useViz.getState().openApiBundle("neu");
    pending.get("neu")!(loaded("neu"));
    await second;
    pending.get("alt")!(loaded("alt"));
    await first;
    const source = useViz.getState().loaded?.source;
    expect(source).toEqual({ kind: "api", id: "neu" });
    expect(useViz.getState().status).toBe("ready");
  });
});
