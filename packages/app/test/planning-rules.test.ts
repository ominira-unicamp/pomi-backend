import {
    isEligibleProfessorEvaluationAttempt,
    validateProfessorEvaluationFacts
} from "#/modules/academic/evaluation/professor/ProfessorEvaluation.rules.js";
import {
    patchSelectionData,
    planCurriculumPeriodChanges,
    validateCurriculumCoursePeriods,
    validateCurriculumSelection
} from "#/modules/planning/curriculum/Curriculum.rules.js";
import {
    resolvePeriodPlanClasses,
    validatePeriodPlanClasses,
    validateProgramGuide,
    validateSavedGuide,
    validateSuggestionGuide
} from "#/modules/planning/period-plan/PeriodPlan.rules.js";
import type {
    AttemptStatus,
    EvaluationMode
} from "#/modules/planning/rules/PlanningRule.js";
import { validateAbsenceFacts } from "#/modules/planning/student-absence/StudentAbsence.rules.js";
import {
    isAttemptApprovedForPrerequisite,
    validateAttemptFacts,
    validateEvaluation
} from "#/modules/planning/student-course-attempt/StudentCourseAttempt.rules.js";
import { planStudentHistoryImport } from "#/modules/planning/student-history-import/StudentHistoryImport.rules.js";
import assert from "node:assert/strict";
import test from "node:test";

test("curriculum period changes accept swaps and reject final collisions", () => {
    const periods = [
        { id: 1, position: 1 },
        { id: 2, position: 2 }
    ];
    const before = structuredClone(periods);
    const swapped = planCurriculumPeriodChanges(periods, {
        update: [
            { id: 1, position: 2 },
            { id: 2, position: 1 }
        ]
    });
    assert.ok(swapped.isOk());
    assert.deepEqual(periods, before);
    assert.ok(
        planCurriculumPeriodChanges(periods, {
            update: [{ id: 1, position: 2 }]
        }).isErr()
    );
    assert.ok(
        planCurriculumPeriodChanges(periods, {
            remove: [1],
            add: [{ position: 1 }]
        }).isOk()
    );
    const missing = planCurriculumPeriodChanges(periods, {
        update: [{ id: 3, position: 3 }],
        remove: [4]
    });
    assert.ok(missing.isErr());
    if (missing.isErr())
        assert.deepEqual(
            missing.error.map((issue) => issue.path),
            [
                ["periods", "update", "0", "id"],
                ["periods", "remove", "0"]
            ]
        );
});

test("curriculum selection retains explicit clears and resets dependencies on program change", () => {
    const existing = {
        catalogProgramId: 1,
        catalogProgramVariant: { id: 2 },
        catalogLanguage: { languageId: 3 }
    };
    assert.deepEqual(patchSelectionData(undefined, existing), {
        catalogProgramId: 1,
        catalogProgramVariantId: 2,
        languageId: 3
    });
    assert.deepEqual(patchSelectionData({ languageId: null }, existing), {
        catalogProgramId: 1,
        catalogProgramVariantId: 2,
        languageId: null
    });
    assert.deepEqual(
        patchSelectionData(
            { catalogProgramId: 4, catalogProgramVariantId: 5 },
            existing
        ),
        { catalogProgramId: 4, catalogProgramVariantId: null, languageId: null }
    );
    assert.ok(
        validateCurriculumSelection(
            { catalogProgramId: 1, catalogProgramVariantId: 2, languageId: 3 },
            {
                program: { id: 1 },
                variant: { catalogProgramId: 4 },
                language: null
            }
        ).isErr()
    );
    assert.ok(validateCurriculumCoursePeriods([1, 1], 1).isOk());
    assert.ok(validateCurriculumCoursePeriods([1, 2], 1).isErr());
});

test("period plan classes preserve set semantics and validate duplicates by course", () => {
    assert.deepEqual(
        [
            ...resolvePeriodPlanClasses([1, 2], {
                remove: new Set([1]),
                add: new Set([3])
            })
        ],
        [2, 3]
    );
    assert.deepEqual(
        [
            ...resolvePeriodPlanClasses([1, 2], {
                set: new Set(),
                add: new Set([3])
            })
        ],
        []
    );
    const result = validatePeriodPlanClasses(
        new Set([1, 2, 3]),
        [
            { id: 1, courseId: 10, studyPeriodId: 1 },
            { id: 2, courseId: 10, studyPeriodId: 2 }
        ],
        1,
        ["classes", "add"]
    );
    assert.ok(result.isErr());
    if (result.isErr())
        assert.deepEqual(
            result.error.map((issue) => issue.path),
            [
                ["classes", "add", "2"],
                ["classes", "add", "3"],
                ["classes", "add", "2"]
            ]
        );
});

