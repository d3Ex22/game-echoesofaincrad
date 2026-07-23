import path from 'path';
import { actions, fs, log, selectors, types, util } from 'vortex-api';

import {
  FOLDER_ATTR,
  FOLDERS_ATTR,
  GAME_ID,
  LOGICMODS_PATH,
  LUA_MODS_PATH,
  MOD_TYPE_DLL,
  MOD_TYPE_LOGICMOD,
  MOD_TYPE_LUA,
  MOD_TYPE_PAK,
  MOD_TYPE_ROOT,
  MOD_TYPE_UE4SS_SIG,
  MODS_FILE,
  PAK_EXTENSIONS,
  PAK_MODS_PATH,
  UE4SS_BUILTIN_MODS,
} from './common';

/** Mod types that use Vortex mergeMods folder prefixes for load order. */
const MERGE_LO_TYPES = [MOD_TYPE_PAK, MOD_TYPE_LOGICMOD];

export interface IModsTxtEntry {
  name: string;
  enabled: boolean;
}

const DEFAULT_BUILTIN_ENABLED: { [name: string]: boolean } = {
  BPML_GenericFunctions: true,
  BPModLoaderMod: false,
  ConsoleEnablerMod: true,
  ConsoleCommandsMod: true,
  CheatManagerEnablerMod: false,
  LineTraceMod: false,
  ActorDumperMod: false,
  Keybinds: true,
};

const MODS_TXT_TYPES = [
  MOD_TYPE_LUA,
  MOD_TYPE_DLL,
  MOD_TYPE_UE4SS_SIG,
  MOD_TYPE_ROOT,
];

function modsTxtPath(discoveryPath: string): string {
  return path.join(discoveryPath, LUA_MODS_PATH, MODS_FILE);
}

export function parseModsTxt(content: string): IModsTxtEntry[] {
  const entries: IModsTxtEntry[] = [];
  for (const raw of content.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith(';')) {
      continue;
    }
    const colon = line.lastIndexOf(':');
    if (colon === -1) {
      continue;
    }
    const name = line.slice(0, colon).trim();
    const flag = parseInt(line.slice(colon + 1).trim(), 10);
    if (!name || Number.isNaN(flag)) {
      continue;
    }
    entries.push({ name, enabled: flag === 1 });
  }
  return entries;
}

function isBuiltin(name: string): boolean {
  return UE4SS_BUILTIN_MODS.some(
    (b) => b.toLowerCase() === name.toLowerCase(),
  );
}

function isShared(name: string): boolean {
  return name.toLowerCase() === 'shared';
}

export async function readModsTxt(
  discoveryPath: string,
): Promise<IModsTxtEntry[]> {
  const filePath = modsTxtPath(discoveryPath);
  try {
    const data = await fs.readFileAsync(filePath, { encoding: 'utf8' });
    return parseModsTxt(data);
  } catch {
    return [];
  }
}

export function folderIdForMod(mod: types.IMod): string {
  return (mod.attributes?.[FOLDER_ATTR] as string) || mod.id;
}

export function folderIdsForMod(mod: types.IMod): string[] {
  const raw = mod.attributes?.[FOLDERS_ATTR];
  if (typeof raw === 'string' && raw.length > 0) {
    try {
      const parsed = JSON.parse(raw) as unknown;
      if (Array.isArray(parsed)) {
        const names = parsed.filter(
          (n): n is string => typeof n === 'string' && n.length > 0,
        );
        if (names.length > 0) {
          return names;
        }
      }
    } catch {
      // fall through
    }
  }
  return [folderIdForMod(mod)];
}

function displayNameForMod(mod: types.IMod): string {
  return folderIdForMod(mod);
}

function diskEnabledMap(
  diskEntries: IModsTxtEntry[],
): Map<string, boolean> {
  return new Map(
    diskEntries.map((e) => [e.name.toLowerCase(), e.enabled]),
  );
}

function enabledFromDisk(
  diskMap: Map<string, boolean>,
  mod: types.IMod,
): boolean {
  for (const folder of folderIdsForMod(mod)) {
    const flag = diskMap.get(folder.toLowerCase());
    if (flag !== undefined) {
      return flag;
    }
  }
  return true;
}

/** Folders owned by any installed Vortex mod (enabled or not). */
export function vortexOwnedModFolders(api: types.IExtensionApi): Set<string> {
  const state = api.getState();
  const mods: { [id: string]: types.IMod } = util.getSafe(
    state,
    ['persistent', 'mods', GAME_ID],
    {},
  );
  const owned = new Set<string>();
  for (const mod of Object.values(mods)) {
    if (!mod || !MODS_TXT_TYPES.includes(mod.type)) {
      continue;
    }
    for (const folder of folderIdsForMod(mod)) {
      owned.add(folder.toLowerCase());
    }
  }
  return owned;
}

