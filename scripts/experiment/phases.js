// The experiment specification (decision D17): the single source of the phases, their order, the
// transactions each one sends, and the outcome each transaction must have. The run executes it and
// fails when a transaction is missing, out of order, sent by another account, or has another outcome.
//
// Accounts are the default Hardhat ones. The choreography policies hardcode accounts 0-1, the
// participant policies accounts 5-9; the role accounts are 10-13.
export const ACCOUNTS = [
  { index: 0, name: "Administrator", plays: "Master administrator, authorized creator, holder of the instances" },
  { index: 1, name: "Partner", plays: "eligible holder" },
  { index: 2, name: "Unauthorized creator", plays: "an account the Master policy does not authorize to mint" },
  { index: 3, name: "Ineligible holder", plays: "an account the Master policy does not accept as holder" },
  { index: 5, name: "Carrier A", plays: "organization qualified for SpecialCarrier, first holder of its license" },
  { index: 6, name: "Carrier B", plays: "organization qualified for SpecialCarrier, buyer of the license" },
  { index: 7, name: "Carrier C", plays: "organization qualified only for Carrier" },
  { index: 8, name: "Supplier company", plays: "organization qualified only for Supplier" },
  { index: 9, name: "Authority", plays: "issuer of the license types and certifier of the licenses" },
  { index: 10, name: "Bulk Buyer account", plays: "the Bulk Buyer role" },
  { index: 11, name: "Manufacturer account", plays: "the Manufacturer role" },
  { index: 12, name: "Middleman account", plays: "the Middleman role" },
  { index: 13, name: "Supplier account", plays: "the Supplier role" }
];

// Every file the run reads; the trust tables map each transaction to the row that decides it.
export const INPUTS = {
  bpmn: "references/paper-example.bpmn",
  delta: "scripts/data/paper-example-parallel-transport-preparation.delta.json",
  trustTables: "docs/choreography-policies.md"
};

