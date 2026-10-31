import type { Principal } from "#/auth.js";
import { AuthRegistry, type AuthorizationPolicy } from "#/auth.js";
import type { ProfessorEvaluationService } from "#/modules/academic/evaluation/professor/ProfessorEvaluation.service.js";
import type { EvaluationSummaryService } from "#/modules/academic/evaluation/summary/EvaluationSummary.service.js";
import type { ExchangeNoticeSubscriptionService } from "#/modules/exchange/exchange-notice-subscription/ExchangeNoticeSubscription.service.js";
import type { ExchangeNoticeUnsubscribeService } from "#/modules/exchange/exchange-notice-unsubscribe/ExchangeNoticeUnsubscribe.service.js";
import type { FeedbackReportService } from "#/modules/feedback/feedback-report/FeedbackReport.service.js";
import type { AuthUserService } from "#/modules/identity/auth-user/AuthUser.service.js";
import type { BotGrantService } from "#/modules/identity/bot-grant/BotGrant.service.js";
import type { CurrentUserService } from "#/modules/identity/current-user/CurrentUser.service.js";
import type { CurriculumService } from "#/modules/planning/curriculum/Curriculum.service.js";
import type { PeriodPlanService } from "#/modules/planning/period-plan/PeriodPlan.service.js";
import type { SharedPeriodPlanService } from "#/modules/planning/shared-period-plan/SharedPeriodPlan.service.js";
import type { StudentAbsenceService } from "#/modules/planning/student-absence/StudentAbsence.service.js";
import type { StudentCourseAttemptService } from "#/modules/planning/student-course-attempt/StudentCourseAttempt.service.js";
import type { StudentHistoryImportService } from "#/modules/planning/student-history-import/StudentHistoryImport.service.js";
import type { SocialFriendshipService } from "#/modules/social/friendship/SocialFriendship.service.js";
import type { SocialPeopleService } from "#/modules/social/people/SocialPeople.service.js";
import type { SocialProfileService } from "#/modules/social/profile/SocialProfile.service.js";
import type { StudentService } from "#/modules/student/Student.service.js";
import type { StudentTagInterestService } from "#/modules/student/interests/StudentTagInterest.service.js";
import type { TaggingService } from "#/modules/tagging/Tagging.service.js";
import {
    createEndpointRegistries,
    type EndpointActions,
    type EndpointRegistry
} from "@pomi/api-core";
import type { Request } from "express";

export type Context = {
    principal?: Principal;
    studentCourseAttemptService: StudentCourseAttemptService;
    studentHistoryImportService: StudentHistoryImportService;
    studentAbsenceService: StudentAbsenceService;
    studentService: StudentService;
    currentUserService: CurrentUserService;
    botGrantService: BotGrantService;
    authUserService: AuthUserService;
    curriculumService: CurriculumService;
    evaluationSummaryService: EvaluationSummaryService;
    periodPlanService: PeriodPlanService;
    sharedPeriodPlanService: SharedPeriodPlanService;
    professorEvaluationService: ProfessorEvaluationService;
    socialProfileService: SocialProfileService;
    socialPeopleService: SocialPeopleService;
    socialFriendshipService: SocialFriendshipService;
    feedbackReportService: FeedbackReportService;
    exchangeNoticeSubscriptionService: ExchangeNoticeSubscriptionService;
    exchangeNoticeUnsubscribeService: ExchangeNoticeUnsubscribeService;
    taggingService: TaggingService;
    studentTagInterestService: StudentTagInterestService;
    requestIp: string;
};

export function createAppEndpointRegistries<
    Contracts extends EndpointRegistry<AuthorizationPolicy>
>(
    contracts: Contracts,
    actions: EndpointActions<Contracts, AuthorizationPolicy, Context>
): ReturnType<typeof registerAppEndpoints>;
export function createAppEndpointRegistries<
    Contracts extends EndpointRegistry<AuthorizationPolicy>,
    LocalContext
>(options: {
    contracts: Contracts;
    actions: EndpointActions<Contracts, AuthorizationPolicy, LocalContext>;
    createContext(request: Request): LocalContext;
}): ReturnType<typeof registerAppEndpoints>;
export function createAppEndpointRegistries<
    Contracts extends EndpointRegistry<AuthorizationPolicy>,
    LocalContext
>(
    options:
        | Contracts
        | {
              contracts: Contracts;
              actions: EndpointActions<
                  Contracts,
                  AuthorizationPolicy,
                  LocalContext
              >;
              createContext(request: Request): LocalContext;
          },
    legacyActions?: EndpointActions<Contracts, AuthorizationPolicy, Context>
) {
    if (legacyActions)
        return registerAppEndpoints(
            options as Contracts,
            legacyActions,
            createLegacyContext
        );
    const local = options as {
        contracts: Contracts;
        actions: EndpointActions<Contracts, AuthorizationPolicy, LocalContext>;
        createContext(request: Request): LocalContext;
    };
    return registerAppEndpoints(
        local.contracts,
        local.actions,
        local.createContext
    );
}

function registerAppEndpoints<
    Contracts extends EndpointRegistry<AuthorizationPolicy>,
    LocalContext
>(
    contracts: Contracts,
    actions: EndpointActions<Contracts, AuthorizationPolicy, LocalContext>,
    createContext: (request: Request) => LocalContext
) {
    const authRegistry = new AuthRegistry();
    const { router, openApiRegistry } = createEndpointRegistries({
        contracts,
        actions,
        createContext,
        registerAuthorization: (method, path, authorization) =>
            authRegistry.addPolicy(method, path, authorization),
        authorizationSecurity: (authorization) =>
            authorization.kind === "public"
                ? []
                : authorization.kind === "optional-auth"
                  ? [{} as Record<string, string[]>, { BearerAuth: [] }]
                  : [{ BearerAuth: [] }]
    });
    return { router, registry: openApiRegistry, authRegistry };
}

function createLegacyContext(request: Request): Context {
    return {
        principal: request.scope.cradle.principal,
        studentCourseAttemptService:
            request.scope.cradle.studentCourseAttemptService,
        studentHistoryImportService:
            request.scope.cradle.studentHistoryImportService,
        studentAbsenceService: request.scope.cradle.studentAbsenceService,
        studentService: request.scope.cradle.studentService,
        currentUserService: request.scope.cradle.currentUserService,
        botGrantService: request.scope.cradle.botGrantService,
        authUserService: request.scope.cradle.authUserService,
        curriculumService: request.scope.cradle.curriculumService,
        evaluationSummaryService: request.scope.cradle.evaluationSummaryService,
        periodPlanService: request.scope.cradle.periodPlanService,
        sharedPeriodPlanService: request.scope.cradle.sharedPeriodPlanService,
        professorEvaluationService:
            request.scope.cradle.professorEvaluationService,
        socialProfileService: request.scope.cradle.socialProfileService,
        socialPeopleService: request.scope.cradle.socialPeopleService,
        socialFriendshipService: request.scope.cradle.socialFriendshipService,
        feedbackReportService: request.scope.cradle.feedbackReportService,
        exchangeNoticeSubscriptionService:
            request.scope.cradle.exchangeNoticeSubscriptionService,
        exchangeNoticeUnsubscribeService:
            request.scope.cradle.exchangeNoticeUnsubscribeService,
        taggingService: request.scope.cradle.taggingService,
        studentTagInterestService:
            request.scope.cradle.studentTagInterestService,
        requestIp: request.ip ?? "unknown"
    };
}
