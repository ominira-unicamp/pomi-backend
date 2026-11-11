import IO, { studentSort } from "#/modules/student/Student.contract.js";
import {
    invalidStudentProfileProblem,
    studentIdentityConflictProblem,
    studentNotFoundProblem,
    studentReferenceNotFoundProblem,
    type StudentProblem
} from "#/modules/student/Student.problems.js";
import { compileSort, err, ok, resolveSort, type Result } from "@pomi/api-core";
import { runIdentityTransaction, type PrismaClient } from "@pomi/db";
import z from "zod";

type Student = z.infer<typeof IO.schema>;
type ListQuery = z.infer<typeof IO.list.request>["query"];
type CreateInput = z.infer<typeof IO.create.request>["body"];
type PatchInput = z.infer<typeof IO.patch.request>["body"];
class StudentAssociationConflict extends Error {}

type Fields = Array<{ code: string; path: string[]; message: string }>;

async function validateAcademicSelection(
    prisma: PrismaClient,
    input: Pick<
        Student,
        "catalogId" | "programId" | "specializationId" | "languageId"
    >
): Promise<{ kind: "reference" | "invalid"; fields: Fields } | null> {
    const fields: Fields = [];
    if (
        input.catalogId != null &&
        !(await prisma.catalog.findUnique({
            where: { id: input.catalogId },
            select: { id: true }
        }))
    )
        fields.push({
            code: "REFERENCE_NOT_FOUND",
            path: ["catalogId"],
            message: "O catálogo informado não foi encontrado."
        });
    if (input.programId != null && input.catalogId == null)
        fields.push({
            code: "REQUIRED",
            path: ["catalogId"],
            message: "Um catálogo é necessário ao informar um programa."
        });
    if (
        input.programId != null &&
        input.catalogId != null &&
        !(await prisma.catalogProgram.findUnique({
            where: {
                catalogId_programId: {
                    catalogId: input.catalogId,
                    programId: input.programId
                }
            },
            select: { id: true }
        }))
    )
        fields.push({
            code: "INVALID_VALUE",
            path: ["programId"],
            message: "O programa não está disponível no catálogo informado."
        });
    if (
        input.languageId != null &&
        (input.catalogId == null || input.programId == null)
    )
        fields.push({
            code: "REQUIRED",
            path: ["languageId"],
            message: "Uma língua exige catálogo e programa."
        });
    if (
        input.languageId != null &&
        input.catalogId != null &&
        input.programId != null &&
        !(await prisma.catalogLanguage.findFirst({
            where: {
                languageId: input.languageId,
                catalogProgram: {
                    catalogId: input.catalogId,
                    programId: input.programId
                }
            },
            select: { id: true }
        }))
    )
        fields.push({
            code: "INVALID_VALUE",
            path: ["languageId"],
            message: "A língua não está disponível para o programa informado."
        });
    if (input.specializationId != null && input.programId == null)
        fields.push({
            code: "REQUIRED",
            path: ["specializationId"],
            message: "Uma habilitação exige um programa."
        });
    if (input.specializationId != null && input.programId != null) {
        const specialization = await prisma.specialization.findUnique({
            where: { id: input.specializationId },
            select: { programId: true }
        });
        if (!specialization)
            fields.push({
                code: "REFERENCE_NOT_FOUND",
                path: ["specializationId"],
                message: "A habilitação informada não foi encontrada."
            });
        else if (specialization.programId !== input.programId)
            fields.push({
                code: "INVALID_VALUE",
                path: ["specializationId"],
                message: "A habilitação não pertence ao programa informado."
            });
    }
    if (fields.length === 0) return null;
    return {
        kind: fields.some((field) => field.code === "REFERENCE_NOT_FOUND")
            ? "reference"
            : "invalid",
        fields
    };
}

export type StudentService = {
    getForUser(userId: number): ReturnType<StudentService["getById"]>;
    patchForUser(
        userId: number,
        input: PatchInput
    ): ReturnType<StudentService["patch"]>;
    removeForUser(
        userId: number,
        confirmationRa: string
    ): ReturnType<StudentService["remove"]>;
    list(query: ListQuery): Promise<Student[]>;
    getById(
        id: number
    ): Promise<Result<Student, ReturnType<typeof studentNotFoundProblem>>>;
    create(
        userId: number,
        input: CreateInput
    ): Promise<
        Result<
            { student: Student; linked: boolean },
            Exclude<StudentProblem, ReturnType<typeof studentNotFoundProblem>>
        >
    >;
    patch(
        id: number,
        input: PatchInput
    ): Promise<
        Result<
            Student,
            Exclude<
                StudentProblem,
                ReturnType<typeof studentIdentityConflictProblem>
            >
        >
    >;
    remove(
        id: number,
        confirmationRa: string
    ): Promise<
        Result<
            void,
            | ReturnType<typeof studentNotFoundProblem>
            | ReturnType<typeof invalidStudentProfileProblem>
        >
    >;
};

const studentOwnerInclude = { user: { select: { id: true } } } as const;

function academicStudent(value: {
    id: number;
    ra: string;
    name: string;
    programId: number | null;
    specializationId: number | null;
    catalogId: number | null;
    entryYear: number | null;
    languageId: number | null;
    user: { id: number } | null;
}) {
    const { user, ...academic } = value;
    if (!user)
        throw new Error("Academic complement is missing its canonical user.");
    return { ...academic, userId: user.id };
}

