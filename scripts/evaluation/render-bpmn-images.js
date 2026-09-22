import fs from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { chromium } from "playwright";

const VIEWPORT = { width: 1600, height: 1000 };

async function createViewerPage(browser) {
  const page = await browser.newPage({ viewport: VIEWPORT, deviceScaleFactor: 1 });
  const chorJsDirectory = path.join(process.cwd(), "node_modules", "chor-js", "dist");
  const viewerPath = path.join(chorJsDirectory, "chor-js-viewer.development.js");
  const stylesheetPath = path.join(chorJsDirectory, "assets", "chor-js.css");
  const htmlPath = path.join("/tmp", "chornmt-bpmn-image-viewer.html");

  await fs.writeFile(htmlPath, `<!doctype html>
<html><head><style>
html, body, #canvas { width: 100%; height: 100%; margin: 0; background: white; }
.djs-palette, .djs-context-pad, .bjs-powered-by { display: none !important; }
</style><link rel="stylesheet" href="${pathToFileURL(stylesheetPath).href}"></head><body><div id="canvas"></div><script src="${pathToFileURL(viewerPath).href}"></script></body></html>`);
  await page.goto(pathToFileURL(htmlPath).href);
  return page;
}

export async function renderBpmnImages({ xmlPath, outputBaseName }) {
  const outputDirectory = path.join(process.cwd(), "evaluation", "figures");
  const svgPath = path.join(outputDirectory, `${outputBaseName}.generated.svg`);
  const pngPath = path.join(outputDirectory, `${outputBaseName}.generated.png`);
  const xml = await fs.readFile(xmlPath, "utf8");

  await fs.mkdir(outputDirectory, { recursive: true });
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await createViewerPage(browser);
    const svg = await page.evaluate(async (bpmnXml) => {
      const viewer = new window.ChorJS({ container: "#canvas" });
      const result = await viewer.importXML(bpmnXml);
      if (result.warnings.length > 0) console.warn(result.warnings);
      viewer.get("canvas").zoom("fit-viewport");
      const { svg } = await viewer.saveSVG();
      return svg;
    }, xml);
    await fs.writeFile(svgPath, svg);
    await page.locator("#canvas").screenshot({ path: pngPath });
  } finally {
    await browser.close();
  }

  return { svgPath, pngPath };
}
