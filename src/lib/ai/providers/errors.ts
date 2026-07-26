/**
 * Provider error vocabulary. The generation handler branches on the MESSAGE
 * (it never names providers in responses), so these carry stable marker
 * strings:
 *   - NotConfiguredError → mapped to the 501 "not available yet" envelope,
 *     same as the pre-M7 not-wired state. A tier without its key is simply off.
 *   - ProviderCallError  → mapped to the 502 "generation failed" envelope.
 */
export class NotConfiguredError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "NotConfiguredError";
  }
}

export class ProviderCallError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ProviderCallError";
  }
}
