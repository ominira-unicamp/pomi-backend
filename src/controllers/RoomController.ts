import { Router } from 'express'
import type { Request, Response } from "express";
import prisma from '../PrismaClient'
import { OpenAPIRegistry, extendZodWithOpenApi } from '@asteasolutions/zod-to-openapi';
import { z } from 'zod';

extendZodWithOpenApi(z);

const router = Router()
const registry = new OpenAPIRegistry();

registry.registerPath({
    method: 'get',
    path: '/rooms',
    tags: ['room'],
    responses: {
        200: {
            description: "A list of rooms",
            content: {
                'application/json': {
                    schema: z.array(z.any()), 
                },
            },
        },
    },
});

async function get(req: Request, res: Response) {
    prisma.room.findMany().then((rooms) => {
		res.json(rooms)
	})
}
router.get('/rooms', get)

export default {
	router,
    registry,
}
