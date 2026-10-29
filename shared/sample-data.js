// Illustrative demo library. All transcripts, times and notes are invented examples
// that mirror the worked examples in the project deck (slides 18, 21, 23).
// They are NOT measured results.

const t = (m, s) => m * 60 + s;

export const VIDEOS = {
  v1: { id: "v1", title: "Server Setup", duration: t(12, 40), tag: "Ops", uploaded: "Already in library" },
  v2: { id: "v2", title: "Application Setup Tutorial", duration: t(14, 20), tag: "Dev", uploaded: "Today" },
  v3: { id: "v3", title: "Database Tutorial", duration: t(10, 50), tag: "Data", uploaded: "Tomorrow" },
  v4: { id: "v4", title: "Monitoring and Alerts", duration: t(9, 40), tag: "Ops", uploaded: "Later" },
};

// screen: lines shown in the simulated video frame at that moment
export const CHUNKS = [
  // ---- v1 Server Setup ----
  { id: "v1-01", videoId: "v1", start: t(0, 0), text: "Welcome to the server setup walkthrough. In this session we prepare a Linux server to host our application.", screen: { title: "Server Setup", lines: ["# Linux host, fresh install", "$ uname -a"] } },
  { id: "v1-02", videoId: "v1", start: t(1, 10), text: "First update the package index and install the required packages, including nginx and Python.", screen: { title: "Packages", lines: ["$ sudo apt update", "$ sudo apt install nginx python3"] } },
  { id: "v1-03", videoId: "v1", start: t(2, 15), text: "Create a dedicated service user so the application never runs as root.", screen: { title: "Service user", lines: ["$ sudo useradd --system appsvc", "$ id appsvc"] } },
  { id: "v1-04", videoId: "v1", start: t(3, 20), text: "To configure the server, follow three steps. First set the bind address, then set the worker count, and finally add the firewall rule for the application port.", screen: { title: "Configure the server", lines: ["bind = 127.0.0.1", "workers = 4", "$ sudo ufw allow 80/tcp"] } },
  { id: "v1-05", videoId: "v1", start: t(5, 0), text: "Nginx forwards requests from port 80 to the application, so keep the proxy block short and readable.", screen: { title: "Nginx proxy", lines: ["location / {", "  proxy_pass http://127.0.0.1;", "}"] } },
  { id: "v1-06", videoId: "v1", start: t(6, 30), text: "Next we write a systemd unit so the application starts on boot and restarts automatically when it crashes.", screen: { title: "systemd unit", lines: ["[Service]", "User=appsvc", "Restart=on-failure"] } },
  { id: "v1-07", videoId: "v1", start: t(8, 0), text: "Logs go to the journal. Use the journal viewer with the unit name to follow output while testing.", screen: { title: "Logs", lines: ["$ journalctl -u app -f"] } },
  { id: "v1-08", videoId: "v1", start: t(10, 0), text: "Verify the health endpoint with a simple request and confirm you receive an OK response.", screen: { title: "Health check", lines: ["$ curl -i /health", "HTTP/1.1 200 OK"] } },
  { id: "v1-09", videoId: "v1", start: t(12, 0), text: "That completes the server. In the next recording we deploy the sample application on top of it.", screen: { title: "Done", lines: ["server ready"] } },

  // ---- v2 Application Setup Tutorial ----
  { id: "v2-01", videoId: "v2", start: t(0, 0), text: "In this tutorial we deploy the sample application in five setup steps.", screen: { title: "Application Setup", lines: ["5 steps to deploy", "1 clone  2 env  3 port  4 migrate  5 restart"] } },
  { id: "v2-02", videoId: "v2", start: t(1, 5), text: "Step one: clone the repository and install the dependencies with the package manager.", screen: { title: "Step 1 / 5", lines: ["$ git clone app.git", "$ npm install"] } },
  { id: "v2-03", videoId: "v2", start: t(2, 30), text: "Step two: copy the example environment file and fill in the secret keys.", screen: { title: "Step 2 / 5", lines: ["$ cp .env.example .env", "SECRET_KEY=********"] } },
  { id: "v2-04", videoId: "v2", start: t(4, 20), text: "Step three: set the application port to 8000 in the environment file, because the proxy expects that port.", screen: { title: "Step 3 / 5", lines: ["# .env", "PORT=8000"] } },
  { id: "v2-05", videoId: "v2", start: t(6, 10), text: "Use the database settings from the earlier tutorial. Make sure the connection string matches the database user and password you created there.", screen: { title: "Database settings", lines: ["DATABASE_URL=", "  postgres://user:pass@host/db"] } },
  { id: "v2-06", videoId: "v2", start: t(7, 20), text: "Step four: run the database migrations so that every table is created.", screen: { title: "Step 4 / 5", lines: ["$ npm run migrate", "created 7 tables"] } },
  { id: "v2-07", videoId: "v2", start: t(8, 15), text: "Step five: restart the service so the new configuration is loaded, then check the status.", screen: { title: "Step 5 / 5", lines: ["$ sudo systemctl restart app", "$ systemctl status app"] } },
  { id: "v2-08", videoId: "v2", start: t(9, 30), text: "Configure the server using the method shown in the previous tutorial. That covers the bind address, the worker count and the firewall rule.", screen: { title: "Server config", lines: ["bind / workers / firewall", "(see previous tutorial)"] } },
  { id: "v2-09", videoId: "v2", start: t(11, 0), text: "Open the health endpoint in the browser to verify that the application responds.", screen: { title: "Verify", lines: ["GET /health -> 200 OK"] } },
  { id: "v2-10", videoId: "v2", start: t(12, 30), text: "If something fails, read the application logs before you restart anything again.", screen: { title: "Troubleshooting", lines: ["$ journalctl -u app -n 50"] } },
  { id: "v2-11", videoId: "v2", start: t(13, 40), text: "That is the full setup. In the next tutorial we will set up monitoring and alerts. Thanks for following along.", screen: { title: "Wrap up", lines: ["deployed"] } },

  // ---- v3 Database Tutorial (uploaded "tomorrow") ----
  { id: "v3-01", videoId: "v3", start: t(0, 0), text: "Welcome. This tutorial prepares the database that the sample application connects to.", screen: { title: "Database Tutorial", lines: ["PostgreSQL for the sample app"] } },
  { id: "v3-02", videoId: "v3", start: t(2, 10), text: "Install PostgreSQL and start the database service, then confirm it accepts local connections.", screen: { title: "Install", lines: ["$ sudo apt install postgresql", "$ pg_isready"] } },
  { id: "v3-03", videoId: "v3", start: t(4, 20), text: "Create a database user and a password, then create the application database. These are the database settings the application uses: host, port, user, password and database name.", screen: { title: "Database settings", lines: ["CREATE USER appuser;", "CREATE DATABASE appdb;", "host / port / user / password / name"] } },
  { id: "v3-04", videoId: "v3", start: t(6, 0), text: "Enable the vector extension if you plan to store embeddings for similarity search.", screen: { title: "Vector extension", lines: ["CREATE EXTENSION vector;"] } },
  { id: "v3-05", videoId: "v3", start: t(8, 0), text: "Schedule nightly backups and test a restore at least once before relying on them.", screen: { title: "Backups", lines: ["$ pg_dump appdb > backup.sql"] } },
  { id: "v3-06", videoId: "v3", start: t(9, 30), text: "That wraps up the database. You can now return to the application setup.", screen: { title: "Done", lines: ["database ready"] } },
  { id: "v4-01", videoId: "v4", start: t(0, 0), text: "Welcome. This tutorial sets up monitoring and alerts for the deployed application.", screen: { title: "Monitoring and Alerts", lines: ["Goal: know when the app is unhealthy"] } },
  { id: "v4-02", videoId: "v4", start: t(1, 20), text: "Install the metrics agent and expose the application metrics on a local endpoint so the collector can scrape them.", screen: { title: "Metrics agent", lines: ["install agent", "expose /metrics"] } },
  { id: "v4-03", videoId: "v4", start: t(3, 0), text: "Add a dashboard with request rate, error rate and response time. These three charts show most problems early.", screen: { title: "Dashboard", lines: ["request rate", "error rate", "latency"] } },
  { id: "v4-04", videoId: "v4", start: t(4, 40), text: "Create an alert that fires when the error rate stays above five percent for ten minutes.", screen: { title: "Alert rule", lines: ["error rate > 5%", "for 10 minutes"] } },
  { id: "v4-05", videoId: "v4", start: t(6, 10), text: "Send alerts to the team chat channel and to email, and name one person who is on call.", screen: { title: "Alert routing", lines: ["chat channel", "email", "on call"] } },
  { id: "v4-06", videoId: "v4", start: t(7, 50), text: "Test the alert by stopping the service for a few minutes, then confirm the notification arrives and clears.", screen: { title: "Test the alert", lines: ["stop service", "notification received"] } },
  { id: "v4-07", videoId: "v4", start: t(9, 10), text: "That completes monitoring and alerts. Thanks for following the whole series.", screen: { title: "Done", lines: ["series complete"] } },
];

