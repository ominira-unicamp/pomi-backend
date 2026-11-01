import type { Result } from "@pomi/api-core";

export type OperationEvent = {
    operation: string;
    outcome:
        | "completed"
        | "rejected"
        | "conflict"
        | "recovery-scheduled"
        | "recovery-pending";
    durationMs?: number;
    failureKind?: string;
    stage?: "activation" | "compensation";
};
export type OperationTelemetry = (event: OperationEvent) => void;

export async function observeOperation<Value, Failure extends { kind: string }>(
    operation: string,
    work: () => Promise<Result<Value, Failure>>,
    telemetry?: OperationTelemetry
): Promise<Result<Value, Failure>> {
    const startedAt = performance.now();
    const result = await work();
    telemetry?.({
        operation,
        outcome: result.isOk()
            ? "completed"
            : result.error.kind === "concurrent-change"
              ? "conflict"
              : "rejected",
        durationMs: Number((performance.now() - startedAt).toFixed(3)),
        ...(result.isErr() ? { failureKind: result.error.kind } : {})
    });
    return result;
}
