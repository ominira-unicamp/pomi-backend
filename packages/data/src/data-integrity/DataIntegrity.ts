import type { DatabaseClient } from "@pomi/db";
import { Prisma } from "@pomi/db";

export type IntegrityResult = {
    domain: string;
    rule: string;
    description: string;
    count: number;
    sampleKeys: string[];
};

export type IntegrityReport = {
    checkedAt: string;
    sampleLimit: number;
    violations: number;
    results: IntegrityResult[];
};

type Rule = { id: string; description: string; query: string };
type DomainRule = Rule & { domain: string };

const catalogRules: readonly Rule[] = [
    {
        id: "catalog_course_name",
        description: "Disciplina de catálogo sem nome",
        query: `SELECT id FROM data."CatalogCourse" WHERE name IS NULL OR btrim(name) = ''`
    },
    {
        id: "course_identity",
        description: "Disciplina sem código, nome ou créditos válidos",
        query: `SELECT id FROM data."Course" WHERE btrim(code) = '' OR btrim(name) = '' OR credits < 0`
    },
    {
        id: "course_name_latest_catalog",
        description:
            "Nome global da disciplina diverge do catálogo mais recente",
        query: `SELECT co.id FROM data."Course" co JOIN (SELECT DISTINCT ON (cc."courseId") cc."courseId", cc.name FROM data."CatalogCourse" cc JOIN data."Catalog" c ON c.id = cc."catalogId" ORDER BY cc."courseId", c.year DESC) latest ON latest."courseId" = co.id WHERE co.name IS DISTINCT FROM latest.name`
    },
    {
        id: "catalog_course_workload",
        description:
            "Carga horária ou semanas negativas na disciplina de catálogo",
        query: `SELECT id FROM data."CatalogCourse" WHERE "theoreticalHours" < 0 OR "practicalHours" < 0 OR "laboratoryHours" < 0 OR "guidedActivityHours" < 0 OR "distanceHours" < 0 OR "guidedExtensionHours" < 0 OR "practicalExtensionHours" < 0 OR weeks < 0 OR "weeklyClassHours" < 0 OR "classroomHours" < 0`
    },
    {
        id: "catalog_course_attendance",
        description: "Percentual mínimo de frequência fora de 0 a 100",
        query: `SELECT id FROM data."CatalogCourse" WHERE "minimumAttendancePercent" < 0 OR "minimumAttendancePercent" > 100`
    },
    {
        id: "catalog_course_prerequisite_group_empty",
        description: "Grupo de pré-requisitos sem itens",
        query: `SELECT g.id FROM data."CatalogCoursePrerequisiteGroup" g WHERE NOT EXISTS (SELECT 1 FROM data."CatalogCoursePrerequisiteItem" i WHERE i."groupId" = g.id)`
    },
    {
        id: "catalog_course_prerequisite_item_invalid",
        description: "Pré-requisito fora das formas aceitas pela Data API",
        query: `SELECT id FROM data."CatalogCoursePrerequisiteItem" WHERE (
            ("fulfillment" IS NOT NULL AND "specialRequirementType" IS NULL AND "specialRequirementValue" IS NULL)
            OR ("courseId" IS NULL AND "fulfillment" IS NULL AND
                (("specialRequirementType" = 'AUTHORIZATION' AND "specialRequirementValue" = 0)
                OR ("specialRequirementType" = 'PROGRESSION_COEFFICIENT' AND "specialRequirementValue" BETWEEN 0 AND 100)))
        ) IS NOT TRUE`
    },
    {
        id: "catalog_course_prerequisite_self_reference",
        description: "Disciplina exige a si mesma como pré-requisito",
        query: `SELECT i.id FROM data."CatalogCoursePrerequisiteItem" i JOIN data."CatalogCoursePrerequisiteGroup" g ON g.id = i."groupId" JOIN data."CatalogCourse" cc ON cc.id = g."catalogCourseId" WHERE i."courseId" = cc."courseId"`
    },
    {
        id: "catalog_course_prerequisite_duplicate_item",
        description: "Pré-requisito idêntico repetido no mesmo grupo",
        query: `SELECT id FROM (SELECT id, row_number() OVER (PARTITION BY "groupId", "courseId", fulfillment, "specialRequirementType", "specialRequirementValue" ORDER BY id) AS ordinal FROM data."CatalogCoursePrerequisiteItem") items WHERE ordinal > 1`
    },
    {
        id: "program_identity",
        description: "Programa com código não positivo ou nome vazio",
        query: `SELECT id FROM data."Program" WHERE code <= 0 OR btrim(name) = ''`
    },
    {
        id: "specialization_identity",
        description: "Especialização sem código ou nome",
        query: `SELECT id FROM data."Specialization" WHERE btrim(code) = '' OR btrim(name) = ''`
    },
    {
        id: "unit_identity",
        description: "Unidade sem código ou nome",
        query: `SELECT id FROM data."Unit" WHERE btrim(code) = '' OR btrim(name) = ''`
    },
    {
        id: "language_name",
        description: "Língua sem nome",
        query: `SELECT id FROM data."Language" WHERE btrim(name) = ''`
    },
    {
        id: "catalog_language_empty",
        description: "Opção de língua sem blocos curriculares",
        query: `SELECT cl.id FROM data."CatalogLanguage" cl WHERE NOT EXISTS (SELECT 1 FROM data."CourseBlock" b WHERE b."catalogLanguageId" = cl.id)`
    },
    {
        id: "catalog_program_credit_limit_shape",
        description: "Campos incompatíveis com o tipo de limite de créditos",
        query: `SELECT id FROM data."CatalogProgram" WHERE (
            ("creditLimitType" = 'FIXED' AND "creditLimitFixedCredits" IS NOT NULL AND num_nonnulls("creditLimitBeforeThresholdCredits", "creditLimitThresholdCredits", "creditLimitCrBase", "creditLimitCrMultiplier") = 0)
            OR ("creditLimitType" = 'CR_FORMULA' AND "creditLimitFixedCredits" IS NULL AND num_nonnulls("creditLimitBeforeThresholdCredits", "creditLimitThresholdCredits", "creditLimitCrBase", "creditLimitCrMultiplier") = 4)
            OR ("creditLimitType" IS NULL AND num_nonnulls("creditLimitFixedCredits", "creditLimitBeforeThresholdCredits", "creditLimitThresholdCredits", "creditLimitCrBase", "creditLimitCrMultiplier") = 0)
            OR ("creditLimitType" = 'NONE' AND num_nonnulls("creditLimitFixedCredits", "creditLimitBeforeThresholdCredits", "creditLimitThresholdCredits", "creditLimitCrBase", "creditLimitCrMultiplier") = 0)
        ) IS NOT TRUE`
    },
    {
        id: "catalog_program_credit_limit_negative",
        description: "Limite de créditos com valores negativos",
        query: `SELECT id FROM data."CatalogProgram" WHERE "creditLimitFixedCredits" < 0 OR "creditLimitBeforeThresholdCredits" < 0 OR "creditLimitThresholdCredits" < 0 OR "creditLimitCrBase" < 0 OR "creditLimitCrMultiplier" < 0`
    },
    {
        id: "catalog_program_variant_identity",
        description: "Variante sem exatamente uma identidade",
        query: `SELECT id FROM data."CatalogProgramVariant" WHERE ("programId" IS NULL) = ("specializationId" IS NULL)`
    },
    {
        id: "catalog_program_variant_program",
        description: "Variante de programa vinculada a outro programa",
        query: `SELECT v.id FROM data."CatalogProgramVariant" v JOIN data."CatalogProgram" cp ON cp.id = v."catalogProgramId" WHERE v."programId" IS NOT NULL AND v."programId" <> cp."programId"`
    },
    {
        id: "catalog_program_variant_specialization",
        description: "Especialização da variante pertence a outro programa",
        query: `SELECT v.id FROM data."CatalogProgramVariant" v JOIN data."CatalogProgram" cp ON cp.id = v."catalogProgramId" JOIN data."Specialization" s ON s.id = v."specializationId" WHERE s."programId" <> cp."programId"`
    },
    {
        id: "catalog_program_variant_integralization",
        description:
            "Integralização com valores negativos, duração nula ou máximo menor que o previsto",
        query: `SELECT id FROM data."CatalogProgramVariant" WHERE "integralizationCredits" < 0 OR "integralizationSupervisedHours" < 0 OR "integralizationExtensionHours" < 0 OR "integralizationSemesters" <= 0 OR "integralizationMaximumSemesters" <= 0 OR "integralizationMaximumSemesters" < "integralizationSemesters"`
    },
    {
        id: "course_block_parent",
        description: "Bloco sem exatamente um proprietário",
        query: `SELECT id FROM data."CourseBlock" WHERE num_nonnulls("catalogLanguageId", "catalogProgramVariantId", "catalogProgramId") <> 1`
    },
    {
        id: "course_block_credits",
        description: "Bloco eletivo com créditos negativos",
        query: `SELECT id FROM data."CourseBlock" WHERE type = 'elective' AND credits < 0`
    },
    {
        id: "course_block_mandatory_credits",
        description: "Bloco obrigatório com créditos próprios",
        query: `SELECT id FROM data."CourseBlock" WHERE type = 'mandatory' AND credits IS NOT NULL`
    },
    {
        id: "course_block_empty",
        description: "Bloco de curso sem requisitos",
        query: `SELECT b.id FROM data."CourseBlock" b WHERE NOT EXISTS (SELECT 1 FROM data."CourseRequirement" r WHERE r."courseBlockId" = b.id)`
    },
    {
        id: "course_requirement_variant",
        description: "Requisito de curso fora da forma definida pela Data API",
        query: `SELECT id FROM data."CourseRequirement" WHERE NOT (
            (type = 'any' AND "courseId" IS NULL AND prefix IS NULL)
            OR (type = 'prefix' AND "courseId" IS NULL AND prefix IS NOT NULL AND btrim(prefix) <> '')
            OR (type = 'specific' AND "courseId" IS NOT NULL AND prefix IS NULL)
        )`
    },
    {
        id: "suggestion_semester",
        description: "Semestre de sugestão com número ou créditos inválidos",
        query: `SELECT id FROM data."SemesterSuggestion" WHERE semester < 1 OR "electiveCredits" < 0`
    },
    {
        id: "curriculum_suggestion_empty",
        description: "Proposta curricular sem semestres",
        query: `SELECT cs.id FROM data."CurriculumSuggestion" cs WHERE NOT EXISTS (SELECT 1 FROM data."SemesterSuggestion" ss WHERE ss."suggestionId" = cs.id)`
    }
];

