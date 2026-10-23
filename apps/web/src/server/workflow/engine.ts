import { createHash, randomUUID } from 'node:crypto';
import {
  artifactTypes,
  WorkflowCommandSchema,
  WorkflowStateSchema,
  type WorkflowState,
  type WorkflowCommand,
  type WorkflowRevision,
  type WorkflowJob,
  type ArtifactType,
} from '../../domain/workflow';
import type { Project } from '../../domain/project';
import { AppError } from '../errors';
import { ResearchCommandSchema } from '../../domain/research';
import { ScriptCommandSchema } from '../../domain/script';
import {
  initializeScript,
  cloneScript,
  saveScript,
  scriptInput,
  scriptDocument,
  scriptSegments,
  scriptContent,
  finishScript,
  sameScopedScript,
  assertScriptSubmittable,
} from '../script/engine';
import {
  applyResearchCommand,
  researchContent,
  cloneResearch,
  finishResearch,
} from '../research/engine';

export const emptyWorkflow = (): WorkflowState => ({
  schemaVersion: 1,
  artifacts: [],
  revisions: [],
  dependencies: [],
  approvals: [],
  jobs: [],
  outbox: [],
  receipts: [],
  audit: [],
  researchSources: [],
  researchClaims: [],
  researchEvidence: [],
  researchIndexes: [],
  scriptDocuments: [],
  scriptSegments: [],
});
function canonical(v: unknown): string {
  if (v === null || typeof v !== 'object') return JSON.stringify(v);
  if (Array.isArray(v)) return '[' + v.map(canonical).join(',') + ']';
  return (
    '{' +
    Object.entries(v)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([k, x]) => JSON.stringify(k) + ':' + canonical(x))
      .join(',') +
    '}'
  );
}
export const fingerprint = (v: unknown) => createHash('sha256').update(canonical(v)).digest('hex');
const fail = (code: string, message: string, status = 422): never => {
  throw new AppError(code, message, status);
};
const conflict = () => fail('REVISION_CONFLICT', '修订或当前候选已变化，请重新载入后再操作。', 409);
export function staleRevisions(s: WorkflowState): Set<string> {
  const stale = new Set<string>();
  let changed = true;
  while (changed) {
    changed = false;
    for (const d of s.dependencies) {
      const up = s.revisions.find((r) => r.id === d.upstreamRevisionId);
      const a = s.artifacts.find((a) => a.id === up?.artifactId);
      if (
        ((a?.approvedRevisionId !== up?.id &&
          !(
            d.segmentIds &&
            a?.approvedRevisionId &&
            sameScopedScript(s, d.upstreamRevisionId, a.approvedRevisionId, d.segmentIds)
          )) ||
          stale.has(d.upstreamRevisionId)) &&
        !stale.has(d.downstreamRevisionId)
      ) {
        stale.add(d.downstreamRevisionId);
        changed = true;
      }
    }
  }
  return stale;
}
export function workflowSnapshot(s: WorkflowState, project: Project) {
  const stale = staleRevisions(s);
  const stages = artifactTypes.map((type) => {
    const artifact = s.artifacts.find((a) => a.type === type);
    const revision = s.revisions.find((r) => r.id === artifact?.currentRevisionId);
    const validApproved = s.revisions.find(
      (r) => r.id === artifact?.approvedRevisionId && !stale.has(r.id),
    );
    return {
      type,
      artifactId: artifact?.id ?? null,
      revisionId: revision?.id ?? null,
      approvedRevisionId: validApproved?.id ?? null,
      status: revision
        ? stale.has(revision.id)
          ? 'stale'
          : revision.status
        : type === 'research' && project.input.entryType === 'script'
          ? 'skipped'
          : 'empty',
      mock: revision?.mock ?? false,
    };
  });
  return {
    projectId: project.id,
    schemaVersion: 1 as const,
    stages,
    currentStage:
      stages.find((x) => x.status !== 'approved' && x.status !== 'skipped')?.type ?? 'export',
    pendingReviewIds: s.revisions
      .filter(
        (r) => r.status === 'in_review' && s.artifacts.some((a) => a.currentRevisionId === r.id),
      )
      .map((r) => r.id),
    staleRevisionIds: [...stale],
    artifacts: s.artifacts,
    revisions: s.revisions,
    dependencies: s.dependencies,
    approvals: s.approvals,
    jobs: s.jobs,
    audit: s.audit,
  };
}
export type WorkflowSnapshot = ReturnType<typeof workflowSnapshot>;

