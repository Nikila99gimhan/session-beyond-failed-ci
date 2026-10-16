// Real compiler rehearsal. All intentional defects live in a temporary directory.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const work = fs.mkdtempSync(path.join(os.tmpdir(), 'session-demo-qa-'));
const compiler = process.env.BICEP_BINARY || 'az';
const node = process.execPath;
const records = [];
function run(label, command, args, expected = 0) {
  const result = spawnSync(command, args, { cwd: root, encoding: 'utf8', timeout: 120000, maxBuffer: 4*1024*1024 });
  fs.writeFileSync(path.join(work, `${label}.log`), (result.stdout || '') + (result.stderr || ''));
  assert.equal(result.status, expected, `${label}: expected exit ${expected}; ${result.error || result.stderr || result.stdout}`);
  records.push({ label, exitCode: result.status });
  return result.stdout + result.stderr;
}
function build(label, directory, expected = 0) {
  const args = process.env.BICEP_BINARY ? ['build'] : ['bicep', 'build', '--file'];
  return run(label, compiler, [...args, path.join(directory,'main.bicep'), '--outfile', path.join(work, `${label}.json`), '--no-restore'], expected);
}
function policy(label, file, expected = 0) {
  run(label, node, [path.join(root,'dist/scripts/validate-deployment-policy.js'), file, path.join(work,`${label}.json`)], expected);
  return JSON.parse(fs.readFileSync(path.join(work,`${label}.json`)));
}
const baseline = path.join(work, 'baseline');
fs.cpSync(path.join(root,'infra'), baseline, {recursive:true});
build('baseline-build', baseline);
policy('baseline-policy', path.join(baseline,'parameters/active.json'));
const broken = path.join(work, 'build-policy');
fs.cpSync(baseline, broken, {recursive:true});
const networkFile = path.join(broken,'modules/network.bicep');
fs.writeFileSync(networkFile, fs.readFileSync(networkFile,'utf8').replace('output outboundSubnetId string', 'output functionSubnetId string'));
const parametersFile = path.join(broken,'parameters/active.json');
const parameters = JSON.parse(fs.readFileSync(parametersFile));
parameters.parameters.publicNetworkAccess.value = 'Enabled';
fs.writeFileSync(parametersFile, JSON.stringify(parameters,null,2)+'\n');
const diagnostic = build('mixed-build-fails', broken, 1);
assert.match(diagnostic, /BCP05[23]/);
assert.match(diagnostic, /outboundSubnetId/);
const violation = policy('mixed-policy-fails', parametersFile, 1);
assert.deepEqual(violation.violations.map(v=>v.ruleId), ['POL-AZ-NET-001']);
// Each correction independently leaves the other failure intact.
fs.copyFileSync(path.join(baseline,'modules/network.bicep'), networkFile);
build('fix-build-only', broken);
policy('policy-still-fails', parametersFile, 1);
fs.writeFileSync(networkFile, fs.readFileSync(networkFile,'utf8').replace('output outboundSubnetId string', 'output functionSubnetId string'));
fs.copyFileSync(path.join(baseline,'parameters/active.json'), parametersFile);
build('build-still-fails', broken, 1);
policy('fix-policy-only', parametersFile);
const shared = path.join(work, 'shared-default');
fs.cpSync(baseline, shared, {recursive:true});
const module = path.join(shared,'modules/hostingPlan.bicep');
fs.writeFileSync(module, fs.readFileSync(module,'utf8').replace('param zoneRedundant bool = true','param zoneRedundant bool = false'));
build('shared-root-build', shared);
policy('shared-root-policy', path.join(shared,'parameters/active.json'));
const compiled = JSON.parse(fs.readFileSync(path.join(work,'shared-root-build.json')));
const hosting = compiled.resources.find(r=>r.name === 'hostingPlanDeployment');
assert.equal(hosting.properties.parameters.zoneRedundant.value, "[parameters('zoneRedundant')]");
assert.equal(compiled.parameters.zoneRedundant.defaultValue, true);
const reportFile = path.join(work, 'shared-module-assessment.json');
run('shared-consumers-finding', node, [path.join(root,'dist/scripts/assess-shared-module.js'), '--baseline-module', path.join(baseline,'modules/hostingPlan.bicep'), '--candidate-module', module, '--output', reportFile, '--templates-dir', path.join(work,'consumer-templates')], 1);
const report = JSON.parse(fs.readFileSync(reportFile));
assert.equal(report.failuresCount, 1);
assert.equal(report.consumers.length,2);
assert.equal(report.consumers.find(c=>c.id==='sample-explicit-zone').candidate.effectiveZoneRedundant,true);
assert.equal(report.consumers.find(c=>c.id==='sample-inherited-zone').candidate.effectiveZoneRedundant,false);
run('shared-consumers-unchanged', node, [path.join(root,'dist/scripts/assess-shared-module.js'), '--baseline-module', path.join(baseline,'modules/hostingPlan.bicep'), '--candidate-module', path.join(baseline,'modules/hostingPlan.bicep'), '--output', path.join(work,'unchanged-assessment.json'), '--templates-dir', path.join(work,'unchanged-templates')]);
fs.writeFileSync(path.join(work,'verification.json'), JSON.stringify({scope:'Local real Bicep compilation and policy checks; no Azure deployment or live agent run', records, compilerDiagnostic: diagnostic.match(/BCP05[23]/)?.[0], artifactDirectory:work},null,2)+'\n');
console.log(`Verified ${records.length} real compiler/policy cases. Evidence: ${work}/verification.json`);
