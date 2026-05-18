#!/usr/bin/env node
"use strict";

const fs = require("fs");
const path = require("path");
const { execSync } = require("child_process");

// ─── Root dir (script lives in the adapters/ folder) ─────────────────────────
const ROOT = __dirname;
const UNITY_FLAVORS = ["Unity2022_3", "Unity6"];

// ─── ANSI colors ──────────────────────────────────────────────────────────────
const C = {
  green: (s) => `\x1b[32m${s}\x1b[0m`,
  red: (s) => `\x1b[31m${s}\x1b[0m`,
  yellow: (s) => `\x1b[33m${s}\x1b[0m`,
  grey: (s) => `\x1b[90m${s}\x1b[0m`,
  cyan: (s) => `\x1b[36m${s}\x1b[0m`,
  bold: (s) => `\x1b[1m${s}\x1b[0m`,
};
const OK = C.green("✅");
const ERR = C.red("❌");
const CHG = C.yellow("🔄");
const SKP = C.grey("⚠️ ");

// ─── Adapter definitions ──────────────────────────────────────────────────────
// Order matches the reference compatibility table.
const ADAPTERS = [
  {
    displayName: "AppLovin",
    isXmlFile: "ISAppLovinAdapterDependencies.xml",
    sdkAndroidPkg: "com.applovin:applovin-sdk",
    sdkIosSameAsAndroid: true, // AppLovin SDK version is cross-platform
    maxFolder: null, // AppLovin IS the MAX SDK – no separate adapter
    admobKey: "com.google.ads.mobile.mediation.applovin",
    admobPkg: "GoogleMobileAdsAppLovinMediation.unitypackage",
  },
  {
    displayName: "Google",
    isXmlFile: "ISAdMobAdapterDependencies.xml",
    sdkAndroidPkg: "com.google.android.gms:play-services-ads",
    maxFolder: "Google",
    admobKey: null,
    admobPkg: null,
  },
  {
    displayName: "DT Exchange",
    isXmlFile: "ISFyberAdapterDependencies.xml",
    sdkAndroidPkg: "com.fyber:marketplace-sdk",
    maxFolder: "Fyber",
    admobKey: "com.google.ads.mobile.mediation.dtexchange",
    admobPkg: "GoogleMobileAdsDTExchangeMediation.unitypackage",
  },
  {
    displayName: "Unity Ads",
    isXmlFile: "ISUnityAdsAdapterDependencies.xml",
    sdkAndroidPkg: "com.unity3d.ads:unity-ads",
    maxFolder: "UnityAds",
    admobKey: "com.google.ads.mobile.mediation.unity",
    admobPkg: "GoogleMobileAdsUnityAdsMediation.unitypackage",
  },
  {
    displayName: "Meta",
    isXmlFile: "ISFacebookAdapterDependencies.xml",
    sdkAndroidPkg: "com.facebook.android:audience-network-sdk",
    maxFolder: "Facebook",
    admobKey: null,
    admobPkg: null,
  },
  {
    displayName: "Mintegral",
    isXmlFile: "ISMintegralAdapterDependencies.xml",
    sdkAndroidPkg: "com.mbridge.msdk.oversea:mbridge_android_sdk",
    maxFolder: "Mintegral",
    admobKey: "com.google.ads.mobile.mediation.mintegral",
    admobPkg: "GoogleMobileAdsMintegralMediation.unitypackage",
  },
  {
    displayName: "Pangle",
    isXmlFile: "ISPangleAdapterDependencies.xml",
    sdkAndroidPkg: "com.pangle.global:pag-sdk",
    maxFolder: "ByteDance",
    admobKey: "com.google.ads.mobile.mediation.pangle",
    admobPkg: "GoogleMobileAdsPangleMediation.unitypackage",
  },
  {
    displayName: "BidMachine",
    isXmlFile: "ISBidMachineAdapterDependencies.xml",
    sdkAndroidPkg: "io.bidmachine:ads",
    maxFolder: "BidMachine",
    admobKey: null,
    admobPkg: null,
  },
  {
    displayName: "InMobi",
    isXmlFile: "ISInMobiAdapterDependencies.xml",
    sdkAndroidPkg: "com.inmobi.monetization:inmobi-ads-kotlin",
    maxFolder: "InMobi",
    admobKey: "com.google.ads.mobile.mediation.inmobi",
    admobPkg: "GoogleMobileAdsInMobiMediation.unitypackage",
  },
  {
    displayName: "IronSource",
    isXmlFile: "IronSourceSDKDependencies.xml",
    sdkAndroidPkg: "com.unity3d.ads-mediation:mediation-sdk",
    maxFolder: "IronSource",
    admobKey: "com.google.ads.mobile.mediation.ironsource",
    admobPkg: "GoogleMobileAdsIronSourceMediation.unitypackage",
  },
  {
    displayName: "Liftoff Monetize",
    isXmlFile: "ISVungleAdapterDependencies.xml",
    sdkAndroidPkg: "com.vungle:vungle-ads",
    maxFolder: "Vungle",
    admobKey: "com.google.ads.mobile.mediation.liftoffmonetize",
    admobPkg: "GoogleMobileAdsLiftoffMonetizeMediation.unitypackage",
  },
  {
    displayName: "Moloco",
    isXmlFile: "ISMolocoAdapterDependencies.xml",
    sdkAndroidPkg: "com.moloco.sdk:moloco-sdk",
    maxFolder: "Moloco",
    admobKey: null,
    admobPkg: null,
  },
];

