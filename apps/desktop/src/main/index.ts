import { app, BrowserWindow, ipcMain, Menu, nativeImage, powerMonitor, shell } from "electron";
import { join } from "node:path";
import type { DeviceEvent, DeviceFailure } from "@kontave/device-contracts";
import { DeviceManager, ExponentialBackoffPolicy, type DeviceEventSink, type DeviceLogger } from "@kontave/devices-core";
import { DatalogicQw2100Adapter, NodeSerialPortProvider } from "@kontave/devices-node";
import { createSupabaseAuthenticationGateway } from "@kontave/auth-supabase";
import { AuthenticationFailure } from "@kontave/auth-domain";
import { ConnectivityMonitor } from "@kontave/client-connectivity-application";
import type { ConnectivitySnapshot } from "@kontave/client-connectivity-contracts";
import { ClientUpdateCoordinator } from "@kontave/client-updates-application";
import { createElectronClientUpdateProvider } from "@kontave/client-updates-electron";
import { WorkspaceContextCoordinator } from "@kontave/workspace-context-application/coordinator";
import { DESKTOP_IPC, type DesktopAuthResult, type DesktopDeviceStatus } from "../shared/desktop-api.js";
import { DesktopAuthController } from "./auth/desktop-auth-controller.js";
import { DesktopSecureStorage } from "./auth/desktop-secure-storage.js";
import { DesktopAuthenticatedRequest } from "./auth/desktop-authenticated-request.js";
import { FetchConnectivityProbe } from "./connectivity/fetch-connectivity-probe.js";
import { DesktopWorkspaceController } from "./workspace/desktop-workspace-controller.js";
import { DesktopWorkspacePortfolioSource } from "./workspace/desktop-workspace-portfolio-source.js";
import { DesktopWorkspaceCompanySource } from "./workspace/desktop-workspace-company-source.js";
import { DesktopWorkspaceModuleSource } from "./workspace/desktop-workspace-module-source.js";
import { DesktopWorkspaceContextStore } from "./workspace/desktop-workspace-context-store.js";
import { DesktopCurrentUserController } from "./profile/desktop-current-user-controller.js";
import { DesktopCurrentUserSource } from "./profile/desktop-current-user-source.js";
import { DesktopExternalNavigation } from "./navigation/desktop-external-navigation.js";
import { DesktopBillingPlanController } from "./billing/desktop-billing-plan-controller.js";
import { DesktopBillingPlanSource } from "./billing/desktop-billing-plan-source.js";
import { DesktopPlatformStatusController } from "./platform-status/desktop-platform-status-controller.js";
import { DesktopPlatformStatusSource } from "./platform-status/desktop-platform-status-source.js";
import { DesktopSettingsController } from "./settings/desktop-settings-controller.js";
import { DesktopInventoryDashboardController } from "./inventory/desktop-inventory-dashboard-controller.js";
import { DesktopProductsController } from "./products/desktop-products-controller.js";

let mainWindow: BrowserWindow | undefined;
let updates: ClientUpdateCoordinator | undefined;
let workspace: DesktopWorkspaceController | undefined;
let currentUser: DesktopCurrentUserController | undefined;
let externalNavigation: DesktopExternalNavigation | undefined;
let billingPlan: DesktopBillingPlanController | undefined;
let platformStatus: DesktopPlatformStatusController | undefined;
let connectivity: ConnectivityMonitor | undefined;
let settings: DesktopSettingsController | undefined;
let inventoryDashboard: DesktopInventoryDashboardController | undefined;
let products: DesktopProductsController | undefined;
let connectivityInterval: ReturnType<typeof setInterval> | undefined;
let previousConnectivityAvailability: ConnectivitySnapshot["availability"] = "unknown";
let initialization: Promise<void> | undefined;

class DesktopDeviceHost implements DeviceEventSink, DeviceLogger {
  private readonly manager = new DeviceManager({
    adapters: [
      new DatalogicQw2100Adapter(new NodeSerialPortProvider(), {
        ...(process.env.KONTAVE_SCANNER_PORT ? { serialPort: process.env.KONTAVE_SCANNER_PORT } : {}),
      }),
    ],
    events: this,
    logger: this,
  });

