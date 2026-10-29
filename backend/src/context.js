// Context: everything the API and the worker need, injected so the same code runs on AWS and locally.
export const DEFAULT_CONFIG = {
  maxVideos: 30,
  maxMediaBytes: 500 * 1024 * 1024,
  maxTranscriptChars: 1_500_000,
  maxChunksPerVideo: 1500,
  allowedMedia: ["mp4", "m4a", "mp3", "wav", "flac", "ogg", "webm", "amr"],
  languages: { "en-US": "English (US)", "en-IN": "English (India)", "en-GB": "English (UK)", "hi-IN": "Hindi", "te-IN": "Telugu", "es-US": "Spanish", "fr-FR": "French", "de-DE": "German" },
  coverThreshold: 0.34,
  thresholds: {},
};

export function makeContext({ db, storage, transcribe, worker, llm = null, embed = null, config = {}, now = () => Date.now() }) {
  const cfg = { ...DEFAULT_CONFIG, ...config };
  return { db, storage, transcribe, worker, llm, embed, config: cfg, now, cache: new Map() };
}

export class HttpError extends Error {
  constructor(status, message) { super(message); this.status = status; }
}
export const bad = (m) => new HttpError(400, m);
export const notFound = (m = "Not found") => new HttpError(404, m);
