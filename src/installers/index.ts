import path from 'path';
import { fs, types } from 'vortex-api';

import {
  BINARIES_MARKERS,
  COMBO_MARKERS,
  CONTENT_MARKERS,
  DLL_MOD_MARKERS,
  FOLDER_ATTR,
  GAME_ID,
  hasMarker,
  IOSTORE_MARKERS,
  LOGICMOD_MARKERS,
  LUA_EXTENSIONS,
  LUA_MOD_MARKERS,
  MODS_FILE,
  MODS_FILE_BACKUP,
  MOD_TYPE_BINARIES,
  MOD_TYPE_COMBO,
  MOD_TYPE_CONTENT,
  MOD_TYPE_DLL,
  MOD_TYPE_LOGICMOD,
  MOD_TYPE_LUA,
  MOD_TYPE_PAK,
  MOD_TYPE_PAKALT,
  MOD_TYPE_ROOT,
  MOD_TYPE_SHARED_LIB,
  MOD_TYPE_UE4SS,
  PAK_EXTENSIONS,
  PAK_MARKERS,
  PAKALT_MARKERS,
  ROOT_FOLDER,
  ROOT_MARKERS,
  SHARED_LIB_MARKERS,
  shouldSkipInstallFile,
  UE4SS_DLL_NAME,
  UE4SS_FOLDER_NAME,
  UE4SS_LOADER_NAME,
  UE4SS_SETTINGS_NAME,
} from '../common';