export function createStudentService({
    prisma
}: {
    prisma: PrismaClient;
}): StudentService {
    return {
        async getForUser(userId) {
            const user = await prisma.user.findUnique({
                where: { id: userId },
                select: { studentId: true }
            });
            return user?.studentId != null
                ? this.getById(user.studentId)
                : err(studentNotFoundProblem());
        },
        async patchForUser(userId, input) {
            const user = await prisma.user.findUnique({
                where: { id: userId },
                select: { studentId: true }
            });
            return user?.studentId != null
                ? this.patch(user.studentId, input)
                : err(studentNotFoundProblem());
        },
        async removeForUser(userId, confirmationRa) {
            const user = await prisma.user.findUnique({
                where: { id: userId },
                select: { studentId: true }
            });
            return user?.studentId != null
                ? this.remove(user.studentId, confirmationRa)
                : err(studentNotFoundProblem());
        },
        async list(query) {
            return (
                await prisma.student.findMany({
                    include: studentOwnerInclude,
                    orderBy: compileSort(resolveSort(query.sort, studentSort), {
                        id: (direction) => ({ id: direction }),
                        ra: (direction) => ({ ra: direction }),
                        name: (direction) => ({ name: direction }),
                        entryYear: (direction) => ({ entryYear: direction })
                    })
                })
            ).map(academicStudent);
        },
        async getById(id) {
            const student = await prisma.student.findUnique({
                where: { id },
                include: studentOwnerInclude
            });
            return student
                ? ok(academicStudent(student))
                : err(studentNotFoundProblem());
        },
        async create(userId, input) {
            const ra = input.ra;
            const user = await prisma.user.findUnique({
                where: { id: userId },
                select: { id: true, studentId: true }
            });
            if (!user || user.studentId !== null)
                return err(
                    studentIdentityConflictProblem(
                        "Usuário ausente ou já vinculado a um aluno."
                    )
                );
            const validation = await validateAcademicSelection(prisma, {
                catalogId: input.catalogId ?? null,
                programId: input.programId ?? null,
                specializationId: input.specializationId ?? null,
                languageId: input.languageId ?? null
            });
            if (validation?.kind === "reference")
                return err(studentReferenceNotFoundProblem(validation.fields));
            if (validation)
                return err(invalidStudentProfileProblem(validation.fields));
            try {
                const result = await runIdentityTransaction(
                    prisma,
                    async (tx) => {
                        const current = await tx.user.findUnique({
                            where: { id: userId },
                            select: { studentId: true }
                        });
                        if (!current || current.studentId !== null)
                            throw new StudentAssociationConflict();
                        const existing = await tx.student.findUnique({
                            where: { ra },
                            include: studentOwnerInclude
                        });
                        if (existing?.user)
                            throw new StudentAssociationConflict();
                        const academic =
                            existing ??
                            (await tx.student.create({
                                data: {
                                    ra,
                                    name: input.name,
                                    programId: input.programId,
                                    specializationId: input.specializationId,
                                    catalogId: input.catalogId,
                                    entryYear: input.entryYear,
                                    languageId: input.languageId
                                }
                            }));
                        await tx.user.update({
                            where: { id: userId },
                            data: { studentId: academic.id }
                        });
                        const student = await tx.student.findUniqueOrThrow({
                            where: { id: academic.id },
                            include: studentOwnerInclude
                        });
                        return {
                            student: academicStudent(student),
                            linked: !!existing
                        };
                    }
                );
                return ok(result);
            } catch (error) {
                if (error instanceof StudentAssociationConflict)
                    return err(
                        studentIdentityConflictProblem(
                            "O usuário ou o aluno já possui vínculo acadêmico."
                        )
                    );
                throw error;
            }
        },
        async patch(id, input) {
            const existing = await prisma.student.findUnique({ where: { id } });
            if (!existing) return err(studentNotFoundProblem());
            const validation = await validateAcademicSelection(prisma, {
                catalogId:
                    input.catalogId !== undefined
                        ? input.catalogId
                        : existing.catalogId,
                programId:
                    input.programId !== undefined
                        ? input.programId
                        : existing.programId,
                specializationId:
                    input.specializationId !== undefined
                        ? input.specializationId
                        : existing.specializationId,
                languageId:
                    input.languageId !== undefined
                        ? input.languageId
                        : existing.languageId
            });
            if (validation?.kind === "reference")
                return err(studentReferenceNotFoundProblem(validation.fields));
            if (validation)
                return err(invalidStudentProfileProblem(validation.fields));
            return ok(
                academicStudent(
                    await prisma.student.update({
                        where: { id },
                        data: input,
                        include: studentOwnerInclude
                    })
                )
            );
        },
        async remove(id, confirmationRa) {
            const existing = await prisma.student.findUnique({
                where: { id },
                select: { id: true, ra: true }
            });
            if (!existing) return err(studentNotFoundProblem());
            if (existing.ra !== confirmationRa)
                return err(
                    invalidStudentProfileProblem([
                        {
                            code: "INVALID_VALUE",
                            path: ["confirmationRa"],
                            message:
                                "O RA de confirmação não corresponde ao aluno."
                        }
                    ])
                );
            await prisma.$transaction(async (tx) => {
                await tx.student.delete({ where: { id } });
            });
            return ok(undefined);
        }
    };
}
