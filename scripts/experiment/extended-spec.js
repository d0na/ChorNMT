// The specification of the extended evaluation (decision D28): four studies that add variety to
// the experiment of phases.js without touching it. Each study runs on its own ephemeral network
// (scripts/experiment/extended.js) and every transaction is checked against the outcome written
// here; the report is docs/extended-evaluation.md.
//
// - UPDATES: a series of different updates on one instance of the paper example, under the
//   paper-scenario Creator policy.
// - SCALE: synthetic models of growing size, under the default and under a constrained Creator
//   policy, up to the size limit of the model contract and beyond it through updates.
// - CONFLICTS: two organizations want different things on the same asset; who prevails, and why.
// - CONCURRENCY: transactions that meet in the same block.

const CREATOR_DENIED = "OperationDenied(CREATOR)";
const HOLDER_DENIED = "OperationDenied(HOLDER)";

// kind: what the update changes; expect and reason as in phases.js.
export const UPDATES = [
  { key: "U1.parallel-block", kind: "add a parallel block", description: "the delta of the experiment: a parallel split and join around the transport preparation, with one new task", expect: "allowed" },
  { key: "U2.message", kind: "change a message", description: "the initiating message of Transport Details", expect: "allowed" },
  { key: "U3.roles", kind: "reassign a task", description: "Prepare Transport Documentation is started by the Supplier instead of the Middleman", expect: "allowed" },
  { key: "U4.gateway-type", kind: "change a gateway pair", description: "the parallel split and join become an exclusive split and join, with a condition on each branch", expect: "allowed" },
  { key: "U5.insert-task", kind: "insert a task on a flow", description: "Optional Quality Inspection between Arrival Intermediate and Delivery of Product", expect: "allowed" },
  { key: "U6.detach-task", kind: "detach a task", description: "the flow goes again from Arrival Intermediate to Delivery of Product; Optional Quality Inspection stays in the model with no flow, since a node is never deleted", expect: "allowed" },
  { key: "U7.insert-after-detach", kind: "insert a task on a flow", description: "Optional Customs Inspection between Order Intermediate and FWD Oder Intermediate: the detached task still counts toward the task limit", expect: "denied", reason: CREATOR_DENIED }
];

// Synthetic models: a chain Start -> Task 001 -> ... -> Task n -> End over ROLES roles.
export const SCALE = {
  roles: 5,
  // Sizes minted from a model contract, in tasks; the run adds the largest size that fits.
  sizes: [5, 10, 15, 20, 25, 30],
  // Beyond the model contract: tasks appended to the largest instance, appendBatch per update.
  appendBatch: 10,
  growTo: 100,
  // Tasks changed by the multi-node update.
  batchUpdate: 5
};

// parties: the two organizations; prevails: the one whose will holds; rule: what decides.
export const CONFLICTS = [
  { key: "X1.holder-replaces-creator-policy", parties: ["Holder", "Creator"], from: "Holder", call: "ChoreographyMutableAsset.setCreatorSmartPolicy",
    intent: "the Holder replaces the paper-scenario Creator policy of its instance with the default one, to drop the constraints",
    expect: "denied", reason: CREATOR_DENIED, prevails: "Creator", rule: "the Creator policy lets only its administrator, the Master, replace it; the study does not exercise that replacement" },
  { key: "X2.master-updates-instance", parties: ["Master", "Holder"], from: "Master", call: "ChoreographyMutableAsset.setNodes",
    intent: "the Master, who deployed the type and administers the policies, changes a message in the Holder's instance",
    expect: "denied", reason: CREATOR_DENIED, prevails: "Holder", rule: "the Creator policy accepts model updates from the holder of the instance only" },
  { key: "X3.master-replaces-holder-policy", parties: ["Master", "Holder"], from: "Master", call: "ChoreographyMutableAsset.setHolderSmartPolicy",
    intent: "the Master replaces the Holder policy of the Holder's instance",
    expect: "denied", reason: "CallerNotHolder", prevails: "Holder", rule: "only the holder of the instance sets its Holder policy" },
  { key: "X4.participant-updates-instance", parties: ["Carrier A", "Holder"], from: "Carrier A", call: "ChoreographyMutableAsset.setNodes",
    intent: "Carrier A, whose license plays Special Carrier, changes a message of a task it takes part in",
    expect: "denied", reason: CREATOR_DENIED, prevails: "Holder", rule: "playing a role gives no right on the model" },
  { key: "X5.holder-updates-license", parties: ["Holder", "Carrier A"], from: "Holder", call: "ParticipantMutableAsset.setName",
    intent: "the Holder of the choreography renames the license that plays Special Carrier",
    expect: "denied", reason: CREATOR_DENIED, prevails: "Carrier A", rule: "the license Creator policy (certifier) accepts updates from the holder of the license only" },
  { key: "X6.authority-updates-license", parties: ["Transport authority", "Carrier A"], from: "Transport authority", call: "ParticipantMutableAsset.setName",
    intent: "the authority that issued and certifies the license renames it",
    expect: "denied", reason: CREATOR_DENIED, prevails: "Carrier A", rule: "the license Creator policy (certifier) lets only the holder of the license write it; the authority restricts which messages a license may declare, and it can replace the certifier, which the study does not exercise" },
  { key: "X7.sale-without-holder", parties: ["Carrier A", "Holder"], from: "Carrier A", call: "ParticipantNMT.transferFrom",
    intent: "Carrier A sells the license that plays Special Carrier to Carrier B; the Holder of the choreography takes no part",
    expect: "allowed", prevails: "Carrier A", rule: "the participant Master policy (a seller who holds the license, a buyer qualified for the type) and the license Creator policy decide a sale; the role follows the license, so Carrier B plays it, and the sale clears the Holder policy of the license" },
  { key: "X8.second-license", parties: ["Transport authority", "Holder"], from: "Transport authority", call: "ParticipantNMT.mint",
    intent: "the authority issues a second SpecialCarrier license, to Carrier A, which the Holder can choose",
    expect: "allowed", prevails: "Transport authority", rule: "an authority issues the licenses of its types" },
  { key: "X9.holder-relinks-role", parties: ["Holder", "Carrier B"], from: "Holder", call: "ChoreographyMutableAsset.setRoles",
    intent: "the Holder does not want Carrier B and links Special Carrier to the second license",
    expect: "allowed", prevails: "Holder", rule: "the Holder chooses who plays a role, among the licenses of the type the Creator policy requires" },
  { key: "X10.holder-links-other-type", parties: ["Holder", "Creator"], from: "Holder", call: "ChoreographyMutableAsset.setRoles",
    intent: "the Holder links Special Carrier to the Carrier license of Carrier C",
    expect: "denied", reason: CREATOR_DENIED, prevails: "Creator", rule: "the Creator policy requires a SpecialCarrier license for the role" }
];

