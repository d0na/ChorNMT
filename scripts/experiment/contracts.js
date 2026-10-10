// The contracts of the experiment: the name the evidence uses -> the artifact with its ABI.
// Shared by the run and by the sequence diagram generator.
import { Interface } from "ethers";
import { readArtifact } from "../deploy-local.js";

// Contract name in the evidence -> artifact, for ABIs and bytecode.
export const ARTIFACTS = {
  MasterSmartPolicy: "MasterSmartPolicy",
  CreatorSmartPolicy: "CreatorSmartPolicy",
  HolderSmartPolicy: "HolderSmartPolicy",
  ChoreographyTokenURIRenderer: "ChoreographyTokenURIRenderer",
  ChoreographyNMT: "ChoreographyNMT",
  ChoreographyMutableAsset: "ChoreographyMutableAsset",
  ChoreographyParticipantAM: "ChoreographyParticipantAM",
  CreatorSmartPolicyPaperScenario: "CreatorSmartPolicyPaperScenario",
  DenyAllSmartPolicy: "DenyAllSmartPolicy",
  ParticipantMasterSmartPolicy: "participant/ParticipantMasterSmartPolicy",
  ParticipantTokenURIRenderer: "participant/ParticipantTokenURIRenderer",
  ParticipantNMT: "participant/ParticipantNMT",
  ParticipantCreatorSmartPolicy: "participant/CreatorSmartPolicy",
  ParticipantHolderSmartPolicy: "participant/HolderSmartPolicy",
  ParticipantMutableAsset: "participant/ParticipantMutableAsset"
};

export async function loadArtifacts() {
  const artifacts = {};
  for (const [name, file] of Object.entries(ARTIFACTS)) {
    const artifact = await readArtifact(file);
    artifacts[name] = { ...artifact, file, iface: new Interface(artifact.abi) };
  }
  return artifacts;
}
