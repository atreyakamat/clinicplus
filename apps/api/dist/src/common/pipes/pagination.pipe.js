"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.PaginationPipe = void 0;
const common_1 = require("@nestjs/common");
let PaginationPipe = class PaginationPipe {
    transform(value, metadata) {
        if (metadata.type !== 'query')
            return value;
        const page = parseInt(value.page, 10) || 1;
        const limit = parseInt(value.limit, 10) || 20;
        return {
            ...value,
            skip: (page - 1) * limit,
            take: limit,
            page,
        };
    }
};
exports.PaginationPipe = PaginationPipe;
exports.PaginationPipe = PaginationPipe = __decorate([
    (0, common_1.Injectable)()
], PaginationPipe);
//# sourceMappingURL=pagination.pipe.js.map