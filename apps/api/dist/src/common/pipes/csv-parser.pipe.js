"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.CSVParserPipe = void 0;
const common_1 = require("@nestjs/common");
const sync_1 = require("csv-parse/sync");
let CSVParserPipe = class CSVParserPipe {
    transform(value, metadata) {
        if (!value || typeof value !== 'string') {
            throw new common_1.BadRequestException('Invalid CSV data');
        }
        try {
            return (0, sync_1.parse)(value, {
                columns: true,
                skip_empty_lines: true,
                trim: true,
            });
        }
        catch (error) {
            throw new common_1.BadRequestException(`CSV Parsing Error: ${error.message}`);
        }
    }
};
exports.CSVParserPipe = CSVParserPipe;
exports.CSVParserPipe = CSVParserPipe = __decorate([
    (0, common_1.Injectable)()
], CSVParserPipe);
//# sourceMappingURL=csv-parser.pipe.js.map