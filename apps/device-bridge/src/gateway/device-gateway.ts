import { createHash, randomBytes, randomUUID, timingSafeEqual } from "node:crypto";
import { readFileSync } from "node:fs";
import { createServer as createHttpServer, type Server as HttpServer } from "node:http";
import { createServer as createHttpsServer, type Server as HttpsServer } from "node:https";
import { WebSocket, WebSocketServer } from "ws";
import { saveConfig, type ManagerConfig } from "../core/config";
import { ACCESS_CAPTURE_CAPABILITY, parseClientMessage, PROTOCOL_VERSION, type ManagerEvent } from "../protocol/contracts";

const BADGE_BARCODE_PREFIX = "KONT-";
const ACCESS_CAPTURE_LEASE_MS = 35_000;

export interface PairingRequest { clientName: string; origin: string }
interface AccessCaptureLease { socket: WebSocket; leaseId: string; expiresAt: number }

/** Hosts the local, origin-restricted WebSocket protocol for paired Kontave Web clients. */
export class DeviceGateway {
  private server: HttpServer | HttpsServer | null = null;
  private sockets: WebSocketServer | null = null;
  private authenticated = new WeakSet<WebSocket>();
  private accessCapture: AccessCaptureLease | null = null;
  private latestStatus: ManagerEvent = { type: "device.status", device: null, status: "disconnected" };
  private pendingErrors: Extract<ManagerEvent, { type: "manager.error" }>[] = [];

  /**
   * Creates a gateway for a single local Device Bridge installation.
   *
   * @param config - Persisted local manager configuration and pairing token hash.
   * @param version - Version reported to connected Web clients.
   * @param approve - Interactive policy that decides whether a new pairing may be stored.
   */
  constructor(private readonly config: ManagerConfig, private readonly version: string, private readonly approve: (request: PairingRequest) => Promise<boolean>) {}

  /**
   * Starts the loopback WebSocket listener.
   *
   * @returns The secure or plain WebSocket URL selected from the configured TLS settings.
   * @throws When the TLS certificate cannot be read or the local listener cannot bind.
   */
  async start(): Promise<string> {
    const secure = Boolean(this.config.tlsPfxPath);
    this.server = secure ? createHttpsServer({ pfx: readFileSync(this.config.tlsPfxPath!), passphrase: this.config.tlsPfxPassphrase }) : createHttpServer();
    this.sockets = new WebSocketServer({ server: this.server, maxPayload: 4096, verifyClient: ({ origin }, done) => done(this.config.allowedOrigins.includes(origin), 403, "Origin not allowed") });
    this.sockets.on("connection", (socket, request) => {
      const origin = request.headers.origin ?? "";
      const token = new URL(request.url ?? "/", "http://localhost").searchParams.get("token");
      const paired = this.verify(token);
      if (paired) this.authenticated.add(socket);
      this.send(socket, { type: "manager.hello", protocolVersion: PROTOCOL_VERSION, managerVersion: this.version, paired, capabilities: [ACCESS_CAPTURE_CAPABILITY] });
      if (paired) { this.send(socket, this.latestStatus); this.flushErrors(socket); }
      socket.on("message", (raw) => void this.onMessage(socket, origin, raw.toString()));
      socket.on("close", () => this.releaseAccessCapture(socket));
    });
    await new Promise<void>((resolve, reject) => { this.server!.once("error", reject); this.server!.listen(this.config.websocketPort, "127.0.0.1", resolve); });
    return `${secure ? "wss" : "ws"}://localhost:${this.config.websocketPort}`;
  }

  /**
   * Delivers a device event to paired Web clients, withholding credential barcodes from generic delivery.
   *
   * @param event - Event emitted by the local device subsystem.
   * @returns Nothing.
   */
  broadcast(event: ManagerEvent): void {
    if (event.type === "device.status") this.latestStatus = event;
    if (event.type === "barcode.scanned" && event.barcode.startsWith(BADGE_BARCODE_PREFIX)) return this.deliverCredentialBarcode(event);
    let delivered = false;
    this.sockets?.clients.forEach((socket) => {
      if (socket.readyState === WebSocket.OPEN && this.authenticated.has(socket)) { this.send(socket, event); delivered = true; }
    });
    if (event.type === "manager.error" && !delivered) this.pendingErrors = [...this.pendingErrors.slice(-49), event];
  }

