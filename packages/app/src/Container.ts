import type { OperationTelemetry } from "#/application/OperationTelemetry.js";
import { createLegacyUserResolver } from "#/modules/identity/LegacyStudentContext.js";
import { requestLogger } from "@pomi/api-core";
import { asFunction, asValue, createContainer, InjectionMode } from "awilix";
import type { RequestHandler } from "express";

import type { AppConfig } from "#/Config.js";
import {
    createAppImageResourceRegistry,
    groupAvatarResource,
    studentAvatarResource
} from "#/MediaResources.js";
import { buildZodIds } from "#/PrismaValidator.js";
import { systemClock, type Clock } from "#/application/Clock.js";
import type { Principal } from "#/auth.js";
import type { ImageResourceRegistry } from "#/media/ImageResourceRegistry.js";
import type { ImageStorage } from "#/media/ImageStorage.js";
import { createMediaService, type MediaService } from "#/media/MediaService.js";
import { MediaUploadLimiter } from "#/media/MediaUploadLimiter.js";
import { PictRsClient } from "#/media/PictRsClient.js";
import { createPictRsStorage } from "#/media/PictRsStorage.js";
import type { ImageResourceOperations } from "#/media/public.js";
import {
    createProfessorEvaluationService,
    type ProfessorEvaluationService
} from "#/modules/academic/evaluation/professor/ProfessorEvaluation.service.js";
import {
    createEvaluationSummaryService,
    type EvaluationSummaryService
} from "#/modules/academic/evaluation/summary/EvaluationSummary.service.js";
import {
    createExchangeNoticeSubscriptionService,
    type ExchangeNoticeSubscriptionService
} from "#/modules/exchange/exchange-notice-subscription/ExchangeNoticeSubscription.service.js";
import {
    createExchangeNoticeUnsubscribeService,
    type ExchangeNoticeUnsubscribeService
} from "#/modules/exchange/exchange-notice-unsubscribe/ExchangeNoticeUnsubscribe.service.js";
import { FeedbackRateLimiter } from "#/modules/feedback/feedback-report/Feedback.limiter.js";
import {
    createFeedbackReportService,
    type FeedbackReportService
} from "#/modules/feedback/feedback-report/FeedbackReport.service.js";
import {
    createGroupService,
    type GroupService
} from "#/modules/group/Group.service.js";
import type { GroupAvatarTarget } from "#/modules/group/avatar/GroupAvatar.resource.js";
import {
    createGroupEventService,
    type GroupEventService
} from "#/modules/group/event/GroupEvent.service.js";
import {
    createGroupInvitationService,
    type GroupInvitationService
} from "#/modules/group/invitation/GroupInvitation.service.js";
import {
    createGroupMembershipService,
    type GroupMembershipService
} from "#/modules/group/membership/GroupMembership.service.js";
import {
    createGroupRoleService,
    type GroupRoleService
} from "#/modules/group/role/GroupRole.service.js";
import {
    createAuthUserService,
    type AuthUserService
} from "#/modules/identity/auth-user/AuthUser.service.js";
import {
    createBotGrantService,
    type BotGrantService
} from "#/modules/identity/bot-grant/BotGrant.service.js";
import {
    createCurrentUserService,
    type CurrentUserService
} from "#/modules/identity/current-user/CurrentUser.service.js";
import {
    createCurriculumService,
    type CurriculumService
} from "#/modules/planning/curriculum/Curriculum.service.js";
import {
    createPeriodPlanService,
    type PeriodPlanService
} from "#/modules/planning/period-plan/PeriodPlan.service.js";
import {
    createSharedPeriodPlanService,
    type SharedPeriodPlanService
} from "#/modules/planning/shared-period-plan/SharedPeriodPlan.service.js";
import {
    createStudentAbsenceService,
    type StudentAbsenceService
} from "#/modules/planning/student-absence/StudentAbsence.service.js";
import {
    createStudentCourseAttemptService,
    type StudentCourseAttemptService
} from "#/modules/planning/student-course-attempt/StudentCourseAttempt.service.js";
import {
    createStudentHistoryImportService,
    type StudentHistoryImportService
} from "#/modules/planning/student-history-import/StudentHistoryImport.service.js";
import {
    createSocialFriendshipService,
    type SocialFriendshipService
} from "#/modules/social/friendship/SocialFriendship.service.js";
import {
    createSocialPeopleService,
    type SocialPeopleService
} from "#/modules/social/people/SocialPeople.service.js";
import {
    createSocialProfileService,
    type SocialProfileService
} from "#/modules/social/profile/SocialProfile.service.js";
import {
    createStudentService,
    type StudentService
} from "#/modules/student/Student.service.js";
import type { StudentAvatarTarget } from "#/modules/student/avatar/StudentAvatar.resource.js";
import {
    createStudentTagInterestService,
    type StudentTagInterestService
} from "#/modules/student/interests/StudentTagInterest.service.js";
import {
    createTaggingService,
    type TaggingService
} from "#/modules/tagging/Tagging.service.js";
import type { DatabaseClient } from "@pomi/db";

