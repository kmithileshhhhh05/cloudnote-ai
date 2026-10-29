// All factual content below comes from the submitted abstract and the Project Review-1 deck.

export const PROJECT = {
  name: "CloudNote AI",
  full: "CloudNote AI: Cloud-Based Intelligent Video Note Extraction and Semantic Search Platform",
  course: "Engineering Capstone Project - 1 (23IE4053R/23IE4053A)",
  year: "A.Y. 2026 - 2027",
  dept: "Department of Computer Science and Engineering",
  uni: "Koneru Lakshmaiah Education Foundation",
};

export const TEAM = [
  { name: "K. Mithilesh Reddy", id: "2320030330", initials: "KM" },
  { name: "Nithin", id: "2320030186", initials: "N" },
  { name: "Sargu Sai Chetan", id: "2320030348", initials: "SC" },
];
export const GUIDE = { name: "Dr. Neelima Gogineni", role: "Project Guide" };

// theme tags: summ, retr, eval, emb, speech, ground
export const PAPERS = [
  { n: 1, year: 2020, authors: "M. Lewis et al.", title: "BART: Denoising Sequence-to-Sequence Pre-training for Natural Language Generation, Translation, and Comprehension", venue: "ACL", objective: "Generate fluent summaries", technique: "Denoising encoder-decoder", data: "CNN/DailyMail; XSum", params: "ROUGE; generation quality", inference: "Useful summary baseline", doi: "10.18653/v1/2020.acl-main.703", url: "https://aclanthology.org/2020.acl-main.703/", tags: ["summ"] },
  { n: 2, year: 2020, authors: "J. Zhang et al.", title: "PEGASUS: Pre-training with Extracted Gap-sentences for Abstractive Summarization", venue: "ICML", objective: "Improve summarization", technique: "Gap-sentence generation", data: "12 summarization datasets", params: "ROUGE; human review", inference: "Pretraining benefits summaries", doi: "10.48550/arXiv.1912.08777", url: "https://arxiv.org/abs/1912.08777", tags: ["summ"] },
  { n: 3, year: 2020, authors: "I. Beltagy et al.", title: "Longformer: The Long-Document Transformer", venue: "arXiv preprint", objective: "Process long documents", technique: "Local + global attention", data: "WikiHop; TriviaQA; arXiv", params: "QA quality; summarization", inference: "Handles longer text inputs", doi: "10.48550/arXiv.2004.05150", url: "https://arxiv.org/abs/2004.05150", tags: ["summ"] },
  { n: 4, year: 2020, authors: "V. Karpukhin et al.", title: "Dense Passage Retrieval for Open-Domain Question Answering", venue: "EMNLP", objective: "Retrieve relevant passages", technique: "Dual-encoder retrieval", data: "Natural Questions; TriviaQA", params: "Top-k retrieval accuracy", inference: "Dense vectors support semantic search", doi: "10.48550/arXiv.2004.04906", url: "https://arxiv.org/abs/2004.04906", tags: ["retr", "emb"] },
  { n: 5, year: 2020, authors: "P. Lewis et al.", title: "Retrieval-Augmented Generation for Knowledge-Intensive NLP Tasks", venue: "NeurIPS", objective: "Ground answers in evidence", technique: "Dense retrieval + generation", data: "Natural Questions; TriviaQA", params: "QA accuracy; factuality", inference: "Retrieval supplies external evidence", doi: "10.48550/arXiv.2005.11401", url: "https://arxiv.org/abs/2005.11401", tags: ["retr", "ground"] },
  { n: 6, year: 2020, authors: "O. Khattab & M. Zaharia", title: "ColBERT: Efficient and Effective Passage Search via Contextualized Late Interaction over BERT", venue: "SIGIR", objective: "Improve passage ranking", technique: "Token-level late interaction", data: "MS MARCO; TREC CAR", params: "MRR; retrieval latency", inference: "Balances ranking and efficiency", doi: "10.48550/arXiv.2004.12832", url: "https://arxiv.org/abs/2004.12832", tags: ["retr"] },
  { n: 7, year: 2021, authors: "M. Zhong et al.", title: "QMSum: A New Benchmark for Query-based Multi-domain Meeting Summarization", venue: "NAACL", objective: "Summarize by user query", technique: "Locate then summarize", data: "232 meetings", params: "ROUGE; manual analysis", inference: "Useful meeting evaluation resource", doi: "10.18653/v1/2021.naacl-main.472", url: "https://aclanthology.org/2021.naacl-main.472/", tags: ["summ", "eval"] },
  { n: 8, year: 2021, authors: "T. Gao et al.", title: "SimCSE: Simple Contrastive Learning of Sentence Embeddings", venue: "EMNLP", objective: "Improve sentence similarity", technique: "Contrastive learning", data: "STS benchmarks; NLI data", params: "Spearman correlation", inference: "Supports meaning-based retrieval", doi: "10.48550/arXiv.2104.08821", url: "https://arxiv.org/abs/2104.08821", tags: ["emb"] },
  { n: 9, year: 2021, authors: "N. Thakur et al.", title: "BEIR: A Heterogenous Benchmark for Zero-shot Evaluation of Information Retrieval Models", venue: "NeurIPS Datasets and Benchmarks", objective: "Evaluate retrieval transfer", technique: "Cross-domain benchmarking", data: "18 retrieval datasets", params: "nDCG; retrieval efficiency", inference: "Tests generalization beyond one domain", doi: "10.48550/arXiv.2104.08663", url: "https://arxiv.org/abs/2104.08663", tags: ["retr", "eval"] },
  { n: 10, year: 2021, authors: "G. Izacard & E. Grave", title: "Leveraging Passage Retrieval with Generative Models for Open Domain Question Answering", venue: "EACL", objective: "Combine multiple evidence passages", technique: "Fusion-in-Decoder", data: "Natural Questions; TriviaQA", params: "Exact-match answer accuracy", inference: "Multiple passages support answers", doi: "10.48550/arXiv.2007.01282", url: "https://arxiv.org/abs/2007.01282", tags: ["retr", "ground"] },
  { n: 11, year: 2022, authors: "Y. Zhang et al.", title: "SummN: A Multi-Stage Summarization Framework for Long Input Dialogues and Documents", venue: "ACL", objective: "Summarize lengthy inputs", technique: "Split then summarize in stages", data: "AMI; QMSum; others", params: "ROUGE; human evaluation", inference: "Staged summaries manage long inputs", doi: "10.18653/v1/2022.acl-long.112", url: "https://aclanthology.org/2022.acl-long.112/", tags: ["summ"] },
  { n: 12, year: 2022, authors: "K. Santhanam et al.", title: "ColBERTv2: Effective and Efficient Retrieval via Lightweight Late Interaction", venue: "NAACL", objective: "Reduce retrieval index size", technique: "Residual compression", data: "MS MARCO; BEIR; LoTTE", params: "Ranking quality; index footprint", inference: "Compression lowers storage needs", doi: "10.48550/arXiv.2112.01488", url: "https://arxiv.org/abs/2112.01488", tags: ["retr"] },
  { n: 13, year: 2023, authors: "A. Radford et al.", title: "Robust Speech Recognition via Large-Scale Weak Supervision", venue: "ICML", objective: "Transcribe diverse audio", technique: "Whisper encoder-decoder", data: "680k hours of audio", params: "Word error rate; robustness", inference: "Reusable transcription backbone", doi: "10.48550/arXiv.2212.04356", url: "https://proceedings.mlr.press/v202/radford23a.html", tags: ["speech"] },
  { n: 14, year: 2023, authors: "M. Bain et al.", title: "WhisperX: Time-Accurate Speech Transcription of Long-Form Audio", venue: "INTERSPEECH", objective: "Improve transcription timing", technique: "VAD + forced alignment", data: "Long-form speech benchmarks", params: "Word timing; WER; speed", inference: "Supports precise video navigation", doi: "10.48550/arXiv.2303.00747", url: "https://arxiv.org/abs/2303.00747", tags: ["speech"] },
  { n: 15, year: 2024, authors: "A. Asai et al.", title: "Self-RAG: Learning to Retrieve, Generate, and Critique through Self-Reflection", venue: "ICLR", objective: "Improve grounded generation", technique: "Retrieval + reflection tokens", data: "QA; long-form text", params: "Factuality; citation quality", inference: "Inspires answer support checks", doi: "10.48550/arXiv.2310.11511", url: "https://arxiv.org/abs/2310.11511", tags: ["ground"] },
];

