// The experiment specification (decision D17): the single source of the phases, their order, the
// transactions each one sends, and the outcome each transaction must have. The run executes it and
// fails when a transaction is missing, out of order, sent by another account, or has another outcome.
//
// Accounts are the default Hardhat ones. The choreography Master policy hardcodes accounts 0
// (administrator), 1 (eligible holder), and 4 (authorized creator); the participant Master policy
// hardcodes the organizations (5-8, 14-16) and the license authorities (9-13).
export const ACCOUNTS = [
  { index: 0, name: "Master", plays: "administrator of the Master policy, deploys the choreography type; not an authorized creator" },
  { index: 1, name: "Holder", plays: "eligible holder: holds and edits the instances" },
  { index: 2, name: "Outsider", plays: "an account no choreography policy names" },
  { index: 3, name: "Ineligible holder", plays: "an account the Master policy does not accept as holder" },
  { index: 4, name: "Authorized creator", plays: "the account the Master policy authorizes to mint an instance" },
  { index: 5, name: "Carrier A", plays: "organization qualified for SpecialCarrier, first holder of its license" },
  { index: 6, name: "Carrier B", plays: "organization qualified for SpecialCarrier, buyer of the license" },
  { index: 7, name: "Carrier C", plays: "organization qualified only for Carrier" },
  { index: 8, name: "Supplier company", plays: "organization qualified only for Supplier" },
  { index: 9, name: "Transport authority", plays: "issuer and certifier of the SpecialCarrier and Carrier licenses" },
  { index: 10, name: "Bulk Buyer authority", plays: "issuer and certifier of the BulkBuyer licenses" },
  { index: 11, name: "Manufacturer authority", plays: "issuer and certifier of the Manufacturer licenses" },
  { index: 12, name: "Middleman authority", plays: "issuer and certifier of the Middleman licenses" },
  { index: 13, name: "Supplier authority", plays: "issuer and certifier of the Supplier licenses" },
  { index: 14, name: "Bulk Buyer company", plays: "organization qualified only for BulkBuyer" },
  { index: 15, name: "Manufacturer company", plays: "organization qualified only for Manufacturer" },
  { index: 16, name: "Middleman company", plays: "organization qualified only for Middleman" }
];

// Every file the run reads; the trust tables map each transaction to the row that decides it.
export const INPUTS = {
  bpmn: "references/paper-example.bpmn",
  delta: "scripts/data/paper-example-parallel-transport-preparation.delta.json",
  trustTables: "docs/choreography-policies.md"
};

// Every role is played by a participant license: the license type the role requires, the
// authority that issues and certifies that type, and the organization that receives the license.
// LICENSED_ROLE is the role whose license is sold in F6.
export const LICENSED_ROLE = "Special Carrier";
export const ROLE_LICENSES = {
  "Bulk Buyer": { type: "BulkBuyer", slug: "bulk-buyer", authority: "Bulk Buyer authority", holder: "Bulk Buyer company" },
  Manufacturer: { type: "Manufacturer", slug: "manufacturer", authority: "Manufacturer authority", holder: "Manufacturer company" },
  Middleman: { type: "Middleman", slug: "middleman", authority: "Middleman authority", holder: "Middleman company" },
  Supplier: { type: "Supplier", slug: "supplier", authority: "Supplier authority", holder: "Supplier company" },
  "Special Carrier": { type: "SpecialCarrier", slug: "special-carrier", authority: "Transport authority", holder: "Carrier A" }
};
// A license type no role requires: a Carrier license is the wrong type for the Special Carrier role.
export const EXTRA_LICENSE = { type: "Carrier", slug: "carrier", authority: "Transport authority", holder: "Carrier C" };
// The order in which the run deploys the license NMTs and issues the licenses.
export const LICENSES = [ROLE_LICENSES["Special Carrier"], EXTRA_LICENSE, ROLE_LICENSES.Supplier, ROLE_LICENSES["Bulk Buyer"], ROLE_LICENSES.Manufacturer, ROLE_LICENSES.Middleman];
// One certifier per authority, in the order of deployment.
export const CERTIFIERS = [
  { slug: "transport", authority: "Transport authority" },
  { slug: "supplier", authority: "Supplier authority" },
  { slug: "bulk-buyer", authority: "Bulk Buyer authority" },
  { slug: "manufacturer", authority: "Manufacturer authority" },
  { slug: "middleman", authority: "Middleman authority" }
];

const CREATOR_DENIED = "OperationDenied(CREATOR)";
const HOLDER_DENIED = "OperationDenied(HOLDER)";

// trust: the row of a table in docs/choreography-policies.md that grants or denies the action,
// as "<table>:<function>" ("choreography" is "Who can do what", "licenses" is "Role licenses").
const deploy = (key, label, from, contract) =>
  ({ key, label, from, call: `${contract}.constructor`, expect: "allowed", reason: null, trust: null });
const tx = (key, label, from, call, expect, trust, reason = null) =>
  ({ key, label, from, call, expect, reason, trust });

