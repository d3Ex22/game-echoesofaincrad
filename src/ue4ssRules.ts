import { actions, log, types, util } from 'vortex-api';

import {
  GAME_ID,
  MOD_TYPE_DLL,
  MOD_TYPE_LUA,
  MOD_TYPE_SHARED_LIB,
  MOD_TYPE_UE4SS,
  MOD_TYPE_UE4SS_SIG,
  NEEDS_UE4SS_ATTR,
  SIG_FILES_ATTR,
  UE4SS_NEXUS_MOD_ID,
  UE4SS_SIGNATURES_FOLDER,
} from './common';

const UE4SS_AFTER_TYPES = new Set([
  MOD_TYPE_UE4SS_SIG,
  MOD_TYPE_LUA,
  MOD_TYPE_DLL,
  MOD_TYPE_SHARED_LIB,
]);

function ue4ssNexusReference(): types.IModReference {
  return {
    repo: {
      repository: 'nexus',
      gameId: GAME_ID,
      modId: String(UE4SS_NEXUS_MOD_ID),
    },
    description: 'UE4SS (Echoes of Aincrad)',
  };
}

/**
 * Normalize signature override paths to SIG deploy-root relative form
 * (`../UE4SS_Signatures/...`). Older installs stored Win64-relative
 * `ue4ss/UE4SS_Signatures/...` which did not match BeQuiet's fileList and
 * let conflict resolve wipe the SIG mod tree.
 */
export function normalizeSigOverridePath(filePath: string): string {
  const normalized = filePath.replace(/\\/g, '/');
  const marker = UE4SS_SIGNATURES_FOLDER.toLowerCase();
  const parts = normalized.split('/').filter(Boolean);
  const sigIdx = parts.findIndex((p) => p.toLowerCase() === marker);
  if (sigIdx === -1) {
    return filePath;
  }
  return ['..', ...parts.slice(sigIdx)].join('/');
}

/**
 * @param overrideFiles Deploy-relative paths for after+fileList (SIG: ../UE4SS_Signatures/...).
 * @param options.overridesOnly When true, skip bare `after` if overrideFiles is empty
 *   (SIG mods — bare after can purge UE4SS / empty the SIG mod on conflict resolve).
 */
export function ue4ssDependencyRuleInstructions(
  overrideFiles: string[] = [],
  options: { overridesOnly?: boolean } = {},
): types.IInstruction[] {
  const reference = ue4ssNexusReference();
  const instructions: types.IInstruction[] = [];

  // Callers pass deploy-root-relative paths (SIG: ../UE4SS_Signatures/...,
  // Root: Binaries/Win64/ue4ss/UE4SS_Signatures/...). Do not rewrite here.
  const skipBareAfter =
    options.overridesOnly === true && overrideFiles.length === 0;
  if (!skipBareAfter) {
    const afterRule: types.IModRule = {
      type: 'after',
      reference,
    };
    if (overrideFiles.length > 0) {
      afterRule.fileList = overrideFiles.map((filePath) => ({
        path: filePath,
      }));
    }
    instructions.push({ type: 'rule', rule: afterRule });
  }

  instructions.push({
    type: 'rule',
    rule: { type: 'requires', reference },
  });
  return instructions;
}

function gameMods(api: types.IExtensionApi): { [id: string]: types.IMod } {
  return util.getSafe(api.getState(), ['persistent', 'mods', GAME_ID], {});
}

function findUe4ssMod(api: types.IExtensionApi): types.IMod | undefined {
  const mods = gameMods(api);
  return Object.keys(mods)
    .map((id) => mods[id])
    .find((mod) => mod?.type === MOD_TYPE_UE4SS);
}

function ruleTargetsUe4ss(
  rule: types.IModRule,
  ue4ss: types.IMod | undefined,
): boolean {
  if (rule.type !== 'after' && rule.type !== 'requires') {
    return false;
  }
  const ref = rule.reference;
  if (!ref) {
    return false;
  }
  if (ue4ss && ref.id === ue4ss.id) {
    return true;
  }
  if (ref.repo?.repository === 'nexus' && ref.repo?.gameId === GAME_ID) {
    return String(ref.repo.modId) === String(UE4SS_NEXUS_MOD_ID);
  }
  const hint = (ref.idHint ?? ref.description ?? '').toLowerCase();
  return hint.includes('ue4ss');
}

