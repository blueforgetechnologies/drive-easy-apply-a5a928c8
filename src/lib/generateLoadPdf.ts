import jsPDF from "jspdf";

interface CompanyInfo {
  company_name: string;
  legal_name?: string | null;
  address?: string | null;
  city?: string | null;
  state?: string | null;
  zip?: string | null;
  phone?: string | null;
  email?: string | null;
  mc_number?: string | null;
  dot_number?: string | null;
  logo_url?: string | null;
}

interface LoadData {
  load_number?: string;
  reference_number?: string;
  rate?: number;
  customer_rate?: number;
  carrier_rate?: number;
  equipment_type?: string;
  cargo_description?: string;
  cargo_weight?: number;
  cargo_pieces?: number;
  temperature_required?: string;
  hazmat?: boolean;
  special_instructions?: string;
  pickup_date?: string;
  pickup_time?: string;
  pickup_address?: string;
  pickup_city?: string;
  pickup_state?: string;
  pickup_zip?: string;
  delivery_date?: string;
  delivery_time?: string;
  delivery_address?: string;
  delivery_city?: string;
  delivery_state?: string;
  delivery_zip?: string;
  shipper_name?: string;
  shipper_phone?: string;
  receiver_name?: string;
  receiver_phone?: string;
  broker_name?: string;
  broker_contact?: string;
  broker_phone?: string;
  broker_email?: string;
  broker_address?: string;
  broker_city?: string;
  broker_state?: string;
  broker_zip?: string;
  estimated_miles?: number;
  dispatch_notes?: string;
  notes?: string;
  status?: string;
}

interface CarrierInfo {
  name?: string;
  mc_number?: string;
  dot_number?: string;
  phone?: string;
  address?: string;
}

interface DriverInfo {
  firstName?: string;
  lastName?: string;
}

interface VehicleInfo {
  vehicle_number?: string;
  make?: string;
  model?: string;
}

function formatDate(dateStr?: string): string {
  if (!dateStr) return "—";
  try {
    const d = new Date(dateStr);
    return d.toLocaleDateString("en-US", { month: "2-digit", day: "2-digit", year: "numeric" });
  } catch { return dateStr; }
}

function drawHeader(doc: jsPDF, company: CompanyInfo, title: string, y: number): number {
  // Company name
  doc.setFontSize(16);
  doc.setFont("helvetica", "bold");
  doc.text(company.company_name || "Company", 14, y);
  
  // Company details
  doc.setFontSize(8);
  doc.setFont("helvetica", "normal");
  const details: string[] = [];
  if (company.address) details.push(company.address);
  const cityLine = [company.city, company.state, company.zip].filter(Boolean).join(", ");
  if (cityLine) details.push(cityLine);
  if (company.phone) details.push(`Phone: ${company.phone}`);
  if (company.mc_number) details.push(`MC# ${company.mc_number}`);
  if (company.dot_number) details.push(`DOT# ${company.dot_number}`);
  
  let detailY = y + 5;
  details.forEach(d => {
    doc.text(d, 14, detailY);
    detailY += 3.5;
  });

  // Title on the right
  doc.setFontSize(20);
  doc.setFont("helvetica", "bold");
  doc.text(title, 196, y, { align: "right" });

  // Line separator
  const lineY = Math.max(detailY + 2, y + 12);
  doc.setDrawColor(59, 130, 246);
  doc.setLineWidth(0.8);
  doc.line(14, lineY, 196, lineY);

  return lineY + 5;
}

function drawSectionTitle(doc: jsPDF, title: string, y: number): number {
  doc.setFontSize(10);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(59, 130, 246);
  doc.text(title, 14, y);
  doc.setTextColor(0, 0, 0);
  return y + 5;
}

function drawField(doc: jsPDF, label: string, value: string, x: number, y: number, labelWidth = 35): number {
  doc.setFontSize(8);
  doc.setFont("helvetica", "bold");
  doc.text(label + ":", x, y);
  doc.setFont("helvetica", "normal");
  doc.text(value || "—", x + labelWidth, y);
  return y + 4.5;
}

function drawBox(doc: jsPDF, x: number, y: number, w: number, h: number) {
  doc.setDrawColor(200, 200, 200);
  doc.setLineWidth(0.3);
  doc.rect(x, y, w, h);
}

