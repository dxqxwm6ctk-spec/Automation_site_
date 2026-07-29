import { useState } from "react";
import { Link } from "wouter";
import { ArrowLeft, KeyRound, Plus, Trash2 } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import {
  getListCredentialsQueryKey,
  useCreateCredential,
  useDeleteCredential,
  useListCredentials,
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";

type CredType = "basic" | "bearer";

export default function CredentialsPage() {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data, isLoading, isError } = useListCredentials();
  const createCredential = useCreateCredential();
  const deleteCredential = useDeleteCredential();

  // Create dialog state
  const [dialogOpen, setDialogOpen] = useState(false);
  const [name, setName] = useState("");
  const [credType, setCredType] = useState<CredType>("basic");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [token, setToken] = useState("");

  // Delete confirmation state
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [deleteName, setDeleteName] = useState("");

  const credentials = data?.credentials ?? [];

  function resetForm() {
    setName("");
    setCredType("basic");
    setUsername("");
    setPassword("");
    setToken("");
  }

  function handleCreate() {
    const trimmedName = name.trim();
    if (!trimmedName) return;

    const secretData: Record<string, string> =
      credType === "basic"
        ? { username: username.trim(), password }
        : { token: token.trim() };

    createCredential.mutate(
      { data: { name: trimmedName, credentialType: credType, data: secretData } },
      {
        onSuccess: () => {
          setDialogOpen(false);
          resetForm();
          queryClient.invalidateQueries({ queryKey: getListCredentialsQueryKey() });
          toast({ title: `Credential "${trimmedName}" saved` });
        },
        onError: () => {
          toast({ title: "Could not save credential", variant: "destructive" });
        },
      },
    );
  }

  function handleDeleteConfirm() {
    if (!deleteId) return;
    const id = deleteId;
    const n = deleteName;
    setDeleteId(null);
    setDeleteName("");
    deleteCredential.mutate(
      { credentialId: id },
      {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: getListCredentialsQueryKey() });
          toast({ title: `"${n}" deleted` });
        },
        onError: () => {
          toast({ title: "Could not delete credential", variant: "destructive" });
        },
      },
    );
  }

  const canCreate =
    name.trim() &&
    (credType === "basic" ? username.trim() && password : token.trim());

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b bg-card">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-6 py-5">
          <div className="flex items-center gap-3">
            <Link href="/">
              <Button variant="ghost" size="icon" className="h-8 w-8" aria-label="Back to workflows">
                <ArrowLeft className="h-4 w-4" />
              </Button>
            </Link>
            <div>
              <h1 className="text-xl font-semibold text-card-foreground">Credentials</h1>
              <p className="text-sm text-muted-foreground">Manage saved authentication credentials</p>
            </div>
          </div>

          <Dialog
            open={dialogOpen}
            onOpenChange={(open) => {
              setDialogOpen(open);
              if (!open) resetForm();
            }}
          >
            <DialogTrigger asChild>
              <Button className="gap-1.5" data-testid="button-new-credential">
                <Plus className="h-4 w-4" />
                New credential
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Add a credential</DialogTitle>
                <DialogDescription>
                  Secrets are encrypted at rest and never returned by the API.
                </DialogDescription>
              </DialogHeader>

              <div className="space-y-4">
                <div className="space-y-1.5">
                  <Label htmlFor="cred-name">Name</Label>
                  <Input
                    id="cred-name"
                    autoFocus
                    placeholder="e.g. GitHub Token"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    data-testid="input-credential-name"
                  />
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="cred-type">Type</Label>
                  <Select value={credType} onValueChange={(v) => setCredType(v as CredType)}>
                    <SelectTrigger id="cred-type" data-testid="select-credential-type">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="basic">Basic (username / password)</SelectItem>
                      <SelectItem value="bearer">Bearer token</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                {credType === "basic" && (
                  <>
                    <div className="space-y-1.5">
                      <Label htmlFor="cred-username">Username</Label>
                      <Input
                        id="cred-username"
                        value={username}
                        onChange={(e) => setUsername(e.target.value)}
                        data-testid="input-credential-username"
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label htmlFor="cred-password">Password</Label>
                      <Input
                        id="cred-password"
                        type="password"
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        data-testid="input-credential-password"
                      />
                    </div>
                  </>
                )}

                {credType === "bearer" && (
                  <div className="space-y-1.5">
                    <Label htmlFor="cred-token">Token</Label>
                    <Input
                      id="cred-token"
                      type="password"
                      value={token}
                      onChange={(e) => setToken(e.target.value)}
                      data-testid="input-credential-token"
                    />
                  </div>
                )}
              </div>

              <DialogFooter>
                <Button
                  onClick={handleCreate}
                  disabled={!canCreate || createCredential.isPending}
                  data-testid="button-confirm-create-credential"
                >
                  Save credential
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>
      </header>

      <main className="mx-auto max-w-5xl px-6 py-6">
        {isLoading ? (
          <div className="space-y-2">
            {[0, 1, 2].map((i) => (
              <div key={i} className="h-16 animate-pulse rounded-lg border bg-card" />
            ))}
          </div>
        ) : isError ? (
          <div
            className="flex flex-col items-center justify-center gap-3 rounded-lg border border-dashed py-16 text-center"
            data-testid="error-state-credentials"
          >
            <p className="text-sm text-destructive">Failed to load credentials. Please try again.</p>
          </div>
        ) : credentials.length === 0 ? (
          <div
            className="flex flex-col items-center justify-center gap-3 rounded-lg border border-dashed py-16 text-center"
            data-testid="empty-state-credentials"
          >
            <KeyRound className="h-8 w-8 text-muted-foreground" />
            <p className="text-sm font-medium text-card-foreground">No credentials yet</p>
            <p className="max-w-sm text-sm text-muted-foreground">
              Save a credential to use it in HTTP Request nodes.
            </p>
          </div>
        ) : (
          <div className="space-y-2">
            {credentials.map((cred) => (
              <div
                key={cred.id}
                className="flex items-center justify-between rounded-lg border bg-card px-4 py-3"
                data-testid={`card-credential-${cred.id}`}
              >
                <div className="flex items-center gap-3">
                  <KeyRound className="h-4 w-4 shrink-0 text-muted-foreground" />
                  <div>
                    <p className="text-sm font-medium text-card-foreground">{cred.name}</p>
                    <p className="text-xs text-muted-foreground">
                      Added {new Date(cred.createdAt).toLocaleDateString()}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <Badge variant="secondary" className="text-[10px]">
                    {cred.credentialType}
                  </Badge>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7 text-destructive hover:text-destructive"
                    onClick={() => {
                      setDeleteId(cred.id);
                      setDeleteName(cred.name);
                    }}
                    data-testid={`button-delete-credential-${cred.id}`}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </main>

      {/* Delete confirmation dialog */}
      <Dialog
        open={Boolean(deleteId)}
        onOpenChange={(open) => {
          if (!open) {
            setDeleteId(null);
            setDeleteName("");
          }
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete credential</DialogTitle>
            <DialogDescription>
              Are you sure you want to delete <strong>"{deleteName}"</strong>? Any HTTP Request
              nodes using this credential will stop working.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setDeleteId(null);
                setDeleteName("");
              }}
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={handleDeleteConfirm}
              disabled={deleteCredential.isPending}
              data-testid="button-confirm-delete-credential"
            >
              Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