  /**
   * Stops the loopback listener and releases every connected capture lease.
   *
   * @returns A promise that resolves after open sockets and the HTTP server have closed.
   */
  async stop(): Promise<void> {
    this.accessCapture = null;
    this.sockets?.clients.forEach((socket) => socket.close(1001, "Manager stopping"));
    await new Promise<void>((resolve) => this.sockets?.close(() => resolve()) ?? resolve());
    await new Promise<void>((resolve) => this.server?.close(() => resolve()) ?? resolve());
  }

  private async onMessage(socket: WebSocket, origin: string, raw: string): Promise<void> {
    try {
      const message = parseClientMessage(JSON.parse(raw) as unknown);
      if (!message) return socket.close(1003, "Invalid message");
      if (message.protocolVersion !== PROTOCOL_VERSION) return this.send(socket, { type: "manager.error", code: "PROTOCOL_MISMATCH", message: "Actualiza Kontave o Kontave Device Manager." });
      if (message.type === "client.hello") return;
      if (message.type === "pairing.request") return this.handlePairing(socket, origin, message.clientName);
      if (!this.authenticated.has(socket)) return socket.close(1008, "Pairing required");
      if (message.type === "barcode.access-capture.request") return this.requestAccessCapture(socket);
      if (message.type === "barcode.access-capture.heartbeat") return this.renewAccessCapture(socket, message.leaseId);
      this.releaseAccessCapture(socket, message.leaseId);
    } catch { socket.close(1003, "Invalid JSON"); }
  }

  private async handlePairing(socket: WebSocket, origin: string, clientName: string): Promise<void> {
    const approved = await this.approve({ clientName, origin });
    if (!approved) return this.send(socket, { type: "pairing.result", approved: false, message: "Solicitud rechazada" });
    const token = `${randomUUID()}.${randomBytes(24).toString("base64url")}`;
    this.config.pairingTokenHash = this.hash(token);
    saveConfig(this.config);
    this.authenticated.add(socket);
    this.send(socket, { type: "pairing.result", approved: true, token });
    this.send(socket, this.latestStatus);
    this.flushErrors(socket);
  }

  private requestAccessCapture(socket: WebSocket): void {
    this.clearExpiredAccessCapture();
    if (this.accessCapture && this.accessCapture.socket !== socket) return this.send(socket, { type: "barcode.access-capture.denied", reason: "CAPTURE_IN_USE" });
    if (!this.accessCapture) this.accessCapture = { socket, leaseId: randomUUID(), expiresAt: Date.now() + ACCESS_CAPTURE_LEASE_MS };
    this.renewAccessCapture(socket, this.accessCapture.leaseId);
  }

  private renewAccessCapture(socket: WebSocket, leaseId: string): void {
    this.clearExpiredAccessCapture();
    if (!this.accessCapture || this.accessCapture.socket !== socket || this.accessCapture.leaseId !== leaseId) return;
    this.accessCapture.expiresAt = Date.now() + ACCESS_CAPTURE_LEASE_MS;
    this.send(socket, { type: "barcode.access-capture.granted", leaseId, expiresAt: new Date(this.accessCapture.expiresAt).toISOString() });
  }

  private releaseAccessCapture(socket: WebSocket, leaseId?: string): void {
    if (this.accessCapture?.socket === socket && (leaseId === undefined || this.accessCapture.leaseId === leaseId)) this.accessCapture = null;
  }

  private clearExpiredAccessCapture(): void { if (this.accessCapture && this.accessCapture.expiresAt <= Date.now()) this.accessCapture = null; }

  private deliverCredentialBarcode(event: Extract<ManagerEvent, { type: "barcode.scanned" }>): void {
    this.clearExpiredAccessCapture();
    const lease = this.accessCapture;
    if (!lease || lease.socket.readyState !== WebSocket.OPEN || !this.authenticated.has(lease.socket)) return;
    this.send(lease.socket, { ...event, type: "barcode.access-capture.scanned", leaseId: lease.leaseId });
  }

  private verify(token: string | null): boolean {
    if (!token || !this.config.pairingTokenHash) return false;
    const receivedHash = Buffer.from(this.hash(token)); const storedHash = Buffer.from(this.config.pairingTokenHash);
    return receivedHash.length === storedHash.length && timingSafeEqual(receivedHash, storedHash);
  }
  private hash(token: string): string { return createHash("sha256").update(token).digest("hex"); }
  private flushErrors(socket: WebSocket): void { const errors = this.pendingErrors; this.pendingErrors = []; errors.forEach((event) => this.send(socket, event)); }
  private send(socket: WebSocket, event: ManagerEvent): void { socket.send(JSON.stringify(event)); }
}
