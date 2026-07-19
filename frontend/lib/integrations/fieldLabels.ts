/** Short labels and helpers for integration settings. */

const FIELD_LABELS: Record<string, string> = {
  sms_enabled: "SMS enabled",
  sms_provider: "Preferred provider",
  sms_signature: "Signature",
  sms_test_number: "Test number",
  hubtel_client_id: "Client ID",
  hubtel_client_secret: "Client secret",
  hubtel_sender_id: "Sender ID",
  hubtel_api_url: "API URL",
  twilio_account_sid: "Account SID",
  twilio_auth_token: "Auth token",
  twilio_phone_number: "Phone number",
  twilio_messaging_service_sid: "Messaging service SID",
  infobip_base_url: "Base URL",
  infobip_api_key: "API key",
  infobip_sender_id: "Sender ID",
  infobip_webhook_username: "Webhook username",
  infobip_webhook_password: "Webhook password",
  firebase_enabled: "Push enabled",
  firebase_api_key: "API key",
  firebase_project_id: "Project ID",
  firebase_messaging_sender_id: "Messaging sender ID",
  firebase_app_id: "App ID",
  firebase_credentials_path: "Credentials path",
  recaptcha_enabled: "reCAPTCHA enabled",
  recaptcha_site_key: "Site key",
  recaptcha_secret_key: "Secret key",
  quickbooks_client_id: "Client ID",
  quickbooks_client_secret: "Client secret",
  quickbooks_sandbox_enabled: "Sandbox mode",
  quickbooks_webhook_token: "Webhook verifier token",
  ai_enabled: "AI master switch",
  ai_gemini_api_key: "API key",
  ai_gemini_model: "Gemini model",
  ai_comms_enabled: "Customer comms suggestions",
  ai_inspection_enabled: "Inspection summaries",
  ai_ops_briefing_enabled: "Daily ops briefing",
  ai_ops_exception_triage_enabled: "Exception triage",
  ai_ops_return_jobs_enabled: "Return job analysis",
  ai_ops_capacity_enabled: "Capacity narratives",
  ai_ops_ap_cycle_enabled: "AP cycle narratives",
  ai_ops_traceability_enabled: "Traceability Q&A",
  ai_ops_bottleneck_enabled: "Workflow bottleneck analysis",
  ai_ops_exception_draft_enabled: "Proactive exception drafts",
};

const FIELD_HINTS: Record<string, string> = {
  sms_enabled: "Master switch for outbound SMS. Provider credentials below must also be set.",
  sms_provider: "Tried first when sending SMS. Other configured providers are used as fallbacks.",
  sms_signature: "Optional text appended to outbound SMS where supported.",
  sms_test_number: "Default Ghana mobile used by SMS test tools (e.g. 0244123456).",
  hubtel_client_id: "Hubtel SMSC client ID from your Hubtel dashboard.",
  hubtel_client_secret: "Hubtel SMSC client secret.",
  hubtel_sender_id: "Approved sender name shown on the recipient’s phone.",
  hubtel_api_url: "Usually https://smsc.hubtel.com/v1/messages/send",
  twilio_account_sid: "Twilio Account SID (starts with AC…). Placeholders like your-twilio-sid are ignored.",
  twilio_auth_token: "Twilio Auth Token from the Twilio console.",
  twilio_phone_number: "E.164 sender number, e.g. +233XXXXXXXXX. Required for voice calls.",
  twilio_messaging_service_sid: "Optional MG… SID. Can replace the phone number for SMS only.",
  infobip_base_url: "Your account-specific Infobip URL, including https://.",
  infobip_api_key: "API key from Infobip Developer Tools.",
  infobip_sender_id: "Approved sender name or number shown to recipients.",
  infobip_webhook_username: "HTTP Basic username configured on the Infobip delivery subscription.",
  infobip_webhook_password: "HTTP Basic password configured on the Infobip delivery subscription.",
  firebase_enabled: "Enable Firebase Cloud Messaging for mobile/web push.",
  firebase_credentials_path: "Server path to the Firebase service-account JSON file.",
  recaptcha_enabled: "Protect public forms (login, feedback) with Google reCAPTCHA.",
  recaptcha_site_key: "Public site key used by the browser.",
  recaptcha_secret_key: "Secret key used for server-side verification.",
  quickbooks_sandbox_enabled: "Use QuickBooks sandbox company instead of production.",
  ai_enabled: "Turns all Gemini features off when disabled, regardless of toggles below.",
  ai_gemini_api_key: "From Google AI Studio. Saved here; GEMINI_API_KEY in .env is used only as fallback.",
  ai_gemini_model: "Flash-Lite is cheapest; Pro is best for complex diagnosis.",
};

