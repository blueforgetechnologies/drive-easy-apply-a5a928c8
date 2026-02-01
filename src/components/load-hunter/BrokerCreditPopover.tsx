import React, { useState, useEffect } from "react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { ScrollArea } from "@/components/ui/scroll-area";

import { 
  Loader2, RefreshCw, Building2, MapPin, Hash, Phone, Shield, 
  CheckCircle2, XCircle, AlertCircle, UserPlus, ExternalLink,
  FileText, Users, HelpCircle, Sparkles, DollarSign, GitMerge, Database
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useTenantFilter } from "@/hooks/useTenantFilter";
import { toast } from "sonner";
import { useNavigate } from "react-router-dom";
import { cleanCompanyName } from "@/lib/companyName";

type BrokerApprovalStatus = 'approved' | 'not_approved' | 'not_found' | 'call_otr' | 'unchecked' | 'checking' | string;

const getStatusColor = (status: BrokerApprovalStatus | null | undefined): { dot: string; text: string; label: string; bg: string } => {
  switch (status) {
    case 'approved':
      return { dot: 'bg-green-500', text: 'text-green-600', label: 'Approved', bg: 'bg-green-50 dark:bg-green-950/30' };
    case 'not_approved':
      return { dot: 'bg-red-500', text: 'text-red-600', label: 'Not Approved', bg: 'bg-red-50 dark:bg-red-950/30' };
    case 'not_found':
      return { dot: 'bg-gray-900 dark:bg-gray-100', text: 'text-gray-700', label: 'Not Found', bg: 'bg-gray-50 dark:bg-gray-950/30' };
    case 'call_otr':
      return { dot: 'bg-orange-500', text: 'text-orange-600', label: 'Call OTR', bg: 'bg-orange-50 dark:bg-orange-950/30' };
    case 'checking':
      return { dot: 'bg-blue-400 animate-pulse', text: 'text-blue-600', label: 'Checking...', bg: 'bg-blue-50 dark:bg-blue-950/30' };
    case 'unchecked':
    default:
      return { dot: 'bg-orange-400', text: 'text-muted-foreground', label: 'Unchecked', bg: 'bg-orange-50 dark:bg-orange-950/30' };
  }
};

interface OtrData {
  name?: string;
  approval_status?: string;
  credit_limit?: number;
  mc_number?: string;
}

interface FmcsaData {
  legal_name?: string;
  dba_name?: string;
  dot_number?: string;
  mc_number?: string;
  physical_address?: string;
  phone?: string;
  safer_status?: string;
  safety_rating?: string;
}

interface ExistingCustomer {
  id: string;
  name: string;
  mc_number?: string;
  address?: string;
  city?: string;
  state?: string;
  zip?: string;
  phone?: string;
}

interface SimilarCustomer {
  id: string;
  name: string;
  mc_number?: string;
  address?: string;
  city?: string;
  state?: string;
  zip?: string;
  phone?: string;
  otr_approval_status?: string;
}

interface BrokerCreditPopoverProps {
  customerName: string;
  truncatedName: string;
  mcNumber?: string;
  brokerStatus?: { status: string; brokerName?: string; mcNumber?: string };
  loadEmailId: string;
  parsedData?: {
    broker_name?: string;
    broker_address?: string;
    broker_city?: string;
    broker_state?: string;
    broker_zip?: string;
    broker_phone?: string;
  };
  children?: React.ReactNode;
}