test("planning guides distinguish absent references from incompatible suggestions", () => {
    assert.ok(validateSavedGuide(false).isErr());
    assert.ok(validateSavedGuide(true).isOk());
    const missing = validateSuggestionGuide(1, null);
    const incompatible = validateSuggestionGuide(1, 2);
    assert.ok(missing.isErr() && incompatible.isErr());
    if (missing.isErr() && incompatible.isErr()) {
        assert.equal(missing.error[0].code, "REFERENCE_NOT_FOUND");
        assert.equal(incompatible.error[0].code, "INVALID_VALUE");
    }
    const program = validateProgramGuide({
        program: false,
        variant: false,
        language: false
    });
    assert.ok(program.isErr());
    if (program.isErr())
        assert.deepEqual(
            program.error.map((issue) => issue.path.at(-1)),
            ["catalogProgramId", "catalogProgramVariantId", "languageId"]
        );
});

const statuses: AttemptStatus[] = [
    "ENROLLED",
    "DROPPED",
    "APPROVED",
    "FAILED_BY_GRADE",
    "APPROVED_BY_ATTENDANCE",
    "APPROVED_BY_PROFICIENCY",
    "FAILED_BY_ATTENDANCE",
    "SUFFICIENT",
    "INSUFFICIENT"
];
const permitted: Record<EvaluationMode, readonly AttemptStatus[]> = {
    GRADE_AND_ATTENDANCE: [
        "ENROLLED",
        "DROPPED",
        "APPROVED",
        "FAILED_BY_GRADE",
        "APPROVED_BY_PROFICIENCY",
        "FAILED_BY_ATTENDANCE"
    ],
    ATTENDANCE: [
        "ENROLLED",
        "DROPPED",
        "APPROVED_BY_ATTENDANCE",
        "APPROVED_BY_PROFICIENCY",
        "FAILED_BY_ATTENDANCE"
    ],
    CONCEPT: [
        "ENROLLED",
        "DROPPED",
        "APPROVED_BY_PROFICIENCY",
        "SUFFICIENT",
        "INSUFFICIENT"
    ]
};
for (const mode of Object.keys(permitted) as EvaluationMode[]) {
    test(`attempt result compatibility is assessment-specific: ${mode}`, () => {
        for (const status of statuses) {
            const result = validateEvaluation(
                { courseId: 1, status, grade: null },
                mode
            );
            assert.equal(
                result.isOk(),
                permitted[mode].includes(status),
                status
            );
        }
    });
}

test("grades and professor eligibility remain independent of prerequisite approval", () => {
    assert.ok(
        validateEvaluation(
            { courseId: 1, status: "APPROVED_BY_PROFICIENCY", grade: 10 },
            "GRADE_AND_ATTENDANCE"
        ).isErr()
    );
    assert.ok(
        validateEvaluation(
            { courseId: 1, status: "ENROLLED", grade: 10 },
            "GRADE_AND_ATTENDANCE"
        ).isErr()
    );
    assert.ok(
        validateEvaluation(
            { courseId: 1, status: "SUFFICIENT", grade: 10 },
            "CONCEPT"
        ).isErr()
    );
    assert.equal(isAttemptApprovedForPrerequisite("DROPPED"), false);
    assert.equal(isEligibleProfessorEvaluationAttempt("DROPPED"), true);
    assert.equal(isEligibleProfessorEvaluationAttempt("ENROLLED"), false);
});

test("attempt validation preserves reference precedence and catalog-defined assessment", () => {
    const input = {
        courseId: 1,
        classId: 2,
        studyPeriodId: 3,
        status: "APPROVED_BY_PROFICIENCY" as const
    };
    const missing = validateAttemptFacts(input, {
        courseFound: false,
        periodFound: false,
        classData: undefined
    });
    assert.ok(missing.isErr());
    if (missing.isErr()) {
        assert.equal(missing.error.kind, "reference");
        assert.deepEqual(
            missing.error.fields.map((issue) => issue.path),
            [["courseId"], ["studyPeriodId"], ["classId"]]
        );
    }
    const facts = {
        courseFound: true,
        periodFound: true,
        classData: { courseId: 1, studyPeriod: { id: 3, year: 2026 } },
        catalogCourse: { evaluation: "ATTENDANCE" as const }
    };
    assert.ok(validateAttemptFacts(input, facts).isErr());
    const overridden = validateAttemptFacts(
        {
            ...input,
            status: "APPROVED_BY_ATTENDANCE",
            evaluationMode: "CONCEPT"
        },
        facts
    );
    assert.ok(overridden.isErr());
    if (overridden.isErr())
        assert.deepEqual(
            overridden.error.fields.map((issue) => issue.path),
            [["evaluationMode"]]
        );
    const valid = validateAttemptFacts(
        { ...input, status: "APPROVED_BY_ATTENDANCE" },
        facts
    );
    assert.ok(valid.isOk());
    if (valid.isOk()) assert.equal(valid.value.studyPeriodId, null);
});