  async connect(): Promise<DesktopDeviceStatus> {
    await this.manager.connectFirst("barcode.scan", {
      reconnection: new ExponentialBackoffPolicy(5, 1_000, 30_000),
    });
    return this.status();
  }

  async disconnect(): Promise<DesktopDeviceStatus> {
    await this.manager.stop();
    return this.status();
  }

  status(): DesktopDeviceStatus {
    const device = this.manager.connectedDevice;
    return device === undefined
      ? { state: this.manager.state }
      : { state: this.manager.state, device };
  }

  publish(event: DeviceEvent): void {
    mainWindow?.webContents.send(DESKTOP_IPC.deviceEvent, event);
  }

  info(code: string, context?: Readonly<Record<string, unknown>>): void {
    console.info(JSON.stringify({ level: "info", code, context }));
  }

  error(failure: DeviceFailure, context?: Readonly<Record<string, unknown>>): void {
    console.error(JSON.stringify({ level: "error", failure, context }));
  }
}

const devices = new DesktopDeviceHost();
let auth: DesktopAuthController | undefined;

function registerIpc(): void {
  ipcMain.handle(DESKTOP_IPC.getAuthState, async () => {
    await initialization;
    return auth?.getState() ?? { status: "loading" };
  });
  ipcMain.handle(DESKTOP_IPC.signIn, (_event, command: unknown) => runAuthOperation(async (controller) => synchronizeWorkspace(await controller.signIn(command))));
  ipcMain.handle(DESKTOP_IPC.register, (_event, command: unknown) => runAuthOperation((controller) => controller.register(command)));
  ipcMain.handle(DESKTOP_IPC.verifyRegistration, (_event, command: unknown) => runAuthOperation(async (controller) => synchronizeWorkspace(await controller.verifyRegistration(command))));
  ipcMain.handle(DESKTOP_IPC.resendRegistration, (_event, command: unknown) => runAuthOperation((controller) => controller.resendRegistration(command)));
  ipcMain.handle(DESKTOP_IPC.requestPasswordRecovery, (_event, command: unknown) => runAuthOperation((controller) => controller.requestPasswordRecovery(command)));
  ipcMain.handle(DESKTOP_IPC.verifyPasswordRecovery, (_event, command: unknown) => runAuthOperation((controller) => controller.verifyPasswordRecovery(command)));
  ipcMain.handle(DESKTOP_IPC.completePasswordRecovery, (_event, command: unknown) => runAuthOperation(async (controller) => synchronizeWorkspace(await controller.completePasswordRecovery(command))));
  ipcMain.handle(DESKTOP_IPC.signOut, () => runAuthOperation(async (controller) => synchronizeWorkspace(await controller.signOut())));
  ipcMain.handle(DESKTOP_IPC.connectDevice, () => devices.connect());
  ipcMain.handle(DESKTOP_IPC.disconnectDevice, () => devices.disconnect());
  ipcMain.handle(DESKTOP_IPC.getDeviceStatus, () => devices.status());
  ipcMain.handle(DESKTOP_IPC.getUpdateState, () => updateCoordinator().getSnapshot());
  ipcMain.handle(DESKTOP_IPC.checkForUpdate, () => updateCoordinator().check());
  ipcMain.handle(DESKTOP_IPC.downloadUpdate, () => updateCoordinator().download());
  ipcMain.handle(DESKTOP_IPC.applyUpdate, () => updateCoordinator().apply());
  ipcMain.handle(DESKTOP_IPC.getWorkspaceState, async () => {
    await initialization;
    return workspaceController().getState();
  });
  ipcMain.handle(DESKTOP_IPC.refreshWorkspace, async () => {
    const result = await workspaceController().retry();
    if (!result.ok || result.value.status !== "ready" || auth?.getState().status !== "authenticated") return result;
    await refreshCurrentUser();
    if (auth?.getState().status !== "authenticated") return result;
    await refreshBillingPlan(result.value.activeWorkspaceId);
    if (auth?.getState().status !== "authenticated") return result;
    await refreshPlatformStatus();
    return result;
  });
  ipcMain.handle(DESKTOP_IPC.selectWorkspace, async (_event, workspaceId: unknown) => {
    const result = await workspaceController().select(workspaceId);
    if (result.ok && result.value.status === "ready") await refreshBillingPlan(result.value.activeWorkspaceId);
    return result;
  });
  ipcMain.handle(DESKTOP_IPC.selectWorkspaceModule, (_event, moduleId: unknown) => workspaceController().selectModule(moduleId));
  ipcMain.handle(DESKTOP_IPC.selectWorkspaceCompany, (_event, companyId: unknown) => workspaceController().selectCompany(companyId));
  ipcMain.handle(DESKTOP_IPC.getCurrentUser, async () => {
    await initialization;
    return currentUserController().getState();
  });
  ipcMain.handle(DESKTOP_IPC.getBillingPlan, async () => {
    await initialization;
    return billingPlanController().getState();
  });
  ipcMain.handle(DESKTOP_IPC.getPlatformStatus, async () => {
    await initialization;
    return platformStatusController().getState();
  });
  ipcMain.handle(DESKTOP_IPC.openExternalDestination, (_event, destination: unknown) => externalNavigationController().open(destination));
  ipcMain.handle(DESKTOP_IPC.getConnectivitySnapshot, () => connectivityMonitor().getSnapshot());
  ipcMain.handle(DESKTOP_IPC.refreshConnectivity, () => connectivityMonitor().refresh());
  ipcMain.handle(DESKTOP_IPC.getSettingsSnapshot, (_event, organizationId: unknown, companyId: unknown) => settingsController().getSnapshot(organizationId, companyId));
  ipcMain.handle(DESKTOP_IPC.updateSettingsProfile, async (_event, command: unknown) => {
    const result = await settingsController().updateProfile(command);
    if (result.ok) currentUserController().synchronize(result.value);
    return result;
  });
  ipcMain.handle(DESKTOP_IPC.updateSettingsPreferences, (_event, command: unknown) => settingsController().updatePreferences(command));
  ipcMain.handle(DESKTOP_IPC.updateSettingsOrganization, async (_event, organizationId: unknown, command: unknown) => {
    const result = await settingsController().updateOrganization(organizationId, command);
    if (result.ok) await workspaceController().refresh();
    return result;
  });
  ipcMain.handle(DESKTOP_IPC.changeSettingsPassword, (_event, password: unknown, revokeOthers: unknown) => settingsController().changePassword(password, revokeOthers));
  ipcMain.handle(DESKTOP_IPC.revokeSettingsSession, (_event, sessionId: unknown) => settingsController().revokeSession(sessionId));
  ipcMain.handle(DESKTOP_IPC.revokeOtherSettingsSessions, () => settingsController().revokeOtherSessions());
  ipcMain.handle(DESKTOP_IPC.getInventoryDashboard, (_event, actorId: unknown, organizationId: unknown, companyId: unknown, query: unknown) => (
    inventoryDashboardController().getDashboard(actorId, organizationId, companyId, query)
  ));
  ipcMain.handle(DESKTOP_IPC.listProducts, (_event, organizationId, companyId, query) => productsController().list(organizationId, companyId, query));
  ipcMain.handle(DESKTOP_IPC.getProductPermissions, (_event, organizationId) => productsController().permissions(organizationId));
  ipcMain.handle(DESKTOP_IPC.getProduct, (_event, organizationId, companyId, productId) => productsController().get(organizationId, companyId, productId));
  ipcMain.handle(DESKTOP_IPC.createProduct, (_event, organizationId, companyId, command) => productsController().create(organizationId, companyId, command));
  ipcMain.handle(DESKTOP_IPC.updateProduct, (_event, organizationId, companyId, productId, command) => productsController().update(organizationId, companyId, productId, command));
  ipcMain.handle(DESKTOP_IPC.setProductStatus, (_event, organizationId, companyId, productId, active, expectedVersion) => productsController().setStatus(organizationId, companyId, productId, active, expectedVersion));
  ipcMain.handle(DESKTOP_IPC.listProductMovements, (_event, organizationId, companyId, productId, query) => productsController().movements(organizationId, companyId, productId, query));
  ipcMain.handle(DESKTOP_IPC.updateProductInventoryProfile, (_event, organizationId, companyId, productId, command) => productsController().updateInventoryProfile(organizationId, companyId, productId, command));
  ipcMain.handle(DESKTOP_IPC.listProductCategories, (_event, organizationId, companyId, status) => productsController().categories(organizationId, companyId, status));
  ipcMain.handle(DESKTOP_IPC.createProductCategory, (_event, organizationId, companyId, command) => productsController().createCategory(organizationId, companyId, command));
  ipcMain.handle(DESKTOP_IPC.updateProductCategory, (_event, organizationId, companyId, categoryId, command) => productsController().updateCategory(organizationId, companyId, categoryId, command));
  ipcMain.handle(DESKTOP_IPC.setProductCategoryStatus, (_event, organizationId, companyId, categoryId, active, expectedVersion) => productsController().setCategoryStatus(organizationId, companyId, categoryId, active, expectedVersion));
  ipcMain.handle(DESKTOP_IPC.getProductCategory, (_event, organizationId, companyId, categoryId) => productsController().getCategory(organizationId, companyId, categoryId));
  ipcMain.handle(DESKTOP_IPC.listProductCategoryOverview, (_event, organizationId, companyId, query) => productsController().categoryOverview(organizationId, companyId, query));
  ipcMain.handle(DESKTOP_IPC.getProductUnitEconomics, (_event, organizationId, companyId, productId, query) => productsController().unitEconomics(organizationId, companyId, productId, query));
  ipcMain.handle(DESKTOP_IPC.updateProductSalePricing, (_event, organizationId, companyId, productId, command) => productsController().updateSalePricing(organizationId, companyId, productId, command));
  ipcMain.handle(DESKTOP_IPC.updateProductTaxation, (_event, organizationId, companyId, productId, command) => productsController().updateTaxation(organizationId, companyId, productId, command));
}

