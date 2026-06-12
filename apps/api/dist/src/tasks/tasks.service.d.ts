import { PrismaService } from '../prisma/prisma.service';
import { Prisma } from '@prisma/client';
export declare class TasksService {
    private prisma;
    constructor(prisma: PrismaService);
    create(data: Prisma.TaskUncheckedCreateInput, organizationId: string, branchId: string, createdBy: string): Promise<{
        id: string;
        status: import("@prisma/client").$Enums.TaskStatus;
        createdAt: Date;
        updatedAt: Date;
        createdBy: string | null;
        updatedBy: string | null;
        deletedAt: Date | null;
        deletedBy: string | null;
        deleteReason: string | null;
        organizationId: string;
        branchId: string;
        patientId: string | null;
        description: string | null;
        title: string;
        priority: import("@prisma/client").$Enums.TaskPriority;
        dueDate: Date | null;
        assignedTo: string | null;
    }>;
    findAll(organizationId: string, branchId: string): Promise<({
        patient: {
            id: string;
            firstName: string;
            lastName: string;
        } | null;
        assignee: {
            id: string;
            firstName: string;
            lastName: string;
        } | null;
    } & {
        id: string;
        status: import("@prisma/client").$Enums.TaskStatus;
        createdAt: Date;
        updatedAt: Date;
        createdBy: string | null;
        updatedBy: string | null;
        deletedAt: Date | null;
        deletedBy: string | null;
        deleteReason: string | null;
        organizationId: string;
        branchId: string;
        patientId: string | null;
        description: string | null;
        title: string;
        priority: import("@prisma/client").$Enums.TaskPriority;
        dueDate: Date | null;
        assignedTo: string | null;
    })[]>;
    findOne(id: string, organizationId: string, branchId: string): Promise<{
        patient: {
            id: string;
            firstName: string;
            lastName: string;
        } | null;
        assignee: {
            id: string;
            firstName: string;
            lastName: string;
        } | null;
    } & {
        id: string;
        status: import("@prisma/client").$Enums.TaskStatus;
        createdAt: Date;
        updatedAt: Date;
        createdBy: string | null;
        updatedBy: string | null;
        deletedAt: Date | null;
        deletedBy: string | null;
        deleteReason: string | null;
        organizationId: string;
        branchId: string;
        patientId: string | null;
        description: string | null;
        title: string;
        priority: import("@prisma/client").$Enums.TaskPriority;
        dueDate: Date | null;
        assignedTo: string | null;
    }>;
    update(id: string, data: Prisma.TaskUpdateInput, organizationId: string, branchId: string): Promise<{
        id: string;
        status: import("@prisma/client").$Enums.TaskStatus;
        createdAt: Date;
        updatedAt: Date;
        createdBy: string | null;
        updatedBy: string | null;
        deletedAt: Date | null;
        deletedBy: string | null;
        deleteReason: string | null;
        organizationId: string;
        branchId: string;
        patientId: string | null;
        description: string | null;
        title: string;
        priority: import("@prisma/client").$Enums.TaskPriority;
        dueDate: Date | null;
        assignedTo: string | null;
    }>;
    remove(id: string, organizationId: string, branchId: string): Promise<{
        id: string;
        status: import("@prisma/client").$Enums.TaskStatus;
        createdAt: Date;
        updatedAt: Date;
        createdBy: string | null;
        updatedBy: string | null;
        deletedAt: Date | null;
        deletedBy: string | null;
        deleteReason: string | null;
        organizationId: string;
        branchId: string;
        patientId: string | null;
        description: string | null;
        title: string;
        priority: import("@prisma/client").$Enums.TaskPriority;
        dueDate: Date | null;
        assignedTo: string | null;
    }>;
}
