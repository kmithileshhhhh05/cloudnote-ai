#!/usr/bin/env bash
# Deploys CloudNote AI to AWS: backend (Lambda, API Gateway, Cognito, DynamoDB, S3) and the website (S3 + CloudFront).
# Needs: AWS CLI configured (aws configure), Node 20+, and permissions to create the resources in infra/template.yaml.
# Usage: infra/deploy.sh [region]        (default: us-east-1)
set -euo pipefail
REGION="${1:-us-east-1}"
STACK="${STACK:-cloudnote-ai}"
cd "$(dirname "$0")/.."

command -v aws >/dev/null || { echo "AWS CLI not found. Install it first: https://aws.amazon.com/cli/"; exit 1; }
ACCOUNT=$(aws sts get-caller-identity --query Account --output text) || { echo "AWS credentials are not configured. Run: aws configure"; exit 1; }
echo "Deploying to account $ACCOUNT in $REGION as stack '$STACK'"

echo "1/5 Building..."
[ -d node_modules ] || npm install --no-audit --no-fund
node build.mjs

ART="cloudnote-artifacts-$ACCOUNT-$REGION"
if ! aws s3api head-bucket --bucket "$ART" --region "$REGION" 2>/dev/null; then
  echo "2/5 Creating artifacts bucket $ART"
  if [ "$REGION" = "us-east-1" ]; then aws s3api create-bucket --bucket "$ART" --region "$REGION" >/dev/null
  else aws s3api create-bucket --bucket "$ART" --region "$REGION" --create-bucket-configuration LocationConstraint="$REGION" >/dev/null; fi
  aws s3api put-public-access-block --bucket "$ART" --public-access-block-configuration BlockPublicAcls=true,IgnorePublicAcls=true,BlockPublicPolicy=true,RestrictPublicBuckets=true
else echo "2/5 Artifacts bucket exists"; fi

echo "3/5 Packaging and deploying the stack (takes a few minutes the first time)..."
aws cloudformation package --template-file infra/template.yaml --s3-bucket "$ART" --output-template-file /tmp/cloudnote-packaged.yaml --region "$REGION" >/dev/null
# Gemini/Groq keys: read from GEMINI_API_KEY_FILE / GROQ_API_KEY_FILE (never echoed). If not given, the stack keeps its previous key.
EXTRA=()
if [ -n "${GEMINI_API_KEY_FILE:-}" ]; then EXTRA+=("GeminiApiKey=$(tr -d '[:space:]' < "$GEMINI_API_KEY_FILE")"); fi
[ -n "${GEMINI_MODEL:-}" ] && EXTRA+=("GeminiModel=$GEMINI_MODEL")
if [ -n "${GROQ_API_KEY_FILE:-}" ]; then EXTRA+=("GroqApiKey=$(tr -d '[:space:]' < "$GROQ_API_KEY_FILE")"); fi
[ -n "${GROQ_MODEL:-}" ] && EXTRA+=("GroqModel=$GROQ_MODEL")
aws cloudformation deploy --stack-name "$STACK" --template-file /tmp/cloudnote-packaged.yaml --capabilities CAPABILITY_IAM --region "$REGION" \
  --parameter-overrides NotesModelId="${NOTES_MODEL_ID:-amazon.nova-lite-v1:0}" EmbedModelId="${EMBED_MODEL_ID:-amazon.titan-embed-text-v2:0}" MaxVideos="${MAX_VIDEOS:-30}" MaxMediaMB="${MAX_MEDIA_MB:-500}" AllowedEmailDomains="${ALLOWED_EMAIL_DOMAINS:-}" BedrockRegion="${BEDROCK_REGION:-}" ${EXTRA[@]+"${EXTRA[@]}"} --no-fail-on-empty-changeset

out() { aws cloudformation describe-stacks --stack-name "$STACK" --region "$REGION" --query "Stacks[0].Outputs[?OutputKey=='$1'].OutputValue" --output text; }
SITE_BUCKET=$(out SiteBucketName); DIST=$(out DistributionId); POOL=$(out UserPoolId); CLIENT=$(out UserPoolClientId); URL=$(out SiteUrl)

echo "4/5 Publishing the website..."
printf '{"mode":"cognito","region":"%s","userPoolId":"%s","clientId":"%s"}' "$REGION" "$POOL" "$CLIENT" > dist/config.json
# the dev-only app shell and local files are not part of the site
aws s3 sync dist "s3://$SITE_BUCKET" --delete --exclude "fonts/*" --cache-control "no-cache" --region "$REGION"
aws s3 sync dist/fonts "s3://$SITE_BUCKET/fonts" --delete --cache-control "public,max-age=31536000,immutable" --region "$REGION"
aws cloudfront create-invalidation --distribution-id "$DIST" --paths "/*" >/dev/null

echo "5/5 Done."
echo
echo "  Site:  $URL"
echo
echo "Sign up on the site with any email and a password of 8+ characters including a number."
echo "Notes use Bedrock model '${NOTES_MODEL_ID:-amazon.nova-lite-v1:0}' and search uses '${EMBED_MODEL_ID:-amazon.titan-embed-text-v2:0}'."
echo "If a model is not enabled in your account, CloudNote AI falls back to extractive notes and keyword search."
echo "To enable models: AWS console > Amazon Bedrock > Model access. Then re-run this script or reprocess a video."
