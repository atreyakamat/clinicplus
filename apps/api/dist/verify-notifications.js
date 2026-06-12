"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const core_1 = require("@nestjs/core");
const app_module_1 = require("./src/app.module");
const notification_service_1 = require("./src/notifications/notification.service");
const prisma_service_1 = require("./src/prisma/prisma.service");
const client_1 = require("@prisma/client");
async function main() {
    console.log('--- STARTING NOTIFICATION REMINDER VERIFICATION ---');
    const app = await core_1.NestFactory.createApplicationContext(app_module_1.AppModule);
    const notificationService = app.get(notification_service_1.NotificationService);
    const prisma = app.get(prisma_service_1.PrismaService);
    try {
        const patient = await prisma.patient.findFirst({
            where: { phone: { not: null }, status: 'ACTIVE' }
        });
        const doctor = await prisma.user.findFirst();
        if (!patient || !doctor) {
            console.error('❌ Could not find an active patient or doctor in the database.');
            process.exit(1);
        }
        console.log(`👤 Test Patient: ${patient.firstName} ${patient.lastName} (ID: ${patient.id}, Phone: ${patient.phone})`);
        console.log(`🩺 Test Doctor: Dr. ${doctor.firstName} ${doctor.lastName} (ID: ${doctor.id})`);
        const now = new Date();
        const date24h = new Date(now.getTime() + 24 * 60 * 60 * 1000);
        const date2h = new Date(now.getTime() + 2 * 60 * 60 * 1000);
        await prisma.message.deleteMany({
            where: { patientId: patient.id }
        });
        console.log('📅 Creating 24-hour test appointment...');
        const appt24h = await prisma.appointment.create({
            data: {
                organizationId: patient.organizationId,
                branchId: patient.branchId,
                patientId: patient.id,
                doctorId: doctor.id,
                scheduledStart: date24h,
                scheduledEnd: new Date(date24h.getTime() + 30 * 60 * 1000),
                status: client_1.AppointmentStatus.SCHEDULED,
            }
        });
        console.log('📅 Creating 2-hour test appointment...');
        const appt2h = await prisma.appointment.create({
            data: {
                organizationId: patient.organizationId,
                branchId: patient.branchId,
                patientId: patient.id,
                doctorId: doctor.id,
                scheduledStart: date2h,
                scheduledEnd: new Date(date2h.getTime() + 30 * 60 * 1000),
                status: client_1.AppointmentStatus.SCHEDULED,
            }
        });
        console.log('🚀 Triggering scheduled notification reminders...');
        await notificationService.sendScheduledNotifications();
        const messages = await prisma.message.findMany({
            where: { patientId: patient.id },
            orderBy: { createdAt: 'desc' }
        });
        console.log(`\n💬 Outbound messages recorded in database (${messages.length} found):`);
        for (const msg of messages) {
            console.log(`  - [${msg.channel}] [${msg.deliveryStatus}] Direction: ${msg.direction}`);
            console.log(`    Body: "${msg.messageBody}"`);
        }
        console.log('\n--- VERIFICATION VERDICT ---');
        if (messages.length >= 2) {
            console.log('✅ PASS: Both reminders were successfully generated and recorded!');
        }
        else {
            console.error('❌ FAIL: Expected at least 2 reminder messages to be recorded.');
        }
        await prisma.appointment.delete({ where: { id: appt24h.id } });
        await prisma.appointment.delete({ where: { id: appt2h.id } });
        await prisma.message.deleteMany({ where: { patientId: patient.id } });
        console.log('🧹 Cleaned up test database records.');
    }
    catch (error) {
        console.error('❌ Error during verification:', error);
    }
    finally {
        await app.close();
    }
}
main();
//# sourceMappingURL=verify-notifications.js.map