function isDirectoryEntry(file: string): boolean {
  return file.endsWith(path.sep) || path.extname(file) === '';
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

function folderIndex(segs: string[], name: string): number {
  return segs.findIndex((s) => s.toLowerCase() === name.toLowerCase());
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

function hasLua(files: string[]): boolean {
  return files.some((file) =>
    LUA_EXTENSIONS.includes(path.extname(file).toLowerCase()),
  );
}

function hasScriptsLua(files: string[]): boolean {
  return files.some(
    (file) =>
      LUA_EXTENSIONS.includes(path.extname(file).toLowerCase()) &&
      hasSegment([file], 'scripts'),
  );
}

function hasPakFile(files: string[]): boolean {
  return files.some((file) => path.extname(file).toLowerCase() === '.pak');
}

function hasUtocFile(files: string[]): boolean {
  return files.some((file) => path.extname(file).toLowerCase() === '.utoc');
}

function hasUcasFile(files: string[]): boolean {
  return files.some((file) => path.extname(file).toLowerCase() === '.ucas');
}

function hasPakAsset(files: string[]): boolean {
  return files.some((file) =>
    PAK_EXTENSIONS.includes(path.extname(file).toLowerCase()),
  );
}

function hasBinaryFile(files: string[]): boolean {
  return files.some((file) => {
    const ext = path.extname(file).toLowerCase();
    return ext === '.dll' || ext === '.exe';
  });
}

function hasBinariesFolder(files: string[]): boolean {
  return hasSegment(files, 'Binaries');
}

function hasDllsFolder(files: string[]): boolean {
  return hasSegment(files, 'dlls');
}

function hasEchoesofAincrad(files: string[]): boolean {
  return hasSegment(files, ROOT_FOLDER);
}

function hasEngine(files: string[]): boolean {
  return hasSegment(files, 'Engine');
}

function hasRootFolderSignals(files: string[]): boolean {
  return hasEchoesofAincrad(files) || hasEngine(files);
}

function hasTildeMods(files: string[]): boolean {
  return hasSegment(files, '~mods');
}

function hasPaksSegment(files: string[]): boolean {
  return hasSegment(files, 'Paks');
}

function isComboCandidate(files: string[]): boolean {
  return (
    hasEchoesofAincrad(files) &&
    hasPakFile(files) &&
    (hasLua(files) || hasBinariesFolder(files))
  );
}

function topLevelSegment(files: string[]): string | undefined {
  for (const file of files) {
    const segs = pathSegments(file);
    if (segs.length > 0) {
      return segs[0];
    }
  }
  return undefined;
}

function hasTopLevelContentOrConfig(files: string[]): boolean {
  const top = topLevelSegment(files)?.toLowerCase();
  return top === 'content' || top === 'config';
}

function hasSharedFolder(files: string[]): boolean {
  return hasSegment(files, 'shared');
}

function hasScriptsFolder(files: string[]): boolean {
  return hasSegment(files, 'scripts');
}

function hasLogicModsFolder(files: string[]): boolean {
  return hasSegment(files, 'logicmods');
}

function hasOnlyScriptsLua(files: string[]): boolean {
  const nonDir = files.filter((file) => !isDirectoryEntry(file));
  if (nonDir.length === 0) {
    return false;
  }
  return nonDir.every((file) => {
    const ext = path.extname(file).toLowerCase();
    if (!LUA_EXTENSIONS.includes(ext)) {
      return false;
    }
    return hasSegment([file], 'scripts');
  });
}

function stripFromSegment(file: string, segment: string): string | undefined {
  const segs = pathSegments(file);
  const idx = folderIndex(segs, segment);
  if (idx === -1) {
    return undefined;
  }
  return segs.slice(idx).join(path.sep);
}

function stripFromEchoesOrEngine(file: string): string | undefined {
  return (
    stripFromSegment(file, ROOT_FOLDER) ?? stripFromSegment(file, 'Engine')
  );
}

function excludesRootMod(files: string[]): boolean {
  if (isComboCandidate(files)) {
    return true;
  }
  if (hasLogicModsFolder(files) || hasMarker(files, LOGICMOD_MARKERS)) {
    return true;
  }
  if (hasUe4ssIdentifiers(files)) {
    return true;
  }
  if (hasOnlyScriptsLua(files)) {
    return true;
  }
  if (hasDllsFolder(files) && files.some((f) => path.extname(f).toLowerCase() === '.dll')) {
    return true;
  }
  if (hasUtocFile(files) && !hasPakFile(files)) {
    return true;
  }
  if (hasPakFile(files) && hasPaksSegment(files) && !hasTildeMods(files)) {
    return true;
  }
  if (hasPakFile(files) || hasUtocFile(files) || hasUcasFile(files)) {
    return true;
  }
  if (hasTopLevelContentOrConfig(files)) {
    return true;
  }
  if (
    hasBinaryFile(files) &&
    !hasLua(files) &&
    !hasPakAsset(files)
  ) {
    return true;
  }
  return false;
}

function copyTreeInstructions(
  files: string[],
  stripFn: (file: string) => string | undefined,
  modType: string,
): types.IInstruction[] {
  const normalized = files.map(normalizeSep);
  const instructions: types.IInstruction[] = [
    { type: 'setmodtype', value: modType },
  ];

  for (const file of normalized) {
    if (isDirectoryEntry(file)) {
      continue;
    }
    const baseLower = path.basename(file).toLowerCase();
    if (shouldSkipInstallFile(baseLower)) {
      continue;
    }
    const dest = stripFn(file);
    if (!dest) {
      continue;
    }
    instructions.push({ type: 'copy', source: file, destination: dest });
  }

  return instructions;
}

export async function testUe4ss(
  files: string[],
  gameId: string,
): Promise<types.ISupportedResult> {
  const supported =
    gameId === GAME_ID &&
    files.some((file) =>
      UE4SS_IDENTIFIERS.includes(path.basename(file).toLowerCase()),
    );
  return { supported, requiredFiles: [] };
}

export async function installUe4ss(
  files: string[],
  destinationPath: string,
): Promise<types.IInstallResult> {
  const normalized = files.map(normalizeSep);
  const instructions: types.IInstruction[] = [
    { type: 'setmodtype', value: MOD_TYPE_UE4SS },
  ];

  const hasUe4ssFolder = normalized.some((file) =>
    pathSegments(file).some((s) => s.toLowerCase() === UE4SS_FOLDER_NAME),
  );

  for (const file of normalized) {
    if (isDirectoryEntry(file)) {
      continue;
    }

    const baseLower = path.basename(file).toLowerCase();
    const segs = pathSegments(file);

    if (shouldSkipInstallFile(baseLower)) {
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
          destination: path.join(UE4SS_FOLDER_NAME, 'Mods', MODS_FILE_BACKUP),
        });
      } catch {
        // ignore
      }
      continue;
    }

    let destination: string;
    if (baseLower === UE4SS_LOADER_NAME.toLowerCase()) {
      destination = UE4SS_LOADER_NAME;
    } else if (hasUe4ssFolder) {
      const ueIdx = segs.findIndex(
        (s) => s.toLowerCase() === UE4SS_FOLDER_NAME,
      );
      if (ueIdx === -1) {
        continue;
      }
      destination = segs.slice(ueIdx).join(path.sep);
    } else {
      destination = path.join(UE4SS_FOLDER_NAME, path.basename(file));
    }

    instructions.push({ type: 'copy', source: file, destination });
  }

  return { instructions };
}