function hasRule(
  mod: types.IMod,
  type: 'after' | 'requires',
  ue4ss: types.IMod | undefined,
): boolean {
  return (mod.rules ?? []).some(
    (rule) => rule.type === type && ruleTargetsUe4ss(rule, ue4ss),
  );
}

function afterRuleHasFileList(
  mod: types.IMod,
  ue4ss: types.IMod | undefined,
): boolean {
  return (mod.rules ?? []).some(
    (rule) =>
      rule.type === 'after' &&
      ruleTargetsUe4ss(rule, ue4ss) &&
      Array.isArray(rule.fileList) &&
      rule.fileList.length > 0,
  );
}

function sigOverridePaths(mod: types.IMod): string[] {
  const raw = mod.attributes?.[SIG_FILES_ATTR];
  if (typeof raw !== 'string' || raw.length === 0) {
    return [];
  }
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) {
      return [];
    }
    return parsed
      .filter((p): p is string => typeof p === 'string' && p.length > 0)
      .map(normalizeSigOverridePath);
  } catch {
    return [];
  }
}

function shouldFollowUe4ss(mod: types.IMod | undefined): boolean {
  if (!mod?.type || mod.type === MOD_TYPE_UE4SS) {
    return false;
  }
  if (mod.attributes?.[NEEDS_UE4SS_ATTR]) {
    return true;
  }
  return UE4SS_AFTER_TYPES.has(mod.type);
}

/**
 * Prefer a single requires/after reference: the installed UE4SS mod when
 * present, otherwise the Nexus mod id. Drop duplicate nexus+local pairs that
 * caused dependency recursion after restarts.
 */
function dedupeUe4ssRequires(
  api: types.IExtensionApi,
  modId: string,
  mod: types.IMod,
  ue4ss: types.IMod | undefined,
): void {
  if (!ue4ss) {
    return;
  }
  const rules = mod.rules ?? [];
  const ue4ssRules = rules.filter(
    (rule) =>
      (rule.type === 'requires' || rule.type === 'after') &&
      ruleTargetsUe4ss(rule, ue4ss),
  );
  if (ue4ssRules.length <= 1) {
    return;
  }

  const localRef = util.makeModReference(ue4ss);
  for (const rule of ue4ssRules) {
    const ref = rule.reference;
    const isLocal = ref?.id === ue4ss.id;
    const isNexus =
      ref?.repo?.repository === 'nexus' &&
      String(ref?.repo?.modId) === String(UE4SS_NEXUS_MOD_ID);
    // Keep local; remove nexus duplicates. Keep at most one after with fileList.
    if (isNexus && !isLocal) {
      api.store.dispatch(actions.removeModRule(GAME_ID, modId, rule));
    }
  }

  // If we removed everything, ensure a single local requires remains.
  const refreshed = gameMods(api)[modId];
  if (refreshed && !hasRule(refreshed, 'requires', ue4ss)) {
    api.store.dispatch(
      actions.addModRule(GAME_ID, modId, {
        type: 'requires',
        reference: localRef,
      }),
    );
  }
}

function repairSigModRules(
  api: types.IExtensionApi,
  modId: string,
  mod: types.IMod,
  ue4ss: types.IMod | undefined,
): void {
  const reference = ue4ss
    ? util.makeModReference(ue4ss)
    : ue4ssNexusReference();
  const overrides = sigOverridePaths(mod);

  // Persist normalized paths when we rewrote legacy Win64-relative values.
  const raw = mod.attributes?.[SIG_FILES_ATTR];
  if (typeof raw === 'string' && overrides.length > 0) {
    try {
      const prev = JSON.parse(raw) as unknown;
      if (Array.isArray(prev)) {
        const prevRaw = prev.filter((p): p is string => typeof p === 'string');
        if (JSON.stringify(prevRaw) !== JSON.stringify(overrides)) {
          api.store.dispatch(
            actions.setModAttribute(
              GAME_ID,
              modId,
              SIG_FILES_ATTR,
              JSON.stringify(overrides),
            ),
          );
        }
      }
    } catch {
      // ignore
    }
  }

  // Always strip bare after rules first
  for (const rule of mod.rules ?? []) {
    if (
      rule.type === 'after' &&
      ruleTargetsUe4ss(rule, ue4ss) &&
      !(Array.isArray(rule.fileList) && rule.fileList.length > 0)
    ) {
      api.store.dispatch(actions.removeModRule(GAME_ID, modId, rule));
    }
  }

  // Replace stale after+fileList that still use Win64-relative paths
  for (const rule of mod.rules ?? []) {
    if (
      rule.type !== 'after' ||
      !ruleTargetsUe4ss(rule, ue4ss) ||
      !Array.isArray(rule.fileList) ||
      rule.fileList.length === 0
    ) {
      continue;
    }
    const paths = rule.fileList
      .map((item) => item?.path)
      .filter((p): p is string => typeof p === 'string');
    const normalized = paths.map(normalizeSigOverridePath);
    const needsRewrite =
      paths.length !== normalized.length ||
      paths.some((p, i) => p.replace(/\\/g, '/') !== normalized[i]);
    if (needsRewrite) {
      api.store.dispatch(actions.removeModRule(GAME_ID, modId, rule));
    }
  }

  const latest = gameMods(api)[modId] ?? mod;
  if (overrides.length > 0 && !afterRuleHasFileList(latest, ue4ss)) {
    api.store.dispatch(
      actions.addModRule(GAME_ID, modId, {
        type: 'after',
        reference,
        fileList: overrides.map((filePath) => ({ path: filePath })),
      }),
    );
  }

  dedupeUe4ssRequires(api, modId, gameMods(api)[modId] ?? latest, ue4ss);
}

