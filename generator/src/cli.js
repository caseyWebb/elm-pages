const util = require("util");
const fsSync = require("fs");
const fs = {
  writeFile: util.promisify(fsSync.writeFile),
  mkdir: util.promisify(fsSync.mkdir),
  readFile: util.promisify(fsSync.readFile),
  copyFile: util.promisify(fsSync.copyFile),
};

const path = require("path");
const seo = require("./seo-renderer.js");
const exec = util.promisify(require("child_process").exec);
const codegen = require("./codegen.js");
const generateManifest = require("./generate-manifest.js");

const DIR_PATH = path.join(process.cwd());
const OUTPUT_FILE_NAME = "elm.js";

const ELM_FILE_PATH = path.join(
  DIR_PATH,
  "./elm-stuff/elm-pages",
  OUTPUT_FILE_NAME
);

async function ensureRequiredDirs() {
  await fs.mkdir(`dist`, { recursive: true });
}

async function run() {
  await ensureRequiredDirs();
  XMLHttpRequest = require("xhr2");

  await codegen.generate();

  await compileCliApp();

  copyAssets();
  compileElm();

  runElmApp();
}

function runElmApp() {
  return new Promise((resolve, _) => {
    const mode /** @type { "dev" | "prod" } */ = "elm-to-html-beta";
    const staticHttpCache = {};
    const app = require(ELM_FILE_PATH).Elm.Main.init({
      flags: { secrets: process.env, mode, staticHttpCache },
    });

    app.ports.toJsPort.subscribe((/** @type { FromElm }  */ fromElm) => {
      if (fromElm.command === "log") {
        console.log(fromElm.value);
      } else if (fromElm.command === "initial") {
        fs.writeFile(
          `dist/manifest.json`,
          JSON.stringify(generateManifest(fromElm.manifest))
        );
        generateFiles(fromElm.filesToGenerate);
      } else {
        outputString(fromElm);
      }
    });
  });
}

/**
 * @param {{ path: string; content: string; }[]} filesToGenerate
 */
async function generateFiles(filesToGenerate) {
  filesToGenerate.forEach(({ path, content }) => {
    fs.writeFile(`dist/${path}`, content);
  });
}

/**
 * @param {string} route
 */
function cleanRoute(route) {
  return route.replace(/(^\/|\/$)/, "");
}

/**
 * @param {string} elmPath
 */
async function elmToEsm(elmPath) {
  const elmEs3 = await fs.readFile(elmPath, "utf8");

  const elmEsm =
    "\n" +
    "const scope = {};\n" +
    elmEs3.replace("}(this));", "}(scope));") +
    "export const { Elm } = scope;\n" +
    "\n";

  await fs.writeFile(elmPath, elmEsm);
}

/**
 * @param {string} cleanedRoute
 */
function pathToRoot(cleanedRoute) {
  return cleanedRoute === ""
    ? cleanedRoute
    : cleanedRoute
        .split("/")
        .map((_) => "..")
        .join("/")
        .replace(/\.$/, "./");
}

/**
 * @param {string} route
 */
function baseRoute(route) {
  const cleanedRoute = cleanRoute(route);
  return cleanedRoute === "" ? "./" : pathToRoot(route);
}

async function outputString(/** @type { FromElm } */ fromElm) {
  console.log(`Pre-rendered /${fromElm.route}`);
  let contentJson = {};
  contentJson["body"] = fromElm.body;

  contentJson["staticData"] = fromElm.contentJson;
  const normalizedRoute = fromElm.route.replace(/index$/, "");
  await fs.mkdir(`./dist/${normalizedRoute}`, { recursive: true });
  fs.writeFile(`dist/${normalizedRoute}/index.html`, wrapHtml(fromElm));
  fs.writeFile(
    `dist/${normalizedRoute}/content.json`,
    JSON.stringify(contentJson)
  );
}

async function compileElm() {
  const outputPath = `dist/main.js`;
  await shellCommand(
    `elm-optimize-level-2 src/Main.elm --output ${outputPath}`
  );
  await elmToEsm(path.join(process.cwd(), outputPath));
  runTerser(outputPath);
}

/**
 * @param {string} filePath
 */
async function runTerser(filePath) {
  await shellCommand(
    `npx terser ${filePath} --module --compress 'pure_funcs="F2,F3,F4,F5,F6,F7,F8,F9,A2,A3,A4,A5,A6,A7,A8,A9",pure_getters,keep_fargs=false,unsafe_comps,unsafe' | npx terser --module --mangle --output=${filePath}`
  );
}

