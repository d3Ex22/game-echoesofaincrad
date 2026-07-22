import path from 'path';
import { fs, types } from 'vortex-api';

import {
  BINARIES_WIN64,
  BITFIX_FOLDER_NAME,
  BITFIX_MARKERS,
  BITFIX_PROXY_NAMES,
  CONTENT_MARKERS,
  DLL_MOD_MARKERS,
  FOLDER_ATTR,
  FOLDERS_ATTR,
  GAME_ID,
  hasMarker,
  IOSTORE_MARKERS,
  LOGICMOD_MARKERS,
  LUA_EXTENSIONS,
  LUA_MOD_MARKERS,
  MODS_FILE,
  MODS_FILE_BACKUP,
  MOD_TYPE_ROOT,
  NEEDS_BITFIX_ATTR,
  NEEDS_UE4SS_ATTR,
  PAK_EXTENSIONS,
  PAK_MARKERS,
  PAK_MODS_PATH,
  PAKALT_MARKERS,
  ROOT_FOLDER,
  ROOT_MARKERS,
  shouldSkipInstallFile,
  UE4SS_DLL_NAME,
  UE4SS_FOLDER_NAME,
  UE4SS_LOADER_NAME,
  UE4SS_SETTINGS_NAME,
  UE4SS_SIGNATURES_FOLDER,
  UE4SS_SIG_MARKERS,
  SHARED_LIB_MARKERS,
} from './common';
import { bitfixDependencyRuleInstructions } from './bitfixDownload';
import { ue4ssDependencyRuleInstructions } from './ue4ssRules';

type PayloadKind =
  | 'ue4ss-core'
  | 'bitfix-core'
  | 'bitfix-mod'
  | 'ue4ss-mod'
  | 'shared'
  | 'dllmod'
  | 'logicmod'
  | 'pak'
  | 'content';

function isDirectoryEntry(file: string): boolean {
  return file.endsWith('/') || file.endsWith('\\');
}

function normalizeSep(file: string): string {
  return file.replace(/\\/g, path.sep);
}

function pathSegments(file: string): string[] {
  return normalizeSep(file).split(path.sep).filter(Boolean);
}

function hasSegment(files: string[], name: string): boolean {
  const lower = name.toLowerCase();
  return files.some((file) =>
    pathSegments(file).some((s) => s.toLowerCase() === lower),
  );
}

function hasFomod(files: string[]): boolean {
  return files.some(
    (file) =>
      path.basename(file).toLowerCase() === 'moduleconfig.xml' &&
      path.basename(path.dirname(file)).toLowerCase() === 'fomod',
  );
}

const UE4SS_IDENTIFIERS = [
  UE4SS_LOADER_NAME,
  UE4SS_DLL_NAME,
  UE4SS_SETTINGS_NAME,
].map((f) => f.toLowerCase());

function hasUe4ssIdentifiers(files: string[]): boolean {
  return files.some((file) =>
    UE4SS_IDENTIFIERS.includes(path.basename(file).toLowerCase()),
  );
}

function hasScriptsLua(files: string[]): boolean {
  return files.some(
    (file) =>
      LUA_EXTENSIONS.includes(path.extname(file).toLowerCase()) &&
      pathSegments(file).some((s) => s.toLowerCase() === 'scripts'),
  );
}

function hasPakFile(files: string[]): boolean {
  return files.some((file) => path.extname(file).toLowerCase() === '.pak');
}

function hasPakAsset(files: string[]): boolean {
  return files.some((file) =>
    PAK_EXTENSIONS.includes(path.extname(file).toLowerCase()),
  );
}

function hasLua(files: string[]): boolean {
  return files.some((file) =>
    LUA_EXTENSIONS.includes(path.extname(file).toLowerCase()),
  );
}

function hasTopLevelContentOrConfig(files: string[]): boolean {
  return files.some((file) => {
    const top = pathSegments(file)[0]?.toLowerCase();
    return top === 'content' || top === 'config';
  });
}