function updateCoordinator(): ClientUpdateCoordinator {
  if (!updates) throw new Error("Desktop updates are not initialized.");
  return updates;
}

function workspaceController(): DesktopWorkspaceController {
  if (!workspace) throw new Error("Desktop workspace context is not initialized.");
  return workspace;
}

function currentUserController(): DesktopCurrentUserController {
  if (!currentUser) throw new Error("Desktop current user is not initialized.");
  return currentUser;
}

function externalNavigationController(): DesktopExternalNavigation {
  if (!externalNavigation) throw new Error("Desktop external navigation is not initialized.");
  return externalNavigation;
}

function billingPlanController(): DesktopBillingPlanController {
  if (!billingPlan) throw new Error("Desktop billing plan is not initialized.");
  return billingPlan;
}

function platformStatusController(): DesktopPlatformStatusController {
  if (!platformStatus) throw new Error("Desktop platform status is not initialized.");
  return platformStatus;
}

function connectivityMonitor(): ConnectivityMonitor {
  if (!connectivity) throw new Error("Desktop connectivity is not initialized.");
  return connectivity;
}

function settingsController(): DesktopSettingsController {
  if (!settings) throw new Error("Desktop settings are not initialized.");
  return settings;
}

function inventoryDashboardController(): DesktopInventoryDashboardController {
  if (!inventoryDashboard) throw new Error("Desktop inventory dashboard is not initialized.");
  return inventoryDashboard;
}

