export type DataTagMetadata = {
    displayName: string;
    description: string;
    singular: string;
    plural: string;
    group: string;
};

export const dataTagMetadata: Record<string, DataTagMetadata> = {
    "units": {
        displayName: "Unidades",
        description: "Unidades acadêmicas e administrativas da universidade.",
        singular: "unidade",
        plural: "unidades",
        group: "Estrutura acadêmica"
    },
    "departments": {
        displayName: "Departamentos",
        description: "Departamentos vinculados às unidades acadêmicas.",
        singular: "departamento",
        plural: "departamentos",
        group: "Estrutura acadêmica"
    },
    "rooms": {
        displayName: "Salas",
        description: "Espaços físicos usados em atividades acadêmicas.",
        singular: "sala",
        plural: "salas",
        group: "Estrutura acadêmica"
    },
    "programs": {
        displayName: "Cursos de graduação",
        description: "Programas de graduação oferecidos pela universidade.",
        singular: "curso de graduação",
        plural: "cursos de graduação",
        group: "Estrutura acadêmica"
    },
    "languages": {
        displayName: "Idiomas",
        description:
            "Idiomas associados a programas e oportunidades acadêmicas.",
        singular: "idioma",
        plural: "idiomas",
        group: "Estrutura acadêmica"
    },
    "specializations": {
        displayName: "Habilitações",
        description: "Habilitações e especializações de cursos de graduação.",
        singular: "habilitação",
        plural: "habilitações",
        group: "Estrutura acadêmica"
    },
    "courses": {
        displayName: "Disciplinas",
        description:
            "Identidades normalizadas de disciplinas, independentes de catálogo.",
        singular: "disciplina",
        plural: "disciplinas",
        group: "Disciplinas e catálogos"
    },
    "catalogs": {
        displayName: "Catálogos",
        description: "Edições anuais dos catálogos acadêmicos.",
        singular: "catálogo",
        plural: "catálogos",
        group: "Disciplinas e catálogos"
    },
    "catalog-courses": {
        displayName: "Disciplinas em catálogos",
        description:
            "Representações institucionais de disciplinas em um catálogo específico.",
        singular: "disciplina de catálogo",
        plural: "disciplinas de catálogo",
        group: "Disciplinas e catálogos"
    },
    "catalog-program": {
        displayName: "Cursos em catálogos",
        description:
            "Configurações de cursos de graduação em catálogos acadêmicos.",
        singular: "curso em catálogo",
        plural: "cursos em catálogos",
        group: "Disciplinas e catálogos"
    },
    "curriculum-suggestions": {
        displayName: "Currículos sugeridos",
        description:
            "Estruturas curriculares sugeridas para cursos e habilitações.",
        singular: "currículo sugerido",
        plural: "currículos sugeridos",
        group: "Disciplinas e catálogos"
    },
    "coordinators": {
        displayName: "Coordenadores",
        description:
            "Coordenadores responsáveis por disciplinas e programas acadêmicos.",
        singular: "coordenador",
        plural: "coordenadores",
        group: "Disciplinas e catálogos"
    },
    "professors": {
        displayName: "Docentes",
        description: "Perfis normalizados de docentes.",
        singular: "docente",
        plural: "docentes",
        group: "Docentes e pesquisa"
    },
    "professor-data-portal": {
        displayName: "Portal de docentes",
        description: "Dados públicos complementares sobre docentes.",
        singular: "registro do portal de docentes",
        plural: "registros do portal de docentes",
        group: "Docentes e pesquisa"
    },
    "professor-positions": {
        displayName: "Cargos docentes",
        description: "Cargos e vínculos funcionais de docentes.",
        singular: "cargo docente",
        plural: "cargos docentes",
        group: "Docentes e pesquisa"
    },
    "keywords": {
        displayName: "Palavras-chave",
        description: "Palavras-chave associadas à produção acadêmica.",
        singular: "palavra-chave",
        plural: "palavras-chave",
        group: "Docentes e pesquisa"
    },
    "coauthors": {
        displayName: "Coautorias",
        description: "Relações públicas de coautoria acadêmica.",
        singular: "coautoria",
        plural: "coautorias",
        group: "Docentes e pesquisa"
    },
    "classes": {
        displayName: "Turmas",
        description: "Turmas oferecidas em períodos letivos.",
        singular: "turma",
        plural: "turmas",
        group: "Ofertas e calendário"
    },
    "class-schedules": {
        displayName: "Horários de turmas",
        description: "Horários e locais de encontro das turmas.",
        singular: "horário de turma",
        plural: "horários de turmas",
        group: "Ofertas e calendário"
    },
    "study-periods": {
        displayName: "Períodos letivos",
        description:
            "Períodos acadêmicos usados para organizar ofertas e calendário.",
        singular: "período letivo",
        plural: "períodos letivos",
        group: "Ofertas e calendário"
    },
    "calendar": {
        displayName: "Calendário acadêmico",
        description: "Calendário acadêmico em formato interoperável.",
        singular: "calendário acadêmico",
        plural: "calendários acadêmicos",
        group: "Ofertas e calendário"
    },
    "calendar-events": {
        displayName: "Eventos acadêmicos",
        description: "Eventos e datas relevantes do calendário acadêmico.",
        singular: "evento acadêmico",
        plural: "eventos acadêmicos",
        group: "Ofertas e calendário"
    },
    "calendar-tags": {
        displayName: "Categorias do calendário",
        description: "Categorias usadas para classificar eventos acadêmicos.",
        singular: "categoria do calendário",
        plural: "categorias do calendário",
        group: "Ofertas e calendário"
    },
    "exchange-notices": {
        displayName: "Editais de intercâmbio",
        description: "Editais e chamadas públicas de mobilidade acadêmica.",
        singular: "edital de intercâmbio",
        plural: "editais de intercâmbio",
        group: "Intercâmbio"
    },
    "exchange-places": {
        displayName: "Vagas de intercâmbio",
        description: "Destinos e vagas associados a editais de mobilidade.",
        singular: "vaga de intercâmbio",
        plural: "vagas de intercâmbio",
        group: "Intercâmbio"
    },
    "daily-menus": {
        displayName: "Cardápios",
        description: "Cardápios diários dos restaurantes universitários.",
        singular: "cardápio diário",
        plural: "cardápios diários",
        group: "Serviços do campus"
    }
};

export const dataTagGroups = [
    ...new Set(Object.values(dataTagMetadata).map(({ group }) => group))
];
