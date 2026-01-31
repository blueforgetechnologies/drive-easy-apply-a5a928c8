import React, { useState, useEffect } from "react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";

import { 
  Loader2, RefreshCw, Building2, MapPin, Hash, Phone, Shield, 
  CheckCircle2, XCircle, AlertCircle, UserPlus, ExternalLink,
  FileText, Users
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
        className="w-[520px] p-0" 
        side="bottom" 
        align="start"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header with customer status */}
        <div className={`p-3 border-b ${existingCustomer ? 'bg-green-50 dark:bg-green-950/30' : 'bg-blue-50 dark:bg-blue-950/30'}`}>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 min-w-0 flex-1">
              <Building2 className="h-4 w-4 text-muted-foreground flex-shrink-0" />
              <span className="font-semibold text-sm truncate" title={customerName}>
                {customerName.length > 35 ? customerName.slice(0, 33) + '…' : customerName}
              </span>
            </div>
            {existingCustomer ? (
              <Badge variant="outline" className="bg-green-100 text-green-700 border-green-300 flex-shrink-0">
                <CheckCircle2 className="h-3 w-3 mr-1" />
                Existing Customer
              </Badge>
            ) : (
              <Badge variant="outline" className="bg-blue-100 text-blue-700 border-blue-300 flex-shrink-0">
                <UserPlus className="h-3 w-3 mr-1" />
                New Broker
              </Badge>
            )}
          </div>
        </div>

        {/* MC Number input */}
        <div className="p-3 border-b bg-muted/30">
          <div className="flex gap-2 items-end">
            <div className="flex-1">
              <Label htmlFor="mc-number" className="text-xs flex items-center gap-1 mb-1.5">
                <Hash className="h-3 w-3" />
                MC Number
              </Label>
              <Input
                id="mc-number"
                value={localMcNumber}
                onChange={(e) => setLocalMcNumber(e.target.value)}
                placeholder="Enter MC number"
                className="h-8 text-sm"
                onClick={(e) => e.stopPropagation()}
              />
            </div>
            <Button
              size="sm"
              onClick={handleCheckCredit}
              disabled={isChecking || !localMcNumber.trim()}
              className="h-8 px-4 gap-1.5"
            >
              {isChecking ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <RefreshCw className="h-3.5 w-3.5" />
              )}
              Check
            </Button>
          </div>
        </div>

        {/* 3-Source Comparison Grid */}
        {hasChecked && (
          <div className="p-3 space-y-3">
            <div className="grid grid-cols-3 gap-2 text-xs">
              {/* Column Headers */}
              <div className="font-semibold text-center text-muted-foreground pb-1 border-b flex items-center justify-center gap-1">
                <FileText className="h-3 w-3" />
                Posted Load
              </div>
              <div className="font-semibold text-center text-green-700 pb-1 border-b flex items-center justify-center gap-1">
                <Shield className="h-3 w-3" />
                OTR Solutions
              </div>
              <div className="font-semibold text-center text-blue-700 pb-1 border-b flex items-center justify-center gap-1">
                <Building2 className="h-3 w-3" />
                FMCSA
              </div>

              {/* Row: Name */}
              <div className="p-2 bg-muted/20 rounded">
                <div className="text-[10px] text-muted-foreground mb-0.5">Name</div>
                <div className="font-medium truncate" title={parsedData?.broker_name || customerName}>
                  {parsedData?.broker_name || customerName || '—'}
                </div>
              </div>
              <div className="p-2 bg-green-50 dark:bg-green-950/30 rounded border border-green-200">
                <div className="text-[10px] text-green-600 mb-0.5">Name (Billing)</div>
                <div className="font-medium text-green-800 truncate" title={otrData?.name}>
                  {otrData?.name || '—'}
                </div>
              </div>
              <div className="p-2 bg-blue-50 dark:bg-blue-950/30 rounded">
                <div className="text-[10px] text-blue-600 mb-0.5">Legal Name</div>
                <div className="font-medium truncate" title={fmcsaData?.legal_name}>
                  {fmcsaData?.legal_name || fmcsaData?.dba_name || '—'}
                </div>
              </div>

              {/* Row: Status / DOT */}
              <div className="p-2 bg-muted/20 rounded">
                <div className="text-[10px] text-muted-foreground mb-0.5">Source</div>
                <div className="font-medium">Email</div>
              </div>
              <div className="p-2 bg-green-50 dark:bg-green-950/30 rounded border border-green-200">
                <div className="text-[10px] text-green-600 mb-0.5">Approval</div>
                <div className="flex items-center gap-1">
                  {getApprovalIcon(otrData?.approval_status)}
                  <span className="font-medium capitalize">
                    {otrData?.approval_status?.replace('_', ' ') || '—'}
                  </span>
                </div>
                {otrData?.credit_limit && (
                  <div className="text-[10px] text-muted-foreground mt-0.5">
                    Limit: ${otrData.credit_limit.toLocaleString()}
                  </div>
                )}
              </div>
              <div className="p-2 bg-blue-50 dark:bg-blue-950/30 rounded">
                <div className="text-[10px] text-blue-600 mb-0.5">DOT / Status</div>
                <div className="font-medium">
                  {fmcsaData?.dot_number ? `DOT# ${fmcsaData.dot_number}` : '—'}
                </div>
                {fmcsaData?.safer_status && (
                  <Badge variant="outline" className={`mt-0.5 text-[9px] ${
                    fmcsaData.safer_status.includes('AUTHORIZED') 
                      ? 'bg-green-100 text-green-700' 
                      : 'bg-red-100 text-red-700'
                  }`}>
                    {fmcsaData.safer_status}
                  </Badge>
                )}
              </div>

              {/* Row: Address - with radio selection */}
              <div 
                className={`p-2 rounded cursor-pointer transition-all ${selectedAddressSource === 'posted' ? 'bg-amber-50 border-2 border-amber-300' : 'bg-muted/20 border-2 border-transparent hover:border-muted'}`}
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
                    className="h-3 w-3 accent-amber-500"
                  />
                  <span className="text-[10px] text-muted-foreground">Address</span>
                </div>
                <div className="font-medium text-[11px] leading-tight">
                  {postedAddress || '—'}
                </div>
              </div>
              <div className="p-2 bg-green-50 dark:bg-green-950/30 rounded">
                <div className="text-[10px] text-green-600 mb-0.5">MC Number</div>
                <div className="font-medium">
                  {otrData?.mc_number ? `MC# ${otrData.mc_number}` : '—'}
                </div>
              </div>
              <div 
                className={`p-2 rounded cursor-pointer transition-all ${selectedAddressSource === 'fmcsa' ? 'bg-blue-100 border-2 border-blue-400' : 'bg-blue-50 dark:bg-blue-950/30 border-2 border-transparent hover:border-blue-200'}`}
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
                    className="h-3 w-3 accent-blue-500"
                  />
                  <span className="text-[10px] text-blue-600">Address</span>
                </div>
                <div className="font-medium text-[11px] leading-tight">
                  {fmcsaData?.physical_address || '—'}
                </div>
              </div>

              {/* Row: Phone */}
              <div className="p-2 bg-muted/20 rounded">
                <div className="text-[10px] text-muted-foreground mb-0.5">Phone</div>
                <div className="font-medium flex items-center gap-1">
                  {parsedData?.broker_phone ? (
                    <>
                      <Phone className="h-3 w-3" />
                      {parsedData.broker_phone}
                    </>
                  ) : '—'}
                </div>
              </div>
              <div className="p-2 bg-green-50 dark:bg-green-950/30 rounded">
                {/* Empty - OTR doesn't provide phone */}
              </div>
              <div className="p-2 bg-blue-50 dark:bg-blue-950/30 rounded">
                <div className="text-[10px] text-blue-600 mb-0.5">Phone</div>
                <div className="font-medium flex items-center gap-1">
                  {fmcsaData?.phone ? (
                    <>
                      <Phone className="h-3 w-3" />
                      {fmcsaData.phone}
                    </>
                  ) : '—'}
                </div>
              </div>
            </div>

            {/* Similar Customers Warning */}
            {similarCustomers.length > 0 && !existingCustomer && (
              <div className="p-2 bg-amber-50 dark:bg-amber-950/30 rounded border border-amber-200">
                <div className="flex items-center gap-1.5 text-xs font-medium text-amber-700 mb-1.5">
                  <Users className="h-3.5 w-3.5" />
                  Similar customers found - merge?
                </div>
                <div className="space-y-1">
                  <label className="flex items-center gap-2 text-xs cursor-pointer p-1 hover:bg-amber-100 rounded">
                    <input
                      type="radio"
                      name="merge"
                      checked={selectedMergeCustomerId === null}
                      onChange={() => setSelectedMergeCustomerId(null)}
                      className="h-3 w-3"
                    />
                    <span>Create as new customer</span>
                  </label>
                  {similarCustomers.slice(0, 3).map(c => (
                    <label key={c.id} className="flex items-center gap-2 text-xs cursor-pointer p-1 hover:bg-amber-100 rounded">
                      <input
                        type="radio"
                        name="merge"
                        checked={selectedMergeCustomerId === c.id}
                        onChange={() => setSelectedMergeCustomerId(c.id)}
                        className="h-3 w-3"
                      />
                      <span className="truncate">{c.name}</span>
                      {c.mc_number && <span className="text-muted-foreground">MC# {c.mc_number}</span>}
                    </label>
                  ))}
                </div>
              </div>
            )}

            {/* Action Buttons */}
            <div className="flex gap-2 pt-2 border-t">
              {existingCustomer ? (
                <Button
                  variant="outline"
                  size="sm"
                  className="flex-1 h-8 text-xs"
                  onClick={() => {
                    navigate(`/dashboard/business/customers/${existingCustomer.id}`);
                    setOpen(false);
                  }}
                >
                  <ExternalLink className="h-3 w-3 mr-1" />
                  View Customer
                </Button>
              ) : (
                <Button
                  size="sm"
                  className="flex-1 h-8 text-xs bg-green-600 hover:bg-green-700"
                  onClick={handleSaveCustomer}
                  disabled={isSaving || !otrData?.name}
                >
                  {isSaving ? (
                    <Loader2 className="h-3 w-3 mr-1 animate-spin" />
                  ) : (
                    <UserPlus className="h-3 w-3 mr-1" />
                  )}
                  {selectedMergeCustomerId ? 'Merge & Update' : 'Save as Customer'}
                </Button>
              )}
            </div>

            {/* Info note */}
            <p className="text-[10px] text-muted-foreground text-center">
              Customer name and MC will be saved from OTR Solutions (billing authority)
            </p>
          </div>
        )}

        {/* Before check state */}
        {!hasChecked && (
          <div className="p-4 text-center text-sm text-muted-foreground">
            <p>Enter MC number and click Check to see broker information from all sources</p>
          </div>
        )}
      </PopoverContent>
    </Popover>
  );
}
