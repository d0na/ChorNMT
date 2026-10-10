// The parity checklist (decision D21): every section, table, column, and artifact of the reports
// the experiment replaces (the evaluation/*.generated.md reports of evaluate:paper,
// evaluate:policies, test:policies, evaluate:summary) and of evaluation/README.md, with where it
// lives now. It is permanent: content leaves the documentation only by changing an entry here to
// "dropped" with its reason, which shows in the diff. `node scripts/experiment/protocol.js --check`
// fails if a destination does not exist.
//
// Destinations:
//   block:<name>       a generated block of docs/experiment.md
//   narrative:<name>   a hand-written section of docs/experiment.md (<!-- narrative:<name> -->)
//   artifact:<path>    a versioned file of evaluation/evidence/
//   readme             evaluation/README.md, which keeps the instructions
//   dropped            removed, with the reason
// An entry that keeps its content in another form says how in reason.
export const PARITY = [
  // evaluation/experiment-summary.generated.md (evaluate:paper)
  { source: "experiment-summary", item: "header: asset address", destination: "block:phase:F2" },
  { source: "experiment-summary", item: "header: total wall-clock duration", destination: "block:phases-overview" },
  { source: "experiment-summary", item: "header: ETH/USD price used", destination: "block:provenance" },
  { source: "experiment-summary", item: "header: choreography type (NMT) and model contract addresses", destination: "block:phase:F1" },
  { source: "experiment-summary", item: "header: links to the metrics JSON of import/deploy/mint, renders, and modification", destination: "block:artifacts" },
  { source: "experiment-summary", item: "header: aggregated CSV of the operation metrics", destination: "artifact:transactions.csv" },
  { source: "experiment-summary", item: "experiment-results.generated.csv: per-phase duration, gas, cost, and model counts", destination: "block:phases-overview" },
  { source: "experiment-summary", item: "experiment-results.generated.csv: separate import, deploy, and mint rows", destination: "dropped", reason: "the phases are F1-F8: the import is a timed sub-step of F1, deploy and mint are F1 and F2 with their own gas; the two renders are F4 and F8" },
  { source: "experiment-summary", item: "model-structure.generated.csv", destination: "artifact:charts/model-comparison.dat" },
  { source: "experiment-summary", item: "How the measured operations work, with the sequence diagrams", destination: "block:phase:F1" },
  { source: "experiment-summary", item: "Generated BPMN: links to the baseline and final XML", destination: "block:bpmn" },
  { source: "experiment-summary", item: "Generated BPMN: SVG images", destination: "block:bpmn" },
  { source: "experiment-summary", item: "Generated BPMN: PNG images", destination: "dropped", reason: "the SVG of the same drawing is kept: vector, shown by GitHub and the reports (Q30)" },
  { source: "experiment-summary", item: "Baseline model and Model after delta images", destination: "block:bpmn" },
  { source: "experiment-summary", item: "Deployment and mint costs: Transaction column", destination: "block:phase:F1" },
  { source: "experiment-summary", item: "Deployment and mint costs: Smart contract / asset column", destination: "block:phase:F1" },
  { source: "experiment-summary", item: "Deployment and mint costs: Address column", destination: "block:phase:F1" },
  { source: "experiment-summary", item: "Deployment and mint costs: Gas column", destination: "block:phase:F1" },
  { source: "experiment-summary", item: "Deployment and mint costs: ETH cost column", destination: "block:phase:F1" },
  { source: "experiment-summary", item: "Deployment and mint costs: USD @10, @30, @100 gwei columns", destination: "block:phase:F1" },
  { source: "experiment-summary", item: "Deployment and mint costs: mint and role-account rows", destination: "block:phase:F2" },
  { source: "experiment-summary", item: "Deployment and mint costs: deployment and mint total row (gas, local-price ETH, USD x3)", destination: "block:scenarios" },
  { source: "experiment-summary", item: "Deployment and mint costs: transfer row, not executed then", destination: "block:phase:F7", reason: "the experiment now measures a transfer, on the second instance" },
  { source: "experiment-summary", item: "Delta update versus a new instance: strategy, gas, ETH cost, USD x3, relative gas saving", destination: "block:comparison" },
  { source: "experiment-summary", item: "Delta update versus a new instance: explanation (deployment excluded, per-instance transactions)", destination: "narrative:comparison" },
  { source: "experiment-summary", item: "Public-network gas-price scenarios: condition, gas price, meaning, gas, ETH, USD", destination: "block:scenarios" },
  { source: "experiment-summary", item: "Phase measurements: phase, duration, gas, ETH cost", destination: "block:phases-overview" },
  { source: "experiment-summary", item: "Phase measurements: nodes, edges, gateways, messages", destination: "block:phases-overview" },
  { source: "experiment-summary", item: "Figure: duration by phase", destination: "block:charts" },
  { source: "experiment-summary", item: "Figure: gas by phase", destination: "block:charts" },
  { source: "experiment-summary", item: "Figure: model comparison", destination: "block:charts" },
  { source: "experiment-summary", item: "Manual figure: gas by changed nodes", destination: "block:charts" },
  { source: "experiment-summary", item: "Manual figure: duration by nodes", destination: "dropped", reason: "one model gives two sizes; other models are a non-goal (Q29)" },
  { source: "experiment-summary", item: "Manual figure: duration by edges", destination: "dropped", reason: "one model gives two sizes; other models are a non-goal (Q29)" },

  // evaluation/policy-lifecycle.generated.md (evaluate:policies)
  { source: "policy-lifecycle", item: "Purpose", destination: "narrative:purpose" },
  { source: "policy-lifecycle", item: "USD price note", destination: "block:provenance" },
  { source: "policy-lifecycle", item: "Policy model: Master, Creator, Participant Master, Holder", destination: "narrative:policies" },
  { source: "policy-lifecycle", item: "Choreography use case diagram", destination: "block:uml-guide" },
  { source: "policy-lifecycle", item: "Model: roles, nodes, tasks, sequence flows", destination: "block:phase:F1" },
  { source: "policy-lifecycle", item: "Model: the delta description and the paper-scenario constraints", destination: "block:phase:F5" },
  { source: "policy-lifecycle", item: "Model: initial and evolved tasks and sequence flows", destination: "block:phases-overview" },
  { source: "policy-lifecycle", item: "Role handover: license address", destination: "block:phase:F6" },
  { source: "policy-lifecycle", item: "Role handover: seller and buyer", destination: "block:phase:F6" },
  { source: "policy-lifecycle", item: "Role handover: rejected buyers", destination: "block:phase:F6" },
  { source: "policy-lifecycle", item: "Role handover: tasks played by the role, unchanged by the sale", destination: "block:phase:F6" },
  { source: "policy-lifecycle", item: "Role handover: messages declared on the license", destination: "block:phase:F6" },
  { source: "policy-lifecycle", item: "Role handover: explanation of the participant policies", destination: "narrative:F6" },
  { source: "policy-lifecycle", item: "Participant license use case diagram and role-license-sale sequence", destination: "block:uml-guide" },
  { source: "policy-lifecycle", item: "Role handover: case, outcome, gas table", destination: "block:phase:F6" },
  { source: "policy-lifecycle", item: "Role handover: the sale resets the Holder policy and clears the seller's data", destination: "block:phase:F6" },
  { source: "policy-lifecycle", item: "Choreography type and instances: model bytes, model deployment gas, instance mint gas, role assignment gas", destination: "block:phase:F1" },
  { source: "policy-lifecycle", item: "Deployment table: operation, outcome, gas, cost (wei), USD x3", destination: "block:phase:F1" },
  { source: "policy-lifecycle", item: "Instance operations table", destination: "block:phase:F2" },
  { source: "policy-lifecycle", item: "Policy operations table: Master, Creator, license, and Holder rows", destination: "block:phases-overview" },
  { source: "policy-lifecycle", item: "Policy operations: deploy the participant attribute manager and the paper-scenario Creator policy", destination: "block:phase:F1" },
  { source: "policy-lifecycle", item: "Policy operations: install the paper-scenario Creator policy (setCreatorSmartPolicy)", destination: "dropped", reason: "the Creator policy is never replaced: the instance is born with it (D17, open question)" },
  { source: "policy-lifecycle", item: "Policy operations: Creator allow/deny rows on setNodes", destination: "block:phase:F5" },
  { source: "policy-lifecycle", item: "Policy operations: license and role rows", destination: "block:phase:F3" },
  { source: "policy-lifecycle", item: "Policy operations: holder installs a restrictive policy, holder denies the update", destination: "block:phase:F7" },
  { source: "policy-lifecycle", item: "Allowed and denied policy-operation gas totals", destination: "block:phases-overview" },
  { source: "policy-lifecycle", item: "A denied operation still consumes gas: receipt status and cost", destination: "narrative:outcomes" },
  { source: "policy-lifecycle", item: "Reproduction", destination: "block:reproduction" },
  { source: "policy-lifecycle", item: "Gas values are local Hardhat measurements; report compiler, optimizer, gas price, network", destination: "block:provenance" },

  // evaluation/policy-tests.generated.md (test:policies)
  { source: "policy-tests", item: "cases, allowed and denied gas totals", destination: "block:tests" },
  { source: "policy-tests", item: "USD price note", destination: "block:provenance" },
  { source: "policy-tests", item: "case, outcome, gas, cost (wei), USD x3 table", destination: "block:tests" },
  { source: "policy-tests", item: "use case diagrams", destination: "block:uml-guide" },
  { source: "policy-tests", item: "coverage note (Master, Creator, licenses, Holder, Master replacement, transfer)", destination: "narrative:tests" },

  // evaluation/final-report.generated.md (evaluate:summary)
  { source: "final-report", item: "Reading guide: UML diagrams", destination: "block:uml-guide" },
  { source: "final-report", item: "Generated artifacts: model views and charts", destination: "block:artifacts" },
  { source: "final-report", item: "Generated artifacts: BPMN XML", destination: "block:artifacts" },
  { source: "final-report", item: "Generated artifacts: raw and normalized JSON of the contract export", destination: "block:phase:F4" },
  { source: "final-report", item: "Generated artifacts: contract-export manifest file", destination: "dropped", reason: "the manifest only holds the RPC URL and the asset address; the render reads the in-process network, and the address is in the phase blocks" },
  { source: "final-report", item: "link to the policy and test specification", destination: "narrative:tests" },
  { source: "final-report", item: "Generated artifacts: receipt metrics and CSV data", destination: "block:artifacts" },
  { source: "final-report", item: "Available evaluations", destination: "dropped", reason: "one experiment replaces the three evaluations; every part is always present" },
  { source: "final-report", item: "the embedded paper, lifecycle, and test reports", destination: "block:phases-overview" },

  // evaluation/README.md
  { source: "README", item: "Setup (dependencies, Chromium, gnuplot)", destination: "readme" },
  { source: "README", item: "Complete evaluation run", destination: "block:reproduction" },
  { source: "README", item: "USD price for gas scenarios", destination: "block:provenance" },
  { source: "README", item: "Targeted runs", destination: "readme" },
  { source: "README", item: "Cleanup", destination: "readme" },
  { source: "README", item: "Paper workflow details", destination: "narrative:phases" },
  { source: "README", item: "Policy lifecycle evaluation", destination: "narrative:phases" },
  { source: "README", item: "UML diagrams in the reports", destination: "block:uml-guide" },
  { source: "README", item: "Unified overview", destination: "readme" },
  { source: "README", item: "Delta versus a new instance benchmark", destination: "narrative:comparison" },
  { source: "README", item: "Manual gnuplot templates", destination: "block:charts" },
  { source: "README", item: "For publication: repeat, aggregate median/mean/stddev, report network, gas price, optimizer, Node, hardware", destination: "block:provenance" }
];
