import { extendZodWithOpenApi, OpenAPIRegistry } from '@asteasolutions/zod-to-openapi';
import z from 'zod';

import ResponseBuilder from '../../openapi/ResponseBuilder';
import RequestBuilder from '../../openapi/RequestBuilder';
extendZodWithOpenApi(z);
import IO from './interface';
import { defaultOpenApiGetPath } from '../../defaultEndpoint';
import courseEntity from './entity';
const registry = new OpenAPIRegistry();

registry.registerPath({
	method: 'get',
	path: '/courses',
	tags: ['course'],
	request: new RequestBuilder()
		.query(IO.list.input.shape.query)
		.build(),
	responses: new ResponseBuilder()
		.ok(IO.list.output.shape[200], "A list of courses")
		.internalServerError()
		.build(),
});

registry.registerPath(defaultOpenApiGetPath('/courses/{id}', 'course', courseEntity.schema, "A course by id"));


registry.registerPath({
	method: 'post',
	path: '/courses',
	tags: ['course'],
	request: new RequestBuilder()
		.body(IO.create.input.shape.body, "Course to create")
		.build(),
	responses: new ResponseBuilder()
		.created(IO.create.output.shape[201], "Course created successfully")
		.badRequest()
		.internalServerError()
		.build(),
});


registry.registerPath({
	method: 'patch',
	path: '/courses/{id}',
	tags: ['course'],
	request: new RequestBuilder()
		.params(IO.patch.input.shape.path)
		.body(IO.patch.input.shape.body, "Course fields to update")
		.build(),
	responses: new ResponseBuilder()
		.ok(IO.patch.output.shape[200], "Course updated successfully")
		.badRequest()
		.notFound()
		.internalServerError()
		.build(),
});


registry.registerPath({
	method: 'delete',
	path: '/courses/{id}',
	tags: ['course'],
	request: new RequestBuilder()
		.params(IO.remove.input.shape.path)
		.build(),
	responses: new ResponseBuilder()
		.noContent()
		.badRequest()
		.notFound()
		.internalServerError()
		.build(),
});


export default registry

