import { useHealth } from "@/lib/health";
import { Badge } from "@/components/ui/badge";
import { Activity, CheckCircle2, XCircle } from "lucide-react";

export function ConnectionStatus() {
  const { data, isError, isLoading } = useHealth();

  let statusText = "Checking...";
  let StatusIcon = Activity;
  let colorClass = "text-muted-foreground";
  let bgClass = "bg-muted";

  if (isLoading) {
    statusText = "Checking...";
    StatusIcon = Activity;
    colorClass = "text-muted-foreground";
    bgClass = "bg-muted";
  } else if (isError || !data || data.status !== "ok") {
    statusText = "Disconnected";
    StatusIcon = XCircle;
    colorClass = "text-destructive";
    bgClass = "bg-destructive/10";
  } else {
    statusText = "Connected";
    StatusIcon = CheckCircle2;
    colorClass = "text-primary";
    bgClass = "bg-primary/10";
  }

  return (
    <div className="flex flex-col gap-2 p-4 border-t border-border mt-auto">
      <div className="flex items-center justify-between">
        <div className={`flex items-center gap-2 text-sm font-medium ${colorClass}`} data-testid="connection-status">
          <StatusIcon className="w-4 h-4" />
          {statusText}
        </div>
      </div>
      <div className="flex items-center justify-between">
        <span className="text-xs text-muted-foreground font-mono">Backend API</span>
        <Badge variant="outline" className="text-[10px] font-mono py-0 h-5" data-testid="badge-demo-mode">
          Demo Mode
        </Badge>
      </div>
    </div>
  );
}