export function generateRateConfirmation(
  load: LoadData,
  company: CompanyInfo,
  carrier?: CarrierInfo | null,
  driver?: DriverInfo | null,
  vehicle?: VehicleInfo | null,
) {
  const doc = new jsPDF();
  let y = 18;

  y = drawHeader(doc, company, "RATE CONFIRMATION", y);

  // Load info row
  doc.setFontSize(9);
  doc.setFont("helvetica", "bold");
  doc.text(`Load #: ${load.load_number || "—"}`, 14, y);
  doc.text(`Ref #: ${load.reference_number || "—"}`, 80, y);
  doc.text(`Date: ${formatDate(new Date().toISOString())}`, 150, y);
  y += 7;

  // Carrier info box
  drawBox(doc, 12, y - 3, 88, 30);
  y = drawSectionTitle(doc, "CARRIER", y);
  y = drawField(doc, "Name", carrier?.name || "—", 14, y);
  y = drawField(doc, "MC#", carrier?.mc_number || "—", 14, y);
  y = drawField(doc, "DOT#", carrier?.dot_number || "—", 14, y);
  y = drawField(doc, "Phone", carrier?.phone || "—", 14, y);

  // Broker / billing party box
  let y2 = y - 25.5;
  drawBox(doc, 104, y2 - 3, 88, 30);
  y2 = drawSectionTitle(doc, "BROKER / BILLING PARTY", y2);
  drawField(doc, "Name", load.broker_name || "—", 106, y2);
  y2 += 4.5;
  drawField(doc, "Contact", load.broker_contact || "—", 106, y2);
  y2 += 4.5;
  drawField(doc, "Phone", load.broker_phone || "—", 106, y2);
  y2 += 4.5;
  drawField(doc, "Email", load.broker_email || "—", 106, y2);

  y += 8;

  // Origin / Destination
  drawBox(doc, 12, y - 3, 88, 28);
  const originY = y;
  y = drawSectionTitle(doc, "ORIGIN (PICKUP)", y);
  y = drawField(doc, "Shipper", load.shipper_name || "—", 14, y);
  y = drawField(doc, "Address", `${load.pickup_address || ""} ${load.pickup_city || ""}, ${load.pickup_state || ""} ${load.pickup_zip || ""}`.trim() || "—", 14, y);
  y = drawField(doc, "Date", `${formatDate(load.pickup_date)} ${load.pickup_time || ""}`.trim(), 14, y);
  y = drawField(doc, "Phone", load.shipper_phone || "—", 14, y);

  let destY = originY;
  drawBox(doc, 104, destY - 3, 88, 28);
  destY = drawSectionTitle(doc, "DESTINATION (DELIVERY)", destY);
  drawField(doc, "Receiver", load.receiver_name || "—", 106, destY); destY += 4.5;
  drawField(doc, "Address", `${load.delivery_address || ""} ${load.delivery_city || ""}, ${load.delivery_state || ""} ${load.delivery_zip || ""}`.trim() || "—", 106, destY); destY += 4.5;
  drawField(doc, "Date", `${formatDate(load.delivery_date)} ${load.delivery_time || ""}`.trim(), 106, destY); destY += 4.5;
  drawField(doc, "Phone", load.receiver_phone || "—", 106, destY);

  y += 6;

  // Load details
  y = drawSectionTitle(doc, "LOAD DETAILS", y);
  drawBox(doc, 12, y - 3, 184, 18);
  const row1Y = y;
  drawField(doc, "Equipment", load.equipment_type?.replace(/_/g, " ") || "—", 14, row1Y);
  drawField(doc, "Weight", load.cargo_weight ? `${load.cargo_weight} lbs` : "—", 80, row1Y);
  drawField(doc, "Pieces", load.cargo_pieces?.toString() || "—", 140, row1Y);
  const row2Y = row1Y + 5;
  drawField(doc, "Commodity", load.cargo_description || "—", 14, row2Y);
  drawField(doc, "Miles", load.estimated_miles?.toString() || "—", 80, row2Y);
  drawField(doc, "Temp", load.temperature_required || "N/A", 140, row2Y);
  const row3Y = row2Y + 5;
  if (load.hazmat) { drawField(doc, "HAZMAT", "YES", 14, row3Y); }
  y = row3Y + 6;

  // Rate
  y = drawSectionTitle(doc, "RATE / COMPENSATION", y);
  drawBox(doc, 12, y - 3, 184, 14);
  doc.setFontSize(12);
  doc.setFont("helvetica", "bold");
  const rateAmount = load.carrier_rate || load.rate || 0;
  doc.text(`Carrier Rate: $${Number(rateAmount).toFixed(2)}`, 14, y + 3);
  doc.setFontSize(8);
  doc.setFont("helvetica", "normal");
  if (driver) {
    doc.text(`Driver: ${driver.firstName || ""} ${driver.lastName || ""}`, 106, y);
  }
  if (vehicle) {
    doc.text(`Truck: ${vehicle.vehicle_number || ""} ${vehicle.make || ""}`, 106, y + 4.5);
  }
  y += 15;

  // Special instructions
  if (load.special_instructions) {
    y = drawSectionTitle(doc, "SPECIAL INSTRUCTIONS", y);
    doc.setFontSize(8);
    doc.setFont("helvetica", "normal");
    const lines = doc.splitTextToSize(load.special_instructions, 178);
    doc.text(lines, 14, y);
    y += lines.length * 3.5 + 4;
  }

  // Signature lines
  y = Math.max(y, 220);
  doc.setDrawColor(0, 0, 0);
  doc.setLineWidth(0.3);
  doc.line(14, y + 10, 90, y + 10);
  doc.line(110, y + 10, 196, y + 10);
  doc.setFontSize(8);
  doc.text("Carrier Signature / Date", 14, y + 14);
  doc.text("Broker Signature / Date", 110, y + 14);

  // Footer
  doc.setFontSize(7);
  doc.setTextColor(128, 128, 128);
  doc.text(`Generated ${new Date().toLocaleString()} • ${company.company_name}`, 105, 290, { align: "center" });

  doc.save(`RC_${load.load_number || "load"}.pdf`);
}