// Each case is one block; its transactions are listed in the order the block executes them.
export const CONCURRENCY = [
  { key: "K1.two-organizations", description: "the Holder updates the model and Carrier A sells the license of a role, in the same block",
    finding: "independent: the two assets have different holders and policies, both transactions pass",
    transactions: [
      { label: "the Holder applies the delta of the experiment", from: "Holder", call: "ChoreographyMutableAsset.setNodes", expect: "allowed" },
      { label: "Carrier A sells the SpecialCarrier license to Carrier B", from: "Carrier A", call: "ParticipantNMT.transferFrom", expect: "allowed" }
    ] },
  { key: "K2.license-first", description: "the license holder acts first and the Holder second, in the same block: Carrier B installs the Holder policy the sale of K1 cleared",
    finding: "independent for this pair of transactions too",
    transactions: [
      { label: "Carrier B installs its Holder policy on the license", from: "Carrier B", call: "ParticipantMutableAsset.setHolderSmartPolicy", expect: "allowed" },
      { label: "the Holder changes a message of Arrival Intermediate", from: "Holder", call: "ChoreographyMutableAsset.setNodes", expect: "allowed" }
    ] },
  { key: "K3.lost-update", description: "two updates of the same task, each built on the state before the block: one changes the initiating message, the other the return message",
    finding: "the last write wins: an update carries the whole node, so the second one writes back the old initiating message; the asset has no version check",
    transactions: [
      { label: "the first update changes the initiating message of Transport Details", from: "Holder", call: "ChoreographyMutableAsset.setNodes", expect: "allowed" },
      { label: "the second update changes the return message of Transport Details", from: "Holder", call: "ChoreographyMutableAsset.setNodes", expect: "allowed" }
    ] },
  { key: "K4.limit-under-race", description: "two updates, each inserting one optional task, each within the task limit on the state before the block",
    finding: "the Creator policy evaluates each update on the state its transaction finds: the limit holds whatever the sender saw",
    transactions: [
      { label: "the first update inserts Optional Quality Inspection", from: "Holder", call: "ChoreographyMutableAsset.setNodes", expect: "allowed" },
      { label: "the second update inserts Optional Customs Inspection", from: "Holder", call: "ChoreographyMutableAsset.setNodes", expect: "denied", reason: CREATOR_DENIED }
    ] },
  { key: "K5.three-instances", description: "the delta of the experiment on three other instances of the type, in the same block",
    finding: "instances do not interfere: each update costs what it costs alone",
    transactions: [1, 2, 3].map((index) => ({ label: `the Holder applies the delta to instance ${index}`, from: "Holder", call: "ChoreographyMutableAsset.setNodes", expect: "allowed" })) },
  { key: "K6.freeze-in-block", description: "the Holder freezes the instance and updates it in the same block",
    finding: "the order in the block decides: after the deny-all Holder policy is installed, the update that follows it in the same block is refused",
    transactions: [
      { label: "the Holder installs the deny-all Holder policy", from: "Holder", call: "ChoreographyMutableAsset.setHolderSmartPolicy", expect: "allowed" },
      { label: "the Holder changes a message of Request Details", from: "Holder", call: "ChoreographyMutableAsset.setNodes", expect: "denied", reason: HOLDER_DENIED }
    ] }
];
