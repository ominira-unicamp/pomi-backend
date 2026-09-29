import assert from "node:assert/strict";
import test from "node:test";
import {
    CatalogInformationValidationError,
    normalizeCatalogInformation
} from "../src/services/CatalogInformationInjection.js";

const information = {
    shift: "DAYTIME",
    creditLimitType: "FIXED",
    creditLimitFixedCredits: 30,
    creditLimitBeforeThresholdCredits: null,
    creditLimitThresholdCredits: null,
    creditLimitCrBase: null,
    creditLimitCrMultiplier: null,
    professionalPracticeDescription: null,
    variants: []
};

test("normaliza o envelope do scraper e ignora campos de auditoria", () => {
    assert.deepEqual(
        normalizeCatalogInformation({
            data: {
                catalogs: [
                    {
                        year: 1998,
                        programs: [
                            {
                                code: 34,
                                sections: [{ heading: "Turno" }],
                                information
                            }
                        ]
                    }
                ]
            },
            issues: [],
            pages: []
        }),
        {
            catalogs: [
                {
                    year: 1998,
                    programs: [{ code: 34, information }]
                }
            ]
        }
    );
});

test("rejeita programas sem estrutura de variantes", () => {
    assert.throws(
        () =>
            normalizeCatalogInformation({
                catalogs: [
                    {
                        year: 1998,
                        programs: [{ code: 34, information: {} }]
                    }
                ]
            }),
        CatalogInformationValidationError
    );
});
