import { Router } from 'express'
import type { Request, Response } from "express";
import { extendZodWithOpenApi, OpenAPIRegistry } from '@asteasolutions/zod-to-openapi';
import z from 'zod';

import prisma from '../PrismaClient'
import { resourcesPaths } from '../Controllers';
extendZodWithOpenApi(z);

const router = Router()
const registry = new OpenAPIRegistry();

function relatedPathsForCourse(courseId: number) {
	return {
		classes: resourcesPaths.class.list({courseId}),
		courseOfferings: resourcesPaths.courseOffering.list({courseId}),
	}
}

const courseEntity = z.object({
	id: z.number().int(),
	code: z.string(),
	name: z.string(),
	credits: z.number().int(),
	_paths: z.object({
		classes: z.string(),
		courseOfferings: z.string(),
	}).strict()
}).strict().openapi('CourseEntity');

registry.registerPath({
	method: 'get',
	path: '/courses',
	tags: ['course'],
	responses: {
		200: {
			description: "A list of courses",
			content: {
				'application/json': {
					schema: z.array(courseEntity), 
				},
			},
		},
	},
});
async function list(req: Request, res: Response) {
	prisma.course.findMany().then((courses) => {
		const entities : z.infer<typeof courseEntity>[] = courses.map((course) => ({
			...course,
			_paths: relatedPathsForCourse(course.id)
		}))
		res.json(z.array(courseEntity).parse(entities));
	})
}
router.get('/courses', list)
interface ListQueryParams{
	instituteId?: number,
}

function listPath({
	instituteId,
} : ListQueryParams) {
	return `/courses?` + [
		instituteId ? "instituteId=" + instituteId : undefined,
	].filter(Boolean).join('&');
} 

registry.registerPath({
	method: 'get',
	path: '/courses/{id}',
	tags: ['course'],
	request: {
		params: z.object({
			id: z.int(),
		}),
	},
	responses: {
		200: {
			description: "A list of courses",
			content: {
				'application/json': {
					schema: courseEntity, 
				},
			},
		},
		404: {
			description: "Course not found",
		},
	},
});
async function get(req: Request, res: Response) {
	const id = z.coerce.number().int().parse(req.params.id);
	prisma.course.findUnique({
		where: {
			id: id,
		},
	}).then((course) => {
		if (!course) {
			res.status(404).json({ error: "Course not found" });
			return;
		}
		const entity : z.infer<typeof courseEntity> = {
			...course,
			_paths: relatedPathsForCourse(course.id)
		}
		res.json(courseEntity.parse(entity))
	})
}

router.get('/courses/:id', get)

function entityPath(courseId: number) {
	return `/courses/${courseId}`;
}
export default {
	router,
	registry,
	paths: {
		list: listPath,
		entity: entityPath,
	}
}
