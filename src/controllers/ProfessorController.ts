import { Router } from 'express'
import type { Request, Response } from "express";
import prisma from '../PrismaClient'
import { OpenAPIRegistry, extendZodWithOpenApi } from '@asteasolutions/zod-to-openapi';
import { z } from 'zod';

extendZodWithOpenApi(z);

const router = Router()
const registry = new OpenAPIRegistry();

const listProfessorsQuery = z.object({
    classId: z.coerce.number().int().optional(),
}).openapi('ListProfessorsQuery');

registry.registerPath({
    method: 'get',
    path: '/professors',
    tags: ['professor'],
    request: {
        query: listProfessorsQuery,
    },
    responses: {
        200: {
            description: "A list of professors",
            content: {
                'application/json': {
                    schema: z.array(z.any()), 
                },
            },
        },
    },
});

async function get(req: Request, res: Response) {
    const query = listProfessorsQuery.parse(req.query);
    prisma.professor.findMany({
        where: {
            classes: {
                some: {
                    id: query.classId,
                }
            }
        },
    }).then((professors) => {
		res.json(professors)
	})
}
router.get('/professors', get)
interface ListQueryParams {
    classId?: number;
}
function listPath({
    classId
} : ListQueryParams) {
	return `/professors?` + [
		classId ? "classId=" + classId : undefined
	].filter(Boolean).join('&');
} 


export default {
	router,
    registry,
    paths: {
        list: listPath,
    },
}
