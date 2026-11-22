#!/usr/bin/env python3
"""Generate WAV and word timestamps directly with the Typecast API."""
import argparse
import base64
import json
import os
from pathlib import Path
from urllib.request import Request, urlopen

parser = argparse.ArgumentParser()
parser.add_argument('--work', type=Path, required=True)
parser.add_argument('--voice', default='tc_67512e5af2b6dbabce63f92a')
args = parser.parse_args()
key = os.environ.get('TYPECAST_API_KEY')
if not key:
    parser.error('Set TYPECAST_API_KEY in the environment; do not put it in a file.')
lines = [
    'Meet Quiet Terminal.',
    'Keep up with your coding agent, right from your glasses.',
    'Press and hold the ring to see suggested replies based on your conversation.',
    'Choose a reply and keep the conversation moving, without saying a word.',
    'Need another idea? Get more suggestions with a tap.',
    'Quiet Terminal. Take your agentic coding workflow wherever you go.',
]
args.work.mkdir(parents=True, exist_ok=True)
for i, line in enumerate(lines):
    data = json.dumps({'voice_id': args.voice, 'text': line, 'model': 'ssfm-v21',
                       'language': 'eng', 'output': {'audio_format': 'wav'}}).encode()
    request = Request('https://api.typecast.ai/v1/text-to-speech/with-timestamps', data,
                      {'X-API-KEY': key, 'Content-Type': 'application/json'})
    with urlopen(request, timeout=90) as response:
        result = json.load(response)
    (args.work / f'voice-{i}.wav').write_bytes(base64.b64decode(result.pop('audio')))
    (args.work / f'voice-{i}.json').write_text(json.dumps(result, indent=2) + '\n')
    print(f'Scene {i + 1}: {result["audio_duration"]:.2f}s')