export type AppCradle = {
    config: AppConfig;
    prisma: DatabaseClient;
    resolveLegacyUser(studentId: number): Promise<number>;
    clock: Clock;
    operationTelemetry: OperationTelemetry | undefined;
    principal: Principal | undefined;
    imageStorage: ImageStorage | undefined;
    imageResourceRegistry: ImageResourceRegistry;
    studentAvatars: ImageResourceOperations<StudentAvatarTarget>;
    groupAvatars: ImageResourceOperations<GroupAvatarTarget>;
    mediaUploadLimiter: MediaUploadLimiter;
    mediaService: MediaService;
    zodIds: ReturnType<typeof buildZodIds>;
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
    groupService: GroupService;
    groupMembershipService: GroupMembershipService;
    groupInvitationService: GroupInvitationService;
    groupRoleService: GroupRoleService;
    groupEventService: GroupEventService;
    feedbackRateLimiter: FeedbackRateLimiter;
    exchangeNoticeSubscriptionService: ExchangeNoticeSubscriptionService;
    exchangeNoticeUnsubscribeService: ExchangeNoticeUnsubscribeService;
    taggingService: TaggingService;
    studentTagInterestService: StudentTagInterestService;
};

export function createAppContainer(config: AppConfig, prisma: DatabaseClient) {
    return createContainer<AppCradle>({
        injectionMode: InjectionMode.PROXY
    }).register({
        config: asValue(config),
        prisma: asValue(prisma),
        resolveLegacyUser: asFunction(({ prisma }: AppCradle) =>
            createLegacyUserResolver(prisma)
        ).scoped(),
        clock: asValue(systemClock),
        operationTelemetry: asValue(undefined),
        principal: asValue(undefined),
        imageResourceRegistry: asValue(createAppImageResourceRegistry()),
        imageStorage: asValue(
            config.pictRsUrl && config.pictRsApiKey
                ? createPictRsStorage(
                      new PictRsClient(config.pictRsUrl, config.pictRsApiKey)
                  )
                : undefined
        ),
        mediaUploadLimiter: asValue(
            new MediaUploadLimiter(
                2,
                config.mediaUploadRateLimitMax,
                config.mediaUploadRateLimitWindowSeconds * 1000
            )
        ),
        mediaService: asFunction(createMediaService).scoped(),
        studentAvatars: asFunction(({ mediaService }: AppCradle) =>
            mediaService.forResource(studentAvatarResource)
        ).scoped(),
        groupAvatars: asFunction(({ mediaService }: AppCradle) =>
            mediaService.forResource(groupAvatarResource)
        ).scoped(),
        zodIds: asFunction(buildZodIds).scoped(),
        studentCourseAttemptService: asFunction(
            createStudentCourseAttemptService
        ).scoped(),
        studentHistoryImportService: asFunction(
            createStudentHistoryImportService
        ).scoped(),
        studentAbsenceService: asFunction(createStudentAbsenceService).scoped(),
        studentService: asFunction(createStudentService).scoped(),
        currentUserService: asFunction(createCurrentUserService).scoped(),
        botGrantService: asFunction(createBotGrantService).scoped(),
        authUserService: asFunction(createAuthUserService).scoped(),
        curriculumService: asFunction(createCurriculumService).scoped(),
        evaluationSummaryService: asFunction(
            createEvaluationSummaryService
        ).scoped(),
        periodPlanService: asFunction(createPeriodPlanService).scoped(),
        sharedPeriodPlanService: asFunction(
            createSharedPeriodPlanService
        ).scoped(),
        professorEvaluationService: asFunction(
            createProfessorEvaluationService
        ).scoped(),
        socialProfileService: asFunction(createSocialProfileService).scoped(),
        socialPeopleService: asFunction(createSocialPeopleService).scoped(),
        socialFriendshipService: asFunction(
            createSocialFriendshipService
        ).scoped(),
        feedbackRateLimiter: asValue(
            new FeedbackRateLimiter({
                maximum: config.feedbackRateLimitMax,
                windowMilliseconds: config.feedbackRateLimitWindowSeconds * 1000
            })
        ),
        feedbackReportService: asFunction(createFeedbackReportService).scoped(),
        groupService: asFunction(createGroupService).scoped(),
        groupMembershipService: asFunction(
            createGroupMembershipService
        ).scoped(),
        groupInvitationService: asFunction(
            createGroupInvitationService
        ).scoped(),
        groupRoleService: asFunction(createGroupRoleService).scoped(),
        groupEventService: asFunction(createGroupEventService).scoped(),
        exchangeNoticeSubscriptionService: asFunction(
            createExchangeNoticeSubscriptionService
        ).scoped(),
        exchangeNoticeUnsubscribeService: asFunction(
            createExchangeNoticeUnsubscribeService
        ).scoped(),
        taggingService: asFunction(createTaggingService).scoped(),
        studentTagInterestService: asFunction(
            createStudentTagInterestService
        ).scoped()
    });
}

export type AppContainer = ReturnType<typeof createAppContainer>;

export function appScopeMiddleware(container: AppContainer): RequestHandler {
    return (request, response, next) => {
        const scope = container.createScope();
        const logger = requestLogger(response);
        if (logger)
            scope.register({
                operationTelemetry: asValue<OperationTelemetry>((event) => {
                    const attributes = {
                        event: `application.operation.${event.outcome}`,
                        ...event
                    };
                    if (
                        event.outcome === "completed" ||
                        event.outcome === "recovery-scheduled"
                    )
                        logger.info(
                            attributes,
                            "Operação de aplicação concluída"
                        );
                    else
                        logger.warn(
                            attributes,
                            "Operação de aplicação rejeitada ou com recuperação pendente"
                        );
                })
            });
        request.scope = scope;
        request.prisma = scope.cradle.prisma;
        next();
    };
}
