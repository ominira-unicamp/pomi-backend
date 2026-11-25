import { err, ok } from "@pomi/api-core";
import type { GroupRuleIssue } from "../Group.errors.js";

export const eventTransitions = {
    publish: { from: ["DRAFT"], to: "PUBLISHED" },
    cancel: { from: ["PUBLISHED"], to: "CANCELLED" }
} as const;

type EventFacts = {
    status: string;
    name: string;
    description: string;
    startsAt: Date | null;
    endsAt: Date | null;
};
type EventPatch = {
    name?: string;
    description?: string;
    startsAt?: string | null;
    endsAt?: string | null;
};
export function validateEventDates(
    start: Date | string | null | undefined,
    end: Date | string | null | undefined
) {
    return start && end && new Date(end) < new Date(start)
        ? err<never, GroupRuleIssue>({
              code: "INVALID_EVENT_DATES",
              message: "Fim do evento anterior ao início."
          })
        : ok(undefined);
}
export function validateEventEditable(status: string) {
    return status === "CANCELLED"
        ? err<never, GroupRuleIssue>({
              code: "CANCELLED_EVENT",
              message: "Evento cancelado."
          })
        : ok(undefined);
}
export function validateEventTags(
    added: readonly number[],
    removed: readonly number[]
) {
    return added.some((id) => removed.includes(id))
        ? err<never, GroupRuleIssue>({
              code: "OPPOSING_TAG_OPERATIONS",
              message: "Tag repetida em operações opostas."
          })
        : ok(undefined);
}
export function planEventPatch(current: EventFacts, patch: EventPatch) {
    const start =
        patch.startsAt === undefined
            ? current.startsAt
            : patch.startsAt && new Date(patch.startsAt);
    const end =
        patch.endsAt === undefined
            ? current.endsAt
            : patch.endsAt && new Date(patch.endsAt);
    const dates = validateEventDates(start, end);
    if (dates.isErr()) return dates;
    if (
        current.status === "PUBLISHED" &&
        (!start ||
            !(patch.name ?? current.name).trim() ||
            !(patch.description ?? current.description).trim())
    ) {
        return err<never, GroupRuleIssue>({
            code: "INVALID_PUBLISHED_EVENT",
            message: "Evento publicado exige nome, descrição e início."
        });
    }
    return ok({
        name: patch.name ?? current.name,
        description: patch.description ?? current.description,
        startsAt: start,
        endsAt: end
    });
}
export function validateEventPublication(current: EventFacts) {
    if (
        !eventTransitions.publish.from.some(
            (status) => status === current.status
        ) ||
        !current.name.trim() ||
        !current.description.trim() ||
        !current.startsAt
    )
        return err<never, GroupRuleIssue>({
            code: "EVENT_NOT_READY",
            message: "Evento não está pronto para publicação."
        });
    return validateEventDates(current.startsAt, current.endsAt);
}
export function validateEventCancellation(status: string) {
    return !eventTransitions.cancel.from.some((from) => from === status)
        ? err<never, GroupRuleIssue>({
              code: "EVENT_NOT_PUBLISHED",
              message: "Somente evento publicado pode ser cancelado."
          })
        : ok(undefined);
}
