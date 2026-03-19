import "server-only";

const JOTFORM_API_BASE = "https://api.jotform.com";
const FETCH_TIMEOUT_MS = 30_000;

function fetchWithTimeout(url: string, init?: RequestInit): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  return fetch(url, { ...init, signal: controller.signal }).finally(() => clearTimeout(timer));
}

function readEnv(name: string): string | undefined {
  const value = process.env[name];
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

export function isJotFormConfigured(): boolean {
  return !!readEnv("JOTFORM_API_KEY");
}

function apiKey(): string {
  return readEnv("JOTFORM_API_KEY")!;
}

export type JotFormTemplateLink = {
  id: string;
  title: string;
  url: string;
  signDocument?: boolean;
};

// Display-name overrides — rename forms without touching env vars
const FORM_TITLE_OVERRIDES: Record<string, string> = {
  "Terms and Conditions": "Job Offer",
};

export function getConfiguredJotFormLinks(): JotFormTemplateLink[] {
  const raw =
    readEnv("JOTFORM_SIGN_TEMPLATE_LINKS") ??
    readEnv("JOTFORM_TEMPLATE_LINKS");
  if (!raw) return [];

  const applyOverride = (title: string) => FORM_TITLE_OVERRIDES[title] ?? title;

  const trimmed = raw.trim();
  // JSON format: [{"title":"...","url":"https://...","signDocument":true}]
  if (trimmed.startsWith("[")) {
    try {
      const parsed = JSON.parse(trimmed) as Array<{
        title?: string;
        url?: string;
        signDocument?: boolean;
      }>;
      return parsed
        .filter((item) => item?.title && item?.url)
        .map((item) => {
          const trimmedUrl = item.url!.trim();
          const match = trimmedUrl.match(/(\d{12,})/);
          return {
            id: match?.[1] ?? trimmedUrl,
            title: applyOverride(item.title!.trim()),
            url: trimmedUrl,
            signDocument: item.signDocument ?? false,
          };
        });
    } catch {
      return [];
    }
  }

  // Line format: Title|https://...
  const links = trimmed
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const [title, url] = line.split("|");
      return { title: title?.trim(), url: url?.trim() };
    })
    .filter((item) => item.title && item.url)
    .map((item) => ({
      title: item.title!,
      url: item.url!,
    }));

  return links.map((item) => {
    const trimmedUrl = item.url.trim();
    const match = trimmedUrl.match(/(\d{12,})/);
    return {
      id: match?.[1] ?? trimmedUrl,
      title: applyOverride(item.title.trim()),
      url: trimmedUrl,
    };
  });
}

