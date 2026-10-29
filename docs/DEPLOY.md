# Deploying CloudNote AI to AWS

## Easiest way: AWS CloudShell (no access keys needed)

1. Sign in to the AWS console as an IAM user with AdministratorAccess (or the permissions listed below). Do not use the root user.
2. Pick the region (us-east-1 is the safe default) in the top-right selector.
3. In Amazon Bedrock, Model access, enable Amazon Nova Lite and Titan Text Embeddings V2 (and a Claude model if you want one).
4. Open CloudShell (the terminal icon in the top bar). Choose Actions, Upload file, and upload `cloudnote-site.zip`.
5. Run:
   ```
   unzip -q cloudnote-site.zip -d cloudnote && cd cloudnote
   node --version   # needs 20 or newer
   ALLOWED_EMAIL_DOMAINS="" bash infra/deploy.sh us-east-1
   ```
   Set `ALLOWED_EMAIL_DOMAINS` to your college domain (for example `kluniversity.in`) to restrict sign-up.
6. The script prints the site URL (a CloudFront address). Open it, create an account, and load the sample videos.

Permissions the deploying user needs: CloudFormation, S3, Lambda, API Gateway, DynamoDB, Cognito, CloudFront, IAM (create roles), EventBridge, CloudWatch Logs, Transcribe and Bedrock. AdministratorAccess covers all of these and is fine for a personal or capstone account.


## What gets created
One CloudFormation stack (`cloudnote-ai`) with: a private S3 bucket + CloudFront for the website, an HTTP API with a Cognito JWT authorizer, two Lambda functions (API and worker), a DynamoDB table, a private S3 bucket for videos and transcripts, a Cognito user pool, and an EventBridge rule that tells the worker when Amazon Transcribe finishes. All of it is serverless: you pay for use, nothing runs idle.

## Before you start
1. An AWS account (trial credits are fine) and the AWS CLI: `aws configure` with an access key that can create IAM roles, Lambda, API Gateway, S3, DynamoDB, Cognito, CloudFront and CloudFormation stacks. An administrator user is simplest for a trial.
2. Node 20 or newer.
3. Choose a region that has Amazon Transcribe and Bedrock. `us-east-1` is the safe default.
4. Bedrock models: open the AWS console, Amazon Bedrock, Model access, and enable Amazon Nova Lite (notes) and Titan Text Embeddings V2 (search). If a model is not enabled, CloudNote AI still works: notes become extractive and search becomes keyword-based. A video's header shows "AI notes" or "extractive notes".

## Deploy
    ./infra/deploy.sh us-east-1
The script builds the site and backend, uploads them, creates or updates the stack, writes the site's `config.json`, publishes the site, and prints the URL. The first run takes several minutes (CloudFront). Later runs are quick.

Options (environment variables): `ALLOWED_EMAIL_DOMAINS` (for example `school.edu,example.com`) limits who can sign up; leave it empty for open sign-up.

Other options: `NOTES_MODEL_ID` (default `amazon.nova-lite-v1:0`, or `none`), `EMBED_MODEL_ID` (default `amazon.titan-embed-text-v2:0`, or `none`), `MAX_VIDEOS` (default 30 per user), `MAX_MEDIA_MB` (default 500).

## First checks after deploying
1. Open the printed URL, create an account, and use **Try with sample videos** to confirm the app, API and database work without spending on transcription.
2. Import a short transcript (SRT or text) to confirm notes and search.
3. Upload a short video (1 to 2 minutes) to confirm Transcribe. The video page shows the progress and fills in when done.

## Tuning search
Semantic similarity scores depend on the embedding model. The defaults (`TH_REF_SEMANTIC` 0.50 for reference matching and `TH_ASK_SEMANTIC` 0.33 for questions) are starting points. If suggestions are too eager or too shy after you try real videos, change those values on the API and worker Lambda functions (environment variables) and re-test.

## Costs
Amazon Transcribe is billed per minute of audio and is the main cost. Bedrock is billed per token and is small for notes and embeddings. Lambda, DynamoDB, S3, API Gateway and CloudFront are close to free at demo scale. Prices change, so check the AWS pricing pages for your region. Per-user limits (30 videos, 500 MB per file) cap runaway use.

## Remove everything
    ./infra/destroy.sh us-east-1
This deletes all videos, transcripts and notes. The small `cloudnote-artifacts-*` build bucket is kept; delete it from the console if you like.

## Known limits
- Passwords: Cognito sign-up is auto-confirmed (no email verification) to keep trials frictionless, and there is no password reset. For a public launch, enable email verification and add password recovery.
- Search keeps each user's chunks in memory per Lambda container, which suits libraries of a few hundred videos. Beyond that, move vectors to a vector database such as OpenSearch or pgvector.
- Media is played from short-lived signed S3 links; reload the page if a link expires.
- One speaker language per upload (chosen on the upload page).

## Before you share the link
- **Sign-up is open by default.** Anyone with the URL can create an account and spend Transcribe and Bedrock money. Set `ALLOWED_EMAIL_DOMAINS` when deploying, and create an AWS Budgets alert (Billing console, Budgets) for your trial credits.
- **Rate limits are shared.** API Gateway throttles at about 25 requests per second across all users. That is fine for a demo; for a public launch add AWS WAF rate-based rules.
- **Data is retained on delete.** The DynamoDB table (with point-in-time recovery) and the video bucket survive a stack deletion on purpose. `infra/destroy.sh` removes them explicitly after you confirm.
- **Regional model ids.** Outside us-east-1, some Bedrock models need a regional inference profile id (for example `us.amazon.nova-lite-v1:0`). Set `NOTES_MODEL_ID` accordingly. If the id is wrong, notes fall back to extractive and the video header says so.
- **Upload size.** The 500 MB limit is checked in the browser and again before transcription starts. A file that is uploaded but never started stays in S3 until you delete the video.
