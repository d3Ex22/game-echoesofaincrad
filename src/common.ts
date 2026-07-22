import path from 'path';

export const GAME_ID = 'echoesofaincrad';
export const STEAMAPP_ID = '2244210';

export const GAME_LOGO = 'tile.jpg';
export const TOOL_LOGO = 'exec.png';
export const EXECUTABLE = 'EchoesofAincrad.exe';

export const ROOT_FOLDER = 'EchoesofAincrad';

export const SHIPPING_EXECUTABLE = path.join(
  ROOT_FOLDER,
  'Binaries',
  'Win64',
  'EchoesofAincrad-Win64-Shipping.exe',
);

export const BINARIES_WIN64 = path.join(
  ROOT_FOLDER,
  'Binaries',
  'Win64',
);

export const UE4SS_DIR = path.join(BINARIES_WIN64, 'ue4ss');
export const UE4SS_LOADER = path.join(BINARIES_WIN64, 'dwmapi.dll');
export const UE4SS_SIGNATURES_FOLDER = 'UE4SS_Signatures';
export const UE4SS_SIGNATURES_PATH = path.join(
  UE4SS_DIR,
  UE4SS_SIGNATURES_FOLDER,
);

export const LUA_MODS_PATH = path.join(UE4SS_DIR, 'Mods');
export const SHARED_LIBS_PATH = path.join(LUA_MODS_PATH, 'shared');
export const MODS_FILE = 'mods.txt';

export const BITFIX_FOLDER_NAME = 'bitfix';
export const BITFIX_DIR = path.join(BINARIES_WIN64, BITFIX_FOLDER_NAME);
export const BITFIX_PROXY_NAMES = [
  'x3daudio1_7.dll',
  'd3d9.dll',
  'winmm.dll',
  'version.dll',
  'dsound.dll',
  'bitfix.dll',
];
export const BITFIX_ONDISK_MARKERS = [
  'bitfix.txt',
  ...BITFIX_PROXY_NAMES,
];

export const CONTENT_PATH = path.join(ROOT_FOLDER, 'Content');

export const PAKS_PATH = path.join(CONTENT_PATH, 'Paks');

export const PAK_MODS_PATH = path.join(PAKS_PATH, '~mods');

export const LOGICMODS_PATH = path.join(PAKS_PATH, 'LogicMods');

export const MOD_TYPE_UE4SS = `${GAME_ID}-ue4ss`;
export const MOD_TYPE_BITFIX = `${GAME_ID}-bitfix`;
export const MOD_TYPE_BITFIX_MOD = `${GAME_ID}-bitfix-mod`;
export const MOD_TYPE_SHARED_LIB = `${GAME_ID}-ue4ss-shared`;
export const MOD_TYPE_UE4SS_SIG = `${GAME_ID}-ue4ss-sig`;
export const MOD_TYPE_LUA = `${GAME_ID}-ue4ss-lua`;
export const MOD_TYPE_PAK = `${GAME_ID}-pak`;
export const MOD_TYPE_LOGICMOD = `${GAME_ID}-logicmod`;
export const MOD_TYPE_ROOT = `${GAME_ID}-root`;
export const MOD_TYPE_DLL = `${GAME_ID}-ue4ss-dll`;
export const MOD_TYPE_PAKALT = `${GAME_ID}-pakalt`;
export const MOD_TYPE_CONTENT = `${GAME_ID}-content`;

export const SHARED_LIB_MARKERS = [
  'ue4sslib.info',
  '.ue4sslib',
  '.sharedlib',
];

export const LUA_MOD_MARKERS = [
  'ue4ssmod.info',
  '.ue4ssmod',
  '.luamod',
];

export const UE4SS_SIG_MARKERS = [
  'ue4sssig.info',
  '.ue4sssig',
  '.sigmod',
];

export const DLL_MOD_MARKERS = [
  'ue4ssdll.info',
  '.ue4ssdll',
  '.dllmod',
];

export const LOGICMOD_MARKERS = [
  'ue4sslogicmod.info',
  '.ue4sslogicmod',
  '.logicmod',
];

