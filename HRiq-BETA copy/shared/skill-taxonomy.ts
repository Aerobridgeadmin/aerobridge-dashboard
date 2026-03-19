export const SKILL_CATEGORIES: Record<string, string[]> = {
  // Business / Admin
  "Sales": ["sales", "revenue", "quota", "pipeline", "closing", "prospecting", "b2b", "b2c", "account executive", "business development", "account manager", "sales representative", "cold calling", "lead generation", "inside sales", "outside sales"],
  
  "Admin": ["administrative", "admin assistant", "secretary", "receptionist", "office manager", "office coordinator", "front desk", "personal assistant", "clerical", "data entry", "scheduling", "filing", "typing", "general admin"],
  
  "Executive Assistant": ["executive assistant", "ea", "c-suite support", "chief of staff", "executive support", "board support", "high-level admin", "senior assistant", "ceo assistant", "cfo assistant", "coo assistant", "cto assistant", "cmo assistant", "executive coordinator", "executive secretary", "c-level support", "vp assistant", "director assistant", "assistant to the president", "assistant to the ceo", "personal assistant to ceo", "pa to ceo", "right hand", "ea to", "office of the ceo", "supporting c-suite", "supporting executives"],
  
  "Accounting/Bookkeeping": ["accounting", "bookkeeping", "accounts payable", "accounts receivable", "cpa", "auditing", "tax", "payroll", "general ledger", "financial reporting", "quickbooks", "xero", "invoicing", "reconciliation"],
  
  "Customer Support": ["customer service", "customer support", "support", "helpdesk", "client relations", "customer success", "retention", "call center", "client support", "customer care", "customer experience", "service representative", "chat support", "email support", "phone support"],
  
  "General VA": ["virtual assistant", "va", "general assistant", "remote assistant", "calendar management", "email management", "task management"],
  
  "HR / People Operations": ["hr", "human resources", "people operations", "employee relations", "onboarding", "offboarding", "benefits administration", "talent management", "hris", "workday", "bamboohr", "recruiter", "recruiting", "talent acquisition", "sourcing", "headhunter", "staffing", "ats", "greenhouse", "lever", "linkedin recruiter", "hiring", "candidate screening", "interviewing"],
  
  "Project Manager": ["project manager", "pm", "scrum master", "agile", "program manager", "pmp", "project coordinator", "jira", "asana", "monday.com", "trello", "sprint planning", "kanban"],
  
  "Operations / Logistics": ["operations", "logistics", "supply chain", "inventory", "warehouse", "procurement", "fulfillment", "shipping", "coordination", "dispatch", "fleet management"],
  
  // Marketing / Creative
  "Marketing": ["marketing", "campaigns", "branding", "advertising", "digital marketing", "growth", "brand", "communications", "pr", "public relations", "seo", "search engine optimization", "ppc", "google ads", "facebook ads", "paid media", "sem", "keyword research", "link building", "performance marketing", "meta ads"],
  
  "Social Media Management": ["social media", "social media manager", "community manager", "instagram", "facebook", "twitter", "linkedin", "tiktok", "content creator", "influencer", "engagement", "social strategy"],
  
  "Content Creator": ["content writer", "copywriter", "copywriting", "blog writer", "article writer", "ghostwriter", "content creation", "technical writer", "scriptwriter", "editor", "writer"],
  
  "Graphic Designer": ["graphic design", "graphic designer", "illustrator", "photoshop", "canva", "adobe", "branding design", "logo design", "visual design", "print design"],
  
  "Video Editor": ["video editing", "video editor", "videographer", "motion graphics", "after effects", "premiere pro", "final cut", "animation", "thumbnail", "youtube editor", "reels", "tiktok editor", "animator"],
  
  // Niche VAs
  "Real Estate VA": ["real estate", "property management", "mls", "zillow", "realtor", "listing coordination", "transaction coordinator", "tc", "showing assistant", "cma"],
  
  "E-commerce Specialist": ["ecommerce", "e-commerce", "amazon", "shopify", "woocommerce", "ebay", "etsy", "product listing", "inventory management", "amazon fba", "seller central", "dropshipping"],
  
  "Medical VA": ["medical", "healthcare", "medical assistant", "medical billing", "medical coding", "patient", "hipaa", "ehr", "emr", "clinical", "pharmacy", "nursing", "telehealth"],
  
  "Legal Assistant": ["legal", "lawyer", "attorney", "paralegal", "legal assistant", "contracts", "compliance", "regulatory", "litigation", "corporate law", "legal research"],
  
  "Transcription / Translation": ["transcription", "transcriptionist", "translation", "translator", "interpreter", "subtitles", "captioning", "localization", "bilingual"],
  
  // Tech / Development
  "Developer": ["developer", "web design", "web development", "website", "wordpress", "html", "css", "javascript", "webflow", "ui", "ux", "ui/ux", "user interface", "user experience", "figma", "sketch", "adobe xd", "prototype", "wireframe", "product design", "interaction design", "usability", "full stack", "fullstack", "mern", "mean", "node", "react", "python", "django", "ruby on rails", "php", "laravel", "frontend", "front-end", "vue", "angular", "typescript", "tailwind", "next.js", "gatsby", "backend", "back-end", "express", "fastapi", "flask", "spring boot", "golang", "rust", "api development", "microservices", "mobile", "ios", "android", "swift", "kotlin", "react native", "flutter", "mobile app", "app developer", "xamarin", "software", "programming", "coding", "engineer", "technical", "api", "database", "blockchain", "cybersecurity", "network", "it support"],
  
  "Data Analyst": ["data analyst", "data scientist", "analytics", "business intelligence", "bi", "sql", "tableau", "power bi", "reporting", "data engineer", "machine learning", "statistics", "research", "research analyst", "market research", "competitive analysis", "data research", "internet research", "desk research"],
  
  "QA Engineer": ["qa", "quality assurance", "testing", "test engineer", "automation testing", "manual testing", "quality control", "selenium", "cypress", "jest", "unit testing", "integration testing"],
  
  "DevOps Engineer": ["devops", "cloud", "aws", "azure", "gcp", "kubernetes", "docker", "ci/cd", "infrastructure", "terraform", "ansible", "jenkins", "linux", "sysadmin", "system administrator"],
  
  // Catch-all
  "Other": ["finance", "other"],
};

