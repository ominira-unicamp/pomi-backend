import { Router } from 'express'
import type { Request, Response } from "express";
import { extendZodWithOpenApi, OpenAPIRegistry } from '@asteasolutions/zod-to-openapi';
import z from 'zod';

import prisma from '../PrismaClient'
import { resourcesPaths } from '../Controllers';

extendZodWithOpenApi(z);

const router = Router()
const registry = new OpenAPIRegistry()


registry.registerPath({
	method: 'get',
	path: '/study-periods',
	tags: ['studyPeriod'],
	responses: {
		200: {
			description: "A list of study periods",
			content: {
				'application/json': {
					schema: z.array(z.any()),
				},
			},
		},
	},
});
async function get(req: Request, res: Response) {
	prisma.studyPeriod.findMany().then((studyPeriods) => {
		res.json(studyPeriods.map((studyPeriod) => ({
			...studyPeriod,
			_paths: {
				courseOfferings: resourcesPaths.courseOffering.list({
					periodId: studyPeriod.id
				}),
				classes: resourcesPaths.class.list({
					periodId: studyPeriod.id
				}),
				classSchedules: resourcesPaths.classSchedule.list({
					periodId: studyPeriod.id
				}),
			}
		})));
	})
}
router.get('/study-periods', get)
export default {
	router,
	registry,
}
