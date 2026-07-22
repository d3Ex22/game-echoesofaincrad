import path from 'path';
import { selectors, types } from 'vortex-api';

import {
  BINARIES_MARKERS,
  BINARIES_WIN64,
  CONTENT_MARKERS,
  CONTENT_PATH,
  DLL_MOD_MARKERS,
  GAME_ID,
  LOGICMOD_MARKERS,
  LOGICMODS_PATH,
  LUA_EXTENSIONS,
  LUA_MOD_MARKERS,
  LUA_MODS_PATH,
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
  PAK_MODS_PATH,
  ROOT_FOLDER,
  ROOT_MARKERS,
  SHARED_LIBS_PATH,
  SHARED_LIB_MARKERS,
  UE4SS_LOADER_NAME,
} from '../common';
import { pakPrefixForMod } from '../modsFile';

function hasModTypeInstruction(instructions: types.IInstruction[]): boolean {
  return instructions.some((instr) => instr.type === 'setmodtype');
}

function discoveryPath(api: types.IExtensionApi): string | undefined {
  return selectors.discoveryByGame(api.getState(), GAME_ID)?.path;
}

function modTypeFromInstructions(
  instructions: types.IInstruction[],
): string | undefined {
  const set = instructions.find((i) => i.type === 'setmodtype');
  return set?.value as string | undefined;
}

function instructionSources(instructions: types.IInstruction[]): string[] {
  return instructions
    .filter((inst) => inst.type === 'copy')
    .map((inst) => inst.source as string);
}

function sourceBasenames(instructions: types.IInstruction[]): string[] {
  return instructionSources(instructions).map((source) =>
    path.basename(source).toLowerCase(),
  );
}

function sourceHasSegment(
  instructions: types.IInstruction[],
  segment: string,
): boolean {
  const lower = segment.toLowerCase();
  return instructionSources(instructions).some((source) =>
    source.toLowerCase().split(/[/\\]/).includes(lower),
  );
}

function instructionsHaveMarker(
  instructions: types.IInstruction[],
  markers: readonly string[],
): boolean {
  return sourceBasenames(instructions).some((base) => markers.includes(base));
}

export function getGameRootPath(api: types.IExtensionApi): string {
  const root = discoveryPath(api);
  return root ?? '.';
}

export function getUe4ssPath(api: types.IExtensionApi): string {
  const root = discoveryPath(api);
  return root ? path.join(root, BINARIES_WIN64) : '.';
}

export function testUe4ssPath(
  instructions: types.IInstruction[],
): Promise<boolean> {
  if (hasModTypeInstruction(instructions)) {
    return Promise.resolve(
      modTypeFromInstructions(instructions) === MOD_TYPE_UE4SS,
    );
  }
  return Promise.resolve(
    instructions.some(
      (inst) =>
        inst.type === 'copy' &&
        path.basename(inst.source as string).toLowerCase() ===
          UE4SS_LOADER_NAME.toLowerCase(),
    ),
  );
}

export function getComboPath(api: types.IExtensionApi): string {
  return getGameRootPath(api);
}

export function testComboPath(
  instructions: types.IInstruction[],
): Promise<boolean> {
  return Promise.resolve(
    modTypeFromInstructions(instructions) === MOD_TYPE_COMBO,
  );
}

export function getRootModPath(api: types.IExtensionApi): string {
  return getGameRootPath(api);
}

export function testRootModPath(
  instructions: types.IInstruction[],
): Promise<boolean> {
  if (hasModTypeInstruction(instructions)) {
    return Promise.resolve(
      modTypeFromInstructions(instructions) === MOD_TYPE_ROOT,
    );
  }
  return Promise.resolve(instructionsHaveMarker(instructions, ROOT_MARKERS));
}

export function getSharedLibPath(api: types.IExtensionApi): string {
  const root = discoveryPath(api);
  return root ? path.join(root, SHARED_LIBS_PATH) : '.';
}

export function testSharedLibPath(
  instructions: types.IInstruction[],
): Promise<boolean> {
  if (hasModTypeInstruction(instructions)) {
    return Promise.resolve(
      modTypeFromInstructions(instructions) === MOD_TYPE_SHARED_LIB,
    );
  }
  const hasMarkerFile = instructionsHaveMarker(
    instructions,
    SHARED_LIB_MARKERS,
  );
  const hasShared = sourceHasSegment(instructions, 'shared');
  const hasLuaNoScripts = instructions.some(
    (inst) =>
      inst.type === 'copy' &&
      LUA_EXTENSIONS.includes(path.extname(inst.source as string).toLowerCase()) &&
      !(inst.source as string).toLowerCase().split(/[/\\]/).includes('scripts'),
  );
  return Promise.resolve(hasMarkerFile || hasShared || hasLuaNoScripts);
}

export function getLuaPath(api: types.IExtensionApi): string {
  const root = discoveryPath(api);
  return root ? path.join(root, LUA_MODS_PATH) : '.';
}