async function copyAssets() {
  fs.copyFile("index.js", "dist/index.js");
  fs.copyFile("user-index.js", "dist/user-index.js");
  fs.copyFile("style.css", "dist/style.css");
}

async function compileCliApp() {
  await shellCommand(
    `cd ./elm-stuff/elm-pages && elm-optimize-level-2 ../../src/Main.elm --output elm.js`
  );
  const elmFileContent = await fs.readFile(ELM_FILE_PATH, "utf-8");
  await fs.writeFile(
    ELM_FILE_PATH,
    elmFileContent.replace(
      /return \$elm\$json\$Json\$Encode\$string\(.REPLACE_ME_WITH_JSON_STRINGIFY.\)/g,
      "return x"
    )
  );
}

run();

/**
 * @param {string} command
 */
async function shellCommand(command) {
  const output = await exec(command);
  if (output.stderr) {
    throw output.stderr;
  }
  return output;
}

/** @typedef { { route : string; contentJson : string; head : SeoTag[]; html: string; body: string; } } FromElm */
/** @typedef {HeadTag | JsonLdTag} SeoTag */
/** @typedef {{ name: string; attributes: string[][]; type: 'head' }} HeadTag */
/** @typedef {{ contents: Object; type: 'json-ld' }} JsonLdTag */

function wrapHtml(/** @type { FromElm } */ fromElm) {
  /*html*/
  return `<!DOCTYPE html>
  <html lang="en">
  <head>
    <link rel="preload" href="content.json" as="fetch" crossorigin="">
    <base href="${baseRoute(fromElm.route)}">
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width,initial-scale=1">
    <script>if ("serviceWorker" in navigator) {
      window.addEventListener("load", () => {
        navigator.serviceWorker.register("service-worker.js");
      });
    } else {
      console.log("No service worker registered.");
    }</script>
    <link rel="shortcut icon" href="https://res.cloudinary.com/dillonkearns/image/upload/w_64/v1602878565/Favicon_Dark_adgn6v.png">
    <link rel="icon" type="image/png" sizes="16x16" href="https://res.cloudinary.com/dillonkearns/image/upload/w_16/v1602878565/Favicon_Dark_adgn6v.png">
    <link rel="icon" type="image/png" sizes="32x32" href="https://res.cloudinary.com/dillonkearns/image/upload/w_32/v1602878565/Favicon_Dark_adgn6v.png">
    <link rel="icon" type="image/png" sizes="48x48" href="https://res.cloudinary.com/dillonkearns/image/upload/w_48/v1602878565/Favicon_Dark_adgn6v.png">
    <link rel="manifest" href="manifest.json">
    <meta name="mobile-web-app-capable" content="yes">
    <meta name="theme-color" content="#ffffff">
    <meta name="application-name" content="elm-pages docs">
    <link rel="apple-touch-icon" sizes="57x57" href="assets/apple-touch-icon-57x57.png">
    <link rel="apple-touch-icon" sizes="60x60" href="assets/apple-touch-icon-60x60.png">
    <link rel="apple-touch-icon" sizes="72x72" href="assets/apple-touch-icon-72x72.png">
    <link rel="apple-touch-icon" sizes="76x76" href="assets/apple-touch-icon-76x76.png">
    <link rel="apple-touch-icon" sizes="114x114" href="assets/apple-touch-icon-114x114.png">
    <link rel="apple-touch-icon" sizes="120x120" href="assets/apple-touch-icon-120x120.png">
    <link rel="apple-touch-icon" sizes="144x144" href="assets/apple-touch-icon-144x144.png">
    <link rel="apple-touch-icon" sizes="152x152" href="assets/apple-touch-icon-152x152.png">
    <link rel="apple-touch-icon" sizes="167x167" href="assets/apple-touch-icon-167x167.png">
    <link rel="apple-touch-icon" sizes="180x180" href="assets/apple-touch-icon-180x180.png">
    <link rel="apple-touch-icon" sizes="1024x1024" href="assets/apple-touch-icon-1024x1024.png">
    <meta name="apple-mobile-web-app-capable" content="yes">
    <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent">

    <meta name="apple-mobile-web-app-title" content="elm-pages">
    <script defer="defer" src="/main.js" type="module"></script>
    <script defer="defer" src="/index.js" type="module"></script>
    <link rel="stylesheet" href="/style.css"></link>
    <link rel="preload" href="/main.js" as="script">
    ${seo.toString(fromElm.head)}
    <body>
      <div data-url="" display="none"></div>
      ${fromElm.html}
    </body>
  </html>
  `;
}
