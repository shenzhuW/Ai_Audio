param([ValidateSet('init','start','stop','restart','status')][string]$Action='status')
$ErrorActionPreference='Stop'
$repoRoot=Split-Path $PSScriptRoot -Parent
$pgBin=if($env:STUDIO_POSTGRES_BIN){$env:STUDIO_POSTGRES_BIN}else{Join-Path $repoRoot '.tools/postgresql-17.6/pgsql/bin'}
$stateDir=Join-Path $repoRoot '.cache/postgres-phase005'
$cluster=Join-Path $stateDir 'cluster'
$credentialFile=Join-Path $stateDir 'connection.json'
$pgCtl=Join-Path $pgBin 'pg_ctl.exe'
if(!(Test-Path -LiteralPath $pgCtl)){throw 'PostgreSQL binaries unavailable; set STUDIO_POSTGRES_BIN.'}
function CheckExit { if($LASTEXITCODE -ne 0){throw "PostgreSQL command failed (exit $LASTEXITCODE)."} }
if($Action -eq 'init') {
  if(Test-Path -LiteralPath (Join-Path $cluster 'PG_VERSION')) {
    if(!(Test-Path -LiteralPath $credentialFile)){throw 'Existing cluster has no credential record; refusing to overwrite.'}
    Write-Output 'Existing test cluster preserved.'
    exit 0
  }
  if(Test-Path -LiteralPath $cluster){throw 'Cluster directory already exists without PG_VERSION; inspect it manually. No files changed.'}
  if(Test-Path -LiteralPath $credentialFile){throw 'Credential record already exists; refusing to overwrite.'}
  New-Item -ItemType Directory -Path $stateDir -Force | Out-Null
  $adminPassword=[Convert]::ToHexString([Security.Cryptography.RandomNumberGenerator]::GetBytes(24))
  $appPassword=[Convert]::ToHexString([Security.Cryptography.RandomNumberGenerator]::GetBytes(24))
  $credentials=@{host='127.0.0.1';port=55432;adminUser='studio_admin';adminPassword=$adminPassword;appUser='studio_app';appPassword=$appPassword}
  [IO.File]::WriteAllText($credentialFile,($credentials|ConvertTo-Json),[Text.UTF8Encoding]::new($false))
  $pwFile=Join-Path $stateDir 'init-password'
  [IO.File]::WriteAllText($pwFile,$adminPassword,[Text.UTF8Encoding]::new($false))
  & (Join-Path $pgBin 'initdb.exe') -D $cluster -U studio_admin --encoding=UTF8 --locale=C --auth=scram-sha-256 "--pwfile=$pwFile"
  CheckExit
  # Remove only this helper's temporary password copy; the credential record remains ignored.
  Remove-Item -LiteralPath $pwFile
  Write-Output 'Initialized isolated PostgreSQL cluster with SCRAM authentication. Credentials are not printed.'
  exit 0
}
if(!(Test-Path -LiteralPath (Join-Path $cluster 'PG_VERSION'))){throw 'Test cluster missing; run init first.'}
if($Action -eq 'status'){ & $pgCtl -D $cluster status; exit $LASTEXITCODE }
if($Action -eq 'stop' -or $Action -eq 'restart'){ & $pgCtl -D $cluster -m fast -w stop; CheckExit }
if($Action -eq 'start' -or $Action -eq 'restart') {
  & $pgCtl -D $cluster status *> $null
  if($LASTEXITCODE -eq 0){ Write-Output 'Existing isolated test server preserved.'; exit 0 }
  & $pgCtl -D $cluster -l (Join-Path $stateDir 'postgres.log') -o '-h 127.0.0.1 -p 55432' -w start
  CheckExit
}
