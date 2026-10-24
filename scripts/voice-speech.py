"""Trusted local Whisper inference; user audio/text are data, never Python or shell code."""
import hashlib
import importlib.metadata
import json
import math
import pathlib
import sys

sys.stdout.reconfigure(encoding="utf-8")
if len(sys.argv) != 3:
    raise RuntimeError("SPEECH_INPUT_INVALID")
request = json.loads(pathlib.Path(sys.argv[1]).read_text(encoding="utf-8"))
if request["operation"] not in ("transcribe", "align") or request["language"] not in ("zh", "en"):
    raise RuntimeError("SPEECH_INPUT_INVALID")
model_path = pathlib.Path(request["modelPath"])
expected = "ed3a0b6b1c0edf879ad9b11b1af5a0e6ab5db9205f891f668f8b0e6c6326e34e"
digest = hashlib.sha256()
with model_path.open("rb") as stream:
    for chunk in iter(lambda: stream.read(8 * 1024 * 1024), b""):
        digest.update(chunk)
if digest.hexdigest() != expected:
    raise RuntimeError("SPEECH_MODEL_HASH_FAILED")
audio = pathlib.Path(request["audioPath"])
if not audio.is_file() or not audio.is_absolute():
    raise RuntimeError("SPEECH_INPUT_INVALID")
import torch
import stable_whisper

torch.set_num_threads(2)
# Local verified checkpoint only: runtime never downloads models or reads API credentials.
model = stable_whisper.load_model(str(model_path), device="cpu")
options = dict(language=request["language"], regroup=False, suppress_silence=False)
if request["operation"] == "transcribe":
    # ASR deliberately receives NO reference transcript or initial prompt.
    result = model.transcribe(str(audio), fp16=False, verbose=False, word_timestamps=True, **options)
else:
    text = request["text"]
    if not isinstance(text, str) or not text.strip() or len(text) > 50000:
        raise RuntimeError("SPEECH_INPUT_INVALID")
    result = model.align(str(audio), text, original_split=True, **options)
if result is None:
    raise RuntimeError("SPEECH_NO_RESULT")
words = []
for word in result.all_words():
    probability = word.probability
    words.append(dict(text=word.word, startMs=round(word.start * 1000), endMs=round(word.end * 1000),
                      probability=probability if probability is not None and math.isfinite(probability) else None))
output = dict(model="openai-whisper/base", modelSha256=expected,
              engineVersion="stable-ts/" + importlib.metadata.version("stable-ts") + "/whisper/" + importlib.metadata.version("openai-whisper"),
              transcript=result.text, words=words,
              segments=[dict(text=s.text, startMs=round(s.start * 1000), endMs=round(s.end * 1000)) for s in result.segments])
pathlib.Path(sys.argv[2]).write_text(json.dumps(output, ensure_ascii=False, allow_nan=False), encoding="utf-8")
print(json.dumps(dict(status="complete", operation=request["operation"], words=len(words), modelSha256=expected)))
