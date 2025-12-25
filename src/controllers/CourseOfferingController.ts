import { Router } from 'express'
import type { Request, Response } from "express";
import { extendZodWithOpenApi, OpenAPIRegistry } from '@asteasolutions/zod-to-openapi';
import z from 'zod';

import prisma from '../PrismaClient'
import { resourcesPaths } from '../Controllers';

extendZodWithOpenApi(z);

const router = Router()
const registry = new OpenAPIRegistry();

const prismaCourseOfferingFieldSelection = {
	include: {
		institute: { select: { name: true } },
		studyPeriod: { select: { name: true } },
		course: { select: { code: true } }
	}
}
const relatedPathsForClassOffering = (
	courseOfferingId: number,
	courseId: number,
	instituteId: number,
	studyPeriodId: number,
) => {
	return {
		entity: entityPath(courseOfferingId),
		institute: resourcesPaths.institute.entity(instituteId),
		studyPeriod: resourcesPaths.studyPeriod.entity(studyPeriodId),
		course: resourcesPaths.course.entity(courseId),
	}
}

const CourseOfferingEntity = z.object({
	id: z.number().int(),
	instituteId: z.number().int(),
	instituteName: z.string(),
	courseId: z.number().int(),
	courseCode: z.string(),
	studyPeriodId: z.number().int(),
	studyPeriodName: z.string(),
	_paths: z.object({
		entity: z.string(),
		institute: z.string(),
		studyPeriod: z.string(),
		course: z.string(),
	})
}).strict().openapi('CourseOfferingEntity');

const getCourseOffering = z.object({
	instituteId: z.coerce.number().int().optional(),
	instituteCode: z.string().optional(),
	courseId: z.coerce.number().int().optional(),
	courseCode: z.string().optional(),
	periodId: z.coerce.number().int().optional(),
	periodName: z.string().optional(),
}).openapi('GetCourseOfferingQuery');

registry.registerPath({
	method: 'get',
	path: '/course-offerings',
	tags: ['course-offering'],
	request: {
		query: getCourseOffering,
	},
	responses: {
		200: {
			description: "A list of course offerings",
			content: {
				'application/json': {
					schema: z.array(CourseOfferingEntity),
				},
			},
		},
	},
});
async function list(req: Request, res: Response) {
	const query = getCourseOffering.parse(req.query);
	prisma.courseOffering.findMany({
		where: {
			instituteId: query.instituteId,
			institute: {
				name: {
					equals: query.instituteCode,
					mode: 'insensitive',
				}
			},
			courseId: query.courseId,
			course: {
				code: {
					equals: query.courseCode,
					mode: 'insensitive',
				}
			},
			studyPeriodId: query.periodId,
			studyPeriod: {
				name: {
					equals: query.periodName,
					mode: 'insensitive',
				}
			},
		},
		...prismaCourseOfferingFieldSelection
	}).then((courseOfferings) => {
		const entities: z.infer<typeof CourseOfferingEntity>[] = courseOfferings.map(co => {
			const {institute, course, studyPeriod, ...rest} = co;
			return {
				...rest,
				instituteName: institute.name,
				courseCode: course.code,
				studyPeriodName: studyPeriod.name,
				_paths: relatedPathsForClassOffering(
					co.id,
					co.courseId,
					co.instituteId,
					co.studyPeriodId
				)
			}
		})
		res.json(entities)
	})
}
router.get('/course-offerings', list)
interface ListQueryParams {
	instituteId?: number,
	courseId?: number,
	periodId?: number
}

function listPath({
	instituteId,
	courseId,
	periodId
}: ListQueryParams) {
	return `/course-offerings?` + [
		instituteId ? "instituteId=" + instituteId : undefined,
		courseId ? "courseId=" + courseId : undefined,
		periodId ? "periodId=" + periodId : undefined,
	].filter(Boolean).join('&');
}



registry.registerPath({
	method: 'get',
	path: '/course-offerings/{id}',
	tags: ['course-offering'],
	request: {
		params: z.object({
			id: z.int(),
		}),
	},
	responses: {
		200: {
			description: "A list of course offerings",
			content: {
				'application/json': {
					schema: CourseOfferingEntity,
				},
			},
		},
	},
});
async function get(req: Request, res: Response) {
	const id = z.coerce.number().int().parse(req.params.id);
	prisma.courseOffering.findUnique({
		where: {
			id: id,
		},
		...prismaCourseOfferingFieldSelection
	}).then((courseOffering) => {
		if (!courseOffering) {
			res.status(404).json({ error: "Course offering not found" });
			return;
		}

		const {institute, course, studyPeriod, ...rest} = courseOffering;
		
		const entity: z.infer<typeof CourseOfferingEntity> = {
			...rest,
			instituteName: institute.name,
			courseCode: course.code,
			studyPeriodName: studyPeriod.name,
			_paths: relatedPathsForClassOffering(
				courseOffering.id,
				courseOffering.courseId,
				courseOffering.instituteId,
				courseOffering.studyPeriodId
			)
		};
		res.json(entity)
	})
}
router.get('/course-offerings/:id', get)

function entityPath(courseOfferingId: number) {
	return `/course-offerings/${courseOfferingId}`;
}

export default {
	router,
	registry,
	paths: {
		list: listPath,
		entity: entityPath,
	}
}
