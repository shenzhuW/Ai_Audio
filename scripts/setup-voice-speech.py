"""Explicit administrative setup, never run automatically by Web/API/Worker."""
import hashlib
import json
import pathlib
import urllib.request

root=pathlib.Path(__file__).resolve().parent.parent
folder=root/'.cache'/'voice-models'
folder.mkdir(parents=True,exist_ok=True)
expected='ed3a0b6b1c0edf879ad9b11b1af5a0e6ab5db9205f891f668f8b0e6c6326e34e'
target=folder/'base.pt'
url='https://openaipublic.azureedge.net/main/whisper/models/'+expected+'/base.pt'
if not target.exists():
    temporary=folder/'base.download'
    if temporary.exists():
        raise RuntimeError('Previous partial download preserved; inspect it before retrying.')
    with urllib.request.urlopen(url,timeout=60) as response,temporary.open('xb') as stream:
        while True:
            chunk=response.read(1024*1024)
            if not chunk:break
            stream.write(chunk)
    if hashlib.sha256(temporary.read_bytes()).hexdigest()!=expected:
        raise RuntimeError('Downloaded checkpoint hash mismatch; file preserved.')
    temporary.rename(target)
if hashlib.sha256(target.read_bytes()).hexdigest()!=expected:
    raise RuntimeError('Existing model hash mismatch; file preserved.')
print(json.dumps({'status':'ready','model':'openai-whisper/base','sha256':expected,'bytes':target.stat().st_size}))
