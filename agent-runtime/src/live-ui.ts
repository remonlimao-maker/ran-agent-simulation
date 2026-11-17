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
    .controls { display: grid; grid-template-columns: 1fr 1fr 1fr auto; gap: 12px; margin: 28px 0 16px; }
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
    .resource-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; margin-top: 16px; }
    .resource-card { min-width: 0; border: 1px solid var(--line); background: var(--panel); border-radius: 18px; padding: 18px; box-shadow: 0 14px 42px rgba(30, 74, 82, .07); }
    .resource-head { display: flex; align-items: baseline; justify-content: space-between; gap: 12px; margin-bottom: 14px; }
    .resource-head h2 { margin: 0; font-size: 16px; }
    .resource-head span { color: var(--muted); font-size: 10px; text-align: right; }
    .resource-metrics { display: grid; grid-template-columns: repeat(3, 1fr); gap: 9px; }
    .resource-metric { min-width: 0; border: 1px solid #dce8ea; border-radius: 11px; padding: 10px; background: #fbfdfd; }
    .resource-metric span { display: block; color: var(--muted); font-size: 9px; text-transform: uppercase; letter-spacing: .07em; }
    .resource-metric strong { display: block; margin-top: 5px; font-size: 17px; overflow-wrap: anywhere; }
    .resource-bars { display: grid; gap: 9px; margin-top: 12px; }
    .resource-bar-head { display: flex; justify-content: space-between; gap: 12px; color: var(--muted); font-size: 10px; }
    .resource-bar { height: 7px; overflow: hidden; border-radius: 99px; background: #e4ecee; }
    .resource-bar > span { display: block; width: 0%; height: 100%; border-radius: inherit; background: linear-gradient(90deg, var(--cyan), #3ab98a); transition: width .12s linear; }
    .capacity-note { margin: 12px 0 0; color: var(--muted); font-size: 10px; line-height: 1.55; }
    .capacity-note[data-warning="true"] { color: #8b5a13; }
    .call-panel { margin-top: 16px; border: 1px solid #cfdfe3; background: var(--panel); border-radius: 18px; padding: 18px; box-shadow: 0 14px 42px rgba(30, 74, 82, .07); }
    .trace-badge { display: inline-flex; align-items: center; border: 1px solid #d7e4e7; border-radius: 999px; padding: 5px 9px; background: #f5fafb; color: var(--muted); font-size: 10px; font-weight: 800; }
    .trace-badge[data-source="remote_api"] { border-color: #9dd9be; background: #edf9f3; color: #126a4c; }
    .trace-badge[data-source="preset_fixture"] { border-color: #edcc98; background: #fff7e9; color: #89550a; }
    .call-trace { max-height: 430px; overflow: auto; display: grid; gap: 8px; padding-right: 3px; }
    .call-step { display: grid; grid-template-columns: 48px minmax(170px, .55fr) minmax(0, 1.45fr); gap: 10px; align-items: start; border: 1px solid #e0e9eb; border-left: 3px solid var(--cyan); border-radius: 0 11px 11px 0; padding: 10px; background: #fbfdfd; }
    .call-step[data-source="pi-agent"] { border-left-color: #7554c9; background: #fbf9ff; }
    .call-step[data-source="guardrail"] { border-left-color: var(--green); }
    .call-step time { color: var(--muted); font-size: 10px; }
    .call-step strong { font-size: 12px; }
    .call-step small { display: block; margin-top: 3px; color: var(--muted); font-size: 9px; }
    .call-step pre { margin: 0; max-height: 180px; overflow: auto; color: #344c53; font: 10px/1.45 ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; white-space: pre-wrap; overflow-wrap: anywhere; }
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
      .resource-grid { grid-template-columns: 1fr; }
      .resource-metrics { grid-template-columns: repeat(2, 1fr); }
      .call-step { grid-template-columns: 1fr; gap: 5px; }
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
      <div class="control"><label for="mode">决策 Agent / Decision agent</label><select id="mode"><option value="pi-faux">Pi Agent · 仿真提供器 / faux provider（无模型 / no model）</option><option value="pi-api" id="apiModeOption">Pi Agent · 远端模型 API / Remote model API</option><option value="rules">规则基线 / Rules baseline</option></select></div>
      <div class="control"><label for="scenario">实验场景 / Scenario</label><select id="scenario"><option value="success">确认成功 / ACK success</option><option value="model_timeout">模型超时 / Model timeout → SAFE_NOOP</option><option value="du_timeout">Function 超时 / timeout → SAFE_NOOP</option></select></div>
      <div class="control"><label for="demoPace">演示节奏 / Demo pace（不计入 SLA）</label><select id="demoPace"><option value="0">实时 / Real-time</option><option value="120">快速 / Fast · 120 ms</option><option value="300" selected>标准 / Standard · 300 ms</option><option value="700">慢速 / Slow · 700 ms</option></select></div>
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

    <div class="resource-grid">
      <section class="resource-card" aria-labelledby="resourceLiveTitle">
        <div class="resource-head"><h2 id="resourceLiveTitle">运行资源实测 / Live resources</h2><span id="resourceScope">Agent 客户端进程 / client process</span></div>
        <div class="resource-metrics">
          <div class="resource-metric"><span>阶段 / Phase</span><strong id="resourcePhase">—</strong></div>
          <div class="resource-metric"><span>CPU 峰值 / Peak</span><strong id="resourceCpu">—</strong></div>
          <div class="resource-metric"><span>RSS 峰值 / Peak</span><strong id="resourceRss">—</strong></div>
          <div class="resource-metric"><span>Heap 峰值 / Peak</span><strong id="resourceHeap">—</strong></div>
          <div class="resource-metric"><span>Token 输入/输出 / I/O</span><strong id="resourceTokens">—</strong></div>
          <div class="resource-metric"><span>模型耗时 / Model time</span><strong id="resourceModelTime">—</strong></div>
        </div>
        <div class="resource-bars">
          <div><div class="resource-bar-head"><span>单核 CPU / one-core scale</span><span id="cpuBarLabel">0%</span></div><div class="resource-bar"><span id="cpuBar"></span></div></div>
          <div><div class="resource-bar-head"><span>Agent RSS / 512 MiB reference</span><span id="rssBarLabel">0 MiB</span></div><div class="resource-bar"><span id="rssBar"></span></div></div>
        </div>
        <p class="capacity-note" id="resourceCaveat">只测当前 Node Agent；远端 API 的服务端算力、显存和功耗不可由客户端直接看到。<br /><span lang="en">Measures this Node Agent only; a hosted API does not expose server compute, memory, or power.</span></p>
      </section>

      <section class="resource-card" aria-labelledby="capacityTitle">
        <div class="resource-head"><h2 id="capacityTitle">芯片容量规划 / Capacity estimate</h2><span>分析估算，非本次实测 / analytical</span></div>
        <div class="resource-metrics">
          <div class="resource-metric"><span>INT4 算力 / TOPS</span><strong id="capacityTops">—</strong></div>
          <div class="resource-metric"><span>内存带宽 / Bandwidth</span><strong id="capacityBandwidth">—</strong></div>
          <div class="resource-metric"><span>专用 RAM / Dedicated</span><strong id="capacityRam">—</strong></div>
          <div class="resource-metric"><span>双槽存储 / Storage</span><strong id="capacityStorage">—</strong></div>
          <div class="resource-metric"><span>原始权重 / Raw weights</span><strong id="capacityWeights">—</strong></div>
          <div class="resource-metric"><span>目标解码 / Decode</span><strong id="capacityDecode">—</strong></div>
        </div>
        <p class="capacity-note" id="capacityProfile">默认规划：约 0.8B 总参数、INT4、512-token 上下文、32-token 输出、450 ms 推理预算。</p>
        <p class="capacity-note" data-warning="true">TOPS 与带宽是带效率和余量的初步筛选值；最终选型必须用同一量化文件、推理后端和目标芯片复测 P95/P99 与功耗。<br /><span lang="en">These are screening estimates; final sizing requires the exact quantization, backend, and target silicon.</span></p>
      </section>
    </div>

    <section class="call-panel" aria-labelledby="piTraceTitle">
      <div class="resource-head"><h2 id="piTraceTitle">Pi Agent 执行与调用过程 / Execution trace</h2><span class="trace-badge" id="piTraceBadge" data-source="idle">等待任务 / Waiting</span></div>
      <p class="capacity-note">展示模型输入摘要、工具 Schema、实际 tool call 参数、Proposal、Guardrail 和 Function ACK；不展示隐藏思维链。<br /><span lang="en">Shows the model request summary, tool schemas, actual tool-call arguments, proposal, guardrail, and Function ACK—never hidden reasoning.</span></p>
      <div class="call-trace" id="piTrace"><div class="intent-placeholder">运行任务后显示真实框架调用轨迹；只有 Remote API 模式包含真实模型推理。<br /><span lang="en">Run a task to inspect the framework trace; only Remote API mode performs real model inference.</span></div></div>
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
    const resourcePhase = $('resourcePhase');
    const resourceCpu = $('resourceCpu');
    const resourceRss = $('resourceRss');
    const resourceHeap = $('resourceHeap');
    const resourceTokens = $('resourceTokens');
    const resourceModelTime = $('resourceModelTime');
    const resourceScope = $('resourceScope');
    const resourceCaveat = $('resourceCaveat');
    const cpuBar = $('cpuBar');
    const cpuBarLabel = $('cpuBarLabel');
    const rssBar = $('rssBar');
    const rssBarLabel = $('rssBarLabel');
    const piTrace = $('piTrace');
    const piTraceBadge = $('piTraceBadge');
    let piTraceSequence = 0;
    let liveResourcePeak = { cpu: 0, rss: 0, heap: 0 };
    let running = false;

    fetch('/api/health').then((response) => response.json()).then((health) => {
      const option = $('apiModeOption');
      option.textContent = health.remoteApiConfigured
        ? 'Pi Agent · 远端 API / Remote · ' + health.remoteModelId
        : 'Pi Agent · 远端模型 API / Remote API（未配置 / not configured）';
      if (health.capacityEstimate) renderCapacity(health.capacityEstimate);
    }).catch(() => undefined);

    const source = new EventSource('/api/events');
    source.onopen = () => setStatus('ready', 'SSE 已就绪 / ready');
    source.onerror = () => { if (!running) setStatus('connecting', '正在重连 SSE / Reconnecting'); };
    let displayChain = Promise.resolve();
    source.onmessage = ({ data }) => {
      const message = JSON.parse(data);
      if (message.kind === 'hello') return;
      const shouldQueue = message.kind === 'event'
        || message.kind === 'resource_summary'
        || message.kind === 'run_complete'
        || (message.kind === 'resource_sample' && message.sample?.phase === 'complete');
      if (shouldQueue) {
        displayChain = displayChain
          .then(() => dispatchMessage(message))
          .then(() => waitForDisplay(displayDelayMs(message)))
          .catch(() => undefined);
        return;
      }
      dispatchMessage(message);
    };

    function dispatchMessage(message) {
      if (message.kind === 'intent_parse_started') startIntentParse(message);
      if (message.kind === 'intent_parse_stage') renderIntentStage(message);
      if (message.kind === 'intent_ir_ready') renderIntentIr(message);
      if (message.kind === 'resource_sample') renderResourceSample(message.sample);
      if (message.kind === 'resource_summary') renderResourceSummary(message.summary);
      if (message.kind === 'run_started') resetRun(message);
      if (message.kind === 'event') renderEvent(message);
      if (message.kind === 'run_complete') finishRun(message);
      if (message.kind === 'run_error') finishError(message);
    }

    function displayDelayMs(message) {
      if (message.kind !== 'event') return 0;
      const pace = Number($('demoPace').value) || 0;
      return message.stream === 'pi-agent' ? Math.min(120, Math.round(pace / 3)) : pace;
    }

    function waitForDisplay(ms) {
      return ms > 0 ? new Promise((resolve) => setTimeout(resolve, ms)) : Promise.resolve();
    }

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
          naturalLanguage: naturalLanguage.value,
          demoPaceMs: Number($('demoPace').value)
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
      piTraceSequence = 0;
      piTrace.replaceChildren();
      const traceWaiting = document.createElement('div');
      traceWaiting.className = 'intent-placeholder';
      traceWaiting.textContent = '等待 Pi Agent 与 Runtime 事件… / Waiting for Pi and Runtime events…';
      piTrace.append(traceWaiting);
      piTraceBadge.dataset.source = message.modelResponseSource || 'no_model';
      piTraceBadge.textContent = message.modelResponseSource === 'remote_api'
        ? '真实远端模型 / Real remote model · ' + message.modelId
        : message.modelResponseSource === 'preset_fixture'
          ? '预置响应 / FAUX fixture · no model'
          : '规则路径 / Rules · no model';
      liveResourcePeak = { cpu: 0, rss: 0, heap: 0 };
      resourcePhase.textContent = '启动 / starting';
      resourceCpu.textContent = '0%';
      resourceRss.textContent = '0 MiB';
      resourceHeap.textContent = '0 MiB';
      resourceTokens.textContent = '等待 / waiting';
      resourceModelTime.textContent = '—';
      resourceScope.textContent = message.mode === 'pi-api'
        ? 'Agent 实测；模型服务端不可见 / server hidden'
        : 'Agent 客户端进程 / client process';
      cpuBar.style.width = '0%';
      rssBar.style.width = '0%';
      cpuBarLabel.textContent = '0%';
      rssBarLabel.textContent = '0 MiB';
      setStatus('running', '任务运行中 / Task running');
      setActive('nodeIntent');
    }

    function renderResourceSample(sample) {
      if (!sample) return;
      liveResourcePeak.cpu = Math.max(liveResourcePeak.cpu, Number(sample.processCpuPercent) || 0);
      liveResourcePeak.rss = Math.max(liveResourcePeak.rss, Number(sample.rssMiB) || 0);
      liveResourcePeak.heap = Math.max(liveResourcePeak.heap, Number(sample.heapUsedMiB) || 0);
      resourcePhase.textContent = String(sample.phase || '—').replaceAll('_', ' ');
      resourceCpu.textContent = formatNumber(liveResourcePeak.cpu) + '%';
      resourceRss.textContent = formatNumber(liveResourcePeak.rss) + ' MiB';
      resourceHeap.textContent = formatNumber(liveResourcePeak.heap) + ' MiB';
      cpuBar.style.width = Math.min(100, liveResourcePeak.cpu) + '%';
      rssBar.style.width = Math.min(100, liveResourcePeak.rss / 512 * 100) + '%';
      cpuBarLabel.textContent = formatNumber(liveResourcePeak.cpu) + '%';
      rssBarLabel.textContent = formatNumber(liveResourcePeak.rss) + ' MiB';
    }

    function renderResourceSummary(summary) {
      if (!summary) return;
      resourcePhase.textContent = '完成 / complete';
      resourceCpu.textContent = formatNumber(summary.peakProcessCpuPercent) + '%';
      resourceRss.textContent = formatNumber(summary.peakRssMiB) + ' MiB';
      resourceHeap.textContent = formatNumber(summary.peakHeapUsedMiB) + ' MiB';
      const usage = summary.tokenUsage;
      resourceTokens.textContent = usage ? usage.input + ' / ' + usage.output : 'N/A';
      resourceModelTime.textContent = usage?.modelDurationMs === undefined ? 'N/A' : formatMs(usage.modelDurationMs);
      resourceScope.textContent = summary.modelServerMetrics === 'not_visible_from_api_client'
        ? '仅 Agent 实测 / Agent only · API server N/A'
        : '无真实模型 / No real model';
      resourceCaveat.textContent = (summary.caveats || []).join(' ');
      renderCapacity(summary.capacityEstimate);
    }

    function renderCapacity(estimate) {
      if (!estimate) return;
      $('capacityTops').textContent = '≥ ' + formatNumber(estimate.provisionalChipTops) + ' TOPS';
      $('capacityBandwidth').textContent = '≥ ' + formatNumber(estimate.provisionalMemoryBandwidthGBps) + ' GB/s';
      $('capacityRam').textContent = '≥ ' + formatNumber(estimate.provisionalDedicatedRamGiB) + ' GiB';
      $('capacityStorage').textContent = '≥ ' + formatNumber(estimate.provisionalStorageGiB) + ' GiB';
      $('capacityWeights').textContent = formatNumber(estimate.rawWeightGB) + ' GB';
      $('capacityDecode').textContent = formatNumber(estimate.targetDecodeTokensPerSecond) + ' tok/s';
      $('capacityProfile').textContent = estimate.modelId + ' · ' + estimate.totalParametersB + 'B total · '
        + estimate.precision + ' · context ' + estimate.contextTokens + ' · output ' + estimate.targetOutputTokens
        + ' · budget ' + estimate.inferenceBudgetMs + ' ms · KV ' + formatNumber(estimate.kvCacheMiB) + ' MiB';
    }

    function formatNumber(value) {
      const number = Number(value);
      return Number.isFinite(number) ? (Math.round(number * 100) / 100).toLocaleString() : '—';
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
      renderPiCallStep(message);

      if (event.type === 'MODEL_STARTED' || event.type === 'agent_start') setActive('nodeAgent');
      if (event.type === 'TOOL_DISPATCHED') {
        setActive('nodeDu');
        action.textContent = event.detail?.actionName || '—';
      }
      if (event.type === 'ACTION_ACK') version.textContent = String(event.detail?.configVersion ?? '—');
    }

    function renderPiCallStep(message) {
      const event = message.event || {};
      const isPi = message.stream === 'pi-agent';
      const allowedPi = ['agent_start', 'turn_start', 'message_end', 'tool_execution_start', 'tool_execution_end', 'turn_end', 'agent_end'];
      const allowedRuntime = ['MODEL_STARTED', 'MODEL_COMPLETED', 'PLAN_VALIDATED', 'TOOL_DISPATCHED', 'ACTION_ACK', 'SAFE_NOOP', 'REJECTED'];
      if (isPi && (!allowedPi.includes(event.type) || (event.type === 'message_end' && event.messageRole !== 'assistant'))) return;
      if (!isPi && !allowedRuntime.includes(event.type)) return;
      if (piTrace.querySelector('.intent-placeholder')) piTrace.replaceChildren();

      const labels = {
        MODEL_STARTED: '组装模型请求 / Build model request',
        agent_start: '启动 Pi Agent / Start Pi Agent',
        turn_start: '开始单轮决策 / Begin one-shot turn',
        message_end: '收到模型响应 / Model response received',
        tool_execution_start: '模型生成 Tool Call / Model emitted tool call',
        tool_execution_end: '记录 Proposal / Proposal-only callback',
        turn_end: '结束模型轮次 / Finish model turn',
        agent_end: '结束 Pi Agent / Finish Pi Agent',
        MODEL_COMPLETED: 'Runtime 收到 Action Proposal / Proposal received',
        PLAN_VALIDATED: 'Guardrail 校验通过 / Guardrail accepted',
        TOOL_DISPATCHED: '调用 Station Function / Dispatch function',
        ACTION_ACK: '收到 Function ACK / ACK received',
        SAFE_NOOP: '安全空操作 / SAFE_NOOP',
        REJECTED: '拒绝执行 / Rejected'
      };
      const details = isPi
        ? Object.fromEntries(Object.entries(event).filter(([key]) => !['type', 'elapsedMs'].includes(key)))
        : event.detail || {};
      const step = document.createElement('div');
      step.className = 'call-step';
      step.dataset.source = isPi ? 'pi-agent' : event.source === 'guardrail' ? 'guardrail' : 'runtime';
      const time = document.createElement('time');
      time.textContent = '+' + Math.max(0, Math.round(message.controlElapsedMs ?? event.elapsedMs ?? 0)) + ' ms';
      const heading = document.createElement('div');
      const title = document.createElement('strong');
      title.textContent = labels[event.type] || event.type;
      const source = document.createElement('small');
      source.textContent = (++piTraceSequence) + ' · ' + (isPi ? 'pi-agent' : event.source || 'runtime');
      heading.append(title, source);
      const payload = document.createElement('pre');
      payload.textContent = Object.keys(details).length ? formatStructuredValue(details) : '—';
      step.append(time, heading, payload);
      piTrace.append(step);
      piTrace.scrollTop = piTrace.scrollHeight;
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
