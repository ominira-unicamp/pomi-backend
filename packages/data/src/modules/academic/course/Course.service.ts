import type {
    CourseFilter,
    CourseFilterName
} from "#/modules/academic/course/Course.contract.js";
import IO, {
    coursePagination
} from "#/modules/academic/course/Course.contract.js";
import courseEntity from "#/modules/academic/course/Course.entity.js";
import { courseNotFoundProblem } from "#/modules/academic/course/Course.problems.js";
import {
    compileFilterWhere,
    err,
    ok,
    prismaPaginationParams,
    prismaWhereFor,
    resolvePagination,
    type FilterWhereBuilder,
    type ResolvedPagination,
    type Result
} from "@pomi/api-core";
import type { MyPrisma, PrismaClient } from "@pomi/db";
import z from "zod";

type CourseEntity = z.infer<typeof IO.schema>;
type ListQueryParams = z.infer<typeof IO.list.request>["query"];

const courseWhere = prismaWhereFor<MyPrisma.CourseWhereInput>();
const courseWhereDefinitions = {
    "catalogYear": courseWhere.numberAt("catalogCourses.some.catalog.year"),
    "code": courseWhere.stringAt("code"),
    "credits": courseWhere.numberAt("credits"),
    "tagId": courseWhere.numberAt("courseTags.some.tagId"),
    "unit.code": courseWhere.stringAt("unit.code"),
    "unit.id": courseWhere.numberAt("unit.id")
} satisfies Record<
    CourseFilterName,
    FilterWhereBuilder<MyPrisma.CourseWhereInput>
>;

export function courseFilterWhere(
    filter: CourseFilter | undefined
): MyPrisma.CourseWhereInput[] {
    return compileFilterWhere<MyPrisma.CourseWhereInput>(
        filter,
        courseWhereDefinitions,
        "course"
    );
}

export type CourseService = {
    list(input: ListQueryParams): Promise<{
        items: CourseEntity[];
        total: number;
        pagination: ResolvedPagination;
    }>;
    getById(
        id: number
    ): Promise<Result<CourseEntity, ReturnType<typeof courseNotFoundProblem>>>;
};

export function createCourseService({
    prisma
}: {
    prisma: PrismaClient;
}): CourseService {
    return {
        async list(query) {
            const pagination = resolvePagination(query, coursePagination);
            const filterWhere = courseFilterWhere(query.filter);
            const where: MyPrisma.CourseWhereInput =
                filterWhere.length > 0 ? { AND: filterWhere } : {};
            const total = await prisma.course.count({ where });
            const courses = await prisma.course.findMany({
                ...prismaPaginationParams(pagination),
                ...courseEntity.selection,
                where,
                orderBy: [{ code: "asc" }, { id: "asc" }]
            });
            return {
                items: courses.map(courseEntity.build),
                total,
                pagination
            };
        },
        async getById(id) {
            const course = await prisma.course.findUnique({
                ...courseEntity.selection,
                where: { id }
            });
            return course
                ? ok(courseEntity.build(course))
                : err(courseNotFoundProblem());
        }
    };
}
