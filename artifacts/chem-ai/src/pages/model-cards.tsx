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
import { useState } from "react";
import { Plus, Search } from "lucide-react";

export default function ModelCardsIndex() {
  const [searchTerm, setSearchTerm] = useState("");
  const { data: projects, isLoading, isError } = useListProjects();

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
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-primary">
            Model Cards
          </h1>
          <p className="text-muted-foreground mt-2">
            Library of all extracted mathematical models.
          </p>
        </div>
        <div className="flex items-center gap-3">
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
            <Button data-testid="btn-mc-new">
              <Plus className="h-4 w-4 mr-2" />
              New
            </Button>
          </Link>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Projects</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {isError ? (
            <p className="p-6 text-sm text-destructive">
              Failed to load projects. The API may not be reachable.
            </p>
          ) : isLoading ? (
            <p className="p-6 text-sm text-muted-foreground">Loading…</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Project</TableHead>
                  <TableHead>Latest model card</TableHead>
                  <TableHead className="text-right">Sources</TableHead>
                  <TableHead className="text-right">Extractions</TableHead>
                  <TableHead>Created</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.length === 0 ? (
                  <TableRow>
                    <TableCell
                      colSpan={5}
                      className="text-center py-8 text-muted-foreground"
                    >
                      {projects && projects.length === 0
                        ? "No projects yet. Create one from the New Extraction page."
                        : "No projects match your search."}
                    </TableCell>
                  </TableRow>
                ) : (
                  filtered.map((project) => (
                    <TableRow
                      key={project.id}
                      className="cursor-pointer hover:bg-muted/50 group"
                    >
                      <TableCell className="font-medium">
                        <Link
                          href={`/model-cards/${project.id}`}
                          className="block group-hover:underline text-primary"
                          data-testid={`link-model-${project.id}`}
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
                            project.extractionCount > 0
                              ? "default"
                              : "secondary"
                          }
                        >
                          {project.extractionCount}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground font-mono">
                        {new Date(project.createdAt).toLocaleDateString()}
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
