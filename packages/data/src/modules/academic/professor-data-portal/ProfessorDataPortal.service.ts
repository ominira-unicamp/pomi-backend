import IO, {
    coauthorSort,
    departmentSort,
    keywordSort,
    positionSort,
    profileSort
} from "#/modules/academic/professor-data-portal/ProfessorDataPortal.contract.js";
import {
    compileFilterWhere,
    compileSort,
    err,
    InconsistentResourceStateError,
    ok,
    prismaWhereFor,
    resolveSort,
    ResourceNotFoundProblem,
    type Filter,
    type FilterWhereBuilder,
    type Result
} from "@pomi/api-core";
import type { Department, Prisma, PrismaClient } from "@pomi/db";
import z from "zod";

type Profile = ReturnType<typeof buildProfile>;
const profileInclude = {
    unit: true,
    department: true,
    position: { include: { careerReference: true } },
    identities: true,
    citationNames: true,
    trainings: true,
    keywords: { include: { keyword: true } },
    coauthors: { include: { coauthor: true } }
} as const;

type ProfileValue = Prisma.ProfessorDataPortalProfileGetPayload<{
    include: typeof profileInclude;
}>;
type PositionValue = Prisma.AcademicPositionGetPayload<{
    include: { careerReference: true };
}>;
type ProfileQuery = z.infer<typeof IO.profile.list.request>["query"];
type DepartmentQuery = z.infer<typeof IO.departments.list.request>["query"];
type NameQuery = z.infer<typeof IO.keywords.list.request>["query"];
type PositionQuery = z.infer<typeof IO.positions.list.request>["query"];

const profileWhere =
    prismaWhereFor<Prisma.ProfessorDataPortalProfileWhereInput>();
const profileWhereDefinitions = {
    professorId: profileWhere.numberAt("professorId"),
    portalId: profileWhere.numberAt("portalId"),
    unitId: profileWhere.numberAt("unitId"),
    departmentId: profileWhere.numberAt("departmentId"),
    positionId: profileWhere.numberAt("positionId"),
    name: profileWhere.containsAt("name")
} satisfies Record<
    string,
    FilterWhereBuilder<Prisma.ProfessorDataPortalProfileWhereInput>
>;
const departmentWhere = prismaWhereFor<Prisma.DepartmentWhereInput>();
const departmentWhereDefinitions = {
    unitId: departmentWhere.numberAt("unitId"),
    name: departmentWhere.containsAt("name")
} satisfies Record<string, FilterWhereBuilder<Prisma.DepartmentWhereInput>>;
const keywordWhere = prismaWhereFor<Prisma.KeywordWhereInput>();
const keywordWhereDefinitions = {
    name: keywordWhere.containsAt("name")
} satisfies Record<string, FilterWhereBuilder<Prisma.KeywordWhereInput>>;
const coauthorWhere = prismaWhereFor<Prisma.CoauthorWhereInput>();
const coauthorWhereDefinitions = {
    name: coauthorWhere.containsAt("name")
} satisfies Record<string, FilterWhereBuilder<Prisma.CoauthorWhereInput>>;
const positionWhere = prismaWhereFor<Prisma.AcademicPositionWhereInput>();
const positionWhereDefinitions = {
    id: positionWhere.numberAt("id"),
    canonicalKey: positionWhere.containsAt("canonicalKey"),
    role: positionWhere.enumAt("role")
} satisfies Record<
    string,
    FilterWhereBuilder<Prisma.AcademicPositionWhereInput>
>;

