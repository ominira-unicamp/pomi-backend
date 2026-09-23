import IO from "#/modules/schedule/study-period/StudyPeriod.contract.js";
import { MyPrisma } from "@pomi/db";
import z from "zod";

// eslint-disable-next-line @typescript-eslint/no-empty-object-type
type PrismaStudyPeriodPayload = MyPrisma.StudyPeriodGetPayload<{}>;

function buildStudyPeriodEntity(
    studyPeriod: PrismaStudyPeriodPayload
): z.infer<typeof IO.schema> {
    return studyPeriod;
}

export default {
    build: buildStudyPeriodEntity
};
