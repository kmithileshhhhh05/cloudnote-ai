# CloudNote AI: handoff for Claude Code

Capstone project (KL University, Dept. of CSE, guide Dr. Neelima Gogineni). The owner wants a professional, full working product hosted in their own AWS account. Style rule from the owner: never use em dashes in replies or in site copy.

## Current state (October 2026)
- **Deployed:** https://d349qer3boe6fg.cloudfront.net, stack `cloudnote-ai`, us-east-1, open sign-up (owner's choice). Redeploy command and options: docs/DEPLOY.md.
- Verified on real AWS: Cognito sign-up, API, DynamoDB, S3 upload, Transcribe (via EventBridge to the worker), AI notes, ask-your-notes, map, notifications.
- Bedrock: account quota is 0 tokens/day, so the LLM chain falls through Bedrock -> OpenAI (`gpt-5.4-mini`, primary, paid key) -> Groq (`openai/gpt-oss-120b`) -> Gemini (`gemini-3.8-flash`, often overloaded). Embeddings are off (`EMBED_MODEL_ID=none`), so search is keyword based. API keys live in `~/.cloudnote/*.key` on the owner's Mac, never in the repo.
- When Bedrock works: redeploy without `EMBED_MODEL_ID=none`, reprocess videos, then tune `TH_REF_SEMANTIC` (0.50) and `TH_ASK_SEMANTIC` (0.33).
- Open items: owner should restrict sign-up and delete the `cloudnote-deployer` access key when done.
- User manual: `docs/manual/` (HTML source + PDF), built from screenshots of the live site.

## Security rules
- Never write AWS keys into files, commits or chat. Use `aws configure` or SSO. Remind the owner to delete the IAM key/user afterwards.
- Sign-up is open unless `ALLOWED_EMAIL_DOMAINS` is set. Mention this before deploying.

## Architecture
CloudFront (site on S3 via OAC, `/api/*` to HTTP API) -> API Gateway JWT authorizer (Cognito) -> Lambda API -> DynamoDB single table. S3 media bucket with presigned PUT/GET. Transcribe job names `cn.<user>.<video>.<attempt>`; EventBridge on completion -> worker Lambda. Bedrock Converse (notes, Q&A) and Titan v2 embeddings (512-dim). Fallbacks: extractive notes and TF-IDF keyword search when Bedrock is unavailable.
- Frontend: vanilla JS SPA, no framework, hash routing, esbuild bundles (`app/` is the product, `src/` is the marketing site about.html and project.html).
- Backend: `backend/src` (Node 22 ESM, bundled to CJS for Lambda). Shared NLP engine in `shared/`.
- Browser-only preview build: `dist-preview/` (same backend code in the page, localStorage persistence).
- Infra: `infra/template.yaml` (SAM/CloudFormation), `infra/deploy.sh`, `infra/destroy.sh`.

## Features (all implemented)
Home dashboard, Library (cover art, filters), video page (player, transcript, moments timeline, Notes/Ask/Context/Compare tabs), Notes page (compact cards, full-page reader at `#/notes/:id` with in-note search, ask-your-notes via AI with citations), Ask, Library map (dependency graph, gaps report), Ctrl+K command bar, Context Recovery, "Remember the Missing Explanation" (pending references checked after each upload), Follow-up Tracker (forward references like "in the next video"; user-facing wording is "follow-up", not "promise"), sign-in landing page. Four sample videos (Server Setup, Application Setup Tutorial, Database Tutorial, Monitoring and Alerts).

## Commands
- Build everything: `node build.mjs`
- Local server: `DATA_DIR=/tmp/cn-data node backend/local-server.mjs` (port 8787)
- Unit/API tests: `node --test tests/engine.test.mjs backend/tests/*.test.mjs` (aws and cognito tests need `moto_server -p 5555`)
- Browser tests (Python Playwright): `tests/e2e.py`, `media.py`, `mobile.py`, `preview.py` (needs `dist-preview` served on :8766)
- Lint template: `cfn-lint infra/template.yaml`

## Honesty rules for copy
All demo data is illustrative, not measured results. Novelty claims must stay hedged ("we found no existing tool that does this"). Do not claim real-AWS behavior was tested until it has been.
