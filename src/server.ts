import cors from "cors";
import express from "express";
import bodyParser from "body-parser";
import { configDotenv } from "dotenv";
import DbConnection from './lib/DbConnection';
configDotenv();


async function Main() {
    try {

        const app = express();
        const PORT = process.env.PORT!

        app.use(cors({ origin: '*' }))
        app.use(bodyParser.json());
        app.use(bodyParser.urlencoded({ extended: true }));
        await DbConnection();
        //        app.use("/api", routes); // ex: /api/health, /api/webhook/whatsapp, etc.
        app.listen(PORT, () => console.log("Server started on port " + PORT));
    } catch (error) {
        console.error(error);
    }
}



Main().catch(console.error);