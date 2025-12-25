import { PrismaPg } from '@prisma/adapter-pg'
import { PrismaClient, Prisma} from '../prisma/generated/client'
import * as models from '../prisma/generated/zod/schemas/models/index'
const pool = new PrismaPg({ connectionString: process.env.DATABASE_URL! })
const prisma = new PrismaClient({ adapter: pool })

export default prisma
export {
	Prisma, 
	models
}