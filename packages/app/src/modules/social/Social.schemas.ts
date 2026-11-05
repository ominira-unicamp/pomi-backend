import { extendZodWithOpenApi } from "@asteasolutions/zod-to-openapi";
import { DayOfWeekSchema, pathParam } from "@pomi/api-core";
import z from "zod";
extendZodWithOpenApi(z);

const profileVisibilitySchema = z
    .enum(["PRIVATE", "FRIENDS", "PUBLIC"])
    .openapi("StudentProfileVisibility", {
        "x-pomi-schema": {
            kind: "value-object",
            publicName: "StudentProfileVisibility"
        }
    });
const friendshipStatusSchema = z
    .enum(["PENDING", "ACCEPTED"])
    .openapi("UserFriendshipStatus", {
        "x-pomi-schema": {
            kind: "value-object",
            publicName: "UserFriendshipStatus"
        }
    });
const friendshipDirectionSchema = z
    .enum(["INCOMING", "OUTGOING", "NONE"])
    .openapi("UserFriendshipDirection", {
        "x-pomi-schema": {
            kind: "value-object",
            publicName: "UserFriendshipDirection"
        }
    });

export const sidPath = z.object({
    userId: pathParam.integer()
});
export const publicIdPath = sidPath.extend({ publicId: z.string().uuid() });
export const friendshipPath = sidPath.extend({
    id: pathParam.integer()
});
const academicReference = z
    .object({ code: z.union([z.string(), z.number()]), name: z.string() })
    .strict();
const currentCourse = z
    .object({
        courseCode: z.string(),
        courseName: z.string(),
        classCode: z.string().nullable(),
        schedules: z
            .array(
                z
                    .object({
                        id: z.number().int().positive(),
                        dayOfWeek: DayOfWeekSchema,
                        start: z.string(),
                        end: z.string(),
                        roomCode: z.string()
                    })
                    .strict()
            )
            .readonly()
    })
    .strict()
    .openapi("StudentCurrentCourse", {
        "x-pomi-schema": { kind: "entity", publicName: "StudentCurrentCourse" }
    });
export const person = z
    .object({
        publicId: z.string().uuid(),
        displayName: z.string(),
        avatarMediaId: z.uuid().nullable(),
        bio: z.string().nullable(),
        interests: z
            .array(
                z
                    .object({
                        id: z.number().int().positive(),
                        name: z.string()
                    })
                    .strict()
            )
            .readonly(),
        currentCourses: z.array(currentCourse).readonly(),
        program: academicReference.nullable(),
        specialization: academicReference.nullable(),
        entryYear: z.number().int().nullable()
    })
    .strict()
    .openapi("UserPublicPerson", {
        "x-pomi-schema": {
            kind: "entity",
            publicName: "UserPublicPerson",
            identityFields: ["publicId"],
            relations: {
                currentCourses: { resource: "courses", cardinality: "many" },
                program: {
                    resource: "programs",
                    cardinality: "one",
                    nullable: true
                },
                specialization: {
                    resource: "specializations",
                    cardinality: "one",
                    nullable: true
                }
            }
        }
    });
export const ownProfile = person
    .extend({
        enabled: z.boolean(),
        currentCoursesVisibility: profileVisibilitySchema
    })
    .strict()
    .openapi("UserProfile", {
        "x-pomi-schema": {
            kind: "entity",
            publicName: "UserProfile",
            identityFields: ["publicId"]
        }
    });
export const friendship = z
    .object({
        id: z.number().int(),
        status: friendshipStatusSchema,
        direction: friendshipDirectionSchema,
        friend: person,
        createdAt: z.string().datetime(),
        acceptedAt: z.string().datetime().nullable()
    })
    .strict()
    .openapi("UserFriendship", {
        "x-pomi-schema": {
            kind: "entity",
            publicName: "UserFriendship",
            identityFields: ["id"],
            relations: {
                friend: { resource: "studentSocial", cardinality: "one" }
            }
        }
    });
export const profileBody = z
    .object({
        enabled: z.boolean().optional(),
        displayName: z.string().trim().min(1).max(80).nullable().optional(),
        bio: z.string().trim().max(280).nullable().optional(),
        currentCoursesVisibility: profileVisibilitySchema.optional()
    })
    .strict();
