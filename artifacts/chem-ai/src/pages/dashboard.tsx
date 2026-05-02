import { Link } from "wouter";
import { useListProjects } from "@workspace/api-client-react";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Database,
  FileText,
  FileStack,
  FlaskConical,
  Plus,
  AlertCircle,
  RefreshCw,
} from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";

export default function Dashboard() {
  const { data: projects, isLoading, isError, refetch } = useListProjects();

  const totalProjects = projects?.length ?? 0;
  const totalExtractions =
    projects?.reduce((acc, p) => acc + p.extractionCount, 0) ?? 0;
  const totalSources =
    projects?.reduce((acc, p) => acc + p.sourceDocumentCount, 0) ?? 0;

  return (
    <div className="space-y-8">

      {/* ── Page header ── */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-primary">
            Dashboard
          </h1>
          <p className="text-muted-foreground mt-1.5 text-sm">
            Overview of your extracted model artifacts and recent activity.
          </p>
        </div>
        <Link href="/new">
          <Button data-testid="btn-dashboard-new" className="shrink-0">
            <Plus className="h-4 w-4 mr-2" />
            New Extraction
          </Button>
        </Link>
      </div>

      {/* ── Stat cards ── */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <StatCard
          label="Projects"
          icon={Database}
          value={isLoading ? null : totalProjects}
          accent="border-l-4 border-l-primary/60"
          testId="stat-projects"
        />
        <StatCard
          label="Extractions"
          icon={FlaskConical}
          value={isLoading ? null : totalExtractions}
          accent="border-l-4 border-l-violet-400/60"
          testId="stat-extractions"
        />
        <StatCard
          label="Source documents"
          icon={FileStack}
          value={isLoading ? null : totalSources}
          accent="border-l-4 border-l-teal-400/60"
          testId="stat-sources"
        />
      </div>

      {/* ── Projects table ── */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="text-base">Recent Projects</CardTitle>
          {!isLoading && !isError && projects && projects.length > 0 && (
            <Badge variant="outline" className="font-mono text-xs text-muted-foreground">
              {projects.length} project{projects.length === 1 ? "" : "s"}
            </Badge>
          )}
        </CardHeader>
        <CardContent className="p-0">
          {isError ? (
            <div className="p-6">
              <Alert variant="destructive">
                <AlertCircle className="h-4 w-4" />
                <AlertTitle>Could not load projects</AlertTitle>
                <AlertDescription className="flex items-center gap-3 mt-1">
                  <span>The API may not be reachable.</span>
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-7 text-xs"
                    onClick={() => void refetch()}
                  >
                    <RefreshCw className="h-3 w-3 mr-1.5" />
                    Retry
                  </Button>
                </AlertDescription>
              </Alert>
            </div>
          ) : isLoading ? (
            <div className="divide-y divide-border">
              {[...Array(3)].map((_, i) => (
                <div key={i} className="px-6 py-4 flex items-center gap-4 animate-pulse">
                  <div className="h-4 bg-muted rounded w-40" />
                  <div className="h-4 bg-muted rounded w-56 flex-1" />
                  <div className="h-4 bg-muted rounded w-12" />
                  <div className="h-4 bg-muted rounded w-12" />
                  <div className="h-4 bg-muted rounded w-24" />
                </div>
              ))}
            </div>
          ) : !projects || projects.length === 0 ? (
            <div className="flex flex-col items-center justify-center text-center py-16 space-y-4 px-6">
              <div className="bg-muted/50 rounded-full p-4">
                <FileText className="h-8 w-8 text-muted-foreground/60" />
              </div>
              <div className="space-y-1">
                <p className="text-sm font-medium text-foreground">
                  No projects yet
                </p>
                <p className="text-xs text-muted-foreground max-w-xs">
                  Start by creating your first extraction from a scientific
                  paper or methodology text.
                </p>
              </div>
              <Link href="/new">
                <Button size="sm" data-testid="btn-empty-new">
                  <Plus className="h-3.5 w-3.5 mr-1.5" />
                  New Extraction
                </Button>
              </Link>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow className="hover:bg-transparent">
                  <TableHead className="pl-6">Project</TableHead>
                  <TableHead>Latest model card</TableHead>
                  <TableHead className="text-right">Sources</TableHead>
                  <TableHead className="text-right">Extractions</TableHead>
                  <TableHead className="pr-6">Updated</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {projects.map((project) => (
                  <TableRow
                    key={project.id}
                    className="cursor-pointer hover:bg-muted/40 group"
                  >
                    <TableCell className="font-medium pl-6">
                      <Link
                        href={`/model-cards/${project.id}`}
                        className="group-hover:text-primary transition-colors"
                        data-testid={`link-project-${project.id}`}
                      >
                        {project.name}
                      </Link>
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground max-w-[220px]">
                      <span className="truncate block">
                        {project.latestExtractionTitle ?? (
                          <span className="italic text-muted-foreground/50">—</span>
                        )}
                      </span>
                    </TableCell>
                    <TableCell className="text-right font-mono text-sm text-muted-foreground">
                      {project.sourceDocumentCount}
                    </TableCell>
                    <TableCell className="text-right">
                      <Badge
                        variant={project.extractionCount > 0 ? "default" : "secondary"}
                        className="font-mono text-xs"
                      >
                        {project.extractionCount}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground font-mono pr-6 whitespace-nowrap">
                      {new Date(project.updatedAt).toLocaleDateString()}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

// ── Stat card sub-component ─────────────────────────────────────────────────

interface StatCardProps {
  label: string;
  icon: React.ElementType;
  value: number | null;
  accent?: string;
  testId?: string;
}

function StatCard({ label, icon: Icon, value, accent = "", testId }: StatCardProps) {
  return (
    <Card className={`overflow-hidden ${accent}`}>
      <CardHeader className="flex flex-row items-center justify-between pb-2 pt-4 px-5">
        <CardTitle className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          {label}
        </CardTitle>
        <Icon className="h-4 w-4 text-muted-foreground" />
      </CardHeader>
      <CardContent className="px-5 pb-4">
        {value === null ? (
          <div className="h-8 w-16 bg-muted rounded animate-pulse" />
        ) : (
          <div className="text-3xl font-bold tabular-nums" data-testid={testId}>
            {value}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
