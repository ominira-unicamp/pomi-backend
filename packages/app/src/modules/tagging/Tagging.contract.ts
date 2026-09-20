import { policies } from "#/Authorization.js";
import { OutputBuilder, type IO } from "#/Contract.js";
import { extendZodWithOpenApi } from "@asteasolutions/zod-to-openapi";
import {
    createPaginationQuerySchema,
    defineSort,
    filterDefinition,
    getPaginatedSchema,
    paginatedByDefault,
    paginationQuerySchema,
    pathSeg,
    ReferenceNotFoundProblemSchema,
    resourceFilterSchema,
    resourceSortSchema,
    UniqueConstraintConflictProblemSchema,
    unpaginatedByDefault,
    type Filter
} from "@pomi/api-core";
import z from "zod";

extendZodWithOpenApi(z);

const id = z.coerce.number().int().positive();
const entityId = z.object({ id }).strict();
const category = z
    .object({ id: z.number().int(), name: z.string().min(1) })
    .strict()
    .openapi("Category", {
        "x-pomi-schema": {
            kind: "entity",
            publicName: "Category",
            identityFields: ["id"]
        }
    });
const tag = z
    .object({
        id: z.number().int(),
        name: z.string().min(1),
        categoryId: z.number().int(),
        parentTagId: z.number().int().nullable()
    })
    .strict()
    .openapi("Tag", {
        "x-pomi-schema": {
            kind: "entity",
            publicName: "Tag",
            identityFields: ["id"]
        }
    });
export const relatedCourse = z
    .object({
        id: z.number().int(),
        code: z.string().min(1),
        name: z.string().min(1),
        credits: z.number().int().min(0)
    })
    .strict()
    .openapi("TagRelatedCourse", {
        "x-pomi-schema": {
            kind: "entity",
            publicName: "TagRelatedCourse",
            identityFields: ["id"]
        }
    });
const categoryBody = z.object({ name: z.string().trim().min(1) }).strict();
const tagBody = z
    .object({
        name: z.string().trim().min(1),
        categoryId: id,
        parentTagId: id.nullable()
    })
    .strict();
const courseTagPath = z.object({ courseId: id, tagId: id }).strict();
const coursePath = z.object({ courseId: id }).strict();

const categories = [pathSeg.literal("categories")];
const tags = [pathSeg.literal("tags")];

const tagFilter = resourceFilterSchema(
    {
        categoryId: filterDefinition.id({ positive: true }),
        parentTagId: filterDefinition.id({ positive: true }),
        courseId: filterDefinition.id({ positive: true })
    },
    "tags",
    "Structured tag filters. Use filter[categoryId]=1 or filter[courseId]=2.",
    { categoryId: 1 }
);
export type TagFilter = Filter;
export const categorySort = defineSort({
    resourceName: "categories",
    sortableFields: ["name"] as const,
    defaultSort: [{ field: "name", direction: "asc" }] as const,
    tieBreakers: [{ field: "id", direction: "asc" }] as const
});
export const tagSort = defineSort({
    resourceName: "tags",
    sortableFields: ["name", "categoryId"] as const,
    defaultSort: [{ field: "name", direction: "asc" }] as const,
    tieBreakers: [{ field: "id", direction: "asc" }] as const
});
export const tagCourseSort = defineSort({
    resourceName: "tag courses",
    sortableFields: ["code", "name", "credits"] as const,
    defaultSort: [{ field: "code", direction: "asc" }] as const,
    tieBreakers: [{ field: "id", direction: "asc" }] as const
});

