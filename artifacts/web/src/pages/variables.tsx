import { useState } from "react";
import { Link } from "wouter";
import {
  ArrowLeft,
  Eye,
  EyeOff,
  KeyRound,
  Pencil,
  Plus,
  Trash2,
} from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import {
  getListVariablesQueryKey,
  useCreateVariable,
  useDeleteVariable,
  useListVariables,
  useUpdateVariable,
} from "@workspace/api-client-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";

type Variable = {
  id: string;
  key: string;
  value: string;
  isSecret: boolean;
  description: string | null;
  createdAt: string;
  updatedAt: string;
};

export default function VariablesPage() {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data, isLoading, isError } = useListVariables();
  const createVariable = useCreateVariable();
  const updateVariable = useUpdateVariable();
  const deleteVariable = useDeleteVariable();

  // Create dialog
  const [createOpen, setCreateOpen] = useState(false);
  const [newKey, setNewKey] = useState("");
  const [newValue, setNewValue] = useState("");
  const [newIsSecret, setNewIsSecret] = useState(false);
  const [newDescription, setNewDescription] = useState("");

  // Edit dialog
  const [editVar, setEditVar] = useState<Variable | null>(null);
  const [editValue, setEditValue] = useState("");
  const [editDescription, setEditDescription] = useState("");

  // Delete dialog
  const [deleteVar, setDeleteVar] = useState<Variable | null>(null);

  // Reveal state for secret variables
  const [revealed, setRevealed] = useState<Set<string>>(new Set());

  const variables = (data?.variables ?? []) as Variable[];

  function resetCreate() {
    setNewKey("");
    setNewValue("");
    setNewIsSecret(false);
    setNewDescription("");
  }

  const keyPattern = /^[A-Za-z_][A-Za-z0-9_]*$/;
  const createValid =
    newKey.trim() && keyPattern.test(newKey.trim());

  function handleCreate() {
    createVariable.mutate(
      {
        data: {
          key: newKey.trim(),
          value: newValue,
          isSecret: newIsSecret,
          description: newDescription.trim() || undefined,
        },
      },
      {
        onSuccess: () => {
          setCreateOpen(false);
          resetCreate();
          queryClient.invalidateQueries({ queryKey: getListVariablesQueryKey() });
          toast({ title: `Variable "${newKey}" created` });
        },
        onError: (err: unknown) => {
          const msg =
            err && typeof err === "object" && "message" in err
              ? String((err as { message: unknown }).message)
              : "Could not create variable";
          toast({ title: msg, variant: "destructive" });
        },
      },
    );
  }

  function openEdit(v: Variable) {
    setEditVar(v);
    setEditValue(v.isSecret ? "" : v.value);
    setEditDescription(v.description ?? "");
  }

  function handleEdit() {
    if (!editVar) return;
    updateVariable.mutate(
      {
        variableId: editVar.id,
        data: {
          value: editValue,
          description: editDescription.trim() || null,
        },
      },
      {
        onSuccess: () => {
          setEditVar(null);
          queryClient.invalidateQueries({ queryKey: getListVariablesQueryKey() });
          toast({ title: `Variable "${editVar.key}" updated` });
        },
        onError: () => {
          toast({ title: "Could not update variable", variant: "destructive" });
        },
      },
    );
  }

  function handleDelete() {
    if (!deleteVar) return;
    const v = deleteVar;
    setDeleteVar(null);
    deleteVariable.mutate(
      { variableId: v.id },
      {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: getListVariablesQueryKey() });
          toast({ title: `"${v.key}" deleted` });
        },
        onError: () => {
          toast({ title: "Could not delete variable", variant: "destructive" });
        },
      },
    );
  }

  function toggleReveal(id: string) {
    setRevealed((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b bg-card">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-6 py-5">
          <div className="flex items-center gap-3">
            <Link href="/">
              <Button variant="ghost" size="icon" className="h-8 w-8" aria-label="Back">
                <ArrowLeft className="h-4 w-4" />
              </Button>
            </Link>
            <div>
              <h1 className="text-xl font-semibold text-card-foreground">Variables</h1>
              <p className="text-sm text-muted-foreground">
                Available as <code className="font-mono text-xs">$vars.&lt;key&gt;</code> in every node
              </p>
            </div>
          </div>

          <Dialog open={createOpen} onOpenChange={setCreateOpen}>
            <DialogTrigger asChild>
              <Button size="sm" className="gap-1.5">
                <Plus className="h-4 w-4" />
                New variable
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>New variable</DialogTitle>
                <DialogDescription>
                  Variables are injected as{" "}
                  <code className="font-mono text-xs">$vars.&lt;key&gt;</code> into every node's
                  execution context.
                </DialogDescription>
              </DialogHeader>
              <div className="grid gap-4 py-2">
                <div className="grid gap-1.5">
                  <Label htmlFor="var-key">Key</Label>
                  <Input
                    id="var-key"
                    placeholder="MY_API_KEY"
                    value={newKey}
                    onChange={(e) => setNewKey(e.target.value)}
                    className="font-mono"
                  />
                  {newKey && !keyPattern.test(newKey) && (
                    <p className="text-xs text-destructive">
                      Must start with a letter or underscore; only letters, digits, and underscores.
                    </p>
                  )}
                </div>
                <div className="grid gap-1.5">
                  <Label htmlFor="var-value">Value</Label>
                  <Input
                    id="var-value"
                    type={newIsSecret ? "password" : "text"}
                    placeholder="value"
                    value={newValue}
                    onChange={(e) => setNewValue(e.target.value)}
                  />
                </div>
                <div className="flex items-center gap-3">
                  <Switch
                    id="var-secret"
                    checked={newIsSecret}
                    onCheckedChange={setNewIsSecret}
                  />
                  <Label htmlFor="var-secret">Secret (value masked in UI)</Label>
                </div>
                <div className="grid gap-1.5">
                  <Label htmlFor="var-desc">Description (optional)</Label>
                  <Input
                    id="var-desc"
                    placeholder="What this variable is for"
                    value={newDescription}
                    onChange={(e) => setNewDescription(e.target.value)}
                  />
                </div>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => { setCreateOpen(false); resetCreate(); }}>
                  Cancel
                </Button>
                <Button
                  onClick={handleCreate}
                  disabled={!createValid || createVariable.isPending}
                >
                  Create
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>
      </header>

      <main className="mx-auto max-w-5xl px-6 py-8">
        {isLoading && (
          <p className="text-center text-muted-foreground py-16">Loading variables…</p>
        )}
        {isError && (
          <p className="text-center text-destructive py-16">Failed to load variables.</p>
        )}
        {!isLoading && !isError && variables.length === 0 && (
          <div className="flex flex-col items-center gap-3 py-20 text-center">
            <KeyRound className="h-10 w-10 text-muted-foreground/40" />
            <p className="font-medium text-muted-foreground">No variables yet</p>
            <p className="text-sm text-muted-foreground">
              Create a variable to share values across all workflows.
            </p>
          </div>
        )}
        {variables.length > 0 && (
          <div className="divide-y divide-border rounded-lg border bg-card">
            {variables.map((v) => (
              <div
                key={v.id}
                className="flex items-start justify-between gap-4 px-5 py-4"
              >
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <code className="font-mono text-sm font-semibold text-card-foreground">
                      {v.key}
                    </code>
                    {v.isSecret && (
                      <Badge variant="secondary" className="text-xs">secret</Badge>
                    )}
                  </div>
                  <div className="mt-1 flex items-center gap-1.5">
                    <span className="font-mono text-xs text-muted-foreground break-all">
                      {v.isSecret && !revealed.has(v.id) ? "•••••••••" : v.value || <em>empty</em>}
                    </span>
                    {v.isSecret && (
                      <button
                        onClick={() => toggleReveal(v.id)}
                        className="text-muted-foreground hover:text-foreground transition-colors"
                        aria-label={revealed.has(v.id) ? "Hide value" : "Reveal value"}
                      >
                        {revealed.has(v.id) ? (
                          <EyeOff className="h-3.5 w-3.5" />
                        ) : (
                          <Eye className="h-3.5 w-3.5" />
                        )}
                      </button>
                    )}
                  </div>
                  {v.description && (
                    <p className="mt-0.5 text-xs text-muted-foreground">{v.description}</p>
                  )}
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8"
                    aria-label="Edit"
                    onClick={() => openEdit(v)}
                  >
                    <Pencil className="h-3.5 w-3.5" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8 text-destructive hover:text-destructive"
                    aria-label="Delete"
                    onClick={() => setDeleteVar(v)}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </main>

      {/* Edit dialog */}
      <Dialog open={Boolean(editVar)} onOpenChange={(open) => { if (!open) setEditVar(null); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit variable</DialogTitle>
            <DialogDescription>
              Update the value for <code className="font-mono text-xs">{editVar?.key}</code>.
              {editVar?.isSecret && " Enter a new value to replace it (leave blank to keep current)."}
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-2">
            <div className="grid gap-1.5">
              <Label htmlFor="edit-value">Value</Label>
              <Input
                id="edit-value"
                type={editVar?.isSecret ? "password" : "text"}
                placeholder={editVar?.isSecret ? "Enter new value (or leave blank to keep current)" : "value"}
                value={editValue}
                onChange={(e) => setEditValue(e.target.value)}
              />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="edit-desc">Description</Label>
              <Input
                id="edit-desc"
                value={editDescription}
                onChange={(e) => setEditDescription(e.target.value)}
                placeholder="What this variable is for"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditVar(null)}>
              Cancel
            </Button>
            <Button onClick={handleEdit} disabled={updateVariable.isPending}>
              Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete confirmation dialog */}
      <Dialog open={Boolean(deleteVar)} onOpenChange={(open) => { if (!open) setDeleteVar(null); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete variable</DialogTitle>
            <DialogDescription>
              Delete <code className="font-mono text-xs">{deleteVar?.key}</code>? Any node using{" "}
              <code className="font-mono text-xs">$vars.{deleteVar?.key}</code> will stop receiving
              this value.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteVar(null)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={handleDelete}
              disabled={deleteVariable.isPending}
            >
              Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