export async function testComboMod(
  files: string[],
  gameId: string,
): Promise<types.ISupportedResult> {
  if (gameId !== GAME_ID || hasFomod(files)) {
    return { supported: false, requiredFiles: [] };
  }
  const supported =
    isComboCandidate(files) ||
    (hasMarker(files, COMBO_MARKERS) && hasRootFolderSignals(files));
  return { supported, requiredFiles: [] };
}

export async function installComboMod(
  files: string[],
): Promise<types.IInstallResult> {
  return {
    instructions: copyTreeInstructions(
      files,
      (file) => stripFromSegment(file, ROOT_FOLDER),
      MOD_TYPE_COMBO,
    ),
  };
}

export async function testRootMod(
  files: string[],
  gameId: string,
): Promise<types.ISupportedResult> {
  if (gameId !== GAME_ID || hasFomod(files)) {
    return { supported: false, requiredFiles: [] };
  }

  const byStructure =
    hasRootFolderSignals(files) && !excludesRootMod(files);
  const byMarker =
    hasMarker(files, ROOT_MARKERS) && !excludesRootMod(files);

  return { supported: byStructure || byMarker, requiredFiles: [] };
}

export async function installRootMod(
  files: string[],
): Promise<types.IInstallResult> {
  return {
    instructions: copyTreeInstructions(
      files,
      stripFromEchoesOrEngine,
      MOD_TYPE_ROOT,
    ),
  };
}

export async function testSharedLib(
  files: string[],
  gameId: string,
): Promise<types.ISupportedResult> {
  if (gameId !== GAME_ID || hasFomod(files)) {
    return { supported: false, requiredFiles: [] };
  }

  const hasLuaFiles = hasLua(files);
  if (!hasLuaFiles) {
    return { supported: false, requiredFiles: [] };
  }

  const supported =
    hasSharedFolder(files) ||
    hasMarker(files, SHARED_LIB_MARKERS) ||
    (hasLuaFiles &&
      !hasScriptsFolder(files) &&
      !hasMarker(files, LUA_MOD_MARKERS));

  return { supported, requiredFiles: [] };
}

export async function installSharedLib(
  files: string[],
  destinationPath: string,
): Promise<types.IInstallResult> {
  const normalized = files.map(normalizeSep);
  const luaFiles = normalized.filter((file) =>
    LUA_EXTENSIONS.includes(path.extname(file).toLowerCase()),
  );
  luaFiles.sort((a, b) => a.length - b.length);
  const shortest = luaFiles[0];
  const segments = pathSegments(shortest);

  const sharedIdx = segments.findIndex((s) => s.toLowerCase() === 'shared');
  let libId: string;
  let stripCount: number;

  if (sharedIdx !== -1 && segments.length > sharedIdx + 1) {
    libId = segments[sharedIdx + 1];
    stripCount = sharedIdx + 1;
  } else if (segments.length > 1) {
    libId = segments[0];
    stripCount = 1;
  } else {
    libId = path.basename(destinationPath, '.installing');
    stripCount = 0;
  }

  const instructions: types.IInstruction[] = [
    { type: 'setmodtype', value: MOD_TYPE_SHARED_LIB },
    { type: 'attribute', key: FOLDER_ATTR, value: libId },
  ];

  for (const file of normalized) {
    if (isDirectoryEntry(file)) {
      continue;
    }
    const baseLower = path.basename(file).toLowerCase();
    if (shouldSkipInstallFile(baseLower)) {
      continue;
    }
    const fileSegs = pathSegments(file);
    const relative =
      stripCount > 0 ? fileSegs.slice(stripCount).join(path.sep) : file;
    if (!relative) {
      continue;
    }
    instructions.push({
      type: 'copy',
      source: file,
      destination: path.join(libId, relative),
    });
  }

  return { instructions };
}

export async function testLuaMod(
  files: string[],
  gameId: string,
): Promise<types.ISupportedResult> {
  if (
    gameId !== GAME_ID ||
    hasFomod(files) ||
    hasSharedFolder(files) ||
    hasMarker(files, SHARED_LIB_MARKERS)
  ) {
    return { supported: false, requiredFiles: [] };
  }

  const supported =
    hasScriptsLua(files) ||
    (hasMarker(files, LUA_MOD_MARKERS) &&
      hasLua(files) &&
      !hasSharedFolder(files) &&
      !hasMarker(files, SHARED_LIB_MARKERS));

  return { supported, requiredFiles: [] };
}