function productsController(): DesktopProductsController {
  if (!products) throw new Error("Desktop products are not initialized.");
  return products;
}

async function synchronizeWorkspace(state: Awaited<ReturnType<DesktopAuthController["initialize"]>>) {
  if (state.status !== "authenticated") {
    await workspaceController().clear();
    currentUserController().clear();
    billingPlanController().clear();
    platformStatusController().clear();
    return state;
  }
  if (blocksRemoteOperations(connectivityMonitor().getSnapshot())) {
    workspaceController().markUnavailable();
    currentUserController().clear();
    billingPlanController().clear();
    platformStatusController().clear();
  } else {
    await initializeWorkspace();
    if (auth?.getState().status !== "authenticated") return auth?.getState() ?? state;
    await refreshCurrentUser();
    if (auth?.getState().status !== "authenticated") return auth?.getState() ?? state;
    const workspaceState = workspaceController().getState();
    await refreshBillingPlan(workspaceState.status === "ready" ? workspaceState.activeWorkspaceId : null);
    if (auth?.getState().status !== "authenticated") return auth?.getState() ?? state;
    await refreshPlatformStatus();
  }
  return state;
}

async function handleSessionExpired(): Promise<void> {
  auth?.expireSession();
  await workspaceController().clear();
  currentUserController().clear();
  billingPlanController().clear();
  platformStatusController().clear();
}