export function generateBOL(
  load: LoadData,
  company: CompanyInfo,
  carrier?: CarrierInfo | null,
  driver?: DriverInfo | null,
  vehicle?: VehicleInfo | null,
) {
  const doc = new jsPDF();
  let y = 18;

  y = drawHeader(doc, company, "BILL OF LADING", y);

  // Reference row
  doc.setFontSize(9);
  doc.setFont("helvetica", "bold");
  doc.text(`B/L #: ${load.load_number || "—"}`, 14, y);
  doc.text(`Ref #: ${load.reference_number || "—"}`, 80, y);
  doc.text(`Date: ${formatDate(load.pickup_date || new Date().toISOString())}`, 150, y);
  y += 8;

  // Shipper box
  drawBox(doc, 12, y - 3, 88, 32);
  y = drawSectionTitle(doc, "SHIPPER (FROM)", y);
  y = drawField(doc, "Name", load.shipper_name || "—", 14, y);
  y = drawField(doc, "Address", load.pickup_address || "—", 14, y);
  y = drawField(doc, "City/State", `${load.pickup_city || ""}, ${load.pickup_state || ""} ${load.pickup_zip || ""}`.trim(), 14, y);
  y = drawField(doc, "Phone", load.shipper_phone || "—", 14, y);
  y = drawField(doc, "Date", `${formatDate(load.pickup_date)} ${load.pickup_time || ""}`.trim(), 14, y);

  // Consignee box
  let consY = y - 27;
  drawBox(doc, 104, consY - 3, 88, 32);
  consY = drawSectionTitle(doc, "CONSIGNEE (TO)", consY);
  drawField(doc, "Name", load.receiver_name || "—", 106, consY); consY += 4.5;
  drawField(doc, "Address", load.delivery_address || "—", 106, consY); consY += 4.5;
  drawField(doc, "City/State", `${load.delivery_city || ""}, ${load.delivery_state || ""} ${load.delivery_zip || ""}`.trim(), 106, consY); consY += 4.5;
  drawField(doc, "Phone", load.receiver_phone || "—", 106, consY); consY += 4.5;
  drawField(doc, "Date", `${formatDate(load.delivery_date)} ${load.delivery_time || ""}`.trim(), 106, consY);

  y += 8;

  // Billing / Third Party
  drawBox(doc, 12, y - 3, 184, 16);
  y = drawSectionTitle(doc, "BILL TO / THIRD PARTY", y);
  const billRow = y;
  drawField(doc, "Name", load.broker_name || "—", 14, billRow);
  drawField(doc, "Phone", load.broker_phone || "—", 106, billRow);
  y = billRow + 5;
  drawField(doc, "Address", `${load.broker_address || ""} ${load.broker_city || ""}, ${load.broker_state || ""} ${load.broker_zip || ""}`.trim() || "—", 14, y);
  y += 8;

  // Carrier info
  drawBox(doc, 12, y - 3, 184, 14);
  y = drawSectionTitle(doc, "CARRIER", y);
  const carrRow = y;
  drawField(doc, "Name", carrier?.name || "—", 14, carrRow);
  drawField(doc, "MC#", carrier?.mc_number || "—", 80, carrRow);
  drawField(doc, "DOT#", carrier?.dot_number || "—", 140, carrRow);
  y = carrRow + 5;
  if (driver) drawField(doc, "Driver", `${driver.firstName || ""} ${driver.lastName || ""}`, 14, y);
  if (vehicle) drawField(doc, "Truck", `${vehicle.vehicle_number || ""} ${vehicle.make || ""}`, 80, y);
  y += 8;

  // Commodity table header
  y = drawSectionTitle(doc, "COMMODITIES", y);
  
  // Table header
  doc.setFillColor(240, 240, 240);
  doc.rect(12, y - 3, 184, 6, "F");
  drawBox(doc, 12, y - 3, 184, 6);
  doc.setFontSize(7);
  doc.setFont("helvetica", "bold");
  doc.text("QTY", 16, y);
  doc.text("DESCRIPTION", 40, y);
  doc.text("WEIGHT (LBS)", 130, y);
  doc.text("CLASS/NMFC", 165, y);
  y += 6;

  // Commodity row
  drawBox(doc, 12, y - 3, 184, 8);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.text(load.cargo_pieces?.toString() || "—", 16, y + 1);
  doc.text(load.cargo_description || "Freight - All Kinds (FAK)", 40, y + 1);
  doc.text(load.cargo_weight?.toString() || "—", 130, y + 1);
  doc.text("—", 165, y + 1);
  y += 12;

  // Equipment & special
  drawBox(doc, 12, y - 3, 184, 14);
  y = drawSectionTitle(doc, "HANDLING & EQUIPMENT", y);
  drawField(doc, "Equipment", load.equipment_type?.replace(/_/g, " ") || "—", 14, y);
  drawField(doc, "Temp", load.temperature_required || "N/A", 80, y);
  drawField(doc, "Hazmat", load.hazmat ? "YES" : "NO", 140, y);
  y += 5;
  if (load.special_instructions) {
    drawField(doc, "Instructions", "", 14, y);
    doc.setFont("helvetica", "normal");
    const lines = doc.splitTextToSize(load.special_instructions, 150);
    doc.text(lines, 50, y);
    y += lines.length * 3.5;
  }
  y += 8;

  // Signature section
  y = Math.max(y, 215);
  doc.setFontSize(8);
  doc.setFont("helvetica", "normal");
  doc.text("This is to certify that the above named materials are properly classified, described,", 14, y);
  doc.text("packaged, marked and labeled, and are in proper condition for transportation.", 14, y + 4);
  y += 14;

  doc.setDrawColor(0);
  doc.setLineWidth(0.3);
  // Shipper signature
  doc.line(14, y, 90, y);
  doc.text("Shipper Signature / Date", 14, y + 4);
  // Carrier signature
  doc.line(110, y, 196, y);
  doc.text("Carrier Signature / Date", 110, y + 4);
  // Receiver
  y += 14;
  doc.line(14, y, 90, y);
  doc.text("Receiver Signature / Date", 14, y + 4);
  doc.line(110, y, 196, y);
  doc.text("Received in Good Condition (except as noted)", 110, y + 4);

  // Footer
  doc.setFontSize(7);
  doc.setTextColor(128, 128, 128);
  doc.text(`Generated ${new Date().toLocaleString()} • ${company.company_name}`, 105, 290, { align: "center" });

  doc.save(`BOL_${load.load_number || "load"}.pdf`);
}
