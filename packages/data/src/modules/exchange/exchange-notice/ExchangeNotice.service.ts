import type {
    ExchangeNoticeFilter,
    ExchangeNoticeFilterName
} from "#/modules/exchange/exchange-notice/ExchangeNotice.contract.js";
import IO from "#/modules/exchange/exchange-notice/ExchangeNotice.contract.js";
import exchangeNoticeEntity from "#/modules/exchange/exchange-notice/ExchangeNotice.entity.js";
import {
    compileFilterWhere,
    err,
    ok,
    prismaWhereFor,
    ResourceNotFoundProblem,
    type FilterWhereBuilder,
    type Result
} from "@pomi/api-core";
import type { MyPrisma, PrismaClient } from "@pomi/db";
import z from "zod";

type ExchangeNotice = z.infer<typeof IO.schema>;
type ListQuery = z.infer<typeof IO.list.request>["query"];

const exchangeNoticeWhere = prismaWhereFor<MyPrisma.ExchangeNoticeWhereInput>();
const exchangeNoticeWhereDefinitions = {
    number: exchangeNoticeWhere.stringAt("number"),
    issuer: exchangeNoticeWhere.stringAt("issuer"),
    title: exchangeNoticeWhere.stringAt("title"),
    placeId: exchangeNoticeWhere.numberAt("placeId"),
    placeName: exchangeNoticeWhere.stringAt("place.name"),
    registrationStart: exchangeNoticeWhere.dateAt("registrationStart"),
    registrationEnd: exchangeNoticeWhere.dateAt("registrationEnd")
} satisfies Record<
    ExchangeNoticeFilterName,
    FilterWhereBuilder<MyPrisma.ExchangeNoticeWhereInput>
>;

export function exchangeNoticeFilterWhere(
    filter: ExchangeNoticeFilter | undefined
): MyPrisma.ExchangeNoticeWhereInput[] {
    return compileFilterWhere(
        filter,
        exchangeNoticeWhereDefinitions,
        "exchange notice"
    );
}

function normalizeSearch(value: string) {
    return value
        .normalize("NFD")
        .replace(/\p{M}/gu, "")
        .toLocaleLowerCase("pt-BR");
}

function matchesSearch(notice: ExchangeNotice, query: string | undefined) {
    if (!query) return true;
    const normalized = normalizeSearch(query);
    return [notice.title, notice.number, notice.place?.name]
        .filter((value): value is string => Boolean(value))
        .some((value) => normalizeSearch(value).includes(normalized));
}

export type ExchangeNoticeService = {
    list(query: ListQuery): Promise<ExchangeNotice[]>;
    getById(
        id: number
    ): Promise<
        Result<
            ExchangeNotice,
            ReturnType<typeof ResourceNotFoundProblem.create>
        >
    >;
};

export function createExchangeNoticeService({
    prisma
}: {
    prisma: PrismaClient;
}): ExchangeNoticeService {
    return {
        async list(query) {
            const filterWhere = exchangeNoticeFilterWhere(query.filter);
            const notices = await prisma.exchangeNotice.findMany({
                ...exchangeNoticeEntity.prismaSelection,
                where: filterWhere.length > 0 ? { AND: filterWhere } : {},
                orderBy: [
                    { registrationEnd: { sort: "desc", nulls: "last" } },
                    { registrationStart: { sort: "desc", nulls: "last" } },
                    { id: "desc" }
                ]
            });
            return notices
                .map(exchangeNoticeEntity.build)
                .filter((notice) => matchesSearch(notice, query.q));
        },
        async getById(id) {
            const notice = await prisma.exchangeNotice.findUnique({
                ...exchangeNoticeEntity.prismaSelection,
                where: { id }
            });
            return notice
                ? ok(exchangeNoticeEntity.build(notice))
                : err(
                      ResourceNotFoundProblem.create({
                          detail: "Exchange notice not found"
                      })
                  );
        }
    };
}
