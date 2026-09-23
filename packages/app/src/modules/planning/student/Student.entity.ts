import IO from "#/modules/planning/student/Student.contract.js";
import { MyPrisma } from "@pomi/db";
import z from "zod";

// eslint-disable-next-line @typescript-eslint/no-empty-object-type
type PrismaStudentPayload = MyPrisma.StudentGetPayload<{}>;

function buildStudentEntity(
    student: PrismaStudentPayload
): z.infer<typeof IO.schema> {
    return student;
}

export default {
    build: buildStudentEntity
};
