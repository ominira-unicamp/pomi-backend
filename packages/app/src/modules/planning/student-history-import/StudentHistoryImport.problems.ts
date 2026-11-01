import {
    ResourceNotFoundProblem,
    defineProblem,
    problemResponse,
    type ProblemField,
    type ProblemResponseMap
} from "@pomi/api-core";
import z from "zod";
import type { ImportStudentHistoryFailure } from "./ImportStudentHistory.use-case.js";

export const InvalidStudentHistoryImportProblem = defineProblem({
    schemaName: "InvalidStudentHistoryImportProblem",
    typeName: "invalid-student-history-import",
    title: "Importação de histórico escolar inválida",
    status: 422,
    extensions: {
        fields: z.array(
            z
                .object({
                    code: z.string(),
                    path: z.array(z.string()),
                    message: z.string()
                })
                .strict()
        )
    }
});

export function studentHistoryStudentNotFoundProblem() {
    return ResourceNotFoundProblem.create({
        detail: "O aluno solicitado não foi encontrado."
    });
}

export function invalidStudentHistoryImportProblem(fields: ProblemField[]) {
    return InvalidStudentHistoryImportProblem.create({
        detail: "O histórico escolar não pôde ser associado ao aluno.",
        fields
    });
}

export type StudentHistoryImportProblem =
    | ReturnType<typeof studentHistoryStudentNotFoundProblem>
    | ReturnType<typeof invalidStudentHistoryImportProblem>;

export const studentHistoryImportProblemResponses = {
    [ResourceNotFoundProblem.type]: problemResponse(ResourceNotFoundProblem),
    [InvalidStudentHistoryImportProblem.type]: problemResponse(
        InvalidStudentHistoryImportProblem
    )
} satisfies ProblemResponseMap<StudentHistoryImportProblem, object>;

export function toStudentHistoryImportProblem(
    failure: ImportStudentHistoryFailure
): StudentHistoryImportProblem {
    if (failure.kind === "student-not-found")
        return studentHistoryStudentNotFoundProblem();
    return invalidStudentHistoryImportProblem([
        {
            code: "INVALID_VALUE",
            path: ["student", "ra"],
            message: "O RA do documento não corresponde ao aluno autenticado."
        }
    ]);
}
