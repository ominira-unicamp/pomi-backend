import { extendZodWithOpenApi } from "@asteasolutions/zod-to-openapi";
import z from "zod";

extendZodWithOpenApi(z);

export const DayOfWeekSchema = z
    .enum([
        "MONDAY",
        "TUESDAY",
        "WEDNESDAY",
        "THURSDAY",
        "FRIDAY",
        "SATURDAY",
        "SUNDAY"
    ])
    .openapi("DayOfWeek", {
        "x-pomi-schema": {
            kind: "value-object",
            publicName: "DayOfWeek"
        }
    });

export const YearPeriodSchema = z
    .enum(["SUMMER", "FIRST_SEMESTER", "WINTER", "SECOND_SEMESTER"])
    .openapi("YearPeriod", {
        "x-pomi-schema": {
            kind: "value-object",
            publicName: "YearPeriod"
        }
    });
