#!/usr/bin/env bash
# Removes everything CloudNote AI created, INCLUDING all uploaded videos and data.
# (The database and video bucket are retained by the stack on purpose, so this script deletes them explicitly.)
set -euo pipefail
REGION="${1:-us-east-1}"; STACK="${STACK:-cloudnote-ai}"
out() { aws cloudformation describe-stacks --stack-name "$STACK" --region "$REGION" --query "Stacks[0].Outputs[?OutputKey=='$1'].OutputValue" --output text; }
read -r -p "This deletes stack '$STACK' and ALL videos, transcripts and notes. Type 'delete' to continue: " ok
[ "$ok" = "delete" ] || { echo "Cancelled."; exit 1; }
SITE=$(out SiteBucketName); MEDIA=$(out MediaBucketName); TABLE=$(out TableName)
aws s3 rm "s3://$SITE" --recursive --region "$REGION" >/dev/null || true
aws cloudformation delete-stack --stack-name "$STACK" --region "$REGION"
aws cloudformation wait stack-delete-complete --stack-name "$STACK" --region "$REGION"
aws s3 rb "s3://$MEDIA" --force --region "$REGION" || true
aws dynamodb delete-table --table-name "$TABLE" --region "$REGION" >/dev/null || true
echo "Deleted. The small cloudnote-artifacts-* build bucket is left in place; delete it from the S3 console if you like."
