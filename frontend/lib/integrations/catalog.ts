import type { LucideIcon } from "lucide-react";
import {
  Bell,
  Bot,
  Calculator,
  MessageSquare,
  ShieldCheck,
  Smartphone,
} from "lucide-react";
import {
  isPlaceholderCredential,
  isBooleanIntegrationSetting,
} from "@/lib/integrations/fieldLabels";

export type IntegrationCategoryId = "accounting" | "communication" | "ai" | "security";

export type IntegrationStatus = "connected" | "action_needed" | "disabled" | "not_configured";

export type FieldGroup = {
  id: string;
  title: string;
  description?: string;
  /** When true, group starts collapsed unless preferred/required. */
  collapsible?: boolean;
  keys: string[];
};

export type IntegrationProduct = {
  id: string;
  category: IntegrationCategoryId;
  name: string;
  summary: string;
  icon: LucideIcon;
  /** Setting key that enables this product, if any. */
  enabledKey?: string;
  /** Keys that must be non-empty for "connected". */
  requiredCredentialKeys: string[];
  /** Any of these sets counts as credentials present. */
  credentialKeyGroups?: string[][];
  fieldGroups: FieldGroup[];
  docsHint?: string;
  externalHref?: string;
  externalLabel?: string;
  /** Special-case render path (QBO already has its own UI). */
  custom?: "quickbooks";
};

export const INTEGRATION_CATEGORIES: Array<{
  id: IntegrationCategoryId;
  label: string;
  description: string;
  icon: LucideIcon;
}> = [
  {
    id: "accounting",
    label: "Accounting",
    description: "Books, sync, and financial systems",
    icon: Calculator,
  },
  {
    id: "communication",
    label: "Communication",
    description: "SMS and push delivery channels",
    icon: MessageSquare,
  },
  {
    id: "ai",
    label: "AI",
    description: "Gemini-powered workshop intelligence",
    icon: Bot,
  },
  {
    id: "security",
    label: "Security",
    description: "Bot protection for public forms",
    icon: ShieldCheck,
  },
];

export const INTEGRATION_PRODUCTS: IntegrationProduct[] = [
  {
    id: "quickbooks",
    category: "accounting",
    name: "QuickBooks Online",
    summary: "Sync invoices, payments, bills, and the chart of accounts.",
    icon: Calculator,
    requiredCredentialKeys: [],
    fieldGroups: [],
    custom: "quickbooks",
    docsHint: "Connect your Intuit company, then map accounts and run sync.",
  },
  {
    id: "sms",
    category: "communication",
    name: "SMS",
    summary: "",
    icon: Smartphone,
    enabledKey: "sms_enabled",
    requiredCredentialKeys: ["hubtel_client_id", "hubtel_client_secret"],
    credentialKeyGroups: [
      ["hubtel_client_id", "hubtel_client_secret"],
      ["twilio_account_sid", "twilio_auth_token"],
      ["infobip_base_url", "infobip_api_key", "infobip_sender_id"],
    ],
    docsHint: "Turn SMS on, pick a preferred provider, then fill that provider’s credentials.",
    fieldGroups: [
      {
        id: "control",
        title: "Delivery",
        keys: ["sms_enabled", "sms_provider"],
      },
      {
        id: "hubtel",
        title: "Hubtel credentials",
        keys: ["hubtel_client_id", "hubtel_client_secret", "hubtel_sender_id", "hubtel_api_url"],
      },
      {
        id: "twilio",
        title: "Twilio credentials",
        keys: [
          "twilio_account_sid",
          "twilio_auth_token",
          "twilio_phone_number",
          "twilio_messaging_service_sid",
        ],
      },
      {
        id: "infobip",
        title: "Infobip credentials",
        keys: [
          "infobip_base_url",
          "infobip_api_key",
          "infobip_sender_id",
          "infobip_webhook_username",
          "infobip_webhook_password",
        ],
      },
    ],
  },
  {
    id: "firebase",
    category: "communication",
    name: "Firebase Push",
    summary: "Browser and mobile push notifications via FCM.",
    icon: Bell,
    enabledKey: "firebase_enabled",
    requiredCredentialKeys: ["firebase_project_id", "firebase_credentials_path"],
    docsHint: "Enable push, then point the server at your Firebase service-account JSON.",
    fieldGroups: [
      {
        id: "control",
        title: "Push delivery",
        keys: ["firebase_enabled"],
      },
      {
        id: "credentials",
        title: "Firebase project",
        keys: [
          "firebase_api_key",
          "firebase_project_id",
          "firebase_messaging_sender_id",
          "firebase_app_id",
          "firebase_credentials_path",
        ],
      },
    ],
  },
  {
    id: "gemini",
    category: "ai",
    name: "Google Gemini",
    summary: "",
    icon: Bot,
    enabledKey: "ai_enabled",
    requiredCredentialKeys: ["ai_gemini_api_key"],
    docsHint: "Paste your Gemini API key, pick a model, then enable the features you want.",
    fieldGroups: [
      {
        id: "credentials",
        title: "API credentials",
        keys: ["ai_gemini_api_key", "ai_gemini_model"],
      },
      {
        id: "workshop",
        title: "Workshop features",
        keys: ["ai_comms_enabled", "ai_inspection_enabled"],
      },
      {
        id: "operations",
        title: "Operations features",
        keys: [
          "ai_ops_briefing_enabled",
          "ai_ops_exception_triage_enabled",
          "ai_ops_return_jobs_enabled",
          "ai_ops_capacity_enabled",
          "ai_ops_ap_cycle_enabled",
          "ai_ops_traceability_enabled",
          "ai_ops_bottleneck_enabled",
          "ai_ops_exception_draft_enabled",
        ],
      },
    ],
  },
  {
    id: "recaptcha",
    category: "security",
    name: "Google reCAPTCHA",
    summary: "Stop bots on login, feedback, and other public forms.",
    icon: ShieldCheck,
    enabledKey: "recaptcha_enabled",
    requiredCredentialKeys: ["recaptcha_site_key", "recaptcha_secret_key"],
    docsHint: "Create a reCAPTCHA key pair in Google Cloud, then paste both keys here.",
    fieldGroups: [
      {
        id: "control",
        title: "Protection",
        keys: ["recaptcha_enabled"],
      },
      {
        id: "credentials",
        title: "Keys",
        keys: ["recaptcha_site_key", "recaptcha_secret_key"],
      },
    ],
  },
];

