import type { InjectionDefinition } from "./config.js";
import {
    injectAcademicData,
    type AcademicDataInjectionOptions
} from "./services/AcademicDataInjection.js";
import { injectAcademicDataSnapshot } from "./services/AcademicDataSnapshotInjection.js";
import {
    injectCalendar,
    type CalendarInjectionOptions
} from "./services/CalendarInjection.js";
import { injectCalendarSnapshot } from "./services/CalendarSnapshotInjection.js";
import {
    injectCatalogDisciplines,
    type CatalogDisciplinesInjectionOptions
} from "./services/CatalogDisciplinesInjection.js";
import { injectCatalogDisciplinesSnapshot } from "./services/CatalogDisciplinesSnapshotInjection.js";
import {
    injectCatalogInformation,
    type CatalogInformationInjectionOptions
} from "./services/CatalogInformationInjection.js";
import {
    injectCatalogs,
    type CatalogInjectionOptions
} from "./services/CatalogInjection.js";
import { injectCatalogProgramsSnapshot } from "./services/CatalogProgramsSnapshotInjection.js";
import {
    injectDailyMenus,
    type DailyMenusInjectionOptions
} from "./services/DailyMenusInjection.js";
import { injectDailyMenusSnapshot } from "./services/DailyMenusSnapshotInjection.js";
import {
    injectExchangeNotices,
    type ExchangeNoticesInjectionOptions
} from "./services/ExchangeNoticesInjection.js";
import { injectExchangeNoticesSnapshot } from "./services/ExchangeNoticesSnapshotInjection.js";
import {
    injectHistoricalPrograms,
    type HistoricalProgramsInjectionOptions
} from "./services/HistoricalProgramsInjection.js";
import type { InjectionContext } from "./services/InjectionTypes.js";
import {
    injectProfessorDataPortal,
    type ProfessorDataPortalInjectionOptions
} from "./services/ProfessorDataPortalInjection.js";
import { injectProfessorDataPortalSnapshot } from "./services/ProfessorDataPortalSnapshotInjection.js";
import {
    injectSuggestions,
    type SuggestionsInjectionOptions
} from "./services/SuggestionsInjection.js";

export type InjectionService = {
    run(context: InjectionContext): Promise<void>;
};

type InjectionOptions = Record<string, unknown>;

function createService<TOptions extends InjectionOptions>(
    fn: (context: InjectionContext, options: TOptions) => Promise<void>,
    options: InjectionOptions
): InjectionService {
    return { run: (context) => fn(context, options as TOptions) };
}

const services: Record<
    string,
    (options: InjectionOptions) => InjectionService
> = {
    "academic-data": (options) =>
        createService(
            injectAcademicData,
            options as AcademicDataInjectionOptions & InjectionOptions
        ),
    "academic-data-snapshot": (options) =>
        createService(
            injectAcademicDataSnapshot,
            options as AcademicDataInjectionOptions & InjectionOptions
        ),
    "calendar": (options) =>
        createService(
            injectCalendar,
            options as CalendarInjectionOptions & InjectionOptions
        ),
    "calendar-snapshot": (options) =>
        createService(
            injectCalendarSnapshot,
            options as CalendarInjectionOptions & InjectionOptions
        ),
    "catalogs": (options) =>
        createService(
            injectCatalogs,
            options as CatalogInjectionOptions & InjectionOptions
        ),
    "catalog-information": (options) =>
        createService(
            injectCatalogInformation,
            options as CatalogInformationInjectionOptions & InjectionOptions
        ),
    "catalog-programs-snapshot": (options) =>
        createService(injectCatalogProgramsSnapshot, options),
    "catalog-disciplines": (options) =>
        createService(
            injectCatalogDisciplines,
            options as CatalogDisciplinesInjectionOptions & InjectionOptions
        ),
    "catalog-disciplines-snapshot": (options) =>
        createService(
            injectCatalogDisciplinesSnapshot,
            options as CatalogDisciplinesInjectionOptions & InjectionOptions
        ),
    "daily-menus": (options) =>
        createService(
            injectDailyMenus,
            options as DailyMenusInjectionOptions & InjectionOptions
        ),
    "daily-menus-snapshot": (options) =>
        createService(
            injectDailyMenusSnapshot,
            options as DailyMenusInjectionOptions & InjectionOptions
        ),
    "exchange-notices": (options) =>
        createService(
            injectExchangeNotices,
            options as ExchangeNoticesInjectionOptions & InjectionOptions
        ),
    "exchange-notices-snapshot": (options) =>
        createService(
            injectExchangeNoticesSnapshot,
            options as ExchangeNoticesInjectionOptions & InjectionOptions
        ),
    "historical-programs": (options) =>
        createService(
            injectHistoricalPrograms,
            options as HistoricalProgramsInjectionOptions & InjectionOptions
        ),
    "suggestions": (options) =>
        createService(
            injectSuggestions,
            options as SuggestionsInjectionOptions & InjectionOptions
        ),
    "professors-data-portal": (options) =>
        createService(
            injectProfessorDataPortal,
            options as ProfessorDataPortalInjectionOptions & InjectionOptions
        ),
    "professors-data-portal-snapshot": (options) =>
        createService(
            injectProfessorDataPortalSnapshot,
            options as ProfessorDataPortalInjectionOptions & InjectionOptions
        )
};

export const injectionNames = Object.keys(services);

export function createInjectionService(definition: InjectionDefinition) {
    const factory = services[definition.name];
    if (!factory)
        throw new Error(
            `Injection predefinida não encontrada: ${definition.name}`
        );
    return factory(definition.options);
}
