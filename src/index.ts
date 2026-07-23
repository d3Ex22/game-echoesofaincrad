import path from 'path';

import { fs, log, selectors, types, util } from 'vortex-api';

import {
  BINARIES_WIN64,
  BITFIX_DIR,
  BITFIX_NEXUS_URL,
  BITFIX_ONDISK_MARKERS,
  EXECUTABLE,
  GAME_ID,
  GAME_LOGO,
  IGNORE_CONFLICTS,
  LOGICMODS_PATH,
  LUA_MODS_PATH,
  NEEDS_BITFIX_ATTR,
  MOD_TYPE_BITFIX,
  MOD_TYPE_BITFIX_MOD,
  MOD_TYPE_CONTENT,
  MOD_TYPE_DLL,
  MOD_TYPE_LOGICMOD,
  MOD_TYPE_LUA,
  MOD_TYPE_PAK,
  MOD_TYPE_PAKALT,
  MOD_TYPE_ROOT,
  MOD_TYPE_SHARED_LIB,
  MOD_TYPE_UE4SS,
  MOD_TYPE_UE4SS_SIG,
  NOTIF_ID_BITFIX_MISSING,
  NOTIF_ID_UE4SS_MISSING,
  PAKS_PATH,
  PAK_MODS_PATH,
  ROOT_FOLDER,
  SHARED_LIBS_PATH,
  SHIPPING_EXECUTABLE,
  STEAMAPP_ID,
  TOOL_LOGO,
  UE4SS_DIR,
  UE4SS_LOADER,
  UE4SS_NEXUS_URL,
} from './common';

import {
  installBitfix,
  installBitfixMod,
  installContentMod,
  installDllMod,
  installLogicMod,
  installLuaMod,
  installPakAltMod,
  installPakIostoreMod,
  installPakMod,
  installRootMod,
  installSharedLib,
  installUe4ss,
  installUe4ssSigMod,
  testBitfix,
  testBitfixMod,
  testContentMod,
  testDllMod,
  testLogicMod,
  testLuaMod,
  testPakAltMod,
  testPakIostoreMod,
  testPakMod,
  testRootMod,
  testSharedLib,
  testUe4ss,
  testUe4ssSigMod,
} from './installers';

import {
  getBitfixModPath,
  getBitfixPath,
  getContentPath,
  getDllPath,
  getLogicModPath,
  getLuaPath,
  getPakAltPath,
  getPakPath,
  getRootModPath,
  getSharedLibPath,
  getUe4ssPath,
  getUe4ssSigPath,
  mergeLogicMods,
  mergePakMods,
  testBitfixModPath,
  testBitfixPath,
  testContentPath,
  testDllPath,
  testLogicModPath,
  testLuaPath,
  testPakAltPath,
  testPakPath,
  testRootModPath,
  testSharedLibPath,
  testUe4ssPath,
  testUe4ssSigPath,
} from './modtypes';

import {
  deserializeLoadOrder,
  serializeLoadOrder,
  syncModsTxtFromEnabled,
} from './modsFile';

import { downloadBitfixFromNexus, isBitfixVortexMod } from './bitfixDownload';
import { downloadUe4ssFromNexus, isUe4ssVortexMod } from './ue4ssDownload';
import {
  ensureUe4ssOverrideRules,
  repairUe4ssSigRules,
} from './ue4ssRules';

async function isUe4ssOnDisk(discoveryPath: string): Promise<boolean> {
  const hasLoader = await fs
    .statAsync(path.join(discoveryPath, UE4SS_LOADER))
    .then(() => true)
    .catch(() => false);

  const hasUe4ss = await fs
    .statAsync(path.join(discoveryPath, UE4SS_DIR))
    .then(() => true)
    .catch(() => false);

  return hasLoader && hasUe4ss;
}

