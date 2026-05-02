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
import { Database, FileText, FileStack, FlaskConical, Plus } from "lucide-react";

export default function Dashboard() {
  const { data: projects, isLoading, isError } = useListProjects();

  const totalProjects = projects?.length ?? 0;
  const totalExtractions =
    projects?.reduce((acc, p) => acc + p.extractionCount, 0) ?? 0;
  const totalSources =
    projects?.reduce((acc, p) => acc + p.sourceDocumentCount, 0) ?? 0;

  return (
    <div className="space-y-8">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-primary">
            Dashboard
          </h1>
          <p className="text-muted-foreground mt-2">
            Overview of your extracted model artifacts and recent activity.
          </p>
        </div>
        <Link href="/new">
          <Button data-testid="btn-dashboard-new">
            <Plus className="h-4 w-4 mr-2" />
            New Extraction
          </Button>
        </Link>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Projects
            </CardTitle>
            <Database className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div
              className="text-2xl font-bold"
              data-testid="stat-projects"
            >
              {isLoading ? "—" : totalProjects}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Extractions
            </CardTitle>
            <FlaskConical className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div
              className="text-2xl font-bold"
              data-testid="stat-extractions"
            >
              {isLoading ? "—" : totalExtractions}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Source documents
            </CardTitle>
            <FileStack className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div
              className="text-2xl font-bold"
              data-testid="stat-sources"
            >
              {isLoading ? "—" : totalSources}
            </div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Recent Projects</CardTitle>
        </CardHeader>
        <CardContent>
          {isError ? (
            <p className="text-sm text-destructive">
              Failed to load projects. The API may not be reachable.
            </p>
          ) : isLoading ? (
            <p className="text-sm text-muted-foreground">Loading…</p>
          ) : !projects || projects.length === 0 ? (
            <div className="flex flex-col items-center justify-center text-center py-12 space-y-3">
              <FileText className="h-10 w-10 text-muted-foreground" />
              <p className="text-sm text-muted-foreground">
                No projects yet. Start by creating an extraction.
              </p>
              <Link href="/new">
                <Button variant="outline" size="sm">
                  New Extraction
                </Button>
              </Link>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Project</TableHead>
                  <TableHead>Latest model card</TableHead>
                  <TableHead className="text-right">Sources</TableHead>
                  <TableHead className="text-right">Extractions</TableHead>
                  <TableHead>Updated</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {projects.map((project) => (
                  <TableRow
                    key={project.id}
                    className="cursor-pointer hover:bg-muted/50"
                  >
                    <TableCell className="font-medium">
                      <Link
                        href={`/model-cards/${project.id}`}
                        className="hover:underline"
                        data-testid={`link-project-${project.id}`}
                      >
                        {project.name}
                      </Link>
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {project.latestExtractionTitle ?? (
                        <span className="italic">—</span>
                      )}
                    </TableCell>
                    <TableCell className="text-right font-mono text-sm">
                      {project.sourceDocumentCount}
                    </TableCell>
                    <TableCell className="text-right">
                      <Badge
                        variant={
                          project.extractionCount > 0 ? "default" : "secondary"
                        }
                      >
                        {project.extractionCount}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground font-mono">
                      {new Date(project.updatedAt).toLocaleString()}
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
