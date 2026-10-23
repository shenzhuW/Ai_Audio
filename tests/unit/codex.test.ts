import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { harness } from './workflow.test';
test('Codex data-only policy removes all filesystem and executable model capabilities', () => {
  const { hardenCatalog, invocation } = require('../../scripts/codex-runtime.cjs');
  const original = {
    models: [
      {
        slug: 'test',
        shell_type: 'unified_exec',
        apply_patch_tool_type: 'freeform',
        experimental_supported_tools: ['clock', 'test_sync_tool'],
        input_modalities: ['text', 'image'],
      },
    ],
  };
  const hardened = hardenCatalog(original, 'test');
  assert.equal(hardened.models[0].shell_type, 'disabled');
  assert.equal(hardened.models[0].apply_patch_tool_type, null);
  assert.deepEqual(hardened.models[0].experimental_supported_tools, []);
  assert.equal(original.models[0].shell_type, 'unified_exec');
  const args = invocation({
    cwd: path.resolve('.'),
    catalog: path.resolve('model.json'),
    schema: path.resolve('schema.json'),
    model: 'test',
    search: 'disabled',
    images: [],
  });
  assert.ok(args.includes('read-only'));
  assert.ok(args.includes('--ignore-user-config'));
  assert.ok(args.includes('--ignore-rules'));
  assert.ok(args.includes('--ephemeral'));
  assert.ok(args.includes('features.shell_tool=false'));
  assert.ok(!args.some((a: string) => /danger|yolo|workspace-write/.test(a)));
});
test('Codex output needs a completed turn and search trace; commands and file changes fail closed', () => {
  const { collectEvents } = require('../../scripts/codex-runtime.cjs');
  const events = [
    { type: 'thread.started', thread_id: 'real-run' },
    {
      type: 'item.completed',
      item: { type: 'agent_message', text: 'Searching the live web now.' },
    },
    {
      type: 'item.completed',
      item: { id: 'search', type: 'web_search', action: { type: 'search', query: 'topic' } },
    },
    { type: 'item.completed', item: { type: 'agent_message', text: '{"value":1}' } },
    {
      type: 'turn.completed',
      usage: { input_tokens: 40, cached_input_tokens: 10, output_tokens: 5 },
    },
  ];
  assert.equal(collectEvents(events, 'live').value.value, 1);
  assert.equal(collectEvents(events, 'live').runId, 'real-run');
  assert.throws(
    () =>
      collectEvents(
        events.filter((e) => e.item?.type !== 'web_search'),
        'live',
      ),
    /CODEX_SEARCH_NOT_EXECUTED/,
  );
  assert.throws(() => collectEvents(events.slice(0, -1), 'disabled'), /CODEX_INCOMPLETE/);
  for (const type of ['command_execution', 'file_change', 'mcp_tool_call']) {
    assert.throws(
      () => collectEvents([{ type: 'item.started', item: { type } }, ...events], 'live'),
      /CODEX_TOOL_BOUNDARY/,
    );
  }
});
test('Codex child receives no application database, provider tokens or Git credentials', () => {
  const { safeEnvironment } = require('../../scripts/codex-runtime.cjs');
  const env = safeEnvironment({
    PATH: 'tools',
    SystemRoot: 'Windows',
    CODEX_HOME: 'existing-login',
    DATABASE_URL: 'private',
    OPENAI_API_KEY: 'private',
    GITHUB_TOKEN: 'private',
    SSH_AUTH_SOCK: 'private',
    STUDIO_DATA_DIR: 'private',
  });
  assert.equal(env.CODEX_HOME, 'existing-login');
  for (const key of [
    'DATABASE_URL',
    'OPENAI_API_KEY',
    'GITHUB_TOKEN',
    'SSH_AUTH_SOCK',
    'STUDIO_DATA_DIR',
  ])
    assert.equal(env[key], undefined);
});
test('Native worker bridge loads without bundling a CLI and propagates pre-cancelled audit', async () => {
  const previous = process.env.STUDIO_CODEX_ENABLED;
  process.env.STUDIO_CODEX_ENABLED = '1';
  try {
    const { codexData } = require('../../apps/web/src/server/ai/codex.ts');
    const controller = new AbortController();
    controller.abort();
    await assert.rejects(
      codexData({ prompt: 'test', schema: {}, signal: controller.signal }),
      (e: any) =>
        e.code === 'CODEX_CANCELLED' &&
        e.aiRun.failureReason === 'CODEX_CANCELLED' &&
        e.aiRun.runId === null,
    );
  } finally {
    if (previous === undefined) delete process.env.STUDIO_CODEX_ENABLED;
    else process.env.STUDIO_CODEX_ENABLED = previous;
  }
});
test('Public fetch rejects local/reserved addresses before connecting and excludes executable HTML', async () => {
  const { publicIPv4, fetchPage, htmlText } = require('../../scripts/public-fetch.cjs');
  for (const ip of [
    '127.0.0.1',
    '10.1.2.3',
    '169.254.169.254',
    '100.64.1.1',
    '192.168.1.1',
    '224.0.0.1',
    '0.0.0.0',
    '192.0.2.1',
  ])
    assert.equal(publicIPv4(ip), false);
  assert.equal(publicIPv4('1.1.1.1'), true);
  for (const url of [
    'file:///etc/passwd',
    'http://127.1/',
    'https://localhost/',
    'https://user:pass@example.com/',
    'https://example.com:8443/',
  ])
    await assert.rejects(fetchPage(url), /FETCH_URL_BLOCKED/);
  assert.equal(
    htmlText('<p>Actual &amp; text</p><script>evil()</script><style>private</style>'),
    'Actual & text',
  );
  await assert.rejects(
    fetchPage('https://example.com/', { lookup: async () => ['127.0.0.1'] }),
    /FETCH_DNS_BLOCKED/,
  );
  const started = Date.now();
  await assert.rejects(
    fetchPage('https://example.com/', { lookup: () => new Promise(() => {}), timeoutMs: 20 }),
    /FETCH_ABORTED/,
  );
  assert.ok(Date.now() - started < 1000, 'DNS lookup must obey the same deadline');
});
test('Real search persists independent fetched text, never model summaries as matched evidence', () => {
  const h = harness();
  const r = h.run({
    action: 'create',
    type: 'research',
    text: 'Real search test',
    inputRevisionIds: [],
  });
  const job = h.run({
    action: 'research-search',
    revisionId: r.id,
    expectedVersion: r.version,
    query: 'test',
    mode: 'real',
  } as any);
  h.run({ action: 'claim', jobId: job.id, workerId: 'test-worker' });
  const blob = {
    id: randomUUID(),
    name: 'page.txt',
    mime: 'text/plain',
    sizeBytes: 24,
    sha256: 'b'.repeat(64),
  };
  h.run({
    action: 'finish',
    jobId: job.id,
    workerId: 'test-worker',
    researchResult: {
      kind: 'search',
      mode: 'real',
      notes: 'Summary is not evidence',
      candidates: [
        {
          title: 'Actual page',
          url: 'https://example.com/page',
          summary: 'MODEL SUMMARY MUST NOT MATCH',
          snippet: 'search excerpt',
          fetchStatus: 'fetched',
          source: {
            title: 'Actual page',
            sourceType: 'text',
            sourceUrl: 'https://example.com/page',
            publisher: 'example.com',
            blob,
          },
          extractedText: 'INDEPENDENT FETCHED TEXT',
        },
        {
          title: 'Blocked page',
          url: 'https://example.com/blocked',
          summary: 'fake quote',
          snippet: '',
          fetchStatus: 'failed',
          failureReason: 'FETCH_HTTP_ERROR',
        },
      ],
    },
  } as any);
  const s = h.state();
  assert.equal(s.researchSources.length, 1);
  assert.equal(s.researchSources[0].provenance, 'web-fetch');
  assert.equal(s.researchIndexes[0].extractedText, 'INDEPENDENT FETCHED TEXT');
  assert.ok(!JSON.stringify(s.researchIndexes).includes('MODEL SUMMARY'));
  assert.equal(s.researchClaims.length, 0);
});
test('Cancelled Codex attempt can save audit without regaining a lease; old owners cannot alter later attempts', () => {
  const h = harness();
  const r = h.run({ action: 'script-start', origin: 'user_provided', text: 'A paragraph' } as any);
  const job = h.run({
    action: 'script-generate',
    revisionId: r.id,
    expectedVersion: r.version,
    mode: 'mock',
    instruction: 'test',
  } as any);
  h.run({ action: 'claim', jobId: job.id, workerId: 'owner-1' });
  let current = h.state().jobs.find((j) => j.id === job.id)!;
  h.run({ action: 'cancel', jobId: job.id, expectedVersion: current.version });
  const run = {
    provider: 'codex-cli',
    cliVersion: 'codex-cli 0.163.0',
    model: 'test',
    runId: 'fixture-run',
    searchMode: 'disabled',
    startedAt: new Date().toISOString(),
    durationMs: 100,
    usage: null,
    quota: null,
    quotaNote: 'fixture only',
    failureReason: 'CODEX_CANCELLED',
    policy: 'data-only-v1',
    catalogSha256: null,
  };
  h.run({
    action: 'record-ai-run',
    jobId: job.id,
    workerId: 'owner-1',
    attempt: 1,
    aiRuns: [run],
  } as any);
  current = h.state().jobs.find((j) => j.id === job.id)!;
  assert.equal(current.state, 'cancelled');
  assert.equal(current.leaseOwner, null);
  assert.equal(current.aiRuns?.[0].failureReason, 'CODEX_CANCELLED');
  h.run({ action: 'retry', jobId: job.id, expectedVersion: current.version });
  h.run({ action: 'claim', jobId: job.id, workerId: 'owner-2' });
  assert.throws(
    () =>
      h.run({
        action: 'record-ai-run',
        jobId: job.id,
        workerId: 'owner-1',
        attempt: 1,
        aiRuns: [run],
      } as any),
    { code: 'JOB_CONFLICT' },
  );
});
