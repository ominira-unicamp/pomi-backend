import { Router } from 'express'
import type { Request, Response } from "express";
import { extendZodWithOpenApi, OpenAPIRegistry } from '@asteasolutions/zod-to-openapi';
import z from 'zod';

import prisma from '../PrismaClient'
import { resourcesPaths } from '../Controllers';
import { id } from 'zod/v4/locales';
extendZodWithOpenApi(z);

const router = Router()
const registry = new OpenAPIRegistry();

const daysOfWeekEnum = z.enum(['MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY', 'SATURDAY', 'SUNDAY']).openapi('DaysOfWeekEnum');

const prismaClassScheduleFieldSelection = {
	include: {
		room: {select: {code: true}},
		class: {
			select: {
				id: true,
				name: true,
				courseOfferingId: true,
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
}
const ClassScheduleEntity = z.object({
	id: z.number().int(),
	dayOfWeek: daysOfWeekEnum,
	start: z.string(),
	end: z.string(),
	roomId: z.number().int(),
	roomCode: z.string(),
	classId: z.number().int(),
	className: z.string(),
	instituteId: z.number().int(),
	instituteName: z.string(),
	courseId: z.number().int(),
	courseCode: z.string(),
	courseOfferingId: z.number().int(),
	periodId: z.number().int(),
	periodName: z.string(),
	_paths: z.object({
		entity: z.string(),
		studyPeriod: z.string(),
		institute: z.string(),
		course: z.string(),
		courseOffering: z.string(),
		class: z.string(),
	}).strict(),
}).strict().openapi('ClassScheduleEntity');

function relatedPathsForClassSchedule(
	classScheduleId: number,
	studyPeriodId: number,
	instituteId: number,
	courseId: number,
	courseOfferingId: number,
	classId: number,
) {
	return {
		studyPeriod: resourcesPaths.studyPeriod.entity(studyPeriodId),
		institute: resourcesPaths.institute.entity(instituteId),
		course: resourcesPaths.course.entity(courseId),
		courseOffering: resourcesPaths.courseOffering.entity(courseOfferingId),
		class: resourcesPaths.class.entity(classId),
		entity: entityPath(classScheduleId)
	}
}
const getClassSchedules = z.object({
	periodId: z.coerce.number().int().optional(),
	periodName: z.string().optional(),
	instituteId: z.coerce.number().int().optional(),
	instituteName: z.string().optional(),
	courseId: z.coerce.number().int().optional(),
	courseCode: z.string().optional(),
	roomId: z.coerce.number().int().optional(),
	roomCode: z.string().optional(),
	classId: z.coerce.number().int().optional(),
	dayOfWeek: daysOfWeekEnum.optional(),
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
					schema: z.array(ClassScheduleEntity),
				},
			},
		},
	},
});
async function list(req: Request, res: Response) {
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
		...prismaClassScheduleFieldSelection,
	}).then((classSchedules) => {
		const entities: z.infer<typeof ClassScheduleEntity>[] = classSchedules.map((classSchedule) => {
			const { room, class: classObj, ...rest } = classSchedule
			return {
				...rest,
				roomCode: room.code,
				className: classObj.name,
				classId: classObj.id,
				instituteId: classObj.coursesOffering.institute.id,
				instituteName: classObj.coursesOffering.institute.name,
				courseId: classObj.coursesOffering.course.id,
				courseCode: classObj.coursesOffering.course.code,
				courseOfferingId: classObj.courseOfferingId,
				periodId: classObj.coursesOffering.studyPeriod.id,
				periodName: classObj.coursesOffering.studyPeriod.name,
				_paths: relatedPathsForClassSchedule(
					classSchedule.id,
					classObj.coursesOffering.studyPeriod.id,
					classObj.coursesOffering.institute.id,
					classObj.coursesOffering.course.id,
					classObj.courseOfferingId,
					classObj.id
				)
			}
		})
		res.json(z.array(ClassScheduleEntity).parse(entities));
	})
}
router.get('/class-schedules', list)
interface ListQueryParams {
	instituteId?: number,
	courseId?: number,
	periodId?: number,
	classId?: number,
}

function listPath({ instituteId, courseId, periodId, classId }: ListQueryParams) {
	return `/class-schedules?` + [
		instituteId ? "instituteId=" + instituteId : undefined,
		courseId ? "courseId=" + courseId : undefined,
		periodId ? "periodId=" + periodId : undefined,
		classId ? "classId=" + classId : undefined,
	].filter(Boolean).join('&');
}

registry.registerPath({
	method: 'get',
	path: '/class-schedules/{id}',
	tags: ['class-schedule'],
	request: {
		params: z.object({
			id: z.int(),
		}),
	},
	responses: {
		200: {
			description: "A class schedule",
			content: {
				'application/json': {
					schema: ClassScheduleEntity,
				},
			},
		},
	},
});
async function get(req: Request, res: Response) {
	const id = z.coerce.number().int().parse(req.params.id);
	prisma.classSchedule.findUnique({
		where: {
			id: id,
		},
		...prismaClassScheduleFieldSelection,
	}).then((classSchedule) => {
		if (!classSchedule) {
			res.status(404).json({ error: "Class schedule not found" });
			return;
		}
		const { room, class: classObj, ...rest } = classSchedule
		const entity: z.infer<typeof ClassScheduleEntity> = ClassScheduleEntity.parse({
			...rest,
			roomCode: room.code,
			className: classObj.name,
			classId: classObj.id,
			instituteId: classObj.coursesOffering.institute.id,
			instituteName: classObj.coursesOffering.institute.name,
			courseId: classObj.coursesOffering.course.id,
			courseCode: classObj.coursesOffering.course.code,
			courseOfferingId: classObj.courseOfferingId,
			periodId: classObj.coursesOffering.studyPeriod.id,
			periodName: classObj.coursesOffering.studyPeriod.name,
			_paths: relatedPathsForClassSchedule(
				classSchedule.id,
				classObj.coursesOffering.studyPeriod.id,
				classObj.coursesOffering.institute.id,
				classObj.coursesOffering.course.id,
				classObj.courseOfferingId,
				classObj.id
			),
		})
		res.json(entity)
	})
}
router.get('/class-schedules/:id', get)


function entityPath(id: number) {
	return `/class-schedules/${id}`;
}

export default {
	router,
	registry,
	paths: {
		list: listPath,
		entity: entityPath,
	},
}
