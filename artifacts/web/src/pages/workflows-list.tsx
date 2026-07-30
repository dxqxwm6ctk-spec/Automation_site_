import { useMemo, useState } from "react";
import { Link, useLocation } from "wouter";
import { Calendar, KeyRound, MoreVertical, Plus, Search, Trash2, Variable, Workflow as WorkflowIcon } from "lucide-react";
import { UserMenu } from "@/components/UserMenu";
import { useQueryClient } from "@tanstack/react-query";
import {
  getListWorkflowsQueryKey,
  useCreateWorkflow,
  useDeleteWorkflow,
  useListWorkflows,
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
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";

export default function WorkflowsListPage() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const [search, setSearch] = useState("");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [newName, setNewName] = useState("");

  const listParams = useMemo(
    () => ({ search: search.trim() || undefined, limit: 50 }),
    [search],
  );
  const { data, isLoading } = useListWorkflows(listParams, {
    query: { queryKey: getListWorkflowsQueryKey(listParams) },
  });
  const createWorkflow = useCreateWorkflow();
  const deleteWorkflow = useDeleteWorkflow();

  const workflows = data?.workflows ?? [];

  function handleCreate() {
    const name = newName.trim();
    if (!name) return;
    createWorkflow.mutate(
      { data: { name } },
      {
        onSuccess: (result) => {
          setDialogOpen(false);
          setNewName("");
          setLocation(`/workflows/${result.workflow.id}`);
        },
        onError: () => {
          toast({ title: "Could not create workflow", variant: "destructive" });
        },
      },
    );
  }

  function handleDelete(workflowId: string, name: string) {
    deleteWorkflow.mutate(
      { workflowId },
      {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: getListWorkflowsQueryKey(listParams) });
          toast({ title: `"${name}" deleted` });
        },
        onError: () => {
          toast({ title: "Could not delete workflow", variant: "destructive" });
        },
      },
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b bg-card">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-6 py-5">
          <div>
            <h1 className="text-xl font-semibold text-card-foreground">FlowForge</h1>
            <p className="text-sm text-muted-foreground">Build and manage your automations</p>
          </div>
          <div className="flex items-center gap-2">
            <Link href="/schedules">
              <Button variant="outline" className="gap-1.5" data-testid="button-nav-schedules">
                <Calendar className="h-4 w-4" />
                Schedules
              </Button>
            </Link>
            <Link href="/variables">
              <Button variant="outline" className="gap-1.5" data-testid="button-nav-variables">
                <Variable className="h-4 w-4" />
                Variables
              </Button>
            </Link>
            <Link href="/credentials">
              <Button variant="outline" className="gap-1.5" data-testid="button-nav-credentials">
                <KeyRound className="h-4 w-4" />
                Credentials
              </Button>
            </Link>
            <UserMenu />
          <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
            <DialogTrigger asChild>
              <Button className="gap-1.5" data-testid="button-new-workflow">
                <Plus className="h-4 w-4" />
                New workflow
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Create a new workflow</DialogTitle>
                <DialogDescription>
                  Give your workflow a name. You'll add nodes on the canvas next.
                </DialogDescription>
              </DialogHeader>
              <Input
                autoFocus
                placeholder="e.g. Order confirmation emails"
                value={newName}
                onChange={(event) => setNewName(event.target.value)}
                onKeyDown={(event) => event.key === "Enter" && handleCreate()}
                data-testid="input-new-workflow-name"
              />
              <DialogFooter>
                <Button
                  onClick={handleCreate}
                  disabled={!newName.trim() || createWorkflow.isPending}
                  data-testid="button-confirm-create-workflow"
                >
                  Create
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-5xl px-6 py-6">
        <div className="relative mb-4 max-w-sm">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Search workflows..."
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            className="pl-8"
            data-testid="input-search-workflows"
          />
        </div>

        {isLoading ? (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {[0, 1, 2].map((i) => (
              <div key={i} className="h-28 animate-pulse rounded-lg border bg-card" />
            ))}
          </div>
        ) : workflows.length === 0 ? (
          <div
            className="flex flex-col items-center justify-center gap-3 rounded-lg border border-dashed py-16 text-center"
            data-testid="empty-state-workflows"
          >
            <WorkflowIcon className="h-8 w-8 text-muted-foreground" />
            <p className="text-sm font-medium text-card-foreground">No workflows yet</p>
            <p className="max-w-sm text-sm text-muted-foreground">
              Create your first workflow to start automating.
            </p>
          </div>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {workflows.map((workflow) => (
              <div
                key={workflow.id}
                className="hover-elevate group relative rounded-lg border bg-card p-4"
                data-testid={`card-workflow-${workflow.id}`}
              >
                <Link
                  href={`/workflows/${workflow.id}`}
                  aria-label={workflow.name}
                  className="absolute inset-0"
                />
                <div className="flex items-start justify-between gap-2">
                  <h3 className="truncate text-sm font-semibold text-card-foreground">
                    {workflow.name}
                  </h3>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="relative z-10 h-7 w-7 shrink-0"
                        data-testid={`button-menu-workflow-${workflow.id}`}
                      >
                        <MoreVertical className="h-4 w-4" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem
                        className="text-destructive"
                        onClick={() => handleDelete(workflow.id, workflow.name)}
                        data-testid={`menuitem-delete-workflow-${workflow.id}`}
                      >
                        <Trash2 className="mr-2 h-4 w-4" />
                        Delete
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
                {workflow.description && (
                  <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">
                    {workflow.description}
                  </p>
                )}
                <div className="mt-3 flex flex-wrap items-center gap-1.5">
                  <Badge variant={workflow.isActive ? "default" : "secondary"} className="text-[10px]">
                    {workflow.isActive ? "Active" : "Inactive"}
                  </Badge>
                  {workflow.tags.slice(0, 2).map((tag) => (
                    <Badge key={tag} variant="outline" className="text-[10px]">
                      {tag}
                    </Badge>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