export async function installLuaMod(
  files: string[],
  destinationPath: string,
): Promise<types.IInstallResult> {
  const normalized = files.map(normalizeSep);
  const luaFiles = normalized.filter((file) =>
    LUA_EXTENSIONS.includes(path.extname(file).toLowerCase()),
  );
  luaFiles.sort((a, b) => a.length - b.length);
  const shortest = luaFiles[0];
  const segments = pathSegments(shortest);

  const modsIdx = segments.findIndex((seg) => seg.toLowerCase() === 'mods');
  const scriptsIdx = segments.findIndex(
    (seg) => seg.toLowerCase() === 'scripts',
  );

  let folderId: string;
  let stripCount: number;

  if (modsIdx !== -1 && segments.length > modsIdx + 1) {
    folderId = segments[modsIdx + 1];
    stripCount = modsIdx + 1;
  } else if (scriptsIdx > 0) {
    folderId = segments[scriptsIdx - 1];
    stripCount = scriptsIdx;
  } else {
    folderId = path.basename(destinationPath, '.installing');
    stripCount = 0;
  }

  const instructions: types.IInstruction[] = [
    { type: 'setmodtype', value: MOD_TYPE_LUA },
    { type: 'attribute', key: FOLDER_ATTR, value: folderId },
  ];

  for (const file of normalized) {
    if (isDirectoryEntry(file)) {
      continue;
    }
    const baseLower = path.basename(file).toLowerCase();
    if (shouldSkipInstallFile(baseLower)) {
      continue;
    }
    const fileSegs = pathSegments(file);
    const relative =
      stripCount > 0 ? fileSegs.slice(stripCount).join(path.sep) : file;
    if (!relative) {
      continue;
    }
    instructions.push({
      type: 'copy',
      source: file,
      destination: path.join(folderId, relative),
    });
  }

  return { instructions };
}

export async function testDllMod(
  files: string[],
  gameId: string,
): Promise<types.ISupportedResult> {
  if (gameId !== GAME_ID || hasFomod(files)) {
    return { supported: false, requiredFiles: [] };
  }

  const hasDll = files.some(
    (file) => path.extname(file).toLowerCase() === '.dll',
  );
  const supported =
    (hasDllsFolder(files) && hasDll) ||
    (hasMarker(files, DLL_MOD_MARKERS) && hasDll);

  return { supported, requiredFiles: [] };
}

export async function installDllMod(
  files: string[],
  destinationPath: string,
): Promise<types.IInstallResult> {
  const normalized = files.map(normalizeSep);
  const dllFiles = normalized.filter(
    (file) => path.extname(file).toLowerCase() === '.dll',
  );
  dllFiles.sort((a, b) => a.length - b.length);
  const shortest = dllFiles[0];
  const segments = pathSegments(shortest);

  const modsIdx = segments.findIndex((seg) => seg.toLowerCase() === 'mods');
  const dllsIdx = segments.findIndex((seg) => seg.toLowerCase() === 'dlls');

  let folderId: string;
  let stripCount: number;

  if (modsIdx !== -1 && segments.length > modsIdx + 1) {
    folderId = segments[modsIdx + 1];
    stripCount = modsIdx + 1;
  } else if (dllsIdx > 0) {
    folderId = segments[dllsIdx - 1];
    stripCount = dllsIdx;
  } else {
    folderId = path.basename(destinationPath, '.installing');
    stripCount = 0;
  }

  const instructions: types.IInstruction[] = [
    { type: 'setmodtype', value: MOD_TYPE_DLL },
    { type: 'attribute', key: FOLDER_ATTR, value: folderId },
  ];

  for (const file of normalized) {
    if (isDirectoryEntry(file)) {
      continue;
    }
    const baseLower = path.basename(file).toLowerCase();
    if (shouldSkipInstallFile(baseLower)) {
      continue;
    }
    const fileSegs = pathSegments(file);
    const relative =
      stripCount > 0 ? fileSegs.slice(stripCount).join(path.sep) : file;
    if (!relative) {
      continue;
    }
    instructions.push({
      type: 'copy',
      source: file,
      destination: path.join(folderId, relative),
    });
  }

  return { instructions };
}

export async function testLogicMod(
  files: string[],
  gameId: string,
): Promise<types.ISupportedResult> {
  const supported =
    gameId === GAME_ID &&
    !hasFomod(files) &&
    hasPakFile(files) &&
    (hasMarker(files, LOGICMOD_MARKERS) || hasLogicModsFolder(files));
  return { supported, requiredFiles: [] };
}

