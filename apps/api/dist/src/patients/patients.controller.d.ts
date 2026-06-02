import { PatientsService } from './patients.service';
export declare class PatientsController {
    private readonly patientsService;
    constructor(patientsService: PatientsService);
    exportCsv(req: any, res: any): Promise<any>;
    importCsv(data: any[], req: any): Promise<{
        imported: number;
    }>;
}
