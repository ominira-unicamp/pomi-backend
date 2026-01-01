import { Router } from 'express'
import type { Request, Response } from "express";
import { extendZodWithOpenApi, OpenAPIRegistry } from '@asteasolutions/zod-to-openapi';
import z, { success, ZodAny, ZodType } from 'zod';

import prisma, { MyPrisma } from '../../PrismaClient'
import { AuthRegistry } from '../../auth';
import { resourcesPaths } from '../../Controllers';
import ResponseBuilder from '../../openapi/ResponseBuilder';
import { ValidationError, ValidationErrorField, ValidationErrorType, ZodToApiError } from '../../Validation';
import RequestBuilder from '../../openapi/RequestBuilder';
import { ParamsDictionary } from 'express-serve-static-core';
import { defaultGetHandler, defaultOpenApiGetPath } from '../../defaultEndpoint';

extendZodWithOpenApi(z);

const router = Router()
const authRegistry = new AuthRegistry();
const registry = new OpenAPIRegistry()

const relatedPathsForStudent = (studentId: number) => {
	return {
		classes: resourcesPaths.class.list({
			studyPeriodId: studentId
		}),
		classSchedules: resourcesPaths.classSchedule.list({
			studyPeriodId: studentId
		}),
	}
}
const b = {};
type PrismaStudentPayload = MyPrisma.StudentGetPayload<typeof b>;

function buildStudentEntity(student: PrismaStudentPayload): z.infer<typeof studentEntity> {
	return {
		...student,
		_paths: relatedPathsForStudent(student.id)
	};
}
const studentBase = z.object({
	id: z.number().int(),
	ra: z.string(),
	name: z.string(),
	programId: z.number().int().nullable().optional(),
	modalityId: z.number().int().nullable().optional(),
	catalogId: z.number().int().nullable().optional(),
}).strict();

const studentEntity = studentBase.extend({
	_paths: z.object({
		classes: z.string(),
		classSchedules: z.string(),
	})
}).strict().openapi('StudentEntity');

registry.registerPath({
	method: 'get',
	path: '/students',
	tags: ['student'],
	responses: new ResponseBuilder()
		.ok(z.array(studentEntity), "A list of students")
		.internalServerError()
		.build(),
});
async function list(req: Request, res: Response) {
	prisma.student.findMany().then((students) => {
		const entities: z.infer<typeof studentEntity>[] = students.map((student) => ({
			...student,
			_paths: relatedPathsForStudent(student.id)
		}));

		res.json(z.array(studentEntity).parse(entities));
	})
}
router.get('/students', list)

registry.registerPath(defaultOpenApiGetPath(
	'/students/{id}',
	'student',
	studentEntity,
	"A student by id"
));
router.get('/students/:id', defaultGetHandler(
	prisma.student,
	{},
	buildStudentEntity,
	"Student not found"
))

const createStudentBody = studentBase.omit({ id: true }).openapi('CreateStudentBody');
registry.registerPath({
	method: 'post',
	path: '/students',
	tags: ['student'],
	request: new RequestBuilder()
		.body(createStudentBody, "Student to create")
		.build(),
	responses: new ResponseBuilder()
		.created(studentEntity, "Student created successfully")
		.badRequest()
		.internalServerError()
		.build(),
});

async function create(req: Request, res: Response) {
	const { success, data: body, error } = createStudentBody.safeParse(req.body);
	const errors = new ValidationError([]);
	if (!success)
		errors.addErrors(ZodToApiError(error, ["body"]));

	if (body) {
		const existing = await prisma.student.findFirst({ where: { ra: body.ra } });
		if (existing)
			errors.addError({
				code: "ALREADY_EXISTS",
				path: ["body", "ra"],
				message: "A student with this RA already exists"
			});
	}
	if (errors.errors.length > 0 || !success) {
		res.status(400).json(errors);
		return;
	}

	const student = await prisma.student.create({
		data: {
			ra: body.ra,
			name: body.name,
		},
	});

	const entity: z.infer<typeof studentEntity> = {
		...student,
		_paths: relatedPathsForStudent(student.id),
	};

	res.status(201).json(studentEntity.encode(entity));
}
router.post('/students', create)


const patchStudentBody = studentBase
	.omit({ id: true })
	.partial()
	.strict()
	.openapi('PatchStudentBody');
registry.registerPath({
	method: 'patch',
	path: '/students/{id}',
	tags: ['student'],
	request: new RequestBuilder()
		.params(z.object({
			id: z.int(),
		}).strict())
		.body(patchStudentBody, "Student fields to update")
		.build(),
	responses: new ResponseBuilder()
		.ok(studentEntity, "Student patched successfully")
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
		body: patchStudentBody,
	}).safeParse(req)
	if (!success) {
		res.status(400).json(error);
		return;
	}
	const { params: { id }, body } = data;
	const existing = await prisma.student.findUnique({ where: { id } });
	if (!existing) {
		res.status(404).json({ error: "Student not found" });
		return;
	}

	const student = await prisma.student.update({
		where: { id },
		data: {
			...(body.ra !== undefined && { ra: body.ra }),
			...(body.name !== undefined && { name: body.name }),
		},
	});
	res.json(buildStudentEntity(student));
}
router.patch('/students/:id', patch)

registry.registerPath({
	method: 'delete',
	path: '/students/{id}',
	tags: ['student'],
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
router.delete('/students/:id', remove)

function entityPath(studentId: number) {
	return `/students/${studentId}`;
}

export default {
	router,
	registry,
	authRegistry,
	paths: {
		entity: entityPath,
	},
}

