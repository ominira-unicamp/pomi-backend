import type { PrismaClient } from "@pomi/db";
import { socialPerson } from "./social.js";

export function friendshipFixture() {
    const instant = new Date("2026-01-02T12:00:00.000Z");
    const row = {
        id: 3,
        userAId: 7,
        userBId: 8,
        requestedByUserId: 8,
        status: "PENDING" as "PENDING" | "ACCEPTED",
        acceptedAt: null as Date | null,
        createdAt: new Date("2026-01-01T00:00:00.000Z"),
        userA: socialPerson(7),
        userB: socialPerson(8)
    };
    const state: {
        existing: typeof row | null;
        finalRow: typeof row | null;
        changedCount: number;
        findError?: Error;
        writeError?: Error;
        finalReadError?: Error;
    } = {
        existing: row,
        finalRow: { ...row, status: "ACCEPTED", acceptedAt: instant },
        changedCount: 1
    };
    const calls = {
        finds: [] as unknown[],
        writes: [] as unknown[],
        reads: [] as unknown[],
        clockReads: 0
    };
    const clock = {
        now() {
            calls.clockReads++;
            return instant;
        }
    };
    const prisma = {
        studentFriendship: {
            async findFirst(input: {
                where: {
                    id: number;
                    OR: { userAId?: number; userBId?: number }[];
                };
            }) {
                calls.finds.push(input);
                if (state.findError) throw state.findError;
                const existing = state.existing;
                return existing &&
                    existing.id === input.where.id &&
                    input.where.OR.some(
                        (entry) =>
                            entry.userAId === existing.userAId ||
                            entry.userBId === existing.userBId
                    )
                    ? existing
                    : null;
            },
            async updateMany(input: unknown) {
                calls.writes.push(input);
                if (state.writeError) throw state.writeError;
                return { count: state.changedCount };
            },
            async findUnique(input: unknown) {
                calls.reads.push(input);
                if (state.finalReadError) throw state.finalReadError;
                return state.finalRow;
            }
        }
    } as unknown as PrismaClient;
    return { prisma, clock, calls, state, instant, row };
}
