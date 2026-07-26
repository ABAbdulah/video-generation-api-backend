import { describe, it, expect } from "vitest";
import { readdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

/**
 * Spec §5, requirement 2: the server's NODE PROCESS never executes generated
 * code — it only parses it to validate. Generated code executes in exactly
 * two browser contexts: the frontend's sandboxed preview iframe, and (since
 * M11) Remotion's headless Chrome during an export render. The render-side
 * compile lives in src/render/composition/DynamicScene.tsx, which is bundled
 * by webpack and executed ONLY inside that throwaway browser — never
 * imported by the API. This test pins `new Function` to that one file.
 */
describe("the backend never executes generated code in-process", () => {
  it("confines new Function/eval to the browser-context render composition", () => {
    const allowed = resolve(
      __dirname,
      "..",
      "src",
      "render",
      "composition",
      "DynamicScene.tsx",
    );
    const offenders: string[] = [];
    let sawAllowed = false;
    const scan = (dir: string) => {
      for (const entry of readdirSync(dir, { withFileTypes: true })) {
        const full = resolve(dir, entry.name);
        if (entry.isDirectory()) scan(full);
        else if (/\.tsx?$/.test(entry.name)) {
          const src = readFileSync(full, "utf8");
          if (/new Function/.test(src) || /\beval\(/.test(src)) {
            if (full === allowed) sawAllowed = true;
            else offenders.push(full);
          }
        }
      }
    };
    scan(resolve(__dirname, "..", "src"));
    expect(offenders).toEqual([]);
    expect(sawAllowed).toBe(true); // the sandbox moved? update this test consciously
  });

  it("the API never imports the render composition", () => {
    // The composition may only be reached through the webpack bundle the
    // worker builds — a direct import would put browser-context code (and its
    // new Function) into the Node process.
    const offenders: string[] = [];
    const scan = (dir: string) => {
      for (const entry of readdirSync(dir, { withFileTypes: true })) {
        const full = resolve(dir, entry.name);
        if (entry.isDirectory() && !full.includes("composition")) scan(full);
        else if (/\.tsx?$/.test(entry.name) && !full.includes("composition")) {
          const src = readFileSync(full, "utf8");
          if (/from ["'].*render\/composition/.test(src)) offenders.push(full);
        }
      }
    };
    scan(resolve(__dirname, "..", "src"));
    expect(offenders).toEqual([]);
  });
});
