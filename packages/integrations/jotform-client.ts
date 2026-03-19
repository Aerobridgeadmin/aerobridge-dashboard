import "server-only";

/**
 * JotForm Client Onboarding Service
 *
 * Separate JotForm account (admin@remoteleverage.com) used for client-facing
 * onboarding documents (agreements, sign-off forms). This is intentionally
 * independent from the internal hiring JotForm (recruiters@remoteleverage.com).
 *
 * Env vars:
 *   JOTFORM_CLIENT_API_KEY          - API key for admin@remoteleverage.com
 *   JOTFORM_CLIENT_ONBOARDING_FORM_ID - Form ID for the PPP/COR agreement
 */

const JOTFORM_API_BASE = "https://api.jotform.com";
const FETCH_TIMEOUT_MS = 15_000;

function fetchWithTimeout(url: string, init?: RequestInit): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  return fetch(url, { ...init, signal: controller.signal }).finally(() =>
    clearTimeout(timer)
  );
}

function clientApiKey(): string {
  const key = process.env.JOTFORM_CLIENT_API_KEY?.trim();
  if (!key) throw new Error("JOTFORM_CLIENT_API_KEY is not configured");
  return key;
}

function onboardingFormId(): string {
  const id = process.env.JOTFORM_CLIENT_ONBOARDING_FORM_ID?.trim();
  if (!id) throw new Error("JOTFORM_CLIENT_ONBOARDING_FORM_ID is not configured");
  return id;
}

export function isClientJotFormConfigured(): boolean {
  return !!(
    process.env.JOTFORM_CLIENT_API_KEY?.trim() &&
    process.env.JOTFORM_CLIENT_ONBOARDING_FORM_ID?.trim()
  );
}

