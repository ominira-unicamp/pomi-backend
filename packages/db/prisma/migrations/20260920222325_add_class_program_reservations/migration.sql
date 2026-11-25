-- CreateTable
CREATE TABLE "data"."ClassReservation" (
    "classId" INTEGER NOT NULL,
    "programId" INTEGER NOT NULL,

    CONSTRAINT "ClassReservation_pkey" PRIMARY KEY ("classId","programId")
);

-- CreateIndex
CREATE INDEX "ClassReservation_programId_idx" ON "data"."ClassReservation"("programId");

-- AddForeignKey
ALTER TABLE "data"."ClassReservation" ADD CONSTRAINT "ClassReservation_classId_fkey" FOREIGN KEY ("classId") REFERENCES "data"."Class"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "data"."ClassReservation" ADD CONSTRAINT "ClassReservation_programId_fkey" FOREIGN KEY ("programId") REFERENCES "data"."Program"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
