import { Router } from 'express'
import type { Request, Response } from "express";
import { extendZodWithOpenApi, OpenAPIRegistry } from '@asteasolutions/zod-to-openapi';
import z from 'zod';

import prisma from '../PrismaClient'
extendZodWithOpenApi(z);

const router = Router()
const registry = new OpenAPIRegistry();

const getClassSchedules = z.object({
	periodId: z.coerce.number().int().optional(),
	periodName: z.string().optional(),
	instituteId: z.coerce.number().int().optional(),
	instituteName: z.string().optional(),
	courseId: z.coerce.number().int().optional(),
	courseCode: z.string().optional(),
	roomId: z.coerce.number().int().optional(),
	roomCode : z.string().optional(),
	classId: z.coerce.number().int().optional(),
	dayOfWeek: z.enum(['MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY', 'SATURDAY', 'SUNDAY']).optional(),
}).openapi('GetClassSchedulesQuery');

registry.registerPath({
	method: 'get',
	path: '/class-schedules',
	tags: ['class-schedule'],
	request: {
		query: getClassSchedules,
	},
	responses: {
		200: {
			description: "A list of class schedules",
			content: {
				'application/json': {
					schema: z.array(z.any()), 
				},
			},
		},
	},
});
async function get(req: Request, res: Response) {
	const query = getClassSchedules.parse(req.query);
	prisma.classSchedule.findMany({
		where: {
			dayOfWeek: query.dayOfWeek,
			room: {
				id: query.roomId,
				code: {
					equals: query.roomCode,
					mode: 'insensitive',
				}
			},
			class: {
				coursesOffering: {
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
			},
		},
		omit: {
			roomId: true,
			classId: true,
		},
		include: {
			room: {
				select: {
					id: true,
					code: true,
				}
			},
			class: {
				select: {
					id: true,
					name: true,
					coursesOffering: {
						select: {
							institute: {
								select: {
									id: true,
									name: true,
								}
							},
							course: {
								select: {
									id: true,
									name: true,
									code: true,
								}
							},
							studyPeriod: {
								select: {
									id: true,
									name: true,
								}
							}
						}
					}
				}
			},

		},
	}).then((classes) => {
		res.json(classes)
	})
}
router.get('/class-schedules', get)
interface ListQueryParams {
	instituteId?: number,
	courseId?: number,
	periodId?: number,
	classId?: number,
}

function listPath({ instituteId, courseId, periodId, classId }: ListQueryParams) {
	return `http://localhost:3000/class-schedules?` + [
		instituteId ? "instituteId=" + instituteId : undefined,
		courseId ? "courseId=" + courseId : undefined,
		periodId ? "periodId=" + periodId : undefined,
		classId ? "classId=" + classId : undefined,
	].filter(Boolean).join('&');
}
export default {
	router,
	registry,
	paths: {
		list: listPath,
	},

}
