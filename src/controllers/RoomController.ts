import { Router } from 'express'
import type { Request, Response } from "express";
import prisma from '../PrismaClient'
import { OpenAPIRegistry, extendZodWithOpenApi } from '@asteasolutions/zod-to-openapi';
import { z } from 'zod';

extendZodWithOpenApi(z);

const router = Router()
const registry = new OpenAPIRegistry();

const roomEntity = z.object({
    id: z.number().int(),
    code: z.string(),
    _paths: z.object({
        entity: z.string(),
    })
}).strict().openapi('RoomEntity');

registry.registerPath({
    method: 'get',
    path: '/rooms',
    tags: ['room'],
    responses: {
        200: {
            description: "A list of rooms",
            content: {
                'application/json': {
                    schema: z.array(roomEntity), 
                },
            },
        },
    },
});

async function list(req: Request, res: Response) {
    prisma.room.findMany().then((rooms) => {
		const entities : z.infer<typeof roomEntity>[] = rooms.map((room) => ({
            ...room,
            _paths: {
                entity: entityPath(room.id),
            }
        }))
		res.json(entities)
	})
}
router.get('/rooms', list)



registry.registerPath({
    method: 'get',
    path: '/rooms/:id',
    tags: ['room'],
    responses: {
        200: {
            description: "A room by id",
            content: {
                'application/json': {
                    schema: roomEntity, 
                },
            },
        },
    },
});

async function get(req: Request, res: Response) {
	const id = z.coerce.number().int().parse(req.params.id);
    prisma.room.findUnique({
		where: {
			id: id,
		},
	}).then((room) => {
		if (!room) {
			res.status(404).json({ error: "Room not found" });
			return;
		}
		const entity : z.infer<typeof roomEntity> = {
			...room,
			_paths: {
				entity: entityPath(room.id),
			}
		}
		res.json(entity)
	})
}
router.get('/rooms/:id', get)


function entityPath(roomId: number) {
	return `/rooms/${roomId}`;
}
export default {
	router,
    registry,
    paths: {
        entity: entityPath,
    },
}