export const CHUNKS_BY_ID = Object.fromEntries(CHUNKS.map((c) => [c.id, c]));

// In the proposed system Gemini extracts these from the transcript with source chunk IDs.
// Precomputed here for the illustrative demo.
export const KEYPOINTS_V2 = [
  { id: "kp1", text: "Clone the repository and install the dependencies", chunkId: "v2-02" },
  { id: "kp2", text: "Copy the example environment file and add the secret keys", chunkId: "v2-03" },
  { id: "kp3", text: "Set the application port to 8000 in the environment file", chunkId: "v2-04" },
  { id: "kp4", text: "Run the database migrations to create the tables", chunkId: "v2-06" },
  { id: "kp5", text: "Restart the service to load the new configuration and check the status", chunkId: "v2-07" },
];

export const SAMPLE_NOTES = [
  "1. Clone the repo and install dependencies",
  "2. Copy the example env file and add secret keys",
  "3. Set the app port to 8080 in the env file",
  "4. Run database migrations",
].join("\n");

export const SAMPLE_REFERENCES = [
  "As we discussed earlier, the database user and password need to match the connection string.",
  "Set the bind address, worker count and firewall rule like in the previous tutorial.",
  "Remember the nginx proxy block we covered in the last session.",
  "Today we talk about cooking pasta, as shown in the earlier video.",
];

