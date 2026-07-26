/**
 * Polar client (checkout + webhook verification).
 *
 * Defaults to the SANDBOX server so a misconfigured deploy can't take real
 * money — production requires setting POLAR_SERVER=production explicitly.
 * Everything here degrades to "not configured" without keys, so the API boots
 * and the rest of the product works with billing simply switched off.
 */
import { Polar } from "@polar-sh/sdk";

export function polarConfigured(): boolean {
  return !!process.env.POLAR_ACCESS_TOKEN;
}

export function polarServer(): "sandbox" | "production" {
  return process.env.POLAR_SERVER === "production" ? "production" : "sandbox";
}

let client: Polar | null = null;

export function polarClient(): Polar {
  const accessToken = process.env.POLAR_ACCESS_TOKEN;
  if (!accessToken) throw new Error("POLAR_ACCESS_TOKEN is not configured");
  client ??= new Polar({ accessToken, server: polarServer() });
  return client;
}
