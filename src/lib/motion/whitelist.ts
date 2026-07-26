/**
 * The ONLY imports generated animation code is allowed to use. The M5
 * validation gate rejects any generated component that imports anything else.
 * Keeping this list tiny is what makes generations reliable and cheap models
 * usable — fewer degrees of freedom, statically checkable before we ever render.
 */
export const ALLOWED_IMPORTS = [
  "react",
  "remotion",
  "@/lib/motion/primitives",
] as const;

export type AllowedImport = (typeof ALLOWED_IMPORTS)[number];

export function isAllowedImport(source: string): boolean {
  return (ALLOWED_IMPORTS as readonly string[]).includes(source);
}