export function testLuaPath(instructions: types.IInstruction[]): Promise<boolean> {
  if (hasModTypeInstruction(instructions)) {
    const modType = modTypeFromInstructions(instructions);
    return Promise.resolve(modType === MOD_TYPE_LUA);
  }
  if (
    instructionsHaveMarker(instructions, SHARED_LIB_MARKERS) ||
    sourceHasSegment(instructions, 'shared')
  ) {
    return Promise.resolve(false);
  }
  const hasScripts = sourceHasSegment(instructions, 'scripts');
  const hasLuaMarker = instructionsHaveMarker(instructions, LUA_MOD_MARKERS);
  const hasLua = instructions.some(
    (inst) =>
      inst.type === 'copy' &&
      LUA_EXTENSIONS.includes(path.extname(inst.source as string).toLowerCase()),
  );
  return Promise.resolve(hasScripts || (hasLuaMarker && hasLua));
}

export function getDllPath(api: types.IExtensionApi): string {
  return getLuaPath(api);
}

export function testDllPath(
  instructions: types.IInstruction[],
): Promise<boolean> {
  if (hasModTypeInstruction(instructions)) {
    return Promise.resolve(
      modTypeFromInstructions(instructions) === MOD_TYPE_DLL,
    );
  }
  const hasDlls = sourceHasSegment(instructions, 'dlls');
  const hasDllMarker = instructionsHaveMarker(instructions, DLL_MOD_MARKERS);
  const hasDll = instructions.some(
    (inst) =>
      inst.type === 'copy' &&
      path.extname(inst.source as string).toLowerCase() === '.dll',
  );
  return Promise.resolve((hasDlls && hasDll) || (hasDllMarker && hasDll));
}

export function getLogicModPath(api: types.IExtensionApi): string {
  const root = discoveryPath(api);
  return root ? path.join(root, LOGICMODS_PATH) : '.';
}

export function testLogicModPath(
  instructions: types.IInstruction[],
): Promise<boolean> {
  if (hasModTypeInstruction(instructions)) {
    return Promise.resolve(
      modTypeFromInstructions(instructions) === MOD_TYPE_LOGICMOD,
    );
  }
  const hasMarkerFile = instructionsHaveMarker(
    instructions,
    LOGICMOD_MARKERS,
  );
  const hasLogicFolder = sourceHasSegment(instructions, 'logicmods');
  return Promise.resolve(hasMarkerFile || hasLogicFolder);
}

export function getPakPath(api: types.IExtensionApi): string {
  const root = discoveryPath(api);
  return root ? path.join(root, PAK_MODS_PATH) : '.';
}

export function testPakPath(instructions: types.IInstruction[]): Promise<boolean> {
  if (hasModTypeInstruction(instructions)) {
    return Promise.resolve(
      modTypeFromInstructions(instructions) === MOD_TYPE_PAK,
    );
  }
  if (
    instructionsHaveMarker(instructions, LOGICMOD_MARKERS) ||
    sourceHasSegment(instructions, 'logicmods')
  ) {
    return Promise.resolve(false);
  }
  const hasPak = instructions.some(
    (inst) =>
      inst.type === 'copy' &&
      PAK_EXTENSIONS.includes(path.extname(inst.source as string).toLowerCase()),
  );
  const hasTildeMods = sourceHasSegment(instructions, '~mods');
  const hasPakMarker = instructionsHaveMarker(instructions, PAK_MARKERS);
  return Promise.resolve(hasPak || hasTildeMods || hasPakMarker);
}

export function mergePakMods(api: types.IExtensionApi) {
  return (mod: types.IMod) => pakPrefixForMod(api, mod) + mod.id;
}

export function getPakAltPath(api: types.IExtensionApi): string {
  const root = discoveryPath(api);
  return root ? path.join(root, CONTENT_PATH) : '.';
}

export function testPakAltPath(
  instructions: types.IInstruction[],
): Promise<boolean> {
  return Promise.resolve(
    modTypeFromInstructions(instructions) === MOD_TYPE_PAKALT,
  );
}

export function getContentPath(api: types.IExtensionApi): string {
  const root = discoveryPath(api);
  return root ? path.join(root, ROOT_FOLDER) : '.';
}

export function testContentPath(
  instructions: types.IInstruction[],
): Promise<boolean> {
  if (hasModTypeInstruction(instructions)) {
    return Promise.resolve(
      modTypeFromInstructions(instructions) === MOD_TYPE_CONTENT,
    );
  }
  if (instructionsHaveMarker(instructions, CONTENT_MARKERS)) {
    return Promise.resolve(true);
  }
  const topSeg = instructionSources(instructions)
    .map((source) => source.split(/[/\\]/)[0]?.toLowerCase())
    .find(Boolean);
  return Promise.resolve(topSeg === 'content' || topSeg === 'config');
}

export function getBinariesPath(api: types.IExtensionApi): string {
  const root = discoveryPath(api);
  return root ? path.join(root, BINARIES_WIN64) : '.';
}

export function testBinariesPath(
  instructions: types.IInstruction[],
): Promise<boolean> {
  if (hasModTypeInstruction(instructions)) {
    return Promise.resolve(
      modTypeFromInstructions(instructions) === MOD_TYPE_BINARIES,
    );
  }
  const hasBinary = instructions.some((inst) => {
    if (inst.type !== 'copy') {
      return false;
    }
    const ext = path.extname(inst.source as string).toLowerCase();
    return ext === '.dll' || ext === '.exe';
  });
  return Promise.resolve(
    instructionsHaveMarker(instructions, BINARIES_MARKERS) && hasBinary,
  );
}
