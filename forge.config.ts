import type {ForgeConfig} from '@electron-forge/shared-types'
import {MakerSquirrel} from '@electron-forge/maker-squirrel'
import {MakerZIP} from '@electron-forge/maker-zip'
import {MakerDeb} from '@electron-forge/maker-deb'
import {MakerRpm} from '@electron-forge/maker-rpm'
import {VitePlugin} from '@electron-forge/plugin-vite'
import {FusesPlugin} from '@electron-forge/plugin-fuses'
import {FuseV1Options, FuseVersion} from '@electron/fuses'

const config: ForgeConfig = {
  packagerConfig: {
    asar: true,
    // Production optimizations
    ignore: [
      /^\/src\//,
      /^\/\.vscode\//,
      /^\/\.git\//,
      /^\/test-results\//,
      /^\/playwright-report\//,
      /^\/\.env$/,
      /^\/\.env\.local$/,
      /^\/logs\//,
      /^\/temp\//,
      /\.test\./,
      /\.spec\./
    ],
    // macOS specific production settings
    ...(process.env.NODE_ENV === 'production' && {
      osxSign: {
        identity: process.env.APPLE_DEVELOPER_ID
      },
      osxNotarize: process.env.APPLE_ID
        ? {
            appleId: process.env.APPLE_ID,
            appleIdPassword: process.env.APPLE_APP_PASSWORD!,
            teamId: process.env.APPLE_TEAM_ID!
          }
        : undefined
    })
  },
  rebuildConfig: {},
  makers: [
    // Windows
    new MakerSquirrel({
      name: 'dao-copilot',
      setupIcon: './resources/icon.ico',
      loadingGif: './resources/loading.gif',
      noMsi: true
    }),
    // macOS
    new MakerZIP({}, ['darwin']),
    // Linux - Focus on DEB packages (more universally supported)
    new MakerDeb({
      options: {
        name: 'dao-copilot',
        productName: 'DAO Copilot',
        genericName: 'Productivity Tool',
        description: 'A comprehensive DAO management and collaboration platform',
        categories: ['Office'],
        icon: './resources/icon.png',
        maintainer: 'DAO Copilot Team',
        homepage: 'https://dao-copilot.com'
      }
    }),
    // Only include RPM if rpmbuild is available
    ...(process.platform === 'linux'
      ? [
          new MakerRpm({
            options: {
              name: 'dao-copilot',
              productName: 'DAO Copilot',
              genericName: 'Productivity Tool',
              description: 'A comprehensive DAO management and collaboration platform',
              categories: ['Office'],
              icon: './resources/icon.png'
            }
          })
        ]
      : [])
  ],
  plugins: [
    new VitePlugin({
      build: [
        {
          entry: 'src/main.ts',
          config: 'vite.main.config.ts',
          target: 'main'
        },
        {
          entry: 'src/preload.ts',
          config: 'vite.preload.config.ts',
          target: 'preload'
        }
      ],
      renderer: [
        {
          name: 'main_window',
          config: 'vite.renderer.config.mts'
        }
      ]
    }),

    new FusesPlugin({
      version: FuseVersion.V1,
      [FuseV1Options.RunAsNode]: false,
      [FuseV1Options.EnableCookieEncryption]: true,
      [FuseV1Options.EnableNodeOptionsEnvironmentVariable]: false,
      [FuseV1Options.EnableNodeCliInspectArguments]: false,
      [FuseV1Options.EnableEmbeddedAsarIntegrityValidation]: true,
      [FuseV1Options.OnlyLoadAppFromAsar]: true
    })
  ]
}

export default config
