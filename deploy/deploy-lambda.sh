#!/usr/bin/env bash
# Deploys the site as a Lambda Function URL. Needs: aws cli configured, zip.
# Usage: ./deploy-lambda.sh [region]   (default us-east-1)
set -euo pipefail
REGION="${1:-us-east-1}"; FN=cloudnote-ai-site; ROLE=cloudnote-ai-site-role
HERE="$(cd "$(dirname "$0")" && pwd)"
rm -rf "$HERE/.pkg" && mkdir -p "$HERE/.pkg/site"
cp "$HERE/lambda/handler.py" "$HERE/.pkg/" && cp -r "$HERE/../dist/." "$HERE/.pkg/site/"
(cd "$HERE/.pkg" && zip -qr ../cloudnote-lambda.zip .)
ACCOUNT=$(aws sts get-caller-identity --query Account --output text)
if ! aws iam get-role --role-name $ROLE >/dev/null 2>&1; then
  aws iam create-role --role-name $ROLE --assume-role-policy-document '{"Version":"2012-10-17","Statement":[{"Effect":"Allow","Principal":{"Service":"lambda.amazonaws.com"},"Action":"sts:AssumeRole"}]}' >/dev/null
  aws iam attach-role-policy --role-name $ROLE --policy-arn arn:aws:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole
  echo "waiting for IAM role..."; sleep 12
fi
ARN="arn:aws:iam::$ACCOUNT:role/$ROLE"
if aws lambda get-function --function-name $FN --region $REGION >/dev/null 2>&1; then
  aws lambda update-function-code --function-name $FN --zip-file fileb://"$HERE/cloudnote-lambda.zip" --region $REGION >/dev/null
else
  aws lambda create-function --function-name $FN --runtime python3.12 --handler handler.handler --role "$ARN" --zip-file fileb://"$HERE/cloudnote-lambda.zip" --memory-size 256 --timeout 10 --region $REGION >/dev/null
  aws lambda create-function-url-config --function-name $FN --auth-type NONE --region $REGION >/dev/null
  aws lambda add-permission --function-name $FN --statement-id public-url --action lambda:InvokeFunctionUrl --principal "*" --function-url-auth-type NONE --region $REGION >/dev/null
fi
aws lambda get-function-url-config --function-name $FN --region $REGION --query FunctionUrl --output text