async function initializeWorkspace(): Promise<void> {
  try {
    await workspaceController().initialize();
  } catch (cause: unknown) {
    if (isSessionExpired(cause)) return;
    workspaceController().markUnavailable();
    console.error(JSON.stringify({
      level: "error",
      code: "DESKTOP_WORKSPACE_REFRESH_FAILED",
      message: cause instanceof Error ? cause.message : "Unknown workspace refresh failure",
    }));
  }
}

async function refreshWorkspace(): Promise<void> {
  try {
    await workspaceController().refresh();
  } catch (cause: unknown) {
    if (isSessionExpired(cause)) return;
    console.error(JSON.stringify({
      level: "error",
      code: "DESKTOP_WORKSPACE_REFRESH_FAILED",
      message: cause instanceof Error ? cause.message : "Unknown workspace refresh failure",
    }));
  }
}

async function refreshCurrentUser(): Promise<void> {
  try {
    await currentUserController().initialize();
  } catch (cause: unknown) {
    if (isSessionExpired(cause)) return;
    console.error(JSON.stringify({
      level: "error",
      code: "DESKTOP_CURRENT_USER_REFRESH_FAILED",
      message: cause instanceof Error ? cause.message : "Unknown current user refresh failure",
    }));
  }
}

async function refreshBillingPlan(organizationId: string | null): Promise<void> {
  try {
    await billingPlanController().initialize(organizationId);
  } catch (cause: unknown) {
    if (isSessionExpired(cause)) return;
    console.error(JSON.stringify({
      level: "error",
      code: "DESKTOP_BILLING_PLAN_REFRESH_FAILED",
      message: cause instanceof Error ? cause.message : "Unknown billing plan refresh failure",
    }));
  }
}

async function refreshPlatformStatus(): Promise<void> {
  try {
    await platformStatusController().initialize();
  } catch (cause: unknown) {
    if (isSessionExpired(cause)) return;
    console.error(JSON.stringify({
      level: "error",
      code: "DESKTOP_PLATFORM_STATUS_REFRESH_FAILED",
      message: cause instanceof Error ? cause.message : "Unknown platform status refresh failure",
    }));
  }
}

function blocksRemoteOperations(snapshot: ConnectivitySnapshot): boolean {
  return snapshot.availability === "unavailable"
    || (snapshot.availability === "unknown" && snapshot.reason !== null);
}

function isSessionExpired(cause: unknown): boolean {
  let current: unknown = cause;
  const visited = new Set<unknown>();
  while (current instanceof Error && !visited.has(current)) {
    if (current instanceof AuthenticationFailure && current.code === "SESSION_EXPIRED") return true;
    visited.add(current);
    current = current.cause;
  }
  return false;
}

function publishConnectivity(): void {
  const snapshot = connectivityMonitor().getSnapshot();
  const recovered = snapshot.availability === "available"
    && previousConnectivityAvailability !== "available"
    && previousConnectivityAvailability !== "unknown";
  previousConnectivityAvailability = snapshot.availability;
  mainWindow?.webContents.send(DESKTOP_IPC.connectivityChanged, snapshot);
  if (
    recovered
    && auth?.getState().status === "authenticated"
    && (workspaceController().getState().status === "unavailable" || currentUserController().getState().status === "unavailable")
  ) {
    void refreshWorkspace().then(async () => {
      await refreshCurrentUser();
      const workspaceState = workspaceController().getState();
      await refreshBillingPlan(workspaceState.status === "ready" ? workspaceState.activeWorkspaceId : null);
      await refreshPlatformStatus();
    });
  }
}

