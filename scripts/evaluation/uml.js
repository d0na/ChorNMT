import path from "node:path";

// UML diagrams of docs/uml/ embedded in the evaluation reports, with the report rows each one
// explains. Rendered with `npm run docs:uml`; see docs/uml.md.
export const UML_DIAGRAMS = {
  "use-case-choreography": {
    title: "Choreography use cases",
    explains: "who may mint, transfer, edit, and replace policies: the actors behind every allowed and denied row"
  },
  "use-case-participant-license": {
    title: "Participant license use cases",
    explains: "the license rows: issuing, declaring messages, updating organization data, selling, linking a role"
  },
  "sequence-deploy-and-mint": {
    title: "Deploy and mint with an initial model",
    explains: "the deployment rows and the empty versus populated mint comparison"
  },
  "sequence-import-and-render": {
    title: "Import and render",
    explains: "the import phase (setRoles, setNodes) and the render phases, which read the asset with one tokenURI call and cost no gas"
  },
  "sequence-apply-delta": {
    title: "Apply a BPMN delta",
    explains: "the modification phase and every Creator allow/deny row on setNodes: action check and domain check, each asked of the Creator AND the Holder policy"
  },
  "sequence-role-license-sale": {
    title: "Link a role to a license and sell it",
    explains: "the Special Carrier rows: role link through ChoreographyParticipantAM, sale checked by the participant Master"
  },
  "sequence-policy-replacement": {
    title: "Replace a hardcoded policy",
    explains: "the rows that deploy and install a policy: a rule change is a new policy, approved by the current one"
  }
};

const UML_DIRECTORY = path.join(process.cwd(), "docs", "uml");

export function umlLink(name, reportPath) {
  return path.relative(path.dirname(reportPath), path.join(UML_DIRECTORY, `${name}.svg`));
}

// Markdown lines embedding one diagram with a caption naming the rows it explains.
export function umlFigure(name, reportPath) {
  const diagram = UML_DIAGRAMS[name];
  if (!diagram) {
    throw new Error(`Unknown UML diagram ${name}`);
  }
  return [
    `![${diagram.title}](${umlLink(name, reportPath)})`,
    "",
    `*${diagram.title}: ${diagram.explains}.*`,
    ""
  ];
}

// Reading guide for the final report: every diagram with the rows it explains.
export function umlReadingGuide(reportPath) {
  const guide = path.relative(path.dirname(reportPath), path.join(process.cwd(), "docs", "uml.md"));
  return [
    "## Reading guide: UML diagrams",
    "",
    `The reports below embed UML use case and sequence diagrams next to the rows they explain. All of them, with their PlantUML sources, are in [UML diagrams](${guide}).`,
    "",
    "| Diagram | Explains |",
    "| --- | --- |",
    ...Object.entries(UML_DIAGRAMS).map(([name, diagram]) =>
      `| [${diagram.title}](${umlLink(name, reportPath)}) | ${diagram.explains} |`),
    ""
  ];
}