function hasDllOutsideBitfix(files: string[]): boolean {
  return files.some((file) => {
    if (isDirectoryEntry(file)) {
      return false;
    }
    if (path.extname(file).toLowerCase() !== '.dll') {
      return false;
    }
    return !pathSegments(file).some(
      (s) => s.toLowerCase() === BITFIX_FOLDER_NAME.toLowerCase(),
    );
  });
}

function isBitfixCoreArchive(files: string[]): boolean {
  return hasSegment(files, BITFIX_FOLDER_NAME) && hasDllOutsideBitfix(files);
}

function hasGameTree(files: string[]): boolean {
  return hasSegment(files, ROOT_FOLDER) || hasSegment(files, 'Engine');
}

function hasBinaryFile(files: string[]): boolean {
  return files.some((file) => {
    if (isDirectoryEntry(file)) {
      return false;
    }
    const ext = path.extname(file).toLowerCase();
    return ext === '.dll' || ext === '.exe';
  });
}

function isBinariesOnlyArchive(files: string[]): boolean {
  if (isBitfixCoreArchive(files) || hasUe4ssIdentifiers(files)) {
    return false;
  }
  if (hasSegment(files, 'dlls') || hasPakAsset(files) || hasLua(files)) {
    return false;
  }
  return hasBinaryFile(files);
}

const MARKER_PAYLOADS: { kind: PayloadKind; markers: readonly string[] }[] = [
  { kind: 'bitfix-mod', markers: BITFIX_MARKERS },
  { kind: 'ue4ss-mod', markers: [...UE4SS_SIG_MARKERS, ...LUA_MOD_MARKERS] },
  { kind: 'shared', markers: SHARED_LIB_MARKERS },
  { kind: 'dllmod', markers: DLL_MOD_MARKERS },
  { kind: 'logicmod', markers: LOGICMOD_MARKERS },
  { kind: 'pak', markers: [...PAK_MARKERS, ...IOSTORE_MARKERS, ...PAKALT_MARKERS] },
  { kind: 'content', markers: CONTENT_MARKERS },
];

function detectPayloadKinds(files: string[]): Set<PayloadKind> {
  const kinds = new Set<PayloadKind>();

  if (hasUe4ssIdentifiers(files) || hasSegment(files, UE4SS_FOLDER_NAME)) {
    kinds.add('ue4ss-core');
  }
  if (isBitfixCoreArchive(files)) {
    kinds.add('bitfix-core');
  } else if (
    hasMarker(files, BITFIX_MARKERS) ||
    (hasSegment(files, BITFIX_FOLDER_NAME) &&
      files.some((f) =>
        LUA_EXTENSIONS.includes(path.extname(f).toLowerCase()),
      ))
  ) {
    kinds.add('bitfix-mod');
  }
  if (
    hasSegment(files, UE4SS_SIGNATURES_FOLDER) ||
    hasScriptsLua(files)
  ) {
    kinds.add('ue4ss-mod');
  }
  if (hasSegment(files, 'shared')) {
    kinds.add('shared');
  }
  if (hasSegment(files, 'dlls')) {
    kinds.add('dllmod');
  }
  if (hasSegment(files, 'LogicMods') || hasMarker(files, LOGICMOD_MARKERS)) {
    kinds.add('logicmod');
  }
  if (
    hasSegment(files, '~mods') ||
    hasMarker(files, PAK_MARKERS) ||
    hasMarker(files, IOSTORE_MARKERS) ||
    (hasPakFile(files) &&
      !hasSegment(files, 'LogicMods') &&
      !hasMarker(files, LOGICMOD_MARKERS))
  ) {
    kinds.add('pak');
  }
  if (hasTopLevelContentOrConfig(files) || hasMarker(files, CONTENT_MARKERS)) {
    kinds.add('content');
  }

  for (const group of MARKER_PAYLOADS) {
    if (hasMarker(files, group.markers)) {
      kinds.add(group.kind);
    }
  }

  return kinds;
}

/**
 * Collapse payloads normally bundled inside a core package
 * (official UE4SS ships Mods/ + shared/; bitfix may ship sample .lua).
 */
