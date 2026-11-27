#!/usr/bin/env node
/**
 * Mirrors the manifest rules Aurral enforces in
 * backend/services/plugins/pluginManifest.ts. Keeping them here means a broken
 * manifest fails the build/test workflow instead of silently failing install.
 */

export const LIMITS = {
  id: /^[a-z0-9][a-z0-9-]{0,62}$/,
  settingKey: /^[a-zA-Z][a-zA-Z0-9_-]{0,39}$/,
  hostname: /^(?=.{1,253}$)(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/,
  settingTypes: ["text", "password", "number", "boolean"],
  actionTargets: ["playlist", "album", "artist", "track"],
  events: ["playlist.changed", "playlist.removed", "track.played", "download.finished", "notification"],
  schedules: ["15m", "1h", "6h", "24h"],
  downloadKeys: ["tracks", "albums", "files", "upgrades", "keeps"],
};

function isObject(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isString(value, min, max) {
  return typeof value === "string" && value.trim().length >= min && value.length <= max;
}

function isBoolean(value) {
  return typeof value === "boolean";
}

function checkSettings(settings, errors) {
  if (!Array.isArray(settings)) {
    errors.push("settings must be an array");
    return;
  }
  if (settings.length > 30) errors.push("settings: at most 30 entries are allowed");
  const seen = new Set();
  settings.forEach((setting, index) => {
    const at = `settings[${index}]`;
    if (!isObject(setting)) {
      errors.push(`${at}: must be an object`);
      return;
    }
    if (typeof setting.key !== "string" || !LIMITS.settingKey.test(setting.key)) {
      errors.push(`${at}.key: must match ${LIMITS.settingKey}`);
    } else if (seen.has(setting.key)) {
      errors.push(`${at}.key: duplicate key "${setting.key}"`);
    } else {
      seen.add(setting.key);
    }
    if (!isString(setting.label, 1, 60)) errors.push(`${at}.label: 1-60 characters required`);
    if (!LIMITS.settingTypes.includes(setting.type)) {
      errors.push(`${at}.type: must be one of ${LIMITS.settingTypes.join(", ")}`);
    }
    if (setting.required !== undefined && !isBoolean(setting.required)) {
      errors.push(`${at}.required: must be a boolean`);
    }
    if (setting.help !== undefined && !isString(setting.help, 0, 300)) {
      errors.push(`${at}.help: at most 300 characters`);
    }
  });
}

function checkActions(actions, errors) {
  if (!Array.isArray(actions)) {
    errors.push("actions must be an array");
    return;
  }
  if (actions.length > 20) errors.push("actions: at most 20 entries are allowed");
  const seen = new Set();
  actions.forEach((action, index) => {
    const at = `actions[${index}]`;
    if (!isObject(action)) {
      errors.push(`${at}: must be an object`);
      return;
    }
    if (typeof action.id !== "string" || !LIMITS.settingKey.test(action.id)) {
      errors.push(`${at}.id: must match ${LIMITS.settingKey}`);
    } else if (seen.has(action.id)) {
      errors.push(`${at}.id: duplicate id "${action.id}"`);
    } else {
      seen.add(action.id);
    }
    if (!isString(action.label, 1, 40)) errors.push(`${at}.label: 1-40 characters required`);
    if (action.target !== undefined && !LIMITS.actionTargets.includes(action.target)) {
      errors.push(`${at}.target: must be one of ${LIMITS.actionTargets.join(", ")}`);
    }
    for (const flag of ["admin", "background"]) {
      if (action[flag] !== undefined && !isBoolean(action[flag])) {
        errors.push(`${at}.${flag}: must be a boolean`);
      }
    }
  });
}

function checkEvents(events, errors) {
  if (!Array.isArray(events)) {
    errors.push("events must be an array");
    return;
  }
  const seen = new Set();
  for (const event of events) {
    if (!LIMITS.events.includes(event)) {
      errors.push(`events: unsupported event "${String(event)}"`);
    } else if (seen.has(event)) {
      errors.push(`events: duplicate event "${event}"`);
    } else {
      seen.add(event);
    }
  }
}

function checkImportList(importList, errors) {
  if (!isObject(importList)) {
    errors.push("importList must be an object");
    return;
  }
  if (!isString(importList.label, 1, 40)) errors.push("importList.label: 1-40 characters required");
  if (!Array.isArray(importList.hosts) || importList.hosts.length < 1 || importList.hosts.length > 10) {
    errors.push("importList.hosts: 1-10 hostnames required");
  } else {
    for (const host of importList.hosts) {
      if (typeof host !== "string" || !LIMITS.hostname.test(host) || host !== host.toLowerCase()) {
        errors.push(`importList.hosts: invalid hostname "${String(host)}"`);
      }
    }
  }
  if (importList.sync !== undefined && !isBoolean(importList.sync)) {
    errors.push("importList.sync: must be a boolean");
  }
}

export function validateManifest(manifest, options = {}) {
  const errors = [];
  const warnings = [];

  if (!isObject(manifest)) {
    return { errors: ["manifest must be a JSON object"], warnings };
  }

  if (typeof manifest.id !== "string" || !LIMITS.id.test(manifest.id)) {
    errors.push(`id: must match ${LIMITS.id}`);
  } else if (options.folder !== undefined && manifest.id !== options.folder) {
    errors.push(`id: "${manifest.id}" does not match its folder "${options.folder}"`);
  }
  if (!isString(manifest.name, 1, 60)) errors.push("name: 1-60 characters required");
  if (!isString(manifest.version, 1, 40)) errors.push("version: 1-40 characters required");
  if (manifest.api !== 1) errors.push("api: must be exactly 1");
  if (manifest.description !== undefined && !isString(manifest.description, 0, 300)) {
    errors.push("description: at most 300 characters");
  }
  if (manifest.repository !== undefined) {
    try {
      const url = new URL(String(manifest.repository));
      if (url.protocol !== "https:") errors.push("repository: must be an https URL");
    } catch {
      errors.push("repository: must be a valid https URL");
    }
  }
  if (manifest.uses !== undefined) {
    if (!Array.isArray(manifest.uses) || manifest.uses.length > 10) {
      errors.push("uses: at most 10 entries are allowed");
    } else {
      for (const use of manifest.uses) {
        if (!isString(use, 1, 80)) errors.push("uses: each entry must be 1-80 characters");
      }
    }
  }
  if (manifest.settings !== undefined) checkSettings(manifest.settings, errors);
  if (manifest.actions !== undefined) checkActions(manifest.actions, errors);
  if (manifest.events !== undefined) checkEvents(manifest.events, errors);
  if (manifest.importList !== undefined) checkImportList(manifest.importList, errors);
  if (manifest.schedule !== undefined && !LIMITS.schedules.includes(manifest.schedule)) {
    errors.push(`schedule: must be one of ${LIMITS.schedules.join(", ")}`);
  }
  if (manifest.downloadSource !== undefined) {
    if (!isObject(manifest.downloadSource)) {
      errors.push("downloadSource must be an object");
    } else {
      for (const [key, value] of Object.entries(manifest.downloadSource)) {
        if (!LIMITS.downloadKeys.includes(key)) {
          errors.push(`downloadSource: unsupported key "${key}"`);
        } else if (!isBoolean(value)) {
          errors.push(`downloadSource.${key}: must be a boolean`);
        }
      }
    }
  }
  if (manifest.apiAccess !== undefined && !isBoolean(manifest.apiAccess)) {
    errors.push("apiAccess: must be a boolean");
  }
  if (manifest.test !== undefined && !isBoolean(manifest.test)) {
    errors.push("test: must be a boolean");
  }

  const known = new Set([
    "id", "name", "version", "api", "description", "repository", "settings", "uses",
    "actions", "events", "downloadSource", "importList", "schedule", "apiAccess", "test",
  ]);
  for (const key of Object.keys(manifest)) {
    if (!known.has(key)) warnings.push(`unknown manifest field "${key}" (Aurral may reject it)`);
  }

  return { errors, warnings };
}