export const PAPER_TAGS = [
  { id: "all", label: "All" },
  { id: "speech", label: "Speech" },
  { id: "summ", label: "Summarization" },
  { id: "retr", label: "Retrieval" },
  { id: "emb", label: "Embeddings" },
  { id: "ground", label: "Grounding" },
  { id: "eval", label: "Benchmarks" },
];

// Slide 11: how reviewed work maps to the project extension.
export const GAP = [
  { paper: "WhisperX", authors: "Bain et al.", method: "ASR + alignment", finding: "Time-linked text", ext: "Link to a second video", ref: 14 },
  { paper: "SummN", authors: "Zhang et al.", method: "Staged summaries", finding: "Long-input handling", ext: "Flag unresolved references", ref: 11 },
  { paper: "DPR", authors: "Karpukhin et al.", method: "Dense retrieval", finding: "Relevant passage search", ext: "Retrieve context candidates", ref: 4 },
  { paper: "RAG", authors: "Lewis et al.", method: "Retrieve + generate", finding: "Evidence for answers", ext: "Show supporting timestamps", ref: 5 },
  { paper: "SimCSE", authors: "Gao et al.", method: "Sentence embeddings", finding: "Meaning-based matching", ext: "Rank candidate explanations", ref: 8 },
];

export const PIPELINE = [
  {
    id: "login",
    short: "Sign in",
    title: "Sign in with Amazon Cognito",
    body: "The web app signs the user in with Cognito and sends the session token with every request. API Gateway checks the token before any code runs, and every database key is scoped to the user.",
    out: "session ok",
    code: [
      ["c", "# every request carries the user's token"],
      ["k", "GET /api/videos"],
      ["v", "Authorization: <cognito id token>"],
      ["g", "200  only this user's library"],
    ],
  },
  {
    id: "store",
    short: "Upload",
    title: "Upload straight to private S3",
    body: "The API creates a video record and returns a short-lived signed URL. The browser uploads the file directly to a private S3 bucket with a progress bar. Transcripts can be imported instead of a video.",
    out: "video stored",
    code: [
      ["c", "# signed URL, user-scoped key"],
      ["k", "media/{user}/{video}.mp4"],
      ["v", "PUT with progress   limit 500 MB"],
      ["g", "record saved: status 'awaiting_upload'"],
    ],
  },
  {
    id: "transcribe",
    short: "Transcribe",
    title: "Transcribe with Amazon Transcribe",
    body: "A transcription job reads the upload and writes timestamped words back to S3. When it finishes, EventBridge wakes a worker that groups the words into short chunks and saves them. Failed jobs keep an error and can be retried.",
    out: "timestamped chunks",
    code: [
      ["c", "# job finished -> worker groups words into chunks"],
      ["k", "{ id: 'a1b2c3d4e5:7', start: 260.0, end: 276.4,"],
      ["v", "  text: 'Step three: set the application port...' }"],
      ["g", "chunks saved  (retry on failure)"],
    ],
  },
  {
    id: "notes",
    short: "Notes",
    title: "Write notes with a Bedrock model",
    body: "The worker sends numbered chunks to a Bedrock model and asks for a summary, key points, action items and decisions that each cite chunk numbers. Cited numbers are checked against the transcript, and timestamps come from the database, never from the model. If no model is available, an extractive method writes the notes instead.",
    out: "source-linked notes",
    code: [
      ["c", "# every item must cite a real chunk"],
      ["k", "{ text: 'Set port to 8000', source: [4] }"],
      ["v", "validate(source in transcript) -> true"],
      ["g", "timestamp read from DB: 04:20"],
    ],
  },
  {
    id: "search",
    short: "Search",
    title: "Search by meaning",
    body: "Titan embeddings turn each chunk and each question into a vector. The API ranks the user's own chunks by similarity and returns playable moments. Without an embedding model, a keyword method takes over, so search never goes dark.",
    out: "click to seek",
    code: [
      ["c", "# same model for chunks and questions"],
      ["k", "embed('which port do I use?') -> vector(512)"],
      ["v", "rank(user's chunks)  threshold 0.33"],
      ["g", "Application Setup @ 04:20  (click to seek)"],
    ],
  },
];

