import IO from "#/modules/catalog/language/Language.contract.js";
import { MyPrisma } from "@pomi/db";
import z from "zod";

export const prismaLanguageFieldSelection = {
    include: {
        _count: {
            select: {
                catalogLanguages: true
            }
        }
    }
} as const satisfies MyPrisma.LanguageDefaultArgs;

type PrismaLanguagePayload = MyPrisma.LanguageGetPayload<
    typeof prismaLanguageFieldSelection
>;

function buildLanguageEntity(
    language: PrismaLanguagePayload
): z.infer<typeof IO.schema> {
    const { _count, ...rest } = language;
    return {
        ...rest,
        catalogLanguagesCount: _count.catalogLanguages
    };
}

export default {
    build: buildLanguageEntity,
    prismaSelection: prismaLanguageFieldSelection
};
