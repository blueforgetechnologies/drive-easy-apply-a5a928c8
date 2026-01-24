/**
 * Sample Application Data for Internal Preview
 * 
 * INTERNAL USE ONLY - For testing wizard and PDF rendering
 * This data should NOT be written to the database
 */

export const SAMPLE_APPLICATION_DATA = {
  personal_info: {
    firstName: "John",
    middleName: "A",
    lastName: "Smith",
    dob: "1989-06-14",
    ssn: "123-45-6789",
    phone: "(614) 555-0199",
    email: "john.smith@example.com",
    address: "1234 West Broad St",
    city: "Columbus",
    state: "OH",
    zip: "43228",
    legallyAuthorized: "Yes",
    felonyConviction: "No",
    hasTwicCard: true,
    twicExpiration: "2028-10-01",
    hasPassport: true,
    passportExpiration: "2030-05-20",
  },
  license_info: {
    licenseNumber: "OH1234567",
    licenseState: "OH",
    licenseClass: "A",
    endorsements: ["T", "X"],
    expirationDate: "2027-03-15",
    yearsExperience: 7,
    medicalCardExpiration: "2026-11-30",
    equipmentExperience: ["Dry Van", "Reefer", "Flatbed"],
    suspendedRevoked: "No",
    deniedLicense: "No",
    teamDriving: "Yes",
  },
  employment_history: [
    {
      companyName: "Midwest Freight Co",
      position: "Company Driver",
      address: "8000 Industrial Pkwy, Columbus, OH 43228",
      phone: "(614) 555-0144",
      supervisor: "Mike Reynolds",
      startDate: "2023-01-01",
      endDate: "2025-01-01",
      equipmentDriven: "Dry Van",
      reasonForLeaving: "Better opportunity",
    },
    {
      companyName: "Buckeye Logistics",
      position: "OTR Driver",
      address: "500 Logistics Ln, Grove City, OH 43123",
      phone: "(614) 555-0177",
      supervisor: "Sarah Collins",
      startDate: "2021-01-01",
      endDate: "2023-01-01",
      equipmentDriven: "Reefer",
      reasonForLeaving: "Schedule change",
    },
    {
      companyName: "Central Ohio Transport",
      position: "Regional Driver",
      address: "2000 Transit Dr, Columbus, OH 43207",
      phone: "(614) 555-0133",
      supervisor: "James Ortega",
      startDate: "2019-01-01",
      endDate: "2021-01-01",
      equipmentDriven: "Flatbed",
      reasonForLeaving: "Company downsizing",
    },
  ],
  driving_history: {
    accidents: [],
    violations: [],
    dui: "No",
    failedDrugTest: "No",
    licenseSuspension: "No",
    safetyAwards: "1,000,000 Mile Safe Driving Award (2024)",
  },
  emergency_contacts: [
    {
      firstName: "Emily",
      lastName: "Smith",
      relationship: "Spouse",
      phone: "(614) 555-0120",
      address: "1234 West Broad St",
      city: "Columbus",
      state: "OH",
      zip: "43228",
    },
  ],
  direct_deposit: {
    firstName: "John",
    lastName: "Smith",
    email: "john.smith@example.com",
    bankName: "Chase",
    accountType: "Checking",
    routingNumber: "021000021",
    accountNumber: "123456789",
    cashAppCashtag: "$JohnSmithTrucking",
  },
  document_upload: {
    driversLicense: true,
    socialSecurity: true,
    medicalCard: true,
    mvr: true,
    other: ["twic_card.png", "passport.png"],
  },
  why_hire_you: {
    statement: "Safety-first driver with 7 years CDL-A experience across dry van, reefer, and flatbed. Strong on-time performance, clean record, and comfortable with ELDs and night driving.",
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
  email: "john.smith@example.com",
  name: "John Smith",
};
