type LogLevel = "info" | "warn" | "error";

export interface Logger {
  info: (message: unknown) => void;
  warn: (message: unknown) => void;
  error: (message: unknown) => void;
}

export function createLogger(namespace = "the-stack"): Logger {
  return {
    info: (message) => write(namespace, "info", message),
    warn: (message) => write(namespace, "warn", message),
    error: (message) => write(namespace, "error", message),
  };
}

function write(namespace: string, level: LogLevel, message: unknown): void {
  const payload = typeof message === "string" ? message : JSON.stringify(message);
  const output = `[${namespace}] ${payload}`;

  switch (level) {
    case "info":
      console.log(output);
      break;
    case "warn":
      console.warn(output);
      break;
    case "error":
      console.error(output);
      break;
  }
}
