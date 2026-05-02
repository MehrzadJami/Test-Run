import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  usePatchAssumption,
  useResetAssumption,
  getGetModelCardByProjectQueryKey,
} from "@workspace/api-client-react";
import type { Assumption, PatchAssumptionInput } from "@workspace/api-client-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Pencil, RotateCcw, Loader2 } from "lucide-react";

type Confidence = "high" | "medium" | "low";

function ConfidenceBadge({ value }: { value?: Confidence | string | null }) {
  if (!value) return null;
  return (
    <Badge
      variant={value === "high" ? "default" : value === "medium" ? "secondary" : "destructive"}
      className="text-[10px] uppercase ml-2"
    >
      {value}
    </Badge>
  );
}

interface Props {
  projectId: number;
  assumptionItems: Assumption[];
  limitationItems: Assumption[];
}

function AssumptionRow({
  item,
  onEdit,
  onReset,
  resetting,
}: {
  item: Assumption;
  onEdit: (item: Assumption) => void;
  onReset: (id: number) => void;
  resetting: boolean;
}) {
  return (
    <li className={`text-sm ${item.kind === "limitation" ? "text-destructive/90" : ""}`}>
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-start gap-2 flex-1 min-w-0">
          <span className="mt-0.5 text-muted-foreground shrink-0">•</span>
          <div className="flex-1 min-w-0">
            <span className={item.editedByUser ? "font-medium" : ""}>{item.text}</span>
            <ConfidenceBadge value={item.confidence} />
            {item.editedByUser && (
              <span className="ml-1 text-[9px] text-amber-600 font-normal uppercase tracking-wide">(edited)</span>
            )}
            {item.sourceQuote && (
              <p className="text-xs text-muted-foreground italic mt-1">"{item.sourceQuote}"</p>
            )}
          </div>
        </div>
        <div className="flex gap-1 shrink-0">
          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => onEdit(item)}>
            <Pencil className="h-3.5 w-3.5" />
          </Button>
          {item.editedByUser && (
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7 text-amber-600"
              disabled={resetting}
              onClick={() => onReset(item.id)}
              title="Reset to original AI extraction"
            >
              {resetting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RotateCcw className="h-3.5 w-3.5" />}
            </Button>
          )}
        </div>
      </div>
    </li>
  );
}

export function AssumptionsTab({ projectId, assumptionItems, limitationItems }: Props) {
  const qc = useQueryClient();
  const invalidate = () =>
    qc.invalidateQueries({ queryKey: getGetModelCardByProjectQueryKey(projectId) });

  const patch = usePatchAssumption({ mutation: { onSuccess: invalidate } });
  const reset = useResetAssumption({ mutation: { onSuccess: invalidate } });

  const [editing, setEditing] = useState<Assumption | null>(null);
  const [draft, setDraft] = useState<PatchAssumptionInput>({});

  function openEdit(item: Assumption) {
    setEditing(item);
    setDraft({
      text: item.text,
      kind: item.kind,
      sourceQuote: item.sourceQuote,
      confidence: item.confidence,
    });
  }

  function handleSave() {
    if (!editing) return;
    patch.mutate({ id: editing.id, data: draft });
    setEditing(null);
  }

  return (
    <>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <Card className="bg-muted/30 border-muted-foreground/20">
          <CardHeader>
            <CardTitle className="text-base">Assumptions</CardTitle>
            <CardDescription>Conditions taken as given in the model formulation.</CardDescription>
          </CardHeader>
          <CardContent>
            {assumptionItems.length === 0 ? (
              <p className="text-sm text-muted-foreground italic">No assumptions extracted.</p>
            ) : (
              <ul className="space-y-3">
                {assumptionItems.map((item) => (
                  <AssumptionRow
                    key={item.id}
                    item={item}
                    onEdit={openEdit}
                    onReset={(id) => reset.mutate({ id })}
                    resetting={reset.isPending}
                  />
                ))}
              </ul>
            )}
          </CardContent>
        </Card>

        <Card className="bg-destructive/5 border-destructive/20">
          <CardHeader>
            <CardTitle className="text-base text-destructive">Limitations</CardTitle>
            <CardDescription>Known boundaries and weaknesses of the model.</CardDescription>
          </CardHeader>
          <CardContent>
            {limitationItems.length === 0 ? (
              <p className="text-sm text-muted-foreground italic">No limitations extracted.</p>
            ) : (
              <ul className="space-y-3">
                {limitationItems.map((item) => (
                  <AssumptionRow
                    key={item.id}
                    item={item}
                    onEdit={openEdit}
                    onReset={(id) => reset.mutate({ id })}
                    resetting={reset.isPending}
                  />
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>

      <Dialog open={!!editing} onOpenChange={(open) => { if (!open) setEditing(null); }}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Edit {editing?.kind === "limitation" ? "Limitation" : "Assumption"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-1">
              <Label htmlFor="a-text">Text</Label>
              <Textarea
                id="a-text"
                value={draft.text ?? ""}
                onChange={(e) => setDraft((d) => ({ ...d, text: e.target.value }))}
                rows={3}
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label>Kind</Label>
                <Select
                  value={draft.kind ?? "assumption"}
                  onValueChange={(v) => setDraft((d) => ({ ...d, kind: v as "assumption" | "limitation" }))}
                >
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="assumption">assumption</SelectItem>
                    <SelectItem value="limitation">limitation</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label>Confidence</Label>
                <Select
                  value={draft.confidence ?? "medium"}
                  onValueChange={(v) => setDraft((d) => ({ ...d, confidence: v as Confidence }))}
                >
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="high">high</SelectItem>
                    <SelectItem value="medium">medium</SelectItem>
                    <SelectItem value="low">low</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="space-y-1">
              <Label htmlFor="a-source">Source Quote</Label>
              <Textarea
                id="a-source"
                value={draft.sourceQuote ?? ""}
                onChange={(e) => setDraft((d) => ({ ...d, sourceQuote: e.target.value }))}
                rows={2}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditing(null)}>Cancel</Button>
            <Button onClick={handleSave} disabled={patch.isPending}>
              {patch.isPending ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : null}
              Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
