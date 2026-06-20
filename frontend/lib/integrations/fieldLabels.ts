/** Short labels for integration settings (group header carries provider name). */

const FIELD_LABELS: Record<string, string> = {
  sms_enabled: "Enabled",
  sms_provider: "Provider",
  sms_signature: "Signature",
  sms_test_number: "Test number",
  hubtel_client_id: "Client ID",
  hubtel_client_secret: "Client secret",
  hubtel_sender_id: "Sender ID",
  hubtel_api_url: "API URL",
  firebase_enabled: "Enabled",
  firebase_api_key: "API key",
  firebase_project_id: "Project ID",
  firebase_messaging_sender_id: "Messaging sender ID",
  firebase_app_id: "App ID",
  firebase_credentials_path: "Credentials path",
  recaptcha_enabled: "Enabled",
  recaptcha_site_key: "Site key",
  recaptcha_secret_key: "Secret key",
  quickbooks_client_id: "Client ID",
  quickbooks_client_secret: "Client secret",
  quickbooks_sandbox_enabled: "Sandbox mode",
  quickbooks_webhook_token: "Webhook verifier token",
};

function humanizeKey(key: string): string {
  return key.replace(/_/g, " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
}

export function fieldPrefixForKey(key: string): string {
  const prefixes = ["hubtel_", "sms_", "firebase_", "recaptcha_", "quickbooks_"];
  return prefixes.find((p) => key.startsWith(p)) ?? "";
}

export function integrationFieldLabel(key: string, groupPrefix = ""): string {
  if (FIELD_LABELS[key]) {
    return FIELD_LABELS[key];
  }
  const prefix = groupPrefix || fieldPrefixForKey(key);
  const stripped =
    prefix && key.startsWith(prefix) ? key.slice(prefix.length) : key;
  return humanizeKey(stripped);
}

export function isHubtelSmsSetting(setting: { key: string; category?: string }): boolean {
  return (
    setting.category === "sms" ||
    setting.key.startsWith("hubtel_") ||
    setting.key.startsWith("sms_")
  );
}

const HUBTEL_SMS_ORDER = [
  "sms_enabled",
  "sms_provider",
  "hubtel_client_id",
  "hubtel_client_secret",
  "hubtel_sender_id",
  "hubtel_api_url",
  "sms_signature",
  "sms_test_number",
];

export function sortHubtelSmsSettings<T extends { key: string }>(settings: T[]): T[] {
  return [...settings].sort((a, b) => {
    const ai = HUBTEL_SMS_ORDER.indexOf(a.key);
    const bi = HUBTEL_SMS_ORDER.indexOf(b.key);
    const aRank = ai === -1 ? 999 : ai;
    const bRank = bi === -1 ? 999 : bi;
    if (aRank !== bRank) return aRank - bRank;
    return a.key.localeCompare(b.key);
  });
}