export const JotFormService = {
  async testConnection(): Promise<{ success: boolean; message: string }> {
    try {
      const response = await fetchWithTimeout(`${JOTFORM_API_BASE}/user?apiKey=${apiKey()}`);
      if (!response.ok) return { success: false, message: "Failed to connect" };
      const data = await response.json();
      return { success: true, message: `Connected as ${data.content?.username}` };
    } catch (error) {
      return { success: false, message: error instanceof Error ? error.message : "Unknown error" };
    }
  },

  async listForms(limit = 100) {
    const filter = encodeURIComponent(JSON.stringify({ "status:ne": "DELETED" }));
    const response = await fetchWithTimeout(
      `${JOTFORM_API_BASE}/user/forms?apiKey=${apiKey()}&limit=${limit}&filter=${filter}`
    );
    if (!response.ok) throw new Error("Failed to list forms");
    const data = await response.json();
    return (data.content ?? []).filter((f: Record<string, string>) => {
      const s = String(f.status ?? "").toUpperCase();
      return s !== "DELETED" && s !== "TRASHED" && s !== "PURGED";
    });
  },

  async getFormQuestions(formId: string) {
    const response = await fetchWithTimeout(
      `${JOTFORM_API_BASE}/form/${formId}/questions?apiKey=${apiKey()}`
    );
    if (!response.ok) throw new Error("Failed to get form questions");
    const data = await response.json();
    return data.content ?? {};
  },

  async getFormSubmissions(formId: string, limit = 100) {
    const response = await fetchWithTimeout(
      `${JOTFORM_API_BASE}/form/${formId}/submissions?apiKey=${apiKey()}&limit=${limit}`
    );
    if (!response.ok) throw new Error("Failed to get submissions");
    const data = await response.json();
    return data.content ?? [];
  },

  async checkSubmissionByEmail(formId: string, email: string) {
    const submissions = await this.getFormSubmissions(formId, 1000);
    return (
      submissions.find((s: Record<string, unknown>) => {
        const answers = s.answers as Record<string, Record<string, unknown>> | undefined;
        if (!answers) return false;
        return Object.values(answers).some((a) => {
          // Direct string match
          if (typeof a.answer === "string" && a.answer.toLowerCase() === email.toLowerCase()) return true;
          // Check prettyFormat field (JotForm sometimes stores display text here)
          if (typeof a.prettyFormat === "string" && a.prettyFormat.toLowerCase() === email.toLowerCase()) return true;
          return false;
        });
      }) ?? null
    );
  },

  /**
   * Check for a form submission by matching first + last name.
   * This is a fallback for forms that don't have email fields (e.g. W9, W8 tax forms).
   * Matches against:
   *  - string answers containing the full name
   *  - compound name objects with first/last parts
   *  - prettyFormat fields
   *  - signature fields (which are often prefilled with the full name)
   */
  async checkSubmissionByName(formId: string, firstName: string, lastName: string) {
    const submissions = await this.getFormSubmissions(formId, 1000);
    const norm = (s: string) => s.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
    const fullName = norm(`${firstName} ${lastName}`.toLowerCase());
    const firstLower = norm(firstName.toLowerCase());
    const lastLower = norm(lastName.toLowerCase());
    const lastParts = lastLower.split(/\s+/).filter(Boolean);

    return (
      submissions.find((s: Record<string, unknown>) => {
        const answers = s.answers as Record<string, Record<string, unknown>> | undefined;
        if (!answers) return false;

        let nameMatchCount = 0;

        for (const a of Object.values(answers)) {
          // Check direct string answer for full name
          if (typeof a.answer === "string") {
            const ansLower = norm(a.answer.toLowerCase().trim());
            if (ansLower === fullName) return true;
            if (ansLower === firstLower) nameMatchCount |= 1;
            if (ansLower === lastLower) nameMatchCount |= 2;
            // Check if first AND all parts of last name are contained as words
            const ansParts = ansLower.split(/\s+/);
            if (ansParts.length >= 2 && ansParts.includes(firstLower) && lastParts.every((p) => ansParts.includes(p))) return true;
          }
          // Check prettyFormat
          if (typeof a.prettyFormat === "string") {
            const pfLower = norm(a.prettyFormat.toLowerCase().trim());
            if (pfLower === fullName) return true;
            if (pfLower === `${firstLower} ${lastLower}` || pfLower === `${lastLower}, ${firstLower}`) return true;
            const pfParts = pfLower.split(/\s+/);
            if (pfParts.length >= 2 && pfParts.includes(firstLower) && lastParts.every((p) => pfParts.includes(p))) return true;
          }
          // Check compound name objects: {first: "rob", last: "easy"}
          if (a.answer && typeof a.answer === "object") {
            const nameObj = a.answer as Record<string, string>;
            const first = norm((nameObj.first ?? nameObj.firstName ?? "").toLowerCase().trim());
            const last = norm((nameObj.last ?? nameObj.lastName ?? "").toLowerCase().trim());
            if (first === firstLower && last === lastLower) return true;
          }
        }

        // If we found both first and last name in separate fields, count it as a match
        return nameMatchCount === 3;
      }) ?? null
    );
  },

  buildPrefillUrl(
    formId: string,
    employee: {
      legalFirstName: string;
      legalLastName: string;
      personalEmail?: string | null;
      workEmail?: string | null;
      phoneNumber?: string | null;
      streetAddress?: string | null;
      city?: string | null;
      stateProvince?: string | null;
      postalCode?: string | null;
      country?: string | null;
      hourlyRate?: string | null;
      currency?: string | null;
      startDate?: Date | string | null;
    }
  ): string {
    const params = new URLSearchParams();
    // Common JotForm prefill parameter patterns
    // These depend on the specific form's question IDs
    const email = employee.workEmail ?? employee.personalEmail ?? "";
    if (email) params.set("email", email);
    if (employee.legalFirstName) params.set("firstName", employee.legalFirstName);
    if (employee.legalLastName) params.set("lastName", employee.legalLastName);
    if (employee.phoneNumber) params.set("phone", employee.phoneNumber);
    if (employee.streetAddress) params.set("address", employee.streetAddress);
    if (employee.city) params.set("city", employee.city);
    if (employee.stateProvince) params.set("state", employee.stateProvince);
    if (employee.postalCode) params.set("zip", employee.postalCode);
    if (employee.country) params.set("country", employee.country);
    if (employee.hourlyRate) params.set("hourlyRate", employee.hourlyRate);
    if (employee.currency) params.set("currency", employee.currency);
    if (employee.startDate) {
      const d = new Date(typeof employee.startDate === "string" ? employee.startDate : (employee.startDate as Date).getTime());
      if (!Number.isNaN(d.getTime())) params.set("startDate", d.toISOString().slice(0, 10));
    }

    return `https://form.jotform.com/${formId}?${params.toString()}`;
  },

  async buildSmartPrefillUrl(
    formId: string,
    employee: {
      legalFirstName: string;
      legalLastName: string;
      personalEmail?: string | null;
      workEmail?: string | null;
      phoneNumber?: string | null;
      streetAddress?: string | null;
      city?: string | null;
      stateProvince?: string | null;
      postalCode?: string | null;
      country?: string | null;
      hourlyRate?: string | null;
      monthlySalary?: string | null;
      currency?: string | null;
      startDate?: Date | string | null;
      employeeNumber?: string | null;
      organizationName?: string | null;
      jobTitle?: string | null;
    }
  ): Promise<string> {
    const params = new URLSearchParams();
    const email = employee.workEmail ?? employee.personalEmail ?? "";
    const fullName = `${employee.legalFirstName} ${employee.legalLastName}`;
    const phoneDigits = (employee.phoneNumber ?? "").replace(/\D/g, "");
    const formatDate = (value?: Date | string | null) => {
      if (!value) return "";
      const date = new Date(typeof value === "string" ? value : (value as Date).getTime());
      return Number.isNaN(date.getTime()) ? "" : date.toISOString().slice(0, 10);
    };
    const startDate = formatDate(employee.startDate);
    const startDateUs = (() => {
      if (!startDate) return "";
      const [y, m, d] = startDate.split("-");
      if (!y || !m || !d) return "";
      return `${m}/${d}/${y}`;
    })();
    const orgName = employee.organizationName ?? "Remote Leverage";
    const jobTitle = employee.jobTitle ?? "";

    const basePairs: Array<[string, string]> = [
      ["firstName", employee.legalFirstName],
      ["firstname", employee.legalFirstName],
      ["first_name", employee.legalFirstName],
      ["first", employee.legalFirstName],
      ["fname", employee.legalFirstName],
      ["givenName", employee.legalFirstName],
      ["given_name", employee.legalFirstName],
      ["lastName", employee.legalLastName],
      ["lastname", employee.legalLastName],
      ["last_name", employee.legalLastName],
      ["last", employee.legalLastName],
      ["lname", employee.legalLastName],
      ["surname", employee.legalLastName],
      ["familyName", employee.legalLastName],
      ["family_name", employee.legalLastName],
      ["fullName", `${employee.legalFirstName} ${employee.legalLastName}`],
      ["contractorName", `${employee.legalFirstName} ${employee.legalLastName}`],
      ["Signaturefirstandlast", fullName],
      ["signatureName", fullName],
      ["email", email],
      ["workEmail", employee.workEmail ?? ""],
      ["phone", employee.phoneNumber ?? ""],
      ["address", employee.streetAddress ?? ""],
      ["streetAddress", employee.streetAddress ?? ""],
      ["street", employee.streetAddress ?? ""],
      ["street1", employee.streetAddress ?? ""],
      ["address1", employee.streetAddress ?? ""],
      ["addr1", employee.streetAddress ?? ""],
      ["city", employee.city ?? ""],
      ["state", employee.stateProvince ?? ""],
      ["stateProvince", employee.stateProvince ?? ""],
      ["province", employee.stateProvince ?? ""],
      ["region", employee.stateProvince ?? ""],
      ["postal", employee.postalCode ?? ""],
      ["postalCode", employee.postalCode ?? ""],
      ["zip", employee.postalCode ?? ""],
      ["zipcode", employee.postalCode ?? ""],
      ["zipCode", employee.postalCode ?? ""],
      ["country", employee.country ?? ""],
      ["rate", employee.monthlySalary ? `${employee.monthlySalary} ${employee.currency ?? "USD"}/mo` : employee.hourlyRate ? `${employee.hourlyRate} ${employee.currency ?? "USD"}/hr` : ""],
      ["hourlyRate", employee.hourlyRate ? `${employee.hourlyRate} ${employee.currency ?? "USD"}/hr` : ""],
      ["hourly_rate", employee.hourlyRate ?? ""],
      ["payRate", employee.monthlySalary ?? employee.hourlyRate ?? ""],
      ["pay_rate", employee.monthlySalary ?? employee.hourlyRate ?? ""],
      ["salary", employee.monthlySalary ?? employee.hourlyRate ?? ""],
      ["monthlySalary", employee.monthlySalary ? `${employee.monthlySalary} ${employee.currency ?? "USD"}/mo` : ""],
      ["monthly_salary", employee.monthlySalary ?? ""],
      ["wage", employee.monthlySalary ?? employee.hourlyRate ?? ""],
      ["compensation", employee.monthlySalary ? `${employee.monthlySalary} ${employee.currency ?? "USD"}/mo` : employee.hourlyRate ? `${employee.hourlyRate} ${employee.currency ?? "USD"}/hr` : ""],
      ["currency", employee.currency ?? ""],
      ["startDate", startDate],
      ["startDateUs", startDateUs],
      ["date", startDate || startDateUs],
      ["start_date", startDate],
      ["start", startDate || startDateUs],
      ["hireDate", startDate],
      ["hire_date", startDate],
      ["effectiveDate", startDate],
      ["effective_date", startDate],
      ["weare", jobTitle],
      ["position", jobTitle],
      ["jobTitle", jobTitle],
      ["job_title", jobTitle],
      ["role", jobTitle],
      ["companyName", orgName],
      ["company", orgName],
      ["organizationName", orgName],
      ["contractorId", employee.employeeNumber ?? ""],
      ["dear", fullName],
      ["Dear", fullName],
    ];
    for (const [key, value] of basePairs) {
      if (value) params.set(key, value);
    }

    const prefilledQuestionIds: string[] = [];
    let rateMatched = false;
    let dateMatched = false;

    try {
      const questions = await this.getFormQuestions(formId);
      const entries = Object.entries(questions) as Array<
        [string, { type?: string; name?: string; text?: string }]
      >;

      console.log(`[JotForm Prefill] Form ${formId}: ${entries.length} questions found`);

      const normalize = (v?: string) => (v ?? "").toLowerCase().replace(/[^a-z0-9]/g, "");
      const withName = (q: { name?: string; text?: string }) =>
        `${normalize(q.name)} ${normalize(q.text)}`;

      const makeQuestionKeys = (questionId: string, rawName?: string) => {
        if (!rawName) return [] as string[];
        const trimmed = rawName.trim();
        if (!trimmed) return [] as string[];
        const prefixed = /^q\d+_/i.test(trimmed) ? trimmed : `q${questionId}_${trimmed}`;
        return Array.from(new Set([trimmed, prefixed]));
      };

      const setForQuestion = (
        questionId: string,
        questionName: string | undefined,
        value: string | null | undefined,
        subField?: string
      ) => {
        if (!value) return;
        const keys = makeQuestionKeys(questionId, questionName);
        for (const key of keys) {
          if (subField) params.set(`${key}[${subField}]`, value);
          else params.set(key, value);
        }
      };

      const prefillAndLock = (
        questionId: string,
        questionName: string | undefined,
        value: string | null | undefined,
        subField?: string
      ) => {
        setForQuestion(questionId, questionName, value, subField);
        if (value && !prefilledQuestionIds.includes(questionId)) {
          prefilledQuestionIds.push(questionId);
        }
      };

      for (const [questionId, q] of entries) {
        if (!q.name) continue;

        const scope = withName(q);
        const t = q.type ?? "";

        if (t === "control_fullname") {
          prefillAndLock(questionId, q.name, employee.legalFirstName, "first");
          prefillAndLock(questionId, q.name, employee.legalLastName, "last");
          prefillAndLock(
            questionId,
            q.name,
            `${employee.legalFirstName} ${employee.legalLastName}`,
            "full"
          );
          continue;
        }

        if (t === "control_address") {
          prefillAndLock(questionId, q.name, employee.streetAddress, "addr_line1");
          prefillAndLock(questionId, q.name, employee.streetAddress, "line1");
          prefillAndLock(questionId, q.name, employee.city, "city");
          prefillAndLock(questionId, q.name, employee.stateProvince, "state");
          prefillAndLock(questionId, q.name, employee.postalCode, "postal");
          prefillAndLock(questionId, q.name, employee.postalCode, "zip");
          prefillAndLock(questionId, q.name, employee.country, "country");
          continue;
        }

        if (t === "control_email") {
          prefillAndLock(questionId, q.name, email);
          continue;
        }

        if (t === "control_phone") {
          prefillAndLock(questionId, q.name, employee.phoneNumber, "full");
          prefillAndLock(questionId, q.name, employee.phoneNumber);
          if (phoneDigits.length >= 10) {
            prefillAndLock(questionId, q.name, phoneDigits.slice(-10, -7), "area");
            prefillAndLock(questionId, q.name, phoneDigits.slice(-7), "phone");
          }
          continue;
        }

        // Date widget type — prefill with date sub-fields
        if (t === "control_datetime" || t === "control_date") {
          if (startDate || startDateUs) {
            prefillAndLock(questionId, q.name, startDate || startDateUs);
            if (startDate) {
              const [y, m, d] = startDate.split("-");
              prefillAndLock(questionId, q.name, m, "month");
              prefillAndLock(questionId, q.name, d, "day");
              prefillAndLock(questionId, q.name, y, "year");
            }
            dateMatched = true;
          }
          continue;
        }

        if (scope.includes("firstname") || scope.includes("givenname")) {
          prefillAndLock(questionId, q.name, employee.legalFirstName);
          continue;
        }
        // IMPORTANT: check fullname BEFORE lastname, since "fullname" contains "lname"
        if (
          scope.includes("fullname") ||
          scope.includes("contractorname") ||
          scope.includes("completename") ||
          scope.includes("printname") ||
          scope.includes("legalname") ||
          scope.includes("displayname") ||
          scope.includes("yourname")
        ) {
          prefillAndLock(questionId, q.name, fullName);
          continue;
        }
        if (
          scope.includes("lastname") ||
          scope.includes("surname") ||
          scope.includes("familyname") ||
          (scope.includes("lname") && !scope.includes("fullname") && !scope.includes("legalname"))
        ) {
          prefillAndLock(questionId, q.name, employee.legalLastName);
          continue;
        }
        // Generic "name" fields that didn't match first/last/full specifically
        if (
          t === "control_textbox" &&
          (normalize(q.text ?? "").match(/^name/) || normalize(q.name ?? "").match(/^name/)) &&
          !scope.includes("email") && !scope.includes("phone") && !scope.includes("company") &&
          !scope.includes("bank") && !scope.includes("emergency")
        ) {
          prefillAndLock(questionId, q.name, fullName);
          continue;
        }
        if (scope.includes("email")) {
          prefillAndLock(questionId, q.name, email);
          continue;
        }
        if (scope.includes("phone") || scope.includes("mobile")) {
          prefillAndLock(questionId, q.name, employee.phoneNumber);
          continue;
        }
        if (scope.includes("address")) {
          prefillAndLock(questionId, q.name, employee.streetAddress);
          continue;
        }
        if (scope.includes("city")) {
          prefillAndLock(questionId, q.name, employee.city);
          continue;
        }
        if (scope.includes("state") || scope.includes("province")) {
          prefillAndLock(questionId, q.name, employee.stateProvince);
          continue;
        }
        if (scope.includes("postal") || scope.includes("zipcode") || scope.includes("zip")) {
          prefillAndLock(questionId, q.name, employee.postalCode);
          continue;
        }
        if (scope.includes("country")) {
          prefillAndLock(questionId, q.name, employee.country);
          continue;
        }
        if (
          scope.includes("rate") || scope.includes("compensation") ||
          scope.includes("pay") || scope.includes("salary") ||
          scope.includes("wage") || scope.includes("hourly") ||
          scope.includes("amount") || scope.includes("fee") ||
          scope.includes("price") || scope.includes("cost")
        ) {
          const rateValue = employee.monthlySalary
            ? `${employee.monthlySalary} ${employee.currency ?? "USD"}/mo`
            : employee.hourlyRate ? `${employee.hourlyRate} ${employee.currency ?? "USD"}/hr` : null;
          prefillAndLock(questionId, q.name, rateValue);
          if (rateValue) rateMatched = true;
          continue;
        }
        if (scope.includes("currency")) {
          prefillAndLock(questionId, q.name, employee.currency);
          continue;
        }
        if (
          scope.includes("weare") || scope.includes("jobtitle") ||
          scope.includes("job_title") || scope.includes("position") ||
          scope.includes("title") && !scope.includes("name")
        ) {
          prefillAndLock(questionId, q.name, jobTitle);
          continue;
        }
        if (
          scope.includes("companyname") ||
          scope.includes("company") || scope.includes("organizationname") ||
          scope.includes("organization") || scope.includes("employer")
        ) {
          prefillAndLock(questionId, q.name, orgName);
          continue;
        }
        if (
          scope.includes("signature") || scope.includes("signaturename") ||
          scope.includes("signatoriename") || scope.includes("signfull") ||
          scope.includes("signname")
        ) {
          prefillAndLock(questionId, q.name, fullName);
          continue;
        }
        if (scope.includes("dear")) {
          prefillAndLock(questionId, q.name, fullName);
          continue;
        }
        if (
          scope.includes("startdate") || scope.includes("start_date") ||
          scope.includes("hiredate") || scope.includes("hire_date") ||
          scope.includes("effectivedate") || scope.includes("effective_date") ||
          normalize(q.name) === "start" ||
          scope.includes("date")
        ) {
          prefillAndLock(questionId, q.name, startDate || startDateUs);
          // JotForm date picker fields need month/day/year sub-params
          const t = q.type ?? "";
          if ((t === "control_datetime" || t === "control_date") && startDate) {
            const [y, m, d] = startDate.split("-");
            if (y && m && d) {
              setForQuestion(questionId, q.name, m, "month");
              setForQuestion(questionId, q.name, d, "day");
              setForQuestion(questionId, q.name, y, "year");
            }
          }
          dateMatched = true;
          continue;
        }
      }

      // Second pass: if rate was not matched, try any unmatched number/text field
      if (!rateMatched && (employee.hourlyRate || employee.monthlySalary)) {
        for (const [questionId, q] of entries) {
          if (!q.name || prefilledQuestionIds.includes(questionId)) continue;
          const t = q.type ?? "";
          if (!["control_textbox", "control_number", "control_spinner"].includes(t)) continue;
          const scope = withName(q);
          // Skip fields clearly matched to something else
          if (
            scope.includes("name") || scope.includes("email") ||
            scope.includes("phone") || scope.includes("address") ||
            scope.includes("city") || scope.includes("state") ||
            scope.includes("postal") || scope.includes("zip") ||
            scope.includes("country") || scope.includes("id") ||
            scope.includes("number")
          ) continue;
          console.log(`[JotForm Prefill] Rate fallback: trying field q${questionId} name="${q.name}" text="${q.text}"`);
          const rateValue = employee.monthlySalary
            ? `${employee.monthlySalary} ${employee.currency ?? "USD"}/mo`
            : `${employee.hourlyRate} ${employee.currency ?? "USD"}/hr`;
          prefillAndLock(questionId, q.name, rateValue);
          rateMatched = true;
          break;
        }
      }

      // Second pass: if date was not matched, try any remaining date field
      if (!dateMatched && (startDate || startDateUs)) {
        for (const [questionId, q] of entries) {
          if (!q.name || prefilledQuestionIds.includes(questionId)) continue;
          const t = q.type ?? "";
          if (t === "control_datetime" || t === "control_date") {
            prefillAndLock(questionId, q.name, startDate || startDateUs);
            if (startDate) {
              const [y, m, d] = startDate.split("-");
              prefillAndLock(questionId, q.name, m, "month");
              prefillAndLock(questionId, q.name, d, "day");
              prefillAndLock(questionId, q.name, y, "year");
            }
            break;
          }
        }
      }

      console.log(`[JotForm Prefill] Form ${formId}: ${prefilledQuestionIds.length} fields prefilled, IDs=[${prefilledQuestionIds.join(",")}], rateMatched=${rateMatched}`);
    } catch (prefillErr) {
      console.error(`[JotForm Prefill] Failed to fetch/match questions for form ${formId}:`, prefillErr);
    }

    if (prefilledQuestionIds.length > 0) {
      params.set("noedit", prefilledQuestionIds.join(","));
      // Belt-and-suspenders: some JotForm versions use readOnlyFields
      params.set("readOnlyFields", prefilledQuestionIds.join(","));
    }

    return `https://form.jotform.com/${formId}?${params.toString()}`;
  },

  async downloadSubmissionPdf(submissionId: string): Promise<ArrayBuffer | null> {
    try {
      const response = await fetchWithTimeout(
        `${JOTFORM_API_BASE}/submission/${submissionId}/pdf?apiKey=${apiKey()}`
      );
      if (!response.ok) return null;
      return response.arrayBuffer();
    } catch {
      return null;
    }
  },

  getFormTemplateIds() {
    return {
      contractorAgreement: process.env.JOTFORM_CONTRACTOR_AGREEMENT_ID,
      jobOffer: process.env.JOTFORM_JOB_OFFER_ID,
      w8Ben: process.env.JOTFORM_W8_BEN_ID,
      w9: process.env.JOTFORM_W9_ID,
    };
  },

  /**
   * Ensure a JotForm webhook is registered on a form.
   * Idempotent — if the webhook URL is already registered, does nothing.
   */
  async ensureWebhook(formId: string, webhookUrl: string): Promise<boolean> {
    try {
      // First check existing webhooks
      const listRes = await fetchWithTimeout(
        `${JOTFORM_API_BASE}/form/${formId}/webhooks?apiKey=${apiKey()}`
      );
      if (listRes.ok) {
        const listData = await listRes.json();
        const existing = Object.values(listData?.content ?? {}) as string[];
        if (existing.some((url) => url === webhookUrl)) {
          return true; // Already registered
        }
      }

      // Register the webhook
      const body = new URLSearchParams({ webhookURL: webhookUrl });
      const res = await fetchWithTimeout(
        `${JOTFORM_API_BASE}/form/${formId}/webhooks?apiKey=${apiKey()}`,
        { method: "POST", body }
      );
      if (!res.ok) {
        console.error(`[JotForm] Failed to register webhook on form ${formId}: ${res.status}`);
        return false;
      }
      console.log(`[JotForm] Webhook registered on form ${formId}: ${webhookUrl}`);
      return true;
    } catch (err) {
      console.error(`[JotForm] Error registering webhook on form ${formId}:`, err);
      return false;
    }
  },
};