async function isBitfixOnDisk(discoveryPath: string): Promise<boolean> {
  const win64 = path.join(discoveryPath, BINARIES_WIN64);
  for (const name of BITFIX_ONDISK_MARKERS) {
    const found = await fs
      .statAsync(path.join(win64, name))
      .then(() => true)
      .catch(() => false);
    if (found) {
      return true;
    }
  }
  // bitfix.txt may also live under bitfix/ (folder alone is not enough —
  // prepareForModding creates an empty bitfix/ dir).
  const nestedTxt = await fs
    .statAsync(path.join(discoveryPath, BITFIX_DIR, 'bitfix.txt'))
    .then(() => true)
    .catch(() => false);
  return nestedTxt;
}

function hasBitfixDependentMods(api: types.IExtensionApi): boolean {
  const mods: { [id: string]: types.IMod } = util.getSafe(
    api.getState(),
    ['persistent', 'mods', GAME_ID],
    {},
  );
  return Object.keys(mods).some((id) => {
    const mod = mods[id];
    return (
      mod?.type === MOD_TYPE_BITFIX_MOD ||
      Boolean(mod?.attributes?.[NEEDS_BITFIX_ATTR])
    );
  });
}

function maybeOfferBitfix(api: types.IExtensionApi, discoveryPath?: string) {
  void (async () => {
    const discovery =
      discoveryPath ??
      selectors.discoveryByGame(api.getState(), GAME_ID)?.path;
    if (!discovery) {
      return;
    }

    const bitfixReady =
      (await isBitfixOnDisk(discovery)) || isBitfixVortexMod(api);
    if (bitfixReady || !hasBitfixDependentMods(api)) {
      api.dismissNotification(NOTIF_ID_BITFIX_MISSING);
      return;
    }

    api.sendNotification({
      id: NOTIF_ID_BITFIX_MISSING,
      type: 'warning',
      title: 'bitfix required',
      message:
        'A bitfix mod is installed. Install bitfix from Nexus to run it.',
      actions: [
        {
          title: 'Install from Nexus',
          action: (dismiss) => {
            dismiss();
            downloadBitfixFromNexus(api).catch((err) => {
              log('error', 'bitfix Nexus install failed', err);
            });
          },
        },
        {
          title: 'Open Nexus page',
          action: () => {
            util.opn(BITFIX_NEXUS_URL).catch(() => undefined);
          },
        },
      ],
    });
  })();
}

async function prepareForModding(
  api: types.IExtensionApi,
  discovery: types.IDiscoveryResult,
) {
  if (!discovery?.path) {
    return;
  }

  await fs.ensureDirWritableAsync(path.join(discovery.path, LUA_MODS_PATH));
  await fs.ensureDirWritableAsync(path.join(discovery.path, SHARED_LIBS_PATH));
  await fs.ensureDirWritableAsync(path.join(discovery.path, PAK_MODS_PATH));
  await fs.ensureDirWritableAsync(path.join(discovery.path, LOGICMODS_PATH));
  await fs.ensureDirWritableAsync(path.join(discovery.path, BITFIX_DIR));
  await fs.ensureDirWritableAsync(
    path.join(discovery.path, ROOT_FOLDER, 'Content'),
  );
  await fs.ensureDirWritableAsync(path.join(discovery.path, PAKS_PATH));

  const ue4ssReady =
    (await isUe4ssOnDisk(discovery.path)) || isUe4ssVortexMod(api);
  if (ue4ssReady) {
    api.dismissNotification(NOTIF_ID_UE4SS_MISSING);
  } else {
    api.sendNotification({
      id: NOTIF_ID_UE4SS_MISSING,
      type: 'warning',
      title: 'UE4SS not detected',
      message:
        'Install the Echoes of Aincrad UE4SS build from Nexus (required for UE4SS mods).',
      actions: [
        {
          title: 'Install from Nexus',
          action: (dismiss) => {
            dismiss();
            downloadUe4ssFromNexus(api).catch((err) => {
              log('error', 'UE4SS Nexus install failed', err);
            });
          },
        },
        {
          title: 'Open Nexus page',
          action: () => {
            util.opn(UE4SS_NEXUS_URL).catch(() => undefined);
          },
        },
      ],
    });
  }

  maybeOfferBitfix(api, discovery.path);
}