function effectiveMixedKinds(kinds: Set<PayloadKind>): Set<PayloadKind> {
  const effective = new Set(kinds);
  if (effective.has('ue4ss-core')) {
    effective.delete('ue4ss-mod');
    effective.delete('shared');
    effective.delete('dllmod');
  }
  if (effective.has('bitfix-core')) {
    effective.delete('bitfix-mod');
  }
  return effective;
}

function isPureUe4ssCore(files: string[], kinds: Set<PayloadKind>): boolean {
  if (!kinds.has('ue4ss-core')) {
    return false;
  }
  const effective = effectiveMixedKinds(kinds);
  return effective.size === 1 && effective.has('ue4ss-core');
}

function isPureBitfixCore(files: string[], kinds: Set<PayloadKind>): boolean {
  if (!kinds.has('bitfix-core') && !isBitfixCoreArchive(files)) {
    return false;
  }
  const effective = effectiveMixedKinds(kinds);
  return effective.size === 1 && effective.has('bitfix-core');
}

/**
 * Unified game-root archive: full tree, mixed buckets, or loose binaries.
 * Pure UE4SS / bitfix cores always defer to their dedicated installers.
 */
export function isRootArchive(files: string[]): boolean {
  if (hasFomod(files)) {
    return false;
  }

  const kinds = detectPayloadKinds(files);
  if (isPureUe4ssCore(files, kinds) || isPureBitfixCore(files, kinds)) {
    return false;
  }

  if (hasMarker(files, ROOT_MARKERS)) {
    return true;
  }
  if (hasGameTree(files)) {
    return true;
  }
  if (effectiveMixedKinds(kinds).size >= 2) {
    return true;
  }
  return isBinariesOnlyArchive(files);
}

function stripFromSegment(file: string, segment: string): string | undefined {
  const segs = pathSegments(file);
  const idx = segs.findIndex((s) => s.toLowerCase() === segment.toLowerCase());
  if (idx === -1) {
    return undefined;
  }
  return segs.slice(idx).join(path.sep);
}