export async function installLogicMod(
  files: string[],
): Promise<types.IInstallResult> {
  const normalized = files.map(normalizeSep);
  const pakFile = normalized.find(
    (file) => path.extname(file).toLowerCase() === '.pak',
  );
  const root = pakFile ? path.dirname(pakFile) : '';

  const instructions: types.IInstruction[] = [
    { type: 'setmodtype', value: MOD_TYPE_LOGICMOD },
  ];

  for (const file of normalized) {
    if (isDirectoryEntry(file)) {
      continue;
    }
    const base = path.basename(file).toLowerCase();
    if (shouldSkipInstallFile(base)) {
      continue;
    }
    if (root && !file.startsWith(root) && root !== '.') {
      continue;
    }
    const dest =
      root && root !== '.'
        ? file.slice(root.length).replace(/^[/\\]/, '')
        : path.basename(file);
    if (!dest) {
      continue;
    }
    instructions.push({ type: 'copy', source: file, destination: dest });
  }

  return { instructions };
}

export async function testPakIostoreMod(
  files: string[],
  gameId: string,
): Promise<types.ISupportedResult> {
  if (gameId !== GAME_ID || hasFomod(files)) {
    return { supported: false, requiredFiles: [] };
  }

  const byStructure = hasUtocFile(files) && !hasPakFile(files);
  const byMarker =
    hasMarker(files, IOSTORE_MARKERS) &&
    (hasUtocFile(files) || hasUcasFile(files));

  const supported =
    (byStructure || byMarker) &&
    !hasMarker(files, LOGICMOD_MARKERS) &&
    !hasLogicModsFolder(files) &&
    !hasScriptsLua(files) &&
    !hasRootFolderSignals(files);

  return { supported, requiredFiles: [] };
}

export async function installPakIostoreMod(
  files: string[],
): Promise<types.IInstallResult> {
  const normalized = files.map(normalizeSep);
  const instructions: types.IInstruction[] = [
    { type: 'setmodtype', value: MOD_TYPE_PAK },
  ];

  for (const file of normalized) {
    if (isDirectoryEntry(file)) {
      continue;
    }
    const baseLower = path.basename(file).toLowerCase();
    if (shouldSkipInstallFile(baseLower)) {
      continue;
    }
    const ext = path.extname(file).toLowerCase();
    if (ext !== '.utoc' && ext !== '.ucas') {
      continue;
    }
    instructions.push({
      type: 'copy',
      source: file,
      destination: path.basename(file),
    });
  }

  return { instructions };
}

export async function testPakAltMod(
  files: string[],
  gameId: string,
): Promise<types.ISupportedResult> {
  if (gameId !== GAME_ID || hasFomod(files) || !hasPakFile(files)) {
    return { supported: false, requiredFiles: [] };
  }

  const byStructure =
    hasPaksSegment(files) && !hasTildeMods(files);
  const byMarker = hasMarker(files, PAKALT_MARKERS);

  const supported =
    (byStructure || byMarker) &&
    !hasMarker(files, LOGICMOD_MARKERS) &&
    !hasLogicModsFolder(files) &&
    !hasScriptsLua(files);

  return { supported, requiredFiles: [] };
}

export async function installPakAltMod(
  files: string[],
): Promise<types.IInstallResult> {
  const normalized = files.map(normalizeSep);
  const instructions: types.IInstruction[] = [
    { type: 'setmodtype', value: MOD_TYPE_PAKALT },
  ];

  for (const file of normalized) {
    if (isDirectoryEntry(file)) {
      continue;
    }
    const baseLower = path.basename(file).toLowerCase();
    if (shouldSkipInstallFile(baseLower)) {
      continue;
    }
    const dest = stripFromSegment(file, 'Paks');
    if (!dest) {
      continue;
    }
    instructions.push({ type: 'copy', source: file, destination: dest });
  }

  return { instructions };
}

export async function testPakMod(
  files: string[],
  gameId: string,
): Promise<types.ISupportedResult> {
  const hasPak =
    hasPakFile(files) ||
    hasTildeMods(files) ||
    hasMarker(files, PAK_MARKERS) ||
    hasUcasFile(files);
  const supported =
    gameId === GAME_ID &&
    !hasFomod(files) &&
    hasPak &&
    !hasMarker(files, LOGICMOD_MARKERS) &&
    !hasLogicModsFolder(files) &&
    !hasScriptsLua(files) &&
    !(hasPakFile(files) && hasPaksSegment(files) && !hasTildeMods(files)) &&
    !(hasUtocFile(files) && !hasPakFile(files)) &&
    !hasMarker(files, PAKALT_MARKERS);
  return { supported, requiredFiles: [] };
}

