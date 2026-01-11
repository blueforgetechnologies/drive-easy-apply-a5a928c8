import * as XLSX from 'xlsx';
import { format } from 'date-fns';

export type EntityType = 'assets' | 'carriers' | 'payees' | 'drivers' | 'dispatchers' | 'customers';

// Column definitions for each entity type
const ENTITY_COLUMNS: Record<EntityType, { header: string; key: string; transform?: (v: any) => any }[]> = {
  assets: [
    { header: 'Unit ID', key: 'vehicle_number' },
    { header: 'Status', key: 'status' },
    { header: 'Carrier', key: 'carrier' },
    { header: 'Make', key: 'make' },
    { header: 'Model', key: 'model' },
    { header: 'Year', key: 'year' },
    { header: 'VIN', key: 'vin' },
    { header: 'License Plate', key: 'license_plate' },
    { header: 'Asset Type', key: 'asset_type' },
    { header: 'Asset Subtype', key: 'asset_subtype' },
    { header: 'Vehicle Size', key: 'vehicle_size' },
    { header: 'Payload', key: 'payload' },
    { header: 'Length', key: 'dimensions_length' },
    { header: 'Width', key: 'dimensions_width' },
    { header: 'Height', key: 'dimensions_height' },
    { header: 'Fuel Type', key: 'fuel_type' },
    { header: 'Odometer', key: 'odometer' },
    { header: 'Registration Exp', key: 'registration_exp_date' },
    { header: 'Insurance Expiry', key: 'insurance_expiry' },
    { header: 'Lift Gate', key: 'lift_gate', transform: (v) => v ? 'Yes' : 'No' },
    { header: 'Air Ride', key: 'air_ride', transform: (v) => v ? 'Yes' : 'No' },
    { header: 'Notes', key: 'notes' },
  ],
  carriers: [
    { header: 'Name', key: 'name' },
    { header: 'Status', key: 'status' },
    { header: 'MC Number', key: 'mc_number' },
    { header: 'DOT Number', key: 'dot_number' },
    { header: 'Contact Name', key: 'contact_name' },
    { header: 'Email', key: 'email' },
    { header: 'Phone', key: 'phone' },
    { header: 'Address', key: 'address' },
    { header: 'SAFER Status', key: 'safer_status' },
    { header: 'Safety Rating', key: 'safety_rating' },
    { header: 'Dispatch Name', key: 'dispatch_name' },
    { header: 'Dispatch Phone', key: 'dispatch_phone' },
    { header: 'Dispatch Email', key: 'dispatch_email' },
    { header: 'After Hours Phone', key: 'after_hours_phone' },
    { header: 'Emergency Contact Name', key: 'emergency_contact_name' },
    { header: 'Emergency Contact Phone', key: 'emergency_contact_cell_phone' },
    { header: 'Show in Fleet Financials', key: 'show_in_fleet_financials', transform: (v) => v ? 'Yes' : 'No' },
  ],
  payees: [
    { header: 'Name', key: 'name' },
    { header: 'Type', key: 'type' },
    { header: 'Status', key: 'status' },
    { header: 'Payment Method', key: 'payment_method' },
    { header: 'Bank Name', key: 'bank_name' },
    { header: 'Account Number', key: 'account_number' },
    { header: 'Routing Number', key: 'routing_number' },
    { header: 'Email', key: 'email' },
    { header: 'Phone', key: 'phone' },
    { header: 'Address', key: 'address' },
  ],
  drivers: [
    { header: 'First Name', key: 'personal_info.firstName' },
    { header: 'Last Name', key: 'personal_info.lastName' },
    { header: 'Status', key: 'driver_status' },
    { header: 'Email', key: 'personal_info.email' },
    { header: 'Phone', key: 'cell_phone' },
    { header: 'Address', key: 'driver_address' },
    { header: 'License Number', key: 'license_info.licenseNumber' },
    { header: 'License State', key: 'license_info.licenseState' },
    { header: 'License Expiry', key: 'license_info.licenseExpiry' },
    { header: 'Medical Card Expiry', key: 'medical_card_expiry' },
    { header: 'Hired Date', key: 'hired_date' },
    { header: 'Pay Method', key: 'pay_method' },
    { header: 'Base Salary', key: 'base_salary' },
    { header: 'Hourly Rate', key: 'hourly_rate' },
    { header: 'Pay Per Mile', key: 'pay_per_mile' },
    { header: 'Bank Name', key: 'bank_name' },
    { header: 'Routing Number', key: 'routing_number' },
    { header: 'Account Number', key: 'checking_number' },
  ],
  dispatchers: [
    { header: 'First Name', key: 'first_name' },
    { header: 'Last Name', key: 'last_name' },
    { header: 'Status', key: 'status' },
    { header: 'Email', key: 'email' },
    { header: 'Phone', key: 'phone' },
    { header: 'Address', key: 'address' },
    { header: 'Role', key: 'role' },
    { header: 'Hire Date', key: 'hire_date' },
    { header: 'Pay Percentage', key: 'pay_percentage' },
    { header: 'Assigned Trucks', key: 'assigned_trucks' },
    { header: 'License Number', key: 'license_number' },
    { header: 'License Expiry', key: 'license_expiration_date' },
    { header: 'Emergency Contact 1 Name', key: 'emergency_contact_1_name' },
    { header: 'Emergency Contact 1 Phone', key: 'emergency_contact_1_phone' },
    { header: 'Notes', key: 'notes' },
  ],
  customers: [
    { header: 'Name', key: 'name' },
    { header: 'Status', key: 'status' },
    { header: 'Customer Type', key: 'customer_type' },
    { header: 'MC Number', key: 'mc_number' },
    { header: 'DOT Number', key: 'dot_number' },
    { header: 'Contact Name', key: 'contact_name' },
    { header: 'Email', key: 'email' },
    { header: 'Secondary Email', key: 'email_secondary' },
    { header: 'Phone', key: 'phone' },
    { header: 'Secondary Phone', key: 'phone_secondary' },
    { header: 'Mobile Phone', key: 'phone_mobile' },
    { header: 'Fax', key: 'phone_fax' },
    { header: 'Address', key: 'address' },
    { header: 'City', key: 'city' },
    { header: 'State', key: 'state' },
    { header: 'Zip', key: 'zip' },
    { header: 'Payment Terms', key: 'payment_terms' },
    { header: 'Credit Limit', key: 'credit_limit' },
    { header: 'Factoring Approval', key: 'factoring_approval' },
    { header: 'Notes', key: 'notes' },
  ],
};

