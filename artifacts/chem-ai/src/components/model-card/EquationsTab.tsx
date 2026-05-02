import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  usePatchEquation,
  useResetEquation,
  getGetModelCardByProjectQueryKey,
} from "@workspace/api-client-react";
import type { Equation, PatchEquationInput } from "@workspace/api-client-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
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
      className="text-[10px] uppercase"
    >
      {value}
    </Badge>
  );
}

interface Props {
  projectId: number;
  equations: Equation[];
}

export function EquationsTab({ projectId, equations }: Props) {
  const qc = useQueryClient();
  const invalidate = () =>
    qc.invalidateQueries({ queryKey: getGetModelCardByProjectQueryKey(projectId) });

  const patch = usePatchEquation({ mutation: { onSuccess: invalidate } });
  const reset = useResetEquation({ mutation: { onSuccess: invalidate } });

  const [editing, setEditing] = useState<Equation | null>(null);
  const [draft, setDraft] = useState<PatchEquationInput>({});

  function openEdit(eq: Equation) {
    setEditing(eq);
    setDraft({
      label: eq.label,
      latex: eq.latex,
      plaintext: eq.plaintext,
      meaning: eq.meaning,
      variablesInvolved: [...eq.variablesInvolved],
      confidence: eq.confidence,
      sourceQuote: eq.sourceQuote,
    });
  }

  function handleSave() {
    if (!editing) return;
    patch.mutate({ id: editing.id, data: draft });
    setEditing(null);
  }

  return (
    <>
      <div className="divide-y divide-border">
        {equations.map((eq) => (
          <div key={eq.id} className={`p-4 space-y-2 ${eq.editedByUser ? "bg-amber-50/40 dark:bg-amber-950/10" : ""}`}>
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-center gap-2 flex-wrap">
                {eq.label && (
                  <span className="font-mono text-xs bg-muted/50 rounded px-2 py-1 font-bold">{eq.label}</span>
                )}
                <ConfidenceBadge value={eq.confidence} />
                {eq.editedByUser && (
                  <span className="text-[9px] text-amber-600 font-normal uppercase tracking-wide">(edited)</span>
                )}
              </div>
              <div className="flex gap-1 shrink-0">
                <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => openEdit(eq)}>
                  <Pencil className="h-3.5 w-3.5" />
                </Button>
                {eq.editedByUser && (
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7 text-amber-600"
                    disabled={reset.isPending}
                    onClick={() => reset.mutate({ id: eq.id })}
                    title="Reset to original AI extraction"
                  >
                    {reset.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RotateCcw className="h-3.5 w-3.5" />}
                  </Button>
                )}
              </div>
            </div>

            <div className="font-mono text-sm bg-muted/30 rounded px-3 py-2 whitespace-pre-wrap">{eq.latex}</div>

            {eq.plaintext && (
              <div className="font-mono text-xs text-muted-foreground">{eq.plaintext}</div>
            )}

            {eq.meaning && (
              <div className="text-sm text-foreground/80">{eq.meaning}</div>
            )}

            {eq.variablesInvolved?.length > 0 && (
              <div className="flex flex-wrap gap-1">
                {eq.variablesInvolved.map((sym) => (
                  <span key={sym} className="font-mono text-xs bg-muted/50 rounded px-1.5 py-0.5">{sym}</span>
                ))}
              </div>
            )}

            {eq.sourceQuote && (
              <div className="text-xs text-muted-foreground italic border-l-2 border-border pl-3">
                "{eq.sourceQuote}"
              </div>
            )}
          </div>
        ))}
      </div>

      <Dialog open={!!editing} onOpenChange={(open) => { if (!open) setEditing(null); }}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              Edit Equation {editing?.label ? <span className="font-mono">{editing.label}</span> : ""}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label htmlFor="eq-label">Label</Label>
                <Input id="eq-label" value={draft.label ?? ""} onChange={(e) => setDraft((d) => ({ ...d, label: e.target.value }))} placeholder="e.g. (1)" />
              </div>
              <div className="space-y-1">
                <Label>Confidence</Label>
                <Select value={draft.confidence ?? "medium"} onValueChange={(v) => setDraft((d) => ({ ...d, confidence: v as Confidence }))}>
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
              <Label htmlFor="eq-latex">LaTeX</Label>
              <Textarea
                id="eq-latex"
                value={draft.latex ?? ""}
                onChange={(e) => setDraft((d) => ({ ...d, latex: e.target.value }))}
                className="font-mono text-sm"
                rows={3}
              />
            </div>

            <div className="space-y-1">
              <Label htmlFor="eq-plaintext">Plaintext</Label>
              <Input
                id="eq-plaintext"
                value={draft.plaintext ?? ""}
                onChange={(e) => setDraft((d) => ({ ...d, plaintext: e.target.value }))}
                className="font-mono text-sm"
              />
            </div>

            <div className="space-y-1">
              <Label htmlFor="eq-meaning">Meaning</Label>
              <Textarea
                id="eq-meaning"
                value={draft.meaning ?? ""}
                onChange={(e) => setDraft((d) => ({ ...d, meaning: e.target.value }))}
                rows={2}
              />
            </div>

            <div className="space-y-1">
              <Label htmlFor="eq-vars">Variables Involved (comma-separated)</Label>
              <Input
                id="eq-vars"
                value={(draft.variablesInvolved ?? []).join(", ")}
                onChange={(e) =>
                  setDraft((d) => ({
                    ...d,
                    variablesInvolved: e.target.value.split(",").map((s) => s.trim()).filter(Boolean),
                  }))
                }
                className="font-mono text-sm"
              />
            </div>

            <div className="space-y-1">
              <Label htmlFor="eq-source">Source Quote</Label>
              <Textarea
                id="eq-source"
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
