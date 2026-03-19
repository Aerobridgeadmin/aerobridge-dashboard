import { z } from "zod";

export const WorkHistoryItemSchema = z.object({
  title: z.string().optional().nullable(),
  company: z.string().optional().nullable(),
  dates: z.string().optional().nullable(),
  location: z.string().optional().nullable(),
  responsibilities: z.array(z.string()).optional().default([]),
});

export const ParsedResumeContentSchema = z.object({
  name: z.string().optional().nullable(),
  country: z.string().optional().nullable(),
  email: z.string().optional().nullable(),
  phone: z.string().optional().nullable(),
  introduction: z.string().optional().nullable().default(""),
  workHistory: z.array(WorkHistoryItemSchema).optional().default([]),
  education: z.array(z.string()).optional().default([]),
  skills: z.array(z.string()).optional().default([]),
  tools: z.array(z.string()).optional().default([]),
  languages: z.array(z.string()).optional().default([]),
  certifications: z.array(z.string()).optional().default([]),
  skillCategories: z.array(z.string()).optional().default([]),
  currentRole: z.string().optional().nullable(),
  currentCompany: z.string().optional().nullable(),
  yearsExperience: z.number().optional().nullable(),
  educationLevel: z.string().optional().nullable(),
  certificationsCount: z.number().optional().nullable(),
});

export type ParsedResumeContent = z.infer<typeof ParsedResumeContentSchema>;

export function validateParsedContent(data: unknown): ParsedResumeContent {
  try {
    return ParsedResumeContentSchema.parse(data);
  } catch (error) {
    console.warn("[validation] Parsed content validation failed, using defaults:", error);
    return {
      name: null,
      country: null,
      email: null,
      phone: null,
      introduction: "",
      workHistory: [],
      education: [],
      skills: [],
      tools: [],
      languages: [],
      certifications: [],
      skillCategories: [],
    };
  }
}

export function sanitizeParsedContent(data: unknown): ParsedResumeContent {
  if (!data || typeof data !== "object") {
    return validateParsedContent({});
  }

  const obj = data as Record<string, unknown>;
  
  const sanitized: Partial<ParsedResumeContent> = {};
  
  if (typeof obj.name === "string") sanitized.name = obj.name.slice(0, 200);
  if (typeof obj.country === "string") sanitized.country = obj.country.slice(0, 100);
  if (typeof obj.email === "string") sanitized.email = obj.email.slice(0, 254);
  if (typeof obj.phone === "string") sanitized.phone = obj.phone.slice(0, 50);
  if (typeof obj.introduction === "string") sanitized.introduction = obj.introduction.slice(0, 5000);
  
  if (Array.isArray(obj.workHistory)) {
    sanitized.workHistory = obj.workHistory.slice(0, 50).map((item: unknown) => {
      if (!item || typeof item !== "object") return { responsibilities: [] };
      const w = item as Record<string, unknown>;
      return {
        title: typeof w.title === "string" ? w.title.slice(0, 200) : null,
        company: typeof w.company === "string" ? w.company.slice(0, 200) : null,
        dates: typeof w.dates === "string" ? w.dates.slice(0, 100) : null,
        location: typeof w.location === "string" ? w.location.slice(0, 200) : null,
        responsibilities: Array.isArray(w.responsibilities) 
          ? w.responsibilities.filter((r): r is string => typeof r === "string").slice(0, 20).map(r => r.slice(0, 1000))
          : [],
      };
    });
  }
  
  if (Array.isArray(obj.education)) {
    sanitized.education = obj.education
      .filter((e): e is string => typeof e === "string")
      .slice(0, 20)
      .map(e => e.slice(0, 500));
  }
  
  if (Array.isArray(obj.skills)) {
    sanitized.skills = obj.skills
      .filter((s): s is string => typeof s === "string")
      .slice(0, 100)
      .map(s => s.slice(0, 200));
  }
  
  if (Array.isArray(obj.tools)) {
    sanitized.tools = obj.tools
      .filter((t): t is string => typeof t === "string")
      .slice(0, 100)
      .map(t => t.slice(0, 200));
  }
  
  if (Array.isArray(obj.languages)) {
    sanitized.languages = obj.languages
      .filter((l): l is string => typeof l === "string")
      .slice(0, 20)
      .map(l => l.slice(0, 100));
  }
  
  if (Array.isArray(obj.certifications)) {
    sanitized.certifications = obj.certifications
      .filter((c): c is string => typeof c === "string")
      .slice(0, 50)
      .map(c => c.slice(0, 300));
  }
  
  if (Array.isArray(obj.skillCategories)) {
    sanitized.skillCategories = obj.skillCategories
      .filter((s): s is string => typeof s === "string")
      .slice(0, 20)
      .map(s => s.slice(0, 100));
  }

  if (typeof obj.currentRole === "string") sanitized.currentRole = obj.currentRole.slice(0, 200);
  if (typeof obj.currentCompany === "string") sanitized.currentCompany = obj.currentCompany.slice(0, 200);
  if (typeof obj.yearsExperience === "number") sanitized.yearsExperience = obj.yearsExperience;
  if (typeof obj.educationLevel === "string") sanitized.educationLevel = obj.educationLevel.slice(0, 100);
  if (typeof obj.certificationsCount === "number") sanitized.certificationsCount = obj.certificationsCount;

  return validateParsedContent(sanitized);
}
