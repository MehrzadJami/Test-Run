import { Link } from "wouter";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export default function FeatureDisabled({ name }: { name: string }) {
  return (
    <div className="max-w-2xl mx-auto p-6">
      <Card>
        <CardHeader>
          <CardTitle>Feature not enabled</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 text-sm text-muted-foreground">
          <p><strong>{name}</strong> is currently disabled in this deployment.</p>
          <p>Set the corresponding feature flag environment variable to enable it.</p>
          <Link href="/dashboard" className="text-primary underline">Go back to Dashboard</Link>
        </CardContent>
      </Card>
    </div>
  );
}
