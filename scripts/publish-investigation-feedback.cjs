// Trusted automation only. Never execute triggering PR code in this writer.
const CHECK_NAME = 'CI Investigation';
const COMMENT_MARKER = '<!-- governed-ci-investigation -->';
const isId = value => Number.isSafeInteger(Number(value)) && Number(value) > 0;
const isBot = user => user?.login === 'github-actions[bot]' && user?.type === 'Bot';

async function collect(method, args) {
  const items = [];
  for (let page = 1; page <= 10; page++) {
    const { data } = await method({ ...args, per_page: 100, page });
    const batch = Array.isArray(data) ? data : data.check_runs;
    if (!Array.isArray(batch)) throw new Error('Invalid GitHub list response');
    items.push(...batch);
    if (batch.length < 100) return items;
  }
  throw new Error('Feedback lookup incomplete; refusing an ambiguous write');
}

function hasOccurrence(body, marker) {
  return String(body || '').split('\n').some(line =>
    line.trim().replace(/^<!--\s*/, '').replace(/\s*-->$/, '') === marker);
}

async function sourceContext(github, context) {
  const event = context.payload.workflow_run;
  const repoId = context.payload.repository?.id;
  if (!event || !isId(event.id) || !isId(event.run_attempt) || !repoId) throw new Error('Missing source run identity');
  const { owner, repo } = context.repo;
  const { data: run } = await github.rest.actions.getWorkflowRunAttempt({
    owner, repo, run_id: event.id, attempt_number: event.run_attempt,
  });
  if (run.id !== event.id || run.repository?.id !== repoId || run.head_repository?.id !== repoId ||
      run.event !== 'pull_request' || run.path !== '.github/workflows/ci.yml' ||
      run.status !== 'completed' || run.conclusion !== 'failure' ||
      run.head_sha !== event.head_sha || run.head_branch === 'main' ||
      !/^[a-f0-9]{40}$/.test(run.head_sha) || !isId(run.run_attempt) ||
      Number(run.run_attempt) !== Number(event.run_attempt)) {
    throw new Error('Source is not the exact failed same-repository PR CI attempt');
  }
  const candidates = (run.pull_requests || []).filter(pr => pr.base?.ref === 'main');
  if (candidates.length !== 1 || !isId(candidates[0].number)) throw new Error('Source PR is ambiguous');
  const number = candidates[0].number;
  const { data: pr } = await github.rest.pulls.get({ owner, repo, pull_number: number });
  if (pr.number !== number || pr.head?.repo?.id !== repoId || pr.base?.repo?.id !== repoId ||
      pr.base?.ref !== 'main' || pr.head?.ref !== run.head_branch) throw new Error('Source PR binding failed');
  return {
    owner, repo, run, pr,
    current: pr.state === 'open' && pr.head.sha === run.head_sha,
    externalId: `${owner}/${repo}::${run.id}::${run.run_attempt}`,
    occurrence: `OCCURRENCE_KEY: ${owner}/${repo}::${run.id}::${run.run_attempt}`,
    ciUrl: `${context.serverUrl}/${owner}/${repo}/actions/runs/${run.id}`,
    investigationUrl: `${context.serverUrl}/${owner}/${repo}/actions/runs/${context.runId}`,
  };
}

async function start({ github, context, core }) {
  const source = await sourceContext(github, context);
  const { owner, repo, run, externalId } = source;
  const checks = await collect(github.rest.checks.listForRef, {
    owner, repo, ref: run.head_sha, check_name: CHECK_NAME, filter: 'all',
  });
  const matches = checks.filter(c => c.name === CHECK_NAME && c.external_id === externalId &&
    c.head_sha === run.head_sha && c.app?.slug === 'github-actions');
  if (matches.length > 1) throw new Error('Multiple matching investigation checks');
  const output = {
    title: 'Investigation in progress',
    summary: `Investigating [failed CI](${source.ciUrl}) for commit \`${run.head_sha}\`. The original CI gates still control merging.`,
  };
  const params = { owner, repo, status: 'in_progress', details_url: source.investigationUrl, output };
  const { data: check } = matches.length
    ? await github.rest.checks.update({ ...params, check_run_id: matches[0].id })
    : await github.rest.checks.create({ ...params, name: CHECK_NAME, head_sha: run.head_sha, external_id: externalId });
  core.setOutput('check_id', String(check.id));
  return check.id;
}

async function verifyIssue(github, source, number) {
  if (!isId(number)) return null;
  const { owner, repo, occurrence } = source;
  const { data: issue } = await github.rest.issues.get({ owner, repo, issue_number: Number(number) });
  if (issue.pull_request || !issue.title?.startsWith('[CI Failure] ') ||
      !issue.labels?.some(label => (typeof label === 'string' ? label : label.name) === 'ci-failure')) return null;
  if (isBot(issue.user) && hasOccurrence(issue.body, occurrence)) return issue;
  const comments = await collect(github.rest.issues.listComments, { owner, repo, issue_number: issue.number });
  return comments.some(c => isBot(c.user) && hasOccurrence(c.body, occurrence)) ? issue : null;
}

