// J1939 SPN/FMI Diagnostic Trouble Code Lookup Database
// Reference: SAE J1939-73 and TMC standards

export interface DTCInfo {
  spn: number;
  fmi?: number;
  component: string;
  description: string;
  severity: 'critical' | 'warning' | 'info';
  possibleCauses?: string[];
  recommendedAction?: string;
}

// Common FMI (Failure Mode Identifier) descriptions
export const FMI_DESCRIPTIONS: Record<number, string> = {
  0: "Data Valid But Above Normal Operational Range - Most Severe Level",
  1: "Data Valid But Below Normal Operational Range - Most Severe Level",
  2: "Data Erratic, Intermittent, or Incorrect",
  3: "Voltage Above Normal, or Shorted to High Source",
  4: "Voltage Below Normal, or Shorted to Low Source",
  5: "Current Below Normal or Open Circuit",
  6: "Current Above Normal or Grounded Circuit",
  7: "Mechanical System Not Responding or Out of Adjustment",
  8: "Abnormal Frequency or Pulse Width or Period",
  9: "Abnormal Update Rate",
  10: "Abnormal Rate of Change",
  11: "Root Cause Not Known",
  12: "Bad Intelligent Device or Component",
  13: "Out of Calibration",
  14: "Special Instructions",
  15: "Data Valid But Above Normal Operating Range - Least Severe Level",
  16: "Data Valid But Above Normal Operating Range - Moderately Severe Level",
  17: "Data Valid But Below Normal Operating Range - Least Severe Level",
  18: "Data Valid But Below Normal Operating Range - Moderately Severe Level",
  19: "Received Network Data in Error",
  20: "Data Drifted High",
  21: "Data Drifted Low",
  31: "Condition Exists"
};

// Common J1939 SPN codes for heavy-duty trucks
export const SPN_DATABASE: Record<number, { component: string; description: string; severity: DTCInfo['severity'] }> = {
  // Engine Coolant
  91: { component: "Throttle Position", description: "Accelerator Pedal Position", severity: "warning" },
  100: { component: "Engine Oil Pressure", description: "Engine Oil Pressure Sensor", severity: "critical" },
  101: { component: "Engine Crankcase Pressure", description: "Crankcase Pressure Sensor", severity: "warning" },
  102: { component: "Boost Pressure", description: "Turbocharger Boost Pressure", severity: "warning" },
  105: { component: "Intake Manifold Temperature", description: "Intake Air Temperature Sensor", severity: "warning" },
  108: { component: "Barometric Pressure", description: "Barometric Pressure Sensor", severity: "info" },
  110: { component: "Engine Coolant Temperature", description: "Engine Coolant Temperature Sensor", severity: "critical" },
  111: { component: "Engine Coolant Level", description: "Coolant Level Sensor", severity: "critical" },
  157: { component: "Fuel Rail Pressure", description: "Fuel Injection Pressure", severity: "critical" },
  158: { component: "Battery Voltage", description: "Main Battery/Electrical System", severity: "warning" },
  168: { component: "Battery Voltage", description: "Electrical System Voltage", severity: "warning" },
  171: { component: "Ambient Air Temperature", description: "Outside Air Temperature Sensor", severity: "info" },
  174: { component: "Fuel Temperature", description: "Fuel Temperature Sensor", severity: "warning" },
  175: { component: "Engine Oil Temperature", description: "Engine Oil Temperature Sensor", severity: "warning" },
  183: { component: "Fuel Rate", description: "Engine Fuel Rate", severity: "info" },
  190: { component: "Engine Speed", description: "Engine RPM Sensor", severity: "critical" },
  
  // Aftertreatment (DEF/SCR)
  520: { component: "Vehicle Speed", description: "Vehicle Speed Sensor", severity: "warning" },
  520210: { component: "Aftertreatment SCR Conversion", description: "DEF/SCR System Efficiency", severity: "warning" },
  521: { component: "Transmission Range", description: "Transmission Range Selector", severity: "warning" },
  524: { component: "Transmission Clutch", description: "Transmission Clutch Disengaged Switch", severity: "warning" },
  558: { component: "Accelerator Pedal", description: "Accelerator Pedal Sensor 1", severity: "warning" },
  559: { component: "Accelerator Pedal 2", description: "Accelerator Pedal Sensor 2", severity: "warning" },
  563: { component: "Idle Validation", description: "Idle Shutdown Override Switch", severity: "info" },
  583: { component: "ECU Information", description: "Controller Power Relay", severity: "warning" },
  
  // DPF/Aftertreatment
  1761: { component: "Aftertreatment DPF", description: "DPF Soot Load", severity: "warning" },
  2791: { component: "EGR Mass Flow", description: "EGR Mass Flow Sensor", severity: "warning" },
  3031: { component: "Aftertreatment SCR Inlet", description: "SCR Inlet NOx Sensor", severity: "warning" },
  3226: { component: "Aftertreatment SCR Outlet", description: "SCR Outlet NOx Sensor", severity: "warning" },
  3361: { component: "DEF Tank Level", description: "Diesel Exhaust Fluid Tank Level", severity: "warning" },
  3362: { component: "DEF Tank Temperature", description: "Diesel Exhaust Fluid Temperature", severity: "warning" },
  3363: { component: "DEF Dosing", description: "DEF Dosing System", severity: "warning" },
  3364: { component: "DEF Quality", description: "Diesel Exhaust Fluid Quality", severity: "warning" },
  
  // Transmission
  609: { component: "Transmission Filter", description: "Transmission Oil Filter Differential Pressure", severity: "warning" },
  633: { component: "Cruise Control", description: "Cruise Control Enable Switch", severity: "info" },
  639: { component: "J1939 Network", description: "J1939 Network Link Error", severity: "warning" },
  
  // Other Common
  84: { component: "Wheel Speed", description: "Wheel-Based Vehicle Speed", severity: "warning" },
  94: { component: "Fuel Delivery Pressure", description: "Fuel Delivery Pressure", severity: "warning" },
  97: { component: "Water in Fuel", description: "Water in Fuel Indicator", severity: "warning" },
  98: { component: "Engine Oil Level", description: "Engine Oil Level Sensor", severity: "warning" },
  107: { component: "Air Filter Restriction", description: "Air Filter Differential Pressure", severity: "warning" },
  411: { component: "EGR Valve Position", description: "Exhaust Gas Recirculation Valve", severity: "warning" },
  412: { component: "EGR Temperature", description: "EGR Temperature Sensor", severity: "warning" },
  1136: { component: "Engine Torque", description: "Engine Torque Mode", severity: "info" },
  1569: { component: "Engine Protection", description: "Engine Protection Torque Derate", severity: "critical" },
  1675: { component: "Engine Start", description: "Engine Starter Motor Relay", severity: "warning" },
  2000: { component: "Aftertreatment Status", description: "Aftertreatment System Status", severity: "warning" },
  3251: { component: "Aftertreatment DOC Intake", description: "DOC Intake Temperature", severity: "warning" },
  3242: { component: "Aftertreatment DPF Outlet", description: "DPF Outlet Temperature", severity: "warning" },
  4364: { component: "Aftertreatment Fuel Pressure", description: "Aftertreatment Fuel Pressure", severity: "warning" },
  4765: { component: "Aftertreatment SCR", description: "SCR Catalyst Conversion Efficiency", severity: "warning" },
  5246: { component: "Aftertreatment DEF", description: "DEF Dosing Unit", severity: "warning" },
};

