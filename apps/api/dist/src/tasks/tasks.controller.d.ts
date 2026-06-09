import { TasksService } from './tasks.service';
export declare class TasksController {
    private readonly tasksService;
    constructor(tasksService: TasksService);
    create(data: any, req: any): Promise<{
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
        description: string | null;
        patientId: string | null;
        title: string;
        priority: import("@prisma/client").$Enums.TaskPriority;
        dueDate: Date | null;
        assignedTo: string | null;
    }>;
    findAll(req: any): Promise<({
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
        description: string | null;
        patientId: string | null;
        title: string;
        priority: import("@prisma/client").$Enums.TaskPriority;
        dueDate: Date | null;
        assignedTo: string | null;
    })[]>;
    findOne(id: string, req: any): Promise<{
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
        description: string | null;
        patientId: string | null;
        title: string;
        priority: import("@prisma/client").$Enums.TaskPriority;
        dueDate: Date | null;
        assignedTo: string | null;
    }>;
    update(id: string, data: any, req: any): Promise<{
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
        description: string | null;
        patientId: string | null;
        title: string;
        priority: import("@prisma/client").$Enums.TaskPriority;
        dueDate: Date | null;
        assignedTo: string | null;
    }>;
    remove(id: string, req: any): Promise<{
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
        description: string | null;
        patientId: string | null;
        title: string;
        priority: import("@prisma/client").$Enums.TaskPriority;
        dueDate: Date | null;
        assignedTo: string | null;
    }>;
}