export const PHASES = [
  {
    id: "F1",
    title: "Deploy the choreography type and the license infrastructure",
    inputs: ["bpmn"],
    transactions: [
      deploy("F1.deploy.master", "deploy the Master policy", "Master", "MasterSmartPolicy"),
      deploy("F1.deploy.creator", "deploy the default Creator policy", "Master", "CreatorSmartPolicy"),
      deploy("F1.deploy.holder", "deploy the Holder policy", "Master", "HolderSmartPolicy"),
      deploy("F1.deploy.renderer", "deploy the tokenURI renderer", "Master", "ChoreographyTokenURIRenderer"),
      deploy("F1.deploy.model", "deploy the paper-example model (SSTORE2)", "Master", "ChoreographyModel"),
      deploy("F1.deploy.nmt", "deploy the choreography type", "Master", "ChoreographyNMT"),
      deploy("F1.deploy.participant-master", "deploy the participant Master policy", "Master", "ParticipantMasterSmartPolicy"),
      deploy("F1.deploy.participant-renderer", "deploy the license tokenURI renderer", "Master", "ParticipantTokenURIRenderer"),
      deploy("F1.deploy.participant-holder", "deploy the license Holder policy", "Master", "ParticipantHolderSmartPolicy"),
      ...LICENSES.map((license) => deploy(`F1.deploy.${license.slug}-nmt`, `the ${license.authority} deploys the ${license.type} license NMT`, license.authority, "ParticipantNMT")),
      ...CERTIFIERS.map((certifier) => deploy(`F1.deploy.${certifier.slug}-certifier`, `the ${certifier.authority} deploys its license Creator policy (certifier)`, certifier.authority, "ParticipantCreatorSmartPolicy")),
      ...Object.values(ROLE_LICENSES).map((license) => deploy(`F1.deploy.${license.slug}-am`, `deploy the attribute manager of the ${license.type} licenses`, "Master", "ChoreographyParticipantAM")),
      deploy("F1.deploy.paper-creator", "deploy the paper-scenario Creator policy", "Master", "CreatorSmartPolicyPaperScenario")
    ]
  },
  {
    id: "F2",
    title: "Mint the instance for its holder",
    inputs: [],
    transactions: [
      tx("F2.mint", "the authorized creator mints the instance for the Holder, born with the model and the paper-scenario Creator policy", "Authorized creator", "ChoreographyNMT.mint", "allowed", "choreography:mint"),
      tx("F2.denied.master", "the Master policy denies a mint by its own administrator", "Master", "ChoreographyNMT.mint", "denied", "choreography:mint", "MasterDenied"),
      tx("F2.denied.unauthorized-creator", "the Master policy denies a mint by an account it does not authorize", "Outsider", "ChoreographyNMT.mint", "denied", "choreography:mint", "MasterDenied"),
      tx("F2.denied.ineligible-holder", "the Master policy denies a mint to an ineligible holder", "Authorized creator", "ChoreographyNMT.mint", "denied", "choreography:mint", "MasterDenied")
    ]
  },
  {
    id: "F3",
    title: "Issue the participant licenses and link every role to its license",
    inputs: [],
    transactions: [
      ...LICENSES.map((license) => tx(`F3.license.${license.slug}`, `the ${license.authority} issues a ${license.type} license to ${license.holder.startsWith("Carrier") ? "" : "the "}${license.holder}`, license.authority, "ParticipantNMT.mint", "allowed", "licenses:mint")),
      tx("F3.denied.foreign-authority", "the participant Master policy denies the Supplier authority issuing a SpecialCarrier license", "Supplier authority", "ParticipantNMT.mint", "denied", "licenses:mint", "MasterDenied"),
      tx("F3.denied.plain-account", `the Creator policy denies linking ${LICENSED_ROLE} to a plain account`, "Holder", "ChoreographyMutableAsset.setRoles", "denied", "choreography:setRoles", CREATOR_DENIED),
      tx("F3.denied.carrier-license", `the Creator policy denies linking ${LICENSED_ROLE} to a Carrier license`, "Holder", "ChoreographyMutableAsset.setRoles", "denied", "choreography:setRoles", CREATOR_DENIED),
      tx("F3.denied.supplier-license", `the Creator policy denies linking ${LICENSED_ROLE} to a Supplier license`, "Holder", "ChoreographyMutableAsset.setRoles", "denied", "choreography:setRoles", CREATOR_DENIED),
      tx("F3.link", "the Holder links every role to the license of the type it requires", "Holder", "ChoreographyMutableAsset.setRoles", "allowed", "choreography:setRoles"),
      tx("F3.denied.new-role", "the Creator policy denies a new Backup Carrier role", "Holder", "ChoreographyMutableAsset.setRoles", "denied", "choreography:setRoles", CREATOR_DENIED),
      tx("F3.license.name", "Carrier A updates the name on its license", "Carrier A", "ParticipantMutableAsset.setName", "allowed", "licenses:setName"),
      tx("F3.license.messages", `Carrier A declares the ${LICENSED_ROLE} messages on its license`, "Carrier A", "ParticipantMutableAsset.setMessages", "allowed", "licenses:setMessages"),
      tx("F3.denied.foreign-message", "the certifier denies a message of another role", "Carrier A", "ParticipantMutableAsset.setMessages", "denied", "licenses:setMessages", CREATOR_DENIED)
    ]
  },
  {
    id: "F4",
    title: "Render the baseline model from the chain",
    inputs: [],
    render: "baseline",
    transactions: []
  },
  {
    id: "F5",
    title: "Apply the delta: one allowed update and seven denied ones",
    inputs: ["delta"],
    transactions: [
      tx("F5.delta", "the Holder applies the parallel transport preparation delta", "Holder", "ChoreographyMutableAsset.setNodes", "allowed", "choreography:setNodes"),
      tx("F5.denied.task-limit", "the Creator policy denies an update above the task limit", "Holder", "ChoreographyMutableAsset.setNodes", "denied", "choreography:setNodes", CREATOR_DENIED),
      tx("F5.denied.flow-limit", "the Creator policy denies an update above the sequence-flow limit", "Holder", "ChoreographyMutableAsset.setNodes", "denied", "choreography:setNodes", CREATOR_DENIED),
      tx("F5.denied.task-name", "the Creator policy denies a task name outside the allowlist", "Holder", "ChoreographyMutableAsset.setNodes", "denied", "choreography:setNodes", CREATOR_DENIED),
      tx("F5.denied.unknown-target", "the Creator policy denies a flow to an unknown node", "Holder", "ChoreographyMutableAsset.setNodes", "denied", "choreography:setNodes", CREATOR_DENIED),
      tx("F5.denied.protected-node", "the Creator policy denies a change to the protected Order task", "Holder", "ChoreographyMutableAsset.setNodes", "denied", "choreography:setNodes", CREATOR_DENIED),
      tx("F5.denied.outsider", "an account that does not hold the instance cannot update it", "Outsider", "ChoreographyMutableAsset.setNodes", "denied", "choreography:setNodes", CREATOR_DENIED),
      tx("F5.denied.creator", "the authorized creator cannot update the instance it minted for the Holder", "Authorized creator", "ChoreographyMutableAsset.setNodes", "denied", "choreography:setNodes", CREATOR_DENIED)
    ]
  },
  {
    id: "F6",
    title: `Sell the ${LICENSED_ROLE} role: Carrier A to Carrier B`,
    inputs: [],
    transactions: [
      tx("F6.denied.carrier-buyer", "the participant Master policy denies selling to Carrier C, not qualified for SpecialCarrier", "Carrier A", "ParticipantNMT.transferFrom", "denied", "licenses:transferFrom", "MasterDenied"),
      tx("F6.denied.supplier-buyer", "the participant Master policy denies selling to the Supplier company", "Carrier A", "ParticipantNMT.transferFrom", "denied", "licenses:transferFrom", "MasterDenied"),
      tx("F6.denied.without-seller", "the participant Master policy denies Carrier B taking the license without the seller", "Carrier B", "ParticipantNMT.transferFrom", "denied", "licenses:transferFrom", "MasterDenied"),
      tx("F6.sale", "Carrier A sells the SpecialCarrier license to Carrier B", "Carrier A", "ParticipantNMT.transferFrom", "allowed", "licenses:transferFrom"),
      tx("F6.denied.buyer-without-policy", "Carrier B cannot update the license before installing a Holder policy", "Carrier B", "ParticipantMutableAsset.setName", "denied", "licenses:setName", "HolderPolicyDisabled"),
      tx("F6.buyer.holder-policy", "Carrier B installs its Holder policy on the license", "Carrier B", "ParticipantMutableAsset.setHolderSmartPolicy", "allowed", "licenses:setHolderSmartPolicy"),
      tx("F6.denied.former-holder", "Carrier A can no longer update the license", "Carrier A", "ParticipantMutableAsset.setName", "denied", "licenses:setName", CREATOR_DENIED),
      tx("F6.buyer.name", "Carrier B updates the name on the license", "Carrier B", "ParticipantMutableAsset.setName", "allowed", "licenses:setName"),
      tx("F6.buyer.profile", "Carrier B links its organization profile", "Carrier B", "ParticipantMutableAsset.setProfile", "allowed", "licenses:setProfile"),
      tx("F6.buyer.messages", `Carrier B confirms the ${LICENSED_ROLE} messages`, "Carrier B", "ParticipantMutableAsset.setMessages", "allowed", "licenses:setMessages")
    ]
  },
  {
    id: "F7",
    title: "Freeze the instance through its Holder policy",
    inputs: ["delta"],
    transactions: [
      deploy("F7.deploy.deny-all", "the Holder deploys the deny-all policy", "Holder", "DenyAllSmartPolicy"),
      tx("F7.holder.deny-all", "the Holder installs the deny-all policy on the instance", "Holder", "ChoreographyMutableAsset.setHolderSmartPolicy", "allowed", "choreography:setHolderSmartPolicy"),
      tx("F7.denied.delta", "the Holder policy denies a further update of the frozen instance", "Holder", "ChoreographyMutableAsset.setNodes", "denied", "choreography:setNodes", HOLDER_DENIED)
    ]
  },
  {
    id: "F8",
    title: "Render the final model from the chain",
    inputs: [],
    render: "final",
    transactions: []
  }
];