async function runAuthOperation<T>(operation: (controller: DesktopAuthController) => Promise<T>): Promise<DesktopAuthResult<T>> {
  if (!auth) return { ok: false, error: { code: "UNEXPECTED", message: "La autenticación todavía no está disponible." } };
  try {
    return { ok: true, value: await operation(auth) };
  } catch (cause: unknown) {
    if (cause instanceof AuthenticationFailure) {
      return { ok: false, error: { code: cause.code, message: cause.message } };
    }
    console.error(JSON.stringify({ level: "error", code: "AUTH_UNEXPECTED_FAILURE" }));
    return { ok: false, error: { code: "UNEXPECTED", message: "Ocurrió un error inesperado. Intenta nuevamente." } };
  }
}

function createWindow(): void {
  const icon = appIconPath();

  mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 960,
    minHeight: 640,
    icon,
    autoHideMenuBar: true,
    show: false,
    webPreferences: {
      preload: join(__dirname, "../preload/index.cjs"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith("https://")) void shell.openExternal(url);
    return { action: "deny" };
  });
  mainWindow.webContents.on("console-message", (details) => {
    if (details.level === "error" || details.level === "warning") {
      console.error(JSON.stringify({
        level: details.level,
        code: "DESKTOP_RENDERER_CONSOLE",
        message: details.message,
        source: details.sourceId,
        line: details.lineNumber,
      }));
    }
  });
  mainWindow.webContents.on("did-fail-load", (_event, errorCode, errorDescription, validatedURL, isMainFrame) => {
    console.error(JSON.stringify({ level: "error", code: "DESKTOP_RENDERER_LOAD_FAILED", errorCode, errorDescription, validatedURL, isMainFrame }));
  });
  mainWindow.webContents.on("preload-error", (_event, preloadPath, error) => {
    console.error(JSON.stringify({ level: "error", code: "DESKTOP_PRELOAD_FAILED", preloadPath, message: error.message }));
  });
  mainWindow.webContents.on("render-process-gone", (_event, details) => {
    console.error(JSON.stringify({ level: "error", code: "DESKTOP_RENDERER_GONE", reason: details.reason, exitCode: details.exitCode }));
  });
  mainWindow.webContents.on("will-navigate", (event) => event.preventDefault());
  mainWindow.once("ready-to-show", () => mainWindow?.show());

  if (process.env.ELECTRON_RENDERER_URL) {
    void mainWindow.loadURL(process.env.ELECTRON_RENDERER_URL);
  } else {
    void mainWindow.loadFile(join(__dirname, "../renderer/index.html"));
  }
}

function appIconPath(): string {
  return app.isPackaged
    ? join(process.resourcesPath, "kontave-app-icon.png")
    : join(app.getAppPath(), "../../packages/ui/brand-assets/src/kontave-app-icon.png");
}

function applyDesktopApplicationIcon(): void {
  if (process.platform !== "darwin" || !app.dock) return;
  const icon = nativeImage.createFromPath(appIconPath());
  if (icon.isEmpty()) {
    console.error(JSON.stringify({ level: "error", code: "DESKTOP_APP_ICON_INVALID" }));
    return;
  }
  app.dock.setIcon(icon);
}