// ─── Version utilities ────────────────────────────────────────────────────────

/**
 * Encodes a dotted adapter version from a MAX XML to the AppLovin manifest
 * compact format: first component as-is, remaining components zero-padded to 2
 * digits each, then ".0.0" appended.
 *   "4.5.1.0"   → "4050100.0.0"
 *   "8.0.8.0.0" → "800080000.0.0"
 *   "9.3.0.0.0" → "903000000.0.0"
 */
function encodeVersion(dotVer) {
  const parts = dotVer.split(".");
  const head = parts[0];
  const tail = parts
    .slice(1)
    .map((p) => p.padStart(2, "0"))
    .join("");
  return `${head}${tail}.0.0`;
}

/**
 * Strips trailing ".0" segments, keeping at least 3 parts.
 *   "4.17.0.0"  → "4.17.0"
 *   "7.9.0.6.0" → "7.9.0.6"
 *   "9.3.0.0.0" → "9.3.0"
 */
function stripTrailingZeros(v) {
  if (!v) return v;
  const parts = v.split(".");
  while (parts.length > 3 && parts[parts.length - 1] === "0") parts.pop();
  return parts.join(".");
}

// ─── XML parser ───────────────────────────────────────────────────────────────

function parseXmlContent(xml) {
  const result = {
    unityVersion: null,
    androidPackages: [], // [{ groupArtifact, version }]
    iosPods: [], // [{ name, version }]
  };

  const uvMatch = xml.match(/<unityversion>(.*?)<\/unityversion>/);
  if (uvMatch) result.unityVersion = uvMatch[1].trim();

  // <androidPackage spec="GROUP:ARTIFACT:VERSION"> or [...VERSION...]
  const apRe = /androidPackage\s+spec="([^"]+)"/g;
  let m;
  while ((m = apRe.exec(xml)) !== null) {
    const spec = m[1].replace(/[\[\]]/g, "");
    const lastColon = spec.lastIndexOf(":");
    if (lastColon > -1) {
      result.androidPackages.push({
        groupArtifact: spec.substring(0, lastColon),
        version: spec.substring(lastColon + 1),
      });
    }
  }

  // <iosPod name="X" version="Y" ...> (name before version)
  const ipRe = /<iosPod\s[^>]*?name="([^"]+)"[^>]*?version="([^"]+)"/gs;
  while ((m = ipRe.exec(xml)) !== null) {
    result.iosPods.push({ name: m[1], version: m[2] });
  }
  // Reversed attribute order (version before name), avoiding duplicates
  const seen = new Set(result.iosPods.map((p) => p.name));
  const ipRe2 = /<iosPod\s[^>]*?version="([^"]+)"[^>]*?name="([^"]+)"/gs;
  while ((m = ipRe2.exec(xml)) !== null) {
    if (!seen.has(m[2])) result.iosPods.push({ name: m[2], version: m[1] });
  }

  return result;
}

function parseXml(filePath) {
  if (!fs.existsSync(filePath)) return null;
  return parseXmlContent(fs.readFileSync(filePath, "utf-8"));
}

// ─── Manifest parser ──────────────────────────────────────────────────────────

function parseManifest(filePath) {
  if (!fs.existsSync(filePath)) return null;
  try {
    return JSON.parse(fs.readFileSync(filePath, "utf-8")).dependencies || {};
  } catch (_) {
    return null;
  }
}

// ─── Unitypackage extraction ──────────────────────────────────────────────────

const _pkgCache = new Map();

/**
 * Extracts version info from a .unitypackage (gzipped tar).
 *
 * Main GoogleMobileAds.unitypackage:
 *   Reads version from the manifest filename inside the package:
 *   "Assets/GoogleMobileAds/GoogleMobileAds_version-11.0.0_manifest.txt"
 *   → { mainVersion: "11.0.0" }
 *
 * AppLovin-MAX-Unity-Plugin.unitypackage:
 *   Reads _version constant from Assets/MaxSdk/Scripts/MaxSdk.cs
 *   → { mainVersion: "..." }
 *
 * UnityLevelPlay.unitypackage:
 *   Reads k_PackageVersion constant from
 *   Assets/LevelPlay/Runtime/Utilities/Constants.cs
 *   → { mainVersion: "9.3.0" }
 *
 * Mediation packages (e.g. GoogleMobileAdsAppLovinMediation.unitypackage):
 *   Reads *MediationDependencies.xml inside the package.
 *   Android: com.google.ads.mediation:{network}:{VERSION}
 *   iOS: GoogleMobileAdsMediation{Network} iosPod version
 *   → { android: "13.6.1.0", ios: "13.6.1.0" }
 */
function extractFromUnitypackage(pkgPath) {
  if (_pkgCache.has(pkgPath)) return _pkgCache.get(pkgPath);
  const result = { mainVersion: null, android: null, ios: null };
  if (!fs.existsSync(pkgPath)) {
    _pkgCache.set(pkgPath, result);
    return result;
  }

  try {
    const opts = { encoding: "utf-8", stdio: "pipe" };
    const list = execSync(`tar -tzf "${pkgPath}"`, opts);
    const pathnameEntries = list
      .trim()
      .split("\n")
      .filter((e) => e.endsWith("/pathname"));

    for (const pe of pathnameEntries) {
      const content = execSync(`tar -xzf "${pkgPath}" -O "${pe}"`, opts).trim();

      // AdMob main SDK: version embedded in manifest filename
      const vMatch = content.match(
        /GoogleMobileAds_version-([\d.]+)_manifest\.txt$/,
      );
      if (vMatch) {
        result.mainVersion = vMatch[1];
        continue;
      }

      // AppLovin MAX: version constant in MaxSdk/Scripts/MaxSdk.cs
      if (content === "Assets/MaxSdk/Scripts/MaxSdk.cs") {
        const guid = pe.match(/\.\/([^/]+)\//)?.[1];
        if (guid) {
          const src = execSync(
            `tar -xzf "${pkgPath}" -O "./${guid}/asset"`,
            opts,
          );
          const mVer = src.match(/_version\s*=\s*"([\d.]+)"/);
          if (mVer) result.mainVersion = mVer[1];
        }
        continue;
      }

      // LevelPlay: k_PackageVersion constant in LevelPlay/Runtime/Utilities/Constants.cs
      if (content === "Assets/LevelPlay/Runtime/Utilities/Constants.cs") {
        const guid = pe.match(/\.\/([^/]+)\//)?.[1];
        if (guid) {
          const src = execSync(
            `tar -xzf "${pkgPath}" -O "./${guid}/asset"`,
            opts,
          );
          const mVer = src.match(/k_PackageVersion\s*=\s*"([\d.]+)"/);
          if (mVer) result.mainVersion = mVer[1];
        }
        continue;
      }

      // Mediation: *MediationDependencies.xml asset
      if (content.endsWith("MediationDependencies.xml")) {
        const guid = pe.match(/\.\/([^/]+)\//)?.[1];
        if (!guid) continue;
        const xmlContent = execSync(
          `tar -xzf "${pkgPath}" -O "./${guid}/asset"`,
          opts,
        );
        const parsed = parseXmlContent(xmlContent);
        const androidPkg = parsed.androidPackages.find((p) =>
          p.groupArtifact.startsWith("com.google.ads.mediation:"),
        );
        const iosPod = parsed.iosPods.find((p) =>
          p.name.startsWith("GoogleMobileAdsMediation"),
        );
        result.android = androidPkg?.version || null;
        result.ios = iosPod?.version || null;
        break;
      }
    }
  } catch (_) {
    /* leave result as-is */
  }

  _pkgCache.set(pkgPath, result);
  return result;
}

// ─── Release discovery ────────────────────────────────────────────────────────

function discoverReleases() {
  return fs
    .readdirSync(ROOT)
    .filter(
      (f) =>
        /^v\d+\.\d+\.\d+$/.test(f) &&
        fs.statSync(path.join(ROOT, f)).isDirectory(),
    )
    .sort();
}

// ─── Per-adapter data extraction ─────────────────────────────────────────────

/**
 * Builds one row per adapter for a single unity flavor directory.
 * Each row holds both Android and iOS columns so that one pass serves both tables.
 */
function extractAdapterRows(flavorDir, manifest) {
  return ADAPTERS.map((adapter) => {
    // ── IS (LevelPlay) XML ────────────────────────────────────────────────────
    const isXmlPath = path.join(
      flavorDir,
      "LevelPlay",
      "Editor",
      adapter.isXmlFile,
    );
    const isData = parseXml(isXmlPath);

    // SDK Android version – third-party SDK package
    let sdkVersionAndroid = "";
    if (isData) {
      const pkg = isData.androidPackages.find(
        (p) => p.groupArtifact === adapter.sdkAndroidPkg,
      );
      if (pkg) sdkVersionAndroid = pkg.version;
    }

    // LevelPlay Unity version = <unityversion>
    const levelplayUnityVer = isData?.unityVersion || "";

    // LevelPlay Native Android = com.unity3d.ads-mediation:*-adapter version
    let levelplayNativeAndroid = "";
    if (isData) {
      const adapterPkg = isData.androidPackages.find((p) =>
        p.groupArtifact.startsWith("com.unity3d.ads-mediation:"),
      );
      if (adapterPkg) levelplayNativeAndroid = adapterPkg.version;
    }

    // LevelPlay Native iOS = IS XML iosPod version, trailing zeros stripped
    const levelplayNativeIos =
      isData?.iosPods.length > 0
        ? stripTrailingZeros(isData.iosPods[0].version)
        : "";

    // ── MAX XML ───────────────────────────────────────────────────────────────
    let maxAndroid = "";
    let maxIos = "";

    if (adapter.maxFolder) {
      const maxData = parseXml(
        path.join(
          flavorDir,
          "Max",
          "Mediation",
          adapter.maxFolder,
          "Editor",
          "Dependencies.xml",
        ),
      );
      if (maxData) {
        const apkPkg = maxData.androidPackages.find((p) =>
          p.groupArtifact.startsWith("com.applovin.mediation:"),
        );
        if (apkPkg) maxAndroid = apkPkg.version;
        if (maxData.iosPods.length > 0) maxIos = maxData.iosPods[0].version;
      }
    } else {
      // AppLovin special case: AppLovin IS the MAX SDK
      maxAndroid = sdkVersionAndroid;
      maxIos = sdkVersionAndroid;
    }

    // iOS SDK version: MAX iosPod with trailing zeros stripped
    const sdkVersionIos = adapter.sdkIosSameAsAndroid
      ? sdkVersionAndroid
      : stripTrailingZeros(maxIos);

    // ── AdMob manifest version ────────────────────────────────────────────────
    const admobManifestVer =
      (adapter.admobKey && manifest?.[adapter.admobKey]) || "";

    // ── AdMob native versions from unitypackage ───────────────────────────────
    let admobNativeAndroid = "";
    let admobNativeIos = "";
    if (adapter.admobPkg) {
      const pkgPath = path.join(
        flavorDir,
        "AdMob",
        "Mediation",
        adapter.admobPkg,
      );
      const ex = extractFromUnitypackage(pkgPath);
      admobNativeAndroid = ex.android || "";
      admobNativeIos = ex.ios || "";
    }

    return {
      displayName: adapter.displayName,
      // Android columns
      sdkVersionAndroid,
      levelplayUnityVer,
      levelplayNativeAndroid,
      maxAndroid,
      admobManifestVer,
      admobNativeAndroid,
      // iOS columns
      sdkVersionIos,
      levelplayNativeIos,
      maxIos,
      admobNativeIos,
      // meta – used by checks
      maxFolder: adapter.maxFolder,
      admobKey: adapter.admobKey,
      admobPkg: adapter.admobPkg,
      isXmlMissing: !fs.existsSync(isXmlPath),
    };
  });
}

// ─── Check A: manifest vs MAX XML ─────────────────────────────────────────────

function runCheckA(rows, manifest) {
  const issues = [];
  for (const row of rows) {
    if (!row.maxFolder || (!row.maxAndroid && !row.maxIos)) continue;
    const keyBase = `com.applovin.mediation.adapters.${row.maxFolder.toLowerCase()}`;

    if (row.maxAndroid) {
      const manifestKey = `${keyBase}.android`;
      const expected = encodeVersion(row.maxAndroid);
      const actual = manifest?.[manifestKey] || "(missing)";
      issues.push({
        ok: expected === actual,
        adapter: row.displayName,
        platform: "android",
        manifestKey,
        expected,
        actual,
        xmlVal: row.maxAndroid,
      });
    }
    if (row.maxIos) {
      const manifestKey = `${keyBase}.ios`;
      const expected = encodeVersion(row.maxIos);
      const actual = manifest?.[manifestKey] || "(missing)";
      issues.push({
        ok: expected === actual,
        adapter: row.displayName,
        platform: "ios",
        manifestKey,
        expected,
        actual,
        xmlVal: row.maxIos,
      });
    }
  }

  // LevelPlay SDK: <unityversion> in IronSourceSDKDependencies.xml vs manifest
  const ironsource = rows.find((r) => r.displayName === "IronSource");
  if (ironsource?.levelplayUnityVer) {
    const expected = ironsource.levelplayUnityVer;
    const actual = manifest?.["com.unity.services.levelplay"] || "(missing)";
    issues.push({
      ok: expected === actual,
      adapter: "LevelPlay SDK",
      platform: "both",
      manifestKey: "com.unity.services.levelplay",
      expected,
      actual,
      xmlVal: expected,
    });
  }

  return issues;
}

// ─── Check B: Unity2022_3 vs Unity6 ──────────────────────────────────────────

function runCheckB(u6Rows, u22Rows) {
  const issues = [];
  for (let i = 0; i < ADAPTERS.length; i++) {
    const u6 = u6Rows[i];
    const u22 = u22Rows[i];
    if (!u6 || !u22) continue;

    const diffs = [];
    const check = (field, label) => {
      if (u6[field] !== u22[field])
        diffs.push({ label, u6: u6[field], u22: u22[field] });
    };
    check("sdkVersionAndroid", "SDK Android");
    check("levelplayUnityVer", "LevelPlay Unity");
    check("levelplayNativeAndroid", "LevelPlay Native Android");
    check("maxAndroid", "MAX Android");
    check("sdkVersionIos", "SDK iOS");
    check("levelplayNativeIos", "LevelPlay Native iOS");
    check("maxIos", "MAX iOS");
    check("admobManifestVer", "AdMob manifest");
    check("admobNativeAndroid", "AdMob Native Android");
    check("admobNativeIos", "AdMob Native iOS");

    if (diffs.length > 0) issues.push({ adapter: u6.displayName, diffs });
  }
  return issues;
}

// ─── Check C: AdMob + AppLovin MAX unitypackages vs manifest ─────────────────

function runCheckC(flavorDir, manifest) {
  const results = [];

  // AdMob main package
  const admobPkg = path.join(
    flavorDir,
    "AdMob",
    "GoogleMobileAds.unitypackage",
  );
  const admobEx = extractFromUnitypackage(admobPkg);
  results.push({
    label: "GoogleMobileAds.unitypackage",
    ok:
      (manifest?.["com.google.ads.mobile"] || "(missing)") ===
      (admobEx.mainVersion || "(not found in package)"),
    expected: manifest?.["com.google.ads.mobile"] || "(missing)",
    actual: admobEx.mainVersion || "(not found in package)",
  });

  // AppLovin MAX plugin package
  const maxPkg = path.join(
    flavorDir,
    "Max",
    "AppLovin-MAX-Unity-Plugin.unitypackage",
  );
  const maxEx = extractFromUnitypackage(maxPkg);
  results.push({
    label: "AppLovin-MAX-Unity-Plugin.unitypackage",
    ok:
      (manifest?.["com.applovin.mediation.ads"] || "(missing)") ===
      (maxEx.mainVersion || "(not found in package)"),
    expected: manifest?.["com.applovin.mediation.ads"] || "(missing)",
    actual: maxEx.mainVersion || "(not found in package)",
  });

  // LevelPlay Unity plugin package
  const levelPlayPkg = path.join(
    flavorDir,
    "LevelPlay",
    "UnityLevelPlay.unitypackage",
  );
  const lpExpected = manifest?.["com.unity.services.levelplay"] || "(missing)";
  if (!fs.existsSync(levelPlayPkg)) {
    results.push({
      label: "UnityLevelPlay.unitypackage",
      ok: false,
      expected: lpExpected,
      actual: "(package file missing)",
    });
  } else {
    const lpEx = extractFromUnitypackage(levelPlayPkg);
    results.push({
      label: "UnityLevelPlay.unitypackage",
      ok: lpExpected === (lpEx.mainVersion || "(not found in package)"),
      expected: lpExpected,
      actual: lpEx.mainVersion || "(not found in package)",
    });
  }

  return results;
}

// ─── Check D: cross-release diff (consecutive pairs) ────────────────────────

/**
 * Returns one entry per consecutive release pair.
 * Each entry: { from, to, diffs: [{ key, fromVer, toVer }] }
 */
function runCheckD(releases, manifestsByRelease) {
  const pairs = [];
  for (let i = 0; i < releases.length - 1; i++) {
    const from = releases[i];
    const to = releases[i + 1];
    const mFrom = manifestsByRelease[from];
    const mTo = manifestsByRelease[to];

    const allKeys = new Set([...Object.keys(mFrom), ...Object.keys(mTo)]);
    const diffs = [...allKeys]
      .filter(
        (k) =>
          k.startsWith("com.applovin.") ||
          k.startsWith("com.google.ads.") ||
          k === "com.unity.services.levelplay",
      )
      .sort()
      .map((key) => ({
        key,
        fromVer: mFrom[key] || "(absent)",
        toVer: mTo[key] || "(absent)",
      }))
      .filter((d) => d.fromVer !== d.toVer);

    pairs.push({ from, to, diffs });
  }
  return pairs;
}

// ─── Markdown generation ──────────────────────────────────────────────────────

function mdRow(cells) {
  return "| " + cells.join(" | ") + " |";
}

function renderTable(
  adapterRows,
  platform,
  levelplaySdkVer,
  maxSdkVer,
  admobSdkVer,
) {
  const lines = [
    mdRow([
      "Ad Network",
      "Ad network SDK version",
      "",
      "",
      "Adapters versions",
      "",
      "",
    ]),
    "|---|---|---|---|---|---|---|",
    mdRow([
      "",
      "",
      `LevelPlay Unity Version (${levelplaySdkVer})`,
      "LevelPlay Native Version",
      `MAX (${maxSdkVer})`,
      `AdMob (${admobSdkVer})`,
      "AdMob Native Version",
    ]),
  ];

  for (const row of adapterRows) {
    const isAndroid = platform === "android";
    lines.push(
      mdRow([
        row.displayName,
        isAndroid ? row.sdkVersionAndroid : row.sdkVersionIos,
        row.levelplayUnityVer,
        isAndroid ? row.levelplayNativeAndroid : row.levelplayNativeIos,
        isAndroid ? row.maxAndroid : row.maxIos,
        row.admobManifestVer,
        isAndroid ? row.admobNativeAndroid : row.admobNativeIos,
      ]),
    );
  }

  return lines.join("\n");
}

function getDiffRows(u6Rows, u22Rows, platform) {
  return u22Rows.filter((u22, i) => {
    const u6 = u6Rows[i];
    if (!u6) return true;
    if (platform === "android") {
      return (
        u22.sdkVersionAndroid !== u6.sdkVersionAndroid ||
        u22.levelplayUnityVer !== u6.levelplayUnityVer ||
        u22.levelplayNativeAndroid !== u6.levelplayNativeAndroid ||
        u22.maxAndroid !== u6.maxAndroid ||
        u22.admobManifestVer !== u6.admobManifestVer ||
        u22.admobNativeAndroid !== u6.admobNativeAndroid
      );
    }
    return (
      u22.sdkVersionIos !== u6.sdkVersionIos ||
      u22.levelplayUnityVer !== u6.levelplayUnityVer ||
      u22.levelplayNativeIos !== u6.levelplayNativeIos ||
      u22.maxIos !== u6.maxIos ||
      u22.admobManifestVer !== u6.admobManifestVer ||
      u22.admobNativeIos !== u6.admobNativeIos
    );
  });
}

function generateCompatibilityMd(u6Rows, u22Rows, manifest) {
  const levelplaySdkVer = manifest?.["com.unity.services.levelplay"] || "?";
  const maxSdkVer = manifest?.["com.applovin.mediation.ads"] || "?";
  const admobSdkVer = manifest?.["com.google.ads.mobile"] || "?";

  const lines = [];

  // ── Unity 6 ──────────────────────────────────────────────────────────────
  lines.push("# Unity 6", "");
  lines.push("## Android", "");
  lines.push(
    renderTable(u6Rows, "android", levelplaySdkVer, maxSdkVer, admobSdkVer),
  );
  lines.push("");
  lines.push(
    "Adapters marked with * are not updated to their latest version due to compatibility issues",
  );
  lines.push("");
  lines.push("## iOS", "");
  lines.push(
    renderTable(u6Rows, "ios", levelplaySdkVer, maxSdkVer, admobSdkVer),
  );
  lines.push("");
  lines.push(
    "Adapters marked with * are not updated to their latest version due to compatibility issues",
  );
  lines.push("");

  // ── Unity 2022.3 ──────────────────────────────────────────────────────────
  lines.push("# Unity 2022.3", "");
  lines.push("Only exceptions from Unity 6 are listed.", "");

  const androidDiffs = getDiffRows(u6Rows, u22Rows, "android");
  if (androidDiffs.length > 0) {
    lines.push("## Android", "");
    lines.push(
      renderTable(
        androidDiffs,
        "android",
        levelplaySdkVer,
        maxSdkVer,
        admobSdkVer,
      ),
    );
    lines.push("");
  }

  const iosDiffs = getDiffRows(u6Rows, u22Rows, "ios");
  if (iosDiffs.length > 0) {
    lines.push("## iOS", "");
    lines.push(
      renderTable(iosDiffs, "ios", levelplaySdkVer, maxSdkVer, admobSdkVer),
    );
    lines.push("");
  }

  if (androidDiffs.length === 0 && iosDiffs.length === 0) {
    lines.push("*(No differences from Unity 6)*", "");
  }

  return lines.join("\n");
}

// ─── Print helpers ────────────────────────────────────────────────────────────

function printHeader(title) {
  console.log("\n" + C.bold(C.cyan("─".repeat(64))));
  console.log(C.bold(C.cyan(` ${title}`)));
  console.log(C.bold(C.cyan("─".repeat(64))));
}

// ─── Main ─────────────────────────────────────────────────────────────────────

function main() {
  const releases = discoverReleases();
  if (releases.length === 0) {
    console.error(
      C.red("No release folders found (expected vX.Y.Z/ at workspace root)."),
    );
    process.exit(1);
  }

  // Canonical manifests per release (Unity6 is source of truth for cross-version diff)
  const manifestsByRelease = {};
  for (const r of releases) {
    manifestsByRelease[r] =
      parseManifest(path.join(ROOT, r, "Unity6", "manifest.json")) || {};
  }

  let totalIssues = 0;

  for (const releaseName of releases) {
    const releaseDir = path.join(ROOT, releaseName);
    printHeader(`Release: ${releaseName}`);

    // Extract data for each flavor
    const flavorData = {};
    for (const flavor of UNITY_FLAVORS) {
      const flavorDir = path.join(releaseDir, flavor);
      const manifest = parseManifest(path.join(flavorDir, "manifest.json"));
      flavorData[flavor] = {
        rows: extractAdapterRows(flavorDir, manifest),
        manifest,
        flavorDir,
      };
    }

    const u6 = flavorData["Unity6"];
    const u22 = flavorData["Unity2022_3"];

    // ── Check A: manifest vs MAX XML (per flavor) ─────────────────────────────
    for (const flavor of UNITY_FLAVORS) {
      const { rows, manifest } = flavorData[flavor];
      const issuesA = runCheckA(rows, manifest);
      const failsA = issuesA.filter((i) => !i.ok);
      const label = `Check A [${flavor}]: manifest ↔ MAX XML (${issuesA.length} pairs)`;
      if (failsA.length === 0) {
        console.log(`${OK}  ${label} — all match`);
      } else {
        console.log(`${ERR}  ${label} — ${failsA.length} mismatch(es)`);
        for (const f of failsA) {
          console.log(
            `       ${C.red("✗")} ${f.adapter} [${f.platform}]` +
              `  XML: ${f.xmlVal}` +
              `  → encoded: ${f.expected}` +
              `  manifest: ${C.red(f.actual)}`,
          );
        }
        totalIssues += failsA.length;
      }
    }

    // ── Check B: Unity2022_3 vs Unity6 ───────────────────────────────────────
    const issuesB = runCheckB(u6.rows, u22.rows);
    if (issuesB.length === 0) {
      console.log(`${OK}  Check B: Unity2022_3 vs Unity6 — all identical`);
    } else {
      console.log(
        `${CHG}  Check B: Unity2022_3 vs Unity6 — ${issuesB.length} adapter(s) differ`,
      );
      for (const diff of issuesB) {
        console.log(`   ${C.yellow("≠")} ${diff.adapter}`);
        for (const d of diff.diffs) {
          console.log(
            `       ${d.label.padEnd(28)}` +
              `Unity6=${C.cyan(d.u6 || "(empty)")}` +
              `  Unity2022_3=${C.yellow(d.u22 || "(empty)")}`,
          );
        }
      }
    }

    // ── Check C: unitypackages vs manifest (per flavor) ─────────────────────
    for (const flavor of UNITY_FLAVORS) {
      const { manifest, flavorDir } = flavorData[flavor];
      const issuesC = runCheckC(flavorDir, manifest);
      for (const issue of issuesC) {
        const label = `Check C [${flavor}]: ${issue.label} ↔ manifest`;
        if (issue.actual.includes("not found")) {
          console.log(`${SKP}  ${label} — version not found inside package`);
        } else if (issue.ok) {
          console.log(`${OK}  ${label} — match (${issue.actual})`);
        } else {
          console.log(`${ERR}  ${label} — MISMATCH`);
          console.log(
            `       manifest: ${C.red(issue.expected)}  package: ${C.red(issue.actual)}`,
          );
          totalIssues++;
        }
      }
    }

    // ── Generate 04. Adapters Compatibility.md ────────────────────────────────
    // Use Unity6 manifest as canonical for header versions; Unity6 rows for full tables
    const md = generateCompatibilityMd(u6.rows, u22.rows, u6.manifest);
    const mdPath = path.join(releaseDir, "04. Adapters Compatibility.md");
    fs.writeFileSync(mdPath, md, "utf-8");
    console.log(`${OK}  Generated: ${path.relative(ROOT, mdPath)}`);
  }

  // ── Check D: cross-release diff (consecutive pairs) ──────────────────────
  if (releases.length > 1) {
    const pairs = runCheckD(releases, manifestsByRelease);
    for (const { from, to, diffs } of pairs) {
      printHeader(`Check D: ${from} → ${to}`);
      if (diffs.length === 0) {
        console.log(`${OK}  No changes detected`);
      } else {
        console.log(`${CHG}  ${diffs.length} key(s) changed\n`);
        const keyWidth = Math.max(...diffs.map((d) => d.key.length));
        console.log(
          C.bold(`  ${"Key".padEnd(keyWidth + 2)}${from.padEnd(10)}  →  ${to}`),
        );
        console.log(`  ${"─".repeat(keyWidth + 30)}`);
        for (const diff of diffs) {
          console.log(
            `  ${CHG} ${diff.key.padEnd(keyWidth)}  ${diff.fromVer}${C.yellow("  →  ")}${diff.toVer}`,
          );
        }
      }
    }
  }

  // ── Summary ───────────────────────────────────────────────────────────────
  console.log("\n" + C.bold("─".repeat(64)));
  if (totalIssues === 0) {
    console.log(
      C.green(
        C.bold(
          `✅  All checks passed — ${releases.length} release(s) verified`,
        ),
      ),
    );
  } else {
    console.log(
      C.red(C.bold(`❌  ${totalIssues} issue(s) found — review output above`)),
    );
  }
  console.log(C.bold("─".repeat(64)) + "\n");
}

main();