const listCategories = {
    meta: {
        operationId: "listCategories",
        sdk: {
            resource: "categories",
            method: "list",
            action: "list" as const
        },
        method: "get" as const,
        path: categories,
        tags: ["categories"],
        authorization: policies.public,
        queryFeatures: { sort: true },
        pagination: unpaginatedByDefault
    },
    request: z.object({
        query: createPaginationQuerySchema(unpaginatedByDefault, {
            sort: resourceSortSchema(categorySort).optional()
        }).strict()
    }),
    response: new OutputBuilder()
        .ok(getPaginatedSchema(category), "Categorias recuperadas")
        .build()
} satisfies IO;
const getCategory = {
    meta: {
        operationId: "getCategory",
        sdk: {
            resource: "categories",
            method: "get",
            action: "get" as const,
            pathParameters: { id: "categoryId" }
        },
        method: "get" as const,
        path: [...categories, pathSeg.param("id")],
        tags: ["categories"],
        authorization: policies.public
    },
    request: z.object({ path: entityId }),
    response: new OutputBuilder()
        .ok(category, "Categoria recuperada")
        .notFound()
        .build()
} satisfies IO;
const listTags = {
    meta: {
        operationId: "listTags",
        sdk: {
            resource: "tags",
            method: "list",
            action: "list" as const
        },
        method: "get" as const,
        path: tags,
        tags: ["tags"],
        authorization: policies.public,
        queryFeatures: { filter: true, sort: true },
        pagination: unpaginatedByDefault
    },
    request: z.object({
        query: createPaginationQuerySchema(unpaginatedByDefault, {
            filter: tagFilter.optional(),
            sort: resourceSortSchema(tagSort).optional()
        })
            .strict()
            .openapi("ListTagsQuery", {
                "x-pomi-schema": { kind: "input", publicName: "ListTagsQuery" }
            })
    }),
    response: new OutputBuilder()
        .ok(getPaginatedSchema(tag), "Tags recuperadas")
        .build()
} satisfies IO;
const getTag = {
    meta: {
        operationId: "getTag",
        sdk: {
            resource: "tags",
            method: "get",
            action: "get" as const,
            pathParameters: { id: "tagId" }
        },
        method: "get" as const,
        path: [...tags, pathSeg.param("id")],
        tags: ["tags"],
        authorization: policies.public
    },
    request: z.object({ path: entityId }),
    response: new OutputBuilder().ok(tag, "Tag recuperada").notFound().build()
} satisfies IO;
const listCourseTags = {
    meta: {
        operationId: "listCourseTags",
        sdk: {
            resource: "courseTags",
            method: "listForCourse",
            action: "list" as const,
            pathParameters: { courseId: "courseId" }
        },
        method: "get" as const,
        path: [
            pathSeg.literal("courses"),
            pathSeg.param("courseId"),
            pathSeg.literal("tags")
        ],
        tags: ["course-tags"],
        authorization: policies.public,
        queryFeatures: { sort: true },
        pagination: unpaginatedByDefault
    },
    request: z.object({
        path: coursePath,
        query: createPaginationQuerySchema(unpaginatedByDefault, {
            sort: resourceSortSchema(tagSort).optional()
        })
    }),
    response: new OutputBuilder()
        .ok(getPaginatedSchema(tag), "Tags da disciplina recuperadas")
        .notFound()
        .build()
} satisfies IO;
const listTagCourses = {
    meta: {
        operationId: "listTagCourses",
        sdk: {
            resource: "courseTags",
            method: "listCoursesForTag",
            action: "list" as const,
            pathParameters: { id: "tagId" }
        },
        method: "get" as const,
        path: [...tags, pathSeg.param("id"), pathSeg.literal("courses")],
        tags: ["course-tags"],
        authorization: policies.public,
        queryFeatures: { sort: true },
        pagination: paginatedByDefault
    },
    request: z.object({
        path: entityId,
        query: paginationQuerySchema
            .extend({ sort: resourceSortSchema(tagCourseSort).optional() })
            .strict()
    }),
    response: new OutputBuilder()
        .ok(
            getPaginatedSchema(relatedCourse),
            "Disciplinas correlatas recuperadas"
        )
        .notFound()
        .build()
} satisfies IO;

