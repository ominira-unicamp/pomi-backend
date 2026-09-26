import { buildZodIds } from "#/PrismaValidator.js";
import { AuthRegistry, type AuthorizationPolicy } from "#/auth.js";
import type { CourseService } from "#/modules/academic/course/Course.service.js";
import type { ProfessorDataPortalService } from "#/modules/academic/professor-data-portal/ProfessorDataPortal.service.js";
import type { ProfessorService } from "#/modules/academic/professor/Professor.service.js";
import type { RoomService } from "#/modules/academic/room/Room.service.js";
import type { UnitService } from "#/modules/academic/unit/Unit.service.js";
import type { CatalogCourseService } from "#/modules/catalog/catalog-course/CatalogCourse.service.js";
import type { CatalogProgramService } from "#/modules/catalog/catalog-program/CatalogProgram.service.js";
import type { CatalogService } from "#/modules/catalog/catalog/Catalog.service.js";
import type { CoordinatorService } from "#/modules/catalog/coordinator/Coordinator.service.js";
import type { CurriculumSuggestionService } from "#/modules/catalog/curriculum-suggestion/CurriculumSuggestion.service.js";
import type { LanguageService } from "#/modules/catalog/language/Language.service.js";
import type { ProgramService } from "#/modules/catalog/program/Program.service.js";
import type { SpecializationService } from "#/modules/catalog/specialization/Specialization.service.js";
import type { ExchangeNoticeService } from "#/modules/exchange/exchange-notice/ExchangeNotice.service.js";
import type { ExchangePlaceService } from "#/modules/exchange/exchange-place/ExchangePlace.service.js";
import type { CalendarEventService } from "#/modules/schedule/calendar-event/CalendarEvent.service.js";
import type { CalendarTagService } from "#/modules/schedule/calendar-tag/CalendarTag.service.js";
import type { CalendarService } from "#/modules/schedule/calendar/Calendar.service.js";
import type { ClassScheduleService } from "#/modules/schedule/class-schedule/ClassSchedule.service.js";
import type { ClassService } from "#/modules/schedule/class/Class.service.js";
import type { DailyMenuService } from "#/modules/schedule/daily-menu/DailyMenu.service.js";
import type { StudyPeriodService } from "#/modules/schedule/study-period/StudyPeriod.service.js";
import {
    createEndpointRegistries,
    ResponseSchemaBuilder,
    type EndpointActions,
    type EndpointContract,
    type EndpointRegistry
} from "@pomi/api-core";
import type { PrismaClient } from "@pomi/db";

export type Context = {
    prisma: PrismaClient;
    zodIds: ReturnType<typeof buildZodIds>;
    catalogProgramService: CatalogProgramService;
    catalogCourseService: CatalogCourseService;
    coordinatorService: CoordinatorService;
    curriculumSuggestionService: CurriculumSuggestionService;
    classScheduleService: ClassScheduleService;
    courseService: CourseService;
    professorService: ProfessorService;
    professorDataPortalService: ProfessorDataPortalService;
    roomService: RoomService;
    unitService: UnitService;
    catalogService: CatalogService;
    languageService: LanguageService;
    programService: ProgramService;
    specializationService: SpecializationService;
    classService: ClassService;
    studyPeriodService: StudyPeriodService;
    calendarTagService: CalendarTagService;
    calendarEventService: CalendarEventService;
    calendarService: CalendarService;
    dailyMenuService: DailyMenuService;
    exchangeNoticeService: ExchangeNoticeService;
    exchangePlaceService: ExchangePlaceService;
};

export const OutputBuilder = ResponseSchemaBuilder;
export type IO = EndpointContract;

export function createDataEndpointRegistries<
    Contracts extends EndpointRegistry<AuthorizationPolicy>
>(
    contracts: Contracts,
    actions: EndpointActions<Contracts, AuthorizationPolicy, Context>
) {
    const authRegistry = new AuthRegistry();
    const { router, openApiRegistry } = createEndpointRegistries({
        contracts,
        actions,
        createContext: (request) => ({
            prisma: request.scope.cradle.prisma,
            zodIds: request.scope.cradle.zodIds,
            catalogProgramService: request.scope.cradle.catalogProgramService,
            catalogCourseService: request.scope.cradle.catalogCourseService,
            coordinatorService: request.scope.cradle.coordinatorService,
            curriculumSuggestionService:
                request.scope.cradle.curriculumSuggestionService,
            classScheduleService: request.scope.cradle.classScheduleService,
            courseService: request.scope.cradle.courseService,
            professorService: request.scope.cradle.professorService,
            professorDataPortalService:
                request.scope.cradle.professorDataPortalService,
            roomService: request.scope.cradle.roomService,
            unitService: request.scope.cradle.unitService,
            catalogService: request.scope.cradle.catalogService,
            languageService: request.scope.cradle.languageService,
            programService: request.scope.cradle.programService,
            specializationService: request.scope.cradle.specializationService,
            classService: request.scope.cradle.classService,
            studyPeriodService: request.scope.cradle.studyPeriodService,
            calendarTagService: request.scope.cradle.calendarTagService,
            calendarEventService: request.scope.cradle.calendarEventService,
            calendarService: request.scope.cradle.calendarService,
            dailyMenuService: request.scope.cradle.dailyMenuService,
            exchangeNoticeService: request.scope.cradle.exchangeNoticeService,
            exchangePlaceService: request.scope.cradle.exchangePlaceService
        }),
        registerAuthorization: (method, path, authorization) =>
            authRegistry.addPolicy(method, path, authorization),
        authorizationSecurity: (authorization) =>
            authorization.kind === "public" ? [] : [{ DataAdminToken: [] }]
    });
    return { router, registry: openApiRegistry, authRegistry };
}
