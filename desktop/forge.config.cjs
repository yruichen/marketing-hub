const path = require('node:path');
const { FuseV1Options, FuseVersion } = require('@electron/fuses');
const { flipFuses } = require('@electron/fuses');

async function hardenElectronBinary(forgeConfig, resourcesPath, _electronVersion, platform, arch) {
  const applePlatform = platform === 'darwin' || platform === 'mas';
  const executableName = applePlatform ? 'Electron' : 'electron';
  const executableSuffix = platform === 'win32' ? '.exe' : '';
  const executablePath = applePlatform
    ? path.join(path.resolve(resourcesPath, '..', '..'), 'MacOS', executableName)
    : path.join(path.resolve(resourcesPath, '..', '..'), `${executableName}${executableSuffix}`);
  const signingConfigured = Boolean(forgeConfig.packagerConfig.osxSign);

  await flipFuses(executablePath, {
    version: FuseVersion.V1,
    resetAdHocDarwinSignature: applePlatform && arch === 'arm64' && !signingConfigured,
    strictlyRequireAllFuses: true,
    [FuseV1Options.RunAsNode]: false,
    [FuseV1Options.EnableCookieEncryption]: true,
    [FuseV1Options.EnableNodeOptionsEnvironmentVariable]: false,
    [FuseV1Options.EnableNodeCliInspectArguments]: false,
    [FuseV1Options.EnableEmbeddedAsarIntegrityValidation]: true,
    [FuseV1Options.OnlyLoadAppFromAsar]: true,
    [FuseV1Options.LoadBrowserProcessSpecificV8Snapshot]: false,
    [FuseV1Options.GrantFileProtocolExtraPrivileges]: false,
    [FuseV1Options.WasmTrapHandlers]: true,
  });
}

module.exports = {
  packagerConfig: {
    appBundleId: 'com.marketinghub.desktop',
    appCategoryType: 'public.app-category.productivity',
    asar: true,
    executableName: 'marketing-hub',
    name: 'Marketing Hub',
    prune: true,
    ignore: [
      /^\/src($|\/)/,
      /^\/tests($|\/)/,
      /^\/scripts($|\/)/,
      /^\/out($|\/)/,
      /^\/\.nvmrc$/,
      /^\/tsconfig\.json$/,
      /^\/vitest\.config\.ts$/,
    ],
  },
  rebuildConfig: {},
  hooks: {
    packageAfterCopy: hardenElectronBinary,
  },
  makers: [
    {
      name: '@electron-forge/maker-squirrel',
      config: {
        name: 'marketing_hub',
      },
    },
    {
      name: '@electron-forge/maker-zip',
      platforms: ['darwin'],
    },
    {
      name: '@electron-forge/maker-deb',
      config: {
        options: {
          maintainer: 'Marketing Hub Contributors',
          homepage: 'https://github.com/yruichen/marketing-hub',
        },
      },
    },
  ],
};