export const VALID_SKILL_CATEGORIES = Object.keys(SKILL_CATEGORIES);

// Keywords that should be excluded as they cause false positives
const EXCLUDED_KEYWORDS = new Set([
  // Too short/ambiguous
  "ea", "tc", "bi", "pr", "it", "ai", "va", "hr", "pm", "qa",
  // Match in URLs and other contexts
  "linkedin", "facebook", "twitter", "instagram", "tiktok",
  // Match in tech contexts incorrectly
  "contracts", "amazon", "engineer", "mobile", "testing", "api",
  "network", "support", "infrastructure", "automation", "integration",
  // Too generic
  "scheduling", "reporting", "engagement", "growth", "brand", "communications",
  "coordination", "research", "operations", "hiring", "interviewing"
]);

// Industry indicators - company names and terms that indicate specific industries
// Used to assign industry-specific VA categories to admin/VA roles
const INDUSTRY_COMPANY_PATTERNS: Record<string, string[]> = {
  "Real Estate VA": [
    // Brokerages & Franchises
    "keller williams", "re/max", "remax", "coldwell banker", "century 21", "sotheby's", "compass", "exp realty", 
    "berkshire hathaway", "better homes", "redfin", "opendoor", "zillow", "trulia", "realogy", "anywhere real estate",
    // Industry terms in company context
    "realty", "real estate", "properties", "property management", "mortgage", "title company", "escrow",
    "home builders", "construction", "homebuilders", "residential", "commercial real estate"
  ],
  "Medical VA": [
    // Healthcare systems & hospitals
    "hospital", "medical center", "clinic", "healthcare", "health system", "health care",
    "kaiser", "unitedhealth", "anthem", "cigna", "aetna", "humana", "cvs health", "walgreens",
    // Pharma & biotech
    "pharmaceutical", "pharma", "biotech", "thermo fisher", "pfizer", "johnson & johnson", "merck", "abbvie",
    "novartis", "roche", "sanofi", "gsk", "glaxo", "lilly", "bristol-myers", "amgen", "gilead", "biogen",
    // Medical facilities
    "dental", "orthodontic", "optometry", "dermatology", "cardiology", "oncology", "pediatric",
    "nursing home", "assisted living", "rehabilitation", "hospice", "urgent care", "emergency"
  ],
  "Legal Assistant": [
    // Law firms (common patterns)
    "law firm", "law office", "legal group", "attorneys at law", "lawyers", "legal services",
    "llp", "pllc", "& associates", "legal", "counsel",
    // Major firms
    "kirkland", "latham", "skadden", "baker mckenzie", "dla piper", "clifford chance", "allen & overy",
    "freshfields", "linklaters", "sullivan & cromwell", "weil", "gibson dunn", "simpson thacher",
    // Legal industry terms
    "court", "litigation", "paralegal", "compliance", "regulatory"
  ],
  "E-commerce Specialist": [
    // E-commerce platforms & companies
    "amazon", "shopify", "ebay", "etsy", "walmart marketplace", "wayfair", "chewy", "zappos",
    "alibaba", "aliexpress", "wish", "overstock", "newegg", "target", "best buy",
    // Fulfillment & logistics for e-commerce
    "fba", "fulfillment", "3pl", "dropship"
  ]
};

