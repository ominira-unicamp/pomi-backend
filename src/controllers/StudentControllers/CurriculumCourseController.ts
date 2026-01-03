import { Router } from 'express'
import type { Request, Response } from "express";
import { extendZodWithOpenApi, OpenAPIRegistry } from '@asteasolutions/zod-to-openapi';
import z from 'zod';

import prisma, { MyPrisma } from '../../PrismaClient.js'
import { AuthRegistry } from '../../auth.js';
import ResponseBuilder from '../../openapi/ResponseBuilder.js';
import { ValidationError, ZodToApiError } from '../../Validation.js';
import RequestBuilder from '../../openapi/RequestBuilder.js';

extendZodWithOpenApi(z);

const router = Router()
const authRegistry = new AuthRegistry();
const registry = new OpenAPIRegistry()

const curriculumCourseBase = z.object({	
	curriculumId: z.number().int(),
	courseId: z.number().int(),
	semester: z.number().int().nullable(),
}).strict();

const prismaCurriculumCourseFieldSelection = {
	include: {
		course: {
			select: {
				name: true,
				code: true,
			}
		}	 
	}
} as const satisfies MyPrisma.CurriculumCourseDefaultArgs;

const buildCurriculumCourseEntity = (curriculumCourse: MyPrisma.CurriculumCourseGetPayload<typeof prismaCurriculumCourseFieldSelection>, studentId : number): z.infer<typeof curriculumEntity> => {
	return {
		courseId: curriculumCourse.courseId,
		curriculumId: curriculumCourse.curriculumId,
		semester: curriculumCourse.semester,
		studentId: studentId,
		courseName: curriculumCourse.course.name,
		courseCode: curriculumCourse.course.code,
	};
}


const curriculumEntity = curriculumCourseBase.extend({
	studentId: z.number().int(),
	courseName: z.string(),
	courseCode: z.string(),
}).strict().openapi('CurriculumCourseEntity');

const addCourseBody = z.object({
	courseId: z.number().int(),
	semester: z.number().int().nullable(),
}).strict().openapi('AddCourseToCurriculumBody');

registry.registerPath({
	method: 'post',
	path: '/student/{sid}/curricula/{cid}/courses',
	tags: ['curriculum'],
	request: new RequestBuilder()
		.body(addCourseBody, "Course to add to curriculum")
		.build(),
	responses: new ResponseBuilder()
		.ok(curriculumEntity, "Course added to curriculum successfully")
		.badRequest()
		.internalServerError()
		.build(),
});

async function addCourse(req: Request, res: Response) {
	const { success, data, error } = z.object({
		params: z.object({
			sid: z.coerce.number().int(),
			cid: z.coerce.number().int(),
		}).strict(),
		body: addCourseBody,
	}).safeParse(req);
	const errors = new ValidationError([]);
	if (!success)
		errors.addErrors(ZodToApiError(error, []));
	if (errors.errors.length > 0 || !success) {
		res.status(400).json(errors);
		return;
	}
	const { params, body } = data;
	const existingCurriculum = await prisma.curriculum.findUnique({ where: { id: params.cid, studentId: params.sid } });
	if (!existingCurriculum) {
		errors.addError({
			path: ["path", "cid"],
			code: "REFERENCE_NOT_FOUND",
			message: "Curriculum not found for the given student",
		})
		res.status(404).json(errors);
		return;
	}

	const course = await prisma.curriculumCourse.findFirst({
		where: {
			curriculumId: params.cid,
			courseId: body.courseId,
		}
	});
	if (course) {
		errors.addError({
			path: ["body", "courseId"],
			code: "ALREADY_EXISTS",
			message: "This course is already in the curriculum",
		})
		res.status(400).json(errors);
		return;
	}	
	
	const createdCurriculumCourse = await prisma.curriculumCourse.create({
		...prismaCurriculumCourseFieldSelection,
		data: {
			curriculumId: params.cid,
			courseId: body.courseId,
			semester: body.semester,
		},
	});

	res.status(201).json(buildCurriculumCourseEntity(createdCurriculumCourse, params.sid));
}
router.post('/student/:sid/curricula/:cid/courses', addCourse)

const patchCourseBody = z.object({
	semester: z.number().int().nullable(),
}).openapi('PatchCourseInCurriculumBody');

registry.registerPath({
	method: 'patch',
	path: '/student/{sid}/curricula/{cid}/courses/{courseId}',
	tags: ['curriculum'],
	request: new RequestBuilder()
		.body(patchCourseBody, "Course to patch in curriculum")
		.build(),
	responses: new ResponseBuilder()
		.ok(curriculumEntity, "Course patched in curriculum successfully")
		.badRequest()
		.internalServerError()
		.build(),
});

async function updateCourse(req: Request, res: Response) {
	const { success, data, error } = z.object({
		params: z.object({
			sid: z.coerce.number().int(),
			cid: z.coerce.number().int(),
			courseId: z.coerce.number().int(),
		}).strict(),
		body: patchCourseBody,
	}).safeParse(req);
	const errors = new ValidationError([]);
	if (!success)
		errors.addErrors(ZodToApiError(error, []));
	if (errors.errors.length > 0 || !success) {
		res.status(400).json(errors);
		return;
	}
	const { params, body } = data;
		
	const curriculumCourse = await prisma.curriculumCourse.update({
		...prismaCurriculumCourseFieldSelection,
		where: {
			curriculumId_courseId: {
				curriculumId: params.cid,
				courseId: params.courseId,
			}
		},
		data: {
			semester: body.semester,
		},
	});
	res.status(200).json(buildCurriculumCourseEntity(curriculumCourse, params.sid));
}
router.patch('/student/:sid/curricula/:cid/courses/:courseId', updateCourse)

registry.registerPath({
	method: 'delete',
	path: '/student/{sid}/curricula/{cid}/courses/{courseId}',
	tags: ['curriculum'],
	request: new RequestBuilder()
		.build(),
	responses: new ResponseBuilder()
		.noContent()
		.notFound()
		.badRequest()
		.internalServerError()
		.build(),
});

async function removeCourse(req: Request, res: Response) {
	const { success, data, error } = z.object({
		params: z.object({
			sid: z.coerce.number().int(),
			cid: z.coerce.number().int(),
			courseId: z.coerce.number().int(),
		}).strict(),
	}).safeParse(req);
	const errors = new ValidationError([]);
	if (!success)
		errors.addErrors(ZodToApiError(error, []));
	if (errors.errors.length > 0 || !success) {
		res.status(400).json(errors);
		return;
	}
	const { params } = data;
	const existingCurriculum = await prisma.curriculum.findUnique({ where: { id: params.cid, studentId: params.sid } });
	if (!existingCurriculum) {
		res.status(404).json({ error: "Curriculum not found for the given student" });
		return;
	}
		
	await prisma.curriculumCourse.delete({
		where: {
			curriculumId_courseId: {
				curriculumId: params.cid,
				courseId: params.courseId,
			}
		},
	});
	res.status(204).send();
}

router.delete('/student/:sid/curricula/:cid/courses/:courseId', removeCourse)

function entityPath(params: { studentId: number; curriculumId: number; courseId: number }) {
	return `/student/${params.studentId}/curricula/${params.curriculumId}/courses/${params.courseId}`;
} ;


export default {
	router,
	registry,
	authRegistry,
	paths: {
		entity: entityPath,
	},
}
