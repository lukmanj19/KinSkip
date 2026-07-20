import { SettingsPanel } from "@/components/settings-panel";

/** Standalone /settings page — same content as the overlay Sheet in Layout. */
export default function Settings() {
  return (
    <div className="max-w-2xl mx-auto space-y-8">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Settings</h1>
        <p className="text-muted-foreground mt-1">Manage your account and security preferences.</p>
      </div>
      <SettingsPanel />
    </div>
  );
}
