import {
    observeOperation,
    type OperationTelemetry
} from "#/application/OperationTelemetry.js";
import type { DatabaseClient } from "@pomi/db";
import { importStudentHistory } from "./ImportStudentHistory.use-case.js";
import type { ImportStudentHistoryInput } from "./StudentHistoryImport.schemas.js";

export function createStudentHistoryImportService({
    prisma,
    operationTelemetry
}: {
    prisma: DatabaseClient;
    operationTelemetry?: OperationTelemetry;
}) {
    return {
        import(studentId: number, input: ImportStudentHistoryInput) {
            return observeOperation(
                "planning.history.import",
                () => importStudentHistory({ prisma }, { studentId, input }),
                operationTelemetry
            );
        }
    };
}
export type StudentHistoryImportService = ReturnType<
    typeof createStudentHistoryImportService
>;
