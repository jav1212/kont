import type { IpcMain, IpcMainInvokeEvent, WebContents } from "electron";

type ElectronIpcHandler = Parameters<IpcMain["handle"]>[1];

/**
 * Registers privileged IPC handlers that only accept the active main frame.
 *
 * The renderer may never choose channels dynamically: preload exposes one
 * method per capability and every invocation is checked again in main.
 */
export class SecureIpcRegistrar {
  /**
   * Creates a registrar over Electron's process-global IPC registry.
   * @param ipc - Electron IPC registry owned by the main process.
   * @param trustedWebContents - Resolves the sole renderer allowed to invoke handlers.
   */
  constructor(
    private readonly ipc: IpcMain,
    private readonly trustedWebContents: () => WebContents | undefined,
  ) {}

  /**
   * Registers one request-response channel with mandatory sender validation.
   * @param channel - Static channel name declared by the Desktop contract.
   * @param handler - Capability handler executed for trusted main-frame calls.
   * @returns Nothing.
   * @throws Error when a non-main frame or an unknown renderer invokes the channel.
   */
  handle(channel: string, handler: ElectronIpcHandler): void {
    this.ipc.handle(channel, (event, ...arguments_) => {
      this.assertTrustedSender(event);
      return handler(event, ...arguments_);
    });
  }

  private assertTrustedSender(event: IpcMainInvokeEvent): void {
    const trusted = this.trustedWebContents();
    if (
      trusted === undefined ||
      event.sender !== trusted ||
      event.senderFrame !== trusted.mainFrame
    ) {
      throw new Error("Rejected IPC invocation from an untrusted renderer.");
    }
  }
}