async function listManualModFolders(
  discoveryPath: string,
  excludeFolders: Set<string>,
): Promise<string[]> {
  const modsDir = path.join(discoveryPath, LUA_MODS_PATH);
  try {
    const entries = await fs.readdirAsync(modsDir);
    const result: string[] = [];
    for (const entry of entries) {
      if (isBuiltin(entry) || isShared(entry)) {
        continue;
      }
      // Never treat Vortex-owned folders (incl. disabled) as manual — that
      // re-enabled leftovers in mods.txt and left Scripts loading in UE4SS.
      if (excludeFolders.has(entry.toLowerCase())) {
        continue;
      }
      try {
        const stat = await fs.statAsync(path.join(modsDir, entry));
        if (stat.isDirectory()) {
          result.push(entry);
        }
      } catch {
        // ignore
      }
    }
    return result;
  } catch {
    return [];
  }
}

export async function writeModsTxt(
  discoveryPath: string,
  userOrder: IModsTxtEntry[],
  previous?: IModsTxtEntry[],
  vortexOwned?: Set<string>,
): Promise<void> {
  const prev = previous ?? (await readModsTxt(discoveryPath));
  const prevMap = new Map(prev.map((e) => [e.name.toLowerCase(), e]));

  const lines: string[] = [
    '; UE4SS mods.txt managed by Vortex (Echoes of Aincrad)',
    '',
  ];

  for (const builtin of UE4SS_BUILTIN_MODS) {
    if (builtin.toLowerCase() === 'keybinds') {
      continue;
    }
    const prevEntry = prevMap.get(builtin.toLowerCase());
    const enabled =
      prevEntry?.enabled ?? DEFAULT_BUILTIN_ENABLED[builtin] ?? false;
    lines.push(`${builtin} : ${enabled ? 1 : 0}`);
  }

  lines.push('');
  lines.push('; Vortex-managed Lua and DLL mods');

  const seen = new Set<string>();
  for (const entry of userOrder) {
    if (isBuiltin(entry.name) || isShared(entry.name)) {
      continue;
    }
    const key = entry.name.toLowerCase();
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    lines.push(`${entry.name} : ${entry.enabled ? 1 : 0}`);
  }

  // Exclude both LO-listed folders and every Vortex-owned folder (disabled too).
  const exclude = new Set<string>(seen);
  if (vortexOwned) {
    for (const folder of vortexOwned) {
      exclude.add(folder);
    }
  }
  const manualFolders = await listManualModFolders(discoveryPath, exclude);
  if (manualFolders.length > 0) {
    lines.push('');
    lines.push('; Manually installed mods');
    for (const folder of manualFolders) {
      const prevEntry = prevMap.get(folder.toLowerCase());
      lines.push(`${folder} : ${prevEntry?.enabled === false ? 0 : 1}`);
      seen.add(folder.toLowerCase());
    }
  }

  const keybindsPrev = prevMap.get('keybinds');
  const keybindsEnabled =
    keybindsPrev !== undefined
      ? keybindsPrev.enabled
      : DEFAULT_BUILTIN_ENABLED.Keybinds;
  lines.push('');
  lines.push('; Built-in keybinds, do not move up!');
  lines.push(`Keybinds : ${keybindsEnabled ? 1 : 0}`);
  lines.push('');

  const filePath = modsTxtPath(discoveryPath);
  await fs.ensureDirWritableAsync(path.dirname(filePath));
  await fs.writeFileAsync(filePath, lines.join('\r\n'), { encoding: 'utf8' });
}

function getDiscoveryPath(api: types.IExtensionApi): string | undefined {
  return selectors.discoveryByGame(api.getState(), GAME_ID)?.path;
}

function enabledModsByTypes(
  api: types.IExtensionApi,
  modTypes: string[],
): types.IMod[] {
  const state = api.getState();
  const profile = selectors.activeProfile(state);
  if (!profile || profile.gameId !== GAME_ID) {
    return [];
  }
  const mods: { [id: string]: types.IMod } = util.getSafe(
    state,
    ['persistent', 'mods', GAME_ID],
    {},
  );
  const modState = util.getSafe(profile, ['modState'], {});
  return Object.keys(mods)
    .filter((id) => modTypes.includes(mods[id]?.type))
    .filter((id) => util.getSafe(modState, [id, 'enabled'], false))
    .map((id) => mods[id]);
}

export function makePrefix(input: number): string {
  let n = input;
  let res = '';
  while (n >= 0) {
    res = String.fromCharCode(65 + (n % 26)) + res;
    n = Math.floor(n / 26) - 1;
  }
  return res.length >= 3 ? res : res.padStart(3, 'A');
}

function parseMergeFolderName(
  name: string,
): { prefix: string; modId: string } | undefined {
  const match = /^([A-Z]+)-(.+)$/.exec(name);
  if (!match) {
    return undefined;
  }
  return { prefix: match[1], modId: match[2] };
}

