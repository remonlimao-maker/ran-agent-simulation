import { resolve } from "node:path";

import {
  runExperiment,
  writeExperimentReport,
  type ExperimentConfig,
  type ExperimentMode,
  type PrecisionLabel,
  type StartState,
} from "./experiment-harness.ts";

const args = parseArgs(process.argv.slice(2));
if (args.help) {
  process.stdout.write(helpText());
  process.exit(0);
}

const baseLatency = numberArg(args, "model-latency-ms", 120);
const config: ExperimentConfig = {
  mode: enumArg(args, "mode", ["rules", "pi-faux", "pi-local"], "pi-faux") as ExperimentMode,
  runsPerCondition: integerArg(args, "runs", 3),
  slaProfilesMs: numberListArg(args, "sla", [250, 500, 1_000, 3_000]),
  startStates: enumListArg(args, "starts", ["warm", "cold"], ["warm", "cold"]) as StartState[],
  precisions: enumListArg(args, "precisions", ["INT4", "INT8"], ["INT4", "INT8"]) as PrecisionLabel[],
  latencyByPrecisionMs: {
    INT4: numberArg(args, "int4-ms", baseLatency),
    INT8: numberArg(args, "int8-ms", baseLatency),
  },
  coldStartPenaltyMs: numberArg(args, "cold-penalty-ms", 500),
  ackDelayMs: numberArg(args, "ack-delay-ms", 30),
  maxInferenceMs: numberArg(args, "max-inference-ms", 450),
  outputDir: resolve(stringArg(args, "out-dir", "results")),
  modelId: stringArg(args, "model-id", process.env.RAN_MODEL_ID ?? "Qwen/Qwen3-0.6B"),
  baseUrl: stringArg(args, "base-url", process.env.RAN_MODEL_BASE_URL ?? "http://127.0.0.1:8000/v1"),
  apiKey: stringArg(args, "api-key", process.env.RAN_MODEL_API_KEY),
};

const report = await runExperiment(config);
const paths = await writeExperimentReport(report, config.outputDir!);
process.stdout.write(`${JSON.stringify({
  experimentId: report.experimentId,
  rows: report.rows.length,
  summaries: report.summaries,
  files: paths,
  caveats: report.provenance.caveats,
}, null, 2)}\n`);

interface ParsedArgs {
  help: boolean;
  values: Map<string, string>;
}

function parseArgs(argv: string[]): ParsedArgs {
  const values = new Map<string, string>();
  let help = false;
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (token === "--help" || token === "-h") {
      help = true;
      continue;
    }
    if (!token.startsWith("--")) throw new Error(`unexpected argument: ${token}`);
    const [rawName, inlineValue] = token.slice(2).split("=", 2);
    const value = inlineValue ?? argv[++index];
    if (value === undefined || value.startsWith("--")) throw new Error(`missing value for --${rawName}`);
    values.set(rawName, value);
  }
  return { help, values };
}

function stringArg(args: ParsedArgs, name: string, fallback?: string): string | undefined {
  return args.values.get(name) ?? fallback;
}

function numberArg(args: ParsedArgs, name: string, fallback: number): number {
  const value = Number(args.values.get(name) ?? fallback);
  if (!Number.isFinite(value) || value < 0) throw new Error(`--${name} must be a non-negative number`);
  return value;
}

function integerArg(args: ParsedArgs, name: string, fallback: number): number {
  const value = numberArg(args, name, fallback);
  if (!Number.isInteger(value) || value < 1) throw new Error(`--${name} must be a positive integer`);
  return value;
}

function numberListArg(args: ParsedArgs, name: string, fallback: number[]): number[] {
  const raw = args.values.get(name);
  if (!raw) return fallback;
  const values = raw.split(",").map(Number);
  if (values.some((value) => !Number.isFinite(value))) throw new Error(`--${name} must be a comma-separated number list`);
  return values;
}

function enumArg(args: ParsedArgs, name: string, allowed: string[], fallback: string): string {
  const value = args.values.get(name) ?? fallback;
  if (!allowed.includes(value)) throw new Error(`--${name} must be one of: ${allowed.join(", ")}`);
  return value;
}

function enumListArg(args: ParsedArgs, name: string, allowed: string[], fallback: string[]): string[] {
  const raw = args.values.get(name);
  const values = raw ? raw.split(",") : fallback;
  for (const value of values) {
    if (!allowed.includes(value)) throw new Error(`--${name} entries must be one of: ${allowed.join(", ")}`);
  }
  return values;
}

function helpText(): string {
  return `RAN Agent experiment matrix\n\n` +
    `Usage: npm run experiment -- [options]\n\n` +
    `  --mode rules|pi-faux|pi-local     Execution mode (default pi-faux)\n` +
    `  --runs N                          Runs per condition (default 3)\n` +
    `  --sla 250,500,1000,3000           SLA profiles in ms\n` +
    `  --starts warm,cold                Start-state labels\n` +
    `  --precisions INT4,INT8            Precision labels\n` +
    `  --model-latency-ms N              Default synthetic faux delay\n` +
    `  --int4-ms N / --int8-ms N         Per-precision synthetic faux delay\n` +
    `  --cold-penalty-ms N               Extra synthetic cold delay (default 500)\n` +
    `  --ack-delay-ms N                  Deterministic DU ACK delay (default 30)\n` +
    `  --max-inference-ms N              Inference budget cap (default 450)\n` +
    `  --out-dir PATH                    JSON/CSV output directory\n` +
    `  --base-url URL --model-id ID      pi-local endpoint/model\n`;
}
