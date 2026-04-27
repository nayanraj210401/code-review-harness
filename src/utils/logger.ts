type LogLevel = "debug" | "info" | "warn" | "error";

const levels: Record<LogLevel, number> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
};

let currentLevel: LogLevel = "info";

export const logger = {
  setLevel(level: LogLevel) {
    currentLevel = level;
  },

  debug(msg: string, ...args: unknown[]) {
    if (levels[currentLevel] <= levels.debug) {
      process.stderr.write(`[debug] ${msg} ${args.map(String).join(" ")}\n`);
    }
  },

  info(msg: string, ...args: unknown[]) {
    if (levels[currentLevel] <= levels.info) {
      process.stderr.write(`[info]  ${msg} ${args.map(String).join(" ")}\n`);
    }
  },

  warn(msg: string, ...args: unknown[]) {
    if (levels[currentLevel] <= levels.warn) {
      process.stderr.write(`[warn]  ${msg} ${args.map(String).join(" ")}\n`);
    }
  },

  error(msg: string, ...args: unknown[]) {
    if (levels[currentLevel] <= levels.error) {
      process.stderr.write(`[error] ${msg} ${args.map(String).join(" ")}\n`);
    }
  },
};
