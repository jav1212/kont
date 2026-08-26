import type { InteractionBlockTokenFactory } from "../application/index";

/** Deterministic token factory for interaction-gate tests. */
export class SequentialInteractionBlockTokenFactory {
  private sequence = 0;

  /**
   * Creates a sequential token factory.
   * @param prefix - Stable prefix used for every generated token.
   */
  constructor(private readonly prefix = "test-interaction-block") {}

  /**
   * Produces the next unique token in the sequence.
   * @returns A token composed from the configured prefix and incremented sequence.
   */
  readonly next: InteractionBlockTokenFactory = () => `${this.prefix}-${++this.sequence}`;
}
