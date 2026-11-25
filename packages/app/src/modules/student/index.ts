import { createModule } from "#/Module.js";
import student from "./Student.controller.js";
import studentAvatar from "./avatar/StudentAvatar.endpoints.js";
import studentTagInterest from "./interests/StudentTagInterest.controller.js";

export default createModule({
    controllers: [student, studentAvatar, studentTagInterest]
});