export const JotFormClientService = {
  /** Test connection to the client JotForm account */
  async testConnection(): Promise<{ success: boolean; message: string }> {
    try {
      const res = await fetchWithTimeout(
        `${JOTFORM_API_BASE}/user?apiKey=${clientApiKey()}`
      );
      if (!res.ok) return { success: false, message: "Failed to connect" };
      const data = await res.json();
      return {
        success: true,
        message: `Connected as ${data.content?.username}`,
      };
    } catch (error) {
      return {
        success: false,
        message: error instanceof Error ? error.message : "Unknown error",
      };
    }
  },

  /** Get the onboarding agreement form ID */
  getOnboardingFormId(): string {
    return onboardingFormId();
  },

  /** Get submissions for the onboarding form */
  async getFormSubmissions(limit = 1000) {
    const formId = onboardingFormId();
    const res = await fetchWithTimeout(
      `${JOTFORM_API_BASE}/form/${formId}/submissions?apiKey=${clientApiKey()}&limit=${limit}`
    );
    if (!res.ok) throw new Error("Failed to get submissions");
    const data = await res.json();
    return data.content ?? [];
  },

  /**
   * Check if a submission exists for a given email address on the onboarding form.
   * Returns the submission object if found, null otherwise.
   */
  async checkSubmissionByEmail(
    email: string
  ): Promise<Record<string, unknown> | null> {
    const submissions = await this.getFormSubmissions();
    const emailLower = email.toLowerCase().trim();
    return (
      submissions.find((s: Record<string, unknown>) => {
        const answers = s.answers as
          | Record<string, Record<string, unknown>>
          | undefined;
        if (!answers) return false;
        return Object.values(answers).some((a) => {
          if (
            typeof a.answer === "string" &&
            a.answer.toLowerCase().trim() === emailLower
          )
            return true;
          if (
            typeof a.prettyFormat === "string" &&
            a.prettyFormat.toLowerCase().trim() === emailLower
          )
            return true;
          return false;
        });
      }) ?? null
    );
  },

  /**
   * Check if a submission exists by matching company name (Official Business Name field).
   */
  async checkSubmissionByCompanyName(
    companyName: string
  ): Promise<Record<string, unknown> | null> {
    const submissions = await this.getFormSubmissions();
    const nameLower = companyName.toLowerCase().trim();
    return (
      submissions.find((s: Record<string, unknown>) => {
        const answers = s.answers as
          | Record<string, Record<string, unknown>>
          | undefined;
        if (!answers) return false;
        return Object.values(answers).some((a) => {
          if (
            typeof a.answer === "string" &&
            a.answer.toLowerCase().trim() === nameLower
          )
            return true;
          if (
            typeof a.prettyFormat === "string" &&
            a.prettyFormat.toLowerCase().trim() === nameLower
          )
            return true;
          return false;
        });
      }) ?? null
    );
  },

  /**
   * Build a pre-filled URL for the onboarding agreement form.
   * Maps onboarding session data to the specific JotForm question IDs.
   *
   * Form 260197622868165 question mapping:
   *   q8  = Date (control_datetime, liteMode)
   *   q9  = Name (control_fullname: first, last)
   *   q12 = Email (control_email)
   *   q16 = Phone Number (control_phone, masked)
   *   q18 = Official Business Name (control_textbox)
   *   q20 = Address (control_address: addr_line1, city, state, postal, country)
   *   q26 = Title (control_textbox)
   *   q17 = Package dropdown
   *   q21 = Number of VAs
   */
  buildPrefillUrl(data: {
    contactName?: string | null;
    contactEmail?: string | null;
    contactPhone?: string | null;
    contactTitle?: string | null;
    companyName?: string | null;
    address?: string | null;
    country?: string | null;
    paymentMethod?: string | null; // ppp, cor, both
    vaCount?: number;
  }): string {
    const formId = onboardingFormId();
    const params = new URLSearchParams();

    // Parse contact name into first/last
    const nameParts = (data.contactName ?? "").trim().split(/\s+/);
    const firstName = nameParts[0] || "";
    const lastName = nameParts.slice(1).join(" ") || "";

    // JotForm prefill uses the field "name" attribute, NOT qID_name format
    // Field names from form API: name, email, phoneNumber, officialBusiness, title, address20, date, whichPackage, packagesAre

    // Name (control_fullname)
    if (firstName) params.set("name[first]", firstName);
    if (lastName) params.set("name[last]", lastName);

    // Email
    if (data.contactEmail) params.set("email", data.contactEmail);

    // Phone Number (masked input)
    if (data.contactPhone) {
      const digits = data.contactPhone.replace(/\D/g, "");
      params.set("phoneNumber[full]", digits);
    }

    // Official Business Name
    if (data.companyName) params.set("officialBusiness", data.companyName);

    // Title
    if (data.contactTitle) params.set("title", data.contactTitle);

    // Address - parse "123 Main St, City, State, ZIP" format
    if (data.address) {
      const parts = data.address.split(",").map((p) => p.trim());
      if (parts.length >= 1) params.set("address20[addr_line1]", parts[0]);
      if (parts.length >= 2) params.set("address20[city]", parts[1]);
      if (parts.length >= 3) params.set("address20[state]", parts[2]);
      if (parts.length >= 4) params.set("address20[postal]", parts[3]);
      if (data.country) params.set("address20[country]", data.country);
    }

    // Date - set to today (liteMode format)
    const today = new Date();
    const mm = String(today.getMonth() + 1).padStart(2, "0");
    const dd = String(today.getDate()).padStart(2, "0");
    const yyyy = today.getFullYear();
    params.set("date", `${mm}-${dd}-${yyyy}`);

    // Package selection — default to Annual
    if (data.paymentMethod) {
      params.set("whichPackage", "Annual - $3000 one-time annual payment");
    }

    // Number of VAs
    if (data.vaCount && data.vaCount > 0) {
      params.set("packagesAre", String(data.vaCount));
    }

    return `https://form.jotform.com/${formId}?${params.toString()}`;
  },
};
