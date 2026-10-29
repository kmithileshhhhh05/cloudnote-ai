#!/usr/bin/env bash
# Recommended: private S3 + CloudFront. Usage: ./deploy-s3.sh [region]
set -euo pipefail
REGION="${1:-us-east-1}"; STACK=cloudnote-ai-site
HERE="$(cd "$(dirname "$0")" && pwd)"
aws cloudformation deploy --stack-name $STACK --template-file "$HERE/template-s3-cloudfront.yaml" --region $REGION
out() { aws cloudformation describe-stacks --stack-name $STACK --region $REGION --query "Stacks[0].Outputs[?OutputKey=='$1'].OutputValue" --output text; }
B=$(out BucketName); D=$(out DistributionId)
aws s3 sync "$HERE/../dist" "s3://$B" --delete --exclude "index.html" --cache-control "public,max-age=31536000,immutable" --region $REGION
aws s3 cp "$HERE/../dist/index.html" "s3://$B/index.html" --cache-control "no-cache" --content-type "text/html; charset=utf-8" --region $REGION
aws cloudfront create-invalidation --distribution-id $D --paths "/*" >/dev/null
echo "Live at: $(out Url)"
