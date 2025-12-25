import { Router } from 'express'
import type { Request, Response } from "express";
import { extendZodWithOpenApi, OpenAPIRegistry } from '@asteasolutions/zod-to-openapi';
import z from 'zod';

import prisma from '../PrismaClient'
import { resourcesPaths } from '../Controllers';

extendZodWithOpenApi(z);

const router = Router()
const registry = new OpenAPIRegistry()

function relatedPathsForInstitute(instituteId: number) {
	return {
		classes: resourcesPaths.class.list({
			instituteId: instituteId
		}),
		coursesOfferings: resourcesPaths.courseOffering.list({
			instituteId: instituteId
		}),
		courses: resourcesPaths.course.list({
			instituteId: instituteId
		})
	}
}

const instituteEntity = z.object({
	id: z.number().int(),
	name: z.string(),
	_paths: z.object({
		classes: z.string(),
		coursesOfferings: z.string(),
		courses: z.string(),
	})
}).strict().openapi('InstituteEntity');

registry.registerPath({
	method: 'get',
	path: '/institutes',
	tags: ['institute'],
	responses: {
		200: {
			description: "A list of institutes",
			content: {
				'application/json': {
					schema: z.array(instituteEntity),
				},
			},
		},
	},
});
async function list(req: Request, res: Response) {
	prisma.institute.findMany().then((institutes) => {
		res.json(
			institutes.map(institute => ({
				...institute,
				_paths: relatedPathsForInstitute(institute.id)
			})),
		)
	})
}
router.get('/institutes', list)

registry.registerPath({
	method: 'get',
	path: '/institutes/{id}',
	tags: ['institute'],
	request: {
		params: z.object({
			id: z.int(),
		}),
	},
	responses: {
		200: {
			description: "A list of institutes",
			content: {
				'application/json': {
					schema: instituteEntity,
				},
			},
		},
	},
});
async function get(req: Request, res: Response) {
	const id = z.coerce.number().int().parse(req.params.id);

	prisma.institute.findUnique({
		where: {
			id: id,
		}
	}).then((institute) => {
		if (!institute) {
			res.status(404).send({ error: "Institute not found" });
			return;
		}

		res.json(
			{
				...institute,
				_paths: relatedPathsForInstitute(institute.id)
			} 
		)
	})
}
router.get('/institutes/:id', get)

function entityPath(instituteId: number) {
	return `/institutes/${instituteId}`;
}
export default {
	router,
	registry,
	paths: {
		entity: entityPath,
	}
}
