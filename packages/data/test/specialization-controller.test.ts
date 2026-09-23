import assert from "node:assert/strict";
import { before, test } from "node:test";

process.env.DISABLED_AUTH = "true";

type ControllerModule =
    typeof import("#/modules/catalog/specialization/Specialization.controller.js");

let controller: ControllerModule;

before(async () => {
    controller =
        await import("#/modules/catalog/specialization/Specialization.controller.js");
});

test("lists specializations through its service", async () => {
    const result = await controller.listFn(
        {
            specializationService: {
                list: async () => [
                    {
                        id: 11,
                        programId: 7,
                        programCode: 34,
                        programName: "Engenharia de Computação",
                        code: "AA",
                        name: "Sistemas",
                        catalogProgramVariantsCount: 0,
                        studentsCount: 0
                    }
                ]
            }
        } as never,
        {
            query: {
                filter: [
                    { path: ["programId"], operator: "eq", values: [7] },
                    {
                        path: ["programCode"],
                        operator: "eq",
                        values: [34]
                    },
                    { path: ["code"], operator: "eq", values: ["AA"] }
                ]
            }
        }
    );
    assert.deepEqual(result.body?.data[0], {
        id: 11,
        programId: 7,
        programCode: 34,
        programName: "Engenharia de Computação",
        code: "AA",
        name: "Sistemas",
        catalogProgramVariantsCount: 0,
        studentsCount: 0
    });
});
