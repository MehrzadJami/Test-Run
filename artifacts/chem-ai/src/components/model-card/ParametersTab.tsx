import { useState, useRef } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  usePatchParameter,
  useResetParameter,
  getGetModelCardByProjectQueryKey,
} from "@workspace/api-client-react";
import type { Parameter, PatchParameterInput } from "@workspace/api-client-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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
  parameters: Parameter[];
}

export function ParametersTab({ projectId, parameters }: Props) {
  const qc = useQueryClient();
  const invalidate = () =>
    qc.invalidateQueries({ queryKey: getGetModelCardByProjectQueryKey(projectId) });

  const patch = usePatchParameter({ mutation: { onSuccess: invalidate } });
  const reset = useResetParameter({ mutation: { onSuccess: invalidate } });

  const [editing, setEditing] = useState<Parameter | null>(null);
  const [draft, setDraft] = useState<PatchParameterInput>({});
  const formRef = useRef<HTMLFormElement>(null);

  function openEdit(p: Parameter) {
    setEditing(p);
    setDraft({
      symbol: p.symbol,
      name: p.name,
      value: p.value,
      unit: p.unit,
      confidence: p.confidence,
      sourceQuote: p.sourceQuote,
    });
  }

  function handleSave() {
    if (!editing) return;
    patch.mutate({ id: editing.id, data: draft });
    setEditing(null);
  }

  return (
    <>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Symbol</TableHead>
            <TableHead>Name</TableHead>
            <TableHead>Value</TableHead>
            <TableHead>Unit</TableHead>
            <TableHead>Confidence</TableHead>
            <TableHead className="hidden md:table-cell">Source Quote</TableHead>
            <TableHead className="w-20 text-right">Edit</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {parameters.map((p) => (
            <TableRow key={p.id} className={p.editedByUser ? "bg-amber-50/40 dark:bg-amber-950/10" : ""}>
              <TableCell className="font-mono font-bold text-primary">
                {p.symbol}
                {p.editedByUser && (
                  <span className="ml-1 text-[9px] text-amber-600 font-normal uppercase tracking-wide">(edited)</span>
                )}
              </TableCell>
              <TableCell className="text-sm">{p.name || "—"}</TableCell>
              <TableCell className="font-mono text-sm">
                {p.value ?? <span className="text-destructive italic text-xs">missing</span>}
              </TableCell>
              <TableCell>
                <span className={`font-mono text-xs rounded px-2 py-1 ${p.unit ? "bg-muted/50" : "bg-destructive/10 text-destructive"}`}>
                  {p.unit || "missing"}
                </span>
              </TableCell>
              <TableCell>
                <ConfidenceBadge value={p.confidence} />
              </TableCell>
              <TableCell className="text-xs text-muted-foreground italic hidden md:table-cell max-w-[200px] truncate">
                {p.sourceQuote ? `"${p.sourceQuote}"` : "—"}
              </TableCell>
              <TableCell className="text-right">
                <div className="flex gap-1 justify-end">
                  <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => openEdit(p)}>
                    <Pencil className="h-3.5 w-3.5" />
                  </Button>
                  {p.editedByUser && (
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7 text-amber-600"
                      disabled={reset.isPending}
                      onClick={() => reset.mutate({ id: p.id })}
                      title="Reset to original AI extraction"
                    >
                      {reset.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RotateCcw className="h-3.5 w-3.5" />}
                    </Button>
                  )}
                </div>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>

      <Dialog open={!!editing} onOpenChange={(open) => { if (!open) setEditing(null); }}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Edit Parameter — <span className="font-mono">{editing?.symbol}</span></DialogTitle>
          </DialogHeader>
          <form ref={formRef} onSubmit={(e) => { e.preventDefault(); handleSave(); }} className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label htmlFor="p-symbol">Symbol</Label>
                <Input id="p-symbol" value={draft.symbol ?? ""} onChange={(e) => setDraft((d) => ({ ...d, symbol: e.target.value }))} />
              </div>
              <div className="space-y-1">
                <Label htmlFor="p-unit">Unit</Label>
                <Input id="p-unit" value={draft.unit ?? ""} onChange={(e) => setDraft((d) => ({ ...d, unit: e.target.value }))} />
              </div>
            </div>
            <div className="space-y-1">
              <Label htmlFor="p-name">Name</Label>
              <Input id="p-name" value={draft.name ?? ""} onChange={(e) => setDraft((d) => ({ ...d, name: e.target.value }))} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label htmlFor="p-value">Value</Label>
                <Input
                  id="p-value"
                  type="number"
                  step="any"
                  value={draft.value ?? ""}
                  onChange={(e) => setDraft((d) => ({ ...d, value: parseFloat(e.target.value) }))}
                />
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
              <Label htmlFor="p-source">Source Quote</Label>
              <Input id="p-source" value={draft.sourceQuote ?? ""} onChange={(e) => setDraft((d) => ({ ...d, sourceQuote: e.target.value }))} />
            </div>
          </form>
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
