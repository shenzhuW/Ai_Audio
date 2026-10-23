// Sanitized installed-runtime inspection. Never persist MCP names/transports or auth contents.
const fs = require('node:fs'),
  path = require('node:path'),
  { execFileSync, spawnSync } = require('node:child_process');
const { executable, safeEnvironment, hardenCatalog } = require('./codex-runtime.cjs');
const bin = executable(),
  env = safeEnvironment();
const run = (args) =>
  execFileSync(bin, args, {
    env,
    encoding: 'utf8',
    windowsHide: true,
    timeout: 15000,
    maxBuffer: 8 * 1024 * 1024,
  });
const login = spawnSync(bin, ['login', 'status'], {
  env,
  encoding: 'utf8',
  windowsHide: true,
  timeout: 10000,
});
const entries = JSON.parse(run(['mcp', 'list', '--json']));
if (entries.some((e) => !/^[a-zA-Z0-9_-]+$/.test(e.name)))
  throw Error('CODEX_MCP_POLICY_UNAVAILABLE');
const flags = entries.flatMap((e) => [
  '-c',
  'mcp_servers.' + e.name + '={enabled=false,command="__studio_disabled__",args=[]}',
]);
const disabled = JSON.parse(run(['mcp', 'list', '--json', ...flags]));
const model = hardenCatalog(JSON.parse(run(['debug', 'models', '--bundled'])), 'gpt-6.1-sol')
  .models[0];
const result = {
  at: new Date().toISOString(),
  cliVersion: run(['--version']).trim(),
  loginMode:
    login.status === 0 && /Logged in using ChatGPT/.test(login.stdout + login.stderr)
      ? 'chatgpt'
      : 'unavailable',
  node: process.version,
  platform: process.platform,
  model: model.slug,
  inputModalities: model.input_modalities,
  modelShell: model.shell_type,
  modelPatch: model.apply_patch_tool_type,
  modelExtensionTools: model.experimental_supported_tools,
  configuredMcpCount: entries.length,
  effectiveEnabledMcpCount: disabled.filter((e) => e.enabled).length,
  authFileReadOrCopiedByApplication: false,
  accountRemainingQuota: 'unknown',
  newSdkDependencyInstalled: false,
  sdkEvaluated: {
    version: '0.164.0',
    license: 'Apache-2.0',
    method: 'official tagged source review; not runtime execution',
  },
};
result.status =
  result.cliVersion === 'codex-cli 0.163.0' &&
  result.loginMode === 'chatgpt' &&
  result.effectiveEnabledMcpCount === 0
    ? 'PASS'
    : 'FAIL';
fs.writeFileSync(
  path.resolve(__dirname, '../docs/evidence/phase045/codex-environment.json'),
  JSON.stringify(result, null, 2) + '\n',
);
console.log(JSON.stringify(result, null, 2));
if (result.status !== 'PASS') process.exitCode = 1;