async function findReport(github, source, delivery) {
  if (isId(delivery.createdIssue)) {
    const issue = await verifyIssue(github, source, delivery.createdIssue);
    if (!issue) throw new Error('Writer issue does not contain this source occurrence');
    return issue;
  }
  // Existing-issue updates and exact replays have no created_issue_number.
  const issues = await collect(github.rest.issues.listForRepo, {
    owner: source.owner, repo: source.repo, state: 'all', labels: 'ci-failure', sort: 'updated', direction: 'desc',
  });
  const matches = [];
  for (const candidate of issues) {
    if (candidate.pull_request || !candidate.title?.startsWith('[CI Failure] ')) continue;
    const verified = await verifyIssue(github, source, candidate.number);
    if (verified) matches.push(verified);
  }
  if (matches.length !== 1) throw new Error('No unique controlled report for this source occurrence');
  return matches[0];
}

async function finish({ github, context, core, delivery }) {
  const source = await sourceContext(github, context);
  const { owner, repo, run } = source;
  if (!isId(delivery.checkId)) throw new Error('Missing investigation check identity');
  const { data: check } = await github.rest.checks.get({ owner, repo, check_run_id: Number(delivery.checkId) });
  if (check.head_sha !== run.head_sha || check.name !== CHECK_NAME || check.external_id !== source.externalId ||
      check.app?.slug !== 'github-actions') throw new Error('Investigation check binding failed');

  try {
    if (delivery.agent !== 'success' || delivery.detection !== 'success' || delivery.writer !== 'success' ||
        delivery.detectionConclusion !== 'success') {
      throw new Error('Agent, detection, or controlled issue delivery did not succeed');
    }
    const issue = await findReport(github, source, delivery);
    const issueUrl = `${context.serverUrl}/${owner}/${repo}/issues/${issue.number}`;
    let commentUrl = '';
    // Recheck immediately before posting. An older commit may get a historical
    // check result, but it must not overwrite the current PR's conversation.
    const { data: latestPr } = await github.rest.pulls.get({ owner, repo, pull_number: source.pr.number });
    const current = source.current && latestPr.state === 'open' && latestPr.head.sha === run.head_sha;
    if (current) {
      const body = [
        COMMENT_MARKER,
        `<!-- source-run: ${run.id}:${run.run_attempt} -->`,
        '## CI investigation', '',
        `An investigation report for commit \`${run.head_sha.slice(0, 7)}\` is available in **[issue #${issue.number}](${issueUrl})**.`, '',
        'The original CI checks are still failing. Review the findings and resolve each cause before merging.', '',
        `[Failed CI](${source.ciUrl}) · [Investigation run](${source.investigationUrl})`,
      ].join('\n');
      const comments = await collect(github.rest.issues.listComments, { owner, repo, issue_number: source.pr.number });
      const existing = comments.filter(c => isBot(c.user) && c.body?.includes(COMMENT_MARKER));
      if (existing.length > 1) throw new Error('Multiple managed PR feedback comments');
      const previous = /<!-- source-run: (\d+):(\d+) -->/.exec(existing[0]?.body || '');
      const newer = previous && (Number(previous[1]) > run.id ||
        (Number(previous[1]) === run.id && Number(previous[2]) > run.run_attempt));
      if (!newer) {
        if (existing.length) {
          if (existing[0].body !== body) {
            await github.rest.issues.updateComment({ owner, repo, comment_id: existing[0].id, body });
          }
          commentUrl = existing[0].html_url;
        } else {
          const { data: comment } = await github.rest.issues.createComment({ owner, repo, issue_number: source.pr.number, body });
          commentUrl = comment.html_url;
        }
      }
    }
    await github.rest.checks.update({
      owner, repo, check_run_id: check.id, status: 'completed', conclusion: 'success',
      details_url: issueUrl,
      output: {
        title: current ? 'Investigation report published' : 'Historical investigation report published',
        summary: `[View report in issue #${issue.number}](${issueUrl}). CI remains failed. ` +
          (commentUrl ? `[PR comment](${commentUrl}).` : 'No current PR comment was changed.'),
      },
    });
    core.setOutput('issue_url', issueUrl);
    core.setOutput('comment_url', commentUrl);
    return { issueUrl, commentUrl };
  } catch (error) {
    await github.rest.checks.update({
      owner, repo, check_run_id: check.id, status: 'completed', conclusion: 'failure',
      details_url: source.investigationUrl,
      output: { title: 'Investigation delivery incomplete', summary: 'No verified report was linked to the PR. Inspect the investigation run. The original CI gates remain unchanged.' },
    });
    throw error;
  }
}

module.exports = { start, finish, sourceContext, hasOccurrence };