// Categories that require specific role titles to match (not just any keyword)
const ROLE_REQUIRED_CATEGORIES: Record<string, string[]> = {
  "Sales": ["sales", "sales representative", "sales rep", "account executive", "business development representative", "bdr", "sdr"],
  "Admin": ["administrative assistant", "admin assistant", "office manager", "secretary", "receptionist", "personal assistant", "office coordinator", "front desk"],
  "Executive Assistant": ["executive assistant", "ea", "chief of staff", "executive coordinator", "executive secretary", "c-suite", "ceo assistant", "cfo assistant", "coo assistant", "cto assistant", "vp assistant", "director assistant", "assistant to the president", "assistant to the ceo", "pa to ceo", "right hand", "supporting executives"],
  "Customer Support": ["customer service", "customer support", "support representative", "call center", "client support"],
  "General VA": ["virtual assistant", "general assistant", "remote assistant"],
  "HR / People Operations": ["human resources", "hr manager", "people operations", "recruiter", "talent acquisition"],
  "Project Manager": ["project manager", "program manager", "scrum master", "project coordinator"],
  "Operations / Logistics": ["operations manager", "logistics manager", "supply chain", "warehouse manager"],
  "Marketing": ["marketing manager", "digital marketing", "marketing specialist", "seo specialist", "ppc specialist"],
  "Social Media Management": ["social media manager", "community manager", "social media specialist"],
  "Content Creator": ["content writer", "copywriter", "technical writer", "blog writer", "editor"],
  "Graphic Designer": ["graphic designer", "graphic design", "visual designer", "ui designer"],
  "Video Editor": ["video editor", "video editing", "videographer", "motion graphics"],
  "Real Estate VA": ["real estate assistant", "real estate va", "transaction coordinator", "realtor assistant"],
  "E-commerce Specialist": ["ecommerce manager", "e-commerce specialist", "shopify expert", "amazon seller"],
  "Medical VA": ["medical assistant", "medical billing", "medical coding", "healthcare assistant"],
  "Legal Assistant": ["legal assistant", "paralegal", "legal secretary"],
  "Transcription / Translation": ["transcriptionist", "translator", "interpreter", "transcription"],
};

