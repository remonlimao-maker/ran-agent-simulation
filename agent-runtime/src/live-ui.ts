export function renderLiveUi(): string {
  return `<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width,initial-scale=1" />
  <meta name="color-scheme" content="light" />
  <title>RAN Agent Live Control Room</title>
  <style>
    :root {
      color-scheme: light;
      font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      background: #f5f8f9;
      color: #17252a;
      --panel: rgba(255, 255, 255, .94);
      --line: #d8e3e6;
      --muted: #61737a;
      --cyan: #058da3;
      --green: #16855e;
      --amber: #b96c05;
      --red: #c84555;
    }
    * { box-sizing: border-box; }
    body { margin: 0; min-height: 100vh; background:
      radial-gradient(circle at 20% 0%, rgba(35, 174, 191, .13), transparent 38rem),
      linear-gradient(150deg, #f8fbfc, #eef5f6 60%, #f7f9fa); }
    button, select { font: inherit; }
    .shell { width: min(1180px, calc(100% - 32px)); margin: 0 auto; padding: 32px 0 48px; }
    .eyebrow { color: var(--cyan); text-transform: uppercase; letter-spacing: .16em; font-size: 11px; font-weight: 800; }
    h1 { margin: 8px 0 10px; font-size: clamp(28px, 5vw, 48px); letter-spacing: -.045em; }
    .lede { margin: 0; max-width: 760px; color: #53686f; line-height: 1.65; }
    .topline { display: flex; align-items: flex-start; justify-content: space-between; gap: 24px; }
    .status { display: inline-flex; align-items: center; gap: 8px; border: 1px solid var(--line); background: rgba(255, 255, 255, .88); border-radius: 999px; padding: 8px 12px; color: var(--muted); white-space: nowrap; box-shadow: 0 8px 24px rgba(30, 74, 82, .08); }
    .dot { width: 8px; height: 8px; border-radius: 50%; background: var(--amber); box-shadow: 0 0 0 4px rgba(185, 108, 5, .12); }
    .status[data-state="ready"] .dot, .status[data-state="succeeded"] .dot { background: var(--green); }
    .status[data-state="running"] .dot { background: var(--cyan); animation: pulse 1s infinite; }
    .status[data-state="safe_timeout"] .dot, .status[data-state="rejected"] .dot { background: var(--amber); }
    @keyframes pulse { 50% { opacity: .35; } }
    .controls { display: grid; grid-template-columns: 1fr 1fr auto; gap: 12px; margin: 28px 0 16px; }
    .control { display: grid; gap: 7px; }
    label { color: var(--muted); font-size: 12px; }
    select, button { border: 1px solid var(--line); border-radius: 12px; background: #ffffff; color: #17252a; min-height: 44px; padding: 0 14px; }
    select:focus-visible, button:focus-visible { outline: 3px solid rgba(5, 141, 163, .2); outline-offset: 2px; }
    button { align-self: end; min-width: 160px; border-color: #057d91; background: linear-gradient(135deg, #079bb2, #057d91); color: #ffffff; font-weight: 800; cursor: pointer; box-shadow: 0 8px 20px rgba(5, 125, 145, .18); }
    button:disabled { opacity: .45; cursor: wait; }
    .budget { border: 1px solid #b9dde2; background: linear-gradient(135deg, #e8f7f9, #ffffff); border-radius: 18px; padding: 18px; box-shadow: 0 12px 34px rgba(30, 74, 82, .08); }
    .budget-head, .budget-labels { display: flex; justify-content: space-between; gap: 16px; align-items: center; }
    .budget-head strong { font-size: 22px; }
    .budget-track { position: relative; overflow: hidden; height: 10px; margin: 15px 0 8px; border-radius: 999px; background: #dbe7e9; }
    .budget-fill { width: 0%; height: 100%; background: linear-gradient(90deg, var(--cyan), var(--green)); transition: width .12s linear; }
    .deadline { position: absolute; right: 0; top: 0; width: 2px; height: 100%; background: var(--amber); }
    .budget-labels { color: var(--muted); font-size: 12px; }
    .grid { display: grid; grid-template-columns: minmax(0, 1.35fr) minmax(300px, .65fr); gap: 16px; margin-top: 16px; }
    .panel { min-width: 0; border: 1px solid var(--line); background: var(--panel); border-radius: 18px; padding: 18px; box-shadow: 0 18px 54px rgba(30, 74, 82, .09); }
    .panel h2 { margin: 0 0 14px; font-size: 16px; }
    .topology { display: grid; grid-template-columns: 1fr auto 1fr auto 1fr; gap: 9px; align-items: center; }
    .node { min-width: 0; border: 1px solid var(--line); background: #f8fafb; border-radius: 13px; padding: 13px; text-align: center; }
    .node strong { display: block; font-size: 13px; }
    .node small { color: var(--muted); font-size: 10px; }
    .node[data-active="true"] { border-color: var(--cyan); background: #e6f6f8; box-shadow: inset 0 0 18px rgba(5, 141, 163, .08); }
    .arrow { color: #789198; }
    .events { height: 435px; overflow: auto; display: grid; align-content: start; gap: 8px; padding-right: 4px; }
    .event { display: grid; grid-template-columns: 72px 1fr auto; gap: 10px; border: 1px solid #e5ecee; border-left: 3px solid #789198; padding: 8px 9px; background: #f8fafb; border-radius: 0 10px 10px 0; }
    .event[data-stream="pi-agent"] { border-left-color: #7554c9; background: #faf8ff; }
    .event[data-terminal="true"] { border-left-color: var(--green); background: #eef9f4; }
    .event[data-terminal="timeout"] { border-left-color: var(--amber); background: #fff7eb; }
    .event time, .event .source { color: var(--muted); font-size: 11px; }
    .event strong { font-size: 12px; overflow-wrap: anywhere; }
    .event .source { text-align: right; }
    .empty { color: var(--muted); text-align: center; padding: 80px 20px; line-height: 1.6; }
    .summary { display: grid; grid-template-columns: repeat(3, 1fr); gap: 10px; margin-top: 14px; }
    .metric { border: 1px solid var(--line); background: #fbfcfc; border-radius: 12px; padding: 12px; }
    .metric span { color: var(--muted); font-size: 10px; text-transform: uppercase; letter-spacing: .1em; }
    .metric strong { display: block; margin-top: 5px; font-size: 20px; }
    .footnote { color: var(--muted); font-size: 11px; line-height: 1.5; margin: 14px 0 0; }
    @media (max-width: 760px) {
      .shell { width: min(100% - 20px, 1180px); padding-top: 20px; }
      .topline { display: block; }
      .status { margin-top: 16px; }
      .controls { grid-template-columns: 1fr 1fr; }
      button { grid-column: 1 / -1; }
      .grid { grid-template-columns: 1fr; }
      .topology { grid-template-columns: 1fr; }
      .arrow { transform: rotate(90deg); text-align: center; }
      .summary { grid-template-columns: 1fr; }
    }
  </style>
</head>
<body>
  <main class="shell">
    <div class="topline">
      <div>
        <div class="eyebrow">Local synthetic control plane</div>
        <h1>RAN Agent Live Control Room</h1>
        <p class="lede">实时观察 Pi Agent 单轮工具选择、确定性安全校验与 DU Function ACK。仅连接本地模拟器，不包含真实基站写操作，也不展示隐藏推理。</p>
      </div>
      <div class="status" id="status" data-state="connecting"><span class="dot"></span><span id="statusText">Connecting SSE</span></div>
    </div>

    <section class="controls" aria-label="Run controls">
      <div class="control"><label for="mode">Decision agent</label><select id="mode"><option value="pi-faux">Pi Agent · faux 0.8B</option><option value="rules">Rules baseline</option></select></div>
      <div class="control"><label for="scenario">Scenario</label><select id="scenario"><option value="success">ACK success</option><option value="model_timeout">Model timeout → SAFE_NOOP</option><option value="du_timeout">DU timeout → SAFE_NOOP</option></select></div>
      <button type="button" id="run">Run synthetic task</button>
    </section>

    <section class="budget" aria-label="Control deadline">
      <div class="budget-head"><div><div class="eyebrow">Intent → Function ACK</div><strong id="elapsed">0 ms</strong></div><strong>1,000 ms SLA</strong></div>
      <div class="budget-track"><div class="budget-fill" id="budgetFill"></div><div class="deadline"></div></div>
      <div class="budget-labels"><span id="phase">Waiting for task</span><span id="reserve">1,000 ms reserve</span></div>
    </section>

    <div class="grid">
      <section class="panel">
        <h2>Execution topology</h2>
        <div class="topology">
          <div class="node" id="nodeIntent"><strong>Intent IR</strong><small>schema + scope</small></div><div class="arrow">→</div>
          <div class="node" id="nodeAgent"><strong>Pi Agent / Rules</strong><small>one proposal</small></div><div class="arrow">→</div>
          <div class="node" id="nodeDu"><strong>DU Function</strong><small>deterministic ACK</small></div>
        </div>
        <div class="summary">
          <div class="metric"><span>Terminal state</span><strong id="terminal">—</strong></div>
          <div class="metric"><span>Tool / action</span><strong id="action">—</strong></div>
          <div class="metric"><span>Config version</span><strong id="version">—</strong></div>
        </div>
        <p class="footnote">紫色轨迹来自 Pi Agent Core 生命周期；青色轨迹来自确定性 Runtime。Pi tool callback 只记录 proposal，真正的 DU dispatch 必须再次通过 guardrail。</p>
      </section>
      <section class="panel">
        <h2>Auditable event stream</h2>
        <div class="events" id="events"><div class="empty">建立 SSE 后运行一个任务。<br />事件会按发生顺序实时出现。</div></div>
      </section>
    </div>
  </main>
  <script>
    const $ = (id) => document.getElementById(id);
    const status = $('status');
    const statusText = $('statusText');
    const runButton = $('run');
    const events = $('events');
    const elapsed = $('elapsed');
    const fill = $('budgetFill');
    const reserve = $('reserve');
    const phase = $('phase');
    const terminal = $('terminal');
    const action = $('action');
    const version = $('version');
    let running = false;

    const source = new EventSource('/api/events');
    source.onopen = () => setStatus('ready', 'SSE ready');
    source.onerror = () => { if (!running) setStatus('connecting', 'Reconnecting SSE'); };
    source.onmessage = ({ data }) => {
      const message = JSON.parse(data);
      if (message.kind === 'hello') return;
      if (message.kind === 'run_started') resetRun(message);
      if (message.kind === 'event') renderEvent(message);
      if (message.kind === 'run_complete') finishRun(message);
      if (message.kind === 'run_error') finishError(message);
    };

    runButton.addEventListener('click', async () => {
      if (running) return;
      runButton.disabled = true;
      const response = await fetch('/api/run', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ mode: $('mode').value, scenario: $('scenario').value })
      });
      if (!response.ok) {
        const body = await response.json().catch(() => ({ error: response.statusText }));
        setStatus('rejected', body.error || 'Run rejected');
        runButton.disabled = false;
      }
    });

    function resetRun(message) {
      running = true;
      runButton.disabled = true;
      events.replaceChildren();
      elapsed.textContent = '0 ms';
      fill.style.width = '0%';
      reserve.textContent = '1,000 ms reserve';
      phase.textContent = message.mode + ' · ' + message.scenario;
      terminal.textContent = 'RUNNING';
      action.textContent = '—';
      version.textContent = '—';
      setStatus('running', 'Task running');
      setActive('nodeIntent');
    }

    function renderEvent(message) {
      const event = message.event;
      const ms = Math.max(0, Math.round(message.controlElapsedMs ?? event.elapsedMs ?? 0));
      if (message.stream === 'runtime') updateBudget(ms, event.type);
      const row = document.createElement('div');
      row.className = 'event';
      row.dataset.stream = message.stream;
      if (event.type === 'ACTION_ACK') row.dataset.terminal = 'true';
      if (event.type === 'SAFE_NOOP' || event.type === 'REJECTED') row.dataset.terminal = 'timeout';
      const time = document.createElement('time');
      time.textContent = '+' + ms + ' ms';
      const name = document.createElement('strong');
      name.textContent = event.type;
      const sourceLabel = document.createElement('span');
      sourceLabel.className = 'source';
      sourceLabel.textContent = message.stream;
      row.append(time, name, sourceLabel);
      events.append(row);
      events.scrollTop = events.scrollHeight;

      if (event.type === 'MODEL_STARTED' || event.type === 'agent_start') setActive('nodeAgent');
      if (event.type === 'TOOL_DISPATCHED') {
        setActive('nodeDu');
        action.textContent = event.detail?.actionName || '—';
      }
      if (event.type === 'ACTION_ACK') version.textContent = String(event.detail?.configVersion ?? '—');
    }

    function updateBudget(ms, eventType) {
      const bounded = Math.min(1000, ms);
      elapsed.textContent = bounded.toLocaleString() + ' ms';
      fill.style.width = Math.min(100, bounded / 10) + '%';
      reserve.textContent = Math.max(0, 1000 - bounded).toLocaleString() + ' ms reserve';
      phase.textContent = eventType.replaceAll('_', ' ');
    }

    function finishRun(message) {
      running = false;
      runButton.disabled = false;
      terminal.textContent = message.result.status.toUpperCase();
      action.textContent = message.result.action?.actionName || action.textContent;
      version.textContent = String(message.result.ack?.configVersion ?? version.textContent);
      updateBudget(message.result.elapsedMs, message.result.status);
      setStatus(message.result.status, message.result.status === 'succeeded' ? 'ACTION_ACK received' : 'Safe terminal state');
      setActive(null);
    }

    function finishError(message) {
      running = false;
      runButton.disabled = false;
      terminal.textContent = 'ERROR';
      setStatus('rejected', message.error || 'Run failed');
      setActive(null);
    }

    function setStatus(state, text) {
      status.dataset.state = state;
      statusText.textContent = text;
    }

    function setActive(id) {
      ['nodeIntent', 'nodeAgent', 'nodeDu'].forEach((nodeId) => $(nodeId).dataset.active = nodeId === id ? 'true' : 'false');
    }
  </script>
</body>
</html>`;
}