const academicRules: readonly Rule[] = [
    {
        id: "department_name",
        description: "Departamento sem nome",
        query: `SELECT id FROM data."Department" WHERE btrim(name) = ''`
    },
    {
        id: "coordinator_name",
        description: "Coordenador sem nome",
        query: `SELECT id FROM data."Coordinator" WHERE btrim(name) = ''`
    },
    {
        id: "study_period_dates",
        description:
            "Período letivo com ano inválido ou data inicial divergente",
        query: `SELECT id FROM data."StudyPeriod" WHERE year < 1 OR EXTRACT(YEAR FROM "startDate") <> year`
    },
    {
        id: "professor_name",
        description: "Professor sem nome",
        query: `SELECT id FROM data."Professor" WHERE btrim(name) = ''`
    },
    {
        id: "room_code",
        description: "Sala sem código",
        query: `SELECT id FROM data."Room" WHERE btrim(code) = ''`
    },
    {
        id: "class_code",
        description: "Turma sem código",
        query: `SELECT id FROM data."Class" WHERE btrim(code) = ''`
    },
    {
        id: "class_schedule_time",
        description: "Horário de turma inválido ou com início após o término",
        query: `SELECT id FROM data."ClassSchedule" WHERE start !~ '^([01][0-9]|2[0-3]):[0-5][0-9]$' OR "end" !~ '^([01][0-9]|2[0-3]):[0-5][0-9]$' OR start >= "end"`
    }
];