function mapBucketDestination(
  file: string,
  kinds: Set<PayloadKind>,
  fallbackModName: string,
): string | undefined {
  const segs = pathSegments(file);
  const baseLower = path.basename(file).toLowerCase();
  const ext = path.extname(file).toLowerCase();

  if (UE4SS_IDENTIFIERS.includes(baseLower)) {
    if (baseLower === UE4SS_LOADER_NAME.toLowerCase()) {
      return path.join(BINARIES_WIN64, UE4SS_LOADER_NAME);
    }
    return path.join(BINARIES_WIN64, UE4SS_FOLDER_NAME, path.basename(file));
  }

  const ueIdx = segs.findIndex(
    (s) => s.toLowerCase() === UE4SS_FOLDER_NAME.toLowerCase(),
  );
  if (ueIdx !== -1) {
    return path.join(BINARIES_WIN64, segs.slice(ueIdx).join(path.sep));
  }

  const sigIdx = segs.findIndex(
    (s) => s.toLowerCase() === UE4SS_SIGNATURES_FOLDER.toLowerCase(),
  );
  if (sigIdx !== -1) {
    return path.join(
      BINARIES_WIN64,
      UE4SS_FOLDER_NAME,
      segs.slice(sigIdx).join(path.sep),
    );
  }

  const modsIdx = segs.findIndex((s) => s.toLowerCase() === 'mods');
  if (modsIdx !== -1) {
    return path.join(
      BINARIES_WIN64,
      UE4SS_FOLDER_NAME,
      segs.slice(modsIdx).join(path.sep),
    );
  }

  const scriptsIdx = segs.findIndex((s) => s.toLowerCase() === 'scripts');
  if (scriptsIdx !== -1) {
    const modName =
      scriptsIdx > 0 ? segs[scriptsIdx - 1] : fallbackModName;
    return path.join(
      BINARIES_WIN64,
      UE4SS_FOLDER_NAME,
      'Mods',
      modName,
      segs.slice(scriptsIdx).join(path.sep),
    );
  }

  const bfIdx = segs.findIndex(
    (s) => s.toLowerCase() === BITFIX_FOLDER_NAME.toLowerCase(),
  );
  if (bfIdx !== -1) {
    return path.join(BINARIES_WIN64, segs.slice(bfIdx).join(path.sep));
  }

  const proxySet = new Set(BITFIX_PROXY_NAMES.map((n) => n.toLowerCase()));
  if (proxySet.has(baseLower)) {
    return path.join(BINARIES_WIN64, path.basename(file));
  }

  const binariesIdx = segs.findIndex((s) => s.toLowerCase() === 'binaries');
  if (binariesIdx !== -1) {
    const after = segs.slice(binariesIdx);
    const winIdx = after.findIndex((s) => s.toLowerCase() === 'win64');
    if (winIdx !== -1) {
      return path.join(BINARIES_WIN64, after.slice(winIdx + 1).join(path.sep));
    }
    return path.join(ROOT_FOLDER, after.join(path.sep));
  }

  const logicIdx = segs.findIndex((s) => s.toLowerCase() === 'logicmods');
  if (logicIdx !== -1) {
    return path.join(
      ROOT_FOLDER,
      'Content',
      'Paks',
      segs.slice(logicIdx).join(path.sep),
    );
  }

  const tildeIdx = segs.findIndex((s) => s.toLowerCase() === '~mods');
  if (tildeIdx !== -1) {
    return path.join(
      ROOT_FOLDER,
      'Content',
      'Paks',
      segs.slice(tildeIdx).join(path.sep),
    );
  }

  const paksIdx = segs.findIndex((s) => s.toLowerCase() === 'paks');
  if (paksIdx !== -1) {
    return path.join(
      ROOT_FOLDER,
      'Content',
      segs.slice(paksIdx).join(path.sep),
    );
  }

  const contentIdx = segs.findIndex((s) => s.toLowerCase() === 'content');
  if (contentIdx !== -1) {
    return path.join(ROOT_FOLDER, segs.slice(contentIdx).join(path.sep));
  }

  const configIdx = segs.findIndex((s) => s.toLowerCase() === 'config');
  if (configIdx !== -1) {
    return path.join(ROOT_FOLDER, segs.slice(configIdx).join(path.sep));
  }

  const sharedIdx = segs.findIndex((s) => s.toLowerCase() === 'shared');
  if (sharedIdx !== -1) {
    return path.join(
      BINARIES_WIN64,
      UE4SS_FOLDER_NAME,
      'Mods',
      segs.slice(sharedIdx).join(path.sep),
    );
  }

  const dllsIdx = segs.findIndex((s) => s.toLowerCase() === 'dlls');
  if (dllsIdx > 0) {
    const modName = segs[dllsIdx - 1];
    return path.join(
      BINARIES_WIN64,
      UE4SS_FOLDER_NAME,
      'Mods',
      modName,
      segs.slice(dllsIdx).join(path.sep),
    );
  }

  if (segs.length === 1 && LUA_EXTENSIONS.includes(ext)) {
    if (kinds.has('bitfix-mod') || hasMarker([file], BITFIX_MARKERS)) {
      return path.join(BINARIES_WIN64, BITFIX_FOLDER_NAME, path.basename(file));
    }
    return path.join(
      BINARIES_WIN64,
      UE4SS_FOLDER_NAME,
      'Mods',
      fallbackModName,
      'Scripts',
      path.basename(file),
    );
  }

  if (segs.length === 1 && (ext === '.dll' || ext === '.exe')) {
    return path.join(BINARIES_WIN64, path.basename(file));
  }

  if (PAK_EXTENSIONS.includes(ext)) {
    return path.join(PAK_MODS_PATH, path.basename(file));
  }

  return undefined;
}

function mapRootDestination(
  file: string,
  kinds: Set<PayloadKind>,
  fallbackModName: string,
): string | undefined {
  const fromGame =
    stripFromSegment(file, ROOT_FOLDER) ?? stripFromSegment(file, 'Engine');
  if (fromGame) {
    return fromGame;
  }
  return mapBucketDestination(file, kinds, fallbackModName);
}

