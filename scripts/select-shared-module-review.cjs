// Trusted read-only selection. Never check out or execute the source PR here.
const fs = require('node:fs');
const path = require('node:path');
const { createHash } = require('node:crypto');
const { pathToFileURL } = require('node:url');
const { sourceContext, hasOccurrence } = require('./publish-investigation-feedback.cjs');

const MODULE_PATH = 'infra/modules/hostingPlan.bicep';
const REGISTRY_PATH = path.join(__dirname, '../fixtures/shared-module-consumers/registry.json');
const SHA = /^[a-f0-9]{40}$/;
const isBot = user => user?.login === 'github-actions[bot]' && user?.type === 'Bot';
const digest = bytes => createHash('sha256').update(bytes).digest('hex');

async function collect(method, args) {
  const items = [];
  for (let page = 1; page <= 10; page++) {
    const { data } = await method({ ...args, per_page: 100, page });
    if (!Array.isArray(data)) throw new Error('Invalid replay lookup response');
    items.push(...data);
    if (data.length < 100) return items;
  }
  throw new Error('Replay lookup incomplete; refusing another investigation');
}

async function recordedOccurrence(github, source) {
  const { owner, repo, occurrence } = source;
  const issues = await collect(github.rest.issues.listForRepo, {
    owner, repo, state: 'all', labels: 'shared-module-review', sort: 'updated', direction: 'desc',
  });
  for (const issue of issues) {
    if (issue.pull_request || !issue.title?.startsWith('[Module Review] ') ||
        !issue.labels?.some(label => (typeof label === 'string' ? label : label.name) === 'shared-module-review')) continue;
    if (isBot(issue.user) && hasOccurrence(issue.body, occurrence)) return true;
    const comments = await collect(github.rest.issues.listComments, { owner, repo, issue_number: issue.number });
    if (comments.some(comment => isBot(comment.user) && hasOccurrence(comment.body, occurrence))) return true;
  }
  return false;
}

async function sourceFile(github, owner, repo, ref) {
  const { data } = await github.rest.repos.getContent({ owner, repo, ref, path: MODULE_PATH });
  const maximum = 256 * 1024;
  if (Array.isArray(data) || data?.type !== 'file' || data.encoding !== 'base64' ||
      data.target !== undefined || data.submodule_git_url !== undefined ||
      !Number.isSafeInteger(data.size) || data.size < 1 || data.size > maximum ||
      typeof data.content !== 'string' || data.content.length > Math.ceil(maximum / 3) * 4 + 8192) {
    throw new Error('Invalid or oversized source module');
  }
  const encoded = data.content.replace(/[\r\n]/g, '');
  if (!/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(encoded)) {
    throw new Error('Invalid source module encoding');
  }
  const bytes = Buffer.from(encoded, 'base64');
  if (bytes.length !== data.size) throw new Error('Source module byte count mismatch');
  return bytes;
}

function boundedFile(rootDirectory, relative, maximum) {
  const root = path.resolve(rootDirectory);
  const filename = path.resolve(root, relative);
  if (!filename.startsWith(root + path.sep)) throw new Error('Evidence path is outside its artifact');
  for (let entry = filename; ; entry = path.dirname(entry)) {
    const stat = fs.lstatSync(entry);
    if (stat.isSymbolicLink()) throw new Error('Evidence must not contain symbolic links');
    if (entry === filename ? !stat.isFile() : !stat.isDirectory()) throw new Error('Invalid evidence file type');
    if (entry === root) break;
  }
  const stat = fs.statSync(filename);
  if (stat.size < 1 || stat.size > maximum) throw new Error('Invalid or oversized assessment evidence');
  const bytes = fs.readFileSync(filename);
  if (bytes.length > maximum) throw new Error('Assessment evidence exceeded its byte bound');
  return bytes;
}

function outputs(core, result) {
  for (const [key, value] of Object.entries(result)) core.setOutput(key, String(value));
  return result;
}

