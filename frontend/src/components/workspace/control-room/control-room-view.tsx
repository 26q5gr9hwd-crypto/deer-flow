"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { ArrowLeft, RefreshCw } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

type ContextSection = {
  section_key: string;
  source?: string;
  char_count?: number;
  approx_tokens?: number;
  included?: boolean;
  preview?: string;
  content?: string;
};

type TimelineEvent = {
  index?: number;
  type: string;
  preview?: string;
  tool_name?: string;
  tool_call_id?: string;
  prompt_tokens?: number;
  completion_tokens?: number;
  total_tokens?: number;
  tool_call_count?: number;
  response_kind?: string;
  args?: Record<string, unknown>;
};

type RuntimeIntrospection = {
  thread_id: string;
  run_id?: string;
  agent_name?: string;
  model_name?: string;
  snapshot_mode?: string;
  compiled_context_signature?: string;
  compiled_context_reused?: boolean | null;
  context_snapshot?: {
    full_compiled_context?: string;
    section_order?: string[];
    sections?: ContextSection[];
    approx_total_tokens?: number;
    approx_total_chars?: number;
    skills_loaded?: boolean;
    source_of_truth?: string[];
  };
  lead?: {
    tool_groups?: string[];
    effective_tools?: string[];
    subagent_enabled?: boolean;
    config_path?: string;
  };
  subagents?: Array<{
    name: string;
    description?: string;
    effective_tools?: string[];
    allowlist?: string[];
    denylist?: string[];
    source_of_truth?: string;
  }>;
  skills?: {
    available_skills?: Array<{
      name: string;
      description?: string;
      category?: string;
      enabled?: boolean;
    }>;
    load_events?: TimelineEvent[];
  };
  memory?: {
    recall_event?: {
      query?: string;
      limit?: number;
      result_count?: number;
      approx_tokens_injected?: number;
      preview?: string;
      trace_available?: boolean | null;
      trace_preview?: string | null;
    };
    retain_events?: Array<Record<string, unknown>>;
  };
  timeline?: TimelineEvent[];
  source_of_truth?: string[];
};

function formatCount(value?: number | null) {
  if (value === null || value === undefined) {
    return "—";
  }

  return new Intl.NumberFormat().format(value);
}

function formatBoolean(value?: boolean | null) {
  if (value === null || value === undefined) {
    return "Unknown";
  }

  return value ? "Yes" : "No";
}

function badgeVariantForEvent(type: string) {
  if (type.includes("completed") || type.includes("loaded")) {
    return "default" as const;
  }

  if (type.includes("started") || type.includes("requested")) {
    return "secondary" as const;
  }

  return "outline" as const;
}

function classifySourcePath(path: string) {
  if (path.includes("vesper_context") || path.includes("vesper_soul")) {
    return "Context assembly";
  }

  if (path.includes("hindsight") || path.includes("memory") || path.includes("/tmp/")) {
    return "Memory and evidence";
  }

  if (path.includes("subagents") || path.includes("tools")) {
    return "Tooling and delegation";
  }

  if (path.includes("config") || path.endsWith("config.yaml") || path.includes("SOURCE_OF_TRUTH")) {
    return "Configuration";
  }

  return "Other runtime files";
}

function MetricCard({
  label,
  value,
  helper,
}: {
  label: string;
  value: string;
  helper: string;
}) {
  return (
    <Card className="gap-3">
      <CardHeader className="space-y-1 px-5 pt-5 pb-0">
        <CardDescription>{label}</CardDescription>
        <CardTitle className="text-2xl">{value}</CardTitle>
      </CardHeader>
      <CardContent className="px-5 pt-0 text-sm text-muted-foreground">
        {helper}
      </CardContent>
    </Card>
  );
}

