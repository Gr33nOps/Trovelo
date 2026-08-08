import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), 'utf8');
const readJson = async (path) => JSON.parse(await read(path));
const capture = (source, expression, label) => {
  const value = source.match(expression)?.[1];
  assert.ok(value, `Could not read ${label}`);
  return value;
};

const [pkg, lock, app, eas, gradle, strings, wrapper] = await Promise.all([
  readJson('package.json'),
  readJson('package-lock.json'),
  readJson('app.json'),
  readJson('eas.json'),
  read('android/app/build.gradle'),
  read('android/app/src/main/res/values/strings.xml'),
  read('android/gradle/wrapper/gradle-wrapper.properties'),
]);

const expo = app.expo;
const gradleVersion = capture(gradle, /versionName\s+["']([^"']+)["']/, 'Android versionName');
const gradleVersionCode = Number(capture(gradle, /versionCode\s+(\d+)/, 'Android versionCode'));
const applicationId = capture(gradle, /applicationId\s+["']([^"']+)["']/, 'Android applicationId');
const namespace = capture(gradle, /namespace\s+["']([^"']+)["']/, 'Android namespace');
const nativeName = capture(strings, /<string name="app_name">([^<]+)<\/string>/, 'native app name');

assert.equal(lock.version, pkg.version, 'package-lock top-level version differs from package.json');
assert.equal(lock.packages?.['']?.version, pkg.version, 'package-lock root package version differs from package.json');
assert.equal(expo.version, pkg.version, 'Expo version differs from package.json');
assert.equal(gradleVersion, pkg.version, 'Android versionName differs from package.json');
assert.equal(expo.android.versionCode, gradleVersionCode, 'Android versionCode differs between app.json and Gradle');
assert.equal(Number(expo.ios.buildNumber), gradleVersionCode, 'iOS buildNumber differs from Android versionCode');
assert.equal(expo.android.package, applicationId, 'Android package differs from applicationId');
assert.equal(applicationId, namespace, 'Android namespace differs from applicationId');
assert.equal(expo.ios.bundleIdentifier, applicationId, 'iOS bundle identifier differs from Android applicationId');
assert.equal(expo.name, nativeName, 'Expo app name differs from the native Android name');
assert.equal(eas.cli.appVersionSource, 'remote', 'EAS must use remote build-version management');
assert.match(wrapper, /^distributionSha256Sum=[a-f0-9]{64}$/m, 'Gradle distribution checksum is missing');
assert.doesNotMatch(gradle, /jsc-android:[^'"\n]*\+/, 'JSC dependency must not use a dynamic version');
assert.doesNotMatch(
  gradle,
  /buildTypes\s*\{[\s\S]*?release\s*\{[\s\S]{0,1000}?signingConfig\s+signingConfigs\.debug/,
  'Release signing must not fall back to the debug key',
);

const refName = process.env.GITHUB_REF_NAME;
if (refName?.startsWith('v')) {
  assert.equal(refName.slice(1), pkg.version, `Release tag ${refName} does not match package version ${pkg.version}`);
}

console.log(`Project metadata verified for Trovelo ${pkg.version} (${applicationId}, build ${gradleVersionCode}).`);
