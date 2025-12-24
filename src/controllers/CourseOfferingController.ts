import { Router } from 'express'
import type { Request, Response } from "express";
import { extendZodWithOpenApi, OpenAPIRegistry } from '@asteasolutions/zod-to-openapi';
import z from 'zod';

import prisma from '../PrismaClient'

extendZodWithOpenApi(z);

const router = Router()
const registry = new OpenAPIRegistry();

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
					schema: z.array(z.any()), 
				},
			},
		},
	},
});
async function get(req: Request, res: Response) {
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
		omit: {
			instituteId: true,
			studyPeriodId: true,
			courseId: true,
		},
		include: {
			institute: {
				select: {
					id: true,
					name: true,
				}
			},
			studyPeriod: {
				select: {
					id: true,
					name: true,
				}
			},
			course: {
				select: {
					id: true,
					code: true,
				}
			}
		}
	}).then((courseOfferings) => {
		res.json(courseOfferings.map(co => ({
			...co,
		})))
	})
}
router.get('/course-offerings', get)


interface ListQueryParams{
	instituteId?: number,
	courseId?: number,
	periodId?: number
}

function listPath({
	instituteId,
	courseId,
	periodId
} : ListQueryParams) {
	return `http://localhost:3000/course-offerings?` + [
		instituteId ? "instituteId=" + instituteId : undefined,
		courseId ? "courseId=" + courseId : undefined,
		periodId ? "periodId=" + periodId : undefined,
	].filter(Boolean).join('&');
} 

export default {
	router,
	registry,
	paths: {
		list: listPath,
	}
}
