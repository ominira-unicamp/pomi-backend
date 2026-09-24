import IO from "#/modules/catalog/catalog-course/CatalogCourse.contract.js";
import { MyPrisma } from "@pomi/db";
import z from "zod";

export const prismaCatalogCourseSelection = {
    include: {
        catalog: { select: { id: true, year: true } },
        course: { select: { id: true, code: true, credits: true } },
        coordinator: { select: { id: true, name: true } },
        prerequisites: {
            include: {
                items: {
                    select: {
                        courseId: true,
                        fulfillment: true,
                        specialRequirementType: true,
                        specialRequirementValue: true
                    }
                }
            }
        }
    }
} as const satisfies MyPrisma.CatalogCourseDefaultArgs;

type PrismaCatalogCoursePayload = MyPrisma.CatalogCourseGetPayload<
    typeof prismaCatalogCourseSelection
>;

type CatalogCoursePrerequisite = z.infer<
    typeof IO.schema
>["prerequisites"]["any"][number]["all"][number];

function buildCatalogCoursePrerequisite(
    item: PrismaCatalogCoursePayload["prerequisites"][number]["items"][number]
): CatalogCoursePrerequisite {
    if (item.courseId !== null) {
        if (!item.fulfillment)
            throw new Error(
                `Pré-requisito de disciplina ${item.courseId} sem integralização`
            );
        return { courseId: item.courseId, fulfillment: item.fulfillment };
    }
    if (item.fulfillment)
        return { courseId: null, fulfillment: item.fulfillment };
    if (!item.specialRequirementType || item.specialRequirementValue === null)
        throw new Error("Pré-requisito especial incompleto");
    return {
        specialRequirementType: item.specialRequirementType,
        specialRequirementValue: item.specialRequirementValue
    };
}

function buildCatalogCourseEntity(
    catalogCourse: PrismaCatalogCoursePayload
): z.infer<typeof IO.schema> {
    const { catalog, course, coordinator, prerequisites, ...data } =
        catalogCourse;
    return {
        id: data.id,
        catalogId: data.catalogId,
        catalogYear: catalog.year,
        courseId: data.courseId,
        code: course.code,
        name: data.name,
        credits: course.credits,
        coordinator,
        workload: {
            theoreticalHours: data.theoreticalHours,
            practicalHours: data.practicalHours,
            laboratoryHours: data.laboratoryHours,
            guidedActivityHours: data.guidedActivityHours,
            distanceHours: data.distanceHours,
            guidedExtensionHours: data.guidedExtensionHours,
            practicalExtensionHours: data.practicalExtensionHours,
            weeks: data.weeks,
            weeklyClassHours: data.weeklyClassHours,
            classroomHours: data.classroomHours
        },
        offeringPeriod: data.offeringPeriod,
        evaluation: data.evaluation,
        finalExam: data.finalExam,
        minimumAttendancePercent: data.minimumAttendancePercent,
        syllabus: data.syllabus,
        bibliography: data.bibliography,
        sourceUrl: data.sourceUrl,
        prerequisites: {
            any: prerequisites.map((group) => ({
                all: group.items.map(buildCatalogCoursePrerequisite)
            }))
        }
    };
}

export default {
    build: buildCatalogCourseEntity,
    selection: prismaCatalogCourseSelection
};
