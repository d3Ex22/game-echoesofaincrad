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
| bitfix (Nexus [mod 14](https://www.nexusmods.com/echoesofaincrad/mods/14)) | `EchoesofAincrad/Binaries/Win64/` (proxy `.dll` + `bitfix/`) |
| Root (tree / mixed / binaries) | Game install root |
| UE4SS Lua / DLL | `EchoesofAincrad/Binaries/Win64/ue4ss/Mods/<Mod>/` |
| UE4SS Lua + Signatures | `ue4ss/Mods/<Mod>/` + `ue4ss/UE4SS_Signatures/` |
| Shared lib | `EchoesofAincrad/Binaries/Win64/ue4ss/Mods/shared/<Lib>/` |
| bitfix mod | `EchoesofAincrad/Binaries/Win64/bitfix/<Mod>/` |
| LogicMods | `EchoesofAincrad/Content/Paks/LogicMods/` |
| Asset PAK (`~mods`) | `EchoesofAincrad/Content/Paks/~mods/` |
| PAK Alt | `EchoesofAincrad/Content/Paks/…` (not `~mods`) |
| Content / Config | `EchoesofAincrad/Content/…` or `EchoesofAincrad/Config/…` |
| Load order | `ue4ss/Mods/mods.txt` (Lua + DLL); PAK via `~mods/AAA-<modId>/`; LogicMods via `LogicMods/AAA-<modId>/` |

`enabled.txt` is ignored on deploy (never copied). Enable and reorder Lua/DLL mods through Vortex load order → `mods.txt`.

If UE4SS is missing, Vortex offers **Install from Nexus**.
bitfix is optional and only offered when a bitfix mod is installed.

## Archive conventions (authors)

| Kind | Folder structure | Markers | Deploy path |
|---|---|---|---|
| UE4SS | `dwmapi.dll` + `UE4SS.dll` + `ue4ss/` | — | `EchoesofAincrad/Binaries/Win64/` |
| bitfix | proxy `.dll` (e.g. `x3daudio1_7.dll`) + `bitfix/` | — | `EchoesofAincrad/Binaries/Win64/` |
| bitfix mod | nested `bitfix/<Mod>/<Mod>.lua`, or flat `.lua` | `bitfix.info` · `.bitfix` · `.bitfixmod` | nested → `…/bitfix/<Mod>/` ; flat → `…/bitfix/*.lua` |
| Shared lib | `shared/<Lib>/…` or `<Lib>/<Lib>.lua` | `ue4sslib.info` · `.ue4sslib` · `.sharedlib` | `…/ue4ss/Mods/shared/<Lib>/` |
| Lua + Signatures | `Mods/<Mod>/Scripts/…` + `UE4SS_Signatures/*.lua` | `ue4sssig.info` · `.ue4sssig` · `.sigmod` | `…/ue4ss/Mods/<Mod>/` + `…/ue4ss/UE4SS_Signatures/` |
| Lua | `<Mod>/Scripts/*.lua` | `ue4ssmod.info` · `.ue4ssmod` · `.luamod` | `…/ue4ss/Mods/<Mod>/` |
| UE4SS DLL | `<Mod>/dlls/*.dll` | `ue4ssdll.info` · `.ue4ssdll` · `.dllmod` | `…/ue4ss/Mods/<Mod>/` |
| LogicMod | `LogicMods/*.pak` or `LogicMods/<Folder>/*.pak` (or flat `.pak` + marker) | `ue4sslogicmod.info` · `.ue4sslogicmod` · `.logicmod` | `…/LogicMods/AAA-<modId>/` (LO prefix) |
| Asset PAK | `~mods/*.pak` or `~mods/<Folder>/*.pak` (or flat `.pak` + marker) | `ue4sspak.info` · `.ue4sspak` · `.assetpak` · `.pakmod` | `…/~mods/AAA-<modId>/` (LO prefix) |
| IoStore | `.utoc` (+ `.ucas`), no `.pak` | `ue4ssiostore.info` · `.ue4ssiostore` · `.iostore` | `EchoesofAincrad/Content/Paks/~mods/` |
| PAK Alt | `Paks/…` (not `~mods`) + `.pak` | `ue4sspakalt.info` · `.ue4sspakalt` · `.pakalt` | `EchoesofAincrad/Content/Paks/…` |
| Content | top-level `Content/` or `Config/` | `ue4sscontent.info` · `.ue4sscontent` · `.contentmod` | `EchoesofAincrad/Content/…` or `…/Config/…` |
| Root | game tree, mixed buckets, or loose `.dll`/`.exe` | `ue4ssroot.info` · `.ue4ssroot` · `.rootmod` (+ aliases below) | Game install root |


Markers are optional; folder layout is preferred. Marker files are not deployed.

### Root mod

Handles full game trees, mixed payloads, and loose binaries — for large packs with several deploy targets. Prefer coherent folder names; markers force Root when needed.

**Aliases (same type):** `ue4sscombo.info` · `.ue4sscombo` · `.combomod` · `ue4ssmulti.info` · `.ue4ssmulti` · `.multimod` · `ue4ssbinaries.info` · `.ue4ssbinaries` · `.binariesmod`

| Layout | Maps to |
|---|---|
| `EchoesofAincrad/…` or `Engine/…` | stripped as-is under game install |
| `dwmapi.dll` / `UE4SS.dll` / `ue4ss/` | `…/Binaries/Win64/` |
| proxy `.dll` + `bitfix/` | `…/Binaries/Win64/` |
| `Mods/…`, `Scripts/…`, `UE4SS_Signatures/` | `…/ue4ss/…` |
| `shared/…`, `dlls/…` | `…/ue4ss/Mods/…` |
| `bitfix/*.lua` or flat `.lua` | `…/bitfix/…` |
| `LogicMods/` | `…/Content/Paks/LogicMods/` |
| `~mods/` or loose `.pak` | `…/Content/Paks/~mods/` |
| `Content/` / `Config/` | `…/EchoesofAincrad/…` |
| `Binaries/Win64/` or flat `.dll`/`.exe` | `…/Binaries/Win64/` |