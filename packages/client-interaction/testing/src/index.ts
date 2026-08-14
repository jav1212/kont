import type { InteractionBlockTokenFactory } from "@kontave/client-interaction-application";

export class SequentialInteractionBlockTokenFactory {
  private sequence = 0;

  constructor(private readonly prefix = "test-interaction-block") {}

  readonly next: InteractionBlockTokenFactory = () => `${this.prefix}-${++this.sequence}`;
}
