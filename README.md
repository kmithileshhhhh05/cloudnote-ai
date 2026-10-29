# CloudNote AI

Cloud-based intelligent video note extraction and semantic search platform. Upload a video or import a transcript, get timestamped notes, ask questions across your library, and let the system connect recordings that refer to each other.

## What it does
- **Sign up and sign in** (Amazon Cognito). Every user only ever sees their own library.
- **Add a video or audio file** (mp4, m4a, mp3, wav, flac, ogg, webm, amr) or **import a transcript** (SRT, WebVTT, Amazon Transcribe JSON, plain text).
- **Transcription** with Amazon Transcribe, stored as timestamped chunks.
- **Notes**: summary, key points, action items, decisions. Written by a Bedrock model when available, otherwise by a built-in extractive method. Every item links to its source moment.
- **Ask your library**: semantic search (Bedrock Titan embeddings; keyword search as fallback). Answers are playable moments.
- **Video Context Recovery**: finds "as discussed earlier" style references and suggests where your other videos explain them.
- **Remember the Missing Explanation**: unresolved references are re-checked after every new video; you get one notification when something matches.
- **Notes vs Video**: compare your own notes with the video's key points (covered, possible mismatch, missed).
- **Library map**: dependency map of your videos, suggested watch order, and a gaps report.

## Repository layout
| Path | What |
| --- | --- |
| `app/` | The web app (vanilla JS SPA, no framework) |
| `backend/src/` | API, pipeline, core engine, AWS and local providers |
| `shared/` | Engine code shared by the site and backend |
| `infra/` | AWS SAM template, `deploy.sh`, `destroy.sh` |
| `src/` | Marketing pages: `about.html` and `project.html` (architecture, research, plan, team) |
| `tests/`, `backend/tests/` | Automated tests |
| `docs/` | Deployment guide and architecture notes |

## Run locally (no AWS needed)
    npm install
    node build.mjs
    node backend/local-server.mjs          # http://localhost:8787
Locally, sign-in is a simple dev login, files are stored on disk, and uploaded media is "transcribed" with a canned transcript. Real speech recognition and AI models run only on AWS. Use **Try with sample videos** or **Import a transcript** to explore everything.

## Test
    node tests/engine.test.mjs
    node backend/tests/core.test.mjs
    node backend/tests/api.test.mjs
    # needs: pip install "moto[server]" ; moto_server -p 5555
    node backend/tests/aws.test.mjs
    node backend/tests/cognito.test.mjs
    cfn-lint infra/template.yaml
    # browser end-to-end (needs the local server running):
    python3 tests/e2e.py && python3 tests/media.py && python3 tests/mobile.py

## Deploy
See `docs/DEPLOY.md`. In short: `aws configure` then `infra/deploy.sh us-east-1`.
