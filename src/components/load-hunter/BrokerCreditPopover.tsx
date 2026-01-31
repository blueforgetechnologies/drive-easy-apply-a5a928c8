import React, { useState, useEffect } from "react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";

import { 
  Loader2, RefreshCw, Building2, MapPin, Hash, Phone, Shield, 
  CheckCircle2, XCircle, AlertCircle, UserPlus, ExternalLink,
  FileText, Users, HelpCircle, Sparkles, DollarSign, GitMerge, Database
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useTenantFilter } from "@/hooks/useTenantFilter";
import { toast } from "sonner";
import { useNavigate } from "react-router-dom";

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
  const [selectedAddressSource, setSelectedAddressSource] = useState<'posted' | 'fmcsa'>('fmcsa');
  const [selectedMergeCustomerId, setSelectedMergeCustomerId] = useState<string | null>(null);
  
  const [hasChecked, setHasChecked] = useState(false);

  const statusColors = getStatusColor(isChecking ? 'checking' : currentStatus);

  // Update status when brokerStatus prop changes
  useEffect(() => {
    if (brokerStatus?.status) {
      setCurrentStatus(brokerStatus.status);
    }
  }, [brokerStatus?.status]);

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
      const customerData = {
        tenant_id: tenantId,
        name: otrData.name, // Always use OTR name for billing
        mc_number: cleanMc,
        otr_approval_status: otrData.approval_status || null,
        otr_credit_limit: otrData.credit_limit || null,
        otr_last_checked_at: new Date().toISOString(),
        status: 'active',
        dot_number: fmcsaData?.dot_number || null,
        address: selectedAddressSource === 'fmcsa' && fmcsaData?.physical_address 
          ? fmcsaData.physical_address 
          : parsedData?.broker_address || null,
        city: selectedAddressSource === 'posted' ? parsedData?.broker_city || null : null,
        state: selectedAddressSource === 'posted' ? parsedData?.broker_state || null : null,
        zip: selectedAddressSource === 'posted' ? parsedData?.broker_zip || null : null,
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
    const baseClass = 'w-[160px] max-w-[160px] px-3 py-1.5 font-bold text-sm flex items-center gap-2 rounded-lg shadow-md cursor-pointer transition-all duration-200 hover:scale-[1.02] hover:shadow-lg active:scale-[0.98]';
    
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
            <span className="truncate">{truncatedName}</span>
          </button>
        </PopoverTrigger>
        <PopoverContent 
          className={`p-0 card-glossy border-0 overflow-hidden transition-all ${similarCustomers.length > 0 || existingCustomer ? 'w-[740px]' : 'w-[560px]'}`}
          side="bottom" 
          align="start"
          onClick={(e) => e.stopPropagation()}
        >
          {/* Header with gradient and customer status */}
          <div className={`relative overflow-hidden ${existingCustomer ? 'bg-gradient-to-r from-green-500 to-emerald-600' : 'bg-gradient-to-r from-primary to-blue-600'}`}>
            <div className="absolute inset-0 bg-[linear-gradient(180deg,rgba(255,255,255,0.15)_0%,transparent_50%,rgba(0,0,0,0.1)_100%)]" />
            <div className="relative p-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3 min-w-0 flex-1">
                  <div className="p-2 rounded-lg bg-white/20 backdrop-blur-sm">
                    <Building2 className="h-5 w-5 text-white" />
                  </div>
                  <div className="min-w-0">
                    <h3 className="font-bold text-white text-base truncate" title={customerName}>
                      {customerName.length > 30 ? customerName.slice(0, 28) + '…' : customerName}
                    </h3>
                    <p className="text-white/70 text-xs">Broker Verification</p>
                  </div>
                </div>
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

          {/* 3-Source Comparison Grid - Beautiful Cards */}
          {hasChecked && (
            <div className="p-4 space-y-4">
              {/* Column Headers - Dynamic 3 or 4 columns */}
              <div className={`grid gap-2 ${similarCustomers.length > 0 || existingCustomer ? 'grid-cols-4' : 'grid-cols-3'}`}>
                <div className="flex items-center justify-center gap-1.5 py-2 px-2 rounded-lg bg-amber-50 dark:bg-amber-950/30 border border-amber-200/50">
                  <FileText className="h-3.5 w-3.5 text-amber-600" />
                  <span className="font-semibold text-[10px] text-amber-700">Posted Load</span>
                </div>
                <div className="flex items-center justify-center gap-1.5 py-2 px-2 rounded-lg bg-green-50 dark:bg-green-950/30 border border-green-200/50">
                  <Shield className="h-3.5 w-3.5 text-green-600" />
                  <span className="font-semibold text-[10px] text-green-700">OTR Solutions</span>
                </div>
                <div className="flex items-center justify-center gap-1.5 py-2 px-2 rounded-lg bg-blue-50 dark:bg-blue-950/30 border border-blue-200/50">
                  <Building2 className="h-3.5 w-3.5 text-blue-600" />
                  <span className="font-semibold text-[10px] text-blue-700">FMCSA</span>
                </div>
                {(similarCustomers.length > 0 || existingCustomer) && (
                  <div className="flex items-center justify-center gap-1.5 py-2 px-2 rounded-lg bg-purple-50 dark:bg-purple-950/30 border border-purple-200/50">
                    <Database className="h-3.5 w-3.5 text-purple-600" />
                    <span className="font-semibold text-[10px] text-purple-700">Saved Customer</span>
                  </div>
                )}
              </div>

              {/* Data Cards Grid - Dynamic 3 or 4 columns */}
              <div className={`grid gap-2 ${similarCustomers.length > 0 || existingCustomer ? 'grid-cols-4' : 'grid-cols-3'}`}>
                {/* Row 1: Names */}
                <div className="card-glossy rounded-xl p-2.5 border border-border/50">
                  <div className="text-[10px] uppercase tracking-wide text-muted-foreground font-semibold mb-1">Name</div>
                  <div className="font-semibold text-xs truncate" title={parsedData?.broker_name || customerName}>
                    {parsedData?.broker_name || customerName || '—'}
                  </div>
                </div>
                <div className="rounded-xl p-2.5 border-2 border-green-300 bg-gradient-to-br from-green-50 to-emerald-50 dark:from-green-950/40 dark:to-emerald-950/40"
                  style={{ boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.8), 0 2px 4px rgba(16,185,129,0.1)' }}
                >
                  <div className="text-[10px] uppercase tracking-wide text-green-600 font-bold mb-1 flex items-center gap-1">
                    <CheckCircle2 className="h-3 w-3" />
                    Billing Name
                  </div>
                  <div className="font-bold text-xs text-green-800 dark:text-green-200 truncate" title={otrData?.name}>
                    {otrData?.name || '—'}
                  </div>
                </div>
                <div className="card-glossy rounded-xl p-2.5 border border-blue-200/50 bg-gradient-to-br from-blue-50/50 to-transparent dark:from-blue-950/20">
                  <div className="text-[10px] uppercase tracking-wide text-blue-600 font-semibold mb-1">Legal Name</div>
                  <div className="font-semibold text-xs truncate" title={fmcsaData?.legal_name}>
                    {fmcsaData?.legal_name || fmcsaData?.dba_name || '—'}
                  </div>
                </div>
                {/* 4th Column: Saved Customer Name */}
                {(similarCustomers.length > 0 || existingCustomer) && (
                  <div className={`rounded-xl p-2.5 border-2 ${existingCustomer ? 'border-purple-400 bg-gradient-to-br from-purple-100 to-violet-50 dark:from-purple-950/50 dark:to-violet-950/50' : 'border-purple-200 bg-gradient-to-br from-purple-50 to-violet-50/50 dark:from-purple-950/30 dark:to-violet-950/30'}`}
                    style={{ boxShadow: existingCustomer ? 'inset 0 1px 0 rgba(255,255,255,0.8), 0 2px 4px rgba(147,51,234,0.1)' : undefined }}
                  >
                    <div className="text-[10px] uppercase tracking-wide text-purple-600 font-semibold mb-1 flex items-center gap-1">
                      {existingCustomer ? <CheckCircle2 className="h-3 w-3" /> : <GitMerge className="h-3 w-3" />}
                      {existingCustomer ? 'Matched' : 'Similar'}
                    </div>
                    <div className="font-semibold text-xs truncate text-purple-800 dark:text-purple-200" title={existingCustomer?.name || similarCustomers[0]?.name}>
                      {existingCustomer?.name || similarCustomers[0]?.name || '—'}
                    </div>
                  </div>
                )}

                {/* Row 2: Status/Approval/DOT/Saved Status */}
                <div className="card-glossy rounded-xl p-2.5 border border-border/50">
                  <div className="text-[10px] uppercase tracking-wide text-muted-foreground font-semibold mb-1">Source</div>
                  <div className="font-medium text-xs flex items-center gap-1.5">
                    <div className="h-2 w-2 rounded-full bg-amber-400" />
                    Email Parse
                  </div>
                </div>
                <div className={`rounded-xl p-2.5 border-2 ${
                  otrData?.approval_status === 'approved' 
                    ? 'border-green-400 bg-gradient-to-br from-green-100 to-emerald-100 dark:from-green-950/50 dark:to-emerald-950/50' 
                    : otrData?.approval_status === 'not_approved'
                    ? 'border-red-400 bg-gradient-to-br from-red-50 to-rose-50 dark:from-red-950/50 dark:to-rose-950/50'
                    : 'border-amber-300 bg-gradient-to-br from-amber-50 to-orange-50 dark:from-amber-950/50 dark:to-orange-950/50'
                }`}
                  style={{ boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.8), 0 2px 4px rgba(0,0,0,0.05)' }}
                >
                  <div className="text-[10px] uppercase tracking-wide text-green-600 font-bold mb-1">Approval</div>
                  <div className="flex items-center gap-1.5">
                    {getApprovalIcon(otrData?.approval_status)}
                    <span className="font-bold text-xs capitalize">
                      {otrData?.approval_status?.replace('_', ' ') || '—'}
                    </span>
                  </div>
                  {otrData?.credit_limit && (
                    <div className="flex items-center gap-1 mt-1 text-[10px] text-muted-foreground bg-white/60 dark:bg-black/20 rounded-md px-1.5 py-0.5 w-fit">
                      <DollarSign className="h-2.5 w-2.5" />
                      ${otrData.credit_limit.toLocaleString()}
                    </div>
                  )}
                </div>
                <div className="card-glossy rounded-xl p-2.5 border border-blue-200/50 bg-gradient-to-br from-blue-50/50 to-transparent dark:from-blue-950/20">
                  <div className="text-[10px] uppercase tracking-wide text-blue-600 font-semibold mb-1">DOT / Status</div>
                  <div className="font-semibold text-xs">
                    {fmcsaData?.dot_number ? `DOT# ${fmcsaData.dot_number}` : '—'}
                  </div>
                  {fmcsaData?.safer_status && (
                    <Badge 
                      variant="outline" 
                      className={`mt-1 text-[8px] font-semibold ${
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
                  <div className="card-glossy rounded-xl p-2.5 border border-purple-200/50 bg-gradient-to-br from-purple-50/30 to-transparent dark:from-purple-950/10">
                    <div className="text-[10px] uppercase tracking-wide text-purple-600 font-semibold mb-1">MC Number</div>
                    <div className="font-semibold text-xs">
                      {existingCustomer?.mc_number ? `MC# ${existingCustomer.mc_number}` : similarCustomers[0]?.mc_number ? `MC# ${similarCustomers[0].mc_number}` : '—'}
                    </div>
                  </div>
                )}

                {/* Row 3: Address - With selectable radio + tooltip */}
                <div 
                  className={`rounded-xl p-2.5 cursor-pointer transition-all duration-200 ${
                    selectedAddressSource === 'posted' 
                      ? 'border-2 border-amber-400 bg-gradient-to-br from-amber-100 to-orange-50 dark:from-amber-950/50 dark:to-orange-950/50 shadow-md' 
                      : 'card-glossy border border-border/50 hover:border-amber-300 hover:shadow-sm'
                  }`}
                  style={selectedAddressSource === 'posted' ? { boxShadow: '0 4px 12px rgba(251,191,36,0.2), inset 0 1px 0 rgba(255,255,255,0.8)' } : {}}
                  onClick={() => postedAddress && setSelectedAddressSource('posted')}
                >
                  <div className="flex items-center gap-1 mb-1">
                    <input
                      type="radio"
                      name="address-source"
                      value="posted"
                      checked={selectedAddressSource === 'posted'}
                      onChange={() => setSelectedAddressSource('posted')}
                      disabled={!postedAddress}
                      className="h-3 w-3 accent-amber-500"
                    />
                    <span className="text-[10px] uppercase tracking-wide text-amber-600 font-semibold">Address</span>
                  </div>
                  <div className="font-medium text-[10px] leading-relaxed text-foreground/80">
                    {postedAddress || <span className="text-muted-foreground italic">N/A</span>}
                  </div>
                </div>
                <div className="card-glossy rounded-xl p-2.5 border border-green-200/50 bg-gradient-to-br from-green-50/30 to-transparent dark:from-green-950/10">
                  <div className="text-[10px] uppercase tracking-wide text-green-600 font-semibold mb-1">MC Number</div>
                  <div className="font-bold text-xs">
                    {otrData?.mc_number ? `MC# ${otrData.mc_number}` : '—'}
                  </div>
                </div>
                <div 
                  className={`rounded-xl p-2.5 cursor-pointer transition-all duration-200 ${
                    selectedAddressSource === 'fmcsa' 
                      ? 'border-2 border-blue-400 bg-gradient-to-br from-blue-100 to-sky-50 dark:from-blue-950/50 dark:to-sky-950/50 shadow-md' 
                      : 'card-glossy border border-blue-200/50 bg-gradient-to-br from-blue-50/30 to-transparent dark:from-blue-950/10 hover:border-blue-300 hover:shadow-sm'
                  }`}
                  style={selectedAddressSource === 'fmcsa' ? { boxShadow: '0 4px 12px rgba(59,130,246,0.2), inset 0 1px 0 rgba(255,255,255,0.8)' } : {}}
                  onClick={() => fmcsaData?.physical_address && setSelectedAddressSource('fmcsa')}
                >
                  <div className="flex items-center gap-1 mb-1">
                    <input
                      type="radio"
                      name="address-source"
                      value="fmcsa"
                      checked={selectedAddressSource === 'fmcsa'}
                      onChange={() => setSelectedAddressSource('fmcsa')}
                      disabled={!fmcsaData?.physical_address}
                      className="h-3 w-3 accent-blue-500"
                    />
                    <span className="text-[10px] uppercase tracking-wide text-blue-600 font-semibold">Address</span>
                  </div>
                  <div className="font-medium text-[10px] leading-relaxed text-foreground/80">
                    {fmcsaData?.physical_address || <span className="text-muted-foreground italic">N/A</span>}
                  </div>
                </div>
                {/* 4th Column: Saved Customer Address */}
                {(similarCustomers.length > 0 || existingCustomer) && (
                  <div className="card-glossy rounded-xl p-2.5 border border-purple-200/50 bg-gradient-to-br from-purple-50/30 to-transparent dark:from-purple-950/10">
                    <div className="text-[10px] uppercase tracking-wide text-purple-600 font-semibold mb-1">Address</div>
                    <div className="font-medium text-[10px] leading-relaxed text-foreground/80">
                      {existingCustomer?.address ? (
                        [existingCustomer.address, existingCustomer.city, existingCustomer.state, existingCustomer.zip].filter(Boolean).join(', ')
                      ) : <span className="text-muted-foreground italic">N/A</span>}
                    </div>
                  </div>
                )}

                {/* Row 4: Phone */}
                <div className="card-glossy rounded-xl p-2.5 border border-border/50">
                  <div className="text-[10px] uppercase tracking-wide text-muted-foreground font-semibold mb-1">Phone</div>
                  <div className="font-medium text-xs flex items-center gap-1">
                    {parsedData?.broker_phone ? (
                      <>
                        <Phone className="h-3 w-3 text-muted-foreground" />
                        {parsedData.broker_phone}
                      </>
                    ) : <span className="text-muted-foreground">—</span>}
                  </div>
                </div>
                <div className="card-glossy rounded-xl p-2.5 border border-green-200/50 bg-gradient-to-br from-green-50/30 to-transparent dark:from-green-950/10">
                  <div className="h-full flex items-center justify-center">
                    <span className="text-[10px] text-muted-foreground">N/A</span>
                  </div>
                </div>
                <div className="card-glossy rounded-xl p-2.5 border border-blue-200/50 bg-gradient-to-br from-blue-50/30 to-transparent dark:from-blue-950/10">
                  <div className="text-[10px] uppercase tracking-wide text-blue-600 font-semibold mb-1">Phone</div>
                  <div className="font-medium text-xs flex items-center gap-1">
                    {fmcsaData?.phone ? (
                      <>
                        <Phone className="h-3 w-3 text-blue-500" />
                        {fmcsaData.phone}
                      </>
                    ) : <span className="text-muted-foreground">—</span>}
                  </div>
                </div>
                {/* 4th Column: Saved Customer Phone */}
                {(similarCustomers.length > 0 || existingCustomer) && (
                  <div className="card-glossy rounded-xl p-2.5 border border-purple-200/50 bg-gradient-to-br from-purple-50/30 to-transparent dark:from-purple-950/10">
                    <div className="text-[10px] uppercase tracking-wide text-purple-600 font-semibold mb-1">Phone</div>
                    <div className="font-medium text-xs flex items-center gap-1">
                      {existingCustomer?.phone ? (
                        <>
                          <Phone className="h-3 w-3 text-purple-500" />
                          {existingCustomer.phone}
                        </>
                      ) : <span className="text-muted-foreground">—</span>}
                    </div>
                  </div>
                )}
              </div>

              {/* Similar Customers - Merge Option with Purple Theme */}
              {similarCustomers.length > 0 && !existingCustomer && (
                <div className="rounded-xl p-3 bg-gradient-to-br from-purple-50 to-violet-50 dark:from-purple-950/40 dark:to-violet-950/40 border-2 border-purple-300"
                  style={{ boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.8), 0 4px 12px rgba(147,51,234,0.15)' }}
                >
                  <div className="flex items-center gap-2 text-sm font-bold text-purple-700 mb-2">
                    <div className="p-1.5 rounded-lg bg-purple-200/50">
                      <GitMerge className="h-4 w-4" />
                    </div>
                    Possible duplicate found – merge?
                  </div>
                  <div className="space-y-1.5">
                    <label className="flex items-center gap-2 text-xs cursor-pointer p-2 rounded-lg bg-white/60 dark:bg-black/20 hover:bg-white/80 transition-colors border border-transparent hover:border-purple-300">
                      <input
                        type="radio"
                        name="merge"
                        checked={selectedMergeCustomerId === null}
                        onChange={() => setSelectedMergeCustomerId(null)}
                        className="h-3.5 w-3.5 accent-purple-500"
                      />
                      <span className="font-medium">Create as new customer</span>
                    </label>
                    {similarCustomers.slice(0, 3).map(c => (
                      <label key={c.id} className={`flex items-center gap-2 text-xs cursor-pointer p-2 rounded-lg transition-colors border ${
                        selectedMergeCustomerId === c.id 
                          ? 'bg-purple-100 dark:bg-purple-950/50 border-purple-400' 
                          : 'bg-white/60 dark:bg-black/20 hover:bg-white/80 border-transparent hover:border-purple-300'
                      }`}>
                        <input
                          type="radio"
                          name="merge"
                          checked={selectedMergeCustomerId === c.id}
                          onChange={() => setSelectedMergeCustomerId(c.id)}
                          className="h-3.5 w-3.5 accent-purple-500"
                        />
                        <GitMerge className="h-3 w-3 text-purple-500" />
                        <span className="truncate font-semibold text-purple-800">{c.name}</span>
                        {c.mc_number && <Badge variant="outline" className="text-[9px] bg-white/80 border-purple-200 text-purple-700">MC# {c.mc_number}</Badge>}
                      </label>
                    ))}
                  </div>
                </div>
              )}

              {/* Action Button - Big Puffy Style */}
              <div className="pt-2">
                {existingCustomer ? (
                  <Button
                    variant="outline"
                    className="w-full h-12 text-sm font-semibold gap-2 rounded-xl border-2"
                    onClick={() => {
                      navigate(`/dashboard/business/customers/${existingCustomer.id}`);
                      setOpen(false);
                    }}
                  >
                    <ExternalLink className="h-4 w-4" />
                    View Customer Profile
                  </Button>
                ) : (
                  <Button
                    className="w-full h-12 text-sm font-bold gap-2 rounded-xl btn-glossy-success text-white"
                    onClick={handleSaveCustomer}
                    disabled={isSaving || !otrData?.name}
                  >
                    {isSaving ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <UserPlus className="h-4 w-4" />
                    )}
                    {selectedMergeCustomerId ? 'Merge & Update Customer' : 'Save as Customer'}
                  </Button>
                )}
              </div>

              {/* Info note with icon */}
              <div className="flex items-center justify-center gap-2 py-2 px-3 rounded-lg bg-muted/30">
                <Shield className="h-3.5 w-3.5 text-green-600" />
                <p className="text-[11px] text-muted-foreground">
                  Customer name & MC saved from <span className="font-semibold text-green-600">OTR Solutions</span> (billing authority)
                </p>
              </div>
            </div>
          )}

          {/* Before check state - Nice empty state */}
          {!hasChecked && (
            <div className="p-8 text-center">
              <div className="mx-auto w-14 h-14 rounded-2xl bg-gradient-to-br from-muted to-muted/50 flex items-center justify-center mb-4"
                style={{ boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.5), 0 4px 12px rgba(0,0,0,0.05)' }}
              >
                <Shield className="h-7 w-7 text-muted-foreground" />
              </div>
              <p className="text-sm font-medium text-foreground mb-1">Ready to Verify</p>
              <p className="text-xs text-muted-foreground">Enter MC number and click <span className="font-semibold">Check</span> to see broker information from all sources</p>
            </div>
          )}
        </PopoverContent>
      </Popover>
    </TooltipProvider>
  );
}
