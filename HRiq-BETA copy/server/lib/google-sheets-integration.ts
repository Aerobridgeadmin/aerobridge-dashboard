import { google } from 'googleapis';
import { db } from '../db';
import { hriqEmployees } from '@shared/schema';
import { eq } from 'drizzle-orm';

let connectionSettings: any;

async function getAccessToken() {
  if (connectionSettings && connectionSettings.settings.expires_at && new Date(connectionSettings.settings.expires_at).getTime() > Date.now()) {
    return connectionSettings.settings.access_token;
  }
  
  const hostname = process.env.REPLIT_CONNECTORS_HOSTNAME;
  const xReplitToken = process.env.REPL_IDENTITY 
    ? 'repl ' + process.env.REPL_IDENTITY 
    : process.env.WEB_REPL_RENEWAL 
    ? 'depl ' + process.env.WEB_REPL_RENEWAL 
    : null;

  if (!xReplitToken) {
    throw new Error('X_REPLIT_TOKEN not found for repl/depl');
  }

  connectionSettings = await fetch(
    'https://' + hostname + '/api/v2/connection?include_secrets=true&connector_names=google-sheet',
    {
      headers: {
        'Accept': 'application/json',
        'X_REPLIT_TOKEN': xReplitToken
      }
    }
  ).then(res => res.json()).then(data => data.items?.[0]);

  const accessToken = connectionSettings?.settings?.access_token || connectionSettings.settings?.oauth?.credentials?.access_token;

  if (!connectionSettings || !accessToken) {
    throw new Error('Google Sheet not connected');
  }
  return accessToken;
}

async function getUncachableGoogleSheetClient() {
  const accessToken = await getAccessToken();

  const oauth2Client = new google.auth.OAuth2();
  oauth2Client.setCredentials({
    access_token: accessToken
  });

  return google.sheets({ version: 'v4', auth: oauth2Client });
}

export async function isGoogleSheetsConnected(): Promise<boolean> {
  try {
    await getAccessToken();
    return true;
  } catch {
    return false;
  }
}

export interface SheetSyncConfig {
  spreadsheetId: string;
  sheetName?: string;
}

async function ensureEmployeesSheet(sheets: any, spreadsheetId: string, targetSheetName: string): Promise<string> {
  const spreadsheet = await sheets.spreadsheets.get({
    spreadsheetId,
    fields: 'sheets.properties.title'
  });
  
  const existingSheets = spreadsheet.data.sheets?.map((s: any) => s.properties?.title) || [];
  
  if (existingSheets.includes(targetSheetName)) {
    return targetSheetName;
  }
  
  await sheets.spreadsheets.batchUpdate({
    spreadsheetId,
    requestBody: {
      requests: [{
        addSheet: {
          properties: { title: targetSheetName }
        }
      }]
    }
  });
  
  return targetSheetName;
}

export async function exportEmployeesToSheet(config: SheetSyncConfig): Promise<{ rowsWritten: number; spreadsheetUrl: string }> {
  const sheets = await getUncachableGoogleSheetClient();
  
  const targetSheetName = config.sheetName || 'Employees';
  const sheetName = await ensureEmployeesSheet(sheets, config.spreadsheetId, targetSheetName);
  
  const employees = await db.select().from(hriqEmployees);
  
  const headers = [
    'Employee Number',
    'First Name',
    'Last Name',
    'Work Email',
    'Personal Email',
    'Phone',
    'Department',
    'Role',
    'Employment Type',
    'Status',
    'Start Date',
    'End Date',
    'Location',
    'Payment Platform',
    'Hourly Rate',
    'Emergency Contact Name',
    'Emergency Contact Phone',
    'Emergency Contact Relation',
    'Time Doctor Email'
  ];
  
  const rows = employees.map(e => [
    e.employeeNumber,
    e.legalFirstName,
    e.legalLastName,
    e.workEmail || '',
    e.personalEmail || '',
    e.phoneNumber || '',
    e.department || '',
    e.role || '',
    e.employmentType,
    e.employmentStatus,
    e.startDate || '',
    e.endDate || '',
    e.location || '',
    e.paymentPlatform || '',
    e.hourlyRate || '',
    e.emergencyContactName || '',
    e.emergencyContactPhone || '',
    e.emergencyContactRelation || '',
    e.timeDoctorEmail || ''
  ]);
  
  await sheets.spreadsheets.values.clear({
    spreadsheetId: config.spreadsheetId,
    range: `${sheetName}!A:Z`,
  });
  
  await sheets.spreadsheets.values.update({
    spreadsheetId: config.spreadsheetId,
    range: `${sheetName}!A1`,
    valueInputOption: 'RAW',
    requestBody: {
      values: [headers, ...rows]
    }
  });
  
  return {
    rowsWritten: rows.length,
    spreadsheetUrl: `https://docs.google.com/spreadsheets/d/${config.spreadsheetId}`
  };
}

