import IO, {
    courseSummarySort,
    professorSummarySort
} from "#/modules/academic/evaluation-summary/EvaluationSummary.contract.js";
import {
    compareBySort,
    err,
    ok,
    resolveSort,
    ResourceNotFoundProblem,
    type Filter,
    type Result
} from "@pomi/api-core";
import type { PrismaClient } from "@pomi/db";
import z from "zod";

export const MINIMUM_PUBLISHED_RESPONSES = 5;

type Metrics = {
    responseCount: number;
    wouldTakeAgain: number;
    fairness: number;
    clarity: number;
    difficulty: number;
};
type ProfessorSummary = z.infer<typeof IO.professorSummary>;
type CourseSummary = z.infer<typeof IO.courseSummary>;
type PairSummary = z.infer<typeof IO.pairSummary>;
type ProfessorSummaryQuery = z.infer<
    typeof IO.professorSummaries.request.shape.query
>;
type CourseSummaryQuery = z.infer<
    typeof IO.courseSummaries.request.shape.query
>;

type Aggregate = {
    _count: { _all: number };
    _avg: {
        wouldTakeAgain: number | null;
        fairness: number | null;
        clarity: number | null;
        difficulty: number | null;
    };
};

function metricsFromAggregate(aggregate: Aggregate): Metrics {
    return {
        responseCount: aggregate._count._all,
        wouldTakeAgain: aggregate._avg.wouldTakeAgain ?? 0,
        fairness: aggregate._avg.fairness ?? 0,
        clarity: aggregate._avg.clarity ?? 0,
        difficulty: aggregate._avg.difficulty ?? 0
    };
}

function mergeMetrics(items: Metrics[]): Metrics {
    const responseCount = items.reduce(
        (total, item) => total + item.responseCount,
        0
    );
    const weighted = (field: keyof Omit<Metrics, "responseCount">) =>
        items.reduce(
            (total, item) => total + item[field] * item.responseCount,
            0
        ) / responseCount;
    return {
        responseCount,
        wouldTakeAgain: weighted("wouldTakeAgain"),
        fairness: weighted("fairness"),
        clarity: weighted("clarity"),
        difficulty: weighted("difficulty")
    };
}

function isPublished(metrics: Metrics) {
    return metrics.responseCount >= MINIMUM_PUBLISHED_RESPONSES;
}

export type EvaluationSummaryService = {
    listProfessorSummaries(
        input: ProfessorSummaryQuery
    ): Promise<ProfessorSummary[]>;
    listCourseSummaries(input: CourseSummaryQuery): Promise<CourseSummary[]>;
    getPairSummary(
        filter: Filter
    ): Promise<
        Result<PairSummary, ReturnType<typeof ResourceNotFoundProblem.create>>
    >;
};