// The factory lets unit tests use the same TypeScript verifier before a dist build.
// Production always loads the fixed verifier from this trusted checkout below.
function createSelector(verifyAssessment) {
  return async function select({ github, context, core, evidenceDirectory }) {
    const source = await sourceContext(github, context, 'shared-module');
    if (!source.current) return outputs(core, { selected: false, investigate: false, replay: false, reason: 'stale-source' });
    const { owner, repo, run } = source;
    const baselineSha = run.pull_requests.find(pr => pr.base?.ref === 'main')?.base?.sha;
    if (!SHA.test(baselineSha || '')) throw new Error('Missing exact source CI baseline commit');
    const { data: candidateCommit } = await github.rest.repos.getCommit({ owner, repo, ref: run.head_sha, per_page: 1 });
    if (candidateCommit.sha !== run.head_sha || !Array.isArray(candidateCommit.parents)) {
      throw new Error('Source commit binding failed');
    }
    const [baselineModule, candidateModule] = await Promise.all([
      sourceFile(github, owner, repo, baselineSha), sourceFile(github, owner, repo, run.head_sha),
    ]);
    if (digest(baselineModule) === digest(candidateModule)) {
      return outputs(core, { selected: false, investigate: false, replay: false, reason: 'module-unchanged' });
    }
    // Preserve scope even if evidence validation below fails. A separate trusted
    // job attaches a manual-review check to the PR head without starting AI.
    core.setOutput('selected', 'true');

    const report = JSON.parse(boundedFile(evidenceDirectory, 'shared-module-assessment.json', 128 * 1024).toString('utf8'));
    const testedSha = report?.source?.testedSha;
    if (!SHA.test(testedSha || '')) throw new Error('Invalid tested commit identity');
    if (testedSha !== run.head_sha) {
      const { data: testedCommit } = await github.rest.repos.getCommit({ owner, repo, ref: testedSha, per_page: 1 });
      const parents = testedCommit.parents?.map(parent => parent.sha);
      if (testedCommit.sha !== testedSha || !Array.isArray(parents) || parents.length !== 2 ||
          !parents.includes(run.head_sha) || !parents.includes(baselineSha)) {
        throw new Error('Tested commit is not the exact source/base PR merge');
      }
    }
    const registryBytes = fs.readFileSync(REGISTRY_PATH);
    if (registryBytes.length > 128 * 1024) throw new Error('Trusted registry exceeds its byte bound');
    const registry = JSON.parse(registryBytes.toString('utf8'));
    if (!Array.isArray(registry.consumers) || registry.consumers.length > 8 || registry.consumers.length < 1) {
      throw new Error('Invalid trusted consumer registry');
    }
    const templates = {};
    for (const consumer of registry.consumers) {
      if (!/^[a-z][a-z0-9-]{0,63}$/.test(consumer.id)) throw new Error('Invalid trusted consumer identity');
      templates[consumer.id] = {};
      for (const variant of ['baseline', 'candidate']) {
        templates[consumer.id][variant] = boundedFile(evidenceDirectory,
          `consumer-templates/${variant}/${consumer.id}.json`, 512 * 1024);
      }
    }
    const verified = await verifyAssessment(report, {
      registryBytes, baselineModule, candidateModule,
      source: { repository: `${owner}/${repo}`, runId: String(run.id), runAttempt: String(run.run_attempt),
        headSha: run.head_sha, testedSha, baselineSha },
      templates,
    });
    if (verified.status !== 'PASSED' && verified.status !== 'FAILED') throw new Error('Assessment evidence is incomplete');
    const replay = verified.status === 'FAILED' && await recordedOccurrence(github, source);
    return outputs(core, { selected: true, investigate: verified.status === 'FAILED' && !replay, replay,
      reason: replay ? 'recorded-occurrence' : verified.status === 'FAILED' ? 'consumer-requirement-failed' : 'consumer-requirements-passed' });
  };
}

const select = createSelector(async (report, inputs) => {
  const { verifySharedModuleAssessment } = await import(pathToFileURL(path.join(__dirname, '../dist/scripts/assess-shared-module.js')).href);
  return verifySharedModuleAssessment(report, inputs);
});

module.exports = { select, createSelector };
