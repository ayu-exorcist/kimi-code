import { resolve } from 'node:path';

export const appRoot = resolve(import.meta.dirname, '..', '..');

const SAFE_TARGET_TRIPLE = /^[A-Za-z0-9][A-Za-z0-9._-]*$/;

export function assertSafeTargetTriple(target) {
  if (typeof target !== 'string' || !SAFE_TARGET_TRIPLE.test(target) || target === '.' || target === '..') {
    throw new Error(`Unsafe native build target: ${String(target)}`);
  }
  return target;
}

export function targetTriple({ platform = process.platform, arch = process.arch, env = process.env } = {}) {
  return assertSafeTargetTriple(env.KIMI_CODE_BUILD_TARGET ?? `${platform}-${arch}`);
}

export function executableName(platform = process.platform) {
  return platform === 'win32' ? 'kimi.exe' : 'kimi';
}

export const NATIVE_DIST_ROOT_ENV = 'KIMI_CODE_NATIVE_DIST_ROOT';

export function nativeDistRoot({ env = process.env, cwd = process.cwd() } = {}) {
  const configured = env[NATIVE_DIST_ROOT_ENV]?.trim();
  return configured ? resolve(cwd, configured) : resolve(appRoot, 'dist-native');
}

export function nativeIntermediatesDir() {
  return resolve(nativeDistRoot(), 'intermediates');
}

export function nativeBinDir(target = targetTriple()) {
  return resolve(nativeDistRoot(), 'bin', assertSafeTargetTriple(target));
}

export function nativeBinPath(target = targetTriple(), platform = process.platform) {
  return resolve(nativeBinDir(target), executableName(platform));
}

export function nativeJsBundlePath() {
  return resolve(nativeIntermediatesDir(), 'main.cjs');
}

export function nativeBlobPath() {
  return resolve(nativeIntermediatesDir(), 'kimi.blob');
}

export function nativeSeaConfigPath() {
  return resolve(nativeIntermediatesDir(), 'sea-config.json');
}

export function nativeManifestDir(target = targetTriple()) {
  return resolve(nativeIntermediatesDir(), 'native-assets', assertSafeTargetTriple(target));
}

export function nativeArtifactsDir() {
  return resolve(nativeDistRoot(), 'artifacts');
}

export function nativeSmokeHome() {
  return resolve(nativeDistRoot(), 'smoke-home');
}

export function nativeManifestKey(target = targetTriple()) {
  return `native/${assertSafeTargetTriple(target)}/manifest.json`;
}

export const SEA_SENTINEL_FUSE = 'NODE_SEA_FUSE_fce680ab2cc467b6e072b8b5df1996b2';
