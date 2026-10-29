import { processVideo, onTranscribeDone } from "./pipeline.js";

/** Normalised worker events: { type: 'process', userId, videoId } | { type: 'transcribed', jobName, status } */
export async function handleWorkerEvent(ctx, evt) {
  if (evt && evt.type === "process") return processVideo(ctx, evt.userId, evt.videoId);
  if (evt && evt.type === "transcribed") return onTranscribeDone(ctx, evt.jobName, evt.status);
  // EventBridge: Transcribe Job State Change
  if (evt && evt.source === "aws.transcribe" && evt.detail) {
    const name = evt.detail.TranscriptionJobName;
    const status = evt.detail.TranscriptionJobStatus;
    if (typeof name === "string" && name.startsWith("cn.") && (status === "COMPLETED" || status === "FAILED")) return onTranscribeDone(ctx, name, status);
  }
}
