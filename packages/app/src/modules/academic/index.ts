import { createModule } from "#/Module.js";
import professorEvaluation from "./evaluation/professor/ProfessorEvaluation.controller.js";
import evaluationSummary from "./evaluation/summary/EvaluationSummary.controller.js";

export default createModule({
    controllers: [evaluationSummary, professorEvaluation]
});
