import {
    resolvePagination,
    resolveSort,
    type Filter,
    type FilterExpression
} from "@pomi/api-core";
import { MyPrisma, type PrismaClient } from "@pomi/db";
import {
    coursePagination,
    courseSort,
    type ListQueryParams
} from "./Course.contract.js";
import courseEntity from "./Course.entity.js";
import { courseWorkloadFields } from "./Course.filters.js";

const sql = MyPrisma.sql;
const joinAnd = (conditions: MyPrisma.Sql[]) =>
    conditions.length
        ? sql`(${MyPrisma.join(conditions, " AND ")})`
        : sql`TRUE`;
const column = (value: string) => MyPrisma.raw(value);
const latestColumns: Record<string, MyPrisma.Sql> = {
    "catalogYear": column('lc."catalogYear"'),
    "offeringPeriod": column('lc."offeringPeriod"::text'),
    "evaluation": column('lc."evaluation"::text'),
    "finalExam": column('lc."finalExam"'),
    "minimumAttendancePercent": column('lc."minimumAttendancePercent"'),
    "coordinator.id": column('lc."coordinatorId"'),
    "name": column('lc."name"'),
    "syllabus": column('lc."syllabus"'),
    "bibliography": column('lc."bibliography"'),
    ...Object.fromEntries(
        courseWorkloadFields.map((name) => [
            `workload.${name}`,
            column(`lc."${name}"`)
        ])
    )
};
const rootColumns: Record<string, MyPrisma.Sql> = {
    "code": column('c."code"'),
    "credits": column('c."credits"'),
    "unit.id": column('u."id"'),
    "unit.code": column('u."code"')
};
const sortColumns: Record<string, MyPrisma.Sql> = {
    code: column('c."code"'),
    name: column('c."name"'),
    credits: column('c."credits"'),
    unitCode: column('u."code"'),
    id: column('c."id"')
};

function comparison(
    target: MyPrisma.Sql,
    expression: FilterExpression
): MyPrisma.Sql {
    const value = expression.values[0];
    const scalar =
        expression.operator === "isNull" ||
        expression.path.at(-1) === "finalExam"
            ? value === "true"
            : value;
    switch (expression.operator) {
        case "eq":
            return sql`${target} = ${scalar}`;
        case "ne":
            return sql`${target} <> ${scalar}`;
        case "in":
            return sql`${target} IN (${MyPrisma.join(expression.values)})`;
        case "notIn":
            return sql`${target} NOT IN (${MyPrisma.join(expression.values)})`;
        case "gt":
            return sql`${target} > ${value}`;
        case "gte":
            return sql`${target} >= ${value}`;
        case "lt":
            return sql`${target} < ${value}`;
        case "lte":
            return sql`${target} <= ${value}`;
        case "isNull":
            return scalar === true
                ? sql`${target} IS NULL`
                : sql`${target} IS NOT NULL`;
        case "contains": {
            const normalized = sql`public.unaccent(${String(value)})`;
            const escaped = sql`replace(replace(replace(${normalized}, chr(92), chr(92) || chr(92)), '%', chr(92) || '%'), '_', chr(92) || '_')`;
            return sql`public.unaccent(${target}) ILIKE ('%' || ${escaped} || '%') ESCAPE chr(92)`;
        }
    }
}

function prerequisitePredicate(expressions: Filter): MyPrisma.Sql {
    const course = expressions[0]?.path[4] === "course";
    const targets: Record<string, MyPrisma.Sql> = course
        ? {
              courseId: column('i."courseId"'),
              courseCode: column('pc."code"'),
              fulfillment: column('i."fulfillment"::text')
          }
        : {
              "type": column('i."specialRequirementType"::text'),
              "progressionCoefficient.value": column(
                  'i."specialRequirementValue"'
              )
          };
    const conditions = expressions.map((expression) => {
        const key = expression.path.slice(5).join(".");
        const target = targets[key];
        if (!target) throw new Error(`Unsupported prerequisite field: ${key}`);
        return comparison(target, expression);
    });
    conditions.push(
        course
            ? sql`i."fulfillment" IS NOT NULL AND i."specialRequirementType" IS NULL`
            : sql`i."fulfillment" IS NULL AND i."courseId" IS NULL AND i."specialRequirementType" IS NOT NULL`
    );
    const exists = sql`EXISTS (
        SELECT 1 FROM data."CatalogCoursePrerequisiteGroup" g
        JOIN data."CatalogCoursePrerequisiteItem" i ON i."groupId" = g."id"
        LEFT JOIN data."Course" pc ON pc."id" = i."courseId"
        WHERE g."catalogCourseId" = lc."id" AND ${joinAnd(conditions)}
    )`;
    return expressions[0]?.path[2] === "none" ? sql`NOT ${exists}` : exists;
}