const portalRules: readonly Rule[] = [
    {
        id: "profile_identity",
        description: "Perfil sem identidade válida",
        query: `SELECT id FROM unicamp_data_portal.data_portal_professor_profile WHERE "portalId" <= 0 OR btrim(name) = ''`
    },
    {
        id: "profile_department_unit",
        description: "Departamento do perfil pertence a outra unidade",
        query: `SELECT p.id FROM unicamp_data_portal.data_portal_professor_profile p JOIN data."Department" d ON d.id = p."departmentId" WHERE p."unitId" <> d."unitId"`
    },
    {
        id: "career_reference",
        description:
            "Referência de carreira com código vazio ou ordem negativa",
        query: `SELECT id FROM unicamp_data_portal.data_portal_academic_career_reference WHERE btrim(code) = '' OR "progressionOrder" < 0`
    },
    {
        id: "position_shape",
        description: "Cargo fora das combinações aceitas pelo portal",
        query: `SELECT id FROM unicamp_data_portal.data_portal_position WHERE btrim("canonicalKey") = '' OR (
        ("affiliationType" = 'CAREER' AND "careerReferenceId" IS NOT NULL AND "programCode" IS NULL AND "postdoctoralModality" IS NULL)
        OR ("affiliationType" = 'COLLABORATOR' AND num_nonnulls("careerReferenceId", "programCode", "postdoctoralModality") = 0)
        OR ("affiliationType" = 'SENIOR' AND ((num_nonnulls("careerReferenceId", "programCode", "postdoctoralModality") = 0) OR ("careerReferenceId" IS NOT NULL AND nullif(btrim("programCode"), '') IS NOT NULL AND "postdoctoralModality" IS NULL)))
        OR ("affiliationType" = 'VISITING_INVITED' AND num_nonnulls("careerReferenceId", "programCode", "postdoctoralModality") = 0)
        OR ("affiliationType" = 'VISITING_SPECIALIST' AND "careerReferenceId" IS NULL AND nullif(btrim("programCode"), '') IS NOT NULL AND "postdoctoralModality" IS NULL)
        OR ("affiliationType" = 'POSTDOCTORAL_PROGRAM' AND "careerReferenceId" IS NULL AND "postdoctoralModality" IS NOT NULL)
    ) IS NOT TRUE`
    },
    {
        id: "external_identity",
        description: "Identificador externo vazio",
        query: `SELECT id FROM unicamp_data_portal.data_portal_external_identity WHERE btrim("externalId") = ''`
    },
    {
        id: "citation_name",
        description: "Nome de citação vazio",
        query: `SELECT id FROM unicamp_data_portal.data_portal_citation_name WHERE btrim(name) = ''`
    },
    {
        id: "training",
        description: "Formação com instituição ou ano inválido",
        query: `SELECT id FROM unicamp_data_portal.data_portal_training WHERE btrim("institutionName") = '' OR "startYear" < 1 OR "endYear" < 1 OR "startYear" > "endYear"`
    },
    {
        id: "keyword",
        description: "Palavra-chave sem nome ou forma normalizada",
        query: `SELECT id FROM unicamp_data_portal.data_portal_keyword WHERE btrim(name) = '' OR btrim("normalizedName") = ''`
    },
    {
        id: "profile_keyword_count",
        description: "Contagem negativa de palavra-chave do perfil",
        query: `SELECT "profileId"::text || ':' || "keywordId"::text AS id FROM unicamp_data_portal.data_portal_professor_keyword WHERE count < 0`
    },
    {
        id: "coauthor",
        description: "Coautor sem nome ou forma normalizada",
        query: `SELECT id FROM unicamp_data_portal.data_portal_coauthor WHERE btrim(name) = '' OR btrim("normalizedName") = ''`
    },
    {
        id: "profile_coauthor_count",
        description: "Contagem negativa de coautoria do perfil",
        query: `SELECT "profileId"::text || ':' || "coauthorId"::text AS id FROM unicamp_data_portal.data_portal_professor_coauthor WHERE count < 0`
    }
];

