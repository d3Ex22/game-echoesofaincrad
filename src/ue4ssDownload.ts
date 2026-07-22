import { actions, log, selectors, types, util } from 'vortex-api';

import {
  GAME_ID,
  MOD_TYPE_UE4SS,
  NOTIF_ID_UE4SS_INSTALLING,
  UE4SS_NEXUS_MOD_ID,
  UE4SS_NEXUS_URL,
} from './common';

export function isUe4ssVortexMod(api: types.IExtensionApi): boolean {
  const mods: { [id: string]: types.IMod } = util.getSafe(
    api.getState(),
    ['persistent', 'mods', GAME_ID],
    {},
  );
  return Object.keys(mods).some((id) => mods[id]?.type === MOD_TYPE_UE4SS);
}

export async function downloadUe4ssFromNexus(
  api: types.IExtensionApi,
): Promise<void> {
  if (isUe4ssVortexMod(api)) {
    return;
  }

  api.sendNotification({
    id: NOTIF_ID_UE4SS_INSTALLING,
    message: 'Installing UE4SS (Echoes of Aincrad)',
    type: 'activity',
    noDismiss: true,
    allowSuppress: false,
  });

  try {
    if (api.ext?.ensureLoggedIn !== undefined) {
      await api.ext.ensureLoggedIn();
    }

    const modFiles = await api.ext?.nexusGetModFiles?.(
      GAME_ID,
      UE4SS_NEXUS_MOD_ID,
    );
    if (!modFiles?.length) {
      throw new Error('Could not list UE4SS files on Nexus');
    }

    const fileTime = (input: { uploaded_time: string }) =>
      Number.parseInt(input.uploaded_time, 10);
    const file = modFiles
      .filter((f) => f.category_id === 1)
      .sort((a, b) => fileTime(a) - fileTime(b))
      .reverse()[0];

    if (file === undefined) {
      throw new Error('No main UE4SS file found on Nexus');
    }

    const nxmUrl = `nxm://${GAME_ID}/mods/${UE4SS_NEXUS_MOD_ID}/files/${file.file_id}`;
    const dlInfo = { game: GAME_ID, name: 'UE4SS' };

    const dlId = await util.toPromise<string>((cb) =>
      api.events.emit(
        'start-download',
        [nxmUrl],
        dlInfo,
        undefined,
        cb,
        undefined,
        { allowInstall: false },
      ),
    );

    const modId = await util.toPromise<string>((cb) =>
      api.events.emit(
        'start-install-download',
        dlId,
        { allowAutoEnable: false },
        cb,
      ),
    );

    const profileId = selectors.lastActiveProfileForGame(
      api.getState(),
      GAME_ID,
    );
    util.batchDispatch(api.store, [
      actions.setModsEnabled(api, profileId, [modId], true, {
        allowAutoDeploy: true,
        installed: true,
      }),
      actions.setModType(GAME_ID, modId, MOD_TYPE_UE4SS),
      actions.setModAttributes(GAME_ID, modId, {
        customFileName: 'UE4SS (Echoes of Aincrad)',
        description:
          'Game-specific UE4SS from Nexus. Required for Lua and LogicMods.',
      }),
    ]);
  } catch (err) {
    log('error', 'Failed to download/install UE4SS from Nexus', err);
    api.showErrorNotification('Failed to download/install UE4SS', err, {
      allowReport: false,
    });
    util.opn(UE4SS_NEXUS_URL).catch(() => null);
  } finally {
    api.dismissNotification(NOTIF_ID_UE4SS_INSTALLING);
  }
}
