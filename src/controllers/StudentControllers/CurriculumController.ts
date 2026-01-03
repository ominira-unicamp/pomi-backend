import { Router } from 'express'
import type { Request, Response } from "express";
import { extendZodWithOpenApi, OpenAPIRegistry } from '@asteasolutions/zod-to-openapi';
import z, { boolean, success, ZodAny, ZodType } from 'zod';

import prisma, { MyPrisma } from '../../PrismaClient.js'
import { AuthRegistry } from '../../auth.js';
import { resourcesPaths } from '../../Controllers.js';
import ResponseBuilder from '../../openapi/ResponseBuilder.js';
import { ValidationError, ValidationErrorField, ValidationErrorType, ZodToApiError } from '../../Validation.js';
import RequestBuilder from '../../openapi/RequestBuilder.js';
import { ParamsDictionary } from 'express-serve-static-core';
import { defaultGetHandler, defaultOpenApiGetPath } from '../../defaultEndpoint.js';

extendZodWithOpenApi(z);

const router = Router()
const authRegistry = new AuthRegistry();
const registry = new OpenAPIRegistry()


const prismaCurriculumFieldSelection = {
	include: {
		CurriculumCourses: {
			select: {
				courseId: true,
				semester: true,
				course: {
					select: {
						code: true,
						name: true,
					}
				}
			}
		},
	},
} as const satisfies MyPrisma.CurriculumDefaultArgs;


const relatedPathsForCurriculum = (curriculumId: number) => {
	return {
		student: resourcesPaths.student.entity(curriculumId),
	}
}
type PrismaCurriculumPayload = MyPrisma.CurriculumGetPayload<typeof prismaCurriculumFieldSelection>;

function buildCurriculumEntity(curriculum: PrismaCurriculumPayload): z.infer<typeof curriculumEntity> {
	const { CurriculumCourses, ...rest } = curriculum;
	return {
		...rest,
		courses: CurriculumCourses.map(({ courseId, course, semester }) => ({
			courseId: courseId,
			semester,
			name: course.name,
			code: course.code,
		})),
		_paths: relatedPathsForCurriculum(curriculum.id)
	};
}
const curriculumBase = z.object({
	id: z.number().int(),
	studentId: z.number().int(),
	courses: z.array(z.object({
		courseId: z.number().int(),
		semester: z.number().int().nullable(),
		name: z.string(),
		code: z.string(),
	})).optional(),
}).strict();

const curriculumEntity = curriculumBase.extend({
	_paths: z.object({
		student: z.string(),
	})
}).strict().openapi('CurriculumEntity');

registry.registerPath({
	method: 'get',
	path: '/student/{sid}/curricula',
	tags: ['curriculum'],
	responses: new ResponseBuilder()
		.ok(z.array(curriculumEntity), "A list of curriculums")
		.internalServerError()
		.build(),
});
async function list(req: Request, res: Response) {
	const { data, error, success } = z.coerce.number().int().safeParse(req.params.sid);
	if (!success) {
		res.status(400).json(new ValidationError(ZodToApiError(error, ['path', 'sid'])));
		return;
	}
	const sid = data;
	prisma.curriculum.findMany({
		...prismaCurriculumFieldSelection,
		where: {
			studentId: sid,
		}
	}).then((curriculums) => {
		const entities: z.infer<typeof curriculumEntity>[] = curriculums.map(buildCurriculumEntity);

		res.json(z.array(curriculumEntity).parse(entities));
	})
}
router.get('/student/:sid/curricula', list)

authRegistry.addException('GET', '/curricula/:id');
registry.registerPath(defaultOpenApiGetPath(
	'/student/{sid}/curricula/{id}',
	'curriculum',
	curriculumEntity,
	"A curriculum by id"
));
router.get('/student/:sid/curricula/:id', defaultGetHandler(
	prisma.curriculum,
	prismaCurriculumFieldSelection,
	buildCurriculumEntity,
	"Curriculum not found"
)) 
registry.registerPath({
	method: 'post',
	path: '/student/{sid}/curricula',
	tags: ['curriculum'],
	request: new RequestBuilder()
		.build(),
	responses: new ResponseBuilder()
		.created(curriculumEntity, "Curriculum created successfully")
		.badRequest()
		.internalServerError()
		.build(),
});

async function create(req: Request, res: Response) {
	const { success, data, error } = z.coerce.number().int().safeParse(req.params.sid);
	const errors = new ValidationError([]);
	if (!success)
		errors.addErrors(ZodToApiError(error, []));
	if (errors.errors.length > 0 || !success) {
		res.status(400).json(errors);
		return;
	}
	const sid = data;

	const curriculum = await prisma.curriculum.create({
		...prismaCurriculumFieldSelection,
		data: {
			studentId: sid,
		},
	});

	const entity: z.infer<typeof curriculumEntity> = buildCurriculumEntity(curriculum);

	res.status(201).json(curriculumEntity.encode(entity));
}
router.post('/student/:sid/curricula', create)



const patchCurriculumBody = curriculumBase
	.omit({ id: true })
	.partial()
	.strict()
	.openapi('PatchCurriculumBody');


registry.registerPath({
	method: 'patch',
	path: '/student/{sid}/curricula/{id}',
	tags: ['curriculum'],
	request: new RequestBuilder()
		.params(z.object({
			id: z.int(),
		}).strict())
		.body(patchCurriculumBody, "Curriculum fields to update")
		.build(),
	responses: new ResponseBuilder()
		.ok(curriculumEntity, "Curriculum patched successfully")
		.badRequest()
		.notFound()
		.internalServerError()
		.build(),
});

async function patch(req: Request, res: Response) {

	const { success, data, error } = z.object({
		params: z.object({
			id: z.coerce.number().int(),
		}).strict(),
		body: patchCurriculumBody,
	}).safeParse(req)
	if (!success) {
		res.status(400).json(error);
		return;
	}
	const { params: { id }, body } = data;
	const existing = await prisma.curriculum.findUnique({ where: { id } });
	if (!existing) {
		res.status(404).json({ error: "Curriculum not found" });
		return;
	}

	const curriculum = await prisma.curriculum.update({
		...prismaCurriculumFieldSelection,
		where: { id },
		data: {
			...(body.studentId !== undefined && { studentId: body.studentId }),
		},
	});
	res.json(buildCurriculumEntity(curriculum));
}
router.patch('/student/:sid/curricula/:id', patch)

registry.registerPath({
	method: 'delete',
	path: '/student/{sid}/curricula/{id}',
	tags: ['curriculum'],
	request: {
		params: z.object({
			id: z.int(),
		}).strict(),
	},
	responses: new ResponseBuilder()
		.noContent()
		.badRequest()
		.notFound()
		.internalServerError()
		.build(),
});

async function remove(req: Request, res: Response) {
	const { success, data: id, error } = z.coerce.number().int().safeParse(req.params.id);
	if (!success) {
		res.status(400).json(error);
		return;
	}
	const existing = await prisma.studyPeriod.findUnique({ where: { id: id } });
	if (!existing) {
		res.status(404).json({ error: "Study period not found" });
		return;
	}
	await prisma.studyPeriod.delete({ where: { id } });
	res.status(204).send();
}
router.delete('/student/:sid/curricula/:id', remove)

function entityPath(studentId: number, curriculumId: number) {
	return `/student/${studentId}/curricula/${curriculumId}`;
}

export default {
	router,
	registry,
	authRegistry,
	paths: {
		entity: entityPath,
	},
}