function humanizeKey(key: string): string {
  return key.replace(/_/g, " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
}

export function fieldPrefixForKey(key: string): string {
  const prefixes = ["hubtel_", "twilio_", "infobip_", "sms_", "firebase_", "recaptcha_", "quickbooks_", "ai_"];
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

export function integrationFieldHint(key: string, description?: string | null): string {
  if (FIELD_HINTS[key]) return FIELD_HINTS[key];
  if (description && description.trim()) return description.trim();
  return "";
}

export function isBooleanIntegrationSetting(key: string): boolean {
  return (
    key.endsWith("_enabled") ||
    key === "sms_enabled" ||
    key === "ai_enabled" ||
    key === "firebase_enabled" ||
    key === "recaptcha_enabled" ||
    key === "quickbooks_sandbox_enabled"
  );
}

export function isHubtelSmsSetting(setting: { key: string; category?: string }): boolean {
  return (
    setting.category === "sms" ||
    setting.key.startsWith("hubtel_") ||
    setting.key.startsWith("twilio_") ||
    setting.key.startsWith("infobip_") ||
    setting.key.startsWith("sms_")
  );
}

/** @deprecated Use isSmsSetting — retained for existing imports. */
export const isSmsSetting = isHubtelSmsSetting;

const AI_SETTING_ORDER = [
  "ai_enabled",
  "ai_gemini_api_key",
  "ai_gemini_model",
  "ai_comms_enabled",
  "ai_inspection_enabled",
  "ai_ops_briefing_enabled",
  "ai_ops_exception_triage_enabled",
  "ai_ops_return_jobs_enabled",
  "ai_ops_capacity_enabled",
  "ai_ops_ap_cycle_enabled",
  "ai_ops_traceability_enabled",
  "ai_ops_bottleneck_enabled",
  "ai_ops_exception_draft_enabled",
];

export function isAiSetting(key: string): boolean {
  return key.startsWith("ai_");
}

export function sortAiSettings<T extends { key: string }>(settings: T[]): T[] {
  return [...settings].sort((a, b) => {
    const ai = AI_SETTING_ORDER.indexOf(a.key);
    const bi = AI_SETTING_ORDER.indexOf(b.key);
    const aRank = ai === -1 ? 999 : ai;
    const bRank = bi === -1 ? 999 : bi;
    if (aRank !== bRank) return aRank - bRank;
    return a.key.localeCompare(b.key);
  });
}

const SMS_SETTING_ORDER = [
  "sms_enabled",
  "sms_provider",
  "hubtel_client_id",
  "hubtel_client_secret",
  "hubtel_sender_id",
  "hubtel_api_url",
  "twilio_account_sid",
  "twilio_auth_token",
  "twilio_phone_number",
  "twilio_messaging_service_sid",
  "infobip_base_url",
  "infobip_api_key",
  "infobip_sender_id",
  "infobip_webhook_username",
  "infobip_webhook_password",
  "sms_signature",
  "sms_test_number",
];

export function sortHubtelSmsSettings<T extends { key: string }>(settings: T[]): T[] {
  return [...settings].sort((a, b) => {
    const ai = SMS_SETTING_ORDER.indexOf(a.key);
    const bi = SMS_SETTING_ORDER.indexOf(b.key);
    const aRank = ai === -1 ? 999 : ai;
    const bRank = bi === -1 ? 999 : bi;
    if (aRank !== bRank) return aRank - bRank;
    return a.key.localeCompare(b.key);
  });
}

export const sortSmsSettings = sortHubtelSmsSettings;

export type IntegrationSubgroup = {
  id: string;
  title: string;
  description?: string;
  match: (key: string) => boolean;
};

export const SMS_SUBGROUPS: IntegrationSubgroup[] = [
  {
    id: "general",
    title: "General",
    description: "Master switch and which provider to try first.",
    match: (key) =>
      ["sms_enabled", "sms_provider", "sms_signature", "sms_test_number"].includes(key),
  },
  {
    id: "hubtel",
    title: "Hubtel",
    description: "Primary Ghana SMS gateway credentials.",
    match: (key) => key.startsWith("hubtel_"),
  },
  {
    id: "twilio",
    title: "Twilio",
    description: "Fallback SMS and voice. Leave blank if unused.",
    match: (key) => key.startsWith("twilio_"),
  },
  {
    id: "infobip",
    title: "Infobip",
    description: "Infobip SMS API and delivery-report credentials.",
    match: (key) => key.startsWith("infobip_"),
  },
];

export function splitSmsSubgroups<T extends { key: string }>(
  settings: T[]
): Array<{ subgroup: IntegrationSubgroup; settings: T[] }> {
  const ordered = sortHubtelSmsSettings(settings);
  return SMS_SUBGROUPS.map((subgroup) => ({
    subgroup,
    settings: ordered.filter((s) => subgroup.match(s.key)),
  })).filter((entry) => entry.settings.length > 0);
}

export function isPlaceholderCredential(value?: string | null): boolean {
  const text = (value || "").trim().toLowerCase();
  if (!text) return true;
  return (
    text.startsWith("your-") ||
    text.startsWith("your_") ||
    ["changeme", "xxx", "placeholder", "todo", "none", "null"].includes(text)
  );
}

export function settingLooksConfigured(
  settings: Array<{ key: string; value?: string | null }>,
  credentialKeys: string[]
): boolean {
  return credentialKeys.some((key) => {
    const row = settings.find((s) => s.key === key);
    return row ? !isPlaceholderCredential(row.value) : false;
  });
}
