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
 * @param overrideFiles Win64-relative paths for after+fileList.
 * @param options.overridesOnly When true, skip bare `after` if overrideFiles is empty
 *   (SIG mods — bare after can purge UE4SS on conflict resolve).
 */
export function ue4ssDependencyRuleInstructions(
  overrideFiles: string[] = [],
  options: { overridesOnly?: boolean } = {},
): types.IInstruction[] {
  const reference = ue4ssNexusReference();
  const instructions: types.IInstruction[] = [];

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
    return parsed.filter((p): p is string => typeof p === 'string' && p.length > 0);
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
  const overrides = isSig ? sigOverridePaths(mod) : [];

  // SIG must never get a bare "after" (wins every conflict vs UE4SS and can
  // wipe the core tree on resolve). Only after+fileList for signature paths.
  if (isSig) {
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

    if (overrides.length > 0 && !afterRuleHasFileList(mod, ue4ss)) {
      api.store.dispatch(
        actions.addModRule(GAME_ID, modId, {
          type: 'after',
          reference,
          fileList: overrides.map((filePath) => ({ path: filePath })),
        }),
      );
    }
  } else if (!hasRule(mod, 'after', ue4ss)) {
    api.store.dispatch(
      actions.addModRule(GAME_ID, modId, {
        type: 'after',
        reference,
      }),
    );
  }

  if (!hasRule(mod, 'requires', ue4ss)) {
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
  }
}

export function ensureUe4ssOverrideRules(
  api: types.IExtensionApi,
  modId?: string,
): void {
  try {
    const mods = gameMods(api);
    const ue4ss = findUe4ssMod(api);

    if (modId) {
      const mod = mods[modId];
      if (mod?.type === MOD_TYPE_UE4SS) {
        for (const id of Object.keys(mods)) {
          if (shouldFollowUe4ss(mods[id])) {
            addUe4ssRulesForMod(api, id, mods[id], ue4ss);
          }
        }
        return;
      }
      if (shouldFollowUe4ss(mod)) {
        addUe4ssRulesForMod(api, modId, mod, ue4ss);
      }
      return;
    }

    for (const id of Object.keys(mods)) {
      if (shouldFollowUe4ss(mods[id])) {
        addUe4ssRulesForMod(api, id, mods[id], ue4ss);
      }
    }
  } catch (err) {
    log('warn', 'Failed to ensure UE4SS override rules', err);
  }
}
