import fs from "fs";
import path from "path";

const ENV_FILE = path.join(__dirname, "../.env");
const ENV_KEY_PATTERN = /^[A-Z0-9_]+$/i;

/**
 * Reads the current .env file contents.
 * @returns Parsed environment variables as key-value pairs.
 */
export function readEnvFile(): Record<string, string> {
  if (!fs.existsSync(ENV_FILE)) {
    return {};
  }

  const content = fs.readFileSync(ENV_FILE, "utf8");
  const lines = content.split("\n");
  const envVars: Record<string, string> = {};

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) {
      continue;
    }

    const eqIndex = trimmed.indexOf("=");
    if (eqIndex > 0) {
      const key = trimmed.substring(0, eqIndex).trim();
      const value = trimmed.substring(eqIndex + 1).trim();
      envVars[key] = value;
    }
  }

  return envVars;
}

/**
 * Writes environment variables to the .env file.
 * @param envVars - Key-value pairs to write.
 */
export function writeEnvFile(envVars: Record<string, string>): void {
  const content = Object.entries(envVars)
    .filter(([key]) => ENV_KEY_PATTERN.test(key))
    .map(([key, value]) => `${key}=${value}`)
    .join("\n");

  fs.writeFileSync(ENV_FILE, content + "\n", "utf8");
}

/**
 * Gets a single environment variable.
 * @param key - The variable name.
 * @returns The value or undefined if not found.
 */
export function getEnvVar(key: string): string | undefined {
  const envVars = readEnvFile();
  return envVars[key];
}

/**
 * Sets a single environment variable.
 * @param key - The variable name.
 * @param value - The value to set.
 * @throws Error if key is invalid.
 */
export function setEnvVar(key: string, value: string): void {
  if (!ENV_KEY_PATTERN.test(key)) {
    throw new Error("Invalid environment variable name");
  }

  const envVars = readEnvFile();
  envVars[key] = value;
  writeEnvFile(envVars);

  // Update process.env for current runtime
  process.env[key] = value;
}
