import IO from "#/modules/catalog/catalog/Catalog.contract.js";
import { extendZodWithOpenApi } from "@asteasolutions/zod-to-openapi";
import { MyPrisma } from "@pomi/db";
import z from "zod";

extendZodWithOpenApi(z);

export const prismaCatalogFieldSelection = {
    include: {
        programs: {
            select: {
                id: true,
                programId: true
            }
        },
        _count: {
            select: {
                students: true,
                programs: true,
                courses: true
            }
        }
    }
} as const satisfies MyPrisma.CatalogDefaultArgs;

type PrismaCatalogPayload = MyPrisma.CatalogGetPayload<
    typeof prismaCatalogFieldSelection
>;

function buildCatalogEntity(
    catalog: PrismaCatalogPayload
): z.infer<typeof IO.schemas.catalogEntitySchema> {
    const { programs, _count, ...rest } = catalog;
    return {
        ...rest,
        programsCount: _count.programs,
        coursesCount: _count.courses,
        studentsCount: _count.students,
        programIds: programs.map((p) => p.programId)
    };
}

const catalogEntity = {
    build: buildCatalogEntity,
    prismaSelection: prismaCatalogFieldSelection
};

export default catalogEntity;
