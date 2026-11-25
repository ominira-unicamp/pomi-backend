import IO from "#/modules/academic/course/Course.contract.js";
import { createCourseService } from "#/modules/academic/course/Course.service.js";
import catalogCourseEntity from "#/modules/catalog/catalog-course/CatalogCourse.entity.js";
import { createDatabaseClient } from "@pomi/db";
import assert from "node:assert/strict";
import { randomInt, randomUUID } from "node:crypto";
import test from "node:test";

const databaseUrl = process.env.POMI_DATA_TEST_DATABASE_URL;

test(
    "selects the latest catalog per course on PostgreSQL independently of filters and pagination",
    { skip: !databaseUrl },
    async () => {
        assert.match(new URL(databaseUrl!).pathname, /_test$/);
        const prisma = createDatabaseClient(databaseUrl!);
        const service = createCourseService({ prisma });
        const prefix = `LATEST${randomUUID()}`;
        const year = randomInt(10000, 1000000);
        const catalogIds: number[] = [];
        const courseIds: number[] = [];
        try {
            const latest = await prisma.catalog.create({
                data: { year: year + 1 }
            });
            catalogIds.push(latest.id);
            const oldest = await prisma.catalog.create({ data: { year } });
            catalogIds.push(oldest.id);
            const unrelated = await prisma.catalog.create({
                data: { year: year + 2 }
            });
            catalogIds.push(unrelated.id);
            assert.ok(oldest.id > latest.id);

            for (const suffix of ["A", "B", "C"]) {
                const course = await prisma.course.create({
                    data: {
                        code: `${prefix}${suffix}`,
                        name: `Global ${suffix}`,
                        credits: 6
                    }
                });
                courseIds.push(course.id);
            }
            const [courseId, historicalId, withoutCatalogId] = courseIds;
            await prisma.catalogCourse.createMany({
                data: [
                    {
                        catalogId: oldest.id,
                        courseId,
                        name: "Historical name",
                        syllabus: "Historical syllabus",
                        finalExam: false
                    },
                    {
                        catalogId: oldest.id,
                        courseId: historicalId,
                        name: "Historical only"
                    }
                ]
            });
            const latestCourse = await prisma.catalogCourse.create({
                data: {
                    catalogId: latest.id,
                    courseId,
                    name: "Latest name",
                    theoreticalHours: 30,
                    classroomHours: 60,
                    finalExam: true,
                    syllabus: "Latest syllabus",
                    bibliography: "Latest bibliography",
                    sourceUrl: "https://example.test/catalog",
                    offeringPeriod: "ODD_PERIODS",
                    evaluation: "GRADE_AND_ATTENDANCE",
                    prerequisites: {
                        create: {
                            items: {
                                create: [
                                    {
                                        courseId: historicalId,
                                        fulfillment: "FULL"
                                    },
                                    {
                                        specialRequirementType: "AUTHORIZATION",
                                        specialRequirementValue: 0
                                    }
                                ]
                            }
                        }
                    }
                },
                ...catalogCourseEntity.selection
            });
            const expected = catalogCourseEntity.build(latestCourse);
            const detail = await service.getById(courseId);
            assert.ok(detail.isOk());
            if (!detail.isOk()) return;
            assert.equal(detail.value.name, "Global A");
            assert.equal(detail.value.unitCode, null);
            assert.deepEqual(detail.value.latestCatalogCourse, expected);
            assert.equal(expected.catalogYear, year + 1);
            assert.equal(expected.syllabus, "Latest syllabus");
            assert.equal(expected.workload.classroomHours, 60);
            assert.equal(expected.workload.practicalHours, null);
            assert.equal(expected.coordinator, null);
            assert.deepEqual(expected.prerequisites, {
                any: [
                    {
                        all: [
                            {
                                type: "COURSE",
                                course: {
                                    courseId: historicalId,
                                    fulfillment: "FULL"
                                }
                            },
                            {
                                type: "SPECIAL_REQUIREMENT",
                                specialRequirement: {
                                    type: "AUTHORIZATION"
                                }
                            }
                        ]
                    }
                ]
            });
            IO.schema.parse(detail.value);
            const historical = await service.getById(historicalId);
            assert.ok(historical.isOk());
            if (historical.isOk())
                assert.equal(
                    historical.value.latestCatalogCourse?.catalogYear,
                    year
                );
            const withoutCatalog = await service.getById(withoutCatalogId);
            assert.ok(withoutCatalog.isOk());
            if (withoutCatalog.isOk())
                assert.equal(withoutCatalog.value.latestCatalogCourse, null);

            const query = IO.list.request.parse({
                query: {
                    page: 1,
                    pageSize: 1,
                    sort: "code:asc",
                    filter: {
                        code: { in: ["A", "B", "C"].map((s) => prefix + s) },
                        catalogYear: String(year)
                    }
                }
            }).query;
            const page = await service.list(query);
            assert.equal(page.total, 2);
            assert.equal(page.items.length, 1);
            assert.deepEqual(page.items[0], detail.value);
            const next = await service.list({ ...query, page: 2 });
            assert.equal(next.total, 2);
            assert.equal(next.items[0]?.id, historicalId);
            const all = await service.list({
                filter: IO.list.request.parse({
                    query: {
                        filter: {
                            code: {
                                in: ["A", "B", "C"].map((s) => prefix + s)
                            }
                        }
                    }
                }).query.filter
            });
            assert.equal(all.total, 3);
            assert.equal(all.items.length, 3);
            assert.equal(all.items[2]?.latestCatalogCourse, null);
        } finally {
            await prisma.catalog.deleteMany({
                where: { id: { in: catalogIds } }
            });
            await prisma.course.deleteMany({
                where: { id: { in: courseIds } }
            });
            await prisma.$disconnect();
        }
    }
);