export const PAK_MARKERS = [
  'ue4sspak.info',
  '.ue4sspak',
  '.assetpak',
  '.pakmod',
];

export const IOSTORE_MARKERS = [
  'ue4ssiostore.info',
  '.ue4ssiostore',
  '.iostore',
];

export const PAKALT_MARKERS = [
  'ue4sspakalt.info',
  '.ue4sspakalt',
  '.pakalt',
];

/** Unified root / mixed / binaries markers (aliases kept for authors). */
export const ROOT_MARKERS = [
  'ue4ssroot.info',
  '.ue4ssroot',
  '.rootmod',
  'ue4sscombo.info',
  '.ue4sscombo',
  '.combomod',
  'ue4ssmulti.info',
  '.ue4ssmulti',
  '.multimod',
  'ue4ssbinaries.info',
  '.ue4ssbinaries',
  '.binariesmod',
];

export const CONTENT_MARKERS = [
  'ue4sscontent.info',
  '.ue4sscontent',
  '.contentmod',
];

export const BITFIX_MARKERS = [
  'bitfix.info',
  '.bitfix',
  '.bitfixmod',
];

export const ALL_MOD_MARKERS = [
  ...SHARED_LIB_MARKERS,
  ...LUA_MOD_MARKERS,
  ...UE4SS_SIG_MARKERS,
  ...DLL_MOD_MARKERS,
  ...LOGICMOD_MARKERS,
  ...PAK_MARKERS,
  ...IOSTORE_MARKERS,
  ...PAKALT_MARKERS,
  ...ROOT_MARKERS,
  ...CONTENT_MARKERS,
  ...BITFIX_MARKERS,
];

export function hasMarker(
  files: string[],
  markers: readonly string[],
): boolean {
  return files.some((file) =>
    markers.includes(path.basename(file).toLowerCase()),
  );
}

export function shouldSkipInstallFile(basename: string): boolean {
  const lower = basename.toLowerCase();
  return lower === 'enabled.txt' || ALL_MOD_MARKERS.includes(lower);
}

export const UE4SS_NEXUS_MOD_ID = 7;
export const UE4SS_NEXUS_URL =
  'https://www.nexusmods.com/echoesofaincrad/mods/7';
export const UE4SS_LOADER_NAME = 'dwmapi.dll';
export const UE4SS_DLL_NAME = 'UE4SS.dll';
export const UE4SS_SETTINGS_NAME = 'UE4SS-settings.ini';
export const UE4SS_FOLDER_NAME = 'ue4ss';
export const MODS_FILE_BACKUP = 'mods.txt.original';

export const BITFIX_NEXUS_MOD_ID = 14;
export const BITFIX_NEXUS_URL =
  'https://www.nexusmods.com/echoesofaincrad/mods/14';

export const LUA_EXTENSIONS = ['.lua'];
export const PAK_EXTENSIONS = ['.pak', '.utoc', '.ucas'];

export const FOLDER_ATTR = 'eoaFolderId';
export const FOLDERS_ATTR = 'eoaFolderIds';
export const SIG_FILES_ATTR = 'eoaSigFiles';
export const NEEDS_UE4SS_ATTR = 'eoaNeedsUe4ss';
export const NEEDS_BITFIX_ATTR = 'eoaNeedsBitfix';

export const IGNORE_CONFLICTS = [
  'enabled.txt',
  'mods.txt',
  'UE4SS-settings.ini',
  ...ALL_MOD_MARKERS,
];

export const UE4SS_BUILTIN_MODS = [
  'BPML_GenericFunctions',
  'BPModLoaderMod',
  'ConsoleEnablerMod',
  'ConsoleCommandsMod',
  'CheatManagerEnablerMod',
  'LineTraceMod',
  'ActorDumperMod',
  'Keybinds',
];

export const NOTIF_ID_UE4SS_MISSING = 'eoa-ue4ss-missing';
export const NOTIF_ID_UE4SS_INSTALLING = 'eoa-ue4ss-installing';
export const NOTIF_ID_BITFIX_MISSING = 'eoa-bitfix-missing';
export const NOTIF_ID_BITFIX_INSTALLING = 'eoa-bitfix-installing';
