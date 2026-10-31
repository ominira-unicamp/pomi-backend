import { createModule } from "#/Module.js";
import curriculum from "./curriculum/Curriculum.controller.js";
import periodPlan from "./period-plan/PeriodPlan.controller.js";
import sharedPeriodPlan from "./shared-period-plan/SharedPeriodPlan.controller.js";
import studentAbsence from "./student-absence/StudentAbsence.controller.js";
import studentCourseAttempt from "./student-course-attempt/StudentCourseAttempt.controller.js";
import studentHistoryImport from "./student-history-import/StudentHistoryImport.controller.js";

export default createModule({
    controllers: [
        curriculum,
        periodPlan,
        sharedPeriodPlan,
        studentCourseAttempt,
        studentHistoryImport,
        studentAbsence
    ]
});