/** Win64-relative path for UE4SS override fileList matching. */
function toUe4ssRelative(destination: string): string {
  const segs = pathSegments(destination);
  const ueIdx = segs.findIndex(
    (s) => s.toLowerCase() === UE4SS_FOLDER_NAME.toLowerCase(),
  );
  if (ueIdx !== -1) {
    return segs.slice(ueIdx).join(path.sep);
  }
  return destination;
}

function collectUe4ssModFolders(destinations: string[]): string[] {
  const folders: string[] = [];
  const seen = new Set<string>();
  for (const dest of destinations) {
    const segs = pathSegments(dest);
    const modsIdx = segs.findIndex((s) => s.toLowerCase() === 'mods');
    if (modsIdx === -1 || segs.length <= modsIdx + 1) {
      continue;
    }
    const name = segs[modsIdx + 1];
    if (name.toLowerCase() === 'shared') {
      continue;
    }
    const key = name.toLowerCase();
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    folders.push(name);
  }
  return folders;
}

export async function testRootMod(
  files: string[],
  gameId: string,
): Promise<types.ISupportedResult> {
  const supported =
    gameId === GAME_ID && !hasFomod(files) && isRootArchive(files);
  return { supported, requiredFiles: [] };
}

export async function installRootMod(
  files: string[],
  destinationPath: string,
): Promise<types.IInstallResult> {
  const normalized = files.map(normalizeSep);
  const kinds = detectPayloadKinds(normalized);
  const fallbackModName = path.basename(destinationPath, '.installing');
  const instructions: types.IInstruction[] = [
    { type: 'setmodtype', value: MOD_TYPE_ROOT },
  ];

  const sigFiles: string[] = [];
  const copiedDests: string[] = [];

  for (const file of normalized) {
    if (isDirectoryEntry(file)) {
      continue;
    }
    const baseLower = path.basename(file).toLowerCase();
    if (shouldSkipInstallFile(baseLower)) {
      continue;
    }
    if (baseLower === 'readme.md' || baseLower === 'readme.txt') {
      continue;
    }

    if (baseLower === MODS_FILE.toLowerCase()) {
      try {
        const data = await fs.readFileAsync(path.join(destinationPath, file), {
          encoding: 'utf8',
        });
        instructions.push({
          type: 'generatefile',
          data,
          destination: path.join(
            BINARIES_WIN64,
            UE4SS_FOLDER_NAME,
            'Mods',
            MODS_FILE_BACKUP,
          ),
        });
      } catch {
        // ignore
      }
      continue;
    }

    const destination = mapRootDestination(file, kinds, fallbackModName);
    if (!destination) {
      continue;
    }

    if (
      destination
        .toLowerCase()
        .includes(UE4SS_SIGNATURES_FOLDER.toLowerCase())
    ) {
      sigFiles.push(toUe4ssRelative(destination));
    }

    copiedDests.push(destination);
    instructions.push({ type: 'copy', source: file, destination });
  }

  const modFolders = collectUe4ssModFolders(copiedDests);
  if (modFolders.length > 0) {
    instructions.push({
      type: 'attribute',
      key: FOLDER_ATTR,
      value: modFolders[0],
    });
    instructions.push({
      type: 'attribute',
      key: FOLDERS_ATTR,
      value: JSON.stringify(modFolders),
    });
  }

  const needsUe4ss = kinds.has('ue4ss-mod') && !kinds.has('ue4ss-core');
  if (needsUe4ss) {
    instructions.push({
      type: 'attribute',
      key: NEEDS_UE4SS_ATTR,
      value: true,
    });
    instructions.push(...ue4ssDependencyRuleInstructions(sigFiles));
  }

  const needsBitfix =
    kinds.has('bitfix-mod') && !kinds.has('bitfix-core');
  if (needsBitfix) {
    instructions.push({
      type: 'attribute',
      key: NEEDS_BITFIX_ATTR,
      value: true,
    });
    instructions.push(...bitfixDependencyRuleInstructions());
  }

  return { instructions };
}