// The role played by a participant license instead of an account, and the account of every other
// role. No policy names these accounts, so each one plays only its role.
export const LICENSED_ROLE = "Special Carrier";
export const ROLE_ACCOUNTS = {
  "Bulk Buyer": "Bulk Buyer account",
  Manufacturer: "Manufacturer account",
  Middleman: "Middleman account",
  Supplier: "Supplier account"
};

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
      deploy("F1.deploy.master", "deploy the Master policy", "Administrator", "MasterSmartPolicy"),
      deploy("F1.deploy.creator", "deploy the default Creator policy", "Administrator", "CreatorSmartPolicy"),
      deploy("F1.deploy.holder", "deploy the Holder policy", "Administrator", "HolderSmartPolicy"),
      deploy("F1.deploy.renderer", "deploy the tokenURI renderer", "Administrator", "ChoreographyTokenURIRenderer"),
      deploy("F1.deploy.model", "deploy the paper-example model (SSTORE2)", "Administrator", "ChoreographyModel"),
      deploy("F1.deploy.nmt", "deploy the choreography type", "Administrator", "ChoreographyNMT"),
      deploy("F1.deploy.participant-master", "deploy the participant Master policy", "Administrator", "ParticipantMasterSmartPolicy"),
      deploy("F1.deploy.participant-renderer", "deploy the license tokenURI renderer", "Administrator", "ParticipantTokenURIRenderer"),
      deploy("F1.deploy.participant-nmt", "deploy the license NMT", "Administrator", "ParticipantNMT"),
      deploy("F1.deploy.certifier", "the Authority deploys the license Creator policy (certifier)", "Authority", "ParticipantCreatorSmartPolicy"),
      deploy("F1.deploy.participant-holder", "deploy the license Holder policy", "Administrator", "ParticipantHolderSmartPolicy"),
      deploy("F1.deploy.participant-am", "deploy the participant attribute manager", "Administrator", "ChoreographyParticipantAM"),
      deploy("F1.deploy.paper-creator", "deploy the paper-scenario Creator policy", "Administrator", "CreatorSmartPolicyPaperScenario")
    ]
  },
  {
    id: "F2",
    title: "Mint the instance and assign the role accounts",
    inputs: [],
    transactions: [
      tx("F2.mint", "mint the instance, born with the model and the paper-scenario Creator policy", "Administrator", "ChoreographyNMT.mint", "allowed", "choreography:mint"),
      tx("F2.roles", `assign an account to every role except ${LICENSED_ROLE}`, "Administrator", "ChoreographyMutableAsset.setRoles", "allowed", "choreography:setRoles"),
      tx("F2.denied.unauthorized-creator", "the Master policy denies a mint by an unauthorized creator", "Unauthorized creator", "ChoreographyNMT.mint", "denied", "choreography:mint", "MasterDenied"),
      tx("F2.denied.ineligible-holder", "the Master policy denies a mint to an ineligible holder", "Administrator", "ChoreographyNMT.mint", "denied", "choreography:mint", "MasterDenied")
    ]
  },
  {
    id: "F3",
    title: `Issue the participant licenses and link the ${LICENSED_ROLE} role`,
    inputs: [],
    transactions: [
      tx("F3.license.special-carrier", "the Authority issues a SpecialCarrier license to Carrier A", "Authority", "ParticipantNMT.mintWithParticipantType", "allowed", "licenses:mintWithParticipantType"),
      tx("F3.license.carrier", "the Authority issues a Carrier license to Carrier C", "Authority", "ParticipantNMT.mintWithParticipantType", "allowed", "licenses:mintWithParticipantType"),
      tx("F3.license.supplier", "the Authority issues a Supplier license to the Supplier company", "Authority", "ParticipantNMT.mintWithParticipantType", "allowed", "licenses:mintWithParticipantType"),
      tx("F3.denied.plain-account", `the Creator policy denies linking ${LICENSED_ROLE} to a plain account`, "Administrator", "ChoreographyMutableAsset.setRoles", "denied", "choreography:setRoles", CREATOR_DENIED),
      tx("F3.denied.carrier-license", `the Creator policy denies linking ${LICENSED_ROLE} to a Carrier license`, "Administrator", "ChoreographyMutableAsset.setRoles", "denied", "choreography:setRoles", CREATOR_DENIED),
      tx("F3.denied.supplier-license", `the Creator policy denies linking ${LICENSED_ROLE} to a Supplier license`, "Administrator", "ChoreographyMutableAsset.setRoles", "denied", "choreography:setRoles", CREATOR_DENIED),
      tx("F3.link", `link ${LICENSED_ROLE} to the SpecialCarrier license held by Carrier A`, "Administrator", "ChoreographyMutableAsset.setRoles", "allowed", "choreography:setRoles"),
      tx("F3.denied.new-role", "the Creator policy denies a new Backup Carrier role", "Administrator", "ChoreographyMutableAsset.setRoles", "denied", "choreography:setRoles", CREATOR_DENIED),
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
    title: "Apply the delta: one allowed update and five denied ones",
    inputs: ["delta"],
    transactions: [
      tx("F5.delta", "apply the parallel transport preparation delta", "Administrator", "ChoreographyMutableAsset.setNodes", "allowed", "choreography:setNodes"),
      tx("F5.denied.task-limit", "the Creator policy denies an update above the task limit", "Administrator", "ChoreographyMutableAsset.setNodes", "denied", "choreography:setNodes", CREATOR_DENIED),
      tx("F5.denied.flow-limit", "the Creator policy denies an update above the sequence-flow limit", "Administrator", "ChoreographyMutableAsset.setNodes", "denied", "choreography:setNodes", CREATOR_DENIED),
      tx("F5.denied.task-name", "the Creator policy denies a task name outside the allowlist", "Administrator", "ChoreographyMutableAsset.setNodes", "denied", "choreography:setNodes", CREATOR_DENIED),
      tx("F5.denied.unknown-target", "the Creator policy denies a flow to an unknown node", "Administrator", "ChoreographyMutableAsset.setNodes", "denied", "choreography:setNodes", CREATOR_DENIED),
      tx("F5.denied.protected-node", "the Creator policy denies a change to the protected Order task", "Administrator", "ChoreographyMutableAsset.setNodes", "denied", "choreography:setNodes", CREATOR_DENIED)
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
    title: "Restrict a second instance through its Holder policy",
    inputs: ["delta"],
    transactions: [
      deploy("F7.deploy.deny-all", "deploy the deny-all policy", "Administrator", "DenyAllSmartPolicy"),
      tx("F7.mint", "mint a second instance with the default policies", "Administrator", "ChoreographyNMT.mint", "allowed", "choreography:mint"),
      tx("F7.holder.deny-all", "the holder installs the deny-all policy", "Administrator", "ChoreographyMutableAsset.setHolderSmartPolicy", "allowed", "choreography:setHolderSmartPolicy"),
      tx("F7.denied.delta", "the Holder policy denies the delta", "Administrator", "ChoreographyMutableAsset.setNodes", "denied", "choreography:setNodes", HOLDER_DENIED)
    ]
  },
  {
    id: "F8",
    title: "Render the final model and compare the delta with a new instance",
    inputs: [],
    render: "final",
    transactions: [
      tx("F8.new-instance.mint", "mint a new instance, born with the whole model", "Administrator", "ChoreographyNMT.mint", "allowed", "choreography:mint"),
      tx("F8.new-instance.roles", `assign its role accounts except ${LICENSED_ROLE}`, "Administrator", "ChoreographyMutableAsset.setRoles", "allowed", "choreography:setRoles"),
      tx("F8.new-instance.link", `link its ${LICENSED_ROLE} role to the SpecialCarrier license`, "Administrator", "ChoreographyMutableAsset.setRoles", "allowed", "choreography:setRoles")
    ]
  }
];
