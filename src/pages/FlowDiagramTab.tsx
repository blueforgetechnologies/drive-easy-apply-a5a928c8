import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Mail, Database, Zap, Eye, ArrowRight, ArrowDown } from "lucide-react";

export default function FlowDiagramTab() {
  return (
    <div className="space-y-6 p-4">
      <div className="flex items-center gap-2">
        <h1 className="text-2xl font-bold">Load Hunter Flow Diagram</h1>
        <Badge variant="outline">Visual Guide</Badge>
      </div>

      {/* Main Flow Diagram */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Mail className="h-5 w-5" />
            Email Processing Flow
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col items-center gap-4 py-8">
            {/* Step 1: Gmail */}
            <div className="flex items-center gap-4">
              <div className="w-48 p-4 bg-red-100 border-2 border-red-500 rounded-lg text-center">
                <div className="font-bold text-red-700">📧 Gmail</div>
                <div className="text-xs text-red-600 mt-1">New email arrives</div>
              </div>
            </div>
            
            <ArrowDown className="h-8 w-8 text-muted-foreground" />
            
            {/* Step 2: Pub/Sub */}
            <div className="flex items-center gap-4">
              <div className="w-48 p-4 bg-yellow-100 border-2 border-yellow-500 rounded-lg text-center">
                <div className="font-bold text-yellow-700">🔔 Pub/Sub</div>
                <div className="text-xs text-yellow-600 mt-1">Push notification</div>
              </div>
            </div>
            
            <ArrowDown className="h-8 w-8 text-muted-foreground" />
            
            {/* Step 3: Webhook */}
            <div className="flex items-center gap-4">
              <div className="w-48 p-4 bg-blue-100 border-2 border-blue-500 rounded-lg text-center">
                <div className="font-bold text-blue-700">⚡ gmail-webhook</div>
                <div className="text-xs text-blue-600 mt-1">Edge Function</div>
              </div>
            </div>
            
            <ArrowDown className="h-8 w-8 text-muted-foreground" />
            
            {/* Step 4: Email Queue */}
            <div className="flex items-center gap-4">
              <div className="w-48 p-4 bg-orange-100 border-2 border-orange-500 rounded-lg text-center">
                <div className="font-bold text-orange-700">📋 email_queue</div>
                <div className="text-xs text-orange-600 mt-1">Staging table (message ID only)</div>
              </div>
            </div>
            
            <ArrowDown className="h-8 w-8 text-muted-foreground" />
            
            {/* Step 5: Process Queue */}
            <div className="flex items-center gap-4">
              <div className="w-48 p-4 bg-purple-100 border-2 border-purple-500 rounded-lg text-center">
                <div className="font-bold text-purple-700">⚙️ process-email-queue</div>
                <div className="text-xs text-purple-600 mt-1">Edge Function (parses email)</div>
              </div>
            </div>
            
            <ArrowDown className="h-8 w-8 text-muted-foreground" />
            
            {/* Step 6: Load Emails */}
            <div className="flex items-center gap-4">
              <div className="w-48 p-4 bg-green-100 border-2 border-green-500 rounded-lg text-center">
                <div className="font-bold text-green-700">📦 load_emails</div>
                <div className="text-xs text-green-600 mt-1">Final table (full parsed data)</div>
              </div>
            </div>
            
            <ArrowDown className="h-8 w-8 text-muted-foreground" />
            
            {/* Step 7: UI */}
            <div className="flex items-center gap-4">
              <div className="w-48 p-4 bg-teal-100 border-2 border-teal-500 rounded-lg text-center">
                <div className="font-bold text-teal-700">👀 Load Hunter UI</div>
                <div className="text-xs text-teal-600 mt-1">Queries load_emails</div>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Tables Overview */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Card>
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2">
              <Database className="h-4 w-4" />
              email_queue (Staging)
            </CardTitle>
          </CardHeader>
          <CardContent className="text-sm space-y-2">
            <div className="font-mono bg-muted p-2 rounded text-xs">
              <div>• gmail_message_id (text)</div>
              <div>• gmail_history_id (text)</div>
              <div>• status (pending/processing/completed/failed)</div>
              <div>• attempts (integer)</div>
              <div>• queued_at (timestamp)</div>
            </div>
            <p className="text-muted-foreground">
              Fast staging table. Webhook inserts here quickly, then process-email-queue picks up and processes.
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2">
              <Database className="h-4 w-4" />
              load_emails (Final)
            </CardTitle>
          </CardHeader>
          <CardContent className="text-sm space-y-2">
            <div className="font-mono bg-muted p-2 rounded text-xs">
              <div>• id, email_id, load_id</div>
              <div>• subject, from_email</div>
              <div>• received_at (Gmail timestamp)</div>
              <div>• created_at (when WE processed it)</div>
              <div>• parsed_data (JSON with all details)</div>
              <div>• status (new/skipped/missed/etc)</div>
            </div>
            <p className="text-muted-foreground">
              Full parsed email data. UI queries this table.
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Key Timestamps */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">⏰ Key Timestamps</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="p-3 bg-blue-50 rounded-lg border border-blue-200">
              <div className="font-bold text-blue-800">received_at</div>
              <div className="text-sm text-blue-600">When Gmail RECEIVED the email (original timestamp)</div>
              <div className="text-xs text-blue-500 mt-1">Can be days old if backlogged</div>
            </div>
            <div className="p-3 bg-green-50 rounded-lg border border-green-200">
              <div className="font-bold text-green-800">created_at</div>
              <div className="text-sm text-green-600">When WE PROCESSED the email (our timestamp)</div>
              <div className="text-xs text-green-500 mt-1">Always recent if processing is current</div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Current Filter Logic */}
      <Card className="border-yellow-500 border-2">
        <CardHeader>
          <CardTitle className="text-lg flex items-center gap-2">
            <Eye className="h-4 w-4" />
            Current UI Filter
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="font-mono bg-yellow-50 p-3 rounded text-sm">
            SELECT * FROM load_emails<br />
            WHERE created_at &gt;= (NOW - 30 minutes)<br />
            ORDER BY created_at DESC
          </div>
          <p className="text-sm text-muted-foreground mt-2">
            Shows emails processed in the last 30 minutes. If queue has old backlog, old emails (with old received_at) will appear because they were just processed (recent created_at).
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
