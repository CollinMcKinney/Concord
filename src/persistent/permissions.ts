import * as cache from "../ephemeral/cache.ts";

/**
 * Numeric role hierarchy used for authorization checks.
 */
export const Roles = Object.freeze({
  BLOCKED: 0,
  GUEST: 1,
  MEMBER: 2,
  MODERATOR: 3,
  ADMIN: 4,
  OWNER: 5,
  ROOT: 6
} as const);

/**
 * Union of all valid role values.
 */
export type RoleType = typeof Roles[keyof typeof Roles];

/**
 * Mutable runtime configuration persisted in Redis.
 */
interface RuntimeConfig {
  suppressedPrefixes?: string[];
  commandRoleRequirements?: Partial<Record<string, RoleType | null>>;
}

/**
 * Expanded command-role response for admin UI.
 */
export interface CommandRoleRequirementDetails {
  roleValue: RoleType | null;
  roleName: string;
  defaultRoleValue: RoleType | null;
  defaultRoleName: string;
  overridden: boolean;
}

/**
 * Config key for runtime settings.
 */
const CONFIG_KEY = "config:runtime";

/**
 * Default suppressed strings for message filtering.
 */
const DEFAULT_SUPPRESSED_PREFIXES: string[] = [
  "To talk in your clan's channel, start each line of chat with // or /c."
];

/**
 * Default command role requirements.
 */
const DEFAULT_COMMAND_ROLE_REQUIREMENTS: Record<string, RoleType> = {
  'input': Roles.MEMBER,
  'setrank': Roles.OWNER,
  'config': Roles.ADMIN,
};

/**
 * Gets the runtime configuration from Redis.
 */
async function getRuntimeConfig(): Promise<RuntimeConfig> {
  const stored = await cache.get<RuntimeConfig>(CONFIG_KEY);
  return stored || {};
}

/**
 * Gets suppressed prefixes from config.
 */
export async function getSuppressedPrefixes(): Promise<string[]> {
  const config = await getRuntimeConfig();
  return config.suppressedPrefixes || DEFAULT_SUPPRESSED_PREFIXES;
}

/**
 * Sets suppressed prefixes in config.
 */
export async function setSuppressedPrefixes(prefixes: string[]): Promise<void> {
  const config = await getRuntimeConfig();
  config.suppressedPrefixes = prefixes;
  await cache.set(CONFIG_KEY, config);
}

/**
 * Gets command role requirements.
 */
export async function getCommandRoleRequirements(): Promise<Record<string, RoleType | null>> {
  const config = await getRuntimeConfig();
  const result: Record<string, RoleType | null> = {
    ...DEFAULT_COMMAND_ROLE_REQUIREMENTS,
  };
  
  // Merge in overrides, filtering out undefined values
  if (config.commandRoleRequirements) {
    for (const [command, role] of Object.entries(config.commandRoleRequirements)) {
      if (role !== undefined) {
        result[command] = role;
      }
    }
  }
  
  return result;
}

/**
 * Gets the minimum role required for a command.
 */
export async function getMinimumRoleForCommand(command: string): Promise<RoleType | null> {
  const config = await getCommandRoleRequirements();
  return config[command] ?? null;
}

/**
 * Sets a command's role requirement.
 */
export async function setCommandRoleRequirement(command: string, role: RoleType | null): Promise<void> {
  const config = await getRuntimeConfig();
  if (!config.commandRoleRequirements) {
    config.commandRoleRequirements = {};
  }
  config.commandRoleRequirements[command] = role;
  await cache.set(CONFIG_KEY, config);
}

/**
 * Gets expanded command role requirements for admin UI.
 */
export async function getCommandRoleRequirementDetails(): Promise<Record<string, CommandRoleRequirementDetails>> {
  const current = await getCommandRoleRequirements();
  const result: Record<string, CommandRoleRequirementDetails> = {};

  for (const [command, roleValue] of Object.entries(DEFAULT_COMMAND_ROLE_REQUIREMENTS)) {
    const currentRoleValue = current[command] ?? roleValue;
    const overridden = current[command] !== undefined && current[command] !== roleValue;

    result[command] = {
      roleValue: currentRoleValue,
      roleName: getRoleName(currentRoleValue),
      defaultRoleValue: roleValue,
      defaultRoleName: getRoleName(roleValue),
      overridden,
    };
  }

  // Add any custom commands
  for (const [command, roleValue] of Object.entries(current)) {
    if (!DEFAULT_COMMAND_ROLE_REQUIREMENTS[command]) {
      result[command] = {
        roleValue,
        roleName: getRoleName(roleValue),
        defaultRoleValue: null,
        defaultRoleName: 'N/A',
        overridden: false,
      };
    }
  }

  return result;
}

/**
 * Gets the human-readable name for a role.
 */
export function getRoleName(role: RoleType | null): string {
  if (role === null) return 'None';
  // Find the key for this role value
  const roleName = Object.keys(Roles).find(key => Roles[key as keyof typeof Roles] === role);
  return roleName || 'Unknown';
}

/**
 * Checks if a role meets a minimum requirement.
 */
export function hasRole(currentRole: RoleType, minimumRole: RoleType): boolean {
  return currentRole >= minimumRole;
}