export const ARCH = {
  zones: [
    {
      id: "local",
      label: "Browser",
      sub: "Web app",
      nodes: [
        { id: "web", name: "Web app", role: "Screens", desc: "A single-page app: library, upload with progress, video player with transcript, notes, ask, context links, notifications and the library map. Uploads go straight to S3." },
      ],
    },
    {
      id: "cloud",
      label: "AWS edge and API",
      sub: "Serverless",
      nodes: [
        { id: "cf", name: "CloudFront", role: "Delivery", desc: "Serves the site from a private S3 bucket and forwards /api to the API, over HTTPS with security headers." },
        { id: "cognito", name: "Cognito", role: "Login", desc: "User sign-up and sign-in. Issues the token that API Gateway checks on every request." },
        { id: "apigw", name: "API Gateway", role: "Auth check", desc: "HTTP API with a JWT authorizer. Requests without a valid token never reach the code." },
        { id: "api", name: "Lambda API", role: "Requests", desc: "Handles library, search, references, notes and map requests. Every database key is scoped to the signed-in user." },
      ],
    },
    {
      id: "ai",
      label: "AWS data and AI",
      sub: "Managed services",
      nodes: [
        { id: "s3", name: "S3", role: "Videos", desc: "Private bucket for uploads and Transcribe output. Access only through short-lived signed URLs." },
        { id: "transcribe", name: "Transcribe", role: "Speech to text", desc: "Turns audio into timestamped words in the language you pick." },
        { id: "worker", name: "Lambda worker", role: "Pipeline", desc: "Runs when a transcript is ready: chunks it, writes notes, creates embeddings, finds references and checks pending ones." },
        { id: "bedrock", name: "Bedrock", role: "Notes and embeddings", desc: "A Nova model writes notes and Titan creates embeddings. If unavailable, extractive notes and keyword search take over." },
        { id: "ddb", name: "DynamoDB", role: "Data", desc: "One table holds videos, transcript chunks, notes, references and notifications, scoped per user." },
      ],
    },
  ],
  flows: [
    { id: "ingest", label: "Add a video", steps: [["web", "Pick a file; sign in token attached"], ["apigw", "Token checked"], ["api", "Creates the record, returns a signed upload URL"], ["s3", "Browser uploads the video directly"], ["api", "Starts the transcription job"], ["transcribe", "Timestamped transcript written to S3"], ["worker", "Wakes on completion, groups words into chunks"], ["bedrock", "Notes written, chunks embedded"], ["ddb", "Chunks, notes and references saved"]] },
    { id: "search", label: "Ask a question", steps: [["web", "Question typed"], ["apigw", "Token checked"], ["api", "Receives the question"], ["bedrock", "Question embedded"], ["ddb", "User's chunks loaded (cached per container)"], ["api", "Ranks by similarity, applies the threshold"], ["web", "Playable moments shown"]] },
    { id: "notes", label: "Notes vs Video", steps: [["web", "Notes pasted, Compare pressed"], ["api", "Loads the video's key points"], ["ddb", "Key points and source chunks read"], ["api", "Labels covered, mismatch, missed"], ["web", "Evidence shown; nothing saved until Save"]] },
    { id: "pending", label: "Missing Explanation", steps: [["ddb", "Unresolved reference saved as pending"], ["transcribe", "A new video is transcribed later"], ["worker", "New video processed, then pending references checked"], ["ddb", "One notification saved per reference and candidate"], ["web", "Bell shows it; user accepts or rejects"]] },
  ],
};

