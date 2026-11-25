import {
    importStudentHistory,
    type ImportStudentHistoryInput
} from "#/modules/planning/student-history-import/ImportStudentHistory.use-case.js";
import {
    createDatabaseClient,
    type MyPrisma,
    type PrismaClient
} from "@pomi/db";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";

const databaseUrl = process.env.POMI_APP_TEST_DATABASE_URL;

test(
    "history import preserves reconciliation, warnings and rollback on PostgreSQL",
    { skip: !databaseUrl },
    async () => {
        assert.match(new URL(databaseUrl!).pathname, /_test$/);
        const prisma = createDatabaseClient(databaseUrl!);
        const suffix = randomUUID();
        const student = await prisma.student.create({
            data: { ra: "987654", name: `History ${suffix}` }
        });
        const principal = await prisma.principal.create({
            data: {
                kind: "HUMAN",
                user: {
                    create: {
                        studentId: student.id
                    }
                }
            },
            include: { user: true }
        });
        const user = principal.user!;
        const catalog = await prisma.catalog.create({ data: { year: 8791 } });
        const period = await prisma.studyPeriod.create({
            data: {
                year: catalog.year,
                yearPeriod: "FIRST_SEMESTER",
                startDate: new Date("8791-01-01T00:00:00Z")
            }
        });
        const courses = [];
        try {
            for (const index of [0, 1]) {
                const course = await prisma.course.create({
                    data: {
                        code: `${suffix}-${index}`,
                        name: "Course",
                        credits: 4
                    }
                });
                courses.push(course);
                await prisma.catalogCourse.create({
                    data: {
                        catalogId: catalog.id,
                        courseId: course.id,
                        name: course.name,
                        evaluation: "GRADE_AND_ATTENDANCE"
                    }
                });
            }
            const input: ImportStudentHistoryInput = {
                format: "pomi-student-history",
                version: 1,
                student: { ra: student.ra },
                semesters: [
                    {
                        year: catalog.year,
                        yearPeriod: "FIRST_SEMESTER",
                        courses: [
                            ...courses.map((course) => ({
                                code: course.code,
                                name: course.name,
                                credits: course.credits,
                                workloadHours: 60,
                                status: "ENROLLED" as const,
                                grade: null
                            })),
                            {
                                code: `UNKNOWN-${suffix}`,
                                name: "Unknown",
                                credits: null,
                                workloadHours: null,
                                status: "ENROLLED",
                                grade: null
                            }
                        ]
                    }
                ]
            };
            const failure = new Error("second write failed");
            const failing = new Proxy(prisma, {
                get(target, key) {
                    if (key === "$transaction")
                        return (
                            work: (
                                tx: MyPrisma.TransactionClient
                            ) => Promise<unknown>
                        ) =>
                            target.$transaction((tx) => {
                                let writes = 0;
                                return work(
                                    new Proxy(tx, {
                                        get(transaction, model) {
                                            if (
                                                model === "studentCourseAttempt"
                                            )
                                                return new Proxy(
                                                    transaction.studentCourseAttempt,
                                                    {
                                                        get(
                                                            delegate,
                                                            operation
                                                        ) {
                                                            if (
                                                                operation ===
                                                                "create"
                                                            )
                                                                return (
                                                                    query: MyPrisma.StudentCourseAttemptCreateArgs
                                                                ) => {
                                                                    if (
                                                                        ++writes ===
                                                                        2
                                                                    )
                                                                        throw failure;
                                                                    return delegate.create(
                                                                        query
                                                                    );
                                                                };
                                                            return Reflect.get(
                                                                delegate,
                                                                operation
                                                            );
                                                        }
                                                    }
                                                );
                                            return Reflect.get(
                                                transaction,
                                                model
                                            );
                                        }
                                    })
                                );
                            });
                    return Reflect.get(target, key);
                }
            }) as PrismaClient;
            await assert.rejects(
                importStudentHistory(
                    { prisma: failing },
                    { userId: user.id, input }
                ),
                (error) => error === failure
            );
            assert.equal(
                await prisma.studentCourseAttempt.count({
                    where: { userId: user.id }
                }),
                0
            );
            const created = (
                await importStudentHistory(
                    { prisma },
                    { userId: user.id, input }
                )
            )._unsafeUnwrap();
            assert.equal(created.created, 2);
            assert.equal(created.updated, 0);
            assert.equal(created.skipped, 1);
            assert.equal(created.warnings[0]?.code, `UNKNOWN-${suffix}`);
            const repeated = (
                await importStudentHistory(
                    { prisma },
                    { userId: user.id, input }
                )
            )._unsafeUnwrap();
            assert.equal(repeated.created, 0);
            assert.equal(repeated.updated, 2);
            assert.deepEqual(repeated.warnings, created.warnings);
            assert.equal(
                await prisma.studentCourseAttempt.count({
                    where: { userId: user.id }
                }),
                2
            );
            assert.deepEqual(
                (
                    await importStudentHistory(
                        { prisma },
                        {
                            userId: user.id,
                            input: { ...input, student: { ra: "123456" } }
                        }
                    )
                )._unsafeUnwrapErr(),
                { kind: "ra-mismatch" }
            );
            await prisma.user.update({
                where: { id: user.id },
                data: { studentId: null }
            });
            const withoutStudent = (
                await importStudentHistory(
                    { prisma },
                    {
                        userId: user.id,
                        input: { ...input, student: { ra: "123456" } }
                    }
                )
            )._unsafeUnwrap();
            assert.equal(withoutStudent.updated, 2);
            assert.equal(withoutStudent.created, 0);
        } finally {
            await prisma.studentCourseAttempt.deleteMany({
                where: { userId: user.id }
            });
            await prisma.user.delete({ where: { id: user.id } });
            await prisma.principal.delete({ where: { id: principal.id } });
            await prisma.student.delete({ where: { id: student.id } });
            await prisma.catalogCourse.deleteMany({
                where: { catalogId: catalog.id }
            });
            await prisma.catalog.delete({ where: { id: catalog.id } });
            await prisma.studyPeriod.delete({ where: { id: period.id } });
            await prisma.course.deleteMany({
                where: { id: { in: courses.map(({ id }) => id) } }
            });
            await prisma.$disconnect();
        }
    }
);
