import { OrganizationSettings } from "@/src/modules/organizations/frontend/components/organization-settings";

/**
 * Presents the selected organization's identity and its companies, members, and roles.
 *
 * @returns Organization settings within the authenticated workspace.
 */
export default function OrganizationSettingsPage() {
    return <OrganizationSettings />;
}
