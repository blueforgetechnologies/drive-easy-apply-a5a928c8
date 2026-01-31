import React, { useState, useEffect } from "react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Loader2, RefreshCw, Building2, MapPin, Hash } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useTenantFilter } from "@/hooks/useTenantFilter";
import { toast } from "sonner";

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

interface BrokerCreditPopoverProps {
  customerName: string;
  truncatedName: string;
  mcNumber?: string;
  brokerStatus?: { status: string; brokerName?: string; mcNumber?: string };
  loadEmailId: string;
  parsedData?: {
    broker_address?: string;
    broker_city?: string;
    broker_state?: string;
    broker_zip?: string;
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
  const [open, setOpen] = useState(false);
  const [isChecking, setIsChecking] = useState(false);
  const [localMcNumber, setLocalMcNumber] = useState(mcNumber || brokerStatus?.mcNumber || '');
  const [currentStatus, setCurrentStatus] = useState(brokerStatus?.status || 'unchecked');
  const [customerDetails, setCustomerDetails] = useState<{
    id?: string;
    address?: string;
    city?: string;
    state?: string;
    zip?: string;
    credit_limit?: number;
  } | null>(null);

  const statusColors = getStatusColor(isChecking ? 'checking' : currentStatus);

  // Fetch customer details when popover opens
  useEffect(() => {
    if (!open || !tenantId) return;

    const fetchCustomerDetails = async () => {
      // Try to find customer by name or MC
      const { data } = await supabase
        .from('customers')
        .select('id, address, city, state, zip, mc_number, otr_approval_status, otr_credit_limit')
        .eq('tenant_id', tenantId)
        .or(`name.ilike.%${customerName}%${localMcNumber ? `,mc_number.eq.${localMcNumber.replace(/^MC-?/i, '')}` : ''}`)
        .limit(1)
        .maybeSingle();

      if (data) {
        setCustomerDetails({
          id: data.id,
          address: data.address || parsedData?.broker_address,
          city: data.city || parsedData?.broker_city,
          state: data.state || parsedData?.broker_state,
          zip: data.zip || parsedData?.broker_zip,
          credit_limit: data.otr_credit_limit,
        });
        if (data.mc_number && !localMcNumber) {
          setLocalMcNumber(data.mc_number);
        }
        if (data.otr_approval_status) {
          setCurrentStatus(data.otr_approval_status);
        }
      } else {
        // Use parsed data from email if no customer record
        setCustomerDetails({
          address: parsedData?.broker_address,
          city: parsedData?.broker_city,
          state: parsedData?.broker_state,
          zip: parsedData?.broker_zip,
        });
      }
    };

    fetchCustomerDetails();
  }, [open, tenantId, customerName, localMcNumber, parsedData]);

  // Update status when brokerStatus prop changes
  useEffect(() => {
    if (brokerStatus?.status) {
      setCurrentStatus(brokerStatus.status);
    }
  }, [brokerStatus?.status]);

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
          customer_id: customerDetails?.id,
        },
      });

      if (response.error) {
        throw new Error(response.error.message);
      }

      const result = response.data;
      if (result.success !== false) {
        setCurrentStatus(result.approval_status || 'unchecked');
        if (result.credit_limit) {
          setCustomerDetails(prev => ({
            ...prev,
            credit_limit: result.credit_limit,
          }));
        }
        toast.success(`Credit check complete: ${result.approval_status || 'Unknown'}`);
      } else {
        toast.error(result.error || 'Credit check failed');
      }
    } catch (error) {
      console.error('[BrokerCreditPopover] Check failed:', error);
      toast.error(error instanceof Error ? error.message : 'Failed to check credit');
    } finally {
      setIsChecking(false);
    }
  };

  const formatAddress = () => {
    const parts = [
      customerDetails?.address,
      customerDetails?.city,
      customerDetails?.state,
      customerDetails?.zip,
    ].filter(Boolean);
    return parts.length > 0 ? parts.join(', ') : 'No address on file';
  };

  // Determine button style based on status - all cards are same size (w-[160px])
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
    // Default: amber for unchecked/call_otr
    return {
      className: `${baseClass} bg-gradient-to-b from-amber-400 to-amber-500 text-amber-900 border border-amber-300`,
      boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.4), 0 2px 4px rgba(0,0,0,0.1)',
    };
  };

  const buttonStyle = getButtonStyle();

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          className={buttonStyle.className}
          style={{ boxShadow: buttonStyle.boxShadow }}
          onClick={(e) => e.stopPropagation()}
        >
          {/* Customer name */}
          <span className="truncate">{truncatedName}</span>
        </button>
      </PopoverTrigger>
      <PopoverContent 
        className="w-80 p-0" 
        side="bottom" 
        align="start"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header with status */}
        <div className={`p-3 border-b ${statusColors.bg}`}>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 min-w-0 flex-1">
              <Building2 className="h-4 w-4 text-muted-foreground flex-shrink-0" />
              <span className="font-semibold text-sm truncate" title={customerName}>
                {customerName.length > 30 ? customerName.slice(0, 28) + '…' : customerName}
              </span>
            </div>
            <div className={`flex items-center gap-1.5 text-xs font-medium ${statusColors.text} flex-shrink-0 ml-2`}>
              <div className={`w-2 h-2 rounded-full ${statusColors.dot}`} />
              {statusColors.label}
            </div>
          </div>
        </div>

        {/* Details section */}
        <div className="p-3 space-y-3">
          {/* Address */}
          <div className="flex items-start gap-2">
            <MapPin className="h-4 w-4 text-muted-foreground mt-0.5 flex-shrink-0" />
            <p className="text-sm text-muted-foreground">{formatAddress()}</p>
          </div>

          {/* MC Number input */}
          <div className="space-y-1.5">
            <Label htmlFor="mc-number" className="text-xs flex items-center gap-1">
              <Hash className="h-3 w-3" />
              MC Number
            </Label>
            <div className="flex gap-2">
              <Input
                id="mc-number"
                value={localMcNumber}
                onChange={(e) => setLocalMcNumber(e.target.value)}
                placeholder="Enter MC number"
                className="h-8 text-sm"
                onClick={(e) => e.stopPropagation()}
              />
              <Button
                size="sm"
                onClick={handleCheckCredit}
                disabled={isChecking || !localMcNumber.trim()}
                className="h-8 px-3 gap-1.5"
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

          {/* Credit limit if available */}
          {customerDetails?.credit_limit && (
            <div className="pt-2 border-t">
              <p className="text-xs text-muted-foreground">
                Credit Limit: <span className="font-semibold text-foreground">${customerDetails.credit_limit.toLocaleString()}</span>
              </p>
            </div>
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}
