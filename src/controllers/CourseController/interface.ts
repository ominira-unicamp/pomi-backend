import { extendZodWithOpenApi } from '@asteasolutions/zod-to-openapi';
import z from 'zod';
import { getPaginatedSchema, paginationQuerySchema, PaginationQueryType } from '../../pagination';
import courseEntity from './entity';
extendZodWithOpenApi(z);
 


const courseBase = z.object({
	id: z.number().int(),
	code: z.string().min(1),
	name: z.string().min(1),
	credits: z.number().int().min(0),
	instituteId: z.number().int(),
});



const listCourseQuery = paginationQuerySchema.extend({
	instituteId: z.coerce.number().int().optional(),
	instituteCode : z.string().min(1).optional(),
}).openapi('ListCoursesQuery');

const PageCoursesSchema = getPaginatedSchema(courseEntity.schema).openapi('PageCourses');

const get = {
	input: z.object({
		path: z.object({
			id: z.coerce.number().int(),
		}).strict(),
	}),
	output: z.object({
		200: courseEntity.schema.optional(),
		400: z.any(),
	}),
}
const list = {
	input : z.object({
		query: listCourseQuery,
	}),
	output: z.object({ 200: PageCoursesSchema }),
} 

const create = {
	input: z.object({
		body: courseBase.omit({ id: true }).strict().openapi('CreateCourseBody'),
	}),
	output: z.object({
		201: courseEntity.schema.optional(),
		400: z.any().optional(),
	}),
}

const patch = {
	input: z.object({
		path: z.object({
			id: z.coerce.number().int(),
		}).strict(),
		body: courseBase.omit({ id: true }).partial().strict().openapi('PatchCourseBody')
	}),
	output: z.object({
		200: courseEntity.schema.optional(),
		400: z.any().optional(),
	}),

}

const remove = {
	input: z.object({
		path: z.object({
			id: z.coerce.number().int(),
		}).strict(),
	}),
	output: z.object({
		204: z.any().optional(),
		404: z.any().optional(),
	}),
}


export default {
	list,
	create,
	patch,
	remove,
}
