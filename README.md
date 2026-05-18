# AdNetwork Adapters

Version-controlled ad mediation adapter configurations for Unity projects. Tracks SDK and adapter versions across three platforms — **AppLovin MAX**, **LevelPlay (IronSource)**, and **AdMob** — for both Unity 6 and Unity 2022.3.

Each release folder (`vX.Y.Z/`) contains the full set of `manifest.json`, `Dependencies.xml`, and `.unitypackage` files needed to integrate and verify adapter compatibility.

---

## Version Verification Tool

`verify-versions.js` is a zero-dependency Node.js script that cross-checks all adadapter versions across every source-of-truth file in this repo and generates the adapter compatibility tables.

| Source                                                          | What it tracks                                              |
| --------------------------------------------------------------- | ----------------------------------------------------------- |
| `{release}/{unity}/manifest.json`                               | Unity package registry versions (AppLovin compact encoding) |
| `{release}/{unity}/Max/Mediation/*/Editor/Dependencies.xml`     | AppLovin MAX adapter versions (Android + iOS)               |
| `{release}/{unity}/LevelPlay/Editor/IS*AdapterDependencies.xml` | LevelPlay (IronSource) adapter versions                     |
| `{release}/{unity}/AdMob/GoogleMobileAds.unitypackage`          | Google AdMob SDK version (embedded in package)              |
| `{release}/{unity}/AdMob/Mediation/*.unitypackage`              | AdMob mediation adapter native versions (embedded)          |
| `{release}/{unity}/Max/AppLovin-MAX-Unity-Plugin.unitypackage`  | AppLovin MAX SDK version (embedded in package)              |
| `{release}/{unity}/LevelPlay/UnityLevelPlay.unitypackage`       | LevelPlay Unity plugin version (embedded in package)        |

### Requirements

- Node.js 16+
- `tar` available on the system (standard on macOS and Linux)

### Usage

Run from the `adapters/` folder:

```bash
node verify-versions.js
```

The script auto-discovers all release folders matching `vX.Y.Z/` — adding a new release like `v1.3.0/` is picked up automatically with no configuration needed.

---

### Checks

#### Check A — `manifest.json` ↔ MAX `Dependencies.xml`

For every AppLovin MAX adapter (12 adapters × 2 platforms × 2 Unity flavors per release), the script reads the adapter version from the XML, encodes it to the compact manifest format, and compares:

```
"4.5.1.0"    →  "4050100.0.0"
"9.3.0.0.0"  →  "903000000.0.0"
```

Manifest key pattern: `com.applovin.mediation.adapters.{adaptername}.{android|ios}`

Also verifies LevelPlay SDK: `IronSourceSDKDependencies.xml` `<unityversion>` ↔ `com.unity.services.levelplay`.

**Output:** ✅ all match / ❌ list of mismatches with expected vs actual values.

---

#### Check B — `Unity2022_3` vs `Unity6`

Compares every adapter version field between the two Unity flavor folders within the same release. Differences are reported as 🔄 (expected in some cases, e.g. Meta adapter).

---

#### Check C — `.unitypackage` ↔ `manifest.json`

Extracts the embedded version from each main SDK package (without unpacking to disk) and compares to the manifest:

| Package                                  | Version source inside the package                                         | Manifest key                   |
| ---------------------------------------- | ------------------------------------------------------------------------- | ------------------------------ |
| `GoogleMobileAds.unitypackage`           | `GoogleMobileAds_version-X.Y.Z_manifest.txt` filename                     | `com.google.ads.mobile`        |
| `AppLovin-MAX-Unity-Plugin.unitypackage` | `MaxSdk/Scripts/MaxSdk.cs` → `_version = "X.Y.Z"`                         | `com.applovin.mediation.ads`   |
| `UnityLevelPlay.unitypackage`            | `LevelPlay/Runtime/Utilities/Constants.cs` → `k_PackageVersion = "X.Y.Z"` | `com.unity.services.levelplay` |

If a required `.unitypackage` is missing from a release/flavor, Check C reports it as a mismatch (`package file missing`) and the run exits with an error.

Uses `tar -tzf` / `tar -xzf -O` — no files are written to disk.

---

#### Check D — Cross-release diff (consecutive pairs)

For each consecutive pair of releases (e.g. `v1.1.1 → v1.2.0`, then `v1.2.0 → v1.3.0`), lists every ad-related manifest key whose value changed. Each pair gets its own section so history stays clean.

Keys tracked: `com.applovin.*`, `com.google.ads.*`, `com.unity.services.levelplay`.

---

### Generated output — `04. Adapters Compatibility.md`

One markdown file is written per release (e.g. `v1.2.0/04. Adapters Compatibility.md`):

- **Unity 6** — full Android + iOS tables (all 12 adapters, 7 columns each)
- **Unity 2022.3** — only rows that differ from Unity 6

Columns: Ad Network · SDK version · LevelPlay Unity version · LevelPlay Native version · MAX · AdMob · AdMob Native version.

> **Note:** Adapters marked with `*` (compatibility caveats) are not added automatically — add them manually after generation.

---

### Workspace structure expected

```
adapters/
├── verify-versions.js        ← this script
├── v1.1.1/
│   ├── Unity2022_3/
│   │   ├── manifest.json
│   │   ├── AdMob/
│   │   │   ├── GoogleMobileAds.unitypackage
│   │   │   └── Mediation/*.unitypackage
│   │   ├── LevelPlay/Editor/IS*AdapterDependencies.xml
│   │   ├── LevelPlay/UnityLevelPlay.unitypackage
│   │   └── Max/
│   │       ├── AppLovin-MAX-Unity-Plugin.unitypackage
│   │       └── Mediation/*/Editor/Dependencies.xml
│   └── Unity6/               ← same structure
├── v1.2.0/
│   └── ...
└── v1.3.0/                   ← new releases are picked up automatically
```

### Console output legend

| Symbol | Meaning                                                  |
| ------ | -------------------------------------------------------- |
| ✅     | All values match                                         |
| ❌     | Mismatch found (counted in final error total)            |
| 🔄     | Difference detected (informational — Check B or Check D) |
| ⚠️     | Version could not be found inside the package            |