// Support/VA-type roles that can be combined with industry-specific categories
// These are generalist support roles where industry experience adds value
// Specialists (Sales, Marketing, Developer, etc.) should NOT get industry VA tags
const ADMIN_TYPE_ROLES = [
  "Admin", 
  "General VA", 
  "Executive Assistant", 
  "Customer Support",
  "Operations / Logistics",
  "Project Manager",
  "HR / People Operations",
  "Accounting/Bookkeeping"
];

export function extractSkillCategoriesFromText(text: string): string[] {
  const lowerText = text.toLowerCase();
  const categories: string[] = [];
  
  for (const [category, keywords] of Object.entries(SKILL_CATEGORIES)) {
    // For non-tech categories, require specific role keywords
    const roleKeywords = ROLE_REQUIRED_CATEGORIES[category];
    if (roleKeywords) {
      const hasRoleMatch = roleKeywords.some(rk => {
        const regex = new RegExp(`\\b${rk.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i');
        return regex.test(lowerText);
      });
      if (hasRoleMatch) {
        categories.push(category);
      }
      continue;
    }
    
    // For tech categories (Developer, Data Analyst, QA, DevOps), use original logic with filters
    let matchCount = 0;
    for (const kw of keywords) {
      if (EXCLUDED_KEYWORDS.has(kw)) continue;
      
      // Use word boundaries for short keywords
      if (kw.length <= 4) {
        const regex = new RegExp(`\\b${kw.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i');
        if (regex.test(lowerText)) matchCount++;
      } else if (lowerText.includes(kw)) {
        matchCount++;
      }
    }
    
    // Require at least 2 matches for tech categories
    if (matchCount >= 2) {
      categories.push(category);
    }
  }
  
  // Industry-based category detection for admin-type roles
  // If someone has an admin/VA role AND worked at a company in a specific industry,
  // they should also get the industry-specific VA category
  const hasAdminTypeRole = categories.some(cat => ADMIN_TYPE_ROLES.includes(cat));
  
  if (hasAdminTypeRole) {
    for (const [industryCategory, companyPatterns] of Object.entries(INDUSTRY_COMPANY_PATTERNS)) {
      // Skip if already has this category
      if (categories.includes(industryCategory)) continue;
      
      // Check if any company/industry pattern matches
      const hasIndustryMatch = companyPatterns.some(pattern => {
        // Use word boundaries for short patterns to avoid false positives
        if (pattern.length <= 5) {
          const regex = new RegExp(`\\b${pattern.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i');
          return regex.test(lowerText);
        }
        return lowerText.includes(pattern);
      });
      
      if (hasIndustryMatch) {
        categories.push(industryCategory);
      }
    }
  }
  
  return categories;
}

export function matchSkillCategories(jobDescription: string): string[] {
  const lowerText = jobDescription.toLowerCase();
  const matchedCategories: { category: string; matchCount: number; hasPrimaryKeyword: boolean }[] = [];
  
  // Primary keywords are strong indicators (job titles, role names)
  const primaryKeywords: Record<string, string[]> = {
    "Sales": ["sales representative", "sales rep", "sales", "account executive", "business development", "closing", "quota"],
    "Customer Support": ["customer service", "customer support", "call center", "client support", "support representative"],
    "Admin": ["administrative assistant", "admin assistant", "office manager", "secretary", "receptionist", "office coordinator", "front desk"],
    "Executive Assistant": ["executive assistant", "chief of staff", "executive coordinator", "executive secretary", "c-suite support", "ceo assistant", "vp assistant"],
    "General VA": ["virtual assistant", "general va", "remote assistant"],
    "Marketing": ["marketing", "brand manager", "marketing manager", "digital marketing", "seo", "ppc", "google ads"],
    "Social Media Management": ["social media manager", "community manager", "social media"],
    "HR / People Operations": ["human resources", "hr manager", "people operations", "employee relations", "recruiter", "talent acquisition"],
    "Accounting/Bookkeeping": ["accountant", "bookkeeper", "accounting", "bookkeeping", "cpa"],
    "Content Creator": ["content writer", "copywriter", "writer", "editor", "blogger"],
    "Graphic Designer": ["graphic designer", "graphic design", "illustrator", "visual designer"],
    "Video Editor": ["video editor", "video editing", "videographer", "motion graphics", "animator"],
    "Developer": ["developer", "web developer", "web development", "software engineer", "programmer", "frontend", "backend", "full stack", "mobile developer", "app developer", "website", "coding", "programming"],
    "Data Analyst": ["data analyst", "data scientist", "business analyst", "research analyst"],
    "QA Engineer": ["qa engineer", "quality assurance", "test engineer", "qa"],
    "DevOps Engineer": ["devops", "cloud engineer", "aws engineer", "infrastructure"],
    "E-commerce Specialist": ["ecommerce", "e-commerce", "amazon seller", "shopify"],
    "Medical VA": ["medical assistant", "medical billing", "healthcare"],
    "Real Estate VA": ["real estate", "property management", "realtor assistant"],
    "Legal Assistant": ["paralegal", "legal assistant", "legal"],
    "Project Manager": ["project manager", "scrum master", "program manager"],
    "Operations / Logistics": ["operations manager", "logistics", "supply chain"],
    "Transcription / Translation": ["transcription", "translation", "translator", "interpreter"],
  };
  
  // First, check for explicit ROLE mentions in the job description
  // Look for patterns like "ROLE: Sales" or "Position: Customer Service"
  const rolePattern = /(?:role|position|job title|title|looking for|hiring)[:\s]+([a-z\s\/]+)/gi;
  const explicitRoles: string[] = [];
  let roleMatch;
  while ((roleMatch = rolePattern.exec(lowerText)) !== null) {
    explicitRoles.push(roleMatch[1].trim());
  }
  
  // Check each category
  for (const [category, keywords] of Object.entries(SKILL_CATEGORIES)) {
    const primaryKws = primaryKeywords[category] || [];
    let matchCount = 0;
    let hasPrimaryKeyword = false;
    
    // Check for primary keyword matches first
    for (const pk of primaryKws) {
      if (lowerText.includes(pk)) {
        hasPrimaryKeyword = true;
        matchCount += 3; // Primary keywords count more
      }
    }
    
    // Check for explicit role match
    for (const role of explicitRoles) {
      if (category.toLowerCase().includes(role) || role.includes(category.toLowerCase().split(" ")[0])) {
        hasPrimaryKeyword = true;
        matchCount += 5; // Explicit role mentions count most
      }
    }
    
    // Count regular keyword matches
    for (const kw of keywords) {
      // Skip very short keywords to avoid false positives
      if (kw.length < 4) continue;
      if (lowerText.includes(kw)) {
        matchCount += 1;
      }
    }
    
    // Only include if we have meaningful matches
    if (matchCount > 0) {
      matchedCategories.push({ category, matchCount, hasPrimaryKeyword });
    }
  }
  
  // Sort by match strength
  matchedCategories.sort((a, b) => {
    // Primary keyword matches first
    if (a.hasPrimaryKeyword && !b.hasPrimaryKeyword) return -1;
    if (!a.hasPrimaryKeyword && b.hasPrimaryKeyword) return 1;
    // Then by match count
    return b.matchCount - a.matchCount;
  });
  
  // Only return top categories with primary keywords, or top 3 if no primary matches
  const withPrimary = matchedCategories.filter(m => m.hasPrimaryKeyword);
  if (withPrimary.length > 0) {
    // Return categories with primary keywords (up to 4)
    return withPrimary.slice(0, 4).map(m => m.category);
  }
  
  // Fallback: return top 3 by match count (if any have 2+ matches)
  return matchedCategories
    .filter(m => m.matchCount >= 2)
    .slice(0, 3)
    .map(m => m.category);
}

export function calculateCategoryOverlap(resumeCategories: string[], jdCategories: string[]): number {
  if (jdCategories.length === 0) return 0;
  const resumeSet = new Set(resumeCategories);
  const matchCount = jdCategories.filter(cat => resumeSet.has(cat)).length;
  return matchCount;
}
