const assert = require('node:assert/strict');
const fs = require('node:fs'),
  path = require('node:path');
const { randomUUID } = require('node:crypto');
module.exports = async ({ api, worker, upload, check, output, result, approve, start, stop }) => {
  const p = await api(
    '/projects',
    'POST',
    {
      title: 'Synthetic conflict records — real Codex acceptance',
      prompt: 'Self-authored conflicting labels, not real measurements or verified facts',
      entryType: 'topic',
      voiceMode: 'none',
      targetDurationMs: 30000,
      width: 1080,
      height: 1920,
      budgetLimit: { currency: 'CNY', amount: 50 },
    },
    201,
  );
  result.projectId = p.id;
  const r = await api(
    `/projects/${p.id}/artifacts`,
    'POST',
    { type: 'research', text: 'Fixture originals only', inputRevisionIds: [] },
    201,
  );
  const read = () => api(`/projects/${p.id}/research`);
  const generate = async () =>
    api(
      `/projects/${p.id}/research-claim-runs`,
      'POST',
      { revisionId: r.id, expectedVersion: (await read()).revision.version },
      202,
    );
  const empty = await generate();
  await (
    await worker('research-worker.cjs')
  ).done;
  const emptyDone = await api('/jobs/' + empty.jobId);
  assert.equal(emptyDone.state, 'succeeded');
  assert.equal(emptyDone.researchResult.status, 'insufficient');
  assert.equal(emptyDone.researchResult.candidates.length, 0);
  assert.equal(emptyDone.aiRuns?.length ?? 0, 0);
  assert.equal((await read()).claims.length, 0);
  check('无原文真实HTTP/Worker明确insufficient，零模型调用、零Claim/Evidence', {
    jobId: empty.jobId,
  });
  for (const name of ['source-a.txt', 'source-b.txt']) {
    const source = await upload(
      p,
      r.id,
      name,
      fs.readFileSync(path.join(__dirname, '../../fixtures/claims', name)),
    );
    const j = await api(
      `/projects/${p.id}/research-analysis-runs`,
      'POST',
      {
        revisionId: r.id,
        expectedVersion: (await read()).revision.version,
        sourceId: source.id,
        mode: 'real',
      },
      202,
    );
    await (
      await worker('research-worker.cjs')
    ).done;
    assert.equal((await api('/jobs/' + j.jobId)).state, 'succeeded');
  }
  const queued = await generate();
  await (
    await worker('research-worker.cjs', { STUDIO_CODEX_ENABLED: '0' })
  ).done;
  const failed = await api('/jobs/' + queued.jobId);
  assert.equal(failed.state, 'failed');
  assert.equal(failed.errorCode, 'PROVIDER_NOT_CONFIGURED');
  assert.equal(failed.leaseOwner, null);
  assert.equal(failed.researchResult, undefined);
  assert.equal((await read()).claims.length, 0);
  check('Provider关闭时任务明确失败并释放租约，没有Mock回退或部分写库', {
    jobId: queued.jobId,
    errorCode: failed.errorCode,
  });
  await api(`/jobs/${queued.jobId}/retry`, 'POST', { expectedVersion: failed.version });
  await (
    await worker('research-worker.cjs')
  ).done;
  const done = await api('/jobs/' + queued.jobId);
  assert.equal(
    done.state,
    'succeeded',
    JSON.stringify({ errorCode: done.errorCode, aiRuns: done.aiRuns }),
  );
  assert.equal(done.attempt, 2);
  assert.ok(done.aiRuns.some((a) => a.runId));
  const candidate = done.researchResult.candidates.find(
    (c) =>
      new Set(c.evidence.map((e) => e.sourceId)).size === 2 &&
      c.evidence.some((e) => e.role === 'refute'),
  );
  assert.ok(
    candidate,
    'Real model must expose the explicitly conflicting pair, with both source IDs',
  );
  assert.equal(candidate.claim.verificationStatus, 'unverified');
  assert.ok(candidate.conflictNote.trim());
  const w = await read();
  for (const e of candidate.evidence) {
    const entry = w.indexes.find((i) => i.id === e.indexId);
    assert.equal(entry.extractedText.slice(e.match.startChar, e.match.endChar), e.quote);
  }
  fs.writeFileSync(
    path.join(output, 'real-conflict-candidates.json'),
    JSON.stringify(
      {
        jobId: done.id,
        attempts: done.attempts,
        aiRuns: done.aiRuns,
        candidates: done.researchResult.candidates,
        note: 'Real model analysis of actual uploaded, self-authored fictional labels. NOT real-world factual verification.',
      },
      null,
      2,
    ) + '\n',
  );
  const key = randomUUID(),
    body = {
      revisionId: r.id,
      expectedVersion: w.revision.version,
      jobId: done.id,
      decision: 'accept',
    };
  const accepted = await api(
    `/projects/${p.id}/research-candidates/${candidate.id}`,
    'POST',
    body,
    200,
    key,
  );
  assert.deepEqual(
    await api(`/projects/${p.id}/research-candidates/${candidate.id}`, 'POST', body, 200, key),
    accepted,
  );
  const final = await read();
  assert.equal(final.claims.length, 1);
  assert.equal(final.claims[0].verificationStatus, 'conflicting');
  assert.equal(new Set(final.evidence.map((e) => e.sourceId)).size, 2);
  check('真实Codex重试成功：同一候选关联双Source及冲突提示；用户接受幂等且仍为冲突未核实', {
    jobId: done.id,
    runIds: done.aiRuns.map((a) => a.runId),
    claimId: final.claims[0].id,
    evidenceCount: final.evidence.length,
  });
  const approved = await approve(final.revision);
  await api(`/artifacts/${approved.artifactId}/revisions`, 'POST', {
    revisionId: approved.id,
    expectedVersion: approved.version,
  });
  const fork = await read();
  await api(
    `/projects/${p.id}/research-candidates/${candidate.id}`,
    'POST',
    { ...body, revisionId: fork.revision.id, expectedVersion: fork.revision.version },
    422,
  );
  assert.ok(
    fork.evidence.every((e) =>
      fork.sources.some((s) => s.id === e.sourceId && s.revisionId === fork.revision.id),
    ),
  );
  assert.ok(fork.claims.every((c) => !final.claims.some((old) => old.id === c.id)));
  await stop();
  await start();
  assert.deepEqual(await read(), fork);
  check('Fork拒绝旧候选，正式引用新ID保持同修订；应用重启候选审核及来源关系一致');
};