// Get nested value from object using dot notation
function getNestedValue(obj: any, path: string): any {
  return path.split('.').reduce((current, key) => current?.[key], obj);
}

// Set nested value in object using dot notation
function setNestedValue(obj: any, path: string, value: any): void {
  const keys = path.split('.');
  const lastKey = keys.pop()!;
  const target = keys.reduce((current, key) => {
    if (current[key] === undefined) current[key] = {};
    return current[key];
  }, obj);
  target[lastKey] = value;
}

export function exportToExcel(data: any[], entityType: EntityType, filename?: string): void {
  const columns = ENTITY_COLUMNS[entityType];
  
  // Create rows with headers
  const headers = columns.map(col => col.header);
  const rows = data.map(item => 
    columns.map(col => {
      const value = getNestedValue(item, col.key);
      return col.transform ? col.transform(value) : (value ?? '');
    })
  );

  // Create worksheet
  const ws = XLSX.utils.aoa_to_sheet([headers, ...rows]);
  
  // Set column widths
  ws['!cols'] = headers.map(() => ({ wch: 20 }));

  // Create workbook
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, entityType.charAt(0).toUpperCase() + entityType.slice(1));

  // Generate filename
  const exportFilename = filename || `${entityType}_export_${format(new Date(), 'yyyy-MM-dd')}.xlsx`;

  // Download
  XLSX.writeFile(wb, exportFilename);
}

export function parseExcelFile(file: File): Promise<any[]> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    
    reader.onload = (e) => {
      try {
        const data = e.target?.result;
        const workbook = XLSX.read(data, { type: 'binary' });
        const sheetName = workbook.SheetNames[0];
        const worksheet = workbook.Sheets[sheetName];
        const jsonData = XLSX.utils.sheet_to_json(worksheet, { defval: '' });
        resolve(jsonData);
      } catch (error) {
        reject(error);
      }
    };
    
    reader.onerror = (error) => reject(error);
    reader.readAsBinaryString(file);
  });
}

export function mapExcelRowToEntity(row: any, entityType: EntityType): any {
  const columns = ENTITY_COLUMNS[entityType];
  const result: any = {};
  
  columns.forEach(col => {
    const excelValue = row[col.header];
    if (excelValue !== undefined && excelValue !== '') {
      // Handle boolean transforms in reverse
      let value = excelValue;
      if (col.transform) {
        if (excelValue === 'Yes' || excelValue === 'yes' || excelValue === 'TRUE' || excelValue === true) {
          value = true;
        } else if (excelValue === 'No' || excelValue === 'no' || excelValue === 'FALSE' || excelValue === false) {
          value = false;
        }
      }
      setNestedValue(result, col.key, value);
    }
  });
  
  return result;
}

export function downloadTemplate(entityType: EntityType): void {
  const columns = ENTITY_COLUMNS[entityType];
  const headers = columns.map(col => col.header);
  
  // Create worksheet with just headers
  const ws = XLSX.utils.aoa_to_sheet([headers]);
  
  // Set column widths
  ws['!cols'] = headers.map(() => ({ wch: 20 }));

  // Create workbook
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, entityType.charAt(0).toUpperCase() + entityType.slice(1));

  // Download
  XLSX.writeFile(wb, `${entityType}_template.xlsx`);
}

export function getEntityColumns(entityType: EntityType) {
  return ENTITY_COLUMNS[entityType];
}
