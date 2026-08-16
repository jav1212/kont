import { contextBridge, ipcRenderer } from "electron";
import type { DeviceEvent } from "@kontave/device-contracts";
import type { ClientUpdateSnapshot } from "@kontave/client-updates-contracts";
import type { ConnectivitySnapshot } from "@kontave/client-connectivity-contracts";
import { DESKTOP_IPC, type DesktopBillingPlanState, type DesktopCurrentUserState, type DesktopPlatformStatusState, type DesktopWorkspaceState, type KontaveDesktopApi } from "../shared/desktop-api";

const api: KontaveDesktopApi = {
  auth: {
    getState: () => ipcRenderer.invoke(DESKTOP_IPC.getAuthState),
    signIn: (command) => ipcRenderer.invoke(DESKTOP_IPC.signIn, command),
    register: (command) => ipcRenderer.invoke(DESKTOP_IPC.register, command),
    verifyRegistration: (command) => ipcRenderer.invoke(DESKTOP_IPC.verifyRegistration, command),
    resendRegistration: (command) => ipcRenderer.invoke(DESKTOP_IPC.resendRegistration, command),
    requestPasswordRecovery: (command) => ipcRenderer.invoke(DESKTOP_IPC.requestPasswordRecovery, command),
    verifyPasswordRecovery: (command) => ipcRenderer.invoke(DESKTOP_IPC.verifyPasswordRecovery, command),
    completePasswordRecovery: (command) => ipcRenderer.invoke(DESKTOP_IPC.completePasswordRecovery, command),
    signOut: () => ipcRenderer.invoke(DESKTOP_IPC.signOut),
    subscribe(listener) {
      const handler = (_event: Electron.IpcRendererEvent, payload: Parameters<typeof listener>[0]) => listener(payload);
      ipcRenderer.on(DESKTOP_IPC.authStateChanged, handler);
      return () => ipcRenderer.off(DESKTOP_IPC.authStateChanged, handler);
    },
  },
  devices: {
    connect: () => ipcRenderer.invoke(DESKTOP_IPC.connectDevice),
    disconnect: () => ipcRenderer.invoke(DESKTOP_IPC.disconnectDevice),
    getStatus: () => ipcRenderer.invoke(DESKTOP_IPC.getDeviceStatus),
    subscribe(listener) {
      const handler = (_event: Electron.IpcRendererEvent, payload: DeviceEvent) => listener(payload);
      ipcRenderer.on(DESKTOP_IPC.deviceEvent, handler);
      return () => ipcRenderer.off(DESKTOP_IPC.deviceEvent, handler);
    },
  },
  updates: {
    getState: () => ipcRenderer.invoke(DESKTOP_IPC.getUpdateState),
    check: () => ipcRenderer.invoke(DESKTOP_IPC.checkForUpdate),
    download: () => ipcRenderer.invoke(DESKTOP_IPC.downloadUpdate),
    apply: () => ipcRenderer.invoke(DESKTOP_IPC.applyUpdate),
    subscribe(listener) {
      const handler = (_event: Electron.IpcRendererEvent, payload: ClientUpdateSnapshot) => listener(payload);
      ipcRenderer.on(DESKTOP_IPC.updateStateChanged, handler);
      return () => ipcRenderer.off(DESKTOP_IPC.updateStateChanged, handler);
    },
  },
  workspace: {
    getState: () => ipcRenderer.invoke(DESKTOP_IPC.getWorkspaceState),
    refresh: () => ipcRenderer.invoke(DESKTOP_IPC.refreshWorkspace),
    select: (workspaceId) => ipcRenderer.invoke(DESKTOP_IPC.selectWorkspace, workspaceId),
    selectModule: (moduleId) => ipcRenderer.invoke(DESKTOP_IPC.selectWorkspaceModule, moduleId),
    selectCompany: (companyId) => ipcRenderer.invoke(DESKTOP_IPC.selectWorkspaceCompany, companyId),
    subscribe(listener) {
      const handler = (_event: Electron.IpcRendererEvent, payload: DesktopWorkspaceState) => listener(payload);
      ipcRenderer.on(DESKTOP_IPC.workspaceStateChanged, handler);
      return () => ipcRenderer.off(DESKTOP_IPC.workspaceStateChanged, handler);
    },
  },
  profile: {
    getCurrent: () => ipcRenderer.invoke(DESKTOP_IPC.getCurrentUser),
    subscribe(listener) {
      const handler = (_event: Electron.IpcRendererEvent, payload: DesktopCurrentUserState) => listener(payload);
      ipcRenderer.on(DESKTOP_IPC.currentUserChanged, handler);
      return () => ipcRenderer.off(DESKTOP_IPC.currentUserChanged, handler);
    },
  },
  billing: {
    getPlan: () => ipcRenderer.invoke(DESKTOP_IPC.getBillingPlan),
    subscribe(listener) {
      const handler = (_event: Electron.IpcRendererEvent, payload: DesktopBillingPlanState) => listener(payload);
      ipcRenderer.on(DESKTOP_IPC.billingPlanChanged, handler);
      return () => ipcRenderer.off(DESKTOP_IPC.billingPlanChanged, handler);
    },
  },
  platformStatus: {
    getCurrent: () => ipcRenderer.invoke(DESKTOP_IPC.getPlatformStatus),
    subscribe(listener) {
      const handler = (_event: Electron.IpcRendererEvent, payload: DesktopPlatformStatusState) => listener(payload);
      ipcRenderer.on(DESKTOP_IPC.platformStatusChanged, handler);
      return () => ipcRenderer.off(DESKTOP_IPC.platformStatusChanged, handler);
    },
  },
  navigation: {
    openExternal: (destination) => ipcRenderer.invoke(DESKTOP_IPC.openExternalDestination, destination),
  },
  connectivity: {
    getSnapshot: () => ipcRenderer.invoke(DESKTOP_IPC.getConnectivitySnapshot),
    refresh: () => ipcRenderer.invoke(DESKTOP_IPC.refreshConnectivity),
    subscribe(listener) {
      const handler = (_event: Electron.IpcRendererEvent, payload: ConnectivitySnapshot) => listener(payload);
      ipcRenderer.on(DESKTOP_IPC.connectivityChanged, handler);
      return () => ipcRenderer.off(DESKTOP_IPC.connectivityChanged, handler);
    },
  },
  settings: {
    getSnapshot: (organizationId, companyId) => ipcRenderer.invoke(DESKTOP_IPC.getSettingsSnapshot, organizationId, companyId),
    updateProfile: (command) => ipcRenderer.invoke(DESKTOP_IPC.updateSettingsProfile, command),
    updatePreferences: (command) => ipcRenderer.invoke(DESKTOP_IPC.updateSettingsPreferences, command),
    updateOrganization: (organizationId, command) => ipcRenderer.invoke(DESKTOP_IPC.updateSettingsOrganization, organizationId, command),
    changePassword: (newPassword, revokeOtherSessions) => ipcRenderer.invoke(DESKTOP_IPC.changeSettingsPassword, newPassword, revokeOtherSessions),
    revokeSession: (sessionId) => ipcRenderer.invoke(DESKTOP_IPC.revokeSettingsSession, sessionId),
    revokeOtherSessions: () => ipcRenderer.invoke(DESKTOP_IPC.revokeOtherSettingsSessions),
  },
  inventory: {
    getDashboard: (userId, organizationId, companyId, query) => ipcRenderer.invoke(
      DESKTOP_IPC.getInventoryDashboard,
      userId,
      organizationId,
      companyId,
      query,
    ),
    entries:(organizationId,companyId,query)=>ipcRenderer.invoke(DESKTOP_IPC.listInventoryEntries,organizationId,companyId,query),
    outputs:(organizationId,companyId,query)=>ipcRenderer.invoke(DESKTOP_IPC.listInventoryOutputs,organizationId,companyId,query),
    operations:(organizationId,companyId,query)=>ipcRenderer.invoke(DESKTOP_IPC.listInventoryOperations,organizationId,companyId,query),
    operation:(organizationId,companyId,operationId)=>ipcRenderer.invoke(DESKTOP_IPC.getInventoryOperation,organizationId,companyId,operationId),
    createOperation:(organizationId,companyId,command)=>ipcRenderer.invoke(DESKTOP_IPC.createInventoryOperation,organizationId,companyId,command),
    updateOperation:(organizationId,companyId,operationId,command)=>ipcRenderer.invoke(DESKTOP_IPC.updateInventoryOperation,organizationId,companyId,operationId,command),
    postOperation:(organizationId,companyId,operationId,expectedVersion)=>ipcRenderer.invoke(DESKTOP_IPC.postInventoryOperation,organizationId,companyId,operationId,expectedVersion),
    reverseOperation:(organizationId,companyId,operationId,command)=>ipcRenderer.invoke(DESKTOP_IPC.reverseInventoryOperation,organizationId,companyId,operationId,command),
  },
  sales:{getDashboard:(userId,organizationId,companyId,query)=>ipcRenderer.invoke(DESKTOP_IPC.getSalesDashboard,userId,organizationId,companyId,query)},
  purchasing:{getDashboard:(userId,organizationId,companyId,query)=>ipcRenderer.invoke(DESKTOP_IPC.getPurchasingDashboard,userId,organizationId,companyId,query)},
  products: {
    permissions: (organizationId) => ipcRenderer.invoke(DESKTOP_IPC.getProductPermissions, organizationId),
    list: (organizationId, companyId, query) => ipcRenderer.invoke(DESKTOP_IPC.listProducts, organizationId, companyId, query),
    get: (organizationId, companyId, productId) => ipcRenderer.invoke(DESKTOP_IPC.getProduct, organizationId, companyId, productId),
    create: (organizationId, companyId, command) => ipcRenderer.invoke(DESKTOP_IPC.createProduct, organizationId, companyId, command),
    update: (organizationId, companyId, productId, command) => ipcRenderer.invoke(DESKTOP_IPC.updateProduct, organizationId, companyId, productId, command),
    setStatus: (organizationId, companyId, productId, active, expectedVersion) => ipcRenderer.invoke(DESKTOP_IPC.setProductStatus, organizationId, companyId, productId, active, expectedVersion),
    movements: (organizationId, companyId, productId, query) => ipcRenderer.invoke(DESKTOP_IPC.listProductMovements, organizationId, companyId, productId, query),
    updateInventoryProfile: (organizationId, companyId, productId, command) => ipcRenderer.invoke(DESKTOP_IPC.updateProductInventoryProfile, organizationId, companyId, productId, command),
    categories: (organizationId, companyId, status) => ipcRenderer.invoke(DESKTOP_IPC.listProductCategories, organizationId, companyId, status),
    createCategory: (organizationId, companyId, command) => ipcRenderer.invoke(DESKTOP_IPC.createProductCategory, organizationId, companyId, command),
    updateCategory: (organizationId, companyId, categoryId, command) => ipcRenderer.invoke(DESKTOP_IPC.updateProductCategory, organizationId, companyId, categoryId, command),
    setCategoryStatus: (organizationId, companyId, categoryId, active, expectedVersion) => ipcRenderer.invoke(DESKTOP_IPC.setProductCategoryStatus, organizationId, companyId, categoryId, active, expectedVersion),
    getCategory: (organizationId, companyId, categoryId) => ipcRenderer.invoke(DESKTOP_IPC.getProductCategory, organizationId, companyId, categoryId),
    categoryOverview: (organizationId, companyId, query) => ipcRenderer.invoke(DESKTOP_IPC.listProductCategoryOverview, organizationId, companyId, query),
    unitEconomics: (organizationId, companyId, productId, query) => ipcRenderer.invoke(DESKTOP_IPC.getProductUnitEconomics, organizationId, companyId, productId, query),
    updateSalePricing: (organizationId, companyId, productId, command) => ipcRenderer.invoke(DESKTOP_IPC.updateProductSalePricing, organizationId, companyId, productId, command),
    updateTaxation: (organizationId, companyId, productId, command) => ipcRenderer.invoke(DESKTOP_IPC.updateProductTaxation, organizationId, companyId, productId, command),
  },
};

contextBridge.exposeInMainWorld("kontave", api);
