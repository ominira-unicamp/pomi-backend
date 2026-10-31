import { err, ok } from "@pomi/api-core";
import type { GroupRuleIssue } from "../GroupRuleErrors.js";

export type InvitationStatus =
    | "PENDING"
    | "ACCEPTED"
    | "DECLINED"
    | "CANCELLED"
    | "EXPIRED";
export function invitationStatus(
    status: InvitationStatus,
    expiresAt: Date,
    now: Date
): InvitationStatus {
    return status === "PENDING" && expiresAt <= now ? "EXPIRED" : status;
}
export function validateInvitationAcceptance(
    status: InvitationStatus,
    expiresAt: Date,
    now: Date
) {
    return status !== "PENDING" || expiresAt <= now
        ? err<never, GroupRuleIssue>({
              code: "INVALID_INVITATION",
              message: "Convite não está válido."
          })
        : ok(undefined);
}
