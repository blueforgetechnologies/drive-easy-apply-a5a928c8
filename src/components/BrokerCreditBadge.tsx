import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useTenantFilter } from "@/hooks/useTenantFilter";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Loader2, ShieldCheck, ShieldX, ShieldAlert, ShieldQuestion, ExternalLink, Phone, Check, X, HelpCircle } from "lucide-react";
import { toast } from "sonner";

interface BrokerCreditBadgeProps {
  brokerName: string;
  mcNumber?: string | null;
  customerId?: string | null;
  loadEmailId?: string;
  matchId?: string;
  showCheckButton?: boolean;
  onStatusChange?: (status: string) => void;
}

type ApprovalStatus = 'unchecked' | 'approved' | 'not_approved' | 'call_otr' | 'not_found' | 'error' | 'checking';

const statusConfig: Record<ApprovalStatus, { label: string; icon: React.ElementType; variant: 'default' | 'destructive' | 'secondary' | 'outline'; className: string }> = {
  unchecked: { label: 'Check OTR', icon: ShieldQuestion, variant: 'secondary', className: 'bg-slate-100 text-slate-600 hover:bg-slate-200' },
  approved: { label: 'Approved', icon: ShieldCheck, variant: 'default', className: 'bg-green-100 text-green-700 border-green-200 hover:bg-green-200' },
  not_approved: { label: 'Not Approved', icon: ShieldX, variant: 'destructive', className: 'bg-red-100 text-red-700 border-red-200 hover:bg-red-200' },
  call_otr: { label: 'Call OTR', icon: Phone, variant: 'outline', className: 'bg-yellow-100 text-yellow-700 border-yellow-300 hover:bg-yellow-200' },
  not_found: { label: 'Not Found', icon: ShieldAlert, variant: 'secondary', className: 'bg-orange-100 text-orange-700 border-orange-200 hover:bg-orange-200' },
  error: { label: 'Error', icon: ShieldAlert, variant: 'destructive', className: 'bg-red-100 text-red-700' },
  checking: { label: 'Checking...', icon: Loader2, variant: 'secondary', className: 'bg-blue-100 text-blue-600' },
};

// OTR Solutions portal URL
const OTR_PORTAL_URL = 'https://client.otrsolutions.com';

