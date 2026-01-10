import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useTenantFilter } from "@/hooks/useTenantFilter";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { Loader2, ShieldCheck, ShieldX, ShieldAlert, ShieldQuestion, RefreshCw, Phone } from "lucide-react";
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
  unchecked: { label: 'Unchecked', icon: ShieldQuestion, variant: 'secondary', className: 'bg-slate-100 text-slate-600 hover:bg-slate-200' },
  approved: { label: 'Approved', icon: ShieldCheck, variant: 'default', className: 'bg-green-100 text-green-700 border-green-200 hover:bg-green-200' },
  not_approved: { label: 'Not Approved', icon: ShieldX, variant: 'destructive', className: 'bg-red-100 text-red-700 border-red-200 hover:bg-red-200' },
  call_otr: { label: 'Call OTR', icon: Phone, variant: 'outline', className: 'bg-yellow-100 text-yellow-700 border-yellow-300 hover:bg-yellow-200' },
  not_found: { label: 'Not Found', icon: ShieldAlert, variant: 'secondary', className: 'bg-orange-100 text-orange-700 border-orange-200 hover:bg-orange-200' },
  error: { label: 'Error', icon: ShieldAlert, variant: 'destructive', className: 'bg-red-100 text-red-700' },
  checking: { label: 'Checking...', icon: Loader2, variant: 'secondary', className: 'bg-blue-100 text-blue-600' },
};

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
  const [isChecking, setIsChecking] = useState(false);

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

  const handleCheckCredit = async () => {
    if (!tenantId) {
      toast.error('No tenant context');
      return;
    }

    if (!mcNumber && !customerId) {
      toast.warning('MC number required', {
        description: 'Please add the broker MC number to the customer record first'
      });
      return;
    }

    setIsChecking(true);
    setStatus('checking');

    try {
      const { data, error } = await supabase.functions.invoke('check-broker-credit', {
        body: {
          tenant_id: tenantId,
          mc_number: mcNumber,
          broker_name: brokerName,
          customer_id: customerId,
          load_email_id: loadEmailId,
          match_id: matchId
        }
      });

      if (error) {
        console.error('Credit check error:', error);
        setStatus('error');
        toast.error('Failed to check broker credit', {
          description: error.message
        });
        return;
      }

      if (!data?.success) {
        setStatus('error');
        toast.error('Credit check failed', {
          description: data?.error || 'Unknown error'
        });
        return;
      }

      const newStatus = data.approval_status as ApprovalStatus;
      setStatus(newStatus);
      setLastChecked(new Date().toISOString());
      setCreditLimit(data.credit_limit);

      if (onStatusChange) {
        onStatusChange(newStatus);
      }

      // Show appropriate toast based on status
      if (newStatus === 'approved') {
        toast.success('Broker Approved', {
          description: `${data.broker_name || brokerName} is approved by OTR Solutions`
        });
      } else if (newStatus === 'not_approved') {
        toast.error('Broker Not Approved', {
          description: `${data.broker_name || brokerName} is NOT approved - do not proceed`
        });
      } else if (newStatus === 'call_otr') {
        toast.warning('Call OTR', {
          description: 'This broker requires manual verification - call OTR Solutions'
        });
      } else if (newStatus === 'not_found') {
        toast.info('Broker Not Found', {
          description: 'This MC number is not in OTR database'
        });
      }
    } catch (err) {
      console.error('Credit check error:', err);
      setStatus('error');
      toast.error('Credit check failed');
    } finally {
      setIsChecking(false);
    }
  };

  const config = statusConfig[status] || statusConfig.unchecked;
  const Icon = config.icon;

  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <div className="inline-flex items-center gap-1">
            <Badge 
              variant={config.variant}
              className={`${config.className} text-[10px] px-1.5 py-0.5 flex items-center gap-1 cursor-default`}
            >
              <Icon className={`h-3 w-3 ${status === 'checking' ? 'animate-spin' : ''}`} />
              <span>{config.label}</span>
            </Badge>
            
            {showCheckButton && status !== 'checking' && (
              <Button
                variant="ghost"
                size="icon"
                className="h-5 w-5 p-0"
                onClick={(e) => {
                  e.stopPropagation();
                  handleCheckCredit();
                }}
                disabled={isChecking}
              >
                <RefreshCw className={`h-3 w-3 ${isChecking ? 'animate-spin' : ''}`} />
              </Button>
            )}
          </div>
        </TooltipTrigger>
        <TooltipContent side="bottom" className="max-w-xs">
          <div className="text-xs space-y-1">
            <p className="font-semibold">OTR Solutions Credit Check</p>
            <p><span className="text-muted-foreground">Broker:</span> {brokerName}</p>
            {mcNumber && <p><span className="text-muted-foreground">MC#:</span> {mcNumber}</p>}
            {creditLimit && <p><span className="text-muted-foreground">Credit Limit:</span> ${creditLimit.toLocaleString()}</p>}
            {lastChecked && (
              <p><span className="text-muted-foreground">Last Checked:</span> {new Date(lastChecked).toLocaleString()}</p>
            )}
            {status === 'unchecked' && (
              <p className="text-amber-600">Click refresh to check with OTR Solutions</p>
            )}
          </div>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}