import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export default function LoadHunterTab() {
  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-3xl font-bold tracking-tight">Load Hunter</h2>
        <p className="text-muted-foreground">
          Find and secure the best loads for your fleet
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Load Board Search</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-center h-64 text-muted-foreground">
            <p>Load Hunter coming soon...</p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