const menuRules: readonly Rule[] = [
    {
        id: "meal_status",
        description: "Refeição com prato incompatível com o estado",
        query: `SELECT id FROM data."Meal" WHERE (status = 'AVAILABLE' AND nullif(btrim("mainDish"), '') IS NULL) OR (status = 'NOT_REGISTERED' AND "mainDish" IS NOT NULL)`
    },
    {
        id: "unregistered_meal_content",
        description: "Refeição não cadastrada com itens ou observações",
        query: `SELECT m.id FROM data."Meal" m WHERE m.status = 'NOT_REGISTERED' AND (EXISTS (SELECT 1 FROM data."MealItem" i WHERE i."mealId" = m.id) OR EXISTS (SELECT 1 FROM data."MealObservation" o WHERE o."mealId" = m.id) OR EXISTS (SELECT 1 FROM data."MealServiceNote" n WHERE n."mealId" = m.id))`
    },
    {
        id: "meal_item_text",
        description: "Item de refeição vazio",
        query: `SELECT id FROM data."MealItem" WHERE btrim(text) = ''`
    },
    {
        id: "meal_observation_text",
        description: "Observação de refeição vazia",
        query: `SELECT id FROM data."MealObservation" WHERE btrim(text) = ''`
    },
    {
        id: "meal_service_note_text",
        description: "Nota de serviço de refeição vazia",
        query: `SELECT id FROM data."MealServiceNote" WHERE btrim(text) = ''`
    }
];