export function BrokerCreditBadge({
  brokerName,
  mcNumber,
  customerId,
  loadEmailId,
  matchId,
  showCheckButton = true,
  onStatusChange
}: BrokerCreditBadgeProps) {
  const { tenantId } = useTenantFilter();
  const [status, setStatus] = useState<ApprovalStatus>('unchecked');
  const [lastChecked, setLastChecked] = useState<string | null>(null);
  const [creditLimit, setCreditLimit] = useState<number | null>(null);
  const [isUpdating, setIsUpdating] = useState(false);
  const [fmcsaInfo, setFmcsaInfo] = useState<{ legalName?: string; dotNumber?: string } | null>(null);
  const [popoverOpen, setPopoverOpen] = useState(false);

  // Load existing status from customer record if we have customerId
  useEffect(() => {
    const loadExistingStatus = async () => {
      if (!customerId) return;

      try {
        const { data, error } = await supabase
          .from('customers')
          .select('otr_approval_status, otr_last_checked_at, otr_credit_limit')
          .eq('id', customerId)
          .single();

        if (error) {
          console.error('Error loading broker status:', error);
          return;
        }

        if (data?.otr_approval_status) {
          setStatus(data.otr_approval_status as ApprovalStatus);
          setLastChecked(data.otr_last_checked_at);
          setCreditLimit(data.otr_credit_limit);
        }
      } catch (err) {
        console.error('Error loading broker status:', err);
      }
    };

    loadExistingStatus();
  }, [customerId]);

  // Also try to find customer by broker name if no customerId
  useEffect(() => {
    const findCustomerByName = async () => {
      if (customerId || !brokerName || !tenantId) return;

      try {
        const { data } = await supabase
          .from('customers')
          .select('id, otr_approval_status, otr_last_checked_at, otr_credit_limit, mc_number')
          .eq('tenant_id', tenantId)
          .ilike('name', `%${brokerName}%`)
          .limit(1);

        if (data && data.length > 0) {
          const customer = data[0];
          if (customer.otr_approval_status) {
            setStatus(customer.otr_approval_status as ApprovalStatus);
            setLastChecked(customer.otr_last_checked_at);
            setCreditLimit(customer.otr_credit_limit);
          }
        }
      } catch (err) {
        console.error('Error finding customer:', err);
      }
    };

    findCustomerByName();
  }, [brokerName, tenantId, customerId]);

  // Open OTR portal in new tab
  const handleOpenOtrPortal = () => {
    window.open(OTR_PORTAL_URL, '_blank', 'noopener,noreferrer');
  };

  // Update status manually after checking OTR portal
  const handleSetStatus = async (newStatus: ApprovalStatus) => {
    if (!tenantId) {
      toast.error('No tenant context');
      return;
    }

    setIsUpdating(true);

    try {
      const { data, error } = await supabase.functions.invoke('check-broker-credit', {
        body: {
          tenant_id: tenantId,
          mc_number: mcNumber,
          broker_name: brokerName,
          customer_id: customerId,
          load_email_id: loadEmailId,
          match_id: matchId,
          manual_status: newStatus
        }
      });

      if (error) {
        console.error('Status update error:', error);
        toast.error('Failed to update status');
        return;
      }

      setStatus(newStatus);
      setLastChecked(new Date().toISOString());
      setPopoverOpen(false);

      if (onStatusChange) {
        onStatusChange(newStatus);
      }

      // Show toast based on status
      if (newStatus === 'approved') {
        toast.success('Broker marked as Approved');
      } else if (newStatus === 'not_approved') {
        toast.error('Broker marked as Not Approved');
      } else if (newStatus === 'call_otr') {
        toast.warning('Marked as Call OTR');
      }
    } catch (err) {
      console.error('Status update error:', err);
      toast.error('Failed to update status');
    } finally {
      setIsUpdating(false);
    }
  };

  // Automated OTR API check
  const handleAutoCheck = async () => {
    if (!tenantId) {
      toast.error('No tenant context');
      return;
    }

    if (!mcNumber && !customerId) {
      toast.warning('MC number required for credit check');
      return;
    }

    setIsUpdating(true);
    setStatus('checking');

    try {
      const { data, error } = await supabase.functions.invoke('check-broker-credit', {
        body: {
          tenant_id: tenantId,
          mc_number: mcNumber,
          broker_name: brokerName,
          customer_id: customerId,
          load_email_id: loadEmailId,
          match_id: matchId,
          force_check: true
        }
      });

      if (error) {
        console.error('OTR API check error:', error);
        setStatus('error');
        toast.error('Credit check failed');
        return;
      }

      // Update state based on response
      if (data?.approval_status) {
        setStatus(data.approval_status as ApprovalStatus);
      } else {
        setStatus('unchecked');
      }

      if (data?.credit_limit) {
        setCreditLimit(data.credit_limit);
      }

      setLastChecked(new Date().toISOString());

      // Store FMCSA info if available
      if (data?.fmcsa_found) {
        setFmcsaInfo({
          legalName: data.legal_name,
          dotNumber: data.dot_number
        });
      }

      // Show result toast
      if (data?.success && data?.status_source === 'otr_api') {
        if (data.approval_status === 'approved') {
          toast.success('OTR Approved', {
            description: data.credit_limit ? `Credit Limit: $${data.credit_limit.toLocaleString()}` : 'Broker approved for factoring'
          });
        } else if (data.approval_status === 'not_approved') {
          toast.error('OTR Not Approved', {
            description: 'This broker is not approved for factoring'
          });
        } else if (data.approval_status === 'call_otr') {
          toast.warning('Call OTR', {
            description: 'Contact OTR Solutions for more information'
          });
        } else if (data.approval_status === 'not_found') {
          toast.warning('Not Found in OTR', {
            description: 'Broker not found in OTR system'
          });
        }
      } else if (data?.error) {
        toast.warning('Manual check required', {
          description: data.message || 'OTR API check inconclusive'
        });
      } else {
        toast.info('Check complete', {
          description: data?.message || 'Status updated'
        });
      }

      if (onStatusChange && data?.approval_status) {
        onStatusChange(data.approval_status);
      }

      setPopoverOpen(false);
    } catch (err) {
      console.error('OTR API check error:', err);
      setStatus('error');
      toast.error('Credit check failed');
    } finally {
      setIsUpdating(false);
    }
  };

  // Validate MC with FMCSA only (fallback)
  const handleValidateMc = async () => {
    // Just trigger auto check which includes FMCSA
    await handleAutoCheck();
  };

  const config = statusConfig[status] || statusConfig.unchecked;
  const Icon = config.icon;

  return (
    <TooltipProvider>
      <div className="inline-flex items-center gap-1">
        <Popover open={popoverOpen} onOpenChange={setPopoverOpen}>
          <PopoverTrigger asChild>
            <Badge 
              variant={config.variant}
              className={`${config.className} text-[10px] px-1.5 py-0.5 flex items-center gap-1 cursor-pointer`}
            >
              <Icon className={`h-3 w-3 ${status === 'checking' ? 'animate-spin' : ''}`} />
              <span>{config.label}</span>
            </Badge>
          </PopoverTrigger>
          <PopoverContent className="w-64 p-3" align="start">
            <div className="space-y-3">
              <div className="text-sm font-medium">OTR Credit Check</div>
              
              <div className="text-xs text-muted-foreground space-y-1">
                <p><span className="font-medium">Broker:</span> {brokerName}</p>
                {mcNumber && <p><span className="font-medium">MC#:</span> {mcNumber}</p>}
                {fmcsaInfo?.legalName && <p><span className="font-medium">FMCSA Name:</span> {fmcsaInfo.legalName}</p>}
                {fmcsaInfo?.dotNumber && <p><span className="font-medium">DOT#:</span> {fmcsaInfo.dotNumber}</p>}
                {creditLimit && <p><span className="font-medium">Credit Limit:</span> ${creditLimit.toLocaleString()}</p>}
                {lastChecked && <p><span className="font-medium">Last Checked:</span> {new Date(lastChecked).toLocaleDateString()}</p>}
              </div>

              <div className="border-t pt-3 space-y-2">
                {/* Primary action: Auto check with OTR API */}
                <Button
                  variant="default"
                  size="sm"
                  className="w-full justify-center bg-green-600 hover:bg-green-700"
                  onClick={handleAutoCheck}
                  disabled={isUpdating || (!mcNumber && !customerId)}
                >
                  {isUpdating ? (
                    <Loader2 className="h-3.5 w-3.5 mr-2 animate-spin" />
                  ) : (
                    <ShieldCheck className="h-3.5 w-3.5 mr-2" />
                  )}
                  Check OTR Credit
                </Button>

                <Button
                  variant="outline"
                  size="sm"
                  className="w-full justify-start"
                  onClick={handleOpenOtrPortal}
                >
                  <ExternalLink className="h-3.5 w-3.5 mr-2" />
                  Open OTR Portal
                </Button>
              </div>

              <div className="border-t pt-3">
                <p className="text-xs text-muted-foreground mb-2">Set status after checking OTR:</p>
                <div className="flex gap-1 flex-wrap">
                  <Button
                    variant="outline"
                    size="sm"
                    className="flex-1 h-8 text-xs bg-green-50 hover:bg-green-100 border-green-200 text-green-700"
                    onClick={() => handleSetStatus('approved')}
                    disabled={isUpdating}
                  >
                    <Check className="h-3 w-3 mr-1" />
                    Approved
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    className="flex-1 h-8 text-xs bg-red-50 hover:bg-red-100 border-red-200 text-red-700"
                    onClick={() => handleSetStatus('not_approved')}
                    disabled={isUpdating}
                  >
                    <X className="h-3 w-3 mr-1" />
                    Declined
                  </Button>
                </div>
                <div className="flex gap-1 mt-1">
                  <Button
                    variant="outline"
                    size="sm"
                    className="flex-1 h-7 text-[10px] bg-yellow-50 hover:bg-yellow-100 border-yellow-200 text-yellow-700"
                    onClick={() => handleSetStatus('call_otr')}
                    disabled={isUpdating}
                  >
                    <Phone className="h-3 w-3 mr-1" />
                    Call OTR
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    className="flex-1 h-7 text-[10px] bg-orange-50 hover:bg-orange-100 border-orange-200 text-orange-700"
                    onClick={() => handleSetStatus('not_found')}
                    disabled={isUpdating}
                  >
                    <HelpCircle className="h-3 w-3 mr-1" />
                    Not Found
                  </Button>
                </div>
              </div>
            </div>
          </PopoverContent>
        </Popover>

        {showCheckButton && status === 'unchecked' && (
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="h-5 w-5 p-0 text-muted-foreground hover:text-green-600"
                onClick={(e) => {
                  e.stopPropagation();
                  handleAutoCheck();
                }}
                disabled={isUpdating}
              >
                {isUpdating ? (
                  <Loader2 className="h-3 w-3 animate-spin" />
                ) : (
                  <ShieldCheck className="h-3 w-3" />
                )}
              </Button>
            </TooltipTrigger>
            <TooltipContent side="top">
              <p className="text-xs">Check OTR Credit</p>
            </TooltipContent>
          </Tooltip>
        )}
      </div>
    </TooltipProvider>
  );
}
