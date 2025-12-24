import { Router } from 'express'
import type { Request, Response } from "express";
import { extendZodWithOpenApi, OpenAPIRegistry } from '@asteasolutions/zod-to-openapi';
import z from 'zod';

import prisma from '../PrismaClient'
import { resourcesPaths } from '../Controllers';
extendZodWithOpenApi(z);

const router = Router()
const registry = new OpenAPIRegistry();

const getClasses = z.object({
	instituteId: z.coerce.number().int().optional(),
	instituteName: z.string().optional(),
	courseId: z.coerce.number().int().optional(),
	courseCode: z.string().optional(),
	periodId: z.coerce.number().int().optional(),
	periodName: z.string().optional(),
	professorId: z.coerce.number().int().optional(),
	professorName: z.string().optional(),
}).openapi('GetClassesQuery');

registry.registerPath({
	method: 'get',
	path: '/classes',
	tags: ['class'],
	request: {
		query: getClasses,
	},
	responses: {
		200: {
			description: "A list of classes",
			content: {
				'application/json': {
					schema: z.array(z.any()), 
				},
			},
		},
	},
});
async function get(req: Request, res: Response) {
	const query = getClasses.parse(req.query);
	prisma.class.findMany({
		where: {
			coursesOffering: {
				instituteId: query.instituteId,
				institute: {
					id: query.instituteId,
					name: {
						equals: query.instituteName,
						mode: 'insensitive',
					}
				},
				course: {
					
					id: query.courseId,
					code: {
						equals: query.courseCode,
						mode: 'insensitive',
					}
				},
				studyPeriod: {
					id: query.periodId,
					name: {
						equals: query.periodName,
						mode: 'insensitive',
					}
				},
			},
			professors: {
				some: { 
					id: query.professorId,
					name: {
						equals: query.professorName,
						mode: 'insensitive',
					}
				}
			},
		},
		omit: {
			courseOfferingId: true,
		},
		include: {
			professors: {
				select: {
					id: true,
					name: true,
				}
			},
			coursesOffering: {
				select: {
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
					}, 
					institute: {
						select: {
							id: true,
							name: true,
						}
					}
				}
			}
		}
	}).then((classes) => {
		res.json(classes.map(c => ({
			...c,
			_paths: {
				classSchedules: resourcesPaths.classSchedule.list({
					classId: c.id,
				}),
				professors: resourcesPaths.professor.list({
					classId: c.id,
				}),
			}
		})))
	})
}
router.get('/classes', get)

type ListQueryParams = {
	instituteId?: number | undefined,
	courseId?: number | undefined ,
	periodId?: number | undefined ,
	professorId?: number | undefined
}


function listPath({
	instituteId,
	courseId,
	periodId,
	professorId
} : ListQueryParams) {
	
	return `http://localhost:3000/classes?` + [
		instituteId ? "instituteId=" + instituteId : undefined,
		courseId ? "courseId=" + courseId : undefined,
		periodId ? "periodId=" + periodId : undefined,
		professorId ? "professorId=" + professorId : undefined,
	].filter(Boolean).join('&');
} 
export default {
	router,
	registry,
	paths: {
		list: listPath,
	}
}
