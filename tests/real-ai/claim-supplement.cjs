const assert = require('node:assert/strict');
const { randomUUID, createHash } = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
// Runs against actual HTTP, independent originals, a real Codex worker and real Chrome.
module.exports = async function ({
  api,
  worker,
  browser,
  p,
  r,
  output,
  check,
  base,
  capture,
  result,
}) {
  const read = () => api(`/projects/${p.id}/research`);
  let w = await read();
  const job = await api(
    `/projects/${p.id}/research-claim-runs`,
    'POST',
    {
      revisionId: r.id,
      expectedVersion: w.revision.version,
    },
    202,
  );
  await (
    await worker('research-worker.cjs')
  ).done;
  const done = await api('/jobs/' + job.jobId);
  assert.equal(
    done.state,
    'succeeded',
    JSON.stringify({ errorCode: done.errorCode, aiRuns: done.aiRuns }),
  );
  assert.equal(done.researchResult.status, 'ready');
  assert.ok(
    done.researchResult.candidates.length >= 2,
    'Known rich official source should permit at least two review samples',
  );
  assert.ok(
    done.aiRuns.some((a) => a.provider === 'codex-cli' && a.runId && a.searchMode === 'disabled'),
  );
  w = await read();
  assert.equal(w.claims.length, 0);
  assert.equal(w.evidence.length, 0);
  const grounding = [];
  for (const candidate of done.researchResult.candidates) {
    assert.equal(candidate.claim.verificationStatus, 'unverified');
    for (const e of candidate.evidence) {
      const source = w.sources.find((s) => s.id === e.sourceId),
        entry = w.indexes.find((i) => i.id === e.indexId);
      assert.equal(source.revisionId, r.id);
      assert.equal(entry.sourceId, source.id);
      assert.equal(entry.provenance, 'real');
      assert.equal(entry.analysis, undefined);
      assert.equal(entry.extractedText.slice(e.match.startChar, e.match.endChar), e.quote);
      assert.equal(e.match.sourceSha256, source.blob.sha256);
      assert.equal(
        e.match.indexTextSha256,
        createHash('sha256').update(entry.extractedText).digest('hex'),
      );
      grounding.push({
        candidateId: candidate.id,
        sourceId: source.id,
        sourceUrl: source.sourceUrl,
        indexId: entry.id,
        quote: e.quote,
        ...e.match,
      });
    }
  }
  fs.writeFileSync(
    path.join(output, 'candidate-grounding.json'),
    JSON.stringify(
      {
        revisionId: r.id,
        jobId: job.jobId,
        aiRuns: done.aiRuns,
        candidates: done.researchResult.candidates,
        grounding,
        note: 'Original text hashes and exact UTF-16 offsets verified against privately retained fetched bytes. Candidate claims are NOT verified facts.',
      },
      null,
      2,
    ) + '\n',
  );
  check('真实 Codex 从已抓取原文生成候选；Source/Index允许集、SHA和逐字引用验证；尚无正式Claim', {
    jobId: job.jobId,
    count: done.researchResult.candidates.length,
    runIds: done.aiRuns.map((a) => a.runId),
  });
  const first = done.researchResult.candidates[0],
    second = done.researchResult.candidates[1];
  const draft = {
    claim: first.claim,
    conflictNote: first.conflictNote,
    evidence: first.evidence.map(({ sourceId, indexId, role, quote }) => ({
      sourceId,
      indexId,
      role,
      quote,
    })),
  };
  const review = async (id, decision, candidate, version) =>
    api(
      `/projects/${p.id}/research-candidates/${id}`,
      'POST',
      {
        revisionId: r.id,
        expectedVersion: version ?? (await read()).revision.version,
        jobId: job.jobId,
        decision,
        ...(candidate ? { candidate } : {}),
      },
      422,
    );
  const falseQuote = structuredClone(draft);
  falseQuote.evidence[0].quote = 'Fabricated quotation ' + randomUUID();
  await review(first.id, 'edit', falseQuote);
  const foreign = structuredClone(draft);
  foreign.evidence[0].sourceId = randomUUID();
  await review(first.id, 'edit', foreign);
  assert.equal((await read()).claims.length, 0);
  check('真实HTTP拒绝伪造原文与未知Source ID，事务没有部分写入');
  const page = await browser.newPage({ viewport: { width: 1500, height: 1100 } });
  page.on('pageerror', (e) => result.pageErrors.push(e.message));
  await page.goto(base + `/projects/${p.id}/research`);
  const row = page.locator(`[data-candidate-id="${first.id}"]`);
  await row.getByRole('textbox', { name: '候选 Claim', exact: true }).waitFor();
  await row.scrollIntoViewIfNeeded();
  await page.screenshot({ path: path.join(output, '03-candidates-generated.png') });
  const edited = first.claim.text + '（用户审核注：仅描述该来源，尚未独立核实。）';
  await row.getByRole('textbox', { name: '候选 Claim', exact: true }).fill(edited);
  await row.getByRole('button', { name: '保存候选编辑', exact: true }).click();
  await row
    .getByRole('button', { name: '接受为未核实 Claim', exact: true })
    .waitFor({ state: 'visible' });
  for (let n = 0; n < 40; n++) {
    if ((await read()).jobs.find((j) => j.id === job.jobId).claimCandidateReviews?.length) break;
    await page.waitForTimeout(200);
  }
  await page.reload();
  await row.getByRole('textbox', { name: '候选 Claim', exact: true }).waitFor();
  assert.equal(
    await row.getByRole('textbox', { name: '候选 Claim', exact: true }).inputValue(),
    edited,
  );
  const beforeAccept = (await read()).revision.version;
  await row.getByRole('button', { name: '接受为未核实 Claim', exact: true }).click();
  await row.getByText('已接受 · 未独立核实', { exact: true }).waitFor();
  await row.scrollIntoViewIfNeeded();
  await page.screenshot({ path: path.join(output, '03-candidate-accepted.png') });
  const row2 = page.locator(`[data-candidate-id="${second.id}"]`);
  await row2.getByRole('button', { name: '拒绝候选', exact: true }).click();
  await row2.getByText('已拒绝', { exact: true }).waitFor();
  w = await read();
  assert.equal(w.claims.length, 1);
  assert.equal(w.claims[0].text, edited);
  assert.ok(['unverified', 'conflicting'].includes(w.claims[0].verificationStatus));
  assert.ok(w.evidence.every((e) => e.validation === 'matched'));
  await api(
    `/projects/${p.id}/research-candidates/${second.id}`,
    'POST',
    {
      revisionId: r.id,
      expectedVersion: beforeAccept,
      jobId: job.jobId,
      decision: 'accept',
    },
    409,
  );
  await api(
    `/projects/${p.id}/research-candidates/${second.id}`,
    'POST',
    {
      revisionId: r.id,
      expectedVersion: w.revision.version,
      jobId: job.jobId,
      decision: 'accept',
    },
    409,
  );
  check('真实浏览器编辑候选/刷新/接受/拒绝；仅接受后写正式Claim/Evidence；409并发与重复审核保护', {
    candidateId: first.id,
    acceptedClaimId: w.claims[0].id,
    evidenceIds: w.evidence.map((e) => e.id),
  });
  await page.setViewportSize({ width: 390, height: 1000 });
  await row.scrollIntoViewIfNeeded();
  await page.screenshot({ path: path.join(output, '03-candidate-mobile.png') });
  assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
  await page.close();
  return { claim: w.claims[0], evidence: w.evidence[0], jobId: job.jobId, candidateId: first.id };
};