function buildPosition(value: PositionValue) {
    const career = value.careerReference
        ? {
              reference: {
                  career: value.careerReference.career,
                  code: value.careerReference.code,
                  rank: value.careerReference.rank,
                  category: value.careerReference.category,
                  progressionOrder: value.careerReference.progressionOrder
              }
          }
        : null;
    const invalid = (reason: string): never => {
        throw new InconsistentResourceStateError(
            "AcademicPosition",
            value.id,
            reason
        );
    };
    let affiliation!:
        | { type: "CAREER"; career: NonNullable<typeof career> }
        | { type: "COLLABORATOR" }
        | {
              type: "SENIOR";
              senior:
                  | { kind: "GENERAL" }
                  | {
                        kind: "CAREER";
                        career: NonNullable<typeof career>;
                        programCode: string;
                    };
          }
        | { type: "VISITING_INVITED" }
        | {
              type: "VISITING_SPECIALIST";
              visitingSpecialist: { programCode: string };
          }
        | {
              type: "POSTDOCTORAL_PROGRAM";
              postdoctoralProgram: {
                  modality: string;
                  programCode: string | null;
              };
          };
    switch (value.affiliationType) {
        case "CAREER":
            if (
                !career ||
                value.programCode !== null ||
                value.postdoctoralModality !== null
            )
                invalid("career_affiliation_has_invalid_data");
            affiliation = { type: "CAREER", career: career! };
            break;
        case "COLLABORATOR":
            if (
                career ||
                value.programCode !== null ||
                value.postdoctoralModality !== null
            )
                invalid("collaborator_affiliation_has_invalid_data");
            affiliation = { type: "COLLABORATOR" };
            break;
        case "SENIOR":
            if (
                !career &&
                value.programCode === null &&
                value.postdoctoralModality === null
            ) {
                affiliation = { type: "SENIOR", senior: { kind: "GENERAL" } };
                break;
            }
            if (
                !career ||
                value.programCode === null ||
                value.postdoctoralModality !== null
            )
                invalid("senior_affiliation_has_invalid_data");
            affiliation = {
                type: "SENIOR",
                senior: {
                    kind: "CAREER",
                    career: career!,
                    programCode: value.programCode!
                }
            };
            break;
        case "VISITING_INVITED":
            if (
                career ||
                value.programCode !== null ||
                value.postdoctoralModality !== null
            )
                invalid("visiting_invited_affiliation_has_invalid_data");
            affiliation = { type: "VISITING_INVITED" };
            break;
        case "VISITING_SPECIALIST":
            if (
                career ||
                value.programCode === null ||
                value.postdoctoralModality !== null
            )
                invalid("visiting_specialist_affiliation_has_invalid_data");
            affiliation = {
                type: "VISITING_SPECIALIST",
                visitingSpecialist: { programCode: value.programCode! }
            };
            break;
        case "POSTDOCTORAL_PROGRAM":
            if (!value.postdoctoralModality || career)
                invalid("postdoctoral_affiliation_has_invalid_data");
            affiliation = {
                type: "POSTDOCTORAL_PROGRAM",
                postdoctoralProgram: {
                    modality: value.postdoctoralModality!,
                    programCode: value.programCode
                }
            };
            break;
        default:
            invalid("unknown_affiliation_type");
    }
    return {
        id: value.id,
        canonicalKey: value.canonicalKey,
        role: value.role,
        affiliation
    };
}

function buildProfile(value: ProfileValue) {
    return {
        id: value.id,
        professorId: value.professorId,
        portalId: value.portalId,
        name: value.name,
        email: value.email,
        lattesAbstract: value.lattesAbstract,
        unit: {
            id: value.unit.id,
            code: value.unit.code,
            name: value.unit.name
        },
        department: value.department
            ? {
                  id: value.department.id,
                  name: value.department.name,
                  unitId: value.department.unitId
              }
            : null,
        position: value.position ? buildPosition(value.position) : null,
        identifiers: value.identities.map((item) => ({
            id: item.id,
            system: item.system,
            externalId: item.externalId
        })),
        citationNames: value.citationNames.map((item) => ({
            id: item.id,
            name: item.name
        })),
        trainings: value.trainings.map((item) => ({
            id: item.id,
            degree: item.degree,
            institutionName: item.institutionName,
            startYear: item.startYear,
            endYear: item.endYear
        })),
        keywords: value.keywords.map((item) => ({
            id: item.keyword.id,
            name: item.keyword.name,
            count: item.count
        })),
        coauthors: value.coauthors.map((item) => ({
            id: item.coauthor.id,
            name: item.coauthor.name,
            count: item.count
        }))
    };
}

export type ProfessorDataPortalService = {
    listProfiles(
        query: ProfileQuery
    ): Promise<{ items: Profile[]; total: number }>;
    getProfile(
        id: number
    ): Promise<
        Result<Profile, ReturnType<typeof ResourceNotFoundProblem.create>>
    >;
    listPositions(
        query: PositionQuery
    ): Promise<ReturnType<typeof buildPosition>[]>;
    getPosition(
        id: number
    ): Promise<
        Result<
            ReturnType<typeof buildPosition>,
            ReturnType<typeof ResourceNotFoundProblem.create>
        >
    >;
    listDepartments(query: DepartmentQuery): Promise<Department[]>;
    getDepartment(
        id: number
    ): Promise<
        Result<Department, ReturnType<typeof ResourceNotFoundProblem.create>>
    >;
    listKeywords(
        query: NameQuery
    ): Promise<{ items: Array<{ id: number; name: string }>; total: number }>;
    getKeyword(
        id: number
    ): Promise<
        Result<
            { id: number; name: string },
            ReturnType<typeof ResourceNotFoundProblem.create>
        >
    >;
    listCoauthors(
        query: NameQuery
    ): Promise<{ items: Array<{ id: number; name: string }>; total: number }>;
    getCoauthor(
        id: number
    ): Promise<
        Result<
            { id: number; name: string },
            ReturnType<typeof ResourceNotFoundProblem.create>
        >
    >;
};

const notFound = () =>
    err(ResourceNotFoundProblem.create({ detail: "Resource not found" }));
