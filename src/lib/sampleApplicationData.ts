/**
 * Sample Application Data for Internal Preview
 * 
 * INTERNAL USE ONLY - For testing wizard and PDF rendering
 * This data should NOT be written to the database
 */

export const SAMPLE_APPLICATION_DATA = {
  personal_info: {
    firstName: "John",
    middleName: "Michael",
    lastName: "Doe",
    ssn: "123-45-6789",
    dob: "1985-03-15",
    phone: "(555) 123-4567",
    email: "john.doe@example.com",
    address: "123 Main Street",
    city: "Chicago",
    state: "IL",
    zip: "60601",
    legallyAuthorized: "yes",
    felonyConviction: "no",
  },
  license_info: {
    licenseNumber: "D123-4567-8901",
    licenseState: "IL",
    licenseClass: "A",
    endorsements: ["H", "N", "T"],
    expirationDate: "2027-03-15",
    yearsExperience: 8,
    deniedLicense: "no",
    suspendedRevoked: "no",
  },
  employment_history: [
    {
      companyName: "ABC Trucking Co.",
      position: "OTR Driver",
      address: "456 Industrial Blvd, Chicago, IL 60602",
      phone: "(555) 234-5678",
      supervisor: "Mike Johnson",
      startDate: "2020-01-15",
      endDate: "2024-01-10",
      reasonForLeaving: "Seeking better opportunities",
    },
    {
      companyName: "XYZ Logistics",
      position: "Regional Driver",
      address: "789 Commerce St, Springfield, IL 62701",
      phone: "(555) 345-6789",
      supervisor: "Sarah Williams",
      startDate: "2018-06-01",
      endDate: "2019-12-31",
      reasonForLeaving: "Company downsizing",
    },
  ],
  driving_history: {
    accidents: [],
    violations: [],
  },
  emergency_contacts: [
    {
      firstName: "Jane",
      lastName: "Doe",
      phone: "(555) 987-6543",
      address: "123 Main Street, Chicago, IL 60601",
      relationship: "Spouse",
    },
    {
      firstName: "Robert",
      lastName: "Smith",
      phone: "(555) 876-5432",
      address: "456 Oak Ave, Chicago, IL 60603",
      relationship: "Brother",
    },
  ],
  document_upload: {
    driversLicense: true,
    socialSecurity: true,
    medicalCard: true,
  },
  direct_deposit: {
    firstName: "John",
    lastName: "Doe",
    email: "john.doe@example.com",
    bankName: "First National Bank",
    routingNumber: "071000013",
    checkingNumber: "123456789",
    accountType: "checking",
  },
  why_hire_you: {
    statement: "I am a dedicated professional driver with over 8 years of experience in OTR and regional trucking. I have maintained a clean driving record throughout my career and take pride in delivering loads on time while ensuring the highest safety standards. I am looking for a company that values its drivers and offers growth opportunities.",
  },
  // Metadata for display
  status: "in_progress",
  current_step: 5,
  updated_at: new Date().toISOString(),
};

export const SAMPLE_COMPANY_PROFILE = {
  company_name: "Sample Trucking Company",
  logo_url: null,
  address: "1000 Corporate Drive",
  city: "Chicago",
  state: "IL",
  zip: "60601",
  phone: "(800) 555-0100",
  email: "hr@sampletrucking.com",
};

export const SAMPLE_INVITE = {
  id: "preview-invite-id",
  email: "john.doe@example.com",
  name: "John Doe",
};
