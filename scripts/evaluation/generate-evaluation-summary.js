import fs from "node:fs/promises";
import path from "node:path";

const evaluationDirectory = path.join(process.cwd(), "evaluation");
const reports = [
  {
    title: "Paper workflow evaluation",
    fileName: "experiment-summary.generated.md",
    description: "BPMN import, render, delta update, full population comparison, and figures."
  },
  {
    title: "Policy lifecycle evaluation",
    fileName: "policy-lifecycle.generated.md",
    description: "Empty versus populated mint and Master, Creator, and Holder policy outcomes."
  },
  {
    title: "Policy integration test results",
    fileName: "policy-tests.generated.md",
    description: "Complete allow-deny test matrix with receipt-derived gas and wei costs."
  }
];

async function readReport(report) {
  const reportPath = path.join(evaluationDirectory, report.fileName);
  try {
    return { ...report, content: await fs.readFile(reportPath, "utf8") };
  } catch (error) {
    if (error.code === "ENOENT") return { ...report, content: null };
    throw error;
  }
}

async function listGeneratedFiles(directoryPath, include = (fileName) => fileName.includes(".generated.")) {
  const entries = await fs.readdir(directoryPath, { withFileTypes: true }).catch(() => []);
  const files = [];
  for (const entry of entries) {
    const entryPath = path.join(directoryPath, entry.name);
    if (entry.isDirectory()) {
      files.push(...await listGeneratedFiles(entryPath, include));
    } else if (entry.isFile() && include(entry.name)) {
      files.push(entryPath);
    }
  }
  return files;
}

function markdownLinks(files, outputPath) {
  return files
    .sort()
    .map((filePath) => `- [${path.basename(filePath)}](${path.relative(path.dirname(outputPath), filePath)})`);
}

async function main() {
  const availableReports = await Promise.all(reports.map(readReport));
  const outputPath = path.join(evaluationDirectory, "summary.generated.md");
  const finalReportPath = path.join(evaluationDirectory, "final-report.generated.md");
  const projectRoot = process.cwd();
  const [metrics, figures, bpmnArtifacts] = await Promise.all([
    listGeneratedFiles(path.join(projectRoot, "metrics")),
    listGeneratedFiles(path.join(evaluationDirectory, "figures"), (fileName) => /\.(png|svg)$/i.test(fileName)),
    Promise.all([
      listGeneratedFiles(path.join(projectRoot, "bpmn-builder-js", "example", "contract")),
      listGeneratedFiles(path.join(projectRoot, "bpmn-builder-js", "example", "input")),
      listGeneratedFiles(path.join(projectRoot, "bpmn-builder-js", "example", "output"))
    ]).then((groups) => groups.flat())
  ]);
  const lines = [
    "# ChorNMT final evaluation report",
    "",
    `Generated at: ${new Date().toISOString()}`,
    "",
    "This is the single entry point for experimental evidence. The paper workflow report measures BPMN import, rendering, and delta updates; the policy lifecycle report measures governance and BPMN-update enforcement. Run the corresponding evaluation command to refresh each embedded section.",
    "",
    "Policy semantics, BPMN constraints, and the allow/deny test mapping are documented in [Choreography Policy and Test Specification](../docs/policy-test-specification.md).",
    "",
    "```bash",
    "npm run evaluate:paper",
    "npm run evaluate:policies",
    "npm run evaluate:summary",
    "```",
    "",
    "## Generated artifacts",
    "",
    "The sections below embed the BPMN model PNGs and the gnuplot charts. This index gives direct access to every generated input/output artifact and receipt metric.",
    "",
    "### Model views and charts",
    "",
    ...markdownLinks(figures, outputPath),
    "",
    "### BPMN and contract-export artifacts",
    "",
    ...markdownLinks(bpmnArtifacts, outputPath),
    "",
    "### Receipt metrics and CSV data",
    "",
    ...markdownLinks(metrics, outputPath),
    "",
    "## Available evaluations",
    ""
  ];

  for (const report of availableReports) {
    const status = report.content ? "available" : "not generated yet";
    lines.push(`- [${report.title}](${report.fileName}): ${report.description} Status: ${status}.`);
  }

  for (const report of availableReports) {
    if (!report.content) continue;
    lines.push("", `---`, "", report.content.trim());
  }

  const report = `${lines.join("\n")}\n`;
  await Promise.all([
    fs.writeFile(outputPath, report),
    fs.writeFile(finalReportPath, report)
  ]);
  console.log(`Final evaluation report: ${finalReportPath}`);
  console.log(`Compatibility overview: ${outputPath}`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
