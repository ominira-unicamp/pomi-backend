import IO from "#/modules/academic/course/Course.contract.js";
import { createCourseService } from "#/modules/academic/course/Course.service.js";
import { createDatabaseClient } from "@pomi/db";
import assert from "node:assert/strict";
import { randomInt, randomUUID } from "node:crypto";
import test from "node:test";

const databaseUrl = process.env.POMI_DATA_TEST_DATABASE_URL;
test(
    "filters the latest catalog on PostgreSQL with correlated variants, negatives, accents and pagination",
    { skip: !databaseUrl },
    async () => {
        assert.match(new URL(databaseUrl!).pathname, /_test$/);
        const prisma = createDatabaseClient(databaseUrl!);
        const service = createCourseService({ prisma });
        const prefix = `FILTER${randomUUID()}`;
        const year = randomInt(10000, 1000000);
        const courseIds: number[] = [];
        const catalogIds: number[] = [];
        let categoryId: number | undefined;
        let tagId: number | undefined;
        try {
            for (let offset = 0; offset < 2; offset++)
                catalogIds.push(
                    (
                        await prisma.catalog.create({
                            data: { year: year + offset }
                        })
                    ).id
                );
            for (const suffix of ["A", "B", "C", "D", "E"])
                courseIds.push(
                    (
                        await prisma.course.create({
                            data: {
                                code: prefix + suffix,
                                name: suffix,
                                credits: suffix === "C" ? 6 : 4
                            }
                        })
                    ).id
                );
            const [a, b, c, d] = courseIds;
            const codes = [prefix + "C", prefix + "D", prefix + "E"];
            await prisma.catalogCourse.create({
                data: {
                    catalogId: catalogIds[0],
                    courseId: c,
                    name: "Historical",
                    finalExam: false,
                    syllabus: "Antiga"
                }
            });
            await prisma.catalogCourse.create({
                data: {
                    catalogId: catalogIds[1],
                    courseId: c,
                    name: "Introdução à Computação",
                    syllabus:
                        "Inteligência artificial e otimização 100%_literal",
                    bibliography: "Álgebra",
                    finalExam: true,
                    laboratoryHours: 30,
                    practicalHours: 0,
                    minimumAttendancePercent: 75,
                    offeringPeriod: "ODD_PERIODS",
                    evaluation: "GRADE_AND_ATTENDANCE",
                    prerequisites: {
                        create: [
                            {
                                items: {
                                    create: [
                                        { courseId: a, fulfillment: "FULL" },
                                        {
                                            specialRequirementType:
                                                "PROGRESSION_COEFFICIENT",
                                            specialRequirementValue: 60
                                        }
                                    ]
                                }
                            },
                            {
                                items: {
                                    create: [
                                        { courseId: b, fulfillment: "PARTIAL" },
                                        {
                                            specialRequirementType:
                                                "AUTHORIZATION",
                                            specialRequirementValue: 0
                                        },
                                        {
                                            courseId: null,
                                            fulfillment: "PARTIAL"
                                        }
                                    ]
                                }
                            }
                        ]
                    }
                }
            });
            await prisma.catalogCourse.create({
                data: {
                    catalogId: catalogIds[0],
                    courseId: d,
                    name: "Older only",
                    finalExam: false
                }
            });
            const category = await prisma.category.create({
                data: { name: prefix, tags: { create: { name: prefix } } },
                include: { tags: true }
            });
            categoryId = category.id;
            tagId = category.tags[0].id;
            await prisma.courseTag.create({ data: { courseId: c, tagId } });
            const list = async (
                latestCatalogCourse: unknown,
                extra: Record<string, unknown> = {},
                pagination: Record<string, unknown> = {}
            ) =>
                service.list(
                    IO.list.request.parse({
                        query: {
                            filter: {
                                code: { in: codes },
                                ...extra,
                                latestCatalogCourse
                            },
                            ...pagination
                        }
                    }).query
                );
            const found = async (filter: unknown, extra = {}) =>
                (await list(filter, extra)).items.map((item) => item.id);
            assert.deepEqual(await found({ isNull: "true" }), [courseIds[4]]);
            assert.deepEqual(await found({ isNull: "false" }), [c, d]);
            assert.deepEqual(await found({ finalExam: "false" }), [d]);
            assert.deepEqual(
                await found(
                    { finalExam: "true" },
                    { catalogYear: String(year) }
                ),
                [c]
            );
            assert.deepEqual(await found({ catalogYear: String(year) }), [d]);
            assert.deepEqual(
                await found({
                    syllabus: { contains: "INTELIGENCIA ARTIFICIAL" }
                }),
                [c]
            );
            assert.deepEqual(
                await found({
                    bibliography: { contains: "algebra" },
                    name: { contains: "introducao" }
                }),
                [c]
            );
            assert.deepEqual(
                await found({ syllabus: { contains: "100%_literal" } }),
                [c]
            );
            assert.deepEqual(await found({ name: { contains: "％" } }), []);
            assert.deepEqual(await found({ name: { contains: "＿" } }), []);
            assert.deepEqual(await found({ name: { contains: "＼" } }), []);
            assert.deepEqual(
                await found({ syllabus: { contains: "100X_literal" } }),
                []
            );
            assert.deepEqual(await found({ syllabus: { isNull: "true" } }), [
                d
            ]);
            assert.deepEqual(
                await found({ workload: { practicalHours: "0" } }),
                [c]
            );
            assert.deepEqual(
                await found({ workload: { practicalHours: { ne: "5" } } }),
                [c]
            );
            assert.deepEqual(
                await found({
                    workload: { laboratoryHours: { notIn: ["0", "10"] } }
                }),
                [c]
            );
            assert.deepEqual(
                await found({
                    offeringPeriod: { in: ["ODD_PERIODS", "ALL_PERIODS"] },
                    evaluation: "GRADE_AND_ATTENDANCE",
                    minimumAttendancePercent: { lte: "75" }
                }),
                [c]
            );
            assert.deepEqual(
                await found({ coordinator: { id: { isNull: "true" } } }),
                [c, d]
            );
            assert.deepEqual(await found({ hasPrerequisites: "true" }), [c]);
            assert.deepEqual(await found({ hasPrerequisites: "false" }), [d]);
            const pred = (operation: string, predicates: unknown[]) => ({
                prerequisites: { [operation]: predicates }
            });
            assert.deepEqual(
                await found(
                    pred("some", [{ course: { courseId: String(a) } }])
                ),
                [c]
            );
            assert.deepEqual(
                await found(
                    pred("some", [
                        {
                            course: {
                                courseCode: prefix + "A",
                                fulfillment: "FULL"
                            }
                        }
                    ])
                ),
                [c]
            );
            assert.deepEqual(
                await found(
                    pred("some", [
                        {
                            course: {
                                courseCode: prefix + "A",
                                fulfillment: "PARTIAL"
                            }
                        }
                    ])
                ),
                []
            );
            assert.deepEqual(
                await found(
                    pred("some", [
                        { course: { courseCode: prefix + "A" } },
                        { course: { courseCode: prefix + "B" } }
                    ])
                ),
                [c]
            );
            assert.deepEqual(
                await found(
                    pred("none", [{ course: { courseCode: prefix + "A" } }])
                ),
                [d]
            );
            assert.deepEqual(
                await found(
                    pred("none", [
                        {
                            course: {
                                courseCode: prefix + "A",
                                fulfillment: "PARTIAL"
                            }
                        }
                    ])
                ),
                [c, d]
            );
            assert.deepEqual(
                await found(
                    pred("some", [
                        { specialRequirement: { type: "AUTHORIZATION" } }
                    ])
                ),
                [c]
            );
            assert.deepEqual(
                await found(
                    pred("none", [
                        { specialRequirement: { type: "AUTHORIZATION" } }
                    ])
                ),
                [d]
            );
            assert.deepEqual(
                await found(
                    pred("some", [
                        {
                            specialRequirement: {
                                type: "PROGRESSION_COEFFICIENT",
                                progressionCoefficient: { value: { gte: "61" } }
                            }
                        }
                    ])
                ),
                []
            );
            assert.deepEqual(
                await found(
                    pred("some", [
                        {
                            specialRequirement: {
                                type: "PROGRESSION_COEFFICIENT",
                                progressionCoefficient: { value: { gte: "50" } }
                            }
                        }
                    ])
                ),
                [c]
            );
            assert.deepEqual(
                await found(
                    { isNull: "false" },
                    { tagId: String(tagId), credits: { gte: "5" } }
                ),
                [c]
            );
            const filters = {
                code: { in: codes },
                credits: { gte: "4" },
                catalogYear: String(year)
            };
            const legacy = await service.list(
                IO.list.request.parse({ query: { filter: filters } }).query
            );
            const extended = await list(
                { isNull: "false" },
                { catalogYear: String(year), credits: { gte: "4" } }
            );
            assert.deepEqual(extended, legacy);
            const page1 = await list(
                { isNull: "false" },
                {},
                { page: 1, pageSize: 1 }
            );
            const page2 = await list(
                { isNull: "false" },
                {},
                { page: 2, pageSize: 1 }
            );
            assert.equal(page1.total, 2);
            assert.equal(page2.total, 2);
            assert.deepEqual(
                [...page1.items, ...page2.items].map((item) => item.id),
                [c, d]
            );
            const descending = await service.list(
                IO.list.request.parse({
                    query: {
                        filter: {
                            code: { in: codes },
                            latestCatalogCourse: { isNull: "false" }
                        },
                        sort: "code:desc"
                    }
                }).query
            );
            assert.deepEqual(
                descending.items.map((item) => item.id),
                [d, c]
            );
        } finally {
            await prisma.courseTag.deleteMany({
                where: { courseId: { in: courseIds } }
            });
            if (tagId) await prisma.tag.delete({ where: { id: tagId } });
            if (categoryId)
                await prisma.category.delete({ where: { id: categoryId } });
            await prisma.catalogCourse.deleteMany({
                where: { courseId: { in: courseIds } }
            });
            await prisma.course.deleteMany({
                where: { id: { in: courseIds } }
            });
            await prisma.catalog.deleteMany({
                where: { id: { in: catalogIds } }
            });
            await prisma.$disconnect();
        }
    }
);