export const SCHEMA = `-- DynamoDB single table. Partition key pk = U#<user>, sort key sk:
V#<video>           video record: title, status, media key, duration, notes source
C#<video>#<n>       transcript chunk: start, end, text, embedding (base64 float32)
N#<video>           notes: summary, key points, action items, decisions
M#<video>           the user's own notes for that video
R#r-<chunk>         reference: phrase, search query, status, chosen source
F#<ref>#<chunk>     notification: one per reference and candidate, never repeated
META#lib            library version, used to refresh the in-memory search cache

-- status: awaiting_upload | transcribing | processing | ready | failed
-- reference status: open | pending | resolved`;

export const PLAN = [
  { name: "Prerequisite: core pipeline", days: "Must work first", w: 22, from: 0, note: "Login, uploads, transcription, stored chunks and search must work before the estimates below apply.", pre: true },
  { name: "Video Context Recovery", days: "3-4 days", w: 30, from: 22, note: "Phrase detection, candidate search, confirmation controls and basic evaluation." },
  { name: "My Notes vs Video", days: "2-3 more days", w: 24, from: 52, note: "Pasted notes, comparison with key points, source validation and approved edits." },
  { name: "Remember the Missing Explanation", days: "1-2 more days", w: 16, from: 76, note: "Pending records, checks after indexing and de-duplicated in-app alerts." },
];

export const EVAL = [
  { h: "Cases", t: "Clear and ambiguous references, no match, later matching uploads, complete notes, omissions and conflicting details." },
  { h: "Checks", t: "Source timestamps, useful top-three suggestions, comparison labels, duplicate alerts, access isolation and review time." },
  { h: "Demo scope", t: "3-5 short English videos and pasted personal notes. Search only the signed-in user's uploaded collection." },
  { h: "Limits", t: "Transcript errors affect every feature. Visual-only explanations and missing-audio reconstruction are outside the demo." },
];