async function mergeFolderOrderFromDisk(
  mergeDir: string,
  mods: types.IMod[],
): Promise<string[]> {
  let entries: string[] = [];
  try {
    entries = await fs.readdirAsync(mergeDir);
  } catch {
    return mods.map((m) => m.id);
  }

  const modById = new Map(mods.map((m) => [m.id.toLowerCase(), m]));
  const ordered: { prefix: string; modId: string }[] = [];

  for (const entry of entries) {
    const entryPath = path.join(mergeDir, entry);
    let isDir = false;
    try {
      isDir = (await fs.statAsync(entryPath)).isDirectory();
    } catch {
      continue;
    }

    // mergeMods deploys as <dir>/AAA-<modId>/… Also accept flat AAA-<modId>.pak.
    if (isDir) {
      const parsed = parseMergeFolderName(entry);
      if (!parsed) {
        continue;
      }
      const mod = modById.get(parsed.modId.toLowerCase());
      if (!mod) {
        continue;
      }
      ordered.push({ prefix: parsed.prefix, modId: mod.id });
      continue;
    }

    const ext = path.extname(entry).toLowerCase();
    if (!PAK_EXTENSIONS.includes(ext)) {
      continue;
    }
    const base = path.basename(entry, ext);
    const parsed = parseMergeFolderName(base);
    const suffix = parsed?.modId ?? base;
    const mod = modById.get(suffix.toLowerCase());
    if (!mod) {
      continue;
    }
    ordered.push({
      prefix: parsed?.prefix ?? 'ZZZZ',
      modId: mod.id,
    });
  }

  ordered.sort((a, b) => a.prefix.localeCompare(b.prefix));

  const seen = new Set<string>();
  const result: string[] = [];
  for (const item of ordered) {
    if (seen.has(item.modId)) {
      continue;
    }
    seen.add(item.modId);
    result.push(item.modId);
  }

  for (const mod of mods) {
    if (!seen.has(mod.id)) {
      result.push(mod.id);
    }
  }

  return result;
}

function loadOrderFromState(api: types.IExtensionApi): types.LoadOrder {
  const state = api.getState();
  const fromSession = util.getSafe(
    state,
    ['session', 'loadOrder', GAME_ID],
    undefined,
  );
  if (fromSession) {
    return fromSession;
  }
  const profile = selectors.activeProfile(state);
  if (profile?.loadOrder?.[GAME_ID]) {
    return profile.loadOrder[GAME_ID];
  }
  return [];
}

export function mergePrefixForMod(
  api: types.IExtensionApi,
  mod: types.IMod,
  modType: string,
  loadOrder?: types.LoadOrder,
): string {
  const order = loadOrder ?? loadOrderFromState(api);
  const typedEntries = order.filter((entry) => {
    const state = api.getState();
    const mods: { [id: string]: types.IMod } = util.getSafe(
      state,
      ['persistent', 'mods', GAME_ID],
      {},
    );
    const entryMod = mods[entry.id] ?? mods[entry.modId as string];
    return entryMod?.type === modType && entry.enabled !== false;
  });

  const index = typedEntries.findIndex(
    (entry) => entry.id === mod.id || entry.modId === mod.id,
  );
  if (index === -1) {
    return 'ZZZZ-';
  }
  return `${makePrefix(index)}-`;
}

export function pakPrefixForMod(
  api: types.IExtensionApi,
  mod: types.IMod,
  loadOrder?: types.LoadOrder,
): string {
  return mergePrefixForMod(api, mod, MOD_TYPE_PAK, loadOrder);
}

export function logicModPrefixForMod(
  api: types.IExtensionApi,
  mod: types.IMod,
  loadOrder?: types.LoadOrder,
): string {
  return mergePrefixForMod(api, mod, MOD_TYPE_LOGICMOD, loadOrder);
}

