import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import jsPDF from "https://esm.sh/jspdf@2.5.1";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { assertTenantAccess } from "../_shared/assertTenantAccess.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface GeneratePDFRequest {
  application_id: string;
}

interface ApplicationData {
  personalInfo: any;
  licenseInfo: any;
  employmentHistory: any[];
  drivingHistory: any;
  documents: any;
  directDeposit: any;
  whyHireYou?: any;
  emergencyContacts?: any[];
}

interface CompanyProfile {
  company_name: string;
  logo_url: string | null;
  address: string | null;
  city: string | null;
  state: string | null;
  zip: string | null;
  phone: string | null;
  email: string | null;
}

/**
 * Professional DOT-Style Driver Employment Application PDF Generator
 * 
 * Creates a form-like PDF that resembles real carrier employment applications
 * with boxed sections, fill-in blanks, checkboxes, and proper attestation.
 */
class DriverApplicationPDF {
  private doc: any;
  private yPos: number = 20;
  private pageNumber: number = 1;
  private readonly pageHeight: number;
  private readonly pageWidth: number;
  private readonly margin: number = 18;
  private readonly contentWidth: number;
  private readonly lineHeight: number = 5;
  private readonly boxPadding: number = 3;
  private company: CompanyProfile | null;
  private logoBase64: string | null;
  private generatedTimestamp: string;
  private applicantName: string = '';

