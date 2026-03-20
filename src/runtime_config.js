const datastore = require("./datastore");
const { Roles } = require("./roles");

const RUNTIME_CONFIG_KEY = "config:runtime";

const DEFAULT_SUPPRESSED_PREFIXES = [
  "To talk in your clan's channel, start each line of chat with // or /c.",
];
 
const DEFAULT_COMMAND_ROLE_REQUIREMENTS = Object.freeze({
  authenticate: null,
  verifySession: null,
  saveState: Roles.ROOT,
  loadState: Roles.ROOT,
  addPacket: Roles.ADMIN,
  getPackets: Roles.MODERATOR,
  deletePacket: Roles.MODERATOR,
  editPacket: Roles.MODERATOR,
  setEnvVar: Roles.ROOT,
  createUser: Roles.ADMIN,
  listUsers: Roles.MODERATOR,
  getUser: Roles.MODERATOR,
  setRole: Roles.ADMIN,
  getSuppressedPrefixes: Roles.MODERATOR,
  setSuppressedPrefixes: Roles.ADMIN,
  getCommandRoleRequirements: Roles.MODERATOR,
  setCommandRoleRequirement: Roles.ROOT,
});

async function getRuntimeConfig() {
  return (await datastore.get(RUNTIME_CONFIG_KEY)) || {};
}

async function saveRuntimeConfig(config) {
  await datastore.set(RUNTIME_CONFIG_KEY, config);
  return config;
}

function normalizeSuppressedPrefixes(prefixes) {
  if (!Array.isArray(prefixes)) {
    throw new Error("Suppressed prefixes must be an array");
  }

  const normalized = prefixes
    .map(prefix => prefix == null ? "" : String(prefix).trim())
    .filter(Boolean);

  return [...new Set(normalized)];
}

function parseRoleRequirement(role) {
  if (role == null || role === "") {
    return null;
  }

  if (typeof role === "number" && Object.values(Roles).includes(role)) {
    return role;
  }

  if (typeof role === "string") {
    const upper = role.trim().toUpperCase();
    if (upper === "NONE" || upper === "OPEN" || upper === "NULL") {
      return null;
    }

    if (Roles[upper] !== undefined) {
      return Roles[upper];
    }
  }

  throw new Error("Invalid role requirement");
}

function roleRequirementToName(roleValue) {
  if (roleValue == null) {
    return "OPEN";
  }

  return Object.entries(Roles).find(([, value]) => value === roleValue)?.[0] || String(roleValue);
}

async function getSuppressedPrefixes() {
  const config = await getRuntimeConfig();
  const stored = Array.isArray(config.suppressedPrefixes) ? config.suppressedPrefixes : null;
  return stored || [...DEFAULT_SUPPRESSED_PREFIXES];
}

async function setSuppressedPrefixes(prefixes) {
  const config = await getRuntimeConfig();
  config.suppressedPrefixes = normalizeSuppressedPrefixes(prefixes);
  await saveRuntimeConfig(config);
  return config.suppressedPrefixes;
}

async function getCommandRoleRequirements() {
  const config = await getRuntimeConfig();
  const overrides = config.commandRoleRequirements || {};

  return Object.fromEntries(
    Object.entries(DEFAULT_COMMAND_ROLE_REQUIREMENTS).map(([commandName, defaultRole]) => {
      const effectiveRole = Object.prototype.hasOwnProperty.call(overrides, commandName)
        ? overrides[commandName]
        : defaultRole;

      return [
        commandName,
        {
          roleValue: effectiveRole,
          roleName: roleRequirementToName(effectiveRole),
          defaultRoleValue: defaultRole,
          defaultRoleName: roleRequirementToName(defaultRole),
          overridden: Object.prototype.hasOwnProperty.call(overrides, commandName),
        },
      ];
    })
  );
}

async function getRequiredRoleForCommand(commandName) {
  const config = await getRuntimeConfig();
  const overrides = config.commandRoleRequirements || {};

  if (Object.prototype.hasOwnProperty.call(overrides, commandName)) {
    return overrides[commandName];
  }

  return Object.prototype.hasOwnProperty.call(DEFAULT_COMMAND_ROLE_REQUIREMENTS, commandName)
    ? DEFAULT_COMMAND_ROLE_REQUIREMENTS[commandName]
    : null;
}

async function setCommandRoleRequirement(commandName, role) {
  if (!commandName || typeof commandName !== "string") {
    throw new Error("Command name is required");
  }

  if (!Object.prototype.hasOwnProperty.call(DEFAULT_COMMAND_ROLE_REQUIREMENTS, commandName)) {
    throw new Error("Unknown command");
  }

  const config = await getRuntimeConfig();
  const overrides = config.commandRoleRequirements || {};
  overrides[commandName] = parseRoleRequirement(role);
  config.commandRoleRequirements = overrides;
  await saveRuntimeConfig(config);

  return {
    commandName,
    roleValue: overrides[commandName],
    roleName: roleRequirementToName(overrides[commandName]),
  };
}

module.exports = {
  DEFAULT_SUPPRESSED_PREFIXES,
  DEFAULT_COMMAND_ROLE_REQUIREMENTS,
  getSuppressedPrefixes,
  setSuppressedPrefixes,
  getCommandRoleRequirements,
  getRequiredRoleForCommand,
  setCommandRoleRequirement,
  parseRoleRequirement,
  roleRequirementToName,
};
