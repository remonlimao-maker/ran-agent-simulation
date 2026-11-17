export class GuardrailError extends Error {
  readonly code: string;

  constructor(code: string, message: string) {
    super(message);
    this.name = "GuardrailError";
    this.code = code;
  }
}

export class DeadlineError extends Error {
  readonly phase: "inference" | "execution" | "control";

  constructor(phase: "inference" | "execution" | "control", message: string) {
    super(message);
    this.name = "DeadlineError";
    this.phase = phase;
  }
}
