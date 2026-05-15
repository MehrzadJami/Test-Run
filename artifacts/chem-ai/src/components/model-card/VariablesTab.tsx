import { useState, useRef, useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  usePatchVariable,
  useResetVariable,
  getGetModelCardByProjectQueryKey,
} from "@workspace/api-client-react";
import type { Variable, PatchVariableInput } from "@workspace/api-client-react";
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
type VariableRole = "state" | "input" | "output" | "parameter" | "control";

function ConfidenceBadge({ value }: { value?: Confidence | string | null }) {
  if (!value) return null;
  return (
    <Badge
      variant={
        value === "high" ? "default" : value === "medium" ? "secondary" : "destructive"
      }
      className="text-[10px] uppercase ml-2"
    >
      {value}
    </Badge>
  );
}

interface Props {
  projectId: number;
  variables: Variable[];
}

export function VariablesTab({ projectId, variables }: Props) {
  const qc = useQueryClient();
  const invalidate = () =>
    qc.invalidateQueries({ queryKey: getGetModelCardByProjectQueryKey(projectId) });

  const patch = usePatchVariable({
    mutation: { onSuccess: invalidate },
  });
  const reset = useResetVariable({
    mutation: { onSuccess: invalidate },
  });

  const [editing, setEditing] = useState<Variable | null>(null);
  const [draft, setDraft] = useState<PatchVariableInput>({});
  const formRef = useRef<HTMLFormElement>(null);

  useEffect(() => {
    return () => {
      setEditing(null);
      setDraft({});
      patch.reset();
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function openEdit(v: Variable) {
    setEditing(v);
    setDraft({
      symbol: v.symbol,
      name: v.name,
      meaning: v.meaning,
      unit: v.unit,
      role: v.role,
      confidence: v.confidence,
      sourceQuote: v.sourceQuote,
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
            <TableHead>Name / Meaning</TableHead>
            <TableHead>Unit</TableHead>
            <TableHead>Role</TableHead>
            <TableHead>Confidence</TableHead>
            <TableHead className="hidden md:table-cell">Source Quote</TableHead>
            <TableHead className="w-20 text-right">Edit</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {variables.map((v) => (
            <TableRow key={v.id} className={v.editedByUser ? "bg-amber-50/40 dark:bg-amber-950/10" : ""}>
              <TableCell className="font-mono font-bold text-primary">
                {v.symbol}
                {v.editedByUser && (
                  <span className="ml-1 text-[9px] text-amber-600 font-normal uppercase tracking-wide">(edited)</span>
                )}
              </TableCell>
              <TableCell>
                <div className="font-medium text-sm">{v.name}</div>
                {v.meaning && v.meaning !== v.name && (
                  <div className="text-xs text-muted-foreground mt-0.5">{v.meaning}</div>
                )}
              </TableCell>
              <TableCell>
                <span className={`font-mono text-xs rounded px-2 py-1 ${v.unit ? "bg-muted/50" : "bg-destructive/10 text-destructive"}`}>
                  {v.unit || "missing"}
                </span>
              </TableCell>
              <TableCell>
                <Badge variant={v.role === "state" ? "default" : "outline"} className="text-[10px] uppercase">
                  {v.role}
                </Badge>
              </TableCell>
              <TableCell>
                <ConfidenceBadge value={v.confidence} />
              </TableCell>
              <TableCell className="text-xs text-muted-foreground italic hidden md:table-cell max-w-[200px] truncate">
                {v.sourceQuote ? `"${v.sourceQuote}"` : "—"}
              </TableCell>
              <TableCell className="text-right">
                <div className="flex gap-1 justify-end">
                  <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => openEdit(v)}>
                    <Pencil className="h-3.5 w-3.5" />
                  </Button>
                  {v.editedByUser && (
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7 text-amber-600"
                      disabled={reset.isPending}
                      onClick={() => reset.mutate({ id: v.id })}
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
            <DialogTitle>Edit Variable — <span className="font-mono">{editing?.symbol}</span></DialogTitle>
          </DialogHeader>
          <form ref={formRef} onSubmit={(e) => { e.preventDefault(); handleSave(); }} className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label htmlFor="v-symbol">Symbol</Label>
                <Input id="v-symbol" value={draft.symbol ?? ""} onChange={(e) => setDraft((d) => ({ ...d, symbol: e.target.value }))} />
              </div>
              <div className="space-y-1">
                <Label htmlFor="v-unit">Unit</Label>
                <Input id="v-unit" value={draft.unit ?? ""} onChange={(e) => setDraft((d) => ({ ...d, unit: e.target.value }))} />
              </div>
            </div>
            <div className="space-y-1">
              <Label htmlFor="v-name">Name</Label>
              <Input id="v-name" value={draft.name ?? ""} onChange={(e) => setDraft((d) => ({ ...d, name: e.target.value }))} />
            </div>
            <div className="space-y-1">
              <Label htmlFor="v-meaning">Meaning</Label>
              <Input id="v-meaning" value={draft.meaning ?? ""} onChange={(e) => setDraft((d) => ({ ...d, meaning: e.target.value }))} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label>Role</Label>
                <Select value={draft.role ?? "state"} onValueChange={(v) => setDraft((d) => ({ ...d, role: v as VariableRole }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="state">state</SelectItem>
                    <SelectItem value="input">input</SelectItem>
                    <SelectItem value="output">output</SelectItem>
                    <SelectItem value="parameter">parameter</SelectItem>
                    <SelectItem value="control">control</SelectItem>
                  </SelectContent>
                </Select>
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
              <Label htmlFor="v-source">Source Quote</Label>
              <Input id="v-source" value={draft.sourceQuote ?? ""} onChange={(e) => setDraft((d) => ({ ...d, sourceQuote: e.target.value }))} />
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
