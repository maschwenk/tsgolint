// @ts-check
/// <reference lib="es2023" />

import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';

const npmPackageVersion = requiredEnvVar('TSGOLINT_VERSION');

// Fork packaging: published as @maschwenk/oxlint-tsgolint with platform packages
// @maschwenk/oxlint-tsgolint-<platform>-<arch>. Keep in sync with npm/core/bin/tsgolint.js.
const CORE_PACKAGE_NAME = '@maschwenk/oxlint-tsgolint';
const PLATFORM_PACKAGE_PREFIX = `${CORE_PACKAGE_NAME}-`;

const GOOS2PROCESS_PLATFORM = {
  windows: 'win32',
  linux: 'linux',
  darwin: 'darwin',
};
const GOARCH2PROCESS_ARCH = {
  amd64: 'x64',
  arm64: 'arm64',
};

const binariesMatrix = Object.entries(GOOS2PROCESS_PLATFORM).flatMap(
  ([goos, platform]) =>
    Object.entries(GOARCH2PROCESS_ARCH).map(([goarch, arch]) => ({
      goarch,
      goos,
      arch,
      platform,
      artifactName: `tsgolint-${goos}-${goarch}`,
      npmPackageName: `${PLATFORM_PACKAGE_PREFIX}${platform}-${arch}`,
    })),
);

const commonPackageJson = {
  version: npmPackageVersion,
  description:
    'Fork of oxlint-tsgolint built against the TypeScript 7.1 nightly, for use with oxlint.',
  license: 'MIT',
  author: 'auvred <aauvred@gmail.com>',
  repository: {
    type: 'git',
    url: 'git+https://github.com/maschwenk/tsgolint.git',
  },
  bugs: 'https://github.com/maschwenk/tsgolint/issues',
  homepage: 'https://github.com/maschwenk/tsgolint#readme',
  publishConfig: {
    access: 'public',
  },
};

const repoRoot = path.join(import.meta.dirname, '..');

const npmDir = path.join(repoRoot, 'npm');
const licensePath = path.join(repoRoot, 'LICENSE');
const readmePath = path.join(repoRoot, 'README.md');
const buildDir = path.join(repoRoot, 'build');

await Promise.all([
  ...binariesMatrix.map(
    async ({ arch, platform, artifactName, npmPackageName }) => {
      const packageName = `${platform}-${arch}`;
      const packageDir = path.join(npmDir, packageName);
      const binaryName = `tsgolint${platform === 'win32' ? '.exe' : ''}`;

      await fs.rm(packageDir, { recursive: true, force: true });
      await fs.mkdir(packageDir);
      await Promise.all([
        fs.writeFile(
          path.join(packageDir, 'package.json'),
          JSON.stringify(
            {
              ...commonPackageJson,
              publishConfig: {
                ...commonPackageJson.publishConfig,
                executableFiles: [binaryName],
              },
              name: npmPackageName,
              preferUnplugged: true,
              files: [binaryName],
              os: [platform],
              cpu: [arch],
            },
            null,
            2,
          ),
        ),
        fs.copyFile(licensePath, path.join(packageDir, 'LICENSE')),
        fs.copyFile(
          path.join(buildDir, artifactName, 'tsgolint'),
          path.join(packageDir, binaryName),
        ),
      ]);
    },
  ),
  (async () => {
    const packageDir = path.join(npmDir, 'core');
    await Promise.all([
      fs.writeFile(
        path.join(packageDir, 'package.json'),
        JSON.stringify(
          {
            ...commonPackageJson,
            name: CORE_PACKAGE_NAME,
            bin: {
              tsgolint: './bin/tsgolint.js',
            },
            optionalDependencies: Object.fromEntries(
              binariesMatrix.map(({ npmPackageName }) => [
                npmPackageName,
                npmPackageVersion,
              ]),
            ),
          },
          null,
          2,
        ),
      ),
      fs.copyFile(licensePath, path.join(packageDir, 'LICENSE')),
      fs.copyFile(readmePath, path.join(packageDir, 'README.md')),
    ]);
  })(),
]);

function requiredEnvVar(/** @type {string} */ name) {
  const value = process.env[name];
  assert.ok(value != null, `missing $${name} env variable`);
  return value;
}
