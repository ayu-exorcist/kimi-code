import { resolve } from 'node:path';

import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  appRoot,
  executableName,
  NATIVE_DIST_ROOT_ENV,
  nativeArtifactsDir,
  nativeBinDir,
  nativeBinPath,
  nativeBlobPath,
  nativeDistRoot,
  nativeIntermediatesDir,
  nativeJsBundlePath,
  nativeManifestDir,
  nativeManifestKey,
  nativeSeaConfigPath,
  nativeSmokeHome,
  SEA_SENTINEL_FUSE,
  targetTriple,
} from '../../../scripts/native/paths.mjs';

// paths.mjs builds every path with node:path.resolve (backslashes on Windows).
// Build expectations the same way so they match on every platform.
const p = (...segments: string[]): string => resolve(appRoot, ...segments);

afterEach(() => {
  vi.unstubAllEnvs();
});

async function loadNativeConfig() {
  vi.resetModules();
  const { default: config } = await import('../../../tsdown.native.config');
  return config;
}

describe('nativeDistRoot override', () => {
  it('keeps the app-local default when the override is absent or blank', () => {
    expect(nativeDistRoot({ env: {}, cwd: appRoot })).toBe(p('dist-native'));
    expect(
      nativeDistRoot({ env: { [NATIVE_DIST_ROOT_ENV]: '   ' }, cwd: appRoot }),
    ).toBe(p('dist-native'));
  });

  it('resolves relative and absolute override values', () => {
    const absolute = p('.tmp/native-output');
    expect(
      nativeDistRoot({
        env: { [NATIVE_DIST_ROOT_ENV]: 'relative-native' },
        cwd: appRoot,
      }),
    ).toBe(p('relative-native'));
    expect(
      nativeDistRoot({ env: { [NATIVE_DIST_ROOT_ENV]: absolute }, cwd: appRoot }),
    ).toBe(absolute);
  });

  it('moves all representative derived paths under the override', () => {
    const override = p('.tmp/forge-native');
    vi.stubEnv(NATIVE_DIST_ROOT_ENV, override);

    expect(nativeIntermediatesDir()).toBe(resolve(override, 'intermediates'));
    expect(nativeBlobPath()).toBe(resolve(override, 'intermediates/kimi.blob'));
    expect(nativeBinPath('win32-x64', 'win32')).toBe(
      resolve(override, 'bin/win32-x64/kimi.exe'),
    );
    expect(nativeManifestDir('win32-x64')).toBe(
      resolve(override, 'intermediates/native-assets/win32-x64'),
    );
    expect(nativeArtifactsDir()).toBe(resolve(override, 'artifacts'));
    expect(nativeSmokeHome()).toBe(resolve(override, 'smoke-home'));
  });
});

describe('tsdown native output directory', () => {
  it('uses the absolute app-local intermediates directory by default', async () => {
    vi.stubEnv(NATIVE_DIST_ROOT_ENV, undefined);

    await expect(loadNativeConfig()).resolves.toMatchObject({
      outDir: resolve(appRoot, 'dist-native/intermediates'),
    });
  });

  it('uses the native distribution root override', async () => {
    const override = resolve(appRoot, '.tmp/forge-native');
    vi.stubEnv(NATIVE_DIST_ROOT_ENV, override);

    await expect(loadNativeConfig()).resolves.toMatchObject({
      outDir: resolve(override, 'intermediates'),
    });
  });
});

describe('targetTriple', () => {
  it('returns platform-arch when env unset', () => {
    expect(targetTriple({ platform: 'darwin', arch: 'arm64', env: {} })).toBe('darwin-arm64');
    expect(targetTriple({ platform: 'linux', arch: 'x64', env: {} })).toBe('linux-x64');
    expect(targetTriple({ platform: 'win32', arch: 'x64', env: {} })).toBe('win32-x64');
  });

  it('honors KIMI_CODE_BUILD_TARGET override', () => {
    expect(
      targetTriple({
        platform: 'darwin',
        arch: 'arm64',
        env: { KIMI_CODE_BUILD_TARGET: 'linux-arm64' },
      }),
    ).toBe('linux-arm64');
  });

  it.each(['', '   ', '.', '..', '../escape', 'a/b', 'a\\b', '/absolute', 'C:\\absolute', 'win32 x64'])(
    'rejects unsafe target triple %j',
    (value) => {
      expect(() => targetTriple({ env: { KIMI_CODE_BUILD_TARGET: value } })).toThrow(/target/i);
    },
  );

  it('keeps valid target triples as one path segment', () => {
    expect(nativeBinPath('linux-arm64', 'linux')).toBe(
      p('dist-native/bin/linux-arm64/kimi'),
    );
    expect(() => nativeManifestDir('../escape')).toThrow(/target/i);
    expect(() => nativeManifestKey('a/b')).toThrow(/target/i);
  });
});

describe('executableName', () => {
  it('returns kimi.exe on win32', () => {
    expect(executableName('win32')).toBe('kimi.exe');
  });

  it('returns kimi on other platforms', () => {
    expect(executableName('darwin')).toBe('kimi');
    expect(executableName('linux')).toBe('kimi');
  });
});

describe('path helpers', () => {
  it('returns absolute intermediates dir under app root', () => {
    expect(nativeIntermediatesDir()).toBe(p('dist-native/intermediates'));
  });

  it('returns absolute bin dir per target', () => {
    expect(nativeBinDir('darwin-arm64')).toBe(p('dist-native/bin/darwin-arm64'));
  });

  it('returns absolute bin path with executable name', () => {
    expect(nativeBinPath('darwin-arm64', 'darwin')).toBe(
      p('dist-native/bin/darwin-arm64/kimi'),
    );
    expect(nativeBinPath('win32-x64', 'win32')).toBe(
      p('dist-native/bin/win32-x64/kimi.exe'),
    );
  });

  it('returns intermediate artifact paths', () => {
    expect(nativeJsBundlePath()).toBe(p('dist-native/intermediates/main.cjs'));
    expect(nativeBlobPath()).toBe(p('dist-native/intermediates/kimi.blob'));
    expect(nativeSeaConfigPath()).toBe(
      p('dist-native/intermediates/sea-config.json'),
    );
  });

  it('returns manifest key for target', () => {
    expect(nativeManifestKey('darwin-arm64')).toBe('native/darwin-arm64/manifest.json');
  });

  it('returns native dist root', () => {
    expect(nativeDistRoot()).toBe(p('dist-native'));
  });

  it('returns manifest dir for target', () => {
    expect(nativeManifestDir('darwin-arm64')).toBe(
      p('dist-native/intermediates/native-assets/darwin-arm64'),
    );
  });

  it('returns artifacts dir', () => {
    expect(nativeArtifactsDir()).toBe(p('dist-native/artifacts'));
  });

  it('returns smoke home', () => {
    expect(nativeSmokeHome()).toBe(p('dist-native/smoke-home'));
  });

  it('has correct SEA sentinel fuse value', () => {
    expect(SEA_SENTINEL_FUSE).toBe('NODE_SEA_FUSE_fce680ab2cc467b6e072b8b5df1996b2');
  });
});
