import { createDatabaseClient, MyPrisma } from "@pomi/db";
import { randomInt, randomUUID } from "node:crypto";
import { performance } from "node:perf_hooks";
import IO from "../src/modules/academic/course/Course.contract.js";
import { courseSqlWhere } from "../src/modules/academic/course/Course.query.js";
import { createCourseService } from "../src/modules/academic/course/Course.service.js";

const url = process.env.POMI_DATA_TEST_DATABASE_URL;
if (!url || !/_test$/.test(new URL(url).pathname))
    throw new Error(
        "Use POMI_DATA_TEST_DATABASE_URL com banco terminado em _test."
    );
const prisma = createDatabaseClient(url);
const service = createCourseService({ prisma });
const prefix = `BENCH${randomUUID()}`;
const unit = await prisma.unit.create({ data: { code: prefix, name: prefix } });
const catalogIds: number[] = [];
const year = randomInt(10000, 1000000);
try {
    await prisma.course.createMany({
        data: Array.from({ length: 1000 }, (_, index) => ({
            code: `${prefix}${String(index).padStart(4, "0")}`,
            name: `Disciplina ${index}`,
            credits: 4,
            unitId: unit.id
        }))
    });
    const courses = await prisma.course.findMany({
        where: { unitId: unit.id },
        select: { id: true }
    });
    for (let offset = 0; offset < 3; offset++) {
        const catalog = await prisma.catalog.create({
            data: { year: year + offset }
        });
        catalogIds.push(catalog.id);
        await prisma.catalogCourse.createMany({
            data: courses.map((course, index) => ({
                courseId: course.id,
                catalogId: catalog.id,
                name: "Introdução à Computação",
                finalExam: index % 2 === 0,
                syllabus: `${"Computação e otimização. ".repeat(160)}${index % 10 === 0 ? "Inteligência artificial" : "Álgebra linear"}`,
                bibliography: "Bibliografia de computação. ".repeat(40),
                laboratoryHours: 30
            }))
        });
    }
    const latest = await prisma.catalogCourse.findMany({
        where: { catalogId: catalogIds[2] },
        select: { id: true }
    });
    await prisma.catalogCoursePrerequisiteGroup.createMany({
        data: latest.map((course) => ({ catalogCourseId: course.id }))
    });
    const groups = await prisma.catalogCoursePrerequisiteGroup.findMany({
        where: { catalogCourseId: { in: latest.map((course) => course.id) } },
        select: { id: true }
    });
    await prisma.catalogCoursePrerequisiteItem.createMany({
        data: groups.map((group) => ({
            groupId: group.id,
            courseId: courses[0].id,
            fulfillment: "FULL" as const
        }))
    });
    await prisma.$executeRaw`ANALYZE data."Course"`;
    await prisma.$executeRaw`ANALYZE data."CatalogCourse"`;
    await prisma.$executeRaw`ANALYZE data."CatalogCoursePrerequisiteGroup"`;
    await prisma.$executeRaw`ANALYZE data."CatalogCoursePrerequisiteItem"`;
    const cases = [
        { label: "legacy-page", filter: { unit: { id: String(unit.id) } } },
        {
            label: "catalog-page",
            filter: {
                unit: { id: String(unit.id) },
                latestCatalogCourse: { isNull: "false" }
            }
        },
        {
            label: "text-short",
            filter: {
                unit: { id: String(unit.id) },
                latestCatalogCourse: { syllabus: { contains: "co" } }
            }
        },
        {
            label: "text-selective",
            filter: {
                unit: { id: String(unit.id) },
                latestCatalogCourse: {
                    syllabus: { contains: "inteligencia artificial" }
                }
            }
        },
        {
            label: "text-and-prerequisite",
            filter: {
                unit: { id: String(unit.id) },
                latestCatalogCourse: {
                    syllabus: { contains: "inteligencia artificial" },
                    prerequisites: {
                        some: [
                            {
                                course: {
                                    courseId: String(courses[0].id),
                                    fulfillment: "FULL"
                                }
                            }
                        ]
                    }
                }
            }
        }
    ];
    for (const item of cases) {
        const query = IO.list.request.parse({
            query: { page: 1, pageSize: 20, filter: item.filter }
        }).query;
        await service.list(query);
        const samples: number[] = [];
        let total = 0;
        for (let iteration = 0; iteration < 3; iteration++) {
            const start = performance.now();
            const result = await service.list(query);
            samples.push(performance.now() - start);
            total = result.total;
        }
        console.log(
            JSON.stringify({
                label: item.label,
                courses: 1000,
                catalogsPerCourse: 3,
                total,
                pageSize: 20,
                samplesMs: samples.map((value) => Number(value.toFixed(2)))
            })
        );
        if (item.label === "text-and-prerequisite") {
            const plan = await prisma.$queryRaw<
                Array<{ "QUERY PLAN": string }>
            >(MyPrisma.sql`EXPLAIN (ANALYZE, BUFFERS, FORMAT TEXT)
                SELECT count(*) FROM data."Course" c LEFT JOIN data."Unit" u ON u."id" = c."unitId"
                LEFT JOIN LATERAL (SELECT cc.*, cat."year" AS "catalogYear" FROM data."CatalogCourse" cc JOIN data."Catalog" cat ON cat."id" = cc."catalogId" WHERE cc."courseId" = c."id" ORDER BY cat."year" DESC LIMIT 1) lc ON TRUE
                WHERE ${courseSqlWhere(query.filter!)}`);
            console.log(plan.map((row) => row["QUERY PLAN"]).join("\n"));
        }
    }
} finally {
    await prisma.catalogCourse.deleteMany({
        where: { catalogId: { in: catalogIds } }
    });
    await prisma.course.deleteMany({ where: { unitId: unit.id } });
    await prisma.catalog.deleteMany({ where: { id: { in: catalogIds } } });
    await prisma.unit.delete({ where: { id: unit.id } });
    await prisma.$disconnect();
}
