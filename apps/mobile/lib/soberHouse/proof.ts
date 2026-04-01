import type { ChoreCompletionRecord, ManagerConfirmationStatus, ProofRequirement } from "./types";

export type ChoreProofMode =
  | "NONE"
  | "CHECKLIST"
  | "PHOTO"
  | "MANAGER_CONFIRMATION"
  | "PHOTO_MANAGER_CONFIRMATION";

export type ChoreCompletionWorkflowStatus =
  | "not_started"
  | "proof_required"
  | "proof_attached"
  | "awaiting_manager_confirmation"
  | "completed";

export function hasConfiguredProofRequirement(proofRequirement: ProofRequirement[]): boolean {
  return proofRequirement.some((entry) => entry !== "NONE");
}

export function resolveChoreProofMode(proofRequirement: ProofRequirement[]): ChoreProofMode {
  const hasPhoto = proofRequirement.includes("PHOTO");
  const hasManagerConfirmation = proofRequirement.includes("MANAGER_CONFIRMATION");
  if (hasPhoto && hasManagerConfirmation) {
    return "PHOTO_MANAGER_CONFIRMATION";
  }
  if (hasPhoto) {
    return "PHOTO";
  }
  if (hasManagerConfirmation) {
    return "MANAGER_CONFIRMATION";
  }
  if (proofRequirement.includes("CHECKLIST")) {
    return "CHECKLIST";
  }
  return "NONE";
}

export function choreRequiresPhotoProof(proofRequirement: ProofRequirement[]): boolean {
  const mode = resolveChoreProofMode(proofRequirement);
  return mode === "PHOTO" || mode === "PHOTO_MANAGER_CONFIRMATION";
}

export function choreRequiresManagerConfirmation(proofRequirement: ProofRequirement[]): boolean {
  const mode = resolveChoreProofMode(proofRequirement);
  return mode === "MANAGER_CONFIRMATION" || mode === "PHOTO_MANAGER_CONFIRMATION";
}

export function resolveManagerConfirmationStatus(
  record: Pick<
    ChoreCompletionRecord,
    "proofRequirement" | "managerConfirmationRequired" | "managerConfirmationStatus"
  >,
): ManagerConfirmationStatus {
  const required =
    record.managerConfirmationRequired ?? choreRequiresManagerConfirmation(record.proofRequirement);
  if (!required) {
    return "NOT_REQUIRED";
  }
  return record.managerConfirmationStatus === "CONFIRMED" ? "CONFIRMED" : "PENDING";
}

export function isChoreProofSatisfied(
  record: Pick<ChoreCompletionRecord, "proofRequirement" | "proofProvided" | "proofReference">,
): boolean {
  if (!choreRequiresPhotoProof(record.proofRequirement)) {
    return true;
  }
  return record.proofProvided || Boolean(record.proofReference);
}

export function isChoreManagerConfirmationSatisfied(
  record: Pick<
    ChoreCompletionRecord,
    "proofRequirement" | "managerConfirmationRequired" | "managerConfirmationStatus"
  >,
): boolean {
  return resolveManagerConfirmationStatus(record) !== "PENDING";
}

export function isChoreCompletionVerified(record: ChoreCompletionRecord): boolean {
  return isChoreProofSatisfied(record) && isChoreManagerConfirmationSatisfied(record);
}

export function resolveChoreCompletionWorkflowStatus(
  record: ChoreCompletionRecord | null,
): ChoreCompletionWorkflowStatus {
  if (!record) {
    return "not_started";
  }
  const proofSatisfied = isChoreProofSatisfied(record);
  const managerRequired = choreRequiresManagerConfirmation(record.proofRequirement);
  const managerSatisfied = isChoreManagerConfirmationSatisfied(record);
  if (!proofSatisfied) {
    return "proof_required";
  }
  if (managerRequired && !managerSatisfied) {
    return choreRequiresPhotoProof(record.proofRequirement)
      ? "proof_attached"
      : "awaiting_manager_confirmation";
  }
  return "completed";
}

export function formatChoreProofModeLabel(proofRequirement: ProofRequirement[]): string | null {
  switch (resolveChoreProofMode(proofRequirement)) {
    case "PHOTO":
      return "Photo proof required";
    case "MANAGER_CONFIRMATION":
      return "Manager confirmation required";
    case "PHOTO_MANAGER_CONFIRMATION":
      return "Photo + manager confirmation required";
    case "CHECKLIST":
      return "Checklist completion required";
    case "NONE":
    default:
      return null;
  }
}
