import { describe, it, expect } from "vitest";
import { readdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

/**
 * Spec §5, requirement 2: the server NEVER executes generated code — it only
 * parses it to validate. Generated code runs in exactly one place, the
 * frontend's sandboxed preview iframe (which has its own mirror-image test).
 * One stray `new Function` here would turn model output into RCE.
 */
describe("the backend never executes generated code", () => {
  it("contains no new Function or eval anywhere in src/", () => {
    const offenders: string[] = [];
    const scan = (dir: string) => {
      for (const entry of readdirSync(dir, { withFileTypes: true })) {
        const full = resolve(dir, entry.name);
        if (entry.isDirectory()) scan(full);
        else if (/\.tsx?$/.test(entry.name)) {
          const src = readFileSync(full, "utf8");
          if (/new Function/.test(src) || /\beval\(/.test(src)) {
            offenders.push(full);
          }
        }
      }
    };
    scan(resolve(__dirname, "..", "src"));
    expect(offenders).toEqual([]);
  });
});
