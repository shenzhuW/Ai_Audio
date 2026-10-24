param([string]$Python='python')
$ErrorActionPreference='Stop'
$studioVoiceRoot=Split-Path -Parent $PSScriptRoot
$studioVoicePython=Join-Path $studioVoiceRoot '.tools/speech-python/Scripts/python.exe'
if(!(Test-Path -LiteralPath $studioVoicePython)){
  & $Python -m venv (Join-Path $studioVoiceRoot '.tools/speech-python')
  if($LASTEXITCODE -ne 0){throw 'Project-local virtual environment creation failed'}
}
& $studioVoicePython -m pip --isolated install --index-url https://pypi.org/simple -r (Join-Path $PSScriptRoot 'voice-requirements.txt')
if($LASTEXITCODE -ne 0){throw 'Speech dependencies not installed'}
& $studioVoicePython (Join-Path $PSScriptRoot 'setup-voice-speech.py')
if($LASTEXITCODE -ne 0){throw 'Whisper checkpoint not ready'}
# No account key is needed. Runtime only loads the pinned local model and never downloads.
