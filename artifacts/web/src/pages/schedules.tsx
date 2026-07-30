import { useState } from "react";
import { Link } from "wouter";
import { ArrowLeft, Calendar, Clock, Pause, Play, Plus, Trash2 } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import {
  getListSchedulesQueryKey,
  useCreateSchedule,
  useDeleteSchedule,
  useListSchedules,
  useUpdateSchedule,
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

type Schedule = {
  id: string;
  workflowId: string;
  cronExpression: string;
  timezone: string;
  isActive: boolean;
  lastRunAt: string | null;
  nextRunAt: string | null;
  createdAt: string;
  updatedAt: string;
};

/** Common cron presets */
const PRESETS = [
  { label: "Every minute", value: "* * * * *" },
  { label: "Every 5 minutes", value: "*/5 * * * *" },
  { label: "Every 15 minutes", value: "*/15 * * * *" },
  { label: "Every hour", value: "0 * * * *" },
  { label: "Every day at midnight", value: "0 0 * * *" },
  { label: "Every Monday at 9 AM", value: "0 9 * * 1" },
  { label: "Custom", value: "__custom__" },
];

const TIMEZONES = [
  "UTC",
  "America/New_York",
  "America/Chicago",
  "America/Denver",
  "America/Los_Angeles",
  "Europe/London",
  "Europe/Paris",
  "Europe/Berlin",
  "Asia/Tokyo",
  "Asia/Shanghai",
  "Asia/Kolkata",
  "Australia/Sydney",
];

function formatDate(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleString(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  });
}

