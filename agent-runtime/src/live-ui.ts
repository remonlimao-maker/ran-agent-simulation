export function renderLiveUi(): string {
  return `<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width,initial-scale=1" />
  <meta name="color-scheme" content="light" />
  <title>RAN Agent Two-model Test</title>
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
    button, select, textarea, input { font: inherit; }
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
    .controls { display: grid; grid-template-columns: minmax(0, 1fr); gap: 12px; margin: 28px 0 16px; }
    .control { display: grid; gap: 7px; }
    .intent-control { grid-column: 1 / -1; }
    .run-row { display: flex; align-items: center; justify-content: space-between; gap: 16px; }
    .run-mode { color: var(--muted); font-size: 11px; line-height: 1.5; }
    label { color: var(--muted); font-size: 12px; }
    select, button, textarea, input { border: 1px solid var(--line); border-radius: 12px; background: #ffffff; color: #17252a; }
    select, button, input { min-height: 44px; padding: 0 14px; }
    textarea { width: 100%; min-height: 100px; resize: vertical; padding: 12px 14px; line-height: 1.6; }
    input { width: 100%; min-width: 0; }
    select:focus-visible, button:focus-visible, textarea:focus-visible, input:focus-visible { outline: 3px solid rgba(5, 141, 163, .2); outline-offset: 2px; }
    button { align-self: end; min-width: 160px; border-color: #057d91; background: linear-gradient(135deg, #079bb2, #057d91); color: #ffffff; font-weight: 800; cursor: pointer; box-shadow: 0 8px 20px rgba(5, 125, 145, .18); }
    button:disabled { opacity: .45; cursor: wait; }
    .dual-model-section { margin: 0 0 16px; border: 1px solid #b9dde2; border-radius: 18px; padding: 16px; background: rgba(247, 252, 252, .96); box-shadow: 0 12px 34px rgba(30, 74, 82, .055); }
    .dual-model-head { display: flex; justify-content: space-between; gap: 14px; align-items: baseline; margin-bottom: 12px; }
    .dual-model-head h2 { margin: 0; font-size: 16px; }
    .dual-model-head span { color: var(--muted); font-size: 10px; }
    .dual-flow { display: grid; grid-template-columns: minmax(0, 1fr) auto minmax(170px, .55fr) auto minmax(0, 1fr); gap: 10px; align-items: stretch; margin-bottom: 12px; }
    .flow-agent, .flow-contract { min-width: 0; border: 1px solid #d8e7e9; border-radius: 13px; padding: 12px; background: #ffffff; }
    .flow-agent[data-role="intent"] { border-left: 4px solid #1674a8; }
    .flow-agent[data-role="station"] { border-left: 4px solid #7554c9; }
    .flow-agent span, .flow-contract span { display: block; color: var(--muted); font-size: 9px; text-transform: uppercase; letter-spacing: .08em; }
    .flow-agent strong, .flow-contract strong { display: block; margin-top: 5px; font-size: 13px; overflow-wrap: anywhere; }
    .flow-agent small, .flow-contract small { display: block; margin-top: 5px; color: var(--muted); font-size: 10px; line-height: 1.45; white-space: pre-line; }
    .flow-contract { text-align: center; background: #f8fbfc; }
    .flow-arrow { align-self: center; color: #789198; font-weight: 800; }
    .model-configs { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
    .api-config { min-width: 0; border: 1px solid #d7e5e7; border-radius: 14px; padding: 14px; background: #ffffff; }
    .api-config[data-role="intent"] { box-shadow: inset 3px 0 #1674a8; }
    .api-config[data-role="station"] { box-shadow: inset 3px 0 #7554c9; }
    .api-config-head { display: flex; align-items: baseline; justify-content: space-between; gap: 12px; margin-bottom: 12px; }
    .api-config-head h2 { margin: 0; font-size: 15px; }
    .api-config-state { display: inline-flex; border: 1px solid #edcc98; border-radius: 999px; padding: 5px 9px; background: #fff7e9; color: #89550a; font-size: 10px; font-weight: 800; }
    .api-config-state[data-configured="true"] { border-color: #9dd9be; background: #edf9f3; color: #126a4c; }
    .api-config-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; align-items: end; }
    .api-config-grid .endpoint { grid-column: 1 / -1; }
    .api-config-grid button { grid-column: 1 / -1; }
    .api-config-message { min-height: 16px; margin: 9px 0 0; color: var(--muted); font-size: 10px; line-height: 1.5; }
    .api-config-message[data-state="error"] { color: var(--red); }
    .api-config-message[data-state="success"] { color: var(--green); }
    .core-results { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 16px; margin: 0 0 16px; }
    .result-card { min-width: 0; border: 1px solid #cfe1e4; background: rgba(250, 253, 253, .96); border-radius: 16px; padding: 16px; box-shadow: 0 12px 34px rgba(30, 74, 82, .055); }
    .result-card[data-step="1"] { border-top: 4px solid #1674a8; }
    .result-card[data-step="2"] { border-top: 4px solid #7554c9; }
    .result-card[data-step="3"] { border-top: 4px solid var(--green); }
    .result-head { display: flex; justify-content: space-between; gap: 12px; align-items: flex-start; margin-bottom: 10px; }
    .result-head h2 { margin: 0; font-size: 15px; }
    .result-state { color: var(--muted); font-size: 10px; text-align: right; overflow-wrap: anywhere; }
    .result-output { min-height: 250px; max-height: 410px; overflow: auto; margin: 0; border: 1px solid #dce8ea; border-radius: 10px; padding: 11px 12px; background: #ffffff; color: #284148; font: 11px/1.55 ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; white-space: pre-wrap; overflow-wrap: anywhere; }
    .observability { margin: 0 0 16px; border: 1px solid #b9dbe0; border-radius: 18px; padding: 18px; background: rgba(255, 255, 255, .96); box-shadow: 0 14px 42px rgba(30, 74, 82, .08); }
    .observability-head { display: flex; align-items: baseline; justify-content: space-between; gap: 16px; margin-bottom: 14px; }
    .observability-head h2 { margin: 0; font-size: 18px; }
    .observability-head p { margin: 0; color: var(--muted); font-size: 13px; }
    .journey { display: grid; grid-template-columns: repeat(6, minmax(0, 1fr)); gap: 9px; margin-bottom: 14px; }
    .journey-step { position: relative; min-width: 0; min-height: 92px; border: 1px solid #dce7e9; border-radius: 13px; padding: 12px; background: #f8fbfb; }
    .journey-step > span { display: inline-flex; align-items: center; gap: 6px; color: var(--muted); font-size: 12px; font-weight: 750; }
    .journey-step > span::before { content: ''; width: 8px; height: 8px; flex: 0 0 8px; border-radius: 50%; background: #aebdc1; }
    .journey-step strong { display: block; margin-top: 9px; font-size: 14px; line-height: 1.3; }
    .journey-step small { display: block; margin-top: 5px; color: var(--muted); font-size: 12px; line-height: 1.35; overflow-wrap: anywhere; }
    .journey-step[data-state="running"] { border-color: #71c7d3; background: #edf9fb; box-shadow: inset 0 0 20px rgba(5, 141, 163, .07); }
    .journey-step[data-state="running"] > span::before { background: var(--cyan); animation: pulse 1s infinite; }
    .journey-step[data-state="done"] { border-color: #9dd9be; background: #f0faf5; }
    .journey-step[data-state="done"] > span::before { background: var(--green); }
    .journey-step[data-state="failed"] { border-color: #e2bd86; background: #fff7eb; }
    .journey-step[data-state="failed"] > span::before { background: var(--amber); }
    .journey-step[data-state="skipped"] { opacity: .58; }
    .observation-grid { display: grid; grid-template-columns: minmax(0, .9fr) minmax(0, 1.1fr); gap: 14px; }
    .live-chart-card, .reading-card { min-width: 0; border: 1px solid #dce7e9; border-radius: 14px; padding: 14px; background: #fbfdfd; }
    .observation-card-head { display: flex; align-items: baseline; justify-content: space-between; gap: 12px; margin-bottom: 10px; }
    .observation-card-head strong { font-size: 15px; }
    .observation-card-head span { color: var(--muted); font-size: 12px; text-align: right; }
    .quick-budget { display: grid; grid-template-columns: auto minmax(0, 1fr) auto; align-items: center; gap: 10px; margin-bottom: 10px; }
    .quick-budget strong { font-size: 20px; }
    .quick-budget span { color: var(--muted); font-size: 12px; }
    .quick-budget-track { height: 8px; overflow: hidden; border-radius: 99px; background: #dfeaec; }
    .quick-budget-track > span { display: block; width: 0%; height: 100%; background: linear-gradient(90deg, var(--cyan), var(--green)); transition: width .12s linear; }
    .chart-wrap { position: relative; min-height: 170px; border: 1px solid #e1eaec; border-radius: 11px; overflow: hidden; background: linear-gradient(#ffffff, #f7fbfb); }
    .utilization-chart { display: block; width: 100%; height: 170px; }
    .chart-grid-line { stroke: #e2eaec; stroke-width: .6; vector-effect: non-scaling-stroke; }
    .chart-line { fill: none; stroke-width: 2.4; vector-effect: non-scaling-stroke; stroke-linecap: round; stroke-linejoin: round; }
    .chart-line.cpu { stroke: #1674a8; }
    .chart-line.gpu { stroke: #7554c9; }
    .chart-empty { position: absolute; inset: 0; display: grid; place-items: center; padding: 20px; color: var(--muted); font-size: 13px; text-align: center; }
    .chart-legend { display: flex; flex-wrap: wrap; gap: 14px; margin-top: 9px; color: var(--muted); font-size: 12px; }
    .chart-legend span { display: inline-flex; align-items: center; gap: 6px; }
    .chart-legend i { width: 18px; height: 3px; border-radius: 99px; background: #1674a8; }
    .chart-legend span:nth-child(2) i { background: #7554c9; }
    .run-verdict { margin: 0 0 12px; border-left: 4px solid var(--cyan); border-radius: 0 10px 10px 0; padding: 11px 12px; background: #eef8fa; color: #294950; font-size: 14px; line-height: 1.5; }
    .run-verdict[data-state="succeeded"] { border-left-color: var(--green); background: #edf9f3; }
    .run-verdict[data-state="failed"] { border-left-color: var(--amber); background: #fff7eb; }
    .quick-group { margin-top: 12px; }
    .quick-group-head { display: flex; align-items: center; gap: 8px; margin-bottom: 8px; font-size: 13px; font-weight: 800; }
    .provenance { display: inline-flex; border-radius: 999px; padding: 3px 7px; font-size: 11px; }
    .provenance.measured { color: #126a4c; background: #e7f7ef; }
    .provenance.derived { color: #6845ad; background: #f0eafb; }
    .provenance.estimated { color: #8a5a10; background: #fff2dc; }
    .quick-metrics { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 8px; }
    .quick-metric { min-width: 0; border: 1px solid #e1e9eb; border-radius: 10px; padding: 9px; background: #ffffff; }
    .quick-metric span { display: block; color: var(--muted); font-size: 11px; line-height: 1.3; }
    .quick-metric strong { display: block; margin-top: 5px; font-size: 15px; overflow-wrap: anywhere; }
    details.advanced-settings, details.advanced-lab { margin: 0 0 16px; border: 1px solid var(--line); border-radius: 14px; background: rgba(255, 255, 255, .78); }
    details.advanced-settings > summary, details.advanced-lab > summary { padding: 12px 14px; color: var(--muted); font-size: 12px; font-weight: 750; cursor: pointer; }
    .advanced-options { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 12px; padding: 0 14px 14px; }
    .advanced-body { padding: 2px 14px 14px; }
    .advanced-body > :first-child { margin-top: 0; }
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
    .trace-badge[data-source="local_model"] { border-color: #80c8d5; background: #eaf8fb; color: #126172; }
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
      .controls { grid-template-columns: 1fr; }
      .run-row { align-items: stretch; flex-direction: column; }
      button { grid-column: 1 / -1; }
      .api-config-grid { grid-template-columns: 1fr; }
      .api-config-grid button { grid-column: 1; }
      .api-config-grid .endpoint { grid-column: 1; }
      .dual-flow { grid-template-columns: 1fr; }
      .flow-arrow { transform: rotate(90deg); text-align: center; }
      .model-configs { grid-template-columns: 1fr; }
      .core-results { grid-template-columns: 1fr; }
      .observability-head { display: block; }
      .observability-head p { margin-top: 6px; }
      .journey { grid-template-columns: repeat(2, minmax(0, 1fr)); }
      .observation-grid { grid-template-columns: 1fr; }
      .quick-metrics { grid-template-columns: repeat(2, minmax(0, 1fr)); }
      .advanced-options { grid-template-columns: 1fr; }
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
        <div class="eyebrow">双模型最小实验 / Minimal two-model experiment</div>
        <h1>RAN Agent 双模型测试 <span lang="en">/ Two-model test</span></h1>
        <p class="lede">只验证两件事：大模型能否把客户自然语言翻译成正确的 Intent JSON；基站小模型能否通过 Pi Agent 生成 Tool Call，并调用本地模拟 Function。<span class="lede-en" lang="en">Test only two things: large-model intent translation and small-model tool invocation through Pi Agent.</span></p>
      </div>
      <div class="status" id="status" data-state="connecting"><span class="dot"></span><span id="statusText">正在连接 SSE / Connecting</span></div>
    </div>

    <section class="controls" aria-label="Run controls">
      <div class="control intent-control">
        <label for="naturalLanguage">客户自然语言意图 / Customer intent</label>
        <textarea id="naturalLanguage" maxlength="1200">请将 gnb-001 的 cell-01 设为低功耗模式，目标降低能耗 15%，但下行 P95 吞吐不得低于 50 Mbps，RRC 成功率不得低于 99%，并在 1 秒内完成执行确认。</textarea>
      </div>
      <div class="run-row"><span class="run-mode" id="runModeSummary">当前为演示模式；配置两套 API 后自动切换为真实双模型测试。</span><button type="button" id="run">运行演示 / Run demo</button></div>
    </section>

    <section class="dual-model-section" aria-labelledby="dualModelTitle">
      <div class="dual-model-head"><h2 id="dualModelTitle">两个模型 / Two models</h2><span>大模型翻译，小模型调用工具 / translate → invoke</span></div>
      <div class="dual-flow">
        <div class="flow-agent" data-role="intent"><span>① 网管侧 / Management</span><strong>Intent Agent · 大模型 / Large model</strong><small id="intentLaneModel">当前：合成解析器，无模型推理<br />Natural language → Intent semantics</small></div>
        <div class="flow-arrow">→</div>
        <div class="flow-contract"><span>受控契约 / Contract</span><strong>Intent IR v0.1</strong><small>Schema + validity + action allowlist</small></div>
        <div class="flow-arrow">→</div>
        <div class="flow-agent" data-role="station"><span>② 基站侧 / Station</span><strong>Pi Agent · 本地轻量模型 / Local ≈0.8B</strong><small id="stationLaneModel">当前：本机 Qwen3-0.6B<br />Intent IR → Tool Call</small></div>
      </div>
      <div class="model-configs">
        <article class="api-config" data-role="intent" aria-labelledby="intentApiConfigTitle">
          <div class="api-config-head"><h2 id="intentApiConfigTitle">① 网管大模型 API / Management LLM</h2><span class="api-config-state" id="intentApiConfigState" data-configured="false">未配置 / Not configured</span></div>
          <div class="api-config-grid">
            <div class="control endpoint"><label for="intentApiBaseUrl">OpenAI-compatible Base URL</label><input id="intentApiBaseUrl" type="url" inputmode="url" spellcheck="false" placeholder="网管侧大模型 /v1 endpoint" /></div>
            <div class="control"><label for="intentApiModelId">大模型 ID / Large model ID</label><input id="intentApiModelId" type="text" spellcheck="false" value="Qwen/Qwen3-8B" /></div>
            <div class="control"><label for="intentApiKey">API Key（可选）</label><input id="intentApiKey" type="password" autocomplete="new-password" spellcheck="false" placeholder="仅当前进程内存" /></div>
            <button type="button" id="saveIntentApiConfig">保存网管模型配置 / Apply management model</button>
          </div>
          <p class="api-config-message" id="intentApiConfigMessage">负责自然语言 → 结构化 Intent IR；模型输出仍须通过确定性 Schema 校验。</p>
        </article>
        <article class="api-config" data-role="station" aria-labelledby="stationApiConfigTitle">
          <div class="api-config-head"><h2 id="stationApiConfigTitle">② 基站本地小模型 / Local station model</h2><span class="api-config-state" id="stationApiConfigState" data-configured="false">正在检测 / Detecting</span></div>
          <div class="api-config-grid">
            <div class="control endpoint"><label for="stationApiBaseUrl">本机推理地址 / Local endpoint</label><input id="stationApiBaseUrl" type="url" inputmode="url" spellcheck="false" value="http://127.0.0.1:11434/v1" /></div>
            <div class="control"><label for="stationApiModelId">小模型 ID / Small model ID</label><input id="stationApiModelId" type="text" spellcheck="false" value="qwen3:0.6b" /></div>
            <div class="control"><label for="stationApiKey">API Key（本机无需）</label><input id="stationApiKey" type="password" autocomplete="new-password" spellcheck="false" placeholder="Ollama 本机无需填写" /></div>
            <button type="button" id="saveStationApiConfig">连接本机模型 / Connect local model</button>
          </div>
          <p class="api-config-message" id="stationApiConfigMessage">本机 Qwen3-0.6B 负责 Intent IR → Pi Tool Call；采集模型驻留内存、GPU 利用率与实测时延。</p>
        </article>
      </div>
      <p class="capacity-note">网管远程大模型需要 Key；本机 Ollama 小模型无需 Key。任何填写的 Key 只保存在当前进程内存，不写入文件、浏览器存储或 Git。</p>
    </section>

    <section class="core-results" aria-label="Core two-model results">
      <article class="result-card" data-step="1" aria-labelledby="intentIrTitle">
        <div class="result-head"><h2 id="intentIrTitle">① 大模型输出：Intent JSON</h2><span class="result-state" id="parseState">等待输入 / Waiting</span></div>
        <pre class="result-output" id="intentJson">等待大模型翻译客户意图… / Waiting for intent translation…</pre>
      </article>
      <article class="result-card" data-step="2" aria-labelledby="toolCallTitle">
        <div class="result-head"><h2 id="toolCallTitle">② 小模型输出：Tool Call</h2><span class="trace-badge" id="piTraceBadge" data-source="idle">等待任务 / Waiting</span></div>
        <pre class="result-output" id="toolCallJson">等待基站小模型通过 Pi Agent 生成工具调用… / Waiting for Pi tool call…</pre>
      </article>
      <article class="result-card" data-step="3" aria-labelledby="toolResultTitle">
        <div class="result-head"><h2 id="toolResultTitle">③ 模拟工具执行结果</h2><span class="result-state" id="toolResultState">等待调用 / Waiting</span></div>
        <pre class="result-output" id="toolResultJson">等待本地 Station Function 返回 ACTION_ACK… / Waiting for simulated function…</pre>
      </article>
    </section>

    <section class="observability" aria-labelledby="observabilityTitle">
      <div class="observability-head">
        <h2 id="observabilityTitle">本次运行怎么看 / Live execution observability</h2>
        <p>先看调用链是否走通，再看实测资源，最后看芯片设计量。</p>
      </div>

      <div class="journey" aria-label="Model and tool call chain">
        <div class="journey-step" id="journeyManagement" data-state="waiting"><span>等待 / Waiting</span><strong>网管大模型</strong><small>自然语言 → 结构化语义</small></div>
        <div class="journey-step" id="journeyIntent" data-state="waiting"><span>等待 / Waiting</span><strong>Intent IR</strong><small>Schema、时限与动作白名单</small></div>
        <div class="journey-step" id="journeyGuardrail" data-state="waiting"><span>等待 / Waiting</span><strong>基站安全检查</strong><small>遥测、目标与约束校验</small></div>
        <div class="journey-step" id="journeyModel" data-state="waiting"><span>等待 / Waiting</span><strong>Pi Agent + 小模型</strong><small>Intent IR → Action Proposal</small></div>
        <div class="journey-step" id="journeyTool" data-state="waiting"><span>等待 / Waiting</span><strong>Tool Call</strong><small>工具名与参数必须真实产生</small></div>
        <div class="journey-step" id="journeyFunction" data-state="waiting"><span>等待 / Waiting</span><strong>Function + ACK</strong><small>模拟基站函数实际执行确认</small></div>
      </div>

      <div class="observation-grid">
        <article class="live-chart-card">
          <div class="observation-card-head"><strong>推理过程 / Utilization over time</strong><span id="quickPhase">等待任务 / Waiting</span></div>
          <div class="quick-budget">
            <strong id="quickElapsed">0 ms</strong>
            <div class="quick-budget-track" aria-hidden="true"><span id="quickBudgetFill"></span></div>
            <span id="quickSla">/ 1,000 ms SLA</span>
          </div>
          <div class="chart-wrap">
            <svg class="utilization-chart" viewBox="0 0 100 100" preserveAspectRatio="none" role="img" aria-label="Agent CPU and Mac GPU utilization chart">
              <line class="chart-grid-line" x1="0" y1="25" x2="100" y2="25"></line>
              <line class="chart-grid-line" x1="0" y1="50" x2="100" y2="50"></line>
              <line class="chart-grid-line" x1="0" y1="75" x2="100" y2="75"></line>
              <polyline class="chart-line cpu" id="cpuChartLine" points=""></polyline>
              <polyline class="chart-line gpu" id="gpuChartLine" points=""></polyline>
            </svg>
            <div class="chart-empty" id="chartEmpty">运行后实时绘制 CPU / GPU 采样。<br />曲线是过程，下面的数字是峰值与终值。</div>
          </div>
          <div class="chart-legend"><span><i></i>Agent CPU（Node 进程）</span><span><i></i>Mac GPU（系统级采样）</span><span id="chartWindow">时间窗 / Window —</span></div>
        </article>

        <article class="reading-card">
          <div class="observation-card-head"><strong>本次结论 / What to read</strong><span>数值来源必须分开看</span></div>
          <p class="run-verdict" id="runVerdict">运行后这里会直接说明：卡在意图解析、小模型推理、Tool Call，还是 Function ACK。</p>

          <div class="quick-group">
            <div class="quick-group-head"><span class="provenance measured">实测 / Measured</span>这次机器真实观察到的量</div>
            <div class="quick-metrics">
              <div class="quick-metric"><span>模型耗时</span><strong id="quickModelTime">—</strong></div>
              <div class="quick-metric"><span>Token 输入 / 输出</span><strong id="quickTokens">—</strong></div>
              <div class="quick-metric"><span>GPU 峰值</span><strong id="quickGpu">—</strong></div>
              <div class="quick-metric"><span>模型驻留内存</span><strong id="quickModelMemory">—</strong></div>
            </div>
          </div>

          <div class="quick-group">
            <div class="quick-group-head"><span class="provenance derived">推导 / Derived</span>由本次 Token 吞吐换算，不是芯片峰值</div>
            <div class="quick-metrics">
              <div class="quick-metric"><span>输出速度</span><strong id="quickOutputRate">—</strong></div>
              <div class="quick-metric"><span>工作负载等效算力</span><strong id="quickEffectiveTops">—</strong></div>
              <div class="quick-metric"><span>工作负载等效带宽</span><strong id="quickEffectiveBandwidth">—</strong></div>
              <div class="quick-metric"><span>量化格式</span><strong id="quickQuantization">—</strong></div>
            </div>
          </div>

          <div class="quick-group">
            <div class="quick-group-head"><span class="provenance estimated">设计估算 / Sizing</span>满足目标 SLA 的初步芯片下限</div>
            <div class="quick-metrics">
              <div class="quick-metric"><span>建议 INT4 TOPS</span><strong id="quickCapacityTops">—</strong></div>
              <div class="quick-metric"><span>建议内存带宽</span><strong id="quickCapacityBandwidth">—</strong></div>
              <div class="quick-metric"><span>建议模型 RAM</span><strong id="quickCapacityRam">—</strong></div>
              <div class="quick-metric"><span>建议模型存储</span><strong id="quickCapacityStorage">—</strong></div>
            </div>
          </div>
        </article>
      </div>
    </section>

    <details class="advanced-settings">
      <summary>高级测试选项 / Advanced test options</summary>
      <div class="advanced-options">
        <div class="control"><label for="intentMode">网管解析方式 / Intent mode</label><select id="intentMode"><option value="synthetic">演示解析器（无模型）</option><option value="intent-api" id="intentApiModeOption">远端大模型 API（未配置）</option></select></div>
        <div class="control"><label for="mode">基站决策方式 / Station mode</label><select id="mode"><option value="pi-api" id="stationApiModeOption">本机 Qwen3-0.6B</option><option value="pi-faux">Pi faux（无模型）</option><option value="rules">规则对照（高级）</option></select></div>
        <div class="control"><label for="scenario">故障场景 / Scenario</label><select id="scenario"><option value="success">正常成功 / Success</option><option value="model_timeout">模型超时 / Model timeout</option><option value="du_timeout">工具超时 / Function timeout</option></select></div>
        <div class="control"><label for="demoPace">展示速度 / Display pace</label><select id="demoPace"><option value="0">实时 / Real-time</option><option value="120">快速 / Fast</option><option value="300" selected>标准 / Standard</option><option value="700">慢速 / Slow</option></select></div>
      </div>
    </details>

    <details class="advanced-lab">
      <summary>高级信息：完整解析阶段、Pi 轨迹、时延与资源 / Advanced details</summary>
      <div class="advanced-body">
        <section class="intent-panel" aria-labelledby="parseTraceTitle">
          <div class="intent-panel-head"><h2 id="parseTraceTitle">大模型解析阶段 / Intent parsing stages</h2><span>操作轨迹 / operational trace</span></div>
          <div class="parse-trace" id="parseTrace"><div class="intent-placeholder">运行任务后显示详细解析阶段。 / Detailed stages appear after a run.</div></div>
        </section>

    <section class="budget" aria-label="Control deadline">
      <div class="budget-head"><div><div class="eyebrow">基站控制 / Station control · Intent → Function ACK</div><strong id="elapsed">0 ms</strong></div><strong id="slaLabel">1,000 ms SLA</strong></div>
      <div class="budget-track"><div class="budget-fill" id="budgetFill"></div><div class="deadline"></div></div>
      <div class="budget-labels"><span id="phase">等待任务 / Waiting</span><span id="reserve">剩余 / Reserve 1,000 ms</span></div>
    </section>

    <div class="resource-grid">
      <section class="resource-card" aria-labelledby="resourceLiveTitle">
        <div class="resource-head"><h2 id="resourceLiveTitle">② 基站阶段运行资源 / Station-stage resources</h2><span id="resourceScope">Agent 客户端进程 / client process</span></div>
        <div class="resource-metrics">
          <div class="resource-metric"><span>阶段 / Phase</span><strong id="resourcePhase">—</strong></div>
          <div class="resource-metric"><span>CPU 峰值 / Peak</span><strong id="resourceCpu">—</strong></div>
          <div class="resource-metric"><span>RSS 峰值 / Peak</span><strong id="resourceRss">—</strong></div>
          <div class="resource-metric"><span>Heap 峰值 / Peak</span><strong id="resourceHeap">—</strong></div>
          <div class="resource-metric"><span>Token 输入/输出 / I/O</span><strong id="resourceTokens">—</strong></div>
          <div class="resource-metric"><span>模型耗时 / Model time</span><strong id="resourceModelTime">—</strong></div>
          <div class="resource-metric"><span>GPU 采样峰值 / Sampled peak</span><strong id="resourceGpu">—</strong></div>
          <div class="resource-metric"><span>模型驻留 / Resident</span><strong id="resourceModelMemory">—</strong></div>
          <div class="resource-metric"><span>实测吞吐 / Output rate</span><strong id="resourceOutputRate">—</strong></div>
          <div class="resource-metric"><span>工作负载等效算力 / Effective TOPS</span><strong id="resourceEffectiveTops">—</strong></div>
          <div class="resource-metric"><span>工作负载等效带宽 / Weight BW</span><strong id="resourceEffectiveBandwidth">—</strong></div>
          <div class="resource-metric"><span>量化 / Quantization</span><strong id="resourceQuantization">—</strong></div>
        </div>
        <div class="resource-bars">
          <div><div class="resource-bar-head"><span>单核 CPU / one-core scale</span><span id="cpuBarLabel">0%</span></div><div class="resource-bar"><span id="cpuBar"></span></div></div>
          <div><div class="resource-bar-head"><span>Agent RSS / 512 MiB reference</span><span id="rssBarLabel">0 MiB</span></div><div class="resource-bar"><span id="rssBar"></span></div></div>
        </div>
        <p class="capacity-note" id="resourceCaveat">本机模式分别采样 Agent、Ollama 模型驻留内存与系统 GPU；有效 TOPS 和带宽是由本次实测吞吐推导的工作负载等效值，不是芯片峰值计数器。</p>
      </section>

      <section class="resource-card" aria-labelledby="capacityTitle">
        <div class="resource-head"><h2 id="capacityTitle">② 基站小模型芯片容量规划 / Station capacity</h2><span>分析估算，非本次实测 / analytical</span></div>
        <div class="resource-metrics">
          <div class="resource-metric"><span>INT4 算力 / TOPS</span><strong id="capacityTops">—</strong></div>
          <div class="resource-metric"><span>内存带宽 / Bandwidth</span><strong id="capacityBandwidth">—</strong></div>
          <div class="resource-metric"><span>专用 RAM / Dedicated</span><strong id="capacityRam">—</strong></div>
          <div class="resource-metric"><span>双槽存储 / Storage</span><strong id="capacityStorage">—</strong></div>
          <div class="resource-metric"><span>原始权重 / Raw weights</span><strong id="capacityWeights">—</strong></div>
          <div class="resource-metric"><span>目标解码 / Decode</span><strong id="capacityDecode">—</strong></div>
        </div>
        <p class="capacity-note" id="capacityProfile">默认规划：约 0.8B 总参数、INT4、512-token 上下文、32-token 输出、800 ms 推理预算；总控制时限 1 s。</p>
        <p class="capacity-note" data-warning="true">TOPS 与带宽是带效率和余量的初步筛选值；最终选型必须用同一量化文件、推理后端和目标芯片复测 P95/P99 与功耗。<br /><span lang="en">These are screening estimates; final sizing requires the exact quantization, backend, and target silicon.</span></p>
      </section>
    </div>

    <section class="call-panel" aria-labelledby="piTraceTitle">
      <div class="resource-head"><h2 id="piTraceTitle">基站 Pi Agent 完整轨迹 / Full execution trace</h2><span>高级信息 / advanced</span></div>
      <p class="capacity-note">展示模型输入摘要、工具 Schema、实际 tool call 参数、Proposal、Guardrail 和 Function ACK；不展示隐藏思维链。<br /><span lang="en">Shows the model request summary, tool schemas, actual tool-call arguments, proposal, guardrail, and Function ACK—never hidden reasoning.</span></p>
      <div class="call-trace" id="piTrace"><div class="intent-placeholder">运行任务后显示真实框架调用轨迹；Pi API 模式会调用本机 Ollama 或配置的远程模型。<br /><span lang="en">Run a task to inspect the real framework trace; Pi API calls local Ollama or the configured remote model.</span></div></div>
    </section>

    <div class="grid">
      <section class="panel">
        <h2>执行拓扑 / Execution topology</h2>
        <div class="topology">
          <div class="node" id="nodeInput"><strong>自然语言 / Natural language</strong><small>运营请求 / operator request</small></div><div class="arrow">→</div>
          <div class="node" id="nodeIntent"><strong>网管 Intent Agent / 大模型</strong><small>Natural language → Intent IR</small></div><div class="arrow">→</div>
          <div class="node" id="nodeAgent"><strong>基站 Pi Agent / ≈0.8B</strong><small>Intent IR → one proposal</small></div><div class="arrow">→</div>
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
      </div>
    </details>
  </main>
  <script>
    const $ = (id) => document.getElementById(id);
    const status = $('status');
    const statusText = $('statusText');
    const runButton = $('run');
    const runModeSummary = $('runModeSummary');
    const events = $('events');
    const elapsed = $('elapsed');
    const fill = $('budgetFill');
    const reserve = $('reserve');
    const phase = $('phase');
    const terminal = $('terminal');
    const action = $('action');
    const version = $('version');
    const quickElapsed = $('quickElapsed');
    const quickBudgetFill = $('quickBudgetFill');
    const quickSla = $('quickSla');
    const quickPhase = $('quickPhase');
    const runVerdict = $('runVerdict');
    const cpuChartLine = $('cpuChartLine');
    const gpuChartLine = $('gpuChartLine');
    const chartEmpty = $('chartEmpty');
    const chartWindow = $('chartWindow');
    const naturalLanguage = $('naturalLanguage');
    const parseTrace = $('parseTrace');
    const parseState = $('parseState');
    const intentJson = $('intentJson');
    const toolCallJson = $('toolCallJson');
    const toolResultJson = $('toolResultJson');
    const toolResultState = $('toolResultState');
    const resourcePhase = $('resourcePhase');
    const resourceCpu = $('resourceCpu');
    const resourceRss = $('resourceRss');
    const resourceHeap = $('resourceHeap');
    const resourceTokens = $('resourceTokens');
    const resourceModelTime = $('resourceModelTime');
    const resourceGpu = $('resourceGpu');
    const resourceModelMemory = $('resourceModelMemory');
    const resourceOutputRate = $('resourceOutputRate');
    const resourceEffectiveTops = $('resourceEffectiveTops');
    const resourceEffectiveBandwidth = $('resourceEffectiveBandwidth');
    const resourceQuantization = $('resourceQuantization');
    const resourceScope = $('resourceScope');
    const resourceCaveat = $('resourceCaveat');
    const cpuBar = $('cpuBar');
    const cpuBarLabel = $('cpuBarLabel');
    const rssBar = $('rssBar');
    const rssBarLabel = $('rssBarLabel');
    const piTrace = $('piTrace');
    const piTraceBadge = $('piTraceBadge');
    const intentModeSelect = $('intentMode');
    const modeSelect = $('mode');
    const configUi = {
      intent: {
        baseUrl: $('intentApiBaseUrl'),
        modelId: $('intentApiModelId'),
        apiKey: $('intentApiKey'),
        save: $('saveIntentApiConfig'),
        state: $('intentApiConfigState'),
        message: $('intentApiConfigMessage'),
        defaultModelId: 'Qwen/Qwen3-8B'
      },
      station: {
        baseUrl: $('stationApiBaseUrl'),
        modelId: $('stationApiModelId'),
        apiKey: $('stationApiKey'),
        save: $('saveStationApiConfig'),
        state: $('stationApiConfigState'),
        message: $('stationApiConfigMessage'),
        defaultModelId: 'qwen3:0.6b'
      }
    };
    let piTraceSequence = 0;
    let stationModelStarted = false;
    let stationToolCallReceived = false;
    let currentControlDeadlineMs = 1_000;
    let utilizationSeries = { cpu: [], gpu: [] };
    let liveResourcePeak = { cpu: 0, rss: 0, heap: 0 };
    let liveLocalPeak = { gpu: 0, modelMemory: 0 };
    const modelConfigs = {
      intent: { configured: false, modelId: 'Qwen/Qwen3-8B', apiKeyConfigured: false },
      station: { configured: true, baseUrl: 'http://127.0.0.1:11434/v1', modelId: 'qwen3:0.6b', apiKeyConfigured: false }
    };
    let running = false;

    fetch('/api/health').then((response) => response.json()).then((health) => {
      if (health.capacityEstimate) renderCapacity(health.capacityEstimate);
    }).catch(() => undefined);
    ['intent', 'station'].forEach((role) => {
      fetch('/api/model-config?role=' + role).then((response) => response.json()).then((config) => renderModelConfig(role, config)).catch(() => {
        configUi[role].message.dataset.state = 'error';
        configUi[role].message.textContent = '无法读取模型 API 配置 / Could not load model API configuration';
      });
    });

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
      if (message.kind === 'local_resource_sample') renderLocalResourceSample(message.sample);
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

    configUi.intent.save.addEventListener('click', () => saveModelConfig('intent'));
    configUi.station.save.addEventListener('click', () => saveModelConfig('station'));
    intentModeSelect.addEventListener('change', renderSelectedModelLanes);
    modeSelect.addEventListener('change', renderSelectedModelLanes);

    async function saveModelConfig(role) {
      if (running) return;
      const ui = configUi[role];
      ui.save.disabled = true;
      ui.message.dataset.state = '';
      ui.message.textContent = '正在保存到当前服务进程… / Applying to this server process…';
      const payload = {
        role,
        baseUrl: ui.baseUrl.value.trim(),
        modelId: ui.modelId.value.trim()
      };
      if (ui.apiKey.value.trim()) payload.apiKey = ui.apiKey.value.trim();
      try {
        const response = await fetch('/api/model-config', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify(payload)
        });
        const body = await response.json().catch(() => ({ error: response.statusText }));
        if (!response.ok) throw new Error(body.error || 'Configuration rejected');
        renderModelConfig(role, body);
        if (role === 'intent') intentModeSelect.value = 'intent-api';
        else modeSelect.value = 'pi-api';
        renderSelectedModelLanes();
        ui.message.dataset.state = 'success';
        ui.message.textContent = '配置已应用到当前进程；Key 不会持久化。 / Applied for this process; the key is not persisted.';
        setStatus('ready', role === 'intent' ? '网管大模型已配置 / Management LLM configured' : '基站小模型已配置 / Station model configured');
      } catch (error) {
        ui.message.dataset.state = 'error';
        ui.message.textContent = error instanceof Error ? error.message : String(error);
        setStatus('rejected', '模型 API 配置失败 / Configuration rejected');
      } finally {
        ui.apiKey.value = '';
        ui.save.disabled = false;
      }
    }

    function isLocalConfig(config) {
      try {
        const hostname = new URL(config.baseUrl).hostname;
        return hostname === 'localhost' || hostname.endsWith('.localhost') || hostname === '127.0.0.1' || hostname === '[::1]';
      } catch {
        return false;
      }
    }

    function renderModelConfig(role, config) {
      modelConfigs[role] = config;
      const ui = configUi[role];
      ui.baseUrl.value = config.baseUrl || '';
      ui.modelId.value = config.modelId || ui.defaultModelId;
      ui.apiKey.value = '';
      ui.apiKey.placeholder = config.apiKeyConfigured
        ? '已配置；留空保持 / configured; blank keeps it'
        : role === 'station' && isLocalConfig(config)
          ? 'Ollama 本机无需填写 / not required locally'
          : '可选；仅当前进程内存 / optional; memory only';
      ui.state.dataset.configured = String(Boolean(config.configured));
      ui.state.textContent = config.configured
        ? '已配置 / Configured · ' + config.modelId
        : '未配置 / Not configured';
      if (role === 'intent') {
        if (config.configured) intentModeSelect.value = 'intent-api';
        $('intentApiModeOption').textContent = config.configured
          ? '真实大模型 · ' + config.modelId
          : '远端大模型 API（未配置）';
      } else {
        if (config.configured) modeSelect.value = 'pi-api';
        $('stationApiModeOption').textContent = config.configured
          ? (isLocalConfig(config) ? '本机真实模型 · ' : '远端真实模型 · ') + config.modelId
          : '基站小模型未配置';
      }
      renderSelectedModelLanes();
    }

    function renderSelectedModelLanes() {
      $('intentLaneModel').textContent = intentModeSelect.value === 'intent-api'
        ? (modelConfigs.intent.configured ? '当前：真实 API · ' + modelConfigs.intent.modelId : '当前：远端大模型未配置') + '\\nNatural language → Intent IR'
        : '当前：合成解析器，无模型推理\\nNatural language → Intent IR';
      $('stationLaneModel').textContent = modeSelect.value === 'pi-api'
        ? (modelConfigs.station.configured
          ? (isLocalConfig(modelConfigs.station) ? '当前：本机真实模型 · ' : '当前：远端真实 API · ') + modelConfigs.station.modelId
          : '当前：基站小模型未配置') + '\\nIntent IR → Tool Call'
        : modeSelect.value === 'pi-faux'
          ? '当前：faux 响应，无模型推理\\nIntent IR → Tool Call'
          : '当前：规则基线，无模型推理\\nIntent IR → Action';
      const intentReal = intentModeSelect.value === 'intent-api' && modelConfigs.intent.configured;
      const stationReal = modeSelect.value === 'pi-api' && modelConfigs.station.configured;
      if (intentReal && stationReal) {
        runModeSummary.textContent = '真实双模型：大模型翻译 Intent，本机小模型通过 Pi Agent 调用模拟工具。';
        runButton.textContent = '运行真实双模型测试 / Run two-model test';
      } else if (intentReal || stationReal) {
        runModeSummary.textContent = '当前是混合模式；另一侧仍使用无模型演示。';
        runButton.textContent = '运行混合测试 / Run mixed test';
      } else {
        runModeSummary.textContent = '当前为演示模式；配置两套 API 后自动切换为真实双模型测试。';
        runButton.textContent = '运行演示 / Run demo';
      }
    }

    runButton.addEventListener('click', async () => {
      if (running) return;
      if (intentModeSelect.value === 'intent-api' && !modelConfigs.intent.configured) {
        setStatus('rejected', '请先配置网管大模型 / Configure the management LLM');
        configUi.intent.message.dataset.state = 'error';
        configUi.intent.message.textContent = '网管大模型模式需要独立的 Base URL。 / Management LLM mode requires its own Base URL.';
        configUi.intent.baseUrl.focus();
        return;
      }
      if (modeSelect.value === 'pi-api' && !modelConfigs.station.configured) {
        setStatus('rejected', '请先配置基站小模型 / Configure the station model');
        configUi.station.message.dataset.state = 'error';
        configUi.station.message.textContent = '基站本地模型需要有效的 localhost Base URL。 / Local station model requires a localhost endpoint.';
        configUi.station.baseUrl.focus();
        return;
      }
      runButton.disabled = true;
      prepareIntentPanels();
      const response = await fetch('/api/run', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          intentMode: intentModeSelect.value,
          mode: modeSelect.value,
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
      resetObservability();
      parseTrace.replaceChildren();
      const waiting = document.createElement('div');
      waiting.className = 'intent-placeholder';
      waiting.textContent = '等待网管侧意图解析事件… / Waiting for parsing events…';
      parseTrace.append(waiting);
      parseState.textContent = '请求已提交 / Submitted';
      intentJson.textContent = '等待结构化 Intent IR… / Waiting for structured intent…';
      toolCallJson.textContent = '等待基站小模型通过 Pi Agent 生成工具调用… / Waiting for Pi tool call…';
      toolResultJson.textContent = '等待本地 Station Function 返回 ACTION_ACK… / Waiting for simulated function…';
      toolResultState.textContent = '等待调用 / Waiting';
      stationModelStarted = false;
      stationToolCallReceived = false;
      setActive('nodeInput');
    }

    function startIntentParse(message) {
      running = true;
      runButton.disabled = true;
      parseTrace.replaceChildren();
      parseState.textContent = message.label || '解析中 / Parsing';
      intentJson.textContent = '正在解析自然语言意图… / Parsing operator intent…';
      setStatus('running', '正在解析运营意图 / Parsing intent');
      setJourneyStage('journeyManagement', 'running', message.parser || '正在调用网管解析器 / Calling management parser');
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
      if (stageName === 'INTENT_MODEL_REQUEST_BUILT') {
        setJourneyStage('journeyManagement', 'running', '请求已发出，等待结构化 Tool Call');
      }
      if (stageName === 'INTENT_MODEL_TOOL_CALL') {
        setJourneyStage('journeyManagement', 'done', '已返回结构化语义');
        setJourneyStage('journeyIntent', 'running', '正在组装并校验 Intent IR');
      }
      if (stageName === 'INTENT_IR_GENERATED') {
        setJourneyStage('journeyIntent', 'running', 'Intent IR 已生成，正在校验');
      }
      if (stageName === 'INTENT_IR_VALIDATED') {
        setJourneyStage('journeyIntent', 'done', 'Schema 与时效校验通过');
      }
      setActive('nodeIntent');
    }

    function renderIntentIr(message) {
      const intent = message.intentIr ?? message.intentIR ?? message.intent ?? message.ir ?? message.output ?? message.data ?? {};
      intentJson.textContent = formatStructuredValue(intent);
      const parseMs = Number(message.parseElapsedMs);
      const traceMs = Number(message.traceElapsedMs);
      const parser = message.parser || {};
      const usage = parser.usage;
      const deadlineMs = Number(intent?.execution?.controlDeadlineMs);
      if (Number.isFinite(deadlineMs)) updateControlDeadline(deadlineMs);
      const source = parser.modelId
        ? '真实大模型 / Real LLM · ' + parser.modelId
          + (Number.isFinite(Number(parser.modelDurationMs)) ? ' · model ' + formatMs(Number(parser.modelDurationMs)) : '')
          + (usage ? ' · tokens ' + usage.inputTokens + '/' + usage.outputTokens : '')
        : '合成解析器 / Synthetic · no model';
      parseState.textContent = source + (Number.isFinite(parseMs)
        ? ' · parse ' + formatMs(parseMs) + (Number.isFinite(traceMs) ? ' · trace ' + formatMs(traceMs) : '')
        : '');
      $('intentLaneModel').textContent = parser.modelId
        ? '本次：真实 API · ' + parser.modelId + '\\nNatural language → Intent IR'
        : '本次：合成解析器，无模型推理\\nNatural language → Intent IR';
      setJourneyStage('journeyManagement', 'done', parser.modelId
        ? parser.modelId + ' · ' + formatMs(Number(parser.modelDurationMs) || 0)
        : '合成解析器 / Synthetic parser');
      setJourneyStage('journeyIntent', 'done', 'Intent IR v' + (intent.schemaVersion || '0.1') + ' · SLA ' + formatMs(currentControlDeadlineMs));
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

    function setJourneyStage(id, state, detail) {
      const step = $(id);
      if (!step) return;
      const labels = {
        waiting: '等待 / Waiting',
        running: '进行中 / Running',
        done: '完成 / Done',
        failed: '未通过 / Failed',
        skipped: '未执行 / Skipped'
      };
      step.dataset.state = state;
      const stateNode = step.querySelector('span');
      const detailNode = step.querySelector('small');
      if (stateNode) stateNode.textContent = labels[state] || state;
      if (detailNode && detail) detailNode.textContent = detail;
    }

    function resetJourney() {
      setJourneyStage('journeyManagement', 'waiting', '自然语言 → 结构化语义');
      setJourneyStage('journeyIntent', 'waiting', 'Schema、时限与动作白名单');
      setJourneyStage('journeyGuardrail', 'waiting', '遥测、目标与约束校验');
      setJourneyStage('journeyModel', 'waiting', 'Intent IR → Action Proposal');
      setJourneyStage('journeyTool', 'waiting', '工具名与参数必须真实产生');
      setJourneyStage('journeyFunction', 'waiting', '模拟基站函数实际执行确认');
    }

    function updateControlDeadline(value) {
      const deadlineMs = Number(value);
      if (!Number.isFinite(deadlineMs) || deadlineMs <= 0) return;
      currentControlDeadlineMs = deadlineMs;
      $('slaLabel').textContent = deadlineMs.toLocaleString() + ' ms SLA';
      quickSla.textContent = '/ ' + deadlineMs.toLocaleString() + ' ms SLA';
      updateBudget(0, 'ready');
    }

    function resetObservability() {
      resetJourney();
      updateControlDeadline(1_000);
      utilizationSeries = { cpu: [], gpu: [] };
      renderUtilizationChart();
      quickPhase.textContent = '等待任务 / Waiting';
      runVerdict.dataset.state = 'waiting';
      runVerdict.textContent = '运行后这里会直接说明：卡在意图解析、小模型推理、Tool Call，还是 Function ACK。';
      ['quickModelTime', 'quickTokens', 'quickGpu', 'quickModelMemory', 'quickOutputRate',
        'quickEffectiveTops', 'quickEffectiveBandwidth', 'quickQuantization'].forEach((id) => $(id).textContent = '—');
    }

    function appendUtilization(series, elapsedMs, value) {
      const time = Number(elapsedMs);
      const numeric = Number(value);
      if (!Number.isFinite(time) || !Number.isFinite(numeric)) return;
      utilizationSeries[series].push({ time, value: numeric });
      renderUtilizationChart();
    }

    function renderUtilizationChart() {
      const all = [...utilizationSeries.cpu, ...utilizationSeries.gpu];
      const observedEnd = all.reduce((maximum, point) => Math.max(maximum, point.time), 0);
      const windowMs = Math.max(currentControlDeadlineMs, observedEnd, 1);
      const points = (items) => items.map((point) => {
        const x = Math.max(0, Math.min(100, point.time / windowMs * 100));
        const y = 100 - Math.max(0, Math.min(100, point.value));
        return x.toFixed(2) + ',' + y.toFixed(2);
      }).join(' ');
      cpuChartLine.setAttribute('points', points(utilizationSeries.cpu));
      gpuChartLine.setAttribute('points', points(utilizationSeries.gpu));
      chartEmpty.hidden = all.length > 0;
      chartWindow.textContent = '时间窗 / Window ' + formatMs(windowMs);
    }

    function resetRun(message) {
      running = true;
      runButton.disabled = true;
      events.replaceChildren();
      updateControlDeadline(Number(message.deadlineMs) || 1_000);
      updateBudget(0, 'starting');
      phase.textContent = message.intentMode + ' → ' + message.mode + ' · ' + message.scenario;
      terminal.textContent = 'RUNNING';
      action.textContent = '—';
      version.textContent = '—';
      toolCallJson.textContent = '正在等待小模型 Tool Call… / Waiting for small-model tool call…';
      toolResultJson.textContent = '尚未调用模拟工具 / Function not called yet';
      toolResultState.textContent = '等待调用 / Waiting';
      piTraceSequence = 0;
      stationModelStarted = false;
      stationToolCallReceived = false;
      piTrace.replaceChildren();
      const traceWaiting = document.createElement('div');
      traceWaiting.className = 'intent-placeholder';
      traceWaiting.textContent = '等待 Pi Agent 与 Runtime 事件… / Waiting for Pi and Runtime events…';
      piTrace.append(traceWaiting);
      const stationSource = message.stationResponseSource || message.modelResponseSource || 'no_model';
      const stationModelId = message.stationModelId || message.modelId;
      piTraceBadge.dataset.source = stationSource;
      piTraceBadge.textContent = stationSource === 'local_model'
        ? '本机真实小模型 / Local station model · ' + stationModelId
        : stationSource === 'remote_api'
          ? '远端真实小模型 / Remote station model · ' + stationModelId
        : stationSource === 'preset_fixture'
          ? '预置响应 / FAUX fixture · no model'
          : '规则路径 / Rules · no model';
      $('intentLaneModel').textContent = message.intentResponseSource === 'remote_api'
        ? '本次：真实 API · ' + message.intentModelId + '\\nNatural language → Intent IR'
        : '本次：合成解析器，无模型推理\\nNatural language → Intent IR';
      $('stationLaneModel').textContent = stationSource === 'local_model'
        ? '本次：本机真实模型 · ' + stationModelId + '\\nIntent IR → Tool Call'
        : stationSource === 'remote_api'
          ? '本次：远端真实 API · ' + stationModelId + '\\nIntent IR → Tool Call'
        : stationSource === 'preset_fixture'
          ? '本次：faux 响应，无模型推理\\nIntent IR → Tool Call'
          : '本次：规则基线，无模型推理\\nIntent IR → Action';
      liveResourcePeak = { cpu: 0, rss: 0, heap: 0 };
      liveLocalPeak = { gpu: 0, modelMemory: 0 };
      utilizationSeries = { cpu: [], gpu: [] };
      renderUtilizationChart();
      resourcePhase.textContent = '启动 / starting';
      quickPhase.textContent = '启动 / starting';
      resourceCpu.textContent = '0%';
      resourceRss.textContent = '0 MiB';
      resourceHeap.textContent = '0 MiB';
      resourceTokens.textContent = '等待 / waiting';
      resourceModelTime.textContent = '—';
      resourceGpu.textContent = '—';
      resourceModelMemory.textContent = '—';
      resourceOutputRate.textContent = '—';
      resourceEffectiveTops.textContent = '—';
      resourceEffectiveBandwidth.textContent = '—';
      resourceQuantization.textContent = '—';
      resourceScope.textContent = stationSource === 'local_model'
        ? 'Agent + 本机模型实测 / local measured'
        : message.mode === 'pi-api'
          ? 'Agent 实测；远端模型不可见 / remote hidden'
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
      quickPhase.textContent = String(sample.phase || '—').replaceAll('_', ' ');
      appendUtilization('cpu', sample.elapsedMs, sample.processCpuPercent);
      resourceCpu.textContent = formatNumber(liveResourcePeak.cpu) + '%';
      resourceRss.textContent = formatNumber(liveResourcePeak.rss) + ' MiB';
      resourceHeap.textContent = formatNumber(liveResourcePeak.heap) + ' MiB';
      cpuBar.style.width = Math.min(100, liveResourcePeak.cpu) + '%';
      rssBar.style.width = Math.min(100, liveResourcePeak.rss / 512 * 100) + '%';
      cpuBarLabel.textContent = formatNumber(liveResourcePeak.cpu) + '%';
      rssBarLabel.textContent = formatNumber(liveResourcePeak.rss) + ' MiB';
    }

    function renderLocalResourceSample(sample) {
      if (!sample) return;
      const gpu = Number(sample.gpuUtilizationPercent);
      const modelMemory = Number(sample.modelGpuResidentMiB ?? sample.modelResidentMiB);
      if (Number.isFinite(gpu)) {
        liveLocalPeak.gpu = Math.max(liveLocalPeak.gpu, gpu);
        resourceGpu.textContent = formatNumber(liveLocalPeak.gpu) + '%';
        $('quickGpu').textContent = formatNumber(liveLocalPeak.gpu) + '%';
      }
      if (Number.isFinite(modelMemory)) {
        liveLocalPeak.modelMemory = Math.max(liveLocalPeak.modelMemory, modelMemory);
        resourceModelMemory.textContent = formatNumber(liveLocalPeak.modelMemory) + ' MiB';
        $('quickModelMemory').textContent = formatNumber(liveLocalPeak.modelMemory) + ' MiB';
      }
      appendUtilization('gpu', sample.elapsedMs, sample.gpuUtilizationPercent);
      if (sample.quantization) {
        resourceQuantization.textContent = sample.quantization;
        $('quickQuantization').textContent = sample.quantization;
      }
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
      $('quickTokens').textContent = usage ? usage.input + ' / ' + usage.output : 'N/A';
      $('quickModelTime').textContent = usage?.modelDurationMs === undefined ? 'N/A' : formatMs(usage.modelDurationMs);
      const local = summary.localModel;
      if (local) {
        resourceGpu.textContent = local.peakGpuUtilizationPercent === undefined ? 'N/A' : formatNumber(local.peakGpuUtilizationPercent) + '%';
        resourceModelMemory.textContent = local.modelGpuResidentMiB === undefined && local.modelResidentMiB === undefined
          ? 'N/A'
          : formatNumber(local.modelGpuResidentMiB ?? local.modelResidentMiB) + ' MiB';
        resourceOutputRate.textContent = local.observedOutputTokensPerSecond === undefined ? 'N/A' : formatNumber(local.observedOutputTokensPerSecond) + ' tok/s';
        resourceEffectiveTops.textContent = local.effectiveComputeTops === undefined ? 'N/A' : formatNumber(local.effectiveComputeTops) + ' TOPS';
        resourceEffectiveBandwidth.textContent = local.effectiveWeightBandwidthGBps === undefined ? 'N/A' : formatNumber(local.effectiveWeightBandwidthGBps) + ' GB/s';
        resourceQuantization.textContent = local.quantization || 'N/A';
        $('quickGpu').textContent = local.peakGpuUtilizationPercent === undefined ? 'N/A' : formatNumber(local.peakGpuUtilizationPercent) + '%';
        $('quickModelMemory').textContent = local.modelGpuResidentMiB === undefined && local.modelResidentMiB === undefined
          ? 'N/A'
          : formatNumber(local.modelGpuResidentMiB ?? local.modelResidentMiB) + ' MiB';
        $('quickOutputRate').textContent = local.observedOutputTokensPerSecond === undefined ? 'N/A' : formatNumber(local.observedOutputTokensPerSecond) + ' tok/s';
        $('quickEffectiveTops').textContent = local.effectiveComputeTops === undefined ? 'N/A' : formatNumber(local.effectiveComputeTops) + ' TOPS';
        $('quickEffectiveBandwidth').textContent = local.effectiveWeightBandwidthGBps === undefined ? 'N/A' : formatNumber(local.effectiveWeightBandwidthGBps) + ' GB/s';
        $('quickQuantization').textContent = local.quantization || 'N/A';
      }
      resourceScope.textContent = summary.modelServerMetrics === 'local_observed'
        ? 'Agent + Ollama + Mac GPU 实测'
        : summary.modelServerMetrics === 'not_visible_from_api_client'
          ? '仅 Agent 实测 / Agent only · remote server N/A'
          : summary.modelServerMetrics === 'local_unavailable'
            ? '本机模型遥测不可用 / local telemetry unavailable'
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
      $('quickCapacityTops').textContent = '≥ ' + formatNumber(estimate.provisionalChipTops) + ' TOPS';
      $('quickCapacityBandwidth').textContent = '≥ ' + formatNumber(estimate.provisionalMemoryBandwidthGBps) + ' GB/s';
      $('quickCapacityRam').textContent = '≥ ' + formatNumber(estimate.provisionalDedicatedRamGiB) + ' GiB';
      $('quickCapacityStorage').textContent = '≥ ' + formatNumber(estimate.provisionalStorageGiB) + ' GiB';
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

      if (message.stream === 'runtime' && event.type === 'MODEL_STARTED') {
        stationModelStarted = true;
      }

      if (message.stream === 'pi-agent' && event.type === 'tool_execution_start') {
        stationToolCallReceived = true;
        toolCallJson.textContent = formatStructuredValue({
          name: event.toolName,
          arguments: event.toolArguments,
          source: 'Pi Agent small-model turn'
        });
      }
      if (message.stream === 'runtime' && event.type === 'MODEL_COMPLETED' && modeSelect.value === 'rules') {
        stationToolCallReceived = true;
        toolCallJson.textContent = formatStructuredValue({
          proposal: event.detail?.proposal,
          source: 'rules comparison; no model call'
        });
      }
      if (message.stream === 'runtime' && event.type === 'TOOL_DISPATCHED') {
        toolResultState.textContent = '已调用，等待 ACK / Dispatched';
        toolResultJson.textContent = formatStructuredValue({
          status: 'FUNCTION_DISPATCHED',
          function: event.detail?.actionName,
          target: event.detail?.target,
          parameters: event.detail?.parameters
        });
      }
      if (message.stream === 'runtime' && event.type === 'ACTION_ACK') {
        toolResultState.textContent = '+' + ms + ' ms · ACTION_ACK';
        toolResultJson.textContent = formatStructuredValue({ status: 'ACTION_ACK', result: event.detail });
      }
      if (message.stream === 'runtime' && (event.type === 'SAFE_NOOP' || event.type === 'REJECTED')) {
        toolResultState.textContent = event.type;
        toolResultJson.textContent = formatStructuredValue({ status: event.type, result: event.detail });
        if (!stationModelStarted) {
          toolCallJson.textContent = formatStructuredValue({
            status: 'NOT_INVOKED',
            reason: '基站安全检查在推理前拒绝任务 / Station guardrail rejected before inference',
            guardrail: event.detail
          });
        } else if (!stationToolCallReceived) {
          toolCallJson.textContent = formatStructuredValue({
            status: 'NO_TOOL_CALL',
            reason: '小模型已启动，但未在推理时限内生成 Tool Call / Model started but produced no tool call before its deadline',
            terminal: event.type,
            detail: event.detail
          });
        }
      }

      updateJourneyFromEvent(message, event, ms);

      if (event.type === 'MODEL_STARTED' || event.type === 'agent_start') setActive('nodeAgent');
      if (event.type === 'TOOL_DISPATCHED') {
        setActive('nodeDu');
        action.textContent = event.detail?.actionName || '—';
      }
      if (event.type === 'ACTION_ACK') version.textContent = String(event.detail?.configVersion ?? '—');
    }

    function updateJourneyFromEvent(message, event, ms) {
      const detail = '+' + ms.toLocaleString() + ' ms';
      if (message.stream === 'pi-agent') {
        if (event.type === 'agent_start' || event.type === 'turn_start') {
          setJourneyStage('journeyModel', 'running', 'Pi Agent 已启动本地模型推理 · ' + detail);
          runVerdict.dataset.state = 'running';
          runVerdict.textContent = '正在观察小模型：等待它生成完整 Tool Call，而不只是第一个 Token。';
        }
        if (event.type === 'tool_execution_start') {
          setJourneyStage('journeyModel', 'done', '模型已完成 Action Proposal · ' + detail);
          setJourneyStage('journeyTool', 'done', String(event.toolName || 'tool') + ' · ' + detail);
          runVerdict.textContent = '小模型已经真实生成 Tool Call；下一步看 Guardrail 是否允许以及 Function 能否 ACK。';
        }
        return;
      }

      if (event.type === 'INTENT_RECEIVED') {
        setJourneyStage('journeyGuardrail', 'running', 'Runtime 已接收 Intent · ' + detail);
      }
      if (event.type === 'SCHEMA_VALIDATED') {
        setJourneyStage('journeyGuardrail', 'running', 'Schema 通过，正在核对遥测约束 · ' + detail);
      }
      if (event.type === 'SNAPSHOT_CAPTURED') {
        setJourneyStage('journeyGuardrail', 'done', '遥测快照与约束通过 · ' + detail);
      }
      if (event.type === 'MODEL_STARTED') {
        setJourneyStage('journeyGuardrail', 'done', '推理前安全检查通过 · ' + detail);
        setJourneyStage('journeyModel', 'running', '推理预算 ' + formatMs(Number(event.detail?.budgetMs) || 0));
        runVerdict.dataset.state = 'running';
        runVerdict.textContent = '小模型正在运行：重点看模型耗时、GPU 曲线、模型驻留内存，以及是否在预算内生成 Tool Call。';
      }
      if (event.type === 'MODEL_COMPLETED') {
        setJourneyStage('journeyModel', 'done', 'Action Proposal 已返回 · ' + detail);
      }
      if (event.type === 'PLAN_VALIDATED') {
        setJourneyStage('journeyTool', 'done', String(event.detail?.actionName || 'proposal') + ' 已通过 Guardrail · ' + detail);
      }
      if (event.type === 'TOOL_DISPATCHED') {
        setJourneyStage('journeyTool', 'done', String(event.detail?.actionName || 'tool') + ' · ' + detail);
        setJourneyStage('journeyFunction', 'running', 'Station Function 已派发，等待 ACK');
      }
      if (event.type === 'ACTION_ACK') {
        setJourneyStage('journeyFunction', 'done', 'ACTION_ACK · config v' + String(event.detail?.configVersion ?? '—') + ' · ' + detail);
        runVerdict.dataset.state = 'succeeded';
        runVerdict.textContent = '完整链路已走通：Intent → 本地小模型 → Tool Call → Station Function → ACTION_ACK。';
      }
      if (event.type === 'SAFE_NOOP' || event.type === 'REJECTED') {
        const code = String(event.detail?.code || event.type);
        if (!stationModelStarted) {
          setJourneyStage('journeyGuardrail', 'failed', code + ' · ' + detail);
          setJourneyStage('journeyModel', 'skipped', '安全检查未通过，因此没有调用小模型');
          setJourneyStage('journeyTool', 'skipped', '没有模型输出');
          setJourneyStage('journeyFunction', 'skipped', '没有执行 Function');
          runVerdict.textContent = '任务在基站安全检查阶段停止；小模型和 Function 都没有被调用。请看 Guardrail 错误码。';
        } else if (!stationToolCallReceived) {
          setJourneyStage('journeyModel', 'failed', code + ' · 未在预算内生成 Tool Call');
          setJourneyStage('journeyTool', 'skipped', 'NO_TOOL_CALL');
          setJourneyStage('journeyFunction', 'skipped', '没有可执行的 Tool Call');
          runVerdict.textContent = '瓶颈在本地小模型：推理已启动，但没有在时限内生成完整 Tool Call。';
        } else if (event.type === 'REJECTED') {
          setJourneyStage('journeyTool', 'failed', code + ' · Proposal 被 Guardrail 拒绝');
          setJourneyStage('journeyFunction', 'skipped', 'Function 未执行');
          runVerdict.textContent = '小模型生成了 Tool Call，但参数或动作没有通过确定性 Guardrail。';
        } else {
          setJourneyStage('journeyFunction', 'failed', code + ' · 未在控制时限内 ACK');
          runVerdict.textContent = 'Tool Call 已产生，但 Function 没有在控制时限内返回 ACK。';
        }
        runVerdict.dataset.state = 'failed';
      }
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
      const actual = Math.max(0, Number(ms) || 0);
      const bounded = Math.min(currentControlDeadlineMs, actual);
      const progress = Math.min(100, bounded / currentControlDeadlineMs * 100);
      elapsed.textContent = Math.round(actual).toLocaleString() + ' ms';
      quickElapsed.textContent = Math.round(actual).toLocaleString() + ' ms';
      fill.style.width = progress + '%';
      quickBudgetFill.style.width = progress + '%';
      reserve.textContent = '剩余 / Reserve ' + Math.max(0, currentControlDeadlineMs - actual).toLocaleString() + ' ms';
      phase.textContent = String(eventType || '—').replaceAll('_', ' ');
      quickPhase.textContent = String(eventType || '—').replaceAll('_', ' ');
    }

    function finishRun(message) {
      running = false;
      runButton.disabled = false;
      terminal.textContent = message.result.status.toUpperCase();
      action.textContent = message.result.action?.actionName || action.textContent;
      version.textContent = String(message.result.ack?.configVersion ?? version.textContent);
      updateBudget(message.result.elapsedMs, message.result.status);
      setStatus(message.result.status, message.result.status === 'succeeded' ? '收到 ACTION_ACK / received' : '安全终态 / Safe terminal state');
      if (message.result.status !== 'succeeded' && toolResultState.textContent === '等待调用 / Waiting') {
        toolResultState.textContent = message.result.status.toUpperCase();
        toolResultJson.textContent = formatStructuredValue(message.result);
      }
      if (message.result.status === 'succeeded') {
        runVerdict.dataset.state = 'succeeded';
        runVerdict.textContent = '完整链路成功，并在 ' + formatMs(message.result.elapsedMs) + ' 内收到 ACTION_ACK。现在重点比较模型耗时、Token 速度、GPU 峰值和驻留内存。';
      }
      setActive(null);
    }

    function finishError(message) {
      running = false;
      runButton.disabled = false;
      terminal.textContent = 'ERROR';
      toolResultState.textContent = 'ERROR';
      toolResultJson.textContent = formatStructuredValue({ error: message.error || 'Run failed' });
      const activeJourney = document.querySelector('.journey-step[data-state="running"]');
      if (activeJourney) setJourneyStage(activeJourney.id, 'failed', message.error || 'Run failed');
      runVerdict.dataset.state = 'failed';
      runVerdict.textContent = '调用链发生错误：' + (message.error || 'Run failed') + '。后续阶段没有执行。';
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
