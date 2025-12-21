import { useEffect, useState, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { format } from "date-fns";
import { Printer, Download, Send, X, Loader2 } from "lucide-react";
import html2canvas from "html2canvas";
import jsPDF from "jspdf";
import { toast } from "sonner";

interface CompanyProfile {
  company_name: string;
  legal_name: string | null;
  logo_url: string | null;
  address: string | null;
  city: string | null;
  state: string | null;
  zip: string | null;
  phone: string | null;
  email: string | null;
  mc_number: string | null;
  dot_number: string | null;
  factoring_company_name: string | null;
  factoring_company_address: string | null;
  factoring_company_city: string | null;
  factoring_company_state: string | null;
  factoring_company_zip: string | null;
}

interface LoadData {
  id: string;
  load_number: string;
  invoice_number: string | null;
  reference_number: string | null;
  rate: number | null;
  pickup_date: string | null;
  delivery_date: string | null;
  pickup_city: string | null;
  pickup_state: string | null;
  delivery_city: string | null;
  delivery_state: string | null;
  completed_at: string | null;
  broker_name: string | null;
  broker_contact: string | null;
  broker_phone: string | null;
  broker_email: string | null;
  broker_address: string | null;
  broker_city: string | null;
  broker_state: string | null;
  broker_zip: string | null;
  cargo_description: string | null;
  cargo_weight: number | null;
  cargo_pieces: number | null;
  estimated_miles: number | null;
  customers: { name: string } | null;
  carriers: { name: string } | null;
}

interface InvoicePreviewProps {
  loadId: string;
  onClose: () => void;
}

export default function InvoicePreview({ loadId, onClose }: InvoicePreviewProps) {
  const [company, setCompany] = useState<CompanyProfile | null>(null);
  const [load, setLoad] = useState<LoadData | null>(null);
  const [loading, setLoading] = useState(true);
  const [generatingPdf, setGeneratingPdf] = useState(false);
  const invoiceRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    fetchData();
  }, [loadId]);

  const fetchData = async () => {
    setLoading(true);
    try {
      // Fetch company profile
      const { data: companyData } = await supabase
        .from("company_profile")
        .select("*")
        .limit(1)
        .single();

      // Fetch load details
      const { data: loadData } = await supabase
        .from("loads")
        .select(`
          id,
          load_number,
          invoice_number,
          reference_number,
          rate,
          pickup_date,
          delivery_date,
          pickup_city,
          pickup_state,
          delivery_city,
          delivery_state,
          completed_at,
          broker_name,
          broker_contact,
          broker_phone,
          broker_email,
          broker_address,
          broker_city,
          broker_state,
          broker_zip,
          cargo_description,
          cargo_weight,
          cargo_pieces,
          estimated_miles,
          customers(name),
          carriers(name)
        `)
        .eq("id", loadId)
        .single();

      if (companyData) setCompany(companyData as CompanyProfile);
      if (loadData) setLoad(loadData as LoadData);
    } catch (error) {
      console.error("Error fetching invoice data:", error);
    } finally {
      setLoading(false);
    }
  };

  const formatCurrency = (amount: number | null) => {
    if (amount === null || amount === undefined) return "$0.00";
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: "USD",
    }).format(amount);
  };

  const handlePrint = () => {
    window.print();
  };

  const handleDownloadPdf = async () => {
    if (!invoiceRef.current) return;
    
    setGeneratingPdf(true);
    try {
      const element = invoiceRef.current;
      const canvas = await html2canvas(element, {
        scale: 2,
        useCORS: true,
        logging: false,
        backgroundColor: '#ffffff',
      });
      
      const imgData = canvas.toDataURL('image/png');
      const pdf = new jsPDF({
        orientation: 'portrait',
        unit: 'px',
        format: [canvas.width, canvas.height]
      });
      
      pdf.addImage(imgData, 'PNG', 0, 0, canvas.width, canvas.height);
      pdf.save(`Invoice-${load?.invoice_number || load?.load_number || 'preview'}.pdf`);
      toast.success("PDF downloaded successfully");
    } catch (error) {
      console.error("Error generating PDF:", error);
      toast.error("Failed to generate PDF");
    } finally {
      setGeneratingPdf(false);
    }
  };

  const invoiceDate = load?.completed_at || load?.delivery_date || new Date().toISOString();
  const dueDate = new Date(new Date(invoiceDate).getTime() + 30 * 24 * 60 * 60 * 1000);

  if (loading) {
    return (
      <Card className="p-8 mt-2 mb-4 animate-pulse">
        <div className="h-48 bg-muted rounded" />
      </Card>
    );
  }

  return (
    <Card className="mt-2 mb-4 overflow-hidden border-2 border-primary/20 shadow-lg">
      {/* Header with close button */}
      <div className="bg-gradient-to-r from-primary/10 to-primary/5 px-6 py-3 flex justify-between items-center border-b">
        <span className="font-semibold text-primary">Invoice Preview</span>
        <div className="flex gap-2">
          <Button variant="ghost" size="sm" className="h-8" onClick={handlePrint}>
            <Printer className="h-4 w-4 mr-1" />
            Print
          </Button>
          <Button variant="ghost" size="sm" className="h-8" onClick={handleDownloadPdf} disabled={generatingPdf}>
            {generatingPdf ? (
              <Loader2 className="h-4 w-4 mr-1 animate-spin" />
            ) : (
              <Download className="h-4 w-4 mr-1" />
            )}
            PDF
          </Button>
          <Button variant="ghost" size="sm" className="h-8">
            <Send className="h-4 w-4 mr-1" />
            Send
          </Button>
          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={onClose}>
            <X className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {/* Invoice Content */}
      <div ref={invoiceRef} className="p-8 bg-white">
        {/* Company Header */}
        <div className="flex justify-between items-start mb-8">
          <div className="flex items-start gap-4">
            {company?.logo_url ? (
              <img 
                src={company.logo_url} 
                alt={company.company_name} 
                className="h-16 w-auto object-contain"
              />
            ) : (
              <div className="h-16 w-16 bg-primary/10 rounded-lg flex items-center justify-center">
                <span className="text-2xl font-bold text-primary">
                  {company?.company_name?.charAt(0) || "T"}
                </span>
              </div>
            )}
            <div>
              <h1 className="text-2xl font-bold text-foreground">
                {company?.company_name || "Company Name"}
              </h1>
              {company?.legal_name && company.legal_name !== company.company_name && (
                <p className="text-sm text-muted-foreground">{company.legal_name}</p>
              )}
              <p className="text-sm text-muted-foreground mt-1">
                {company?.address && <span>{company.address}<br /></span>}
                {company?.city && company?.state && (
                  <span>{company.city}, {company.state} {company?.zip}</span>
                )}
              </p>
              {company?.phone && (
                <p className="text-sm text-muted-foreground">{company.phone}</p>
              )}
              <div className="flex gap-4 mt-1 text-xs text-muted-foreground">
                {company?.mc_number && <span>MC# {company.mc_number}</span>}
                {company?.dot_number && <span>DOT# {company.dot_number}</span>}
              </div>
            </div>
          </div>

          <div className="text-right">
            <h2 className="text-4xl font-bold text-primary mb-2">INVOICE</h2>
            <div className="space-y-1">
              <p className="text-lg font-semibold">
                #{load?.invoice_number || load?.load_number}
              </p>
              <p className="text-sm text-muted-foreground">
                Date: {format(new Date(invoiceDate), "MMMM d, yyyy")}
              </p>
              <p className="text-sm text-muted-foreground">
                Due: {format(dueDate, "MMMM d, yyyy")}
              </p>
            </div>
          </div>
        </div>

        <Separator className="my-6" />

        {/* Bill To / Remit To */}
        <div className="grid grid-cols-2 gap-8 mb-8">
          <div>
            <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">
              Bill To
            </h3>
            <div className="bg-muted/30 rounded-lg p-4">
              <p className="font-semibold text-foreground">
                {load?.broker_name || load?.customers?.name || "—"}
              </p>
              {load?.broker_contact && (
                <p className="text-sm text-muted-foreground">Attn: {load.broker_contact}</p>
              )}
              {load?.broker_address && (
                <p className="text-sm text-muted-foreground">{load.broker_address}</p>
              )}
              {(load?.broker_city || load?.broker_state) && (
                <p className="text-sm text-muted-foreground">
                  {load.broker_city}{load.broker_city && load.broker_state && ", "}
                  {load.broker_state} {load?.broker_zip}
                </p>
              )}
              {load?.broker_phone && (
                <p className="text-sm text-muted-foreground">{load.broker_phone}</p>
              )}
              {load?.broker_email && (
                <p className="text-sm text-muted-foreground">{load.broker_email}</p>
              )}
            </div>
          </div>

          <div>
            <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">
              Remit Payment To
            </h3>
            <div className="bg-primary/5 rounded-lg p-4 border border-primary/20">
              {company?.factoring_company_name ? (
                <>
                  <p className="font-semibold text-foreground">{company.factoring_company_name}</p>
                  {company.factoring_company_address && (
                    <p className="text-sm text-muted-foreground">{company.factoring_company_address}</p>
                  )}
                  {(company.factoring_company_city || company.factoring_company_state) && (
                    <p className="text-sm text-muted-foreground">
                      {company.factoring_company_city}{company.factoring_company_city && company.factoring_company_state && ", "}
                      {company.factoring_company_state} {company.factoring_company_zip}
                    </p>
                  )}
                </>
              ) : (
                <>
                  <p className="font-semibold text-foreground">{company?.company_name}</p>
                  {company?.address && (
                    <p className="text-sm text-muted-foreground">{company.address}</p>
                  )}
                  {(company?.city || company?.state) && (
                    <p className="text-sm text-muted-foreground">
                      {company.city}{company.city && company.state && ", "}
                      {company.state} {company?.zip}
                    </p>
                  )}
                </>
              )}
            </div>
          </div>
        </div>

        {/* Load Details Table */}
        <div className="mb-8">
          <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">
            Service Details
          </h3>
          <div className="border rounded-lg overflow-hidden">
            <table className="w-full">
              <thead className="bg-muted/50">
                <tr>
                  <th className="text-left px-4 py-3 text-xs font-semibold uppercase text-muted-foreground">Description</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold uppercase text-muted-foreground">Reference</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold uppercase text-muted-foreground">Route</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold uppercase text-muted-foreground">Date</th>
                  <th className="text-right px-4 py-3 text-xs font-semibold uppercase text-muted-foreground">Amount</th>
                </tr>
              </thead>
              <tbody>
                <tr className="border-t">
                  <td className="px-4 py-4">
                    <p className="font-medium">Freight Transportation</p>
                    <p className="text-sm text-muted-foreground">
                      {load?.cargo_description || "General Freight"}
                      {load?.cargo_weight && ` • ${load.cargo_weight} lbs`}
                      {load?.cargo_pieces && ` • ${load.cargo_pieces} pc(s)`}
                    </p>
                    {load?.estimated_miles && (
                      <p className="text-sm text-muted-foreground">{load.estimated_miles} miles</p>
                    )}
                  </td>
                  <td className="px-4 py-4">
                    <p className="font-medium">{load?.reference_number || "—"}</p>
                    <p className="text-xs text-muted-foreground">Load: {load?.load_number}</p>
                  </td>
                  <td className="px-4 py-4">
                    <p className="text-sm">
                      {load?.pickup_city}, {load?.pickup_state}
                    </p>
                    <p className="text-xs text-muted-foreground">to</p>
                    <p className="text-sm">
                      {load?.delivery_city}, {load?.delivery_state}
                    </p>
                  </td>
                  <td className="px-4 py-4">
                    <p className="text-sm">
                      {load?.pickup_date ? format(new Date(load.pickup_date), "M/d/yy") : "—"}
                    </p>
                    <p className="text-xs text-muted-foreground">to</p>
                    <p className="text-sm">
                      {load?.delivery_date ? format(new Date(load.delivery_date), "M/d/yy") : "—"}
                    </p>
                  </td>
                  <td className="px-4 py-4 text-right">
                    <p className="font-semibold text-lg">{formatCurrency(load?.rate)}</p>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>

        {/* Totals */}
        <div className="flex justify-end">
          <div className="w-72">
            <div className="space-y-2">
              <div className="flex justify-between py-2">
                <span className="text-muted-foreground">Subtotal</span>
                <span className="font-medium">{formatCurrency(load?.rate)}</span>
              </div>
              <div className="flex justify-between py-2">
                <span className="text-muted-foreground">Fuel Surcharge</span>
                <span className="font-medium">$0.00</span>
              </div>
              <div className="flex justify-between py-2">
                <span className="text-muted-foreground">Advance Issued</span>
                <span className="font-medium text-destructive">-$0.00</span>
              </div>
              <Separator />
              <div className="flex justify-between py-3">
                <span className="text-lg font-bold">Total Due</span>
                <span className="text-lg font-bold text-primary">{formatCurrency(load?.rate)}</span>
              </div>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="mt-8 pt-6 border-t">
          <div className="text-center text-sm text-muted-foreground">
            <p className="font-medium mb-1">Thank you for your business!</p>
            <p>Payment Terms: Net 30 • Please include invoice number with payment</p>
            {company?.email && <p className="mt-2">Questions? Contact us at {company.email}</p>}
          </div>
        </div>
      </div>
    </Card>
  );
}