  constructor(company: CompanyProfile | null, logoBase64: string | null = null) {
    this.doc = new jsPDF();
    this.pageHeight = this.doc.internal.pageSize.height;
    this.pageWidth = this.doc.internal.pageSize.width;
    this.contentWidth = this.pageWidth - 2 * this.margin;
    this.company = company;
    this.logoBase64 = logoBase64;
    this.generatedTimestamp = new Date().toLocaleString('en-US', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    });
  }

  // === UTILITY METHODS ===

  private maskSSN(ssn: string | null | undefined): string {
    if (!ssn) return '___-__-____';
    const clean = ssn.replace(/\D/g, '');
    if (clean.length >= 4) {
      return `XXX-XX-${clean.slice(-4)}`;
    }
    return '___-__-____';
  }

  private maskAccount(account: string | null | undefined): string {
    if (!account) return '********';
    const clean = account.replace(/\D/g, '');
    if (clean.length >= 4) {
      return `****${clean.slice(-4)}`;
    }
    return '********';
  }

  private formatDate(date: string | null | undefined): string {
    if (!date) return '__/__/____';
    try {
      const d = new Date(date);
      if (isNaN(d.getTime())) return date;
      return d.toLocaleDateString('en-US', { month: '2-digit', day: '2-digit', year: 'numeric' });
    } catch {
      return date || '__/__/____';
    }
  }

  private wrapText(text: string, maxWidth: number): string[] {
    if (!text) return [''];
    return this.doc.splitTextToSize(text, maxWidth);
  }

  /**
   * Unified method for starting a new page.
   * Adds footer to current page, creates new page, increments page number,
   * and adds watermark + header to the new page.
   */
  private newPage(): void {
    this.addFooter();
    this.doc.addPage();
    this.pageNumber++;
    this.yPos = 25;
    this.addWatermark();
    this.addPageHeader();
  }

  private checkPageBreak(requiredSpace: number = 30): void {
    if (this.yPos + requiredSpace > this.pageHeight - 25) {
      this.newPage();
    }
  }

  // === WATERMARK & HEADERS/FOOTERS ===

  private addWatermark(): void {
    this.doc.saveGraphicsState();
    this.doc.setTextColor(220, 220, 220);
    this.doc.setFontSize(50);
    this.doc.setFont(undefined, 'bold');
    
    // Diagonal watermark
    const centerX = this.pageWidth / 2;
    const centerY = this.pageHeight / 2;
    
    this.doc.text('CONFIDENTIAL', centerX, centerY, {
      align: 'center',
      angle: 45,
    });
    
    this.doc.restoreGraphicsState();
  }

  private addPageHeader(): void {
    // Company name on left, page number on right
    this.doc.setFontSize(8);
    this.doc.setTextColor(100, 100, 100);
    this.doc.setFont(undefined, 'normal');
    
    if (this.company?.company_name) {
      this.doc.text(this.company.company_name, this.margin, 12);
    }
    
    this.doc.text(`Page ${this.pageNumber}`, this.pageWidth - this.margin, 12, { align: 'right' });
    
    // Thin line under header
    this.doc.setDrawColor(200, 200, 200);
    this.doc.setLineWidth(0.3);
    this.doc.line(this.margin, 15, this.pageWidth - this.margin, 15);
  }

  private addFooter(): void {
    const footerY = this.pageHeight - 12;
    
    this.doc.setDrawColor(200, 200, 200);
    this.doc.setLineWidth(0.3);
    this.doc.line(this.margin, footerY - 5, this.pageWidth - this.margin, footerY - 5);
    
    this.doc.setFontSize(7);
    this.doc.setTextColor(150, 150, 150);
    this.doc.setFont(undefined, 'normal');
    this.doc.text(`Generated on ${this.generatedTimestamp}`, this.margin, footerY);
    this.doc.text('CONFIDENTIAL - Employment Application', this.pageWidth / 2, footerY, { align: 'center' });
  }

  // === FORM ELEMENTS ===

  private addLetterhead(): void {
    this.addWatermark();
    this.addPageHeader(); // Page 1 now also gets header line + page number
    this.yPos = 22;

    // Company logo + name
    let logoXEnd = this.margin;
    
    if (this.logoBase64) {
      try {
        this.doc.addImage(this.logoBase64, 'PNG', this.margin, this.yPos - 3, 18, 18);
        logoXEnd = this.margin + 22;
      } catch (e) {
        console.error("Failed to add logo image:", e);
        // Fallback: no logo, just name
      }
    }
    
    // Company name (large)
    this.doc.setFontSize(20);
    this.doc.setTextColor(20, 60, 140);
    this.doc.setFont(undefined, 'bold');
    this.doc.text(this.company?.company_name || 'TRUCKING COMPANY', logoXEnd, this.yPos + 5);
    this.yPos += 12;

    // Company address line
    if (this.company?.address) {
      this.doc.setFontSize(9);
      this.doc.setTextColor(80, 80, 80);
      this.doc.setFont(undefined, 'normal');
      const addressParts = [
        this.company.address,
        [this.company.city, this.company.state, this.company.zip].filter(Boolean).join(', '),
        this.company.phone ? `Tel: ${this.company.phone}` : '',
      ].filter(Boolean);
      this.doc.text(addressParts.join('  •  '), logoXEnd, this.yPos);
      this.yPos += 6;
    } else {
      this.yPos += 3;
    }

    // Double line separator
    this.doc.setDrawColor(20, 60, 140);
    this.doc.setLineWidth(1.5);
    this.doc.line(this.margin, this.yPos, this.pageWidth - this.margin, this.yPos);
    this.doc.setLineWidth(0.5);
    this.doc.line(this.margin, this.yPos + 2, this.pageWidth - this.margin, this.yPos + 2);
    this.yPos += 10;

    // Title
    this.doc.setFontSize(14);
    this.doc.setTextColor(0, 0, 0);
    this.doc.setFont(undefined, 'bold');
    this.doc.text('DRIVER EMPLOYMENT APPLICATION', this.pageWidth / 2, this.yPos, { align: 'center' });
    this.yPos += 6;

    // Subtitle
    this.doc.setFontSize(9);
    this.doc.setTextColor(100, 100, 100);
    this.doc.setFont(undefined, 'italic');
    this.doc.text('In compliance with Federal and State equal opportunity employment laws', this.pageWidth / 2, this.yPos, { align: 'center' });
    this.yPos += 10;
  }

  private addSectionTitle(title: string): void {
    this.checkPageBreak(20);
    
    // Dark title bar
    this.doc.setFillColor(30, 60, 120);
    this.doc.rect(this.margin, this.yPos - 1, this.contentWidth, 8, 'F');
    
    this.doc.setFontSize(10);
    this.doc.setTextColor(255, 255, 255);
    this.doc.setFont(undefined, 'bold');
    this.doc.text(title.toUpperCase(), this.margin + 3, this.yPos + 5);
    
    this.yPos += 12;
    this.doc.setTextColor(0, 0, 0);
  }

  /**
   * Add a form field with proper text wrapping instead of truncation.
   * Returns the new X position after the field.
   */
  private addFormField(label: string, value: string | null | undefined, width: number, x?: number): { nextX: number; linesUsed: number } {
    const startX = x ?? this.margin;
    const displayValue = value || '';
    
    this.doc.setFontSize(7);
    this.doc.setTextColor(80, 80, 80);
    this.doc.setFont(undefined, 'normal');
    this.doc.text(label, startX, this.yPos);
    
    // Calculate space for value
    const labelWidth = Math.min(this.doc.getTextWidth(label) + 2, width * 0.35);
    const valueWidth = width - labelWidth - 4;
    const valueX = startX + labelWidth;
    
    // Underline for value
    this.doc.setDrawColor(150, 150, 150);
    this.doc.setLineWidth(0.3);
    this.doc.line(valueX, this.yPos + 1, valueX + valueWidth, this.yPos + 1);
    
    // Wrap value text if needed
    this.doc.setFontSize(9);
    this.doc.setTextColor(0, 0, 0);
    this.doc.setFont(undefined, 'normal');
    
    const lines = this.wrapText(displayValue, valueWidth - 2);
    const linesUsed = Math.min(lines.length, 2); // Max 2 lines per field
    
    for (let i = 0; i < linesUsed; i++) {
      this.doc.text(lines[i], valueX + 1, this.yPos + (i * 4));
    }
    
    return { nextX: startX + width, linesUsed };
  }

  private addFormFieldRow(fields: Array<{ label: string; value: string | null | undefined; width: number }>): void {
    this.checkPageBreak(12);
    
    let currentX = this.margin;
    let maxLines = 1;
    
    // First pass: calculate max lines needed
    for (const field of fields) {
      const displayValue = field.value || '';
      const labelWidth = Math.min(this.doc.getTextWidth(field.label) + 2, field.width * 0.35);
      const valueWidth = field.width - labelWidth - 4;
      const lines = this.wrapText(displayValue, valueWidth - 2);
      maxLines = Math.max(maxLines, Math.min(lines.length, 2));
    }
    
    // Second pass: render fields
    for (const field of fields) {
      const result = this.addFormField(field.label, field.value, field.width, currentX);
      currentX = result.nextX + 3;
    }
    
    // Adjust yPos based on lines used
    this.yPos += 6 + (maxLines - 1) * 4;
  }

  private addCheckboxField(label: string, checked: boolean | string, x: number, width: number): number {
    const isChecked = checked === true || checked === 'yes' || checked === 'Yes';
    
    // Checkbox
    this.doc.setDrawColor(80, 80, 80);
    this.doc.setLineWidth(0.4);
    this.doc.rect(x, this.yPos - 3, 3.5, 3.5);
    
    if (isChecked) {
      this.doc.setFont(undefined, 'bold');
      this.doc.setFontSize(9);
      this.doc.text('✓', x + 0.5, this.yPos);
    }
    
    this.doc.setFontSize(8);
    this.doc.setFont(undefined, 'normal');
    this.doc.setTextColor(0, 0, 0);
    this.doc.text(label, x + 5, this.yPos);
    
    return x + width;
  }

  private addYesNoField(label: string, value: string | boolean | null | undefined): void {
    this.checkPageBreak(10);
    
    const isYes = value === true || value === 'yes' || value === 'Yes';
    const isNo = value === false || value === 'no' || value === 'No';
    
    this.doc.setFontSize(8);
    this.doc.setTextColor(0, 0, 0);
    this.doc.setFont(undefined, 'normal');
    this.doc.text(label, this.margin, this.yPos);
    
    const labelWidth = this.doc.getTextWidth(label) + 5;
    let x = this.margin + labelWidth;
    
    // Yes checkbox
    this.doc.setDrawColor(80, 80, 80);
    this.doc.rect(x, this.yPos - 3, 3.5, 3.5);
    if (isYes) {
      this.doc.setFont(undefined, 'bold');
      this.doc.text('✓', x + 0.5, this.yPos);
    }
    this.doc.setFont(undefined, 'normal');
    this.doc.text('Yes', x + 5, this.yPos);
    
    x += 18;
    
    // No checkbox
    this.doc.rect(x, this.yPos - 3, 3.5, 3.5);
    if (isNo) {
      this.doc.setFont(undefined, 'bold');
      this.doc.text('✓', x + 0.5, this.yPos);
    }
    this.doc.setFont(undefined, 'normal');
    this.doc.text('No', x + 5, this.yPos);
    
    this.yPos += 7;
  }

  private addBoxedBlock(title: string, content: () => void): void {
    this.checkPageBreak(40);
    
    const startY = this.yPos;
    
    // Reserve title space
    this.doc.setFontSize(9);
    this.doc.setFont(undefined, 'bold');
    this.doc.setTextColor(30, 60, 120);
    this.doc.text(title, this.margin + 3, this.yPos + 4);
    this.yPos += 8;
    
    const contentStartY = this.yPos;
    content();
    
    const endY = this.yPos + 3;
    
    // Draw box around content
    this.doc.setDrawColor(180, 180, 180);
    this.doc.setLineWidth(0.4);
    this.doc.rect(this.margin, startY - 2, this.contentWidth, endY - startY + 4);
    
    this.yPos = endY + 5;
  }

  /**
   * Add a full grid table with outer border and vertical column lines.
   */
  private addGridTableHeader(columns: Array<{ label: string; width: number }>, tableStartY: number): void {
    // Header background
    this.doc.setFillColor(240, 240, 240);
    this.doc.rect(this.margin, this.yPos - 4, this.contentWidth, 7, 'F');
    
    this.doc.setFontSize(7);
    this.doc.setTextColor(60, 60, 60);
    this.doc.setFont(undefined, 'bold');
    
    let x = this.margin + 2;
    for (const col of columns) {
      this.doc.text(col.label.toUpperCase(), x, this.yPos);
      x += col.width;
    }
    
    this.yPos += 5;
    
    // Horizontal line under header
    this.doc.setDrawColor(180, 180, 180);
    this.doc.setLineWidth(0.4);
    this.doc.line(this.margin, this.yPos, this.pageWidth - this.margin, this.yPos);
    this.yPos += 3;
  }

  private addGridTableRow(columns: Array<{ value: string; width: number }>, isLast: boolean = false): void {
    this.checkPageBreak(12);
    
    this.doc.setFontSize(8);
    this.doc.setTextColor(0, 0, 0);
    this.doc.setFont(undefined, 'normal');
    
    // Calculate max lines needed for this row
    let maxLines = 1;
    const cellLines: string[][] = [];
    
    let x = this.margin + 2;
    for (const col of columns) {
      const lines = this.wrapText(col.value, col.width - 4);
      const truncatedLines = lines.slice(0, 2); // Max 2 lines per cell
      cellLines.push(truncatedLines);
      maxLines = Math.max(maxLines, truncatedLines.length);
    }
    
    // Render each cell
    x = this.margin + 2;
    for (let i = 0; i < columns.length; i++) {
      const lines = cellLines[i];
      for (let j = 0; j < lines.length; j++) {
        this.doc.text(lines[j], x, this.yPos + (j * 4));
      }
      x += columns[i].width;
    }
    
    const rowHeight = 5 + (maxLines - 1) * 4;
    this.yPos += rowHeight;
    
    // Horizontal row divider
    this.doc.setDrawColor(220, 220, 220);
    this.doc.setLineWidth(0.2);
    this.doc.line(this.margin, this.yPos, this.pageWidth - this.margin, this.yPos);
    this.yPos += 2;
  }

  /**
   * Draw the outer border and vertical lines for the table.
   */
  private addGridTableBorder(columns: Array<{ width: number }>, startY: number, endY: number): void {
    // Outer border
    this.doc.setDrawColor(180, 180, 180);
    this.doc.setLineWidth(0.5);
    this.doc.rect(this.margin, startY, this.contentWidth, endY - startY);
    
    // Vertical column lines
    this.doc.setLineWidth(0.3);
    let x = this.margin;
    for (let i = 0; i < columns.length - 1; i++) {
      x += columns[i].width;
      this.doc.line(x, startY, x, endY);
    }
  }

  // === SECTION GENERATORS ===

  private generatePersonalInfo(pi: any): void {
    this.addSectionTitle('Section 1: Personal Information');
    
    // Row 1: Name fields
    this.addFormFieldRow([
      { label: 'Last Name:', value: pi.lastName, width: 55 },
      { label: 'First Name:', value: pi.firstName, width: 50 },
      { label: 'Middle:', value: pi.middleName, width: 30 },
    ]);
    
    // Row 2: DOB, SSN, Phone
    this.addFormFieldRow([
      { label: 'Date of Birth:', value: this.formatDate(pi.dob), width: 50 },
      { label: 'SSN:', value: this.maskSSN(pi.ssn), width: 45 },
      { label: 'Phone:', value: pi.phone, width: 50 },
    ]);
    
    // Row 3: Email
    this.addFormFieldRow([
      { label: 'Email:', value: pi.email, width: 100 },
    ]);
    
    // Row 4: Address
    this.addFormFieldRow([
      { label: 'Street Address:', value: pi.address, width: this.contentWidth - 10 },
    ]);
    
    // Row 5: City, State, Zip
    this.addFormFieldRow([
      { label: 'City:', value: pi.city, width: 70 },
      { label: 'State:', value: pi.state, width: 30 },
      { label: 'ZIP:', value: pi.zip, width: 35 },
    ]);
    
    this.yPos += 3;
    
    // Authorization questions
    this.addYesNoField('Are you legally authorized to work in the United States?', pi.legallyAuthorized);
    this.addYesNoField('Have you ever been convicted of a felony?', pi.felonyConviction);
    
    if (pi.hasTwicCard) {
      this.addFormFieldRow([
        { label: 'TWIC Card Expiration:', value: this.formatDate(pi.twicExpiration), width: 80 },
      ]);
    }
    
    this.yPos += 5;
  }

  private generateLicenseInfo(li: any): void {
    this.addSectionTitle('Section 2: CDL & License Information');
    
    // Row 1
    this.addFormFieldRow([
      { label: 'License Number:', value: li.licenseNumber, width: 60 },
      { label: 'State:', value: li.licenseState, width: 30 },
      { label: 'Class:', value: li.licenseClass, width: 25 },
    ]);
    
    // Row 2
    const endorsements = Array.isArray(li.endorsements) ? li.endorsements.join(', ') : li.endorsements;
    this.addFormFieldRow([
      { label: 'Endorsements:', value: endorsements, width: 60 },
      { label: 'Expiration:', value: this.formatDate(li.expirationDate), width: 50 },
    ]);
    
    // Row 3
    this.addFormFieldRow([
      { label: 'Years CDL Experience:', value: li.yearsExperience?.toString(), width: 55 },
      { label: 'Medical Card Exp:', value: this.formatDate(li.medicalCardExpiration), width: 55 },
    ]);
    
    // Equipment experience
    if (li.equipmentExperience && li.equipmentExperience.length > 0) {
      const equipment = Array.isArray(li.equipmentExperience) ? li.equipmentExperience.join(', ') : li.equipmentExperience;
      this.addFormFieldRow([
        { label: 'Equipment Experience:', value: equipment, width: this.contentWidth - 10 },
      ]);
    }
    
    this.yPos += 3;
    
    this.addYesNoField('Has your license ever been denied, suspended, or revoked?', li.suspendedRevoked || li.deniedLicense);
    this.addYesNoField('Are you available for team driving?', li.teamDriving);
    
    this.yPos += 5;
  }

  private generateEmploymentHistory(history: any[]): void {
    this.checkPageBreak(50);
    this.addSectionTitle('Section 3: Employment History (Past 3 Years)');
    
    if (!history || history.length === 0) {
      this.doc.setFontSize(9);
      this.doc.setTextColor(100, 100, 100);
      this.doc.text('No employment history provided.', this.margin + 5, this.yPos);
      this.yPos += 10;
      return;
    }
    
    history.forEach((emp, index) => {
      this.addBoxedBlock(`Employer ${index + 1}`, () => {
        this.addFormFieldRow([
          { label: 'Company Name:', value: emp.companyName, width: 100 },
          { label: 'Position:', value: emp.position, width: 50 },
        ]);
        
        this.addFormFieldRow([
          { label: 'Address:', value: emp.address, width: this.contentWidth - 15 },
        ]);
        
        this.addFormFieldRow([
          { label: 'Phone:', value: emp.phone, width: 50 },
          { label: 'Supervisor:', value: emp.supervisor, width: 60 },
        ]);
        
        this.addFormFieldRow([
          { label: 'From:', value: this.formatDate(emp.startDate), width: 45 },
          { label: 'To:', value: this.formatDate(emp.endDate), width: 45 },
          { label: 'Equipment:', value: emp.equipmentDriven, width: 50 },
        ]);
        
        this.addFormFieldRow([
          { label: 'Reason for Leaving:', value: emp.reasonForLeaving, width: this.contentWidth - 15 },
        ]);
      });
    });
  }

  private generateDrivingHistory(dh: any): void {
    this.checkPageBreak(60);
    this.addSectionTitle('Section 4: Driving History');
    
    // Accidents Table
    this.doc.setFontSize(9);
    this.doc.setFont(undefined, 'bold');
    this.doc.setTextColor(30, 60, 120);
    this.doc.text('ACCIDENTS (Past 3 Years)', this.margin + 2, this.yPos);
    this.yPos += 6;
    
    const accidentColumns = [
      { label: 'Date', width: 25 },
      { label: 'Location', width: 45 },
      { label: 'Description', width: 70 },
      { label: 'Preventable', width: 25 },
    ];
    
    if (dh.accidents && dh.accidents.length > 0) {
      const tableStartY = this.yPos - 4;
      this.addGridTableHeader(accidentColumns, tableStartY);
      
      dh.accidents.forEach((acc: any, idx: number) => {
        this.addGridTableRow([
          { value: this.formatDate(acc.date), width: 25 },
          { value: acc.location || '', width: 45 },
          { value: acc.description || '', width: 70 },
          { value: acc.preventable === 'yes' || acc.preventable === true ? 'Yes' : 'No', width: 25 },
        ], idx === dh.accidents.length - 1);
      });
      
      const tableEndY = this.yPos;
      this.addGridTableBorder(accidentColumns, tableStartY, tableEndY);
    } else {
      this.doc.setFontSize(8);
      this.doc.setTextColor(0, 0, 0);
      this.doc.setFont(undefined, 'normal');
      this.addCheckboxField('No accidents to report in the past 3 years', true, this.margin + 5, 80);
      this.yPos += 8;
    }
    
    this.yPos += 5;
    
    // Violations Table
    this.doc.setFontSize(9);
    this.doc.setFont(undefined, 'bold');
    this.doc.setTextColor(30, 60, 120);
    this.doc.text('TRAFFIC VIOLATIONS (Past 3 Years)', this.margin + 2, this.yPos);
    this.yPos += 6;
    
    const violationColumns = [
      { label: 'Date', width: 25 },
      { label: 'Location', width: 40 },
      { label: 'Violation', width: 60 },
      { label: 'Penalty', width: 40 },
    ];
    
    if (dh.violations && dh.violations.length > 0) {
      const tableStartY = this.yPos - 4;
      this.addGridTableHeader(violationColumns, tableStartY);
      
      dh.violations.forEach((vio: any, idx: number) => {
        this.addGridTableRow([
          { value: this.formatDate(vio.date), width: 25 },
          { value: vio.location || '', width: 40 },
          { value: vio.violation || '', width: 60 },
          { value: vio.penalty || '', width: 40 },
        ], idx === dh.violations.length - 1);
      });
      
      const tableEndY = this.yPos;
      this.addGridTableBorder(violationColumns, tableStartY, tableEndY);
    } else {
      this.doc.setFontSize(8);
      this.doc.setTextColor(0, 0, 0);
      this.doc.setFont(undefined, 'normal');
      this.addCheckboxField('No violations to report in the past 3 years', true, this.margin + 5, 80);
      this.yPos += 8;
    }
    
    this.yPos += 5;
    
    // Additional questions
    this.addYesNoField('Have you ever been convicted of DUI/DWI?', dh.dui);
    this.addYesNoField('Have you ever failed a drug/alcohol test?', dh.failedDrugTest);
    this.addYesNoField('Has your license ever been suspended?', dh.licenseSuspension);
    
    if (dh.safetyAwards) {
      this.addFormFieldRow([
        { label: 'Safety Awards:', value: dh.safetyAwards, width: this.contentWidth - 10 },
      ]);
    }
    
    this.yPos += 5;
  }

  private generateEmergencyContacts(contacts: any[]): void {
    this.checkPageBreak(40);
    this.addSectionTitle('Section 5: Emergency Contacts');
    
    if (!contacts || contacts.length === 0) {
      this.doc.setFontSize(9);
      this.doc.setTextColor(100, 100, 100);
      this.doc.text('No emergency contacts provided.', this.margin + 5, this.yPos);
      this.yPos += 10;
      return;
    }
    
    contacts.forEach((contact, index) => {
      this.checkPageBreak(25);
      
      this.doc.setFontSize(8);
      this.doc.setFont(undefined, 'bold');
      this.doc.setTextColor(60, 60, 60);
      this.doc.text(`Contact ${index + 1}:`, this.margin, this.yPos);
      this.yPos += 5;
      
      this.addFormFieldRow([
        { label: 'Name:', value: `${contact.firstName || ''} ${contact.lastName || ''}`.trim(), width: 60 },
        { label: 'Relationship:', value: contact.relationship, width: 50 },
        { label: 'Phone:', value: contact.phone, width: 45 },
      ]);
      
      if (contact.address) {
        const address = [contact.address, contact.city, contact.state, contact.zip].filter(Boolean).join(', ');
        this.addFormFieldRow([
          { label: 'Address:', value: address, width: this.contentWidth - 10 },
        ]);
      }
      
      this.yPos += 3;
    });
    
    this.yPos += 5;
  }

  private generateDirectDeposit(dd: any): void {
    this.checkPageBreak(40);
    this.addSectionTitle('Section 6: Direct Deposit / Payment Information');
    
    this.addFormFieldRow([
      { label: 'Account Holder:', value: `${dd.firstName || ''} ${dd.lastName || ''}`.trim(), width: 80 },
      { label: 'Email:', value: dd.email, width: 70 },
    ]);
    
    this.addFormFieldRow([
      { label: 'Bank Name:', value: dd.bankName, width: 80 },
      { label: 'Account Type:', value: dd.accountType, width: 50 },
    ]);
    
    this.addFormFieldRow([
      { label: 'Routing #:', value: this.maskAccount(dd.routingNumber), width: 60 },
      { label: 'Account #:', value: this.maskAccount(dd.accountNumber || dd.checkingNumber), width: 60 },
    ]);
    
    if (dd.cashAppCashtag) {
      this.addFormFieldRow([
        { label: 'CashApp:', value: dd.cashAppCashtag, width: 60 },
      ]);
    }
    
    this.yPos += 5;
  }

  private generateDocumentsChecklist(docs: any): void {
    this.checkPageBreak(50);
    this.addSectionTitle('Section 7: Required Documents Checklist');
    
    this.doc.setFontSize(8);
    this.doc.setTextColor(60, 60, 60);
    this.doc.setFont(undefined, 'italic');
    this.doc.text('The following documents are required for employment. Please ensure all items are provided.', this.margin, this.yPos);
    this.yPos += 8;
    
    // Document checklist
    const requiredDocs = [
      { label: "Valid Driver's License (front & back)", key: 'driversLicense' },
      { label: 'Social Security Card', key: 'socialSecurity' },
      { label: 'DOT Medical Card', key: 'medicalCard' },
      { label: 'Motor Vehicle Record (MVR)', key: 'mvr' },
    ];
    
    requiredDocs.forEach((doc) => {
      const hasDoc = !!docs[doc.key];
      this.addCheckboxField(doc.label, hasDoc, this.margin + 5, 100);
      this.yPos += 6;
    });
    
    // Other documents
    const otherDocs = docs.other || [];
    if (otherDocs.length > 0) {
      this.yPos += 3;
      this.doc.setFontSize(8);
      this.doc.setFont(undefined, 'bold');
      this.doc.text(`Other Documents (${otherDocs.length}):`, this.margin + 5, this.yPos);
      this.yPos += 5;
      
      otherDocs.forEach((docPath: string, index: number) => {
        const docName = typeof docPath === 'string' ? docPath.split('/').pop() || `Document ${index + 1}` : `Document ${index + 1}`;
        this.addCheckboxField(docName, true, this.margin + 10, 100);
        this.yPos += 5;
      });
    }
    
    this.yPos += 5;
  }

  private generateWhyHireYou(why: any): void {
    if (!why?.statement) return;
    
    this.checkPageBreak(50);
    this.addSectionTitle('Section 8: Applicant Statement');
    
    this.doc.setFontSize(8);
    this.doc.setTextColor(60, 60, 60);
    this.doc.setFont(undefined, 'italic');
    this.doc.text('In the space below, please tell us why we should consider you for employment:', this.margin, this.yPos);
    this.yPos += 8;
    
    // Boxed statement area
    const statement = why.statement || '';
    const lines = this.wrapText(statement, this.contentWidth - 10);
    
    this.doc.setDrawColor(180, 180, 180);
    this.doc.setLineWidth(0.4);
    const boxHeight = Math.max(lines.length * 5 + 10, 30);
    this.doc.rect(this.margin, this.yPos - 3, this.contentWidth, boxHeight);
    
    this.doc.setFontSize(9);
    this.doc.setTextColor(0, 0, 0);
    this.doc.setFont(undefined, 'normal');
    
    lines.forEach((line: string) => {
      this.doc.text(line, this.margin + 3, this.yPos + 2);
      this.yPos += 5;
    });
    
    this.yPos += 10;
  }

  private generateAttestationPage(): void {
    this.newPage(); // Uses unified newPage() method
    
    this.addSectionTitle('Attestation & Authorization');
    
    // Attestation text
    const attestationText = `I certify that the information provided in this application is true and complete to the best of my knowledge. I understand that any false or misleading information or omissions may disqualify me from further consideration for employment and may result in my dismissal if discovered at a later date.

I authorize investigation of all statements contained in this application and release any person, school, company, or organization from any liability for any damage whatsoever that may result from providing such information.

I understand that this application does not constitute an offer or guarantee of employment. I acknowledge that if employed, I will be required to provide documentation proving my identity and legal authorization to work in the United States.

I authorize the company to obtain my motor vehicle driving record and to make any investigation of my driving and employment history deemed necessary. I release the company and all providers of such information from any liability arising from such investigation.

I have read and understand the company's policies regarding drug and alcohol testing, and I agree to submit to any required testing as a condition of employment and continued employment.

I understand that any employment relationship with this company is "at-will" meaning that either party may terminate the relationship at any time, with or without cause or notice.`;

    const lines = this.wrapText(attestationText, this.contentWidth - 5);
    
    this.doc.setFontSize(9);
    this.doc.setTextColor(0, 0, 0);
    this.doc.setFont(undefined, 'normal');
    
    lines.forEach((line: string) => {
      this.checkPageBreak(8);
      this.doc.text(line, this.margin, this.yPos);
      this.yPos += 5;
    });
    
    this.yPos += 15;
    
    // Signature block
    this.doc.setDrawColor(0, 0, 0);
    this.doc.setLineWidth(0.5);
    
    // Applicant signature
    this.doc.setFontSize(8);
    this.doc.setTextColor(60, 60, 60);
    this.doc.text('APPLICANT SIGNATURE:', this.margin, this.yPos);
    this.yPos += 8;
    
    // Signature line
    this.doc.line(this.margin, this.yPos, this.margin + 90, this.yPos);
    this.doc.setFontSize(9);
    this.doc.setTextColor(0, 0, 0);
    this.doc.setFont(undefined, 'italic');
    this.doc.text(this.applicantName, this.margin + 2, this.yPos - 2);
    
    // Date line
    this.doc.setFontSize(8);
    this.doc.setTextColor(60, 60, 60);
    this.doc.setFont(undefined, 'normal');
    this.doc.text('DATE:', this.margin + 100, this.yPos - 8);
    this.doc.line(this.margin + 115, this.yPos, this.margin + 160, this.yPos);
    this.doc.setFontSize(9);
    this.doc.setTextColor(0, 0, 0);
    this.doc.text(this.formatDate(new Date().toISOString()), this.margin + 117, this.yPos - 2);
    
    this.yPos += 5;
    this.doc.setFontSize(7);
    this.doc.setTextColor(100, 100, 100);
    this.doc.text('Applicant Signature', this.margin, this.yPos);
    this.doc.text('Date', this.margin + 115, this.yPos);
    
    this.yPos += 15;
    
    // Print name line
    this.doc.setFontSize(8);
    this.doc.setTextColor(60, 60, 60);
    this.doc.text('PRINT NAME:', this.margin, this.yPos);
    this.yPos += 8;
    this.doc.line(this.margin, this.yPos, this.margin + 90, this.yPos);
    this.doc.setFontSize(10);
    this.doc.setTextColor(0, 0, 0);
    this.doc.setFont(undefined, 'bold');
    this.doc.text(this.applicantName.toUpperCase(), this.margin + 2, this.yPos - 2);
    
    this.yPos += 5;
    this.doc.setFontSize(7);
    this.doc.setTextColor(100, 100, 100);
    this.doc.setFont(undefined, 'normal');
    this.doc.text('Printed Name', this.margin, this.yPos);
  }

  // === MAIN GENERATION METHOD ===

  public generate(applicationData: ApplicationData): Uint8Array {
    // Set applicant name for attestation
    const pi = applicationData.personalInfo || {};
    this.applicantName = `${pi.firstName || ''} ${pi.lastName || ''}`.trim() || 'Applicant';
    
    // Page 1: Letterhead + Personal Info + License
    this.addLetterhead();
    this.generatePersonalInfo(applicationData.personalInfo || {});
    this.generateLicenseInfo(applicationData.licenseInfo || {});
    
    // Page 2+: Employment History
    this.newPage();
    this.generateEmploymentHistory(applicationData.employmentHistory || []);
    
    // Driving History
    this.generateDrivingHistory(applicationData.drivingHistory || {});
    
    // Emergency Contacts
    this.newPage();
    this.generateEmergencyContacts(applicationData.emergencyContacts || []);
    
    // Direct Deposit
    this.generateDirectDeposit(applicationData.directDeposit || {});
    
    // Documents Checklist
    this.generateDocumentsChecklist(applicationData.documents || {});
    
    // Why Hire You
    this.generateWhyHireYou(applicationData.whyHireYou);
    
    // Attestation Page (always last, uses newPage() internally)
    this.generateAttestationPage();
    
    // Final footer only once
    this.addFooter();

    return this.doc.output('arraybuffer');
  }
}