export function BrokerCreditPopover({
  customerName,
  truncatedName,
  mcNumber,
  brokerStatus,
  loadEmailId,
  parsedData,
}: BrokerCreditPopoverProps) {
  const { tenantId } = useTenantFilter();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [isChecking, setIsChecking] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [localMcNumber, setLocalMcNumber] = useState(mcNumber || brokerStatus?.mcNumber || '');
  const [currentStatus, setCurrentStatus] = useState(brokerStatus?.status || 'unchecked');
  
  // 3-source data
  const [otrData, setOtrData] = useState<OtrData | null>(null);
  const [fmcsaData, setFmcsaData] = useState<FmcsaData | null>(null);
  const [existingCustomer, setExistingCustomer] = useState<ExistingCustomer | null>(null);
  const [similarCustomers, setSimilarCustomers] = useState<SimilarCustomer[]>([]);
  
  // User selections for saving
  const [selectedAddressSource, setSelectedAddressSource] = useState<'posted' | 'fmcsa' | 'otr'>('fmcsa');
  const [customOtrAddress, setCustomOtrAddress] = useState('');
  const [selectedMergeCustomerId, setSelectedMergeCustomerId] = useState<string | null>(null);
  
  const [hasChecked, setHasChecked] = useState(false);

  const statusColors = getStatusColor(isChecking ? 'checking' : currentStatus);

  // Always display a clean company name in the UI (email subjects often include metadata)
  const displayBrokerName =
    cleanCompanyName(parsedData?.broker_name || customerName) || cleanCompanyName(customerName) || customerName;

  const triggerNameSource =
    cleanCompanyName(customerName) || cleanCompanyName(truncatedName) || truncatedName || customerName;
  const triggerBrokerName =
    triggerNameSource.length > 25 ? `${triggerNameSource.slice(0, 23)}…` : triggerNameSource;

  // Update status when brokerStatus prop changes
  useEffect(() => {
    if (brokerStatus?.status) {
      setCurrentStatus(brokerStatus.status);
    }
  }, [brokerStatus?.status]);

  // Look up existing customer by name when popover opens
  useEffect(() => {
    if (!open || !tenantId || !customerName) return;
    
    // If we already have an MC from props, don't look up
    if (mcNumber || brokerStatus?.mcNumber) return;
    
    const lookupCustomer = async () => {
      try {
        // Clean up the customer name for better matching
        // Remove common suffixes like "Broker Posted:", dates, etc.
        let cleanName = customerName
          .replace(/\s*(Broker|Posted|Bro\.?|:|\d{1,2}\/\d{1,2}\/\d{2,4}).*$/gi, '')
          .replace(/\s*(LLC|INC|CORP|LTD|CO\.?)?\s*$/gi, '')
          .trim();
        
        // Use first 2-3 significant words for search
        const searchTerms = cleanName.split(/\s+/).slice(0, 3).join(' ');
        const searchPattern = searchTerms.length >= 2 ? `%${searchTerms}%` : `%${cleanName}%`;
        
        console.log('[BrokerCreditPopover] Looking up customer:', { customerName, cleanName, searchPattern });
        
        const { data } = await supabase
          .from('customers')
          .select('id, name, mc_number, otr_approval_status, address, city, state, zip, phone')
          .eq('tenant_id', tenantId)
          .ilike('name', searchPattern)
          .limit(5);
        
        console.log('[BrokerCreditPopover] Customer lookup result:', data);
        
        if (data && data.length > 0) {
          // Find best match - prefer exact or partial match on clean name
          const exactMatch = data.find(c => 
            c.name.toLowerCase().includes(cleanName.toLowerCase()) ||
            cleanName.toLowerCase().includes(c.name.toLowerCase().replace(/\s*(llc|inc|corp|ltd|co\.?)?\s*$/gi, ''))
          );
          const match = exactMatch || data[0];
          
          if (match) {
            if (match.mc_number && !localMcNumber) {
              setLocalMcNumber(match.mc_number);
            }
            setExistingCustomer({
              id: match.id,
              name: match.name,
              mc_number: match.mc_number || undefined,
              address: match.address || undefined,
              city: match.city || undefined,
              state: match.state || undefined,
              zip: match.zip || undefined,
              phone: match.phone || undefined,
            });
            if (match.otr_approval_status) {
              setCurrentStatus(match.otr_approval_status);
            }
          }
        }
      } catch (error) {
        console.error('[BrokerCreditPopover] Customer lookup failed:', error);
      }
    };
    
    lookupCustomer();
  }, [open, tenantId, customerName, mcNumber, brokerStatus?.mcNumber]);

  // Build posted load address
  const postedAddress = [
    parsedData?.broker_address,
    parsedData?.broker_city,
    parsedData?.broker_state,
    parsedData?.broker_zip,
  ].filter(Boolean).join(', ') || null;

  const handleCheckCredit = async () => {
    if (!tenantId) {
      toast.error('No tenant selected');
      return;
    }

    const mcToCheck = localMcNumber.trim();
    if (!mcToCheck) {
      toast.error('Please enter an MC number');
      return;
    }

    setIsChecking(true);
    setHasChecked(false);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        toast.error('Not authenticated');
        return;
      }

      const response = await supabase.functions.invoke('check-broker-credit', {
        body: {
          tenant_id: tenantId,
          mc_number: mcToCheck,
          broker_name: customerName,
          load_email_id: loadEmailId,
        },
      });

      if (response.error) {
        throw new Error(response.error.message);
      }

      const result = response.data;
      
      // Update state with all response data
      setCurrentStatus(result.approval_status || 'unchecked');
      setOtrData(result.otr_data || null);
      setFmcsaData(result.fmcsa_data || null);
      setExistingCustomer(result.existing_customer || null);
      setSimilarCustomers(result.similar_customers || []);
      setHasChecked(true);
      
      // Auto-select best address source
      if (result.fmcsa_data?.physical_address) {
        setSelectedAddressSource('fmcsa');
      } else if (postedAddress) {
        setSelectedAddressSource('posted');
      }

      if (result.success !== false) {
        toast.success(`Credit check complete: ${result.approval_status || 'Unknown'}`);
      } else if (result.error) {
        toast.error(result.error);
      }
    } catch (error) {
      console.error('[BrokerCreditPopover] Check failed:', error);
      toast.error(error instanceof Error ? error.message : 'Failed to check credit');
    } finally {
      setIsChecking(false);
    }
  };

  const handleSaveCustomer = async () => {
    if (!tenantId || !otrData?.name) {
      toast.error('OTR name required - run credit check first');
      return;
    }

    setIsSaving(true);
    try {
      const cleanMc = localMcNumber.replace(/^MC-?/i, '').trim();
      
      // Build customer data - OTR name + MC is authoritative
      // Determine address based on source selection
      let addressValue: string | null = null;
      let cityValue: string | null = null;
      let stateValue: string | null = null;
      let zipValue: string | null = null;
      
      if (selectedAddressSource === 'otr' && customOtrAddress.trim()) {
        // Use custom OTR address as full address string
        addressValue = customOtrAddress.trim();
      } else if (selectedAddressSource === 'fmcsa' && fmcsaData?.physical_address) {
        addressValue = fmcsaData.physical_address;
      } else if (selectedAddressSource === 'posted') {
        addressValue = parsedData?.broker_address || null;
        cityValue = parsedData?.broker_city || null;
        stateValue = parsedData?.broker_state || null;
        zipValue = parsedData?.broker_zip || null;
      }
      
      const customerData = {
        tenant_id: tenantId,
        name: otrData.name, // Always use OTR name for billing
        mc_number: cleanMc,
        otr_approval_status: otrData.approval_status || null,
        otr_credit_limit: otrData.credit_limit || null,
        otr_last_checked_at: new Date().toISOString(),
        status: 'active',
        dot_number: fmcsaData?.dot_number || null,
        address: addressValue,
        city: cityValue,
        state: stateValue,
        zip: zipValue,
        phone: selectedAddressSource === 'fmcsa' && fmcsaData?.phone 
          ? fmcsaData.phone 
          : parsedData?.broker_phone || null,
      };

      // Merge or create
      if (selectedMergeCustomerId) {
        // Update existing customer
        const { error } = await supabase
          .from('customers')
          .update(customerData)
          .eq('id', selectedMergeCustomerId)
          .eq('tenant_id', tenantId);

        if (error) throw error;
        toast.success('Customer updated successfully');
        setExistingCustomer({ 
          id: selectedMergeCustomerId, 
          name: otrData.name,
          mc_number: cleanMc,
        });
      } else {
        // Create new customer
        const { data, error } = await supabase
          .from('customers')
          .insert(customerData)
          .select('id, name, mc_number')
          .single();

        if (error) {
          if (error.code === '23505') {
            toast.error('Customer with this MC number already exists');
          } else {
            throw error;
          }
          return;
        }
        
        toast.success('Customer created successfully');
        setExistingCustomer({ 
          id: data.id, 
          name: data.name,
          mc_number: data.mc_number || undefined,
        });
        setSimilarCustomers([]);
      }
    } catch (error) {
      console.error('[BrokerCreditPopover] Save failed:', error);
      toast.error(error instanceof Error ? error.message : 'Failed to save customer');
    } finally {
      setIsSaving(false);
    }
  };

  // Button style based on status
  const getButtonStyle = () => {
    const baseClass = 'w-[210px] max-w-[210px] px-3 py-1.5 font-bold text-sm flex items-center gap-2 rounded-lg shadow-md cursor-pointer transition-all duration-200 hover:scale-[1.02] hover:shadow-lg active:scale-[0.98]';
    
    if (currentStatus === 'not_found') {
      return {
        className: `${baseClass} bg-gray-900 dark:bg-gray-800 text-white border border-gray-700`,
        boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.1), 0 2px 4px rgba(0,0,0,0.3)',
      };
    }
    if (currentStatus === 'approved') {
      return {
        className: `${baseClass} bg-gradient-to-b from-green-500 to-green-600 text-white border border-green-400`,
        boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.3), 0 2px 4px rgba(0,0,0,0.15)',
      };
    }
    if (currentStatus === 'not_approved') {
      return {
        className: `${baseClass} bg-gradient-to-b from-red-500 to-red-600 text-white border border-red-400`,
        boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.3), 0 2px 4px rgba(0,0,0,0.15)',
      };
    }
    return {
      className: `${baseClass} bg-gradient-to-b from-amber-400 to-amber-500 text-amber-900 border border-amber-300`,
      boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.4), 0 2px 4px rgba(0,0,0,0.1)',
    };
  };

  const buttonStyle = getButtonStyle();

  const getApprovalIcon = (status: string | undefined) => {
    switch (status) {
      case 'approved': return <CheckCircle2 className="h-4 w-4 text-green-500" />;
      case 'not_approved': return <XCircle className="h-4 w-4 text-red-500" />;
      case 'call_otr': return <AlertCircle className="h-4 w-4 text-orange-500" />;
      default: return <AlertCircle className="h-4 w-4 text-gray-400" />;
    }
  };

  return (
    <TooltipProvider>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <button
            type="button"
            className={buttonStyle.className}
            style={{ boxShadow: buttonStyle.boxShadow }}
            onClick={(e) => e.stopPropagation()}
          >
            <span className="truncate">{triggerBrokerName}</span>
          </button>
        </PopoverTrigger>
        <PopoverContent 
          className={`p-0 card-glossy border-0 overflow-hidden transition-all ${similarCustomers.length > 0 || existingCustomer ? 'w-[740px]' : 'w-[560px]'}`}
          side="bottom" 
          align="start"
          sideOffset={5}
          collisionPadding={16}
          avoidCollisions={true}
          onClick={(e) => e.stopPropagation()}
        >
          <ScrollArea className="max-h-[calc(100vh-200px)] overflow-y-auto">
          {/* Header - Broker Name Only */}
          <div className={`relative overflow-hidden ${existingCustomer ? 'bg-gradient-to-r from-green-500 to-emerald-600' : 'bg-gradient-to-r from-primary to-blue-600'}`}>
            <div className="absolute inset-0 bg-[linear-gradient(180deg,rgba(255,255,255,0.15)_0%,transparent_50%,rgba(0,0,0,0.1)_100%)]" />
            <div className="relative px-4 py-3 flex items-center justify-between">
              <h3 className="font-bold text-white text-base truncate" title={displayBrokerName}>
                {displayBrokerName.length > 35 ? displayBrokerName.slice(0, 33) + '…' : displayBrokerName}
              </h3>
              <Badge 
                className={`flex-shrink-0 px-3 py-1 font-semibold text-xs border-0 shadow-lg ${
                  existingCustomer 
                    ? 'bg-white text-green-700' 
                    : 'bg-white text-blue-700'
                }`}
                style={{ boxShadow: '0 2px 8px rgba(0,0,0,0.15)' }}
              >
                {existingCustomer ? (
                  <>
                    <CheckCircle2 className="h-3.5 w-3.5 mr-1" />
                    Existing Customer
                  </>
                ) : (
                  <>
                    <Sparkles className="h-3.5 w-3.5 mr-1" />
                    New Broker
                  </>
                )}
              </Badge>
            </div>
          </div>

          {/* MC Number input with glossy styling */}
          <div className="p-4 border-b border-border/50 bg-gradient-to-b from-muted/30 to-transparent">
            <div className="flex gap-3 items-end">
              <div className="flex-1">
                <Label htmlFor="mc-number" className="text-xs font-semibold flex items-center gap-1.5 mb-2 text-muted-foreground">
                  <Hash className="h-3.5 w-3.5" />
                  MC Number
                </Label>
                <Input
                  id="mc-number"
                  value={localMcNumber}
                  onChange={(e) => setLocalMcNumber(e.target.value)}
                  placeholder="Enter MC number"
                  className="h-10 text-sm font-medium"
                  onClick={(e) => e.stopPropagation()}
                />
              </div>
              <Button
                onClick={handleCheckCredit}
                disabled={isChecking || !localMcNumber.trim()}
                className="h-10 px-6 gap-2 btn-glossy-primary text-white font-semibold"
              >
                {isChecking ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <RefreshCw className="h-4 w-4" />
                )}
                Check
              </Button>
            </div>
          </div>

          {/* 3-Source Comparison Grid - Puffy Glossy Cards */}
          {hasChecked && (
            <div className="p-3 space-y-2">
              {/* Column Headers - Dynamic 3 or 4 columns */}
              <div className={`grid gap-1.5 ${similarCustomers.length > 0 || existingCustomer ? 'grid-cols-4' : 'grid-cols-3'}`}>
                <div className="cell-puffy-amber flex items-center justify-center gap-1 py-1.5 px-2 rounded-lg">
                  <FileText className="h-3 w-3 text-amber-600" />
                  <span className="font-bold text-[9px] text-amber-700 uppercase tracking-wide">Posted</span>
                </div>
                <div className="cell-puffy-green flex items-center justify-center gap-1 py-1.5 px-2 rounded-lg">
                  <Shield className="h-3 w-3 text-green-600" />
                  <span className="font-bold text-[9px] text-green-700 uppercase tracking-wide">OTR</span>
                </div>
                <div className="cell-puffy-blue flex items-center justify-center gap-1 py-1.5 px-2 rounded-lg">
                  <Building2 className="h-3 w-3 text-blue-600" />
                  <span className="font-bold text-[9px] text-blue-700 uppercase tracking-wide">FMCSA</span>
                </div>
                {(similarCustomers.length > 0 || existingCustomer) && (
                  <div className="cell-puffy-purple flex items-center justify-center gap-1 py-1.5 px-2 rounded-lg">
                    <Database className="h-3 w-3 text-purple-600" />
                    <span className="font-bold text-[9px] text-purple-700 uppercase tracking-wide">Saved</span>
                  </div>
                )}
              </div>

              {/* Data Cards Grid - Dynamic 3 or 4 columns */}
              <div className={`grid gap-1.5 ${similarCustomers.length > 0 || existingCustomer ? 'grid-cols-4' : 'grid-cols-3'}`}>
                {/* Row 1: Names */}
                <div className="cell-puffy rounded-lg p-2">
                  <div className="text-[8px] uppercase tracking-wider text-muted-foreground font-bold mb-0.5">Name</div>
                  <div className="font-semibold text-[11px] truncate" title={displayBrokerName}>
                    {displayBrokerName || '—'}
                  </div>
                </div>
                <div className="cell-puffy-green rounded-lg p-2 border-l-2 border-l-green-500">
                  <div className="text-[8px] uppercase tracking-wider text-green-700 font-bold mb-0.5 flex items-center gap-0.5">
                    <CheckCircle2 className="h-2.5 w-2.5" />
                    Billing
                  </div>
                  <div className="font-bold text-[11px] text-green-800 dark:text-green-200 truncate" title={otrData?.name}>
                    {otrData?.name || '—'}
                  </div>
                </div>
                <div className="cell-puffy-blue rounded-lg p-2">
                  <div className="text-[8px] uppercase tracking-wider text-blue-700 font-bold mb-0.5">Legal</div>
                  <div className="font-semibold text-[11px] truncate" title={fmcsaData?.legal_name}>
                    {fmcsaData?.legal_name || fmcsaData?.dba_name || '—'}
                  </div>
                </div>
                {/* 4th Column: Saved Customer Name */}
                {(similarCustomers.length > 0 || existingCustomer) && (
                  <div className={`cell-puffy-purple rounded-lg p-2 ${existingCustomer ? 'border-l-2 border-l-purple-500' : ''}`}>
                    <div className="text-[8px] uppercase tracking-wider text-purple-700 font-bold mb-0.5 flex items-center gap-0.5">
                      {existingCustomer ? <CheckCircle2 className="h-2.5 w-2.5" /> : <GitMerge className="h-2.5 w-2.5" />}
                      {existingCustomer ? 'Matched' : 'Similar'}
                    </div>
                    <div className="font-semibold text-[11px] truncate text-purple-800 dark:text-purple-200" title={existingCustomer?.name || similarCustomers[0]?.name}>
                      {existingCustomer?.name || similarCustomers[0]?.name || '—'}
                    </div>
                  </div>
                )}

                {/* Row 2: Status/Approval/DOT/Saved Status */}
                <div className="cell-puffy rounded-lg p-2">
                  <div className="text-[8px] uppercase tracking-wider text-muted-foreground font-bold mb-0.5">Source</div>
                  <div className="font-medium text-[11px] flex items-center gap-1">
                    <div className="h-1.5 w-1.5 rounded-full bg-amber-400" />
                    Email
                  </div>
                </div>
                <div className={`rounded-lg p-2 border-l-2 ${
                  otrData?.approval_status === 'approved' 
                    ? 'cell-puffy-green border-l-green-500' 
                    : otrData?.approval_status === 'not_approved'
                    ? 'cell-puffy border-l-red-500 bg-gradient-to-br from-red-50 to-rose-50 dark:from-red-950/50'
                    : 'cell-puffy-amber border-l-amber-500'
                }`}>
                  <div className="text-[8px] uppercase tracking-wider text-green-700 font-bold mb-0.5">Approval</div>
                  <div className="flex items-center gap-1">
                    {getApprovalIcon(otrData?.approval_status)}
                    <span className="font-bold text-[11px] capitalize">
                      {otrData?.approval_status?.replace('_', ' ') || '—'}
                    </span>
                  </div>
                  {otrData?.credit_limit && (
                    <div className="flex items-center gap-0.5 mt-0.5 text-[9px] text-muted-foreground">
                      <DollarSign className="h-2 w-2" />
                      ${otrData.credit_limit.toLocaleString()}
                    </div>
                  )}
                </div>
                <div className="cell-puffy-blue rounded-lg p-2">
                  <div className="text-[8px] uppercase tracking-wider text-blue-700 font-bold mb-0.5">DOT</div>
                  <div className="font-semibold text-[11px]">
                    {fmcsaData?.dot_number ? `DOT# ${fmcsaData.dot_number}` : '—'}
                  </div>
                  {fmcsaData?.safer_status && (
                    <Badge 
                      variant="outline" 
                      className={`mt-0.5 text-[7px] font-bold px-1 py-0 h-4 ${
                        fmcsaData.safer_status.includes('AUTHORIZED') 
                          ? 'bg-green-100 text-green-700 border-green-300' 
                          : 'bg-red-100 text-red-700 border-red-300'
                      }`}
                    >
                      {fmcsaData.safer_status}
                    </Badge>
                  )}
                </div>
                {/* 4th Column: Saved Customer MC */}
                {(similarCustomers.length > 0 || existingCustomer) && (
                  <div className="cell-puffy-purple rounded-lg p-2">
                    <div className="text-[8px] uppercase tracking-wider text-purple-700 font-bold mb-0.5">MC #</div>
                    <div className="font-semibold text-[11px]">
                      {existingCustomer?.mc_number ? `MC# ${existingCustomer.mc_number}` : similarCustomers[0]?.mc_number ? `MC# ${similarCustomers[0].mc_number}` : '—'}
                    </div>
                  </div>
                )}

                {/* Row 3: Address - With selectable radio + tooltip */}
                <div 
                  className={`rounded-lg p-2 cursor-pointer transition-all duration-150 ${
                    selectedAddressSource === 'posted' 
                      ? 'cell-puffy-amber ring-2 ring-amber-400 ring-offset-1' 
                      : 'cell-puffy hover:ring-1 hover:ring-amber-300'
                  }`}
                  onClick={() => postedAddress && setSelectedAddressSource('posted')}
                >
                  <div className="flex items-center gap-1 mb-0.5">
                    <input
                      type="radio"
                      name="address-source"
                      value="posted"
                      checked={selectedAddressSource === 'posted'}
                      onChange={() => setSelectedAddressSource('posted')}
                      disabled={!postedAddress}
                      className="h-2.5 w-2.5 accent-amber-500"
                    />
                    <span className="text-[8px] uppercase tracking-wider text-amber-700 font-bold">Address</span>
                  </div>
                  <div className="font-medium text-[9px] leading-tight text-foreground/80">
                    {postedAddress || <span className="text-muted-foreground italic text-[9px]">N/A</span>}
                  </div>
                </div>
                <div className="cell-puffy-green rounded-lg p-2">
                  <div className="text-[8px] uppercase tracking-wider text-green-700 font-bold mb-0.5">MC #</div>
                  <div className="font-bold text-[11px]">
                    {otrData?.mc_number ? `MC# ${otrData.mc_number}` : '—'}
                  </div>
                </div>
                <div 
                  className={`rounded-lg p-2 cursor-pointer transition-all duration-150 ${
                    selectedAddressSource === 'fmcsa' 
                      ? 'cell-puffy-blue ring-2 ring-blue-400 ring-offset-1' 
                      : 'cell-puffy-blue hover:ring-1 hover:ring-blue-300'
                  }`}
                  onClick={() => fmcsaData?.physical_address && setSelectedAddressSource('fmcsa')}
                >
                  <div className="flex items-center gap-1 mb-0.5">
                    <input
                      type="radio"
                      name="address-source"
                      value="fmcsa"
                      checked={selectedAddressSource === 'fmcsa'}
                      onChange={() => setSelectedAddressSource('fmcsa')}
                      disabled={!fmcsaData?.physical_address}
                      className="h-2.5 w-2.5 accent-blue-500"
                    />
                    <span className="text-[8px] uppercase tracking-wider text-blue-700 font-bold">Address</span>
                  </div>
                  <div className="font-medium text-[9px] leading-tight text-foreground/80">
                    {fmcsaData?.physical_address || <span className="text-muted-foreground italic text-[9px]">N/A</span>}
                  </div>
                </div>
                {/* 4th Column: Saved Customer Address */}
                {(similarCustomers.length > 0 || existingCustomer) && (
                  <div className="cell-puffy-purple rounded-lg p-2">
                    <div className="text-[8px] uppercase tracking-wider text-purple-700 font-bold mb-0.5">Address</div>
                    <div className="font-medium text-[9px] leading-tight text-foreground/80">
                      {existingCustomer?.address ? (
                        [existingCustomer.address, existingCustomer.city, existingCustomer.state, existingCustomer.zip].filter(Boolean).join(', ')
                      ) : <span className="text-muted-foreground italic text-[9px]">N/A</span>}
                    </div>
                  </div>
                )}

                {/* Row 3.5: OTR Address Input - Spans full width */}
                <div 
                  className={`rounded-lg p-2 transition-all duration-150 ${
                    selectedAddressSource === 'otr' 
                      ? 'cell-puffy-green ring-2 ring-green-400 ring-offset-1' 
                      : 'cell-puffy-green hover:ring-1 hover:ring-green-300'
                  }`}
                  style={{ gridColumn: similarCustomers.length > 0 || existingCustomer ? 'span 4' : 'span 3' }}
                  onClick={() => setSelectedAddressSource('otr')}
                >
                  <div className="flex items-center gap-1 mb-1">
                    <input
                      type="radio"
                      name="address-source"
                      value="otr"
                      checked={selectedAddressSource === 'otr'}
                      onChange={() => setSelectedAddressSource('otr')}
                      className="h-2.5 w-2.5 accent-green-500"
                    />
                    <span className="text-[8px] uppercase tracking-wider text-green-700 font-bold">OTR Address (Paste)</span>
                  </div>
                  <Input
                    value={customOtrAddress}
                    onChange={(e) => {
                      setCustomOtrAddress(e.target.value);
                      if (e.target.value.trim()) {
                        setSelectedAddressSource('otr');
                      }
                    }}
                    onClick={(e) => e.stopPropagation()}
                    placeholder="Paste address from OTR Solutions portal..."
                    className="h-7 text-[11px] bg-white/80 dark:bg-black/30 border-green-200 focus:border-green-400 focus:ring-green-400"
                  />
                </div>

                {/* Row 4: Phone */}
                <div className="cell-puffy rounded-lg p-2">
                  <div className="text-[8px] uppercase tracking-wider text-muted-foreground font-bold mb-0.5">Phone</div>
                  <div className="font-medium text-[11px] flex items-center gap-1">
                    {parsedData?.broker_phone ? (
                      <>
                        <Phone className="h-2.5 w-2.5 text-muted-foreground" />
                        {parsedData.broker_phone}
                      </>
                    ) : <span className="text-muted-foreground text-[10px]">—</span>}
                  </div>
                </div>
                <div className="cell-puffy-green rounded-lg p-2">
                  <div className="h-full flex items-center justify-center">
                    <span className="text-[9px] text-muted-foreground">N/A</span>
                  </div>
                </div>
                <div className="cell-puffy-blue rounded-lg p-2">
                  <div className="text-[8px] uppercase tracking-wider text-blue-700 font-bold mb-0.5">Phone</div>
                  <div className="font-medium text-[11px] flex items-center gap-1">
                    {fmcsaData?.phone ? (
                      <>
                        <Phone className="h-2.5 w-2.5 text-blue-500" />
                        {fmcsaData.phone}
                      </>
                    ) : <span className="text-muted-foreground text-[10px]">—</span>}
                  </div>
                </div>
                {/* 4th Column: Saved Customer Phone */}
                {(similarCustomers.length > 0 || existingCustomer) && (
                  <div className="cell-puffy-purple rounded-lg p-2">
                    <div className="text-[8px] uppercase tracking-wider text-purple-700 font-bold mb-0.5">Phone</div>
                    <div className="font-medium text-[11px] flex items-center gap-1">
                      {existingCustomer?.phone ? (
                        <>
                          <Phone className="h-2.5 w-2.5 text-purple-500" />
                          {existingCustomer.phone}
                        </>
                      ) : <span className="text-muted-foreground text-[10px]">—</span>}
                    </div>
                  </div>
                )}
              </div>

              {/* Similar Customers - Merge Option with Purple Theme */}
              {similarCustomers.length > 0 && !existingCustomer && (
                <div className="cell-puffy-purple rounded-lg p-2.5 mt-1">
                  <div className="flex items-center gap-1.5 text-xs font-bold text-purple-700 mb-1">
                    <GitMerge className="h-3 w-3" />
                    Similar customers found
                  </div>
                  <p className="text-[9px] text-purple-600/80 mb-1.5 ml-4">
                    Is this the same broker? Select to merge or create new.
                  </p>
                  <div className="space-y-1">
                    <label className={`flex items-center gap-1.5 text-[10px] cursor-pointer p-1.5 rounded-md transition-colors ${
                      selectedMergeCustomerId === null 
                        ? 'bg-green-100/80 dark:bg-green-950/50 ring-1 ring-green-400' 
                        : 'bg-white/60 dark:bg-black/20 hover:bg-white/80'
                    }`}>
                      <input
                        type="radio"
                        name="merge"
                        checked={selectedMergeCustomerId === null}
                        onChange={() => setSelectedMergeCustomerId(null)}
                        className="h-2.5 w-2.5 accent-green-500"
                      />
                      <UserPlus className="h-2.5 w-2.5 text-green-600" />
                      <span className="font-semibold text-green-700">Create new customer</span>
                    </label>
                    {similarCustomers.slice(0, 3).map(c => (
                      <label key={c.id} className={`flex items-center gap-1.5 text-[10px] cursor-pointer p-1.5 rounded-md transition-colors ${
                        selectedMergeCustomerId === c.id 
                          ? 'bg-purple-100/80 dark:bg-purple-950/50 ring-1 ring-purple-400' 
                          : 'bg-white/60 dark:bg-black/20 hover:bg-white/80'
                      }`}>
                        <input
                          type="radio"
                          name="merge"
                          checked={selectedMergeCustomerId === c.id}
                          onChange={() => setSelectedMergeCustomerId(c.id)}
                          className="h-2.5 w-2.5 accent-purple-500"
                        />
                        <GitMerge className="h-2.5 w-2.5 text-purple-500" />
                        <span className="truncate font-semibold text-purple-800">Merge: {c.name}</span>
                        {c.mc_number && <Badge variant="outline" className="text-[8px] px-1 py-0 h-3.5 bg-white/80 border-purple-200 text-purple-700">MC# {c.mc_number}</Badge>}
                      </label>
                    ))}
                  </div>
                </div>
              )}

              {/* Action Button - Compact Style */}
              <div className="pt-1.5">
                {existingCustomer ? (
                  <Button
                    variant="outline"
                    className="w-full h-9 text-xs font-semibold gap-1.5 rounded-md"
                    onClick={() => {
                      navigate(`/dashboard/customer/${existingCustomer.id}`);
                      setOpen(false);
                    }}
                  >
                    <ExternalLink className="h-3.5 w-3.5" />
                    View Customer Profile
                  </Button>
                ) : (
                  <Button
                    className="w-full h-9 text-xs font-bold gap-1.5 rounded-md btn-glossy-success text-white"
                    onClick={handleSaveCustomer}
                    disabled={isSaving || !otrData?.name}
                  >
                    {isSaving ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <UserPlus className="h-3.5 w-3.5" />
                    )}
                    {selectedMergeCustomerId ? 'Merge & Update' : 'Save as Customer'}
                  </Button>
                )}
              </div>

              {/* Info note with icon */}
              <div className="flex items-center justify-center gap-1.5 py-1.5 px-2 rounded-md bg-muted/30 mt-1">
                <Shield className="h-3 w-3 text-green-600" />
                <p className="text-[9px] text-muted-foreground">
                  Name & MC from <span className="font-semibold text-green-600">OTR</span> (billing authority)
                </p>
              </div>
            </div>
          )}

          {/* Before check state - Compact empty state */}
          {!hasChecked && (
            <div className="p-5 text-center">
              <div className="mx-auto w-10 h-10 cell-puffy rounded-xl flex items-center justify-center mb-2.5">
                <Shield className="h-5 w-5 text-muted-foreground" />
              </div>
              <p className="text-xs font-medium text-foreground mb-0.5">Ready to Verify</p>
              <p className="text-[10px] text-muted-foreground">Enter MC # and click <span className="font-semibold">Check</span></p>
            </div>
          )}
          </ScrollArea>
        </PopoverContent>
      </Popover>
    </TooltipProvider>
  );
}
