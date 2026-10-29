import { build, transform } from "esbuild";
import { readFileSync, writeFileSync, mkdirSync, readdirSync, copyFileSync, existsSync } from "node:fs";

mkdirSync("dist/fonts", { recursive: true });
await build({ entryPoints: ["src/js/main.js"], bundle: true, minify: true, format: "iife", target: ["es2020"], outfile: "dist/app.js", legalComments: "none" });
const css = readdirSync("src/css").filter((f) => f.endsWith(".css")).sort().map((f) => readFileSync("src/css/" + f, "utf8")).join("\n");
const out = await transform(css, { loader: "css", minify: true });
writeFileSync("dist/styles.css", out.code);
copyFileSync("src/about.html", "dist/about.html");
copyFileSync("src/project.html", "dist/project.html");
for (const f of ["favicon.svg", "og.png", "boot.js"]) if (existsSync("src/public/" + f)) copyFileSync("src/public/" + f, "dist/" + f);
// ---- backend (Lambda bundle; AWS SDK v3 comes from the Node runtime) ----
await build({ entryPoints: ["backend/src/lambda.js"], bundle: true, minify: false, platform: "node", format: "cjs", target: "node22", outfile: "backend/dist/lambda.js", external: ["@aws-sdk/*"], legalComments: "none" });
writeFileSync("backend/dist/package.json", JSON.stringify({ type: "commonjs" }));
// ---- web app ----
await build({ entryPoints: ["app/js/main.js"], bundle: true, minify: true, format: "iife", target: ["es2020"], outfile: "dist/cn-app.js", legalComments: "none" });
const appCss = (await transform(readFileSync("app/css/app.css", "utf8"), { loader: "css", minify: true })).code;
writeFileSync("dist/cn-app.css", appCss);
copyFileSync("app/index.html", "dist/index.html");
// ---- preview build: same app, runs entirely in the browser ----
import { cpSync, rmSync } from "node:fs";
rmSync("dist-preview", { recursive: true, force: true });
cpSync("dist", "dist-preview", { recursive: true });
writeFileSync("dist-preview/config.json", JSON.stringify({ mode: "browser" }));
console.log("built", { js: readFileSync("dist/app.js").length, css: readFileSync("dist/styles.css").length });