export default function SchedulesPage() {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: schedulesData, isLoading, isError } = useListSchedules();
  const { data: workflowsData } = useListWorkflows({ limit: 100 });
  const createSchedule = useCreateSchedule();
  const updateSchedule = useUpdateSchedule();
  const deleteSchedule = useDeleteSchedule();

  const schedules = (schedulesData?.schedules ?? []) as Schedule[];
  const workflows = workflowsData?.workflows ?? [];

  // Lookup map: workflowId → name
  const workflowName = (id: string) =>
    workflows.find((w) => w.id === id)?.name ?? id.slice(0, 8) + "…";

  // Workflows that don't have a schedule yet
  const scheduledWorkflowIds = new Set(schedules.map((s) => s.workflowId));
  const unscheduledWorkflows = workflows.filter((w) => !scheduledWorkflowIds.has(w.id));

  // Create dialog
  const [createOpen, setCreateOpen] = useState(false);
  const [selectedWorkflowId, setSelectedWorkflowId] = useState("");
  const [preset, setPreset] = useState(PRESETS[3]!.value);
  const [customCron, setCustomCron] = useState("");
  const [timezone, setTimezone] = useState("UTC");

  const effectiveCron = preset === "__custom__" ? customCron.trim() : preset;

  // Delete dialog
  const [deleteSchedule_, setDeleteSchedule] = useState<Schedule | null>(null);

  function resetCreate() {
    setSelectedWorkflowId("");
    setPreset(PRESETS[3]!.value);
    setCustomCron("");
    setTimezone("UTC");
  }

  function handleCreate() {
    if (!selectedWorkflowId || !effectiveCron) return;
    createSchedule.mutate(
      { data: { workflowId: selectedWorkflowId, cronExpression: effectiveCron, timezone } },
      {
        onSuccess: () => {
          setCreateOpen(false);
          resetCreate();
          queryClient.invalidateQueries({ queryKey: getListSchedulesQueryKey() });
          toast({ title: "Schedule created" });
        },
        onError: (err: unknown) => {
          const msg =
            err && typeof err === "object" && "message" in err
              ? String((err as { message: unknown }).message)
              : "Could not create schedule";
          toast({ title: msg, variant: "destructive" });
        },
      },
    );
  }

  function handleToggle(s: Schedule) {
    updateSchedule.mutate(
      { scheduleId: s.id, data: { isActive: !s.isActive } },
      {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: getListSchedulesQueryKey() });
          toast({ title: s.isActive ? "Schedule paused" : "Schedule resumed" });
        },
        onError: () => {
          toast({ title: "Could not update schedule", variant: "destructive" });
        },
      },
    );
  }

  function handleDelete() {
    if (!deleteSchedule_) return;
    const s = deleteSchedule_;
    setDeleteSchedule(null);
    deleteSchedule.mutate(
      { scheduleId: s.id },
      {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: getListSchedulesQueryKey() });
          toast({ title: "Schedule deleted" });
        },
        onError: () => {
          toast({ title: "Could not delete schedule", variant: "destructive" });
        },
      },
    );
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
              <h1 className="text-xl font-semibold text-card-foreground">Schedules</h1>
              <p className="text-sm text-muted-foreground">
                Run workflows automatically on a cron schedule
              </p>
            </div>
          </div>

          <Dialog open={createOpen} onOpenChange={setCreateOpen}>
            <DialogTrigger asChild>
              <Button
                size="sm"
                className="gap-1.5"
                disabled={unscheduledWorkflows.length === 0}
                title={unscheduledWorkflows.length === 0 ? "All workflows already have a schedule" : undefined}
              >
                <Plus className="h-4 w-4" />
                New schedule
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>New schedule</DialogTitle>
                <DialogDescription>
                  Choose a workflow and a cron expression. The workflow will run automatically
                  at every matching tick.
                </DialogDescription>
              </DialogHeader>
              <div className="grid gap-4 py-2">
                <div className="grid gap-1.5">
                  <Label>Workflow</Label>
                  <Select value={selectedWorkflowId} onValueChange={setSelectedWorkflowId}>
                    <SelectTrigger>
                      <SelectValue placeholder="Select a workflow…" />
                    </SelectTrigger>
                    <SelectContent>
                      {unscheduledWorkflows.map((w) => (
                        <SelectItem key={w.id} value={w.id}>
                          {w.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="grid gap-1.5">
                  <Label>Schedule</Label>
                  <Select value={preset} onValueChange={setPreset}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {PRESETS.map((p) => (
                        <SelectItem key={p.value} value={p.value}>
                          {p.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {preset === "__custom__" && (
                    <Input
                      placeholder="*/30 * * * *"
                      value={customCron}
                      onChange={(e) => setCustomCron(e.target.value)}
                      className="font-mono text-sm"
                    />
                  )}
                  {effectiveCron && (
                    <p className="text-xs text-muted-foreground font-mono">{effectiveCron}</p>
                  )}
                </div>
                <div className="grid gap-1.5">
                  <Label>Timezone</Label>
                  <Select value={timezone} onValueChange={setTimezone}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {TIMEZONES.map((tz) => (
                        <SelectItem key={tz} value={tz}>
                          {tz}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => { setCreateOpen(false); resetCreate(); }}>
                  Cancel
                </Button>
                <Button
                  onClick={handleCreate}
                  disabled={!selectedWorkflowId || !effectiveCron || createSchedule.isPending}
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
          <p className="text-center text-muted-foreground py-16">Loading schedules…</p>
        )}
        {isError && (
          <p className="text-center text-destructive py-16">Failed to load schedules.</p>
        )}
        {!isLoading && !isError && schedules.length === 0 && (
          <div className="flex flex-col items-center gap-3 py-20 text-center">
            <Calendar className="h-10 w-10 text-muted-foreground/40" />
            <p className="font-medium text-muted-foreground">No schedules yet</p>
            <p className="text-sm text-muted-foreground">
              Create a schedule to run a workflow automatically.
            </p>
          </div>
        )}
        {schedules.length > 0 && (
          <div className="divide-y divide-border rounded-lg border bg-card">
            {schedules.map((s) => (
              <div key={s.id} className="flex items-start justify-between gap-4 px-5 py-4">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-semibold text-sm text-card-foreground">
                      {workflowName(s.workflowId)}
                    </span>
                    <Badge variant={s.isActive ? "default" : "secondary"} className="text-xs">
                      {s.isActive ? "Active" : "Paused"}
                    </Badge>
                  </div>
                  <code className="mt-1 block font-mono text-xs text-muted-foreground">
                    {s.cronExpression}
                    {s.timezone !== "UTC" && (
                      <span className="ml-2 not-italic text-muted-foreground/60">({s.timezone})</span>
                    )}
                  </code>
                  <div className="mt-1.5 flex flex-wrap items-center gap-4 text-xs text-muted-foreground">
                    {s.nextRunAt && (
                      <span className="flex items-center gap-1">
                        <Clock className="h-3 w-3" />
                        Next: {formatDate(s.nextRunAt)}
                      </span>
                    )}
                    {s.lastRunAt && (
                      <span>Last: {formatDate(s.lastRunAt)}</span>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8"
                    aria-label={s.isActive ? "Pause" : "Resume"}
                    onClick={() => handleToggle(s)}
                    disabled={updateSchedule.isPending}
                  >
                    {s.isActive ? <Pause className="h-3.5 w-3.5" /> : <Play className="h-3.5 w-3.5" />}
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8 text-destructive hover:text-destructive"
                    aria-label="Delete"
                    onClick={() => setDeleteSchedule(s)}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </main>

      {/* Delete confirmation dialog */}
      <Dialog
        open={Boolean(deleteSchedule_)}
        onOpenChange={(open) => { if (!open) setDeleteSchedule(null); }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete schedule</DialogTitle>
            <DialogDescription>
              Remove the schedule for{" "}
              <strong>{deleteSchedule_ ? workflowName(deleteSchedule_.workflowId) : ""}</strong>?
              The workflow will no longer run automatically.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteSchedule(null)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={handleDelete}
              disabled={deleteSchedule.isPending}
            >
              Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
