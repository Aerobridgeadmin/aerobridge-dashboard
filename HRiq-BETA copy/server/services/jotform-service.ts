import axios from "axios";
import { structuredLogger as logger } from "../lib/structured-logger";

const JOTFORM_API_BASE = "https://api.jotform.com";

interface JotFormForm {
  id: string;
  title: string;
  status: string;
  created_at: string;
  updated_at: string;
  url: string;
  count: string;
}

interface JotFormSubmission {
  id: string;
  form_id: string;
  created_at: string;
  status: string;
  answers: Record<string, {
    name: string;
    text: string;
    answer: string | string[] | Record<string, string>;
  }>;
}

interface JotFormUser {
  username: string;
  name: string;
  email: string;
  account_type: string;
}

export function isJotFormConfigured(): boolean {
  return !!process.env.JOTFORM_API_KEY;
}

function getApiKey(): string {
  const apiKey = process.env.JOTFORM_API_KEY;
  if (!apiKey) {
    throw new Error("JotForm API key not configured");
  }
  return apiKey;
}

export async function testConnection(): Promise<{ success: boolean; message: string; user?: JotFormUser }> {
  try {
    const apiKey = getApiKey();
    const response = await axios.get<{ content: JotFormUser }>(
      `${JOTFORM_API_BASE}/user?apiKey=${apiKey}`
    );

    return {
      success: true,
      message: `Connected as ${response.data.content.name}`,
      user: response.data.content,
    };
  } catch (error: any) {
    logger.error("[JotForm] Connection test failed:", error.response?.data || error.message);
    return {
      success: false,
      message: error.response?.data?.message || error.message,
    };
  }
}

export async function listForms(limit: number = 100): Promise<JotFormForm[]> {
  try {
    const apiKey = getApiKey();
    const response = await axios.get<{ content: JotFormForm[] }>(
      `${JOTFORM_API_BASE}/user/forms?apiKey=${apiKey}&limit=${limit}`
    );

    return response.data.content || [];
  } catch (error: any) {
    logger.error("[JotForm] Failed to list forms:", error.response?.data || error.message);
    throw new Error(`Failed to list JotForm forms: ${error.response?.data?.message || error.message}`);
  }
}

export async function getForm(formId: string): Promise<JotFormForm> {
  try {
    const apiKey = getApiKey();
    const response = await axios.get<{ content: JotFormForm }>(
      `${JOTFORM_API_BASE}/form/${formId}?apiKey=${apiKey}`
    );

    return response.data.content;
  } catch (error: any) {
    logger.error("[JotForm] Failed to get form:", error.response?.data || error.message);
    throw new Error(`Failed to get JotForm form: ${error.response?.data?.message || error.message}`);
  }
}

export async function getFormSubmissions(formId: string, limit: number = 100): Promise<JotFormSubmission[]> {
  try {
    const apiKey = getApiKey();
    const response = await axios.get<{ content: JotFormSubmission[] }>(
      `${JOTFORM_API_BASE}/form/${formId}/submissions?apiKey=${apiKey}&limit=${limit}`
    );

    return response.data.content || [];
  } catch (error: any) {
    logger.error("[JotForm] Failed to get submissions:", error.response?.data || error.message);
    throw new Error(`Failed to get JotForm submissions: ${error.response?.data?.message || error.message}`);
  }
}

export async function getSubmission(submissionId: string): Promise<JotFormSubmission> {
  try {
    const apiKey = getApiKey();
    const response = await axios.get<{ content: JotFormSubmission }>(
      `${JOTFORM_API_BASE}/submission/${submissionId}?apiKey=${apiKey}`
    );

    return response.data.content;
  } catch (error: any) {
    logger.error("[JotForm] Failed to get submission:", error.response?.data || error.message);
    throw new Error(`Failed to get JotForm submission: ${error.response?.data?.message || error.message}`);
  }
}

export async function checkSubmissionByEmail(formId: string, email: string): Promise<JotFormSubmission | null> {
  try {
    const submissions = await getFormSubmissions(formId, 1000);
    
    for (const submission of submissions) {
      for (const answer of Object.values(submission.answers)) {
        if (answer.name?.toLowerCase().includes("email") && 
            typeof answer.answer === "string" && 
            answer.answer.toLowerCase() === email.toLowerCase()) {
          return submission;
        }
      }
    }
    
    return null;
  } catch (error: any) {
    logger.error("[JotForm] Failed to check submission by email:", error.message);
    return null;
  }
}

export function getFormFillUrl(formId: string, prefillData?: Record<string, string>): string {
  let url = `https://form.jotform.com/${formId}`;
  
  if (prefillData && Object.keys(prefillData).length > 0) {
    const params = new URLSearchParams();
    for (const [key, value] of Object.entries(prefillData)) {
      params.append(key, value);
    }
    url += `?${params.toString()}`;
  }
  
  return url;
}

interface JotFormQuestion {
  qid: string;
  name: string;
  type: string;
  text: string;
  order: string;
  required?: string;
}

export async function getFormQuestions(formId: string): Promise<JotFormQuestion[]> {
  try {
    const apiKey = getApiKey();
    const response = await axios.get<{ content: Record<string, JotFormQuestion> }>(
      `${JOTFORM_API_BASE}/form/${formId}/questions?apiKey=${apiKey}`
    );

    return Object.values(response.data.content || {}).sort((a, b) => 
      parseInt(a.order) - parseInt(b.order)
    );
  } catch (error: any) {
    logger.error("[JotForm] Failed to get form questions:", error.response?.data || error.message);
    throw new Error(`Failed to get form questions: ${error.response?.data?.message || error.message}`);
  }
}

export function generatePrefillUrl(
  formId: string, 
  employee: { 
    firstName: string; 
    lastName: string; 
    email: string; 
    personalEmail?: string;
    phone?: string;
    department?: string;
    jobTitle?: string;
  }
): string {
  const prefillData: Record<string, string> = {};
  
  if (employee.firstName) prefillData['firstName'] = employee.firstName;
  if (employee.lastName) prefillData['lastName'] = employee.lastName;
  if (employee.email) prefillData['email'] = employee.email;
  if (employee.personalEmail) prefillData['personalEmail'] = employee.personalEmail;
  if (employee.phone) prefillData['phone'] = employee.phone;
  if (employee.department) prefillData['department'] = employee.department;
  if (employee.jobTitle) prefillData['jobTitle'] = employee.jobTitle;
  
  const fullName = `${employee.firstName} ${employee.lastName}`.trim();
  if (fullName) prefillData['name'] = fullName;
  
  return getFormFillUrl(formId, prefillData);
}
