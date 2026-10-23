import Link from 'next/link';
import {
  FileText,
  Film,
  AudioLines,
  Layers,
  LockKeyhole,
  Download,
  ArrowLeft,
  ArrowRight,
} from 'lucide-react';
import { pages, stagePath, type Stage } from '@/domain/navigation';
import { type Project, formatDuration } from '@/domain/project';
import fixture from '../../../../fixtures/example-project.json';
import { Card, Badge, PageHead, Empty, Notice, s } from './ui';
import { WorkflowPanel } from './workflow-panel';

export function StageWorkspace({
  stage,
  project,
  demo = false,
}: {
  stage: Stage;
  project?: Project;
  demo?: boolean;
}) {
  const index = pages.findIndex((p) => p.key === stage);
  const page = pages[index];
  if (!demo && project && (stage === 'research' || stage === 'script'))
    return (
      <>
        <PageHead
          number={String(index + 1).padStart(2, '0')}
          title={page.label}
          description="保存每次创作，审核精确修订，保留历史与依赖。"
        />
        <WorkflowPanel
          projectId={project.id}
          type={stage}
          originalText={
            stage === 'script' && project.input.entryType === 'script' ? project.input.prompt : ''
          }
        />
      </>
    );
  const duration = project?.targetDurationMs ?? fixture.targetDurationMs;
  const pending = <Badge tone="gray">未接通</Badge>;
  const empty = (title: string, text: string) => <Empty title={title}>{text}</Empty>;
  const shots = demo ? fixture.shots : [];
  const shotList = (
    <div>
      {shots.length
        ? shots.map((shot, i) => (
            <div className={s.shotRow} key={shot.id}>
              <span className={s.shotNumber}>{String(i + 1).padStart(2, '0')}</span>
              <div>
                <b>{shot.name}</b>
                <small>模拟镜头 · {shot.durationMs / 1000} 秒</small>
              </div>
              <Badge tone="amber">Demo</Badge>
            </div>
          ))
        : empty('还没有镜头', '分镜规划将在文稿与时间轴确认后开始。')}
    </div>
  );
  const preview = (
    <div className={s.previewStage}>
      <Film size={40} strokeWidth={1} />
      <b>{demo ? '模拟布局 · 无可播放视频' : '暂无可播放视频'}</b>
      <span>实际渲染尚未接通</span>
    </div>
  );
  let content: React.ReactNode;
  if (stage === 'overview')
    content = (
      <>
        <Card title={fixture.title} aside={<Badge tone="amber">Demo / 模拟</Badge>}>
          <p>120 秒 · 9:16 · 6 个示例镜头 · AI 配音</p>
          <Notice>
            这里的数据仅用于审阅页面布局，不代表研究、授权、配音或渲染已完成。模拟项目不会进入真实项目列表。
          </Notice>
        </Card>
        <div className={s.metrics}>
          <Card>
            <span>模拟研究来源</span>
            <strong>{fixture.sources.length}</strong>
            <p>未核实 · 仅研究参考</p>
          </Card>
          <Card>
            <span>模拟文稿</span>
            <strong>未批准</strong>
            <p>无真实审核记录</p>
          </Card>
          <Card>
            <span>模拟镜头</span>
            <strong>{shots.length}</strong>
            <p>总时长 {formatDuration(duration)}</p>
          </Card>
        </div>
        <div className={s.split}>
          <Card title="镜头规划示例">{shotList}</Card>
          <Card title="概念参考图">
            <img
              className={s.referenceHero}
              src="/references/server.jpg"
              alt="模拟项目的视觉方向参考"
            />
            <p className={s.caption}>静态风格图，不是视频预览或已授权素材。</p>
          </Card>
        </div>
      </>
    );
  else if (stage === 'research')
    content = (
      <div className={s.triple}>
        <div className={s.stack}>
          <Card title="研究报告摘要">
            {empty('研究尚未开始', '从创作需求出发，整理资料、主张与证据。')}
          </Card>
          <Card title="研究用途说明">
            <p className={s.caption}>媒体时间索引用于理解内容。正式片段将在分镜确认后按需处理。</p>
          </Card>
        </div>
        <Card
          title="资料索引"
          aside={<Badge tone="gray">{demo ? fixture.sources.length : 0} 项</Badge>}
        >
          {demo
            ? fixture.sources.map((source) => (
                <div className={s.sourceRow} key={source.id}>
                  <FileText size={24} />
                  <div>
                    <b>{source.title}</b>
                    <p>
                      {source.sourceType} · {source.verificationStatus}
                    </p>
                    <Badge tone="amber">模拟 / research_only</Badge>
                  </div>
                </div>
              ))
            : empty('还没有研究来源', '上传原件会保留在资产管理中，尚未被解析为研究来源。')}
        </Card>
        <div className={s.stack}>
          <Card title="所选来源 · 内容分析">
            {empty('尚未选择来源', '这里将展示原文、媒体时间索引与内容摘要。')}
          </Card>
          <Card title="事实声明（Claim）">
            <Notice>当前没有已核实的事实声明。数值与图表需绑定真实来源。</Notice>
          </Card>
        </div>
      </div>
    );
  else if (stage === 'script')
    content = (
      <div className={s.triple}>
        <div className={s.stack}>
          <Card title="文稿大纲">
            {empty('暂无结构化段落', '文稿编辑与段落管理将在后续阶段接通。')}
          </Card>
          <Card title="版本历史">
            <Badge tone="gray">暂无审核修订</Badge>
          </Card>
        </div>
        <Card
          title={project?.input.entryType === 'script' ? '已保存的原始文稿' : '口播正文'}
          aside={<Badge tone="gray">只读</Badge>}
        >
          {project?.input.entryType === 'script' ? (
            <p className={s.briefText}>{project.input.prompt}</p>
          ) : (
            empty('等待第一版文稿', '已保存的创作需求可在项目总览中查看。')
          )}
          <Notice>保存、改写与审批结构化文稿尚未接通。原始文稿会完整保留。</Notice>
        </Card>
        <Card title="文稿质量与依据">
          <div className={s.keyValue}>
            <span>目标时长</span>
            <b>{formatDuration(duration)}</b>
          </div>
          <div className={s.keyValue}>
            <span>预计配音时长</span>
            <span>待分析</span>
          </div>
          <div className={s.divider} />
          <h3>当前段落依据</h3>
          <p className={s.caption}>尚未绑定 Claim 或来源。</p>
          <Notice>修改已批准文稿时需创建新修订，原批准版应保留。</Notice>
        </Card>
      </div>
    );
  else if (stage === 'voice')
    content = (
      <div className={s.split}>
        <div className={s.stack}>
          <Card title="声音方案" aside={pending}>
            <div className={s.readonlyOptions}>
              {['AI 配音', '导入已有配音', '无口播视频'].map((name, i) => (
                <div
                  key={name}
                  className={
                    ['tts', 'import', 'none'][i] === (project?.input.voiceMode || 'tts')
                      ? s.selected
                      : ''
                  }
                >
                  <AudioLines size={16} />
                  {name}
                </div>
              ))}
            </div>
            <div className={s.audioEmpty}>
              <AudioLines size={38} />
              <b>尚未生成或导入音频</b>
              <span>当前仅保存了声音模式偏好</span>
            </div>
            <h3>时间基准与字幕</h3>
            <p className={s.caption}>没有 Cue、字幕片段或已确认的时间轴。</p>
          </Card>
          <Card title="口播片段时间轴">
            {empty('时间轴尚未建立', '无口播模式也将在后续形成可编辑的无声时间轨。')}
          </Card>
        </div>
        <Card title="配音参数">
          <div className={s.keyValue}>
            <span>声音</span>
            <span>未选择</span>
          </div>
          <div className={s.keyValue}>
            <span>目标时长</span>
            <b>{formatDuration(duration)}</b>
          </div>
          <div className={s.divider} />
          <Notice>AI 声音试听、音频导入与对齐尚未接通。正式动画前需确认时间轴。</Notice>
        </Card>
      </div>
    );
  else if (stage === 'storyboard')
    content = (
      <div className={s.split}>
        <Card
          title="导演表"
          aside={
            <Badge tone="gray">
              {shots.length} {demo ? '个模拟镜头' : '个镜头'}
            </Badge>
          }
        >
          {shotList}
        </Card>
        <div className={s.stack}>
          <Card title="镜头叙事与图层">
            <div className={s.storyPlaceholder}>
              <Layers size={34} />
              <span>镜头草图</span>
            </div>
            <div className={s.detailItem}>
              <small>观众理解目标</small>
              <p>等待导演方案</p>
            </div>
            <div className={s.detailItem}>
              <small>文稿与时间锚点</small>
              <p>等待已批准版本</p>
            </div>
            <Notice>审核的是分镜和素材使用方案，内部裁剪与转码不设人工审批。</Notice>
          </Card>
          <Card title="候选素材">{empty('暂无绑定素材', '在镜头明确后按需检索。')}</Card>
        </div>
      </div>
    );
  else if (stage === 'assets')
    content = (
      <div className={s.split}>
        <div className={s.stack}>
          <Card
            title="项目资料与资产"
            aside={<Badge tone="gray">{project?.input.attachments.length || 0} 个原件</Badge>}
          >
            {project?.input.attachments.length
              ? project.input.attachments.map((file) => (
                  <a
                    key={file.id}
                    className={s.fileRow}
                    href={`/api/v1/projects/${project.id}/uploads/${file.id}`}
                  >
                    <FileText size={24} />
                    <div>
                      <b>{file.name}</b>
                      <small>
                        {file.mime} · {(file.sizeBytes / 1024).toFixed(1)} KB · 原件已保存，未分析
                      </small>
                    </div>
                    <Download size={16} />
                  </a>
                ))
              : empty(
                  '资产库是空的',
                  '创建项目时上传的资料会出现在这里。后续的资产搜索与增补上传尚未接通。',
                )}
          </Card>
          <Card title="素材生命周期">
            <div className={s.tags}>
              <Badge>研究索引</Badge> → <Badge>镜头候选</Badge> → <Badge>制作引用</Badge> →{' '}
              <Badge tone="gray">自动缓存</Badge>
            </div>
          </Card>
        </div>
        <Card title="资产详情与来源">
          <Notice>已上传原件仅代表保存成功，不代表已经分析、核实或取得可导出的许可记录。</Notice>
          <div className={s.divider} />
          <h3>时间索引</h3>
          <p className={s.caption}>尚无媒体分析结果。</p>
          <h3>项目引用</h3>
          <p className={s.caption}>尚无镜头绑定。</p>
        </Card>
      </div>
    );
  else if (stage === 'motion')
    content = (
      <div className={s.triple}>
        <div className={s.stack}>
          <Card title={`镜头列表 · ${shots.length}`}>{shotList}</Card>
          <Card title="组件目录">
            <div className={s.tags}>
              {['KineticText', 'BarChart', 'VideoLayer', 'GlowLine', 'Subtitle'].map((n) => (
                <Badge tone="gray" key={n}>
                  {n} · 规划中
                </Badge>
              ))}
            </div>
          </Card>
        </div>
        <Card title="画面预览" aside={pending}>
          {preview}
          <div className={s.tabLabels}>
            <span>画面属性</span>
            <span>动画代码</span>
            <span>渲染日志</span>
          </div>
          {empty('尚无场景版本', '代码生成与渲染将通过隔离 Worker 执行。')}
        </Card>
        <div className={s.stack}>
          <Card title="当前场景图层">{empty('暂无图层', '分镜批准后生成场景。')}</Card>
          <Card title="生成与检查">
            <p className={s.caption}>尚未执行编译、安全检查或视觉评估。</p>
            <Notice>这里不执行或预览未经审查的 AI 代码。</Notice>
          </Card>
        </div>
      </div>
    );
  else if (stage === 'review')
    content = (
      <div className={s.triple}>
        <Card title="带时间码的审核意见">
          {empty('还没有审核意见', '评论将在实际成片产生后绑定具体版本和时间点。')}
        </Card>
        <Card title="成片预览" aside={pending}>
          {preview}
          <div className={s.timelineEmpty}>尚无可播放的时间轴</div>
        </Card>
        <div className={s.stack}>
          <Card title="质量检查">
            {['事实与来源', '字幕可读性', '音画对齐', '画面完整性', '素材使用记录'].map((t) => (
              <div className={s.keyValue} key={t}>
                <span>{t}</span>
                <Badge tone="gray">未检查</Badge>
              </div>
            ))}
          </Card>
          <Card title="已保存版本">
            <p className={s.caption}>没有渲染版本或成片审批记录。</p>
          </Card>
        </div>
      </div>
    );
  else
    content = (
      <div className={s.threeColumns}>
        <Card title="成片与导出规格">
          <div className={s.projectSummary}>
            <Film size={32} />
            <div>
              <b>{project?.title || fixture.title}</b>
              <p className={s.caption}>
                {formatDuration(duration)} ·{' '}
                {project && project.width > project.height ? '16:9' : '9:16'} · 1080p
              </p>
            </div>
          </div>
          <div className={s.divider} />
          <div className={s.keyValue}>
            <span>视频格式</span>
            <b>MP4 / H.264 / AAC</b>
          </div>
          <h3>计划交付内容</h3>
          {[
            '正式视频 MP4',
            '字幕 SRT',
            '口播文稿与研究来源清单',
            '许可允许的源码工程',
            '素材引用与授权说明',
          ].map((t) => (
            <div className={s.exportItem} key={t}>
              <FileText size={17} />
              {t}
            </div>
          ))}
          <Notice>本工作台不提供社交平台自动发布。</Notice>
        </Card>
        <Card title="导出前检查">
          {['创作成果批准', '事实与来源', '语音与字幕', '素材使用许可', '真实视频产物'].map((t) => (
            <div className={s.keyValue} key={t}>
              <span>{t}</span>
              <Badge tone="gray">未检查</Badge>
            </div>
          ))}
          <Notice>尚无可导出的成片。真实导出与门禁将在后续阶段实现。</Notice>
        </Card>
        <Card title="导出任务">
          {empty('还没有导出任务', '没有 jobId 或可下载的视频文件。')}
          <button disabled className={s.button}>
            <LockKeyhole size={15} /> 导出未接通
          </button>
          <div className={s.divider} />
          <h3>资源预算</h3>
          <div className={s.budget}>
            ¥ {(project?.budgetLimit.amount ?? 50).toFixed(2)}
            <small>{demo ? '模拟预算' : '预算上限'}</small>
          </div>
          <p className={s.caption}>无实际计费记录。</p>
        </Card>
      </div>
    );
  const href = (key: Stage) => (demo ? `/demo/${key}` : stagePath(project!.id, key));
  return (
    <>
      <PageHead
        number={String(index + 1).padStart(2, '0')}
        title={page.label}
        description={page.description}
      >
        <Badge tone={demo ? 'amber' : 'gray'}>{demo ? 'Demo / 模拟数据' : '功能尚未接通'}</Badge>
      </PageHead>
      <div className={s.moduleNotice}>
        <LockKeyhole size={16} />
        <span>
          {demo
            ? '演示数据仅用于布局审核；来源、授权和完成状态均为模拟，未发生真实 AI 或渲染任务。'
            : '此页为 Phase 00 工作区骨架。真实项目数据已读取，本阶段不执行生成、审批或渲染。'}
        </span>
      </div>
      {content}
      <nav className={s.pageNav} aria-label="上一步和下一步">
        {index > 1 ? (
          <Link prefetch={false} href={href(pages[index - 1].key)}>
            <ArrowLeft size={15} />
            {pages[index - 1].label}
          </Link>
        ) : (
          <Link prefetch={false} href="/projects">
            返回真实项目库
          </Link>
        )}
        {index < 9 && (
          <Link prefetch={false} href={href(pages[index + 1].key)}>
            {pages[index + 1].label}
            <ArrowRight size={15} />
          </Link>
        )}
      </nav>
    </>
  );
}
