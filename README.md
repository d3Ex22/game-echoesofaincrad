# Vortex Extension — Echoes of Aincrad

- **Repo:** https://github.com/d3Ex22/game-echoesofaincrad
- **Nexus domain:** `echoesofaincrad`
- **Steam App ID:** `2244210`

## Build

```powershell
npm install
npm run build          # dist/ + out/echoesofaincrad-<version>.zip
npm run copyplugin     # %AppData%\Roaming\Vortex\plugins\echoesofaincrad-<version>
```

Restart Vortex after `copyplugin`.

## Art assets (`src/assets`)

| File | Size | Role |
|---|---|---|
| `tile.jpg` | 400x600 (2:3) | `registerGame.logo` — Games page local fallback |
| `gameart.jpg` | 1280x720 (16:9) | Banner / packaging |
| `thumbnail.jpg` | 80x80 (1:1) | Nexus Spine thumbnail asset |
| `exec.png` | 256x256 (1:1) | `supportedTools` Custom Launch |

## Deploy paths

| Mod kind | Path |
|---|---|
| UE4SS (Nexus [mod 7](https://www.nexusmods.com/echoesofaincrad/mods/7)) | `EchoesofAincrad/Binaries/Win64/` (`dwmapi.dll` + `ue4ss/`) |
| Combo / Root | Game install root (`EchoesofAincrad/` or `Engine/`) |
| UE4SS Lua / DLL | `EchoesofAincrad/Binaries/Win64/ue4ss/Mods/<Mod>/` |
| Shared lib | `EchoesofAincrad/Binaries/Win64/ue4ss/Mods/shared/<Lib>/` |
| LogicMods | `EchoesofAincrad/Content/Paks/LogicMods/` |
| Asset PAK (`~mods`) | `EchoesofAincrad/Content/Paks/~mods/` (prefix load order) |
| PAK Alt | `EchoesofAincrad/Content/Paks/…` (not `~mods`) |
| Content / Config | `EchoesofAincrad/Content/…` or `EchoesofAincrad/Config/…` |
| Binaries | `EchoesofAincrad/Binaries/Win64/` |
| Load order | `ue4ss/Mods/mods.txt` (Lua + DLL via Vortex load order); PAK order via filename prefix in `~mods` |

`enabled.txt` is ignored on deploy (never copied). Enable and reorder Lua/DLL mods through Vortex load order → `mods.txt`.

If UE4SS is missing, Vortex offers **Install from Nexus** (EoA-specific build, not stock GitHub).

## Archive conventions (authors)

| Kind | Folder structure | Markers | Deploy path |
|---|---|---|---|
| UE4SS | `dwmapi.dll` + `UE4SS.dll` + `ue4ss/` | — | `EchoesofAincrad/Binaries/Win64/` |
| Shared lib | `shared/<Lib>/…` or `<Lib>/<Lib>.lua` (no `Scripts/`) | `ue4sslib.info` · `.ue4sslib` · `.sharedlib` | `…/ue4ss/Mods/shared/<Lib>/` |
| Lua | `<Mod>/Scripts/*.lua` | `ue4ssmod.info` · `.ue4ssmod` · `.luamod` | `…/ue4ss/Mods/<Mod>/` |
| UE4SS DLL | `<Mod>/dlls/*.dll` | `ue4ssdll.info` · `.ue4ssdll` · `.dllmod` | `…/ue4ss/Mods/<Mod>/` |
| LogicMod | `LogicMods/` or flat `.pak` + marker | `ue4sslogicmod.info` · `.ue4sslogicmod` · `.logicmod` | `EchoesofAincrad/Content/Paks/LogicMods/` |
| Asset PAK | `~mods/` or flat `.pak` + marker | `ue4sspak.info` · `.ue4sspak` · `.assetpak` · `.pakmod` | `EchoesofAincrad/Content/Paks/~mods/` |
| IoStore | `.utoc` (+ `.ucas`), no `.pak` | `ue4ssiostore.info` · `.ue4ssiostore` · `.iostore` | `EchoesofAincrad/Content/Paks/~mods/` |
| PAK Alt | `Paks/…` (not `~mods`) + `.pak` | `ue4sspakalt.info` · `.ue4sspakalt` · `.pakalt` | `EchoesofAincrad/Content/Paks/…` |
| Combo | `EchoesofAincrad/…` with lua/binaries + `.pak` | `ue4sscombo.info` · `.ue4sscombo` · `.combomod` | Game install root |
| Root | `EchoesofAincrad/` or `Engine/` tree | `ue4ssroot.info` · `.ue4ssroot` · `.rootmod` | Game install root |
| Content | top-level `Content/` or `Config/` | `ue4sscontent.info` · `.ue4sscontent` · `.contentmod` | `EchoesofAincrad/Content/…` or `…/Config/…` |
| Binaries | `.dll` / `.exe` (not `dlls/`, not UE4SS ids) | `ue4ssbinaries.info` · `.ue4ssbinaries` · `.binariesmod` | `EchoesofAincrad/Binaries/Win64/` |

Markers are optional; folder layout is preferred. Marker files are not deployed.