export function courseSqlWhere(filter: Filter): MyPrisma.Sql {
    const conditions: MyPrisma.Sql[] = [];
    const predicates = new Map<string, Filter>();
    for (const expression of filter) {
        const path = expression.path.join(".");
        if (expression.path[0] !== "latestCatalogCourse") {
            if (path === "catalogYear") {
                conditions.push(
                    sql`EXISTS (SELECT 1 FROM data."CatalogCourse" hc JOIN data."Catalog" h ON h."id" = hc."catalogId" WHERE hc."courseId" = c."id" AND ${comparison(column('h."year"'), expression)})`
                );
            } else if (path === "tagId") {
                conditions.push(
                    sql`EXISTS (SELECT 1 FROM app."CourseTag" ct WHERE ct."courseId" = c."id" AND ${comparison(column('ct."tagId"'), expression)})`
                );
            } else {
                const target = rootColumns[path];
                if (!target)
                    throw new Error(`Unsupported course field: ${path}`);
                conditions.push(comparison(target, expression));
            }
        } else if (expression.path[1] === "prerequisites") {
            const key = expression.path.slice(0, 4).join(".");
            const grouped = predicates.get(key) ?? [];
            grouped.push(expression);
            predicates.set(key, grouped);
        } else if (expression.path.length === 1) {
            conditions.push(comparison(column('lc."id"'), expression));
        } else if (expression.path[1] === "hasPrerequisites") {
            const exists = sql`EXISTS (SELECT 1 FROM data."CatalogCoursePrerequisiteGroup" g JOIN data."CatalogCoursePrerequisiteItem" i ON i."groupId" = g."id" WHERE g."catalogCourseId" = lc."id")`;
            conditions.push(
                sql`lc."id" IS NOT NULL`,
                expression.values[0] === "true" ? exists : sql`NOT ${exists}`
            );
        } else {
            const target = latestColumns[expression.path.slice(1).join(".")];
            if (!target) throw new Error(`Unsupported catalog field: ${path}`);
            conditions.push(
                sql`lc."id" IS NOT NULL`,
                comparison(target, expression)
            );
        }
    }
    for (const expressions of predicates.values())
        conditions.push(
            sql`lc."id" IS NOT NULL`,
            prerequisitePredicate(expressions)
        );
    return joinAnd(conditions);
}

export async function listCoursesWithCatalogFilters(
    prisma: PrismaClient,
    query: ListQueryParams
) {
    const pagination = resolvePagination(query, coursePagination);
    const where = courseSqlWhere(query.filter ?? []);
    const from = sql`FROM data."Course" c
        LEFT JOIN data."Unit" u ON u."id" = c."unitId"
        LEFT JOIN LATERAL (
            SELECT cc.*, cat."year" AS "catalogYear"
            FROM data."CatalogCourse" cc JOIN data."Catalog" cat ON cat."id" = cc."catalogId"
            WHERE cc."courseId" = c."id" ORDER BY cat."year" DESC LIMIT 1
        ) lc ON TRUE WHERE ${where}`;
    const ordering = resolveSort(query.sort, courseSort).map((term) => {
        const target = sortColumns[term.field];
        if (!target) throw new Error(`Unsupported course sort: ${term.field}`);
        return sql`${target} ${term.direction === "asc" ? sql`ASC` : sql`DESC`}`;
    });
    const limit =
        pagination.mode === "all"
            ? sql``
            : sql`LIMIT ${pagination.take} OFFSET ${pagination.skip}`;
    return prisma.$transaction(
        async (tx) => {
            const [count] = await tx.$queryRaw<Array<{ total: bigint }>>(
                sql`SELECT count(*) AS total ${from}`
            );
            const ids = await tx.$queryRaw<Array<{ id: number }>>(
                sql`SELECT c."id" ${from} ORDER BY ${MyPrisma.join(ordering)} ${limit}`
            );
            const records = ids.length
                ? await tx.course.findMany({
                      ...courseEntity.selection,
                      where: { id: { in: ids.map((item) => item.id) } }
                  })
                : [];
            const byId = new Map(records.map((item) => [item.id, item]));
            return {
                total: Number(count?.total ?? 0),
                pagination,
                items: ids.map(({ id }) => {
                    const record = byId.get(id);
                    if (!record)
                        throw new Error(
                            "Course disappeared during consistent read"
                        );
                    return courseEntity.build(record);
                })
            };
        },
        { isolationLevel: MyPrisma.TransactionIsolationLevel.RepeatableRead }
    );
}
