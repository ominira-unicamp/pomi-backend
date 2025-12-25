import professor from './controllers/ProfessorController'
import institute from './controllers/InstituteController'
import course from './controllers/CourseController'
import classController from './controllers/ClassController'
import courseOffering from './controllers/CourseOfferingController'
import studyPeriods from './controllers/StudyPeriodsController'
import classSchedule from './controllers/ClassScheduleController'
import room from './controllers/RoomController'

import { Router } from 'express'
import { OpenAPIRegistry } from '@asteasolutions/zod-to-openapi'


const paths = {
	class: classController.paths,
	classSchedule: classSchedule.paths,
	course: course.paths,
	courseOffering: courseOffering.paths,
	institute: institute.paths,	
	professor: professor.paths,
	room: room.paths,
	studyPeriod: studyPeriods.paths,
}

export default {
	router: Router().use(
		professor.router,
		institute.router,
		course.router,
		classController.router,
		courseOffering.router,
		classSchedule.router,
		studyPeriods.router,
		room.router,
	),
	registry: new OpenAPIRegistry([
		professor.registry,
		institute.registry,
		course.registry,
		classController.registry,
		courseOffering.registry,
		classSchedule.registry,
		studyPeriods.registry,
		room.registry
	]),
	resourcesPaths: paths,
	all: {
		professor,
		institute,
		course,
		classController,
		courseOffering,
		classSchedule,
		room
	}
	
}
export const resourcesPaths = paths;