// AWS providers. Thin wrappers over AWS SDK v3, kept small so they are easy to review.
import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, GetCommand, PutCommand, QueryCommand, DeleteCommand, BatchWriteCommand, UpdateCommand } from "@aws-sdk/lib-dynamodb";
import { S3Client, GetObjectCommand, PutObjectCommand, HeadObjectCommand, DeleteObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { TranscribeClient, StartTranscriptionJobCommand, GetTranscriptionJobCommand } from "@aws-sdk/client-transcribe";
import { BedrockRuntimeClient, ConverseCommand, InvokeModelCommand } from "@aws-sdk/client-bedrock-runtime";
import { LambdaClient, InvokeCommand } from "@aws-sdk/client-lambda";

export function awsDb({ table, client } = {}) {
  const doc = DynamoDBDocumentClient.from(client || new DynamoDBClient({}), { marshallOptions: { removeUndefinedValues: true } });
  const strip = (it) => it;
  return {
    async get(pk, sk) { const r = await doc.send(new GetCommand({ TableName: table, Key: { pk, sk } })); return r.Item ? strip(r.Item) : null; },
    async put(item, { ifNotExists = false } = {}) {
      try {
        await doc.send(new PutCommand({ TableName: table, Item: item, ...(ifNotExists ? { ConditionExpression: "attribute_not_exists(pk)" } : {}) }));
        return true;
      } catch (e) { if (e && e.name === "ConditionalCheckFailedException") return false; throw e; }
    },
    async query(pk, prefix) {
      const out = []; let start;
      do {
        const r = await doc.send(new QueryCommand({ TableName: table, KeyConditionExpression: "pk = :pk AND begins_with(sk, :p)", ExpressionAttributeValues: { ":pk": pk, ":p": prefix }, ExclusiveStartKey: start }));
        out.push(...(r.Items || [])); start = r.LastEvaluatedKey;
      } while (start);
      return out;
    },
    /** Set only the given fields on an existing item. ifStatus: allowed current statuses. Returns false if the condition fails. */
    async update(pk, sk, fields, { ifStatus } = {}) {
      const names = { "#st": "status" }, values = {}, sets = [];
      Object.entries(fields).forEach(([k, v], i) => { if (v === undefined) return; names["#k" + i] = k; values[":v" + i] = v; sets.push(`#k${i} = :v${i}`); });
      if (!sets.length) return true;
      let cond = "attribute_exists(pk)";
      if (ifStatus && ifStatus.length) { cond += ` AND #st IN (${ifStatus.map((_, i) => ":s" + i).join(", ")})`; ifStatus.forEach((x, i) => (values[":s" + i] = x)); } else delete names["#st"];
      try { await doc.send(new UpdateCommand({ TableName: table, Key: { pk, sk }, UpdateExpression: "SET " + sets.join(", "), ConditionExpression: cond, ExpressionAttributeNames: names, ExpressionAttributeValues: values })); return true; }
      catch (e) { if (e && e.name === "ConditionalCheckFailedException") return false; throw e; }
    },
    async delete(pk, sk) { await doc.send(new DeleteCommand({ TableName: table, Key: { pk, sk } })); },
    async deleteMany(pk, prefix) {
      const keys = []; let start;
      do {
        const r = await doc.send(new QueryCommand({ TableName: table, KeyConditionExpression: "pk = :pk AND begins_with(sk, :p)", ExpressionAttributeValues: { ":pk": pk, ":p": prefix }, ProjectionExpression: "pk, sk", ExclusiveStartKey: start }));
        keys.push(...(r.Items || [])); start = r.LastEvaluatedKey;
      } while (start);
      for (let i = 0; i < keys.length; i += 25) {
        let req = keys.slice(i, i + 25).map((k) => ({ DeleteRequest: { Key: { pk: k.pk, sk: k.sk } } }));
        for (let tries = 0; req.length && tries < 6; tries++) {
          const r = await doc.send(new BatchWriteCommand({ RequestItems: { [table]: req } }));
          req = (r.UnprocessedItems && r.UnprocessedItems[table]) || [];
          if (req.length) await new Promise((res) => setTimeout(res, 100 * 2 ** tries));
        }
      }
    },
  };
}

export function awsStorage({ bucket, client, expires = 3600 } = {}) {
  const s3 = client || new S3Client({ requestChecksumCalculation: "WHEN_REQUIRED", responseChecksumValidation: "WHEN_REQUIRED" });
  return {
    bucket,
    async presignPut(key, contentType) { return { url: await getSignedUrl(s3, new PutObjectCommand({ Bucket: bucket, Key: key, ContentType: contentType }), { expiresIn: expires }), headers: { "Content-Type": contentType } }; },
    async presignGet(key) { return getSignedUrl(s3, new GetObjectCommand({ Bucket: bucket, Key: key }), { expiresIn: expires }); },
    async head(key) {
      try { const r = await s3.send(new HeadObjectCommand({ Bucket: bucket, Key: key })); return { size: r.ContentLength }; }
      catch (e) { if (e && (e.name === "NotFound" || e.$metadata?.httpStatusCode === 404)) return null; throw e; }
    },
    async getJson(key) { const r = await s3.send(new GetObjectCommand({ Bucket: bucket, Key: key })); return JSON.parse(await r.Body.transformToString()); },
    async delete(key) { await s3.send(new DeleteObjectCommand({ Bucket: bucket, Key: key })); },
  };
}

export function awsTranscribe({ bucket, storage, client } = {}) {
  const tr = client || new TranscribeClient({});
  return {
    async start({ jobName, mediaKey, outputKey, language }) {
      await tr.send(new StartTranscriptionJobCommand({ TranscriptionJobName: jobName, LanguageCode: language || "en-US", Media: { MediaFileUri: `s3://${bucket}/${mediaKey}` }, OutputBucketName: bucket, OutputKey: outputKey }));
    },
    async result(jobName) {
      const r = await tr.send(new GetTranscriptionJobCommand({ TranscriptionJobName: jobName }));
      const job = r.TranscriptionJob || {};
      const status = job.TranscriptionJobStatus;
      const m = /^cn\.([^.]+)\.([a-z0-9]+)\.(\d+)$/.exec(jobName);
      const json = status === "COMPLETED" && m ? await storage.getJson(`transcripts/${m[1]}/${m[2]}.json`) : null;
      return { status, json, failure: job.FailureReason || null };
    },
  };
}

export function awsLlm({ modelId, region, maxAttempts, client } = {}) {
  const br = client || new BedrockRuntimeClient({ ...(region ? { region } : {}), ...(maxAttempts ? { maxAttempts } : {}) });
  return {
    async complete({ system, user }) {
      const r = await br.send(new ConverseCommand({ modelId, system: [{ text: system }], messages: [{ role: "user", content: [{ text: user }] }], inferenceConfig: { maxTokens: 2500, temperature: 0.2 } }));
      const parts = (r.output && r.output.message && r.output.message.content) || [];
      return parts.map((p) => p.text || "").join("");
    },
  };
}

export function awsEmbed({ modelId = "amazon.titan-embed-text-v2:0", dimensions = 512, region, client } = {}) {
  const br = client || new BedrockRuntimeClient(region ? { region } : {});
  return {
    async embed(text) {
      const r = await br.send(new InvokeModelCommand({ modelId, contentType: "application/json", accept: "application/json", body: JSON.stringify({ inputText: String(text).slice(0, 8000), dimensions, normalize: true }) }));
      const j = JSON.parse(new TextDecoder().decode(r.body));
      if (!Array.isArray(j.embedding)) throw new Error("no embedding in response");
      return Float32Array.from(j.embedding);
    },
  };
}

export function awsWorker({ functionName, client } = {}) {
  const lambda = client || new LambdaClient({});
  return { async run(evt) { await lambda.send(new InvokeCommand({ FunctionName: functionName, InvocationType: "Event", Payload: Buffer.from(JSON.stringify(evt)) })); } };
}