test("history planning preserves warning order, duplicate precedence and optional class semantics", () => {
    const course = { code: "MC100", status: "ENROLLED" as const, grade: null };
    const facts = {
        periods: [{ id: 1, year: 2026, yearPeriod: "FIRST_SEMESTER" as const }],
        courses: [
            { id: 1, code: "MC100" },
            { id: 2, code: "MC200" },
            { id: 3, code: "MC300" }
        ],
        classes: [],
        catalogCourses: [
            {
                courseId: 1,
                evaluation: "GRADE_AND_ATTENDANCE" as const,
                catalog: { year: 2026 }
            },
            {
                courseId: 2,
                evaluation: "GRADE_AND_ATTENDANCE" as const,
                catalog: { year: 2026 }
            },
            {
                courseId: 3,
                evaluation: "GRADE_AND_ATTENDANCE" as const,
                catalog: { year: 2026 }
            }
        ]
    };
    const planned = planStudentHistoryImport(
        [
            { year: 2025, yearPeriod: "FIRST_SEMESTER", courses: [course] },
            {
                year: 2026,
                yearPeriod: "FIRST_SEMESTER",
                courses: [
                    { ...course, code: "UNKNOWN" },
                    { ...course, classCode: "X" },
                    course,
                    { ...course, code: "MC200" },
                    { ...course, code: "MC300", classCode: null }
                ]
            }
        ],
        facts
    );
    assert.deepEqual(
        planned.warnings.map((warning) => warning.message),
        [
            "Período letivo não encontrado.",
            "Disciplina não encontrada no catálogo local.",
            "Turma não encontrada.",
            "Disciplina repetida no mesmo semestre."
        ]
    );
    assert.equal(planned.rows[0].classId, undefined);
    assert.equal(planned.rows[1].classId, null);
    const unusualGrade = planStudentHistoryImport(
        [
            {
                year: 2026,
                yearPeriod: "FIRST_SEMESTER",
                courses: [{ ...course, grade: 7 }]
            }
        ],
        facts
    );
    assert.equal(unusualGrade.rows[0].grade, 7);
});

test("absence and professor rules preserve reference precedence", () => {
    const missing = validateAbsenceFacts({ date: "2026-10-30" }, null, null);
    assert.ok(missing.isErr());
    if (missing.isErr()) assert.equal(missing.error.kind, "reference");
    assert.ok(
        validateAbsenceFacts(
            { date: "2026-10-30" },
            { classId: 1 },
            { classId: 1, dayOfWeek: "FRIDAY" }
        ).isOk()
    );
    assert.ok(
        validateAbsenceFacts(
            { date: "2026-10-30" },
            { classId: 1 },
            { classId: 1, dayOfWeek: "MONDAY" }
        ).isErr()
    );
    assert.ok(
        validateProfessorEvaluationFacts({
            classFound: false,
            professorFound: false,
            professorInClass: false,
            attemptStatus: null
        }).isErr()
    );
    const allowed = validateProfessorEvaluationFacts({
        classFound: true,
        professorFound: true,
        professorInClass: true,
        attemptStatus: "DROPPED"
    });
    assert.ok(allowed.isOk());
    if (allowed.isOk()) assert.equal(allowed.value.eligible, true);
});

test("attempts without a class retain explicit assessment and optional period rules", () => {
    const facts = {
        courseFound: true,
        periodFound: true,
        classData: undefined
    };
    const valid = validateAttemptFacts(
        {
            courseId: 1,
            status: "ENROLLED",
            evaluationMode: "GRADE_AND_ATTENDANCE",
            studyPeriodId: 4
        },
        facts
    );
    assert.ok(valid.isOk());
    if (valid.isOk()) assert.equal(valid.value.studyPeriodId, 4);
    assert.ok(
        validateAttemptFacts({ courseId: 1, status: "ENROLLED" }, facts).isErr()
    );
    assert.ok(
        validateAttemptFacts(
            { courseId: 1, status: "APPROVED", evaluationMode: "CONCEPT" },
            facts
        ).isErr()
    );
});