const exchangeRules: readonly Rule[] = [
    {
        id: "notice_identity",
        description: "Edital sem chave ou dados de identificação",
        query: `SELECT id FROM data."ExchangeNotice" WHERE btrim("naturalKey") = '' OR num_nonnulls(nullif(btrim(number), ''), nullif(btrim(issuer), ''), nullif(btrim(title), '')) = 0`
    },
    {
        id: "notice_registration_dates",
        description: "Edital com inscrição encerrada antes da abertura",
        query: `SELECT id FROM data."ExchangeNotice" WHERE "registrationStart" > "registrationEnd"`
    },
    {
        id: "notice_file_name",
        description: "Arquivo de edital sem nome",
        query: `SELECT id FROM data."ExchangeNoticeFile" WHERE btrim(name) = '' OR btrim("normalizedName") = ''`
    },
    {
        id: "exchange_place_name",
        description: "Local de intercâmbio sem nome",
        query: `SELECT id FROM data."ExchangePlace" WHERE btrim(name) = '' OR btrim("normalizedName") = ''`
    }
];

const calendarRules: readonly Rule[] = [
    {
        id: "calendar_event",
        description: "Evento sem descrição ou com fim anterior ao início",
        query: `SELECT id FROM data."CalendarEvent" WHERE btrim(description) = '' OR "endDate" < "startDate"`
    },
    {
        id: "calendar_tag",
        description: "Etiqueta de calendário sem nome",
        query: `SELECT id FROM data."CalendarTag" WHERE btrim(name) = ''`
    }
];

const auditRules: readonly Rule[] = [
    {
        id: "audit_event_shape",
        description: "Evento de auditoria sem chave ou estado esperado",
        query: `SELECT id FROM data."DataAuditEvent" WHERE "recordKey" IS NULL OR (operation = 'CREATE' AND (before IS NOT NULL OR after IS NULL)) OR (operation = 'UPDATE' AND (before IS NULL OR after IS NULL)) OR (operation = 'DELETE' AND (before IS NULL OR after IS NOT NULL))`
    }
];

export const dataIntegrityRules: readonly DomainRule[] = [
    ...catalogRules.map((rule) => ({ domain: "catalog", ...rule })),
    ...academicRules.map((rule) => ({ domain: "academic", ...rule })),
    ...portalRules.map((rule) => ({
        domain: "professor-data-portal",
        ...rule
    })),
    ...menuRules.map((rule) => ({ domain: "menu", ...rule })),
    ...exchangeRules.map((rule) => ({ domain: "exchange", ...rule })),
    ...calendarRules.map((rule) => ({ domain: "calendar", ...rule })),
    ...auditRules.map((rule) => ({ domain: "audit", ...rule }))
];

type QueryRow = { count: bigint; sampleKeys: string[] | null };

export async function auditDataIntegrity(
    database: DatabaseClient,
    sampleLimit = 20
): Promise<IntegrityReport> {
    if (!Number.isInteger(sampleLimit) || sampleLimit < 0 || sampleLimit > 100)
        throw new Error("sampleLimit deve ser um inteiro entre 0 e 100");

    return database.$transaction(
        async (tx) => {
            await tx.$executeRawUnsafe("SET TRANSACTION READ ONLY");
            const checkedAt = new Date().toISOString();
            const results: IntegrityResult[] = [];
            for (const rule of dataIntegrityRules) {
                const rows = await tx.$queryRawUnsafe<QueryRow[]>(
                    `WITH violations AS (${rule.query})
                     SELECT (SELECT count(*) FROM violations) AS count,
                            (SELECT array_agg(key ORDER BY key) FROM
                                (SELECT id::text AS key FROM violations ORDER BY id LIMIT $1) sampled) AS "sampleKeys"`,
                    sampleLimit
                );
                const row = rows[0];
                if (!row)
                    throw new Error(`Regra ${rule.id} não retornou resultado`);
                results.push({
                    domain: rule.domain,
                    rule: rule.id,
                    description: rule.description,
                    count: Number(row.count),
                    sampleKeys: row.sampleKeys ?? []
                });
            }
            return {
                checkedAt,
                sampleLimit,
                violations: results.reduce(
                    (total, result) => total + result.count,
                    0
                ),
                results
            };
        },
        {
            isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead,
            timeout: 120000
        }
    );
}
