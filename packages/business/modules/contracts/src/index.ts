export interface ModuleDefinitionDto {
  readonly id: string;
  readonly code: string;
  readonly name: string;
  readonly status: string;
  readonly capabilities: readonly string[];
  readonly dependencies: readonly string[];
  readonly supportedPlatforms: readonly string[];
}
export interface ModuleInstallationDto {
  readonly id: string;
  readonly organizationId: string;
  readonly moduleId: string;
  readonly moduleCode: string;
  readonly status: string;
  readonly configurationVersion: number;
  readonly installedAt: string;
  readonly activatedAt: string | null;
  readonly suspendedAt: string | null;
}
export interface AvailableOrganizationModuleDto {
  readonly id: string;
  readonly code: string;
  readonly name: string;
}
