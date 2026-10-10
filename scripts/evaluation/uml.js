import path from "node:path";

// UML diagrams embedded in the evaluation reports, with the report rows each one explains: the
// use cases of docs/uml/ and the sequence diagrams generated per experiment phase in
// evaluation/evidence/uml/ (decision D19). Rendered with `npm run docs:uml`; see docs/uml.md.
export const UML_DIAGRAMS = {
  "use-case-choreography": {
    title: "Choreography use cases",
    explains: "who may mint, transfer, edit the model, assign and link roles, and install a Holder policy: the actors behind every allowed and denied row"
  },
  "use-case-participant-license": {
    title: "Participant license use cases",
    explains: "the license rows: issuing, declaring messages, updating organization data, selling, linking a role"
  },
  F1: {
    title: "F1, deploy the choreography type and the license infrastructure",
    explains: "the deployment rows and the model contract of the type, from the call traces of the experiment",
    directory: "evidence"
  },
  F2: {
    title: "F2, mint the instance and assign the role accounts",
    explains: "the mint of an instance born with the model, the Master check, and the role accounts",
    directory: "evidence"
  },
  F3: {
    title: "F3, issue the licenses and link the Special Carrier role",
    explains: "the role link through ChoreographyParticipantAM and the Creator denials of the wrong license types",
    directory: "evidence"
  },
  F4: {
    title: "F4, render the baseline model",
    explains: "the render phases: one tokenURI call, traced, and the off-chain pipeline that regenerates the BPMN XML",
    directory: "evidence"
  },
  F5: {
    title: "F5, apply the delta",
    explains: "the modification phase and every Creator allow/deny row on setNodes: action check and domain check, each asked of the Creator AND the Holder policy",
    directory: "evidence"
  },
  F6: {
    title: "F6, sell the Special Carrier role",
    explains: "the license sale checked by the participant Master, and the buyer and former holder rights after it",
    directory: "evidence"
  },
  F7: {
    title: "F7, transfer a second instance and restrict it",
    explains: "the transfer checked by the Master and the asset, and a Holder policy that denies further updates",
    directory: "evidence"
  },
  F8: {
    title: "F8, render the final model and mint a new instance",
    explains: "the final render and the new instance with the same roles that the delta is compared with",
    directory: "evidence"
  }
};

const UML_DIRECTORIES = {
  docs: path.join(process.cwd(), "docs", "uml"),
  evidence: path.join(process.cwd(), "evaluation", "evidence", "uml")
};

export function umlLink(name, reportPath) {
  const directory = UML_DIRECTORIES[UML_DIAGRAMS[name].directory || "docs"];
  return path.relative(path.dirname(reportPath), path.join(directory, `${name}.svg`));
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
