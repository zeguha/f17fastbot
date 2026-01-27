"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
// src/prisma.ts
const client_1 = require("@prisma/client");
let prisma;
if (process.env.NODE_ENV === 'production') {
    prisma = new client_1.PrismaClient();
}
else {
    // В разработке используем глобальную переменную для предотвращения 
    // создания множества экземпляров PrismaClient при hot-reload
    if (!global.prisma) {
        global.prisma = new client_1.PrismaClient({
            log: ['query', 'info', 'warn', 'error'],
        });
    }
    prisma = global.prisma;
}
exports.default = prisma;
