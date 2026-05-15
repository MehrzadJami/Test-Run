import { useParams, Link } from "wouter";
import { useGetPublicModelCard } from "@workspace/api-client-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/components/ui/tabs";
import { AlertCircle, ExternalLink, Loader2 } from "lucide-react";
import { useAuth } from "@workspace/replit-auth-web";
import { getParameterDisplayValue } from "@/lib/parameter-values";

export default function ShareModelCard() {
  const params = useParams<{ id: string }>();
  const extractionId = Number(params.id);
  const { isAuthenticated, login } = useAuth();

  // The Number.isFinite check above handles the NaN case before data is used.
  const query = useGetPublicModelCard(extractionId);

  if (!Number.isFinite(extractionId)) {
    return <ShareError message="Invalid model card ID" />;
  }

  if (query.isLoading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (query.isError || !query.data) {
    return <ShareError message="Model card not found or not publicly shared" />;
  }

  const { extraction, equations, variables, parameters, assumptions } =
    query.data;
  const assumptionItems = assumptions.filter((a) => a.kind === "assumption");
  const limitationItems = assumptions.filter((a) => a.kind === "limitation");

  return (
    <div className="min-h-screen bg-background text-foreground font-sans">
      {/* Top banner */}
      <div className="border-b border-border bg-sidebar px-6 py-3 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="bg-slate-900 rounded-lg px-2 py-1 dark:bg-transparent dark:px-0 dark:py-0">
            <img src="/logo.png" alt="ChemAI" className="h-6 w-auto object-contain" />
          </div>
          <span className="text-sm text-muted-foreground">
            Shared model card
          </span>
        </div>
        <div className="flex items-center gap-2">
          {isAuthenticated ? (
            <Link href="/dashboard">
              <Button variant="outline" size="sm">
                <ExternalLink className="h-3.5 w-3.5 mr-1.5" />
                Open in ChemAI
              </Button>
            </Link>
          ) : (
            <Button variant="outline" size="sm" onClick={login}>
              Sign in to ChemAI
            </Button>
          )}
        </div>
      </div>

      {/* Content */}
      <div className="max-w-6xl mx-auto px-6 py-8 space-y-6">
        {/* Header */}
        <div className="space-y-3">
          <div className="flex items-center gap-2 flex-wrap">
            <Badge variant="outline" className="font-mono text-[10px] uppercase tracking-wider">
              {extraction.domain}
            </Badge>
            <Badge variant="secondary" className="font-mono text-[10px] uppercase tracking-wider bg-primary/10 text-primary">
              {extraction.providerUsed}
            </Badge>
            <Badge variant="outline" className="text-[10px] uppercase text-muted-foreground">
              read-only
            </Badge>
          </div>
          <h1 className="text-3xl font-bold tracking-tight text-primary">
            {extraction.modelCardTitle}
          </h1>
        </div>

        {/* Tabs */}
        <Tabs defaultValue="overview" className="w-full">
          <TabsList className="flex flex-wrap h-auto gap-1 w-full lg:w-auto">
            <TabsTrigger value="overview">Overview</TabsTrigger>
            <TabsTrigger value="variables">
              Variables ({variables.length})
            </TabsTrigger>
            <TabsTrigger value="parameters">
              Parameters ({parameters.length})
            </TabsTrigger>
            <TabsTrigger value="equations">
              Equations ({equations.length})
            </TabsTrigger>
            <TabsTrigger value="assumptions">
              Assumptions ({assumptionItems.length})
            </TabsTrigger>
          </TabsList>

          <TabsContent value="overview" className="mt-6 space-y-4">
            {extraction.systemDescription && (
              <Card>
                <CardHeader><CardTitle className="text-base">System Description</CardTitle></CardHeader>
                <CardContent>
                  <p className="text-sm leading-relaxed text-foreground/90">{extraction.systemDescription}</p>
                </CardContent>
              </Card>
            )}
            {extraction.problemStatement && (
              <Card>
                <CardHeader><CardTitle className="text-base">Problem Statement</CardTitle></CardHeader>
                <CardContent>
                  <p className="text-sm leading-relaxed text-foreground/90">{extraction.problemStatement}</p>
                </CardContent>
              </Card>
            )}
            {limitationItems.length > 0 && (
              <Card>
                <CardHeader><CardTitle className="text-base">Limitations ({limitationItems.length})</CardTitle></CardHeader>
                <CardContent>
                  <ul className="space-y-2">
                    {limitationItems.map((item) => (
                      <li key={item.id} className="flex gap-2 text-sm">
                        <span className="text-muted-foreground">•</span>
                        <span>{item.text}</span>
                      </li>
                    ))}
                  </ul>
                </CardContent>
              </Card>
            )}
          </TabsContent>

          <TabsContent value="variables" className="mt-6">
            <Card>
              <CardContent className="pt-6">
                {variables.length === 0 ? (
                  <p className="text-sm text-muted-foreground italic">No variables extracted.</p>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b border-border text-left">
                          <th className="pb-2 font-medium text-muted-foreground pr-4">Symbol</th>
                          <th className="pb-2 font-medium text-muted-foreground pr-4">Name</th>
                          <th className="pb-2 font-medium text-muted-foreground pr-4">Unit</th>
                          <th className="pb-2 font-medium text-muted-foreground pr-4">Role</th>
                          <th className="pb-2 font-medium text-muted-foreground">Confidence</th>
                        </tr>
                      </thead>
                      <tbody>
                        {variables.map((v) => (
                          <tr key={v.id} className="border-b border-border/50 last:border-0">
                            <td className="py-2 pr-4 font-mono text-primary">{v.symbol}</td>
                            <td className="py-2 pr-4">{v.name}</td>
                            <td className="py-2 pr-4 font-mono text-xs text-muted-foreground">{v.unit || "—"}</td>
                            <td className="py-2 pr-4">
                              <Badge variant="outline" className="text-[10px]">{v.role}</Badge>
                            </td>
                            <td className="py-2">
                              <Badge variant="outline" className={`text-[10px] ${v.confidence === "high" ? "text-emerald-600 border-emerald-400" : v.confidence === "medium" ? "text-amber-600 border-amber-400" : "text-red-600 border-red-400"}`}>
                                {v.confidence}
                              </Badge>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="parameters" className="mt-6">
            <Card>
              <CardContent className="pt-6">
                {parameters.length === 0 ? (
                  <p className="text-sm text-muted-foreground italic">No parameters extracted.</p>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b border-border text-left">
                          <th className="pb-2 font-medium text-muted-foreground pr-4">Symbol</th>
                          <th className="pb-2 font-medium text-muted-foreground pr-4">Name</th>
                          <th className="pb-2 font-medium text-muted-foreground pr-4">Value</th>
                          <th className="pb-2 font-medium text-muted-foreground pr-4">Unit</th>
                          <th className="pb-2 font-medium text-muted-foreground">Confidence</th>
                        </tr>
                      </thead>
                      <tbody>
                        {parameters.map((p) => (
                          <tr key={p.id} className="border-b border-border/50 last:border-0">
                            <td className="py-2 pr-4 font-mono text-primary">{p.symbol}</td>
                            <td className="py-2 pr-4">{p.name}</td>
                            <td className="py-2 pr-4 font-mono text-xs">{getParameterDisplayValue(p)}</td>
                            <td className="py-2 pr-4 font-mono text-xs text-muted-foreground">{p.unit || "—"}</td>
                            <td className="py-2">
                              <Badge variant="outline" className={`text-[10px] ${p.confidence === "high" ? "text-emerald-600 border-emerald-400" : p.confidence === "medium" ? "text-amber-600 border-amber-400" : "text-red-600 border-red-400"}`}>
                                {p.confidence}
                              </Badge>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="equations" className="mt-6 space-y-3">
            {equations.length === 0 ? (
              <p className="text-sm text-muted-foreground italic">No equations extracted.</p>
            ) : (
              equations.map((eq) => (
                <Card key={eq.id}>
                  <CardContent className="pt-4">
                    <div className="flex items-start gap-3">
                      <span className="font-mono text-xs text-muted-foreground shrink-0 mt-0.5">{eq.label}</span>
                      <div className="space-y-1 flex-1 min-w-0">
                        <p className="font-mono text-sm break-all">{eq.plaintext}</p>
                        {eq.meaning && (
                          <p className="text-xs text-muted-foreground">{eq.meaning}</p>
                        )}
                      </div>
                      <Badge variant="outline" className={`text-[10px] shrink-0 ${eq.confidence === "high" ? "text-emerald-600 border-emerald-400" : eq.confidence === "medium" ? "text-amber-600 border-amber-400" : "text-red-600 border-red-400"}`}>
                        {eq.confidence}
                      </Badge>
                    </div>
                  </CardContent>
                </Card>
              ))
            )}
          </TabsContent>

          <TabsContent value="assumptions" className="mt-6 space-y-3">
            {assumptionItems.length === 0 ? (
              <p className="text-sm text-muted-foreground italic">No assumptions extracted.</p>
            ) : (
              assumptionItems.map((a) => (
                <Card key={a.id}>
                  <CardContent className="pt-4">
                    <div className="flex items-start gap-3">
                      <Badge variant="outline" className={`text-[10px] shrink-0 ${a.confidence === "high" ? "text-emerald-600 border-emerald-400" : a.confidence === "medium" ? "text-amber-600 border-amber-400" : "text-red-600 border-red-400"}`}>
                        {a.confidence}
                      </Badge>
                      <p className="text-sm">{a.text}</p>
                    </div>
                  </CardContent>
                </Card>
              ))
            )}
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}

function ShareError({ message }: { message: string }) {
  return (
    <div className="min-h-screen bg-background flex flex-col items-center justify-center gap-4 text-center px-4">
      <AlertCircle className="h-12 w-12 text-destructive" />
      <h2 className="text-xl font-semibold">{message}</h2>
      <p className="text-sm text-muted-foreground max-w-sm">
        This model card may have been made private or the link may be incorrect.
      </p>
      <Link href="/">
        <Button variant="outline">Go to ChemAI</Button>
      </Link>
    </div>
  );
}