/**
 * Fetch logo from URL and convert to base64.
 * Returns null on failure (graceful fallback).
 */
async function fetchLogoAsBase64(logoUrl: string): Promise<string | null> {
  try {
    const response = await fetch(logoUrl, { 
      headers: { 'Accept': 'image/*' },
    });
    
    if (!response.ok) {
      console.warn(`Logo fetch failed: ${response.status}`);
      return null;
    }
    
    const contentType = response.headers.get('content-type') || 'image/png';
    const arrayBuffer = await response.arrayBuffer();
    const base64 = btoa(String.fromCharCode(...new Uint8Array(arrayBuffer)));
    
    // Return as data URL
    return `data:${contentType};base64,${base64}`;
  } catch (error) {
    console.warn("Error fetching logo:", error);
    return null;
  }
}

const handler = async (req: Request): Promise<Response> => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // SECURITY: Validate auth header FIRST before any processing
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      console.error("generate-application-pdf: Missing authorization header");
      return new Response(
        JSON.stringify({ error: "Unauthorized", reason: "missing_auth" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const { application_id }: GeneratePDFRequest = await req.json();

    if (!application_id) {
      return new Response(
        JSON.stringify({ error: "application_id is required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
    const supabaseServiceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
    const supabaseService = createClient(supabaseUrl, supabaseServiceRoleKey);

    // Load application from DB (includes tenant_id for access check)
    const { data: application, error: appError } = await supabaseService
      .from('applications')
      .select(`
        id,
        tenant_id,
        personal_info,
        license_info,
        employment_history,
        driving_history,
        emergency_contacts,
        document_upload,
        direct_deposit,
        why_hire_you
      `)
      .eq('id', application_id)
      .maybeSingle();

    if (appError) {
      console.error("Error loading application:", appError);
      return new Response(
        JSON.stringify({ error: "Failed to load application" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (!application) {
      return new Response(
        JSON.stringify({ error: "Application not found" }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // SECURITY: Verify tenant access using tenant_id FROM THE DATABASE, not from client
    // This prevents users from accessing applications belonging to other tenants
    const accessResult = await assertTenantAccess(authHeader, application.tenant_id);
    
    if (!accessResult.allowed) {
      console.error("Tenant access denied:", accessResult.reason);
      return accessResult.response || new Response(
        JSON.stringify({ error: "Access denied to this application" }),
        { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Fetch company profile
    const { data: profile } = await supabaseService
      .from('company_profile')
      .select('company_name, logo_url, address, city, state, zip, phone, email')
      .eq('tenant_id', application.tenant_id)
      .maybeSingle();

    // Fetch logo as base64 if available
    let logoBase64: string | null = null;
    if (profile?.logo_url) {
      logoBase64 = await fetchLogoAsBase64(profile.logo_url);
    }

    // Build application data
    const employmentArray = Array.isArray(application.employment_history) 
      ? application.employment_history 
      : (application.employment_history as any)?.employers || [];

    const applicationData: ApplicationData = {
      personalInfo: application.personal_info || {},
      licenseInfo: application.license_info || {},
      employmentHistory: employmentArray,
      drivingHistory: application.driving_history || {},
      documents: application.document_upload || {},
      directDeposit: application.direct_deposit || {},
      whyHireYou: application.why_hire_you,
      emergencyContacts: Array.isArray(application.emergency_contacts) 
        ? application.emergency_contacts 
        : (application.emergency_contacts as any)?.contacts || [],
    };

    // Generate PDF with logo
    const pdfGenerator = new DriverApplicationPDF(profile, logoBase64);
    const pdfBuffer = pdfGenerator.generate(applicationData);
    const pdfBase64 = btoa(String.fromCharCode(...new Uint8Array(pdfBuffer)));

    const applicantName = `${applicationData.personalInfo?.firstName || 'Unknown'}_${applicationData.personalInfo?.lastName || 'Applicant'}`;
    const filename = `Driver_Application_${applicantName}_${new Date().toISOString().split('T')[0]}.pdf`;

    console.log(`Generated PDF for application ${application_id} (download-only, no email)`);

    return new Response(
      JSON.stringify({ 
        success: true, 
        pdf_base64: pdfBase64,
        filename,
        content_type: 'application/pdf'
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (error: any) {
    console.error("Error in generate-application-pdf:", error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
};

serve(handler);