export async function deserializeLoadOrder(
  api: types.IExtensionApi,
): Promise<types.LoadOrder> {
  const discoveryPath = getDiscoveryPath(api);
  const diskEntries = discoveryPath ? await readModsTxt(discoveryPath) : [];
  const diskMap = diskEnabledMap(diskEntries);
  const diskOrder = diskEntries
    .filter((e) => !isBuiltin(e.name) && !isShared(e.name))
    .map((e) => e.name.toLowerCase());

  const txtMods = enabledModsByTypes(api, MODS_TXT_TYPES).filter((mod) => {
    // Root mods without UE4SS mod folders do not belong in mods.txt LO
    if (mod.type === MOD_TYPE_ROOT) {
      return Boolean(mod.attributes?.[FOLDER_ATTR]);
    }
    return true;
  });

  const byFolder = new Map<string, types.IMod>();
  for (const mod of txtMods) {
    for (const folder of folderIdsForMod(mod)) {
      byFolder.set(folder.toLowerCase(), mod);
    }
  }

  const ordered: types.ILoadOrderEntry[] = [];
  const used = new Set<string>();

  for (const name of diskOrder) {
    const mod = byFolder.get(name);
    if (!mod || used.has(mod.id)) {
      continue;
    }
    used.add(mod.id);
    ordered.push({
      id: mod.id,
      name: displayNameForMod(mod),
      enabled: enabledFromDisk(diskMap, mod),
      modId: mod.id,
    });
  }

  for (const mod of txtMods) {
    if (used.has(mod.id)) {
      continue;
    }
    ordered.push({
      id: mod.id,
      name: displayNameForMod(mod),
      enabled: enabledFromDisk(diskMap, mod),
      modId: mod.id,
    });
  }

  if (discoveryPath) {
    const mergeGroups: { type: string; relPath: string }[] = [
      { type: MOD_TYPE_PAK, relPath: PAK_MODS_PATH },
      { type: MOD_TYPE_LOGICMOD, relPath: LOGICMODS_PATH },
    ];
    for (const group of mergeGroups) {
      const groupMods = enabledModsByTypes(api, [group.type]);
      if (groupMods.length === 0) {
        continue;
      }
      const groupOrder = await mergeFolderOrderFromDisk(
        path.join(discoveryPath, group.relPath),
        groupMods,
      );
      for (const modId of groupOrder) {
        const mod = groupMods.find((m) => m.id === modId);
        if (!mod) {
          continue;
        }
        ordered.push({
          id: mod.id,
          name: mod.id,
          enabled: true,
          modId: mod.id,
        });
      }
    }
  }

  return ordered;
}

export async function serializeLoadOrder(
  api: types.IExtensionApi,
  loadOrder: types.LoadOrder,
): Promise<void> {
  const discoveryPath = getDiscoveryPath(api);
  if (!discoveryPath) {
    return;
  }

  const state = api.getState();
  const profile = selectors.activeProfile(state);
  const mods: { [id: string]: types.IMod } = util.getSafe(
    state,
    ['persistent', 'mods', GAME_ID],
    {},
  );

  const userOrder: IModsTxtEntry[] = [];

  for (const entry of loadOrder) {
    const mod = mods[entry.id] ?? mods[entry.modId as string];
    if (!mod) {
      continue;
    }

    const enabled = entry.enabled !== false;
    const inModsTxt =
      MODS_TXT_TYPES.includes(mod.type) &&
      !(mod.type === MOD_TYPE_ROOT && !mod.attributes?.[FOLDER_ATTR]);
    const inMergeLo = MERGE_LO_TYPES.includes(mod.type);

    if (!inModsTxt && !inMergeLo) {
      continue;
    }

    // Mirror LO toggle onto the Vortex mod so deploy removes leftover files.
    if (profile?.gameId === GAME_ID) {
      const currently = util.getSafe(
        profile,
        ['modState', mod.id, 'enabled'],
        false,
      );
      if (currently !== enabled) {
        api.store.dispatch(actions.setModEnabled(profile.id, mod.id, enabled));
      }
    }

    if (inModsTxt) {
      for (const folder of folderIdsForMod(mod)) {
        userOrder.push({ name: folder, enabled });
      }
    }
  }

  try {
    await writeModsTxt(
      discoveryPath,
      userOrder,
      undefined,
      vortexOwnedModFolders(api),
    );
    api.store.dispatch(actions.setDeploymentNecessary(GAME_ID, true));
  } catch (err) {
    log('error', 'Failed to write mods.txt', err);
    api.showErrorNotification('Failed to write UE4SS mods.txt', err);
  }
}

export async function syncModsTxtFromEnabled(
  api: types.IExtensionApi,
): Promise<void> {
  const discoveryPath = getDiscoveryPath(api);
  if (!discoveryPath) {
    return;
  }
  const order = await deserializeLoadOrder(api);
  const state = api.getState();
  const mods: { [id: string]: types.IMod } = util.getSafe(
    state,
    ['persistent', 'mods', GAME_ID],
    {},
  );

  const userOrder: IModsTxtEntry[] = [];
  for (const entry of order) {
    const mod = mods[entry.id] ?? mods[entry.modId as string];
    if (!mod || !MODS_TXT_TYPES.includes(mod.type)) {
      continue;
    }
    if (mod.type === MOD_TYPE_ROOT && !mod.attributes?.[FOLDER_ATTR]) {
      continue;
    }
    const enabled = entry.enabled !== false;
    for (const folder of folderIdsForMod(mod)) {
      userOrder.push({ name: folder, enabled });
    }
  }
  await writeModsTxt(
    discoveryPath,
    userOrder,
    undefined,
    vortexOwnedModFolders(api),
  );
}