// Parse a fault code string like "SPN 111 FMI 3: Engine Coolant Level 1"
export function parseDTCCode(codeString: string): { spn: number | null; fmi: number | null; rawDescription: string } {
  // Try to match "SPN XXX FMI Y" pattern
  const spnFmiMatch = codeString.match(/SPN\s*(\d+)\s*FMI\s*(\d+)/i);
  if (spnFmiMatch) {
    return {
      spn: parseInt(spnFmiMatch[1]),
      fmi: parseInt(spnFmiMatch[2]),
      rawDescription: codeString.replace(/SPN\s*\d+\s*FMI\s*\d+:?\s*/i, '').trim()
    };
  }

  // Try to match just "SPN XXX" pattern
  const spnOnlyMatch = codeString.match(/SPN\s*(\d+)/i);
  if (spnOnlyMatch) {
    return {
      spn: parseInt(spnOnlyMatch[1]),
      fmi: null,
      rawDescription: codeString.replace(/SPN\s*\d+:?\s*/i, '').trim()
    };
  }

  return { spn: null, fmi: null, rawDescription: codeString };
}

// Get detailed info for a fault code
export function getDTCInfo(codeString: string): DTCInfo | null {
  const parsed = parseDTCCode(codeString);
  
  if (parsed.spn === null) {
    return null;
  }

  const spnInfo = SPN_DATABASE[parsed.spn];
  
  if (spnInfo) {
    const fmiDesc = parsed.fmi !== null ? FMI_DESCRIPTIONS[parsed.fmi] : undefined;
    
    return {
      spn: parsed.spn,
      fmi: parsed.fmi ?? undefined,
      component: spnInfo.component,
      description: spnInfo.description,
      severity: spnInfo.severity,
      possibleCauses: fmiDesc ? [fmiDesc] : undefined,
      recommendedAction: getRecommendedAction(spnInfo.severity)
    };
  }

  // Return basic info even if SPN not in database
  return {
    spn: parsed.spn,
    fmi: parsed.fmi ?? undefined,
    component: parsed.rawDescription || "Unknown Component",
    description: parsed.rawDescription || `SPN ${parsed.spn}`,
    severity: "warning",
    possibleCauses: parsed.fmi !== null ? [FMI_DESCRIPTIONS[parsed.fmi] || "Unknown failure mode"] : undefined
  };
}

function getRecommendedAction(severity: DTCInfo['severity']): string {
  switch (severity) {
    case 'critical':
      return "Stop vehicle safely and inspect immediately. Do not continue driving.";
    case 'warning':
      return "Schedule inspection soon. Monitor for changes in vehicle performance.";
    case 'info':
      return "Note for next scheduled maintenance. Low priority.";
  }
}

// Generate external lookup URL for a DTC code
export function getDTCLookupUrl(spn: number, fmi?: number): string {
  // TruckFaultCodes.com is a good free resource for J1939 codes
  if (fmi !== undefined) {
    return `https://www.truckfaultcodes.com/search.php?q=SPN+${spn}+FMI+${fmi}`;
  }
  return `https://www.truckfaultcodes.com/search.php?q=SPN+${spn}`;
}

// Get severity color classes
export function getSeverityColor(severity: DTCInfo['severity']): { bg: string; text: string; border: string } {
  switch (severity) {
    case 'critical':
      return {
        bg: 'bg-red-50 dark:bg-red-950/30',
        text: 'text-red-700 dark:text-red-400',
        border: 'border-red-200 dark:border-red-900'
      };
    case 'warning':
      return {
        bg: 'bg-amber-50 dark:bg-amber-950/30',
        text: 'text-amber-700 dark:text-amber-400',
        border: 'border-amber-200 dark:border-amber-900'
      };
    case 'info':
      return {
        bg: 'bg-blue-50 dark:bg-blue-950/30',
        text: 'text-blue-700 dark:text-blue-400',
        border: 'border-blue-200 dark:border-blue-900'
      };
  }
}
