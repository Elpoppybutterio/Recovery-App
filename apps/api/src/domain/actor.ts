import { Role } from "@recovery/shared-types";

export interface ActorContext {
  userId: string;
  tenantId: string;
  roles: Role[];
}