export function ControlRoomView({ threadId }: { threadId: string }) {
  const [data, setData] = useState<RuntimeIntrospection | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const loadData = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const response = await fetch(`/api/runtime/threads/${threadId}/introspection`, {
        cache: "no-store",
      });

      if (!response.ok) {
        const details = await response.text();
        throw new Error(details || `Request failed with status ${response.status}`);
      }

      const nextData = (await response.json()) as RuntimeIntrospection;
      setData(nextData);
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : "Unknown error");
    } finally {
      setLoading(false);
    }
  }, [threadId]);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  const contextSnapshot = data?.context_snapshot;
  const sections = contextSnapshot?.sections ?? [];
  const lead = data?.lead;
  const subagents = data?.subagents ?? [];
  const loadEvents = data?.skills?.load_events ?? [];
  const recallEvent = data?.memory?.recall_event;
  const retainEvents = data?.memory?.retain_events ?? [];
  const timeline = data?.timeline ?? [];

  const loadedSkillNames = useMemo(() => {
    return Array.from(
      new Set(
        loadEvents
          .map((event) => {
            const skillName = event.args?.skill_name;
            return typeof skillName === "string" ? skillName : null;
          })
          .filter((value): value is string => Boolean(value)),
      ),
    );
  }, [loadEvents]);

  const sourcePaths = useMemo(() => {
    return Array.from(
      new Set(
        [
          ...(data?.source_of_truth ?? []),
          ...(contextSnapshot?.source_of_truth ?? []),
          lead?.config_path,
          ...subagents.map((subagent) => subagent.source_of_truth),
        ].filter((value): value is string => Boolean(value)),
      ),
    );
  }, [contextSnapshot?.source_of_truth, data?.source_of_truth, lead?.config_path, subagents]);

  const sourceGroups = useMemo(() => {
    const grouped = new Map<string, string[]>();

    for (const path of sourcePaths) {
      const group = classifySourcePath(path);
      grouped.set(group, [...(grouped.get(group) ?? []), path]);
    }

    return Array.from(grouped.entries());
  }, [sourcePaths]);

  if (loading) {
    return (
      <div className="flex h-full min-h-0 flex-col px-6 py-6">
        <div className="mx-auto flex w-full max-w-7xl flex-1 items-center justify-center">
          <Card className="w-full max-w-2xl">
            <CardHeader>
              <CardTitle>Loading Control Room v1</CardTitle>
              <CardDescription>
                Pulling the latest runtime snapshot for thread {threadId}.
              </CardDescription>
            </CardHeader>
          </Card>
        </div>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="flex h-full min-h-0 flex-col px-6 py-6">
        <div className="mx-auto flex w-full max-w-3xl flex-1 items-center justify-center">
          <Card className="w-full border-destructive/40">
            <CardHeader>
              <CardTitle>Control Room could not load</CardTitle>
              <CardDescription>
                The introspection surface did not return a usable payload for this thread.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4 text-sm text-muted-foreground">
              <p className="rounded-lg border bg-muted/40 p-4 font-mono text-xs leading-6 break-words">
                {error ?? "No data returned."}
              </p>
              <div className="flex flex-wrap gap-3">
                <Button asChild variant="outline">
                  <Link href={`/workspace/chats/${threadId}`}>
                    <ArrowLeft className="size-4" />
                    Back to chat
                  </Link>
                </Button>
                <Button onClick={() => void loadData()}>
                  <RefreshCw className="size-4" />
                  Retry
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-full min-h-0 flex-col px-6 py-6">
      <div className="mx-auto flex w-full max-w-7xl min-h-0 flex-1 flex-col gap-6">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div className="space-y-3">
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant="outline">Control Room v1</Badge>
              <Badge variant="secondary">Thread {data.thread_id}</Badge>
              {data.run_id ? <Badge variant="outline">Run {data.run_id}</Badge> : null}
              {data.snapshot_mode ? <Badge variant="outline">{data.snapshot_mode}</Badge> : null}
            </div>
            <div>
              <h1 className="text-3xl font-semibold tracking-tight">VESPER runtime inspector</h1>
              <p className="mt-2 max-w-4xl text-sm leading-6 text-muted-foreground">
                A thin control room on top of the OBS-2 introspection surface. It shows what this run saw,
                what tools and subagents were active, how memory showed up, what happened in sequence,
                and which runtime files currently define the behavior.
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <Button asChild variant="outline">
              <Link href={`/workspace/chats/${threadId}`}>
                <ArrowLeft className="size-4" />
                Back to chat
              </Link>
            </Button>
            <Button variant="outline" onClick={() => void loadData()}>
              <RefreshCw className="size-4" />
              Refresh
            </Button>
            <Button asChild>
              <a
                href={`/api/runtime/threads/${threadId}/introspection`}
                target="_blank"
                rel="noreferrer"
              >
                Raw JSON
              </a>
            </Button>
          </div>
        </div>

        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <MetricCard
            label="Compiled context"
            value={`${formatCount(contextSnapshot?.approx_total_tokens)} tokens`}
            helper={`${formatCount(contextSnapshot?.sections?.length)} sections from the current runtime snapshot.`}
          />
          <MetricCard
            label="Lead tools"
            value={formatCount(lead?.effective_tools?.length)}
            helper={`${formatCount(subagents.length)} subagents mapped from the live registry.`}
          />
          <MetricCard
            label="Memory recall"
            value={formatCount(recallEvent?.result_count)}
            helper={`${formatCount(recallEvent?.approx_tokens_injected)} tokens injected into the prompt.`}
          />
          <MetricCard
            label="Timeline events"
            value={formatCount(timeline.length)}
            helper={`${formatCount(loadEvents.length)} skill load events and ${formatCount(sourcePaths.length)} source paths.`}
          />
        </div>

        <Card className="border-dashed bg-muted/20">
          <CardContent className="flex flex-wrap items-center gap-3 px-5 py-4 text-sm text-muted-foreground">
            <span>
              <strong className="text-foreground">Agent</strong>: {data.agent_name ?? "Unknown"}
            </span>
            <span>
              <strong className="text-foreground">Model</strong>: {data.model_name ?? "Unknown"}
            </span>
            <span>
              <strong className="text-foreground">Context reused</strong>: {formatBoolean(data.compiled_context_reused)}
            </span>
            <span>
              <strong className="text-foreground">Subagent delegation</strong>: {formatBoolean(lead?.subagent_enabled)}
            </span>
            <span>
              <strong className="text-foreground">Recall trace available</strong>: {formatBoolean(recallEvent?.trace_available)}
            </span>
          </CardContent>
        </Card>

        <div className="min-h-0 flex-1 overflow-y-auto pr-1">
          <Tabs defaultValue="context" className="gap-6">
            <TabsList variant="line" className="flex w-full flex-wrap justify-start">
              <TabsTrigger value="context">Context inspector</TabsTrigger>
              <TabsTrigger value="tools">Tools + subagents</TabsTrigger>
              <TabsTrigger value="memory">Memory + recall</TabsTrigger>
              <TabsTrigger value="timeline">Run timeline</TabsTrigger>
              <TabsTrigger value="sources">Source map</TabsTrigger>
            </TabsList>

            <TabsContent value="context" className="space-y-4">
              <Card>
                <CardHeader>
                  <CardTitle>Context snapshot</CardTitle>
                  <CardDescription>
                    Section-by-section view of what VESPER saw for this run.
                  </CardDescription>
                </CardHeader>
                <CardContent className="grid gap-4 xl:grid-cols-2">
                  {sections.map((section) => (
                    <Card key={section.section_key} className="gap-4 bg-muted/20">
                      <CardHeader className="space-y-2">
                        <div className="flex flex-wrap items-center gap-2">
                          <CardTitle className="text-lg capitalize">
                            {section.section_key.replace(/_/g, " ")}
                          </CardTitle>
                          <Badge variant={section.included ? "default" : "outline"}>
                            {section.included ? "Included" : "Skipped"}
                          </Badge>
                          <Badge variant="outline">{formatCount(section.approx_tokens)} tokens</Badge>
                        </div>
                        <CardDescription>{section.source ?? "Unknown source"}</CardDescription>
                      </CardHeader>
                      <CardContent className="space-y-3 text-sm text-muted-foreground">
                        <p>{section.preview ?? "No preview available."}</p>
                        <details className="rounded-lg border bg-background p-3">
                          <summary className="cursor-pointer text-sm font-medium text-foreground">
                            Show full section
                          </summary>
                          <pre className="mt-3 whitespace-pre-wrap break-words text-xs leading-6 text-muted-foreground">
                            {section.content ?? "No full section content available."}
                          </pre>
                        </details>
                      </CardContent>
                    </Card>
                  ))}
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>Full compiled context</CardTitle>
                  <CardDescription>
                    The exact compiled string currently exposed by the OBS-2 surface.
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <pre className="max-h-[32rem] overflow-auto rounded-xl border bg-background p-4 whitespace-pre-wrap break-words text-xs leading-6 text-muted-foreground">
                    {contextSnapshot?.full_compiled_context ?? "No compiled context available."}
                  </pre>
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="tools" className="space-y-4">
              <Card>
                <CardHeader>
                  <CardTitle>Lead agent capability map</CardTitle>
                  <CardDescription>
                    Effective tool surface after runtime filtering, not just theoretical availability.
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="flex flex-wrap gap-2">
                    {(lead?.tool_groups ?? []).map((toolGroup) => (
                      <Badge key={toolGroup} variant="secondary">
                        {toolGroup}
                      </Badge>
                    ))}
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {(lead?.effective_tools ?? []).map((toolName) => (
                      <Badge key={toolName} variant="outline">
                        {toolName}
                      </Badge>
                    ))}
                  </div>
                  <p className="text-sm text-muted-foreground">
                    Runtime config path: <span className="font-mono text-foreground">{lead?.config_path ?? "Unknown"}</span>
                  </p>
                </CardContent>
              </Card>

              <div className="grid gap-4 xl:grid-cols-2">
                {subagents.map((subagent) => (
                  <Card key={subagent.name} className="gap-4">
                    <CardHeader>
                      <div className="flex flex-wrap items-center gap-2">
                        <CardTitle className="text-lg">{subagent.name}</CardTitle>
                        <Badge variant="outline">{formatCount(subagent.effective_tools?.length)} tools</Badge>
                      </div>
                      <CardDescription>
                        {subagent.description ?? "No description available."}
                      </CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-4 text-sm text-muted-foreground">
                      <div className="flex flex-wrap gap-2">
                        {(subagent.effective_tools ?? []).map((toolName) => (
                          <Badge key={`${subagent.name}-${toolName}`} variant="outline">
                            {toolName}
                          </Badge>
                        ))}
                      </div>
                      <div className="grid gap-3 md:grid-cols-2">
                        <div>
                          <div className="mb-2 text-xs font-medium uppercase tracking-wide text-foreground">
                            Allowlist
                          </div>
                          <div className="flex flex-wrap gap-2">
                            {(subagent.allowlist ?? []).length > 0 ? (
                              (subagent.allowlist ?? []).map((toolName) => (
                                <Badge key={`${subagent.name}-allow-${toolName}`} variant="secondary">
                                  {toolName}
                                </Badge>
                              ))
                            ) : (
                              <span>Uses default agent-role filtering.</span>
                            )}
                          </div>
                        </div>
                        <div>
                          <div className="mb-2 text-xs font-medium uppercase tracking-wide text-foreground">
                            Denylist
                          </div>
                          <div className="flex flex-wrap gap-2">
                            {(subagent.denylist ?? []).length > 0 ? (
                              (subagent.denylist ?? []).map((toolName) => (
                                <Badge key={`${subagent.name}-deny-${toolName}`} variant="outline">
                                  {toolName}
                                </Badge>
                              ))
                            ) : (
                              <span>No denylist.</span>
                            )}
                          </div>
                        </div>
                      </div>
                      <p>
                        Source of truth: <span className="font-mono text-foreground">{subagent.source_of_truth ?? "Unknown"}</span>
                      </p>
                    </CardContent>
                  </Card>
                ))}
              </div>
            </TabsContent>

            <TabsContent value="memory" className="space-y-4">
              <Card>
                <CardHeader>
                  <CardTitle>Recall visibility</CardTitle>
                  <CardDescription>
                    What the Hindsight bridge surfaced for this run and how much prompt space it consumed.
                  </CardDescription>
                </CardHeader>
                <CardContent className="grid gap-4 xl:grid-cols-2">
                  <Card className="gap-4 bg-muted/20">
                    <CardHeader>
                      <div className="flex flex-wrap items-center gap-2">
                        <CardTitle className="text-lg">Recall event</CardTitle>
                        <Badge variant="outline">{formatCount(recallEvent?.result_count)} results</Badge>
                        <Badge variant="outline">
                          {formatCount(recallEvent?.approx_tokens_injected)} prompt tokens
                        </Badge>
                      </div>
                      <CardDescription>
                        Query: {recallEvent?.query ?? "No query surfaced."}
                      </CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-3 text-sm text-muted-foreground">
                      <p>{recallEvent?.preview ?? "No recall preview returned."}</p>
                      <p>
                        Trace available: <strong className="text-foreground">{formatBoolean(recallEvent?.trace_available)}</strong>
                      </p>
                      {recallEvent?.trace_preview ? (
                        <details className="rounded-lg border bg-background p-3">
                          <summary className="cursor-pointer text-sm font-medium text-foreground">
                            Show trace preview
                          </summary>
                          <pre className="mt-3 whitespace-pre-wrap break-words text-xs leading-6 text-muted-foreground">
                            {recallEvent.trace_preview}
                          </pre>
                        </details>
                      ) : null}
                    </CardContent>
                  </Card>

                  <Card className="gap-4 bg-muted/20">
                    <CardHeader>
                      <CardTitle className="text-lg">Skill load evidence</CardTitle>
                      <CardDescription>
                        Proof that runtime knowledge was loaded on demand instead of pre-bloating the prompt.
                      </CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-4 text-sm text-muted-foreground">
                      <div className="flex flex-wrap gap-2">
                        {loadedSkillNames.length > 0 ? (
                          loadedSkillNames.map((skillName) => (
                            <Badge key={skillName} variant="secondary">
                              {skillName}
                            </Badge>
                          ))
                        ) : (
                          <span>No skill body was loaded on this run.</span>
                        )}
                      </div>
                      <div className="space-y-3">
                        {loadEvents.map((event, index) => (
                          <div key={`${event.type}-${index}`} className="rounded-lg border bg-background p-3">
                            <div className="flex flex-wrap items-center gap-2">
                              <Badge variant={badgeVariantForEvent(event.type)}>{event.type}</Badge>
                              {event.tool_name ? <Badge variant="outline">{event.tool_name}</Badge> : null}
                            </div>
                            <p className="mt-2 break-words">{event.preview ?? "No preview available."}</p>
                          </div>
                        ))}
                      </div>
                    </CardContent>
                  </Card>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>Retain-event proof</CardTitle>
                  <CardDescription>
                    Current retain evidence exposed by the runtime. Empty here means the run did not surface retain proof yet.
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-3 text-sm text-muted-foreground">
                  {retainEvents.length === 0 ? (
                    <p className="rounded-lg border bg-muted/20 p-4">
                      No retain events were surfaced for this run. This is an explicit runtime gap, not hidden behavior.
                    </p>
                  ) : (
                    retainEvents.map((event, index) => (
                      <pre
                        key={index}
                        className="overflow-auto rounded-lg border bg-background p-4 text-xs leading-6"
                      >
                        {JSON.stringify(event, null, 2)}
                      </pre>
                    ))
                  )}
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="timeline" className="space-y-4">
              <Card>
                <CardHeader>
                  <CardTitle>Chronological runtime trace</CardTitle>
                  <CardDescription>
                    A practical sequence view for user turn, model calls, skill loads, and tool activity.
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  {timeline.map((event, index) => (
                    <div key={`${event.type}-${index}`} className="rounded-xl border bg-muted/20 p-4">
                      <div className="flex flex-wrap items-center gap-2">
                        <Badge variant={badgeVariantForEvent(event.type)}>{event.type}</Badge>
                        {event.tool_name ? <Badge variant="outline">{event.tool_name}</Badge> : null}
                        {event.response_kind ? <Badge variant="outline">{event.response_kind}</Badge> : null}
                        {event.prompt_tokens !== undefined ? (
                          <Badge variant="outline">{formatCount(event.prompt_tokens)} prompt</Badge>
                        ) : null}
                        {event.completion_tokens !== undefined ? (
                          <Badge variant="outline">{formatCount(event.completion_tokens)} completion</Badge>
                        ) : null}
                      </div>
                      <div className="mt-3 grid gap-3 lg:grid-cols-[120px_minmax(0,1fr)]">
                        <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                          Event {index + 1}
                        </div>
                        <div className="space-y-2 text-sm text-muted-foreground">
                          <p>{event.preview ?? "No preview available."}</p>
                          {event.args ? (
                            <details className="rounded-lg border bg-background p-3">
                              <summary className="cursor-pointer text-sm font-medium text-foreground">
                                Show event payload
                              </summary>
                              <pre className="mt-3 whitespace-pre-wrap break-words text-xs leading-6 text-muted-foreground">
                                {JSON.stringify(event.args, null, 2)}
                              </pre>
                            </details>
                          ) : null}
                        </div>
                      </div>
                    </div>
                  ))}
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="sources" className="space-y-4">
              <Card>
                <CardHeader>
                  <CardTitle>Runtime source-of-truth map</CardTitle>
                  <CardDescription>
                    Practical file map for the code paths this control room currently trusts.
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  {sourceGroups.map(([groupName, paths]) => (
                    <Card key={groupName} className="gap-4 bg-muted/20">
                      <CardHeader>
                        <CardTitle className="text-lg">{groupName}</CardTitle>
                        <CardDescription>
                          {paths.length} file{paths.length === 1 ? "" : "s"} contributing to this view.
                        </CardDescription>
                      </CardHeader>
                      <CardContent className="space-y-3 text-sm text-muted-foreground">
                        {paths.map((path) => (
                          <div
                            key={path}
                            className="rounded-lg border bg-background px-3 py-2 font-mono text-xs leading-6 text-foreground"
                          >
                            {path}
                          </div>
                        ))}
                      </CardContent>
                    </Card>
                  ))}
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>Available skills inventory</CardTitle>
                  <CardDescription>
                    High-level view of the skill catalog exposed by the current runtime.
                  </CardDescription>
                </CardHeader>
                <CardContent className="grid gap-3 xl:grid-cols-2">
                  {(data.skills?.available_skills ?? []).map((skill) => (
                    <div key={skill.name} className="rounded-xl border bg-muted/20 p-4">
                      <div className="flex flex-wrap items-center gap-2">
                        <div className="font-medium text-foreground">{skill.name}</div>
                        <Badge variant={skill.enabled ? "default" : "outline"}>
                          {skill.enabled ? "Enabled" : "Disabled"}
                        </Badge>
                        {skill.category ? <Badge variant="outline">{skill.category}</Badge> : null}
                      </div>
                      <p className="mt-2 text-sm leading-6 text-muted-foreground">
                        {skill.description ?? "No description available."}
                      </p>
                    </div>
                  ))}
                </CardContent>
              </Card>
            </TabsContent>
          </Tabs>
        </div>
      </div>
    </div>
  );
}
