import { policies, StudentCapabilities } from "#/Authorization.js";
import { type IO, OutputBuilder } from "#/Contract.js";
import { InvalidStudentHistoryImportProblem } from "#/modules/planning/student-history-import/StudentHistoryImport.problems.js";
import { extendZodWithOpenApi } from "@asteasolutions/zod-to-openapi";
import {
    pathParam,
    pathSeg,
    ResourceNotFoundProblemSchema,
    SpecBuilder
} from "@pomi/api-core";
import z from "zod";
import { body, summary } from "./StudentHistoryImport.schemas.js";

extendZodWithOpenApi(z);

const specsBuilder = new SpecBuilder(
    [
        pathSeg.literal("student"),
        pathSeg.param("sid"),
        pathSeg.literal("course-history")
    ],
    ["student-course-history"],
    "import",
    {
        resource: "studentHistory",
        operationName: "StudentHistory",
        pathParameters: { sid: "studentId" }
    }
);

const importHistory = {
    meta: {
        ...specsBuilder.create(),
        authorization: policies.studentAccess(
            "sid",
            StudentCapabilities.HISTORY_WRITE
        )
    },
    request: z.object({
        path: z.object({
            sid: pathParam.integer()
        }),
        body
    }),
    response: new OutputBuilder()
        .ok(summary, "Student history imported successfully")
        .problem(404, ResourceNotFoundProblemSchema, "Aluno não encontrado")
        .problem(
            422,
            InvalidStudentHistoryImportProblem.schema,
            "Histórico escolar inválido"
        )
        .build()
} satisfies IO;

export default { importHistory, body, summary };
