import { useState } from "react";
import { useLocation, useParams } from "wouter";
import { ArrowLeft, ChevronDown, History, Loader2, Save } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import {
  getGetWorkflowQueryKey,
  getListWorkflowVersionsQueryKey,
  useListWorkflowVersions,
  useRestoreWorkflowVersion,
  useUpdateWorkflow,
} from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import { NodeInspector } from "@/features/workflow-canvas/NodeInspector";
import { NodePalette } from "@/features/workflow-canvas/NodePalette";
import { useWorkflowEditor } from "@/features/workflow-canvas/useWorkflowEditor";
import { WorkflowCanvasView } from "@/features/workflow-canvas/WorkflowCanvasView";

export default function WorkflowEditorPage() {
  const { id } = useParams<{ id: string }>();
  const workflowId = id ?? "";
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const editor = useWorkflowEditor(workflowId);
  const versionsQuery = useListWorkflowVersions(workflowId, {
    query: {
      enabled: Boolean(workflowId),
      queryKey: getListWorkflowVersionsQueryKey(workflowId),
    },
  });
  const restoreVersion = useRestoreWorkflowVersion();
  const updateWorkflow = useUpdateWorkflow();
  const [nameDraft, setNameDraft] = useState<string | null>(null);

  if (!workflowId) {
    return null;
  }

  if (editor.isLoading) {
    return (
      <div className="flex h-screen w-full items-center justify-center bg-background">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (editor.isError || !editor.workflow) {
    return (
      <div className="flex h-screen w-full flex-col items-center justify-center gap-3 bg-background">
        <p className="text-sm text-muted-foreground">Workflow not found.</p>
        <Button variant="outline" onClick={() => setLocation("/")} data-testid="button-back-to-list">
          Back to workflows
        </Button>
      </div>
    );
  }

  const workflow = editor.workflow;
  const displayName = nameDraft ?? workflow.name;

  function commitName() {
    const trimmed = nameDraft?.trim();
    if (trimmed && trimmed !== workflow.name) {
      updateWorkflow.mutate(
        { workflowId, data: { name: trimmed } },
        {
          onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: getGetWorkflowQueryKey(workflowId) });
          },
          onError: () => {
            toast({ title: "Could not rename workflow", variant: "destructive" });
          },
        },
      );
    }
    setNameDraft(null);
  }

  async function handleSave() {
    try {
      await editor.save();
      toast({ title: "Workflow saved", description: "Your changes are now the active version." });
      versionsQuery.refetch();
    } catch (error) {
      toast({
        title: "Save failed",
        description: error instanceof Error ? error.message : "Something went wrong.",
        variant: "destructive",
      });
    }
  }

  async function handleRestore(versionId: string, version: number) {
    try {
      await restoreVersion.mutateAsync({ workflowId, versionId });
      await editor.reload();
      toast({ title: `Restored version ${version}` });
    } catch {
      toast({ title: "Restore failed", variant: "destructive" });
    }
  }

  const versions = versionsQuery.data?.versions ?? [];

  return (
    <div className="flex h-screen w-full flex-col bg-background">
      <header className="flex h-14 shrink-0 items-center justify-between border-b bg-card px-3">
        <div className="flex min-w-0 items-center gap-2">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => setLocation("/")}
            data-testid="button-back-to-list"
          >
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <Input
            value={displayName}
            onChange={(event) => setNameDraft(event.target.value)}
            onBlur={commitName}
            onKeyDown={(event) => event.key === "Enter" && event.currentTarget.blur()}
            className="h-8 w-64 border-transparent bg-transparent text-base font-semibold shadow-none hover:border-input focus-visible:ring-1"
            data-testid="input-workflow-name"
          />
          {editor.isDirty && (
            <span className="text-xs text-muted-foreground" data-testid="text-unsaved-indicator">
              Unsaved changes
            </span>
          )}
        </div>

        <div className="flex items-center gap-2">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="sm" className="gap-1.5" data-testid="button-version-history">
                <History className="h-4 w-4" />
                Versions
                <ChevronDown className="h-3.5 w-3.5" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-64">
              <DropdownMenuLabel>Version history</DropdownMenuLabel>
              <DropdownMenuSeparator />
              {versions.length === 0 && (
                <div className="px-2 py-1.5 text-xs text-muted-foreground">No versions yet.</div>
              )}
              {versions.map((version) => (
                <DropdownMenuItem
                  key={version.id}
                  onClick={() => handleRestore(version.id, version.version)}
                  data-testid={`menuitem-version-${version.version}`}
                >
                  <span className="flex-1">Version {version.version}</span>
                  <span className="text-xs text-muted-foreground">
                    {new Date(version.createdAt).toLocaleDateString()}
                  </span>
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
          <Button
            onClick={handleSave}
            disabled={!editor.isDirty || editor.isSaving}
            size="sm"
            className="gap-1.5"
            data-testid="button-save-workflow"
          >
            {editor.isSaving ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Save className="h-4 w-4" />
            )}
            Save
          </Button>
        </div>
      </header>

      <div className="flex flex-1 overflow-hidden">
        <NodePalette />
        <WorkflowCanvasView
          nodes={editor.nodes}
          edges={editor.edges}
          onNodesChange={editor.onNodesChange}
          onEdgesChange={editor.onEdgesChange}
          onConnect={editor.onConnect}
          onAddNode={editor.addNode}
          onNodeClick={editor.selectNode}
          onPaneClick={() => editor.selectNode(null)}
        />
        <NodeInspector
          node={editor.selectedNode}
          onChangeLabel={editor.updateNodeLabel}
          onChangeConfig={editor.updateNodeConfig}
          onDelete={editor.deleteNode}
          onClose={() => editor.selectNode(null)}
        />
      </div>
    </div>
  );
}
