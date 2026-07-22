import { actions, log, selectors, types, util } from 'vortex-api';

import {
  BITFIX_NEXUS_MOD_ID,
  BITFIX_NEXUS_URL,
  GAME_ID,
  MOD_TYPE_BITFIX,
  NOTIF_ID_BITFIX_INSTALLING,
} from './common';

export function isBitfixVortexMod(api: types.IExtensionApi): boolean {
  const mods: { [id: string]: types.IMod } = util.getSafe(
    api.getState(),
    ['persistent', 'mods', GAME_ID],
    {},
  );
  return Object.keys(mods).some((id) => mods[id]?.type === MOD_TYPE_BITFIX);
}

function bitfixNexusReference(): types.IModReference {
  return {
    repo: {
      repository: 'nexus',
      gameId: GAME_ID,
      modId: String(BITFIX_NEXUS_MOD_ID),
    },
    description: 'bitfix (Echoes of Aincrad)',
  };
}

export function bitfixDependencyRuleInstructions(): types.IInstruction[] {
  const reference = bitfixNexusReference();
  return [
    { type: 'rule', rule: { type: 'after', reference } },
    { type: 'rule', rule: { type: 'requires', reference } },
  ];
}

export async function downloadBitfixFromNexus(
  api: types.IExtensionApi,
): Promise<void> {
  if (isBitfixVortexMod(api)) {
    return;
  }

  api.sendNotification({
    id: NOTIF_ID_BITFIX_INSTALLING,
    message: 'Installing bitfix (Echoes of Aincrad)',
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
      BITFIX_NEXUS_MOD_ID,
    );
    if (!modFiles?.length) {
      throw new Error('Could not list bitfix files on Nexus');
    }

    const fileTime = (input: { uploaded_time: string }) =>
      Number.parseInt(input.uploaded_time, 10);
    const file = modFiles
      .filter((f) => f.category_id === 1)
      .sort((a, b) => fileTime(a) - fileTime(b))
      .reverse()[0];

    if (file === undefined) {
      throw new Error('No main bitfix file found on Nexus');
    }

    const nxmUrl = `nxm://${GAME_ID}/mods/${BITFIX_NEXUS_MOD_ID}/files/${file.file_id}`;
    const dlInfo = { game: GAME_ID, name: 'bitfix' };

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
      actions.setModType(GAME_ID, modId, MOD_TYPE_BITFIX),
      actions.setModAttributes(GAME_ID, modId, {
        customFileName: 'bitfix (Echoes of Aincrad)',
        description:
          'bitfix loader from Nexus. Required for bitfix Lua patches.',
      }),
    ]);
  } catch (err) {
    log('error', 'Failed to download/install bitfix from Nexus', err);
    api.showErrorNotification('Failed to download/install bitfix', err, {
      allowReport: false,
    });
    util.opn(BITFIX_NEXUS_URL).catch(() => null);
  } finally {
    api.dismissNotification(NOTIF_ID_BITFIX_INSTALLING);
  }
}