export function productsForCategory(category: IntegrationCategoryId): IntegrationProduct[] {
  return INTEGRATION_PRODUCTS.filter((p) => p.category === category);
}

export function getProduct(id: string | null | undefined): IntegrationProduct | undefined {
  if (!id) return undefined;
  return INTEGRATION_PRODUCTS.find((p) => p.id === id);
}

function isTruthy(value?: string | null): boolean {
  return ["true", "1", "yes", "on"].includes((value || "").toLowerCase().trim());
}

function valueMap(
  settings: Array<{ key: string; value?: string | null }>
): Record<string, string> {
  return Object.fromEntries(settings.map((s) => [s.key, s.value ?? ""]));
}

function groupHasCredentials(
  values: Record<string, string>,
  keys: string[]
): boolean {
  // Require all keys in the group (typical client_id + secret pairs).
  return keys.length > 0 && keys.every((key) => !isPlaceholderCredential(values[key]));
}

export function resolveIntegrationStatus(
  product: IntegrationProduct,
  settings: Array<{ key: string; value?: string | null }>
): { status: IntegrationStatus; label: string; detail: string } {
  if (product.custom === "quickbooks") {
    return {
      status: "not_configured",
      label: "Manage",
      detail: "Open setup to connect or review sync health.",
    };
  }

  const values = valueMap(settings);
  const enabled = product.enabledKey ? isTruthy(values[product.enabledKey]) : null;

  const credentialGroups =
    product.credentialKeyGroups?.length
      ? product.credentialKeyGroups
      : product.requiredCredentialKeys.length
        ? [product.requiredCredentialKeys]
        : [];

  const hasCredentials =
    credentialGroups.length === 0
      ? true
      : credentialGroups.some((group) => groupHasCredentials(values, group));

  if (enabled === false) {
    return {
      status: "disabled",
      label: "Off",
      detail: "Integration is turned off.",
    };
  }

  if (!hasCredentials) {
    if (enabled === true) {
      return {
        status: "action_needed",
        label: "Needs setup",
        detail: "Enabled, but required credentials are missing.",
      };
    }
    return {
      status: "not_configured",
      label: "Not set up",
      detail: "Add credentials to start using this integration.",
    };
  }

  if (enabled === true || enabled === null) {
    return {
      status: "connected",
      label: enabled === true ? "On" : "Configured",
      detail:
        enabled === true
          ? "Enabled with credentials on file."
          : "Credentials on file.",
    };
  }

  return {
    status: "action_needed",
    label: "Needs setup",
    detail: "Finish configuration to go live.",
  };
}

export function settingsForProduct<T extends { key: string }>(
  product: IntegrationProduct,
  settings: T[]
): T[] {
  const keys = new Set(product.fieldGroups.flatMap((g) => g.keys));
  if (product.enabledKey) keys.add(product.enabledKey);
  return settings.filter((s) => keys.has(s.key));
}

export function shouldExpandFieldGroup(
  product: IntegrationProduct,
  group: FieldGroup,
  settings: Array<{ key: string; value?: string | null }>
): boolean {
  if (!group.collapsible) return true;
  const values = valueMap(settings);
  const preferred = (values.sms_provider || "hubtel").toLowerCase();

  if (product.id === "sms") {
    if (group.id === "hubtel") {
      return (
        preferred === "hubtel" ||
        group.keys.some((key) => !isPlaceholderCredential(values[key]))
      );
    }
    if (group.id === "twilio") {
      return (
        preferred === "twilio" ||
        group.keys.some((key) => !isPlaceholderCredential(values[key]))
      );
    }
    if (group.id === "infobip") {
      return (
        preferred === "infobip" ||
        group.keys.some((key) => !isPlaceholderCredential(values[key]))
      );
    }
  }

  // Expand collapsible groups that already have values.
  return group.keys.some(
    (key) => !isBooleanIntegrationSetting(key) && !isPlaceholderCredential(values[key])
  );
}