app.whenReady().then(() => {
  applyDesktopApplicationIcon();
  const supabaseUrl = import.meta.env.NEXT_PUBLIC_SUPABASE_URL ?? import.meta.env.KONTAVE_SUPABASE_URL;
  const supabaseAnonKey = import.meta.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? import.meta.env.KONTAVE_SUPABASE_ANON_KEY;
  if (!supabaseUrl || !supabaseAnonKey) {
    throw new Error("NEXT_PUBLIC_SUPABASE_URL y NEXT_PUBLIC_SUPABASE_ANON_KEY son obligatorias para Desktop.");
  }
  const authenticationProvider = createSupabaseAuthenticationGateway(
    { url: supabaseUrl, anonKey: supabaseAnonKey },
    new DesktopSecureStorage(),
  );
  auth = new DesktopAuthController(authenticationProvider, () => mainWindow);
  const authenticatedRequest = new DesktopAuthenticatedRequest(auth.sessions);
  const apiBaseUrl = import.meta.env.KONTAVE_API_URL ?? "https://kontave.com";
  settings = new DesktopSettingsController(apiBaseUrl, authenticatedRequest);
  inventoryDashboard = new DesktopInventoryDashboardController(apiBaseUrl, authenticatedRequest);
  products = new DesktopProductsController(apiBaseUrl, authenticatedRequest);
  connectivity = new ConnectivityMonitor({
    probe: new FetchConnectivityProbe(new URL("/api/native/v1/organization-access", apiBaseUrl).toString()),
    failureThreshold: 3,
    unexpectedFailureObserver: {
      record: (cause) => console.error(JSON.stringify({
        level: "error",
        code: "DESKTOP_CONNECTIVITY_PROBE_FAILED",
        message: cause instanceof Error ? cause.message : "Unknown connectivity probe failure",
      })),
    },
  });
  workspace = new DesktopWorkspaceController(
    new WorkspaceContextCoordinator(
      new DesktopWorkspacePortfolioSource(apiBaseUrl, authenticatedRequest),
      new DesktopWorkspaceCompanySource(apiBaseUrl, authenticatedRequest),
      new DesktopWorkspaceModuleSource(apiBaseUrl, authenticatedRequest),
      new DesktopWorkspaceContextStore(),
    ),
    () => mainWindow,
  );
  currentUser = new DesktopCurrentUserController(
    new DesktopCurrentUserSource(apiBaseUrl, authenticatedRequest),
    () => mainWindow,
  );
  billingPlan = new DesktopBillingPlanController(
    new DesktopBillingPlanSource(apiBaseUrl, authenticatedRequest),
    () => mainWindow,
  );
  platformStatus = new DesktopPlatformStatusController(
    new DesktopPlatformStatusSource(apiBaseUrl, authenticatedRequest),
    () => mainWindow,
  );
  externalNavigation = new DesktopExternalNavigation(apiBaseUrl);
  auth.sessions.subscribeSessionExpired(() => { void handleSessionExpired(); });
  updates = new ClientUpdateCoordinator(createElectronClientUpdateProvider({
    enabled: app.isPackaged,
    installed: {
      product: "kontave-desktop",
      platform: process.platform,
      architecture: process.arch,
      channel: "production",
      productVersion: app.getVersion(),
      buildNumber: null,
      runtimeVersion: null,
      apiVersion: "v1",
    },
  }), undefined, {
    record: (operation, cause, code) => console.error(JSON.stringify({
      level: "error",
      code,
      operation,
      message: cause instanceof Error ? cause.message : "Unknown update failure",
    })),
  });
  updates.subscribe(() => mainWindow?.webContents.send(DESKTOP_IPC.updateStateChanged, updateCoordinator().getSnapshot()));
  connectivity.subscribe(publishConnectivity);
  Menu.setApplicationMenu(null);
  registerIpc();
  initialization = auth.initialize()
    .then(async (state) => {
      await connectivityMonitor().refresh();
      return synchronizeWorkspace(state);
    })
    .then(() => undefined);
  void initialization.catch((cause: unknown) => {
    console.error(JSON.stringify({
      level: "error",
      code: "DESKTOP_INITIALIZATION_FAILED",
      message: cause instanceof Error ? cause.message : "Unknown desktop initialization failure",
    }));
  });
  createWindow();
  connectivityInterval = setInterval(() => void connectivityMonitor().refresh(), 30_000);
  powerMonitor.on("resume", () => {
    void connectivityMonitor().refresh().then(() => {
      if (auth?.getState().status === "authenticated" && !blocksRemoteOperations(connectivityMonitor().getSnapshot())) {
        return refreshWorkspace();
      }
    });
  });
  if (app.isPackaged) setTimeout(() => void updates?.check(), 15_000);
  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});

app.on("before-quit", () => {
  if (connectivityInterval) clearInterval(connectivityInterval);
  void devices.disconnect();
});