// Precomputed "auto notes" per video (in the proposed system Gemini writes these from chunk IDs).
export const NOTES = {
  v1: {
    summary: "Prepares a Linux server to host the application: install packages, create a service user, configure the bind address, worker count and firewall, proxy with nginx, run under systemd and verify the health endpoint.",
    points: [["v1-02", "Install nginx and Python after updating the package index"], ["v1-03", "Create a dedicated service user so the application never runs as root"], ["v1-04", "Configure the server: bind address, worker count, firewall rule"], ["v1-06", "Write a systemd unit so the app starts on boot and restarts on failure"], ["v1-08", "Verify that the health endpoint returns OK"]],
    actions: [["v1-07", "Follow the journal logs while testing"], ["v1-08", "Check the health endpoint after setup"]],
    decisions: [["v1-03", "Run the application as a dedicated service user, not root"]],
  },
  v2: {
    summary: "Deploys the sample application in five steps: clone and install, fill the environment file, set the port to 8000, run the database migrations and restart the service. Database settings and server configuration are taken from earlier tutorials.",
    points: [["v2-02", "Clone the repository and install the dependencies"], ["v2-03", "Copy the example environment file and add the secret keys"], ["v2-04", "Set the application port to 8000 in the environment file"], ["v2-06", "Run the database migrations to create the tables"], ["v2-07", "Restart the service to load the new configuration and check the status"]],
    actions: [["v2-07", "Restart the service and check its status"], ["v2-10", "If something fails, read the application logs before restarting again"]],
    decisions: [["v2-04", "Use port 8000 because the proxy expects it"]],
  },
  v3: {
    summary: "Sets up PostgreSQL for the sample application: install and start it, create a user, password and database, optionally enable the vector extension, and schedule backups.",
    points: [["v3-02", "Install PostgreSQL and confirm it accepts local connections"], ["v3-03", "Create a database user, a password and the application database"], ["v3-04", "Enable the vector extension if you will store embeddings"], ["v3-05", "Schedule nightly backups and test a restore"]],
    actions: [["v3-05", "Schedule nightly backups and test a restore once"]],
    decisions: [["v3-03", "Use a dedicated database user for the application"]],
  },
};
export const ASK_SAMPLES = ["Which port should the application use?", "How do I restart the service?", "Where is the firewall rule configured?", "What does the systemd unit do?"];
