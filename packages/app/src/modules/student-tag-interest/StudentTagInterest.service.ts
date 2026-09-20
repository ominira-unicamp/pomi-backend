import IO, {
    studentTagInterestSort
} from "#/modules/student-tag-interest/StudentTagInterest.contract.js";
import {
    compareBySort,
    err,
    ok,
    ReferenceNotFoundProblem,
    resolveSort,
    type Result
} from "@pomi/api-core";
import type { DatabaseClient } from "@pomi/db";
import z from "zod";

const tagEntity = z
    .object({
        id: z.number().int().positive(),
        name: z.string(),
        categoryId: z.number().int().positive(),
        parentTagId: z.number().int().positive().nullable()
    })
    .strict();

type TagInterest = z.infer<typeof tagEntity>;
type ListQuery = z.infer<typeof IO.list.request>["query"];

type TagInterestProblem = ReturnType<typeof ReferenceNotFoundProblem.create>;

function toTagEntity(tag: {
    id: number;
    name: string;
    categoryId: number;
    parentTagId: number | null;
}): TagInterest {
    return tagEntity.parse(tag);
}

export type StudentTagInterestService = {
    list(studentId: number, query: ListQuery): Promise<TagInterest[]>;
    put(
        studentId: number,
        tagId: number
    ): Promise<Result<void, TagInterestProblem>>;
    remove(studentId: number, tagId: number): Promise<void>;
};

export function createStudentTagInterestService({
    prisma
}: {
    prisma: DatabaseClient;
}): StudentTagInterestService {
    return {
        async list(studentId, query) {
            const interests = await prisma.studentTagInterest.findMany({
                where: { studentId },
                include: { tag: true }
            });
            return interests
                .map(({ tag }) => toTagEntity(tag))
                .sort(
                    compareBySort(
                        resolveSort(query.sort, studentTagInterestSort),
                        {
                            name: (left, right) =>
                                left.name.localeCompare(right.name, "pt-BR"),
                            id: (left, right) => left.id - right.id
                        }
                    )
                );
        },
        async put(studentId, tagId) {
            const tag = await prisma.tag.findUnique({ where: { id: tagId } });
            if (!tag)
                return err(
                    ReferenceNotFoundProblem.create({
                        detail: "A tag informada não foi encontrada.",
                        fields: [
                            {
                                code: "REFERENCE_NOT_FOUND",
                                path: ["tagId"],
                                message: "A tag deve existir."
                            }
                        ]
                    })
                );

            await prisma.studentTagInterest.upsert({
                where: { studentId_tagId: { studentId, tagId } },
                create: { studentId, tagId },
                update: {}
            });
            return ok(undefined);
        },
        async remove(studentId, tagId) {
            await prisma.studentTagInterest.deleteMany({
                where: { studentId, tagId }
            });
        }
    };
}