export function createProfessorDataPortalService({
    prisma
}: {
    prisma: PrismaClient;
}): ProfessorDataPortalService {
    return {
        async listProfiles(query) {
            const filterWhere = compileFilterWhere(
                query.filter as Filter | undefined,
                profileWhereDefinitions,
                "professor data portal profile"
            );
            const where: Prisma.ProfessorDataPortalProfileWhereInput =
                filterWhere.length > 0 ? { AND: filterWhere } : {};
            const [total, values] = await Promise.all([
                prisma.professorDataPortalProfile.count({ where }),
                prisma.professorDataPortalProfile.findMany({
                    where,
                    include: profileInclude,
                    orderBy: compileSort(resolveSort(query.sort, profileSort), {
                        name: (direction) => ({ name: direction }),
                        id: (direction) => ({ id: direction })
                    }),
                    skip: ((query.page ?? 1) - 1) * (query.pageSize ?? 20),
                    take: query.pageSize ?? 20
                })
            ]);
            return { total, items: values.map((value) => buildProfile(value)) };
        },
        async getProfile(id) {
            const value = await prisma.professorDataPortalProfile.findUnique({
                where: { id },
                include: profileInclude
            });
            return value ? ok(buildProfile(value)) : notFound();
        },
        async listPositions(query) {
            const filterWhere = compileFilterWhere(
                query.filter as Filter | undefined,
                positionWhereDefinitions,
                "professor position"
            );
            const values = await prisma.academicPosition.findMany({
                where: filterWhere.length > 0 ? { AND: filterWhere } : {},
                include: { careerReference: true },
                orderBy: compileSort(resolveSort(query.sort, positionSort), {
                    canonicalKey: (direction) => ({ canonicalKey: direction }),
                    role: (direction) => ({ role: direction }),
                    id: (direction) => ({ id: direction })
                })
            });
            return values.map(buildPosition);
        },
        async getPosition(id) {
            const value = await prisma.academicPosition.findUnique({
                where: { id },
                include: { careerReference: true }
            });
            return value ? ok(buildPosition(value)) : notFound();
        },
        async listDepartments(query) {
            const filterWhere = compileFilterWhere(
                query.filter as Filter | undefined,
                departmentWhereDefinitions,
                "department"
            );
            return prisma.department.findMany({
                where: filterWhere.length > 0 ? { AND: filterWhere } : {},
                orderBy: compileSort(resolveSort(query.sort, departmentSort), {
                    name: (direction) => ({ name: direction }),
                    id: (direction) => ({ id: direction })
                })
            });
        },
        async getDepartment(id) {
            const value = await prisma.department.findUnique({ where: { id } });
            return value ? ok(value) : notFound();
        },
        async listKeywords(query) {
            const filterWhere = compileFilterWhere(
                query.filter,
                keywordWhereDefinitions,
                "keyword"
            );
            const where: Prisma.KeywordWhereInput =
                filterWhere.length > 0 ? { AND: filterWhere } : {};
            const [total, values] = await Promise.all([
                prisma.keyword.count({ where }),
                prisma.keyword.findMany({
                    where,
                    orderBy: compileSort(resolveSort(query.sort, keywordSort), {
                        name: (direction) => ({ name: direction }),
                        id: (direction) => ({ id: direction })
                    }),
                    skip: ((query.page ?? 1) - 1) * (query.pageSize ?? 20),
                    take: query.pageSize ?? 20
                })
            ]);
            return {
                total,
                items: values.map(({ id, name }) => ({ id, name }))
            };
        },
        async getKeyword(id) {
            const value = await prisma.keyword.findUnique({ where: { id } });
            return value ? ok({ id: value.id, name: value.name }) : notFound();
        },
        async listCoauthors(query) {
            const filterWhere = compileFilterWhere(
                query.filter,
                coauthorWhereDefinitions,
                "coauthor"
            );
            const where: Prisma.CoauthorWhereInput =
                filterWhere.length > 0 ? { AND: filterWhere } : {};
            const [total, values] = await Promise.all([
                prisma.coauthor.count({ where }),
                prisma.coauthor.findMany({
                    where,
                    orderBy: compileSort(
                        resolveSort(query.sort, coauthorSort),
                        {
                            name: (direction) => ({ name: direction }),
                            id: (direction) => ({ id: direction })
                        }
                    ),
                    skip: ((query.page ?? 1) - 1) * (query.pageSize ?? 20),
                    take: query.pageSize ?? 20
                })
            ]);
            return {
                total,
                items: values.map(({ id, name }) => ({ id, name }))
            };
        },
        async getCoauthor(id) {
            const value = await prisma.coauthor.findUnique({ where: { id } });
            return value ? ok({ id: value.id, name: value.name }) : notFound();
        }
    };
}
