import { Shield } from "lucide-react";

export default function Inspector() {
  return (
    <div className="p-6 space-y-2">
      <div className="flex items-center gap-2">
        <Shield className="w-5 h-5" />
        <h1 className="text-2xl font-semibold">Platform Inspector</h1>
      </div>
      <p className="text-muted-foreground">
        Admin-only diagnostics. If you can see this page, routing is working.
      </p>
    </div>
  );
}
