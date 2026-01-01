import auth from './controllers/AuthController'

import professor from './controllers/ProfessorController'
import institute from './controllers/InstituteController'
import course from './controllers/CourseController'
import classController from './controllers/ClassController'
import studyPeriods from './controllers/StudyPeriodsController'
import classSchedule from './controllers/ClassScheduleController'
import room from './controllers/RoomController'

import studentController from './controllers/StudentControllers/studentController'
import CurriculumController from './controllers/StudentControllers/CurriculumController'
import CurriculumCourseController from './controllers/StudentControllers/CurriculumCourseController'

import { Router } from 'express'
import { OpenAPIRegistry } from '@asteasolutions/zod-to-openapi'
import { AuthRegistry } from './auth'

type Controler = {
	router?: Router,
	registry?: OpenAPIRegistry,
	authRegistry?: AuthRegistry,
}
const controllers: Controler[] = [
	auth,
	professor,
	institute,
	course,
	classController,
	classSchedule,
	room,
	studyPeriods,
	studentController,
	CurriculumController,
	CurriculumCourseController
] 

const router = Router().use(controllers.filter(c => c.router).map(c => c.router!));
const registry = new OpenAPIRegistry(controllers.filter(c => c.registry).map(c => c.registry!).flat());
const authRegistry = new AuthRegistry(controllers.filter(c => c.authRegistry).map(c => c.authRegistry!));
export default {
	router: router,
	registry: registry,
	authRegistry: authRegistry,	
	all: controllers,	
}

export const resourcesPaths = {
	auth: auth.paths,
	class: classController.paths,
	classSchedule: classSchedule.paths,
	course: course.paths,
	institute: institute.paths,
	professor: professor.paths,
	room: room.paths,
	studyPeriod: studyPeriods.paths,
	student: studentController.paths,
	curriculum: CurriculumController.paths,
	curriculumCourse: CurriculumCourseController.paths,
};