function findGame() {
  return util.GameStoreHelper.findByAppId([STEAMAPP_ID]).then(
    (game) => game.gamePath,
  );
}

function openGamePath(api: types.IExtensionApi, relPath: string) {
  const discovery = selectors.discoveryByGame(api.getState(), GAME_ID);
  if (!discovery?.path) {
    return;
  }
  util.opn(path.join(discovery.path, relPath)).catch((err) => {
    log('warn', 'Failed to open folder', err);
  });
}

function isActiveGame(api: types.IExtensionApi): boolean {
  return selectors.activeGameId(api.getState()) === GAME_ID;
}

const tools: types.ITool[] = [
  {
    id: `${GAME_ID}-customlaunch`,
    name: 'Custom Launch',
    logo: TOOL_LOGO,
    executable: () => EXECUTABLE,
    requiredFiles: [EXECUTABLE],
    relative: true,
    exclusive: true,
    detach: true,
  },
];

function main(context: types.IExtensionContext) {
  context.registerGame({
    id: GAME_ID,
    name: 'Echoes of Aincrad',
    mergeMods: true,
    queryPath: findGame,
    queryModPath: () => '.',
    logo: GAME_LOGO,
    supportedTools: tools,
    executable: () => EXECUTABLE,
    requiredFiles: [EXECUTABLE, SHIPPING_EXECUTABLE],
    environment: {
      SteamAPPId: STEAMAPP_ID,
    },
    details: {
      steamAppId: parseInt(STEAMAPP_ID, 10),
      nexusPageId: GAME_ID,
      ignoreConflicts: IGNORE_CONFLICTS,
    },
    setup: ((discovery: types.IDiscoveryResult) =>
      prepareForModding(context.api, discovery)) as any,
  });

  context.registerInstaller(
    'eoa-root',
    9,
    testRootMod as any,
    ((files: string[], destinationPath: string) =>
      installRootMod(files, destinationPath)) as any,
  );

  context.registerInstaller(
    'eoa-ue4ss',
    10,
    testUe4ss as any,
    ((files: string[], destinationPath: string) =>
      installUe4ss(files, destinationPath)) as any,
  );

  context.registerInstaller(
    'eoa-bitfix',
    11,
    testBitfix as any,
    ((files: string[]) => installBitfix(files)) as any,
  );

  context.registerInstaller(
    'eoa-ue4ss-shared',
    20,
    testSharedLib as any,
    ((files: string[], destinationPath: string) =>
      installSharedLib(files, destinationPath)) as any,
  );

  context.registerInstaller(
    'eoa-ue4ss-sig',
    22,
    testUe4ssSigMod as any,
    ((files: string[], destinationPath: string) =>
      installUe4ssSigMod(files, destinationPath)) as any,
  );

  context.registerInstaller(
    'eoa-bitfix-mod',
    24,
    testBitfixMod as any,
    ((files: string[], destinationPath: string) =>
      installBitfixMod(files, destinationPath)) as any,
  );

  context.registerInstaller(
    'eoa-ue4ss-lua',
    25,
    testLuaMod as any,
    ((files: string[], destinationPath: string) =>
      installLuaMod(files, destinationPath)) as any,
  );

  context.registerInstaller(
    'eoa-ue4ss-dll',
    26,
    testDllMod as any,
    ((files: string[], destinationPath: string) =>
      installDllMod(files, destinationPath)) as any,
  );

  context.registerInstaller(
    'eoa-logicmod',
    30,
    testLogicMod as any,
    ((files: string[]) => installLogicMod(files)) as any,
  );

  context.registerInstaller(
    'eoa-pak-iostore',
    32,
    testPakIostoreMod as any,
    ((files: string[]) => installPakIostoreMod(files)) as any,
  );

  context.registerInstaller(
    'eoa-pakalt',
    33,
    testPakAltMod as any,
    ((files: string[]) => installPakAltMod(files)) as any,
  );

  context.registerInstaller(
    'eoa-pak',
    35,
    testPakMod as any,
    ((files: string[]) => installPakMod(files)) as any,
  );

  context.registerInstaller(
    'eoa-contentfolder',
    40,
    testContentMod as any,
    ((files: string[]) => installContentMod(files)) as any,
  );


  context.registerModType(
    MOD_TYPE_ROOT,
    9,
    (gameId) => gameId === GAME_ID,
    () => getRootModPath(context.api),
    testRootModPath as any,
    { name: 'Root Mod', deploymentEssential: true },
  );

  context.registerModType(
    MOD_TYPE_UE4SS,
    10,
    (gameId) => gameId === GAME_ID,
    () => getUe4ssPath(context.api),
    testUe4ssPath as any,
    { name: 'UE4SS', deploymentEssential: true },
  );

  context.registerModType(
    MOD_TYPE_BITFIX,
    11,
    (gameId) => gameId === GAME_ID,
    () => getBitfixPath(context.api),
    testBitfixPath as any,
    { name: 'bitfix', deploymentEssential: true },
  );


  context.registerModType(
    MOD_TYPE_SHARED_LIB,
    20,
    (gameId) => gameId === GAME_ID,
    () => getSharedLibPath(context.api),
    testSharedLibPath as any,
    { name: 'UE4SS Shared Lib', deploymentEssential: true },
  );

  context.registerModType(
    MOD_TYPE_UE4SS_SIG,
    22,
    (gameId) => gameId === GAME_ID,
    () => getUe4ssSigPath(context.api),
    testUe4ssSigPath as any,
    { name: 'UE4SS Lua + Signatures', deploymentEssential: true },
  );

  context.registerModType(
    MOD_TYPE_BITFIX_MOD,
    24,
    (gameId) => gameId === GAME_ID,
    () => getBitfixModPath(context.api),
    testBitfixModPath as any,
    { name: 'bitfix Mod', deploymentEssential: true },
  );

  context.registerModType(
    MOD_TYPE_LUA,
    25,
    (gameId) => gameId === GAME_ID,
    () => getLuaPath(context.api),
    testLuaPath as any,
    { name: 'UE4SS Lua', deploymentEssential: true },
  );

  context.registerModType(
    MOD_TYPE_DLL,
    26,
    (gameId) => gameId === GAME_ID,
    () => getDllPath(context.api),
    testDllPath as any,
    { name: 'UE4SS DLL', deploymentEssential: true },
  );

  context.registerModType(
    MOD_TYPE_LOGICMOD,
    30,
    (gameId) => gameId === GAME_ID,
    () => getLogicModPath(context.api),
    testLogicModPath as any,
    {
      name: 'UE4SS LogicMod',
      deploymentEssential: true,
      mergeMods: mergeLogicMods(context.api),
    },
  );

  context.registerModType(
    MOD_TYPE_PAK,
    35,
    (gameId) => gameId === GAME_ID,
    () => getPakPath(context.api),
    testPakPath as any,
    {
      name: 'PAK Mod',
      deploymentEssential: true,
      mergeMods: mergePakMods(context.api),
    },
  );

  context.registerModType(
    MOD_TYPE_PAKALT,
    33,
    (gameId) => gameId === GAME_ID,
    () => getPakAltPath(context.api),
    testPakAltPath as any,
    { name: 'PAK Alt', deploymentEssential: true },
  );

  context.registerModType(
    MOD_TYPE_CONTENT,
    40,
    (gameId) => gameId === GAME_ID,
    () => getContentPath(context.api),
    testContentPath as any,
    { name: 'Content Mod', deploymentEssential: true },
  );


  context.registerLoadOrder({
    gameId: GAME_ID,
    validate: async () => Promise.resolve(undefined),
    deserializeLoadOrder: async () => deserializeLoadOrder(context.api),
    serializeLoadOrder: async (loadOrder: types.LoadOrder) =>
      serializeLoadOrder(context.api, loadOrder),
    toggleableEntries: true,
    usageInstructions:
      'Drag to reorder UE4SS Lua/DLL (mods.txt), PAK mods (~mods/AAA-…), and LogicMods (LogicMods/AAA-…). Deploy after edits.',
  });

  context.registerAction(
    'mod-icons',
    290,
    'download',
    {},
    'Download UE4SS (Nexus)',
    () => {
      downloadUe4ssFromNexus(context.api).catch((err) => {
        log('error', 'UE4SS Nexus install failed', err);
      });
    },
    () => isActiveGame(context.api) && !isUe4ssVortexMod(context.api),
  );

  context.registerAction(
    'mod-icons',
    291,
    'download',
    {},
    'Download bitfix (Nexus)',
    () => {
      downloadBitfixFromNexus(context.api).catch((err) => {
        log('error', 'bitfix Nexus install failed', err);
      });
    },
    () =>
      isActiveGame(context.api) &&
      !isBitfixVortexMod(context.api) &&
      hasBitfixDependentMods(context.api),
  );

  context.registerAction(
    'mod-icons',
    300,
    'open-ext',
    {},
    'Open Lua Mods Folder',
    () => openGamePath(context.api, LUA_MODS_PATH),
    () => isActiveGame(context.api),
  );

  context.registerAction(
    'mod-icons',
    298,
    'open-ext',
    {},
    'Open bitfix Folder',
    () => openGamePath(context.api, BITFIX_DIR),
    () => isActiveGame(context.api),
  );

  context.registerAction(
    'mod-icons',
    299,
    'open-ext',
    {},
    'Open Shared Libs Folder',
    () => openGamePath(context.api, SHARED_LIBS_PATH),
    () => isActiveGame(context.api),
  );

  context.registerAction(
    'mod-icons',
    301,
    'open-ext',
    {},
    'Open LogicMods Folder',
    () => openGamePath(context.api, LOGICMODS_PATH),
    () => isActiveGame(context.api),
  );

  context.registerAction(
    'mod-icons',
    302,
    'open-ext',
    {},
    'Open ~mods Folder',
    () => openGamePath(context.api, PAK_MODS_PATH),
    () => isActiveGame(context.api),
  );

  context.registerAction(
    'mod-icons',
    303,
    'open-ext',
    {},
    'Open Paks Folder',
    () => openGamePath(context.api, PAKS_PATH),
    () => isActiveGame(context.api),
  );

  context.once(() => {
    context.api.events.on(
      'did-install-mod',
      (gameId: string, _archiveId: string, modId: string) => {
        if (gameId !== GAME_ID) {
          return;
        }
        // Only the installed mod (or migrate refs when UE4SS itself lands).
        // Do NOT re-walk every mod on startup/deploy — that recreated requires
        // chains and dependency recursion after Vortex restarts.
        ensureUe4ssOverrideRules(context.api, modId);
        maybeOfferBitfix(context.api);
      },
    );

    context.api.onAsync(
      'did-deploy',
      async (profileId: string) => {
        const state = context.api.getState();
        const profile = selectors.profileById(state, profileId);
        if (profile?.gameId !== GAME_ID) {
          return;
        }
        try {
          await syncModsTxtFromEnabled(context.api);
        } catch (err) {
          log('error', 'Failed to sync mods.txt after deploy', err);
        }
        // Repair SIG after+fileList only — never re-inject requires here.
        repairUe4ssSigRules(context.api);
        const discovery = selectors.discoveryByGame(state, GAME_ID);
        if (discovery?.path) {
          maybeOfferBitfix(context.api, discovery.path);
        }
      },
    );

    repairUe4ssSigRules(context.api);
    maybeOfferBitfix(context.api);
  });

  return true;
}

export default main;
