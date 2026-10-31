# CloudNote AI

Cloud-based intelligent video note extraction and semantic search platform. Upload a video or import a transcript, get timestamped notes, ask questions across your library, and let the system connect recordings that refer to each other.

**Live:** https://d349qer3boe6fg.cloudfront.net (AWS us-east-1, deployed October 2026). Sign up with any email and a password of 8+ characters including a number.

**User manual:** [docs/manual/CloudNote_AI_User_Manual.pdf](docs/manual/CloudNote_AI_User_Manual.pdf) (HTML source in `docs/manual/index.html`, screenshots from the live site).

## What it does
- **Sign up and sign in** (Amazon Cognito). Every user only ever sees their own library.
- **Add a video or audio file** (mp4, m4a, mp3, wav, flac, ogg, webm, amr) or **import a transcript** (SRT, WebVTT, Amazon Transcribe JSON, plain text).
- **Transcription** with Amazon Transcribe, stored as timestamped chunks.
- **Notes**: summary, key points, action items, decisions, written by an AI model (see [AI models](#ai-models)), otherwise by a built-in extractive method. Every item links to its source moment.
- **Ask your notes**: AI answers built only from your notes, with numbered citations; no answer is shown when the notes do not cover the question.
- **Ask your library**: semantic search with Bedrock Titan embeddings when enabled, otherwise keyword search. Answers are playable moments.
- **Know more**: when a reference, follow-up or question is not covered by any of your videos, one click gives a short general AI explanation of the topic, labelled as background knowledge rather than content from your library.
- **Video Context Recovery**: finds "as discussed earlier" style references and suggests where your other videos explain them.
- **Remember the Missing Explanation**: unresolved references are re-checked after every new video; you get one notification when something matches.
- **Notes vs Video**: compare your own notes with the video's key points (covered, possible mismatch, missed).
- **Library map**: dependency map of your videos, suggested watch order, and a gaps report.

## AI models
The backend tries models in order and uses the first one that answers:
1. **Amazon Bedrock** (Amazon Nova Lite), the intended model.
2. **OpenAI** (`gpt-5.4-mini`), if an OpenAI key is configured.
3. **Groq** free tier (`openai/gpt-oss-120b`), if a Groq key is configured.
4. **Google Gemini** free tier (`gemini-3.8-flash`), if a Gemini key is configured.
5. Built-in extractive notes and keyword search, if none of them answers.

**Current live setup:** the AWS account is new, and Bedrock allows it 0 tokens per day for now, so notes and answers on the live site come from OpenAI (Groq as backup), and search is keyword based. Bedrock takes over automatically once AWS raises the quota. When OpenAI, Groq or Gemini is used, transcript text is sent to that provider.

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
