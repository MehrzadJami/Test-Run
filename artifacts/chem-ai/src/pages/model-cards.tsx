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
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { useState } from "react";
import {
  Plus,
  Search,
  Library,
  AlertCircle,
  RefreshCw,
} from "lucide-react";

export default function ModelCardsIndex() {
  const [searchTerm, setSearchTerm] = useState("");
  const { data: projects, isLoading, isError, refetch } = useListProjects();

  const term = searchTerm.toLowerCase().trim();
  const filtered = (projects ?? []).filter((p) => {
    if (!term) return true;
    return (
      p.name.toLowerCase().includes(term) ||
      (p.latestExtractionTitle ?? "").toLowerCase().includes(term)
    );
  });

  return (
    <div className="space-y-8">

      {/* ── Page header ── */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-primary">
            Model Cards
          </h1>
          <p className="text-muted-foreground mt-1.5 text-sm">
            Library of all extracted mathematical models.
          </p>
        </div>
        <div className="flex items-center gap-3 flex-wrap">
          <div className="relative w-full md:w-72">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search projects…"
              className="pl-9"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              data-testid="input-search-models"
            />
          </div>
          <Link href="/new">
            <Button data-testid="btn-mc-new" className="shrink-0">
              <Plus className="h-4 w-4 mr-2" />
              New
            </Button>
          </Link>
        </div>
      </div>

      {/* ── Projects table card ── */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="text-base">Projects</CardTitle>
          {!isLoading && !isError && filtered.length > 0 && (
            <Badge variant="outline" className="font-mono text-xs text-muted-foreground">
              {filtered.length} result{filtered.length === 1 ? "" : "s"}
              {term && ` for "${term}"`}
            </Badge>
          )}
        </CardHeader>
        <CardContent className="p-0">

          {/* Error */}
          {isError && (
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
          )}

          {/* Loading skeleton */}
          {isLoading && (
            <div className="divide-y divide-border">
              {[...Array(4)].map((_, i) => (
                <div key={i} className="px-6 py-4 flex items-center gap-4 animate-pulse">
                  <div className="h-4 bg-muted rounded w-48" />
                  <div className="h-4 bg-muted rounded flex-1" />
                  <div className="h-4 bg-muted rounded w-10" />
                  <div className="h-4 bg-muted rounded w-10" />
                  <div className="h-4 bg-muted rounded w-20" />
                </div>
              ))}
            </div>
          )}

          {/* Empty — no projects at all */}
          {!isLoading && !isError && projects && projects.length === 0 && (
            <div className="flex flex-col items-center justify-center text-center py-20 space-y-4 px-6">
              <div className="bg-muted/50 rounded-full p-5">
                <Library className="h-10 w-10 text-muted-foreground/50" />
              </div>
              <div className="space-y-1">
                <p className="text-sm font-medium text-foreground">
                  No model cards yet
                </p>
                <p className="text-xs text-muted-foreground max-w-xs">
                  Create your first model card by extracting a scientific paper
                  or methodology text.
                </p>
              </div>
              <Link href="/new">
                <Button size="sm">
                  <Plus className="h-3.5 w-3.5 mr-1.5" />
                  New Extraction
                </Button>
              </Link>
            </div>
          )}

          {/* Empty — search no results */}
          {!isLoading && !isError && projects && projects.length > 0 && filtered.length === 0 && (
            <div className="flex flex-col items-center justify-center text-center py-12 space-y-2 px-6">
              <Search className="h-8 w-8 text-muted-foreground/40" />
              <p className="text-sm text-muted-foreground">
                No projects match <span className="font-mono font-medium">"{term}"</span>
              </p>
              <Button
                variant="ghost"
                size="sm"
                className="text-xs"
                onClick={() => setSearchTerm("")}
              >
                Clear search
              </Button>
            </div>
          )}

          {/* Table */}
          {!isLoading && !isError && filtered.length > 0 && (
            <Table>
              <TableHeader>
                <TableRow className="hover:bg-transparent">
                  <TableHead className="pl-6 w-[200px]">Project</TableHead>
                  <TableHead>Latest model card</TableHead>
                  <TableHead className="text-right w-20">Sources</TableHead>
                  <TableHead className="text-right w-24">Extractions</TableHead>
                  <TableHead className="pr-6 w-28">Created</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map((project) => (
                  <TableRow
                    key={project.id}
                    className="cursor-pointer hover:bg-muted/40 group"
                  >
                    <TableCell className="font-medium pl-6">
                      <Link
                        href={`/model-cards/${project.id}`}
                        className="block group-hover:text-primary transition-colors"
                        data-testid={`link-model-${project.id}`}
                      >
                        {project.name}
                      </Link>
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground max-w-[260px]">
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
                      {new Date(project.createdAt).toLocaleDateString()}
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
