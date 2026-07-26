/**
 * The validation gate.
 *
 * Runs over any animation component source (seed templates now, model output at
 * M5) BEFORE it is persisted or rendered. Static, deterministic, no execution.
 *
 * Checks (spec §5):
 *   1. Parses as JSX/TSX.
 *   2. Only whitelisted imports.
 *   3. No eval / fetch / document / window / network / timers / dynamic require.
 *   4. Exports a default (the component).
 *   5. durationInFrames within [30, 1800].
 *   6. Every declared param key is actually read from `params` (nothing hardcoded).
 */
import { parse } from "@babel/parser";
import _traverse from "@babel/traverse";
import type { ParamSchema } from "./types";
import { isAllowedImport } from "@/lib/motion/whitelist";

// @babel/traverse ships a CJS default export; interop differs across runners.
const traverse = (
  (_traverse as unknown as { default?: typeof _traverse }).default ?? _traverse
) as typeof _traverse;

const FORBIDDEN_GLOBALS = new Set([
  "eval",
  "fetch",
  "document",
  "window",
  "globalThis",
  "self",
  "XMLHttpRequest",
  "WebSocket",
  "setTimeout",
  "setInterval",
  "setImmediate",
  "requestAnimationFrame",
  "queueMicrotask",
  "Function",
  "process",
  "require",
  "importScripts",
  "localStorage",
  "sessionStorage",
  "indexedDB",
]);

export const MIN_DURATION = 30;
export const MAX_DURATION = 1800;

export interface ValidationResult {
  ok: boolean;
  errors: string[];
}

export function validateTemplateCode(
  code: string,
  params: ParamSchema[],
  durationInFrames: number,
): ValidationResult {
  const errors: string[] = [];

  // 5. duration sanity (cheap, do first)
  if (
    !Number.isInteger(durationInFrames) ||
    durationInFrames < MIN_DURATION ||
    durationInFrames > MAX_DURATION
  ) {
    errors.push(
      `durationInFrames ${durationInFrames} out of range [${MIN_DURATION}, ${MAX_DURATION}]`,
    );
  }

  // 1. parse
  let ast;
  try {
    ast = parse(code, {
      sourceType: "module",
      plugins: ["jsx", "typescript"],
    });
  } catch (e) {
    errors.push(`parse error: ${(e as Error).message}`);
    return { ok: false, errors }; // can't do AST checks without an AST
  }

  let hasDefaultExport = false;
  const usedParamKeys = new Set<string>();

  traverse(ast, {
    ImportDeclaration(path) {
      const source = path.node.source.value;
      if (!isAllowedImport(source)) {
        errors.push(`disallowed import: "${source}"`);
      }
    },
    ExportDefaultDeclaration() {
      hasDefaultExport = true;
    },
    Identifier(path) {
      // Only flag *references*, not property names or declarations.
      if (!path.isReferencedIdentifier()) return;
      if (FORBIDDEN_GLOBALS.has(path.node.name)) {
        // Ignore if it's a local binding shadowing the global.
        if (!path.scope.hasBinding(path.node.name)) {
          errors.push(`forbidden global: "${path.node.name}"`);
        }
      }
    },
    // params.KEY
    MemberExpression(path) {
      const { object, property, computed } = path.node;
      if (
        !computed &&
        object.type === "Identifier" &&
        object.name === "params" &&
        property.type === "Identifier"
      ) {
        usedParamKeys.add(property.name);
      }
    },
    // const { KEY, ... } = params   |   = props.params
    VariableDeclarator(path) {
      const init = path.node.init;
      const fromParams =
        (init?.type === "Identifier" && init.name === "params") ||
        (init?.type === "MemberExpression" &&
          init.property.type === "Identifier" &&
          init.property.name === "params");
      if (fromParams && path.node.id.type === "ObjectPattern") {
        for (const prop of path.node.id.properties) {
          if (prop.type === "ObjectProperty" && prop.key.type === "Identifier") {
            usedParamKeys.add(prop.key.name);
          }
        }
      }
    },
  });

  // 4. default export
  if (!hasDefaultExport) {
    errors.push("no default export (component)");
  }

  // 6. every declared param is read from `params`
  for (const p of params) {
    if (!usedParamKeys.has(p.key)) {
      errors.push(`param "${p.key}" is declared but never read from params`);
    }
  }

  // de-dupe repeated messages (e.g. window referenced many times)
  const unique = [...new Set(errors)];
  return { ok: unique.length === 0, errors: unique };
}