const createCategory = {
    meta: {
        operationId: "createCategory",
        sdk: {
            resource: "categories",
            method: "create",
            action: "create" as const
        },
        method: "post" as const,
        path: categories,
        tags: ["categories"],
        authorization: policies.authenticated
    },
    request: z.object({ body: categoryBody }),
    response: new OutputBuilder()
        .created(category, "Categoria criada")
        .problem(
            409,
            UniqueConstraintConflictProblemSchema,
            "Categoria já existe"
        )
        .build()
} satisfies IO;
const updateCategory = {
    meta: {
        operationId: "updateCategory",
        sdk: {
            resource: "categories",
            method: "update",
            action: "update" as const,
            pathParameters: { id: "categoryId" }
        },
        method: "put" as const,
        path: [...categories, pathSeg.param("id")],
        tags: ["categories"],
        authorization: policies.authenticated
    },
    request: z.object({ path: entityId, body: categoryBody }),
    response: new OutputBuilder()
        .ok(category, "Categoria atualizada")
        .notFound()
        .problem(
            409,
            UniqueConstraintConflictProblemSchema,
            "Categoria já existe"
        )
        .build()
} satisfies IO;
const deleteCategory = {
    meta: {
        operationId: "deleteCategory",
        sdk: {
            resource: "categories",
            method: "delete",
            action: "delete" as const,
            pathParameters: { id: "categoryId" }
        },
        method: "delete" as const,
        path: [...categories, pathSeg.param("id")],
        tags: ["categories"],
        authorization: policies.authenticated
    },
    request: z.object({ path: entityId }),
    response: new OutputBuilder()
        .noContent("Categoria removida")
        .notFound()
        .problem(
            409,
            UniqueConstraintConflictProblemSchema,
            "Categoria possui dependências"
        )
        .build()
} satisfies IO;
const createTag = {
    meta: {
        operationId: "createTag",
        sdk: {
            resource: "tags",
            method: "create",
            action: "create" as const
        },
        method: "post" as const,
        path: tags,
        tags: ["tags"],
        authorization: policies.authenticated
    },
    request: z.object({ body: tagBody }),
    response: new OutputBuilder()
        .created(tag, "Tag criada")
        .problem(409, UniqueConstraintConflictProblemSchema, "Tag já existe")
        .problem(
            422,
            ReferenceNotFoundProblemSchema,
            "Categoria ou tag pai não encontrada"
        )
        .build()
} satisfies IO;
const updateTag = {
    meta: {
        operationId: "updateTag",
        sdk: {
            resource: "tags",
            method: "update",
            action: "update" as const,
            pathParameters: { id: "tagId" }
        },
        method: "put" as const,
        path: [...tags, pathSeg.param("id")],
        tags: ["tags"],
        authorization: policies.authenticated
    },
    request: z.object({ path: entityId, body: tagBody }),
    response: new OutputBuilder()
        .ok(tag, "Tag atualizada")
        .notFound()
        .problem(409, UniqueConstraintConflictProblemSchema, "Tag já existe")
        .problem(
            422,
            ReferenceNotFoundProblemSchema,
            "Categoria ou tag pai não encontrada"
        )
        .build()
} satisfies IO;
const deleteTag = {
    meta: {
        operationId: "deleteTag",
        sdk: {
            resource: "tags",
            method: "delete",
            action: "delete" as const,
            pathParameters: { id: "tagId" }
        },
        method: "delete" as const,
        path: [...tags, pathSeg.param("id")],
        tags: ["tags"],
        authorization: policies.authenticated
    },
    request: z.object({ path: entityId }),
    response: new OutputBuilder()
        .noContent("Tag removida")
        .notFound()
        .problem(
            409,
            UniqueConstraintConflictProblemSchema,
            "Tag possui dependências"
        )
        .build()
} satisfies IO;
const putCourseTag = {
    meta: {
        operationId: "addCourseTag",
        sdk: {
            resource: "courseTags",
            method: "add",
            action: "update" as const,
            pathParameters: { courseId: "courseId", tagId: "tagId" }
        },
        method: "put" as const,
        path: [
            pathSeg.literal("courses"),
            pathSeg.param("courseId"),
            pathSeg.literal("tags"),
            pathSeg.param("tagId")
        ],
        tags: ["course-tags"],
        authorization: policies.authenticated
    },
    request: z.object({ path: courseTagPath }),
    response: new OutputBuilder()
        .noContent("Tag associada à disciplina")
        .problem(
            422,
            ReferenceNotFoundProblemSchema,
            "Disciplina ou tag não encontrada"
        )
        .build()
} satisfies IO;
const deleteCourseTag = {
    meta: {
        operationId: "removeCourseTag",
        sdk: {
            resource: "courseTags",
            method: "remove",
            action: "delete" as const,
            pathParameters: { courseId: "courseId", tagId: "tagId" }
        },
        method: "delete" as const,
        path: [
            pathSeg.literal("courses"),
            pathSeg.param("courseId"),
            pathSeg.literal("tags"),
            pathSeg.param("tagId")
        ],
        tags: ["course-tags"],
        authorization: policies.authenticated
    },
    request: z.object({ path: courseTagPath }),
    response: new OutputBuilder()
        .noContent("Tag removida da disciplina")
        .problem(
            422,
            ReferenceNotFoundProblemSchema,
            "Disciplina ou tag não encontrada"
        )
        .build()
} satisfies IO;

export type CategoryEntity = z.infer<typeof category>;
export type TagEntity = z.infer<typeof tag>;
export default {
    listCategories,
    getCategory,
    listTags,
    getTag,
    listCourseTags,
    listTagCourses,
    createCategory,
    updateCategory,
    deleteCategory,
    createTag,
    updateTag,
    deleteTag,
    putCourseTag,
    deleteCourseTag
};
