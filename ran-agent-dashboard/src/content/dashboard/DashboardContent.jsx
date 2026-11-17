import React from "react";
import {
  CartesianGrid,
  Line,
  LineChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import {
  DataComponent,
  DataTable,
  ExecutiveSummary,
  Filters,
  RichNarrative,
  SectionHeader,
  SortableItem,
  SortableRegion,
  useDashboardTabs,
  useDataApp,
} from "../../data-app-public.jsx";
import "./dashboard.css";

const statusLabels = {
  observing: "Observing",
  succeeded: "Succeeded",
  safe_timeout: "Safe timeout",
  rolled_back: "Rolled back",
  rejected: "Rejected safely",
};

const statusTones = {
  observing: "active",
  succeeded: "positive",
  safe_timeout: "warning",
  rolled_back: "negative",
  rejected: "neutral",
};

function percentile(rows, field, quantile) {
  const values = rows.map((row) => Number(row[field])).filter(Number.isFinite).sort((a, b) => a - b);
  if (!values.length) return null;
  return values[Math.min(values.length - 1, Math.ceil((values.length - 1) * quantile))];
}

function formatMs(value) {
  return Number.isFinite(value) ? `${Math.round(value)} ms` : "—";
}

function Metric({ id, title, value, detail, tone = "default", rows }) {
  return <DataComponent id={id} queryId="tasks" kind="custom" variant="card"
    title={title} description={detail} sourceRows={rows} displayRows={rows}
    className="ran-metric-card">
    <div className="ran-metric-value" data-tone={tone}>{value}</div>
    <p>{detail}</p>
  </DataComponent>;
}

function StatusChip({ status }) {
  return <span className="status-chip" data-tone={statusTones[status] ?? "neutral"}>
    <span aria-hidden="true" />{statusLabels[status] ?? status}
  </span>;
}

function RuntimeRail({ task, replayMs }) {
  const budget = task?.slaMs ?? 1000;
  const elapsed = Math.min(replayMs, task?.totalLatencyMs ?? 0);
  const modelEnd = Math.min(Math.max(0, replayMs - 140), task?.modelLatencyMs ?? 0);
  const remaining = Math.max(0, budget - elapsed);
  return <div className="runtime-rail">
    <div className="runtime-rail-header">
      <div>
        <span className="eyebrow">SYNTHETIC REPLAY · CONTROL PATH</span>
        <strong>{task?.taskId ?? "No matching run"} · {task?.scenario ?? "No scenario"}</strong>
      </div>
      {task && <StatusChip status={replayMs >= 785 ? task.status : "observing"} />}
    </div>
    <div className="runtime-clock" aria-label={`${elapsed} milliseconds of ${budget} millisecond SLA used`}>
      <div className="runtime-clock-fill" style={{ width: `${Math.min(100, elapsed / budget * 100)}%` }} />
      <div className="runtime-clock-model" style={{ width: `${Math.min(100, modelEnd / budget * 100)}%` }} />
      <span className="runtime-deadline">{budget} ms</span>
    </div>
    <div className="runtime-readout">
      <strong>{formatMs(elapsed)}</strong>
      <span>{formatMs(modelEnd)} model</span>
      <span>{formatMs(remaining)} reserve</span>
      <span>{replayMs >= 785 ? "ACK inside deadline" : "Executing fixture trace"}</span>
    </div>
  </div>;
}

function ReplayControls({ replayMs, setReplayMs, playing, setPlaying }) {
  const finished = replayMs >= 785;
  return <div className="replay-controls" aria-label="Synthetic task replay controls">
    <button type="button" onClick={() => {
      if (finished) setReplayMs(0);
      setPlaying(!playing || finished);
    }}>{playing ? "Pause" : finished ? "Replay task-042" : "Play task-042"}</button>
    <input type="range" min="0" max="785" step="5" value={replayMs}
      aria-label="Replay elapsed milliseconds"
      onChange={(event) => { setPlaying(false); setReplayMs(Number(event.target.value)); }} />
    <output>{replayMs} ms</output>
    <span>Fixture replay · no live actuation</span>
  </div>;
}

function ExecutionTimeline({ rows, replayMs }) {
  return <div className="timeline" role="list" aria-label="Task 042 control-path timeline">
    <div className="timeline-axis" aria-hidden="true">
      <span>0</span><span>250</span><span>500</span><span>750</span><span>1,000 ms</span>
    </div>
    {rows.map((row) => {
      const active = replayMs >= row.startMs && replayMs < row.endMs;
      const complete = replayMs >= row.endMs;
      return <div className="timeline-row" data-active={active || undefined}
        data-complete={complete || undefined} role="listitem" key={row.stageOrder}>
        <div className="timeline-label">
          <strong>{String(row.stageOrder).padStart(2, "0")} · {row.stage}</strong>
          <span>{row.component}</span>
        </div>
        <div className="timeline-track">
          <div className="timeline-bar" style={{
            "--stage-left": `${Math.min(100, row.startMs / 10)}%`,
            "--stage-width": `${Math.max(1.2, Math.min(100, row.durationMs / 10))}%`,
          }} title={`${row.stage}: ${row.durationMs} ms`}>
            <span>{row.durationMs} ms</span>
          </div>
          <div className="timeline-cursor" style={{ left: `${Math.min(100, replayMs / 10)}%` }} />
        </div>
      </div>;
    })}
    <div className="timeline-finish" data-visible={replayMs >= 785 || undefined}>
      <span />ACTION_ACK at 785 ms · effect verification continues
    </div>
  </div>;
}

function EventStream({ rows, replayMs }) {
  return <ol className="event-stream">
    {rows.map((row) => <li key={row.sequence} data-reached={replayMs >= row.offsetMs || undefined}
      data-current={replayMs >= row.offsetMs && replayMs < (rows[row.sequence]?.offsetMs ?? 786) || undefined}>
      <div className="event-time">+{row.offsetMs} ms</div>
      <div className="event-node"><span /></div>
      <div className="event-copy">
        <strong>{row.eventType}</strong>
        <span>{row.component}</span>
        <p>{row.summary}</p>
      </div>
    </li>)}
  </ol>;
}

function Topology({ rows }) {
  const groups = [...rows.reduce((map, row) => {
    if (!map.has(row.du)) map.set(row.du, []);
    map.get(row.du).push(row);
    return map;
  }, new Map()).entries()];
  return <div className="topology" role="img" aria-label="NMS to CU Agent and DU cell topology">
    <div className="topology-node nms-node">
      <span className="node-kicker">NMS</span><strong>Intent Agent</strong><small>Natural language → Intent IR</small>
    </div>
    <div className="topology-link"><span>gRPC / signed JSON</span></div>
    <div className="topology-node agent-node">
      <span className="node-kicker">CU-01 SIDECAR</span><strong>Pi Agent core · 0.8B</strong>
      <small>One model call · constrained tool choice</small>
      <div className="agent-stack"><span>Schema</span><span>Policy gate</span><span>Deadline</span></div>
    </div>
    <div className="topology-branch" />
    <div className="du-grid">
      {groups.map(([du, cells]) => <div className="du-card" key={du}>
        <div className="du-title"><strong>{du}</strong><span>deterministic executor</span></div>
        <div className="cell-grid">
          {cells.map((cell) => <div className="cell" data-state={cell.state} key={cell.cell}>
            <div><strong>{cell.cell}</strong><span>{cell.state.replace("_", " ")}</span></div>
            <b>{cell.loadPct}%</b>
            <small>{cell.neighborHeadroomPct}% neighbor headroom</small>
          </div>)}
        </div>
      </div>)}
    </div>
  </div>;
}

function TelemetryChart({ rows }) {
  return <div className="telemetry-wrap">
    <div className="telemetry-chart" role="img" aria-label="Post-action energy and throughput telemetry">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={rows} margin={{ top: 12, right: 8, bottom: 0, left: -16 }}>
          <CartesianGrid stroke="var(--ran-grid)" vertical={false} />
          <XAxis dataKey="elapsedSeconds" axisLine={false} tickLine={false}
            tickFormatter={(value) => `${value}s`} tick={{ fill: "var(--secondary)", fontSize: 11 }} />
          <YAxis yAxisId="energy" domain={[8, 11]} axisLine={false} tickLine={false}
            tick={{ fill: "var(--secondary)", fontSize: 11 }} />
          <YAxis yAxisId="throughput" orientation="right" domain={[48, 56]} axisLine={false}
            tickLine={false} tick={{ fill: "var(--secondary)", fontSize: 11 }} />
          <ReferenceLine x={0} stroke="var(--ran-amber)" strokeDasharray="4 4" />
          <Tooltip contentStyle={{ background: "var(--surface-raised)", border: "1px solid var(--border)", borderRadius: 10 }} />
          <Line yAxisId="energy" type="monotone" dataKey="energyKw" name="Energy · kW"
            stroke="var(--ran-cyan)" strokeWidth={2.5} dot={false} isAnimationActive={false} />
          <Line yAxisId="throughput" type="monotone" dataKey="throughputP95Mbps" name="DL P95 · Mbps"
            stroke="var(--ran-purple)" strokeWidth={2} dot={false} isAnimationActive={false} />
        </LineChart>
      </ResponsiveContainer>
    </div>
    <div className="guardrail-list">
      <div><span>Energy</span><strong>10.4 → 8.8 kW</strong><b className="pass">−15.4%</b></div>
      <div><span>DL throughput P95</span><strong>52.8 Mbps</strong><b className="pass">≥ 50</b></div>
      <div><span>RRC success</span><strong>99.3%</strong><b className="pass">≥ 99%</b></div>
      <p><span className="pulse-dot" /> Observation clock is separate from the 785 ms control ACK.</p>
    </div>
  </div>;
}

export function DashboardContent() {
  useDashboardTabs([{ id: "control-room", label: "Control room" }]);
  const {
    snapshot: dashboard,
    appTitle,
    setAppTitle,
    queries,
    filters,
    setFilter,
    reviewedRows,
    visible,
  } = useDataApp();
  const [replayMs, setReplayMs] = React.useState(0);
  const [playing, setPlaying] = React.useState(false);

  React.useEffect(() => {
    if (appTitle !== dashboard.title) setAppTitle(dashboard.title);
  }, [appTitle, dashboard.title, setAppTitle]);

  React.useEffect(() => {
    if (!playing) return undefined;
    const timer = window.setInterval(() => setReplayMs((current) => {
      if (current >= 785) {
        setPlaying(false);
        return 785;
      }
      return Math.min(785, current + 25);
    }), 50);
    return () => window.clearInterval(timer);
  }, [playing]);

  const taskRows = reviewedRows("tasks", ["taskId"]);
  const allTaskRows = queries.tasks?.rows ?? [];
  const spanRows = reviewedRows("spans", ["stageOrder"]);
  const cellRows = reviewedRows("cells", ["du", "cell"]);
  const telemetryRows = reviewedRows("telemetry", ["elapsedSeconds"]);
  const eventRows = reviewedRows("events", ["sequence"]);
  const activeTask = allTaskRows.find((row) => row.taskId === "task-042");

  const safeRate = taskRows.length ? taskRows.filter((row) => row.safeSuccess).length / taskRows.length : null;
  const p50 = percentile(taskRows, "totalLatencyMs", 0.5);
  const p95 = percentile(taskRows, "totalLatencyMs", 0.95);
  const timeoutCount = taskRows.filter((row) => row.status === "safe_timeout").length;
  const rollbackCount = taskRows.filter((row) => row.status === "rolled_back").length;
  const deadlineRate = taskRows.length ? taskRows.filter((row) => row.deadlineMet).length / taskRows.length : null;
  const summary = taskRows.length
    ? `${taskRows.filter((row) => row.safeSuccess).length}/${taskRows.length} selected runs completed safely; P95 ACK latency is ${formatMs(p95)}.`
    : "No runs match the selected experiment conditions.";

  const tableRows = taskRows.map((row) => ({
    ...row,
    startup: row.startup ?? (row.warm ? "Warm" : "Cold"),
    statusLabel: statusLabels[row.status] ?? row.status,
    latencyLabel: formatMs(row.totalLatencyMs),
    outcome: row.safeSuccess ? "Safe" : "Incomplete",
  }));

  return <article className="ran-agent-page">
    <header className="control-hero">
      <div>
        <span className="hero-kicker"><span /> RAN AGENT LAB · SYNTHETIC</span>
        <SectionHeader id="ran-agent-control-title" as="h1" title="RAN Agent Control Room" />
        <p>Pi Agent lightweight runtime on the CU side, a constrained 0.8B policy model, and deterministic DU execution under a hard ACTION_ACK deadline.</p>
      </div>
      <div className="hero-badges">
        <span><b>0.8B</b> edge model</span>
        <span><b>1,000 ms</b> ACK SLA</span>
        <span><b>SAFE_NOOP</b> timeout</span>
      </div>
    </header>

    <Filters sticky filters={dashboard.filters ?? []} queries={queries} values={filters} onChange={setFilter} />

    <ExecutiveSummary preview={summary} className="ran-executive-summary">
      <RichNarrative id="ran-summary" value={`**${summary}** Correct rejection counts as safe completion; late model output is discarded and cannot actuate. Control completion measures Intent IR receipt through CU/DU Function ACK. KPI effect verification runs on a separate, longer clock.`} />
    </ExecutiveSummary>

    <ReplayControls replayMs={replayMs} setReplayMs={setReplayMs} playing={playing} setPlaying={setPlaying} />
    <RuntimeRail task={activeTask} replayMs={replayMs} />

    <SortableRegion id="ran-agent-control-room:layout" label="RAN Agent control room blocks"
      authoredRevision={1} variant="freeform" className="ran-control-grid">
      {visible("safe-task-completion") && <SortableItem id="safe-task-completion" label="Safe task completion" kind="metric" className="metric-slot">
        <Metric id="safe-task-completion" title="Safe task completion"
          value={safeRate == null ? "—" : `${(safeRate * 100).toFixed(0)}%`}
          detail={`${taskRows.filter((row) => row.safeSuccess).length} of ${taskRows.length} selected runs`} tone="positive" rows={taskRows} />
      </SortableItem>}
      {visible("control-latency") && <SortableItem id="control-latency" label="P95 ACK latency" kind="metric" className="metric-slot">
        <Metric id="control-latency" title="P95 ACK latency" value={formatMs(p95)}
          detail={`P50 ${formatMs(p50)} · Intent IR → Function ACK`} tone={p95 != null && p95 <= 1000 ? "positive" : "warning"} rows={taskRows} />
      </SortableItem>}
      {visible("deadline-status") && <SortableItem id="deadline-status" label="Deadline success" kind="metric" className="metric-slot">
        <Metric id="deadline-status" title="Deadline met"
          value={deadlineRate == null ? "—" : `${(deadlineRate * 100).toFixed(0)}%`}
          detail={`${timeoutCount} safe timeout · late output blocked`} tone={timeoutCount ? "warning" : "positive"} rows={taskRows} />
      </SortableItem>}
      {visible("rollback-rate") && <SortableItem id="rollback-rate" label="Rollback count" kind="metric" className="metric-slot">
        <Metric id="rollback-rate" title="Rollback / rejection" value={`${rollbackCount} / ${taskRows.filter((row) => row.status === "rejected").length}`}
          detail="KPI guardrails and pre-actuation policy gates" tone={rollbackCount ? "warning" : "default"} rows={taskRows} />
      </SortableItem>}

      {visible("execution-timeline") && <SortableItem id="execution-timeline" label="Control path" kind="custom" className="timeline-slot">
        <DataComponent id="execution-timeline" queryId="spans" kind="custom" variant="card" padding="spacious"
          title="Control path · task-042" description="Synthetic replay: seven non-overlapping stages complete ACTION_ACK at 785 ms against the 1,000 ms hard deadline."
          sourceRows={spanRows} displayRows={spanRows}>
          <ExecutionTimeline rows={spanRows} replayMs={replayMs} />
        </DataComponent>
      </SortableItem>}

      {visible("audit-events") && <SortableItem id="audit-events" label="Pi Agent event stream" kind="custom" className="events-slot">
        <DataComponent id="audit-events" queryId="events" kind="custom" variant="card" padding="spacious"
          title="Pi Agent event stream · synthetic replay" description="Auditable state transitions and tool outcomes; hidden model reasoning is intentionally excluded."
          sourceRows={eventRows} displayRows={eventRows}>
          <EventStream rows={eventRows} replayMs={replayMs} />
        </DataComponent>
      </SortableItem>}

      {visible("cudu-topology") && <SortableItem id="cudu-topology" label="CU and DU topology" kind="custom" className="topology-slot">
        <DataComponent id="cudu-topology" queryId="cells" kind="custom" variant="card" padding="spacious"
          title="CU / DU execution topology" description="The 0.8B model stays in a CU-side Pi Agent sidecar; DU Functions remain narrow and deterministic."
          sourceRows={cellRows} displayRows={cellRows}>
          <Topology rows={cellRows} />
        </DataComponent>
      </SortableItem>}

      {visible("effect-telemetry") && <SortableItem id="effect-telemetry" label="KPI verification" kind="chart" className="telemetry-slot">
        <DataComponent id="effect-telemetry" queryId="telemetry" kind="chart" variant="card" padding="spacious"
          title="KPI effect verification" description="Modeled post-action telemetry for task-042; guardrails continue after the control ACK."
          sourceRows={telemetryRows} displayRows={telemetryRows}>
          <TelemetryChart rows={telemetryRows} />
        </DataComponent>
      </SortableItem>}

      {visible("task-run-table") && <SortableItem id="task-run-table" label="Experiment run matrix" kind="table" className="table-slot">
        <DataComponent id="task-run-table" queryId="tasks" kind="table" variant="card"
          title="Experiment run matrix" description="Compare model, precision, warm state, SLA, and safe outcome across the selected synthetic runs."
          sourceRows={taskRows} displayRows={tableRows}>
          <DataTable rows={tableRows} rowKey="taskId" caption="RAN Agent synthetic experiment runs"
            columns={[
              { key: "taskId", label: "Run" },
              { key: "scenario", label: "Scenario" },
              { key: "model", label: "Model" },
              { key: "precision", label: "Precision" },
              { key: "startup", label: "Start" },
              { key: "latencyLabel", label: "ACK latency" },
              { key: "statusLabel", label: "Terminal state", presentation: "status" },
              { key: "outcome", label: "Safety", presentation: "status" },
            ]} />
        </DataComponent>
      </SortableItem>}
    </SortableRegion>

    <footer className="fixture-note">
      <strong>Synthetic fixture</strong>
      <span>Values demonstrate the instrumentation and experiment contract only. They are not live CU/DU measurements or physical 0.8B benchmark results.</span>
    </footer>
  </article>;
}
