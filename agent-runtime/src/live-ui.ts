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
    button, select, textarea { font: inherit; }
    .shell { width: min(1180px, calc(100% - 32px)); margin: 0 auto; padding: 32px 0 48px; }
    .eyebrow { color: var(--cyan); text-transform: uppercase; letter-spacing: .16em; font-size: 11px; font-weight: 800; }
    h1 { margin: 8px 0 10px; font-size: clamp(28px, 5vw, 48px); letter-spacing: -.045em; }
    .lede { margin: 0; max-width: 760px; color: #53686f; line-height: 1.65; }
    .lede-en { display: block; margin-top: 3px; font-size: .9em; }
    .topline { display: flex; align-items: flex-start; justify-content: space-between; gap: 24px; }
    .status { display: inline-flex; align-items: center; gap: 8px; border: 1px solid var(--line); background: rgba(255, 255, 255, .88); border-radius: 999px; padding: 8px 12px; color: var(--muted); white-space: nowrap; box-shadow: 0 8px 24px rgba(30, 74, 82, .08); }
    .dot { width: 8px; height: 8px; border-radius: 50%; background: var(--amber); box-shadow: 0 0 0 4px rgba(185, 108, 5, .12); }
    .status[data-state="ready"] .dot, .status[data-state="succeeded"] .dot { background: var(--green); }
    .status[data-state="running"] .dot { background: var(--cyan); animation: pulse 1s infinite; }
    .status[data-state="safe_timeout"] .dot, .status[data-state="rejected"] .dot { background: var(--amber); }
    @keyframes pulse { 50% { opacity: .35; } }
    .controls { display: grid; grid-template-columns: 1fr 1fr auto; gap: 12px; margin: 28px 0 16px; }
    .control { display: grid; gap: 7px; }
    .intent-control { grid-column: 1 / -1; }
    label { color: var(--muted); font-size: 12px; }
    select, button, textarea { border: 1px solid var(--line); border-radius: 12px; background: #ffffff; color: #17252a; }
    select, button { min-height: 44px; padding: 0 14px; }
    textarea { width: 100%; min-height: 100px; resize: vertical; padding: 12px 14px; line-height: 1.6; }
    select:focus-visible, button:focus-visible, textarea:focus-visible { outline: 3px solid rgba(5, 141, 163, .2); outline-offset: 2px; }
    button { align-self: end; min-width: 160px; border-color: #057d91; background: linear-gradient(135deg, #079bb2, #057d91); color: #ffffff; font-weight: 800; cursor: pointer; box-shadow: 0 8px 20px rgba(5, 125, 145, .18); }
    button:disabled { opacity: .45; cursor: wait; }
    .intent-grid { display: grid; grid-template-columns: minmax(0, 1.15fr) minmax(300px, .85fr); gap: 16px; margin: 0 0 16px; }
    .intent-panel { min-width: 0; border: 1px solid #cfe1e4; background: rgba(250, 253, 253, .92); border-radius: 16px; padding: 16px; box-shadow: 0 12px 34px rgba(30, 74, 82, .055); }
    .intent-panel-head { display: flex; justify-content: space-between; gap: 12px; align-items: baseline; margin-bottom: 12px; }
    .intent-panel h2 { margin: 0; font-size: 15px; }
    .intent-panel-head span { color: var(--muted); font-size: 10px; }
    .parse-trace { min-height: 158px; max-height: 300px; overflow: auto; display: grid; align-content: start; gap: 8px; padding-right: 3px; }
    .parse-stage { display: grid; grid-template-columns: 86px minmax(0, 1fr); gap: 10px; border: 1px solid #dce8ea; border-radius: 10px; padding: 9px 10px; background: #ffffff; }
    .parse-stage .stage { color: var(--cyan); font-size: 10px; font-weight: 800; letter-spacing: .06em; overflow-wrap: anywhere; }
    .parse-stage .stage-copy { min-width: 0; }
    .parse-stage strong { display: block; font-size: 12px; }
    .parse-stage pre { margin: 4px 0 0; color: var(--muted); font: 11px/1.45 ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; white-space: pre-wrap; overflow-wrap: anywhere; }
    .intent-json { min-height: 158px; max-height: 300px; overflow: auto; margin: 0; border: 1px solid #dce8ea; border-radius: 10px; padding: 11px 12px; background: #ffffff; color: #284148; font: 11px/1.55 ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; white-space: pre-wrap; overflow-wrap: anywhere; }
    .intent-placeholder { color: var(--muted); text-align: center; padding: 58px 16px; font-size: 12px; line-height: 1.55; }
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
    .topology { display: grid; grid-template-columns: 1fr auto 1fr auto 1fr auto 1fr; gap: 9px; align-items: center; }
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
      .intent-grid { grid-template-columns: 1fr; }
      .parse-stage { grid-template-columns: 1fr; gap: 4px; }
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
        <div class="eyebrow">本地合成控制平面 / Local synthetic control plane</div>
        <h1>RAN Agent 实时控制台 <span lang="en">/ Live Control Room</span></h1>
        <p class="lede">实时观察自然语言意图解析、Intent IR、Pi Agent 单轮工具选择、确定性安全校验与 Function ACK。仅连接本地模拟器，不包含真实基站写操作，也不展示模型隐藏思维链。<span class="lede-en" lang="en">Observe intent parsing, structured Intent IR, one-shot Pi tool selection, deterministic safety checks, and Function ACK. Local simulation only; no live station writes or hidden chain-of-thought.</span></p>
      </div>
      <div class="status" id="status" data-state="connecting"><span class="dot"></span><span id="statusText">正在连接 SSE / Connecting</span></div>
    </div>

    <section class="controls" aria-label="Run controls">
      <div class="control intent-control">
        <label for="naturalLanguage">运营商自然语言意图 / Operator intent</label>
        <textarea id="naturalLanguage" maxlength="1200">请将 gnb-001 的 cell-01 设为低功耗模式，目标降低能耗 15%，但下行 P95 吞吐不得低于 50 Mbps，RRC 成功率不得低于 99%，并在 1 秒内完成执行确认。</textarea>
      </div>
      <div class="control"><label for="mode">决策 Agent / Decision agent</label><select id="mode"><option value="pi-faux">Pi Agent · 仿真提供器 / faux provider（无模型 / no model）</option><option value="rules">规则基线 / Rules baseline</option></select></div>
      <div class="control"><label for="scenario">实验场景 / Scenario</label><select id="scenario"><option value="success">确认成功 / ACK success</option><option value="model_timeout">模型超时 / Model timeout → SAFE_NOOP</option><option value="du_timeout">Function 超时 / timeout → SAFE_NOOP</option></select></div>
      <button type="button" id="run">解析意图并运行 / Parse &amp; run</button>
    </section>

    <div class="intent-grid">
      <section class="intent-panel" aria-labelledby="parseTraceTitle">
        <div class="intent-panel-head"><h2 id="parseTraceTitle">意图解析轨迹 / Parsing trace</h2><span id="parseState">等待输入 / Waiting</span></div>
        <div class="parse-trace" id="parseTrace"><div class="intent-placeholder">运行任务后逐步展示解析阶段与输出。<br /><span lang="en">Run a task to see each parsing stage and output.</span></div></div>
      </section>
      <section class="intent-panel" aria-labelledby="intentIrTitle">
        <div class="intent-panel-head"><h2 id="intentIrTitle">结构化 Intent IR / Structured intent</h2><span>完整 JSON / Full JSON</span></div>
        <pre class="intent-json" id="intentJson">等待自然语言意图解析… / Waiting for parsing…</pre>
      </section>
    </div>

    <section class="budget" aria-label="Control deadline">
      <div class="budget-head"><div><div class="eyebrow">基站控制 / Station control · Intent → Function ACK</div><strong id="elapsed">0 ms</strong></div><strong>1,000 ms SLA</strong></div>
      <div class="budget-track"><div class="budget-fill" id="budgetFill"></div><div class="deadline"></div></div>
      <div class="budget-labels"><span id="phase">等待任务 / Waiting</span><span id="reserve">剩余 / Reserve 1,000 ms</span></div>
    </section>

    <div class="grid">
      <section class="panel">
        <h2>执行拓扑 / Execution topology</h2>
        <div class="topology">
          <div class="node" id="nodeInput"><strong>自然语言 / Natural language</strong><small>运营请求 / operator request</small></div><div class="arrow">→</div>
          <div class="node" id="nodeIntent"><strong>意图 Agent / Intent Agent</strong><small>解析并生成 Intent IR / parse</small></div><div class="arrow">→</div>
          <div class="node" id="nodeAgent"><strong>基站 Agent / Station Agent</strong><small>单个提案 / one proposal</small></div><div class="arrow">→</div>
          <div class="node" id="nodeDu"><strong>基站 Function / Station Function</strong><small>确定性确认 / deterministic ACK</small></div>
        </div>
        <div class="summary">
          <div class="metric"><span>终态 / Terminal state</span><strong id="terminal">—</strong></div>
          <div class="metric"><span>工具 / Tool · action</span><strong id="action">—</strong></div>
          <div class="metric"><span>配置版本 / Config version</span><strong id="version">—</strong></div>
        </div>
        <p class="footnote">紫色轨迹来自 Pi Agent Core 生命周期；青色轨迹来自确定性 Runtime。Pi tool callback 只记录 proposal，真正的 Function dispatch 必须再次通过 guardrail。<br /><span lang="en">Purple events come from Pi Agent Core; teal events come from the deterministic runtime. Tool callbacks record proposals only, and dispatch still requires guardrail approval.</span></p>
      </section>
      <section class="panel">
        <h2>可审计事件流 / Auditable event stream</h2>
        <div class="events" id="events"><div class="empty">建立 SSE 后运行一个任务，事件将按顺序实时出现。<br /><span lang="en">Run a task after SSE connects; events appear in order.</span></div></div>
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
    const naturalLanguage = $('naturalLanguage');
    const parseTrace = $('parseTrace');
    const parseState = $('parseState');
    const intentJson = $('intentJson');
    let running = false;

    const source = new EventSource('/api/events');
    source.onopen = () => setStatus('ready', 'SSE 已就绪 / ready');
    source.onerror = () => { if (!running) setStatus('connecting', '正在重连 SSE / Reconnecting'); };
    source.onmessage = ({ data }) => {
      const message = JSON.parse(data);
      if (message.kind === 'hello') return;
      if (message.kind === 'intent_parse_started') startIntentParse(message);
      if (message.kind === 'intent_parse_stage') renderIntentStage(message);
      if (message.kind === 'intent_ir_ready') renderIntentIr(message);
      if (message.kind === 'run_started') resetRun(message);
      if (message.kind === 'event') renderEvent(message);
      if (message.kind === 'run_complete') finishRun(message);
      if (message.kind === 'run_error') finishError(message);
    };

    runButton.addEventListener('click', async () => {
      if (running) return;
      runButton.disabled = true;
      prepareIntentPanels();
      const response = await fetch('/api/run', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          mode: $('mode').value,
          scenario: $('scenario').value,
          naturalLanguage: naturalLanguage.value
        })
      });
      if (!response.ok) {
        const body = await response.json().catch(() => ({ error: response.statusText }));
        setStatus('rejected', body.error || 'Run rejected');
        runButton.disabled = false;
      }
    });

    function prepareIntentPanels() {
      parseTrace.replaceChildren();
      const waiting = document.createElement('div');
      waiting.className = 'intent-placeholder';
      waiting.textContent = '等待网管侧意图解析事件… / Waiting for parsing events…';
      parseTrace.append(waiting);
      parseState.textContent = '请求已提交 / Submitted';
      intentJson.textContent = '等待结构化 Intent IR… / Waiting for structured intent…';
      setActive('nodeInput');
    }

    function startIntentParse(message) {
      running = true;
      runButton.disabled = true;
      parseTrace.replaceChildren();
      parseState.textContent = message.label || '解析中 / Parsing';
      intentJson.textContent = '正在解析自然语言意图… / Parsing operator intent…';
      setStatus('running', '正在解析运营意图 / Parsing intent');
      setActive('nodeIntent');
    }

    function renderIntentStage(message) {
      if (parseTrace.querySelector('.intent-placeholder')) parseTrace.replaceChildren();
      const stagePayload = message.stage && typeof message.stage === 'object' ? message.stage : message;
      const stageName = typeof message.stage === 'string'
        ? message.stage
        : stagePayload.stage || stagePayload.id || 'parse_stage';
      const label = stagePayload.label || message.label || stageName;
      const output = stagePayload.output ?? message.output ?? stagePayload.result ?? message.result ?? '';

      const row = document.createElement('div');
      row.className = 'parse-stage';
      const stage = document.createElement('span');
      stage.className = 'stage';
      stage.textContent = String(stageName);
      const copy = document.createElement('div');
      copy.className = 'stage-copy';
      const title = document.createElement('strong');
      title.textContent = String(label);
      const renderedOutput = document.createElement('pre');
      renderedOutput.textContent = formatStructuredValue(output);
      copy.append(title, renderedOutput);
      row.append(stage, copy);
      parseTrace.append(row);
      parseTrace.scrollTop = parseTrace.scrollHeight;
      parseState.textContent = String(label);
      setActive('nodeIntent');
    }

    function renderIntentIr(message) {
      const intent = message.intentIr ?? message.intentIR ?? message.intent ?? message.ir ?? message.output ?? message.data ?? {};
      intentJson.textContent = formatStructuredValue(intent);
      const parseMs = Number(message.parseElapsedMs);
      const traceMs = Number(message.traceElapsedMs);
      parseState.textContent = Number.isFinite(parseMs)
        ? 'parse ' + formatMs(parseMs) + (Number.isFinite(traceMs) ? ' · trace ' + formatMs(traceMs) : '')
        : 'Intent IR 已生成 / ready';
      setStatus('running', '结构化意图已生成 / Structured intent ready');
      setActive('nodeIntent');
    }

    function formatMs(value) {
      return (Math.round(value * 100) / 100).toLocaleString() + ' ms';
    }

    function formatStructuredValue(value) {
      if (typeof value === 'string') return value;
      if (value === undefined) return '—';
      try { return JSON.stringify(value, null, 2); }
      catch { return String(value); }
    }

    function resetRun(message) {
      running = true;
      runButton.disabled = true;
      events.replaceChildren();
      elapsed.textContent = '0 ms';
      fill.style.width = '0%';
      reserve.textContent = '剩余 / Reserve 1,000 ms';
      phase.textContent = message.mode + ' · ' + message.scenario;
      terminal.textContent = 'RUNNING';
      action.textContent = '—';
      version.textContent = '—';
      setStatus('running', '任务运行中 / Task running');
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
      reserve.textContent = '剩余 / Reserve ' + Math.max(0, 1000 - bounded).toLocaleString() + ' ms';
      phase.textContent = eventType.replaceAll('_', ' ');
    }

    function finishRun(message) {
      running = false;
      runButton.disabled = false;
      terminal.textContent = message.result.status.toUpperCase();
      action.textContent = message.result.action?.actionName || action.textContent;
      version.textContent = String(message.result.ack?.configVersion ?? version.textContent);
      updateBudget(message.result.elapsedMs, message.result.status);
      setStatus(message.result.status, message.result.status === 'succeeded' ? '收到 ACTION_ACK / received' : '安全终态 / Safe terminal state');
      setActive(null);
    }

    function finishError(message) {
      running = false;
      runButton.disabled = false;
      terminal.textContent = 'ERROR';
      setStatus('rejected', message.error || '运行失败 / Run failed');
      setActive(null);
    }

    function setStatus(state, text) {
      status.dataset.state = state;
      statusText.textContent = text;
    }

    function setActive(id) {
      ['nodeInput', 'nodeIntent', 'nodeAgent', 'nodeDu'].forEach((nodeId) => $(nodeId).dataset.active = nodeId === id ? 'true' : 'false');
    }
  </script>
</body>
</html>`;
}