export function applyWorkflow(
  initial: WorkflowState,
  project: Project,
  raw: WorkflowCommand,
  key: string,
  actorId: string,
  now = Date.now(),
): { state: WorkflowState; result: unknown } {
  const c = WorkflowCommandSchema.parse(raw);
  if (!key || key.length > 180)
    fail('IDEMPOTENCY_KEY_REQUIRED', '请提供有效 Idempotency-Key。', 400);
  const hash = fingerprint(c);
  const prior = initial.receipts.find((r) => r.key === key);
  if (prior) {
    if (prior.fingerprint !== hash) fail('IDEMPOTENCY_CONFLICT', '该幂等键已用于不同请求。', 409);
    return { state: initial, result: structuredClone(prior.response) };
  }
  const s = structuredClone(initial);
  const time = new Date(now).toISOString();
  const revision = (id: string) =>
    s.revisions.find((r) => r.id === id) ?? fail('NOT_FOUND', '找不到修订。', 404);
  const artifact = (id: string) =>
    s.artifacts.find((a) => a.id === id) ?? fail('NOT_FOUND', '找不到产物。', 404);
  const job = (id: string) =>
    s.jobs.find((j) => j.id === id) ?? fail('NOT_FOUND', '找不到任务。', 404);
  const requireInputs = (ids: string[]) => {
    const stale = staleRevisions(s);
    for (const id of ids) {
      const r = revision(id);
      if (
        r.status !== 'approved' ||
        artifact(r.artifactId).approvedRevisionId !== r.id ||
        stale.has(id)
      )
        fail('STALE_INPUT', '上游修订尚未批准或已失效，请选择当前有效批准版。');
    }
  };
  const createRevision = (
    type: ArtifactType,
    text: string,
    inputs: string[],
    mock: boolean,
    parent: WorkflowRevision | null = null,
    validateInputs = true,
  ) => {
    if (validateInputs) requireInputs(inputs);
    let a = s.artifacts.find((x) => x.type === type);
    if (!a) {
      a = {
        id: randomUUID(),
        projectId: project.id,
        type,
        version: 0,
        currentRevisionId: null,
        approvedRevisionId: null,
        createdAt: time,
      };
      s.artifacts.push(a);
    }
    // Stages have a declared direction; no later-stage or same-artifact inputs may loop back.
    for (const id of inputs)
      if (
        artifactTypes.indexOf(artifact(revision(id).artifactId).type) >= artifactTypes.indexOf(type)
      )
        fail('DEPENDENCY_CYCLE', '依赖必须指向更早的创作阶段，不能形成循环。');
    const r: WorkflowRevision = {
      id: randomUUID(),
      artifactId: a.id,
      revisionNumber: s.revisions.filter((r) => r.artifactId === a.id).length + 1,
      schemaVersion: 1,
      version: 1,
      text,
      contentHash: fingerprint(text),
      mock,
      status: 'draft',
      parentRevisionId: parent?.id ?? null,
      createdAt: time,
      updatedAt: time,
      createdBy: actorId,
    };
    s.revisions.push(r);
    a.currentRevisionId = r.id;
    a.version++;
    for (const id of [...new Set(inputs)])
      s.dependencies.push({
        id: randomUUID(),
        upstreamRevisionId: id,
        downstreamRevisionId: r.id,
        purpose: '创作依据',
      });
    return r;
  };
  const enqueue = (kind: ArtifactType, inputs: string[], receiptKey: string): WorkflowJob => {
    requireInputs(inputs);
    const j: WorkflowJob = {
      id: randomUUID(),
      kind,
      version: 1,
      provider: ['research', 'script'].includes(kind) ? 'mock' : 'unconfigured',
      state: 'queued',
      inputRevisionIds: [...inputs],
      idempotencyKey: receiptKey,
      attempt: 0,
      maxAttempts: 3,
      attempts: [],
      targetVersion: s.artifacts.find((a) => a.type === kind)?.version ?? 0,
      leaseOwner: null,
      leaseExpiresAt: null,
      resultRevisionId: null,
      errorCode: null,
      createdAt: time,
      updatedAt: time,
    };
    s.jobs.push(j);
    s.outbox.push({ id: randomUUID(), jobId: j.id, delivered: false });
    return j;
  };
  let result: { id: string };
  const content = (r: WorkflowRevision) =>
    r.scriptSchemaVersion ? scriptContent(s, r) : researchContent(s, r);
  const scopeDependency = (r: WorkflowRevision, ids?: string[]) => {
    if (!ids) return;
    const deps = s.dependencies.filter(
      (d) => d.downstreamRevisionId === r.id && revision(d.upstreamRevisionId).scriptSchemaVersion,
    );
    if (
      deps.length !== 1 ||
      ids.some((id) => !scriptSegments(s, deps[0].upstreamRevisionId).some((x) => x.id === id))
    )
      fail('INVALID_SEGMENT_REFERENCE', '段落依赖必须属于一个明确的上游文稿修订。');
    deps[0].segmentIds = [...new Set(ids)];
  };
  if (c.action.startsWith('script-')) {
    const command = ScriptCommandSchema.parse(c);
    if (command.action === 'script-start') {
      const inputs = command.researchRevisionId ? [command.researchRevisionId] : [];
      if (command.origin === 'research' && !inputs.length)
        fail('RESEARCH_REQUIRED', '请选择已批准的研究修订。');
      if (command.origin !== 'research' && inputs.length)
        fail('INVALID_SCRIPT_REFERENCE', '用户文稿入口不隐式绑定研究。');
      requireInputs(inputs);
      if (inputs.some((id) => artifact(revision(id).artifactId).type !== 'research'))
        fail('INVALID_SCRIPT_REFERENCE', '输入必须为研究修订。');
      const a = s.artifacts.find((a) => a.type === 'script'),
        old = a?.currentRevisionId ? revision(a.currentRevisionId) : null;
      if (old && (old.scriptSchemaVersion || old.status !== 'draft'))
        fail('ARTIFACT_EXISTS', '已有文稿，请从当前版本创建新修订。', 409);
      const r = old ?? createRevision('script', '空文稿草稿', inputs, false);
      if (old) {
        if (inputs.length)
          fail('INVALID_SCRIPT_REFERENCE', '旧文稿转换请保留原输入，通过 fork 显式切换研究。');
        r.version++;
        artifact(r.artifactId).version++;
      }
      const researchId =
        inputs[0] ??
        s.dependencies.find(
          (d) =>
            d.downstreamRevisionId === r.id &&
            artifact(revision(d.upstreamRevisionId).artifactId).type === 'research',
        )?.upstreamRevisionId ??
        null;
      initializeScript(
        s,
        r,
        researchId ? 'research' : command.origin,
        researchId,
        command.text || (old?.text ?? ''),
        command.unitsPerMinute,
      );
      r.contentHash = fingerprint(content(r));
      r.updatedAt = time;
      result = r;
    } else {
      const r = revision(command.revisionId),
        a = artifact(r.artifactId);
      if (a.type !== 'script' || !scriptDocument(s, r.id))
        fail('INVALID_STATE', '此操作仅适用于结构化文稿。');
      if (r.status !== 'draft') fail('IMMUTABLE_REVISION', '文稿只读，请创建新修订。');
      if (r.version !== command.expectedVersion || a.currentRevisionId !== r.id) conflict();
      if (command.action === 'script-save') {
        saveScript(s, r, command.segments, command.unitsPerMinute);
        r.version++;
        r.updatedAt = time;
        a.version++;
        r.contentHash = fingerprint(content(r));
        result = r;
      } else {
        const doc = scriptDocument(s, r.id)!;
        const j = enqueue('script', doc.researchRevisionId ? [doc.researchRevisionId] : [], key);
        j.provider = 'script';
        j.scriptInput = scriptInput(
          s,
          r,
          project,
          command.segmentId,
          command.instruction,
          command.mode,
        );
        j.progress = 0;
        j.logs = [
          {
            at: time,
            message: `${command.mode} 文稿${command.segmentId ? '局部改写' : '整体写稿'}已排队；目标版本已冻结。`,
          },
        ];
        result = j;
      }
    }
  } else if (c.action.startsWith('research-')) {
    const change = applyResearchCommand(s, project.id, ResearchCommandSchema.parse(c), time);
    if (change.input) {
      const j = enqueue('research', [], key);
      j.provider = 'research';
      j.researchInput = change.input;
      j.progress = 0;
      j.logs = [{ at: time, message: `研究 ${change.input.kind} 已排队 · ${change.input.mode}` }];
      result = j;
    } else {
      change.revision.contentHash = fingerprint(researchContent(s, change.revision));
      result = change.entity!;
    }
  } else if (c.action === 'render') {
    const j = enqueue('motion', [], key);
    j.provider = 'remotion';
    j.renderInput = c.input;
    j.progress = 0;
    j.logs = [{ at: time, message: '可信预置渲染已排队；输入、素材和时间轴已冻结。' }];
    result = j;
  } else if (c.action === 'create') {
    const existing = s.artifacts.find((a) => a.type === c.type);
    if (existing) fail('ARTIFACT_EXISTS', '该产物已有候选，请从已有版本创建分支。', 409);
    result = createRevision(c.type, c.text, c.inputRevisionIds, false);
    scopeDependency(result as WorkflowRevision, c.inputSegmentIds);
  } else if (c.action === 'fork') {
    const old = revision(c.revisionId);
    if (old.version !== c.expectedVersion) conflict();
    result = createRevision(
      artifact(old.artifactId).type,
      old.text,
      c.inputRevisionIds ??
        s.dependencies
          .filter((d) => d.downstreamRevisionId === old.id)
          .map((d) => d.upstreamRevisionId),
      old.mock,
      old,
      c.inputRevisionIds !== undefined,
    );
    cloneResearch(s, old, result as WorkflowRevision);
    cloneScript(s, old, result as WorkflowRevision);
    if (c.inputSegmentIds) scopeDependency(result as WorkflowRevision, c.inputSegmentIds);
    else
      for (const dep of s.dependencies.filter((d) => d.downstreamRevisionId === result.id)) {
        const previous = s.dependencies.find(
          (d) =>
            d.downstreamRevisionId === old.id && d.upstreamRevisionId === dep.upstreamRevisionId,
        );
        if (previous?.segmentIds) dep.segmentIds = previous.segmentIds;
      }
    (result as WorkflowRevision).contentHash = fingerprint(content(result as WorkflowRevision));
  } else if (['patch', 'submit', 'approve', 'reject'].includes(c.action)) {
    if (!('revisionId' in c)) throw new Error('Invalid revision action');
    const r = revision(c.revisionId),
      a = artifact(r.artifactId);
    if (c.action === 'patch' && r.status === 'approved')
      fail('IMMUTABLE_REVISION', '已批准内容只读，请创建新修订。');
    if (r.version !== c.expectedVersion || a.currentRevisionId !== r.id) conflict();
    if (c.action === 'patch') {
      if (r.scriptSchemaVersion)
        fail('STRUCTURED_SCRIPT_REQUIRED', '结构化文稿请通过段落保存接口修改。');
      if (r.status !== 'draft') fail('INVALID_STATE', '仅草稿可以保存，请创建新修订。');
      r.text = c.text;
      r.contentHash = fingerprint(researchContent(s, r));
    } else if (c.action === 'submit') {
      assertScriptSubmittable(s, r);
      if (r.status !== 'draft') fail('INVALID_STATE', '仅草稿可以提交审核。');
      requireInputs(
        s.dependencies
          .filter((d) => d.downstreamRevisionId === r.id)
          .map((d) => d.upstreamRevisionId),
      );
      r.status = 'in_review';
    } else {
      if (r.status !== 'in_review') fail('INVALID_STATE', '请先提交当前修订，再批准或驳回。');
      if (c.action === 'approve') {
        requireInputs(
          s.dependencies
            .filter((d) => d.downstreamRevisionId === r.id)
            .map((d) => d.upstreamRevisionId),
        );
        r.status = 'approved';
        a.approvedRevisionId = r.id;
        const next = artifactTypes[artifactTypes.indexOf(a.type) + 1];
        if (next) enqueue(next, [r.id], `approval:${r.id}`);
      } else r.status = 'rejected';
    }
    if (c.action !== 'patch')
      s.approvals.push({
        id: randomUUID(),
        revisionId: r.id,
        action: c.action as 'submit' | 'approve' | 'reject',
        actorId,
        comment: 'comment' in c ? c.comment : '',
        at: time,
        expectedVersion: c.expectedVersion,
      });
    r.version++;
    r.updatedAt = time;
    a.version++;
    result = r;
  } else if (c.action === 'enqueue') result = enqueue(c.kind, c.inputRevisionIds, key);
  else {
    if (!('jobId' in c)) throw new Error('Invalid job action');
    const j = job(c.jobId);
    if ('expectedVersion' in c && j.version !== c.expectedVersion) conflict();
    if (c.action === 'record-ai-run') {
      if (j.attempts.at(-1)?.workerId !== c.workerId || j.attempt !== c.attempt)
        fail('JOB_CONFLICT', '旧执行者不可记录新尝试的使用量。', 409);
      j.aiRuns = [
        ...(j.aiRuns || []),
        ...c.aiRuns.map((run) => ({ ...run, jobAttempt: c.attempt })),
      ].slice(-50);
    } else if (c.action === 'heartbeat') {
      if (
        j.state !== 'running' ||
        j.leaseOwner !== c.workerId ||
        Date.parse(j.leaseExpiresAt!) <= now
      )
        fail('JOB_CONFLICT', 'Worker 租约失效或任务已取消。', 409);
      j.leaseExpiresAt = new Date(now + 30000).toISOString();
      j.heartbeatAt = time;
      j.progress = Math.max(j.progress || 0, c.progress);
      if (c.message) j.logs = [...(j.logs || []), { at: time, message: c.message }].slice(-200);
    } else if (c.action === 'cancel') {
      if (!['queued', 'running'].includes(j.state)) fail('JOB_CONFLICT', '任务已经结束。', 409);
      j.state = 'cancelled';
      const last = j.attempts.at(-1);
      if (last?.state === 'running') {
        last.state = 'cancelled';
        last.finishedAt = time;
      }
      s.outbox.find((o) => o.jobId === j.id)!.delivered = true;
    } else if (c.action === 'retry') {
      if (!['failed', 'cancelled'].includes(j.state))
        fail('JOB_CONFLICT', '仅失败或取消任务可重试。', 409);
      if (j.attempt >= j.maxAttempts) fail('RETRY_LIMIT', '已达到 3 次执行上限。', 429);
      requireInputs(j.inputRevisionIds);
      j.state = 'queued';
      j.errorCode = null;
      if (j.provider === 'remotion') j.progress = 0;
      s.outbox.find((o) => o.jobId === j.id)!.delivered = false;
    } else if (c.action === 'claim') {
      if (j.state !== 'queued' || s.outbox.find((o) => o.jobId === j.id)?.delivered)
        fail('JOB_CONFLICT', '任务已被其他 Worker 领取。', 409);
      let usable = true;
      try {
        requireInputs(j.inputRevisionIds);
      } catch (e) {
        if (!(e instanceof AppError) || e.code !== 'STALE_INPUT') throw e;
        usable = false;
        j.state = 'failed';
        j.errorCode = 'STALE_INPUT';
      }
      if (usable) {
        j.state = 'running';
        j.attempt++;
        j.leaseOwner = c.workerId;
        j.leaseExpiresAt = new Date(now + 30000).toISOString();
        j.attempts.push({
          workerId: c.workerId,
          number: j.attempt,
          startedAt: time,
          finishedAt: null,
          state: 'running',
          errorCode: null,
        });
      }
      s.outbox.find((o) => o.jobId === j.id)!.delivered = true;
    } else {
      if (j.state !== 'running') fail('JOB_CONFLICT', '任务已结束或已取消，结果未写入。', 409);
      if (c.action === 'recover') {
        if (Date.parse(j.leaseExpiresAt!) > now) fail('JOB_CONFLICT', 'Worker 租约仍有效。', 409);
        j.state = 'failed';
        j.errorCode = 'WORKER_INTERRUPTED';
      } else if (c.action === 'finish') {
        if (j.leaseOwner !== c.workerId || Date.parse(j.leaseExpiresAt!) <= now)
          fail('JOB_CONFLICT', 'Worker 租约失效。', 409);
        const runs =
          c.aiRuns ?? (c.scriptResult?.aiRun ? [c.scriptResult.aiRun] : c.researchResult?.aiRuns);
        if (runs)
          j.aiRuns = [
            ...(j.aiRuns || []),
            ...runs.map((run) => ({ ...run, jobAttempt: j.attempt })),
          ].slice(-50);
        const currentVersion = s.artifacts.find((a) => a.type === j.kind)?.version ?? 0;
        j.errorCode =
          c.errorCode ??
          (j.provider === 'unconfigured'
            ? 'PROVIDER_NOT_CONFIGURED'
            : j.provider !== 'research' && currentVersion !== j.targetVersion
              ? 'TARGET_CHANGED'
              : null);
        if (!j.errorCode && j.provider === 'script') {
          const input = j.scriptInput ?? fail('INVALID_SCRIPT_RESULT', '缺少固定写稿输入。'),
            output = c.scriptResult ?? fail('INVALID_SCRIPT_RESULT', '缺少结构化写稿结果。');
          j.errorCode = finishScript(s, input, output);
          if (!j.errorCode) {
            const r = revision(input.revisionId);
            r.updatedAt = time;
            r.contentHash = fingerprint(content(r));
            artifact(r.artifactId).version++;
            j.scriptResult = output;
            j.resultRevisionId = r.id;
            j.state = 'succeeded';
            j.progress = 1;
          } else j.state = 'failed';
        } else if (!j.errorCode && j.provider === 'research') {
          const input = j.researchInput ?? fail('INVALID_RESULT', '研究任务缺少固定输入。');
          const output = c.researchResult ?? fail('INVALID_RESULT', '研究任务缺少结构化结果。');
          j.errorCode = finishResearch(s, input, output, time);
          if (!j.errorCode) {
            j.researchResult = output;
            j.resultRevisionId = input.revisionId;
            j.state = 'succeeded';
            j.progress = 1;
            const r = revision(input.revisionId);
            r.contentHash = fingerprint(researchContent(s, r));
          } else j.state = 'failed';
        } else if (!j.errorCode && j.provider === 'remotion') {
          if (
            !c.renderResult ||
            !j.renderInput ||
            c.renderResult.manifestHash !== fingerprint(j.renderInput)
          )
            fail('INVALID_RESULT', '渲染结果未通过输入清单校验。');
          j.renderResult = c.renderResult;
          const r = createRevision(
            'motion',
            JSON.stringify(c.renderResult),
            j.inputRevisionIds,
            false,
            null,
            false,
          );
          j.resultRevisionId = r.id;
          j.progress = 1;
          j.state = 'succeeded';
        } else if (!j.errorCode) {
          // Inputs may have become stale since enqueue. Preserve exact dependencies and show stale output.
          const r = createRevision(
            j.kind,
            c.text ?? fail('INVALID_RESULT', '任务未返回内容。'),
            j.inputRevisionIds,
            true,
            null,
            false,
          );
          j.resultRevisionId = r.id;
          j.state = 'succeeded';
        } else j.state = 'failed';
      }
      const last = j.attempts.at(-1)!;
      last.state = j.state as 'succeeded' | 'failed';
      last.finishedAt = time;
      last.errorCode = j.errorCode;
      if (j.errorCode && j.aiRuns)
        j.aiRuns = j.aiRuns.map((run) =>
          run.jobAttempt === j.attempt && !run.failureReason
            ? { ...run, failureReason: j.errorCode }
            : run,
        );
    }
    if (j.state !== 'running') {
      j.leaseOwner = null;
      j.leaseExpiresAt = null;
    }
    // Telemetry/lease updates do not invalidate a user action's state version.
    if (c.action !== 'heartbeat' && c.action !== 'record-ai-run') j.version++;
    j.updatedAt = time;
    if (['remotion', 'research', 'script'].includes(j.provider) && c.action !== 'heartbeat')
      j.logs = [
        ...(j.logs || []),
        { at: time, message: `${c.action}: ${j.state}${j.errorCode ? ' · ' + j.errorCode : ''}` },
      ].slice(-200);
    result = j;
  }
  s.audit.push({ id: randomUUID(), action: c.action, actorId, entityId: result.id, at: time });
  s.receipts.push({
    id: randomUUID(),
    key,
    fingerprint: hash,
    response: structuredClone(result),
    createdAt: time,
  });
  return { state: WorkflowStateSchema.parse(s), result: structuredClone(result) };
}