export async function installPakMod(
  files: string[],
): Promise<types.IInstallResult> {
  const normalized = files.map(normalizeSep);
  const pakFile = normalized.find((file) =>
    PAK_EXTENSIONS.includes(path.extname(file).toLowerCase()),
  );

  const instructions: types.IInstruction[] = [
    { type: 'setmodtype', value: MOD_TYPE_PAK },
  ];

  for (const file of normalized) {
    if (isDirectoryEntry(file)) {
      continue;
    }
    const baseLower = path.basename(file).toLowerCase();
    if (shouldSkipInstallFile(baseLower)) {
      continue;
    }
    const ext = path.extname(file).toLowerCase();
    if (!PAK_EXTENSIONS.includes(ext)) {
      continue;
    }

    const segs = pathSegments(file);
    const tildeIdx = folderIndex(segs, '~mods');
    let dest: string;
    if (tildeIdx !== -1 && segs.length > tildeIdx + 1) {
      dest = segs.slice(tildeIdx + 1).join(path.sep);
    } else {
      const root = pakFile ? path.dirname(pakFile) : '';
      dest =
        root && root !== '.'
          ? file.slice(root.length).replace(/^[/\\]/, '')
          : path.basename(file);
    }
    if (!dest) {
      continue;
    }
    instructions.push({ type: 'copy', source: file, destination: dest });
  }

  return { instructions };
}

export async function testContentMod(
  files: string[],
  gameId: string,
): Promise<types.ISupportedResult> {
  const supported =
    gameId === GAME_ID &&
    !hasFomod(files) &&
    (hasTopLevelContentOrConfig(files) ||
      hasMarker(files, CONTENT_MARKERS)) &&
    !hasLogicModsFolder(files) &&
    !hasMarker(files, LOGICMOD_MARKERS) &&
    !hasScriptsLua(files);
  return { supported, requiredFiles: [] };
}

export async function installContentMod(
  files: string[],
): Promise<types.IInstallResult> {
  const normalized = files.map(normalizeSep);
  const instructions: types.IInstruction[] = [
    { type: 'setmodtype', value: MOD_TYPE_CONTENT },
  ];

  for (const file of normalized) {
    if (isDirectoryEntry(file)) {
      continue;
    }
    const baseLower = path.basename(file).toLowerCase();
    if (shouldSkipInstallFile(baseLower)) {
      continue;
    }
    instructions.push({ type: 'copy', source: file, destination: file });
  }

  return { instructions };
}

export async function testBinariesMod(
  files: string[],
  gameId: string,
): Promise<types.ISupportedResult> {
  if (gameId !== GAME_ID || hasFomod(files)) {
    return { supported: false, requiredFiles: [] };
  }

  const byStructure =
    hasBinaryFile(files) &&
    !hasPakAsset(files) &&
    !hasLua(files) &&
    !hasUe4ssIdentifiers(files) &&
    !hasDllsFolder(files);
  const byMarker =
    hasMarker(files, BINARIES_MARKERS) && hasBinaryFile(files);

  return { supported: byStructure || byMarker, requiredFiles: [] };
}

export async function installBinariesMod(
  files: string[],
): Promise<types.IInstallResult> {
  const normalized = files.map(normalizeSep);
  const instructions: types.IInstruction[] = [
    { type: 'setmodtype', value: MOD_TYPE_BINARIES },
  ];

  for (const file of normalized) {
    if (isDirectoryEntry(file)) {
      continue;
    }
    const baseLower = path.basename(file).toLowerCase();
    if (shouldSkipInstallFile(baseLower)) {
      continue;
    }
    const ext = path.extname(file).toLowerCase();
    if (ext !== '.dll' && ext !== '.exe') {
      continue;
    }
    const fromBinaries = stripFromSegment(file, 'Binaries');
    let dest: string;
    if (fromBinaries) {
      const winIdx = folderIndex(pathSegments(fromBinaries), 'Win64');
      dest =
        winIdx !== -1 && pathSegments(fromBinaries).length > winIdx + 1
          ? pathSegments(fromBinaries)
              .slice(winIdx + 1)
              .join(path.sep)
          : path.basename(file);
    } else {
      dest = path.basename(file);
    }
    instructions.push({ type: 'copy', source: file, destination: dest });
  }

  return { instructions };
}
