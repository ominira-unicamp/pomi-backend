import IO from "#/modules/academic/unit/Unit.contract.js";
import { MyPrisma } from "@pomi/db";
import z from "zod";

// eslint-disable-next-line @typescript-eslint/no-empty-object-type
type PrismaUnitPayload = MyPrisma.UnitGetPayload<{}>;

function buildUnitEntity(unit: PrismaUnitPayload): z.infer<typeof IO.schema> {
    return unit;
}

export default {
    build: buildUnitEntity
};
