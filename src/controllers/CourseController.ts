import { Router } from 'express'
import type { Request, Response } from "express";
import { extendZodWithOpenApi, OpenAPIRegistry } from '@asteasolutions/zod-to-openapi';
import z from 'zod';

import prisma from '../PrismaClient'
import { resourcesPaths } from '../Controllers';
extendZodWithOpenApi(z);

const router = Router()
const registry = new OpenAPIRegistry();

const getCourse = z.object({
	instituteId: z.coerce.number().int().optional(),
}).openapi('GetCourseQuery');

registry.registerPath({
	method: 'get',
	path: '/courses',
	tags: ['course'],
	request: {
		query: getCourse,
	},
	responses: {
		200: {
			description: "A list of courses",
			content: {
				'application/json': {
					schema: z.array(z.any()), 
				},
			},
		},
	},
});
async function get(req: Request, res: Response) {
	const query = getCourse.parse(req.query);
	prisma.course.findMany().then((courses) => {
		res.json(courses.map((course) => ({
			...course,
			_paths: {
				classes: resourcesPaths.class.list({courseId: course.id}),
				courseOfferings: resourcesPaths.courseOffering.list({courseId: course.id}),
			}
		})))
	})
}
router.get('/courses', get)
interface ListQueryParams{
	instituteId?: number,
}

function listPath({
	instituteId,
} : ListQueryParams) {
	return `http://localhost:3000/courses?` + [
		instituteId ? "instituteId=" + instituteId : undefined,
	].filter(Boolean).join('&');
} 

export default {
	router,
	registry,
	paths: {
		list: listPath,
	}
}
