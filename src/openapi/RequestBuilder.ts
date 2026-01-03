import { RouteConfig, ZodRequestBody } from "@asteasolutions/zod-to-openapi";
import { RouteParameter } from "@asteasolutions/zod-to-openapi/dist/openapi-registry";
import { ReferenceObject, SchemaObject } from "@asteasolutions/zod-to-openapi/dist/types";
import z, { ZodType } from "zod";
import { InputSchemaTypes } from "../BuildHandler";
type RequestConfig = NonNullable<RouteConfig['request']>;

class RequestBuilder {
	request: RequestConfig = {}
	query(schema: RouteParameter): RequestBuilder {
		this.request.query = schema;
		return this;
	}
	params(schema: RouteParameter): RequestBuilder {
		this.request.params = schema;
		return this;
	}
	body(schema: ZodType<unknown> | SchemaObject | ReferenceObject, description: string): RequestBuilder {
		this.request.body = {
			description: description,
			required: true,
			content: {
				'application/json': {
					schema: schema,
				},
			},
		};
		return this;
	}
	build(): RequestConfig {
		return this.request;
	}
}

export default RequestBuilder;