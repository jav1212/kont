import { DevicesSettingsClient } from "./devices-settings-client";

export default function DevicesSettingsPage() {
    const downloadUrl = process.env.NEXT_PUBLIC_DEVICE_MANAGER_DOWNLOAD_URL
        ?? "https://github.com/jav1212/kontave-devices-manager/releases/latest/download/Kontave-Device-Manager-Setup.exe";
    return <DevicesSettingsClient downloadUrl={downloadUrl} />;
}