export async function importEmployeesFromSheet(config: SheetSyncConfig): Promise<{ imported: number; updated: number; errors: string[] }> {
  const sheets = await getUncachableGoogleSheetClient();
  const targetSheetName = config.sheetName || 'Employees';
  
  const spreadsheet = await sheets.spreadsheets.get({
    spreadsheetId: config.spreadsheetId,
    fields: 'sheets.properties.title'
  });
  
  const existingSheets = spreadsheet.data.sheets?.map((s: any) => s.properties?.title) || [];
  
  let sheetName = targetSheetName;
  if (!existingSheets.includes(targetSheetName)) {
    if (existingSheets.length > 0) {
      sheetName = existingSheets[0];
    } else {
      return { imported: 0, updated: 0, errors: [`Sheet "${targetSheetName}" not found`] };
    }
  }
  
  const response = await sheets.spreadsheets.values.get({
    spreadsheetId: config.spreadsheetId,
    range: `${sheetName}!A:Z`,
  });
  
  const rows = response.data.values;
  if (!rows || rows.length < 2) {
    return { imported: 0, updated: 0, errors: ['No data found in sheet'] };
  }
  
  const headers = rows[0].map((h: string) => h.toLowerCase().replace(/\s+/g, '_'));
  const dataRows = rows.slice(1);
  
  const headerMap: Record<string, number> = {};
  headers.forEach((h: string, i: number) => { headerMap[h] = i; });
  
  let imported = 0;
  let updated = 0;
  const errors: string[] = [];
  
  for (const row of dataRows) {
    try {
      // Get value helper with multiple column name fallbacks
      const getValue = (...keys: string[]): string | null => {
        for (const key of keys) {
          const idx = headerMap[key];
          if (idx !== undefined && row[idx]) return row[idx];
        }
        return null;
      };
      
      // Parse full name into first/last
      const fullName = getValue('full_name', 'employee_name', 'name');
      let firstName = getValue('first_name', 'legal_first_name') || '';
      let lastName = getValue('last_name', 'legal_last_name') || '';
      
      if (fullName && !firstName && !lastName) {
        const parts = fullName.trim().split(/\s+/);
        firstName = parts[0] || '';
        lastName = parts.slice(1).join(' ') || '';
      }
      
      // Get email as unique identifier if no employee_number
      const email = getValue('email', 'email_address', 'work_email', 'personal_email', 'personal_email_address');
      let employeeNumber = getValue('employee_number');
      
      // Generate employee number from email if not provided
      if (!employeeNumber && email) {
        employeeNumber = `EMP-${email.split('@')[0].toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 8)}`;
      }
      
      if (!employeeNumber || (!firstName && !lastName && !email)) continue;
      
      // Parse start date
      let startDate: Date | null = null;
      const startDateStr = getValue('start_date', 'hire_date');
      if (startDateStr) {
        try {
          startDate = new Date(startDateStr);
          if (isNaN(startDate.getTime())) startDate = null;
        } catch { startDate = null; }
      }
      
      // Parse date of birth
      let dateOfBirth: Date | null = null;
      const dobStr = getValue('date_of_birth', 'dob', 'birthday');
      if (dobStr) {
        try {
          dateOfBirth = new Date(dobStr);
          if (isNaN(dateOfBirth.getTime())) dateOfBirth = null;
        } catch { dateOfBirth = null; }
      }
      
      // Map status
      const statusRaw = getValue('status', 'employment_status') || '';
      let employmentStatus = 'active';
      if (statusRaw.toLowerCase().includes('hired')) employmentStatus = 'active';
      else if (statusRaw.toLowerCase().includes('terminated') || statusRaw.toLowerCase().includes('inactive')) employmentStatus = 'terminated';
      else if (statusRaw.toLowerCase().includes('onboard')) employmentStatus = 'onboarding';
      
      const employeeData = {
        legalFirstName: firstName,
        legalLastName: lastName,
        workEmail: getValue('work_email', 'email', 'email_address') || null,
        personalEmail: getValue('personal_email', 'personal_email_address') || null,
        phoneNumber: getValue('phone', 'phone_number', 'mobile_number') || null,
        mobileNumber: getValue('mobile_number', 'mobile') || null,
        homePhone: getValue('home_phone_number', 'home_phone') || null,
        department: getValue('department') || null,
        role: getValue('role', 'position', 'job_title') || null,
        location: getValue('location', 'city') || null,
        paymentPlatform: getValue('payment_platform', 'payment_method') || null,
        hourlyRate: getValue('hourly_rate', 'rate') || null,
        // Address fields
        streetAddress: getValue('home_street_address', 'street_address', 'address') || null,
        city: getValue('city') || null,
        stateProvince: getValue('province/state', 'state_province', 'state', 'province') || null,
        postalCode: getValue('postalcode/zipcode', 'postal_code', 'zip_code', 'zipcode') || null,
        country: getValue('country') || null,
        // Bank fields
        bankName: getValue('bank_name', 'bank') || null,
        bankAccountNumber: getValue('bank_account_number', 'account_number') || null,
        bankAccountName: getValue('account_name', 'bank_account_name') || null,
        bankSwiftCode: getValue('swift_code', 'bank_swift_code') || null,
        bankAddress: getValue('bank_address_(city,_state/province,_zip_code):', 'bank_address') || null,
        // Dates
        startDate: startDate,
        dateOfBirth: dateOfBirth,
        // CRM link
        recruitCrmSlug: getValue('crm_link', 'crm_slug') || null,
        // Emergency contact
        emergencyContactName: getValue('emergency_contact_name') || null,
        emergencyContactPhone: getValue('emergency_contact_phone') || null,
        emergencyContactRelation: getValue('emergency_contact_relation') || null,
        timeDoctorEmail: getValue('time_doctor_email') || null,
        employmentStatus,
      };
      
      const existing = await db.select()
        .from(hriqEmployees)
        .where(eq(hriqEmployees.employeeNumber, employeeNumber))
        .limit(1);
      
      if (existing.length > 0) {
        await db.update(hriqEmployees)
          .set({ ...employeeData, updatedAt: new Date() })
          .where(eq(hriqEmployees.employeeNumber, employeeNumber));
        updated++;
      } else {
        await db.insert(hriqEmployees).values({
          employeeNumber,
          ...employeeData,
          employmentType: 'full_time',
          onboardingStatus: 'not_started',
        });
        imported++;
      }
    } catch (error: any) {
      errors.push(`Row error: ${error.message}`);
    }
  }
  
  return { imported, updated, errors };
}

export async function listSpreadsheets(): Promise<Array<{ id: string; name: string }>> {
  const accessToken = await getAccessToken();
  
  const oauth2Client = new google.auth.OAuth2();
  oauth2Client.setCredentials({ access_token: accessToken });
  
  const drive = google.drive({ version: 'v3', auth: oauth2Client });
  
  const response = await drive.files.list({
    q: "mimeType='application/vnd.google-apps.spreadsheet'",
    fields: 'files(id, name)',
    pageSize: 50,
    orderBy: 'modifiedTime desc'
  });
  
  return (response.data.files || []).map(f => ({
    id: f.id!,
    name: f.name!
  }));
}

export async function createSpreadsheet(title: string): Promise<{ spreadsheetId: string; spreadsheetUrl: string }> {
  const sheets = await getUncachableGoogleSheetClient();
  
  const response = await sheets.spreadsheets.create({
    requestBody: {
      properties: { title },
      sheets: [{ properties: { title: 'Employees' } }]
    }
  });
  
  return {
    spreadsheetId: response.data.spreadsheetId!,
    spreadsheetUrl: response.data.spreadsheetUrl!
  };
}
