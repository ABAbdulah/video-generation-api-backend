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

/**
 * The upstream account can't serve this tier right now — out of credit, or
 * rate limited. Distinct from ProviderCallError because retrying is futile
 * until an operator acts, so the user is told to pick another tier rather
 * than "try again". Still never names the vendor (§5).
 */
export class ProviderUnavailableError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ProviderUnavailableError";
  }
}