export function createEvaluationSummaryService({
    prisma
}: {
    prisma: PrismaClient;
}): EvaluationSummaryService {
    return {
        async listProfessorSummaries(input) {
            const aggregates = await prisma.professorEvaluation.groupBy({
                by: ["professorId"],
                _count: { _all: true },
                _avg: {
                    wouldTakeAgain: true,
                    fairness: true,
                    clarity: true,
                    difficulty: true
                }
            });
            const published = aggregates
                .map((aggregate) => ({
                    professorId: aggregate.professorId,
                    metrics: metricsFromAggregate(aggregate)
                }))
                .filter(({ metrics }) => isPublished(metrics));
            if (published.length === 0) return [];

            const professorFilter = input.filter?.find(
                (expression) => expression.path[0] === "professorId"
            );
            const professors = await prisma.professor.findMany({
                where: {
                    id: professorFilter
                        ? Number(professorFilter.values[0])
                        : { in: published.map((item) => item.professorId) }
                },
                select: { id: true, name: true }
            });
            const metricsByProfessorId = new Map(
                published.map(({ professorId, metrics }) => [
                    professorId,
                    metrics
                ])
            );
            return professors
                .map((professor) => ({
                    professor,
                    ...metricsByProfessorId.get(professor.id)!
                }))
                .sort(
                    compareBySort(
                        resolveSort(input.sort, professorSummarySort),
                        {
                            "professor.name": (left, right) =>
                                left.professor.name.localeCompare(
                                    right.professor.name
                                ),
                            "responseCount": (left, right) =>
                                left.responseCount - right.responseCount,
                            "wouldTakeAgain": (left, right) =>
                                left.wouldTakeAgain - right.wouldTakeAgain,
                            "fairness": (left, right) =>
                                left.fairness - right.fairness,
                            "clarity": (left, right) =>
                                left.clarity - right.clarity,
                            "difficulty": (left, right) =>
                                left.difficulty - right.difficulty,
                            "professor.id": (left, right) =>
                                left.professor.id - right.professor.id
                        }
                    )
                );
        },
        async listCourseSummaries(input) {
            const aggregates = await prisma.professorEvaluation.groupBy({
                by: ["classId"],
                _count: { _all: true },
                _avg: {
                    wouldTakeAgain: true,
                    fairness: true,
                    clarity: true,
                    difficulty: true
                }
            });
            if (aggregates.length === 0) return [];

            const classes = await prisma.class.findMany({
                where: {
                    id: { in: aggregates.map((aggregate) => aggregate.classId) }
                },
                select: {
                    id: true,
                    course: { select: { id: true, code: true, name: true } }
                }
            });
            const courseIdByClassId = new Map(
                classes.map((classData) => [classData.id, classData.course])
            );
            const metricsByCourseId = new Map<number, Metrics[]>();
            for (const aggregate of aggregates) {
                const course = courseIdByClassId.get(aggregate.classId);
                if (!course) continue;
                const courseMetrics = metricsByCourseId.get(course.id) ?? [];
                courseMetrics.push(metricsFromAggregate(aggregate));
                metricsByCourseId.set(course.id, courseMetrics);
            }
            const courseIdFilter = input.filter?.find(
                (expression) => expression.path[0] === "courseId"
            );
            const courseCodeFilter = input.filter?.find(
                (expression) => expression.path[0] === "courseCode"
            );
            return [...metricsByCourseId.entries()]
                .map(([courseId, metrics]) => ({
                    course: classes.find(
                        (classData) => classData.course.id === courseId
                    )!.course,
                    ...mergeMetrics(metrics)
                }))
                .filter(isPublished)
                .filter(
                    (summary) =>
                        (courseIdFilter === undefined ||
                            summary.course.id ===
                                Number(courseIdFilter.values[0])) &&
                        (courseCodeFilter === undefined ||
                            summary.course.code === courseCodeFilter.values[0])
                )
                .sort(
                    compareBySort(resolveSort(input.sort, courseSummarySort), {
                        "course.code": (left, right) =>
                            left.course.code.localeCompare(right.course.code),
                        "course.name": (left, right) =>
                            left.course.name.localeCompare(right.course.name),
                        "responseCount": (left, right) =>
                            left.responseCount - right.responseCount,
                        "wouldTakeAgain": (left, right) =>
                            left.wouldTakeAgain - right.wouldTakeAgain,
                        "fairness": (left, right) =>
                            left.fairness - right.fairness,
                        "clarity": (left, right) =>
                            left.clarity - right.clarity,
                        "difficulty": (left, right) =>
                            left.difficulty - right.difficulty,
                        "course.id": (left, right) =>
                            left.course.id - right.course.id
                    })
                );
        },
        async getPairSummary(filter) {
            const courseId = Number(
                filter.find((expression) => expression.path[0] === "courseId")
                    ?.values[0]
            );
            const professorId = Number(
                filter.find(
                    (expression) => expression.path[0] === "professorId"
                )?.values[0]
            );
            const [course, professor, aggregates] = await Promise.all([
                prisma.course.findUnique({
                    where: { id: courseId },
                    select: { id: true, code: true, name: true }
                }),
                prisma.professor.findUnique({
                    where: { id: professorId },
                    select: { id: true, name: true }
                }),
                prisma.professorEvaluation.groupBy({
                    by: ["classId"],
                    where: { professorId, class: { courseId } },
                    _count: { _all: true },
                    _avg: {
                        wouldTakeAgain: true,
                        fairness: true,
                        clarity: true,
                        difficulty: true
                    }
                })
            ]);
            if (!course || !professor || aggregates.length === 0)
                return err(
                    ResourceNotFoundProblem.create({
                        detail: "Nenhum sumário público foi encontrado para o professor e a disciplina."
                    })
                );
            const metrics = mergeMetrics(aggregates.map(metricsFromAggregate));
            return isPublished(metrics)
                ? ok({ course, professor, ...metrics })
                : err(
                      ResourceNotFoundProblem.create({
                          detail: "Nenhum sumário público foi encontrado para o professor e a disciplina."
                      })
                  );
        }
    };
}