function addUe4ssRulesForMod(
  api: types.IExtensionApi,
  modId: string,
  mod: types.IMod,
  ue4ss: types.IMod | undefined,
): void {
  const reference = ue4ss
    ? util.makeModReference(ue4ss)
    : ue4ssNexusReference();

  const isSig = mod.type === MOD_TYPE_UE4SS_SIG;
  if (isSig) {
    repairSigModRules(api, modId, mod, ue4ss);
  } else if (!hasRule(mod, 'after', ue4ss)) {
    api.store.dispatch(
      actions.addModRule(GAME_ID, modId, {
        type: 'after',
        reference,
      }),
    );
  }

  const latest = gameMods(api)[modId] ?? mod;
  if (!hasRule(latest, 'requires', ue4ss)) {
    api.store.dispatch(
      actions.addModRule(GAME_ID, modId, {
        type: 'requires',
        reference,
        downloadHint: {
          mode: 'browse',
          url: `https://www.nexusmods.com/${GAME_ID}/mods/${UE4SS_NEXUS_MOD_ID}`,
        },
      }),
    );
  } else {
    dedupeUe4ssRequires(api, modId, latest, ue4ss);
  }
}

/** Idempotent SIG-only repair — safe on startup/deploy (no requires churn). */
export function repairUe4ssSigRules(api: types.IExtensionApi): void {
  try {
    const mods = gameMods(api);
    const ue4ss = findUe4ssMod(api);
    for (const id of Object.keys(mods)) {
      const mod = mods[id];
      if (mod?.type === MOD_TYPE_UE4SS_SIG) {
        repairSigModRules(api, id, mod, ue4ss);
      }
    }
  } catch (err) {
    log('warn', 'Failed to repair UE4SS SIG rules', err);
  }
}

/**
 * Apply UE4SS rules for a newly installed mod. When `modId` is the UE4SS core,
 * migrate dependents to the local reference once (dedupe only — no mass re-add).
 */
export function ensureUe4ssOverrideRules(
  api: types.IExtensionApi,
  modId?: string,
): void {
  try {
    const mods = gameMods(api);
    const ue4ss = findUe4ssMod(api);

    if (!modId) {
      // Startup/deploy must not mass-inject requires (recursion). SIG repair only.
      repairUe4ssSigRules(api);
      return;
    }

    const mod = mods[modId];
    if (mod?.type === MOD_TYPE_UE4SS) {
      for (const id of Object.keys(mods)) {
        if (!shouldFollowUe4ss(mods[id])) {
          continue;
        }
        // Migrate/dedupe existing rules to the installed UE4SS; do not add
        // fresh requires for every mod (install instructions already did).
        dedupeUe4ssRequires(api, id, mods[id], ue4ss);
        if (mods[id].type === MOD_TYPE_UE4SS_SIG) {
          repairSigModRules(api, id, mods[id], ue4ss);
        }
      }
      return;
    }

    if (shouldFollowUe4ss(mod)) {
      addUe4ssRulesForMod(api, modId, mod, ue4ss);
    }
  } catch (err) {
    log('warn', 'Failed to ensure UE4SS override rules', err);
  }
}