export const COSTS = [
  { h: "Pay for what you use", t: "Everything is serverless: Lambda, API Gateway, DynamoDB, S3, CloudFront and Cognito bill by use, so an idle deployment costs close to nothing.", k: "No servers to run" },
  { h: "Transcription is the main cost", t: "Amazon Transcribe bills per minute of audio. Importing a transcript instead of a video skips that cost, which is handy for testing.", k: "Billed per audio minute" },
  { h: "Models are small change", t: "Bedrock bills per token for notes and embeddings, which is small next to transcription. If a model is not enabled, notes become extractive and search becomes keyword-based.", k: "Graceful fallback" },
  { h: "Limits cap runaway use", t: "Each user can keep 30 videos of up to 500 MB (both configurable). Videos are private and only reachable through short-lived signed links.", k: "30 videos / 500 MB" },
];

export const ROADMAP = [
  { h: "Multilingual transcription", t: "Transcribe and search beyond English." },
  { h: "Speaker identification", t: "Attribute lines in meetings to who said them." },
  { h: "Automatic quiz generation", t: "Turn a lecture into practice questions." },
  { h: "Personalized summaries", t: "Summaries shaped to what a user already knows." },
  { h: "Collaborative note sharing", t: "Share notes with a team or a class." },
  { h: "Real-time meeting analysis", t: "Notes, action items and decisions while a meeting runs." },
  { h: "Retrieval-augmented answers", t: "Natural-language Q&A grounded in the video with citations." },
];

export const AUDIENCE = [
  { h: "Students", t: "Revisit a lecture section instead of the whole recording." },
  { h: "Professionals", t: "Meetings and interviews with action items and decisions." },
  { h: "Educators", t: "Turn long sessions into structured, searchable material." },
  { h: "Organizations", t: "Training recordings with centralized, accessible knowledge." },
];

export const FAQ = [
  { q: "Is the live demo on this page the real product?", a: "No. It is a small miniature that runs in your browser on three invented tutorials, so you can try the ideas instantly. The real app (Open the app) runs on AWS: Amazon Transcribe for speech to text, a Bedrock model for notes, Titan embeddings for search, DynamoDB for data, and Cognito for sign-in." },
  { q: "Are the numbers and timestamps measured results?", a: "No. The example timestamps, similarity scores and notes in the miniature demo are illustrative. Measured evaluation on real videos is a separate step and no accuracy claims are made here." },
  { q: "Does it reconstruct missing audio or visuals?", a: "No. It finds supporting context in videos you uploaded. Visual-only explanations and missing footage are out of scope, and transcript errors affect every feature." },
  { q: "Who decides when a suggested link is right?", a: "The user. A similarity score marks a candidate, not proof of the original source. Context links are confirmed by the user and note changes are saved only after approval." },
  { q: "Is this globally novel?", a: "We do not claim that. The extensions are a project-specific integration of existing transcription, summarization and retrieval techniques. Establishing stronger novelty would need a focused comparison with prior products and research." },
  { q: "What does it cost to run?", a: "The serverless parts cost close to nothing at small scale. Amazon Transcribe, billed per audio minute, is the main cost, followed by small Bedrock charges. Check current AWS pricing for your region." },
];

export const REFS_IMPL = [
  { h: "Amazon Transcribe", url: "https://docs.aws.amazon.com/transcribe/latest/dg/what-is.html" },
  { h: "Amazon Bedrock", url: "https://docs.aws.amazon.com/bedrock/latest/userguide/what-is-bedrock.html" },
  { h: "Amazon Cognito", url: "https://docs.aws.amazon.com/cognito/latest/developerguide/what-is-amazon-cognito.html" },
  { h: "Amazon DynamoDB", url: "https://docs.aws.amazon.com/amazondynamodb/latest/developerguide/Introduction.html" },
  { h: "AWS Lambda", url: "https://docs.aws.amazon.com/lambda/latest/dg/welcome.html" },
  { h: "Amazon API Gateway HTTP APIs", url: "https://docs.aws.amazon.com/apigateway/latest/developerguide/http-api.html" },
  { h: "Amazon CloudFront", url: "https://docs.aws.amazon.com/AmazonCloudFront/latest/DeveloperGuide/Introduction.html" },
  { h: "Whisper (project deck design)", url: "https://github.com/openai/whisper" },
];
