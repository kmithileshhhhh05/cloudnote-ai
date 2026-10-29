# CloudNote AI: handoff for Claude Code

Capstone project (KL University, Dept. of CSE, guide Dr. Neelima Gogineni). The owner wants a professional, full working product hosted in their own AWS account. Style rule from the owner: never use em dashes in replies or in site copy.

## Current state
- The app is finished and tested locally and in a browser-only preview. **Nothing is deployed to AWS yet. Your first job is the first real deploy.**
- Real AWS pieces (Transcribe, Bedrock, CloudFront, Cognito auto-confirm) have never run against real AWS. Expect small first-deploy fixes.

## First task: deploy
1. Confirm tools: `node --version` (20+), `aws --version`, `aws sts get-caller-identity` (must print the owner's account).
2. Owner must enable Bedrock model access (Amazon Nova Lite, Titan Text Embeddings V2) in the deploy region.
3. Run `ALLOWED_EMAIL_DOMAINS="<college domain>" bash infra/deploy.sh us-east-1` (see docs/DEPLOY.md). Ask the owner for the domain if unknown.
4. Verify in the browser: sign up, load sample videos, import a transcript, upload a short video (real Transcribe), Notes page, ask-your-notes (Bedrock), Library map, notifications.
5. Tune `TH_REF_SEMANTIC` (0.50) and `TH_ASK_SEMANTIC` (0.33) if semantic matches look wrong.
6. Optional quality upgrade: set `NOTES_MODEL_ID` to a Claude model on Bedrock (look up the exact id and inference-profile prefix for the region first).
7. After it works: add the live URL to README/docs, then regenerate the PDF user manual (the old one in /manual is outdated and describes the old marketing demo).

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
