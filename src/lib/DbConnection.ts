import { configDotenv } from 'dotenv';
import mongoose from 'mongoose';
import Console from './Console';

configDotenv();


export default async function DbConnection() {
    try {
        const key = process.env.MONGODB_URI!

        Console({ type: "log", message: `Conectando ao MongoDB` });

        await mongoose.connect(key);

        Console({ type: "success", message: `Conectado ao MongoDB com sucesso` });
    } catch (err: unknown) {
        Console({ type: "error", message: `Erro ao conectar ao MongoDB: ${(err as Error).message}` });
        process.exit(1);
    }
};
